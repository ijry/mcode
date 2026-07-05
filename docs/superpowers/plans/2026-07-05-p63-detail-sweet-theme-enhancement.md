# P63 Sweet Theme Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the conversation-detail `sweet` theme into a richer "奶油果冻" look with a more transparent message area and a cuter layered background.

**Architecture:** Keep the existing `detailTheme` and `cyberEffectPhase` flow intact. Strengthen only the presentational path by enriching `ConversationDetailSweetBubbles.vue`, softening `.page--sweet` chrome in `index.scss`, and lowering `MessageBubble.vue` sweet-surface opacity while preserving text readability.

**Tech Stack:** Vue 3 `script setup`, uni-app, scoped SCSS, Jest source-contract tests, `uview-plus` runtime theme variables.

## Global Constraints

- Do not add new theme ids or new storage keys; keep `mcode_detail_theme_v1`.
- Do not change ACP payloads, websocket events, runtime store schemas, SQLite schemas, route contracts, or opened-tab sync.
- Keep `sweet` as a visual-only detail-page theme; do not add `matrix`-style decode or glitch effects.
- Prefer richer low-opacity, low-frequency decoration over high-frequency animation or sticker-heavy ornament.
- Do not introduce new `--mcode-*` theme aliases.
- Every mcode change must update `docs/mcode-architecture-notes/2026-07-05-p63-detail-cyber-mode.md`.

---

## File Structure

- Create: `mcode-app/tests/pages/conversation-detail/detailSweetTheme.spec.ts`
  Purpose: add a sweet-theme-only source-contract suite for background richness, page chrome, and bubble translucency.
- Modify: `mcode-app/src/pages/conversation-detail/ConversationDetailSweetBubbles.vue`
  Purpose: replace the single bubble field with layered large bubbles, small bubbles, and sparkle accents.
- Modify: `mcode-app/src/pages/conversation-detail/index.scss`
  Purpose: strengthen `.page--sweet` base, tabs, navbar, composer, panels, and send button into a jelly-pill system.
- Modify: `mcode-app/src/components/MessageBubble.vue`
  Purpose: lower sweet-theme bubble/card opacity while keeping nested content readable.
- Modify: `docs/mcode-architecture-notes/2026-07-05-p63-detail-cyber-mode.md`
  Purpose: document the enhanced `sweet` visual contract and native replication guidance.

### Task 1: Lock the Sweet Theme Source Contract in Tests

**Files:**
- Create: `mcode-app/tests/pages/conversation-detail/detailSweetTheme.spec.ts`

**Interfaces:**
- Consumes: `ConversationDetailSweetBubbles.vue`, `index.scss`, and `MessageBubble.vue` as UTF-8 source strings.
- Produces: three failing source-contract tests named `renders layered sweet atmosphere markup and motion`, `defines jelly chrome selectors for the sweet theme`, and `keeps sweet message surfaces translucent and readable`.

- [ ] **Step 1: Create the sweet-theme contract test file**

```ts
import fs from "node:fs"
import path from "node:path"

describe("detailSweetTheme", () => {
  it("renders layered sweet atmosphere markup and motion", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/ConversationDetailSweetBubbles.vue"),
      "utf8"
    )

    expect(source).toContain("largeBubbles")
    expect(source).toContain("smallBubbles")
    expect(source).toContain("sparkles")
    expect(source).toContain("sweet-bubbles__item sweet-bubbles__item--large")
    expect(source).toContain("sweet-bubbles__item sweet-bubbles__item--small")
    expect(source).toContain("sweet-bubbles__sparkle")
    expect(source).toContain("@keyframes sweetBubbleFloat")
    expect(source).toContain("@keyframes sweetBubbleSparkle")
  })

  it("defines jelly chrome selectors for the sweet theme", () => {
    const styles = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/index.scss"),
      "utf8"
    )

    expect(styles).toContain(".page--sweet")
    expect(styles).toContain(".page--sweet .detail-tabs-bar")
    expect(styles).toContain(".page--sweet .detail-tab-pill--active")
    expect(styles).toContain(".page--sweet .detail-dropdown-menu")
    expect(styles).toContain(":deep(.detail-interactive-pane--theme-sweet .input-wrap)")
    expect(styles).toContain(":deep(.detail-interactive-pane--theme-sweet .input-box)")
    expect(styles).toContain(":deep(.detail-interactive-pane--theme-sweet .send-btn)")
  })

  it("keeps sweet message surfaces translucent and readable", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/components/MessageBubble.vue"),
      "utf8"
    )

    expect(source).toContain("bubble-wrap--theme-sweet")
    expect(source).toContain("--message-sweet-text")
    expect(source).toContain("bubble-wrap--theme-sweet .bubble--user")
    expect(source).toContain("bubble-wrap--theme-sweet .part-thinking")
    expect(source).toContain("bubble-wrap--theme-sweet :deep(.goal-card)")
    expect(source).toContain("bubble-wrap--theme-sweet :deep(.tool-group__summary)")
  })
})
```

