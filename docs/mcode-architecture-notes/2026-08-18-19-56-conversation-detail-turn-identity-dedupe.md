# 会话详情页消息重复修复：轮次跨来源身份（dedupeKey）

日期：2026-08-18
适用端：mcode-app（uni-app + Vue3），同样适用于原生 iOS / Android 复刻实现

## 一、问题现象

打开会话详情页时，同一条用户消息与同一段 agent 回复各渲染两次，时间线看起来"乱了"。
重复不是持久层造成的：SQLite 里数据是干净的（`conversation_turns` 有
`(conversation_id, dedupe_key)` 唯一索引），重复只发生在内存时间线上。

## 二、根因：一条逻辑轮次同时持有多个 id，而时间线只按 `[role, id]` 去重

`RuntimeSession.localTurns` 是唯一的渲染数据源，但它被 **5 个来源** 写入，各自的
`id` 取自完全不同的命名空间：

| 来源 | 写入点 | id 形态 |
|---|---|---|
| SQLite 缓存 | `mapPersistedTurnToMessage` | `turn:<fnv1a>`（存储 id） |
| 服务端载荷 | `normalizeTurns(detail.turns)` | 解析器 id `turn-N` |
| 实时用户消息 | `applyRealtimeUserMessage` | ACP `message_id` |
| 流式助手轮次 | `buildAssistantTurn` | `live-<cid>-<liveId>` |
| 服务端缺 id 兜底 | `normalizeTurn` | 旧实现 `turn-<i>-<Date.now()>` |

`buildConversationTimeline` 的 `dedupeEntriesByRoleAndId` 只按 `[role, id]` 去重，
因此「SQLite 那份」与「服务端那份」互不相识，同一条轮次各占一行。

触发路径（打开详情页时的并发写入者）：

1. `loadConversation` 命中本地缓存 → `localTurns = ...map(mapPersistedTurnToMessage)`
   （`turn:<hash>` 命名空间）；
2. 紧接着 `reconcileRemoteTurnsAfterLocalHydrate` → `fetchRemoteConversationDetail`
   → `applyRemoteHistoryWindowDetail`。若此时运行态是"易变的"
   （`hasVolatileRuntimeState` / 有 `inFlightUserTurnId`），它 **保留** 现有
   `localTurns` 却仍采纳远端窗口；
3. 之后任何一次追加/前插（`reloadLocalTurns`、`prependHistoryPageTurns`、
   `applyRealtimeUserMessage`）都会把另一个命名空间的同一条轮次混进同一个数组。

`buildRenderMessageItems` 只合并 **连续** 的 assistant 轮次，因此中间多出来的那条
重复用户轮次会把一段 assistant 切成两个气泡 —— 这就是"agent 消息也重复了"的观感。

### 第二个独立成因（进行中会话）

`findInFlightUserTurnByContentSignature` 旧实现只检查 `localTurns` 的 **最后一条**。
但 CodeG 解析器会把一个逻辑回复拆成 **多条连续 assistant 轮次**（在下一条 assistant
消息处断开，见 `codeg-plus/src-tauri/src/parsers/claude.rs:2564`），所以进行中的用户
轮次通常被若干条 assistant 轮次盖在中间，尾部不是 user。旧实现必然漏判，于是同一条
prompt 被当作新消息追加 → 用户消息重复 2 次。

## 三、协议事实（来源：`D:\Repos\xyito\lingyun\codeg-plus`）

修复依据的服务端行为，均已在 codeg-plus 源码中确认：

- 轮次 id **按下标派生**（`turn-N` / `grok-turn-N` / `cursor-turn-N` / `acp-N`），
  **不是数据库主键**。`turn_window.rs:83` 原文：*"parser turn ids are index-derived
  (`turn-N`), so they cannot witness a prefix rewrite anyway."*
- id 的数字后缀 **可能有空洞**：`parsers/mod.rs:789` 的
  `turns.retain(|t| !t.blocks.is_empty())` 会在分组后删除空轮次，因此
  `turns[i].id` 可能是 `turn-{j}` 且 `j > i`。**绝不能用 `parseInt(id)` 推全局下标**，
  下标只能用 `turns_offset + 数组位置`。
- 历史被压缩/前缀重写时，位置派生的 id 会整段平移 → 同一条逻辑轮次换 id。这正是
  `prefix_hash` 刻意 **不含 id**（只哈希 `(role, timestamp_millis)`）的原因。
- `user_message.message_id` 与轮次 id 是 **两个命名空间**：`manager.rs:59` 的
  `is_reserved_turn_id` 主动拒绝形如 `turn-<digits>` 的客户端 id。二者仅在某轮
  in-flight 期间由 `apply_in_flight_message_id` 临时对齐，`turn_complete` 后
  **轮次 id 会退回 `turn-N`**。
- 两个端点（`get_folder_conversation` / `get_folder_conversation_turns`）对同一条
  逻辑轮次返回 **相同 id**：二者共用 `get_folder_conversation_core`，窗口化只做切片
  不重编号（`conversations.rs:1329`）。

结论：**服务端 id 不能当跨来源身份**，必须用与来源无关的内容级键。

## 四、修复方案：`MessageTurn.dedupeKey` 作为唯一身份

