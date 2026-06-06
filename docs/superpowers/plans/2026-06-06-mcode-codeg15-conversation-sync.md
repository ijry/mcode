# MCode Codeg 0.15 Conversation Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align `mcode-app` with `codeg 0.15+` conversation sync so create, rename, delete, and status changes initiated from `mcode-app` propagate through the server’s global `conversation://changed` channel and keep both desktop `codeg` and `mcode-app` overview state in sync.

**Architecture:** Keep the existing SQLite-first overview model, but add a per-instance global conversation-change listener that writes `upsert`, `deleted`, and `status` events into the local summary store. Normalize `mcode-app` writes onto the 0.15 web API endpoint names, then let overview rendering refresh from local summary invalidation instead of relying only on manual remote reloads.

**Tech Stack:** Vue 3, Pinia, uni-app, TypeScript, local SQLite repository layer, direct/relay websocket event channel

---

### Task 1: Extend Conversation Summary Repository for Realtime Deletes and Status Patches

**Files:**
- Modify: `mcode-app/src/services/db/repositories/conversationRepository.ts`
- Test: manual verification only

- [ ] **Step 1: Add targeted repository helpers for realtime summary sync**

Add focused helpers below `upsertConversationSummary(...)` for realtime mutations:

```ts
export async function patchConversationSummaryStatus(input: {
  instanceKey: string
  conversationId: number
  status: string
  updatedAt?: number
}) {
  const current = await getConversationSummaryById(input.instanceKey, input.conversationId)
  if (!current) return false

  const nextUpdatedAt = normalizeTimestamp(input.updatedAt, Date.now())
  const nextStatus = mergeConversationSummaryStatus({
    currentStatus: current.status,
    currentUpdatedAt: current.updatedAt,
    incomingStatus: input.status,
    incomingUpdatedAt: nextUpdatedAt,
  })

  await sqliteDriver.execute(
    `
      UPDATE conversations
      SET status = ?, updated_at = ?
      WHERE instance_key = ? AND id = ? AND deleted_at IS NULL
    `,
    [nextStatus, nextUpdatedAt, input.instanceKey, input.conversationId]
  )

  return true
}

export async function markConversationSummaryDeleted(input: {
  instanceKey: string
  conversationId: number
  deletedAt?: number
}) {
  const deletedAt = normalizeTimestamp(input.deletedAt, Date.now())
  await sqliteDriver.execute(
    `
      UPDATE conversations
      SET deleted_at = ?, updated_at = ?
      WHERE instance_key = ? AND id = ?
    `,
    [deletedAt, deletedAt, input.instanceKey, input.conversationId]
  )
}
```

- [ ] **Step 2: Keep repository helpers instance-scoped and non-destructive**

Confirm the new helpers only affect one `instance_key + id` pair and do not touch turns/runtime tables.

Expected result:

```text
Only the matching conversation summary row is patched or tombstoned.
```

- [ ] **Step 3: Commit**

```bash
git add mcode-app/src/services/db/repositories/conversationRepository.ts
git commit -m "feat: add realtime conversation summary sync helpers"
```

### Task 2: Add Global Conversation Change Sync Service

**Files:**
- Create: `mcode-app/src/services/conversation/globalConversationSync.ts`
- Modify: `mcode-app/src/api/acp.ts`
- Modify: `mcode-app/src/types/acp.ts`
- Test: manual verification only

- [ ] **Step 1: Extend socket event typing for global conversation-change frames**

Add types in `mcode-app/src/types/acp.ts`:

```ts
export interface GlobalConversationSummaryPayload {
  id: number
  folder_id?: number
  title?: string
  agent_type?: string
  external_id?: string | null
  connection_id?: string | null
  status?: string
  updated_at?: string
  last_message_at?: string
  deleted_at?: string | null
}

export type GlobalConversationChangeEvent =
  | { kind: "upsert"; summary: GlobalConversationSummaryPayload }
  | { kind: "deleted"; id: number }
  | { kind: "status"; id: number; status: string }
```

- [ ] **Step 2: Add low-level global socket subscription support in `acp.ts`**

In `mcode-app/src/api/acp.ts`, add a second listener registry for global frames and dispatch decoded socket payloads with `channel === "conversation://changed"`:

```ts
private globalListeners: Map<string, Set<(payload: unknown) => void>> = new Map()

subscribeGlobalEvent(
  channel: string,
  callback: (payload: unknown) => void,
  instanceKey?: string
) {
  if (!this.globalListeners.has(channel)) {
    this.globalListeners.set(channel, new Set())
  }
  this.globalListeners.get(channel)!.add(callback)

  if (!this.eventSource) {
    void this.connectEventSource(instanceKey)
  }

  return () => {
    const listeners = this.globalListeners.get(channel)
    if (!listeners) return
    listeners.delete(callback)
    if (listeners.size === 0) {
      this.globalListeners.delete(channel)
    }
  }
}
```

And inside the socket `onEvent(...)` bridge:

```ts
const globalFrame = this.extractGlobalFrame(raw)
if (globalFrame) {
  this.dispatchGlobalEvent(globalFrame.channel, globalFrame.payload)
  return
}
```

With helpers:

```ts
private extractGlobalFrame(raw: unknown) {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  const channel = typeof record.channel === "string" ? record.channel : ""
  if (!channel) return null
  return {
    channel,
    payload: "payload" in record ? record.payload : raw,
  }
}

private dispatchGlobalEvent(channel: string, payload: unknown) {
  const listeners = this.globalListeners.get(channel)
  if (!listeners) return
  listeners.forEach((callback) => {
    try {
      callback(payload)
    } catch (error) {
      console.error("全局事件处理失败:", error)
    }
  })
}
```

- [ ] **Step 3: Create the global conversation sync service**

Create `mcode-app/src/services/conversation/globalConversationSync.ts` with:

```ts
import { acpApi } from "@/api/acp"
import { ensureConversationSchema } from "@/services/db/migrations"
import {
  getConversationSummaryById,
  markConversationSummaryDeleted,
  patchConversationSummaryStatus,
  upsertConversationSummary,
} from "@/services/db/repositories/conversationRepository"
import { mapConversationToSummaryRecord } from "@/services/conversation/conversationOverviewSnapshot"
import type { GlobalConversationChangeEvent } from "@/types/acp"

const CONVERSATION_CHANGED_CHANNEL = "conversation://changed"
const unsubscribeByInstanceKey = new Map<string, () => void>()
const overviewListeners = new Set<(instanceKey: string) => void>()

export function subscribeConversationOverviewInvalidation(
  listener: (instanceKey: string) => void
) {
  overviewListeners.add(listener)
  return () => overviewListeners.delete(listener)
}

function notifyOverviewInvalidated(instanceKey: string) {
  overviewListeners.forEach((listener) => {
    try {
      listener(instanceKey)
    } catch (error) {
      console.error("[conversation-sync] overview invalidation failed", error)
    }
  })
}

export async function ensureGlobalConversationSync(instanceKey: string) {
  if (unsubscribeByInstanceKey.has(instanceKey)) return

  await acpApi.ensureRealtimeBridge(instanceKey)
  const unsubscribe = acpApi.subscribeGlobalEvent(
    CONVERSATION_CHANGED_CHANNEL,
    (payload) => {
      void handleConversationChanged(instanceKey, payload)
    },
    instanceKey
  )
  unsubscribeByInstanceKey.set(instanceKey, unsubscribe)
}
```

And implement `handleConversationChanged(...)` to:

```ts
async function handleConversationChanged(instanceKey: string, payload: unknown) {
  const event = normalizeConversationChanged(payload)
  if (!event) return

  await ensureConversationSchema()

  if (event.kind === "upsert") {
    const summary = event.summary
    const conversationId = Number(summary.id || 0)
    if (!conversationId) return
    await upsertConversationSummary(
      mapConversationToSummaryRecord(instanceKey, {
        id: conversationId,
        title: summary.title,
        agent_type: summary.agent_type,
        updated_at: summary.updated_at,
        last_message_at: summary.last_message_at,
        folder_id: Number(summary.folder_id || 0),
        status: summary.status,
        external_id: summary.external_id || undefined,
      })
    )
    notifyOverviewInvalidated(instanceKey)
    return
  }

  if (event.kind === "deleted") {
    const conversationId = Number(event.id || 0)
    if (!conversationId) return
    await markConversationSummaryDeleted({ instanceKey, conversationId })
    notifyOverviewInvalidated(instanceKey)
    return
  }

  if (event.kind === "status") {
    const conversationId = Number(event.id || 0)
    if (!conversationId) return
    const current = await getConversationSummaryById(instanceKey, conversationId)
    if (!current) return
    await patchConversationSummaryStatus({
      instanceKey,
      conversationId,
      status: event.status,
    })
    notifyOverviewInvalidated(instanceKey)
  }
}
```

