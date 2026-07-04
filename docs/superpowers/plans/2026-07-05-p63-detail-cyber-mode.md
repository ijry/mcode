# P63 Conversation Detail Cyber Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global experimental cyber mode to `mcode-app` conversation detail so the whole page shifts into a Matrix-like terminal presentation and the active streaming assistant message decodes from falling `0/1` characters into the realtime text.

**Architecture:** Keep the feature entirely inside `mcode-app/src/pages/conversation-detail/` as a presentation-only enhancement. Add one pure cyber-mode helper module, one page-local DOM rain component, page-shell toggle wiring, and an optional `MessageBubble` overlay for the active streaming assistant message while preserving all existing ACP, realtime, SQLite, opened-tab, and runtime flows.

**Tech Stack:** Vue 3 `script setup`, uni-app, uview-plus theme variables, Jest source/logic tests, scoped SCSS.

## Global Constraints

- Do not change ACP payloads, websocket events, or runtime store schemas.
- Do not change SQLite schema, opened-tab sync, route contracts, or conversation runtime authority.
- The toggle is truly global for `mcode-app` conversation detail and must use the storage key `mcode_detail_cyber_mode_v1`.
- Do not make cyber mode per conversation or per tab in this iteration.
- Do not introduce a Canvas-based renderer in the first version.
- Use DOM/CSS effects first and confine stronger animation to the active streaming assistant message.
- Styling must continue using `uview-plus` runtime `--up-*` variables directly; do not add `--mcode-*` theme aliases.
- Cyber mode visually takes precedence over custom detail background imagery, but background-image storage must remain untouched.
- Only the active pane should run the stronger realtime decode effect; readonly and off-window tabs stay on the weak ambiance path.
- Every `mcode` change must include or update a Markdown note under `docs/mcode-architecture-notes/`.

---

## File Structure

- Create: `mcode-app/src/pages/conversation-detail/detailCyberMode.ts`
  Purpose: Pure cyber-mode helpers for storage normalization, menu copy, phase derivation, background precedence, and text decoding.
- Create: `mcode-app/src/pages/conversation-detail/ConversationDetailCyberRain.vue`
  Purpose: Page-local DOM binary-rain atmosphere that accepts `enabled` and phase props.
- Create: `mcode-app/tests/pages/conversation-detail/detailCyberMode.spec.ts`
  Purpose: Unit coverage for the new pure helper module.
- Create: `mcode-app/tests/pages/conversation-detail/detailCyberLayout.spec.ts`
  Purpose: Source-contract coverage for shell wiring, cyber rain component usage, and cyber layout props/classes.
- Create: `mcode-app/tests/pages/conversation-detail/messageBubbleCyberMode.spec.ts`
  Purpose: Source-contract coverage for `MessageBubble` decode overlay wiring and timer cleanup.
- Create: `docs/mcode-architecture-notes/2026-07-05-p63-detail-cyber-mode.md`
  Purpose: Short architecture note covering the new visual mode, compatibility, and native replication guidance.
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`
  Purpose: Restore/persist the global toggle, add the cyber menu action, hide background imagery when enabled, derive the cyber phase, render the rain component, and pass cyber props into the active pane.
- Modify: `mcode-app/src/pages/conversation-detail/ConversationDetailBody.vue`
  Purpose: Accept cyber props and expose stable root classes for shell-level styling.
- Modify: `mcode-app/src/pages/conversation-detail/ConversationDetailInteractivePane.vue`
  Purpose: Accept cyber props, add cyber root classes, forward props into `ConversationDetailBody`, and later pass them into `MessageBubble`.
- Modify: `mcode-app/src/pages/conversation-detail/ConversationDetailReadonlyTimeline.vue`
  Purpose: Accept cyber props, add readonly cyber classes, and forward passive cyber props into `MessageBubble`.
- Modify: `mcode-app/src/components/MessageBubble.vue`
  Purpose: Add the optional streaming decode overlay for assistant text and keep all non-text/non-streaming content on the current rendering path.
- Modify: `mcode-app/src/pages/conversation-detail/index.scss`
  Purpose: Add black/green terminal page styling, cyber tabs/composer surfaces, and low-noise scanline accents without changing the existing light/translucent baseline when cyber mode is off.
- Modify: `mcode-app/tests/pages/conversation-detail/conversationDetailBodyContract.spec.ts`
  Purpose: Extend current conversation-detail contract coverage for the new global menu action and shell prop wiring.

### Task 1: Add Pure Cyber-Mode Helpers

**Files:**
- Create: `mcode-app/src/pages/conversation-detail/detailCyberMode.ts`
- Test: `mcode-app/tests/pages/conversation-detail/detailCyberMode.spec.ts`

**Interfaces:**
- Consumes: Current conversation-detail runtime status strings such as `idle`, `connecting`, `thinking`, `running_tool`, `waiting_permission`, and `waiting_question`.
- Produces: `DETAIL_CYBER_MODE_STORAGE_KEY: "mcode_detail_cyber_mode_v1"`, `type CyberEffectPhase = "idle" | "ramp" | "streaming" | "settle"`, `normalizeCyberModeStorage(raw: unknown): boolean`, `buildCyberModeMenuAction(enabled: boolean): { name: string; color: string }`, `shouldShowDetailBackgroundImage(input: { cyberModeEnabled: boolean; detailBackgroundImageUrl: string }): boolean`, `deriveCyberEffectPhase(input: { cyberModeEnabled: boolean; runtimeStatus: string; hasLiveMessage: boolean; lastStreamEndedAt: number; now: number }): CyberEffectPhase`, and `buildCyberDecodeText(input: { text: string; progress: number; tick: number; glyphs?: string }): string`.

- [ ] **Step 1: Write the failing helper test**

```ts
import {
  DETAIL_CYBER_MODE_STORAGE_KEY,
  buildCyberDecodeText,
  buildCyberModeMenuAction,
  deriveCyberEffectPhase,
  normalizeCyberModeStorage,
  shouldShowDetailBackgroundImage,
} from "@/pages/conversation-detail/detailCyberMode"

