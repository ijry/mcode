# MCode P19 Desktop Relay Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a commercial recovery layer for MCode Desktop gateway connections across mobile reconnects, relay restarts, Desktop reconnects, and Desktop restarts.

**Architecture:** P19 keeps the external model unchanged: MCode app connects to `targetAgent = mcode-desktop`, relay forwards frames, and Codex/Claude official CLI semantics stay inside Desktop. Relay gains bounded replay metadata, replay-miss signaling, optional JSON replay persistence, `localEventId` ACK echoing, and classified request failures. Desktop gains a recoverable outbound event queue, optional JSON runtime snapshot, restart interruption semantics, and recovery diagnostics exposed through health/UI.

**Tech Stack:** TypeScript, Fastify 5, ws, Vitest, Rust 2021, Tauri 2, Tokio, serde/serde_json, Vue 3, Pinia.

## Global Constraints

- Use `targetAgent`, not `targetType`.
- Do not introduce mobile-side `codex` or `claude` target agents; official CLIs remain `mcode-desktop` capabilities.
- Do not introduce VS Code or code-server assumptions.
- Relay must not parse Codex or Claude official CLI semantics.
- Relay and Desktop must not persist official CLI credentials, app/relay access tokens, refresh tokens, pair codes, or live process handles.
- `REPLAY_STORE_PATH` owns relay replay JSON persistence; do not reuse `PAIRING_STORE_PATH`.
- `MCODE_DESKTOP_STATE_PATH` owns Desktop runtime snapshot persistence.
- New wire fields must be additive: old `event_push`, old `ack`, `proxy_response`, tunnel, and TCP frames continue to work.
- Every mcode change must update `docs/mcode-architecture-notes/`.

---

## File Structure

- Modify: `mcode-relay/src/config.ts`
  - Add `REPLAY_STORE_PATH`.
- Modify: `mcode-relay/src/protocol/types.ts`
  - Add optional `localEventId` to relay event frames and define replay miss / failure code types.
- Modify: `mcode-relay/src/protocol/replayBuffer.ts`
  - Add replay metadata, miss detection, snapshot, and restore support.
- Create: `mcode-relay/src/protocol/replayStore.ts`
  - Add `ReplayStore`, `JsonFileReplayStoreStorage`, schema marker, and bounded JSON persistence.
- Modify: `mcode-relay/src/tunnel/hub.ts`
  - Wire replay persistence, local ACK echo, replay-miss metadata, and classified pending request failures.
- Modify: `mcode-relay/src/server.ts`
  - Create replay storage from config, send `replay_miss`, ACK `localEventId`, and map classified errors to HTTP/WebSocket bodies.
- Modify: `mcode-relay/src/gateway/info.ts`
  - Report replay storage mode in `/health` and `/v1/gateway/info`.
- Test: `mcode-relay/test/replayBuffer.test.ts`
- Test: `mcode-relay/test/replayStore.test.ts`
- Test: `mcode-relay/test/hub.test.ts`
- Test: `mcode-relay/test/relayRecovery.test.ts`
- Test: `mcode-relay/test/gatewayInfo.test.ts`
- Create: `mcode-desktop/src-tauri/src/recovery.rs`
  - Add outbound event queue, snapshot schema, save/load helpers, stale interaction marking, and running-session interruption.
- Modify: `mcode-desktop/src-tauri/src/lib.rs`
  - Register recovery module and initialize AppState from `MCODE_DESKTOP_STATE_PATH`.
- Modify: `mcode-desktop/src-tauri/src/app_state.rs`
  - Add recovery queue/state fields, split `lastAckLocalEventId` from `lastRelayEventId`, and keep backward health compatibility.
- Modify: `mcode-desktop/src-tauri/src/gateway/upstream.rs`
  - Queue events before sending, replay unacked events on reconnect, ACK by `localEventId`, and persist recovery-safe state.
- Modify: `mcode-desktop/src-tauri/src/commands.rs`
  - Persist snapshot after gateway config, pair offer, local service, and health-affecting state changes.
- Modify: `mcode-desktop/src-tauri/src/health.rs`
  - Expose recovery diagnostics.
- Modify: `mcode-desktop/src-tauri/src/runtime/mod.rs`
  - Persist snapshot after CLI session/pending-interaction mutations and add `Interrupted` session status.
- Modify: `mcode-desktop/src/lib/runtimeApi.ts`
  - Add recovery health fields and `interrupted` session status.
- Modify: `mcode-desktop/src/stores/desktopRuntime.ts`
  - Store recovery diagnostics.
- Modify: `mcode-desktop/src/pages/ConnectionsPage.vue`
  - Display recovery queue and ACK/replay diagnostics.
- Modify: `mcode-desktop/src/pages/AgentsPage.vue`
  - Display interrupted and stale pending interaction diagnostics.
- Test: `mcode-desktop/src-tauri/tests/desktop_p19_recovery_snapshot.rs`
- Test: `mcode-desktop/src-tauri/tests/desktop_p19_outbound_queue.rs`
- Modify: `docs/superpowers/plans/2026-06-26-mcode-p7-p12-roadmap-status.md`
  - Extend status source of truth through P19.
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`
  - Replace P19 planned note with implemented behavior and native iOS/Android guidance.

---

### Task 1: Relay Replay Store And Replay Metadata

**Files:**
- Modify: `mcode-relay/src/config.ts`
- Modify: `mcode-relay/src/protocol/types.ts`
- Modify: `mcode-relay/src/protocol/replayBuffer.ts`
- Create: `mcode-relay/src/protocol/replayStore.ts`
- Test: `mcode-relay/test/replayBuffer.test.ts`
- Test: `mcode-relay/test/replayStore.test.ts`

**Interfaces:**
- Produces: `ReplayBuffer.metadata()`
- Produces: `ReplayBuffer.queryAfter(lastEventId) -> ReplayQueryResult`
- Produces: `ReplayBuffer.snapshot() -> RelayEventFrame[]`
- Produces: `ReplayBuffer.restore(frames)`
- Produces: `ReplayStore.load() / ReplayStore.save(snapshot)`
- Produces: `JsonFileReplayStoreStorage`
- Consumes: existing `RelayEventFrame`

- [ ] **Step 1: Write replay buffer tests**

Add these tests to `mcode-relay/test/replayBuffer.test.ts`:

```ts
it("reports replay metadata and detects window misses", () => {
  const buffer = new ReplayBuffer(2)
  buffer.push({ eventId: 1, channel: "acp://event", payload: {} })
  buffer.push({ eventId: 2, channel: "acp://event", payload: {} })
  buffer.push({ eventId: 3, channel: "acp://event", payload: {} })

  expect(buffer.metadata()).toEqual({
    replayWindowStart: 2,
    lastEventId: 3,
    replayAvailable: true,
  })

  expect(buffer.queryAfter(1)).toMatchObject({
    replayMiss: true,
    requestedLastEventId: 1,
    replayWindowStart: 2,
    lastEventId: 3,
  })
  expect(buffer.queryAfter(2).frames.map((event) => event.eventId)).toEqual([3])
})

it("snapshots and restores bounded replay frames", () => {
  const buffer = new ReplayBuffer(2)
  buffer.push({ eventId: 4, channel: "app://status", payload: { step: 1 }, localEventId: 11 })
  buffer.push({ eventId: 5, channel: "app://status", payload: { step: 2 }, localEventId: 12 })

  const restored = new ReplayBuffer(2)
  restored.restore(buffer.snapshot())

  expect(restored.metadata()).toEqual({
    replayWindowStart: 4,
    lastEventId: 5,
    replayAvailable: true,
  })
  expect(restored.after(0).map((event) => event.localEventId)).toEqual([11, 12])
})
```

Run:

```powershell
cd mcode-relay; npm test -- replayBuffer.test.ts; cd ..
```

Expected: FAIL because `metadata`, `queryAfter`, `snapshot`, `restore`, and `localEventId` are not implemented yet.

- [ ] **Step 2: Add replay types**

Modify `mcode-relay/src/protocol/types.ts`:

```ts
export interface RelayEventFrame {
  eventId: number
  channel: string
  payload: unknown
  controllerId?: string | null
  localEventId?: number | null
}

