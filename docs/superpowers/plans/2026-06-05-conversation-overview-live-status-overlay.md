# Conversation Overview Live Status Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the default mcode conversation overview cards update to a running or failed state immediately while the user stays on the overview page, without changing history-mode behavior or adding new realtime subscriptions.

**Architecture:** Keep `connectionGroups` as the existing snapshot source of truth for overview cards, then add a page-local derived display status that overlays `conversationRuntime.sessions` onto each default overview card at render time. Runtime states only affect `displayStatus`; they never mutate the stored snapshot cards, and `idle` always falls back to the persisted summary status already on the card.

**Tech Stack:** Vue 3, TypeScript, uni-app, Pinia

---

## File Structure

- Modify: `mcode-app/src/pages/conversations/index.vue`
  - Keep the page responsible for overview data loading, filtering, and rendering.
  - Add a page-local display-card type plus runtime-to-summary mapping helpers.
  - Update the default overview template to render `displayStatus` instead of raw snapshot `status`.

## Task 1: Add Derived Display Status for Default Overview Cards

**Files:**
- Modify: `mcode-app/src/pages/conversations/index.vue`
- Test: `mcode-app/package.json`

- [ ] **Step 1: Add a failing typecheck target by switching the overview template to `displayStatus` before the field exists**

In `mcode-app/src/pages/conversations/index.vue`, change the default overview card status rendering from:

```vue
<view :class="['status-chip', `status-chip--${statusClass(card.status)}`]">
  <text class="status-chip__text">{{ statusLabel(card.status) }}</text>
</view>
<view
  v-if="statusClass(card.status) === 'running'"
  class="status-wave"
></view>
```

to:

```vue
<view :class="['status-chip', `status-chip--${statusClass(card.displayStatus)}`]">
  <text class="status-chip__text">{{ statusLabel(card.displayStatus) }}</text>
</view>
<view
  v-if="statusClass(card.displayStatus) === 'running'"
  class="status-wave"
></view>
```

Do not define `displayStatus` yet.

- [ ] **Step 2: Run typecheck to confirm the template now fails**

Run:

```bash
pnpm exec vue-tsc --noEmit -p tsconfig.json
```

Workdir:

```bash
mcode-app
```

Expected: FAIL with a Vue template type error indicating `displayStatus` does not exist on the current card type.

- [ ] **Step 3: Add explicit display-card types so the page can carry both snapshot status and derived status**

In `mcode-app/src/pages/conversations/index.vue`, replace the existing local type block:

```ts
interface LiveSessionCard {
  tabId: number
  conversationId?: number
  folderId: number
  projectName: string
  agentType: string
  title: string
  updatedAt?: string
  status: string
  isActive: boolean
}

interface ConnectionGroup extends ConnectionConversationSnapshot {
  cards: LiveSessionCard[]
}
```

with:

```ts
interface LiveSessionCard {
  tabId: number
  conversationId?: number
  folderId: number
  projectName: string
  agentType: string
  title: string
  updatedAt?: string
  status: string
  isActive: boolean
}

interface DisplayLiveSessionCard extends LiveSessionCard {
  displayStatus: string
}

interface DisplayConnectionGroup extends ConnectionGroup {
  cards: DisplayLiveSessionCard[]
}

interface ConnectionGroup extends ConnectionConversationSnapshot {
  cards: LiveSessionCard[]
}
```

This preserves `connectionGroups` as raw snapshot data while allowing `filteredConnectionGroups` to expose derived cards to the template.

- [ ] **Step 4: Add runtime-status mapping helpers that overlay runtime state without mutating the stored cards**

In `mcode-app/src/pages/conversations/index.vue`, add these helpers near the existing status helpers:

```ts
function mapRuntimeStatusToOverviewStatus(status?: string | null): string | null {
  const normalized = String(status || "").trim().toLowerCase()
  if (!normalized) return null
  if (
    normalized === "waiting_permission" ||
    normalized === "thinking" ||
    normalized === "running_tool" ||
    normalized === "connecting" ||
    normalized === "connected"
  ) {
    return "in_progress"
  }
  if (normalized === "error") {
    return "failed"
  }
  if (normalized === "idle") {
    return null
  }
  return null
}

function resolveOverviewCardStatus(card: LiveSessionCard): string {
  const conversationId = Number(card.conversationId || 0)
  if (conversationId <= 0) {
    return card.status
  }

  const runtimeSession = runtime.sessions.get(conversationId)
  if (!runtimeSession) {
    return card.status
  }

  return mapRuntimeStatusToOverviewStatus(runtimeSession.status) || card.status
}
```

