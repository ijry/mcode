# MCode P21 App Relay Checkpoint Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist per-instance relay event checkpoints in `mcode-app` so a restarted app can reconnect to the same `lastEventId` and avoid replaying already processed relay events.

**Architecture:** Add a tiny `relayCheckpointStore` backed by `uni` storage. `acpApi` hydrates checkpoint state from that store when it creates relay recovery state, updates the store after successful wrapped-event dispatch, and writes `replay_miss` high-water marks when relay tells the app the retained window was missed. Relay and Desktop protocols stay unchanged.

**Tech Stack:** TypeScript, UniApp/Vue 3, Pinia, Jest, existing MCode gateway/realtime services.

## Global Constraints

- Use `targetAgent`, not `targetType`.
- Do not introduce mobile-side `codex` or `claude` target agents; official CLIs remain `mcode-desktop` capabilities.
- Do not introduce VS Code or code-server assumptions.
- Do not change relay or Desktop wire protocol.
- Do not persist relay access tokens, refresh tokens, pair secrets, official CLI credentials, raw relay event payloads, or Desktop runtime snapshots in the checkpoint store.
- Relay `eventId` and ACP `seq` are separate sequences and must not be merged.
- App relay checkpoint storage must stay app-only, best-effort, and non-secret.
- Every mcode change must update `docs/mcode-architecture-notes/`.

---

## File Structure

- Create: `mcode-app/src/services/gateway/relayCheckpointStore.ts`
  - Own the versioned `mcode_relay_checkpoints_v1` storage snapshot, validation, pruning, read/write, and clear helpers.
- Modify: `mcode-app/src/api/acp.ts`
  - Hydrate `lastRelayEventId` from the checkpoint store, persist successful wrapped-event checkpoints, persist replay-miss high-water marks, and clear persisted checkpoints on reset.
- Test: `mcode-app/tests/services/relayCheckpointStore.spec.ts`
  - Cover round-trip, pruning, malformed snapshot handling, and clear behavior.
- Test: `mcode-app/tests/api/acpCheckpointPersistence.spec.ts`
  - Cover hydration, successful persistence, failed-dispatch no-op, replay-miss persistence, and clear behavior.
- Modify: `docs/superpowers/plans/2026-06-26-mcode-p7-p12-roadmap-status.md`
  - Extend the phase-status source through P21 after the code lands.
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`
  - Move P21 from planned to implemented behavior after the code lands.

---

### Task 1: Relay Checkpoint Store Primitives

**Files:**
- Create: `mcode-app/src/services/gateway/relayCheckpointStore.ts`
- Test: `mcode-app/tests/services/relayCheckpointStore.spec.ts`

**Interfaces:**
- Produces: `RelayCheckpointRecord`
- Produces: `RelayCheckpointStorageSnapshot`
- Produces: `readRelayCheckpointSnapshot()`
- Produces: `readRelayCheckpoint(instanceKey) -> RelayCheckpointRecord | null`
- Produces: `upsertRelayCheckpoint(instanceKey, lastRelayEventId) -> void`
- Produces: `clearRelayCheckpoint(instanceKey) -> void`
- Produces: `clearRelayCheckpoints() -> void`

- [ ] **Step 1: Write the failing checkpoint-store tests**

Create `mcode-app/tests/services/relayCheckpointStore.spec.ts`:

```ts
import {
  clearRelayCheckpoint,
  clearRelayCheckpoints,
  readRelayCheckpoint,
  readRelayCheckpointSnapshot,
  upsertRelayCheckpoint,
} from "@/services/gateway/relayCheckpointStore"