describe("detailCyberMode", () => {
  it("normalizes stored toggle snapshots and menu actions", () => {
    expect(DETAIL_CYBER_MODE_STORAGE_KEY).toBe("mcode_detail_cyber_mode_v1")
    expect(normalizeCyberModeStorage(true)).toBe(true)
    expect(normalizeCyberModeStorage('{"enabled":true}')).toBe(true)
    expect(normalizeCyberModeStorage('{"enabled":false}')).toBe(false)
    expect(normalizeCyberModeStorage("garbage")).toBe(false)
    expect(buildCyberModeMenuAction(false)).toEqual({
      name: "炫酷模式",
      color: "#22c55e",
    })
    expect(buildCyberModeMenuAction(true)).toEqual({
      name: "关闭炫酷模式",
      color: "#19be6b",
    })
  })

  it("derives phases and background precedence", () => {
    expect(shouldShowDetailBackgroundImage({
      cyberModeEnabled: false,
      detailBackgroundImageUrl: "file://bg.png",
    })).toBe(true)
    expect(shouldShowDetailBackgroundImage({
      cyberModeEnabled: true,
      detailBackgroundImageUrl: "file://bg.png",
    })).toBe(false)

    expect(deriveCyberEffectPhase({
      cyberModeEnabled: true,
      runtimeStatus: "idle",
      hasLiveMessage: false,
      lastStreamEndedAt: 0,
      now: 100,
    })).toBe("idle")
    expect(deriveCyberEffectPhase({
      cyberModeEnabled: true,
      runtimeStatus: "thinking",
      hasLiveMessage: false,
      lastStreamEndedAt: 0,
      now: 100,
    })).toBe("ramp")
    expect(deriveCyberEffectPhase({
      cyberModeEnabled: true,
      runtimeStatus: "thinking",
      hasLiveMessage: true,
      lastStreamEndedAt: 0,
      now: 100,
    })).toBe("streaming")
    expect(deriveCyberEffectPhase({
      cyberModeEnabled: true,
      runtimeStatus: "idle",
      hasLiveMessage: false,
      lastStreamEndedAt: 1_000,
      now: 1_600,
    })).toBe("settle")
  })

  it("keeps decode text length stable while revealing the prefix first", () => {
    const text = "hello world"
    const early = buildCyberDecodeText({ text, progress: 0.2, tick: 1 })
    const late = buildCyberDecodeText({ text, progress: 0.8, tick: 1 })

    expect(early).toHaveLength(text.length)
    expect(late).toHaveLength(text.length)
    expect(late.startsWith("hello")).toBe(true)
    expect(late).not.toBe(text)
  })
})
```

- [ ] **Step 2: Run the helper test to verify it fails**

Run: `cd mcode-app && npm run test:unit -- --runTestsByPath tests/pages/conversation-detail/detailCyberMode.spec.ts`
Expected: FAIL with `Cannot find module '@/pages/conversation-detail/detailCyberMode'` or missing export errors.

- [ ] **Step 3: Write the helper module**

```ts
export const DETAIL_CYBER_MODE_STORAGE_KEY = "mcode_detail_cyber_mode_v1"

export type CyberEffectPhase = "idle" | "ramp" | "streaming" | "settle"

const DEFAULT_GLYPHS = "0101010110010110<>/|[]{}"
const SETTLE_WINDOW_MS = 1_200

export function normalizeCyberModeStorage(raw: unknown): boolean {
  if (raw === true || raw === "true" || raw === 1 || raw === "1") return true
  if (
    raw === false ||
    raw === "false" ||
    raw === 0 ||
    raw === "0" ||
    raw == null ||
    raw === ""
  ) {
    return false
  }

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw)
      return normalizeCyberModeStorage(
        parsed && typeof parsed === "object" && "enabled" in parsed
          ? (parsed as { enabled?: unknown }).enabled
          : parsed
      )
    } catch {
      return false
    }
  }

  if (typeof raw === "object" && raw && "enabled" in raw) {
    return Boolean((raw as { enabled?: unknown }).enabled)
  }

  return false
}

export function buildCyberModeMenuAction(enabled: boolean) {
  return enabled
    ? { name: "关闭炫酷模式", color: "#19be6b" }
    : { name: "炫酷模式", color: "#22c55e" }
}

export function shouldShowDetailBackgroundImage(input: {
  cyberModeEnabled: boolean
  detailBackgroundImageUrl: string
}) {
  return !input.cyberModeEnabled && String(input.detailBackgroundImageUrl || "").trim().length > 0
}

export function deriveCyberEffectPhase(input: {
  cyberModeEnabled: boolean
  runtimeStatus: string
  hasLiveMessage: boolean
  lastStreamEndedAt: number
  now: number
}): CyberEffectPhase {
  if (!input.cyberModeEnabled) return "idle"
  if (input.hasLiveMessage) return "streaming"

  const status = String(input.runtimeStatus || "idle")
  if (
    status === "connecting" ||
    status === "thinking" ||
    status === "running_tool" ||
    status === "waiting_permission" ||
    status === "waiting_question"
  ) {
    return "ramp"
  }

  if (input.lastStreamEndedAt > 0 && input.now - input.lastStreamEndedAt < SETTLE_WINDOW_MS) {
    return "settle"
  }

  return "idle"
}

