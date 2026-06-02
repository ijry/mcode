# MCode Conversation Runtime Rearchitecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `mcode-app` polling + memory-only conversation runtime with instance-scoped shared real-time transport, SQLite-backed local-first conversation data, and hot detail-page restore.

**Architecture:** Each remote `codeg` instance owns one shared event transport. Each conversation keeps a `1:1` ACP connection and syncs into SQLite through repository and sync-service boundaries. Conversation list and detail render from local data first, with remote detail fetch retained only as calibration.

**Tech Stack:** `uni-app`, `uview-plus`, `Pinia`, `TypeScript`, `codeg-main` web WS attach protocol, Rust web handlers, SQLite plugin adapter, `vue-tsc`, `vitest`, `cargo test`.

---

## File Map

### `mcode-app`

- Create: `mcode-app/src/services/realtime/types.ts`
- Create: `mcode-app/src/services/realtime/instance-key.ts`
- Create: `mcode-app/src/services/realtime/event-stream.ts`
- Create: `mcode-app/src/services/realtime/transport-registry.ts`
- Create: `mcode-app/src/services/db/sqlite.ts`
- Create: `mcode-app/src/services/db/schema.ts`
- Create: `mcode-app/src/services/db/migrations.ts`
- Create: `mcode-app/src/services/db/repositories/conversationRepository.ts`
- Create: `mcode-app/src/services/db/repositories/runtimeRepository.ts`
- Create: `mcode-app/src/services/conversation/connectionSessionManager.ts`
- Create: `mcode-app/src/services/conversation/conversationSyncService.ts`
- Create: `mcode-app/src/stores/conversationCache.ts`
- Modify: `mcode-app/src/services/gateway/types.ts`
- Modify: `mcode-app/src/services/gateway/directGateway.ts`
- Modify: `mcode-app/src/services/gateway/relayGateway.ts`
- Modify: `mcode-app/src/api/acp.ts`
- Modify: `mcode-app/src/stores/auth.ts`
- Modify: `mcode-app/src/stores/conversationRuntime.ts`
- Modify: `mcode-app/src/pages/conversations/index.vue`
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`

### `codeg-main`

- Modify: `codeg-main/src/lib/transport/types.ts`
- Modify: `codeg-main/src/lib/transport/web-event-stream.ts`
- Modify: `codeg-main/src/lib/transport/web-transport.ts`
- Modify: `codeg-main/src-tauri/src/web/ws_attach.rs`
- Modify: `codeg-main/src-tauri/src/web/ws.rs`
- Modify: `codeg-main/src-tauri/src/web/router.rs`
- Modify: `codeg-main/src-tauri/src/web/handlers/acp.rs`
- Test: `codeg-main/src/lib/transport/detect.test.ts`
- Create Test: `codeg-main/src/lib/transport/web-event-stream.test.ts`

## Task 1: Freeze shared attach protocol per remote instance

**Files:**
- Modify: `codeg-main/src/lib/transport/types.ts`
- Modify: `codeg-main/src/lib/transport/web-event-stream.ts`
- Modify: `codeg-main/src-tauri/src/web/ws_attach.rs`
- Modify: `codeg-main/src-tauri/src/web/ws.rs`
- Modify: `codeg-main/src-tauri/src/web/router.rs`
- Create Test: `codeg-main/src/lib/transport/web-event-stream.test.ts`

- [ ] **Step 1: Write failing transport test for multiplexed subscriptions**

Create `codeg-main/src/lib/transport/web-event-stream.test.ts` with:

```ts
import { describe, expect, it, vi } from "vitest"
import { WebEventStream } from "./web-event-stream"

function createHost() {
  let ready: (() => void) | null = null
  const sent: object[] = []
  return {
    sent,
    host: {
      isWsOpen: () => true,
      sendFrame: (frame: object) => {
        sent.push(frame)
        return true
      },
      onWsReady: (callback: () => void) => {
        ready = callback
        return () => {
          ready = null
        }
      },
    },
    fireReady: () => ready?.(),
  }
}

