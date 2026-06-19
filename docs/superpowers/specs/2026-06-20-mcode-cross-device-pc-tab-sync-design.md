# mcode Cross-Device PC Tab Sync Design

## Goal

Upgrade `mcode-app` so mobile actions can coordinate the remote `codeg-main`
workspace tab state without modifying `codeg-main`.

This design targets three outcomes:

1. Creating a conversation in `mcode-app` creates or reuses the matching PC tab.
2. Sending a message to an existing historical conversation in `mcode-app`
   creates or reuses the matching PC tab before the turn runs.
3. Conversation detail in `mcode-app` treats realtime runtime as the authority,
   reducing desync between live state and fallback detail fetches.

## Constraints

1. Do not modify `codeg-main`.
2. Reuse existing remote APIs and event channels:
   `list_opened_tabs`, `save_opened_tabs`, `tabs://changed`,
   `conversation://changed`, attach-based realtime transport, and existing
   conversation detail RPCs.
3. Preserve the current mobile-first local cache model:
   SQLite remains the primary source for persisted conversation summaries and
   history.
4. PC focus policy is `conditional activation`:
   mobile should open or reuse the PC tab, but only activate it when doing so
   does not likely interrupt an in-progress PC draft flow.

## Current Problems

### 1. `opened_tabs` is treated as display-only in `mcode-app`

The conversations page reads remote opened tabs to show which PC sessions are
live, but mobile actions do not write the same state back to the remote
workspace. This causes:

1. New mobile-created conversations to exist remotely without a corresponding PC
   tab.
2. Historical mobile conversations to start running while PC still has no tab
   for that conversation.
3. Mobile and PC to drift on which conversation is considered "open now".

### 2. `mcode-app` currently underuses the remote tab protocol

`codeg-main` already provides the correct primitives:

1. `list_opened_tabs` returns `{ items, version }`.
2. `save_opened_tabs` accepts compare-and-set via `expectedVersion`.
3. `tabs://changed` broadcasts the canonical full snapshot after accepted
   mutations.

Today `mcode-app` reads opened tabs loosely for overview UI, but it does not
build an instance-scoped cache or use the versioned save path as a true
cross-device state machine.

### 3. Detail runtime authority is still too page-shaped

`mcode-app` already has:

1. attach-based realtime transport per remote instance,
2. a `connectionSessionManager`,
3. local runtime persistence,
4. fallback detail calibration.

But detail correctness still degrades because page entry, page exit, fallback
detail fetch, and replay-gap reconciliation can all contend for ownership of
the same conversation state. The result is familiar:

1. page leave and re-enter can feel like runtime was partially rebuilt,
2. remote detail can overwrite newer live state,
3. summary and detail can disagree briefly after mobile-triggered turns.

## Recommended Approach

Implement three new `mcode-app` modules and route all cross-device session
coordination through them.

1. `pcTabSyncService`
2. `openedTabsRealtimeCache`
3. `hotConversationCoordinator`

This is the smallest design that solves the full problem without changing
remote server behavior.

## Architecture

### 1. `openedTabsRealtimeCache`

Purpose: maintain the authoritative remote PC tab snapshot per `instanceKey`.

Responsibilities:

1. Subscribe to `tabs://changed` once per remote instance.
2. Store the latest canonical:
   `version`, `items`, `updatedAt`, and `lastOrigin`.
3. Expose synchronous reads so pages and orchestration services can answer:
   "does this conversation already have a PC tab?" and
   "which tab is active on PC right now?" without issuing ad hoc RPCs.
4. Recover by calling `list_opened_tabs` when:
   - cache is cold,
   - reconnect happened,
   - a save CAS was rejected,
   - an event sequence is suspected stale.

Stored shape:

```ts
interface OpenedTabsSnapshotCache {
  instanceKey: string
  version: number
  items: OpenedTab[]
  updatedAt: number
  lastOrigin: string | null
}
```

Notes:

1. This cache is in-memory only. It mirrors server truth and can be rebuilt at
   any time from `list_opened_tabs`.
2. It does not replace SQLite. It only tracks remote workspace tab state.

### 2. `pcTabSyncService`

Purpose: provide the only write path from `mcode-app` into remote PC
`opened_tabs`.

Responsibilities:

1. Load the latest opened-tab snapshot from `openedTabsRealtimeCache`.
2. Build a merged tab payload for a target conversation.
3. Apply `conditional activation` policy.
4. Save through `save_opened_tabs(items, expectedVersion, origin)`.
5. Handle CAS rejection by merging against the returned canonical snapshot and
   retrying.

