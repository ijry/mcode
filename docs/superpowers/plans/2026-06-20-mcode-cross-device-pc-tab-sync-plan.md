# mcode Cross-Device PC Tab Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add mobile-side PC tab synchronization and hot conversation runtime coordination in `mcode-app` so mobile create/send actions open or reuse the matching remote `codeg-main` tab and conversation detail stays aligned with live runtime.

**Architecture:** Introduce an instance-scoped opened-tab cache plus a single `pcTabSyncService` write path that consumes the existing `list_opened_tabs`, `save_opened_tabs`, and `tabs://changed` protocol. Refactor conversation runtime lifetime behind a `hotConversationCoordinator` so live runtime authority is decoupled from page mount/unmount and remote detail fetch becomes fallback-only.

**Tech Stack:** `uni-app`, `Vue 3`, `Pinia`, `TypeScript`, existing `mcode-app` gateway/realtime transport, `jest`

---

## File Structure

### New files

- `mcode-app/src/services/conversation/openedTabsTypes.ts`
  - Shared types and helpers for opened-tab snapshots and mobile-side cache records.
- `mcode-app/src/services/conversation/openedTabsRealtimeCache.ts`
  - Instance-scoped remote opened-tab cache, `tabs://changed` subscription, snapshot sync, and cache listeners.
- `mcode-app/src/services/conversation/pcTabSyncService.ts`
  - The only mobile-side write path into remote `opened_tabs`.
- `mcode-app/src/services/conversation/hotConversationCoordinator.ts`
  - Runtime heat reasons, touch/retain/release rules, and idle sweep policy.
- `mcode-app/tests/services/openedTabsRealtimeCache.spec.ts`
  - Tests for cache hydration, event application, and stale-version handling.
- `mcode-app/tests/services/pcTabSyncService.spec.ts`
  - Tests for ensure/reuse/activate/CAS retry behavior.
- `mcode-app/tests/services/hotConversationCoordinator.spec.ts`
  - Tests for heat reasons and runtime retention behavior.

### Modified files

- `mcode-app/src/api/acp.ts`
  - Add normalized global-event subscription support for `tabs://changed`.
- `mcode-app/src/pages/conversations/index.vue`
  - Parse `list_opened_tabs` correctly as snapshot data and wire overview reads through the new cache.
- `mcode-app/src/stores/conversationRuntime.ts`
  - Integrate hot-runtime coordination and suppress destructive detail calibration while runtime is live.
- `mcode-app/src/services/conversation/conversationSyncService.ts`
  - Feed opened-tab cache and hot-conversation coordination from realtime events and reconnect behavior.
- `mcode-app/src/services/conversation/connectionSessionManager.ts`
  - Add coordinator touch hooks and optional remote-tab heat integration.
- `docs/mcode-architecture-notes/`
  - Add one new concise architecture note describing PC tab sync and runtime authority rules.

### Existing references to study before edits

- `mcode-app/src/pages/conversations/index.vue`
- `mcode-app/src/stores/conversationRuntime.ts`
- `mcode-app/src/services/conversation/conversationSyncService.ts`
- `mcode-app/src/services/conversation/globalConversationSync.ts`
- `mcode-app/src/services/gateway/index.ts`
- `mcode-app/src/api/acp.ts`
- `codeg-main/src-tauri/src/models/folder.rs`
- `codeg-main/src-tauri/src/web/handlers/conversations.rs`

## Task 1: Define opened-tab types and correct snapshot parsing

**Files:**
- Create: `mcode-app/src/services/conversation/openedTabsTypes.ts`
- Modify: `mcode-app/src/pages/conversations/index.vue`
- Test: `mcode-app/tests/services/conversationOverviewSnapshot.spec.ts`

- [ ] **Step 1: Add shared opened-tab snapshot types**

Add `mcode-app/src/services/conversation/openedTabsTypes.ts`:

