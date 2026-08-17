# Android 手机端会话详情历史分页设计

**日期：** 2026-08-17
**范围：** `mcode-app` Android 手机端（uni-app）会话详情历史消息
**主文件：** `mcode-app/src/pages/conversation-detail/index.vue`、`mcode-app/src/pages/conversation-detail/ConversationDetailInteractivePane.vue`、`mcode-app/src/pages/conversation-detail/detailHistoryPaging.ts`、`mcode-app/src/stores/conversationRuntime.ts`、`mcode-app/src/services/conversation/conversationDetailPersistence.ts`、`mcode-app/src/types/acp.ts`

---

## 背景

旧详情页的更早历史依赖 SQLite 中已缓存的消息及本地游标（例如 `HistoryPageCursor`、`oldestLoadedCursor`）。这种模式无法将本地缓存与服务端历史版本可靠对齐，也会让长会话在重新打开时意外复用过期的更早页。

CodeG 已提供服务端窗口协议：

- `get_folder_conversation({ conversationId, tailTurns })` 返回尾部窗口；
- 响应提供 `turns_offset`、`turns_total`、`assistant_turns_before_offset`、`prefix_hash` 与可选 `uncovered_prefix_max_ts`；
- `get_folder_conversation_turns({ conversationId, beforeIndex, limit })` 返回更早页，并提供 `prefix_hash_before_index` 作为接缝校验。

本次仅重写 Android 手机端的详情历史分页。`ios_native` 和 `android-watch` 不在改动范围内。

## 决策与硬约束

采用服务端权威的 `ConversationHistoryWindow`，并将缓存策略限定为：

1. **首页尾窗可缓存。** 初始 tail window 可以作为 SQLite 首屏缓存保存和读取；它只用于首屏回显，不能推断远端是否还有更早消息。
2. **更早历史页远端-only、内存-only。** 上拉得到的任意更早页只在当前详情 tab / runtime session 中 prepend；不得写入 SQLite，不得在重开详情后复用。
3. **只保留最新窗口逻辑。** 删除旧本地游标、本地历史数量推断、从 SQLite 续页、以及更早页落库后重载覆盖当前窗口的路径。
4. **严格协议，不做全量回退。** 服务端缺少或返回非法窗口元数据时，显示“请升级 CodeG”的可操作错误；不能回退到一次性下载完整历史。

## 非目标

- 不变更 iOS 原生或 Wear OS 手表端。
- 不修改实时事件、用户消息权威化和发送协议。
- 不启用父级 `index.vue` 中已禁用的旧消息 UI 分支。
- 不兼容旧的 SQLite 分页游标或以本地缓存模拟服务端窗口。

## 提交边界

分页重写必须保留为四个可独立审查的提交：

### 提交 1：服务端窗口协议与纯函数

- 在 `src/types/acp.ts` 定义 `ConversationHistoryWindow`、`ConversationTurnsPage` 及 snake_case 原始协议字段。
- 在 `detailHistoryPaging.ts` 实现：
  - 常量页大小 `30`；
  - tail / older 请求构造；
  - 窗口和页面元数据严格解析；
  - 是否还有更早页判断；
  - `prefix_hash` 接缝、offset 连续性、总数有效性校验；
  - 按 message id 去重的 prepend 合并；
  - 从已验证的更早页推进内存窗口。
- 覆盖纯函数单测：正常页、缺字段、非法数值、接缝不匹配、总数变化、重叠页去重。

### 提交 2：会话级内存窗口

- `conversationRuntime` 的每个 `RuntimeSession` 持有独立 `historyWindow`。
- 只将当前已加载的远端窗口元数据保存在运行时，不能放到全局列表状态或 SQLite 游标中。
- 初始化、会话切换、运行时重置和详情销毁时清理或替换对应窗口，避免一个会话的页响应进入另一个会话。
- 测试多个会话之间的窗口隔离和 reset 行为。

### 提交 3：更早页安全加载

- 上拉页请求始终使用当前 `historyWindow.turns_offset` 作为 `beforeIndex`。
- 请求发起时捕获 conversation id、session identity、window fingerprint 和实时状态指纹；响应返回时任一条件已变化则丢弃。
- 仅当接缝与边界校验通过时，才 prepend 到当前内存消息列表并推进 `historyWindow`。
- `prefix_hash` 不匹配时丢弃页面并重新请求最新 tail window，不拼接不同历史版本的数据。
- 流式回复、权限/提问状态或当前用户轮次存在时不加载更早页。
- prepend 前记录第一个可见消息锚点，插入后恢复视觉位置。

