# 会话列表页顶部改用 up-navbar

## 目标

压缩 `mcode-app/src/pages/conversations/index.vue` 顶部占高，给会话卡片列表腾出首屏空间。

当前顶部是三层结构：状态栏 + 68rpx 大标题「会话」→ 搜索框 → （历史模式下）`.history-mode-bar`。
改造后概览模式省掉大标题行（约 90rpx），历史模式再省掉模式栏（约 100rpx）。

这是纯呈现层改动。不涉及 API / relay / gateway / ACP / xycloud 协议，不涉及 SQLite schema 或数据迁移，
`pages.json` 不改（该页已是 `navigationStyle: custom` + `enablePullDownRefresh: true`）。
所有会话加载、实时推送、live preview、批量发送逻辑一行不动。

## 实现方式

页面内联，不抽子组件。`up-navbar` 与样式直接写在 `pages/conversations/index.vue` 内。

## 结构

`index.vue:10-48` 的 `up-sticky` 整块拆成两部分。

### 1. up-navbar（fixed，44px）

移出 `up-sticky`，作为 `.conversations-shell` 的第一个子元素：

```
<up-navbar
  :fixed="true"
  :placeholder="true"
  :border="false"
  height="44px"
  :autoBack="false"
  :leftIcon="showHistoryPanel ? 'arrow-left' : ''"
  bgColor="transparent"
  statusBarBgColor="transparent"
  customClass="conversations-navbar-shell"
  @leftClick="handleNavbarLeftClick"
>
  <template #center> 「会话」/ 历史模式下是 historyGroupTitle </template>
  <template #right>  选择 / ＋ ，历史模式下是「新建」 </template>
</up-navbar>
```

- `placeholder=true` 生成等高占位块，避免 fixed 后内容塌到 navbar 底下。
- 概览模式 `leftIcon=''` → 左侧不渲染图标（tab 页没有返回目标）；历史模式给 `arrow-left`。
- 两种形态的差异全部靠 `showHistoryPanel` 在模板里切，不新增任何状态。

### 2. 搜索框

`.conversations-searchbar` 留在 `.conversations-shell` 里，紧跟 navbar 占位之后，**不再包 sticky**，
跟列表一起滚走。滚动后顶部常驻高度只剩 44px。

### 删除项

- `up-sticky`、`up-status-bar` 两个组件包裹
- `.conversations-header` 及其 `__title` / `__actions` / `__select` / `__action` 样式
- `.history-mode-bar` 及其 `-back` / `-back__text` / `-title` / `-create` / `-create__text` 样式
- `.conversations-sticky` 及 `.conversations-sticky :deep(.u-sticky__content)`
  （其中 `padding-top: 40rpx` 是给大标题留的呼吸位，navbar 自带 44px 已足够）

## 交互接线

不新增逻辑，只换触发位置。

| 槽位 | 概览模式 | 历史模式 |
|---|---|---|
| left | 不渲染（`leftIcon=''`） | `arrow-left` → `closeHistoryPanel()` |
| center | 文本「会话」 | `historyGroupTitle`，`u-line-1` 截断 |
| right | `showSelectionEntry` 为真时显示「选择/取消」→ `toggleSelectionMode()`；`!selectionMode` 时显示 `＋` → `createConversation()` | `canCreateInHistory` 为真时显示「新建」→ `createConversation()` |

### 既有约束

- `showSelectionEntry`（`index.vue:911-916`）开头已有 `if (showHistoryPanel.value) return false`，
  历史模式下右侧天然不出现「选择」，无需额外加条件。
- `closeHistoryPanel()`（`index.vue:2720`）现成可用，清 `showHistoryPanel` / `historyGroupKey` /
  `historyGroupTitle` / `projects` 四个状态。
- `up-navbar` 的 `leftClick` 是**整个左侧区域**的点击事件，`leftIcon` 为空时该区域仍存在且可点。
  故新增 `handleNavbarLeftClick()`，首行守卫 `if (!showHistoryPanel.value) return`，
  否则概览模式点左上角空白会静默清一遍历史状态。
- `autoBack` 显式传 `false`。默认值本就是 false，但这是 tab 页，一旦误开会 `navigateBack`
  到上一个 tab，显式写出来当护栏。
- right 槽整块共用一个 `@rightClick`，而这里需要两个按钮分别响应，故**不使用 `rightClick`**，
  改为在槽内各 `view` 上自绑 `@click`（会话详情页同样如此）。
- `onPullDownRefresh` 中 `showHistoryPanel` 时 `stopPullDownRefresh` 早退的行为
  （`index.vue:1486-1496`）保持不动。

## 样式

### navbar 玻璃化

`up-navbar` 内部 `.u-navbar__content` 自带 `background-color: $u-bg-color`，
仅靠 `bgColor="transparent"` 只能覆盖 inline style，容器层仍不透明，因此需 `:deep()` 穿透。
写法仿会话详情页 `pages/conversation-detail/index.scss:66-76` 的既有做法，作用在 `customClass` 上：

