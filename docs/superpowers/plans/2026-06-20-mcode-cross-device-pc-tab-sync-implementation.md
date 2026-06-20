# mcode Cross-Device PC Tab Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add mobile-side PC tab synchronization and hot conversation coordination in `mcode-app` so mobile create/send flows open or reuse remote PC tabs and detail realtime state remains authoritative without modifying `codeg-main`.

**Architecture:** Introduce an instance-scoped remote opened-tab cache, a single `pcTabSyncService` write path for `list_opened_tabs` and `save_opened_tabs`, and a `hotConversationCoordinator` that decouples runtime lifetime from the detail page. Reuse existing `conversation://changed`, attach-based realtime transport, and SQLite-backed conversation storage; all server interactions remain on existing `codeg-main` endpoints.

**Tech Stack:** `uni-app`, `Vue 3`, `Pinia`, `TypeScript`, existing `mcode-app` gateway layer, attach-based realtime transport, Jest unit tests.

---

## File Structure

### New files

- `mcode-app/src/services/conversation/openedTabsRealtimeCache.ts`
  - Instance-scoped in-memory cache for remote `OpenedTabsSnapshot`.
- `mcode-app/src/services/conversation/pcTabSyncService.ts`
  - Single mobile write path for ensuring or activating remote PC tabs through existing tab APIs.
- `mcode-app/src/services/conversation/hotConversationCoordinator.ts`
  - Hot-session lifetime coordinator independent from page mount state.
- `mcode-app/tests/services/openedTabsRealtimeCache.spec.ts`
  - Cache behavior tests.
- `mcode-app/tests/services/pcTabSyncService.spec.ts`
  - Remote tab merge, activation, and CAS retry tests.
- `mcode-app/tests/services/hotConversationCoordinator.spec.ts`
  - Hot runtime retention and sweep tests.
- `docs/mcode-architecture-notes/2026-06-20-cross-device-pc-tab-sync.md`
  - Required architecture note for the mcode change.

### Existing files to modify

- `mcode-app/src/api/acp.ts`
  - Add mobile-side subscription support for `tabs://changed`.
- `mcode-app/src/pages/conversations/index.vue`
  - Fix `list_opened_tabs` snapshot parsing and route create/history open flows through the new services.
- `mcode-app/src/services/conversation/conversationOverviewSnapshot.ts`
  - Accept parsed `OpenedTab[]` from real snapshots and preserve active metadata correctly.
- `mcode-app/src/services/conversation/conversationSyncService.ts`
  - Use the hot-session coordinator and opened-tab cache signals during attach and reconnect.
- `mcode-app/src/stores/conversationRuntime.ts`
  - Move runtime lifetime decisions to the coordinator and harden realtime-over-calibration authority.
- `mcode-app/tests/stores/conversationRuntime.spec.ts`
  - Extend runtime authority and hot-session tests.
- `mcode-app/tests/services/conversationOverviewSnapshot.spec.ts`
  - Cover proper snapshot parsing and active tab interpretation.

## Task 1: Add remote opened-tab cache primitives

**Files:**
- Create: `mcode-app/src/services/conversation/openedTabsRealtimeCache.ts`
- Modify: `mcode-app/src/api/acp.ts`
- Test: `mcode-app/tests/services/openedTabsRealtimeCache.spec.ts`

- [ ] **Step 1: Write the failing cache tests**

```ts
import {
  applyOpenedTabsSnapshot,
  getOpenedTabsSnapshot,
  resetOpenedTabsSnapshotCache,
} from "@/services/conversation/openedTabsRealtimeCache"

describe("openedTabsRealtimeCache", () => {
  beforeEach(() => {
    resetOpenedTabsSnapshotCache()
  })

  it("stores the newest snapshot per instance", () => {
    applyOpenedTabsSnapshot("inst-a", {
      version: 2,
      origin: "remote-a",
      tabs: [{ id: 1, folder_id: 3, conversation_id: 9, agent_type: "codex", position: 0, is_active: true, is_pinned: false }],
    })

    expect(getOpenedTabsSnapshot("inst-a")).toEqual(
      expect.objectContaining({
        version: 2,
        items: [
          expect.objectContaining({
            id: 1,
            conversation_id: 9,
            is_active: true,
          }),
        ],
      })
    )
  })

  it("ignores stale versions", () => {
    applyOpenedTabsSnapshot("inst-a", {
      version: 4,
      origin: "remote-a",
      tabs: [],
    })
    applyOpenedTabsSnapshot("inst-a", {
      version: 3,
      origin: "remote-b",
      tabs: [{ id: 2, folder_id: 1, conversation_id: 8, agent_type: "claude_code", position: 0, is_active: true, is_pinned: false }],
    })

    expect(getOpenedTabsSnapshot("inst-a")?.version).toBe(4)
    expect(getOpenedTabsSnapshot("inst-a")?.items).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- mcode-app/tests/services/openedTabsRealtimeCache.spec.ts`
