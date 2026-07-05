# P65 Conversation List Live Stream Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in, default-off conversation-list live message preview that actively subscribes to a bounded set of in-progress conversations.

**Architecture:** Store the feature flag as a local `uni` preference, expose it in Profile, and keep list-page subscription ownership separate from detail-page runtime ownership. The conversation list reuses the existing shared realtime bridge and `runtime.connect()` attach path, selecting at most 5 in-progress cards and rendering one plain-text preview line from runtime state.

**Tech Stack:** Vue 3 `<script setup>`, uni-app, Pinia, Jest, existing ACP realtime transport, existing uview-plus runtime theme variables.

## Global Constraints

- Normal replies and user-facing implementation notes are Chinese by default.
- Every mcode change must include or update a Markdown note under `docs/mcode-architecture-notes/`.
- Prefer `uview-plus` runtime theme variables with the `--up-*` prefix.
- Do not introduce new `--mcode-*` theme aliases for colors, backgrounds, borders, or shadows.
- The setting must default to disabled.
- Enabled mode must cap active preview subscriptions to 5 conversations.
- The list page must not clear or detach detail-page-owned realtime state.
- Do not change backend ACP protocol or realtime frame shape.
- Do not touch existing unrelated dirty P64 detail-scroll files.

---

## File Structure

- Create `mcode-app/src/services/conversation/conversationListLiveStreamPreference.ts`: local boolean preference read/write/normalization.
- Create `mcode-app/src/pages/conversations/conversationLivePreview.ts`: pure helper functions for eligibility, selection cap, and one-line preview text.
- Modify `mcode-app/src/stores/conversationRuntime.ts`: add an explicit `releasePreviewSession(conversationId)` API for preview-owned cleanup.
- Modify `mcode-app/src/pages/conversations/index.vue`: list-page preview subscription orchestration and card preview rendering.
- Modify `mcode-app/src/pages/profile/index.vue`: local setting switch UI.
- Create `docs/mcode-architecture-notes/2026-07-05-p65-conversation-list-live-stream-preview.md`: architecture and native replication note.
- Create tests:
  - `mcode-app/tests/services/conversationListLiveStreamPreference.spec.ts`
  - `mcode-app/tests/pages/conversations/conversationLivePreview.spec.ts`
- Modify test:
  - `mcode-app/tests/stores/conversationRuntime.spec.ts`

---

### Task 1: Preference And Preview Presentation Helpers

**Files:**
- Create: `mcode-app/src/services/conversation/conversationListLiveStreamPreference.ts`
- Create: `mcode-app/src/pages/conversations/conversationLivePreview.ts`
- Test: `mcode-app/tests/services/conversationListLiveStreamPreference.spec.ts`
- Test: `mcode-app/tests/pages/conversations/conversationLivePreview.spec.ts`

**Interfaces:**
- Produces: `readConversationListLiveStreamEnabled(): boolean`
- Produces: `writeConversationListLiveStreamEnabled(enabled: boolean): boolean`
- Produces: `selectConversationLivePreviewIds(input: { cards: ConversationLivePreviewCard[]; limit?: number }): number[]`
- Produces: `resolveConversationLivePreviewText(session: ConversationLivePreviewSession | null | undefined): string`

- [ ] **Step 1: Write failing preference tests**

Create `mcode-app/tests/services/conversationListLiveStreamPreference.spec.ts`:

