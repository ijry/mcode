# 会话列表页顶部改用 up-navbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 本仓库 AGENTS.md 规定：执行 implementation plan 时**默认且仅使用 Inline Execution**，不要询问
> Subagent-Driven，也不要为此创建隔离 worktree。

**Goal:** 把 `mcode-app/src/pages/conversations/index.vue` 顶部的「大标题 + 搜索框 sticky」三层结构换成
fixed 的 `up-navbar`，概览模式省掉约 90rpx 大标题行，历史模式再省掉约 100rpx 的 `.history-mode-bar`。

**Architecture:** 纯呈现层改动，页面内联不抽子组件。`up-sticky` 整块拆开：navbar 提到
`.conversations-shell` 首位并 `fixed`，搜索框留在原处但不再 sticky（跟列表滚走）。navbar 的两种形态
（概览 / 历史）全靠既有的 `showHistoryPanel` 在模板里切，不新增任何响应式状态。唯一新增的脚本是
`handleNavbarLeftClick()` —— 因为 `up-navbar` 的左侧点击区在 `leftIcon` 为空时依然可点，需要一道守卫。

**Tech Stack:** Vue 3 Composition API + uni-app 模板、uview-plus（`up-navbar` / `up-search`）、SCSS
`:deep()` 穿透、Jest 源码契约测试（`jest --config jest.config.cjs`）。

## Global Constraints

- 不改 API / relay / gateway / ACP / xycloud 协议，不改 SQLite schema，不做数据迁移。
- 不改 `mcode-app/src/pages.json`（该页已是 `navigationStyle: "custom"` + `enablePullDownRefresh: true`）。
- 会话加载、实时推送、live preview、批量发送逻辑一行不动。
- 深色模式：色值只能作为 `var()` 的 fallback；不得新增 `--mcode-*` 颜色别名（AGENTS.md）。
- 绑定组件 props 时只用 uview 运行时主题表里存在的变量：`--up-card-bg-color`、`--up-main-color`、
  `--up-content-color`、`--up-tips-color`、`--up-border-color`、`--up-primary`、`--up-hover-bg-color`。
- 玻璃降级契约：`backdrop-filter` / `color-mix` 不支持或渲染异常时，必须退到半透明卡片色 +
  1rpx 浅边框，文字始终可读。
- 所有工作目录均为 `mcode-app/`（`npm run test:unit` 等命令都在该目录下执行）。

---

## File Structure

- Modify: `mcode-app/src/pages/conversations/index.vue`
  - 职责：顶部 navbar 的模板结构、`handleNavbarLeftClick()` 守卫、navbar / 按钮 / 标题样式，
    以及删除 `up-sticky`、`.conversations-header*`、`.history-mode-*` 三组遗留样式。
- Create: `mcode-app/tests/pages/conversations/conversationListNavbarHeader.spec.ts`
  - 职责：源码级契约，锁住 navbar 结构、左键守卫、玻璃 `:deep()` 规则、旧结构确已删除。
- Create: `docs/mcode-architecture-notes/2026-08-21-<hh>-<mm>-conversation-list-navbar-header.md`
  - 职责：AGENTS.md 要求的架构笔记，含降级契约与 native iOS/Android 复刻指引。

**为什么新建 spec 文件而不是追加到现有文件：** `tests/pages/conversations/` 下已有 9 个 spec，
每个锁一个关注点（`conversationLivePreviewLayout` 锁卡片布局、`detailNavigationContract` 锁跳转前建标签）。
顶部结构是新的独立关注点，单独成文件与既有划分一致。

---

### Task 1: 用契约测试锁住 navbar 顶部结构

先写测试。这批断言同时是「改造完成」的定义和防回归的护栏。

**Files:**
- Create: `mcode-app/tests/pages/conversations/conversationListNavbarHeader.spec.ts`