Expected: FAIL with module-not-found for `openedTabsRealtimeCache`.

- [ ] **Step 3: Write minimal cache implementation**

```ts
type OpenedTabRecord = {
  id: number
  folder_id: number
  conversation_id?: number | null
  agent_type?: string
  position?: number
  is_active?: boolean
  is_pinned?: boolean
}

type OpenedTabsChangedPayload = {
  version: number
  origin: string
  tabs: OpenedTabRecord[]
}

type OpenedTabsSnapshotCache = {
  instanceKey: string
  version: number
  items: OpenedTabRecord[]
  updatedAt: number
  lastOrigin: string | null
}

const snapshots = new Map<string, OpenedTabsSnapshotCache>()

export function applyOpenedTabsSnapshot(
  instanceKey: string,
  payload: OpenedTabsChangedPayload
) {
  const current = snapshots.get(instanceKey)
  if (current && payload.version < current.version) {
    return current
  }
  const next: OpenedTabsSnapshotCache = {
    instanceKey,
    version: payload.version,
    items: Array.isArray(payload.tabs) ? payload.tabs.slice() : [],
    updatedAt: Date.now(),
    lastOrigin: payload.origin || null,
  }
  snapshots.set(instanceKey, next)
  return next
}

export function replaceOpenedTabsSnapshot(
  instanceKey: string,
  version: number,
  items: OpenedTabRecord[],
  origin: string | null
) {
  return applyOpenedTabsSnapshot(instanceKey, {
    version,
    origin: origin || "server",
    tabs: items,
  })
}

export function getOpenedTabsSnapshot(instanceKey: string) {
  return snapshots.get(instanceKey) || null
}

export function resetOpenedTabsSnapshotCache() {
  snapshots.clear()
}
```

- [ ] **Step 4: Extend `acp.ts` with a dedicated tabs subscription helper**

```ts
const TABS_CHANGED_CHANNEL = "tabs://changed"

subscribeOpenedTabsChanged(
  callback: (payload: unknown) => void,
  instanceKey?: string
) {
  return this.subscribeGlobalEvent(TABS_CHANGED_CHANNEL, callback, instanceKey)
}
```

- [ ] **Step 5: Run the focused tests**

Run: `pnpm test:unit -- mcode-app/tests/services/openedTabsRealtimeCache.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add mcode-app/src/api/acp.ts mcode-app/src/services/conversation/openedTabsRealtimeCache.ts mcode-app/tests/services/openedTabsRealtimeCache.spec.ts
git commit -m "feat: add opened tab realtime cache"
```

## Task 2: Implement PC tab sync service with CAS retry

**Files:**
- Create: `mcode-app/src/services/conversation/pcTabSyncService.ts`
- Modify: `mcode-app/src/services/conversation/openedTabsRealtimeCache.ts`
- Test: `mcode-app/tests/services/pcTabSyncService.spec.ts`

- [ ] **Step 1: Write the failing service tests**

