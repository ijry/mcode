# MCode P20 App Recovery UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `mcode-app` consume P19 relay/Desktop recovery signals so Desktop gateway reconnects use relay checkpoints, replay gaps are visible, and recoverable gateway failures produce actionable UX.

**Architecture:** P20 is app-only. `RelayGateway` gains additive event recovery options and frame classifiers, `acpApi` owns per-`instanceKey` relay checkpoints and replay-miss bridge health, and conversation detail/status presentation maps recovery state to user-facing messages. Relay and Desktop protocols remain unchanged.

**Tech Stack:** TypeScript, UniApp/Vue 3, Pinia, Jest, existing MCode gateway/realtime services.

## Global Constraints

- Use `targetAgent`, not `targetType`.
- Do not introduce mobile-side `codex` or `claude` target agents; official CLIs remain `mcode-desktop` capabilities.
- Do not introduce VS Code or code-server assumptions.
- Do not change relay or Desktop wire protocol.
- Do not persist official CLI credentials, relay access tokens, refresh tokens, pair secrets, or Desktop runtime snapshots in new app storage.
- Relay `eventId` and ACP `seq` are separate sequences and must not be merged.
- App agent-specific recovery display helpers must live under `mcode-app/src/agents/mcode-desktop/` when they are Desktop-specific.
- Every mcode change must update `docs/mcode-architecture-notes/`.

---

## File Structure

- Modify: `mcode-app/src/services/gateway/types.ts`
  - Add `EventRecoveryOptions`, relay recovery frame interfaces, and optional `connectEvents(..., options)`.
- Create: `mcode-app/src/services/gateway/relayRecovery.ts`
  - Own pure helpers for checkpoint normalization, event URL building, relay frame classification, and classified error copy.
- Modify: `mcode-app/src/services/gateway/relayGateway.ts`
  - Use `buildRelayEventsUrl()` and support `connectEvents(onEvent, options)`.
- Test: `mcode-app/tests/services/relayRecovery.spec.ts`
  - Cover URL/checkpoint/frame helpers and classified error messages.
- Modify: `mcode-app/src/api/acp.ts`
  - Track per-instance relay event checkpoint, pass `lastEventId` on reconnect, handle `ready`/`replay_miss`, and update checkpoint after dispatch.
- Modify: `mcode-app/src/types/acp.ts`
  - Add recovery fields to `RealtimeBridgeHealth`.
- Test: `mcode-app/tests/api/acpRecovery.spec.ts`
  - Cover replay miss health and checkpoint update semantics through exported test helpers.
- Modify: `mcode-app/src/pages/conversation-detail/detailStatusPresentation.ts`
  - Add recovery warning status priority.
- Test: `mcode-app/tests/pages/conversation-detail/detailStatusPresentation.spec.ts`
  - Cover replay-miss status copy.
- Create: `mcode-app/src/agents/mcode-desktop/recovery.ts`
  - Add Desktop-only stale/interrupted helpers for later UI reuse and native parity.
- Test: `mcode-app/tests/agents/mcodeDesktopRecovery.spec.ts`
  - Cover interrupted/stale helper behavior.
- Modify: `docs/superpowers/plans/2026-06-26-mcode-p7-p12-roadmap-status.md`
  - Extend status source through P20.
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`
  - Move P20 from planned to implemented behavior after code lands.

---

### Task 1: Relay Recovery Primitives In App Gateway Layer

**Files:**
- Modify: `mcode-app/src/services/gateway/types.ts`
- Create: `mcode-app/src/services/gateway/relayRecovery.ts`
- Modify: `mcode-app/src/services/gateway/relayGateway.ts`
- Test: `mcode-app/tests/services/relayRecovery.spec.ts`

**Interfaces:**
- Produces: `EventRecoveryOptions`
- Produces: `RelayReadyFrame`, `RelayRecoveryMissFrame`, `RelayWrappedEventFrame`
- Produces: `normalizeRelayEventCheckpoint(value) -> number | null`
- Produces: `buildRelayEventsUrl(relayUrl, checkpoint?) -> string`
- Produces: `classifyRelayRealtimeFrame(raw) -> RelayRealtimeFrame`
- Produces: `describeGatewayFailureCode(code) -> string`
- Consumes: existing `RelayGateway.connectEvents(onEvent)`

- [ ] **Step 1: Write failing relay recovery primitive tests**

Create `mcode-app/tests/services/relayRecovery.spec.ts`:

```ts
import {
  buildRelayEventsUrl,
  classifyRelayRealtimeFrame,
  describeGatewayFailureCode,
  normalizeRelayEventCheckpoint,
} from "@/services/gateway/relayRecovery"

