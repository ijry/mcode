# MCode P35 Session Detail Body Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract all `session-detail` content below the navigation bar into one reusable controlled component so future multi-tab session hosts can render isolated session bodies without cross-tab state leakage.

**Architecture:** Keep `mcode-app/src/pages/session-detail/index.vue` as the screen shell that owns store access and ACP gateway calls. Add one new `SessionDetailBody` component plus a small page-local TypeScript contract module so the body stays store-free and future multi-tab parents can pass isolated state and action handlers into the same reusable surface.

**Tech Stack:** Vue 3 `script setup`, uni-app, Pinia, TypeScript, Jest, `vue-tsc`

## Global Constraints

- Preserve the current legacy `session-detail` UI structure and button labels.
- Do not change ACP method names, request payload shapes, route structure, or navigation bar behavior.
- The reusable body component must not import `useSessionStore()` or `useAuthStore()` and must not call the gateway directly.
- Keep the first extraction as one whole body component; do not split into smaller subcomponents in P35.
- Every mcode change must include or update a Markdown note under `docs/mcode-architecture-notes/`.
- The architecture note must describe architecture, protocol/data-flow changes, UI behavior, compatibility considerations, and native iOS/Android replication guidance.

---

### Task 1: Add a typed contract for the reusable session body

**Files:**
- Create: `mcode-app/src/pages/session-detail/sessionDetailBodyContract.ts`
- Test: `mcode-app/tests/pages/session-detail/sessionDetailBodyContract.spec.ts`

**Interfaces:**
- Consumes: none
- Produces: `SessionDetailEventItem`, `SessionDetailBodyProps`, `getSessionDetailEventKey(event: SessionDetailEventItem, index: number): string`

- [ ] **Step 1: Write the failing test**

```ts
import { getSessionDetailEventKey } from "@/pages/session-detail/sessionDetailBodyContract"

describe("sessionDetailBodyContract", () => {
  it("uses event time when present", () => {
    expect(getSessionDetailEventKey({ time: 123 }, 5)).toBe("123")
  })

  it("falls back to the render index when time is missing", () => {
    expect(getSessionDetailEventKey({ type: "sent" }, 7)).toBe("7")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- --runTestsByPath tests/pages/session-detail/sessionDetailBodyContract.spec.ts`
Expected: FAIL with module not found for `@/pages/session-detail/sessionDetailBodyContract`

- [ ] **Step 3: Write minimal implementation**

```ts
export type SessionDetailEventItem = Record<string, unknown> & {
  time?: number | string | null
}

export interface SessionDetailBodyProps {
  title?: string
  messageText: string
  events: SessionDetailEventItem[]
  sendDisabled?: boolean
  stopDisabled?: boolean
  approveDisabled?: boolean
}

export function getSessionDetailEventKey(
  event: SessionDetailEventItem,
  index: number,
): string {
  return String(event.time ?? index)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit -- --runTestsByPath tests/pages/session-detail/sessionDetailBodyContract.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/pages/session-detail/sessionDetailBodyContract.ts mcode-app/tests/pages/session-detail/sessionDetailBodyContract.spec.ts
git commit -m "feat(app): add session detail body contract"
```

### Task 2: Extract the page body into a reusable controlled component

**Files:**
- Create: `mcode-app/src/components/session/SessionDetailBody.vue`
- Modify: `mcode-app/src/pages/session-detail/index.vue`
- Test: `mcode-app/tests/pages/session-detail/sessionDetailBodyContract.spec.ts`

**Interfaces:**
- Consumes: `SessionDetailBodyProps`, `getSessionDetailEventKey(event: SessionDetailEventItem, index: number): string`
- Produces: `SessionDetailBody` component with props `title`, `messageText`, `events`, `sendDisabled`, `stopDisabled`, `approveDisabled` and emits `update:messageText`, `send`, `stop`, `approve`

- [ ] **Step 1: Extend the contract test to cover key stability for string timestamps**

```ts
import { getSessionDetailEventKey } from "@/pages/session-detail/sessionDetailBodyContract"

describe("sessionDetailBodyContract", () => {
  it("uses string timestamps without coercion loss", () => {
    expect(getSessionDetailEventKey({ time: "evt-1" }, 0)).toBe("evt-1")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- --runTestsByPath tests/pages/session-detail/sessionDetailBodyContract.spec.ts`
Expected: FAIL because the new assertion is not implemented yet or the file has not been updated

- [ ] **Step 3: Write minimal implementation**