```ts
import {
  CONVERSATION_LIST_LIVE_STREAM_ENABLED_KEY,
  readConversationListLiveStreamEnabled,
  writeConversationListLiveStreamEnabled,
} from "@/services/conversation/conversationListLiveStreamPreference"

describe("conversationListLiveStreamPreference", () => {
  beforeEach(() => {
    uni.removeStorageSync(CONVERSATION_LIST_LIVE_STREAM_ENABLED_KEY)
  })

  it("defaults to disabled when no value exists", () => {
    expect(readConversationListLiveStreamEnabled()).toBe(false)
  })

  it("persists enabled and disabled values", () => {
    expect(writeConversationListLiveStreamEnabled(true)).toBe(true)
    expect(readConversationListLiveStreamEnabled()).toBe(true)
    expect(uni.getStorageSync(CONVERSATION_LIST_LIVE_STREAM_ENABLED_KEY)).toBe(true)

    expect(writeConversationListLiveStreamEnabled(false)).toBe(false)
    expect(readConversationListLiveStreamEnabled()).toBe(false)
    expect(uni.getStorageSync(CONVERSATION_LIST_LIVE_STREAM_ENABLED_KEY)).toBe(false)
  })

  it("normalizes unknown stored values to disabled", () => {
    uni.setStorageSync(CONVERSATION_LIST_LIVE_STREAM_ENABLED_KEY, "yes")
    expect(readConversationListLiveStreamEnabled()).toBe(false)
    expect(uni.getStorageSync(CONVERSATION_LIST_LIVE_STREAM_ENABLED_KEY)).toBe(false)
  })
})
```

- [ ] **Step 2: Write failing preview helper tests**

Create `mcode-app/tests/pages/conversations/conversationLivePreview.spec.ts`:

```ts
import {
  CONVERSATION_LIST_LIVE_PREVIEW_LIMIT,
  resolveConversationLivePreviewText,
  selectConversationLivePreviewIds,
} from "@/pages/conversations/conversationLivePreview"

describe("conversationLivePreview", () => {
  it("selects only in-progress cards and applies the default cap", () => {
    const cards = [
      { conversationId: 1, displayStatus: "completed" },
      { conversationId: 2, displayStatus: "in_progress" },
      { conversationId: 3, displayStatus: "thinking" },
      { conversationId: 4, displayStatus: "running_tool" },
      { conversationId: 5, displayStatus: "waiting_permission" },
      { conversationId: 6, displayStatus: "waiting_question" },
      { conversationId: 7, displayStatus: "in_progress" },
      { conversationId: 8, displayStatus: "in_progress" },
    ]

    expect(selectConversationLivePreviewIds({ cards })).toEqual([2, 3, 4, 5, 6])
    expect(selectConversationLivePreviewIds({ cards, limit: 3 })).toEqual([2, 3, 4])
    expect(CONVERSATION_LIST_LIVE_PREVIEW_LIMIT).toBe(5)
  })

  it("dedupes repeated conversation ids in card order", () => {
    expect(selectConversationLivePreviewIds({
      cards: [
        { conversationId: 10, displayStatus: "in_progress" },
        { conversationId: 10, displayStatus: "running_tool" },
        { conversationId: 11, displayStatus: "in_progress" },
      ],
    })).toEqual([10, 11])
  })

  it("builds one-line text from runtime live content", () => {
    expect(resolveConversationLivePreviewText({
      status: "thinking",
      liveMessage: {
        role: "assistant",
        isStreaming: true,
        timestamp: 1,
        content: [
          { type: "text", text: "hello" },
          { type: "text", text: " world" },
        ],
      },
    })).toBe("hello world")
  })

  it("prefers running tool and waiting states over plain text", () => {
    expect(resolveConversationLivePreviewText({
      status: "running_tool",
      liveMessage: {
        role: "assistant",
        isStreaming: true,
        timestamp: 1,
        content: [
          { type: "text", text: "before tool" },
          {
            type: "tool_call",
            tool_call: {
              id: "tool-1",
              name: "shell_command",
              input: {},
              status: "running",
            },
          },
        ],
      },
    })).toBe("正在调用工具：shell_command")

    expect(resolveConversationLivePreviewText({
      status: "waiting_permission",
      pendingPermission: { id: "perm-1" },
      liveMessage: null,
    })).toBe("等待确认")

    expect(resolveConversationLivePreviewText({
      status: "waiting_question",
      pendingQuestion: { question_id: "q1" },
      liveMessage: null,
    })).toBe("等待回答")
  })

  it("falls back to thinking text and placeholder text", () => {
    expect(resolveConversationLivePreviewText({
      status: "thinking",
      liveMessage: {
        role: "assistant",
        isStreaming: true,
        timestamp: 1,
        content: [{ type: "thinking", thinking: "checking files" }],
      },
    })).toBe("思考：checking files")

    expect(resolveConversationLivePreviewText({
      status: "thinking",
      liveMessage: {
        role: "assistant",
        isStreaming: true,
        timestamp: 1,
        isPlaceholderThinking: true,
        content: [],
      },
    })).toBe("思考中...")
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
cd mcode-app
npm run test:unit -- tests/services/conversationListLiveStreamPreference.spec.ts tests/pages/conversations/conversationLivePreview.spec.ts
```