export interface ReplayMetadata {
  replayWindowStart: number | null
  lastEventId: number
  replayAvailable: boolean
}

export interface ReplayQueryResult extends ReplayMetadata {
  frames: RelayEventFrame[]
  replayMiss: boolean
  requestedLastEventId: number
}

export type RelayFailureCode =
  | "target_offline"
  | "desktop_replaced"
  | "session_revoked"
  | "request_timeout"
  | "gateway_shutdown"
```

- [ ] **Step 3: Implement replay buffer metadata**

Replace `mcode-relay/src/protocol/replayBuffer.ts` with:

```ts
import type { RelayEventFrame, ReplayMetadata, ReplayQueryResult } from "./types.js"

export class ReplayBuffer {
  constructor(
    private readonly maxSize: number,
    private readonly items: RelayEventFrame[] = []
  ) {}

  push(frame: RelayEventFrame): void {
    this.items.push({ ...frame })
    while (this.items.length > this.maxSize) {
      this.items.shift()
    }
  }

  after(lastEventId: number): RelayEventFrame[] {
    return this.queryAfter(lastEventId).frames
  }

  queryAfter(lastEventId: number): ReplayQueryResult {
    const checkpoint = normalizeEventId(lastEventId)
    const metadata = this.metadata()
    const replayMiss =
      checkpoint > 0 &&
      metadata.replayWindowStart !== null &&
      checkpoint < metadata.replayWindowStart - 1

    return {
      ...metadata,
      requestedLastEventId: checkpoint,
      replayMiss,
      frames: this.items.filter((item) => item.eventId > checkpoint).map(cloneFrame),
    }
  }

  metadata(): ReplayMetadata {
    const first = this.items[0]
    const last = this.items[this.items.length - 1]
    return {
      replayWindowStart: first?.eventId ?? null,
      lastEventId: last?.eventId ?? 0,
      replayAvailable: this.items.length > 0,
    }
  }

  snapshot(): RelayEventFrame[] {
    return this.items.map(cloneFrame)
  }

  restore(frames: RelayEventFrame[]): void {
    this.items.splice(0, this.items.length)
    for (const frame of frames) {
      this.push(frame)
    }
  }
}

function normalizeEventId(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0
}

function cloneFrame(frame: RelayEventFrame): RelayEventFrame {
  return { ...frame }
}
```

- [ ] **Step 4: Write replay store tests**

Create `mcode-relay/test/replayStore.test.ts`:

```ts
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { describe, expect, it } from "vitest"
import { JsonFileReplayStoreStorage, ReplayStore } from "../src/protocol/replayStore.js"

