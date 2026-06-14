# Detail Resume Remote Reconcile

## Summary

会话详情页此前在应用后台恢复后，或者冷重开后命中旧的 runtime 持久化记录时，如果本地 runtime 里仍有可渲染消息状态，就会直接复用该 hot runtime，不再主动向远端拉取完整会话 turns。这样会导致一种场景：

- 手机退到后台；
- PC 端继续运行并生成新消息；
- 手机回来后详情页仍显示旧消息；
- 直到后续又产生一次新事件或新消息，旧缺失消息才被补齐。

本次在详情页恢复路径增加一次远端 turns 级校准，避免仅凭本地 runtime/SQLite 缓存判断消息已完整。

## Architecture

- 详情页增加 `forceRemoteTurnReconcileOnLoad` 标记。
- `onShow` 触发恢复刷新时，把该标记置为 `true`。
- `loadConversation()` 会额外检查持久化 runtime 是否显示该会话上次仍处于 active/live/optimistic 状态。
- 命中上述任一条件时，即使命中 `hasHotRuntime` 分支，也会在首屏渲染后异步执行一次远端 `get_folder_conversation`。
- 远端结果通过 `persistConversationDetailSnapshot(...persistTurns: true)` 写入本地 SQLite，再用 `refreshSessionTurnsFromDb(...)` 覆盖详情页本地 turn 列表。

## Data Flow

1. 页面 `onHide` 时仅保存本地 runtime 和滚动状态。
2. 页面 `onShow` 时若需要恢复，标记本次加载必须做远端 turn 校准。
3. 若本次是冷重开，但 SQLite 中的 runtime 记录显示该会话上次仍在活跃运行，也会触发同样的远端 turn 校准。
4. `loadConversation()` 先按原逻辑恢复本地 hot runtime，保证首屏快速可见。
5. 恢复完成后异步调用 `get_folder_conversation(conversationId)` 拉完整 turns。
6. 把远端 turns 落盘到 SQLite，并重新读取最新本地 turns 刷新 UI。

## UI Behavior

- 后台恢复或冷重开命中旧 runtime 持久化时，详情页会先快速显示上次本地状态。
- 随后若远端存在后台期间新增消息，详情页会自动补齐，不需要用户再发一条新消息触发回填。

## Compatibility

- 不修改后端协议。
- 保留现有 hot runtime 快速恢复体验，只是在恢复场景追加一次异步远端校准。

## Native Replication Guidance

- 原生端不要把“本地 runtime 仍可渲染”当作“远端消息一定完整”。
- 若页面经历过后台恢复，应在恢复后补一次远端 conversation detail / turns 拉取。
- 建议采用“先展示本地缓存，再异步远端校准并覆写本地列表”的两阶段恢复策略。