export function buildCyberDecodeText(input: {
  text: string
  progress: number
  tick: number
  glyphs?: string
}) {
  const text = String(input.text || "")
  if (!text) return ""

  const glyphs = String(input.glyphs || DEFAULT_GLYPHS)
  const progress = Math.max(0, Math.min(1, Number(input.progress || 0)))
  const revealedCount = Math.max(0, Math.min(text.length, Math.floor(text.length * progress)))
  const chars = text.split("")

  return chars
    .map((char, index) => {
      if (char === "\n") return "\n"
      if (char === " ") return " "
      if (index < revealedCount) return char
      const glyphIndex = Math.abs((index * 17 + Number(input.tick || 0) * 13) % glyphs.length)
      return glyphs[glyphIndex]
    })
    .join("")
}
```

- [ ] **Step 4: Run the helper test to verify it passes**

Run: `cd mcode-app && npm run test:unit -- --runTestsByPath tests/pages/conversation-detail/detailCyberMode.spec.ts`
Expected: PASS with `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/pages/conversation-detail/detailCyberMode.ts mcode-app/tests/pages/conversation-detail/detailCyberMode.spec.ts
git commit -m "feat(detail): add cyber mode helper logic"
```

### Task 2: Wire the Global Toggle into the Detail Shell

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`
- Modify: `mcode-app/tests/pages/conversation-detail/conversationDetailBodyContract.spec.ts`

**Interfaces:**
- Consumes: `DETAIL_CYBER_MODE_STORAGE_KEY`, `normalizeCyberModeStorage(...)`, `buildCyberModeMenuAction(...)`, `shouldShowDetailBackgroundImage(...)`, and `deriveCyberEffectPhase(...)` from Task 1.
- Produces: `const cyberModeEnabled = ref(false)`, `const cyberEffectPhase = computed<CyberEffectPhase>(...)`, `restoreCyberModePreference(): void`, `persistCyberModePreference(enabled: boolean): void`, and `toggleCyberModeFromMenu(): void`.

- [ ] **Step 1: Extend the detail-shell contract test**

```ts
it("restores and forwards the global cyber mode from the detail more menu", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../../../src/pages/conversation-detail/index.vue"),
    "utf8"
  )

  expect(source).toContain("DETAIL_CYBER_MODE_STORAGE_KEY")
  expect(source).toContain("buildCyberModeMenuAction(cyberModeEnabled.value)")
  expect(source).toContain('action === "炫酷模式" || action === "关闭炫酷模式"')
  expect(source).toContain('title: nextEnabled ? "炫酷模式已开启" : "炫酷模式已关闭"')
  expect(source).toContain("restoreCyberModePreference()")
  expect(source).toContain("shouldShowDetailBackgroundImage")
  expect(source).toContain('page--cyber')
})
```

- [ ] **Step 2: Run the contract test to verify it fails**

Run: `cd mcode-app && npm run test:unit -- --runTestsByPath tests/pages/conversation-detail/conversationDetailBodyContract.spec.ts -t "restores and forwards the global cyber mode from the detail more menu"`
Expected: FAIL because the new helper imports, menu action, classes, and pane props are not present yet.

- [ ] **Step 3: Implement the page-shell toggle wiring**

Update the `index.vue` template root and background-image guards:

```vue
<view
  class="page"
  :class="[cyberModeEnabled && 'page--cyber', cyberModeEnabled && `page--cyber-${cyberEffectPhase}`]"
  :style="[upThemeVars, upThemePageStyle]"
>
  <view class="detail-atmosphere" aria-hidden="true">
    <image
      v-if="showDetailBackgroundImage"
      class="detail-atmosphere__background-image"
      :src="detailBackgroundImageUrl"
      mode="aspectFill"
      @error="handleDetailBackgroundLoadError"
    />
    <view v-if="showDetailBackgroundImage" class="detail-atmosphere__background-scrim"></view>
    <view class="detail-atmosphere__blob detail-atmosphere__blob--primary"></view>
    <view class="detail-atmosphere__blob detail-atmosphere__blob--secondary"></view>
    <view class="detail-atmosphere__blob detail-atmosphere__blob--accent"></view>
  </view>
</view>
```

Add the new imports, refs, computed values, and menu branch:

```ts
import {
  DETAIL_CYBER_MODE_STORAGE_KEY,
  buildCyberModeMenuAction,
  deriveCyberEffectPhase,
  normalizeCyberModeStorage,
  shouldShowDetailBackgroundImage,
  type CyberEffectPhase,
} from "./detailCyberMode"

const cyberModeEnabled = ref(false)
const lastCyberStreamEndedAt = ref(0)

const showDetailBackgroundImage = computed(() =>
  shouldShowDetailBackgroundImage({
    cyberModeEnabled: cyberModeEnabled.value,
    detailBackgroundImageUrl: detailBackgroundImageUrl.value,
  })
)
const hasDetailBackgroundImage = computed(() => showDetailBackgroundImage.value)
const cyberEffectPhase = computed<CyberEffectPhase>(() =>
  deriveCyberEffectPhase({
    cyberModeEnabled: cyberModeEnabled.value,
    runtimeStatus: runtimeStatus.value,
    hasLiveMessage: Boolean(
      session.value?.liveMessage && !session.value?.liveMessage?.isPlaceholderThinking
    ),
    lastStreamEndedAt: lastCyberStreamEndedAt.value,
    now: Date.now(),
  })
)

watch(
  () => session.value?.liveMessage?.id || "",
  (next, previous) => {
    if (previous && !next) {
      lastCyberStreamEndedAt.value = Date.now()
    }
  },
  { flush: "sync" }
)

function restoreCyberModePreference() {
  cyberModeEnabled.value = normalizeCyberModeStorage(
    uni.getStorageSync(DETAIL_CYBER_MODE_STORAGE_KEY)
  )
}

function persistCyberModePreference(enabled: boolean) {
  cyberModeEnabled.value = enabled
  uni.setStorageSync(DETAIL_CYBER_MODE_STORAGE_KEY, JSON.stringify({ enabled }))
}

function toggleCyberModeFromMenu() {
  const nextEnabled = !cyberModeEnabled.value
  persistCyberModePreference(nextEnabled)
  uni.showToast({
    title: nextEnabled ? "炫酷模式已开启" : "炫酷模式已关闭",
    icon: "none",
  })
}

const detailMoreActions = computed(() => [
  { name: "模型供应商", color: "#2979ff" },
  { name: "文件夹管理", color: "#2979ff" },
  buildCyberModeMenuAction(cyberModeEnabled.value),
  { name: "背景图自定义", color: "#8b5cf6" },
  { name: "重命名", color: "#2979ff" },
  { name: "更改状态", color: "#2979ff" },
  { name: "删除", color: "#fa3534" },
])
```

