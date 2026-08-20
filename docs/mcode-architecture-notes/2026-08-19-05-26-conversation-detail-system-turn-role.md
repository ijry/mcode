# P202608190010 上下文压缩摘要被当成 agent 回复渲染（system 角色缺失）

需求编号：**P202608190010**
日期：2026-08-19
适用端：mcode-app（uni-app + Vue3），**原生 iOS / Android 复刻同样需要按本文实现**
影响文件：
- `mcode-app/src/types/acp.ts`
- `mcode-app/src/services/conversation/conversationTurnIdentity.ts`
- `mcode-app/src/services/conversation/conversationDetailPersistence.ts`
- `mcode-app/src/stores/conversationRuntime.ts`
- `mcode-app/src/pages/conversation-detail/detailDataNormalization.ts`
- `mcode-app/src/pages/conversation-detail/detailMessagePresentation.ts`
- `mcode-app/src/services/db/repositories/conversationRepository.ts`
- `mcode-app/src/components/MessageBubble.vue`
- 测试：`tests/pages/conversation-detail/detailDataNormalization.spec.ts`、
  `detailMessagePresentation.spec.ts`、`tests/stores/conversationTimeline.spec.ts`

参考实现：`D:\Repos\xyito\lingyun\codeg-plus`。

## 1. 现象

详情页把会话压缩信息当成 agent 回复显示出来了 —— 一大段
`This session is being continued from a previous conversation that ran out of
context...` 的内部说明出现在正常消息流里，套着 assistant 气泡。

## 2. 根因：客户端只认两种角色

