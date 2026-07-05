# P63 Summer Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `summer` detail-page theme for conversation detail with a strong `西瓜海浪` atmosphere, SVG-based seasonal decoration, and readable summer glass surfaces.

**Architecture:** Extend the existing detail-theme enum and page-shell wiring instead of introducing a separate path. Render a new page-level summer atmosphere component, add a summer branch in `index.scss`, and theme message bubbles through the existing `MessageBubble.vue` visual hook points.

**Tech Stack:** Vue 3 `script setup`, uni-app, scoped SCSS, SVG decoration, Jest source-contract tests, `uview-plus` runtime theme variables.

## Global Constraints

- Do not add per-conversation or per-tab theme overrides.
- Do not add text decode, glitch, or high-frequency motion to the summer theme.
- Do not build a full illustrated beach poster behind the conversation content.
- Do not introduce raster-only theme assets when SVG can express the shape cleanly.
- Do not weaken existing `default`, `matrix`, or `sweet` behavior.
- Do not change ACP, realtime, route, SQLite, or runtime store contracts.
- Keep detail theme state in `mcode_detail_theme_v1`.
- Every mcode change must update `docs/mcode-architecture-notes/2026-07-05-p63-detail-cyber-mode.md`.

---

## File Structure

- Create: `mcode-app/src/pages/conversation-detail/ConversationDetailSummerAtmosphere.vue`
  Purpose: render the page-level `西瓜海浪` summer decoration with SVG watermelon, palm, coconut, and wave layers.
- Create: `mcode-app/tests/pages/conversation-detail/detailSummerTheme.spec.ts`
  Purpose: add summer-theme source-contract coverage for atmosphere markup, summer page selectors, and bubble styling.
- Modify: `mcode-app/src/pages/conversation-detail/detailCyberMode.ts`
  Purpose: extend the detail-theme enum, theme menu options, and background precedence to include `summer`.
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`
  Purpose: mount the summer atmosphere component, extend theme-aware page style calculations, and keep the current shell flow intact.
- Modify: `mcode-app/src/pages/conversation-detail/index.scss`
  Purpose: add `.page--summer` page chrome, tabs, navbar, composer, and wave/beach styling.
- Modify: `mcode-app/src/components/MessageBubble.vue`
  Purpose: add `bubble-wrap--theme-summer` surfaces for assistant, user, and nested cards.
- Modify: `mcode-app/tests/pages/conversation-detail/detailCyberMode.spec.ts`
  Purpose: assert the new `summer` theme id and its storage/menu/background behavior.
- Modify: `mcode-app/tests/pages/conversation-detail/detailCyberLayout.spec.ts`
  Purpose: assert the summer atmosphere component and summer page selectors are wired from the detail shell.
- Modify: `docs/mcode-architecture-notes/2026-07-05-p63-detail-cyber-mode.md`
  Purpose: document the summer theme contract for web and native replication.

### Task 1: Lock Summer Theme Contracts in Tests

**Files:**
- Create: `mcode-app/tests/pages/conversation-detail/detailSummerTheme.spec.ts`
- Modify: `mcode-app/tests/pages/conversation-detail/detailCyberMode.spec.ts`
- Modify: `mcode-app/tests/pages/conversation-detail/detailCyberLayout.spec.ts`

**Interfaces:**
- Consumes: `detailCyberMode.ts`, `index.vue`, `index.scss`, `MessageBubble.vue`, and the future `ConversationDetailSummerAtmosphere.vue` as UTF-8 source strings.
- Produces: failing source-contract coverage for the new `summer` theme id, summer shell wiring, and summer-specific visual selectors.

- [ ] **Step 1: Create a dedicated summer-theme contract test file**

```ts
import fs from "node:fs"
import path from "node:path"