describe("relay recovery helpers", () => {
  it("builds events URLs with valid lastEventId only", () => {
    expect(buildRelayEventsUrl("https://relay.example.com/", 42))
      .toBe("wss://relay.example.com/v1/events?lastEventId=42")
    expect(buildRelayEventsUrl("http://127.0.0.1:8787", 0))
      .toBe("ws://127.0.0.1:8787/v1/events")
    expect(buildRelayEventsUrl("https://relay.example.com", -1))
      .toBe("wss://relay.example.com/v1/events")
  })

  it("normalizes relay event checkpoints defensively", () => {
    expect(normalizeRelayEventCheckpoint(12.9)).toBe(12)
    expect(normalizeRelayEventCheckpoint("7")).toBe(7)
    expect(normalizeRelayEventCheckpoint(0)).toBeNull()
    expect(normalizeRelayEventCheckpoint("bad")).toBeNull()
  })

  it("classifies relay ready, replay miss, and wrapped event frames", () => {
    expect(classifyRelayRealtimeFrame({ type: "ready", lastEventId: 9 })).toMatchObject({
      kind: "ready",
      lastEventId: 9,
    })
    expect(classifyRelayRealtimeFrame({ type: "replay_miss", requestedLastEventId: 1, lastEventId: 8 }))
      .toMatchObject({ kind: "replay_miss", requestedLastEventId: 1, lastEventId: 8 })
    expect(classifyRelayRealtimeFrame({ eventId: 10, channel: "acp://event", payload: { type: "stream_batch" } }))
      .toMatchObject({ kind: "event", eventId: 10, channel: "acp://event" })
    expect(classifyRelayRealtimeFrame({ type: "stream_batch", connectionId: "c1", data: {} }))
      .toMatchObject({ kind: "legacy" })
  })

  it("maps classified gateway failures to actionable copy", () => {
    expect(describeGatewayFailureCode("target_offline")).toContain("Desktop")
    expect(describeGatewayFailureCode("request_timeout")).toContain("重试")
    expect(describeGatewayFailureCode("session_revoked")).toContain("重新配对")
    expect(describeGatewayFailureCode("unknown")).toBe("")
  })
})
```

Run:

```powershell
cd mcode-app; npm run test:unit -- relayRecovery.spec.ts; cd ..
```

Expected: FAIL because `relayRecovery.ts` does not exist.

- [ ] **Step 2: Add gateway recovery types**

Modify `mcode-app/src/services/gateway/types.ts`:

```ts
export interface EventRecoveryOptions {
  lastEventId?: number | null
}

export interface RelayReadyFrame {
  type: "ready"
  replayWindowStart?: number | null
  lastEventId?: number | null
  replayAvailable?: boolean
}

export interface RelayRecoveryMissFrame {
  type: "replay_miss"
  requestedLastEventId?: number | null
  replayWindowStart?: number | null
  lastEventId?: number | null
}

export interface RelayWrappedEventFrame {
  eventId: number
  channel: string
  payload: unknown
  controllerId?: string | null
  localEventId?: number | null
}
```

Change the `CodegGateway` interface:

```ts
connectEvents(
  onEvent: (event: unknown) => void,
  options?: EventRecoveryOptions
): Promise<EventChannelConnection>
```

- [ ] **Step 3: Implement `relayRecovery.ts` helpers**

Create `mcode-app/src/services/gateway/relayRecovery.ts`:

```ts
import type {
  RelayReadyFrame,
  RelayRecoveryMissFrame,
  RelayWrappedEventFrame,
} from "./types"

export type RelayRealtimeFrame =
  | ({ kind: "ready" } & RelayReadyFrame)
  | ({ kind: "replay_miss" } & RelayRecoveryMissFrame)
  | ({ kind: "event" } & RelayWrappedEventFrame)
  | { kind: "legacy"; payload: unknown }

export function normalizeRelayEventCheckpoint(value: unknown): number | null {
  const parsed = typeof value === "string" && value.trim() ? Number(value) : value
  if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed <= 0) return null
  return Math.trunc(parsed)
}