describe("relay checkpoint store", () => {
  beforeEach(() => {
    clearRelayCheckpoints()
  })

  afterEach(() => {
    clearRelayCheckpoints()
  })

  it("writes and reads a checkpoint record", () => {
    upsertRelayCheckpoint("relay:desktop-1", 42)

    expect(readRelayCheckpoint("relay:desktop-1")).toMatchObject({
      instanceKey: "relay:desktop-1",
      lastRelayEventId: 42,
    })
  })

  it("clears one checkpoint without touching the others", () => {
    upsertRelayCheckpoint("relay:desktop-1", 42)
    upsertRelayCheckpoint("relay:desktop-2", 43)

    clearRelayCheckpoint("relay:desktop-1")

    expect(readRelayCheckpoint("relay:desktop-1")).toBeNull()
    expect(readRelayCheckpoint("relay:desktop-2")).toMatchObject({
      lastRelayEventId: 43,
    })
  })

  it("ignores malformed snapshots and wrong versions", () => {
    uni.setStorageSync("mcode_relay_checkpoints_v1", {
      version: 2,
      checkpoints: [{ instanceKey: "relay:bad", lastRelayEventId: 9, updatedAt: 1 }],
    })

    expect(readRelayCheckpointSnapshot()).toEqual({
      version: 1,
      checkpoints: [],
    })
  })

  it("keeps only the newest checkpoints when the snapshot is over the retention limit", () => {
    uni.setStorageSync("mcode_relay_checkpoints_v1", {
      version: 1,
      checkpoints: Array.from({ length: 52 }, (_, index) => ({
        instanceKey: `relay:${String(index + 1).padStart(2, "0")}`,
        lastRelayEventId: index + 1,
        updatedAt: 1_000 + index,
      })),
    })

    const snapshot = readRelayCheckpointSnapshot()

    expect(snapshot.checkpoints).toHaveLength(50)
    expect(snapshot.checkpoints[0]).toMatchObject({
      instanceKey: "relay:52",
      lastRelayEventId: 52,
    })
    expect(readRelayCheckpoint("relay:01")).toBeNull()
    expect(readRelayCheckpoint("relay:52")).toMatchObject({
      lastRelayEventId: 52,
    })
  })
})
```

Run:

```powershell
cd mcode-app; npm run test:unit -- relayCheckpointStore.spec.ts; cd ..
```

Expected: FAIL because `relayCheckpointStore.ts` does not exist yet.

- [ ] **Step 2: Implement the checkpoint store**

Create `mcode-app/src/services/gateway/relayCheckpointStore.ts`:

```ts
const STORAGE_KEY = "mcode_relay_checkpoints_v1"
const MAX_RELAY_CHECKPOINTS = 50

export interface RelayCheckpointRecord {
  instanceKey: string
  lastRelayEventId: number
  updatedAt: number
}

export interface RelayCheckpointStorageSnapshot {
  version: 1
  checkpoints: RelayCheckpointRecord[]
}

export function readRelayCheckpointSnapshot(): RelayCheckpointStorageSnapshot {
  return normalizeRelayCheckpointStorageSnapshot(uni.getStorageSync(STORAGE_KEY))
}

export function readRelayCheckpoint(instanceKey: string): RelayCheckpointRecord | null {
  const key = normalizeInstanceKey(instanceKey)
  if (!key) return null

  return readRelayCheckpointSnapshot().checkpoints.find((item) => item.instanceKey === key) ?? null
}

export function upsertRelayCheckpoint(instanceKey: string, lastRelayEventId: number) {
  const key = normalizeInstanceKey(instanceKey)
  const eventId = normalizeCheckpointId(lastRelayEventId)
  if (!key || eventId === null) return

  const snapshot = readRelayCheckpointSnapshot()
  const next: RelayCheckpointStorageSnapshot = {
    version: 1,
    checkpoints: [
      ...snapshot.checkpoints.filter((item) => item.instanceKey !== key),
      {
        instanceKey: key,
        lastRelayEventId: eventId,
        updatedAt: Date.now(),
      },
    ]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_RELAY_CHECKPOINTS),
  }
  uni.setStorageSync(STORAGE_KEY, next)
}

export function clearRelayCheckpoint(instanceKey: string) {
  const key = normalizeInstanceKey(instanceKey)
  if (!key) return

  const snapshot = readRelayCheckpointSnapshot()
  const next = snapshot.checkpoints.filter((item) => item.instanceKey !== key)
  if (next.length === snapshot.checkpoints.length) return

  if (next.length === 0) {
    uni.removeStorageSync(STORAGE_KEY)
    return
  }

  uni.setStorageSync(STORAGE_KEY, {
    version: 1,
    checkpoints: next,
  })
}

export function clearRelayCheckpoints() {
  uni.removeStorageSync(STORAGE_KEY)
}

function normalizeRelayCheckpointStorageSnapshot(value: unknown): RelayCheckpointStorageSnapshot {
  if (!value || typeof value !== "object") {
    return { version: 1, checkpoints: [] }
  }

  const record = value as Record<string, unknown>
  if (Number(record.version) !== 1) {
    return { version: 1, checkpoints: [] }
  }

  const byInstanceKey = new Map<string, RelayCheckpointRecord>()
  const checkpoints = Array.isArray(record.checkpoints) ? record.checkpoints : []
  for (const checkpoint of checkpoints) {
    const normalized = normalizeRelayCheckpointRecord(checkpoint)
    if (!normalized) continue
    const previous = byInstanceKey.get(normalized.instanceKey)
    if (!previous || normalized.updatedAt >= previous.updatedAt) {
      byInstanceKey.set(normalized.instanceKey, normalized)
    }
  }

  return {
    version: 1,
    checkpoints: Array.from(byInstanceKey.values())
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_RELAY_CHECKPOINTS),
  }
}