Call restore during load/show and branch the menu click handler:

```ts
onLoad((options: any) => {
  conversationId.value = Number(options.id || 0)
  folderId.value = Number(options.folderId || 0)
  needsResumeRefresh.value = false
  restoreCyberModePreference()
  // existing route parsing continues here
})

onShow(() => {
  restoreCyberModePreference()
  if (!hasLoadedOnce.value || !conversationId.value || loading.value) return
  if (!needsResumeRefresh.value) return
  // existing resume flow continues here
})

function handleDetailMoreMenuClick(action: string) {
  if (action === "模型供应商") {
    openDetailModelProvidersPage()
  } else if (action === "文件夹管理") {
    openDetailProjectsPage()
  } else if (action === "炫酷模式" || action === "关闭炫酷模式") {
    toggleCyberModeFromMenu()
  } else if (action === "背景图自定义") {
    openDetailBackgroundPicker()
  } else if (action === "重命名") {
    renameCurrentDetailConversation()
  } else if (action === "更改状态") {
    openCurrentDetailConversationStatusPicker()
  } else if (action === "删除") {
    confirmDeleteCurrentDetailConversation()
  }
  closeDetailMoreMenu()
}
```

- [ ] **Step 4: Run the shell contract test to verify it passes**

Run: `cd mcode-app && npm run test:unit -- --runTestsByPath tests/pages/conversation-detail/conversationDetailBodyContract.spec.ts -t "restores and forwards the global cyber mode from the detail more menu"`
Expected: PASS with the new cyber-menu assertions satisfied.

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/pages/conversation-detail/index.vue mcode-app/tests/pages/conversation-detail/conversationDetailBodyContract.spec.ts
git commit -m "feat(detail): wire global cyber mode into the detail shell"
```

### Task 3: Add the Cyber Rain Atmosphere and Shell-Level Styling

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`
- Create: `mcode-app/src/pages/conversation-detail/ConversationDetailCyberRain.vue`
- Create: `mcode-app/tests/pages/conversation-detail/detailCyberLayout.spec.ts`
- Modify: `mcode-app/src/pages/conversation-detail/ConversationDetailBody.vue`
- Modify: `mcode-app/src/pages/conversation-detail/ConversationDetailInteractivePane.vue`
- Modify: `mcode-app/src/pages/conversation-detail/ConversationDetailReadonlyTimeline.vue`
- Modify: `mcode-app/src/pages/conversation-detail/index.scss`

**Interfaces:**
- Consumes: `type CyberEffectPhase` from Task 1 and the shell props added in Task 2.
- Produces: `ConversationDetailCyberRain` with props `enabled?: boolean` and `phase?: CyberEffectPhase`; `cyberModeEnabled?: boolean` and `cyberEffectPhase?: CyberEffectPhase` on `ConversationDetailBody`, `ConversationDetailInteractivePane`, and `ConversationDetailReadonlyTimeline`; shell classes `page--cyber`, `detail-body--cyber`, `detail-interactive-pane--cyber`, and `readonly-pane--cyber`.

- [ ] **Step 1: Write the failing cyber-layout contract test**

```ts
import fs from "node:fs"
import path from "node:path"

describe("detailCyberLayout", () => {
  it("renders the cyber rain atmosphere from the detail shell", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/index.vue"),
      "utf8"
    )

    expect(source).toContain("<ConversationDetailCyberRain")
    expect(source).toContain(':enabled="cyberModeEnabled"')
    expect(source).toContain(':phase="cyberEffectPhase"')
  })

  it("threads cyber props through the detail body layers", () => {
    const body = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/ConversationDetailBody.vue"),
      "utf8"
    )
    const interactive = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/ConversationDetailInteractivePane.vue"),
      "utf8"
    )
    const readonly = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/ConversationDetailReadonlyTimeline.vue"),
      "utf8"
    )

    expect(body).toContain("cyberModeEnabled?: boolean")
    expect(body).toContain("cyberEffectPhase?: CyberEffectPhase")
    expect(body).toContain("detail-body--cyber")
    expect(interactive).toContain("cyberModeEnabled?: boolean")
    expect(interactive).toContain("detail-interactive-pane--cyber")
    expect(interactive).toContain(':cyber-mode-enabled="cyberModeEnabled"')
    expect(readonly).toContain("readonly-pane--cyber")
  })

  it("defines cyber-specific layout selectors and rain animation", () => {
    const styles = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/index.scss"),
      "utf8"
    )
    const rain = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/ConversationDetailCyberRain.vue"),
      "utf8"
    )

    expect(styles).toContain(".page--cyber")
    expect(styles).toContain(".detail-tabs-bar--cyber")
    expect(styles).toContain("page--cyber-streaming")
    expect(styles).toContain("@keyframes cyberScanPulse")
    expect(rain).toContain("@keyframes cyberRainColumn")
    expect(rain).toContain("cyber-rain__column")
  })
})
```

- [ ] **Step 2: Run the cyber-layout contract test to verify it fails**

Run: `cd mcode-app && npm run test:unit -- --runTestsByPath tests/pages/conversation-detail/detailCyberLayout.spec.ts`
Expected: FAIL because the rain component, new props, and cyber selectors do not exist yet.

- [ ] **Step 3: Implement the rain component, shell props, and cyber classes**

Create the DOM-based rain component:

```vue
<template>
  <view v-if="enabled" :class="['cyber-rain', `cyber-rain--${phase}`]" aria-hidden="true">
    <view
      v-for="column in columns"
      :key="column.id"
      class="cyber-rain__column"
      :style="column.style"
    >
      <text class="cyber-rain__stream">{{ column.stream }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue"
import type { CyberEffectPhase } from "./detailCyberMode"

const props = withDefaults(defineProps<{
  enabled?: boolean
  phase?: CyberEffectPhase
}>(), {
  enabled: false,
  phase: "idle",
})

const BASE_STREAMS = [
  "01010100101100101010010110100101",
  "10100101010110010101101001010110",
  "00101101001010110010101001011010",
  "11001010100101101001010110010101",
  "01011010010101100101010010110100",
  "10101100101010010110100101011001",
]

const columns = computed(() =>
  BASE_STREAMS.map((stream, index) => {
    const phase = props.phase || "idle"
    const duration =
      phase === "streaming" ? 7.2 : phase === "ramp" ? 10.4 : phase === "settle" ? 8.4 : 13.6
    const opacity =
      phase === "streaming" ? 0.56 : phase === "ramp" ? 0.34 : phase === "settle" ? 0.26 : 0.18

    return {
      id: `cyber-col-${index}`,
      stream: stream.split("").join("\n"),
      style: {
        left: `${8 + index * 14}%`,
        animationDelay: `${(index % 5) * -1.5}s`,
        animationDuration: `${duration + index * 0.35}s`,
        opacity,
      },
    }
  })
)
</script>

<style scoped lang="scss">
.cyber-rain {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  mix-blend-mode: screen;
}

.cyber-rain__column {
  position: absolute;
  top: -36%;
  width: 40rpx;
  height: 172%;
  animation: cyberRainColumn linear infinite;
}

.cyber-rain__stream {
  display: block;
  white-space: pre-line;
  font-size: 18rpx;
  line-height: 20rpx;
  font-family: "Courier New", monospace;
  color: rgba(110, 255, 163, 0.82);
  text-shadow: 0 0 12rpx rgba(58, 255, 136, 0.3);
}

@keyframes cyberRainColumn {
  from { transform: translate3d(0, -12%, 0); }
  to { transform: translate3d(0, 42%, 0); }
}
</style>
```

Add cyber props and root classes to the body and pane layers:

```vue
<!-- index.vue -->
<ConversationDetailCyberRain :enabled="cyberModeEnabled" :phase="cyberEffectPhase" />

<ConversationDetailInteractivePane
  v-else-if="shouldRenderDetailTabPage(index)"
  :conversation-id="tab.conversationId"
  :folder-id="tab.folderId"
  :agent-type="tab.agentType"
  :instance-key="detailConnectionKey"
  :active="isActiveDetailTabPage(index)"
  :message-list-page-style="messageListPageStyle"
  :message-list-content-style="messageListContentStyle"
  :input-wrap-style="upThemeCardStyle"
  :translucent-message-list="hasDetailBackgroundImage"
  :slash-commands="slashCommands"
  :upload-target="detailUploadTarget"
  :cyber-mode-enabled="cyberModeEnabled"
  :cyber-effect-phase="cyberEffectPhase"
  @layout-change="measureMessageListHeight"
/>
```

```ts
// index.vue
import ConversationDetailCyberRain from "./ConversationDetailCyberRain.vue"
```

```vue
<!-- ConversationDetailBody.vue -->
<view
  :class="[
    'detail-body',
    cyberModeEnabled && 'detail-body--cyber',
    cyberModeEnabled && `detail-body--${cyberEffectPhase || 'idle'}`,
  ]"
>
```

```ts
import { computed, type StyleValue } from "vue"
import type { CyberEffectPhase } from "./detailCyberMode"

const props = defineProps<{
  messageListPageStyle?: StyleValue
  messageListContentStyle?: StyleValue
  inputWrapStyle?: StyleValue
  translucentMessageList?: boolean
  messageScrollTop?: number
  messageScrollIntoView?: string
  messageScrollWithAnimation?: boolean
  upperThreshold?: number
  cyberModeEnabled?: boolean
  cyberEffectPhase?: CyberEffectPhase
}>()
```

```vue
<!-- ConversationDetailInteractivePane.vue -->
<view
  :class="[
    'detail-interactive-pane',
    cyberModeEnabled && 'detail-interactive-pane--cyber',
    cyberModeEnabled && `detail-interactive-pane--${cyberEffectPhase || 'idle'}`,
  ]"
>
  <ConversationDetailBody
    :message-list-page-style="messageListPageStyle"
    :message-list-content-style="messageListContentStyle"
    :input-wrap-style="inputWrapStyle"
    :translucent-message-list="translucentMessageList"
    :message-scroll-top="messageScrollTop"
    :message-scroll-into-view="messageScrollIntoView"
    :message-scroll-with-animation="messageScrollWithAnimation"
    :upper-threshold="120"
    :cyber-mode-enabled="cyberModeEnabled"
    :cyber-effect-phase="cyberEffectPhase"
    @message-scroll="handleMessageListScroll"
    @message-scroll-upper="handleMessageListScrollUpper"
  >
```

```ts
import type { CyberEffectPhase } from "./detailCyberMode"

const props = defineProps<{
  conversationId: number
  folderId: number
  agentType?: string
  instanceKey?: string
  active?: boolean
  messageListPageStyle?: StyleValue
  messageListContentStyle?: StyleValue
  inputWrapStyle?: StyleValue
  translucentMessageList?: boolean
  slashCommands?: SlashCommandItem[]
  uploadTarget?: { url: string; header: Record<string, string> } | null
  cyberModeEnabled?: boolean
  cyberEffectPhase?: CyberEffectPhase
}>()
```

```vue
<!-- ConversationDetailReadonlyTimeline.vue -->
<view
  :class="[
    'readonly-pane',
    cyberModeEnabled && 'readonly-pane--cyber',
    cyberModeEnabled && `readonly-pane--${cyberEffectPhase || 'idle'}`,
  ]"
  :style="messageListPageStyle"
>
```