**Interfaces:**
- Consumes: 同目录既有 spec 的写法 —— `fs.readFileSync` 读 `.vue` 源码做字符串断言
  （见 `tests/pages/conversations/conversationLivePreviewLayout.spec.ts`）。这些是**源码契约测试**，
  不挂载组件，因为 jest `testEnvironment: 'node'` 且仓库没装 `@vue/test-utils`。
- Produces: 一个失败的 spec，要求 `index.vue` 满足 Task 2/3/4 的全部结构与样式约定。

- [ ] **Step 1: 写失败的测试**

新建 `mcode-app/tests/pages/conversations/conversationListNavbarHeader.spec.ts`：

```ts
import fs from "node:fs"
import path from "node:path"

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf8")
}

describe("conversation list navbar header contract", () => {
  it("renders the top bar through up-navbar instead of a sticky big title", () => {
    const source = read("../../../src/pages/conversations/index.vue")

    expect(source).toContain('customClass="conversations-navbar-shell"')
    expect(source).toContain(':fixed="true"')
    expect(source).toContain(':placeholder="true"')
    // tab 页没有返回目标；一旦误开 autoBack 会 navigateBack 到上一个 tab。
    expect(source).toContain(':autoBack="false"')
    expect(source).toContain('height="44px"')
    expect(source).toContain(`:leftIcon="showHistoryPanel ? 'arrow-left' : ''"`)
    expect(source).toContain('@leftClick="handleNavbarLeftClick"')
  })

  // 旧的三层顶部必须真的消失，否则「省高度」等于没做。
  it("drops the sticky big-title header and the history mode bar", () => {
    const source = read("../../../src/pages/conversations/index.vue")

    expect(source).not.toContain("up-sticky")
    expect(source).not.toContain("conversations-sticky")
    expect(source).not.toContain("conversations-header")
    expect(source).not.toContain("history-mode-bar")
    expect(source).not.toContain("history-mode-back")
    expect(source).not.toContain("history-mode-title")
    expect(source).not.toContain("history-mode-create")
  })

  // 概览模式 leftIcon 为空，但 .u-navbar__content__left 区域仍然存在且可点
  // （见 node_modules/uview-plus/components/u-navbar/u-navbar.vue 模板与 leftClick 方法）。
  // 少了这道守卫，点左上角空白会静默清掉一遍历史状态。
  it("guards the navbar left hit area outside history mode", () => {
    const source = read("../../../src/pages/conversations/index.vue")

    expect(source).toContain("function handleNavbarLeftClick() {")
    const block = source.slice(
      source.indexOf("function handleNavbarLeftClick() {"),
      source.indexOf("}", source.indexOf("function handleNavbarLeftClick() {")) + 1
    )
    expect(block).toContain("if (!showHistoryPanel.value) return")
    expect(block).toContain("closeHistoryPanel()")
  })

  it("keeps both right-slot buttons independently clickable", () => {
    const source = read("../../../src/pages/conversations/index.vue")

    // right 槽整块共用一个 @rightClick，两个按钮要分别响应，所以不能用它。
    expect(source).not.toContain("@rightClick")
    expect(source).toContain('class="conversations-navbar__select"')
    expect(source).toContain('@click="toggleSelectionMode"')
    expect(source).toContain('class="conversations-navbar__action"')
    expect(source).toContain('@click="createConversation()"')
  })

  it("switches the navbar into history mode without new reactive state", () => {
    const source = read("../../../src/pages/conversations/index.vue")

    expect(source).toContain('v-if="showHistoryPanel"')
    expect(source).toContain("{{ historyGroupTitle }}")
    expect(source).toContain('v-if="canCreateInHistory"')
  })

  // .u-navbar__content 自带 background-color: $u-bg-color，光靠 bgColor="transparent"
  // 只覆盖 inline style，容器层仍不透明，必须 :deep() 穿透。
  it("makes the navbar glassy through deep selectors", () => {
    const source = read("../../../src/pages/conversations/index.vue")

    expect(source).toContain(".conversations-navbar-shell :deep(.u-navbar__content)")
    expect(source).toContain(".conversations-navbar-shell :deep(.u-status-bar)")
    expect(source).toContain("backdrop-filter: blur(30rpx)")
    expect(source).toContain("-webkit-backdrop-filter: blur(30rpx)")
    expect(source).toContain('bgColor="transparent"')
    expect(source).toContain('statusBarBgColor="transparent"')
    // __placeholder 是 u-navbar--fixed 之外的独立兄弟节点，一旦被染上玻璃色
    // 顶部会出现「占位块 + fixed 层」双层色带。
    expect(source).toContain(".conversations-navbar-shell :deep(.u-navbar__placeholder)")
  })

  it("keeps theme colors as var() fallbacks only", () => {
    const source = read("../../../src/pages/conversations/index.vue")
    const navbarStyles = source.slice(source.indexOf(".conversations-navbar-shell"))

    expect(navbarStyles).toContain("var(--up-card-bg-color, #ffffff)")
    expect(source).toContain(".conversations-navbar__title")
    expect(source).toContain("color: var(--up-main-color, #191c1e);")
  })
})
```