```ts
export interface RemoteOpenedTab {
  id: number
  folder_id: number
  conversation_id: number | null
  agent_type: string
  position: number
  is_active: boolean
  is_pinned: boolean
}

export interface RemoteOpenedTabsSnapshot {
  items: RemoteOpenedTab[]
  version: number
}

export interface RemoteSaveTabsOutcome {
  accepted: boolean
  version: number
  tabs: RemoteOpenedTab[]
}

export function normalizeOpenedTabsSnapshot(raw: unknown): RemoteOpenedTabsSnapshot {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const items = Array.isArray(record.items) ? (record.items as RemoteOpenedTab[]) : []
  const versionRaw = record.version
  const version =
    typeof versionRaw === "number"
      ? versionRaw
      : typeof versionRaw === "string" && versionRaw.trim()
        ? Number(versionRaw)
        : 0

  return {
    items,
    version: Number.isFinite(version) ? version : 0,
  }
}
```

- [ ] **Step 2: Write a failing parsing test**

In `mcode-app/tests/services/conversationOverviewSnapshot.spec.ts`, add:

```ts
import { normalizeOpenedTabsSnapshot } from "@/services/conversation/openedTabsTypes"

it("parses opened tabs snapshot as items plus version", () => {
  expect(
    normalizeOpenedTabsSnapshot({
      items: [
        {
          id: 1,
          folder_id: 9,
          conversation_id: 12,
          agent_type: "claude_code",
          position: 0,
          is_active: true,
          is_pinned: true,
        },
      ],
      version: 7,
    })
  ).toEqual({
    items: [
      {
        id: 1,
        folder_id: 9,
        conversation_id: 12,
        agent_type: "claude_code",
        position: 0,
        is_active: true,
        is_pinned: true,
      },
    ],
    version: 7,
  })
})
```

- [ ] **Step 3: Run the parsing test to verify the current behavior is insufficient**

Run: `npm test -- conversationOverviewSnapshot.spec.ts --runInBand`

Expected: FAIL because `normalizeOpenedTabsSnapshot` does not exist yet or the test import cannot resolve.

- [ ] **Step 4: Wire conversations overview to use snapshot parsing**

In `mcode-app/src/pages/conversations/index.vue`, replace the existing raw opened-tab parsing pattern:

```ts
const tabsRaw = await gateway.call<unknown>("list_opened_tabs")
const tabs = normalizeList(tabsRaw) as OpenedTabItem[]
```

with:

```ts
const tabsRaw = await gateway.call<unknown>("list_opened_tabs")
const { items: tabs } = normalizeOpenedTabsSnapshot(tabsRaw)
```

Apply this in every overview code path that currently reads `list_opened_tabs`.

- [ ] **Step 5: Run the targeted overview parsing test**

Run: `npm test -- conversationOverviewSnapshot.spec.ts --runInBand`

Expected: PASS

- [ ] **Step 6: Commit**

Run:

```bash
git add mcode-app/src/services/conversation/openedTabsTypes.ts mcode-app/src/pages/conversations/index.vue mcode-app/tests/services/conversationOverviewSnapshot.spec.ts
git commit -m "fix: parse opened tabs snapshot in mcode app"
```

## Task 2: Build instance-scoped opened-tabs realtime cache

**Files:**
- Create: `mcode-app/src/services/conversation/openedTabsRealtimeCache.ts`
- Modify: `mcode-app/src/api/acp.ts`
- Test: `mcode-app/tests/services/openedTabsRealtimeCache.spec.ts`

- [ ] **Step 1: Add failing cache tests**

Create `mcode-app/tests/services/openedTabsRealtimeCache.spec.ts`:

```ts
import {
  applyOpenedTabsSnapshot,
  getOpenedTabsSnapshot,
  resetOpenedTabsRealtimeCacheForTests,
} from "@/services/conversation/openedTabsRealtimeCache"

describe("openedTabsRealtimeCache", () => {
  beforeEach(() => {
    resetOpenedTabsRealtimeCacheForTests()
  })

  it("stores the newest snapshot per instance", () => {
    applyOpenedTabsSnapshot("instance-a", {
      version: 3,
      items: [{ id: 1, folder_id: 1, conversation_id: 2, agent_type: "codex", position: 0, is_active: true, is_pinned: true }],
    })

    expect(getOpenedTabsSnapshot("instance-a")?.version).toBe(3)
    expect(getOpenedTabsSnapshot("instance-a")?.items).toHaveLength(1)
  })

  it("ignores stale snapshot versions", () => {
    applyOpenedTabsSnapshot("instance-a", {
      version: 5,
      items: [{ id: 1, folder_id: 1, conversation_id: 2, agent_type: "codex", position: 0, is_active: true, is_pinned: true }],
    })

    applyOpenedTabsSnapshot("instance-a", {
      version: 4,
      items: [],
    })

    expect(getOpenedTabsSnapshot("instance-a")?.version).toBe(5)
    expect(getOpenedTabsSnapshot("instance-a")?.items).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run cache tests to verify they fail**

Run: `npm test -- openedTabsRealtimeCache.spec.ts --runInBand`

Expected: FAIL because the cache module does not exist yet.

- [ ] **Step 3: Implement the cache module**

Create `mcode-app/src/services/conversation/openedTabsRealtimeCache.ts`:

```ts
import { acpApi } from "@/api/acp"
import type { RemoteOpenedTabsSnapshot } from "./openedTabsTypes"
import { normalizeOpenedTabsSnapshot } from "./openedTabsTypes"

interface CachedSnapshot extends RemoteOpenedTabsSnapshot {
  instanceKey: string
  updatedAt: number
  lastOrigin: string | null
}

const snapshotMap = new Map<string, CachedSnapshot>()
const listeners = new Map<string, Set<() => void>>()
const unsubscribeMap = new Map<string, () => void>()

export function getOpenedTabsSnapshot(instanceKey: string) {
  return snapshotMap.get(instanceKey) ?? null
}

export function applyOpenedTabsSnapshot(
  instanceKey: string,
  snapshot: RemoteOpenedTabsSnapshot,
  origin: string | null = null
) {
  const current = snapshotMap.get(instanceKey)
  if (current && snapshot.version < current.version) {
    return current
  }

  const next: CachedSnapshot = {
    instanceKey,
    version: snapshot.version,
    items: snapshot.items,
    updatedAt: Date.now(),
    lastOrigin: origin,
  }
  snapshotMap.set(instanceKey, next)
  listeners.get(instanceKey)?.forEach((listener) => listener())
  return next
}

export function subscribeOpenedTabsSnapshot(instanceKey: string, listener: () => void) {
  if (!listeners.has(instanceKey)) {
    listeners.set(instanceKey, new Set())
  }
  listeners.get(instanceKey)!.add(listener)
  return () => {
    const scoped = listeners.get(instanceKey)
    if (!scoped) return
    scoped.delete(listener)
    if (scoped.size === 0) {
      listeners.delete(instanceKey)
    }
  }
}

export async function syncOpenedTabsSnapshot(
  instanceKey: string,
  gateway: { call<T>(command: string, payload?: Record<string, unknown>): Promise<T> }
) {
  const raw = await gateway.call<unknown>("list_opened_tabs")
  return applyOpenedTabsSnapshot(
    instanceKey,
    normalizeOpenedTabsSnapshot(raw),
    "server"
  )
}

export async function ensureOpenedTabsRealtime(instanceKey: string) {
  if (unsubscribeMap.has(instanceKey)) return
  await acpApi.ensureRealtimeBridge(instanceKey)
  const unsubscribe = acpApi.subscribeGlobalEvent(
    "tabs://changed",
    (payload) => {
      const record = payload && typeof payload === "object"
        ? (payload as Record<string, unknown>)
        : {}
      applyOpenedTabsSnapshot(
        instanceKey,
        {
          version: Number(record.version || 0),
          items: Array.isArray(record.tabs) ? record.tabs as RemoteOpenedTabsSnapshot["items"] : [],
        },
        typeof record.origin === "string" ? record.origin : null
      )
    },
    instanceKey
  )
  unsubscribeMap.set(instanceKey, unsubscribe)
}

export function resetOpenedTabsRealtimeCacheForTests() {
  snapshotMap.clear()
  listeners.clear()
  unsubscribeMap.forEach((unsubscribe) => unsubscribe())
  unsubscribeMap.clear()
}
```

- [ ] **Step 4: Keep `acpApi` ready for `tabs://changed`**