describe("detailSummerTheme", () => {
  it("renders summer atmosphere markup and seasonal svg layers", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/ConversationDetailSummerAtmosphere.vue"),
      "utf8"
    )

    expect(source).toContain("summer-atmosphere")
    expect(source).toContain("waveLayers")
    expect(source).toContain("watermelonSlices")
    expect(source).toContain("palmLeaves")
    expect(source).toContain("coconuts")
    expect(source).toContain("summer-atmosphere__wave")
    expect(source).toContain("summer-atmosphere__slice")
    expect(source).toContain("summer-atmosphere__leaf")
    expect(source).toContain("summer-atmosphere__coconut")
  })

  it("defines summer page chrome selectors", () => {
    const styles = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/index.scss"),
      "utf8"
    )

    expect(styles).toContain(".page--summer")
    expect(styles).toContain(".page--summer .detail-tabs-bar")
    expect(styles).toContain(".page--summer .detail-tab-pill--active")
    expect(styles).toContain(":deep(.detail-interactive-pane--theme-summer .input-wrap)")
    expect(styles).toContain(":deep(.detail-interactive-pane--theme-summer .send-btn)")
  })

  it("defines summer message bubble surfaces", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/components/MessageBubble.vue"),
      "utf8"
    )

    expect(source).toContain("bubble-wrap--theme-summer")
    expect(source).toContain("--message-summer-text")
    expect(source).toContain("bubble-wrap--theme-summer .bubble--user")
    expect(source).toContain("bubble-wrap--theme-summer .part-thinking")
    expect(source).toContain("bubble-wrap--theme-summer :deep(.goal-card)")
  })
})
```

- [ ] **Step 2: Extend detail-theme and shell tests to expect `summer`**

Add these assertions to `mcode-app/tests/pages/conversation-detail/detailCyberMode.spec.ts`:

```ts
expect(DETAIL_THEME_OPTIONS).toHaveLength(4)
expect(normalizeDetailThemeStorage("summer")).toBe("summer")
expect(buildDetailThemeMenuActions("summer").map((item) => item.id)).toEqual([
  "default",
  "matrix",
  "sweet",
  "summer",
])
expect(shouldShowDetailBackgroundImage({
  detailTheme: "summer",
  detailBackgroundImageUrl: "file://bg.png",
})).toBe(false)
expect(deriveCyberEffectPhase({
  detailTheme: "summer",
  runtimeStatus: "thinking",
  hasLiveMessage: false,
  lastStreamEndedAt: 0,
  now: 100,
})).toBe("ramp")
```

Add these assertions to `mcode-app/tests/pages/conversation-detail/detailCyberLayout.spec.ts`:

```ts
expect(source).toContain("<ConversationDetailSummerAtmosphere")
expect(source).toContain(':enabled="detailTheme === \'summer\'"')
expect(styles).toContain(".page--summer")
expect(styles).toContain(":deep(.detail-interactive-pane--theme-summer .input-wrap)")
```

- [ ] **Step 3: Run the focused summer test set and confirm it fails before implementation**

Run:

```bash
cd mcode-app
npm run test:unit -- --runTestsByPath tests/pages/conversation-detail/detailSummerTheme.spec.ts tests/pages/conversation-detail/detailCyberMode.spec.ts tests/pages/conversation-detail/detailCyberLayout.spec.ts
```

Expected: FAIL because `ConversationDetailSummerAtmosphere.vue` does not exist yet and the current theme enum/menu/layout still only know `default`, `matrix`, and `sweet`.

### Task 2: Extend the Theme Registry and Detail Shell Wiring

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/detailCyberMode.ts`
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`
- Test: `mcode-app/tests/pages/conversation-detail/detailCyberMode.spec.ts`
- Test: `mcode-app/tests/pages/conversation-detail/detailCyberLayout.spec.ts`

**Interfaces:**
- Consumes: existing `DetailThemeId`, `DETAIL_THEME_OPTIONS`, `deriveCyberEffectPhase(...)`, `detailThemePageStyle`, and page-shell atmosphere mounting in `index.vue`.
- Produces: a `summer` theme id, a `"西瓜海浪"` theme option, and a page shell that mounts the summer atmosphere component and theme colors.

- [ ] **Step 1: Extend the detail-theme enum and helpers**

Change `mcode-app/src/pages/conversation-detail/detailCyberMode.ts` like this:

```ts
export type DetailThemeId = "default" | "matrix" | "sweet" | "summer"

export const DETAIL_THEME_OPTIONS: DetailThemeOption[] = [
  { id: "default", name: "默认主题", color: "#2979ff" },
  { id: "matrix", name: "微黑暗帝国", color: "#22c55e" },
  { id: "sweet", name: "甜心泡泡", color: "#ec4899" },
  { id: "summer", name: "西瓜海浪", color: "#06b6d4" },
]

export function isExperimentalDetailTheme(theme: DetailThemeId) {
  return theme === "matrix" || theme === "sweet" || theme === "summer"
}

