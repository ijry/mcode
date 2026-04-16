# MCode Channel + Relay + Mobile Client Design

**Date:** 2026-04-16  
**Status:** Approved for planning  
**Owner:** mcode team

## 1. Context and Goals

The project needs a new `MCode` channel in `codeg-main` with minimal intrusion, so upstream `codeg-main` updates can be merged with low conflict risk.  
At the same time, we need:

1. A standalone relay service for NAT traversal and remote mobile access.
2. A new `MCode` mobile client built with `uni-app + uview-plus`.
3. Two access modes in the mobile client:
   - `relay` mode (default)
   - `direct` mode (directly connecting to `codeg-main` web service)

The first release must include a complete remote control loop:

- Pairing code / secret
- Target connection
- Project list
- Session list
- Session detail interaction
- Permission approval
- Stop/cancel task
- Reconnection handling

## 2. Scope and Non-Goals

### In Scope

1. `codeg-main` minimal extensions for `mcode` channel registration and config management.
2. `mcode-relay` standalone backend service with pairing, session auth, proxy, and WS event forwarding.
3. `MCode` app (uni-app + uview-plus), supporting H5 + App + WeChat mini-program.
4. Full relay/direct dual-mode behavior in MCode with shared business flows.

### Non-Goals (Phase 1)

1. Replacing existing Telegram/Lark/Weixin channel behavior.
2. Large refactors in `codeg-main` ACP, session, or web core modules.
3. Multi-tenant enterprise RBAC model in relay.
4. Extra channels beyond `mcode`.

## 3. Architecture Decision (Approved Option A)

Adopt **external relay + minimal `codeg-main` changes**.

### Components

1. `codeg-main`:
   - Remains source of truth for sessions and commands.
   - Exposes existing `/api/*` and `/ws/events`.
   - Adds `mcode` channel type and config surface only.

2. `mcode-relay` (new standalone service):
   - Public entrypoint for mobile clients.
   - Handles pairing and auth session lifecycle.
   - Bridges mobile requests/events to desktop-connected targets.

3. `MCode` (new uni-app client):
   - Mobile control plane.
   - Supports both `relay` and `direct` connectivity.

## 4. Minimal-Intrusion Boundaries in `codeg-main`

### 4.1 Channel Type Extension

Extend existing channel type model:

- Add `ChannelType::Mcode` in Rust channel type enum.
- Add `mcode` in frontend `ChannelType` union.

### 4.2 Config Model

Reuse existing `chat_channel.config_json`; no DB schema changes required for phase 1.

`mcode` config fields:

- `connection_mode`: `relay | direct`
- `relay_url` (for relay mode)
- `direct_base_url` (for direct mode)
- `relay_target_id` (optional)
- `display_name` (optional)

Secrets continue to use existing keyring token storage.

### 4.3 Backend Integration

Add `backends/mcode.rs` and one factory match branch only.

Behavior:

1. `relay` mode: maintain outbound WS tunnel to relay.
2. `direct` mode: no relay tunnel; perform direct connectivity checks.
3. `test_connection`:
   - relay mode: relay handshake check
   - direct mode: `POST /api/health` on `direct_base_url`

Keep all existing Telegram/Lark/Weixin behavior unchanged.

### 4.4 Frontend Settings Integration

Update add/edit channel dialogs:

- Add `mcode` option.
- Add mode selector and corresponding fields.
- Keep existing channel list interactions and status display.

## 5. Relay Service Design (`mcode-relay`)

### 5.1 Deployment Strategy

Support both:

1. User self-hosted relay
2. Official hosted relay

### 5.2 Public API (Phase 1)

1. `POST /v1/pair`  
   Input: pairing code + pairing secret + target hint  
   Output: access token + refresh token + target info

2. `POST /v1/session/refresh`  
   Refresh access token by refresh token.

3. `GET /v1/targets`  
   List paired targets and online status.

4. `POST /v1/proxy/{command}`  
   Proxy command to target `codeg-main /api/{command}`.

5. `GET /v1/events` (WebSocket)  
   Forward target event stream to mobile.