In `mcode-app/src/api/acp.ts`, confirm `extractGlobalFrame()` and
`dispatchGlobalEvent()` already support arbitrary global channels. If the
`tabs://changed` channel is filtered anywhere, remove that filter. The expected
behavior is:

```ts
if (!channel || channel === "acp://event") return null
return {
  channel,
  payload: "payload" in record ? record.payload : raw,
}
```

No code change is needed if the implementation already matches this.

- [ ] **Step 5: Run cache tests**

Run: `npm test -- openedTabsRealtimeCache.spec.ts --runInBand`

Expected: PASS

- [ ] **Step 6: Commit**

Run:

```bash
git add mcode-app/src/services/conversation/openedTabsRealtimeCache.ts mcode-app/src/api/acp.ts mcode-app/tests/services/openedTabsRealtimeCache.spec.ts
git commit -m "feat: cache remote opened tabs in mcode app"
```

## Task 3: Add `pcTabSyncService` with CAS retry and conditional activation

**Files:**
- Create: `mcode-app/src/services/conversation/pcTabSyncService.ts`
- Test: `mcode-app/tests/services/pcTabSyncService.spec.ts`

- [ ] **Step 1: Add failing sync-service tests**

Create `mcode-app/tests/services/pcTabSyncService.spec.ts`:

```ts
import { ensureConversationTab } from "@/services/conversation/pcTabSyncService"

describe("pcTabSyncService", () => {
  it("appends a missing conversation tab", async () => {
    const saveOpenedTabs = jest.fn().mockResolvedValue({
      accepted: true,
      version: 2,
      tabs: [],
    })

    const listOpenedTabs = jest.fn().mockResolvedValue({
      items: [],
      version: 1,
    })

    await ensureConversationTab(
      {
        instanceKey: "instance-a",
        conversationId: 99,
        folderId: 7,
        agentType: "codex",
        activate: true,
      },
      { listOpenedTabs, saveOpenedTabs }
    )

    expect(saveOpenedTabs).toHaveBeenCalledTimes(1)
    expect(saveOpenedTabs.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        conversation_id: 99,
        folder_id: 7,
        agent_type: "codex",
        is_active: true,
      }),
    ])
    expect(saveOpenedTabs.mock.calls[0][1]).toBe(1)
  })

  it("retries once on CAS rejection with merged server truth", async () => {
    const saveOpenedTabs = jest
      .fn()
      .mockResolvedValueOnce({
        accepted: false,
        version: 3,
        tabs: [
          {
            id: 10,
            folder_id: 1,
            conversation_id: 5,
            agent_type: "claude_code",
            position: 0,
            is_active: true,
            is_pinned: true,
          },
        ],
      })
      .mockResolvedValueOnce({
        accepted: true,
        version: 4,
        tabs: [],
      })

    const listOpenedTabs = jest.fn().mockResolvedValue({
      items: [],
      version: 1,
    })

    await ensureConversationTab(
      {
        instanceKey: "instance-a",
        conversationId: 99,
        folderId: 7,
        agentType: "codex",
        activate: false,
      },
      { listOpenedTabs, saveOpenedTabs }
    )

    expect(saveOpenedTabs).toHaveBeenCalledTimes(2)
    expect(saveOpenedTabs.mock.calls[1][1]).toBe(3)
  })
})
```

- [ ] **Step 2: Run the sync-service tests to verify they fail**

Run: `npm test -- pcTabSyncService.spec.ts --runInBand`

Expected: FAIL because the service module does not exist yet.

- [ ] **Step 3: Implement `pcTabSyncService`**

Create `mcode-app/src/services/conversation/pcTabSyncService.ts`:

```ts
import {
  applyOpenedTabsSnapshot,
  getOpenedTabsSnapshot,
} from "./openedTabsRealtimeCache"
import type {
  RemoteOpenedTab,
  RemoteOpenedTabsSnapshot,
  RemoteSaveTabsOutcome,
} from "./openedTabsTypes"

interface EnsureConversationTabInput {
  instanceKey: string
  conversationId: number
  folderId: number
  agentType: string
  activate: boolean
}

interface SaveApi {
  listOpenedTabs(): Promise<RemoteOpenedTabsSnapshot>
  saveOpenedTabs(
    items: RemoteOpenedTab[],
    expectedVersion: number,
    origin: string
  ): Promise<RemoteSaveTabsOutcome>
}

const ORIGIN_PREFIX = "mcode-mobile"

function buildMergedTabs(
  current: RemoteOpenedTab[],
  input: EnsureConversationTabInput
) {
  const existing = current.find(
    (item) =>
      item.conversation_id === input.conversationId &&
      item.folder_id === input.folderId &&
      item.agent_type === input.agentType
  )

  const base = current
    .filter((item) => item.conversation_id != null)
    .map((item, index) => ({
      ...item,
      position: index,
      is_active: input.activate
        ? item.conversation_id === input.conversationId &&
          item.folder_id === input.folderId &&
          item.agent_type === input.agentType
        : item.is_active,
    }))

  if (existing) {
    return base.map((item) =>
      item.conversation_id === input.conversationId &&
      item.folder_id === input.folderId &&
      item.agent_type === input.agentType
        ? { ...item, is_active: input.activate || item.is_active }
        : input.activate
          ? { ...item, is_active: false }
          : item
    )
  }

  const appended: RemoteOpenedTab = {
    id: 0,
    folder_id: input.folderId,
    conversation_id: input.conversationId,
    agent_type: input.agentType,
    position: base.length,
    is_active: input.activate,
    is_pinned: true,
  }

  const next = [...base, appended]
  if (input.activate) {
    return next.map((item, index) => ({
      ...item,
      position: index,
      is_active: item.conversation_id === input.conversationId &&
        item.folder_id === input.folderId &&
        item.agent_type === input.agentType,
    }))
  }
  return next.map((item, index) => ({ ...item, position: index }))
}

export async function ensureConversationTab(
  input: EnsureConversationTabInput,
  api: SaveApi
) {
  let snapshot =
    getOpenedTabsSnapshot(input.instanceKey) ?? (await api.listOpenedTabs())

  const origin = `${ORIGIN_PREFIX}-${Date.now().toString(36)}`

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const merged = buildMergedTabs(snapshot.items, input)
    const outcome = await api.saveOpenedTabs(merged, snapshot.version, origin)
    applyOpenedTabsSnapshot(input.instanceKey, {
      version: outcome.version,
      items: outcome.tabs,
    }, origin)

    if (outcome.accepted) {
      return outcome
    }

    snapshot = {
      version: outcome.version,
      items: outcome.tabs,
    }
  }

  throw new Error("ensureConversationTab: save_opened_tabs did not converge")
}
```

- [ ] **Step 4: Run sync-service tests**

Run: `npm test -- pcTabSyncService.spec.ts --runInBand`

Expected: PASS

- [ ] **Step 5: Commit**

Run:

```bash
git add mcode-app/src/services/conversation/pcTabSyncService.ts mcode-app/tests/services/pcTabSyncService.spec.ts
git commit -m "feat: add mobile pc tab sync service"
```

## Task 4: Integrate PC tab sync into conversation creation and history send

**Files:**
- Modify: `mcode-app/src/pages/conversations/index.vue`
- Modify: `mcode-app/src/stores/conversationRuntime.ts`
- Test: `mcode-app/tests/stores/conversationRuntime.spec.ts`

- [ ] **Step 1: Add a failing runtime test for pre-send tab sync**

In `mcode-app/tests/stores/conversationRuntime.spec.ts`, add:

```ts
jest.mock("@/services/conversation/pcTabSyncService", () => ({
  ensureConversationTab: jest.fn(),
}))

it("ensures the remote pc tab exists before prompting a historical conversation", async () => {
  const { ensureConversationTab } = require("@/services/conversation/pcTabSyncService")
  const store = useConversationRuntimeStore()

  await store.connect(42, "codex", "/repo", "session-1", undefined, "instance-a")
  await store.sendPrompt(42, [{ type: "text", text: "continue" }])

  expect(ensureConversationTab).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run runtime test to verify it fails**

Run: `npm test -- conversationRuntime.spec.ts --runInBand`

Expected: FAIL because `sendPrompt` does not coordinate remote opened tabs yet.

- [ ] **Step 3: Integrate creation flow**

In `mcode-app/src/pages/conversations/index.vue`, after successful conversation
creation and before navigation into detail, add:

```ts
await ensureConversationTab(
  {
    instanceKey: descriptor.instanceKey,
    conversationId: createdConversationId,
    folderId: selectedProjectId.value,
    agentType: selectedAgentType.value,
    activate: true,
  },
  {
    listOpenedTabs: async () => normalizeOpenedTabsSnapshot(
      await gateway.call<unknown>("list_opened_tabs")
    ),
    saveOpenedTabs: async (items, expectedVersion, origin) =>
      await gateway.call("save_opened_tabs", {
        items,
        expectedVersion,
        origin,
      }),
  }
)
```

Use the same normalized snapshot helper introduced earlier.

- [ ] **Step 4: Integrate historical send flow**

In `mcode-app/src/stores/conversationRuntime.ts`, immediately before the prompt
request is issued for an existing conversation, add:

```ts
await ensureConversationTab(
  {
    instanceKey: session.instanceKey,
    conversationId,
    folderId: resolvedFolderId,
    agentType,
    activate: true,
  },
  {
    listOpenedTabs: async () => normalizeOpenedTabsSnapshot(
      await auth.gateway().call<unknown>("list_opened_tabs")
    ),
    saveOpenedTabs: async (items, expectedVersion, origin) =>
      await auth.gateway().call("save_opened_tabs", {
        items,
        expectedVersion,
        origin,
      }),
  }
)
```

Use the session's resolved `folderId`; if the session does not carry one yet,
read it from the current summary before saving tabs.

- [ ] **Step 5: Run runtime tests**

Run: `npm test -- conversationRuntime.spec.ts --runInBand`

Expected: PASS

- [ ] **Step 6: Commit**

Run:

```bash
git add mcode-app/src/pages/conversations/index.vue mcode-app/src/stores/conversationRuntime.ts mcode-app/tests/stores/conversationRuntime.spec.ts
git commit -m "feat: sync pc tabs for mobile create and send flows"
```

## Task 5: Add hot conversation coordination

**Files:**
- Create: `mcode-app/src/services/conversation/hotConversationCoordinator.ts`
- Modify: `mcode-app/src/services/conversation/connectionSessionManager.ts`
- Modify: `mcode-app/src/services/conversation/conversationSyncService.ts`
- Test: `mcode-app/tests/services/hotConversationCoordinator.spec.ts`

- [ ] **Step 1: Add failing coordinator tests**

Create `mcode-app/tests/services/hotConversationCoordinator.spec.ts`:

```ts
import {
  markConversationHot,
  getConversationHeat,
  releaseConversationHeat,
  resetHotConversationCoordinatorForTests,
} from "@/services/conversation/hotConversationCoordinator"

describe("hotConversationCoordinator", () => {
  beforeEach(() => {
    resetHotConversationCoordinatorForTests()
  })

  it("retains a conversation while a remote pc tab reason exists", () => {
    markConversationHot(42, "pc_open_tab")
    expect(getConversationHeat(42)?.reasons.has("pc_open_tab")).toBe(true)
  })

  it("removes a conversation after its reason is released", () => {
    markConversationHot(42, "detail_visible")
    releaseConversationHeat(42, "detail_visible")
    expect(getConversationHeat(42)).toBeNull()
  })
})
```

- [ ] **Step 2: Run coordinator tests to verify they fail**

Run: `npm test -- hotConversationCoordinator.spec.ts --runInBand`

Expected: FAIL because the coordinator does not exist yet.

- [ ] **Step 3: Implement the coordinator**

Create `mcode-app/src/services/conversation/hotConversationCoordinator.ts`:

```ts
type HeatReason =
  | "detail_visible"
  | "created_recently"
  | "prompt_in_flight"
  | "runtime_active"
  | "connection_bound"
  | "pc_open_tab"

