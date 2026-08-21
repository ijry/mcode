# 会话列表页顶部改用 up-navbar

需求：优化会话列表页顶部，压缩占高，给会话卡片列表腾出首屏空间。

设计稿：`docs/superpowers/specs/2026-08-21-conversation-list-navbar-header-design.md`
实施计划：`docs/superpowers/plans/2026-08-21-conversation-list-navbar-header.md`

## 改动范围

纯呈现层。不涉及 API / relay / gateway / ACP / xycloud 协议，不涉及 SQLite schema 或数据迁移，
`pages.json` 未改（该页本就是 `navigationStyle: "custom"` + `enablePullDownRefresh: true`）。
会话加载、实时推送、live preview、批量发送逻辑一行未动。

唯一改动文件：`mcode-app/src/pages/conversations/index.vue`。

## 结构

改造前顶部是三层，全部包在 `up-sticky` 里：

```
up-sticky（z-index 20，padding-top 40rpx）
  up-status-bar
  .conversations-header       ← 68rpx/800 大标题「会话」+ 选择 + ＋
  .conversations-searchbar
（历史模式下额外一层）
  .history-mode-bar           ← 返回分组 / 组名 / 新建
```

改造后：

```
.conversations-shell
  up-navbar（fixed，44px，placeholder 占位）
    #center  「会话」/ 历史模式下为 historyGroupTitle
    #right   选择 + ＋ / 历史模式下为「新建」
    left     概览模式 leftIcon=''；历史模式 arrow-left
  .conversations-searchbar    ← 不再 sticky，跟列表一起滚走
```

概览模式省掉大标题那一行（约 90rpx），历史模式再省掉模式栏（约 100rpx）。
滚动后顶部常驻高度只剩 44px。

`up-navbar` 的 `safeAreaInsetTop` 默认 `true`、内部自带 `u-status-bar`，所以原来手写的
`<up-status-bar>` 随 `up-sticky` 一起删除，不需要另外补状态栏占位。

## UI 行为

两种形态的差异全部靠既有的 `showHistoryPanel` 在模板里切，**未新增任何响应式状态**。

| 槽位 | 概览模式 | 历史模式 |
|---|---|---|
| left | 不渲染图标（`leftIcon=''`） | `arrow-left` → `closeHistoryPanel()` |
| center | 文本「会话」 | `historyGroupTitle`，`u-line-1` 截断 |
| right | `showSelectionEntry` 为真时「选择/取消」→ `toggleSelectionMode()`；`!selectionMode` 时 `＋` → `createConversation()` | `canCreateInHistory` 为真时「新建」→ `createConversation()` |

`showSelectionEntry` 开头已有 `if (showHistoryPanel.value) return false`，历史模式下右侧天然
不出现「选择」，模板里无需再加条件。

## 踩过的坑

### 1. `leftIcon=''` 不等于左侧不可点

`up-navbar` 的 `.u-navbar__content__left` 是个**固定尺寸的点击区**（`padding: 0 13px` +
`position: absolute`），`leftIcon` 为空时它依然存在。实测宽高为 **26×44 px**，照样接收点击。

所以概览模式必须挡一道，否则点左上角空白会静默清掉一遍历史状态：

```ts
function handleNavbarLeftClick() {
  if (!showHistoryPanel.value) return
  closeHistoryPanel()
}
```

`autoBack` 也显式传了 `false`。默认值本就是 false，但这是 tab 页，一旦误开会 `navigateBack`
到上一个 tab —— 写出来当护栏。

### 2. `bgColor="transparent"` 不足以让 navbar 透明

`.u-navbar__content` 自带 `background-color: $u-bg-color`，`bgColor` 只覆盖 inline style，
容器层仍不透明。必须 `:deep()` 穿透（写法沿用 `pages/conversation-detail/index.scss:66-76`）：

```scss
.conversations-navbar-shell :deep(.u-navbar--fixed),
.conversations-navbar-shell :deep(.u-status-bar),
.conversations-navbar-shell :deep(.u-navbar__content) {
  background: color-mix(in srgb, var(--up-card-bg-color, #ffffff) 55%, transparent) !important;
  backdrop-filter: blur(30rpx);
  -webkit-backdrop-filter: blur(30rpx);
}
```

这里刻意**不**照搬会话详情页的不透明 `--up-card-bg-color`：
`2026-07-02-detail-navbar-status-bar-bg.md` 的诉求是「别让消息区透到状态图标后面」，
而本页要的正是背景光斑透上来。

