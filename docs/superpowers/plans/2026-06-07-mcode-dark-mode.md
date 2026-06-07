# MCode Dark Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete `system / light / dark` theme system to `mcode-app`, migrate the old boolean dark-mode setting, and make the current main pages and shared UI dark-mode friendly using `uview-plus` runtime theme APIs.

**Architecture:** Use `uview-plus` runtime theme as the single source of truth. A small theme service reads and migrates preference storage, applies `uni.$u.setThemePreference(...)`, and exposes helper functions. Global styling in `uni.scss`, `App.vue`, and `App.up.vue` defines app-level semantic tokens backed by `--up-*` theme variables. Main pages and shared components then replace hardcoded light colors with these semantic tokens so the runtime theme controls both component library visuals and business UI.

**Tech Stack:** Uni-app, Vue 3 SFC, TypeScript, Pinia, uview-plus 3.8.x runtime theme API, SCSS, `vue-tsc`, H5 build

---

### Task 5: Convert Shared Message And Pet Components To Theme-Aware Colors

**Files:**
- Modify: `mcode-app/src/components/MessageBubble.vue`
- Modify: `mcode-app/src/components/ToolCallBlock.vue`
- Modify: `mcode-app/src/components/CodeBlock.vue`
- Modify: `mcode-app/src/components/pet/PetFloat.vue`
- Modify: `mcode-app/src/components/pet/PetPanel.vue`
- Modify: `mcode-app/src/components/pet/PetBubble.vue`
- Modify: `mcode-app/src/components/pet/PetSprite.vue`

- [ ] **Step 1: Make message bubbles and assistant panels token-driven**

In [`MessageBubble.vue`](D:/Repos/xyito/lingyun/mcode/mcode-app/src/components/MessageBubble.vue), update:

```scss
.bubble--assistant {
  background-color: #ffffff;
  box-shadow: 0 2rpx 16rpx rgba(0, 0, 0, 0.06);
}
.part-text { color: #303133; }
.part-thinking { background-color: #fffbf0; }
.part-tool-result { background-color: #f7f8fa; }
.tool-result__text,
.plan-step__text { color: #606266; }
.bubble-error { background-color: #fff1f0; }
.action-btn { background-color: #f5f6f8; }
```

to:

```scss
.bubble--assistant {
  background-color: var(--mcode-card-bg);
  border: 1rpx solid var(--mcode-border-color);
  box-shadow: none;
}
.part-text { color: var(--mcode-text-primary); }
.part-thinking {
  background-color: color-mix(in srgb, var(--mcode-warning) 8%, var(--mcode-card-bg) 92%);
}
.part-tool-result {
  background-color: var(--mcode-card-soft-bg);
}
.tool-result__text,
.thinking-hd__text,
.plan-step__text { color: var(--mcode-text-secondary); }
.bubble-error {
  background-color: color-mix(in srgb, var(--mcode-error) 10%, var(--mcode-card-bg) 90%);
}
.action-btn { background-color: var(--mcode-card-soft-bg); }
```

- [ ] **Step 2: Make tool call blocks and generic code blocks dark-mode stable**

In [`ToolCallBlock.vue`](D:/Repos/xyito/lingyun/mcode/mcode-app/src/components/ToolCallBlock.vue), replace:

```scss
.tool-block { background-color: #f8f9fa; border: 1rpx solid #e8e8e8; }
.tool-name { color: #303133; }
.code-block--success { background-color: #f0fff4; }
.code-block--error { background-color: #fff1f0; }
.code-text--dark { color: #303133; }
```

with:

```scss
.tool-block {
  background-color: var(--mcode-card-soft-bg);
  border: 1rpx solid var(--mcode-border-color);
}
.tool-name { color: var(--mcode-text-primary); }
.section-label { color: var(--mcode-text-tertiary); }
.code-block--success {
  background-color: color-mix(in srgb, var(--mcode-success) 8%, var(--mcode-card-bg) 92%);
  border-left: 4rpx solid var(--mcode-success);
}
.code-block--error {
  background-color: color-mix(in srgb, var(--mcode-error) 10%, var(--mcode-card-bg) 90%);
  border-left: 4rpx solid var(--mcode-error);
}
.code-text--dark { color: var(--mcode-text-primary); }
```