describe("ReplayStore", () => {
  it("persists replay buffers and event sequences without tokens", () => {
    const dir = mkdtempSync(join(tmpdir(), "mcode-relay-replay-"))
    const path = join(dir, "replay.json")
    try {
      const store = new ReplayStore(new JsonFileReplayStoreStorage(path), 2)
      store.saveTarget("desktop-1", {
        eventSequence: 8,
        frames: [
          { eventId: 7, channel: "acp://event", payload: { text: "one" } },
          { eventId: 8, channel: "acp://event", payload: { text: "two" }, localEventId: 3 },
        ],
      })

      const raw = readFileSync(path, "utf8")
      expect(raw).toContain('"schema": "mcode.relay.replay.v1"')
      expect(raw).not.toContain("accessToken")
      expect(raw).not.toContain("refreshToken")

      const restored = new ReplayStore(new JsonFileReplayStoreStorage(path), 2)
      expect(restored.snapshot().targets["desktop-1"].eventSequence).toBe(8)
      expect(restored.snapshot().targets["desktop-1"].frames.map((frame) => frame.eventId)).toEqual([7, 8])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
```

Run:

```powershell
cd mcode-relay; npm test -- replayStore.test.ts; cd ..
```

Expected: FAIL because `replayStore.ts` does not exist.

- [ ] **Step 5: Implement replay store**

Create `mcode-relay/src/protocol/replayStore.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import type { RelayEventFrame } from "./types.js"

export const REPLAY_STORE_SCHEMA = "mcode.relay.replay.v1"

export interface ReplayTargetSnapshot {
  eventSequence: number
  frames: RelayEventFrame[]
}

export interface ReplayStoreSnapshot {
  schema: typeof REPLAY_STORE_SCHEMA
  targets: Record<string, ReplayTargetSnapshot>
}

export interface ReplayStoreStorage {
  load(): ReplayStoreSnapshot | null
  save(snapshot: ReplayStoreSnapshot): void
}

export class JsonFileReplayStoreStorage implements ReplayStoreStorage {
  constructor(private readonly filePath: string) {}

  load(): ReplayStoreSnapshot | null {
    if (!this.filePath || !existsSync(this.filePath)) return null
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<ReplayStoreSnapshot>
      if (parsed.schema !== REPLAY_STORE_SCHEMA || !parsed.targets || typeof parsed.targets !== "object") {
        return null
      }
      return normalizeSnapshot(parsed, 1000)
    } catch {
      return null
    }
  }

  save(snapshot: ReplayStoreSnapshot): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(snapshot, null, 2), "utf8")
  }
}

export class ReplayStore {
  private readonly targets = new Map<string, ReplayTargetSnapshot>()

  constructor(
    private readonly storage: ReplayStoreStorage | null = null,
    private readonly maxFramesPerTarget = 1000
  ) {
    const snapshot = storage?.load()
    if (snapshot) {
      for (const [targetId, target] of Object.entries(snapshot.targets)) {
        this.targets.set(targetId, normalizeTargetSnapshot(target, this.maxFramesPerTarget))
      }
    }
  }

  getTarget(targetId: string): ReplayTargetSnapshot | null {
    const target = this.targets.get(targetId)
    return target ? cloneTargetSnapshot(target) : null
  }

  saveTarget(targetId: string, snapshot: ReplayTargetSnapshot): void {
    this.targets.set(targetId, normalizeTargetSnapshot(snapshot, this.maxFramesPerTarget))
    this.persist()
  }

  snapshot(): ReplayStoreSnapshot {
    const targets: Record<string, ReplayTargetSnapshot> = {}
    for (const [targetId, target] of this.targets.entries()) {
      targets[targetId] = cloneTargetSnapshot(target)
    }
    return { schema: REPLAY_STORE_SCHEMA, targets }
  }

  private persist(): void {
    this.storage?.save(this.snapshot())
  }
}

function normalizeSnapshot(input: Partial<ReplayStoreSnapshot>, maxFrames: number): ReplayStoreSnapshot {
  const targets: Record<string, ReplayTargetSnapshot> = {}
  for (const [targetId, target] of Object.entries(input.targets ?? {})) {
    targets[targetId] = normalizeTargetSnapshot(target, maxFrames)
  }
  return { schema: REPLAY_STORE_SCHEMA, targets }
}

function normalizeTargetSnapshot(input: Partial<ReplayTargetSnapshot>, maxFrames: number): ReplayTargetSnapshot {
  const frames = Array.isArray(input.frames) ? input.frames.slice(-maxFrames).map(cloneFrame) : []
  return {
    eventSequence: normalizeNumber(input.eventSequence, frames.at(-1)?.eventId ?? 0),
    frames,
  }
}

function cloneTargetSnapshot(snapshot: ReplayTargetSnapshot): ReplayTargetSnapshot {
  return {
    eventSequence: snapshot.eventSequence,
    frames: snapshot.frames.map(cloneFrame),
  }
}

function cloneFrame(frame: RelayEventFrame): RelayEventFrame {
  return { ...frame }
}

function normalizeNumber(input: unknown, fallback: number): number {
  const value = Number(input)
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : fallback
}
```

- [ ] **Step 6: Add relay config field**

Modify `mcode-relay/src/config.ts`:

```ts
REPLAY_STORE_PATH: z.string().trim().default(""),
```

Update every test config object that constructs `RelayConfig` to include:

```ts
REPLAY_STORE_PATH: "",
```

- [ ] **Step 7: Verify relay replay primitives**

Run:

```powershell
cd mcode-relay; npm test -- replayBuffer.test.ts replayStore.test.ts; cd ..
```

Expected: PASS.

- [ ] **Step 8: Commit relay replay primitives**

```powershell
git add mcode-relay/src/config.ts mcode-relay/src/protocol/types.ts mcode-relay/src/protocol/replayBuffer.ts mcode-relay/src/protocol/replayStore.ts mcode-relay/test/replayBuffer.test.ts mcode-relay/test/replayStore.test.ts
git commit -m "feat(relay): add p19 replay persistence primitives"
```

---

### Task 2: Relay Protocol Integration And Request Failure Classification

**Files:**
- Modify: `mcode-relay/src/tunnel/hub.ts`
- Modify: `mcode-relay/src/server.ts`
- Modify: `mcode-relay/src/gateway/info.ts`
- Test: `mcode-relay/test/hub.test.ts`
- Test: `mcode-relay/test/relayRecovery.test.ts`
- Test: `mcode-relay/test/gatewayInfo.test.ts`

**Interfaces:**
- Consumes: `ReplayStore`
- Produces: `RelayHub({ replayStore, replayWindowSize })`
- Produces: `attachMobileSubscriber(...) -> ReplayQueryResult`
- Produces: `broadcastEvent(targetId, event, localEventId?)`
- Produces: `RelayRequestError(code, message)`
- Produces: health storage field `replayStore: "memory" | "json-file"`

- [ ] **Step 1: Write relay hub recovery tests**

Add to `mcode-relay/test/hub.test.ts`:

```ts
it("returns replay miss metadata when subscriber checkpoint is outside the window", () => {
  const hub = new RelayHub({ replayWindowSize: 2 })
  hub.broadcastEvent("desktop-1", { channel: "app://status", payload: { step: 1 } })
  hub.broadcastEvent("desktop-1", { channel: "app://status", payload: { step: 2 } })
  hub.broadcastEvent("desktop-1", { channel: "app://status", payload: { step: 3 } })

  const socket = socketMock()
  const result = hub.attachMobileSubscriber("desktop-1", socket, 1)

  expect(result.replayMiss).toBe(true)
  expect(result.replayWindowStart).toBe(2)
  expect(result.lastEventId).toBe(3)
  expect(socket.send).toHaveBeenCalledTimes(2)
})

it("echoes local event ids in relay event frames", () => {
  const hub = new RelayHub()
  const frame = hub.broadcastEvent(
    "desktop-1",
    { channel: "acp://event", payload: { type: "delta" } },
    19
  )

  expect(frame.localEventId).toBe(19)
  expect(hub.getReplayFrames("desktop-1", 0)[0].localEventId).toBe(19)
})
```

Run:

```powershell
cd mcode-relay; npm test -- hub.test.ts; cd ..
```

Expected: FAIL because `RelayHub` does not accept options or return replay query metadata.

- [ ] **Step 2: Implement `RelayRequestError` and pending target tracking**

In `mcode-relay/src/tunnel/hub.ts`, add:

```ts
export class RelayRequestError extends Error {
  constructor(
    public readonly code: RelayFailureCode,
    message: string
  ) {
    super(message)
    this.name = "RelayRequestError"
  }
}
```

Change pending request records to include `targetId`:

```ts
interface PendingProxyRequest {
  targetId: string
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: NodeJS.Timeout
}

interface PendingTunnelRequest {
  targetId: string
  resolve: (value: TunnelHttpResponse) => void
  reject: (reason: Error) => void
  timer: NodeJS.Timeout
}
```

Use classified errors:

```ts
throw new RelayRequestError("target_offline", "target offline")
```

On timeout:

```ts
reject(new RelayRequestError("request_timeout", "proxy request timeout"))
```

- [ ] **Step 3: Integrate replay store and replay query metadata in `RelayHub`**

Add constructor options and persistence:

```ts
interface RelayHubOptions {
  replayWindowSize?: number
  replayStore?: ReplayStore | null
}

export class RelayHub {
  private readonly replayWindowSize: number

  constructor(private readonly options: RelayHubOptions = {}) {
    this.replayWindowSize = options.replayWindowSize ?? 1000
  }
}
```

Update replay buffer creation:

```ts
private getReplayBuffer(targetId: string): ReplayBuffer {
  const existing = this.replayBuffers.get(targetId)
  if (existing) return existing
  const created = new ReplayBuffer(this.replayWindowSize)
  const restored = this.options.replayStore?.getTarget(targetId)
  if (restored) {
    created.restore(restored.frames)
    this.eventSequences.set(targetId, restored.eventSequence)
  }
  this.replayBuffers.set(targetId, created)
  return created
}
```

Persist after `broadcastEvent`:

```ts
this.options.replayStore?.saveTarget(targetId, {
  eventSequence: this.eventSequences.get(targetId) ?? frame.eventId,
  frames: this.getReplayBuffer(targetId).snapshot(),
})
```

Make `attachMobileSubscriber` return `ReplayQueryResult`:

```ts
const replay = this.getReplayBuffer(targetId).queryAfter(lastEventId)
for (const frame of replay.frames) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame))
}
return replay
```

- [ ] **Step 4: Fail pending work on disconnect or replacement**

In `registerDesktop`, before closing an existing socket:

```ts
this.failPendingForTarget(targetId, new RelayRequestError("desktop_replaced", "desktop upstream replaced"))
```

In `unregisterDesktop`, after deleting a matching desktop:

```ts
this.failPendingForTarget(targetId, new RelayRequestError("target_offline", "desktop upstream disconnected"))
```

Add helper:

```ts
private failPendingForTarget(targetId: string, error: RelayRequestError): void {
  for (const [requestId, pending] of this.pendingProxy.entries()) {
    if (pending.targetId === targetId) {
      clearTimeout(pending.timer)
      this.pendingProxy.delete(requestId)
      pending.reject(error)
    }
  }
  for (const [requestId, pending] of this.pendingTunnel.entries()) {
    if (pending.targetId === targetId) {
      clearTimeout(pending.timer)
      this.pendingTunnel.delete(requestId)
      pending.reject(error)
    }
  }
}
```

- [ ] **Step 5: Wire server-level replay miss and ACK**

In `mcode-relay/src/server.ts`, create default replay store:

```ts
import { JsonFileReplayStoreStorage, ReplayStore } from "./protocol/replayStore.js"

function createDefaultRelayHub(config: RelayConfig): RelayHub {
  const replayStorePath = config.REPLAY_STORE_PATH.trim()
  return new RelayHub({
    replayStore: new ReplayStore(
      replayStorePath ? new JsonFileReplayStoreStorage(replayStorePath) : null,
      1000
    ),
    replayWindowSize: 1000,
  })
}
```

Use it in `createRelayContext`:

```ts
hub: overrides.hub ?? createDefaultRelayHub(config),
```

In `/v1/events`, send `replay_miss` before ready when needed:

```ts
const replay = context.hub.attachMobileSubscriber(auth.claims.targetId, socket, normalizeLastEventId(req))
if (replay.replayMiss) {
  socket.send(JSON.stringify({
    type: "replay_miss",
    requestedLastEventId: replay.requestedLastEventId,
    replayWindowStart: replay.replayWindowStart,
    lastEventId: replay.lastEventId,
  }))
}
socket.send(JSON.stringify({
  type: "ready",
  targetId: auth.claims.targetId,
  replayWindowStart: replay.replayWindowStart,
  lastEventId: replay.lastEventId,
  replayAvailable: replay.replayAvailable,
}))
```

In desktop upstream `event_push` handling:

```ts
const localEventId =
  typeof message.localEventId === "number" && Number.isFinite(message.localEventId)
    ? Math.trunc(message.localEventId)
    : undefined
