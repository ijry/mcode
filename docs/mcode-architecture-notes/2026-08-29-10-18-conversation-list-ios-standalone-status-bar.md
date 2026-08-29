# 会话列表页 iOS standalone 状态栏色带

## 根因

iOS standalone（PWA 加桌面）下，`apple-mobile-web-app-status-bar-style` 只要不是
`black-translucent`，webview 的视口就**从状态栏下方开始**——状态栏那条带子不由页面绘制，而是
系统按 `html` / `body` 背景 + status bar style 画出来的。

`index.html` 启动时声明的是 `content="black"`，也就是纯黑带。会话详情页在
`syncDetailNativeStatusBar()` 里调 `syncIosStandaloneStatusBar()` 把它按主题改写，所以详情页
表现正确；**会话列表页从来没调过这个 service**（全仓此前只有详情页引用），色带就一直停在黑色，
玻璃 navbar 上方压着一条黑带——视觉上就是「顶部导航没有沉浸进状态栏」。

这不是布局问题。`up-navbar` 的 `u-status-bar` 占位、`__placeholder` 避让、
`manifest.json` 的 `app-plus.statusbar.immersed`（Android 侧，见
`2026-08-22-20-20-conversation-list-navbar-status-bar-immersed.md`）都已经就位，navbar 的
`top` 本来就在 webview 视口的 0 处；问题只在于视口上方那条系统色带的颜色。

## 架构变化

`mcode-app/src/services/iosStandaloneStatusBar.ts`

- `IosStandaloneStatusBarOptions.cyberModeEnabled` 改名为 `darkStatusBarBand`。字段控制的是
  「深色色带 + 浅色图标」这个视觉，不是某个页面主题；详情页的 matrix 主题和列表页的深色主题都
  会打开它。逻辑未变。

`mcode-app/src/pages/conversations/index.vue`

- 新增 `syncConversationListNativeStatusBar()`，在 `onShow` 里调用。挂 `onShow` 而不是
  `onMounted`：主题在「我的」页切换后回到列表只会触发 `onShow`。
- `<script setup>` 里新增 `getCurrentInstance()` + `upThemeVar()` 包装。`upThemeVar` 是 uview
  用 Options API mixin 注入的方法，只有模板作用域能直接调，`<script setup>` 必须经 proxy 取。
  写法与 `pages/conversation-detail/index.vue` 一致。

模板、样式、`index.html`、`manifest.json` 均未改动。

## 色值口径

色带底色取 `--up-card-bg-color`（浅色 `#ffffff` / 深色 `#1c1c1e`），不取 `--up-page-bg-color`。
理由是色带紧贴 navbar 上沿，要跟 **navbar 表面**同色才没有接缝：navbar 玻璃层是
`rgba(255,255,255,.82)`（深色 `rgba(28,28,30,.82)`）叠在页面顶部渐变上，合成结果比页面底色更接近
卡片色。渲染实测浅色主题下色带与 navbar 顶沿像素完全相同。

两个入参给同一个值是刻意的：色带、`theme-color`、`html`/`body` 背景在这一页都应该是 navbar
表面色。`body` 背景平时被 `.conversations-page` 的渐变盖住，只在橡皮筋回弹时露出。

**必须传 6 位十六进制实色。** service 的 `normalizeHexColor` 只接受 `/^#[0-9a-f]{6}$/i`，
`var(...)` 和 `rgba(...)` 会被判非法后回退成 `#000000` —— 那正是要修的黑带。navbar 玻璃色
`--up-navbar-glass-bg-color` 由 u-navbar 组件的 CSS 定义、**不在 uview 的 JS 主题表里**，
`upThemeVar()` 取不到，因此不能作为这里的取值来源（CSS 层求值仍然有效，navbar 组件自己继续用）。

## 刻意不做的事

- **不翻 `black-translucent`。** 现有页面都各自消费过一次 safe-area，full-bleed 模式会把上下
  inset 重复计算一遍。同一结论见 `2026-07-05-p63-detail-cyber-mode.md`。
- **不给列表页加状态栏填充层。** 详情页的 `.detail-statusbar-fill` 解决的是另一个问题（不透明
  navbar 需要一层同色 fixed 背景），列表页要的正是背景光斑透上来的玻璃效果。
- **不染 `.u-navbar__placeholder`。** 它是 `u-navbar--fixed` 之外的独立兄弟节点，决定内容避让
  高度；染色会让顶部出现「占位块 + fixed 层」双层色带。原有的 `transparent` 护栏保留。

## UI 行为

- 浅色主题：状态栏色带 `#ffffff`，与 navbar 玻璃表面连续，图标黑色。
- 深色主题：`darkStatusBarBand = true` → `style="black"` + 白色图标。iOS 在这个模式下**强制纯黑
  带**，无法指定颜色，所以色带（`#000000`）与 navbar 合成色（约 `#1c1c20`）仍有轻微差异。这是
  standalone 只暴露粗粒度模式导致的取舍：换成 `default` 能让色带跟 `html` 背景一致，但图标会变
  黑色压在深底上不可读，可读性优先。
- 非 standalone 的浏览器：只同步 `theme-color`，其余 early return，行为不变。
- App-Plus / Android：额外调 `uni.setNavigationBarColor` 与 `plus.navigator.setStatusBarStyle`，
  口径与详情页 `syncDetailNativeStatusBar()` 一致。Android 沉浸式仍由 manifest 开关负责。

## 兼容性

- 详情页的调用点同步改用新字段名，行为等价。
- 未新增 `--mcode-*` 主题别名；`--up-card-bg-color` 是 uview 运行时主题表里现成的键。
- `--up-card-bg-color` 缺键时 fallback 也是 6 位实色（`#ffffff` / `#1c1c1e`），不会落到 service
  的黑色兜底。

## 验证

- `pnpm test:unit`：146 suites / 1114 tests 全绿（新增 2 个 suite、11 个 case）。
  - `tests/services/iosStandaloneStatusBar.spec.ts` 是行为测试（jsdom），覆盖 standalone 检测、
    `theme-color` 在 early return 之前同步、深/浅色色带、非法色值回退。
  - `tests/pages/conversations/conversationListIosStandaloneStatusBar.spec.ts` 是源码契约测试。
- Chromium 渲染实测（375×720 @dpr3，状态栏高 47px 替身，webview 放在 iframe 里以复现「fixed 元素
  漏不到系统色带上」）：修复前色带与 navbar 顶沿像素距离 442（纯黑对纯白），修复后 0。
- **iOS 真机 standalone 未验证。** 以上测量全部在 Chromium/H5 环境，App-Plus 原生端同样未验证。

## 原生 iOS / Android 复刻指引

iOS 原生不存在这个问题：`UIStatusBarStyle` 只管图标明暗，状态栏背后就是窗口内容。复刻做法是让
navbar 的材质层（`UIVisualEffectView` 或自绘玻璃）延伸到 safe area 顶部，标题和按钮仍约束在
safe area 之内，并按主题返回 `.darkContent` / `.lightContent`。不要为状态栏单独铺一层纯色。

Android 原生用 edge-to-edge：状态栏透明，玻璃容器从窗口顶部绘制，仅在 toolbar 内容布局中消费
一次 `WindowInsets.Type.statusBars()`，并按主题设置 `isAppearanceLightStatusBars`。

协议、数据流、接口、存储结构均未改变。
