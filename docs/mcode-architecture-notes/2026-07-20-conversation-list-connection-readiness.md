# Conversation List Connection Readiness

## Architecture

The `mcode-app` conversation list no longer assumes the connections page has
already restored the active remote context. On page show and pull refresh, the
list first prepares saved connections that are still marked linked in
`mcode_connected_map`. Preparation resolves each connection through the normal
driver path, refreshes/persists any recovered connection context, and registers
its remote instance descriptor before overview data or live previews load.

## Protocol And Data Flow

No backend protocol changes are introduced. ACP request helpers now accept an
optional `instanceKey`; when present, the client sends the command through the
registered remote descriptor instead of the global `auth.gateway()`. Runtime
conversation recovery uses that instance-scoped path for connection discovery,
session snapshot lookup, and new `acp_connect` calls.

The list still respects `mcode_connected_map` as user intent. It prunes stale
keys that no longer match saved connections, but it does not automatically
reconnect a connection the user explicitly disconnected.

## UI Behavior

Opening the conversation tab from a cold H5 session can restore linked
connections and then load the grouped conversation overview without requiring a
manual visit to the connections tab. Live-preview reconciliation is scheduled
after that preparation finishes, so preview ACP connections are not created
against a stale global remote context.

`pet://sessions` continues to update the tabbar badge while subscribed, but
overview refresh timers are only scheduled while the conversation list is
visible. Pending list-refresh timers are cleared on page hide.

## Compatibility

Existing stored connections, `mcode_connected_map`, SQLite summaries, and ACP
payloads remain compatible. Calls that omit `instanceKey` keep the old global
auth behavior.

## Native iOS/Android Replication

Native clients should restore previously linked connections before rendering the
conversation overview. Keep "linked by user" separate from transient reachability
state, prune linked records that no longer match saved connections, and route
per-conversation ACP recovery commands by explicit connection/instance identity
rather than a process-wide current connection. Do not start list live-preview
subscriptions until that routing context is ready, and do not run expensive
overview refreshes while the list screen is backgrounded.