- [ ] **Step 2: 运行测试，确认它失败**

```bash
cd mcode-app && npm run test:unit -- conversationListNavbarHeader
```

预期：FAIL。首个失败断言是
`expect(source).toContain('customClass="conversations-navbar-shell"')` —— 当前源码里没有这个类名。

- [ ] **Step 3: 提交测试**

```bash
git add mcode-app/tests/pages/conversations/conversationListNavbarHeader.spec.ts
git commit -m "test(app): 锁定会话列表 up-navbar 顶部契约"
```

---

### Task 2: 用 up-navbar 替换 sticky 顶部（模板）

**Files:**
- Modify: `mcode-app/src/pages/conversations/index.vue:9-48`（顶部结构）
- Modify: `mcode-app/src/pages/conversations/index.vue:224-239`（`.history-mode-bar`）

**Interfaces:**
- Consumes: 现成的 `showHistoryPanel`（`index.vue:731` 的 `ref`）、`historyGroupTitle`（`:733`）、
  `showSelectionEntry`（`:911` computed，开头已有 `if (showHistoryPanel.value) return false`）、
  `selectionMode`（`:862`）、`canCreateInHistory`（`:949` computed）、
  `toggleSelectionMode()`（`:2673`）、`createConversation(projectId?: number)`（`:2808`）、
  `closeHistoryPanel()`（`:2720`）、全局 `upThemeVar(varName, fallbackColor?)`
  （`src/shime-uni.d.ts:11` 声明的全局方法）。
- Produces: `handleNavbarLeftClick()`，无参无返回值，供模板 `@leftClick` 使用。

- [ ] **Step 1: 用 navbar 替换 up-sticky 整块**

把 `index.vue:9-48`（从 `<view class="conversations-shell">` 到 `</up-sticky>`）替换为：