const frame = context.hub.broadcastEvent(activeTargetId, message.event ?? message, localEventId)
sendJson(socket, {
  type: "ack",
  eventId: frame.eventId,
  ...(localEventId !== undefined ? { localEventId } : {}),
})
```

- [ ] **Step 6: Map classified errors in server responses**

Add helper in `mcode-relay/src/server.ts`:

```ts
function relayErrorPayload(error: unknown): { status: number; body: { code: string; message: string } } {
  if (error instanceof RelayRequestError) {
    const status = error.code === "request_timeout" ? 504 : error.code === "target_offline" ? 503 : 409
    return { status, body: { code: error.code, message: error.message } }
  }
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes("timeout")) return { status: 504, body: { code: "request_timeout", message } }
  if (message.includes("offline")) return { status: 503, body: { code: "target_offline", message } }
  return { status: 500, body: { code: "gateway_shutdown", message } }
}
```

Use it in proxy and HTTP tunnel catch blocks:

```ts
const failure = relayErrorPayload(error)
return reply.code(failure.status).send(failure.body)
```

Update `closeSocketWithError` to accept code:

```ts
function closeSocketWithError(socket: WebSocket, message: string, code = "gateway_shutdown"): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "error", code, error: message }))
    socket.close()
  }
}
```

- [ ] **Step 7: Update health/info storage**

In `mcode-relay/src/gateway/info.ts`, change:

```ts
export interface GatewayStorageStatus {
  pairingStore: "memory" | "json-file"
  replayStore: "memory" | "json-file"
}
```

and:

```ts
return {
  pairingStore: config.PAIRING_STORE_PATH.trim() ? "json-file" : "memory",
  replayStore: config.REPLAY_STORE_PATH.trim() ? "json-file" : "memory",
}
```

Update `GATEWAY_FEATURES` with:

```ts
"events.replayMiss",
"events.replayPersistence",
```

- [ ] **Step 8: Write integration tests**

Create `mcode-relay/test/relayRecovery.test.ts` with tests that:

```ts
expect(proxyOffline.body).toEqual({
  code: "target_offline",
  message: "target offline",
})
```

and:

```ts
expect(JSON.parse(String(desktopSocket.send.mock.calls.at(-1)[0]))).toMatchObject({
  type: "ack",
  eventId: 1,
  localEventId: 10,
})
```

Also update `mcode-relay/test/gatewayInfo.test.ts` expected storage:

```ts
storage: {
  pairingStore: "memory",
  replayStore: "memory",
},
```

Run:

```powershell
cd mcode-relay; npm test; cd ..
```

Expected: PASS.

- [ ] **Step 9: Commit relay integration**

```powershell
git add mcode-relay/src/tunnel/hub.ts mcode-relay/src/server.ts mcode-relay/src/gateway/info.ts mcode-relay/test/hub.test.ts mcode-relay/test/relayRecovery.test.ts mcode-relay/test/gatewayInfo.test.ts mcode-relay/test/relay.test.ts
git commit -m "feat(relay): add p19 recovery protocol integration"
```

---

### Task 3: Desktop Recovery Queue Primitives And Health Shape

**Files:**
- Create: `mcode-desktop/src-tauri/src/recovery.rs`
- Modify: `mcode-desktop/src-tauri/src/lib.rs`
- Modify: `mcode-desktop/src-tauri/src/app_state.rs`
- Modify: `mcode-desktop/src-tauri/src/health.rs`
- Modify: `mcode-desktop/src-tauri/src/runtime/mod.rs`
- Modify: `mcode-desktop/src/lib/runtimeApi.ts`
- Modify: `mcode-desktop/src/stores/desktopRuntime.ts`
- Test: `mcode-desktop/src-tauri/tests/desktop_p19_outbound_queue.rs`

**Interfaces:**
- Produces: `QueuedOutboundEvent`
- Produces: `OutboundEventQueue`
- Produces: `OutboundEventQueue::enqueue(event) -> QueuedOutboundEvent`
- Produces: `OutboundEventQueue::ack(local_event_id, relay_event_id)`
- Produces: `OutboundEventQueue::pending()`
- Produces: `CliSessionStatus::Interrupted`
- Produces: health fields `recoveryStorageMode`, `queuedOutboundEventCount`, `oldestQueuedLocalEventId`, `lastAckLocalEventId`, `lastRelayEventId`, `replaySupported`, `interruptedSessionCount`, `stalePendingInteractionCount`

- [ ] **Step 1: Write outbound queue tests**

Create `mcode-desktop/src-tauri/tests/desktop_p19_outbound_queue.rs`:

```rust
use mcode_desktop_lib::recovery::OutboundEventQueue;
use serde_json::json;

#[test]
fn p19_queues_acks_and_replays_outbound_events_in_order() {
    let mut queue = OutboundEventQueue::new(3);

    let first = queue.enqueue(json!({ "type": "stream_batch", "data": { "delta": "one" } }));
    let second = queue.enqueue(json!({ "type": "stream_batch", "data": { "delta": "two" } }));

    assert_eq!(first.local_event_id, 1);
    assert_eq!(second.local_event_id, 2);
    assert_eq!(queue.pending().len(), 2);

    queue.ack(1, 41);
    assert_eq!(queue.pending().len(), 1);
    assert_eq!(queue.pending()[0].local_event_id, 2);
    assert_eq!(queue.last_ack_local_event_id(), Some(1));
    assert_eq!(queue.last_relay_event_id(), Some(41));
}

#[test]
fn p19_bounds_queue_and_reports_overflow() {
    let mut queue = OutboundEventQueue::new(2);

    queue.enqueue(json!({ "id": 1 }));
    queue.enqueue(json!({ "id": 2 }));
    queue.enqueue(json!({ "id": 3 }));

    assert_eq!(queue.pending().iter().map(|event| event.local_event_id).collect::<Vec<_>>(), vec![2, 3]);
    assert_eq!(queue.overflow_count(), 1);
}
```

Run:

```powershell
cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml p19_queues_ -- --nocapture
```

Expected: FAIL because `recovery` module does not exist.

- [ ] **Step 2: Add recovery module export**

Modify `mcode-desktop/src-tauri/src/lib.rs`:

```rust
pub mod recovery;
```

- [ ] **Step 3: Implement queue primitives**

Create `mcode-desktop/src-tauri/src/recovery.rs`:

```rust
use std::collections::VecDeque;

use serde_json::Value;

pub const DESKTOP_STATE_SCHEMA: &str = "mcode.desktop.state.v1";
pub const DEFAULT_OUTBOUND_QUEUE_LIMIT: usize = 500;

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueuedOutboundEvent {
    pub local_event_id: u64,
    pub event: Value,
    pub queued_at_ms: u64,
}

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutboundEventQueue {
    next_local_event_id: u64,
    limit: usize,
    pending: VecDeque<QueuedOutboundEvent>,
    last_ack_local_event_id: Option<u64>,
    last_relay_event_id: Option<u64>,
    overflow_count: u64,
}

impl OutboundEventQueue {
    pub fn new(limit: usize) -> Self {
        Self {
            next_local_event_id: 1,
            limit,
            pending: VecDeque::new(),
            last_ack_local_event_id: None,
            last_relay_event_id: None,
            overflow_count: 0,
        }
    }

    pub fn enqueue(&mut self, event: Value) -> QueuedOutboundEvent {
        let queued = QueuedOutboundEvent {
            local_event_id: self.next_local_event_id,
            event,
            queued_at_ms: now_ms(),
        };
        self.next_local_event_id = self.next_local_event_id.saturating_add(1);
        self.pending.push_back(queued.clone());
        while self.pending.len() > self.limit {
            self.pending.pop_front();
            self.overflow_count = self.overflow_count.saturating_add(1);
        }
        queued
    }

    pub fn ack(&mut self, local_event_id: u64, relay_event_id: u64) {
        self.pending.retain(|event| event.local_event_id != local_event_id);
        self.last_ack_local_event_id = Some(local_event_id);
        self.last_relay_event_id = Some(relay_event_id);
    }

    pub fn pending(&self) -> Vec<QueuedOutboundEvent> {
        self.pending.iter().cloned().collect()
    }

    pub fn restore_pending(&mut self, events: Vec<QueuedOutboundEvent>) {
        self.pending = events.into_iter().collect();
        self.next_local_event_id = self
            .pending
            .iter()
            .map(|event| event.local_event_id)
            .max()
            .unwrap_or(0)
            .saturating_add(1);
    }

    pub fn last_ack_local_event_id(&self) -> Option<u64> {
        self.last_ack_local_event_id
    }

    pub fn last_relay_event_id(&self) -> Option<u64> {
        self.last_relay_event_id
    }

    pub fn oldest_local_event_id(&self) -> Option<u64> {
        self.pending.front().map(|event| event.local_event_id)
    }