```ts
import { ensureConversationTab } from "@/services/conversation/pcTabSyncService"

jest.mock("@/services/conversation/openedTabsRealtimeCache", () => ({
  getOpenedTabsSnapshot: jest.fn(),
  replaceOpenedTabsSnapshot: jest.fn(),
}))

describe("pcTabSyncService", () => {
  it("appends a missing conversation tab and activates it when safe", async () => {
    const gateway = {
      call: jest
        .fn()
        .mockResolvedValueOnce({
          items: [],
          version: 3,
        })
        .mockResolvedValueOnce({
          accepted: true,
          version: 4,
          tabs: [
            {
              id: 0,
              folder_id: 7,
              conversation_id: 99,
              agent_type: "codex",
              position: 0,
              is_active: true,
              is_pinned: false,
            },
          ],
        }),
    }

    await ensureConversationTab({
      instanceKey: "inst-a",
      gateway: gateway as any,
      folderId: 7,
      conversationId: 99,
      agentType: "codex",
      activation: "allow",
      origin: "mcode-mobile",
    })

    expect(gateway.call).toHaveBeenNthCalledWith(1, "list_opened_tabs", {})
    expect(gateway.call).toHaveBeenNthCalledWith(
      2,
      "save_opened_tabs",
      expect.objectContaining({
        expectedVersion: 3,
        origin: "mcode-mobile",
        items: [
          expect.objectContaining({
            conversation_id: 99,
            is_active: true,
          }),
        ],
      })
    )
  })

  it("retries once on stale CAS using returned canonical tabs", async () => {
    const gateway = {
      call: jest
        .fn()
        .mockResolvedValueOnce({
          items: [],
          version: 1,
        })
        .mockResolvedValueOnce({
          accepted: false,
          version: 2,
          tabs: [
            {
              id: 5,
              folder_id: 3,
              conversation_id: 41,
              agent_type: "claude_code",
              position: 0,
              is_active: true,
              is_pinned: true,
            },
          ],
        })
        .mockResolvedValueOnce({
          accepted: true,
          version: 3,
          tabs: [
            {
              id: 5,
              folder_id: 3,
              conversation_id: 41,
              agent_type: "claude_code",
              position: 0,
              is_active: false,
              is_pinned: true,
            },
            {
              id: 0,
              folder_id: 7,
              conversation_id: 99,
              agent_type: "codex",
              position: 1,
              is_active: true,
              is_pinned: false,
            },
          ],
        }),
    }

    await ensureConversationTab({
      instanceKey: "inst-a",
      gateway: gateway as any,
      folderId: 7,
      conversationId: 99,
      agentType: "codex",
      activation: "allow",
      origin: "mcode-mobile",
    })

    expect(gateway.call).toHaveBeenCalledTimes(3)
    expect(gateway.call).toHaveBeenNthCalledWith(
      3,
      "save_opened_tabs",
      expect.objectContaining({
        expectedVersion: 2,
      })
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- mcode-app/tests/services/pcTabSyncService.spec.ts`
Expected: FAIL with module-not-found for `pcTabSyncService`.

- [ ] **Step 3: Implement minimal service and snapshot normalization**

```ts
type EnsureConversationTabInput = {
  instanceKey: string
  gateway: { call<T>(command: string, data?: Record<string, unknown>): Promise<T> }
  folderId: number
  conversationId: number
  agentType: string
  activation: "allow" | "background_only"
  origin: string
}

type RemoteOpenedTab = {
  id: number
  folder_id: number
  conversation_id?: number | null
  agent_type?: string
  position?: number
  is_active?: boolean
  is_pinned?: boolean
}

type OpenedTabsSnapshotResponse = {
  items: RemoteOpenedTab[]
  version: number
}

type SaveTabsOutcome = {
  accepted: boolean
  version: number
  tabs: RemoteOpenedTab[]
}

function normalizeSnapshot(raw: unknown): OpenedTabsSnapshotResponse {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  return {
    items: Array.isArray(record.items) ? (record.items as RemoteOpenedTab[]) : [],
    version: typeof record.version === "number" ? record.version : 0,
  }
}

function buildMergedTabs(
  items: RemoteOpenedTab[],
  input: EnsureConversationTabInput
) {
  const existing = items.find(
    (tab) =>
      Number(tab.conversation_id || 0) === input.conversationId &&
      Number(tab.folder_id || 0) === input.folderId &&
      String(tab.agent_type || "").trim() === input.agentType
  )
  const hasActiveConversationTab = items.some((tab) => tab.is_active)
  const shouldActivate =
    input.activation === "allow" && (existing?.is_active || hasActiveConversationTab || items.length === 0)

  const base = existing
    ? items.map((tab) =>
        tab === existing
          ? { ...tab, is_active: shouldActivate || Boolean(tab.is_active) }
          : shouldActivate
            ? { ...tab, is_active: false }
            : { ...tab }
      )
    : [
        ...items.map((tab) => (shouldActivate ? { ...tab, is_active: false } : { ...tab })),
        {
          id: 0,
          folder_id: input.folderId,
          conversation_id: input.conversationId,
          agent_type: input.agentType,
          position: items.length,
          is_active: shouldActivate,
          is_pinned: false,
        },
      ]

  return base.map((tab, index) => ({
    ...tab,
    position: index,
  }))
}
```

- [ ] **Step 4: Implement save and one-shot retry flow**