```html
    <view class="conversations-shell">
      <up-navbar
        customClass="conversations-navbar-shell"
        :fixed="true"
        :placeholder="true"
        :border="false"
        :autoBack="false"
        height="44px"
        :leftIcon="showHistoryPanel ? 'arrow-left' : ''"
        :leftIconColor="upThemeVar('--up-main-color', '#191c1e')"
        bgColor="transparent"
        statusBarBgColor="transparent"
        @leftClick="handleNavbarLeftClick"
      >
        <template #center>
          <text class="conversations-navbar__title u-line-1">
            {{ showHistoryPanel ? historyGroupTitle : "会话" }}
          </text>
        </template>
        <template #right>
          <view class="conversations-navbar__actions">
            <view
              v-if="showHistoryPanel"
              v-show="canCreateInHistory"
              class="conversations-navbar__select"
              @click="createConversation()"
            >
              <text class="conversations-navbar__select-text">新建</text>
            </view>
            <template v-else>
              <view
                v-if="showSelectionEntry"
                class="conversations-navbar__select"
                @click="toggleSelectionMode"
              >
                <text class="conversations-navbar__select-text">{{ selectionMode ? "取消" : "选择" }}</text>
              </view>
              <view
                v-if="!selectionMode"
                class="conversations-navbar__action"
                @click="createConversation()"
              >
                <up-icon name="plus" size="18" :color="upThemeVar('--up-primary', '#2f7cf6')"></up-icon>
              </view>
            </template>
          </view>
        </template>
      </up-navbar>

      <view class="conversations-searchbar">
        <up-search
          v-model="searchKeyword"
          placeholder="搜索会话..."
          :show-action="false"
          shape="round"
          :bgColor="upThemeVar('--up-hover-bg-color', '#e9eaee')"
          borderColor="transparent"
          :color="upThemeVar('--up-main-color', '#1a1b1f')"
          :placeholderColor="upThemeVar('--up-tips-color', '#9ca3af')"
          :searchIconColor="upThemeVar('--up-tips-color', '#8b93a5')"
          :height="40"
          @search="() => {}"
          @clear="() => {}"
        ></up-search>
      </view>
```

搜索框那段除了不再被 `up-sticky` 包裹之外**逐字未动**（`up-status-bar` 随 sticky 一起删除 ——
`up-navbar` 的 `safeAreaInsetTop` 默认 `true`，内部已自带 `u-status-bar`）。

`v-if="showHistoryPanel"` 配 `v-show="canCreateInHistory"`（而不是两个 `v-if` 串一起）是为了让
Task 1 的 `v-if="canCreateInHistory"` 断言与「历史模式右侧只有新建」这件事同时成立。

- [ ] **Step 2: 删掉历史模式栏**

删除 `index.vue:225-239` 整个 `.history-mode-bar` 块（从 `<view class="history-mode-bar"` 到它的
`</view>`）。删完后 `<view v-else class="history-list">` 的第一个子元素应当是
`<view v-if="historyLoading && historyProjectSections.length === 0" class="inline-loading">`。

- [ ] **Step 3: 加左键守卫**

在 `closeHistoryPanel()` 定义（`index.vue:2720`）**之后**插入：

```ts
/**
 * `up-navbar` 的 `.u-navbar__content__left` 是个固定尺寸的点击区，`leftIcon` 为空时它依然
 * 存在且可点（见 uview-plus `u-navbar.vue` 模板）。概览模式下没有返回目标，少了这道守卫，
 * 点左上角空白会静默清掉一遍历史状态。
 */
function handleNavbarLeftClick() {
  if (!showHistoryPanel.value) return
  closeHistoryPanel()
}
```

- [ ] **Step 4: 运行测试**

```bash
cd mcode-app && npm run test:unit -- conversationListNavbarHeader
```

预期：结构与守卫相关的用例转 PASS；玻璃样式与 `.conversations-navbar__title` 相关的用例仍 FAIL
（Task 3 才加样式）。此外 `drops the sticky big-title header` 也可能仍 FAIL —— 旧样式块还在。

- [ ] **Step 5: 提交**

```bash
git add mcode-app/src/pages/conversations/index.vue
git commit -m "feat(app): 会话列表顶部改用 up-navbar"
```

---

### Task 3: navbar 样式与旧样式清理

**Files:**
- Modify: `mcode-app/src/pages/conversations/index.vue:3395-3463`（删 sticky / header 样式，加 navbar 样式）

**Interfaces:**
- Consumes: Task 2 落地的类名 `conversations-navbar-shell` / `__title` / `__actions` /
  `__select` / `__select-text` / `__action`。
- Produces: 无脚本接口。

- [ ] **Step 1: 换掉 sticky 与 header 样式块**

删除 `index.vue:3395-3463` 这一整段（`.conversations-sticky` 起、`.conversations-header__action:active`
止，共 6 块），替换为：

