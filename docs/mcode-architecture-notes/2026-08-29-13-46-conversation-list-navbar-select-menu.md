# 会话列表页顶栏图标菜单与搜索行新建按钮

## 动机

会话列表页原本有三个入口散在两行里：顶栏右侧「选择」+「＋」，搜索行右侧「已完成」筛选胶囊。
顶栏右侧两个按钮挤在 `.u-navbar__content__right` 的 13px padding 里，搜索框又被胶囊压掉一截
宽度。现在把两个低频开关收进顶栏左侧的下拉菜单，把高频动作（新建会话）放到搜索行。

纯呈现层改动。不涉及 relay / gateway / ACP / xycloud 协议，不涉及 SQLite schema，
`pages.json` 不动。偏好存储（`mcode_hide_completed_conversations`）与批量选择逻辑一行未改。

## 结构变化

`mcode-app/src/pages/conversations/components/ConversationsNavbar.vue`

- 不再传 `leftIcon`，改为自己渲染 `#left` 槽（`up-navbar` 有 left 插槽时该 prop 不生效）。
  历史模式渲染 `arrow-left` 图标，概览模式渲染 `up-select`。
- `up-select` 的触发区是**纯图标**：`#text` 槽放 `more-dot-fill`（20px，`--up-main-color`），
  `#icon` 槽放一个 `display: none` 的占位 `<text>` 顶掉组件自带的 `arrow-down`。占位节点是
  必需的 —— Vue 的 `renderSlot` 在插槽内容为空（空 `<template>` 或只有注释）时会回落到默认
  内容，`<template #icon></template>` 关不掉那个箭头。
- `#center` 槽两种模式都渲染标题：概览模式是固定文案「会话」，历史模式是分组名
  （`{{ historyMode ? title : "会话" }}`，共用 `.conversations-navbar__title` 的 `u-line-1`）。
- 菜单项由 `menuOptions` computed 生成，两项：
  「隐藏/显示已完成会话」→ `emit("toggle-hide-completed")`；
  「选择会话/退出选择」→ `emit("toggle-selection")`。
- prop 变化：`canCreate` 删除（新建搬走），新增 `hideCompleted`。`historyMode` / `title` /
  `showSelectionEntry` / `selectionMode` 不变。
- `#right` 槽整块删除，顶栏现在只有 left + center。

`mcode-app/src/pages/conversations/components/ConversationsSearchBar.vue`

- 「已完成」筛选胶囊（`.conversations-filter-chip`）删除，换成 `.conversations-create-button`
  圆钮（64rpx 见方，与搜索框同高、同款玻璃质感），点击 `emit("create")`。
- prop 变化：`hideCompleted` 换成 `canCreate`；事件 `toggle-hide-completed` 换成 `create`。
- 搜索行整体压矮：`up-search` 的 `:height="32"`（组件这个 prop 单位是 px，默认 64），CSS 侧
  `.u-search__content` / `.u-search__content__input` / `.conversations-create-button` 三处统一
  `64rpx`（750rpx 设计稿下 1px = 2rpx，与 32px 对齐）。四个值必须一起改，否则输入框与圆钮
  错高。`.conversations-searchbar` 的 `margin-top: 16rpx` / `margin-bottom: 28rpx` 不变。

`mcode-app/src/pages/conversations/index.vue`

- `canCreateInHistory` 改名 `canCreateConversation`，判据从「历史模式且有分组键」扩成三条：
  选择模式一律 false（继承原顶栏 `v-if="!selectionMode"`），历史模式要求 `historyGroupKey`
  非空（原判据），概览模式恒 true。
- 接线换位：`toggle-hide-completed` 从搜索行接到顶栏，`create` 从顶栏接到搜索行。

## 交互约定

概览模式：顶栏左侧是 `more-dot-fill` 图标按钮，点开下拉（已完成筛选 + 选择会话）；中间是固定
标题「会话」；搜索行右侧是 `＋`（选择模式下隐藏）。

历史模式：顶栏左侧是 `arrow-left` → `closeHistoryPanel()`，中间是 `historyGroupTitle`
（`u-line-1` 截断），搜索行右侧的 `＋` 还需 `historyGroupKey` 非空。

菜单项文案说的是「点下去会发生什么」，不是当前状态。原因是没给 `up-select` 绑 `current`，
菜单每次打开都无选中项、没有勾选态可显示；写成状态描述（「已隐藏已完成」）用户读不出这是
开关还是标签。

「选择会话」在 `showSelectionEntry || selectionMode` 时出现。后半条是必需的：已经进入选择
模式后，若筛选把所有可选卡片藏掉，`showSelectionEntry` 会变 false，用户就失去退出选择的入口
（底部批量操作条只有「批量发送」）。

## up-select 在 navbar 里的两处样式适配

`up-select` 的面板定位是 `top: calc(100% + 4px)`，`100%` 指触发区高度。触发区若只有图标高度
（约 20px，在 44px 的 navbar 里垂直居中），面板会从 navbar 中部往下弹、压住 navbar 下沿。所以
把 `.conversations-navbar__menu` 及其内部的 `.u-select__content` / `.u-select__label` 都拉到
`height: 100%` —— `.u-navbar__content__left` 是 `top:0/bottom:0` 的绝对定位块，这个百分比能
解析出确定值。

`.u-select__options__wrap` 自带 `margin-bottom: 46px`（为组件原本的表单场景留位），在 navbar 里
会在面板下方撑出一段不可见的可点区域，显式清零。

面板底色与边框沿用组件自己读的 `--up-card-bg-color` / `--up-border-color`（随主题翻转），本页
只补 20rpx 圆角与投影，让它与列表卡片同族。

## 原生端复刻要点

- 顶部栏高度 44pt（不含状态栏），沉浸式，玻璃底色为主题卡片色 82% 透明 + 30rpx 模糊。
- 概览模式左上角是一个「更多」图标按钮（三点，iOS `ellipsis`、Android `ic_more_horiz`），
  弹出菜单锚定在按钮下方 4pt、宽约 160pt，两项，文案按当前状态翻转。iOS 用 `UIMenu` 挂在
  `UIBarButtonItem`，Android 用 `PopupMenu` 锚在该图标上。
- 标题「会话」居中显示（历史模式换成分组名，单行截断）。
- 菜单第二项的可见性：有可选中会话卡，或当前已在选择模式。
- 新建入口是搜索框右侧的圆形按钮，直径与搜索框等高（32pt），选择模式下隐藏；历史列表模式下
  若无当前连接分组也隐藏。搜索框高度 32pt、圆角全圆。
- 「已完成筛选」偏好键 `mcode_hide_completed_conversations`，默认 true（隐藏），只有严格
  `false` 算关闭；切换后要重新对账实时预览订阅（可见卡集合变了）。

## 验证

- `npx jest --config jest.config.cjs --runInBand` 全绿。契约断言更新在
  `tests/pages/conversations/conversationListNavbarHeader.spec.ts`：菜单归属、菜单文案、加号
  按钮搬迁、筛选胶囊已移除，外加「概览标题在 center 槽」与「搜索行高度四处一致」两组，以及
  「左侧触发区不得再出现 `conversations-navbar__menu-label`」的反向断言。
- `npx uni build` 通过。
- `vue-tsc` 的三条 conversations 报错（`ConversationsSearchBar.vue` 的 `value` 隐式 any、
  `index.vue` 的 `stopCreateProgressTimer` 与 `group.connection`）在改动前就存在，已用
  `git stash` 对照确认，与本次无关。