- [ ] **Step 2: Run the new test file and verify the new atmosphere assertions fail**

Run:

```bash
cd mcode-app
npm run test:unit -- --runTestsByPath tests/pages/conversation-detail/detailSweetTheme.spec.ts
```

Expected: FAIL because `ConversationDetailSweetBubbles.vue` does not yet contain `largeBubbles`, `smallBubbles`, `sparkles`, or `@keyframes sweetBubbleSparkle`.

### Task 2: Implement Layered Sweet Atmosphere

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/ConversationDetailSweetBubbles.vue`
- Test: `mcode-app/tests/pages/conversation-detail/detailSweetTheme.spec.ts`

**Interfaces:**
- Consumes: existing props `enabled?: boolean` and `phase?: CyberEffectPhase`.
- Produces: computed arrays `largeBubbles`, `smallBubbles`, `sparkles` and DOM classes `sweet-bubbles__item--large`, `sweet-bubbles__item--small`, `sweet-bubbles__sparkle`.

- [ ] **Step 1: Replace the single bubble list with three decorative groups**

```ts
const largeBubbles = computed(() =>
  Array.from({ length: 10 }, (_, index) => {
    const phase = props.phase || "idle"
    const size = 92 + (index % 4) * 32
    const duration =
      phase === "streaming" ? 9.2 : phase === "ramp" ? 10.4 : phase === "settle" ? 11.8 : 13.8

    return {
      id: `sweet-large-${index}`,
      style: {
        left: `${(index * 9.4 + (index % 3) * 3.2) % 96}%`,
        width: `${size}rpx`,
        height: `${size}rpx`,
        bottom: `${-10 - (index % 4) * 12}%`,
        opacity: phase === "streaming" ? 0.34 : phase === "ramp" ? 0.3 : 0.26,
        animationDuration: `${duration}s`,
        animationDelay: `${(index % 5) * -1.4}s`,
      },
    }
  })
)

const smallBubbles = computed(() =>
  Array.from({ length: 14 }, (_, index) => ({
    id: `sweet-small-${index}`,
    style: {
      left: `${(index * 6.7 + (index % 4) * 5.1) % 98}%`,
      width: `${30 + (index % 5) * 12}rpx`,
      height: `${30 + (index % 5) * 12}rpx`,
      bottom: `${-6 - (index % 3) * 11}%`,
      opacity: props.phase === "streaming" ? 0.26 : 0.2,
      animationDuration: `${11.6 + (index % 4) * 1.1}s`,
      animationDelay: `${(index % 6) * -1.05}s`,
    },
  }))
)

const sparkles = computed(() =>
  Array.from({ length: 8 }, (_, index) => ({
    id: `sweet-sparkle-${index}`,
    style: {
      left: `${(index * 11.8 + (index % 2) * 8.4) % 92}%`,
      top: `${14 + (index % 4) * 16}%`,
      animationDelay: `${index * -0.85}s`,
      opacity: props.phase === "streaming" ? 0.7 : 0.52,
    },
  }))
)
```

- [ ] **Step 2: Update the template and styles to render jelly bubbles and sparkles**

```vue
<view
  v-for="bubble in largeBubbles"
  :key="bubble.id"
  class="sweet-bubbles__item sweet-bubbles__item--large"
  :style="bubble.style"
></view>
<view
  v-for="bubble in smallBubbles"
  :key="bubble.id"
  class="sweet-bubbles__item sweet-bubbles__item--small"
  :style="bubble.style"
></view>
<view
  v-for="sparkle in sparkles"
  :key="sparkle.id"
  class="sweet-bubbles__sparkle"
  :style="sparkle.style"