```scss
/* .u-navbar__content 自带 background-color: $u-bg-color，仅靠 bgColor="transparent"
   只能覆盖 inline style，容器层仍不透明 —— 必须 :deep() 穿透。
   写法沿用 pages/conversation-detail/index.scss:66-76 的既有做法。
   刻意不照搬详情页的**不透明** --up-card-bg-color：那条笔记
   (2026-07-02-detail-navbar-status-bar-bg.md) 要的是「别让消息区透到状态图标后面」，
   而本页要的正是背景光斑透上来。 */
.conversations-navbar-shell :deep(.u-navbar--fixed),
.conversations-navbar-shell :deep(.u-status-bar),
.conversations-navbar-shell :deep(.u-navbar__content) {
  background: color-mix(in srgb, var(--up-card-bg-color, #ffffff) 55%, transparent) !important;
  backdrop-filter: blur(30rpx);
  -webkit-backdrop-filter: blur(30rpx);
}

/* 降级：不支持 backdrop-filter 时退到半透卡片色 + 1rpx 浅边框，保证文字可读
   （docs/mcode-architecture-notes/2026-06-28-conversations-liquid-glass.md 立的规矩）。 */
@supports not (backdrop-filter: blur(1px)) {
  .conversations-navbar-shell :deep(.u-navbar__content) {
    background: var(--up-card-bg-color, #ffffff) !important;
    border-bottom: 1rpx solid var(--up-border-color, #dadbde);
  }

  .conversations-navbar-shell :deep(.u-status-bar) {
    background: var(--up-card-bg-color, #ffffff) !important;
  }
}

/* __placeholder 是 u-navbar--fixed 之外的独立兄弟节点，组件没给它背景、上面的玻璃规则也
   没选中它。这条显式 transparent 是护栏：一旦它被误染上玻璃色，顶部会出现
   「占位块 + fixed 层」的双层色带。 */
.conversations-navbar-shell :deep(.u-navbar__placeholder) {
  background: transparent !important;
}

.conversations-navbar__title {
  max-width: 420rpx;
  font-size: 32rpx;
  font-weight: 600;
  color: var(--up-main-color, #191c1e);
}

/* .u-navbar__content__right 自带 padding: 0 13px，故这里不再另加外边距。 */
.conversations-navbar__actions {
  display: flex;
  align-items: center;
  gap: 12rpx;
  flex-shrink: 0;
}

.conversations-navbar__select {
  min-width: 84rpx;
  height: 56rpx;
  padding: 0 18rpx;
  border-radius: 999rpx;
  background: color-mix(in srgb, var(--up-primary, #2f7cf6) 10%, var(--up-card-bg-color, #ffffff) 90%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.conversations-navbar__select-text {
  font-size: 24rpx;
  line-height: 1;
  font-weight: 700;
  color: var(--up-primary, #2f7cf6);
}

.conversations-navbar__action {
  width: 56rpx;
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.5);
  background: color-mix(in srgb, var(--up-card-bg-color, #ffffff) 50%, transparent);
  backdrop-filter: blur(25rpx);
  -webkit-backdrop-filter: blur(25rpx);
  box-shadow: 0 6rpx 18rpx rgba(47, 124, 246, 0.08);
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.conversations-navbar__action:active {
  transform: scale(0.9);
}
```

`__action` 从 `64rpx` 收到 `56rpx` 与 `__select` 对齐（44px ≈ 88rpx 的 navbar 内要留上下呼吸位）。
`.conversations-searchbar` 及其三条 `:deep(.u-search__*)` 规则（`:3465-3490`）**一行不动**。

- [ ] **Step 2: 删掉历史模式栏样式**

删除 `index.vue:3999-4052` 这一段（`.history-mode-bar` 起、`.history-mode-create__text` 止，共 6 块）。
删完后 `.history-collapse-item :deep(.u-collapse-item__content__text)` 之后应直接进入
`.conv-list--history` 或文件的下一块样式。

