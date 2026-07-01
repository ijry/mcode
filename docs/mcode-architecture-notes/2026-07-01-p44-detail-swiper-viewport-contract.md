# 2026-07-01 P44 Detail Multi-Tab Swiper Viewport Contract

## Architecture

本 note 记录 P44：会话详情页多会话 tabs / swiper / 独立交互 pane 改造中的视口与常驻实例约束。

`conversation-detail` 的多会话内容区使用 uni `swiper` 承载单会话详情 body。H5 下 `swiper-item` 会按 `swiper` 自身高度裁剪内容，所以 shell 必须给主 `swiper` 提供稳定视口高度。

## Protocol And Data Flow

本次没有协议变更。`opened_tabs`、`tabs://changed`、`conversation://changed` 的数据流保持不变。

## UI Behavior

详情页主 `swiper` 现在显式占满 `100vh`，每个 `swiper-item` 和页容器也至少为 `100vh`。这样加载提示结束后，即使消息列表、toolbar、composer 都依赖 fixed 定位和异步量测，也不会被高度为 0 的 `swiper` 裁掉。

tabs 条和 toolbar 的首屏高度也提供默认值，真实 DOM 量测完成后再覆盖，避免 toolbar 在第一帧压到 tabs 条下方。

当前会话正文采用“访问后常驻”的懒挂载策略：首次进入或切到某个 tab 时按 `conversationId` 记录为已挂载，之后即使离开当前页也不再因为 swiper 窗口变化卸载，直到该 tab 被关闭或远端 `opened_tabs` 移除。这样 tabs 点击、手势切页和 PC 端同步来回切换时，已加载过的 `swiper-item` 保持 DOM 状态，不再重复创建详情 body。

`up-tabs` 的 `change` 事件在不同端可能返回 index、current、name 或 item 对象。详情页统一用 tab payload resolver 从 index、`conversation_id` 或 tab id 中解析目标页，并在 tabs 当前值与 swiper 当前值漂移时强制重新对齐，避免同一个 active index 被提前 return 后第二次切换没有反应。

多会话 `swiper` 中不能让每个 `swiper-item` 直接复用父页的全局 `conversationId`、`messages`、`session` 计算结果，否则所有页面都会显示当前激活会话。每个已打开的 tab 都渲染独立的 `ConversationDetailInteractivePane`，pane 只通过自己的 `conversationId` 从 runtime store 读取时间线、状态、pending permission/question 和统计信息，避免多页内容串台。

除了消息时间线，详情页本地交互状态也需要按 `conversationId` 隔离保存和恢复，包括输入框文本、附件、待发送队列、工具栏/面板展开态、问题卡本地选择态、滚动位置、未读标记和历史分页游标。否则即使消息内容正确，不同 tab 来回切换时也会继续互相污染输入和阅读上下文。

已打开的 tab 会立即加入 mounted 集合，并在后台确保对应 `conversationId` 的 runtime session 已本地 hydrate 并建立 realtime 连接。非激活页的交互实例也直接订阅对应 runtime timeline、status、pending permission/question 和 stats，因此即使用户停留在其他 tab，该页也会持续接收新消息；重新激活时看到的是 runtime store 中的最新状态，而不是重新加载后的旧快照。

每个 `ConversationDetailInteractivePane` 自己维护输入框、附件/上传队列、工具栏展开、问题选择、授权提交、停止按钮和发送中的局部状态。父页只负责 navbar、tabs、swiper 当前页、PC opened-tabs 同步、上传目标解析和关闭 tab；切换 tab 不再通过重建父页全局消息状态来驱动内容刷新。

因为多个 `swiper-item` 会同时常驻 DOM，父页量测底部输入区高度时必须限定在 `.detail-shell__page--active` 下查询 `.input-status-row`、`.input-main-row`、`.input-tool-row` 和 `.message-list__content`。否则会量到非当前页的折叠/展开状态，导致消息区高度和底部悬浮输入区错位。

当前激活 tab 只在本地设备内维护，不再跨客户端同步。多端仍然共享 opened tabs 的打开、关闭和顺序，但远端 `is_active` 回流不会再打断本机正在输入、授权或滑动中的详情页上下文。

DOM 量测只有在拿到正值时才覆盖 tabs 和 toolbar 高度；如果首帧或切页瞬间查询失败，则继续沿用上一次有效高度，确保消息区 `minHeight` 和 fixed chrome 偏移不会被重置成 0。