Expected: FAIL because both imported modules do not exist.

- [ ] **Step 4: Implement preference service**

Create `mcode-app/src/services/conversation/conversationListLiveStreamPreference.ts`:

```ts
export const CONVERSATION_LIST_LIVE_STREAM_ENABLED_KEY =
  "mcode_conversation_list_live_stream_enabled"

function normalizeEnabled(value: unknown) {
  return value === true
}

export function readConversationListLiveStreamEnabled() {
  const enabled = normalizeEnabled(
    uni.getStorageSync(CONVERSATION_LIST_LIVE_STREAM_ENABLED_KEY)
  )
  uni.setStorageSync(CONVERSATION_LIST_LIVE_STREAM_ENABLED_KEY, enabled)
  return enabled
}

export function writeConversationListLiveStreamEnabled(enabled: boolean) {
  const normalized = enabled === true
  uni.setStorageSync(CONVERSATION_LIST_LIVE_STREAM_ENABLED_KEY, normalized)
  return normalized
}
```

- [ ] **Step 5: Implement preview helper**

Create `mcode-app/src/pages/conversations/conversationLivePreview.ts`:

```ts
import type { ContentPart, LiveMessage } from "@/types/acp"

export const CONVERSATION_LIST_LIVE_PREVIEW_LIMIT = 5

const LIVE_PREVIEW_STATUSES = new Set([
  "in_progress",
  "thinking",
  "running_tool",
  "waiting_permission",
  "waiting_question",
])

export interface ConversationLivePreviewCard {
  conversationId?: number
  displayStatus?: string | null
}

export interface ConversationLivePreviewSession {
  status?: string | null
  liveMessage?: LiveMessage | null
  pendingPermission?: unknown | null
  pendingQuestion?: unknown | null
}

export function isConversationLivePreviewStatus(status?: string | null) {
  return LIVE_PREVIEW_STATUSES.has(String(status || "").trim().toLowerCase())
}

export function selectConversationLivePreviewIds(input: {
  cards: ConversationLivePreviewCard[]
  limit?: number
}) {
  const limit = Math.max(0, Math.floor(input.limit ?? CONVERSATION_LIST_LIVE_PREVIEW_LIMIT))
  const selected: number[] = []
  const seen = new Set<number>()

  for (const card of input.cards) {
    const conversationId = Number(card.conversationId || 0)
    if (!Number.isFinite(conversationId) || conversationId <= 0) continue
    if (seen.has(conversationId)) continue
    if (!isConversationLivePreviewStatus(card.displayStatus)) continue

    seen.add(conversationId)
    selected.push(conversationId)
    if (selected.length >= limit) break
  }

  return selected
}

export function resolveConversationLivePreviewText(
  session: ConversationLivePreviewSession | null | undefined
) {
  if (!session) return ""
  if (session.pendingPermission || session.status === "waiting_permission") return "等待确认"
  if (session.pendingQuestion || session.status === "waiting_question") return "等待回答"

  const liveMessage = session.liveMessage
  const parts = liveMessage?.content || []
  const runningTool = findRunningTool(parts)
  if (runningTool) return `正在调用工具：${runningTool}`

  const text = buildTextProjection(parts)
  if (text) return text

  const thinking = buildThinkingProjection(parts)
  if (thinking) return `思考：${thinking}`

  if (liveMessage?.isPlaceholderThinking || session.status === "thinking") {
    return "思考中..."
  }

  return ""
}

function findRunningTool(parts: ContentPart[]) {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index]
    if (part.type !== "tool_call") continue
    if (part.tool_call?.status && part.tool_call.status !== "running") continue
    const name = String(part.tool_call?.name || "").trim()
    if (name) return name
  }
  return ""
}

function buildTextProjection(parts: ContentPart[]) {
  return parts
    .map((part) => (part.type === "text" ? part.text || "" : ""))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
}

function buildThinkingProjection(parts: ContentPart[]) {
  return parts
    .map((part) => (part.type === "thinking" ? part.thinking || "" : ""))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run:

```bash
cd mcode-app
npm run test:unit -- tests/services/conversationListLiveStreamPreference.spec.ts tests/pages/conversations/conversationLivePreview.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