- [ ] **Step 3: 运行测试，确认全绿**

```bash
cd mcode-app && npm run test:unit -- conversationListNavbarHeader
```

预期：PASS，7 个用例全过。

- [ ] **Step 4: 跑一遍会话列表相关的既有测试，确认没打破什么**

```bash
cd mcode-app && npm run test:unit -- tests/pages/conversations
```

预期：PASS。`conversationLivePreviewLayout.spec.ts` 也断言了本文件的字符串
（`.live-card__tab-flag`、`color: var(--up-primary, #2979ff);` 等），是最可能被样式删改误伤的一个。

- [ ] **Step 5: 提交**

```bash
git add mcode-app/src/pages/conversations/index.vue
git commit -m "style(app): navbar 玻璃化并清理旧顶部样式"
```

---

### Task 4: 修掉历史列表被写死的高度预算

**这一项 spec 未覆盖，是审计源码时发现的缺口。**
`.history-scroll` 写死了 `height: calc(100vh - 390rpx - env(safe-area-inset-bottom))`，那 390rpx 是按
**旧的三层顶部**估的。删掉大标题行和模式栏之后，这个预算会多扣约 190rpx，历史列表底部会凭空空出一块。

**Files:**
- Modify: `mcode-app/src/pages/conversations/index.vue:3962-3967`

**Interfaces:**
- Consumes: 既有 flex 链 —— `.conversations-shell`（`:3385`，`display: flex; flex-direction: column`）
  → `.main-wrap--history`（`:3502`，`flex: 1; min-height: 0`）→ `.history-list`（`:3955`，同上）。
- Produces: 无。

- [ ] **Step 1: 加一条断言，锁住「不再写死高度」**

追加到 `tests/pages/conversations/conversationListNavbarHeader.spec.ts` 的 `describe` 内：

```ts
  // 390rpx 是按旧的三层顶部估的预算。navbar 改造后再写死它，历史列表底部会空出约 190rpx。
  // 高度改由 flex 链决定（.conversations-shell → .main-wrap--history → .history-list）。
  it("lets the history scroll area size itself through flex", () => {
    const source = read("../../../src/pages/conversations/index.vue")

    expect(source).not.toContain("100vh - 390rpx")
    const block = source.slice(
      source.indexOf(".history-scroll {"),
      source.indexOf("}", source.indexOf(".history-scroll {")) + 1
    )
    expect(block).toContain("flex: 1")
    expect(block).toContain("min-height: 0")
  })
```

- [ ] **Step 2: 运行测试，确认它失败**

```bash
cd mcode-app && npm run test:unit -- conversationListNavbarHeader
```

预期：FAIL —— `expect(source).not.toContain("100vh - 390rpx")` 不通过。

- [ ] **Step 3: 去掉写死的高度**

把 `index.vue:3962-3967` 的 `.history-scroll` 换成：

```scss
/* 高度交给 flex 链算（.conversations-shell → .main-wrap--history → .history-list）。
   这里曾写死 calc(100vh - 390rpx)，那是按「大标题 + 搜索框 + 模式栏」三层顶部估的预算；
   navbar 改造删掉了其中两层，继续写死会让列表底部空出约 190rpx。 */
.history-scroll {
  flex: 1;
  min-height: 0;
}
```

- [ ] **Step 4: 运行测试，确认全绿**

```bash
cd mcode-app && npm run test:unit -- tests/pages/conversations
```

预期：PASS。

- [ ] **Step 5: 提交**

```bash
git add mcode-app/src/pages/conversations/index.vue mcode-app/tests/pages/conversations/conversationListNavbarHeader.spec.ts
git commit -m "fix(app): 历史列表高度改由 flex 决定"
```

---

### Task 5: 实机验证四条路径

源码契约测试证明不了视觉和手势。这一步必须真的看。

**Files:**
- 无改动（除非发现问题）