```scss
.conversations-navbar-shell :deep(.u-navbar--fixed),
.conversations-navbar-shell :deep(.u-status-bar),
.conversations-navbar-shell :deep(.u-navbar__content) {
  background: color-mix(in srgb, var(--up-card-bg-color, #ffffff) 55%, transparent) !important;
  backdrop-filter: blur(30rpx);
  -webkit-backdrop-filter: blur(30rpx);
}

.conversations-navbar-shell :deep(.u-navbar__placeholder) {
  background: transparent !important;
}
```

`__placeholder` 是 `u-navbar--fixed` 之外的独立兄弟节点（见 `u-navbar.vue` 模板），
组件本身没给它背景，上面的玻璃规则也没选中它。这条显式的 `transparent` 是护栏：
一旦它被误染上玻璃色，页面顶部会出现「占位块 + fixed 层」的双层色带。

- 玻璃配方沿用本页 `.conversations-header__action` 已有的组合（`--up-card-bg-color` + `color-mix` + blur），
  不引入新的 `--mcode-*` 别名，符合 AGENTS.md 的主题变量约定。
- `statusBarBgColor="transparent"` 配合上面的 `.u-status-bar` 规则，使状态栏与 navbar 成为同一片连续玻璃。
- 这里刻意**不**照搬会话详情页的不透明 `--up-card-bg-color`：
  `docs/mcode-architecture-notes/2026-07-02-detail-navbar-status-bar-bg.md` 的诉求是
  「别让消息区透到状态图标后面」，而本页要的正是背景光斑透上来。

### 右侧按钮

`.conversations-header__select` / `.conversations-header__action` 两条样式保留，
改名为 `.conversations-navbar__select` / `.conversations-navbar__action`。
`__select` 的 `56rpx` 高度直接沿用；`__action` 从 `64rpx` 收到 `56rpx`，与 `__select` 对齐
（44px ≈ 88rpx 的 navbar 内需留出上下留白）。两者的圆角、玻璃背景、`:active` 缩放保持原样。

`.u-navbar__content__right` 自带 `padding: 0 13px`，故按钮组不再另加外边距，
仅用 `gap: 12rpx`（沿用原 `.conversations-header__actions` 的值）。

### 标题

navbar center 使用新的 `.conversations-navbar__title`：`32rpx` / 字重 `600` / `--up-main-color`。
历史模式加 `u-line-1` 与 `max-width`，防止长组名把右侧按钮挤出可视区。
原 68rpx / 800 的大标题样式一并删除。

### 搜索框

`.conversations-searchbar` 样式全部不动，仅其滚动行为改变（跟随列表滚走）。

## 兼容性

### 下拉刷新与 fixed navbar 叠加

本页是 `enablePullDownRefresh: true` 的 custom nav 页面（圈子 index / detail 同为此组合，可作参照）。
fixed navbar 不参与页面滚动，下拉时系统刷新圈从页面顶部下来，会从 navbar 玻璃层底下钻出。

需实机确认刷新圈的出现位置是否可接受。若被 navbar 完全遮住，退路是把 navbar 的 `z-index`
降到刷新圈之下（`u-navbar--fixed` 默认 `z-index: 11`）。

### backdrop-filter + fixed 在 H5 Safari

本页已踩过一次相关问题（`docs/mcode-architecture-notes/2026-07-17-conversation-list-live-preview-safari-stability.md`）。
blur 层叠在 fixed 元素上时，Safari 有概率整层不渲染或闪白。

**降级契约**：不支持或渲染异常时，必须退到半透明卡片色 + 1rpx 浅边框，文字始终可读。
这条同样是 `docs/mcode-architecture-notes/2026-06-28-conversations-liquid-glass.md` 立下的规矩。

### 深色模式

玻璃色跟随 `--up-card-bg-color`。`color-mix` / `backdrop-filter` 不支持时退回半透卡片色，仍然可读。

### selectionMode 回归点

`.bulk-action-bar` 在页面底部、与顶部无关，但 `showSelectionEntry` 变化会连带触发
`exitSelectionMode()`（`index.vue:995-1010` 的 watch）。本次改动只挪动「选择」按钮位置、
未碰该 watch，回归时需确认：进历史模式 → 选择态被自动清掉 → navbar 右侧从「取消」正确变回「新建」。

## 验证

`npm run dev:h5` 起服务后手测四条路径：

1. 概览模式顶部形态（标题、选择、＋、搜索框位置与玻璃质感）
2. 进出历史模式时 navbar 的切换（左箭头出现/消失、标题换组名、右侧换「新建」）
3. 选择态进出（含上述 selectionMode 回归点）
4. 下拉刷新（刷新圈位置、顶部无塌陷或抖动）

再切一次深色模式，检查玻璃层与文字对比度。

## 交付物

按 AGENTS.md 要求，补一篇架构笔记，路径为
`docs/mcode-architecture-notes/2026-08-21-<hh>-<mm>-conversation-list-navbar-header.md`
（`<hh>-<mm>` 在落地时以当时本地时间填入，如 `03-50`），
写清结构、UI 行为、降级契约与 native iOS/Android 复刻指引。