### 3. `__placeholder` 不能跟着染色

`placeholder=true` 生成的占位块是 `u-navbar--fixed` 之外的**独立兄弟节点**
（见 `uview-plus/components/u-navbar/u-navbar.vue` 模板）。组件没给它背景，上面那条玻璃规则
也没选中它。但一旦它被误染上玻璃色，顶部会出现「占位块 + fixed 层」的双层色带。
所以显式钉死：

```scss
.conversations-navbar-shell :deep(.u-navbar__placeholder) {
  background: transparent !important;
}
```

### 4. `.history-scroll` 写死的高度预算会留下空白 —— 但删掉它更糟

**这条 spec 未覆盖，是审计源码时发现的。** 原来写的是：

```scss
height: calc(100vh - 390rpx - env(safe-area-inset-bottom));
```

那 390rpx 是按**旧的三层顶部**估的。删掉大标题行和模式栏之后，这个预算会多扣约 190rpx，
历史列表底部凭空空出一块 —— 恰好抵消掉这次改造省下的高度。

但**直接删掉它会更糟**：这个 `height` 不只是个估值，它是整条 flex 链上**唯一的确定高度**。
`.conversations-shell` 只有 `min-height: 100vh`（下界，不是上界），`flex: 1` 没有可解析的父高度
时会退化成内容高度 —— 实测 `scroll-view` 长到 **5715px**，自身滚动失效、列表钻到 tabbar 底下。

正确做法是把「确定高度」这件事交给历史模式的容器，且不再手写任何层高：

```scss
.conversations-shell--history {
  position: fixed;
  top: calc(var(--window-top, 0px) + 44px);
  bottom: 0;              /* 不减 --window-bottom：见下 */
  left: 0;
  right: 0;
  min-height: 0;
  padding: 0 32rpx;       /* fixed 脱流后要补回左右内边距 */
  overflow: hidden;
}
```

`bottom` 取 `0` 而不是 `--window-bottom`：H5 下 fixed 的包含块本就是**已扣掉 tabbar 的**可视区，
再减一次会在列表与 tabbar 之间留出一条 50px 空带（并把总高顶到 894 > 844、整页多滚 50px）。
这一步我连踩了三次（`max-height` → `100vh - tabbar` → `- 44px` 过扣），每次都是「修好一个测量值、
弄坏另一个」，最后靠逐层量 `getBoundingClientRect` 才定位准。

`.history-scroll` 本身只留 `flex: 1; min-height: 0`。

### 5. 长标题不会挤压右侧按钮，而是滑到它底下

`.u-navbar__content__left` / `__right` 都是 `position: absolute`，脱离了 flex 流。
所以长组名不会把右侧按钮顶出可视区，而是**滑到按钮下面重叠**。
`.conversations-navbar__title` 的 `max-width: 420rpx` 是为了防这种重叠，不是防挤压 ——
`u-line-1` 只做 `nowrap` + `ellipsis`，本身不给宽度，没有 `max-width` 就不会截断。

### 6. 状态栏必须和 navbar 同色，且这条只有真机能验

`up-navbar` 内部把状态栏渲染成
`<u-status-bar :bgColor="statusBarBgColor ? statusBarBgColor : navbarBgColor">`。
一开始给 `statusBarBgColor="transparent"` 想「靠 CSS 补玻璃」，真机上顶部就多出一条色差接缝。

**H5 验不出来**：`u-status-bar` 在 `statusBarHeight === 0` 时不写 `style.height`，改挂
`.u-safe-area-inset-top` 靠 `env(safe-area-inset-top)` 取高 —— 桌面浏览器下该值为 0，整条不可见。
要在浏览器里复现，得手动给它 `padding-top`：

```js
await page.addStyleTag({ content: '.u-status-bar.u-safe-area-inset-top{padding-top:44px !important}' })
```

补上高度后实测，状态栏与 navbar 的 `computedBg` 完全一致（浅色
`rgba(255,255,255,0.82)`、深色 `rgba(28,28,30,0.82)`），blur 同为 `15.6px`。

底色统一取 uview 运行时主题表里现成的 **`--up-navbar-glass-bg-color`** ——
它本就是为玻璃导航栏准备的、随主题翻转，比手写 `color-mix` 稳，也符合 AGENTS.md
「只用主题表里存在的变量」。CSS 与 prop 两处必须同源，否则又是一条接缝。