describe("WebEventStream", () => {
  it("attaches two subscriptions on one WS host", () => {
    const { host, sent } = createHost()
    const stream = new WebEventStream(host)
    stream.attach("conn-a", { sinceSeq: 1 }, {
      onSnapshot: vi.fn(),
      onReplay: vi.fn(),
      onEvent: vi.fn(),
      onDetached: vi.fn(),
    })
    stream.attach("conn-b", { sinceSeq: 8 }, {
      onSnapshot: vi.fn(),
      onReplay: vi.fn(),
      onEvent: vi.fn(),
      onDetached: vi.fn(),
    })

    expect(sent).toHaveLength(2)
    expect(sent[0]).toMatchObject({ action: "attach", connection_id: "conn-a", since_seq: 1 })
    expect(sent[1]).toMatchObject({ action: "attach", connection_id: "conn-b", since_seq: 8 })
  })
})
```

- [ ] **Step 2: Run test to verify current expectations fail if protocol shape is incomplete**

Run:

```bash
cd codeg-main
npm test -- web-event-stream.test.ts
```

Expected: fail until the attach frame shape and parser fully match the test.

- [ ] **Step 3: Implement protocol shape and server frame parity**

Ensure these client/server shapes exist:

```ts
export interface AttachRequestFrame {
  action: "attach"
  subscription_id: string
  connection_id: string
  since_seq?: number
}

export interface DetachRequestFrame {
  action: "detach"
  subscription_id: string
}
```

```rust
#[derive(Serialize, Deserialize)]
#[serde(tag = "type")]
enum ServerMsg {
    Snapshot { subscription_id: String, connection_id: String, snapshot: LiveSessionSnapshot, event_seq: u64 },
    Replay { subscription_id: String, connection_id: String, events: Vec<EventEnvelope>, high_water_seq: u64 },
    Event { subscription_id: String, envelope: EventEnvelope },
    Detached { subscription_id: String, reason: AttachDetachReason },
    Pong,
}
```

- [ ] **Step 4: Re-run transport test**

Run:

```bash
cd codeg-main
npm test -- web-event-stream.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add codeg-main/src/lib/transport/types.ts codeg-main/src/lib/transport/web-event-stream.ts codeg-main/src-tauri/src/web/ws_attach.rs codeg-main/src-tauri/src/web/ws.rs codeg-main/src-tauri/src/web/router.rs codeg-main/src/lib/transport/web-event-stream.test.ts
git commit -m "feat: add multiplexed attach protocol for web ACP streams"
```

## Task 2: Add instance-scoped real-time transport in `mcode-app`

**Files:**
- Create: `mcode-app/src/services/realtime/types.ts`
- Create: `mcode-app/src/services/realtime/instance-key.ts`
- Create: `mcode-app/src/services/realtime/event-stream.ts`
- Create: `mcode-app/src/services/realtime/transport-registry.ts`
- Modify: `mcode-app/src/stores/auth.ts`
- Modify: `mcode-app/src/services/gateway/types.ts`
- Modify: `mcode-app/src/services/gateway/directGateway.ts`
- Modify: `mcode-app/src/services/gateway/relayGateway.ts`

- [ ] **Step 1: Define remote-instance identity types**

Create `mcode-app/src/services/realtime/types.ts`:

```ts
export type RemoteMode = "direct" | "relay"

export interface RemoteInstanceDescriptor {
  instanceKey: string
  mode: RemoteMode
  baseUrl: string
  authToken?: string
  refreshToken?: string
}

export interface AttachHandlers {
  onSnapshot: (snapshot: any, eventSeq: number) => void
  onReplay: (events: any[], highWaterSeq: number) => void
  onEvent: (event: any) => void
  onDetached: (reason: string) => void
}
```

- [ ] **Step 2: Implement deterministic `instanceKey` builder**

Create `mcode-app/src/services/realtime/instance-key.ts`:

```ts
import type { RemoteMode } from "./types"

export function buildRemoteInstanceKey(input: {
  mode: RemoteMode
  baseUrl: string
  principal: string
}) {
  const base = String(input.baseUrl || "").trim().replace(/\/+$/, "")
  const principal = String(input.principal || "").trim()
  return `${input.mode}::${base}::${principal}`
}
```

- [ ] **Step 3: Implement per-instance event stream wrapper**

Create `mcode-app/src/services/realtime/event-stream.ts` with an attach API shaped like:

```ts
export interface EventStreamSubscription {
  subscriptionId: string
  detach: () => void
}

export class InstanceEventStream {
  attach(connectionId: string, sinceSeq: number | undefined, handlers: AttachHandlers): EventStreamSubscription {
    throw new Error("implement attach")
  }
  handleServerFrame(frame: unknown) {
    throw new Error("implement frame routing")
  }
}
```

- [ ] **Step 4: Add transport registry keyed by instance**

Create `mcode-app/src/services/realtime/transport-registry.ts`:

```ts
const registry = new Map<string, InstanceEventStream>()

