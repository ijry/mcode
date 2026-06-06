# MCode Shared Live Conversation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `mcode-app` reuse `codeg 0.15+` live conversation connections across desktop and mobile/web so a later-opened client joins the same live stream, cannot send during another client’s active turn, and does not tear down the shared live connection on page exit.

**Architecture:** Add a shared-live role model on the client (`owner` vs `viewer`) driven by `acp_find_connection_for_conversation`. Conversation open first asks the server for an existing live connection; if found, `mcode-app` adopts it as a viewer and attaches to the same stream. Send availability is derived from role plus runtime status, and local cleanup becomes detach-only for shared live sessions.

**Tech Stack:** Vue 3, Pinia, uni-app, TypeScript, ACP web APIs, websocket realtime attach transport

---

### Task 1: Extend ACP Types and Client API for Live Connection Discovery

**Files:**
- Modify: `mcode-app/src/types/acp.ts`
- Modify: `mcode-app/src/api/acp.ts`
- Test: manual verification only

- [ ] **Step 1: Add `ConversationConnectionInfo` typing**

In `mcode-app/src/types/acp.ts`, add:

```ts
export interface ConversationConnectionInfo {
  connection_id: string
  event_seq: number
}
```

- [ ] **Step 2: Add `acpFindConnectionForConversation(...)`**

In `mcode-app/src/api/acp.ts`, add:

```ts
async acpFindConnectionForConversation(
  conversationId: number
): Promise<ConversationConnectionInfo | null> {
  return await this.request("/acp_find_connection_for_conversation", {
    conversationId,
    conversation_id: conversationId,
  })
}
```

- [ ] **Step 3: Static sanity check**

Run:

```bash
npx vue-tsc --noEmit
```

Expected:

```text
No new type errors attributable to ConversationConnectionInfo or acpFindConnectionForConversation.
```

- [ ] **Step 4: Commit**

```bash
git add mcode-app/src/types/acp.ts mcode-app/src/api/acp.ts
git commit -m "feat: add shared live connection discovery api"
```

### Task 2: Add Shared-Live Role Semantics to Connection Session Manager

**Files:**
- Modify: `mcode-app/src/services/conversation/connectionSessionManager.ts`
- Test: manual verification only

- [ ] **Step 1: Extend managed connection metadata**

Update `ManagedConversationConnection` to include:

```ts
export interface ManagedConversationConnection {
  conversationId: number
  instanceKey: string
  connectionId: string
  connection: ConnectionInfo
  externalId?: string | null
  status: "idle" | "connecting" | "connected" | "error"
  role: "owner" | "viewer"
  sharedLive: boolean
  detachOnly: boolean
  allowSend: boolean
  lastTouchedAt: number
}
```

- [ ] **Step 2: Split adopt semantics into owner/viewer-aware inputs**

Adjust `adoptConversation(...)` to accept:

```ts
role?: "owner" | "viewer"
sharedLive?: boolean
detachOnly?: boolean
allowSend?: boolean
```

and default to:

```ts
role: input.role || "owner"
sharedLive: input.sharedLive ?? false
detachOnly: input.detachOnly ?? false
allowSend: input.allowSend ?? true
```

- [ ] **Step 3: Mark freshly-created local connections as shared-safe owners**

Inside `connectConversation(...)`, create managed records with:

```ts
role: "owner",
sharedLive: true,
detachOnly: true,
allowSend: true,
```

This keeps local cleanup from eagerly disconnecting a shared live session later viewed elsewhere.

- [ ] **Step 4: Add connection permission/status helpers**

Add:

```ts
setConversationSendAllowed(conversationId: number, allowSend: boolean) {
  const managed = byConversationId.get(conversationId)
  if (!managed) return
  managed.allowSend = allowSend
  managed.lastTouchedAt = Date.now()
}

setConversationRole(
  conversationId: number,
  role: "owner" | "viewer",
  sharedLive = role === "viewer"
) {
  const managed = byConversationId.get(conversationId)
  if (!managed) return
  managed.role = role
  managed.sharedLive = sharedLive
  managed.detachOnly = true
  managed.lastTouchedAt = Date.now()
}
```