服务端 `TurnRole` 有**三种**取值（`src-tauri/src/models/message.rs:199-205`）：

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TurnRole {
    User,
    Assistant,
    System,
}
```

而 mcode 的 `MessageTurn.role` 只声明了 `"user" | "assistant"`，两处归一化都写着同一行：

```ts
const role = rawRole === "user" ? "user" : "assistant"   // ← system 落进 else
```

`system` 因此被静默改判成 `assistant`，按 agent 回复渲染。

### 2.1 压缩摘要为什么是 system

Claude Code 把压缩摘要写进 JSONL 时用的是 `type: "user"`，解析器主动改判
（`src-tauri/src/parsers/claude.rs:1407-1420`）：

```rust
// Detect context continuation summary and treat as system message
let role = if is_context_continuation(&content) {
    MessageRole::System
} else { … MessageRole::User };
```

判定依据是正文前缀 `CONTEXT_CONTINUATION_PREFIX`（`claude.rs:675-688`）。
分组阶段再落成 `TurnRole::System`（`claude.rs:2584-2595`）。

**这不是 Claude 特例**：`pi.rs` / `kimi_code.rs` / `opencode.rs` / `codex.rs` /
`gemini.rs` / `codebuddy.rs` / `cline.rs` / `openclaw.rs` / `hermes.rs` 全都有
`TurnRole::System` 分支，是十个解析器共有的第三种角色。

### 2.2 codeg-plus 前端怎么渲染它

`src/components/message/message-list-view.tsx:577-579` 在分组渲染的最前面就分流：

```tsx
if (group.role === "system") {
  return <CollapsibleSystemMessage group={group} />
}
```

`CollapsibleSystemMessage`（`message-list-view.tsx:226-259`）是一条**默认收起**的
黄色描边提示，标题为 `t("systemMessage")`，点击才展开正文。也就是说参考实现从来没把
它当消息气泡渲染过。

## 3. 修复

### 3.1 角色判定收敛到一处纯函数

新增 `normalizeTurnRole()`，放在 `conversationTurnIdentity.ts`（纯函数模块，不依赖
SQLite 驱动）。放这里是为了让**四个入口共用同一份判定**：

| 入口 | 位置 | 原来的写法 |
| --- | --- | --- |
| 服务端载荷归一化（展示侧） | `detailDataNormalization.ts` 的 `normalizeTurn` | `rawRole === "user" ? … : "assistant"` |
| 服务端载荷归一化（落库侧） | `conversationDetailPersistence.ts` 的 `normalizeTurn` | 同上（各写一份） |
| SQLite 读回（导出版） | `detailDataNormalization.ts` 的 `mapPersistedTurnToMessage` | `turn.role as MessageTurn["role"]` |
| SQLite 读回（私有副本） | `conversationRuntime.ts` 的 `mapPersistedTurnToMessage` | 同上 |

前两个是**这次 bug 的直接成因**（三元表达式把 system 吞进 assistant）。
后两个是裸 `as` 断言 —— 编译期不报错、运行期不校验，DB 里存的任何字符串都会原样
透出成 `role`。它们本次没暴露问题只是因为落库侧已经修好了，但留着断言意味着下次
再多一种角色时又会静默穿透，所以一并收敛。

`conversationRuntime.ts` 那份是 `reloadLocalTurns` 实际调用的实现，历史上已经和导出版
悄悄漂移过一次（见 `2026-08-18-19-56-conversation-detail-turn-identity-dedupe.md`）。这次用
结构而不是纪律保证一致：只有一个函数，改一处就是改四处。

未知角色仍退回 `assistant`（保守：宁可多渲染也不要静默丢消息）。

### 3.2 类型与存储都要放得下 system

- `MessageTurn.role` 扩成 `"user" | "assistant" | "system"`。
- `PersistedTurnRecord.role` 同步扩宽 —— 否则 `system` 落库后读回会类型不符。
  SQLite 的 `role` 列本来就是 `TEXT NOT NULL`，无需迁移。

### 3.3 渲染：独立成项 + 默认折叠

`detailMessagePresentation.ts` 的 `buildRenderMessageItems` 原来只按
`role === "assistant"` 入合并缓冲、其余一律独立成项 —— 巧合地对了一半：`system` 确实
不会被塞进 buffer。但它会**打断** assistant 合并串，这正是期望行为（压缩摘要前后的
回复属于不同上下文，不该被拼进同一个气泡），补了注释与回归测试锁住。

`MessageBubble.vue` 顶层加 `v-if="isSystemMessage"` 分支，渲染一条默认收起的折叠提示，
对齐 codeg-plus 的 `CollapsibleSystemMessage`。标签按内容前缀细分：命中
`CONTEXT_CONTINUATION_PREFIX` 显示「上下文已压缩（历史摘要）」，否则「系统消息」。
样式统一用 `--up-warning*` 主题变量，与 thinking 折叠块同一套视觉语言。

放在 `MessageBubble` 而不是各个列表页，是因为它有三个调用点
（`index.vue`、`ConversationDetailInteractivePane.vue`、
`ConversationDetailReadonlyTimeline.vue`），改组件一次覆盖全部。

### 3.4 与实时消息抑制的交互

昨天新增的 `suppressLiveOwnedTrailingAssistantRun`（见
`2026-08-18-23-51-conversation-detail-live-message-overlap.md`）按「尾部连续 assistant 轮次」
扫描。`system` 不是 assistant，天然终止扫描 —— 这恰好是对的：

- 压缩摘要不会被抑制掉（否则「上下文已压缩」提示会凭空消失）；
- 摘要**之前**那些属于上一轮的 assistant 轮次不会被顺带抹掉。

已加测试 `stops the trailing assistant scan at a system turn` 锁死这个行为。

## 4. 另一处仍需注意

分页指纹 `prefix_hash` 的角色标签是 **`user=0, assistant=1, system=2`**
（codeg-plus `src/lib/turn-window.ts:58-67` 与 Rust
`commands::turn_window::prefix_fingerprint`）。mcode 目前**不在本地重算**这个指纹
（只做 `prefix_hash_before_index === current.prefix_hash` 的字符串比对，见
`detailHistoryPaging.ts:119`），所以本次不受影响。但如果将来要在客户端自算指纹，
**必须把 system 映射成 2**，否则把它当 assistant 会算出不同的哈希，分页校验会全面失败。

## 5. 原生 iOS / Android 复刻要点

1. **角色枚举必须有三个 case**，不是两个。反序列化时把未知值兜到 assistant，
   但 `system` 一定要显式识别 —— 这是最容易漏的一个，且漏了不会报错，只会把内部
   说明当正文显示。
2. **system 不是消息气泡**：渲染成一条默认收起的行内提示（iOS 可用
   `UITableViewCell` 的自定义样式或 `DisclosureGroup`，Android 用
   `ExpandableLayout` / Compose 的 `AnimatedVisibility`）。
3. **不要合并跨 system 的 assistant 串**：摘要前后属于不同上下文。
4. **落库要能存下第三种角色**，且读回时原样返回 —— 别在存储层做 role 白名单过滤。
5. **本地重算分页指纹时，role tag 必须是 `user=0/assistant=1/system=2`**，与 Rust
   侧逐字节一致。

## 6. 验证

```bash
cd mcode-app && npx jest --config jest.config.cjs --runInBand
# 本需求落地时 114 suites / 629 tests 全绿（新增 4 条：归一化保留 system、
# 未知角色兜底、渲染独立成项、时间线扫描在 system 处终止）。
# 2026-08-19 尾窗分页改造后基线为 116 suites / 664 tests。

npx tsc --noEmit -p tsconfig.json   # grep 过滤到改动文件确认为空
npx uni build                        # H5 构建通过
```

相关笔记：`2026-08-18-23-51-conversation-detail-live-message-overlap.md`、
`2026-08-18-19-56-conversation-detail-turn-identity-dedupe.md`。