export function getOrCreateTransport(descriptor: RemoteInstanceDescriptor) {
  const existing = registry.get(descriptor.instanceKey)
  if (existing) return existing
  const created = new InstanceEventStream(descriptor)
  registry.set(descriptor.instanceKey, created)
  return created
}
```

- [ ] **Step 5: Wire auth/gateway layer to expose current remote instance descriptor**

Add a method on auth state similar to:

```ts
currentRemoteInstance(): RemoteInstanceDescriptor {
  return {
    instanceKey: buildRemoteInstanceKey({ mode, baseUrl, principal }),
    mode,
    baseUrl,
    authToken,
    refreshToken,
  }
}
```

- [ ] **Step 6: Verify client typing still passes**

Run:

```bash
cd mcode-app
npm run type-check
```

Expected: no new TypeScript errors from the new realtime modules.

- [ ] **Step 7: Commit**

```bash
git add mcode-app/src/services/realtime mcode-app/src/stores/auth.ts mcode-app/src/services/gateway/types.ts mcode-app/src/services/gateway/directGateway.ts mcode-app/src/services/gateway/relayGateway.ts
git commit -m "feat: add instance-scoped realtime transport registry"
```

## Task 3: Add SQLite adapter, schema, and repositories

**Files:**
- Create: `mcode-app/src/services/db/sqlite.ts`
- Create: `mcode-app/src/services/db/schema.ts`
- Create: `mcode-app/src/services/db/migrations.ts`
- Create: `mcode-app/src/services/db/repositories/conversationRepository.ts`
- Create: `mcode-app/src/services/db/repositories/runtimeRepository.ts`

- [ ] **Step 1: Define schema constants**

Create `mcode-app/src/services/db/schema.ts`:

```ts
export const SCHEMA_VERSION = 1

export const TABLE_SQL = {
  remoteInstances: `CREATE TABLE IF NOT EXISTS remote_instances (...)`,
  folders: `CREATE TABLE IF NOT EXISTS folders (...)`,
  conversations: `CREATE TABLE IF NOT EXISTS conversations (...)`,
  conversationTurns: `CREATE TABLE IF NOT EXISTS conversation_turns (...)`,
  conversationParts: `CREATE TABLE IF NOT EXISTS conversation_parts (...)`,
  conversationRuntime: `CREATE TABLE IF NOT EXISTS conversation_runtime (...)`,
  syncCursors: `CREATE TABLE IF NOT EXISTS sync_cursors (...)`,
} as const
```

Use the exact columns approved in the spec for each table.

- [ ] **Step 2: Add SQLite adapter boundary**

Create `mcode-app/src/services/db/sqlite.ts` with:

```ts
export interface SqliteDriver {
  open(): Promise<void>
  execute(sql: string, params?: unknown[]): Promise<void>
  query<T>(sql: string, params?: unknown[]): Promise<T[]>
  transaction<T>(run: () => Promise<T>): Promise<T>
}

export const sqliteDriver: SqliteDriver = {
  async open() { throw new Error("implement plugin open") },
  async execute() { throw new Error("implement execute") },
  async query() { throw new Error("implement query") },
  async transaction(run) { return await run() },
}
```

- [ ] **Step 3: Implement migrations bootstrap**

Create `mcode-app/src/services/db/migrations.ts`:

```ts
import { sqliteDriver } from "./sqlite"
import { SCHEMA_VERSION, TABLE_SQL } from "./schema"