```ts
import { computed, type StyleValue } from "vue"
import type { CyberEffectPhase } from "./detailCyberMode"

const props = defineProps<{
  conversationId: number
  agentType?: string
  messageListPageStyle?: StyleValue
  messageListContentStyle?: StyleValue
  cyberModeEnabled?: boolean
  cyberEffectPhase?: CyberEffectPhase
}>()
```

Add page-level cyber styling to `index.scss`:

```scss
.page--cyber {
  background:
    radial-gradient(circle at top right, rgba(33, 255, 121, 0.14) 0, transparent 28%),
    radial-gradient(circle at bottom left, rgba(10, 180, 84, 0.1) 0, transparent 34%),
    linear-gradient(180deg, #03130a 0%, #010a05 52%, #000603 100%);
}

.page--cyber .detail-navbar__title,
.page--cyber .detail-navbar__subtitle,
.page--cyber .detail-tab-pill__title,
.page--cyber .input-status-row__text,
.page--cyber .stats-text {
  color: #8dffb4;
}

.page--cyber .detail-tabs-bar {
  background: rgba(4, 19, 10, 0.82);
  border-color: rgba(96, 255, 161, 0.12);
}

.page--cyber .detail-tabs-bar--cyber,
.page--cyber .detail-tab-pill,
.page--cyber .input-box,
.page--cyber .tool-toggle-btn,
.page--cyber .composer-panel,
.page--cyber .slash-panel,
.page--cyber .mention-panel,
.page--cyber .pending-response-card,
.page--cyber .permission-card,
.page--cyber .ask-question-card {
  background: rgba(7, 24, 13, 0.78);
  border-color: rgba(103, 255, 167, 0.16);
  box-shadow: 0 0 0 1rpx rgba(79, 255, 151, 0.08), 0 16rpx 34rpx rgba(0, 0, 0, 0.28);
}

.page--cyber .send-btn {
  background: linear-gradient(135deg, rgba(31, 212, 108, 0.94), rgba(7, 122, 56, 0.96));
  box-shadow: 0 0 18rpx rgba(54, 255, 136, 0.28);
}

.page--cyber .message-item {
  position: relative;
}

.page--cyber .message-item::after {
  content: "";
  position: absolute;
  inset: -4rpx 0 auto 0;
  height: 1rpx;
  background: linear-gradient(90deg, transparent, rgba(111, 255, 169, 0.16), transparent);
}

.page--cyber .detail-body--cyber .input-status-wrap,
.page--cyber .detail-body--cyber .input-wrap {
  background: rgba(5, 20, 11, 0.78);
  border-color: rgba(102, 255, 166, 0.18);
}

.page--cyber-streaming .detail-body--cyber .input-status-wrap,
.page--cyber-ramp .detail-body--cyber .input-status-wrap {
  animation: cyberScanPulse 1.8s ease-in-out infinite;
}

@keyframes cyberScanPulse {
  0%, 100% { box-shadow: 0 0 0 1rpx rgba(89, 255, 154, 0.1), 0 0 16rpx rgba(47, 255, 133, 0.08); }
  50% { box-shadow: 0 0 0 1rpx rgba(89, 255, 154, 0.24), 0 0 28rpx rgba(47, 255, 133, 0.22); }
}
```

- [ ] **Step 4: Run the cyber-layout contract test to verify it passes**

Run: `cd mcode-app && npm run test:unit -- --runTestsByPath tests/pages/conversation-detail/detailCyberLayout.spec.ts`
Expected: PASS with `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/pages/conversation-detail/index.vue mcode-app/src/pages/conversation-detail/ConversationDetailCyberRain.vue mcode-app/src/pages/conversation-detail/ConversationDetailBody.vue mcode-app/src/pages/conversation-detail/ConversationDetailInteractivePane.vue mcode-app/src/pages/conversation-detail/ConversationDetailReadonlyTimeline.vue mcode-app/src/pages/conversation-detail/index.scss mcode-app/tests/pages/conversation-detail/detailCyberLayout.spec.ts
git commit -m "feat(detail): add cyber rain shell styling"
```

### Task 4: Add the Streaming Assistant Decode Overlay

**Files:**
- Create: `mcode-app/tests/pages/conversation-detail/messageBubbleCyberMode.spec.ts`
- Modify: `mcode-app/src/components/MessageBubble.vue`
- Modify: `mcode-app/src/pages/conversation-detail/ConversationDetailInteractivePane.vue`
- Modify: `mcode-app/src/pages/conversation-detail/ConversationDetailReadonlyTimeline.vue`

**Interfaces:**
- Consumes: `buildCyberDecodeText(...)` and `CyberEffectPhase` from Task 1; `cyberModeEnabled` and `cyberEffectPhase` props from Task 3.
- Produces: `MessageBubble` props `cyberModeEnabled?: boolean`, `cyberEffectPhase?: CyberEffectPhase`, and `cyberActive?: boolean`; helper functions `shouldRenderCyberDecode(text: string): boolean` and `renderCyberDecodeText(text: string, index: number): string`.

- [ ] **Step 1: Write the failing message-bubble cyber contract test**

```ts
import fs from "node:fs"
import path from "node:path"

describe("messageBubbleCyberMode", () => {
  it("renders a decode overlay only for streaming assistant text", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/components/MessageBubble.vue"),
      "utf8"
    )

    expect(source).toContain("cyberModeEnabled?: boolean")
    expect(source).toContain("cyberEffectPhase?: CyberEffectPhase")
    expect(source).toContain("cyberActive?: boolean")
    expect(source).toContain("buildCyberDecodeText")
    expect(source).toContain("part-text__cyber-overlay")
    expect(source).toContain("setInterval")
    expect(source).toContain("clearInterval")
  })

  it("threads cyber props into message bubbles from detail timelines", () => {
    const interactive = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/ConversationDetailInteractivePane.vue"),
      "utf8"
    )
    const readonly = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/ConversationDetailReadonlyTimeline.vue"),
      "utf8"
    )

    expect(interactive).toContain(':cyber-mode-enabled="Boolean(cyberModeEnabled && active)"')
    expect(interactive).toContain(':cyber-effect-phase="cyberEffectPhase || \'idle\'"')
    expect(interactive).toContain(':cyber-active="Boolean(cyberModeEnabled && active)"')
    expect(readonly).toContain(':cyber-mode-enabled="cyberModeEnabled"')
    expect(readonly).toContain(':cyber-active="false"')
  })
})
```

