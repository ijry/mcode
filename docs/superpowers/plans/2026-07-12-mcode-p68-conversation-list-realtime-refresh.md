# P68 Conversation List Realtime Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with Inline Execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh `mcode-app` conversation-list cards automatically when `pet://sessions` reports active-session membership or status changes.

**Architecture:** Extend the existing conversation-list `pet://sessions` subscription so it still updates the tabbar badge and also schedules a debounced per-instance remote overview refresh. Reuse the current `scheduleOverviewConversationRefresh` path for authoritative backend state, summary persistence, connection-group replacement, and in-flight de-dupe.

**Tech Stack:** Vue 3 SFC, uni-app, Pinia stores/services, existing `CodegGateway` calls, Jest for service tests, `vue-tsc` for static verification.

## Global Constraints

- Default user-facing explanations are in Chinese; code identifiers, commands, and API names remain unchanged.
- mcode changes must include a Markdown note under `docs/mcode-architecture-notes/`.
- Do not introduce new `--mcode-*` theme variables.
- Implementation plan execution uses Inline Execution only.
- Do not create an isolated worktree unless explicitly requested.
- P68 only covers conversation-list realtime refresh and must not import the reference branch's detail-page changes.

---

## File Structure

- Modify `mcode-app/src/pages/conversations/index.vue`: add a per-instance debounce timer map, clear timers on unload, and refresh the overview from authoritative remote state when `pet://sessions` fires.
- Create `docs/mcode-architecture-notes/2026-07-12-p68-conversation-list-realtime-refresh.md`: document architecture, event/data flow, UI behavior, compatibility, and native replication guidance.

### Task 1: Add Debounced Overview Refresh On `pet://sessions`

**Files:**
- Modify: `mcode-app/src/pages/conversations/index.vue`

**Interfaces:**
- Consumes: existing `acpApi.subscribeGlobalEvent("pet://sessions", handler, instanceKey)`, `getOngoingActiveSessionCount(payload)`, `applyConversationTabBarBadge(count)`, `scheduleOverviewConversationRefresh(input)`, `instanceConnectionKeyMap`, `connectionFolderSnapshotMap`, and `connectionTabSnapshotMap`.
- Produces: `scheduleActiveSessionsOverviewRefresh(instanceKey: string): void` and `refreshOverviewFromRemoteByInstance(instanceKey: string): Promise<void>` as page-local helpers.

- [ ] **Step 1: Add timer state near existing overview maps**

Add:

```ts
const activeSessionsRefreshTimerMap = new Map<string, ReturnType<typeof setTimeout>>()
const ACTIVE_SESSIONS_REFRESH_DEBOUNCE_MS = 400
```

- [ ] **Step 2: Clear timers on unload**

In `onUnload`, after clearing `disposeActiveSessionsChangedMap`, add:

```ts
activeSessionsRefreshTimerMap.forEach((timer) => clearTimeout(timer))
activeSessionsRefreshTimerMap.clear()
```

- [ ] **Step 3: Add per-instance refresh helpers**

Insert before `scheduleOverviewConversationRefresh`:

```ts
function scheduleActiveSessionsOverviewRefresh(instanceKey: string) {
  if (!instanceKey) return
  const existing = activeSessionsRefreshTimerMap.get(instanceKey)
  if (existing) {
    clearTimeout(existing)
  }
  const timer = setTimeout(() => {
    activeSessionsRefreshTimerMap.delete(instanceKey)
    void refreshOverviewFromRemoteByInstance(instanceKey)
  }, ACTIVE_SESSIONS_REFRESH_DEBOUNCE_MS)
  activeSessionsRefreshTimerMap.set(instanceKey, timer)
}

async function refreshOverviewFromRemoteByInstance(instanceKey: string) {
  if (!getRegisteredRemoteInstanceDescriptor(instanceKey)) return

  const mappedConnKey = instanceConnectionKeyMap.get(instanceKey) || ""
  if (!mappedConnKey) return
  const conn = findConnectedConnectionByKey(mappedConnKey)
  if (!conn) return

  const connKey = connectionKey(conn)
  const folders = connectionFolderSnapshotMap.get(connKey)
  const tabs = connectionTabSnapshotMap.get(connKey)
  if (!folders || !tabs) return

  try {
    const gateway = await createConnectionGateway(conn)
    await scheduleOverviewConversationRefresh({
      conn,
      gateway,
      instanceKey,
      folders,
      tabs,
    })
  } catch (error) {
    console.warn("refresh overview from pet://sessions skipped:", error)
  }
}
```

- [ ] **Step 4: Trigger refresh from the existing `pet://sessions` handler**

Change the handler body to:

```ts
activeSessionBadgeCountMap.set(instanceKey, getOngoingActiveSessionCount(payload))
void applyConversationTabBarBadge(sumActiveSessionBadgeCounts())
scheduleActiveSessionsOverviewRefresh(instanceKey)
```

- [ ] **Step 5: Run static verification for the edited SFC**

Run from `mcode-app`:

```bash
pnpm exec vue-tsc --noEmit
```

Expected: PASS, or only pre-existing unrelated diagnostics if the repository already has them.

### Task 2: Document P68 Architecture And Run Regression Tests

**Files:**
- Create: `docs/mcode-architecture-notes/2026-07-12-p68-conversation-list-realtime-refresh.md`

**Interfaces:**
- Consumes: P68 design and Task 1 behavior.
- Produces: Native-client implementation guidance for using `pet://sessions` as a debounced conversation-list refresh trigger.

- [ ] **Step 1: Add architecture note**

Create a concise note covering:

```md
# 2026-07-12 P68 Conversation List Realtime Refresh

## Architecture

Conversation list overview data remains authoritative from the remote
`list_all_conversations` endpoint. The existing `pet://sessions` subscription
now acts as a low-frequency invalidation signal for the list, in addition to its
tabbar badge role.

## Protocol And Data Flow

No ACP, SQLite, or payload schema changes are introduced. For each connected
instance, `pet://sessions` updates the active-session badge and schedules a
400ms debounced overview refresh. The refresh reuses cached folder/opened-tab
snapshots, calls the existing remote overview refresh path, persists summaries,
and replaces the visible connection group.

## UI Behavior

The conversation list updates shortly after a session starts, waits for
permission/question input, finishes, or errors. Completed sessions receive their
terminal status from the backend list response rather than from the active-only
`pet://sessions` payload.

## Compatibility

Existing clients can ignore the extra behavior because the event payload is
unchanged. If the list page lacks cached folder or tab snapshots, the event is
skipped and the normal page-show or pull-refresh path still works.

## Native iOS/Android Replication

Native clients should subscribe to `pet://sessions` per instance, update badges
from the payload, and debounce an authoritative conversation-list refresh per
instance. Do not infer terminal card status from `pet://sessions` alone because
finished sessions disappear from the active-session payload.
```

- [ ] **Step 2: Run targeted tests**

Run from `mcode-app`:

```bash
pnpm test:unit -- tests/services/tabbarActiveSessions.spec.ts tests/services/conversationOverviewSnapshot.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Inspect final diff**

Run:

```bash
git diff -- mcode-app/src/pages/conversations/index.vue docs/mcode-architecture-notes/2026-07-12-p68-conversation-list-realtime-refresh.md
```

Expected: only P68 list refresh code and the P68 architecture note are changed.
