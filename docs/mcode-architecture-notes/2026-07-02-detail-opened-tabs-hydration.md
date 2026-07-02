# Detail Opened Tabs Hydration

## Architecture

- The mcode detail page mirrors Codeg desktop's `opened_tabs` as a read model for
  its top tab strip.
- Opening or refreshing a detail route is not a user intent to open a new desktop
  tab. Detail initialization therefore reads the remote tab snapshot but does
  not append the route conversation to `opened_tabs`.
- Remote tab writes remain reserved for explicit actions: create conversation,
  close a tab, switch an existing detail tab, or send a prompt that needs the
  conversation present on the desktop side.

## Data Flow

- `initializeDetailTabsShell()` subscribes to `tabs://changed`, applies cached
  snapshots if available, then calls `list_opened_tabs`.
- The response is normalized and stored in the local realtime cache through
  `applyDetailOpenedTabsState()`.
- The initialization path no longer calls `ensureConversationTab()`, so it cannot
  create an extra `opened_tabs` row using the detail page's pre-hydration default
  agent type.

## UI Behavior

- If Codeg desktop and mcode-app both have two opened tabs, opening or refreshing
  the mcode detail page keeps the mirrored tab count at two.
- A detail page can still show its temporary fallback tab before the remote
  snapshot hydrates, but that fallback is local-only and is not broadcast.
- This prevents desktop from receiving an unexpected tab with a default
  `claude_code` agent type for a conversation that actually belongs to another
  agent.

## Compatibility

- No backend protocol, database, or `opened_tabs` schema change is required.
- Older clients may still append route conversations during detail hydration.
  Current clients treat incoming snapshots as authoritative and will reconcile
  after those clients close or rewrite the extra tab.

## Native iOS/Android Guidance

- On detail screen mount/resume, only read and subscribe to `opened_tabs`.
- Do not write `save_opened_tabs` from passive lifecycle events.
- When a prompt is sent from a detail screen whose conversation is absent from
  `opened_tabs`, native clients may append it at that moment using the
  conversation's persisted/remote `agent_type`, not a default agent fallback.