export function buildRelayEventsUrl(relayUrl: string, checkpoint?: unknown): string {
  const base = relayUrl.replace(/^http/, "ws").replace(/\/$/, "")
  const normalized = normalizeRelayEventCheckpoint(checkpoint)
  if (!normalized) return `${base}/v1/events`
  return `${base}/v1/events?lastEventId=${encodeURIComponent(String(normalized))}`
}

export function classifyRelayRealtimeFrame(raw: unknown): RelayRealtimeFrame {
  if (!raw || typeof raw !== "object") return { kind: "legacy", payload: raw }
  const record = raw as Record<string, unknown>
  if (record.type === "ready") {
    return {
      kind: "ready",
      type: "ready",
      replayWindowStart: normalizeNullableNumber(record.replayWindowStart),
      lastEventId: normalizeNullableNumber(record.lastEventId),
      replayAvailable: record.replayAvailable === true,
    }
  }
  if (record.type === "replay_miss") {
    return {
      kind: "replay_miss",
      type: "replay_miss",
      requestedLastEventId: normalizeNullableNumber(record.requestedLastEventId),
      replayWindowStart: normalizeNullableNumber(record.replayWindowStart),
      lastEventId: normalizeNullableNumber(record.lastEventId),
    }
  }
  const eventId = normalizeRelayEventCheckpoint(record.eventId)
  const channel = typeof record.channel === "string" ? record.channel.trim() : ""
  if (eventId && channel) {
    return {
      kind: "event",
      eventId,
      channel,
      payload: record.payload,
      controllerId: typeof record.controllerId === "string" ? record.controllerId : null,
      localEventId: normalizeNullableNumber(record.localEventId),
    }
  }
  return { kind: "legacy", payload: raw }
}

export function describeGatewayFailureCode(code: unknown): string {
  switch (typeof code === "string" ? code : "") {
    case "target_offline":
      return "MCode Desktop 当前不在线，请确认电脑端已连接网关后重试。"
    case "request_timeout":
      return "网关请求超时，可以稍后重试或检查 Desktop 与网关连接。"
    case "session_revoked":
      return "网关会话已失效，请刷新连接或重新配对。"
    case "desktop_replaced":
      return "Desktop 上游连接已切换，正在重新连接实时通道。"
    case "gateway_shutdown":
      return "网关正在重启，请稍后重试。"
    default:
      return ""
  }
}

