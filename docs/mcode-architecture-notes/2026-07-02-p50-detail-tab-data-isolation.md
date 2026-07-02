# 2026-07-02 P50 Detail Tab Data Isolation

## Architecture

Conversation detail keeps the P44 multi-tab shell and one
`ConversationDetailInteractivePane` per mounted tab. P50 tightens the data
ownership contract: every asynchronous hydrate, reconcile, snapshot, and DB
refresh operation captures the target `conversationId`, `folderId`, and
`instanceKey` at launch time.

Late async results may update the runtime session for their captured
conversation, but they must not update parent shell UI state after the user has
switched to another tab. Parent shell UI state includes title, active agent
type, draft restore, scroll restore, slash commands, loading indicators, and
runtime persistence for the currently visible tab.

The shell also treats tab selection and active conversation hydration as two
separate states. A user can select a tab while the previous tab is still
loading; that selected tab remains queued until the old load releases the
switch lock, then the shell must still update the global active
`conversationId`. Parent-owned draft and scroll state are saved against the
currently hydrated conversation, not merely the currently selected tab index.

## Protocol And Data Flow

No backend, ACP, opened-tabs, SQLite schema, or realtime protocol changes.

The detail page still loads each tab through:

1. local summary/runtime/turn hydrate
2. optional remote conversation detail reconcile
3. runtime `connect`
4. live snapshot hydrate

Each step writes to `conversationRuntime` using the captured
`targetConversationId`. Before mutating active shell state, the page verifies
that the captured `conversationId`, `folderId`, and `instanceKey` still match
the current active tab.

Realtime bindings now dispatch events to the runtime store with the binding's
`conversationId`. The store no longer has to infer the destination session from
`connectionId` for bound realtime events, avoiding ambiguous routing when
multiple mounted tabs observe live sessions through overlapping connection ids.

## UI Behavior

When users switch quickly across many tabs, a slow response from an older tab
can still hydrate that older tab's runtime cache. It cannot replace the visible
tab's messages, title, scroll position, draft, pending cards, or loading state.

Mounted inactive tabs continue receiving live updates through their own runtime
sessions, so revisiting a tab shows its latest data without rebuilding the
current active pane.

If a user taps a new tab while the old tab is still loading, the tab pill and
swiper can move immediately, but the detail shell must complete the queued
hydration before parent-owned composer, title, and scroll state are considered
current for that tab.

## Compatibility

The fix is compatible with existing cached runtime records and opened tab
snapshots. It only scopes client-side async writes. Existing manual calls to
`runtime.handleEvent(event)` still work and retain the legacy connection-id
fallback; realtime attachments use the stricter conversation-bound entrypoint.

## Native iOS/Android Replication

Native clients should treat every page load task as target-scoped. Capture the
tab's conversation id before starting local DB reads, remote detail fetches,
session attach, and snapshot fetch. On completion:

- write message/runtime data only to that captured conversation store
- update visible navigation, composer, and scroll state only if the captured
  tab is still active
- route realtime subscription callbacks by the page/controller's conversation
  id, not by scanning sessions for a matching connection id
- keep selected tab index separate from the hydrated conversation id when a
  page switch is queued behind an in-flight load
