# 输入框草稿按会话落库

**文件**：`2026-08-27-11-43-composer-draft-persist-per-conversation.md`

## 现象（用户原话）

> 输入框没法送的消息应该按会话落库本地数据库

## 一、基础设施全在，只是接线接在了一个空 ref 上

调查后的结论：**不需要建表、不需要动 schema、不需要写新的仓储函数。**

`conversation_runtime` 表（`services/db/schema.ts`）早就是这个形状：

```sql
CREATE TABLE IF NOT EXISTS conversation_runtime (
  conversation_id INTEGER NOT NULL,
  instance_key TEXT NOT NULL,
  composer_text TEXT,        -- ★ 输入框文本
  attachments_json TEXT,     -- ★ 附件
  draft_queue_json TEXT,     -- ★ 待发送队列
  ...
  PRIMARY KEY (instance_key, conversation_id)   -- ★ 天然按实例+会话
)
```

`saveDraftState`（`runtimeRepository.ts`）也早就是 read-modify-write —— 只覆盖草稿三列，其他列
从当前行继承，不会把 live/seq 冲掉。恢复侧 `resolveConversationDraftRestoreState`
（`detailDataNormalization.ts`）连三层优先级（内存 > uni.storage > SQLite）都写好了。
`cacheManager` 甚至已经把这张表纳入「可清缓存」清单。

**唯一的接线在 `index.vue` 上**，而那个组件的输入框在抽离 `ConversationDetailInteractivePane.vue`
时就没了 —— 它的模板（1–320 行）里 `inputText` 引用数为 **0**。于是整套基础设施在往一个永远为空
的 ref 上写：`persistDetailRuntimeState()` 每次都在存空快照，甚至因为
`isConversationDraftSnapshotEmpty` 命中而顺手 `removeStorageSync`。

而真正有输入框的 pane，`inputText` / `attachments` 是两个裸 ref，**这个组件原本连生命周期钩子
都没有**（无 `onMounted` / `onUnmounted` / `onHide`，也没有 `watch(props.active)`）。

> 这是本轮第**四**次撞上同一个模式：拦截判据、`isBusyForSend`、草稿持久化 —— 抽离组件时逻辑
> 的定义跟过来了，调用点没跟过来。前几次的记录见相关笔记。

## 二、切 tab 不是隐藏，是销毁

这决定了落盘时机不能只靠防抖。

`index.vue:202` 渲染 pane 的条件是 `v-if="shouldRenderDetailTabPage(index)"`，而
`mountedDetailConversationIds` 每次切 tab 都被**整体替换**成 ±1 滑动窗口
（`detailTabsPresentation.ts` 的 `resolveDetailMountedWindowConversationIds`）。

从 tab0 跳到 tab3 → tab0 的 pane 被 `v-if` 销毁 → 两个 ref 随组件蒸发。退出详情页（`onUnload`）
同理。

所以落盘有两个时机，缺一不可：

| 时机 | 作用 |
| --- | --- |
| 防抖 `watch`（800ms） | 正常输入时增量落盘 |
| `onUnmounted` | **立即** flush 防抖里压着的那次 —— 等它自己触发时组件已经没了 |

## 三、base64 绝不能落库（写入侧此前缺一道对称过滤）

`UploadedAttachment.data` 是整张图的 base64，单张就可能几 MB（上限 `PROMPT_IMAGE_MAX_BYTES`）。

两条路都会炸：

- `uni.storage`：直接撞平台配额（通常 10MB 总量）。
- SQLite：H5 侧每次 `execute` 后都会 `h5Db.export()` **把整库 dump 重写进 IndexedDB**
  （`services/db/sqlite.ts`）。草稿是**每敲一个字**防抖落盘的，带着几 MB base64 等于每次按键
  拷贝一遍整个数据库。

**读回那侧本来就不认 `data`** —— `normalizeAttachment` 的返回对象里没有这个字段。但**写入侧
没有对称过滤**：`index.vue:3983` 是裸的 `JSON.stringify(attachments.value)`。所以 `data` 会被
写进去，只是读回来时被丢掉。