></view>
```

```scss
.sweet-bubbles__item--large {
  box-shadow:
    inset -12rpx -14rpx 22rpx rgba(255, 255, 255, 0.2),
    inset 12rpx 14rpx 24rpx rgba(255, 255, 255, 0.52),
    0 22rpx 56rpx rgba(236, 72, 153, 0.12);
}

.sweet-bubbles__item--small {
  filter: blur(0.5rpx);
  box-shadow:
    inset 0 0 16rpx rgba(255, 255, 255, 0.42),
    0 10rpx 28rpx rgba(244, 114, 182, 0.08);
}

.sweet-bubbles__sparkle {
  position: absolute;
  width: 16rpx;
  height: 16rpx;
  border-radius: 999rpx;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.96) 0, rgba(255, 240, 250, 0.12) 72%, transparent 100%);
  box-shadow: 0 0 18rpx rgba(255, 255, 255, 0.44);
  animation: sweetBubbleSparkle 4.8s ease-in-out infinite;
}

@keyframes sweetBubbleSparkle {
  0%, 100% { transform: scale(0.72); opacity: 0.42; }
  50% { transform: scale(1); opacity: 0.82; }
}
```

- [ ] **Step 3: Run only the atmosphere contract test**

Run:

```bash
cd mcode-app
npm run test:unit -- --runTestsByPath tests/pages/conversation-detail/detailSweetTheme.spec.ts -t "renders layered sweet atmosphere markup and motion"
```

Expected: PASS.

### Task 3: Strengthen Sweet Page Chrome and Composer Styling

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/index.scss`
- Test: `mcode-app/tests/pages/conversation-detail/detailSweetTheme.spec.ts`

**Interfaces:**
- Consumes: `.page--sweet` page class and existing `detail-interactive-pane--theme-sweet` deep selectors.
- Produces: stronger jelly selectors for tabs, navbar, panels, input tray, and send button without changing component props.

- [ ] **Step 1: Soften the page base, navbar, and tabs**

```scss
.page--sweet {
  background:
    radial-gradient(circle at 16% 12%, rgba(255, 222, 238, 0.82) 0, transparent 24%),
    radial-gradient(circle at 82% 16%, rgba(255, 213, 246, 0.68) 0, transparent 24%),
    radial-gradient(circle at 50% 100%, rgba(255, 209, 227, 0.5) 0, transparent 34%),
    linear-gradient(180deg, #fffafc 0%, #fff2f8 48%, #fdeeff 100%) !important;
}

.page--sweet .detail-tabs-bar {
  background: rgba(255, 247, 251, 0.68) !important;
  box-shadow:
    0 0 0 1rpx rgba(236, 72, 153, 0.08),
    0 16rpx 36rpx rgba(244, 114, 182, 0.12);
}

.page--sweet .detail-tab-pill--active {
  border-color: rgba(236, 72, 153, 0.26);
  box-shadow:
    0 0 22rpx rgba(244, 114, 182, 0.16),
    inset 0 0 18rpx rgba(255, 255, 255, 0.42);
}
```

- [ ] **Step 2: Turn the composer and send button into jelly controls**

```scss
:deep(.detail-interactive-pane--theme-sweet .input-wrap),
:deep(.detail-interactive-pane--theme-sweet .composer-panel),
:deep(.detail-interactive-pane--theme-sweet .slash-panel),
:deep(.detail-interactive-pane--theme-sweet .mention-panel) {
  background: rgba(255, 250, 253, 0.46) !important;
  border-color: rgba(236, 72, 153, 0.14) !important;
  box-shadow:
    0 0 0 1rpx rgba(236, 72, 153, 0.05),
    0 18rpx 40rpx rgba(244, 114, 182, 0.1) !important;
}

:deep(.detail-interactive-pane--theme-sweet .input-box) {
  background: rgba(255, 255, 255, 0.34) !important;
  border: 1rpx solid rgba(244, 114, 182, 0.18);
}

:deep(.detail-interactive-pane--theme-sweet .send-btn) {
  background: radial-gradient(circle at 36% 24%, #ffe2f1 0, #f9a8d4 44%, #ec4899 100%) !important;
  box-shadow:
    0 0 24rpx rgba(244, 114, 182, 0.2),
    inset 0 0 18rpx rgba(255, 255, 255, 0.34);
}
```

