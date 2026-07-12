# Detail Tabs: No Cross-Device Auto-Switch On Opened-Tabs Broadcast

## Scope

Fixes a `mcode-app` conversation-detail case where, while the user was simply
sitting on the detail page (no interaction), the whole page suddenly reloaded and
the active tab jumped to a different conversation. Reproduced by: creating a new
conversation on the desktop client while the phone client is parked on a detail
page.

## Root Cause

Opened tabs are synced cross-device. When the desktop creates a conversation it
emits an `opened-tabs-changed` broadcast. The detail page subscribes to it
(`ensureDetailOpenedTabsSubscription`) and, on every event, rebuilds the tab
shell and calls `reconcileDetailShellFromOpenedTabs()`.

That function chose the active tab via
`resolveDetailActiveTabIndex({ preferredConversationId: conversationId.value, currentIndex })`.
When the broadcast tab list did not contain the phone's currently-open
conversation (the desktop's tab set differs), the preferred lookup missed and it
fell back to an index-based pick — landing on a different conversation and
triggering `switchToDetailTab` → `loadConversation()`. Result: the phone got
pulled off the conversation it was viewing and did a full reload.

## Fix

`reconcileDetailShellFromOpenedTabs` now pins to the current conversation on the
event-driven path:

- If there is a current conversation (`conversationId.value > 0`):
  - It is still in the new tab list → select that index and return. Never switch
    because a remote `is_active` flag changed.
  - It is no longer in the list (e.g. closed elsewhere) → on the event-driven
    path (`loadConversation` not explicitly false) keep the current view; do not
    auto-switch/reload.
- Only when there is no current conversation does it fall back to the
  index-based `resolveDetailActiveTabIndex` selection, and even then the initial
  hydration path (`loadConversation: false`) only selects without reloading.

The index-based fallback and the empty-list back-navigation are unchanged.

## UI Behavior

Sitting on a detail page no longer causes an unsolicited tab jump or page reload
when another device adds, removes, or re-activates tabs. Explicit user tab
switches (`switchToDetailTab` from a tap) are unaffected. The tab strip still
updates to reflect the new list; only the automatic active-tab switch is
suppressed.

## Compatibility

No protocol, schema, or event payload change. Purely a client-side guard in the
detail shell reconciliation.

## Native iOS/Android Replication Guidance

- Treat an incoming opened-tabs broadcast as a list update, not a command to
  change which conversation is on screen.
- Keep the local view pinned to the currently-open conversation whenever it is
  still present in the new list, regardless of the remote active flag.
- Only fall back to an index/active-based selection when there is no
  currently-open conversation locally (e.g. cold shell hydration), and in that
  case select without forcing a reload.
- A remote device's "active tab" is that device's state; do not let it drive
  navigation on this device.
