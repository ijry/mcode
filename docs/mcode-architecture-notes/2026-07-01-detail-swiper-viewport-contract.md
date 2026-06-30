# 2026-07-01 Detail Swiper Viewport Contract

## Architecture

`conversation-detail` 的多会话内容区使用 uni `swiper` 承载单会话详情 body。H5 下 `swiper-item` 会按 `swiper` 自身高度裁剪内容，所以 shell 必须给主 `swiper` 提供稳定视口高度。

## Protocol And Data Flow

本次没有协议变更。`opened_tabs`、`tabs://changed`、`conversation://changed` 的数据流保持不变。

## UI Behavior

详情页主 `swiper` 现在显式占满 `100vh`，每个 `swiper-item` 和页容器也至少为 `100vh`。这样加载提示结束后，即使消息列表、toolbar、composer 都依赖 fixed 定位和异步量测，也不会被高度为 0 的 `swiper` 裁掉。

tabs 条和 toolbar 的首屏高度也提供默认值，真实 DOM 量测完成后再覆盖，避免 toolbar 在第一帧压到 tabs 条下方。

## Compatibility

- H5：避免 `swiper` 默认高度不足导致详情内容空白。
- App/小程序：显式高度保持页面切换手势稳定，不改变现有数据加载。
- 原有消息列表高度仍由 `measureMessageListHeight()` 动态计算。

## Native iOS/Android Replication

原生端使用分页容器时，page controller/view pager 的每一页必须继承父视口高度。不要让消息详情 body 依赖内容自撑开分页容器，否则首屏加载阶段会出现空页或输入区不可见。