- [ ] **Step 5: Make disconnect detach-only by default**

Change `disconnectConversation(...)` from:

```ts
await acpApi.acpDisconnect(managed.connectionId)
```

to:

```ts
if (!managed.detachOnly) {
  await acpApi.acpDisconnect(managed.connectionId)
}
```

Then always clear the local maps.

- [ ] **Step 6: Make stale sweep local-only**

Keep `sweepInactiveConversations(...)` calling `disconnectConversation(...)`, which now becomes local detach by default instead of remote disconnect.

- [ ] **Step 7: Commit**

```bash
git add mcode-app/src/services/conversation/connectionSessionManager.ts
git commit -m "feat: add shared live connection role tracking"
```

### Task 3: Teach Conversation Runtime to Reuse Existing Live Connections

**Files:**
- Modify: `mcode-app/src/stores/conversationRuntime.ts`
- Test: manual verification only

- [ ] **Step 1: Add runtime helper to detect blocked shared-live send**

Add near store helpers:

```ts
function isSharedInProgressStatus(
  status: RuntimeSession["status"]
) {
  return (
    status === "thinking" ||
    status === "running_tool" ||
    status === "waiting_permission"
  )
}
```

- [ ] **Step 2: Add send-allow recomputation**

Inside the store, add:

```ts
function syncManagedSendPermission(conversationId: number) {
  const session = sessions.value.get(conversationId)
  const managed = connectionSessionManager.getByConversationId(conversationId)
  if (!session || !managed) return

  const allowSend = !(
    managed.role === "viewer" &&
    isSharedInProgressStatus(session.status)
  )
  connectionSessionManager.setConversationSendAllowed(conversationId, allowSend)
}
```

Call it after:

1. `status_changed`
2. `permission_request`
3. `permission_resolved`
4. `turn_complete`
5. initial connect/adopt
6. snapshot hydrate

- [ ] **Step 3: Reuse existing live connection before local connect**

In `connect(...)`, before snapshot-based adopt or `connectConversation(...)`, add:

```ts
let discovered: Awaited<ReturnType<typeof acpApi.acpFindConnectionForConversation>> = null
try {
  discovered = await acpApi.acpFindConnectionForConversation(conversationId)
} catch (error) {
  console.warn("acp_find_connection_for_conversation failed", error)
}

if (!managed && discovered?.connection_id) {
  managed = connectionSessionManager.adoptConversation({
    conversationId,
    instanceKey,
    connectionId: discovered.connection_id,
    agentType,
    sessionId: sessionId || null,
    status: "connected",
    role: "viewer",
    sharedLive: true,
    detachOnly: true,
    allowSend: false,
  })
}
```

Only fall through to snapshot adopt and local `acp_connect` if discovery failed to find a live connection.

- [ ] **Step 4: Keep locally-created conversations as owner**

In `bindCreatedConversationRuntime(...)`, adopt with:

```ts
role: "owner",
sharedLive: true,
detachOnly: true,
allowSend: true,
```

- [ ] **Step 5: Expose send eligibility to the page**

Add:

```ts
function canSend(conversationId: number) {
  const managed = connectionSessionManager.getByConversationId(conversationId)
  if (!managed) return true
  return managed.allowSend
}

function getManagedConversation(conversationId: number) {
  return connectionSessionManager.getByConversationId(conversationId)
}
```

and export them from the store return object.

- [ ] **Step 6: Commit**

```bash
git add mcode-app/src/stores/conversationRuntime.ts
git commit -m "feat: reuse shared live conversation connections"
```

### Task 4: Gate Sending and Surface Shared-Live State in Conversation Detail

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`
- Test: manual verification only

- [ ] **Step 1: Add computed shared-live view state**

Add computed state near existing session-derived values:

```ts
const managedConversation = computed(() =>
  conversationId.value ? runtime.getManagedConversation(conversationId.value) : null
)