```ts
export async function ensureConversationTab(input: EnsureConversationTabInput) {
  const cold = await input.gateway.call<OpenedTabsSnapshotResponse>("list_opened_tabs", {})
  let snapshot = normalizeSnapshot(cold)

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const items = buildMergedTabs(snapshot.items, input)
    const result = await input.gateway.call<SaveTabsOutcome>("save_opened_tabs", {
      items,
      expectedVersion: snapshot.version,
      origin: input.origin,
    })
    if (result.accepted) {
      replaceOpenedTabsSnapshot(input.instanceKey, result.version, result.tabs, input.origin)
      return result
    }
    snapshot = {
      version: result.version,
      items: Array.isArray(result.tabs) ? result.tabs : [],
    }
  }

  replaceOpenedTabsSnapshot(input.instanceKey, snapshot.version, snapshot.items, "server")
  return {
    accepted: false,
    version: snapshot.version,
    tabs: snapshot.items,
  }
}
```

- [ ] **Step 5: Run the focused tests**

Run: `pnpm test:unit -- mcode-app/tests/services/pcTabSyncService.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add mcode-app/src/services/conversation/openedTabsRealtimeCache.ts mcode-app/src/services/conversation/pcTabSyncService.ts mcode-app/tests/services/pcTabSyncService.spec.ts
git commit -m "feat: add mobile pc tab sync service"
```

## Task 3: Fix opened-tab snapshot parsing and overview consumption

**Files:**
- Modify: `mcode-app/src/pages/conversations/index.vue`
- Modify: `mcode-app/src/services/conversation/conversationOverviewSnapshot.ts`
- Test: `mcode-app/tests/services/conversationOverviewSnapshot.spec.ts`

- [ ] **Step 1: Write the failing snapshot parsing test**

```ts
import { buildConnectionConversationSnapshot } from "@/services/conversation/conversationOverviewSnapshot"

describe("conversationOverviewSnapshot opened tabs", () => {
  it("keeps active flags from parsed opened-tab snapshot items", () => {
    const snapshot = buildConnectionConversationSnapshot({
      connectionKey: "direct::http://localhost:3000",
      connectionName: "本地连接",
      mode: "direct",
      url: "http://localhost:3000",
      folders: [{ id: 7, name: "mcode", path: "D:/Repos/xyito/lingyun/mcode" }],
      tabs: [
        {
          id: 11,
          folder_id: 7,
          conversation_id: 101,
          agent_type: "codex",
          position: 0,
          is_active: true,
          is_pinned: false,
        },
      ],
      conversations: [
        {
          id: 101,
          title: "opened tab",
          agent_type: "codex",
          folder_id: 7,
          updated_at: "2026-06-20T10:00:00+08:00",
          last_message_at: "2026-06-20T10:00:00+08:00",
          status: "in_progress",
        },
      ],
      now: Date.parse("2026-06-20T10:00:01+08:00"),
    })

    expect(snapshot.openTabCards[0]).toEqual(
      expect.objectContaining({
        tabId: 11,
        isActive: true,
        title: "opened tab",
      })
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- mcode-app/tests/services/conversationOverviewSnapshot.spec.ts`
Expected: FAIL or expose incorrect tab parsing assumptions.

- [ ] **Step 3: Add a helper in `index.vue` to parse real opened-tab snapshots**

```ts
function normalizeOpenedTabsSnapshot(input: unknown): { items: OpenedTabItem[]; version: number } {
  if (!input || typeof input !== "object") {
    return { items: [], version: 0 }
  }
  const record = input as Record<string, unknown>
  return {
    items: Array.isArray(record.items) ? (record.items as OpenedTabItem[]) : [],
    version: typeof record.version === "number" ? record.version : 0,
  }
}
```

- [ ] **Step 4: Replace array-only reads in overview loading**

```ts
const tabsRaw = await gateway.call<unknown>("list_opened_tabs")
const tabsSnapshot = normalizeOpenedTabsSnapshot(tabsRaw)
const tabs = tabsSnapshot.items
rememberConnectionRemoteState(connectionKey(conn), folders, tabs)
```

- [ ] **Step 5: Keep overview snapshot typing strict**

```ts
export interface ConversationOverviewOpenedTab {
  id: number
  folder_id: number
  conversation_id?: number | null
  agent_type?: string
  position?: number
  is_active?: boolean
  is_pinned?: boolean
}
```

- [ ] **Step 6: Run the focused tests**

