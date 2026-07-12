# P69 Detail Connecting Dedupe

## Architecture

MCode App now dedupes conversation detail runtime connects inside the Pinia
conversation runtime store. The detail page still reads `runtimeStatus` from the
runtime session and shows the existing `正在连接智能体...` blocker only when that
status is `connecting`.

## Protocol And Data Flow

No ACP protocol, gateway command, database schema, or payload changes are
required.

When `runtime.connect(conversationId, ...)` is called, the runtime first checks
for an existing managed conversation connection. If one exists, the runtime binds
`session.connectionId`, `session.instanceKey`, and the connection info map, then
attaches realtime without setting the session to `connecting`.

If no managed connection exists, the runtime reuses any in-flight connect promise
for the same `conversationId`. Only the first caller performs discovery,
snapshot adoption, new connection creation, realtime attach, and the visible
`connecting` transition.

## UI Behavior

The detail blocker remains unchanged for real first-time or recovery
connections. It no longer flashes for ordinary refresh, foreground resume,
mounted-tab hydration, or tab switching when the connection is already known.

Connection failures continue to move the runtime session to `error`, which lets
the existing error feedback replace the connecting blocker.

## Compatibility

The change is app-local and backward compatible with existing desktop hosts and
gateways. Older native clients can keep their current behavior, but may show
more frequent connecting indicators until they adopt the same runtime rule.

## Native iOS/Android Replication Guidance

Native clients should key in-flight connect requests by conversation id. Before
showing a blocking connecting state, check whether a live managed connection is
already bound for that conversation. Rebinding an existing connection should
reattach realtime streams without presenting a connecting blocker. A new or
failed recovery handshake may still surface the blocking connecting affordance.