In [`CodeBlock.vue`](D:/Repos/xyito/lingyun/mcode/mcode-app/src/components/CodeBlock.vue), replace:

```scss
.code-block { background-color: #282c34; }
.code-header { background-color: #21252b; border-bottom: 1rpx solid #181a1f; }
```

with:

```scss
.code-block {
  margin: 20rpx 0;
  border-radius: 12rpx;
  overflow: hidden;
  background-color: var(--mcode-code-bg);
  border: 1rpx solid color-mix(in srgb, var(--mcode-code-bg) 80%, #ffffff 20%);
}

.code-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16rpx 24rpx;
  background-color: var(--mcode-code-header-bg);
  border-bottom: 1rpx solid color-mix(in srgb, var(--mcode-code-bg) 68%, #ffffff 32%);
}
```

- [ ] **Step 3: Align pet popup and panel surfaces with semantic tokens**

In [`PetFloat.vue`](D:/Repos/xyito/lingyun/mcode/mcode-app/src/components/pet/PetFloat.vue) and [`PetPanel.vue`](D:/Repos/xyito/lingyun/mcode/mcode-app/src/components/pet/PetPanel.vue), replace card backgrounds and text colors so the visible popup/panel uses:

```scss
background: var(--mcode-card-bg);
color: var(--mcode-text-primary);
border-color: var(--mcode-border-color);
```

and replace dark-mode-only hardcoded card backgrounds such as:

```scss
background: #1f1f1f;
color: #e5e5e5;
```

with:

```scss
background: var(--mcode-card-bg);
color: var(--mcode-text-primary);
```

- [ ] **Step 4: Commit the shared component theme pass**

Run:

```bash
git add mcode-app/src/components/MessageBubble.vue mcode-app/src/components/ToolCallBlock.vue mcode-app/src/components/CodeBlock.vue mcode-app/src/components/pet/PetFloat.vue mcode-app/src/components/pet/PetPanel.vue mcode-app/src/components/pet/PetBubble.vue mcode-app/src/components/pet/PetSprite.vue
git commit -m "feat(theme): adapt shared message and pet components"
```

---

### Task 6: Verify Migration, Type Safety, And H5 Build Output

**Files:**
- Modify: `mcode-app/src/services/theme/themePreference.ts`
- Modify: any file from Tasks 1-5 only if verification reveals a concrete issue

- [ ] **Step 1: Run a TypeScript-only project check**

Run:

```bash
cd D:/Repos/xyito/lingyun/mcode/mcode-app && npx vue-tsc --noEmit
```

Expected:

```text
The theme service and updated SFCs type-check without adding new errors.
```

- [ ] **Step 2: Run an H5 production build**

Run:

```bash
cd D:/Repos/xyito/lingyun/mcode/mcode-app && npm run build:h5
```

Expected:

```text
The H5 build succeeds. Existing upstream warnings are acceptable only if they are unchanged from before this feature.
```

- [ ] **Step 3: Run the H5 dev server for manual theme verification**

Run:

```bash
cd D:/Repos/xyito/lingyun/mcode/mcode-app && npm run dev:h5
```

Verify:

```text
1. Default first launch follows system theme.
2. If only `mcode_dark_mode=true` exists in storage, the app comes up in dark mode and writes `mcode_theme_preference=dark`.
3. If only `mcode_dark_mode=false` exists, the app writes `mcode_theme_preference=light`.
4. Profile appearance selector switches correctly between system / light / dark.
5. TabBar, nav bar, and page background switch together.
6. Connections / conversations / conversation-detail / todos / profile no longer show large pure white cards in dark mode.
7. Message bubbles, tool blocks, and code blocks remain readable in both light and dark themes.
8. Pet popups and bottom panels no longer look visually detached from the active theme.
```