function isDetailThemeId(value: unknown): value is DetailThemeId {
  return value === "default" || value === "matrix" || value === "sweet" || value === "summer"
}
```

- [ ] **Step 2: Mount the summer atmosphere component from the detail shell**

Add this import and markup to `mcode-app/src/pages/conversation-detail/index.vue`:

```vue
import ConversationDetailSummerAtmosphere from "./ConversationDetailSummerAtmosphere.vue"
```

```vue
<ConversationDetailSummerAtmosphere
  :enabled="detailTheme === 'summer'"
  :phase="cyberEffectPhase"
/>
```

Place the summer atmosphere beside the existing `ConversationDetailCyberRain` and `ConversationDetailSweetBubbles` elements in the page-level atmosphere layer.

- [ ] **Step 3: Extend theme-aware page shell styles and colors for summer**

Update the summer branches in `index.vue` where `detailThemePageStyle`, navbar colors, subtitle colors, and page background color are computed:

```ts
if (detailTheme.value === "summer") {
  return {
    background:
      "linear-gradient(180deg, #8de8ff 0%, #55d3ff 36%, #2fb2df 55%, #ffd67f 55%, #efb95a 100%)",
  }
}
```

```ts
detailTheme.value === "summer" && "page--summer",
detailTheme.value === "summer" && `page--summer-${cyberEffectPhase.value}`,
```

```ts
: detailTheme.value === "summer"
  ? "rgba(232, 250, 255, 0.84)"
```

```ts
: detailTheme.value === "summer"
  ? "#0b6580"
```

```ts
: detailTheme.value === "summer"
  ? "#0f7a92"
```

- [ ] **Step 4: Run the theme-registry and shell test set**

Run:

```bash
cd mcode-app
npm run test:unit -- --runTestsByPath tests/pages/conversation-detail/detailCyberMode.spec.ts tests/pages/conversation-detail/detailCyberLayout.spec.ts
```

Expected: still FAIL because the summer atmosphere component and summer stylesheet branch are not implemented yet, but enum/menu/storage assertions should now pass.

### Task 3: Implement the Summer Atmosphere Component and Summer Page Chrome

**Files:**
- Create: `mcode-app/src/pages/conversation-detail/ConversationDetailSummerAtmosphere.vue`
- Modify: `mcode-app/src/pages/conversation-detail/index.scss`
- Test: `mcode-app/tests/pages/conversation-detail/detailSummerTheme.spec.ts`
- Test: `mcode-app/tests/pages/conversation-detail/detailCyberLayout.spec.ts`

**Interfaces:**
- Consumes: `enabled?: boolean`, `phase?: CyberEffectPhase`, and the page shell class `page--summer`.
- Produces: layout arrays `waveLayers`, `watermelonSlices`, `palmLeaves`, `coconuts` plus `.page--summer` selectors for navbar, tabs, composer, and panels.

- [ ] **Step 1: Create the summer atmosphere component with SVG-backed decorative groups**

Create `mcode-app/src/pages/conversation-detail/ConversationDetailSummerAtmosphere.vue` with this structure:

```vue
<template>
  <view v-if="enabled" :class="['summer-atmosphere', `summer-atmosphere--${phase}`]" aria-hidden="true">
    <view
      v-for="wave in waveLayers"
      :key="wave.id"
      class="summer-atmosphere__wave"
      :style="wave.style"
    ></view>
    <svg
      v-for="slice in watermelonSlices"
      :key="slice.id"
      class="summer-atmosphere__slice"
      viewBox="0 0 112 112"
      :style="slice.style"
    >
      <path d="M18 68c9-28 41-44 72-35-4 18-14 30-28 37-14 7-29 8-44 5z" fill="#ff5a6e" />
      <path d="M18 68c5 15 18 24 38 27 18 2 33-2 46-12-5 13-16 22-31 27-21 7-40 3-53-12z" fill="#2fb84f" />
      <path d="M23 69c11-21 38-33 64-27-5 11-13 20-24 25-12 5-25 7-40 2z" fill="#ff90a0" />
    </svg>
    <svg
      v-for="leaf in palmLeaves"
      :key="leaf.id"
      class="summer-atmosphere__leaf"
      viewBox="0 0 128 106"
      :style="leaf.style"
    >
      <path d="M18 97c7-23 24-47 49-65 15-11 33-20 50-24-5 20-16 39-32 56-18 18-39 29-67 33z" fill="#1fa56d" />
      <path d="M42 91c7-22 19-43 37-62" stroke="#dff9e9" stroke-width="7" stroke-linecap="round" />
    </svg>
    <svg
      v-for="coconut in coconuts"
      :key="coconut.id"
      class="summer-atmosphere__coconut"
      viewBox="0 0 88 88"
      :style="coconut.style"
    >
      <ellipse cx="44" cy="52" rx="26" ry="22" fill="#8f5f2d" />
      <path d="M18 52c8-16 22-25 26-25s18 9 26 25c-8 8-17 12-26 12s-18-4-26-12z" fill="#fff5da" />
      <rect x="40" y="16" width="8" height="20" rx="4" fill="#4f7b2f" />
    </svg>
  </view>