const isViewerMode = computed(() => managedConversation.value?.role === "viewer")
const isSharedLive = computed(() => managedConversation.value?.sharedLive === true)
const canSendSharedLive = computed(() =>
  conversationId.value ? runtime.canSend(conversationId.value) : true
)
```

- [ ] **Step 2: Add watcher-friendly status label if desired**

Add a short computed label:

```ts
const sharedLiveHint = computed(() => {
  if (!isSharedLive.value) return ""
  if (isViewerMode.value && !canSendSharedLive.value) {
    return "当前正在旁观其他端的实时会话"
  }
  return "当前会话正在多端共享"
})
```

- [ ] **Step 3: Block send paths when viewer is in-progress**

At the start of `sendMessage()`, `sendContinueMessage()`, and `sendDraft(...)`, guard with:

```ts
if (!canSendSharedLive.value) {
  uni.showToast({
    title: "该会话正在其他端处理中，当前仅可旁观，待本轮结束后可发送",
    icon: "none",
    duration: 3000,
  })
  return
}
```

For `sendDraft(...)`, return `false` after the toast.

- [ ] **Step 4: Re-check live ownership before actual prompt send after idle recovery**

Inside `sendDraft(...)`, before `acpApi.acpPrompt(...)`, if current role is `viewer`, re-check:

```ts
const liveInfo = await acpApi.acpFindConnectionForConversation(conversationId.value).catch(() => null)
if (liveInfo?.connection_id && liveInfo.connection_id !== conn) {
  const adopted = connectionSessionManager.adoptConversation({
    conversationId: conversationId.value,
    instanceKey: auth.currentRemoteInstance().instanceKey,
    connectionId: liveInfo.connection_id,
    agentType: currentAgentType.value || "claude_code",
    sessionId: session.value?.connectionId || null,
    status: "connected",
    role: "viewer",
    sharedLive: true,
    detachOnly: true,
    allowSend: false,
  })
  throw new Error("该会话已被其他端重新接管，请等待当前轮结束后再发送")
}
```

If no live connection exists, allow the existing local send path to continue using the current connection.

This is intentionally conservative; the first implementation can prefer safe blocking over ownership races.

- [ ] **Step 5: Show shared-live hint in the toolbar or input area**

Add a lightweight hint near the toolbar or above the composer:

```vue
<view v-if="sharedLiveHint" class="shared-live-hint">
  <text class="shared-live-hint__text">{{ sharedLiveHint }}</text>
</view>
```

Keep styling minimal and aligned with existing UI.

- [ ] **Step 6: Do not add explicit remote disconnect on unload**

Leave existing page cleanup on the runtime/store path only; do not introduce any direct `acp_disconnect` calls in the page.

- [ ] **Step 7: Commit**

```bash
git add mcode-app/src/pages/conversation-detail/index.vue
git commit -m "feat: gate shared live conversation sends in detail view"
```

### Task 5: Verification

**Files:**
- No file changes
- Test: manual verification only

- [ ] **Step 1: Validate desktop-first attach**

```text
Desktop starts a live turn. Mcode opens the same conversation.
Expected: mcode joins the same live stream and cannot send until the turn ends.
```

- [ ] **Step 2: Validate mcode-first attach**

```text
Mcode starts a live turn. Desktop opens the same conversation.
Expected: desktop joins the same live stream.
```

- [ ] **Step 3: Validate send recovery**

```text
After the active turn completes, the viewer side tries to send again.
Expected: sending is allowed again.
```

- [ ] **Step 4: Validate detach-only cleanup**

```text
Mcode starts live, desktop joins, then mcode leaves detail.
Expected: desktop live session continues without interruption.
```

- [ ] **Step 5: Validate both gateway modes**

```text
Repeat the same attach/send/exit checks in both direct and relay mode.
```