```vue
<template>
  <view class="section col">
    <view class="title">{{ resolvedTitle }}</view>
    <input
      :value="messageText"
      placeholder="Send a message"
      @input="handleInput"
    />
    <button class="btn primary" :disabled="sendDisabled" @click="$emit('send')">Send</button>
    <button class="btn" :disabled="stopDisabled" @click="$emit('stop')">Stop</button>
    <button class="btn" :disabled="approveDisabled" @click="$emit('approve')">Approve</button>
    <view
      v-for="(item, index) in events"
      :key="getSessionDetailEventKey(item, index)"
      class="section"
    >
      <text>{{ JSON.stringify(item) }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue"
import {
  getSessionDetailEventKey,
  type SessionDetailBodyProps,
} from "@/pages/session-detail/sessionDetailBodyContract"

const props = withDefaults(defineProps<SessionDetailBodyProps>(), {
  title: "Session Detail",
  sendDisabled: false,
  stopDisabled: false,
  approveDisabled: false,
})

const emit = defineEmits<{
  "update:messageText": [value: string]
  send: []
  stop: []
  approve: []
}>()

const resolvedTitle = computed(() => props.title || "Session Detail")

function handleInput(event: { detail?: { value?: string } }) {
  emit("update:messageText", event.detail?.value ?? "")
}
</script>
```

and update the page to:

```vue
<template>
  <view class="page">
    <SessionDetailBody
      v-model:message-text="messageText"
      :events="events"
      @send="sendMessage"
      @stop="stopSession"
      @approve="approve"
    />
  </view>
</template>
```

- [ ] **Step 4: Run verification**

Run: `npx vue-tsc --noEmit`
Expected: the command may still report unrelated pre-existing repo type errors, but it must not introduce new errors in `src/components/session/SessionDetailBody.vue` or `src/pages/session-detail/index.vue`

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/components/session/SessionDetailBody.vue mcode-app/src/pages/session-detail/index.vue mcode-app/src/pages/session-detail/sessionDetailBodyContract.ts mcode-app/tests/pages/session-detail/sessionDetailBodyContract.spec.ts
git commit -m "feat(app): extract reusable session detail body"
```

### Task 3: Document the new page/body boundary for native parity and future tabs

**Files:**
- Create: `docs/mcode-architecture-notes/2026-06-30-p35-session-detail-body.md`
- Modify: `docs/superpowers/specs/2026-06-30-mcode-p35-session-detail-body-design.md`

**Interfaces:**
- Consumes: implemented `SessionDetailBody` page/component boundary
- Produces: architecture note describing UI boundary, data flow, compatibility, and native guidance

- [ ] **Step 1: Write the architecture note**

```md
# P35 Session Detail Body

## Architecture

`mcode-app/src/pages/session-detail/index.vue` now acts as a thin page shell. All content below the navbar lives in `mcode-app/src/components/session/SessionDetailBody.vue`.

The page continues to own store access and ACP gateway calls. The body component is controlled entirely by parent props and emits, so future multi-tab session hosts can render one body per tab with isolated state.

## Protocol And Data Flow

There is no protocol change. The page still calls:

- `acp_prompt`
- `acp_cancel`
- `acp_respond_permission`

The only data-flow change is component-local:

1. parent page reads session state
2. parent passes `messageText` and `events` into `SessionDetailBody`
3. body emits `update:messageText`, `send`, `stop`, `approve`
4. parent performs gateway/store work and re-renders

## UI Behavior

The visible legacy `session-detail` UI remains the same: title, input, send/stop/approve buttons, and the event list still render in the same order.

## Compatibility

This is a client-side component-boundary refactor only. Routes, persisted store data, ACP payloads, and event rendering semantics remain compatible.

## Native iOS/Android Guidance

Native clients should keep the same boundary:

- screen/controller owns session selection, gateway access, and state mutation
- reusable body view renders one session instance from parent-provided state
- multi-tab hosts keep one state slice per tab rather than letting the body own global session state
```

- [ ] **Step 2: Self-review the note and spec references**

Run: `rg -n "P35 Session Detail Body|SessionDetailBody|multi-tab" docs/mcode-architecture-notes/2026-06-30-p35-session-detail-body.md docs/superpowers/specs/2026-06-30-mcode-p35-session-detail-body-design.md`
Expected: matches in both files with no `TODO`, `TBD`, or contradictory ownership language

- [ ] **Step 3: Run final verification**

Run: `pnpm test:unit -- --runTestsByPath tests/pages/session-detail/sessionDetailBodyContract.spec.ts`
Expected: PASS

Run: `npx vue-tsc --noEmit`
Expected: the command may still report unrelated pre-existing repo type errors, but it must not introduce new errors in `src/components/session/SessionDetailBody.vue` or `src/pages/session-detail/index.vue`

- [ ] **Step 4: Commit**

```bash
git add docs/mcode-architecture-notes/2026-06-30-p35-session-detail-body.md docs/superpowers/specs/2026-06-30-mcode-p35-session-detail-body-design.md
git commit -m "docs(app): record p35 session detail body split"
```