Run: `pnpm test:unit -- mcode-app/tests/services/conversationOverviewSnapshot.spec.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add mcode-app/src/pages/conversations/index.vue mcode-app/src/services/conversation/conversationOverviewSnapshot.ts mcode-app/tests/services/conversationOverviewSnapshot.spec.ts
git commit -m "fix: parse opened tab snapshots correctly"
```

## Task 4: Add hot conversation coordinator

**Files:**
- Create: `mcode-app/src/services/conversation/hotConversationCoordinator.ts`
- Modify: `mcode-app/src/services/conversation/conversationSyncService.ts`
- Modify: `mcode-app/src/services/conversation/connectionSessionManager.ts`
- Test: `mcode-app/tests/services/hotConversationCoordinator.spec.ts`

- [ ] **Step 1: Write the failing coordinator tests**

```ts
import {
  markConversationHot,
  isConversationHot,
  releaseConversationHotReason,
  sweepColdConversations,
  resetHotConversationCoordinator,
} from "@/services/conversation/hotConversationCoordinator"

describe("hotConversationCoordinator", () => {
  beforeEach(() => {
    resetHotConversationCoordinator()
  })

  it("keeps a conversation hot while a pc_open_tab reason exists", () => {
    markConversationHot(99, "pc_open_tab")
    expect(isConversationHot(99)).toBe(true)

    releaseConversationHotReason(99, "pc_open_tab")
    expect(isConversationHot(99)).toBe(false)
  })

  it("sweeps only cold conversations older than the ttl", () => {
    markConversationHot(88, "page_visible")
    releaseConversationHotReason(88, "page_visible")

    expect(sweepColdConversations(Date.now() + 11 * 60_000)).toContain(88)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- mcode-app/tests/services/hotConversationCoordinator.spec.ts`
Expected: FAIL with module-not-found for `hotConversationCoordinator`.

- [ ] **Step 3: Implement the coordinator**

```ts
type HotReason =
  | "page_visible"
  | "mobile_created"
  | "mobile_prompt_active"
  | "runtime_in_progress"
  | "known_connection"
  | "pc_open_tab"

type HotEntry = {
  touchedAt: number
  reasons: Set<HotReason>
}

const entries = new Map<number, HotEntry>()
const HOT_TTL_MS = 10 * 60_000

function getOrCreateEntry(conversationId: number) {
  const existing = entries.get(conversationId)
  if (existing) return existing
  const created: HotEntry = {
    touchedAt: Date.now(),
    reasons: new Set(),
  }
  entries.set(conversationId, created)
  return created
}

export function markConversationHot(conversationId: number, reason: HotReason) {
  const entry = getOrCreateEntry(conversationId)
  entry.reasons.add(reason)
  entry.touchedAt = Date.now()
}

export function releaseConversationHotReason(conversationId: number, reason: HotReason) {
  const entry = entries.get(conversationId)
  if (!entry) return
  entry.reasons.delete(reason)
  entry.touchedAt = Date.now()
}

export function isConversationHot(conversationId: number) {
  const entry = entries.get(conversationId)
  return Boolean(entry && entry.reasons.size > 0)
}

export function sweepColdConversations(now = Date.now()) {
  const stale: number[] = []
  for (const [conversationId, entry] of entries.entries()) {
    if (entry.reasons.size > 0) continue
    if (now - entry.touchedAt < HOT_TTL_MS) continue
    stale.push(conversationId)
    entries.delete(conversationId)
  }
  return stale
}

export function resetHotConversationCoordinator() {
  entries.clear()
}
```

- [ ] **Step 4: Hook the coordinator into conversation attach lifecycle**

```ts
import {
  markConversationHot,
  releaseConversationHotReason,
} from "@/services/conversation/hotConversationCoordinator"

// on attach start
markConversationHot(input.conversationId, "known_connection")

// on detach
releaseConversationHotReason(conversationId, "known_connection")
```

- [ ] **Step 5: Run the focused tests**

Run: `pnpm test:unit -- mcode-app/tests/services/hotConversationCoordinator.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add mcode-app/src/services/conversation/hotConversationCoordinator.ts mcode-app/src/services/conversation/conversationSyncService.ts mcode-app/src/services/conversation/connectionSessionManager.ts mcode-app/tests/services/hotConversationCoordinator.spec.ts
git commit -m "feat: add hot conversation coordinator"
```

## Task 5: Route mobile create flow through PC tab sync

**Files:**
- Modify: `mcode-app/src/pages/conversations/index.vue`
- Modify: `mcode-app/src/stores/conversationRuntime.ts`
- Test: `mcode-app/tests/stores/conversationRuntime.spec.ts`