6. `POST /v1/mode/switch`  
   Save client-side preferred mode metadata.

### 5.3 Desktop Tunnel Protocol (WS)

Message families:

1. `desktop_hello`
2. `desktop_heartbeat`
3. `pair_offer`
4. `proxy_request`
5. `proxy_response`
6. `event_push`

### 5.4 Reliability

1. Heartbeat both directions.
2. Exponential backoff reconnect for desktop tunnel and mobile WS.
3. Session resume where possible after transient disconnect.
4. Target online/offline status broadcast to clients.

## 6. Security Model

### 6.1 Relay Mode (Default)

1. Mobile does not receive raw `codeg` web token by default.
2. Relay manages mobile access/refresh sessions.
3. Pairing code is one-time and short-lived (default: 5 minutes).

### 6.2 Direct Mode (Advanced)

1. Mobile stores `codeg_base_url + token` locally.
2. Mobile calls `codeg-main` directly.
3. UI must warn that token grants full web-service scope.

### 6.3 Storage and Logging Rules

1. Never log plaintext token/secret in relay and mobile logs.
2. Support device/session revocation.
3. On refresh failure, force re-pair flow.

## 7. MCode Client Design (`uni-app + uview-plus`)

### 7.1 Information Architecture

1. Pair/Connect page
2. Target list page
3. Project list page
4. Session list page
5. Session detail page (core interaction)
6. Session info page
7. Settings page

### 7.2 Required Capabilities (Phase 1)

1. Relay and direct mode switching.
2. Multi-target management.
3. Project/session browsing.
4. Session prompt sending.
5. Session creation.
6. Stop/cancel action.
7. Permission approval/rejection.
8. Automatic reconnect.

### 7.3 Unified Gateway Abstraction

Introduce a client gateway layer:

- `call(command, payload)`
- `connectEvents()`
- `refreshAuth()`

Routing:

1. Relay mode: `MCode -> relay -> codeg-main`
2. Direct mode: `MCode -> codeg-main`

Pages consume unified domain methods only, not transport-specific code.

## 8. Delivery Milestones

### M0: Protocol Freeze (1-2 days)

1. Freeze relay API and WS protocol.
2. Freeze client gateway interfaces.
3. Freeze minimal `codeg-main` patch set.

### M1: End-to-End Skeleton (3-5 days)

1. Relay pairing/auth/proxy/event forwarding skeleton.
2. `codeg-main` mcode channel create/edit/connect/test.
3. MCode pair + target + project/session list read flow.

### M2: Full Remote Control Loop (4-6 days)

1. Session detail interaction and actions.
2. Permission workflow.
3. Reconnect and expiry handling.
4. Relay/direct mode switching.

### M3: Release Hardening (2-4 days)

1. H5/App/mini-program smoke coverage.
2. Security hardening and redaction checks.
3. Deployment and operation docs (self-hosted + official hosted relay).

## 9. Acceptance Criteria

Release is accepted only when all pass:

1. Full remote loop works in relay mode.
2. Full remote loop works in direct mode.
3. Reconnect recovers automatically after transient network failures.
4. Pairing code expiry and token refresh behaviors match spec.
5. Existing Telegram/Lark/Weixin channel behavior has no regression.

## 10. Testing Strategy

1. Unit tests:
   - relay pairing/auth/session modules
   - tunnel routing and retry state machine
2. Integration tests:
   - `codeg-main <-> relay <-> MCode`
   - direct-mode command/event flow
3. End-to-end smoke:
   - H5, Android, iOS, WeChat mini-program
4. Regression:
   - existing chat channel operations and status updates

## 11. Risks and Mitigations

1. **Mini-program WS restrictions**  
   Mitigation: enforce domain/TLS prerequisites, pre-release network checklist.

2. **Upstream merge conflicts in `codeg-main`**  
   Mitigation: isolate changes to channel type, backend factory, and settings forms.

3. **Token leakage risk in direct mode**  
   Mitigation: default relay mode, explicit warning, masked logs, revocation support.

4. **Connection instability in mobile networks**  
   Mitigation: heartbeat + exponential backoff + stateful reconnect UX.