顶部 tabs 继续使用 `up-tabs` 承载交互状态，但内容插槽渲染自定义胶囊 pill：包含状态点、标题截断和可点击关闭按钮。外层 tabs 条保持居中卡片容器，容器 padding 为 `0rem 0.375rem`，但不再显式写死 `width`；同时覆盖 `u-tabs--shape-capsule` 的 `scroll-view-wrapper` 胶囊底色为透明，关闭、切换、PC 端同步和 swiper 手势切换协议不变。

消息区样式在首帧就使用保守 chrome 预留：navbar + tabs 默认高度 + toolbar 默认高度 + composer 默认高度。真实量测完成后再用 DOM rect 覆盖这些默认值，避免空状态或消息正文先贴到页面顶部，被 fixed tabs/toolbar 遮住而看起来像空白。

`measureMessageListHeight()` 必须使用 `setup` 阶段缓存的组件实例执行 `uni.createSelectorQuery().in(instance)`。不能在异步回调、事件或 `nextTick` 后重新调用 `getCurrentInstance()`，因为此时 Vue 当前实例可能为空，会让量测函数静默 return，导致消息区 padding 永远不生效。

`ConversationDetailBody` 是独立 SFC，消息列表和底部输入区的结构样式必须由该组件自己声明。父页 `index.vue` 的 scoped SCSS 不会穿透到子组件根节点以下，不能依赖父页样式来设置 `.message-list` 或 `.input-wrap` 的 `fixed`/宽度/高度布局。

消息内容容器 `.message-list__content` 不能再用 `justify-content: flex-end` 把正文整体压到底部。详情页现在有 fixed tabs、toolbar、composer 和独立 loading / pending / empty state，这种“聊天贴底”布局会在正文较少时制造一大块顶部空白，看起来像消息没渲染。正文流应默认从顶部开始排布，滚动跟随交给滚动定位逻辑处理，而不是依赖 flex 底部对齐。

消息滚动区本身应延伸到详情页底部，只扣除顶部 chrome 高度；底部输入区的“悬浮占位”通过给 `.message-list__content` 增加与 `input-wrap` 实测高度一致的 `padding-bottom` 实现，而不是直接把滚动区高度再减掉 composer 高度，也不是把 padding 挂在 uni `scroll-view` 外层。这样最后一条消息可以滚到输入区上方，同时视觉上保留输入区悬浮覆盖正文的效果。

顶部工具栏不再单独渲染；运行状态和计划进度改为独立悬浮状态条，位置在 `input-wrap` 上方而不再并入同一白底容器，停止会话按钮放在底部工具栏最右侧。底部工具栏默认折叠，通过输入框左侧 `+` 按钮展开；打开快捷回复/配置面板时会自动展开，收起工具栏时同步关闭面板。详情页顶部 chrome 高度只包含 navbar、tabs、历史状态等固定顶部元素，底部 composer 的实测高度需要包含状态条、输入行、工具行和安全占位。

从会话列表、项目会话列表等入口跳转到详情页时，路由只传 `connectionId`。详情页的多 tabs、`opened_tabs` 同步和远端详情加载依赖目标连接的完整上下文，但上下文应由详情页通过 `connectionId` 从本地连接表恢复；如果只查某一种存储格式，页面会退回默认实例，导致 `list_opened_tabs`、`get_folder_conversation` 等请求打到错误主机。

## Compatibility

- H5：避免 `swiper` 默认高度不足导致详情内容空白。
- App/小程序：显式高度保持页面切换手势稳定，不改变现有数据加载。
- 原有消息列表高度仍由 `measureMessageListHeight()` 动态计算。
- 首帧 fallback 只影响布局预留，不改变消息、tabs、连接或输入协议；测量成功后会自动切换为真实高度。
- 懒加载不再按“当前页和相邻页”持续裁剪；已访问页会按 `conversationId` 常驻，关闭 tab 或远端移除 tab 时才清理。未访问页仍不会提前创建详情 body。
- 组件拆分后要避免把子组件内部布局样式留在父组件 scoped 样式中；原生端复制时也应把消息列表容器和输入容器视为详情 body 组件的私有布局职责。

## Native iOS/Android Replication

原生端使用分页容器时，page controller/view pager 的每一页必须继承父视口高度。不要让消息详情 body 依赖内容自撑开分页容器，否则首屏加载阶段会出现空页或输入区不可见。

原生端也需要在第一次 layout pass 前预留顶部 tabs/toolbar 和底部输入区高度，并在实际控件完成测量后替换为真实值；不要依赖异步阶段的“当前组件实例”查询来驱动首次布局。