- [ ] **Step 2: Run the message-bubble cyber contract test to verify it fails**

Run: `cd mcode-app && npm run test:unit -- --runTestsByPath tests/pages/conversation-detail/messageBubbleCyberMode.spec.ts`
Expected: FAIL because the new props, timer, and overlay classes do not exist yet.

- [ ] **Step 3: Implement the decode overlay and bubble prop wiring**

Update the `MessageBubble.vue` props, timer lifecycle, and text rendering branch:

```vue
<view v-if="part.type === 'text'" class="part-text">
  <view v-if="shouldRenderCyberDecode(part.text || '')" class="part-text__cyber">
    <up-markdown class="part-text__cyber-real" :content="part.text || ''"></up-markdown>
    <text class="part-text__cyber-overlay">{{ renderCyberDecodeText(part.text || '', index) }}</text>
  </view>
  <up-markdown v-else :content="part.text || ''"></up-markdown>
</view>
```

```ts
import { computed, onBeforeUnmount, ref, watch } from "vue"
import {
  buildCyberDecodeText,
  type CyberEffectPhase,
} from "@/pages/conversation-detail/detailCyberMode"

const props = defineProps<{
  message: MessageTurn
  agentType?: string
  showRegenerate?: boolean
  translucent?: boolean
  cyberModeEnabled?: boolean
  cyberEffectPhase?: CyberEffectPhase
  cyberActive?: boolean
}>()

const cyberTick = ref(0)
let cyberTimer: ReturnType<typeof setInterval> | null = null

const showCyberDecodeOverlay = computed(() =>
  Boolean(
    props.cyberModeEnabled &&
    props.cyberActive &&
    props.message.role === "assistant" &&
    props.message.status === "streaming"
  )
)

const textSignature = computed(() =>
  (props.message.content || [])
    .filter((part) => part.type === "text")
    .map((part) => part.text || "")
    .join("\n")
)

watch(
  showCyberDecodeOverlay,
  (active) => {
    if (cyberTimer) {
      clearInterval(cyberTimer)
      cyberTimer = null
    }
    if (!active) {
      cyberTick.value = 0
      return
    }
    cyberTimer = setInterval(() => {
      cyberTick.value += 1
    }, 90)
  },
  { immediate: true }
)

watch(
  textSignature,
  () => {
    if (showCyberDecodeOverlay.value) {
      cyberTick.value = 0
    }
  },
  { flush: "sync" }
)

onBeforeUnmount(() => {
  if (cyberTimer) clearInterval(cyberTimer)
})

function shouldRenderCyberDecode(text: string) {
  if (!showCyberDecodeOverlay.value) return false
  const normalized = String(text || "")
  if (!normalized.trim()) return false
  return !/```|^\s*#|^\s*[-*]\s|\|.+\|/m.test(normalized)
}

function renderCyberDecodeText(text: string, index: number) {
  return buildCyberDecodeText({
    text,
    progress: Math.min(0.92, 0.18 + cyberTick.value * 0.06),
    tick: cyberTick.value + index * 11,
  })
}
```

Add the cyber text styles:

```scss
.part-text__cyber {
  position: relative;
  min-height: 1em;
}

.part-text__cyber-real {
  opacity: 0.26;
  filter: saturate(0.82);
}

.part-text__cyber-overlay {
  position: absolute;
  inset: 0;
  display: block;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  line-height: 1.2;
  font-family: "Courier New", monospace;
  color: #78ff9d;
  text-shadow: 0 0 10rpx rgba(68, 255, 144, 0.34);
  pointer-events: none;
  animation: cyberTextGlitch 0.18s steps(2) infinite;
}

@keyframes cyberTextGlitch {
  0%, 100% { opacity: 0.92; transform: translateX(0); }
  50% { opacity: 0.74; transform: translateX(2rpx); }
}
```

Wire the new props from the active and readonly timelines:

```vue
<!-- ConversationDetailInteractivePane.vue -->
<MessageBubble
  :message="item.message"
  :agent-type="normalizedAgentType"
  :showRegenerate="index === renderMessageItems.length - 1 && item.message.role === 'assistant'"
  :translucent="translucentMessageList"
  :cyber-mode-enabled="Boolean(cyberModeEnabled && active)"
  :cyber-effect-phase="cyberEffectPhase || 'idle'"
  :cyber-active="Boolean(cyberModeEnabled && active)"
  @regenerate="regenerateLastMessage"
/>
```

```vue
<!-- ConversationDetailReadonlyTimeline.vue -->
<MessageBubble
  :message="item.message"
  :agent-type="agentType"
  :showRegenerate="false"
  :cyber-mode-enabled="cyberModeEnabled"
  :cyber-effect-phase="cyberEffectPhase || 'idle'"
  :cyber-active="false"
