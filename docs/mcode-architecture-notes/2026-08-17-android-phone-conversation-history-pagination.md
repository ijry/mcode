# Android 手机端会话详情历史分页

## 目标与范围

`mcode-app` 的会话详情采用服务端权威的历史窗口协议。打开详情时请求服务端尾部窗口；用户上拉时按服务端索引远端加载更早页。该实现仅作用于 uni-app Android 手机端详情页，不修改 `ios_native` 或 `android-watch`。

缓存策略是明确的：**首页尾窗可以缓存到 SQLite；所有更早页均为远端-only、内存-only，不写 SQLite，也不在重开详情后恢复。**

## 协议与数据流

1. 初始详情调用 `get_folder_conversation`，请求为 `{ conversationId, tailTurns: 30 }`。
2. 响应必须带有 `turns_offset`、`turns_total`、`assistant_turns_before_offset`、`prefix_hash`；它们组成 `ConversationHistoryWindow`，保存在对应 `conversationRuntime` session 的内存中。
3. 已接受且可持久化的初始/刷新 tail response 会调用 `persistConversationDetailSnapshot()`；它通过 `replaceCompletedTurns()` 在一个 SQLite transaction 中依次删除该会话的 `conversation_parts`、删除 `conversation_turns`、写入标准化后的当前 tail records。这样旧版本遗留的完整历史或更早页缓存会被原子清除，下一次打开详情只能用该首页尾窗回显；SQLite 不保存远端分页游标，也不决定下一页参数。
4. 上拉更早消息调用 `get_folder_conversation_turns`，请求为 `{ conversationId, beforeIndex: turns_offset, limit: 30 }`。
5. 更早页必须带 `prefix_hash_before_index`。客户端只有在该值与当前窗口 `prefix_hash` 一致、页边界连续且总数有效时，才将该页 prepend 到当前内存列表。
6. 不存在更早页专用的持久化 API；更早页严禁调用任何 SQLite 写入/回读合并逻辑。切换或重开详情后，这些页被丢弃，用户再次上拉时重新从远端加载。

服务端未提供上述分页元数据时，客户端显示“请升级 CodeG”的可操作错误，不回退到一次性全量历史请求。

## 删除的旧逻辑

- `HistoryPageCursor`、`oldestLoadedCursor` 及同类本地游标状态。
- 根据 SQLite 行数、最早时间戳或本地缓存数量计算远端 `beforeIndex` 的代码。
- 更早页落库、随后从 SQLite 读回并覆盖/拼接当前窗口的代码。
- 旧服务端的全量历史回退路径。

首次获得可持久化的有效 tail window 后，必须以“删 parts → 删 turns → 写 tail”的同一事务清理该会话旧版本遗留的更早历史缓存，使 SQLite 只保留首页尾窗；不得把更早页重新写回该缓存。

## 一致性与 UI 行为

- `prefix_hash` 是分页接缝校验。失败表示历史窗口变化：丢弃该页并重新加载最新 tail window，不能拼接可能错位的两段历史。
- 更早页请求会捕获 session、window 和运行时指纹；会话切换、窗口变化、流式回复或本地实时状态变化后返回的旧响应直接丢弃。
- prepend 前记录第一个可见消息；插入后恢复视觉锚点，避免列表跳动。
- 流式/权限/提问/当前用户轮次存在时不加载更早页，避免分页响应覆盖实时状态；同样不能用可能落后于实时状态的 tail response 覆盖内存中的 volatile turns。稳定的后续 tail 刷新才可以替换首页缓存。

## 兼容性

该协议依赖 CodeG 服务端支持 tail window、索引页和 prefix hash。旧应用遗留的完整 SQLite 历史不能继续参与分页；成功取得 tail window 后必须收敛为当前首页缓存。

## 原生复刻要点

### Android

- 为每个详情会话保留独立的内存 `historyWindow`，不能使用全局列表状态。
- Room/SQLite 只缓存首页尾窗；接受稳定 tail 刷新时在单一数据库事务中删旧 parts、删旧 turns、写新 tail。更早页仅存在于 ViewModel/Compose 的当前会话内存中。
- 先校验更早页，再 prepend 并恢复 RecyclerView/Compose 锚点；不得先写数据库，也不得为更早页创建本地游标。

### iOS

- Core Data/SQLite 只保存首页尾窗；更早页只在当前 `UIViewController` / SwiftUI `ViewModel` 生命周期内存在。
- 使用 `turns_offset` 请求更早页，并用 `prefix_hash_before_index` 校验接缝。
- 完成、取消、切换会话、重新连接或实时状态变化都必须让旧回包失效，避免列表重排或旧页回写本地数据库。