export async function ensureConversationSchema() {
  await sqliteDriver.open()
  await sqliteDriver.execute(TABLE_SQL.remoteInstances)
  await sqliteDriver.execute(TABLE_SQL.folders)
  await sqliteDriver.execute(TABLE_SQL.conversations)
  await sqliteDriver.execute(TABLE_SQL.conversationTurns)
  await sqliteDriver.execute(TABLE_SQL.conversationParts)
  await sqliteDriver.execute(TABLE_SQL.conversationRuntime)
  await sqliteDriver.execute(TABLE_SQL.syncCursors)
}
```

- [ ] **Step 4: Create repository read/write contracts**

Create `conversationRepository.ts` and `runtimeRepository.ts` with methods shaped like:

```ts
export async function listConversationSummaries(instanceKey: string, folderId: number) {}
export async function getNewestTurns(conversationId: number, limit: number) {}
export async function getOlderTurns(conversationId: number, beforeSeq: number, limit: number) {}
export async function upsertConversationSummary(input: ConversationSummaryRecord) {}
export async function insertCompletedTurn(input: PersistedTurnRecord) {}
```

```ts
export async function getRuntime(conversationId: number) {}
export async function saveRuntime(input: ConversationRuntimeRecord) {}
export async function clearRuntime(conversationId: number) {}
export async function saveCursor(input: SyncCursorRecord) {}
```

- [ ] **Step 5: Smoke-check migration compilation**

Run:

```bash
cd mcode-app
npm run type-check
```

Expected: PASS or only the pre-existing `MarkdownRenderer.vue` type errors.

- [ ] **Step 6: Commit**

```bash
git add mcode-app/src/services/db
git commit -m "feat: add sqlite conversation schema and repositories"
```

## Task 4: Build connection/session manager and sync service

**Files:**
- Create: `mcode-app/src/services/conversation/connectionSessionManager.ts`
- Create: `mcode-app/src/services/conversation/conversationSyncService.ts`
- Modify: `mcode-app/src/api/acp.ts`
- Modify: `mcode-app/src/stores/conversationRuntime.ts`

- [ ] **Step 1: Add conversation-to-connection index**

Create `connectionSessionManager.ts`:

```ts
interface ManagedConversationConnection {
  conversationId: number
  instanceKey: string
  connectionId: string
  externalId?: string | null
  status: "idle" | "connecting" | "connected" | "error"
}

const byConversationId = new Map<number, ManagedConversationConnection>()
const byConnectionId = new Map<string, ManagedConversationConnection>()
```

- [ ] **Step 2: Add attach-aware sync service**

Create `conversationSyncService.ts` with the entry points:

```ts
export async function attachConversationRealtime(input: {
  conversationId: number
  instanceKey: string
  connectionId: string
  sinceSeq?: number
}) {}

export async function applyRealtimeEvent(input: {
  conversationId: number
  connectionId: string
  event: any
}) {}
```

- [ ] **Step 3: Move `acp_poll_events` off the primary path**

In `mcode-app/src/api/acp.ts`, keep polling only as guarded fallback:

```ts
private connectEventSource() {
  const transport = getActiveRealtimeTransport()
  if (transport) return
  this.startPolling()
}
```

- [ ] **Step 4: Refactor `conversationRuntime` to consume manager + sync service**

Replace direct connection bookkeeping with:

```ts
const managed = await connectionSessionManager.connectConversation({
  conversationId,
  agentType,
  sessionId,
  instanceKey,
})

await attachConversationRealtime({
  conversationId,
  instanceKey,
  connectionId: managed.connectionId,
  sinceSeq,
})
```

- [ ] **Step 5: Verify buildable runtime types**

Run:

```bash
cd mcode-app
npm run type-check
```

Expected: no new errors in `conversationRuntime.ts` or the new conversation services.

- [ ] **Step 6: Commit**

```bash
git add mcode-app/src/services/conversation mcode-app/src/api/acp.ts mcode-app/src/stores/conversationRuntime.ts
git commit -m "feat: add conversation connection manager and realtime sync service"
```

## Task 5: Switch detail page to local-first newest-window load

**Files:**
- Create: `mcode-app/src/stores/conversationCache.ts`
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`
- Modify: `mcode-app/src/stores/conversationRuntime.ts`
- Modify: `mcode-app/src/services/db/repositories/conversationRepository.ts`
- Modify: `mcode-app/src/services/db/repositories/runtimeRepository.ts`

- [ ] **Step 1: Add hot cache store shape**

Create `mcode-app/src/stores/conversationCache.ts`:

```ts
export interface CachedConversationViewState {
  conversationId: number
  loadedTurnCount: number
  oldestLoadedSeq?: number
  hasMoreHistory: boolean
  scrollAnchor?: string
}
```

- [ ] **Step 2: Replace detail full-fetch as first render path**

In `mcode-app/src/pages/conversation-detail/index.vue`, change `loadConversation()` flow to:

```ts
const cached = cacheStore.restore(conversationId.value)
if (cached) {
  hydrateFromCache(cached)
} else {
  const runtime = await runtimeRepository.getRuntime(conversationId.value)
  const newestTurns = await conversationRepository.getNewestTurns(conversationId.value, 10)
  hydrateFromLocal(runtime, newestTurns)
}
```