- [ ] **Step 1: Write the failing create-flow test**

```ts
import { ensureConversationTab } from "@/services/conversation/pcTabSyncService"

jest.mock("@/services/conversation/pcTabSyncService", () => ({
  ensureConversationTab: jest.fn(),
}))

it("ensures the remote pc tab after mobile conversation creation", async () => {
  const ensureConversationTabMock = ensureConversationTab as jest.Mock
  ensureConversationTabMock.mockResolvedValue({
    accepted: true,
    version: 2,
    tabs: [],
  })

  // exercise the create success path in the page or extracted helper
  expect(ensureConversationTabMock).toHaveBeenCalledWith(
    expect.objectContaining({
      conversationId: expect.any(Number),
      activation: "allow",
    })
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- mcode-app/tests/stores/conversationRuntime.spec.ts`
Expected: FAIL because create flow does not invoke `ensureConversationTab`.

- [ ] **Step 3: Call `ensureConversationTab` immediately after create success**

```ts
await ensureConversationTab({
  instanceKey: descriptor.instanceKey,
  gateway,
  folderId: selectedProjectId.value,
  conversationId,
  agentType: selectedAgentType.value,
  activation: "allow",
  origin: "mcode-mobile",
}).catch((error) => {
  console.warn("ensure pc tab after create skipped:", error)
})
```

- [ ] **Step 4: Mark the created conversation hot**

```ts
markConversationHot(conversationId, "mobile_created")
markConversationHot(conversationId, "page_visible")
```

- [ ] **Step 5: Run the focused tests**

Run: `pnpm test:unit -- mcode-app/tests/stores/conversationRuntime.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add mcode-app/src/pages/conversations/index.vue mcode-app/src/stores/conversationRuntime.ts mcode-app/tests/stores/conversationRuntime.spec.ts
git commit -m "feat: sync pc tab after mobile create"
```

## Task 6: Route historical send flow through PC tab sync

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`
- Modify: `mcode-app/src/stores/conversationRuntime.ts`
- Test: `mcode-app/tests/stores/conversationRuntime.spec.ts`

- [ ] **Step 1: Write the failing historical-send test**

```ts
import { ensureConversationTab } from "@/services/conversation/pcTabSyncService"

jest.mock("@/services/conversation/pcTabSyncService", () => ({
  ensureConversationTab: jest.fn(),
}))

