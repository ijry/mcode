# P35 Tunnel Service Discovery Design

## Goal

P35 closes the user-facing loop for MCode Desktop local services. The app should
discover the services exposed by the paired desktop, show them as remote service
entries, and open HTTP tunnel URLs through relay without turning the app into a
gateway administration console.

## Scope

- Add local service metadata to desktop upstream registration and pair offers.
- Persist safe local service metadata on relay targets.
- Add a session-authenticated service discovery endpoint for the current paired
  target.
- Add mcode-app helpers and target-page UI for service entries.
- Do not add relay admin UI in P35. Relay Web admin is P36.
- Do not expose arbitrary host access; services remain loopback-only desktop
  configs.

## Service Model

Desktop local services are already configured as:

- `name`
- `host`
- `port`
- `protocol`: `http | tcp`
- `enabled`

Relay stores and returns only this safe metadata. It does not store request
bodies, credentials, or live TCP data. The only allowed host remains
`127.0.0.1`.

## Data Flow

1. MCode Desktop includes `localServices` in `desktop_hello` and `pair_offer`.
2. Relay normalizes services, keeps enabled/disabled status, and persists them
   with the target record.
3. MCode app calls `GET /v1/target-services` with the normal paired session
   access token.
4. Relay returns services for the token's current target only.
5. App builds HTTP tunnel entries with
   `/v1/tunnel/:targetId/:port/*` and the paired access token.
6. TCP services are listed as available but do not get a generic open action in
   P35.

## UI Behavior

The app target page should show a desktop service section for `targetAgent =
mcode-desktop` gateway connections:

- service name
- protocol
- loopback bind such as `127.0.0.1:1080`
- enabled/disabled state
- HTTP open action when service is enabled and tunnel URL can be built
- TCP informational state

The main conversation list remains focused on AI control and is not modified.

## Compatibility

- Older desktop clients that do not send `localServices` simply return an empty
  service list.
- Older app clients continue to use existing tunnel URLs if they know the port.
- Existing pairing, proxy, event, HTTP tunnel, and TCP tunnel protocols remain
  backward compatible because `localServices` is an additive metadata field.

## Native Client Replication Guidance

Native iOS and Android clients should implement the same session-authenticated
service discovery request and build HTTP tunnel links from relay base URL,
target id, and service port. They must not connect directly to desktop loopback
addresses from QR payloads or service metadata.