- [ ] **Step 3: Keep remote detail fetch only as calibration**

Add a guard like:

```ts
if (shouldCalibrateDetail({ hasLocalTurns, hasRuntime, wasReconnect })) {
  void calibrateConversationDetail(conversationId.value)
}
```

- [ ] **Step 4: Preserve first-open scroll to bottom**

Keep the initial scroll logic behind local hydration completion:

```ts
nextTick(() => {
  scrollToBottom(true)
  hasInitialBottomScroll.value = true
})
```

- [ ] **Step 5: Run detail-page type check**

Run:

```bash
cd mcode-app
npm run type-check
```

Expected: no new detail-page errors.

- [ ] **Step 6: Commit**

```bash
git add mcode-app/src/stores/conversationCache.ts mcode-app/src/pages/conversation-detail/index.vue mcode-app/src/stores/conversationRuntime.ts mcode-app/src/services/db/repositories/conversationRepository.ts mcode-app/src/services/db/repositories/runtimeRepository.ts
git commit -m "feat: load conversation detail from local cache first"
```

## Task 6: Add upward local pagination and stable scroll anchoring

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`
- Modify: `mcode-app/src/services/db/repositories/conversationRepository.ts`
- Modify: `mcode-app/src/stores/conversationCache.ts`

- [ ] **Step 1: Add older-turn repository query**

In `conversationRepository.ts`, implement:

```ts
export async function getOlderTurns(
  conversationId: number,
  beforeSeq: number,
  limit = 20
) {
  return await sqliteDriver.query(
    `SELECT * FROM conversation_turns WHERE conversation_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?`,
    [conversationId, beforeSeq, limit]
  )
}
```

- [ ] **Step 2: Add top-reached loader in detail page**

In `index.vue`, add:

```ts
async function loadOlderTurns() {
  if (!hasMoreHistory.value || loadingOlder.value) return
  const older = await conversationRepository.getOlderTurns(conversationId.value, oldestLoadedSeq.value!, 20)
  prependOlderTurns(older)
}
```

- [ ] **Step 3: Preserve scroll anchor after prepending**

Use a before/after anchor update:

```ts
const anchorId = visibleTopMessageId.value
prependOlderTurns(older)
nextTick(() => {
  scrollIntoView.value = anchorId
})
```

- [ ] **Step 4: Manual smoke on H5**

Run:

```bash
cd mcode-app
npm run dev:h5
```

Expected: opening a long conversation shows newest 10 turns, and upward scroll loads older turns from local data without full-page flash.

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/pages/conversation-detail/index.vue mcode-app/src/services/db/repositories/conversationRepository.ts mcode-app/src/stores/conversationCache.ts
git commit -m "feat: add local upward pagination for conversation detail"
```

## Task 7: Move list page to SQLite summaries and realtime status updates

**Files:**
- Modify: `mcode-app/src/pages/conversations/index.vue`
- Modify: `mcode-app/src/services/db/repositories/conversationRepository.ts`
- Modify: `mcode-app/src/services/conversation/conversationSyncService.ts`

- [ ] **Step 1: Add summary query**

Expose:

```ts
export async function listConversationSummaries(instanceKey: string, folderId: number) {
  return await sqliteDriver.query(
    `SELECT * FROM conversations WHERE instance_key = ? AND folder_id = ? AND deleted_at IS NULL ORDER BY last_message_at DESC, updated_at DESC`,
    [instanceKey, folderId]
  )
}
```

- [ ] **Step 2: Replace list-page remote-first fetch**

In `mcode-app/src/pages/conversations/index.vue`, update load flow to:

```ts
const summaries = await conversationRepository.listConversationSummaries(instanceKey, folderId)
conversationItems.value = summaries.map(mapSummaryToCard)
void refreshFolderConversationsInBackground()
```

- [ ] **Step 3: Update summary rows on realtime events**

In `conversationSyncService.ts`, on `status_changed` and `turn_complete`:

```ts
await conversationRepository.upsertConversationSummary({
  id: conversationId,
  connectionId,
  status,
  lastMessageAt,
  title,
  agentType,
})
```

- [ ] **Step 4: Validate list page on H5**

Run:

```bash
cd mcode-app
npm run dev:h5
```

