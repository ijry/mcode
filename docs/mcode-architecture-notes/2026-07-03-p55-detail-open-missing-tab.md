# 2026-07-03 P55 Detail Open Missing Tab

## Architecture

- `conversation-detail` 继续把远端 `opened_tabs` 当作详情页 tabs 的真源。
- 只有“主动打开一个会话”的入口会补写远端 tabs；详情页自身的被动 hydration 仍然只读 `opened_tabs`，不再在 `onLoad`/刷新时偷偷创建 tab。
- 当前补 tab 入口是会话总览列表和项目会话列表，和“创建新会话后先补 tab 再进入详情”保持同一模式。

## Protocol And Data Flow

1. 用户在 mcode 列表点击会话。
2. 列表页先解析连接并调用 `ensureConversationTab(... activation: "allow")`。
3. 若该会话不在远端 `opened_tabs`，会追加一个新 tab；若已存在，则只把该 tab 设为 active。
4. 随后再跳转 `conversation-detail` 路由；详情页只消费已经同步好的 `opened_tabs` snapshot。

## UI Behavior

- 点击一个当前不在 tabs 里的会话时，详情页可以正常打开，不会因为 tabs 为空或缺少目标会话而回退。
- 该会话会出现在顶部 tab 条中，并成为当前活动 tab。
- 已存在于 tabs 的会话仍然复用原 tab，不会生成重复 tab。

## Compatibility

- 没有新增后端接口，也没有修改 `opened_tabs` 结构。
- 旧客户端如果仍然直接跳详情页而不先补 tab，仍可能遇到“目标会话不在 tabs”时的打开异常。
- 新客户端把“显式打开会话”与“被动详情页 hydration”区分开后，可以兼容 2026-07-02 的只读 hydration 行为。

## Native iOS/Android Replication

- 原生端从会话列表进入详情前，也要先执行一次显式 `ensure/open tab` 写入，再推入详情页。
- 进入详情页后的生命周期刷新只读 `opened_tabs`，不要在页面挂载或恢复时自动补 tab。
- `activation` 语义应与当前 Web/uni-app 一致：列表点击使用 `allow`，提示发送等非切页场景继续使用 `preserve`。