- [ ] **Step 4: Run a static sanity check**

Run:

```bash
npm --prefix mcode-app run type-check
```

Expected:

```text
Type check passes, or reports only pre-existing unrelated issues.
```

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/types/acp.ts mcode-app/src/api/acp.ts mcode-app/src/services/conversation/globalConversationSync.ts mcode-app/src/services/db/repositories/conversationRepository.ts
git commit -m "feat: sync conversation summaries from global realtime events"
```

### Task 3: Wire Overview Page to Global Sync and Fix Rename Endpoint

**Files:**
- Modify: `mcode-app/src/pages/conversations/index.vue`
- Test: manual verification only

- [ ] **Step 1: Subscribe overview page to global invalidation**

In `mcode-app/src/pages/conversations/index.vue`, import and wire:

```ts
import {
  ensureGlobalConversationSync,
  subscribeConversationOverviewInvalidation,
} from "@/services/conversation/globalConversationSync"
```

Create page-level subscription state:

```ts
let disposeOverviewInvalidation: (() => void) | null = null
```

Inside `onMounted(...)`:

```ts
disposeOverviewInvalidation = subscribeConversationOverviewInvalidation((instanceKey) => {
  const currentKeys = getConnectedConnections().map((item) => {
    try {
      return createGatewayForKey(item)
    } catch {
      return ""
    }
  })
  if (!currentKeys.includes(instanceKey)) return
  markConversationListDirty()
  void loadOverviewData()
})
```

Inside `onUnload(...)` or equivalent cleanup section:

```ts
disposeOverviewInvalidation?.()
disposeOverviewInvalidation = null
```

If the page already lacks `onUnload`, add it via `@dcloudio/uni-app`.

- [ ] **Step 2: Ensure global sync starts for connected direct instances**

After each successful `createConnectionGateway(conn)` usage in overview loading, ensure the instance listener exists:

```ts
const descriptor = gateway.getRemoteInstanceDescriptor()
await ensureGlobalConversationSync(descriptor.instanceKey).catch((error) => {
  console.warn("ensure global conversation sync skipped:", error)
})
```

Apply this in `loadConnectionGroup(...)` and `refreshConnectionGroupFromRemote(...)`.

- [ ] **Step 3: Replace rename command with the 0.15 endpoint**

Change the rename action from:

```ts
await gateway.call("update_conversation", {
  conversationId: currentConversation.value!.id,
  title: res.content,
})
```

to:

```ts
await gateway.call("update_conversation_title", {
  conversationId: currentConversation.value!.id,
  title: res.content,
})
```

- [ ] **Step 4: Keep local refresh behavior as fallback, not source of truth**

Retain:

```ts
markConversationListDirty()
await loadData()
```

after local write actions for resilience, but do not add any new forced remote reloads beyond the existing fallback path.

- [ ] **Step 5: Run a page-level sanity check**

Run:

```bash
npm --prefix mcode-app run type-check
```

Expected:

```text
The conversations page compiles with the new imports and endpoint name.
```

- [ ] **Step 6: Commit**

```bash
git add mcode-app/src/pages/conversations/index.vue
git commit -m "fix: align conversation overview sync with codeg 0.15 events"
```

### Task 4: Manual End-to-End Verification

**Files:**
- No file changes
- Test: manual verification only

- [ ] **Step 1: Verify create propagation**

Run the app against upgraded desktop `codeg 0.15+`, then:

```text
Create a conversation in mcode-app.
Expected: desktop codeg sidebar shows the new conversation without manual refresh.
```

- [ ] **Step 2: Verify rename propagation**

```text
Rename that conversation in mcode-app.
Expected: desktop codeg sidebar title updates without manual refresh.
```

- [ ] **Step 3: Verify delete propagation**

```text
Delete that conversation in mcode-app.
Expected: desktop codeg sidebar removes it without manual refresh.
```

- [ ] **Step 4: Verify local overview convergence**

```text
Create, rename, or delete a conversation from another client connected to the same codeg instance.
Expected: mcode-app overview updates from global conversation://changed events.
```

- [ ] **Step 5: Verify no create regression**

```text
After creating from mcode-app, the detail page still opens immediately and the local overview does not show duplicate rows.
```