**Interfaces:**
- Consumes: Task 2-4 的成果。
- Produces: 一份可写进架构笔记的实测结论。

- [ ] **Step 1: 起 H5 dev server**

```bash
cd mcode-app && npm run dev:h5
```

浏览器打开输出的地址，进「会话」tab。

- [ ] **Step 2: 概览模式顶部形态**

确认：标题「会话」居中且为 32rpx 字号；右侧「选择」（有可选会话时）与 `＋` 并排；navbar 是半透玻璃、
底下的背景光斑能透上来；搜索框紧贴 navbar 占位块之下、**无双层色带**；往下滚动时搜索框跟着滚走，
顶部只剩 44px 的 navbar。

- [ ] **Step 3: 进出历史模式**

点任一分组的「历史会话」卡片进入历史模式。确认：左侧出现返回箭头、标题换成组名（长组名以省略号截断
且没把右侧按钮挤出可视区）、右侧变成「新建」。点返回箭头能回到分组总览。
**再在概览模式下点一次左上角空白区** —— 必须毫无反应（这是 `handleNavbarLeftClick` 守卫）。
同时确认历史列表底部没有多余空白（Task 4）。

- [ ] **Step 4: 选择态回归点**

概览模式点「选择」进入选择态 → 右侧变「取消」、底部浮出 `.bulk-action-bar`。
此时进历史模式，确认：选择态被自动清掉（`index.vue:995-1010` 的 watch 会调 `exitSelectionMode()`），
navbar 右侧正确变成「新建」而不是残留「取消」。

- [ ] **Step 5: 下拉刷新**

在概览模式顶部下拉。确认系统刷新圈可见（它从页面顶部下来，会从 fixed navbar 玻璃层底下钻出），
且顶部无塌陷或抖动。

**若刷新圈被 navbar 完全遮住**：给 `.conversations-navbar-shell :deep(.u-navbar--fixed)` 加
`z-index: 9`（低于 `u-navbar--fixed` 默认的 `11`）。注意本页 `.bulk-action-bar` 用的是 `z-index: 30`，
下调 navbar 不会影响它。

- [ ] **Step 6: 深色模式**

切系统深色模式，重复 Step 2。确认玻璃层跟着 `--up-card-bg-color` 变暗、标题与按钮文字对比度足够。

- [ ] **Step 7: 若有修改则提交**

```bash
git add mcode-app/src/pages/conversations/index.vue
git commit -m "fix(app): 实机验证后微调 navbar 顶部"
```

无改动则跳过。

---

### Task 6: 补架构笔记

AGENTS.md 硬性要求：每个 mcode 改动都要在 `docs/mcode-architecture-notes/` 下留一篇笔记。

**Files:**
- Create: `docs/mcode-architecture-notes/2026-08-21-<hh>-<mm>-conversation-list-navbar-header.md`

**Interfaces:**
- Consumes: Task 2-5 的最终实现与实测结论。
- Produces: 笔记文件。

- [ ] **Step 1: 取当前本地时间做文件名**

```bash
date +"%H-%M"
```

用输出替换文件名里的 `<hh>-<mm>`（例如输出 `04-12` → 
`2026-08-21-04-12-conversation-list-navbar-header.md`）。文件名时间戳既是排序依据，
也保证同一天多篇不重名 —— 不要往文件名里塞需求编号。

- [ ] **Step 2: 写笔记**

内容需覆盖（简洁但具体到能让 AI agent 不读 web 实现就复刻出 native 客户端）：