- [ ] **Step 4: If verification finds a regression, make the smallest follow-up fix only**

Use targeted follow-up changes like:

```scss
.conv-card,
.live-card,
.connection-item,
.todo-list {
  border-color: var(--mcode-border-color);
}
```

or:

```ts
export function initializeThemePreference() {
  const preference = readThemePreference()
  return applyThemePreference(preference)
}
```

Do not redesign the architecture. Fix only the concrete mismatch revealed by verification.

- [ ] **Step 5: Commit any verification-only follow-up**

Run:

```bash
git add mcode-app/src/services/theme/themePreference.ts mcode-app/src/App.vue mcode-app/src/App.up.vue mcode-app/src/uni.scss mcode-app/src/pages/profile/index.vue mcode-app/src/pages/connections/index.vue mcode-app/src/pages/conversations/index.vue mcode-app/src/pages/conversation-detail/index.vue mcode-app/src/pages/todos/index.vue mcode-app/src/components/MessageBubble.vue mcode-app/src/components/ToolCallBlock.vue mcode-app/src/components/CodeBlock.vue mcode-app/src/components/pet/PetFloat.vue mcode-app/src/components/pet/PetPanel.vue mcode-app/src/components/pet/PetBubble.vue mcode-app/src/components/pet/PetSprite.vue
git commit -m "fix(theme): polish dark mode verification issues"
```

Expected:

```text
Skip this commit if verification passes without code changes. If needed, this commit contains only post-verification fixes.
```

### Task 3: Replace The Profile Switch With A Three-State Appearance Selector

**Files:**
- Modify: `mcode-app/src/pages/profile/index.vue`
- Reference: `mcode-app/src/services/theme/themePreference.ts`

- [ ] **Step 1: Replace the boolean switch UI with an appearance menu row and action sheet**

In [`profile/index.vue`](D:/Repos/xyito/lingyun/mcode/mcode-app/src/pages/profile/index.vue), replace:

```vue
<view class="menu-item" @click="toggleDarkMode">
  <view class="menu-left">
    <image class="theme-icon" src="/static/icons/moon.svg" mode="aspectFit"></image>
    <text class="menu-text">深色模式</text>
  </view>
  <u-switch v-model="isDarkMode" @change="onDarkModeChange" size="24"></u-switch>
</view>
```

with:

```vue
<view class="menu-item" @click="showThemeSheet = true">
  <view class="menu-left">
    <image class="theme-icon" src="/static/icons/moon.svg" mode="aspectFit"></image>
    <text class="menu-text">外观模式</text>
  </view>
  <view class="menu-right">
    <text class="menu-value">{{ themeLabel }}</text>
    <u-icon name="arrow-right" color="var(--mcode-text-tertiary)" size="18"></u-icon>
  </view>
</view>
```

and append:

```vue
<u-action-sheet
  :show="showThemeSheet"
  :actions="themeActions"
  @select="handleThemeSelect"
  @close="showThemeSheet = false"
></u-action-sheet>
```

- [ ] **Step 2: Replace the boolean state with theme-preference state**

Replace the current profile script setup for dark mode:

```ts
const isDarkMode = ref(false)

function loadDarkMode() {
  const savedMode = uni.getStorageSync("mcode_dark_mode")
  isDarkMode.value = savedMode === true
}

function toggleDarkMode() {
  isDarkMode.value = !isDarkMode.value
  onDarkModeChange(isDarkMode.value)
}

function onDarkModeChange(value: boolean) {
  uni.setStorageSync("mcode_dark_mode", value)
  uni.showToast({
    title: value ? "已切换到深色模式" : "已切换到浅色模式",
    icon: "none",
  })
}
```

with:

```ts
import { computed, ref, onMounted } from "vue"
import {
  applyThemePreference,
  getCurrentThemePreference,
  type ThemePreference,
} from "@/services/theme/themePreference"

const themePreference = ref<ThemePreference>("system")
const showThemeSheet = ref(false)

const themeActions = [
  { name: "跟随系统", value: "system" },
  { name: "浅色", value: "light" },
  { name: "深色", value: "dark" },
] as const

const themeLabel = computed(() => {
  if (themePreference.value === "dark") return "深色"
  if (themePreference.value === "light") return "浅色"
  return "跟随系统"
})

function loadThemePreference() {
  themePreference.value = getCurrentThemePreference()
}

function handleThemeSelect(action: { value?: string; name?: string }) {
  const nextPreference = (action?.value || "system") as ThemePreference
  themePreference.value = applyThemePreference(nextPreference)
  showThemeSheet.value = false
  uni.showToast({
    title: `已切换为${themeLabel.value}`,
    icon: "none",
  })
}
```

Also update:

```ts
onMounted(() => {
  loadUserInfo()
  loadDarkMode()
})
```

to:

```ts
onMounted(() => {
  loadUserInfo()
  loadThemePreference()
})
```

- [ ] **Step 3: Preserve the new theme key when clearing storage**

Update:

```ts
const darkMode = uni.getStorageSync("mcode_dark_mode")
...
if (darkMode !== undefined) uni.setStorageSync("mcode_dark_mode", darkMode)
```

to:

```ts
const themePreference = uni.getStorageSync("mcode_theme_preference")
...
if (themePreference !== undefined && themePreference !== "") {
  uni.setStorageSync("mcode_theme_preference", themePreference)
}
```

- [ ] **Step 4: Convert profile page colors to semantic tokens**

Update:

```scss
.page { background-color: #f8f8f8; }
.user-card { background-color: #ffffff; }
.user-name { color: #303133; }
.user-email { color: #909399; }
.menu-list { background-color: #ffffff; }
.menu-item { border-bottom: 1rpx solid #f5f5f5; }
.menu-text { color: #303133; }
.menu-value { color: #909399; }
```

to:

```scss
.page {
  min-height: 100vh;
  background-color: var(--mcode-page-bg);
  padding-bottom: 40rpx;
}

.user-card { background-color: var(--mcode-card-bg); }
.user-name { color: var(--mcode-text-primary); }
.user-email { color: var(--mcode-text-tertiary); }
.menu-list { background-color: var(--mcode-card-bg); }
.menu-item { border-bottom: 1rpx solid var(--mcode-border-color); }
.menu-text { color: var(--mcode-text-primary); }
.menu-value { color: var(--mcode-text-tertiary); }

.menu-right {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
```

- [ ] **Step 5: Commit the profile appearance entry**

Run:

```bash
git add mcode-app/src/pages/profile/index.vue
git commit -m "feat(profile): add three-state appearance selector"
```

---

### Task 4: Convert The Main Pages To Semantic Theme Colors