    pub fn overflow_count(&self) -> u64 {
        self.overflow_count
    }
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}
```

- [ ] **Step 4: Add AppState recovery fields**

Modify `mcode-desktop/src-tauri/src/app_state.rs` imports:

```rust
use crate::recovery::{OutboundEventQueue, DEFAULT_OUTBOUND_QUEUE_LIMIT};
```

Add fields:

```rust
pub outbound_event_queue: Mutex<OutboundEventQueue>,
pub recovery_storage_path: RwLock<Option<String>>,
pub replay_supported: RwLock<bool>,
```

Replace `last_ack_event_id` with:

```rust
pub last_ack_local_event_id: RwLock<Option<u64>>,
pub last_relay_event_id: RwLock<Option<u64>>,
```

Initialize:

```rust
outbound_event_queue: Mutex::new(OutboundEventQueue::new(DEFAULT_OUTBOUND_QUEUE_LIMIT)),
recovery_storage_path: RwLock::new(std::env::var("MCODE_DESKTOP_STATE_PATH").ok().filter(|value| !value.trim().is_empty())),
replay_supported: RwLock::new(false),
last_ack_local_event_id: RwLock::new(None),
last_relay_event_id: RwLock::new(None),
```

- [ ] **Step 5: Add interrupted session status**

Modify `mcode-desktop/src-tauri/src/runtime/mod.rs`:

```rust
pub enum CliSessionStatus {
    Connected,
    Running,
    Completed,
    Canceled,
    Disconnected,
    Error,
    Interrupted,
}
```

Modify `mcode-desktop/src/lib/runtimeApi.ts`:

```ts
export type CliSessionStatus =
  | "connected"
  | "running"
  | "completed"
  | "canceled"
  | "disconnected"
  | "error"
  | "interrupted"
```

- [ ] **Step 6: Extend health snapshot**

Modify `mcode-desktop/src-tauri/src/health.rs` struct:

```rust
pub recovery_storage_mode: String,
pub queued_outbound_event_count: usize,
pub oldest_queued_local_event_id: Option<u64>,
pub last_ack_local_event_id: Option<u64>,
pub last_relay_event_id: Option<u64>,
pub replay_supported: bool,
pub interrupted_session_count: usize,
pub stale_pending_interaction_count: usize,
#[serde(rename = "lastAckEventId")]
pub last_ack_event_id_compat: Option<u64>,
```

Populate from AppState:

```rust
let queue = state.outbound_event_queue.lock().ok();
let sessions = state.cli_sessions.read().map(|value| value.clone()).unwrap_or_default();
let interactions = state.cli_pending_interactions.read().map(|value| value.clone()).unwrap_or_default();
let last_relay_event_id = state.last_relay_event_id.read().map(|value| *value).unwrap_or(None);
```

Use:

```rust
recovery_storage_mode: if state.recovery_storage_path.read().ok().and_then(|value| value.clone()).is_some() {
    "json-file".to_string()
} else {
    "memory".to_string()
},
queued_outbound_event_count: queue.as_ref().map(|queue| queue.pending().len()).unwrap_or(0),
oldest_queued_local_event_id: queue.as_ref().and_then(|queue| queue.oldest_local_event_id()),
last_ack_local_event_id: state.last_ack_local_event_id.read().map(|value| *value).unwrap_or(None),
last_relay_event_id,
replay_supported: state.replay_supported.read().map(|value| *value).unwrap_or(false),
interrupted_session_count: sessions.iter().filter(|session| session.status == CliSessionStatus::Interrupted).count(),
stale_pending_interaction_count: interactions.iter().filter(|interaction| interaction.status == "stale").count(),
last_ack_event_id_compat: last_relay_event_id,
```

- [ ] **Step 7: Update frontend recovery fields**

Modify `mcode-desktop/src/lib/runtimeApi.ts` `DesktopHealthSnapshot`:

```ts
recoveryStorageMode: "memory" | "json-file" | string
queuedOutboundEventCount: number
oldestQueuedLocalEventId?: number | null
lastAckLocalEventId?: number | null
lastRelayEventId?: number | null
replaySupported: boolean
interruptedSessionCount: number
stalePendingInteractionCount: number
```

Modify `mcode-desktop/src/stores/desktopRuntime.ts` state:

```ts
recoveryStorageMode: "memory",
queuedOutboundEventCount: 0,
oldestQueuedLocalEventId: null as number | null,
lastAckLocalEventId: null as number | null,
lastRelayEventId: null as number | null,
replaySupported: false,
interruptedSessionCount: 0,
stalePendingInteractionCount: 0,
```

In `applyHealthSnapshot`:

```ts
this.recoveryStorageMode = health.recoveryStorageMode || "memory"
this.queuedOutboundEventCount = health.queuedOutboundEventCount || 0
this.oldestQueuedLocalEventId = health.oldestQueuedLocalEventId ?? null
this.lastAckLocalEventId = health.lastAckLocalEventId ?? null
this.lastRelayEventId = health.lastRelayEventId ?? health.lastAckEventId ?? null
this.replaySupported = Boolean(health.replaySupported)
this.interruptedSessionCount = health.interruptedSessionCount || 0
this.stalePendingInteractionCount = health.stalePendingInteractionCount || 0
this.lastAckEventId = this.lastRelayEventId
```

- [ ] **Step 8: Verify queue primitives and frontend typecheck**

Run:

```powershell
cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml p19_queues_ -- --nocapture
cd mcode-desktop; npm test -- runtimeApi; cd ..
```

Expected: Rust queue tests pass. Frontend tests compile with the expanded health shape.

- [ ] **Step 9: Commit Desktop recovery primitives**

```powershell
git add mcode-desktop/src-tauri/src/recovery.rs mcode-desktop/src-tauri/src/lib.rs mcode-desktop/src-tauri/src/app_state.rs mcode-desktop/src-tauri/src/health.rs mcode-desktop/src-tauri/src/runtime/mod.rs mcode-desktop/src/lib/runtimeApi.ts mcode-desktop/src/stores/desktopRuntime.ts mcode-desktop/src-tauri/tests/desktop_p19_outbound_queue.rs
git commit -m "feat(desktop): add p19 recovery queue primitives"
```

---

### Task 4: Desktop Upstream Reliable Event Queue

**Files:**
- Modify: `mcode-desktop/src-tauri/src/gateway/upstream.rs`
- Modify: `mcode-desktop/src-tauri/src/health.rs`
- Test: `mcode-desktop/src-tauri/tests/desktop_p10_upstream_hardening.rs`
- Test: `mcode-desktop/src-tauri/tests/desktop_p19_outbound_queue.rs`

**Interfaces:**
- Consumes: `OutboundEventQueue`
- Produces: `queue_event_for_upstream(state, event) -> QueuedOutboundEvent`
- Produces: `build_event_push_frame(localEventId, event)`
- Produces: ACK parser supporting old `{ eventId }` and new `{ localEventId, eventId }`

- [ ] **Step 1: Add upstream frame tests**

Append to `mcode-desktop/src-tauri/tests/desktop_p19_outbound_queue.rs`:

```rust
use mcode_desktop_lib::app_state::AppState;
use mcode_desktop_lib::gateway::upstream::{
    build_event_push_frame, handle_upstream_frame, queue_event_for_upstream, RelayControlFrame,
};

#[tokio::test]
async fn p19_ack_removes_queued_event_by_local_id() {
    let state = AppState::new_for_test();
    let queued = queue_event_for_upstream(&state, serde_json::json!({ "type": "stream_batch" })).unwrap();

    handle_upstream_frame(
        &state,
        RelayControlFrame::Ack {
            event_id: 77,
            local_event_id: Some(queued.local_event_id),
        },
    )
    .await
    .unwrap();

    let queue = state.outbound_event_queue.lock().unwrap();
    assert_eq!(queue.pending().len(), 0);
    assert_eq!(queue.last_ack_local_event_id(), Some(queued.local_event_id));
    assert_eq!(queue.last_relay_event_id(), Some(77));
}