新增纯函数 `sanitizeAttachmentsForPersist`：只保留 `id / url / name / size / type / kind`
和存在时的 `localPath / remoteUrl`，缺失的可选字段**省略键而不是写 `undefined`**（保持与
`normalizeAttachment` 输出同形）。**不修改入参** —— composer 里那份 attachments 是响应式的、
还要继续用来发送，顺手删掉它的 `data` 会让紧接着的发送直接失败。

这与既有降级策略是配套的，不是偷工减料：发送时 `prepareDraftForSend` 用 `localPath` / `url`
走 `readLocalImageBase64` 按需重读，读不到就报「图片 XXX 本地缓存已失效，请重新选择图片」。

## 四、恢复闸门：不设它会间歇性丢草稿

恢复是异步的（要读 SQLite）。不设闸门的话，mount 那一刻的空值会先被防抖 watch 落盘，把上一次
存的草稿覆盖成空。

症状是「偶尔草稿没了」，取决于 `getRuntime` 与首次 watch 触发的时序竞争 —— 这类 bug 手测很难
稳定复现。

`draftRestored` ref 就是那道闸：`persistPaneDraft` 在它为 false 时直接返回。并且**无论恢复成败
都要放开**（`finally` 里置 true），否则一次读失败会让这条会话再也存不进草稿。

恢复时还有一道保护：**输入框已有内容就不覆盖** —— 用户可能在异步返回前就开始打字了。

## 五、实测撞出来的：pane 必须自己建表

第一次跑浏览器闭环验证时直接 `no such table: conversation_runtime`。

`ensureConversationSchema()` 在 `index.vue` 里只在 `hydrateLocalConversationState` 那条路上调
（有本地缓存时），而 pane 可能是**第一个**碰 SQLite 的组件。所以 `persistPaneDraft` /
`restorePaneDraft` 各自开头都要调一次。它自带 promise 去重（`migrations.ts` 的 `schemaReady`
+ `schemaPromise`），重复调用没有代价。

**这条不靠推理，是探针撞出来的。** 我原本以为详情页那侧总会先建好表。

## 六、验证方式：浏览器里跑真实 SQLite

`saveDraftState` 这条链路**在 jest 里测不了** —— `services/db/sqlite.ts` 顶部有
`import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url"`，jest 直接解析失败（既有测试是靠
`jest.mock("@/services/db/sqlite")` 打桩绕过的，那只能验 SQL 文本，验不了真实读写）。

所以起 H5 dev server，用 Playwright 在页面里动态 `import()` 真实模块跑闭环：

| 断言 | 结果 |
| --- | --- |
| 存了能取回 | `会话一的草稿` ✓ |
| **按会话隔离** | conv1 / conv2 各自独立 ✓ |
| **按实例隔离** | `inst-a`/1 与 `inst-b`/1 互不覆盖 ✓ |
| **base64 未入库** | `base64Leaked: false`，库里只有路径 ✓ |
| 恢复出附件且无 `data` | `restoredHasData: false`，`localPath` 保留 ✓ |
| 清空能覆盖 | 用户清空输入框后库里是 `""` ✓ |

落库后的实际 JSON（从库里读出来的）：

```json
[{"id":"att-1","url":"/tmp/p.png","name":"p.png","size":100,
  "type":"image/png","kind":"image","localPath":"/tmp/p.png"}]
```

## 测试

`detailDataNormalization.spec.ts` 新增 `describe("sanitizeAttachmentsForPersist")` **6 例**：
剔除 base64；保留重建所需字段；**不修改入参**；省略缺失的可选键；**过
`normalizeAttachments` 的往返闭环**（落库→读回，形状仍能被收下）；空数组。

`paneDraftPersistenceWiring.spec.ts`（新，源码扫描）**6 例**：落库接在真正有输入框的组件上；
mount 恢复 + unmount 立即 flush；**恢复闸门存在**；**不写 base64**（且不能退回
`JSON.stringify(attachments.value)` 那种写法）；自己 `ensureConversationSchema`；按 instance
键入行。