复用持久层已有的 `buildTurnDedupeKey` —— 它本就是"与来源无关"的键，且对 `turn-`
前缀自动退化为内容指纹 `fp:<role>:<hash>:<秒级时间桶>`，正好抵消位置派生 id 的漂移。

1. **`types/acp.ts`**：`MessageTurn` 新增可选 `dedupeKey`。
2. **`services/conversation/conversationTurnIdentity.ts`（新增）**：把
   `buildTurnDedupeKey` / `buildPersistedTurnStorageId` / `stableHashString` 抽成
   **不依赖 SQLite 驱动** 的纯函数模块。
   > 必须拆分：`conversationDetailPersistence` 顶层 import 了 `services/db`，进而
   > import `sql.js/dist/sql-wasm.wasm?url`（只有 Vite 能解析的 URL 后缀）。归一化层
   > 若直接依赖它，纯展示模块在 jest 下会整个无法加载。
   > `conversationDetailPersistence` 继续 re-export，保证"落库时算的键"与"归一化时
   > 算的键"永远是同一份实现。
3. **两处 `mapPersistedTurnToMessage` 都透传 `dedupeKey`**：
   `pages/conversation-detail/detailDataNormalization.ts` 与
   `stores/conversationRuntime.ts`（后者是 `reloadLocalTurns` 实际使用的私有副本，
   历史上因为 `PersistedTurnWithParts` 未导入而退化成 `any`，才与前者悄悄漂移）。
4. **`normalizeTurn` 填充 `dedupeKey`**，并把缺 id 时的兜底 id 从
   `turn-<i>-<Date.now()>` 改为 `turn-<i>-<dedupeKey>`。旧写法每次归一化都产出新 id，
   同一条轮次会在时间线上无限分裂。
5. **`conversationTimeline.dedupeEntriesByRoleAndId`**：先按 `[role, dedupeKey]` 把
   不同来源的 id 折叠到"先出现"的那个身份上，再按原有 `[role, id]` 规则去重。
   保留策略不变：**user 保留第一条**（避免正在展示的消息被换掉导致列表跳动），
   **assistant 保留最后一条**（内容更完整）。
6. **`findInFlightUserTurnByContentSignature`**：跳过尾部连续 assistant 轮次再比对，
   且只认「带 `dedupeKey` 且 id 与当前 in-flight id 不同」的孪生轮次。
7. **`prependHistoryPageTurns`**：接缝去重同样优先用 `dedupeKey`。

## 五、必须守住的不变量

- **用户连续发送相同文本（例如两次"继续"）必须是两条独立消息。** 实时轮次不带
  `dedupeKey`，只有「持久化/远端来源」的轮次才带，因此内容签名兜底不会误合并排队
  连发的重复文本。`dedupeKey` 本身也含秒级时间桶与远端 id，天然区分两次发送。
- **绝不按全部历史内容签名去重。**
- 历史分页仍是"远端唯一、仅内存"：更早的页 **不写 SQLite**，只有尾窗会落库。
- 旧库迁移行的 `dedupe_key` 是 `legacy:<id>`（`migrations.ts:51`），不会跨来源折叠，
  行为退化为修复前的按 id 去重（不会误合并），下次尾窗落库时
  `replaceCompletedTurns` 会重写成正规键而自愈。

## 六、原生 iOS / Android 复刻要点

- 时间线模型里给每条轮次 **两个字段**：`id`（来源相关，用于渲染 key / 锚点滚动）与
  `dedupeKey`（与来源无关，用于身份判定）。**不要用服务端 id 当唯一键**。
- `dedupeKey` 算法必须与本文件一致，否则跨端缓存无法互认：
  - 有 id 且不以 `turn-` 开头 → `remote:<id>`；
  - 否则 → `fp:<role>:<FNV1a-32 hex(内容稳定序列化)>:<floor(ts/1000)>`。
  - 内容序列化需对对象键排序（`sortUnknown`），保证跨平台字节一致。
- 折叠时保留策略：user 取首条、assistant 取末条。
- 打开详情页时若"本地缓存水合"与"远端对账"是两个并发写入者，务必让它们写入
  **同一身份空间**，否则任何平台都会出现本文的重复现象。
- 不要用 `Date.now()` / `UUID()` 造兜底 id：每次归一化都会产生新身份。
- 不要从 `turn-N` 的数字后缀推全局下标（服务端可能有空洞），下标一律用
  `turns_offset + 数组位置`。

## 七、验证

- `mcode-app`：`npx jest --config jest.config.cjs --runInBand` → 114 suites / 620 tests 全绿。
- 新增回归覆盖：
  - `tests/stores/conversationTimeline.spec.ts`（新建，此前 `buildConversationTimeline`
    无直接单测覆盖）：跨 id 空间折叠、重复"继续"不被合并、无 `dedupeKey` 退化为按 id、
    user 取首 / assistant 取末。
  - `tests/stores/conversationRuntime.spec.ts`：assistant 轮次尾随时仍能认出持久化的
    in-flight prompt；排队连发相同文本仍是两条。
  - `tests/pages/conversation-detail/detailHistoryPaging.spec.ts`：跨 id 空间的接缝去重。
  - `tests/pages/conversation-detail/detailDataNormalization.spec.ts`：兜底 id 稳定化、
    `dedupeKey` 透传。