function normalizeRelayCheckpointRecord(value: unknown): RelayCheckpointRecord | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  const instanceKey = normalizeInstanceKey(record.instanceKey)
  const lastRelayEventId = normalizeCheckpointId(record.lastRelayEventId)
  const updatedAt = normalizeTimestamp(record.updatedAt)
  if (!instanceKey || lastRelayEventId === null || updatedAt === null) return null

  return {
    instanceKey,
    lastRelayEventId,
    updatedAt,
  }
}

function normalizeInstanceKey(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeCheckpointId(value: unknown) {
  const parsed = typeof value === "string" && value.trim() ? Number(value) : value
  if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed <= 0) return null
  return Math.trunc(parsed)
}

function normalizeTimestamp(value: unknown) {
  const parsed = typeof value === "string" && value.trim() ? Number(value) : value
  if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed <= 0) return null
  return Math.trunc(parsed)
}
```

- [ ] **Step 3: Verify Task 1**

Run:

```powershell
cd mcode-app; npm run test:unit -- relayCheckpointStore.spec.ts; cd ..
```

Expected: PASS.

- [ ] **Step 4: Commit Task 1**

```powershell
git add mcode-app/src/services/gateway/relayCheckpointStore.ts mcode-app/tests/services/relayCheckpointStore.spec.ts
git commit -m "feat(app): add p21 relay checkpoint store"
```

---

### Task 2: ACP Persistence Integration

**Files:**
- Modify: `mcode-app/src/api/acp.ts`
- Test: `mcode-app/tests/api/acpCheckpointPersistence.spec.ts`

**Interfaces:**
- Consumes: `readRelayCheckpoint(instanceKey)`
- Consumes: `upsertRelayCheckpoint(instanceKey, lastRelayEventId)`
- Consumes: `clearRelayCheckpoint(instanceKey)`
- Consumes: `clearRelayCheckpoints()`
- Produces: hydrated `AcpApiClient` relay recovery state after app restart
- Produces: persisted checkpoint updates after successful wrapped-event dispatch and replay-miss recovery

- [ ] **Step 1: Write the failing ACP persistence tests**

Create `mcode-app/tests/api/acpCheckpointPersistence.spec.ts`:

```ts
import { acpApi } from "@/api/acp"
import {
  clearRelayCheckpoints,
  readRelayCheckpoint,
  upsertRelayCheckpoint,
} from "@/services/gateway/relayCheckpointStore"