**prop 必须写成 CSS `var()` 字面量，不能在 script 里求值**：

```ts
const NAVBAR_GLASS_BG_COLOR = "var(--up-navbar-glass-bg-color, rgba(255, 255, 255, 0.82))"
```

第一版写的是 `computed(() => upThemeVar("--up-navbar-glass-bg-color", …))`，运行时抛
`ReferenceError: upThemeVar is not defined` —— 那是 uview 用 **Options API mixin** 注入的方法，
只有**模板作用域**能调，`<script setup>` 里没有。computed 里抛错的表现是 prop 静默变成空串，
于是 `u-navbar` 回退到 `navbarBgColor`（`transparent`），状态栏又透了。
详见 `2026-08-22-01-00-tab-badge-connected-map-reachability.md` 里那一节。

顺带纠正一个我一度写错的判断：**作者样式表里的 `!important` 压得住组件写的行内
`background-color`**（行内只在自身也带 `!important` 时才更强）。所以玻璃实际是那条 `:deep()`
规则在生效，prop 只是让行内值也保持玻璃色而非 `transparent`。

## 降级契约

`backdrop-filter` / `color-mix` 不支持或渲染异常时，**必须退到半透明卡片色 + 1rpx 浅边框，
文字始终可读**。这条是 `2026-06-28-conversations-liquid-glass.md` 立下的规矩，本次写成了真代码
而非仅文档约定：

```scss
@supports not (backdrop-filter: blur(1px)) {
  .conversations-navbar-shell :deep(.u-navbar__content) {
    background: var(--up-card-bg-color, #ffffff) !important;
    border-bottom: 1rpx solid var(--up-border-color, #dadbde);
  }
  .conversations-navbar-shell :deep(.u-status-bar) {
    background: var(--up-card-bg-color, #ffffff) !important;
  }
}
```

本页在 H5 Safari 上踩过 blur + fixed 的渲染问题
（`2026-07-17-conversation-list-live-preview-safari-stability.md`）：blur 层叠在 fixed 元素上时
有概率整层不渲染或闪白。降级分支就是给这种情况准备的。

## 验证状态

**已验证**（H5 + Playwright，390×844 @2x，接本地 CodeG 直连实例、真实 folder/会话数据）：

| 项 | 结果 |
|---|---|
| navbar 高度 | `.u-navbar__content` = 44px；搜索框起于 `y: 44` —— 无缝隙无重叠 |
| 玻璃（浅色） | `rgba(255, 255, 255, 0.82)` + `blur(15.6px)` |
| 玻璃（深色） | `rgba(28, 28, 30, 0.82)`，标题转 `rgb(245,245,245)`，对比度约 15:1 |
| 状态栏连续性 | 补上 `padding-top` 模拟真机高度后，状态栏与 navbar `computedBg` 完全一致，无接缝 |
| `__placeholder` 背景 | `rgba(0, 0, 0, 0)` —— 未被染色，无双层色带 |
| 概览模式左侧 | `leftIcon` 图标数 = 0，但点击区实测 **26×44 且可点** |
| 左键守卫 | 点左侧空白后 `.history-list` 仍为 0、标题仍是「会话」—— 守卫生效 |
| 选择态 | 点「选择」→ 右侧转「取消」、`.bulk-action-bar` 浮出、10 张卡出现勾选框 |
| 历史模式 navbar | 左箭头出现（图标数 1）、标题转组名「本地 CodeG」、右侧转「新建」、`＋` 消失 |
| 选择态回归点 | 带着选择态进历史模式 → `.bulk-action-bar` 消失、右侧正确变「新建」而非残留「取消」 |
| 旧模式栏 | `.history-mode-bar` 计数 0 —— 确已删除 |
| 历史列表滚动 | 内层 `.uni-scroll-view` `scrollHeight 5492 / clientHeight 698`，`scrollTop` 0 → 4794 可达底 |
| 历史列表底部 | 列表底边与 tabbar 顶边 `gap = 0` —— 无多余空白（Task 4 的目标） |
| 返回分组 | 点左箭头 → `.history-list` 消失、标题回「会话」、分组恢复 |
| 控制台 | 无 error、无 pageerror |
| 单元测试 | 连续 3 次全量 `npm run test:unit` 均 860/860 通过 |

**仍未验证：**