**Files:**
- Modify: `mcode-app/src/pages/connections/index.vue`
- Modify: `mcode-app/src/pages/conversations/index.vue`
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`
- Modify: `mcode-app/src/pages/todos/index.vue`

- [ ] **Step 1: Update the connections page to use semantic page, card, and text colors**

In [`connections/index.vue`](D:/Repos/xyito/lingyun/mcode/mcode-app/src/pages/connections/index.vue), replace these representative style lines:

```scss
.page { background-color: #ffffff; }
.header { background-color: #ffffff; border-bottom: 1rpx solid #e4e7ed; }
.connection-item { background-color: #f8f9fa; }
.connection-info__name { color: #1d1d1f; }
.connection-info__desc { color: #86909c; }
.popup-content { background-color: #ffffff; }
.popup-title { color: #303133; }
```

with:

```scss
.page { background-color: var(--mcode-page-bg); }
.hero-banner { background-color: var(--mcode-page-bg); }
.header {
  background-color: var(--mcode-page-bg);
  border-bottom: 1rpx solid var(--mcode-border-color);
}
.connection-item {
  background-color: var(--mcode-card-bg);
  border: 1rpx solid var(--mcode-border-color);
}
.connection-info__name { color: var(--mcode-text-primary); }
.connection-info__desc { color: var(--mcode-text-secondary); }
.popup-content { background-color: var(--mcode-card-bg); }
.popup-title { color: var(--mcode-text-primary); }
```

Also replace soft-accent backgrounds with color-mix:

```scss
.add-conn-btn {
  border: 2rpx dashed color-mix(in srgb, var(--mcode-primary) 45%, var(--mcode-border-color) 55%);
  background-color: color-mix(in srgb, var(--mcode-primary) 8%, var(--mcode-card-bg) 92%);
}

.tutorial-entry {
  background-color: color-mix(in srgb, var(--mcode-primary) 8%, var(--mcode-card-bg) 92%);
}
```

- [ ] **Step 2: Update the conversations overview and history panels to use semantic colors**

In [`conversations/index.vue`](D:/Repos/xyito/lingyun/mcode/mcode-app/src/pages/conversations/index.vue), update:

```scss
.page { background-color: #f2f3f5; }
.live-card { background-color: #ffffff; border: 1rpx solid #ebeef5; }
.history-mode-bar { background-color: #ffffff; border-bottom: 1rpx solid #ebeef5; }
.search-bar { background-color: #ffffff; border-bottom: 1rpx solid #f0f0f0; }
.conv-card { background-color: #ffffff; }
.create-sheet { background-color: #ffffff; }
```

to:

```scss
.page { background-color: var(--mcode-page-bg); }
.live-card {
  background-color: var(--mcode-card-bg);
  border: 1rpx solid var(--mcode-border-color);
}
.group-section__title,
.live-card__project-title,
.right-top-bar__title,
.conv-card__title,
.create-sheet__title { color: var(--mcode-text-primary); }
.live-card__session-name,
.history-mode-title,
.config-chip__title,
.form-readonly__text,
.agent-card__label { color: var(--mcode-text-secondary); }
.live-card__time,
.group-empty__text,
.history-entry__desc,
.inline-loading__text,
.history-mode-tip,
.form-helper-text,
.form-helper-inline,
.config-loading__text,
.config-hint__text,
.config-section__desc { color: var(--mcode-text-tertiary); }
.history-mode-bar,
.search-bar,
.create-sheet { background-color: var(--mcode-card-bg); }
.history-mode-bar,
.search-bar { border-bottom: 1rpx solid var(--mcode-border-color); }
.conv-card {
  background-color: var(--mcode-card-bg);
  border: 1rpx solid var(--mcode-border-color);
  box-shadow: none;
}
```

- [ ] **Step 3: Update the conversation detail page surfaces and action trays**

In [`conversation-detail/index.vue`](D:/Repos/xyito/lingyun/mcode/mcode-app/src/pages/conversation-detail/index.vue), replace:

```scss
.page { background-color: #f2f3f5; }
.toolbar { background-color: #ffffff; border-bottom: 1rpx solid #f0f0f0; }
.icon-btn { background-color: #f5f6f8; }
.input-wrap { background-color: #ffffff; border-top: 1rpx solid #f0f0f0; }
.composer-tools { background: #ffffff; border: 1rpx solid #eef1f6; }
.queue-item { background: #f8f9fc; border: 1rpx solid #edf1f6; }
.input-action { background-color: #f3f5f8; }
.input-box { background-color: #f5f6f8; }
.plan-drawer { background-color: #ffffff; }
```

with:

```scss
.page { background-color: var(--mcode-page-bg); }
.toolbar {
  background-color: var(--mcode-card-bg);
  border-bottom: 1rpx solid var(--mcode-border-color);
}
.runtime-label,
.composer-tools__title,
.config-section__title,
.queue-item__text,
.plan-task__subject,
.todo-picker__title { color: var(--mcode-text-primary); }
.icon-btn,
.input-action,
.form-readonly,
.config-chip,
.queue-op,
.plan-filter { background-color: var(--mcode-card-soft-bg); }
.history-status { background-color: var(--mcode-page-bg); }
.history-status__text,
.stats-text,
.composer-config-row__value,
.queue-item__time,
.plan-drawer__count,
.todo-picker__empty-text { color: var(--mcode-text-tertiary); }
.input-wrap {
  background-color: var(--mcode-card-bg);
  border-top: 1rpx solid var(--mcode-border-color);
}
.composer-tools,
.queue-item,
.plan-task,
.todo-picker__item {
  background: var(--mcode-card-bg);
  border: 1rpx solid var(--mcode-border-color);
  box-shadow: none;
}
.input-box,
.upload-queue,
.attachment-file,
.queue-bar,
.slash-panel {
  background-color: var(--mcode-card-soft-bg);
  border-color: var(--mcode-border-color);
}
.plan-drawer { background-color: var(--mcode-card-bg); }
```

- [ ] **Step 4: Update the todos page cards, inputs, and send sheet**

In [`todos/index.vue`](D:/Repos/xyito/lingyun/mcode/mcode-app/src/pages/todos/index.vue), replace:

```scss
.page { background-color: #f8f8f8; }
.add-bar { background-color: #fff; border-bottom: 1rpx solid #f0f0f0; }
.add-input-wrap { background-color: #f5f6f8; }
.todo-list { background-color: #fff; }
.todo-item { border-bottom: 1rpx solid #f5f5f5; }
.todo-text { color: #303133; }
.create-sheet { background-color: #ffffff; }
```

with:

```scss
.page { background-color: var(--mcode-page-bg); }
.add-bar {
  background-color: var(--mcode-card-bg);
  border-bottom: 1rpx solid var(--mcode-border-color);
}
.add-input-wrap { background-color: var(--mcode-card-soft-bg); }
.todo-list { background-color: var(--mcode-card-bg); }
.todo-item { border-bottom: 1rpx solid var(--mcode-border-color); }
.todo-text { color: var(--mcode-text-primary); }
.completed .todo-text { color: var(--mcode-text-tertiary); }
.empty-text { color: var(--mcode-text-secondary); }
.empty-hint { color: var(--mcode-text-tertiary); }
.create-sheet { background-color: var(--mcode-card-bg); }
```

- [ ] **Step 5: Commit the main page theme pass**

Run:

```bash
git add mcode-app/src/pages/connections/index.vue mcode-app/src/pages/conversations/index.vue mcode-app/src/pages/conversation-detail/index.vue mcode-app/src/pages/todos/index.vue
git commit -m "feat(theme): adapt main pages for dark mode"
```

---

### Task 1: Add The Theme Preference Service And Wire Startup To `uview-plus`

**Files:**
- Create: `mcode-app/src/services/theme/themePreference.ts`
- Modify: `mcode-app/src/main.ts`
- Modify: `mcode-app/src/App.vue`

- [ ] **Step 1: Create the theme preference service with migration-safe storage helpers**

Create [`themePreference.ts`](D:/Repos/xyito/lingyun/mcode/mcode-app/src/services/theme/themePreference.ts) with:

```ts
export type ThemePreference = "system" | "light" | "dark"
export type ThemeMode = "light" | "dark"

export const THEME_PREFERENCE_KEY = "mcode_theme_preference"
export const LEGACY_DARK_MODE_KEY = "mcode_dark_mode"
const VALID_THEME_PREFERENCES: ThemePreference[] = ["system", "light", "dark"]

export function normalizeThemePreference(value: unknown): ThemePreference {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    if (VALID_THEME_PREFERENCES.includes(normalized as ThemePreference)) {
      return normalized as ThemePreference
    }
  }
  return "system"
}

export function migrateLegacyThemePreference(
  storedPreference: unknown,
  legacyDarkMode: unknown
): ThemePreference {
  if (typeof storedPreference === "string") {
    return normalizeThemePreference(storedPreference)
  }
  if (legacyDarkMode === true) return "dark"
  if (legacyDarkMode === false) return "light"
  return "system"
}

export function readThemePreference(): ThemePreference {
  const storedPreference = uni.getStorageSync(THEME_PREFERENCE_KEY)
  const legacyDarkMode = uni.getStorageSync(LEGACY_DARK_MODE_KEY)
  const preference = migrateLegacyThemePreference(storedPreference, legacyDarkMode)
  uni.setStorageSync(THEME_PREFERENCE_KEY, preference)
  return preference
}

export function writeThemePreference(preference: ThemePreference) {
  uni.setStorageSync(THEME_PREFERENCE_KEY, normalizeThemePreference(preference))
}

export function applyThemePreference(preference: ThemePreference) {
  const resolvedPreference = normalizeThemePreference(preference)
  writeThemePreference(resolvedPreference)
  if (typeof uni !== "undefined" && uni.$u && typeof uni.$u.setThemePreference === "function") {
    uni.$u.setThemePreference(resolvedPreference)
  }
  return resolvedPreference
}

export function initializeThemePreference() {
  return applyThemePreference(readThemePreference())
}

export function getCurrentThemePreference(): ThemePreference {
  if (typeof uni !== "undefined" && uni.$u && typeof uni.$u.getThemePreference === "function") {
    return normalizeThemePreference(uni.$u.getThemePreference())
  }
  return readThemePreference()
}

export function getCurrentThemeMode(): ThemeMode {
  const mode = uni?.$u?.theme?.mode
  return mode === "dark" ? "dark" : "light"
}

export function isDarkThemeMode() {
  return getCurrentThemeMode() === "dark"
}
```

- [ ] **Step 2: Enable `nativeThemeSync` when installing `uview-plus`**

Update [`main.ts`](D:/Repos/xyito/lingyun/mcode/mcode-app/src/main.ts) from:

```ts
  app.use(pinia)
  app.use(uviewPlus)
  return { app, pinia }
```

to:

```ts
  app.use(pinia)
  app.use(uviewPlus, () => ({
    options: {
      config: {
        nativeThemeSync: true,
      },
    },
  }))
  return { app, pinia }
```

- [ ] **Step 3: Replace the ad hoc app launch dark-mode code with the theme service**

Update [`App.vue`](D:/Repos/xyito/lingyun/mcode/mcode-app/src/App.vue) from:

```ts
onLaunch(() => {
  console.log("App Launch")
  initDarkMode()
})

function initDarkMode() {
  const isDarkMode = uni.getStorageSync("mcode_dark_mode")
  if (isDarkMode) {
    uni.setTabBarStyle({
      backgroundColor: "#1f1f1f",
      borderStyle: "white",
      color: "#8f8f94",
      selectedColor: "#2979ff",
    })
  }
}
```

to:

```ts
import { onLaunch, onShow, onHide } from "@dcloudio/uni-app"
import { initializeThemePreference } from "@/services/theme/themePreference"

onLaunch(() => {
  console.log("App Launch")
  initializeThemePreference()
})

onShow(() => {
  console.log("App Show")
  initializeThemePreference()
})

onHide(() => {
  console.log("App Hide")
})
```

- [ ] **Step 4: Commit the startup theme integration**

Run:

```bash
git add mcode-app/src/services/theme/themePreference.ts mcode-app/src/main.ts mcode-app/src/App.vue
git commit -m "feat(theme): add runtime theme preference service"
```

---

### Task 2: Establish Global Semantic Theme Tokens

**Files:**
- Modify: `mcode-app/src/uni.scss`
- Modify: `mcode-app/src/App.vue`
- Modify: `mcode-app/src/App.up.vue`

- [ ] **Step 1: Replace the hardcoded page defaults in `uni.scss` with semantic theme variables**

Update the top of [`uni.scss`](D:/Repos/xyito/lingyun/mcode/mcode-app/src/uni.scss) from:

```scss
page {
  background: #f7f7f8;
  color: #111111;
}
```

to:

```scss
:root,
page,
body {
  --mcode-page-bg: var(--up-page-bg-color, var(--up-bg-color, #f3f4f6));
  --mcode-card-bg: var(--up-card-bg-color, #ffffff);
  --mcode-card-muted-bg: color-mix(in srgb, var(--mcode-card-bg) 82%, var(--mcode-page-bg) 18%);
  --mcode-card-soft-bg: color-mix(in srgb, var(--mcode-card-bg) 68%, var(--mcode-page-bg) 32%);
  --mcode-text-primary: var(--up-main-color, #303133);
  --mcode-text-secondary: var(--up-content-color, #606266);
  --mcode-text-tertiary: var(--up-tips-color, #909193);
  --mcode-border-color: var(--up-border-color, #dadbde);
  --mcode-primary: var(--up-primary, #2979ff);
  --mcode-success: var(--up-success, #19be6b);
  --mcode-warning: var(--up-warning, #f9ae3d);
  --mcode-error: var(--up-error, #fa3534);
  --mcode-code-bg: color-mix(in srgb, #101318 88%, var(--mcode-page-bg) 12%);
  --mcode-code-header-bg: color-mix(in srgb, #161b22 82%, var(--mcode-page-bg) 18%);
  --mcode-code-text: #d7dde8;
}

page {
  background: var(--mcode-page-bg);
  color: var(--mcode-text-primary);
}
```

- [ ] **Step 2: Update the utility surfaces in `uni.scss` to inherit the new tokens**

Update:

```scss
.section {
  background: #ffffff;
  border: 1px solid $u-border-color;
}

.muted {
  color: $u-tips-color;
}
```

to:

```scss
.section {
  background: var(--mcode-card-bg);
  border: 1px solid var(--mcode-border-color);
  border-radius: 8rpx;
  padding: 24rpx;
  margin-bottom: 24rpx;
}

.muted {
  color: var(--mcode-text-tertiary);
  font-size: 24rpx;
}
```

- [ ] **Step 3: Make the app root wrappers inherit page background instead of fixed light colors**

Replace the style block in [`App.vue`](D:/Repos/xyito/lingyun/mcode/mcode-app/src/App.vue) with:

```scss
@import "uview-plus/index.scss";

page {
  background-color: var(--mcode-page-bg);
  color: var(--mcode-text-primary);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}
```

Update [`App.up.vue`](D:/Repos/xyito/lingyun/mcode/mcode-app/src/App.up.vue) from:

```css
.up-root-wrap {
  min-height: 100vh;
}
```

to:

```css
.up-root-wrap {
  min-height: 100vh;
  background: var(--mcode-page-bg);
  color: var(--mcode-text-primary);
}
```

- [ ] **Step 4: Commit the semantic token layer**

Run:

```bash
git add mcode-app/src/uni.scss mcode-app/src/App.vue mcode-app/src/App.up.vue
git commit -m "feat(theme): add app semantic theme tokens"
```

---

## File Structure

**Files that will be created:**

- `mcode-app/src/services/theme/themePreference.ts`
  Owns theme preference parsing, legacy migration, storage, `applyThemePreference`, and simple helpers such as `isDarkThemeMode`.

**Files that will be modified:**

- `mcode-app/src/main.ts`
- `mcode-app/src/App.vue`
- `mcode-app/src/App.up.vue`
- `mcode-app/src/uni.scss`
- `mcode-app/src/pages/profile/index.vue`
- `mcode-app/src/pages/connections/index.vue`
- `mcode-app/src/pages/conversations/index.vue`
- `mcode-app/src/pages/conversation-detail/index.vue`
- `mcode-app/src/pages/todos/index.vue`
- `mcode-app/src/components/MessageBubble.vue`
- `mcode-app/src/components/ToolCallBlock.vue`
- `mcode-app/src/components/CodeBlock.vue`
- `mcode-app/src/components/pet/PetFloat.vue`
- `mcode-app/src/components/pet/PetPanel.vue`
- `mcode-app/src/components/pet/PetBubble.vue`
- `mcode-app/src/components/pet/PetSprite.vue`

**Files that should not be touched unless verification forces it:**

- `mcode-app/src/manifest.json`
- `mcode-app/src/pages.json`

---