**变异探针（5 次，全部命中）**：

- 纯函数层 2 次：退回全量浅拷贝（即改动前的行为）→ 2 红；写 `undefined` 键 → 1 红。
- 接线层 3 次：忘记过滤 base64（照抄 `index.vue` 死代码的写法）→ 1 红；去掉恢复闸门 → 1 红；
  unmount 时不立即落盘 → 1 红。

每次探针后源文件均 `diff -q` 字节一致。

三道闸：jest **135 suites / 971 tests 全绿**（基线 959，新增 12）；`tsc --noEmit` 恰好 5 条既有
基线错误，改动文件零错误；`./node_modules/.bin/uni build` DONE。外加上面那组浏览器闭环。

## 原生 iOS / Android 复刻要点

1. **落盘/恢复要接在真正持有输入框的那个视图上。** 这次的 bug 根因不是没实现，而是实现挂在了
   一个已经没有输入框的组件上，往空值里写了很久也没人发现。如果你的架构里状态与视图分层，
   加一条「这个持久化函数是否真的读到了非空输入」的冒烟检查比写注释有用。
2. **确认 tab 切换是「隐藏」还是「销毁」。** 销毁式（本次是 ±1 挂载窗口）必须在销毁回调里
   **立即** flush 防抖，否则最后一段输入永远丢。
3. **恢复是异步的，落盘要有闸门。** 恢复完成前的空值一旦被写进去，就把上次的草稿覆盖了。
   症状是间歇性丢草稿，取决于时序。闸门无论恢复成败都要放开。
4. **恢复时不要覆盖用户已经开始输入的内容。**
5. **图片的二进制/base64 绝不进草稿存储，只存路径。** 发送时按需重读，读不到就明确提示
   「本地缓存已失效，请重新选择」。读侧丢弃不等于写侧安全 —— 两侧的过滤必须对称。
6. **清洗函数不能修改入参。** 那份附件数组还要用来发送。
7. **主键要含实例标识**，否则两台主机上同号会话的草稿互相覆盖。
8. **每个可能第一个访问数据库的入口都要自己保证建表。** 依赖「另一个组件会先建好」在干净安装
   上直接报 no such table。
9. **草稿写入频率很高（每次按键防抖），要清楚存储层每次写的真实代价。** 本项目 H5 侧每次
   execute 都整库 dump 重写 IndexedDB —— 这个事实决定了 base64 绝对不能进去。

## 相关笔记

- [[2026-08-27-01-22-running-send-interception-and-native-steering]] —— 同一个「抽离组件时调用点
  没跟过来」的模式，那次丢的是发送拦截
- [[2026-08-27-02-19-feedback-notes-two-events]] ——「基础设施在、只差接线」的同型情况
- [[2026-08-19-18-32-conversation-detail-local-turn-cache-toggle]] —— `conversation_runtime`
  与轮次缓存开关的关系：摘要与 runtime（含草稿）**不受**那个开关约束

## 待观察

- **`index.vue` 里那套死代码仍然在**（第四次记这条）：`persistDetailRuntimeState` /
  `draftQueue` / `restoreDraftState` / `detailTabStateMap`，四层存储全接在空 ref 上。现在
  pane 有了自己的落盘，两者会**同时写同一行**（`saveDraftState` 覆盖草稿三列）—— 目前无害，
  因为 `index.vue` 那侧写的永远是空值且时机不重叠（`onHide` / `onUnload` 在 pane 卸载之后），
  但这是个真实的竞态隐患。**该清了，而且现在有了替代实现，清起来比之前安全。**
- **pane 没有存 `draftQueue`**（写死 `"[]"`）—— 本地待发送队列那套仍在 `index.vue` 死代码里。
  如果以后把队列搬到 pane，这一列要一起接上。
- **`uni.storage` 那一层（`mcode_conversation_draft_snapshot:*`）现在无人写入**，只有
  `index.vue` 的死代码在碰。pane 只走 SQLite。三层优先级里的中间那层实际已经空了 ——
  清理死代码时要一并决定它的去留。