#[test]
fn p19_event_push_frame_includes_local_event_id() {
    let frame = build_event_push_frame(8, serde_json::json!({ "type": "stream_batch" }));

    assert_eq!(frame["type"], "event_push");
    assert_eq!(frame["localEventId"], 8);
    assert_eq!(frame["event"]["type"], "stream_batch");
}
```

Run:

```powershell
cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml p19_ack_removes_queued_event_by_local_id -- --nocapture
```

Expected: FAIL because upstream functions and ACK shape are not implemented.

- [ ] **Step 2: Extend ACK frame parser**

Modify `RelayControlFrame::Ack` in `mcode-desktop/src-tauri/src/gateway/upstream.rs`:

```rust
Ack {
    #[serde(rename = "eventId")]
    event_id: u64,
    #[serde(rename = "localEventId", default)]
    local_event_id: Option<u64>,
},
```

Update existing P10 test:

```rust
RelayControlFrame::Ack {
    event_id: 42,
    local_event_id: None,
}
```

- [ ] **Step 3: Add queue-to-frame helpers**

Add public helpers in `upstream.rs`:

```rust
pub fn queue_event_for_upstream(
    state: &AppState,
    event: serde_json::Value,
) -> Result<crate::recovery::QueuedOutboundEvent> {
    let mut queue = state
        .outbound_event_queue
        .lock()
        .map_err(|_| anyhow!("outbound event queue lock poisoned"))?;
    let queued = queue.enqueue(event);
    if queue.overflow_count() > 0 {
        state.push_diagnostic("error", "recovery_queue_overflow");
    }
    Ok(queued)
}

pub fn build_event_push_frame(local_event_id: u64, event: serde_json::Value) -> serde_json::Value {
    json!({
        "type": "event_push",
        "localEventId": local_event_id,
        "event": event,
    })
}
```

- [ ] **Step 4: Update event sink to queue before send**

Change `build_upstream_event_sink` signature:

```rust
fn build_upstream_event_sink(state: Arc<AppState>, outbound_tx: OutboundTx) -> CliEventSink
```

Use:

```rust
std::sync::Arc::new(move |event| {
    if let Ok(queued) = queue_event_for_upstream(state.as_ref(), json!(event)) {
        let _ = send_outbound_json(
            &outbound_tx,
            build_event_push_frame(queued.local_event_id, queued.event),
        );
    }
})
```

Update caller:

```rust
let event_sink = build_upstream_event_sink(Arc::clone(&state), outbound_tx.clone());
```

- [ ] **Step 5: Queue response `events[]` frames**

In proxy success handling, replace direct `send_outbound_json` for `build_event_push_frames(body)` with:

```rust
for event_frame in build_event_push_frames(body) {
    let event = event_frame.get("event").cloned().unwrap_or(event_frame);
    let queued = queue_event_for_upstream(state.as_ref(), event)?;
    send_outbound_json(
        &outbound_tx,
        build_event_push_frame(queued.local_event_id, queued.event),
    )?;
}
```

- [ ] **Step 6: Replay pending queue after reconnect**

After `mark_upstream_online(&state).await;` in `connect_upstream`, add:

```rust
replay_queued_events(&state, &outbound_tx)?;
```

Add:

```rust
fn replay_queued_events(state: &AppState, outbound_tx: &OutboundTx) -> Result<()> {
    let pending = state
        .outbound_event_queue
        .lock()
        .map_err(|_| anyhow!("outbound event queue lock poisoned"))?
        .pending();
    for queued in pending {
        send_outbound_json(
            outbound_tx,
            build_event_push_frame(queued.local_event_id, queued.event),
        )?;
    }
    Ok(())
}
```

- [ ] **Step 7: ACK by local id while preserving old ACK compatibility**

Modify `handle_upstream_frame`:

```rust
RelayControlFrame::Ack {
    event_id,
    local_event_id,
} => {
    if let Some(local_event_id) = local_event_id {
        if let Ok(mut queue) = state.outbound_event_queue.lock() {
            queue.ack(local_event_id, event_id);
        }
        if let Ok(mut last_ack) = state.last_ack_local_event_id.write() {
            *last_ack = Some(local_event_id);
        }
    }
    if let Ok(mut last_relay_event_id) = state.last_relay_event_id.write() {
        *last_relay_event_id = Some(event_id);
    }
    Ok(())
}
```

Old ACK frames with only `eventId` still update `lastRelayEventId`.

- [ ] **Step 8: Verify Desktop upstream queue**

Run:

```powershell
cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml p10_ -- --nocapture
cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml p19_ -- --nocapture
```

Expected: PASS.

- [ ] **Step 9: Commit upstream queue integration**

```powershell
git add mcode-desktop/src-tauri/src/gateway/upstream.rs mcode-desktop/src-tauri/src/health.rs mcode-desktop/src-tauri/tests/desktop_p10_upstream_hardening.rs mcode-desktop/src-tauri/tests/desktop_p19_outbound_queue.rs
git commit -m "feat(desktop): add p19 reliable upstream event queue"
```

---

### Task 5: Desktop Runtime Snapshot Persistence

**Files:**
- Modify: `mcode-desktop/src-tauri/src/recovery.rs`
- Modify: `mcode-desktop/src-tauri/src/lib.rs`
- Modify: `mcode-desktop/src-tauri/src/commands.rs`
- Modify: `mcode-desktop/src-tauri/src/runtime/mod.rs`
- Modify: `mcode-desktop/src-tauri/src/gateway/upstream.rs`
- Test: `mcode-desktop/src-tauri/tests/desktop_p19_recovery_snapshot.rs`

**Interfaces:**
- Produces: `DesktopRecoverySnapshot`
- Produces: `save_recovery_snapshot(state) -> Result<()>`
- Produces: `load_recovery_snapshot(path) -> Result<Option<DesktopRecoverySnapshot>>`
- Produces: `apply_recovery_snapshot(state, snapshot)`
- Produces: running sessions restored as `Interrupted`
- Produces: pending interactions restored as `stale` when their session was interrupted

- [ ] **Step 1: Write snapshot tests**

Create `mcode-desktop/src-tauri/tests/desktop_p19_recovery_snapshot.rs`:

```rust
use std::fs;

use mcode_desktop_lib::app_state::{AppState, GatewayConfig, GatewayProvider};
use mcode_desktop_lib::recovery::{
    apply_recovery_snapshot, load_recovery_snapshot, save_recovery_snapshot_to_path,
};
use mcode_desktop_lib::runtime::{
    dispatch_desktop_proxy_with_state, CliPendingInteraction, CliSessionStatus,
};
use serde_json::json;

