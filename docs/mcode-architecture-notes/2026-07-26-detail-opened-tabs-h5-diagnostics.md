# Detail Opened-Tabs H5 Diagnostics

## Scope

This change adds H5-only browser-console diagnostics for the conversation
detail PC-synced tab shell. It does not change tab synchronization, navigation,
or message rendering behavior.

## Architecture And Data Flow

`conversation-detail/index.vue` now emits structured
`[conversation-detail-tabs-debug]` records at the boundaries where an
`opened_tabs` snapshot can change the rendered shell:

- receipt of `tabs://changed` and its normalized version, origin, instance key,
  and conversation IDs;
- cache and remote `list_opened_tabs` hydration;
- before and after `applyDetailOpenedTabsState`, including shell IDs, mounted
  IDs, active index, and whether the routed conversation remains in the shell;
- reconciliation and watcher paths when the routed conversation is absent, or
  when the shell is empty.

The pure helper `buildDetailTabsDiagnosticSnapshot` owns the normalized shell
and mounted-state summary. It intentionally exposes only tab/conversation IDs
and synchronization metadata, never message content, prompts, tokens, or
credentials.

## UI Behavior

The logs are compiled only for H5 via uni-app conditional compilation and are
silent by default. Enable both `[conversation-detail-debug]` and
`[conversation-detail-tabs-debug]` records by adding
`mcode_detail_debug=1` (or `true`) to either the browser query string or the
uni-app Hash route query, for example:

`http://localhost:18888/?mcode_detail_debug=1#/pages/conversation-detail/index`

They have no visible UI, state, timing, or navigation effect. Native app and
mini-program builds retain a no-op helper.

## Compatibility

No ACP command, event payload, database schema, local storage format, or Codeg
behavior changes. Existing `tabs://changed` payloads remain unchanged. A single
pure-function Jest test protects the diagnostic condition where the routed
conversation has been removed from the synced shell and mounted set.

## Native iOS/Android Replication Guidance

Native clients investigating the same issue should log the same boundary data:
remote instance identity, snapshot version/origin, incoming conversation IDs,
current route conversation ID, rendered shell IDs, mounted page IDs, active tab
identity, and whether the route conversation is absent after application. Keep
this telemetry local and exclude message bodies and authentication material.
