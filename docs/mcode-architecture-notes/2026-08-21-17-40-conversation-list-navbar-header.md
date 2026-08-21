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

### 4. `.history-scroll` 写死的高度预算会留下空白

**这条 spec 未覆盖，是审计源码时发现的。** 原来写的是：

```scss
height: calc(100vh - 390rpx - env(safe-area-inset-bottom));
```

那 390rpx 是按**旧的三层顶部**估的。删掉大标题行和模式栏之后，这个预算会多扣约 190rpx，
历史列表底部凭空空出一块 —— 恰好抵消掉这次改造省下的高度。

改成交给 flex 链算（`.conversations-shell` → `.main-wrap--history` → `.history-list`
三层本来就都是 `flex: 1; min-height: 0`，链是通的）：

```scss
.history-scroll {
  flex: 1;
  min-height: 0;
}
```

### 5. 长标题不会挤压右侧按钮，而是滑到它底下

`.u-navbar__content__left` / `__right` 都是 `position: absolute`，脱离了 flex 流。
所以长组名不会把右侧按钮顶出可视区，而是**滑到按钮下面重叠**。
`.conversations-navbar__title` 的 `max-width: 420rpx` 是为了防这种重叠，不是防挤压 ——
`u-line-1` 只做 `nowrap` + `ellipsis`，本身不给宽度，没有 `max-width` 就不会截断。

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

**已验证**（H5 + Playwright，390×844 @2x，实测数值）：

| 项 | 结果 |
|---|---|
| navbar 高度 | `.u-navbar__content` = 44px；`.conversations-searchbar` 起于 `y: 44` —— 无缝隙无重叠 |
| 玻璃（浅色） | `color(srgb 1 1 1 / 0.55)` + `blur(15.6px)`（30rpx @390px） |
| 玻璃（深色） | `color(srgb 0.1098 0.1098 0.1176 / 0.55)`，即 `#1c1c1e` 55% |
| `__placeholder` 背景 | `rgba(0, 0, 0, 0)` —— 未被染色，无双层色带 |
| 概览模式左侧 | `leftIcon` 图标数 = 0，但点击区实测 26×44 且可点 |
| 左键守卫 | 点左侧空白后 `.history-list` 仍为 0、标题仍是「会话」—— 守卫生效 |
| 标题（深色） | `rgb(245, 245, 245)` on `#1c1c1e`，对比度约 15:1（远超 WCAG AA） |
| 控制台 | 无 error、无 pageerror |

**未验证（需真实 CodeG 连接，H5 环境显示「请先添加连接」）：**

1. **历史模式**：左箭头出现 / 标题换组名 / 右侧换「新建」/ 长组名截断；
   以及上文第 4 点的高度修复在视觉上是否真的消除了底部空白。
2. **选择态回归点**：进历史模式时 `showSelectionEntry` 变化会连带触发
   `exitSelectionMode()`（`index.vue` 的 watch）。需确认选择态被自动清掉、
   navbar 右侧从「取消」正确变回「新建」而非残留。
3. **下拉刷新**：本页是 `enablePullDownRefresh: true` 的 custom nav 页。fixed navbar 不参与
   页面滚动，系统刷新圈从页面顶部下来，会从 navbar 玻璃层底下钻出。
   **若刷新圈被完全遮住**，退路是给 `.conversations-navbar-shell :deep(.u-navbar--fixed)`
   加 `z-index: 9`（低于 `u-navbar--fixed` 默认的 `11`）。本页 `.bulk-action-bar` 用的是
   `z-index: 30`，下调 navbar 不影响它。

源码契约测试见 `mcode-app/tests/pages/conversations/conversationListNavbarHeader.spec.ts`（8 例）。
注意这类测试只断言源码字符串，**证明不了视觉与手势** —— 上面那三条只能靠实机。

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
