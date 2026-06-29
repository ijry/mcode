# 2026-06-29 P42 V2-Only Connection Protocol

## Architecture

P42 removes v1 connection-compatibility code from `mcode-app` runtime paths and
from `mcode-relay` protocol restore paths. The product connection model is now
v2-only:

- `targetAgent = codeg | opencode | mcode-desktop`
- `routeMode = direct | gateway`
- `gatewayProvider = official | custom`
- direct connections use `directBaseUrl` and optional `directToken`
- gateway connections use `gatewayBaseUrl`, `gatewaySession`, optional
  `pairCode/pairSecret`, and optional `targetProfile`

The only allowed v1 handling in `mcode-app` is the connection homepage startup
call to `migrateLegacyStoredConnectionsToV2()`. That one-shot migration reads
local `mcode_connections` records shaped like old `{ mode, url, directToken,
relaySession }`, converts them to Codeg v2 records, writes the v2 array back,
and drops invalid entries. No other app page, service, driver, config-code
parser, or detail resolver may parse v1 connection records.

## Protocol And Data Flow

App-side v2-only behavior:

- `connectionSchema` normalizes only `ConnectionRecordV2`.
- `connectionContext` reads stored connections as v2 records and builds only
  v2 keys: `targetAgent::routeMode::routeIdentity`.
- Config-code import rejects v1 direct/relay payloads instead of migrating them.
- Conversation/detail resolution rejects old `{ mode, url }` stored connection
  shapes outside the homepage migration boundary.
- Gateway pair responses must include `targetAgent`; missing `targetAgent`
  is treated as an obsolete gateway response and pairing fails.

Relay-side v2-only behavior:

- `desktop_hello` and `pair_offer` frames must include `targetAgent` and
  `protocolVersion`.
- `PairingStore.addOffer()` and `upsertTarget()` require `protocolVersion`;
  the relay no longer supplies `codeg` or protocol `1` defaults.
- Persisted target snapshots missing `targetAgent` or `protocolVersion` are
  dropped during restore.
- Restored sessions and audit events are kept only when they reference restored
  v2 targets/sessions; orphan records from dropped v1 targets are ignored.

## UI Behavior

The connection homepage remains the migration boundary because it is the first
place users expect connection state to be repaired. After migration, the list
renders normal v2 cards and saves only v2 records.

All other UI surfaces assume v2 data:

- connection cards, conversations, todos, targets, and conversation detail use
  v2 connection keys only
- old connected-map keys such as `relay::https://...` are not recognized
- v1 QR/config codes show an unsupported-content error
- users with old local connections should enter the connection homepage once,
  then reconnect so connected-map state is regenerated with v2 keys

## Compatibility

This is intentionally not a broad backward-compatibility phase. P42 keeps only
one local safety valve: homepage old-connection auto-conversion. It does not
keep runtime aliases for `mode`, `url`, `relaySession`, `targetType`, legacy
pair responses, or relay target snapshots.

The reason is multi-agent gateway correctness. A single gateway can expose
Codeg, OpenCode, and MCode Desktop at the same time; legacy keys and inferred
defaults collapse those targets into the same route and can send commands to
the wrong agent.

## Native iOS/Android Replication Guidance

Native clients should copy the v2-only model. Implement at most one local
startup/homepage migration for old saved connections, then persist v2 records
and remove old fields from normal code paths.

Native clients must not:

- import v1 config codes
- match connected state using `direct::url` or `relay::url`
- infer missing target agent as Codeg
- infer missing relay protocol version as `1`
- keep old `relaySession` fields separate from v2 `gatewaySession`

Native relay or desktop implementations must send `targetAgent` and
`protocolVersion` on every `desktop_hello` and `pair_offer` frame.