interface HeatState {
  conversationId: number
  reasons: Set<HeatReason>
  updatedAt: number
}

const heatMap = new Map<number, HeatState>()

export function markConversationHot(conversationId: number, reason: HeatReason) {
  const current = heatMap.get(conversationId) ?? {
    conversationId,
    reasons: new Set<HeatReason>(),
    updatedAt: Date.now(),
  }
  current.reasons.add(reason)
  current.updatedAt = Date.now()
  heatMap.set(conversationId, current)
  return current
}

export function releaseConversationHeat(conversationId: number, reason: HeatReason) {
  const current = heatMap.get(conversationId)
  if (!current) return
  current.reasons.delete(reason)
  current.updatedAt = Date.now()
  if (current.reasons.size === 0) {
    heatMap.delete(conversationId)
    return
  }
  heatMap.set(conversationId, current)
}

export function getConversationHeat(conversationId: number) {
  return heatMap.get(conversationId) ?? null
}

export function resetHotConversationCoordinatorForTests() {
  heatMap.clear()
}
```

- [ ] **Step 4: Feed runtime lifecycle into the coordinator**

In `mcode-app/src/services/conversation/connectionSessionManager.ts`, mark or
release `connection_bound` and `runtime_active` reasons when:

1. a conversation is adopted or connected,
2. a conversation is disconnected or cleared.

In `mcode-app/src/services/conversation/conversationSyncService.ts`, mark
`pc_open_tab` when the opened-tab cache contains the conversation and release it
when the conversation disappears from the remote opened-tab snapshot.

- [ ] **Step 5: Run coordinator tests**

Run: `npm test -- hotConversationCoordinator.spec.ts --runInBand`

Expected: PASS

- [ ] **Step 6: Commit**

Run:

```bash
git add mcode-app/src/services/conversation/hotConversationCoordinator.ts mcode-app/src/services/conversation/connectionSessionManager.ts mcode-app/src/services/conversation/conversationSyncService.ts mcode-app/tests/services/hotConversationCoordinator.spec.ts
git commit -m "feat: retain hot conversation runtimes across page lifecycle"
```

## Task 6: Enforce runtime authority over fallback detail calibration

**Files:**
- Modify: `mcode-app/src/stores/conversationRuntime.ts`
- Test: `mcode-app/tests/stores/conversationRuntime.spec.ts`

- [ ] **Step 1: Add a failing authority test**

In `mcode-app/tests/stores/conversationRuntime.spec.ts`, add:

```ts
it("does not let fallback calibration clear an active live message", async () => {
  const store = useConversationRuntimeStore()
  const session = store.getOrCreateSessionForTest(42)
  session.liveMessage = {
    role: "assistant",
    content: [{ type: "text", text: "streaming" }],
    isStreaming: true,
    timestamp: Date.now(),
    isPlaceholderThinking: false,
  }

  await store.applyCalibrationForTest(42, {
    summary: {},
    live_message: null,
  })

  expect(store.getSession(42)?.liveMessage?.content[0]?.text).toBe("streaming")
})
```

- [ ] **Step 2: Run runtime tests to verify they fail**

Run: `npm test -- conversationRuntime.spec.ts --runInBand`

Expected: FAIL because calibration currently can still win against live state.

- [ ] **Step 3: Add a live-authority guard**

In `mcode-app/src/stores/conversationRuntime.ts`, add a helper:

```ts
function hasActiveRuntimeAuthority(session: RuntimeSession) {
  return Boolean(
    session.liveMessage ||
    session.pendingPermission ||
    session.pendingQuestion ||
    session.status === "thinking" ||
    session.status === "running_tool" ||
    session.status === "waiting_permission" ||
    session.status === "waiting_question"
  )
}
```

Use it anywhere fallback calibration or post-`turn_complete` detail refresh can
overwrite the session's live fields. The required behavior is:

```ts
if (hasActiveRuntimeAuthority(session)) {
  // accept durable summary or missing-turn updates only
  return
}
```

- [ ] **Step 4: Restrict `turn_complete` fallback**

In the `turn_complete` flow, keep:

1. durable turn persistence,
2. replay-gap backfill when needed,
3. summary-status reconciliation.

Do not allow a remote detail response to clear or replace newer live runtime
state after mobile has already re-entered a new active turn.

- [ ] **Step 5: Run runtime tests**

Run: `npm test -- conversationRuntime.spec.ts --runInBand`

Expected: PASS

- [ ] **Step 6: Commit**

Run:

```bash
git add mcode-app/src/stores/conversationRuntime.ts mcode-app/tests/stores/conversationRuntime.spec.ts
git commit -m "fix: keep runtime as authority over fallback detail calibration"
```

## Task 7: Add architecture note and full verification

**Files:**
- Create: `docs/mcode-architecture-notes/2026-06-20-cross-device-pc-tab-sync.md`

- [ ] **Step 1: Add the required mcode architecture note**

Create `docs/mcode-architecture-notes/2026-06-20-cross-device-pc-tab-sync.md`:

```md
# Cross-Device PC Tab Sync

