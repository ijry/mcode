# 会话列表搜索框与导航间距

## 需求

会话列表页中，搜索框不能紧贴顶部导航栏，需要保留稳定的视觉留白。

## 架构与数据流

本次仅调整 `mcode-app/src/pages/conversations/index.vue` 的呈现层样式，不涉及 API、relay、gateway、ACP、xycloud、SQLite schema 或数据流。页面继续由 `up-navbar` 提供状态栏/导航栏及 `placeholder` 占位，搜索框仍作为导航栏之后的普通内容节点，并随概览列表滚动；历史模式的 fixed/flex 高度链路不变。

`.conversations-searchbar` 增加 `margin-top: 16rpx`，与既有 `margin-bottom: 28rpx` 一起形成搜索框上下间距。该间距作用于整个搜索框容器，不修改 `up-search` 高度、输入行为或筛选逻辑。

## UI 行为与兼容性

- 概览模式：导航栏占位结束后，搜索框顶部保留 16rpx 空白，避免视觉贴边。
- 历史模式：搜索框仍位于导航栏下方并参与顶部内容流；返回/新建、列表滚动和底部 tabbar 布局不变。
- 使用普通 CSS 间距，不新增主题变量，不影响浅色/深色主题及不支持 backdrop-filter 的降级样式。
- 不需要数据迁移或接口兼容处理；既有原生客户端可保持原有业务协议。

## Native iOS / Android 复刻指导

iOS 在导航栏（含安全区）下方给搜索容器增加 16pt 的 top spacing，搜索框自身高度保持 40pt；Android 在 toolbar 的 bottom constraint 或内容容器 padding 中保留等效 16dp 间距。搜索框仍属于列表内容区，不做吸顶，滚动和筛选行为保持不变。