- [ ] **Step 3: Run only the sweet chrome contract test**

Run:

```bash
cd mcode-app
npm run test:unit -- --runTestsByPath tests/pages/conversation-detail/detailSweetTheme.spec.ts -t "defines jelly chrome selectors for the sweet theme"
```

Expected: PASS.

### Task 4: Lighten Sweet Message Surfaces, Update Notes, and Verify

**Files:**
- Modify: `mcode-app/src/components/MessageBubble.vue`
- Modify: `docs/mcode-architecture-notes/2026-07-05-p63-detail-cyber-mode.md`
- Test: `mcode-app/tests/pages/conversation-detail/detailSweetTheme.spec.ts`
- Test: `mcode-app/tests/pages/conversation-detail/detailCyberMode.spec.ts`
- Test: `mcode-app/tests/pages/conversation-detail/detailCyberLayout.spec.ts`
- Test: `mcode-app/tests/pages/conversation-detail/messageBubbleCyberMode.spec.ts`
- Test: `mcode-app/tests/pages/conversation-detail/conversationDetailBodyContract.spec.ts`

**Interfaces:**
- Consumes: existing `bubble-wrap--theme-sweet` wrapper and current sweet nested-card selectors.
- Produces: lighter sweet bubble/card surfaces and updated architecture guidance for the richer background plus more transparent message zone.

- [ ] **Step 1: Lower sweet bubble and nested-card opacity without losing contrast**

```scss
.bubble-wrap--theme-sweet {
  --message-sweet-text: rgba(122, 40, 79, 0.86);
  --message-sweet-border: rgba(236, 72, 153, 0.16);
}

.bubble-wrap--theme-sweet .bubble {
  background:
    radial-gradient(circle at 24% 18%, rgba(255, 255, 255, 0.88), transparent 30%),
    linear-gradient(135deg, rgba(255, 221, 239, 0.34), rgba(255, 255, 255, 0.24)),
    rgba(255, 248, 252, 0.42) !important;
  box-shadow:
    inset 0 0 20rpx rgba(255, 255, 255, 0.26),
    0 16rpx 30rpx rgba(244, 114, 182, 0.08) !important;
}

.bubble-wrap--theme-sweet .part-thinking,
.bubble-wrap--theme-sweet .part-tool-result,
.bubble-wrap--theme-sweet .part-plan,
.bubble-wrap--theme-sweet :deep(.goal-card),
.bubble-wrap--theme-sweet :deep(.tool-block) {
  background: rgba(255, 240, 248, 0.34) !important;
  border-color: rgba(236, 72, 153, 0.14) !important;
}
```

- [ ] **Step 2: Update the mcode architecture note with the stronger sweet-theme contract**

```md
- `sweet` 主题：整页切换为奶油粉到淡莓紫的渐变背景，叠加大泡泡、小泡泡、少量星点高光与柔光斑。
- `sweet` 消息区使用更低 alpha 的 jelly glass surface：外层消息气泡和输入托盘比当前主题更透明，thinking/tool/plan 等内部块再降低一档不透明度，让可爱背景能穿透内容区。
- `sweet` 前景控件统一为果冻胶囊语言：tabs、navbar、panel、composer 与发送按钮共享圆润高光和轻描边，而不引入高频闪烁或文字解码。
```

- [ ] **Step 3: Run the sweet-theme test file and the full detail-theme regression set**

Run:

```bash
cd mcode-app
npm run test:unit -- --runTestsByPath tests/pages/conversation-detail/detailSweetTheme.spec.ts tests/pages/conversation-detail/detailCyberMode.spec.ts tests/pages/conversation-detail/detailCyberLayout.spec.ts tests/pages/conversation-detail/messageBubbleCyberMode.spec.ts tests/pages/conversation-detail/conversationDetailBodyContract.spec.ts
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
git add mcode-app/src/pages/conversation-detail/ConversationDetailSweetBubbles.vue mcode-app/src/pages/conversation-detail/index.scss mcode-app/src/components/MessageBubble.vue mcode-app/tests/pages/conversation-detail/detailSweetTheme.spec.ts docs/mcode-architecture-notes/2026-07-05-p63-detail-cyber-mode.md
git commit -m "feat(detail): sweeten the detail theme atmosphere"
```