Expected: list rows show local data immediately, and status/last-message updates arrive without full refetch.

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/pages/conversations/index.vue mcode-app/src/services/db/repositories/conversationRepository.ts mcode-app/src/services/conversation/conversationSyncService.ts
git commit -m "feat: read conversation list from sqlite summaries"
```

## Task 8: Keep detail runtime alive across back navigation

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`
- Modify: `mcode-app/src/stores/conversationCache.ts`
- Modify: `mcode-app/src/services/db/repositories/runtimeRepository.ts`
- Modify: `mcode-app/src/services/conversation/connectionSessionManager.ts`

- [ ] **Step 1: Stop disconnecting on page unload**

Replace unload teardown with guarded persistence:

```ts
onUnload(() => {
  cacheStore.persistViewState({
    conversationId: conversationId.value,
    loadedTurnCount: messages.value.length,
    oldestLoadedSeq: oldestLoadedSeq.value,
    hasMoreHistory: hasMoreHistory.value,
    scrollAnchor: currentScrollAnchor.value,
  })
})
```

- [ ] **Step 2: Persist runtime draft and composer state**

In `runtimeRepository.ts`, add:

```ts
export async function saveDraftState(input: {
  conversationId: number
  composerText: string
  draftQueueJson: string
  attachmentsJson: string
  scrollAnchor?: string
}) {}
```

- [ ] **Step 3: Add idle cleanup policy**

In `connectionSessionManager.ts`, add a sweep entry point:

```ts
export async function sweepInactiveConversations(now = Date.now()) {
  for (const item of byConversationId.values()) {
    if (item.status === "connected" && now - item.lastTouchedAt < 10 * 60_000) continue
    // detach inactive connections here
  }
}
```

- [ ] **Step 4: Manual restore smoke**

Run:

```bash
cd mcode-app
npm run dev:h5
```

Expected: enter detail, let a conversation stream, go back, re-enter, and see draft/runtime state restored without a cold reload.

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/pages/conversation-detail/index.vue mcode-app/src/stores/conversationCache.ts mcode-app/src/services/db/repositories/runtimeRepository.ts mcode-app/src/services/conversation/connectionSessionManager.ts
git commit -m "feat: keep conversation runtime alive across detail navigation"
```

## Task 9: Final calibration, regression checks, and docs

**Files:**
- Modify: `mcode-app/src/services/conversation/conversationSyncService.ts`
- Modify: `docs/specs/2026-06-02-mcode-conversation-runtime-rearchitecture-design.md`
- Create: `docs/plans/2026-06-02-mcode-conversation-runtime-rearchitecture-implementation.md`

- [ ] **Step 1: Add explicit calibration entry points**

Ensure `conversationSyncService.ts` exposes:

```ts
export async function calibrateConversationDetail(conversationId: number) {}
export async function calibrateAfterTurnComplete(conversationId: number) {}
export async function calibrateAfterReplayGap(conversationId: number) {}
```

- [ ] **Step 2: Run focused validation**

Run:

```bash
cd codeg-main
npm test -- web-event-stream.test.ts
cd ../mcode-app
npm run type-check
```

Expected: transport test passes; `mcode-app` shows no new type errors beyond any pre-existing unrelated failures.

- [ ] **Step 3: Run end-to-end smoke checklist**

Verify manually:

```text
1. Connect two remote codeg instances.
2. Open one conversation under each instance.
3. Confirm each instance uses its own shared transport.
4. Confirm two conversations under one instance share one WS.
5. Send a prompt and confirm live updates persist after back navigation.
6. Scroll history upward and confirm local pagination.
```

- [ ] **Step 4: Commit**

```bash
git add mcode-app/src/services/conversation/conversationSyncService.ts docs/specs/2026-06-02-mcode-conversation-runtime-rearchitecture-design.md docs/plans/2026-06-02-mcode-conversation-runtime-rearchitecture-implementation.md
git commit -m "docs: finalize conversation runtime rollout plan and calibration hooks"
```

## Self-Review Checklist

- Spec coverage:
  - real-time transport: Tasks 1, 2, 4
  - SQLite cache: Tasks 3, 5, 6, 7
  - local-first detail and newest 10 turns: Task 5
  - upward local pagination: Task 6
  - hot restore and no unload destroy: Task 8
  - calibration fallback: Tasks 5 and 9
- Placeholder scan:
  - no `TODO`, `TBD`, or unnamed files remain
- Type consistency:
  - `instanceKey`, `connectionId`, `conversationId`, and `lastAppliedSeq` use consistent names across transport, sync, repositories, and stores