#[tokio::test]
async fn p19_snapshot_restores_gateway_services_and_interrupts_running_sessions() {
    let path = std::env::temp_dir().join(format!(
        "mcode-desktop-p19-state-{}.json",
        std::process::id()
    ));
    let state = AppState::new_for_test();

    *state.gateway_config.write().unwrap() = Some(GatewayConfig {
        provider: GatewayProvider::Custom,
        base_url: "https://gateway.example.com".to_string(),
    });
    *state.relay_url.write().unwrap() = Some("https://gateway.example.com".to_string());

    let connected = dispatch_desktop_proxy_with_state(
        &state,
        "acp_connect",
        json!({ "agentType": "codex", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();
    let session_id = connected["sessionId"].as_str().unwrap().to_string();
    {
        let mut sessions = state.cli_sessions.write().unwrap();
        sessions[0].status = CliSessionStatus::Running;
    }
    state.cli_pending_interactions.write().unwrap().push(CliPendingInteraction {
        interaction_id: "perm-1".to_string(),
        session_id: session_id.clone(),
        kind: "permission".to_string(),
        status: "pending".to_string(),
        created_at_ms: 1,
        resolved_at_ms: None,
        decision: None,
        value: None,
        summary: "Run command?".to_string(),
        data: json!({ "id": "perm-1" }),
    });

    save_recovery_snapshot_to_path(&state, &path).unwrap();
    let snapshot = load_recovery_snapshot(&path).unwrap().unwrap();
    let restored = AppState::new_for_test();
    apply_recovery_snapshot(&restored, snapshot).unwrap();
    fs::remove_file(&path).ok();

    let sessions = restored.cli_sessions.read().unwrap();
    assert_eq!(sessions[0].session_id, session_id);
    assert_eq!(sessions[0].status, CliSessionStatus::Interrupted);
    assert_eq!(sessions[0].active_request_id, None);
    assert_eq!(sessions[0].app_server_active, false);

    let interactions = restored.cli_pending_interactions.read().unwrap();
    assert_eq!(interactions[0].status, "stale");
    assert_eq!(restored.relay_url.read().unwrap().as_deref(), Some("https://gateway.example.com"));
}

#[test]
fn p19_snapshot_excludes_pair_codes_and_token_like_fields() {
    let path = std::env::temp_dir().join(format!(
        "mcode-desktop-p19-no-secrets-{}.json",
        std::process::id()
    ));
    let state = AppState::new_for_test();

    save_recovery_snapshot_to_path(&state, &path).unwrap();
    let raw = fs::read_to_string(&path).unwrap();
    fs::remove_file(&path).ok();

    assert!(raw.contains("\"schema\": \"mcode.desktop.state.v1\""));
    assert!(!raw.contains("pairSecret"));
    assert!(!raw.contains("accessToken"));
    assert!(!raw.contains("refreshToken"));
}
```

Run:

```powershell
cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml p19_snapshot_ -- --nocapture
```

Expected: FAIL because snapshot helpers are not implemented.

- [ ] **Step 2: Add snapshot structs and save/load helpers**

In `mcode-desktop/src-tauri/src/recovery.rs`, add:

```rust
use std::fs;
use std::path::Path;

use crate::app_state::{AppState, DiagnosticEntry, GatewayConfig};
use crate::runtime::{CliPendingInteraction, CliRuntimeSession, CliSessionStatus};
use crate::tunnel::LocalServiceConfig;

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopRecoverySnapshot {
    pub schema: String,
    pub target_id: String,
    pub display_name: String,
    pub gateway_config: Option<GatewayConfig>,
    pub relay_url: Option<String>,
    pub local_services: Vec<LocalServiceConfig>,
    pub last_ack_local_event_id: Option<u64>,
    pub last_relay_event_id: Option<u64>,
    pub queued_outbound_events: Vec<QueuedOutboundEvent>,
    pub cli_sessions: Vec<CliRuntimeSession>,
    pub pending_interactions: Vec<CliPendingInteraction>,
    pub diagnostics: Vec<DiagnosticEntry>,
}

pub fn save_recovery_snapshot(state: &AppState) -> anyhow::Result<()> {
    let Some(path) = state.recovery_storage_path.read().ok().and_then(|value| value.clone()) else {
        return Ok(());
    };
    save_recovery_snapshot_to_path(state, Path::new(&path))
}

pub fn save_recovery_snapshot_to_path(state: &AppState, path: impl AsRef<Path>) -> anyhow::Result<()> {
    let snapshot = build_recovery_snapshot(state)?;
    if let Some(parent) = path.as_ref().parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, serde_json::to_string_pretty(&snapshot)?)?;
    Ok(())
}

pub fn load_recovery_snapshot(path: impl AsRef<Path>) -> anyhow::Result<Option<DesktopRecoverySnapshot>> {
    if !path.as_ref().exists() {
        return Ok(None);
    }
    let snapshot: DesktopRecoverySnapshot = serde_json::from_str(&fs::read_to_string(path)?)?;
    if snapshot.schema != DESKTOP_STATE_SCHEMA {
        return Ok(None);
    }
    Ok(Some(snapshot))
}
```

- [ ] **Step 3: Build and apply snapshot**

Add:

```rust
pub fn build_recovery_snapshot(state: &AppState) -> anyhow::Result<DesktopRecoverySnapshot> {
    Ok(DesktopRecoverySnapshot {
        schema: DESKTOP_STATE_SCHEMA.to_string(),
        target_id: state.target_id.read().map(|value| value.clone()).unwrap_or_default(),
        display_name: state.display_name.read().map(|value| value.clone()).unwrap_or_default(),
        gateway_config: state.gateway_config.read().ok().and_then(|value| value.clone()),
        relay_url: state.relay_url.read().ok().and_then(|value| value.clone()),
        local_services: state.local_services.read().map(|value| value.clone()).unwrap_or_default(),
        last_ack_local_event_id: state.last_ack_local_event_id.read().map(|value| *value).unwrap_or(None),
        last_relay_event_id: state.last_relay_event_id.read().map(|value| *value).unwrap_or(None),
        queued_outbound_events: state.outbound_event_queue.lock().map(|queue| queue.pending()).unwrap_or_default(),
        cli_sessions: state.cli_sessions.read().map(|value| value.clone()).unwrap_or_default(),
        pending_interactions: state.cli_pending_interactions.read().map(|value| value.clone()).unwrap_or_default(),
        diagnostics: state.diagnostics.read().map(|value| value.clone()).unwrap_or_default(),
    })
}

pub fn apply_recovery_snapshot(state: &AppState, snapshot: DesktopRecoverySnapshot) -> anyhow::Result<()> {
    if let Ok(mut target_id) = state.target_id.write() {
        *target_id = snapshot.target_id;
    }
    if let Ok(mut display_name) = state.display_name.write() {
        *display_name = snapshot.display_name;
    }
    if let Ok(mut gateway_config) = state.gateway_config.write() {
        *gateway_config = snapshot.gateway_config;
    }
    if let Ok(mut relay_url) = state.relay_url.write() {
        *relay_url = snapshot.relay_url;
    }
    if let Ok(mut services) = state.local_services.write() {
        *services = snapshot.local_services;
    }
    if let Ok(mut last_ack) = state.last_ack_local_event_id.write() {
        *last_ack = snapshot.last_ack_local_event_id;
    }
    if let Ok(mut last_relay) = state.last_relay_event_id.write() {
        *last_relay = snapshot.last_relay_event_id;
    }
    if let Ok(mut queue) = state.outbound_event_queue.lock() {
        queue.restore_pending(snapshot.queued_outbound_events);
    }

    let interrupted_session_ids = snapshot
        .cli_sessions
        .iter()
        .filter(|session| session.status == CliSessionStatus::Running)
        .map(|session| session.session_id.clone())
        .collect::<std::collections::HashSet<_>>();
    let sessions = snapshot.cli_sessions.into_iter().map(interrupt_running_session).collect::<Vec<_>>();
    let interactions = snapshot
        .pending_interactions
        .into_iter()
        .map(|mut interaction| {
            if interrupted_session_ids.contains(&interaction.session_id) && interaction.status == "pending" {
                interaction.status = "stale".to_string();
            }
            interaction
        })
        .collect::<Vec<_>>();

    if let Ok(mut cli_sessions) = state.cli_sessions.write() {
        *cli_sessions = sessions;
    }
    if let Ok(mut pending) = state.cli_pending_interactions.write() {
        *pending = interactions;
    }
    if let Ok(mut diagnostics) = state.diagnostics.write() {
        *diagnostics = snapshot.diagnostics.into_iter().rev().take(50).collect::<Vec<_>>();
        diagnostics.reverse();
    }
    Ok(())
}

fn interrupt_running_session(mut session: CliRuntimeSession) -> CliRuntimeSession {
    if session.status == CliSessionStatus::Running {
        session.status = CliSessionStatus::Interrupted;
        session.active_request_id = None;
        session.cancel_requested = false;
        session.active_turn_id = None;
        session.app_server_active = false;
        session.error = Some("Desktop restarted while the CLI session was running".to_string());
        session.updated_at_ms = now_ms();
    }
    session
}
```

- [ ] **Step 4: Load snapshot during Tauri startup**

In `mcode-desktop/src-tauri/src/lib.rs`, replace:

```rust
.manage(Arc::new(AppState::default()))
```

with:

```rust
.manage(Arc::new(load_initial_app_state()))
```

Add:

```rust
fn load_initial_app_state() -> AppState {
    let state = AppState::default();
    let path = std::env::var("MCODE_DESKTOP_STATE_PATH")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    if let Some(path) = path {
        if let Ok(mut storage_path) = state.recovery_storage_path.write() {
            *storage_path = Some(path.clone());
        }
        match recovery::load_recovery_snapshot(&path) {
            Ok(Some(snapshot)) => {
                let _ = recovery::apply_recovery_snapshot(&state, snapshot);
                state.push_diagnostic("info", "recovery snapshot loaded");
            }
            Ok(None) => {}
            Err(error) => state.push_diagnostic("error", format!("recovery snapshot load failed: {error}")),
        }
    }
    state
}
```

- [ ] **Step 5: Persist after state mutations**

In `mcode-desktop/src-tauri/src/commands.rs`, import:

```rust
use crate::recovery::save_recovery_snapshot;
```

After `desktop_configure_gateway`, `desktop_generate_pair_offer`, and `desktop_save_local_service` mutate state, call:

```rust
save_recovery_snapshot(state.inner().as_ref()).map_err(|error| error.to_string())?;
```

Do not persist pair offer secret. The snapshot builder excludes `pair_offer`.

In `mcode-desktop/src-tauri/src/runtime/mod.rs`, after `upsert_cli_session`, `mark_session_completed`, `mark_session_error`, `close_cli_session`, `capture_pending_interactions_from_response`, and `mark_interaction_resolved`, call:

```rust
let _ = crate::recovery::save_recovery_snapshot(state);
```

In `mcode-desktop/src-tauri/src/gateway/upstream.rs`, after queue enqueue and ACK handling, call:

```rust
let _ = crate::recovery::save_recovery_snapshot(state);
```

- [ ] **Step 6: Verify snapshot persistence**

Run:

```powershell
cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml p19_snapshot_ -- --nocapture
cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml p8_ -- --nocapture
cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml p15_ -- --nocapture
```

Expected: PASS.

- [ ] **Step 7: Commit snapshot persistence**

```powershell
git add mcode-desktop/src-tauri/src/recovery.rs mcode-desktop/src-tauri/src/lib.rs mcode-desktop/src-tauri/src/commands.rs mcode-desktop/src-tauri/src/runtime/mod.rs mcode-desktop/src-tauri/src/gateway/upstream.rs mcode-desktop/src-tauri/tests/desktop_p19_recovery_snapshot.rs
git commit -m "feat(desktop): add p19 runtime recovery snapshot"
```

---

### Task 6: Recovery Diagnostics UI, Documentation, And Full Verification

**Files:**
- Modify: `mcode-desktop/src/pages/ConnectionsPage.vue`
- Modify: `mcode-desktop/src/pages/AgentsPage.vue`
- Modify: `docs/superpowers/plans/2026-06-26-mcode-p7-p12-roadmap-status.md`
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`

**Interfaces:**
- Consumes: Desktop health recovery fields from Task 3 and Task 5
- Produces: user-visible recovery diagnostics
- Produces: P19 status source of truth and architecture note

- [ ] **Step 1: Display connection recovery diagnostics**

Modify `mcode-desktop/src/pages/ConnectionsPage.vue` card grid by replacing the old Last ACK card with:

```vue
<div class="status-card">
  <span>ACK Local</span>
  <strong>{{ runtime.lastAckLocalEventId ?? "无" }}</strong>
</div>
<div class="status-card">
  <span>Relay Event</span>
  <strong>{{ runtime.lastRelayEventId ?? "无" }}</strong>
</div>
<div class="status-card">
  <span>Queued Events</span>
  <strong>{{ runtime.queuedOutboundEventCount }}</strong>
</div>
```

Extend diagnostic strip:

```vue
<span>Recovery: {{ runtime.recoveryStorageMode }}</span>
<span>Replay: {{ runtime.replaySupported ? "supported" : "best-effort" }}</span>
<span>Oldest queued: {{ runtime.oldestQueuedLocalEventId ?? "无" }}</span>
```

- [ ] **Step 2: Display session recovery diagnostics**

Modify `mcode-desktop/src/pages/AgentsPage.vue` adapter note text or add a small diagnostics block:

```vue
<div class="recovery-diagnostics">
  <span>Interrupted sessions：{{ runtime.interruptedSessionCount }}</span>
  <span>Stale interactions：{{ runtime.stalePendingInteractionCount }}</span>
</div>
```

Add scoped style:

```css
.recovery-diagnostics {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  grid-column: 1 / -1;
  color: #41533c;
  font-size: 12px;
  font-weight: 800;
}
```

- [ ] **Step 3: Update roadmap status**

Modify `docs/superpowers/plans/2026-06-26-mcode-p7-p12-roadmap-status.md` title:

```markdown
# MCode P7-P19 Roadmap Status
```

Add P19 row:

```markdown
| P19 | Desktop/Relay recovery layer: relay replay persistence/miss signaling, Desktop outbound ACK queue, runtime snapshot, classified request failures, and recovery diagnostics. | Implemented first slice. Relay persists bounded replay windows when `REPLAY_STORE_PATH` is set, Desktop queues unacked event pushes with `localEventId`, Desktop snapshots recoverable runtime state through `MCODE_DESKTOP_STATE_PATH`, and health/UI expose recovery status. |
```

Add `## P19 Implemented Scope` section covering:

```markdown
- `REPLAY_STORE_PATH` JSON replay persistence with schema `mcode.relay.replay.v1`.
- `/v1/events` ready metadata and `replay_miss`.
- `event_push.localEventId` and `ack.localEventId`.
- Classified request failure codes: `target_offline`, `desktop_replaced`, `session_revoked`, `request_timeout`, `gateway_shutdown`.
- Desktop outbound event queue with bounded default of 500.
- `MCODE_DESKTOP_STATE_PATH` JSON snapshot with schema `mcode.desktop.state.v1`.
- Running sessions restored as `interrupted`; pending interactions for those sessions restored as `stale`.
- Codex/Claude remain Desktop capabilities under `targetAgent = mcode-desktop`.
```

- [ ] **Step 4: Update architecture note from planned to implemented**

Modify `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md` section title:

```markdown
## P19 Desktop/Relay Recovery Layer Behavior
```

Replace planning language with implemented behavior and add native iOS/Android replication guidance:

```markdown
- Store the last processed relay `eventId` per gateway connection and pass it as `lastEventId` when reconnecting `/v1/events`.
- If `replay_miss` arrives, show a recoverable warning and refresh session state; do not reconnect as `codex` or `claude`.
- Treat `target_offline` and `request_timeout` as retryable operation failures; treat `session_revoked` as a gateway session reset.
- Display Desktop `interrupted` CLI sessions as requiring a new prompt because live official CLI processes cannot be resumed after Desktop restart.
```

- [ ] **Step 5: Run full verification**

Run:

```powershell
cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml
cd mcode-desktop; npm test; npm run build; cd ..
cd mcode-relay; npm test; cd ..
cd mcode-app; npm run test:unit; cd ..
git diff --check
```

Expected:

- Desktop Rust tests pass.
- Desktop frontend tests pass.
- Desktop frontend build passes.
- Relay tests pass.
- App unit tests pass.
- `git diff --check` reports no whitespace errors. CRLF warnings are acceptable only if there are no whitespace error lines.

- [ ] **Step 6: Commit docs and UI diagnostics**

```powershell
git add mcode-desktop/src/pages/ConnectionsPage.vue mcode-desktop/src/pages/AgentsPage.vue docs/superpowers/plans/2026-06-26-mcode-p7-p12-roadmap-status.md docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md
git commit -m "docs(desktop): record p19 recovery layer"
```

---

## Self-Review Checklist

- Spec coverage: Tasks cover relay replay metadata, replay miss, JSON replay persistence, Desktop outbound queue, ACK removal by `localEventId`, queued replay after reconnect, Desktop JSON snapshot, interrupted sessions, stale pending interactions, classified request failures, health/UI diagnostics, and native replication guidance.
- Compatibility: Old ACK frames with only `eventId` still update `lastRelayEventId`; old clients can ignore new `/v1/events` ready metadata and `replay_miss`.
- Naming: The plan uses `targetAgent` and does not introduce `targetType`.
- Agent model: Codex and Claude remain `mcode-desktop` capabilities and are not mobile direct targets.
- Security: Relay and Desktop snapshots exclude official CLI credentials, app/relay access tokens, refresh tokens, pair codes, and live process handles.
- Scope: P19 uses bounded JSON persistence and does not introduce a database, tenant model, RBAC, VS Code, or code-server behavior.
- Type consistency: `localEventId`, `lastAckLocalEventId`, `lastRelayEventId`, `recoveryStorageMode`, and `queuedOutboundEventCount` are named consistently across Rust, TypeScript, and protocol docs.