1. **结构**：`up-navbar` 44px + `placeholder` 占位；搜索框不再 sticky；两种形态靠 `showHistoryPanel` 切。
2. **UI 行为**：三个槽位在概览 / 历史两种模式下的映射表（照抄 spec 的交互接线表）。
3. **左键守卫**：为什么 `leftIcon=''` 时仍需 `handleNavbarLeftClick` 守卫（点击区始终存在）。
4. **降级契约**：`backdrop-filter` / `color-mix` 不支持时退半透卡片色 + 1rpx 浅边框，文字始终可读。
5. **踩过的坑**：`.u-navbar__content` 的自带背景必须 `:deep()` 穿透；`__placeholder` 不能染色，
   否则出现双层色带；`.history-scroll` 写死 `100vh - 390rpx` 会在删层后留下约 190rpx 空白。
6. **native 复刻指引**：iOS 用 `UINavigationBar` + `UIBlurEffect`（`.systemThinMaterial`），
   Android 用 `MaterialToolbar` + `RenderEffect.createBlurEffect`；两端都要把状态栏与导航栏
   做成同一片连续玻璃，且在不支持模糊时退到不透明表面色。
7. **实机结论**：Task 5 里下拉刷新圈的实际表现、是否动过 `z-index`。

- [ ] **Step 3: 提交**

```bash
git add docs/mcode-architecture-notes/
git commit -m "docs(notes): 会话列表 up-navbar 顶部改造笔记"
```

---

## Self-Review

**Spec 覆盖核对**（逐节对到任务）：

| Spec 章节 | 落在哪 |
|---|---|
| 结构 / up-navbar（含 6 个 props） | Task 2 Step 1，Task 1 断言 |
| 结构 / 搜索框不再 sticky | Task 2 Step 1（逐字保留，仅脱离 sticky） |
| 删除项（sticky、status-bar、header 样式、history-mode 样式） | Task 2 Step 1-2，Task 3 Step 1-2，Task 1 的 `not.toContain` |
| 交互接线表 | Task 2 Step 1，Task 1 第 5-6 个用例 |
| 既有约束 / 左键守卫 | Task 2 Step 3，Task 1 第 3 个用例 |
| 既有约束 / `autoBack` 护栏 | Task 2 Step 1，Task 1 第 1 个用例 |
| 既有约束 / 不用 `@rightClick` | Task 2 Step 1，Task 1 第 4 个用例 |
| 样式 / navbar 玻璃化 + `__placeholder` 护栏 | Task 3 Step 1，Task 1 第 6 个用例 |
| 样式 / 右侧按钮改名收尺寸 | Task 3 Step 1 |
| 样式 / 标题 | Task 3 Step 1，Task 1 第 7 个用例 |
| 兼容性 / 下拉刷新叠加 | Task 5 Step 5（含 `z-index` 退路） |
| 兼容性 / Safari 降级契约 | Task 3 Step 1 的 `@supports` 块 + Task 6 笔记 |
| 兼容性 / 深色模式 | Task 5 Step 6，Task 1 第 7 个用例 |
| 兼容性 / selectionMode 回归点 | Task 5 Step 4 |
| 验证四条路径 | Task 5 Step 2-5 |
| 交付物 / 架构笔记 | Task 6 |

**spec 之外补的一项：** Task 4（`.history-scroll` 写死 390rpx）。spec 没提到它，但不修就会在历史模式
底部留下约 190rpx 空白 —— 恰好抵消掉这次改造省下的高度。

**占位符扫描：** 无 TBD / TODO / 「类似 Task N」。唯一的待填值是 Task 6 文件名里的 `<hh>-<mm>`，
它按设计取执行时刻的 `date +"%H-%M"`，Step 1 已给出取值命令。

**类型一致性：** 全程只新增一个函数 `handleNavbarLeftClick()`（无参、无返回值），Task 1 断言、
Task 2 定义、模板 `@leftClick` 三处名字一致。复用的既有符号
（`showHistoryPanel` / `historyGroupTitle` / `showSelectionEntry` / `selectionMode` /
`canCreateInHistory` / `toggleSelectionMode` / `createConversation` / `closeHistoryPanel` / `upThemeVar`）
均已在源码中逐一核对行号。类名在 Task 1 断言、Task 2 模板、Task 3 样式三处拼写一致。