describe("acpApi relay checkpoint persistence", () => {
  beforeEach(() => {
    acpApi.clearRelayRecoveryState()
    clearRelayCheckpoints()
    acpApi.__setReplayMissCalibrationHookForTest(() => {})
  })

  afterEach(() => {
    acpApi.__setReplayMissCalibrationHookForTest(null)
    acpApi.clearRelayRecoveryState()
    clearRelayCheckpoints()
  })

  it("hydrates the relay checkpoint from storage", () => {
    uni.setStorageSync("mcode_relay_checkpoints_v1", {
      version: 1,
      checkpoints: [
        {
          instanceKey: "relay:hydrate",
          lastRelayEventId: 88,
          updatedAt: 1_710_000_000_000,
        },
      ],
    })

    expect(acpApi.getRelayRecoveryState("relay:hydrate")).toMatchObject({
      lastRelayEventId: 88,
    })
  })

  it("persists the wrapped event checkpoint after dispatch succeeds", () => {
    const payloads: unknown[] = []

    acpApi.__handleRelayRealtimeFrameForTest(
      "relay:persist",
      { eventId: 9, channel: "app://status", payload: { ok: true } },
      (payload) => payloads.push(payload)
    )

    expect(payloads).toEqual([{ ok: true }])
    expect(readRelayCheckpoint("relay:persist")).toMatchObject({
      instanceKey: "relay:persist",
      lastRelayEventId: 9,
    })
  })

  it("does not persist when wrapped event dispatch throws", () => {
    expect(() =>
      acpApi.__handleRelayRealtimeFrameForTest(
        "relay:broken",
        { eventId: 10, channel: "app://status", payload: { ok: false } },
        () => {
          throw new Error("dispatch failed")
        }
      )
    ).toThrow("dispatch failed")

    expect(readRelayCheckpoint("relay:broken")).toBeNull()
  })

  it("persists replay miss high-water checkpoints", async () => {
    acpApi.__handleRelayRealtimeFrameForTest(
      "relay:miss",
      { type: "replay_miss", requestedLastEventId: 1, replayWindowStart: 5, lastEventId: 8 },
      () => {}
    )

    await Promise.resolve()

    expect(readRelayCheckpoint("relay:miss")).toMatchObject({
      instanceKey: "relay:miss",
      lastRelayEventId: 8,
    })
    expect(acpApi.getRelayRecoveryState("relay:miss")).toMatchObject({
      recoveryIssue: "replay_miss",
    })
  })

  it("clears persisted checkpoints with the in-memory state", () => {
    upsertRelayCheckpoint("relay:clear", 12)

    acpApi.clearRelayRecoveryState("relay:clear")

    expect(readRelayCheckpoint("relay:clear")).toBeNull()
  })
})
```

Run:

```powershell
cd mcode-app; npm run test:unit -- acpCheckpointPersistence.spec.ts; cd ..
```

Expected: FAIL because `acp.ts` still only keeps checkpoint state in memory.

- [ ] **Step 2: Wire `acp.ts` to the checkpoint store**

Modify `mcode-app/src/api/acp.ts` imports and checkpoint handling:

```ts
import {
  clearRelayCheckpoint,
  clearRelayCheckpoints,
  readRelayCheckpoint,
  upsertRelayCheckpoint,
} from "@/services/gateway/relayCheckpointStore"
```

Add a persistence helper inside `AcpApiClient`:

```ts
private persistRelayCheckpoint(instanceKey: string, lastRelayEventId: number | null) {
  if (typeof lastRelayEventId !== "number" || !Number.isFinite(lastRelayEventId) || lastRelayEventId <= 0) {
    return
  }
  upsertRelayCheckpoint(instanceKey, Math.trunc(lastRelayEventId))
}
```

Seed `getOrCreateRelayRecoveryState()` from the persisted store:

```ts
private getOrCreateRelayRecoveryState(instanceKey: string): RelayRecoveryState {
  const existing = this.relayRecoveryStates.get(instanceKey)
  if (existing) return existing

  const stored = readRelayCheckpoint(instanceKey)
  const created: RelayRecoveryState = {
    lastRelayEventId: stored?.lastRelayEventId ?? null,
    replayWindowStart: null,
    requestedLastEventId: null,
    recoveryIssue: null,
    recoveryMessage: null,
  }
  this.relayRecoveryStates.set(instanceKey, created)
  return created
}
```

Update `clearRelayRecoveryState()` so the persisted store is cleared with the in-memory state:

```ts
clearRelayRecoveryState(instanceKey?: string) {
  if (instanceKey) {
    this.relayRecoveryStates.delete(instanceKey)
    clearRelayCheckpoint(instanceKey)
    return
  }
  this.relayRecoveryStates.clear()
  clearRelayCheckpoints()
}
```

Persist successful wrapped-event dispatches and replay-miss high-water marks in `handleRelayRealtimeFrame()`:

```ts
if (frame.kind === "replay_miss") {
  recovery.recoveryIssue = "replay_miss"
  recovery.requestedLastEventId = frame.requestedLastEventId ?? null
  recovery.replayWindowStart = frame.replayWindowStart ?? null
  recovery.lastRelayEventId = frame.lastEventId ?? recovery.lastRelayEventId
  recovery.recoveryMessage = "实时事件有缺口，正在刷新会话状态。部分中间状态可能已跳过。"
  this.persistRelayCheckpoint(instanceKey, recovery.lastRelayEventId)
  this.emitBridgeHealth(instanceKey, this.buildBridgeHealthForInstance(instanceKey))
  void this.calibrateActiveConversationsAfterReplayMiss(instanceKey)
  return
}
if (frame.kind === "event") {
  dispatchPayload({
    eventId: frame.eventId,
    channel: frame.channel,
    payload: frame.payload,
    controllerId: frame.controllerId,
    localEventId: frame.localEventId,
  })
  recovery.lastRelayEventId = frame.eventId
  recovery.recoveryIssue = null
  recovery.recoveryMessage = null
  this.persistRelayCheckpoint(instanceKey, recovery.lastRelayEventId)
  return
}
```

- [ ] **Step 3: Verify Task 2**

Run:

```powershell
cd mcode-app; npm run test:unit -- acpCheckpointPersistence.spec.ts acpRecovery.spec.ts relayCheckpointStore.spec.ts; cd ..
```

Expected: PASS.

- [ ] **Step 4: Commit Task 2**

```powershell
git add mcode-app/src/api/acp.ts mcode-app/tests/api/acpCheckpointPersistence.spec.ts
git commit -m "feat(app): persist p21 relay checkpoints"
```

---

### Task 3: Docs, Roadmap Status, And Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-06-26-mcode-p7-p12-roadmap-status.md`
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`

**Interfaces:**
- Consumes: the P21 checkpoint store and `acpApi` persistence behavior from Tasks 1-2
- Produces: roadmap coverage through P21 and native replication guidance for checkpoint persistence

- [ ] **Step 1: Update the roadmap status**

Modify `docs/superpowers/plans/2026-06-26-mcode-p7-p12-roadmap-status.md`:

```markdown
# MCode P7-P21 Roadmap Status
```

Add a P21 row after P20:

```markdown
| P21 | App relay checkpoint persistence: persist `lastRelayEventId` per `instanceKey` in app storage so reconnect survives app restart without changing relay or Desktop protocols. | Implemented first slice. App hydrates relay checkpoints from uni storage, persists successful wrapped-event checkpoints, persists replay-miss high-water marks, clears persisted checkpoints on reset, and keeps sensitive gateway data out of the checkpoint store. |
```

Add a `## P21 Implemented Scope` section:

```markdown
- `relayCheckpointStore` owns the versioned `mcode_relay_checkpoints_v1` storage snapshot.
- `acpApi` hydrates the relay checkpoint before reconnect and persists it after successful dispatch.
- `replay_miss` persists the relay high-water mark when the relay provides a positive `lastEventId`.
- `clearRelayRecoveryState()` clears both memory recovery state and persisted checkpoint storage.
- The store never holds tokens, pair secrets, official CLI credentials, or raw relay payloads.
```

- [ ] **Step 2: Update the architecture note**

Modify `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md` by appending a new section after the existing P20 section:

```markdown
## P21 App Relay Checkpoint Persistence Behavior

P21 makes the P20 relay checkpoint survive app restart. `mcode-app` now keeps a
small app-only checkpoint store for `lastRelayEventId` and uses that store to
seed the realtime bridge reconnect path.

Storage behavior:

- `relayCheckpointStore.ts` owns the versioned `mcode_relay_checkpoints_v1`
  snapshot in `uni` storage.
- Each record stores `instanceKey`, `lastRelayEventId`, and `updatedAt`.
- The store ignores malformed snapshots, prunes old records, and never stores
  access tokens, refresh tokens, pair secrets, official CLI credentials, or raw
  relay payloads.

App recovery behavior:

- `acpApi` hydrates `lastRelayEventId` from the checkpoint store when the
  recovery state is first created for an `instanceKey`.
- Successful wrapped-event dispatch persists the new checkpoint after payload
  handling completes.
- `replay_miss` persists the relay high-water checkpoint when relay provides a
  positive `lastEventId`, but it still triggers state refresh and calibration.
- `clearRelayRecoveryState()` clears both memory recovery state and persisted
  checkpoint state.

Native replication:

- Native iOS/Android clients should use the same key-value style checkpoint
  store for relay `eventId`.
- The checkpoint belongs to the authenticated gateway instance, not to an ACP
  conversation.
- Persist only positive relay event ids and update timestamps.
- Never persist gateway tokens, official CLI credentials, or raw event payloads
  in checkpoint storage.
```

- [ ] **Step 3: Run full verification**

Run:

```powershell
cd mcode-app; npm run test:unit; cd ..
git diff --check
```

Expected:

- App unit tests pass.
- `git diff --check` reports no whitespace errors. CRLF warnings are acceptable only if there are no whitespace error lines.

- [ ] **Step 4: Commit Task 3**

```powershell
git add docs/superpowers/plans/2026-06-26-mcode-p7-p12-roadmap-status.md docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md
git commit -m "docs(app): record p21 relay checkpoint persistence"
```

---

## Self-Review Checklist

- Spec coverage: the plan covers a dedicated app checkpoint store, ACP hydration, persistence after successful dispatch, replay-miss high-water persistence, clearing behavior, docs, and native replication guidance.
- Compatibility: relay and Desktop protocols stay unchanged; direct Codeg/OpenCode connections do not use the relay checkpoint store.
- Naming: uses `instanceKey`, `lastRelayEventId`, `replay_miss`, and `mcode_relay_checkpoints_v1` consistently across tasks.
- Security: no tokens, pair secrets, official CLI credentials, or raw relay payloads are stored.
- Scope: app-only P21; no relay/Desktop protocol changes and no new visible UI.
- Type consistency: `RelayCheckpointRecord`, `RelayCheckpointStorageSnapshot`, `readRelayCheckpointSnapshot()`, `readRelayCheckpoint()`, `upsertRelayCheckpoint()`, `clearRelayCheckpoint()`, and `clearRelayCheckpoints()` are defined before use.