Public operations:

```ts
ensureConversationTab(input)
setConversationActive(input)
syncFromRemote(instanceKey)
applyRemoteSnapshot(instanceKey, snapshot)
```

`ensureConversationTab(input)` rules:

1. If the conversation already exists in remote opened tabs, reuse it.
2. If it does not exist, append a new conversation-bound tab row.
3. Preserve existing tab order except for the inserted row.
4. Preserve pinned state on existing rows.
5. Never attempt to represent a draft tab from mobile. Mobile only writes
   conversation-bound tabs because draft tabs are intentionally device-local on
   the PC side.

### 3. `hotConversationCoordinator`

Purpose: separate runtime lifetime from page lifetime.

Responsibilities:

1. Decide whether a conversation should remain hot in memory.
2. Keep attach subscriptions alive while a conversation is operationally
   relevant even if the detail page is not mounted.
3. Expose a unified reason set for why a conversation is still hot.
4. Sweep stale idle conversations with LRU rules only after they are no longer
   needed by mobile or by cross-device coordination.

Hot reasons:

1. detail page currently mounted,
2. mobile just created the conversation,
3. mobile just sent a prompt and the turn is still active,
4. runtime currently indicates in-progress state,
5. a known `connectionId` is bound and recently touched,
6. the conversation appears in remote PC `opened_tabs`.

This makes "open on PC" itself a signal that the mobile side should avoid
eagerly tearing down the runtime.

## Data Flow

### Flow 1: Mobile creates a new conversation

1. Mobile calls existing `create_conversation`.
2. Mobile persists or seeds local summary/runtime as it does today.
3. Mobile binds or discovers the runtime connection as soon as available.
4. Mobile calls `pcTabSyncService.ensureConversationTab(...)`.
5. The service:
   - loads current remote tab snapshot,
   - inserts or reuses the target conversation tab,
   - decides whether to mark it active,
   - writes back with CAS.
6. Remote `codeg-main` broadcasts `tabs://changed`.
7. `openedTabsRealtimeCache` updates from that event.
8. PC reacts natively through its existing `TabProvider`.

Result:

1. The PC gets the new tab quickly.
2. The mobile side does not depend on a separate custom remote command.
3. No server change is needed.

### Flow 2: Mobile sends to an existing historical conversation

1. Before `acp_prompt`, mobile ensures the conversation has a runtime binding:
   `find -> adopt -> connect` using existing logic.
2. Before sending the prompt, mobile calls
   `pcTabSyncService.ensureConversationTab(...)`.
3. If activation is allowed, the target tab is marked active.
4. Mobile sends the prompt.
5. Runtime stream becomes authoritative immediately.
6. `conversation://changed` and local runtime updates keep overview and detail
   aligned.

Result:

1. PC has the tab before the first streamed output arrives.
2. The user does not see a late-created tab after the turn is already running.

### Flow 3: Reconnect or missed remote tab event

1. Transport reconnect or bridge health degradation triggers
   `openedTabsRealtimeCache.syncFromRemote(instanceKey)`.
2. Cache replaces local tab snapshot using `list_opened_tabs`.
3. `pcTabSyncService` uses the refreshed version for future saves.

Result:

1. Mobile avoids accumulating stale versions.
2. CAS retries converge on server truth.

## Conditional Activation Policy

Because `codeg-main` draft tabs are not persisted into `opened_tabs`, mobile
cannot perfectly know whether PC is currently focused on a draft. Without
server changes, the policy must be conservative.

Activation rule:

1. If the target conversation is already the active persisted tab, do nothing.
2. If there is no active persisted tab, activate the target conversation tab.
3. If the active persisted tab is another conversation tab, activation is
   allowed.
4. If the remote state looks ambiguous because no active persisted tab exists
   but other conversation tabs do, default to background-open only.

Interpretation:

1. Mobile always ensures the target PC tab exists.
2. Mobile activates only when the persisted snapshot indicates this is unlikely
   to interrupt a PC-local draft workflow.

This rule is intentionally asymmetric:

1. correctness of "tab exists" is strong,
2. correctness of "steal focus" is conservative.

## Detail Runtime Authority

### Authority Layers

1. `attach stream + hot runtime session` is the authority for live turn state.
2. SQLite is the authority for durable completed history already persisted.
3. `get_folder_conversation` is fallback calibration only.

### Required Rules

1. If runtime has `liveMessage`, `pendingPermission`, `pendingQuestion`, or an
   in-progress status, remote detail fetch must not overwrite those fields.