function normalizeNullableNumber(value: unknown): number | null {
  if (value == null) return null
  return normalizeRelayEventCheckpoint(value)
}
```

- [ ] **Step 4: Wire relay gateway URL options**

Modify `mcode-app/src/services/gateway/relayGateway.ts`:

```ts
import { buildRelayEventsUrl } from "./relayRecovery"
import type { CodegGateway, EventChannelConnection, EventRecoveryOptions, PairTargetMetadata, RelaySessionInfo } from "./types"
```

Change the method signature:

```ts
async connectEvents(
  onEvent: (event: unknown) => void,
  options: EventRecoveryOptions = {}
): Promise<EventChannelConnection> {
```

Replace both hard-coded event URLs with:

```ts
buildRelayEventsUrl(this.relayUrl, options.lastEventId)
```

- [ ] **Step 5: Verify Task 1**

Run:

```powershell
cd mcode-app; npm run test:unit -- relayRecovery.spec.ts; cd ..
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```powershell
git add mcode-app/src/services/gateway/types.ts mcode-app/src/services/gateway/relayRecovery.ts mcode-app/src/services/gateway/relayGateway.ts mcode-app/tests/services/relayRecovery.spec.ts
git commit -m "feat(app): add p20 relay recovery primitives"
```

---

### Task 2: App Realtime Bridge Checkpoints And Replay Miss Handling

**Files:**
- Modify: `mcode-app/src/api/acp.ts`
- Modify: `mcode-app/src/types/acp.ts`
- Test: `mcode-app/tests/api/acpRecovery.spec.ts`

**Interfaces:**
- Consumes: `classifyRelayRealtimeFrame(raw)`
- Consumes: `normalizeRelayEventCheckpoint(value)`
- Produces: `AcpApiClient.getRelayRecoveryState(instanceKey)`
- Produces: `AcpApiClient.clearRelayRecoveryState(instanceKey?)`
- Produces: `RealtimeBridgeHealth.recoveryIssue`, `lastRelayEventId`, `replayWindowStart`, `requestedLastEventId`, `recoveryMessage`

- [ ] **Step 1: Write failing acp recovery tests**

Create `mcode-app/tests/api/acpRecovery.spec.ts`:

```ts
import { acpApi } from "@/api/acp"

describe("acpApi relay recovery", () => {
  beforeEach(() => {
    acpApi.clearRelayRecoveryState()
  })

  it("records relay checkpoints after wrapped event dispatch", () => {
    const received: unknown[] = []
    acpApi.__handleRelayRealtimeFrameForTest(
      "relay:https://gateway.example.com:desktop-1",
      { eventId: 9, channel: "app://status", payload: { ok: true } },
      (payload) => received.push(payload)
    )

    expect(received).toEqual([{ ok: true }])
    expect(acpApi.getRelayRecoveryState("relay:https://gateway.example.com:desktop-1"))
      .toMatchObject({ lastRelayEventId: 9 })
  })

  it("does not advance checkpoint when dispatch throws", () => {
    expect(() => acpApi.__handleRelayRealtimeFrameForTest(
      "relay:broken",
      { eventId: 10, channel: "app://status", payload: { ok: false } },
      () => {
        throw new Error("dispatch failed")
      }
    )).toThrow("dispatch failed")

    expect(acpApi.getRelayRecoveryState("relay:broken").lastRelayEventId).toBeNull()
  })

  it("records replay miss health without dispatching ACP event", () => {
    const received: unknown[] = []
    acpApi.__handleRelayRealtimeFrameForTest(
      "relay:miss",
      { type: "replay_miss", requestedLastEventId: 1, replayWindowStart: 5, lastEventId: 8 },
      (payload) => received.push(payload)
    )

    expect(received).toEqual([])
    expect(acpApi.getRelayRecoveryState("relay:miss")).toMatchObject({
      recoveryIssue: "replay_miss",
      requestedLastEventId: 1,
      replayWindowStart: 5,
      lastRelayEventId: 8,
    })
  })
})
```

Run:

```powershell
cd mcode-app; npm run test:unit -- acpRecovery.spec.ts; cd ..
```

Expected: FAIL because recovery state helpers do not exist.

- [ ] **Step 2: Extend `RealtimeBridgeHealth`**

Modify `mcode-app/src/types/acp.ts`:

```ts
export interface RealtimeBridgeHealth {
  instanceKey: string
  state: "idle" | "connected" | "reconnecting" | "error" | "polling"
  reason?: "close" | "error"
  reconnectAttempt: number
  nextRetryDelayMs?: number | null
  updatedAt: number
  recoveryIssue?: "replay_miss" | null
  lastRelayEventId?: number | null
  replayWindowStart?: number | null
  requestedLastEventId?: number | null
  recoveryMessage?: string | null
}
```

- [ ] **Step 3: Add recovery state to `acp.ts`**

Modify `mcode-app/src/api/acp.ts` imports:

```ts
import {
  classifyRelayRealtimeFrame,
  normalizeRelayEventCheckpoint,
} from "@/services/gateway/relayRecovery"
```

Add type and class field near `BridgeState`:

```ts
type RelayRecoveryState = {
  lastRelayEventId: number | null
  replayWindowStart: number | null
  requestedLastEventId: number | null
  recoveryIssue: "replay_miss" | null
  recoveryMessage: string | null
}
```

Inside `AcpApiClient`:

```ts
private relayRecoveryStates = new Map<string, RelayRecoveryState>()
```

Add public helpers:

```ts
getRelayRecoveryState(instanceKey?: string): RelayRecoveryState {
  const key = this.resolveDescriptor(instanceKey).instanceKey
  return this.getOrCreateRelayRecoveryState(key)
}

clearRelayRecoveryState(instanceKey?: string) {
  if (instanceKey) {
    this.relayRecoveryStates.delete(instanceKey)
    return
  }
  this.relayRecoveryStates.clear()
}
```

Add private initializer:

```ts
private getOrCreateRelayRecoveryState(instanceKey: string): RelayRecoveryState {
  const existing = this.relayRecoveryStates.get(instanceKey)
  if (existing) return existing
  const created: RelayRecoveryState = {
    lastRelayEventId: null,
    replayWindowStart: null,
    requestedLastEventId: null,
    recoveryIssue: null,
    recoveryMessage: null,
  }
  this.relayRecoveryStates.set(instanceKey, created)
  return created
}
```

- [ ] **Step 4: Add relay frame handling**

Add method inside `AcpApiClient`:

```ts
private handleRelayRealtimeFrame(
  instanceKey: string,
  raw: unknown,
  dispatchPayload: (payload: unknown) => void
) {
  const frame = classifyRelayRealtimeFrame(raw)
  const recovery = this.getOrCreateRelayRecoveryState(instanceKey)
  if (frame.kind === "ready") {
    recovery.replayWindowStart = frame.replayWindowStart ?? recovery.replayWindowStart
    recovery.lastRelayEventId = frame.lastEventId ?? recovery.lastRelayEventId
    recovery.recoveryIssue = null
    recovery.recoveryMessage = null
    return
  }
  if (frame.kind === "replay_miss") {
    recovery.recoveryIssue = "replay_miss"
    recovery.requestedLastEventId = frame.requestedLastEventId ?? null
    recovery.replayWindowStart = frame.replayWindowStart ?? null
    recovery.lastRelayEventId = frame.lastEventId ?? recovery.lastRelayEventId
    recovery.recoveryMessage = "实时事件有缺口，正在刷新会话状态。部分中间状态可能已跳过。"
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
    return
  }
  dispatchPayload(frame.payload)
}

__handleRelayRealtimeFrameForTest(
  instanceKey: string,
  raw: unknown,
  dispatchPayload: (payload: unknown) => void
) {
  return this.handleRelayRealtimeFrame(instanceKey, raw, dispatchPayload)
}
```

Add:

```ts
private buildBridgeHealthForInstance(instanceKey: string): RealtimeBridgeHealth {
  const bridge = this.bridgeStates.get(instanceKey)
  if (bridge) return this.buildBridgeHealth(instanceKey, bridge)
  return {
    instanceKey,
    state: "idle",
    reconnectAttempt: 0,
    nextRetryDelayMs: null,
    updatedAt: Date.now(),
    ...this.getBridgeRecoveryHealthPatch(instanceKey),
  }
}
```

Add a placeholder calibration method for Task 2:

```ts
private async calibrateActiveConversationsAfterReplayMiss(instanceKey: string) {
  console.warn("[relay-recovery] replay miss", { instanceKey })
}
```

Task 4 can replace this with actual conversation binding calibration if needed.

- [ ] **Step 5: Pass checkpoint on bridge connect**

In `ensureRealtimeBridge`, replace:

```ts
eventConnection = await gateway.connectEvents((raw) => {
```

with:

```ts
eventConnection = await gateway.connectEvents((raw) => {
```

and wrap the callback body with:

```ts
this.handleRelayRealtimeFrame(targetKey, raw, (frame) => {
  if (this.isAttachFrame(frame)) {
    transport.handleServerFrame(frame)
    return
  }
  const globalFrame = this.extractGlobalFrame(frame)
  if (globalFrame) {
    this.dispatchGlobalEvent(targetKey, globalFrame.channel, globalFrame.payload)
    return
  }
  const event = this.extractLegacyEvent(frame)
  if (event) {
    this.dispatchEvent(event, targetKey)
  }
})
```

Pass options as second argument:

```ts
}, {
  lastEventId: this.getOrCreateRelayRecoveryState(targetKey).lastRelayEventId,
})
```

- [ ] **Step 6: Include recovery patch in bridge health**

Add:

```ts
private getBridgeRecoveryHealthPatch(instanceKey: string) {
  const recovery = this.relayRecoveryStates.get(instanceKey)
  if (!recovery) return {}
  return {
    recoveryIssue: recovery.recoveryIssue,
    lastRelayEventId: recovery.lastRelayEventId,
    replayWindowStart: recovery.replayWindowStart,
    requestedLastEventId: recovery.requestedLastEventId,
    recoveryMessage: recovery.recoveryMessage,
  }
}
```

Spread it into `getRealtimeBridgeHealth()` idle return and `buildBridgeHealth()` return:

```ts
...this.getBridgeRecoveryHealthPatch(descriptor.instanceKey)
```

and:

```ts
...this.getBridgeRecoveryHealthPatch(instanceKey)
```

- [ ] **Step 7: Verify Task 2**

Run:

```powershell
cd mcode-app; npm run test:unit -- acpRecovery.spec.ts relayRecovery.spec.ts; cd ..
```

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

```powershell
git add mcode-app/src/api/acp.ts mcode-app/src/types/acp.ts mcode-app/tests/api/acpRecovery.spec.ts
git commit -m "feat(app): track p20 relay recovery checkpoints"
```

---

### Task 3: Recovery Status Presentation And Desktop Stale Helpers

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/detailStatusPresentation.ts`
- Modify: `mcode-app/tests/pages/conversation-detail/detailStatusPresentation.spec.ts`
- Create: `mcode-app/src/agents/mcode-desktop/recovery.ts`
- Test: `mcode-app/tests/agents/mcodeDesktopRecovery.spec.ts`
- Modify: `mcode-app/src/services/gateway/error.ts`
- Modify: `mcode-app/tests/services/gatewayError.spec.ts`

**Interfaces:**
- Consumes: `RealtimeBridgeHealth.recoveryIssue`
- Consumes: `describeGatewayFailureCode(code)`
- Produces: `DetailStatusCode = "replay_miss"`
- Produces: `isDesktopInterruptedSession(session)`
- Produces: `isDesktopStaleInteraction(interaction)`

- [ ] **Step 1: Write failing presentation/helper tests**

Append to `mcode-app/tests/pages/conversation-detail/detailStatusPresentation.spec.ts`:

```ts
it("shows replay miss as recoverable warning", () => {
  expect(buildDetailStatusState({
    bridgeHealth: health("connected", {
      recoveryIssue: "replay_miss",
      recoveryMessage: "实时事件有缺口，正在刷新会话状态。部分中间状态可能已跳过。",
    }),
    showBridgeRecoveredBanner: false,
    runtimeErrorText: "",
    runtimeRetryText: "",
    runtimeStatus: "connected",
    longWaitElapsedMs: 0,
    activeModelStatusLabel: "",
    planTaskCount: 0,
    themeColor,
  })).toEqual(expect.objectContaining({
    code: "replay_miss",
    severity: "warning",
    text: "实时事件有缺口，正在刷新会话状态。部分中间状态可能已跳过。",
  }))
})
```

Create `mcode-app/tests/agents/mcodeDesktopRecovery.spec.ts`:

```ts
import {
  describeDesktopRecoveryInteraction,
  describeDesktopRecoverySession,
  isDesktopInterruptedSession,
  isDesktopStaleInteraction,
} from "@/agents/mcode-desktop/recovery"

describe("mcode desktop recovery helpers", () => {
  it("detects interrupted sessions and stale interactions", () => {
    expect(isDesktopInterruptedSession({ status: "interrupted" })).toBe(true)
    expect(isDesktopInterruptedSession({ status: "running" })).toBe(false)
    expect(isDesktopStaleInteraction({ status: "stale" })).toBe(true)
    expect(isDesktopStaleInteraction({ status: "pending" })).toBe(false)
  })

  it("returns user-facing recovery copy", () => {
    expect(describeDesktopRecoverySession({ status: "interrupted" })).toContain("重新发送")
    expect(describeDesktopRecoveryInteraction({ status: "stale" })).toContain("已失效")
  })
})
```

Append to `mcode-app/tests/services/gatewayError.spec.ts`:

```ts
it("maps classified gateway failure codes before generic message", () => {
  expect(toResponseErrorMessage({ code: "target_offline", message: "target offline" }, 503))
    .toContain("Desktop")
  expect(toResponseErrorMessage({ code: "session_revoked", message: "revoked" }, 401))
    .toContain("重新配对")
  expect(toErrorMessage(new Error(JSON.stringify({ code: "request_timeout", message: "timeout" }))))
    .toContain("重试")
})
```

Run:

```powershell
cd mcode-app; npm run test:unit -- detailStatusPresentation.spec.ts mcodeDesktopRecovery.spec.ts gatewayError.spec.ts; cd ..
```

Expected: FAIL because code is not implemented.

- [ ] **Step 2: Implement replay miss status**

Modify `mcode-app/src/pages/conversation-detail/detailStatusPresentation.ts`:

```ts
export type DetailStatusCode =
  | "bridge_recovered"
  | "replay_miss"
  | "bridge_reconnecting"
```

In `buildDetailStatusState`, after recovered banner and before reconnecting:

```ts
if (health?.recoveryIssue === "replay_miss") {
  return {
    code: "replay_miss",
    severity: "warning",
    text: health.recoveryMessage || "实时事件有缺口，正在刷新会话状态。部分中间状态可能已跳过。",
    icon: "warning-fill",
    iconColor: color("--up-warning", "#f9ae3d"),
    loading: true,
  }
}
```

Update `buildRuntimeStatusLabel` and `buildRuntimeStatusClass`:

```ts
if (input.detailStatusCode === "replay_miss") return "恢复中"
```

and:

```ts
if (input.detailStatusCode === "replay_miss") return "pending"
```

- [ ] **Step 3: Add desktop recovery helpers**

Create `mcode-app/src/agents/mcode-desktop/recovery.ts`:

```ts
type StatusLike = { status?: unknown } | null | undefined

export function isDesktopInterruptedSession(session: StatusLike) {
  return normalizeStatus(session) === "interrupted"
}

export function isDesktopStaleInteraction(interaction: StatusLike) {
  return normalizeStatus(interaction) === "stale"
}

export function describeDesktopRecoverySession(session: StatusLike) {
  if (!isDesktopInterruptedSession(session)) return ""
  return "Desktop 重启后，官方 CLI 进程不能原地恢复。请重新发送下一条提示。"
}

export function describeDesktopRecoveryInteraction(interaction: StatusLike) {
  if (!isDesktopStaleInteraction(interaction)) return ""
  return "这个授权或问题来自已中断的 Desktop 进程，已失效。请重新发起任务。"
}

function normalizeStatus(value: StatusLike) {
  return typeof value?.status === "string" ? value.status.trim().toLowerCase() : ""
}
```

- [ ] **Step 4: Map classified gateway error copy**

Modify `mcode-app/src/services/gateway/error.ts`:

```ts
import { describeGatewayFailureCode } from "./relayRecovery"
```

Inside `pickNestedMessage`, after `const record = asObject(value)` and before nested candidates:

```ts
const classified = describeGatewayFailureCode(record.code)
if (classified) return classified
```

- [ ] **Step 5: Verify Task 3**

Run:

```powershell
cd mcode-app; npm run test:unit -- detailStatusPresentation.spec.ts mcodeDesktopRecovery.spec.ts gatewayError.spec.ts; cd ..
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```powershell
git add mcode-app/src/pages/conversation-detail/detailStatusPresentation.ts mcode-app/tests/pages/conversation-detail/detailStatusPresentation.spec.ts mcode-app/src/agents/mcode-desktop/recovery.ts mcode-app/tests/agents/mcodeDesktopRecovery.spec.ts mcode-app/src/services/gateway/error.ts mcode-app/tests/services/gatewayError.spec.ts
git commit -m "feat(app): surface p20 recovery status"
```

---

### Task 4: Conversation Calibration, Docs, And Full Verification

**Files:**
- Modify: `mcode-app/src/api/acp.ts`
- Modify: `mcode-app/src/services/conversation/conversationSyncService.ts`
- Test: `mcode-app/tests/api/acpRecovery.spec.ts`
- Modify: `docs/superpowers/plans/2026-06-26-mcode-p7-p12-roadmap-status.md`
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`

**Interfaces:**
- Consumes: replay miss bridge state from Task 2
- Produces: replay miss triggers calibration for active bindings under the same `instanceKey`
- Produces: roadmap P20 implemented status

- [ ] **Step 1: Add active binding calibration test**

Extend `mcode-app/tests/api/acpRecovery.spec.ts` with a focused test after adding an injectable test hook:

```ts
it("invokes replay miss calibration hook for the affected instance", async () => {
  const calls: string[] = []
  acpApi.__setReplayMissCalibrationHookForTest(async (instanceKey) => {
    calls.push(instanceKey)
  })

  acpApi.__handleRelayRealtimeFrameForTest(
    "relay:miss-calibrate",
    { type: "replay_miss", requestedLastEventId: 1, replayWindowStart: 5, lastEventId: 8 },
    () => {}
  )

  await Promise.resolve()
  expect(calls).toEqual(["relay:miss-calibrate"])
  acpApi.__setReplayMissCalibrationHookForTest(null)
})
```

Run:

```powershell
cd mcode-app; npm run test:unit -- acpRecovery.spec.ts; cd ..
```

Expected: FAIL until hook is implemented.

- [ ] **Step 2: Export conversation sync calibration by instance**

Modify `mcode-app/src/services/conversation/conversationSyncService.ts`:

```ts
export async function calibrateActiveConversationsForInstance(instanceKey: string) {
  const active = Array.from(bindings.values()).filter(
    (binding) => !binding.closed && binding.instanceKey === instanceKey
  )
  await Promise.all(active.map(async (binding) => {
    try {
      await calibrateAfterReplayGap(binding.conversationId)
    } catch (error) {
      console.warn("[conversation-realtime] replay miss calibration skipped", {
        conversationId: binding.conversationId,
        instanceKey,
        error,
      })
    }
  }))
}
```

- [ ] **Step 3: Wire replay miss calibration in `acp.ts`**

Import:

```ts
import { calibrateActiveConversationsForInstance } from "@/services/conversation/conversationSyncService"
```

Add class field:

```ts
private replayMissCalibrationHook: ((instanceKey: string) => Promise<void> | void) | null = null
```

Replace placeholder `calibrateActiveConversationsAfterReplayMiss`:

```ts
private async calibrateActiveConversationsAfterReplayMiss(instanceKey: string) {
  if (this.replayMissCalibrationHook) {
    await this.replayMissCalibrationHook(instanceKey)
    return
  }
  await calibrateActiveConversationsForInstance(instanceKey)
}
```

Add test hook:

```ts
__setReplayMissCalibrationHookForTest(
  hook: ((instanceKey: string) => Promise<void> | void) | null
) {
  this.replayMissCalibrationHook = hook
}
```

- [ ] **Step 4: Update roadmap status**

Modify `docs/superpowers/plans/2026-06-26-mcode-p7-p12-roadmap-status.md`:

```markdown
# MCode P7-P20 Roadmap Status
```

Add P20 row:

```markdown
| P20 | App recovery UX: consume relay event checkpoints, replay-miss signals, classified gateway failures, and Desktop interrupted/stale recovery state in MCode app. | Implemented first slice. App reconnects relay event streams with `lastEventId`, records checkpoint after successful dispatch, shows replay-miss recovery warnings, maps classified gateway failures to actions, and documents native replication behavior. |
```

Add `## P20 Implemented Scope` with:

```markdown
- `RelayGateway.connectEvents(..., { lastEventId })`.
- Per-`instanceKey` relay checkpoint in `acpApi`.
- `replay_miss` realtime bridge health and conversation calibration.
- Classified gateway error copy for `target_offline`, `request_timeout`, `session_revoked`, `desktop_replaced`, and `gateway_shutdown`.
- Desktop stale/interrupted helpers under `agents/mcode-desktop`.
```

- [ ] **Step 5: Update architecture note**

Modify `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`:

Change heading:

```markdown
## P20 App Recovery UX Behavior
```

Replace planned wording with implemented behavior matching the roadmap status.

- [ ] **Step 6: Run full verification**

Run:

```powershell
cd mcode-app; npm run test:unit; cd ..
cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml p19_ -- --nocapture
cd mcode-relay; npm test -- relayRecovery.test.ts replayBuffer.test.ts; cd ..
git diff --check
```

Expected:

- App unit tests pass.
- P19 desktop targeted tests pass.
- Relay recovery targeted tests pass.
- `git diff --check` reports no whitespace errors. CRLF warnings are acceptable only if there are no whitespace error lines.

- [ ] **Step 7: Commit Task 4**

```powershell
git add mcode-app/src/api/acp.ts mcode-app/src/services/conversation/conversationSyncService.ts mcode-app/tests/api/acpRecovery.spec.ts docs/superpowers/plans/2026-06-26-mcode-p7-p12-roadmap-status.md docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md
git commit -m "docs(app): record p20 recovery ux"
```

---

## Self-Review Checklist

- Spec coverage: Plan covers relay checkpoint URL, wrapper frame classification, checkpoint update after dispatch, replay miss bridge health, conversation calibration, classified gateway failure copy, Desktop interrupted/stale helpers, docs, and native guidance.
- Compatibility: `connectEvents` options are optional; direct gateways ignore relay checkpoints; old relay frames continue through legacy dispatch.
- Naming: Uses `targetAgent`, not `targetType`. Uses relay `eventId` separately from ACP `seq`.
- Security: No new token persistence; recovery state stores only non-secret event ids and replay metadata.
- Scope: App-only P20; no relay/Desktop protocol changes, no database, no VS Code/code-server behavior.
- Type consistency: `lastEventId`, `lastRelayEventId`, `replayWindowStart`, `requestedLastEventId`, and `recoveryIssue` are named consistently across plan tasks.