</template>
```

Define these computed collections:

```ts
const waveLayers = computed(() =>
  Array.from({ length: 3 }, (_, index) => ({
    id: `summer-wave-${index}`,
    style: {
      left: index === 0 ? "-8%" : "-4%",
      right: index === 0 ? "-8%" : "-4%",
      bottom: `${84 - index * 18}rpx`,
      opacity: phase.value === "streaming" ? 0.44 - index * 0.08 : 0.32 - index * 0.06,
      animationDuration: `${15 + index * 2.6}s`,
    },
  }))
)

const watermelonSlices = computed(() => [
  { id: "slice-top", style: { top: "52rpx", left: "8rpx", width: "132rpx", opacity: 0.9 } },
  { id: "slice-mid", style: { top: "148rpx", right: "10rpx", width: "118rpx", opacity: 0.82 } },
])

const palmLeaves = computed(() => [
  { id: "leaf-left", style: { top: "0", left: "0", width: "156rpx", opacity: 0.92 } },
  { id: "leaf-right", style: { top: "8rpx", right: "-8rpx", width: "118rpx", opacity: 0.86 } },
])

const coconuts = computed(() => [
  { id: "coconut-bottom", style: { bottom: "134rpx", right: "18rpx", width: "102rpx", opacity: 0.84 } },
])
```

- [ ] **Step 2: Add the summer page and composer selectors in `index.scss`**

Add a summer branch in `mcode-app/src/pages/conversation-detail/index.scss` like this:

```scss
.page--summer {
  position: relative;
  background:
    linear-gradient(180deg, #8de8ff 0%, #55d3ff 36%, #2fb2df 55%, #ffd67f 55%, #efb95a 100%) !important;
  background-color: #87e2ff !important;
  color: #0b6580;
}

.page--summer::before,
.page--summer::after {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 33;
}

.page--summer .detail-tabs-bar {
  background: rgba(233, 249, 255, 0.62) !important;
  border-color: rgba(10, 153, 186, 0.12) !important;
  box-shadow: 0 14rpx 32rpx rgba(11, 101, 128, 0.12);
}

:deep(.detail-interactive-pane--theme-summer .input-wrap),
:deep(.detail-interactive-pane--theme-summer .composer-panel),
:deep(.detail-interactive-pane--theme-summer .slash-panel),
:deep(.detail-interactive-pane--theme-summer .mention-panel) {
  background: rgba(240, 252, 255, 0.42) !important;
  border-color: rgba(11, 122, 146, 0.16) !important;
  box-shadow: 0 16rpx 34rpx rgba(11, 101, 128, 0.12) !important;
}

:deep(.detail-interactive-pane--theme-summer .send-btn) {
  background: linear-gradient(180deg, #ff8da1 0%, #f43f5e 100%) !important;
  box-shadow:
    0 0 26rpx rgba(244, 63, 94, 0.24),
    inset 0 0 18rpx rgba(255, 255, 255, 0.28);
}
```

- [ ] **Step 3: Run summer atmosphere and layout tests**

Run:

```bash
cd mcode-app
npm run test:unit -- --runTestsByPath tests/pages/conversation-detail/detailSummerTheme.spec.ts tests/pages/conversation-detail/detailCyberLayout.spec.ts
```

Expected: PASS for the atmosphere markup and summer page selector assertions.

### Task 4: Add Summer Bubble Styling, Update Notes, and Verify the Full Theme Suite

**Files:**
- Modify: `mcode-app/src/components/MessageBubble.vue`
- Modify: `docs/mcode-architecture-notes/2026-07-05-p63-detail-cyber-mode.md`
- Test: `mcode-app/tests/pages/conversation-detail/detailSummerTheme.spec.ts`
- Test: `mcode-app/tests/pages/conversation-detail/detailCyberMode.spec.ts`
- Test: `mcode-app/tests/pages/conversation-detail/detailCyberLayout.spec.ts`
- Test: `mcode-app/tests/pages/conversation-detail/detailSweetTheme.spec.ts`
- Test: `mcode-app/tests/pages/conversation-detail/messageBubbleCyberMode.spec.ts`
- Test: `mcode-app/tests/pages/conversation-detail/conversationDetailBodyContract.spec.ts`

**Interfaces:**
- Consumes: the generic wrapper class `bubble-wrap--theme-summer` already emitted by `MessageBubble.vue` when `detailTheme` is `summer`.
- Produces: sea-glass and juice-glass summer message surfaces plus updated architecture guidance for the new theme.

- [ ] **Step 1: Add a summer bubble branch to `MessageBubble.vue`**

Append a summer theme block like this:

```scss
.bubble-wrap--theme-summer {
  --message-summer-text: rgba(8, 85, 109, 0.9);
  --message-summer-border: rgba(14, 136, 165, 0.2);
}

.bubble-wrap--theme-summer .bubble {
  border-radius: 28rpx;
  border: 1rpx solid var(--message-summer-border) !important;
  background:
    radial-gradient(circle at 24% 18%, rgba(255, 255, 255, 0.88), transparent 32%),
    linear-gradient(135deg, rgba(202, 244, 255, 0.34), rgba(255, 255, 255, 0.22)),
    rgba(239, 252, 255, 0.38) !important;
  color: var(--message-summer-text) !important;
}

.bubble-wrap--theme-summer .bubble--user {
  background:
    radial-gradient(circle at 28% 20%, rgba(255, 255, 255, 0.88), transparent 30%),
    linear-gradient(135deg, rgba(255, 222, 191, 0.44), rgba(255, 149, 169, 0.2)),
    rgba(255, 247, 232, 0.42) !important;
}

.bubble-wrap--theme-summer .part-thinking,
.bubble-wrap--theme-summer .part-tool-result,
.bubble-wrap--theme-summer .part-plan,
.bubble-wrap--theme-summer :deep(.goal-card),
.bubble-wrap--theme-summer :deep(.tool-block) {
  background: rgba(237, 250, 255, 0.28) !important;
  border-color: rgba(14, 136, 165, 0.14) !important;
}
```

- [ ] **Step 2: Document the summer theme in the mcode architecture note**

Add these lines to `docs/mcode-architecture-notes/2026-07-05-p63-detail-cyber-mode.md`:

```md
- `summer` 主题：整页切换为海水蓝到浅沙金的上下分层背景，叠加海浪、西瓜片、椰叶和椰子等强元素，形成“西瓜海浪”夏日限定皮肤。
- `summer` 消息区使用海盐玻璃与果汁玻璃两类低 alpha surface：assistant 偏海水蓝白，user 可带轻微暖果汁色，thinking/tool/plan 等内部块继续比外层更透明。
- `summer` 只借用 `idle | ramp | streaming | settle` 阶段调背景强弱，不做文字解码或高频闪烁。
```

- [ ] **Step 3: Run the full detail-theme regression set**

Run:

```bash
cd mcode-app
npm run test:unit -- --runTestsByPath tests/pages/conversation-detail/detailSummerTheme.spec.ts tests/pages/conversation-detail/detailCyberMode.spec.ts tests/pages/conversation-detail/detailCyberLayout.spec.ts tests/pages/conversation-detail/detailSweetTheme.spec.ts tests/pages/conversation-detail/messageBubbleCyberMode.spec.ts tests/pages/conversation-detail/conversationDetailBodyContract.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Build H5 and verify the diff is clean**

Run:

```bash
cd mcode-app
pnpm run build:h5
cd ..
git diff --check
```

Expected: `build:h5` completes successfully. `git diff --check` may print existing LF/CRLF conversion warnings on Windows, but it must not report trailing-whitespace or conflict-marker errors.

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/pages/conversation-detail/ConversationDetailSummerAtmosphere.vue mcode-app/src/pages/conversation-detail/detailCyberMode.ts mcode-app/src/pages/conversation-detail/index.vue mcode-app/src/pages/conversation-detail/index.scss mcode-app/src/components/MessageBubble.vue mcode-app/tests/pages/conversation-detail/detailSummerTheme.spec.ts mcode-app/tests/pages/conversation-detail/detailCyberMode.spec.ts mcode-app/tests/pages/conversation-detail/detailCyberLayout.spec.ts docs/mcode-architecture-notes/2026-07-05-p63-detail-cyber-mode.md
git commit -m "feat(detail): add summer detail theme"
```
