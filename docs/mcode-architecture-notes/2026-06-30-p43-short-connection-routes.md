# P43 Short Connection Routes

## Architecture

MCode app now assigns every v2 connection a local stable `ConnectionRecordV2.id`. The id is generated and persisted when stored connections are read if an existing v2 record is missing it. The id is a local routing reference only; it is not a remote identity and must not be treated as portable across devices.

New page navigation passes `connectionId=<local-id>` instead of embedding an encoded connection JSON payload. Destination pages resolve the full connection from the local `mcode_connections` store before connecting to Codeg, OpenCode, or MCode Desktop.

## Data Flow

1. Home/connection storage normalizes v2 connection records and writes back missing local ids.
2. Connection-scoped pages receive `connectionId` in the route query.
3. The destination page reads `mcode_connections`, finds the matching local id, and rebuilds the runtime connection context locally.
4. Existing encoded `connection` or `connectionKey` route parameters are accepted only as temporary fallback for already-open pages and old in-flight links.

The new generated routes must not include `directToken`, `pairSecret`, `gatewaySession.accessToken`, `gatewaySession.refreshToken`, or full connection JSON.

## UI Behavior

Connection actions, project lists, session lists, conversation detail, git pages, agent settings, model provider settings, todo-created conversations, and conversation history navigation should use short `connectionId` routes. Users should see shorter URLs, and sensitive connection material should no longer appear in browser address bars or route logs.

If `connectionId` cannot be resolved, destination pages may fall back to the old encoded route payload during the transition. New UI code should not generate those old payloads.

## Compatibility

P43 does not migrate connections to SQLite. The only storage change is adding local `id` fields to v2 records already stored in `mcode_connections`.

P42 remains in force: legacy v1 compatibility is removed except for the homepage old-connection migration. P43 does not reintroduce v1 route or storage parsing.

Config codes intentionally omit the local `id` field so importing a code on another device creates or normalizes a separate local connection identity.

## Native iOS/Android Guidance

Native clients should maintain a local connection table with a stable per-device id for each v2 connection. Routes, deep links, and internal navigation should pass only this local id, then resolve secrets from local encrypted storage before connecting.

Native clients may temporarily accept old encoded connection route payloads for compatibility, but all newly generated navigation must use local ids. Export/share flows must strip local ids and must never place tokens or pair secrets in URLs.