Run:

```bash
git add mcode-app/src/services/conversation/conversationListLiveStreamPreference.ts mcode-app/src/pages/conversations/conversationLivePreview.ts mcode-app/tests/services/conversationListLiveStreamPreference.spec.ts mcode-app/tests/pages/conversations/conversationLivePreview.spec.ts
git commit -m "feat: add conversation list live preview helpers"
```

---

### Task 2: Runtime Preview Cleanup API

**Files:**
- Modify: `mcode-app/src/stores/conversationRuntime.ts`
- Modify Test: `mcode-app/tests/stores/conversationRuntime.spec.ts`

**Interfaces:**
- Consumes: existing runtime session map and existing detach/unbind/manager cleanup imports.
- Produces: `releasePreviewSession(conversationId: number): boolean`

- [ ] **Step 1: Write failing store test**

Append this test inside `describe('conversationRuntime ACP error handling', () => { ... })` in `mcode-app/tests/stores/conversationRuntime.spec.ts`:

```ts
  it("releases preview-owned sessions without requiring backend disconnect", () => {
    const sync = require("@/services/conversation/conversationSyncService")
    const manager = require("@/services/conversation/connectionSessionManager")
    const hot = require("@/services/conversation/hotConversationCoordinator")
    const store = useConversationRuntimeStore()
    const session = store.getOrCreateSession(77)
    session.connectionId = "conn-preview"
    session.instanceKey = "test-instance"
    session.status = "thinking"

    expect(store.releasePreviewSession(77)).toBe(true)

    expect(sync.detachConversationRealtime).toHaveBeenCalledWith(77)
    expect(sync.unbindConversationEventHandler).toHaveBeenCalledWith(77)
    expect(manager.connectionSessionManager.clearConversation).toHaveBeenCalledWith(77)
    expect(hot.releaseHotConversation).toHaveBeenCalledWith(77)
    expect(store.sessions.has(77)).toBe(false)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd mcode-app
npm run test:unit -- tests/stores/conversationRuntime.spec.ts
```

Expected: FAIL with `store.releasePreviewSession is not a function`.

- [ ] **Step 3: Implement `releasePreviewSession`**

In `mcode-app/src/stores/conversationRuntime.ts`, add this function near `clearSession`:

```ts
  function releasePreviewSession(conversationId: number) {
    const session = sessions.value.get(conversationId)
    if (!session) return false

    releaseHotConversation(conversationId)
    detachConversationRealtime(conversationId)
    unbindConversationEventHandler(conversationId)
    if (session.connectionId) {
      connections.value.delete(session.connectionId)
    }
    connectionSessionManager.clearConversation(conversationId)
    sessions.value.delete(conversationId)
    return true
  }
```

Add it to the store return object next to `clearSession`:

```ts
    releasePreviewSession,
```

- [ ] **Step 4: Run runtime store test**

Run:

```bash
cd mcode-app
npm run test:unit -- tests/stores/conversationRuntime.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git add mcode-app/src/stores/conversationRuntime.ts mcode-app/tests/stores/conversationRuntime.spec.ts
git commit -m "feat: add preview runtime cleanup"
```

---

### Task 3: Conversation List Active Preview Subscriptions And UI

**Files:**
- Modify: `mcode-app/src/pages/conversations/index.vue`

**Interfaces:**
- Consumes: `readConversationListLiveStreamEnabled()`
- Consumes: `selectConversationLivePreviewIds(...)`
- Consumes: `resolveConversationLivePreviewText(...)`
- Consumes: `runtime.connect(...)`, `runtime.getManagedConversation(...)`, `runtime.releasePreviewSession(...)`
- Produces: list cards with `livePreviewText: string`

- [ ] **Step 1: Import preview helpers and `onHide`**

In `mcode-app/src/pages/conversations/index.vue`, update imports:

```ts
import { ref, computed, onMounted, watch } from "vue"
import { onHide, onPullDownRefresh, onShow, onUnload } from "@dcloudio/uni-app"
```

Add helper imports near the existing conversation imports:

```ts
import {
  readConversationListLiveStreamEnabled,
} from "@/services/conversation/conversationListLiveStreamPreference"
import {
  resolveConversationLivePreviewText,
  selectConversationLivePreviewIds,
} from "@/pages/conversations/conversationLivePreview"
```

- [ ] **Step 2: Extend display card type**

Change `DisplayLiveSessionCard`:

```ts
interface DisplayLiveSessionCard extends LiveSessionCard {
  displayStatus: string
  livePreviewText: string
}
```

- [ ] **Step 3: Add preview state**

Near the other top-level state maps, add:

```ts
const connectionInstanceKeyMap = new Map<string, string>()
const livePreviewEnabled = ref(false)
const livePreviewPageVisible = ref(false)
const livePreviewOwnedConversationIds = new Set<number>()
const livePreviewConnectPromiseMap = new Map<number, Promise<void>>()
let livePreviewReconcileTimer: ReturnType<typeof setTimeout> | null = null
```

- [ ] **Step 4: Include preview text in display cards**

Update `filteredConnectionGroups` card mapping:

```ts
    cards: group.cards.map((card) => {
      const runtimeSession = runtime.sessions.get(card.conversationId || 0)
      const displayStatus = resolveOverviewCardDisplayStatus(card.status, runtimeSession?.status)
      return {
        ...card,
        displayStatus,
        livePreviewText: livePreviewEnabled.value
          ? resolveConversationLivePreviewText(runtimeSession)
          : "",
      }
    }),
```

- [ ] **Step 5: Store reverse connection instance mapping**

In the "no saved connections" branch inside `loadOverviewData`, clear the new map:

```ts
      connectionInstanceKeyMap.clear()
```

In `rememberConnectionRemoteState`, add:

```ts
  if (key && instanceKey) {
    connectionInstanceKeyMap.set(key, instanceKey)
  }
```

- [ ] **Step 6: Render the preview line**

In the card body template, after the session-name text, add:

```vue
                    <text
                      v-if="card.livePreviewText"
                      class="live-card__preview u-line-1"
                    >
                      {{ card.livePreviewText }}
                    </text>
```

Add SCSS near `.live-card__session-name`:

```scss
.live-card__preview {
  margin-top: 6rpx;
  font-size: 22rpx;
  line-height: 1.35;
  color: var(--up-tips-color, #909193);
}
```

- [ ] **Step 7: Add preview reconciliation functions**

Add these functions near the other overview helper functions:

```ts
function loadConversationLivePreviewPreference() {
  livePreviewEnabled.value = readConversationListLiveStreamEnabled()
}

function scheduleLivePreviewReconcile() {
  if (livePreviewReconcileTimer) {
    clearTimeout(livePreviewReconcileTimer)
  }
  livePreviewReconcileTimer = setTimeout(() => {
    livePreviewReconcileTimer = null
    void reconcileLivePreviewSubscriptions()
  }, 160)
}

function getLivePreviewCandidates() {
  return filteredConnectionGroups.value.flatMap((group) =>
    group.cards.map((card) => ({
      ...card,
      groupKey: group.key,
      instanceKey: connectionInstanceKeyMap.get(group.key) || "",
    }))
  )
}

async function reconcileLivePreviewSubscriptions() {
  if (!livePreviewPageVisible.value || !livePreviewEnabled.value) {
    releaseAllLivePreviewOwnedSessions()
    return
  }

  const candidates = getLivePreviewCandidates()
  const selectedIds = selectConversationLivePreviewIds({ cards: candidates })
  const selectedIdSet = new Set(selectedIds)

  for (const conversationId of Array.from(livePreviewOwnedConversationIds)) {
    if (!selectedIdSet.has(conversationId)) {
      releaseLivePreviewOwnedSession(conversationId)
    }
  }

  await Promise.all(
    selectedIds.map(async (conversationId) => {
      const candidate = candidates.find((item) => item.conversationId === conversationId)
      if (candidate) {
        await ensureLivePreviewSubscription(candidate)
      }
    })
  )
}

async function ensureLivePreviewSubscription(candidate: ReturnType<typeof getLivePreviewCandidates>[number]) {
  const conversationId = Number(candidate.conversationId || 0)
  if (!conversationId || !candidate.instanceKey) return
  if (runtime.getManagedConversation(conversationId)?.connectionId) return
  if (livePreviewConnectPromiseMap.has(conversationId)) {
    return await livePreviewConnectPromiseMap.get(conversationId)
  }

  const task = (async () => {
    try {
      await runtime.connect(
        conversationId,
        normalizeAgentType(candidate.agentType),
        undefined,
        undefined,
        runtime.sessions.get(conversationId)?.lastAppliedSeq ?? undefined,
        candidate.instanceKey
      )
      livePreviewOwnedConversationIds.add(conversationId)
    } catch (error) {
      console.warn("[conversation-list-live-preview] attach skipped", {
        conversationId,
        instanceKey: candidate.instanceKey,
        error,
      })
    }
  })().finally(() => {
    livePreviewConnectPromiseMap.delete(conversationId)
  })

  livePreviewConnectPromiseMap.set(conversationId, task)
  await task
}

function transferLivePreviewOwnership(conversationId?: number) {
  const normalizedConversationId = Number(conversationId || 0)
  if (!normalizedConversationId) return
  livePreviewOwnedConversationIds.delete(normalizedConversationId)
}

function releaseLivePreviewOwnedSession(conversationId: number) {
  livePreviewOwnedConversationIds.delete(conversationId)
  runtime.releasePreviewSession(conversationId)
}

function releaseAllLivePreviewOwnedSessions() {
  for (const conversationId of Array.from(livePreviewOwnedConversationIds)) {
    releaseLivePreviewOwnedSession(conversationId)
  }
}

function buildLivePreviewRuntimeSignature() {
  return Array.from(runtime.sessions.entries())
    .map(([conversationId, session]) => [
      conversationId,
      session.status,
      session.connectionId || "",
      session.pendingPermission ? "permission" : "",
      session.pendingQuestion ? "question" : "",
    ].join(":"))
    .join("|")
}
```

- [ ] **Step 8: Add lifecycle and watchers**

Update `onMounted`:

```ts
  loadConversationLivePreviewPreference()
  scheduleLivePreviewReconcile()
```

Update `onShow`:

```ts
  livePreviewPageVisible.value = true
  loadConversationLivePreviewPreference()
  scheduleLivePreviewReconcile()
```

Add `onHide` before `onUnload`:

```ts
onHide(() => {
  livePreviewPageVisible.value = false
  releaseAllLivePreviewOwnedSessions()
})
```

Update `onUnload`:

```ts
  if (livePreviewReconcileTimer) {
    clearTimeout(livePreviewReconcileTimer)
    livePreviewReconcileTimer = null
  }
  releaseAllLivePreviewOwnedSessions()
  livePreviewConnectPromiseMap.clear()
```

Add watchers near the existing top-level watchers:

```ts
watch(
  () => livePreviewEnabled.value,
  () => {
    scheduleLivePreviewReconcile()
  }
)

watch(
  () =>
    filteredConnectionGroups.value
      .flatMap((group) =>
        group.cards.map((card) => `${group.key}:${card.conversationId || 0}:${card.displayStatus}`)
      )
      .join("|"),
  () => {
    scheduleLivePreviewReconcile()
  }
)

watch(
  () => buildLivePreviewRuntimeSignature(),
  () => {
    scheduleLivePreviewReconcile()
  }
)
```

- [ ] **Step 9: Transfer preview ownership before opening detail**

At the start of `openLiveSession`, after validating `card.conversationId`, add:

```ts
  transferLivePreviewOwnership(card.conversationId)
```

- [ ] **Step 10: Build H5 to verify SFC compilation**

Run:

```bash
cd mcode-app
npm run build:h5
```

Expected: build completes without Vue/TypeScript template errors.

- [ ] **Step 11: Commit Task 3**

Run:

```bash
git add mcode-app/src/pages/conversations/index.vue
git commit -m "feat: show live previews in conversation list"
```

---

### Task 4: Profile Setting UI, Architecture Note, And Final Verification

**Files:**
- Modify: `mcode-app/src/pages/profile/index.vue`
- Create: `docs/mcode-architecture-notes/2026-07-05-p65-conversation-list-live-stream-preview.md`

**Interfaces:**
- Consumes: `readConversationListLiveStreamEnabled()`
- Consumes: `writeConversationListLiveStreamEnabled(enabled: boolean)`
- Produces: default-off user-facing settings switch.

- [ ] **Step 1: Import preference service in Profile**

In `mcode-app/src/pages/profile/index.vue`, add:

```ts
import {
  readConversationListLiveStreamEnabled,
  writeConversationListLiveStreamEnabled,
} from "@/services/conversation/conversationListLiveStreamPreference"
```

- [ ] **Step 2: Add state initialization**

Near existing refs, add:

```ts
const conversationListLiveStreamEnabled = ref(false)
```

Update `onMounted`:

```ts
onMounted(async () => {
  loadThemePreference()
  loadConversationListLiveStreamPreference()
})
```

Add functions near `loadThemePreference`:

```ts
function loadConversationListLiveStreamPreference() {
  conversationListLiveStreamEnabled.value = readConversationListLiveStreamEnabled()
}

function handleConversationListLiveStreamChange(event: { detail?: { value?: boolean } }) {
  const enabled = writeConversationListLiveStreamEnabled(Boolean(event?.detail?.value))
  conversationListLiveStreamEnabled.value = enabled
  uni.showToast({
    title: enabled ? "会话列表实时消息流已开启" : "会话列表实时消息流已关闭",
    icon: "none",
  })
}
```

- [ ] **Step 3: Add settings section template**

Insert after the "外观设置" section:

```vue
    <view class="section">
      <view class="section-title">会话设置</view>
      <view class="menu-list" :style="upThemeCardStyle">
        <view class="menu-item">
          <view class="menu-left menu-left--column">
            <view class="menu-row-title">
              <u-icon name="chat" size="22" :color="upThemeVar('--up-primary', '#2979ff')"></u-icon>
              <text class="menu-text">会话列表实时消息流</text>
            </view>
            <text class="menu-desc">
              开启后会为进行中的会话建立实时订阅，显示一行生成内容；可能增加网络、电量和性能开销。
            </text>
          </view>
          <switch
            :checked="conversationListLiveStreamEnabled"
            color="#2979ff"
            @change="handleConversationListLiveStreamChange"
          />
        </view>
      </view>
    </view>
```

