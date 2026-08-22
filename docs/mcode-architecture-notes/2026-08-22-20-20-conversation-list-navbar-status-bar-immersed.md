# 会话列表 navbar 延伸到 Android 状态栏

## 根因与架构变化

会话列表使用 `navigationStyle: "custom"` 和固定的 `up-navbar`。`up-navbar` 内部的 `u-status-bar` 只能在 WebView 内容坐标系内补安全区高度；如果 Android WebView 没有沉浸到系统状态栏下方，fixed navbar 的 `top: 0` 仍然从状态栏底部开始，导致 navbar 无法进入系统状态栏。

本次在 `mcode-app/src/manifest.json` 的 `app-plus.statusbar` 显式配置：

- `immersed: true`：让 Android WebView 内容延伸到系统状态栏区域；
- `background: "#00000000"`：系统状态栏透明，使 navbar 自身的玻璃材质连续绘制到状态栏；
- `style: "dark"`：状态栏图标使用深色，匹配当前浅色 navbar 视觉。

页面不再增加额外 `padding-top`。`up-navbar` 既有的 `safeAreaInsetTop` 和 `placeholder` 仍是唯一的内容避让来源：状态栏高度由组件内部占位，44px toolbar 位于其下方，普通内容从 placeholder 之后开始。

## UI 行为与兼容性

- Android 会话列表：navbar 背景覆盖系统状态栏和 44px toolbar，不出现顶部断层；搜索框仍位于 navbar 占位之后，并保留既有 16rpx 间距。
- Android 其他页面：沉浸式布局是 App 级配置；自定义顶部页面必须使用 `up-status-bar`、`up-navbar` 或等效 safe-area 处理，禁止再叠加同一状态栏高度。
- 非自定义原生导航页继续由 uni-app 的系统导航/页面安全区处理；若新增页面使用绝对定位顶部元素，应明确采用统一的 safe-area 方案。
- iOS 不复刻 Android 的 manifest 开关；iOS 页面继续使用系统 safe area 或现有自定义状态栏填充逻辑。
- H5 不受 `app-plus.statusbar` 影响，仍由 CSS `env(safe-area-inset-top)` 和浏览器布局决定。

## Native iOS / Android 复刻指导

Android 原生使用 edge-to-edge（等效 `WindowCompat.setDecorFitsSystemWindows(window, false)`），将 status bar color 设为透明，toolbar/玻璃容器从窗口顶部绘制，并仅在 toolbar 内容布局中消费一次 `WindowInsets.Type.statusBars()`。不要同时给页面根布局再加同一份 status bar padding。

iOS 原生保持 `UINavigationBar`/自定义 toolbar 的 safe-area 约束：背景材质可延伸到 safe area，但标题和按钮仅在 safe-area 之后的内容区域布局。iOS 状态栏颜色与导航栏材质保持一致。

协议、数据流、接口、存储结构和 Android 自动更新逻辑均未改变。