2. `turn_complete` must not trigger a full remote-detail overwrite path for the
   active runtime session.
3. Replay-gap and cold-start calibration may add missing durable turns, summary
   metadata, or connection reconciliation, but they must not replace newer live
   runtime state.
4. Page mount should restore in this order:
   - hot runtime,
   - local SQLite history/runtime,
   - remote calibration only if needed.

### Practical Effect

This removes the current "page fetch versus live stream" race:

1. mobile-triggered turns no longer depend on a post-send detail refresh to
   look correct,
2. detail re-entry becomes restore-first instead of fetch-first,
3. PC tab presence becomes another signal to keep the same conversation runtime
   hot rather than rebuilding it repeatedly.

## Required Changes In Existing Mobile Behavior

### 1. Fix opened-tab snapshot parsing

Current `mcode-app` conversations overview treats `list_opened_tabs` as if it
returned a plain array. The real payload is `OpenedTabsSnapshot`:

```ts
{
  items: OpenedTab[]
  version: number
}
```

This must be corrected before any reliable CAS-based sync is possible.

### 2. Promote remote tab state to first-class instance state

The mobile app must stop treating opened tabs as one-off overview fetch data.
They become shared per-instance coordination state.

### 3. Route all PC-tab-affecting actions through one service

These entry points must no longer hand-roll behavior:

1. create conversation success path,
2. open historical conversation and send path,
3. any future "resume from notification" flow,
4. any future "open same session on desktop" action.

## Error Handling

### CAS save rejected

1. Accept the server-returned `tabs/version`.
2. Merge the intended target conversation tab into that canonical snapshot.
3. Retry once.
4. If retry still fails, abandon activation but keep local runtime flow alive.

Failure impact:

1. Mobile send/create still proceeds.
2. PC tab may lag briefly, but the app will recover on the next sync cycle.

### `tabs://changed` unavailable

1. Keep local cache cold.
2. Fall back to `list_opened_tabs` before each write operation.
3. On reconnect, immediately resync.

### Remote write succeeds but local cache is stale

1. Trust the returned `SaveTabsOutcome.version` and `tabs`.
2. Replace cache state immediately from the save result.

### Runtime/detail conflict

1. If live runtime is active, suppress destructive calibration writes.
2. Log calibration skip reasons so debugging remains possible.

## Testing

### Unit tests

1. `pcTabSyncService`
   - inserts missing conversation tab,
   - reuses existing conversation tab,
   - conditionally activates or background-opens,
   - retries correctly on CAS rejection,
   - preserves unrelated tab order and pin state.
2. `openedTabsRealtimeCache`
   - applies `tabs://changed`,
   - ignores stale versions,
   - resyncs after reconnect.
3. `hotConversationCoordinator`
   - keeps conversations hot while remote PC tab exists,
   - releases idle sessions after timeout,
   - does not tear down active in-progress sessions.
4. detail authority tests
   - calibration cannot overwrite active live runtime,
   - replay-gap can append durable turns without clearing live state.

### Integration tests

1. Mobile create conversation -> remote tab snapshot contains the new
   conversation.
2. Mobile send to history conversation -> remote tab exists before the turn is
   marked running.
3. Rejected save path -> mobile converges after retry.
4. Detail page leave/re-enter during active streaming -> live content survives.

## Compatibility

1. Fully compatible with current `codeg-main` because it uses existing APIs only.
2. Safe for older servers as long as they already provide:
   `list_opened_tabs`, `save_opened_tabs`, and `tabs://changed`.
3. If `tabs://changed` is missing or unreliable in some environments, the
   design degrades to snapshot-before-write behavior.

## Native Replication Guidance

For a native iOS or Android client, replicate the same three layers:

1. an instance-scoped remote opened-tab cache,
2. a single write service for remote PC tab coordination,
3. a hot conversation coordinator that owns runtime lifetime independently from
   the screen lifecycle.

Do not model PC drafts on mobile. Only coordinate persisted conversation tabs.
Treat the attach stream as the sole live authority and remote detail fetch as
fallback calibration.

## Scope

Included:

1. mobile-side PC tab coordination,
2. mobile-side opened-tab cache and event subscription,
3. mobile-side runtime lifetime reorganization,
4. detail authority fixes that prevent realtime/fallback conflicts.

Excluded:

1. any `codeg-main` API change,
2. any new remote endpoint,
3. any attempt to make mobile perfectly aware of PC draft tabs,
4. any redesign of the PC tab UI itself.