- **下拉刷新**：本页是 `enablePullDownRefresh: true` 的 custom nav 页。fixed navbar 不参与页面
  滚动，系统刷新圈从页面顶部下来，会从 navbar 玻璃层底下钻出。Playwright 触发不了 uni-app 的
  下拉手势，需真机确认刷新圈位置。
  **若被完全遮住**，退路是给 `.conversations-navbar-shell :deep(.u-navbar--fixed)` 加
  `z-index: 9`（低于 `u-navbar--fixed` 默认的 `11`）。本页 `.bulk-action-bar` 用 `z-index: 30`，
  下调 navbar 不影响它。
- **H5 Safari 的 blur + fixed**：降级分支（`@supports not`）只做了静态代码验证，
  未在真 Safari 上跑过。

源码契约测试见 `mcode-app/tests/pages/conversations/conversationListNavbarHeader.spec.ts`（9 例）。
注意这类测试只断言源码字符串，**证明不了视觉与手势** —— 上面那张表是靠 Playwright 量 DOM
几何 + 截图得到的，而状态栏那条连真机特性都得手动模拟才看得见。

### 复现验证环境

浏览器里造数据需要注意两点，否则会白跑：

1. **uni-app H5 的 storage 有包装**：`setStorageSync` 对非字符串值写的是
   `{"type":"object","data":...}`（见 `@dcloudio/uni-h5` 的 `setStorageSync` / `parseValue`）。
   直接 `localStorage.setItem(k, JSON.stringify(obj))` 的话 `getStorageSync` 反序列化不出来，
   `readStoredConnections()` 会因为 `Array.isArray(raw)` 为假而返回空数组 —— 页面一直显示
   「请先添加连接」。
2. **连接键格式**：`buildConnectionRecordKey` = `` `${targetAgent}::${routeMode}::${directBaseUrl}` ``，
   例如 `codeg::direct::http://127.0.0.1:3089`。`mcode_connected_map` 要用这个键。

另外首启的宠物选择弹层（pinia store id `pet`，`initialized` 为假时弹出）会拦截点击，
预置 `initialized: true` 即可跳过。

## native iOS / Android 复刻指引

**结构**：状态栏 + 44pt 导航栏做成**同一片连续玻璃**，下方内容用等高占位避免塌陷。
搜索框放在导航栏之下、随列表滚动，不做吸顶。

**iOS**：`UINavigationBar` + `UIBlurEffect(style: .systemThinMaterial)`；
`scrollEdgeAppearance` 与 `standardAppearance` 都要设，否则滚到顶时会掉回不透明。
标题用 `titleView` 承载 16pt/semibold 文本，配 `lineBreakMode = .byTruncatingTail` 与显式宽度上限。
两种形态：概览模式 `leftBarButtonItem = nil`（注意 iOS 下 nil 就是真的不可点，
不像 web 端还留着 26×44 的空点击区，所以**不需要**等价的守卫）；
历史模式设 `.arrow.backward` 并接返回。

**Android**：`MaterialToolbar` + `RenderEffect.createBlurEffect(...)`（API 31+），
低版本退到不透明 `?attr/colorSurface`。`navigationIcon` 在概览模式设 `null`。
标题用自定义 `TextView`（`maxLines=1`、`ellipsize=end`、`maxWidth`）。

**两端共同**：不支持模糊时一律退到不透明表面色 + 1dp 分隔线，保证文字对比度 ——
与上面的 web 降级契约一致。

**状态栏**：iOS / Android 都要让状态栏与导航栏共用同一片材质。这一条在 web 端是靠
`--up-navbar-glass-bg-color` 同时喂给 CSS 与 `statusBarBgColor` 实现的；native 上对应
iOS 的 `UINavigationBar` 默认已延伸到状态栏下（别额外加 `safeAreaInset` 背景），
Android 需 `WindowCompat.setDecorFitsSystemWindows(window, false)` +
`statusBarColor = Color.TRANSPARENT`，让 toolbar 的材质自己铺到状态栏。

**历史模式的高度**：native 上不要照搬 web 的 `position: fixed` —— 直接用
`UITableView` / `RecyclerView` 填充「导航栏下沿到 tabbar 上沿」的约束区间即可
（iOS 用 safeArea 约束，Android 用 `layout_constraintTop/Bottom`）。
web 端绕这一圈是因为 `flex: 1` 需要确定高度祖先，native 的约束系统没这个问题。
