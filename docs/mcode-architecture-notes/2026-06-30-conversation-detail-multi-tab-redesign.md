# 2026-06-30 Conversation Detail Multi-Tab Redesign

## Architecture

`conversation-detail` 现在拆成两层：

- 多会话 shell：页面级 `up-tabs` + `swiper`
- 单会话 body：`ConversationDetailBody.vue`

远端 `opened_tabs` 仍然是唯一的 tabs 成员、顺序、活动态真源。详情页本地只维护展示态：

- 当前激活 tab index
- 当前与相邻页懒渲染窗口
- 轻量的 per-tab 本地 UI 缓存（输入草稿、计划抽屉等）

当前实现继续复用原有单会话 `loadConversation()` 链路作为 active 页 hydration 核心，没有改 ACP、SQLite、runtime、realtime 协议。

## Protocol And Data Flow

进入详情页后：

1. 根据 route 的 `conversationId/folderId/connectionId|connectionKey` 解析实例。
2. 调用 `pcTabSyncService.ensureConversationTab(... activation: "allow")`，确保该会话存在于远端 tabs，且成为活动 tab。
3. 读取 `openedTabsRealtimeCache` 缓存并订阅 `tabs://changed`，把远端 snapshot 映射为 `up-tabs` / `swiper` 数据。
4. 继续订阅 `conversation://changed` 的本地失效通知，仅用于刷新 tab 标题和元信息，不参与 tabs 成员判定。
5. 用户点击 tab、左右滑动、或关闭 tab 时，移动端会回写远端 `opened_tabs`，因此 PC 与移动端活动页保持同步。

关闭活动 tab 时，选中规则为：

- 优先右侧 tab
- 没有右侧则回退左侧
- 没有剩余 tab 则返回会话列表

## UI Behavior

页面样式按新的详情页稿改成了轻玻璃风：

- 顶部 navbar + 第二层真实 tabs 条
- tabs 使用 `up-tabs`，每个 tab 可关闭
- 内容区使用 `swiper` 支持左右手势切换
- 仅当前页和相邻页参与渲染窗口，其余页懒加载
- 当前 active 页渲染真实会话 body，相邻页先显示轻量占位卡，切换过去后再执行会话 hydration
- 底部输入区改成悬浮 dock，消息区保持窄列居中

## Compatibility

- 没有服务端协议变更。
- `tabs://changed` 仍然是 tabs 实时同步入口。
- `conversation://changed` 仍然只负责标题/状态等摘要刷新。
- 现有热 runtime、详情持久化、断线恢复、权限/提问卡片逻辑继续复用。
- 当前版本没有把整套 runtime 状态完全多实例化；active 会话仍是唯一完整 hydration 会话，这是为了先保证协议正确和跨端同步正确。

## Native iOS/Android Replication

原生端复现时，建议保持同样的层次：

1. 顶层使用 `UICollectionView`/`RecyclerView` 风格的可滚动 capsule tabs。
2. 内容区使用分页容器（iOS `UIPageViewController` / Android `ViewPager2`）。
3. tabs 数据只来自远端 `opened_tabs` snapshot。
4. 页面切换时向远端写回 active tab。
5. 只预加载当前页和相邻页，其他页不要 eager mount。
6. `conversation://changed` 只刷新标题与摘要，不要修改 tabs membership。

视觉上保持：

- 双层顶部 chrome
- 半透明卡片 + blur
- 居中窄消息列
- 底部浮动输入 dock