/>
```

- [ ] **Step 4: Run the message-bubble cyber contract test to verify it passes**

Run: `cd mcode-app && npm run test:unit -- --runTestsByPath tests/pages/conversation-detail/messageBubbleCyberMode.spec.ts`
Expected: PASS with `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/components/MessageBubble.vue mcode-app/src/pages/conversation-detail/ConversationDetailInteractivePane.vue mcode-app/src/pages/conversation-detail/ConversationDetailReadonlyTimeline.vue mcode-app/tests/pages/conversation-detail/messageBubbleCyberMode.spec.ts
git commit -m "feat(detail): decode streaming assistant text in cyber mode"
```

### Task 5: Add the Architecture Note and Run Final Verification

**Files:**
- Create: `docs/mcode-architecture-notes/2026-07-05-p63-detail-cyber-mode.md`
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`
- Modify: `mcode-app/src/pages/conversation-detail/index.scss`
- Modify: `mcode-app/src/components/MessageBubble.vue`
- Modify: `mcode-app/src/pages/conversation-detail/ConversationDetailInteractivePane.vue`
- Modify: `mcode-app/src/pages/conversation-detail/ConversationDetailReadonlyTimeline.vue`
- Modify: `mcode-app/src/pages/conversation-detail/ConversationDetailBody.vue`
- Modify: `mcode-app/src/pages/conversation-detail/ConversationDetailCyberRain.vue`
- Modify: `mcode-app/tests/pages/conversation-detail/detailCyberMode.spec.ts`
- Modify: `mcode-app/tests/pages/conversation-detail/detailCyberLayout.spec.ts`
- Modify: `mcode-app/tests/pages/conversation-detail/messageBubbleCyberMode.spec.ts`
- Modify: `mcode-app/tests/pages/conversation-detail/conversationDetailBodyContract.spec.ts`

**Interfaces:**
- Consumes: Completed code from Tasks 1-4.
- Produces: A permanent architecture note at `docs/mcode-architecture-notes/2026-07-05-p63-detail-cyber-mode.md` and a green verification pass for focused Jest tests plus type-checking.

- [ ] **Step 1: Verify the architecture note does not already exist**

Run: `if (Test-Path 'docs/mcode-architecture-notes/2026-07-05-p63-detail-cyber-mode.md') { Write-Error 'note already exists'; exit 1 }`
Expected: PASS with no output because the new note file has not been created yet.

- [ ] **Step 2: Write the architecture note**

```md
# 2026-07-05 P63 Detail Cyber Mode

## Architecture

`mcode-app` conversation detail adds a page-local experimental cyber mode with one global storage key: `mcode_detail_cyber_mode_v1`.

The page shell at `mcode-app/src/pages/conversation-detail/index.vue` remains the owner of the toggle, runtime phase derivation, and page-level atmosphere classes. Pure helper logic lives in `detailCyberMode.ts`. The page-wide binary rain is rendered by `ConversationDetailCyberRain.vue`. Streaming decode stays in `MessageBubble.vue` as an optional overlay for the active assistant message only.

## Protocol And Data Flow

No ACP, realtime, SQLite, routing, opened-tab, or runtime schema changes are introduced.

Conversation detail still restores local-first state, reconnects realtime, and renders the same message content. Cyber mode only reads:

- the global toggle from local storage
- the current runtime status
- the presence of the active `liveMessage`
- the current assistant text content

Background-image storage remains unchanged. When cyber mode is enabled, the existing shared background image is hidden but not deleted.

## UI Behavior

- The conversation-detail more menu exposes `炫酷模式` / `关闭炫酷模式`.
- The entire page shifts into a dark green terminal treatment when enabled.
- Idle state keeps a weak binary rain.
- Thinking / tool-running states increase page intensity.
- The active streaming assistant text decodes from falling `0/1` glyphs into the real realtime message.
- Completed messages settle back into the standard readable bubble while the page returns to weak idle ambiance.

## Compatibility

- The feature is presentation-only and optional.
- Only the active pane runs the stronger decode overlay.
- Readonly and off-window tabs stay on the weak ambiance path.
- Platforms with weaker CSS performance can keep the green shell styling and reduced overlay intensity while preserving readable text.

## Native iOS And Android Guidance

- Mirror the same global boolean toggle and four-phase state machine: `idle`, `ramp`, `streaming`, `settle`.
- Keep the effect in the screen/controller layer rather than changing message or protocol models.
- Hide custom detail background imagery while cyber mode is active without clearing stored user configuration.
- Only animate the active streaming assistant message into decoded text; keep the rest of the timeline readable.
```

- [ ] **Step 3: Run focused tests and type-checking**

Run: `cd mcode-app && npm run test:unit -- --runTestsByPath tests/pages/conversation-detail/detailCyberMode.spec.ts tests/pages/conversation-detail/detailCyberLayout.spec.ts tests/pages/conversation-detail/messageBubbleCyberMode.spec.ts tests/pages/conversation-detail/conversationDetailBodyContract.spec.ts`
Expected: PASS with all targeted cyber-mode and existing detail-shell contract tests green.

Run: `cd mcode-app && npx vue-tsc --noEmit`
Expected: PASS with no type errors for the new helper types, pane props, or `MessageBubble` props.

Run: `Test-Path 'docs/mcode-architecture-notes/2026-07-05-p63-detail-cyber-mode.md'`
Expected: `True`

- [ ] **Step 4: Commit**

```bash
git add docs/mcode-architecture-notes/2026-07-05-p63-detail-cyber-mode.md mcode-app/src/pages/conversation-detail/index.vue mcode-app/src/pages/conversation-detail/index.scss mcode-app/src/pages/conversation-detail/ConversationDetailBody.vue mcode-app/src/pages/conversation-detail/ConversationDetailInteractivePane.vue mcode-app/src/pages/conversation-detail/ConversationDetailReadonlyTimeline.vue mcode-app/src/pages/conversation-detail/ConversationDetailCyberRain.vue mcode-app/src/components/MessageBubble.vue mcode-app/tests/pages/conversation-detail/detailCyberMode.spec.ts mcode-app/tests/pages/conversation-detail/detailCyberLayout.spec.ts mcode-app/tests/pages/conversation-detail/messageBubbleCyberMode.spec.ts mcode-app/tests/pages/conversation-detail/conversationDetailBodyContract.spec.ts
git commit -m "docs(mcode): add P63 cyber mode architecture note"
```
