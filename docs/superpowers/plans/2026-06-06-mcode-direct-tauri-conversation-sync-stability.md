# MCode Direct Tauri Conversation Sync Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the direct Tauri path stable across multiple connections so the websocket bridge, `conversation://changed` sync, and conversation runtime all stay bound to the correct `instanceKey` and recover automatically from brief disconnects.

**Architecture:** Keep relay behavior unchanged. Add a small registry for remote instance descriptors and a per-baseUrl direct token store, then teach `acp.ts` to route bridge state, reconnect timers, and global conversation events by `instanceKey`. Reuse the local SQLite summary cache first for overview refresh, and make detail/runtime paths resolve instance identity from the managed conversation instead of the current auth snapshot.

**Tech Stack:** Vue 3, Pinia, uni-app, TypeScript, local SQLite repository layer, websocket realtime bridge, direct/relay gateway adapters

---

### Task 1: Split Direct Token Storage From the Active Auth Snapshot

**Files:**
- Create: `mcode-app/src/services/gateway/directTokenStore.ts`
- Create: `mcode-app/src/services/realtime/remoteInstanceRegistry.ts`
- Modify: `mcode-app/src/stores/auth.ts`
- Modify: `mcode-app/src/services/gateway/directGateway.ts`
- Modify: `mcode-app/src/services/gateway/index.ts`
- Test: `npm --prefix mcode-app exec vue-tsc --noEmit`

- [ ] **Step 1: Add a direct-token store keyed by normalized baseUrl**

Create `mcode-app/src/services/gateway/directTokenStore.ts` with:

```ts
const STORAGE_KEY = "mcode_direct_tokens"

function normalizeBaseUrl(baseUrl: string) {
  return String(baseUrl || "").trim().replace(/\/+$/, "")
}

function readTokenMap(): Record<string, string> {
  const raw = uni.getStorageSync(STORAGE_KEY)
  if (!raw || typeof raw !== "object") return {}
  return raw as Record<string, string>
}

export function getDirectToken(baseUrl: string) {
  const key = normalizeBaseUrl(baseUrl)
  if (!key) return ""
  return String(readTokenMap()[key] || "").trim()
}

export function setDirectToken(baseUrl: string, token: string) {
  const key = normalizeBaseUrl(baseUrl)
  if (!key) return
  const next = { ...readTokenMap() }
  const value = String(token || "").trim()
  if (value) {
    next[key] = value
  } else {
    delete next[key]
  }
  uni.setStorageSync(STORAGE_KEY, next)
}

export function removeDirectToken(baseUrl: string) {
  setDirectToken(baseUrl, "")
}
```

- [ ] **Step 2: Add a remote-instance descriptor registry**

Create `mcode-app/src/services/realtime/remoteInstanceRegistry.ts` with:

```ts
import type { RemoteInstanceDescriptor } from "./types"

const registry = new Map<string, RemoteInstanceDescriptor>()

export function registerRemoteInstanceDescriptor(descriptor: RemoteInstanceDescriptor) {
  if (!descriptor.instanceKey) return
  registry.set(descriptor.instanceKey, { ...descriptor })
}

export function getRegisteredRemoteInstanceDescriptor(instanceKey: string) {
  return registry.get(instanceKey) ?? null
}

export function clearRemoteInstanceDescriptorRegistry() {
  registry.clear()
}
```

- [ ] **Step 3: Make auth and gateways use the new stores**

Update `mcode-app/src/stores/auth.ts` so direct mode no longer depends on a single `mcode_direct_token` value:

```ts
import { getDirectToken } from "@/services/gateway/directTokenStore"
import { registerRemoteInstanceDescriptor } from "@/services/realtime/remoteInstanceRegistry"

setDirectMode(directBaseUrl: string, token: string) {
  this.mode = "direct"
  this.directBaseUrl = directBaseUrl
  setDirectToken(directBaseUrl, token)
}

currentRemoteInstance() {
  const gateway = this.gateway()
  const descriptor = gateway.getRemoteInstanceDescriptor()
  registerRemoteInstanceDescriptor(descriptor)
  return descriptor
}
```

Update `mcode-app/src/services/gateway/directGateway.ts` to read and write token state by `baseUrl`:

```ts
import { getDirectToken, setDirectToken } from "./directTokenStore"

function getToken(baseUrl: string): string {
  return getDirectToken(baseUrl)
}

async pair(params: { ... }): Promise<null> {
  if (params.directBaseUrl) {
    this.baseUrl = params.directBaseUrl
  }
  if (params.token) {
    setDirectToken(this.baseUrl, params.token)
  }
  return null
}
```

Update `mcode-app/src/services/gateway/index.ts` to keep gateway construction unchanged, but ensure any caller that resolves a gateway also registers the descriptor it exposes.

- [ ] **Step 4: Verify TypeScript still sees the new stores**

Run:

```bash
npm --prefix mcode-app exec vue-tsc --noEmit
```

Expected:

```text
No new type errors from the new direct token store or descriptor registry.
```

### Task 2: Rebuild ACP Bridge State Around `instanceKey`

**Files:**
- Modify: `mcode-app/src/api/acp.ts`
- Modify: `mcode-app/src/services/gateway/types.ts`
- Modify: `mcode-app/src/services/gateway/directGateway.ts`
- Modify: `mcode-app/src/services/gateway/relayGateway.ts`
- Modify: `mcode-app/src/services/realtime/event-stream.ts`
- Modify: `mcode-app/src/services/realtime/transport-registry.ts`
- Test: `npm --prefix mcode-app exec vue-tsc --noEmit`

- [ ] **Step 1: Extend event-channel lifecycle callbacks**

Update `mcode-app/src/services/gateway/types.ts`:

```ts
export interface EventChannelConnection {
  isOpen(): boolean
  send(frame: object): boolean
  onReady(callback: () => void): () => void
  onClose(callback: () => void): () => void
  onError(callback: () => void): () => void
  close(): void
}
```

Implement the new callbacks in both `directGateway.ts` and `relayGateway.ts` for H5 and `uni.connectSocket` paths.

- [ ] **Step 2: Add reconnectable per-instance bridge state to `acp.ts`**

Replace the single `eventSource` / `globalListeners` model with state keyed by `instanceKey`:

```ts
type BridgeState = {
  descriptor: RemoteInstanceDescriptor
  connection: EventChannelConnection | null
  reconnectTimer: ReturnType<typeof setTimeout> | null
  reconnectAttempt: number
  closedManually: boolean
}

private readonly bridgeStates = new Map<string, BridgeState>()
private readonly eventListeners = new Map<string, Set<(event: EventEnvelope) => void>>()
private readonly globalListeners = new Map<string, Map<string, Set<(payload: unknown) => void>>>()
private readonly ensureBridgePromises = new Map<string, Promise<BridgeState>>()
```

Route event envelopes by composite key:

```ts
const listenerKey = `${instanceKey}::${connectionId}`
```

Route `conversation://changed` by `instanceKey` and `channel`:

```ts
const listeners = this.globalListeners.get(instanceKey)?.get(channel)
```

- [ ] **Step 3: Rebind the realtime transport host on reconnect**

Update `mcode-app/src/services/realtime/event-stream.ts` and `transport-registry.ts` so an existing transport can be rehosted instead of being destroyed on every websocket reconnect:

```ts
rebindHost(host: RealtimeTransportHost) {
  this.unbindReady?.()
  this.host = host
  this.unbindReady = this.host.onReady(() => this.reattachAll())
  if (this.host.isOpen()) {
    this.reattachAll()
  }
}
```

`getOrCreateRealtimeTransport(...)` should call `rebindHost(...)` when the transport already exists and a new host is supplied.

- [ ] **Step 4: Schedule reconnects after close or error**

In `acp.ts`, when a bridge connection closes unexpectedly:

```ts
const delay = Math.min(30_000, 1000 * 2 ** state.reconnectAttempt)
state.reconnectTimer = setTimeout(() => {
  void this.ensureRealtimeBridge(instanceKey)
}, delay)
```

Only cancel retries when the bridge is explicitly detached.

- [ ] **Step 5: Verify the bridge compiles**

Run:

```bash
npm --prefix mcode-app exec vue-tsc --noEmit
```

Expected:

```text
Bridge typing, lifecycle callbacks, and transport rebinding compile cleanly.
```

### Task 3: Make Overview Sync Local-First and Instance-Scoped

**Files:**
- Modify: `mcode-app/src/services/conversation/globalConversationSync.ts`
- Modify: `mcode-app/src/pages/conversations/index.vue`
- Modify: `mcode-app/src/services/db/repositories/conversationRepository.ts`
- Test: `npm --prefix mcode-app exec vue-tsc --noEmit`

- [ ] **Step 1: Keep global conversation events instance-scoped**

Ensure `ensureGlobalConversationSync(instanceKey)` is idempotent per `instanceKey`, subscribes with that exact key, and ignores malformed payloads without switching to the current auth snapshot.

- [ ] **Step 2: Refresh the overview from local SQLite before remote fallback**

Update `mcode-app/src/pages/conversations/index.vue` so the invalidation listener only marks the list dirty and re-renders from local summary rows first:

```ts
disposeOverviewInvalidation = subscribeConversationOverviewInvalidation((instanceKey) => {
  markConversationListDirty()
  void loadOverviewData({ force: false })
})
```

Keep the remote reload path only when the local cache is missing or empty.

- [ ] **Step 3: Keep the repository helpers write-through and non-destructive**

If `conversationRepository.ts` needs small helpers for `deleted` or `status` patches, add them so they only touch the matching `instance_key + id` row and never mutate unrelated runtime tables.

- [ ] **Step 4: Verify overview typing**

Run:

```bash
npm --prefix mcode-app exec vue-tsc --noEmit
```

Expected:

```text
Overview refresh, global sync, and repository helpers compile together.
```

### Task 4: Bind Detail and Runtime Paths to the Managed Instance

**Files:**
- Modify: `mcode-app/src/stores/conversationRuntime.ts`
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`
- Modify: `mcode-app/src/services/conversation/conversationSyncService.ts`
- Test: `npm --prefix mcode-app exec vue-tsc --noEmit`

- [ ] **Step 1: Resolve instance identity from the managed conversation first**

Replace any direct use of `auth.currentRemoteInstance().instanceKey` in runtime/detail paths with a resolved instance key:

```ts
const resolvedInstanceKey =
  managed?.instanceKey ||
  session.value?.instanceKey ||
  auth.currentRemoteInstance().instanceKey
```

Use that key for local summary reads, detail snapshot persistence, and draft-state storage keys.

- [ ] **Step 2: Preserve the managed instance on attach, adopt, and create**

When `conversationRuntime.connect(...)` or `bindCreatedConversationRuntime(...)` adopts a conversation, pass the explicit `instanceKey` from the managed connection instead of recomputing it from current auth.

- [ ] **Step 3: Keep reconnect-sensitive runtime attach state on the same instance**

Ensure `conversationSyncService.ts` reattaches by `instanceKey` and `connectionId`, and does not fall back to a fresh auth snapshot when a bridge reconnects.

- [ ] **Step 4: Verify detail/runtime typing**

Run:

```bash
npm --prefix mcode-app exec vue-tsc --noEmit
```

Expected:

```text
Conversation detail and runtime compile with explicit instance binding.
```

### Task 5: Manual Multi-Direct Verification

**Files:**
- No file changes
- Test: manual verification only

- [ ] **Step 1: Verify instance-isolated global events**

Open two direct connections, then create or rename a conversation on one instance.

Expected:

```text
Only the matching instance overview updates from conversation://changed.
```

- [ ] **Step 2: Verify reconnect recovery**

Drop the websocket briefly while a direct conversation detail page is open.

Expected:

```text
The realtime stream reconnects automatically and the detail view resumes without manual refresh.
```

- [ ] **Step 3: Verify local-first overview refresh**

Trigger create, rename, and delete from the direct Tauri path.

Expected:

```text
The overview updates from local SQLite summary rows first, with no unnecessary remote reload when local cache is present.
```

- [ ] **Step 4: Verify direct token isolation**

Switch between two direct baseUrls that use different tokens.

Expected:

```text
Each direct gateway continues to use the token for its own baseUrl, and one connection no longer overwrites the other.
```