- [ ] **Step 4: Add Profile styles using existing theme variables**

Add near the existing menu styles:

```scss
.menu-left--column {
  align-items: flex-start;
  flex: 1;
  min-width: 0;
}

.menu-row-title {
  display: flex;
  align-items: center;
  gap: 20rpx;
}

.menu-desc {
  margin-top: 10rpx;
  padding-left: 64rpx;
  font-size: 24rpx;
  line-height: 1.45;
  color: var(--up-tips-color, #909193);
}
```

- [ ] **Step 5: Add architecture note**

Create `docs/mcode-architecture-notes/2026-07-05-p65-conversation-list-live-stream-preview.md`:

```md
# P65 Conversation List Live Stream Preview

## Architecture

The feature is controlled by a local mobile preference, `mcode_conversation_list_live_stream_enabled`, defaulting to `false`. When enabled, the conversation list reuses the existing per-instance realtime bridge and opens per-conversation preview subscriptions through the existing runtime `connect` flow.

## Data Flow

The list page derives eligible cards from loaded conversation groups, resolves display status, and selects at most 5 in-progress conversations. For each selected conversation without an existing managed runtime connection, the list calls `runtime.connect(conversationId, agentType, undefined, undefined, lastAppliedSeq, instanceKey)`. Realtime events update `runtime.sessions[conversationId].liveMessage`, and the card renders a single plain-text preview line from that runtime state.

## UI Behavior

The Profile page exposes "会话列表实时消息流" under "会话设置". It is off by default. When off, the list creates no preview-owned per-conversation subscriptions. When on, each eligible card may show one line such as generated text, thinking text, running tool name, waiting confirmation, or waiting answer.

## Compatibility

No ACP protocol or backend route changes are required. Existing global list events remain unchanged. Detail pages remain authoritative for full conversation rendering. The list page tracks preview-owned sessions and releases only those sessions when the list is hidden, unloaded, disabled, or no longer eligible.

## Native iOS/Android Replication

Native clients should store the same default-off local preference, reuse the shared realtime bridge, attach at most 5 in-progress visible/listed conversations while the list screen is active, render one plain-text preview line, and release only preview-owned attachments when leaving the list. Detail-screen attachments must not be cleared by list cleanup.
```

- [ ] **Step 6: Run targeted tests**

Run:

```bash
cd mcode-app
npm run test:unit -- tests/services/conversationListLiveStreamPreference.spec.ts tests/pages/conversations/conversationLivePreview.spec.ts tests/stores/conversationRuntime.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Run H5 build**

Run:

```bash
cd mcode-app
npm run build:h5
```

Expected: build completes without errors.

- [ ] **Step 8: Manual verification**

Use H5 or app runtime:

```bash
cd mcode-app
npm run dev:h5
```

Expected manual results:

- Fresh storage shows the Profile switch off.
- With the switch off, conversation list cards do not show preview lines and no preview-owned sessions are created.
- After enabling the switch, up to 5 in-progress cards display one preview line when their runtime receives live content.
- Disabling the switch removes preview-owned subscriptions and preview lines.
- Opening detail from a previewed card keeps that conversation's realtime stream available in detail.

- [ ] **Step 9: Commit Task 4**

Run:

```bash
git add mcode-app/src/pages/profile/index.vue docs/mcode-architecture-notes/2026-07-05-p65-conversation-list-live-stream-preview.md
git commit -m "feat: add conversation list live preview setting"
```

---

## Plan Self-Review

- Spec coverage: preference default-off, active list subscriptions, 5-conversation cap, one-line preview text, cleanup, detail ownership protection, docs note, and native replication guidance are all covered by Tasks 1-4.
- Placeholder scan: no placeholder red flags remain.
- Type consistency: helper names are defined in Task 1 and consumed in Tasks 3-4; `releasePreviewSession` is defined in Task 2 and consumed in Task 3.