### 提交 4：首页缓存与详情页接入

- 初始详情仅请求 `{ conversationId, tailTurns: 30 }`，使用服务端返回的窗口初始化 session。
- SQLite 只保存并读取首页尾窗；成功收到新 tail window 后，替换该会话的本地首页缓存，清除旧版本留下的更早历史记录，防止其再次作为首屏或续页来源。
- 更早页加载器不得调用 `persistConversationTurns`、不得写入 `conversation_turns` / `conversation_parts`，也不得在完成后重新从 SQLite 合并消息。
- 删除 `HistoryPageCursor`、`oldestLoadedCursor`、基于 SQLite 数量/时间戳计算下一页的逻辑，以及旧全量历史回退。
- 更新详情页契约测试、持久化测试和 `docs/mcode-architecture-notes/` 说明。

## 数据流

### 首次进入或刷新详情

1. 可先读取 SQLite 中保存的**首页尾窗**进行首屏回显；该结果没有远端分页权威性。
2. 发起 `get_folder_conversation({ conversationId, tailTurns: 30 })`。
3. 严格解析服务器窗口元数据；失败时显示升级提示并停止分页。
4. 以服务端 tail turns 替换当前 session 的静态历史和 `historyWindow`。
5. 将这一个 tail window 替换写入 SQLite，清理此前留下的更早页缓存。

### 用户上拉加载更早页

1. 当 `historyWindow.turns_offset > 0`、没有实时冲突且当前没有请求时，记录可见锚点与当前运行时指纹。
2. 发起 `get_folder_conversation_turns({ conversationId, beforeIndex: historyWindow.turns_offset, limit: 30 })`。
3. 解析并校验返回页的 `prefix_hash_before_index`、offset 连续性和总数。
4. 校验通过后，只向当前 session 的内存列表 prepend 该页；不执行 SQLite 写入或 SQLite 回读。
5. 恢复滚动锚点。失败、过期或接缝不匹配的响应不改变当前内存窗口。

### 重新进入详情

- 不恢复此前上拉过的更早页。
- 只恢复（如可用）首页尾窗缓存，然后以新的服务端 tail window 校准。
- 用户需要再次上拉时，再从远端取得更早页。

## 兼容性与迁移

- SQLite schema 不需要增加远端游标字段；窗口元数据只存在运行时。
- 已安装版本可能遗留完整历史或旧分页缓存。首次收到有效 tail window 后，持久化层必须将该会话的本地消息集合收敛为当前 tail window，避免旧更早页继续参与首屏或分页。
- 缺少窗口协议的 CodeG 服务端不受静默兼容：显示升级错误，避免恢复长会话全量加载。

## 验收与验证

### 纯函数测试

- 请求 payload 使用 `tailTurns: 30` 和 `beforeIndex: turns_offset`。
- 缺少/非法元数据报告升级错误。
- 接缝 hash、offset、total 不合法时拒绝页。
- 已验证页的 prepend 去重且不修改输入。

### 运行时和组件契约测试

- 每个会话拥有独立 `historyWindow`。
- 首次 tail window 可调用首页持久化；更早页路径断言不调用任何 SQLite 写入函数。
- 切换/重开详情后不再显示或复用上一次已加载的更早页。
- 实时状态或 window 变化时过期响应被丢弃。
- prepend 后首个可见消息保持视觉锚定。
- 旧本地游标符号和旧 SQLite 续页路径不再被引用。

实施时运行受影响的 Jest 测试，再运行 `mcode-app` 的完整 `test:unit`；如项目现有构建环境可用，还应执行相应 uni-app 构建检查。

## 原生 Android / iOS 复刻指南

### Android

- Room/SQLite 只能缓存首页 tail window；不要把更早页写入数据库。
- `ViewModel` / Compose state 为每个打开的详情会话持有内存 `historyWindow` 和 prepend 页；离开详情即清除这些更早页。
- 以 `turns_offset` 请求更早页，先验证 `prefix_hash_before_index`，再更新列表并恢复 RecyclerView / LazyColumn 锚点。

### iOS

- Core Data / SQLite 仅持久化首页尾窗；更早页只保存在当前 controller / SwiftUI view model 生命周期内。
- 使用当前 `turns_offset` 请求更早页，验证接缝后再插入 `UICollectionView` 或 SwiftUI 列表。
- 回包前后比较详情实例、窗口指纹和实时状态；失效页直接丢弃，不能回写本地数据库。