`mcode-app` now treats remote `opened_tabs` as an instance-scoped coordination
protocol instead of overview-only display data. Mobile create and historical
send flows call a dedicated `pcTabSyncService`, which reads
`list_opened_tabs`, writes `save_opened_tabs` with CAS `version`, and follows a
conservative conditional-activation rule. Mobile only writes
conversation-bound tabs; it never attempts to mirror PC-local draft tabs.

Realtime tab state is cached in-memory per `instanceKey` through
`tabs://changed`, with `list_opened_tabs` as reconnect and stale-version
fallback. This cache feeds conversation overview, PC-tab existence checks, and
hot-conversation retention logic.

Conversation detail authority is now layered:
1. attach-based runtime is authoritative for live turn state,
2. SQLite is authoritative for completed persisted history,
3. remote detail fetch is fallback calibration only.
Calibration may fill missing durable turns or summary metadata, but must not
overwrite active live runtime content, pending permission/question cards, or
newer in-progress status.

Native iOS and Android clients should replicate the same split:
instance-scoped remote opened-tab cache, one write service for PC-tab sync, and
a hot conversation coordinator independent from page lifecycle.
```

- [ ] **Step 2: Run the targeted test suite**

Run:

```bash
npm test -- openedTabsRealtimeCache.spec.ts --runInBand
npm test -- pcTabSyncService.spec.ts --runInBand
npm test -- hotConversationCoordinator.spec.ts --runInBand
npm test -- conversationRuntime.spec.ts --runInBand
npm test -- conversationOverviewSnapshot.spec.ts --runInBand
```

Expected:

1. All listed suites PASS.
2. No new failures appear in the changed runtime and conversation sync areas.

- [ ] **Step 3: Run a type-aware project validation**

Run: `npm test --runInBand`

Expected:

1. Existing suite remains green, or
2. Any unrelated pre-existing failures are documented before completion.

- [ ] **Step 4: Commit**

Run:

```bash
git add docs/mcode-architecture-notes/2026-06-20-cross-device-pc-tab-sync.md
git commit -m "docs: add cross-device pc tab sync architecture note"
```

## Self-Review

### Spec coverage

Covered requirements:

1. mobile create conversation opens or reuses PC tab: Task 4
2. mobile history send opens or reuses PC tab before prompt: Task 4
3. instance-scoped opened-tab cache and `tabs://changed`: Task 2
4. single write path with CAS retry: Task 3
5. hot runtime coordination independent from page lifecycle: Task 5
6. realtime runtime authority over detail calibration: Task 6
7. required mcode architecture note: Task 7

No spec section is left without a corresponding task.

### Placeholder scan

Manual scan complete:

1. no `TODO`/`TBD`
2. no "handle appropriately" placeholders
3. every changed code area has a concrete target file

### Type consistency

Key names used consistently across tasks:

1. `RemoteOpenedTabsSnapshot`
2. `RemoteSaveTabsOutcome`
3. `ensureConversationTab`
4. `openedTabsRealtimeCache`
5. `hotConversationCoordinator`

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-20-mcode-cross-device-pc-tab-sync-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