This keeps `idle` as a fallback trigger, not a rendered status.

- [ ] **Step 5: Make `filteredConnectionGroups` derive display cards from runtime state**

In `mcode-app/src/pages/conversations/index.vue`, replace the current computed:

```ts
const filteredConnectionGroups = computed(() => {
  const kw = searchKeyword.value.trim().toLowerCase()
  if (!kw) return connectionGroups.value
  return connectionGroups.value
    .map((group) => ({
      ...group,
      cards: group.cards.filter((card) =>
        [
          card.title || "",
          card.projectName || "",
          formatAgentType(card.agentType),
        ]
          .join(" ")
          .toLowerCase()
          .includes(kw)
      ),
    }))
    .filter(
      (group) =>
        group.cards.length > 0 ||
        group.name.toLowerCase().includes(kw) ||
        group.url.toLowerCase().includes(kw)
    )
})
```

with:

```ts
const filteredConnectionGroups = computed<DisplayConnectionGroup[]>(() => {
  const kw = searchKeyword.value.trim().toLowerCase()
  const groups = connectionGroups.value.map((group) => ({
    ...group,
    cards: group.cards.map((card) => ({
      ...card,
      displayStatus: resolveOverviewCardStatus(card),
    })),
  }))

  if (!kw) return groups

  return groups
    .map((group) => ({
      ...group,
      cards: group.cards.filter((card) =>
        [
          card.title || "",
          card.projectName || "",
          formatAgentType(card.agentType),
        ]
          .join(" ")
          .toLowerCase()
          .includes(kw)
      ),
    }))
    .filter(
      (group) =>
        group.cards.length > 0 ||
        group.name.toLowerCase().includes(kw) ||
        group.url.toLowerCase().includes(kw)
    )
})
```

This is the only place where runtime state is overlaid onto overview cards.

- [ ] **Step 6: Run typecheck to verify the derived display-status path compiles**

Run:

```bash
pnpm exec vue-tsc --noEmit -p tsconfig.json
```

Workdir:

```bash
mcode-app
```

Expected: PASS with exit code `0`.

- [ ] **Step 7: Commit the overview overlay change**

Run:

```bash
git add mcode-app/src/pages/conversations/index.vue
git commit -m "feat(app): overlay live runtime status on overview cards"
```

## Task 2: Verify Fallback Behavior and Preserve History Mode

**Files:**
- Review: `mcode-app/src/pages/conversations/index.vue`
- Test: `mcode-app/package.json`

- [ ] **Step 1: Verify no history-mode paths consume `displayStatus`**

Run:

```bash
rg -n "displayStatus|resolveOverviewCardStatus|mapRuntimeStatusToOverviewStatus" mcode-app/src/pages/conversations/index.vue
```

Expected:

- `displayStatus` appears only in the default overview card template and the `filteredConnectionGroups` computed.
- `projects`, `tabList`, and history-mode rendering do not reference `displayStatus`.

- [ ] **Step 2: Run final static verification**

Run:

```bash
pnpm exec vue-tsc --noEmit -p tsconfig.json
pnpm build:h5
```

Workdir:

```bash
mcode-app
```

Expected:

- `vue-tsc` exits `0`
- `build:h5` exits `0`

- [ ] **Step 3: Manually validate the runtime overlay behavior in the app**

Use the app and verify:

1. Stay on the default conversation overview page.
2. Start a task for an existing conversation that already has a default overview card.
3. Confirm the card switches to `远程运行中` immediately without leaving the page.
4. Trigger a tool call or permission wait and confirm the card stays on `远程运行中`.
5. Let the conversation finish and confirm the card does not render a new `空闲` runtime state; it falls back to the card snapshot state.
6. Open history mode and confirm history cards render as before, with no dependency on runtime overlay.

- [ ] **Step 4: Commit any cleanup from verification**

Run:

```bash
git add mcode-app/src/pages/conversations/index.vue
git commit -m "chore(app): finalize overview live status overlay"
```

## Self-Review

- **Spec coverage:** Covered default-overview-only overlay, runtime-to-summary status mapping, `idle` fallback semantics, no snapshot mutation, and explicit exclusion of history mode.
- **Placeholder scan:** No `TODO`/`TBD` placeholders remain. Every code step and command is concrete.
- **Type consistency:** `LiveSessionCard` remains the raw snapshot type, `DisplayLiveSessionCard` is only used for derived rendering, and `filteredConnectionGroups` is the only computed that returns display cards.