it("ensures the pc tab before sending to a historical conversation", async () => {
  const store = useConversationRuntimeStore()
  await store.connect(9, "codex", "D:/Repos/xyito/lingyun/mcode", "session-1", 0, "test-instance")

  expect(ensureConversationTab).toHaveBeenCalledWith(
    expect.objectContaining({
      conversationId: 9,
    })
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- mcode-app/tests/stores/conversationRuntime.spec.ts`
Expected: FAIL because connect/send path does not coordinate remote tab state.

- [ ] **Step 3: Ensure or reuse PC tab before prompt dispatch**

```ts
await ensureConversationTab({
  instanceKey: session.instanceKey,
  gateway: auth.gateway(),
  folderId: opts?.folderId || 0,
  conversationId,
  agentType: managed?.connection.agentType || "claude_code",
  activation: "allow",
  origin: "mcode-mobile",
}).catch((error) => {
  console.warn("ensure pc tab before prompt skipped:", error)
})
markConversationHot(conversationId, "mobile_prompt_active")
```

- [ ] **Step 4: Release prompt-active hot reason on turn completion and hard failure**

```ts
releaseConversationHotReason(conversationId, "mobile_prompt_active")
```

- [ ] **Step 5: Run the focused tests**

Run: `pnpm test:unit -- mcode-app/tests/stores/conversationRuntime.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add mcode-app/src/pages/conversation-detail/index.vue mcode-app/src/stores/conversationRuntime.ts mcode-app/tests/stores/conversationRuntime.spec.ts
git commit -m "feat: sync pc tab before historical send"
```

## Task 7: Make runtime authoritative over fallback calibration

**Files:**
- Modify: `mcode-app/src/stores/conversationRuntime.ts`
- Modify: `mcode-app/src/services/conversation/conversationSyncService.ts`
- Test: `mcode-app/tests/stores/conversationRuntime.spec.ts`

- [ ] **Step 1: Write the failing authority tests**

```ts
it("does not let calibration overwrite active live runtime state", async () => {
  const store = useConversationRuntimeStore()
  const session = store.getOrCreateSession(1)
  session.connectionId = "conn-1"
  session.status = "thinking"
  session.liveMessage = {
    role: "assistant",
    content: [{ type: "text", text: "streaming tail" }],
    isStreaming: true,
    timestamp: Date.now(),
    isPlaceholderThinking: false,
  }

  store.hydrateLiveSnapshot(1, {
    event_seq: 3,
    live_message: {
      started_at: Date.now(),
      content: [{ kind: "text", text: "older calibration" }],
    },
  })

  expect(store.getMessages(1)[0]?.content?.[0]).toEqual({
    type: "text",
    text: "streaming tail",
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- mcode-app/tests/stores/conversationRuntime.spec.ts`
Expected: FAIL because fallback hydration can still overwrite newer live state.

- [ ] **Step 3: Add an explicit runtime-authority guard**

```ts
function hasAuthoritativeLiveRuntime(session: RuntimeSession) {
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

- [ ] **Step 4: Suppress destructive calibration writes when runtime is authoritative**

```ts
if (hasAuthoritativeLiveRuntime(session) && shouldIgnoreOlderSnapshot) {
  return
}
```

and

```ts
if (hasAuthoritativeLiveRuntime(session)) {
  return await calibrateConversationDetailInternal(conversationId, false)
}
```

- [ ] **Step 5: Run the focused tests**

Run: `pnpm test:unit -- mcode-app/tests/stores/conversationRuntime.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add mcode-app/src/stores/conversationRuntime.ts mcode-app/src/services/conversation/conversationSyncService.ts mcode-app/tests/stores/conversationRuntime.spec.ts
git commit -m "fix: keep runtime authoritative over calibration"
```

## Task 8: Subscribe to `tabs://changed` and keep hot reasons aligned

**Files:**
- Modify: `mcode-app/src/services/conversation/globalConversationSync.ts`
- Modify: `mcode-app/src/services/conversation/openedTabsRealtimeCache.ts`
- Modify: `mcode-app/src/services/conversation/hotConversationCoordinator.ts`
- Test: `mcode-app/tests/services/openedTabsRealtimeCache.spec.ts`
- Test: `mcode-app/tests/services/hotConversationCoordinator.spec.ts`

- [ ] **Step 1: Write the failing integration-style cache test**

```ts
it("marks conversations hot when they appear in remote opened tabs", () => {
  applyOpenedTabsSnapshot("inst-a", {
    version: 2,
    origin: "pc",
    tabs: [
      {
        id: 9,
        folder_id: 7,
        conversation_id: 22,
        agent_type: "codex",
        position: 0,
        is_active: true,
        is_pinned: false,
      },
    ],
  })

  expect(isConversationHot(22)).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- mcode-app/tests/services/openedTabsRealtimeCache.spec.ts mcode-app/tests/services/hotConversationCoordinator.spec.ts`
Expected: FAIL because cache updates do not affect hot-session reasons.

- [ ] **Step 3: Update cache apply logic to reconcile `pc_open_tab` reasons**

```ts
function reconcileHotReasons(instanceKey: string, items: OpenedTabRecord[]) {
  const activeConversationIds = new Set(
    items
      .map((tab) => Number(tab.conversation_id || 0))
      .filter((conversationId) => conversationId > 0)
  )
  setPcOpenTabConversationIds(instanceKey, activeConversationIds)
}
```

- [ ] **Step 4: Add instance-scoped `pc_open_tab` reconciliation in coordinator**

```ts
const pcOpenTabByInstance = new Map<string, Set<number>>()

export function setPcOpenTabConversationIds(instanceKey: string, nextIds: Set<number>) {
  const previous = pcOpenTabByInstance.get(instanceKey) || new Set<number>()
  previous.forEach((conversationId) => {
    if (!nextIds.has(conversationId)) {
      releaseConversationHotReason(conversationId, "pc_open_tab")
    }
  })
  nextIds.forEach((conversationId) => {
    markConversationHot(conversationId, "pc_open_tab")
  })
  pcOpenTabByInstance.set(instanceKey, new Set(nextIds))
}
```

- [ ] **Step 5: Run the focused tests**

Run: `pnpm test:unit -- mcode-app/tests/services/openedTabsRealtimeCache.spec.ts mcode-app/tests/services/hotConversationCoordinator.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add mcode-app/src/services/conversation/openedTabsRealtimeCache.ts mcode-app/src/services/conversation/hotConversationCoordinator.ts mcode-app/tests/services/openedTabsRealtimeCache.spec.ts mcode-app/tests/services/hotConversationCoordinator.spec.ts
git commit -m "feat: keep hot sessions aligned with pc opened tabs"
```

## Task 9: Update mcode architecture note

**Files:**
- Create: `docs/mcode-architecture-notes/2026-06-20-cross-device-pc-tab-sync.md`

- [ ] **Step 1: Write the architecture note**

```md
# Cross-Device PC Tab Sync

`mcode-app` now treats remote `codeg-main` opened tabs as a first-class
instance-scoped coordination state.

Architecture:

1. `openedTabsRealtimeCache` subscribes to `tabs://changed` and stores the
   latest `{ version, items }` snapshot per remote instance.
2. `pcTabSyncService` is the only mobile write path to remote `opened_tabs`.
   It reads the latest snapshot, merges the target conversation tab, applies
   conditional activation, and writes through `save_opened_tabs` using CAS.
3. `hotConversationCoordinator` keeps runtime sessions alive independently from
   the detail page while the conversation is running, recently mobile-touched,
   or present in remote PC opened tabs.

Protocol and data flow:

1. Mobile create success calls `ensureConversationTab` immediately after the
   server returns the new conversation id.
2. Mobile historical send calls `ensureConversationTab` before `acp_prompt`.
3. Accepted remote tab mutations trigger `tabs://changed`, which updates mobile
   cache and keeps `pc_open_tab` hot-session reasons in sync.

UI behavior:

1. Mobile always ensures the PC has a conversation-bound tab.
2. Mobile activates the remote PC tab only when the persisted snapshot does not
   indicate a likely draft conflict.
3. Detail realtime runtime is authoritative over fallback detail calibration.

Compatibility:

1. No `codeg-main` change is required.
2. Mobile writes only conversation-bound tabs; PC draft tabs remain device-local.

Native replication guidance:

1. Keep the same three-layer split: remote opened-tab cache, single tab-sync
   writer, and hot conversation coordinator.
2. Treat attach-stream runtime as the live authority and remote detail fetch as
   calibration only.
```

- [ ] **Step 2: Review note for architecture completeness**

Run: `Get-Content -Raw docs/mcode-architecture-notes/2026-06-20-cross-device-pc-tab-sync.md`
Expected: note mentions architecture, protocol/data flow, UI behavior, compatibility, and native guidance.

- [ ] **Step 3: Commit**

```bash
git add docs/mcode-architecture-notes/2026-06-20-cross-device-pc-tab-sync.md
git commit -m "docs: add cross-device pc tab sync architecture note"
```

## Task 10: Full verification

**Files:**
- Verify only

- [ ] **Step 1: Run service and store unit tests**

Run: `pnpm test:unit -- mcode-app/tests/services/openedTabsRealtimeCache.spec.ts mcode-app/tests/services/pcTabSyncService.spec.ts mcode-app/tests/services/hotConversationCoordinator.spec.ts mcode-app/tests/services/conversationOverviewSnapshot.spec.ts mcode-app/tests/stores/conversationRuntime.spec.ts`
Expected: PASS

- [ ] **Step 2: Run the broader conversation-related test slice**

Run: `pnpm test:unit -- mcode-app/tests/services/runtimeViewState.spec.ts mcode-app/tests/services/conversationRepository.spec.ts mcode-app/tests/pages/conversations/historyPresentation.spec.ts`
Expected: PASS

- [ ] **Step 3: Sanity-check changed files**

Run: `git -C D:\\Repos\\xyito\\lingyun\\mcode diff --stat`
Expected: only `mcode-app` and docs plan/note/spec files changed; no `codeg-main` modifications.

- [ ] **Step 4: Final commit**

```bash
git add mcode-app docs/mcode-architecture-notes docs/superpowers/specs docs/superpowers/plans
git commit -m "feat: add mobile pc tab sync orchestration"
```

## Spec Coverage Check

Covered spec requirements:

1. Mobile-side `opened_tabs` cache:
   Tasks 1, 3, and 8.
2. Single write path for remote PC tab coordination:
   Task 2.
3. Create conversation should create or reuse remote PC tab:
   Task 5.
4. Historical send should create or reuse remote PC tab before the turn runs:
   Task 6.
5. Detail realtime authority over fallback calibration:
   Task 7.
6. Hot conversation lifetime independent from page mount:
   Tasks 4 and 8.
7. Required mcode architecture note:
   Task 9.

No uncovered spec sections remain.
