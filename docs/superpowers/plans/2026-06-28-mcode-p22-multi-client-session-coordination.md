# MCode P22 Multi-client Session Coordination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `mcode-desktop` the official CLI session host while phone, watch, and desktop clients can all subscribe to the same active turn stream.

**Architecture:** Relay stays a multi-client transport and attaches a `clientId` to app-originated requests. Desktop owns official CLI session state, rejects concurrent prompts with `turn_busy`, records the active turn owner for diagnostics, and broadcasts interaction resolution to all clients. MCode app preserves a per-install relay client id, maps `turn_busy` to user copy, and disables already-resolved interactions.

**Tech Stack:** TypeScript/Fastify/WebSocket/Vitest for `mcode-relay`; Rust/Tauri/Tokio/Cargo tests for `mcode-desktop`; Vue 3/uni-app/TypeScript/Jest for `mcode-app`.

## Global Constraints

- Use `targetAgent`, never `targetType`.
- Do not add mobile-side `codex` or `claude` target agents; official CLIs remain `targetAgent = mcode-desktop` capabilities.
- Do not introduce VS Code or code-server assumptions.
- Relay must not enforce a single-controller lease for Desktop targets.
- Desktop is the official CLI session authority; relay only forwards `clientId` and broadcasts events.
- First slice uses `turn_busy`; do not implement prompt queueing.
- Every mcode change must include or update `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`.
- App agent-specific logic must live under `mcode-app/src/agents/<agent>/` when new agent-specific behavior is added.
- For `mcode-app` styling, use uview `--up-*` runtime theme variables only; P22 should not require new visual styling.

---

## File Structure

- `mcode-relay/src/protocol/types.ts`: add `ClientIdentity`, `ProxyRequestMetadata`, and `clientId` fields on event frames where applicable.
- `mcode-relay/src/tunnel/hub.ts`: normalize client identity, keep subscriber metadata, include `clientId` in ready/event diagnostics, and forward request metadata to Desktop.
- `mcode-relay/src/server.ts`: extract `clientId` from query/header/body, pass it into hub methods, and expose it on `/v1/events` ready frames.
- `mcode-relay/test/hub.test.ts`: unit coverage for multiple subscribers and forwarded client metadata.
- `mcode-relay/test/relay.test.ts`: API coverage for client id reuse/assignment.
- `mcode-desktop/src-tauri/src/app_state.rs`: add Desktop-hosted active turn registry fields.
- `mcode-desktop/src-tauri/src/runtime/mod.rs`: define `sourceClientId` extraction, busy error formatting, active-turn guard, and responder metadata.
- `mcode-desktop/src-tauri/src/runtime/codex_cli.rs`: replace blocking Codex app-server turn lock with non-blocking busy rejection.
- `mcode-desktop/src-tauri/src/runtime/claude_cli.rs`: protect Claude stdio turns with the shared Desktop active-turn guard.
- `mcode-desktop/src-tauri/src/gateway/upstream.rs`: parse `clientId` from relay `proxy_request` and merge it into Desktop proxy payload metadata.
- `mcode-desktop/src-tauri/src/health.rs`: expose `activeTurnOwnerClientId`, active turn count, and pending interaction responder metadata.
- `mcode-desktop/src-tauri/tests/desktop_p22_multi_client_session.rs`: P22 Rust integration coverage for busy rejection and first responder wins.
- `mcode-app/src/services/gateway/relayClientIdentity.ts`: persistent per-install relay client id helper.
- `mcode-app/src/services/gateway/relayRecovery.ts`: include `clientId` in relay event URL builder.
- `mcode-app/src/services/gateway/relayGateway.ts`: send `x-mcode-client-id` on HTTP and WebSocket relay calls.
- `mcode-app/src/services/gateway/error.ts`: map `turn_busy` to Chinese user copy.
- `mcode-app/src/types/acp.ts`: add optional client/responder metadata to permission/question resolved event types.
- `mcode-app/src/stores/conversationRuntime.ts`: clear pending controls when a resolved event includes another responder.
- `mcode-app/tests/services/relayClientIdentity.spec.ts`: client id persistence tests.
- `mcode-app/tests/services/gatewayError.spec.ts`: busy copy test.
- `mcode-app/tests/stores/conversationRuntime.spec.ts`: resolved-by-other-device interaction behavior.
- `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`: implementation progress and native replication notes.

---

### Task 1: Relay Client Identity Transport

**Files:**
- Modify: `mcode-relay/src/protocol/types.ts`
- Modify: `mcode-relay/src/tunnel/hub.ts`
- Modify: `mcode-relay/src/server.ts`
- Test: `mcode-relay/test/hub.test.ts`
- Test: `mcode-relay/test/relay.test.ts`
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`

**Interfaces:**
- Produces: `ClientIdentity = { clientId: string; sessionId: string; targetId: string; deviceName: string | null }`.
- Produces: `normalizeClientId(value: unknown): string | null` in `hub.ts` or a small helper colocated with relay code.
- Produces: `RelayHub.attachMobileSubscriber(targetId, socket, lastEventId, clientIdentity): ReplayQueryResult`.
- Produces: `RelayHub.sendProxyRequest(targetId, command, payload, timeoutMs, clientIdentity): Promise<unknown>`.
- Produces upstream `proxy_request` frame with `{ clientId, client: { clientId, sessionId, targetId, deviceName } }`.
- Produces `/v1/events` ready frame with `clientId`.
- Consumes: existing pairing session `sessionId`, target id, and optional session device name.

- [ ] **Step 1: Write relay hub tests for multi-subscriber broadcast and proxy metadata**

Add to `mcode-relay/test/hub.test.ts`:

```ts
it("broadcasts desktop events to multiple mobile subscribers", () => {
  const hub = new RelayHub()
  const first = socketMock()
  const second = socketMock()

  hub.attachMobileSubscriber("desktop-1", first, 0, {
    clientId: "client-a",
    sessionId: "session-a",
    targetId: "desktop-1",
    deviceName: "Phone",
  })
  hub.attachMobileSubscriber("desktop-1", second, 0, {
    clientId: "client-b",
    sessionId: "session-b",
    targetId: "desktop-1",
    deviceName: "Watch",
  })
  hub.broadcastEvent("desktop-1", {
    channel: "acp://event",
    payload: { type: "stream_batch", connectionId: "s1", data: { delta: "hi" } },
  })

  expect(first.send).toHaveBeenCalledTimes(1)
  expect(second.send).toHaveBeenCalledTimes(1)
  expect(JSON.parse(String((first.send as any).mock.calls[0][0]))).toMatchObject({
    channel: "acp://event",
    payload: { type: "stream_batch" },
  })
  expect(JSON.parse(String((second.send as any).mock.calls[0][0]))).toMatchObject({
    channel: "acp://event",
    payload: { type: "stream_batch" },
  })
})

it("forwards client identity on proxy requests", async () => {
  const hub = new RelayHub()
  const desktop = socketMock()
  hub.registerDesktop("desktop-1", desktop, "Work Desktop")

  const promise = hub.sendProxyRequest(
    "desktop-1",
    "acp_prompt",
    { prompt: "hi" },
    10_000,
    {
      clientId: "client-phone",
      sessionId: "session-1",
      targetId: "desktop-1",
      deviceName: "Phone",
    }
  )

  const frame = JSON.parse(String((desktop.send as any).mock.calls[0][0]))
  expect(frame).toMatchObject({
    type: "proxy_request",
    command: "acp_prompt",
    clientId: "client-phone",
    client: {
      clientId: "client-phone",
      sessionId: "session-1",
      targetId: "desktop-1",
      deviceName: "Phone",
    },
  })

  hub.handleDesktopProxyResponse({ requestId: frame.requestId, ok: true, body: { ok: true } })
  await expect(promise).resolves.toMatchObject({ body: { ok: true } })
})
```

- [ ] **Step 2: Run relay hub tests and verify failure**

Run: `cd mcode-relay; npm test -- --run test/hub.test.ts`

Expected: FAIL because `attachMobileSubscriber` and `sendProxyRequest` do not accept client identity yet.

- [ ] **Step 3: Implement relay client identity types and hub forwarding**

In `mcode-relay/src/protocol/types.ts`, add:

```ts
export interface ClientIdentity {
  clientId: string
  sessionId: string
  targetId: string
  deviceName: string | null
}
```

In `mcode-relay/src/tunnel/hub.ts`:

```ts
import type { ClientIdentity } from "../protocol/types.js"

interface MobileSubscriber {
  socket: WebSocket
  client: ClientIdentity
}

// Replace mobileSubscribers with:
private readonly mobileSubscribers = new Map<string, Map<WebSocket, ClientIdentity>>()

attachMobileSubscriber(
  targetId: string,
  socket: WebSocket,
  lastEventId = 0,
  client: ClientIdentity = {
    clientId: "unknown",
    sessionId: "unknown",
    targetId,
    deviceName: null,
  }
): ReplayQueryResult {
  const subscribers = this.mobileSubscribers.get(targetId) ?? new Map<WebSocket, ClientIdentity>()
  subscribers.set(socket, client)
  this.mobileSubscribers.set(targetId, subscribers)
  // existing replay send loop remains unchanged
}
```

Update broadcast loops from `for (const socket of subscribers)` to `for (const socket of subscribers.keys())`.

Change `sendProxyRequest` signature:

```ts
async sendProxyRequest(
  targetId: string,
  command: string,
  payload: unknown,
  timeoutMs = 10_000,
  client?: ClientIdentity
): Promise<unknown> {
  // ...
  const body = JSON.stringify({
    type: "proxy_request",
    requestId,
    command,
    payload,
    ...(client ? { clientId: client.clientId, client } : {}),
  })
}
```

- [ ] **Step 4: Add server-side client id extraction and ready frame**

In `mcode-relay/src/server.ts`, add helpers near `normalizeLastEventId`:

```ts
function normalizeClientId(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!/^[a-zA-Z0-9._:-]{6,96}$/.test(trimmed)) return null
  return trimmed
}

function getRequestClientId(req: FastifyRequest): string | null {
  const header = normalizeClientId(req.headers["x-mcode-client-id"])
  if (header) return header
  const query = req.query && typeof req.query === "object" ? (req.query as Record<string, unknown>) : {}
  const queryClientId = normalizeClientId(query.clientId ?? query.client_id)
  if (queryClientId) return queryClientId
  const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {}
  return normalizeClientId(body.clientId ?? body.client_id)
}

function buildClientIdentity(
  req: FastifyRequest,
  auth: Awaited<ReturnType<typeof authenticateSession>>
) {
  return {
    clientId: getRequestClientId(req) ?? `relay-${auth.session.sessionId}`,
    sessionId: auth.session.sessionId,
    targetId: auth.claims.targetId,
    deviceName: auth.session.deviceName ?? null,
  }
}
```

Use `const client = buildClientIdentity(req, auth)` in `/v1/proxy/:command` and pass it to `sendProxyRequest`. In `/v1/events`, pass it to `attachMobileSubscriber` and include `clientId: client.clientId` in the ready frame.

- [ ] **Step 5: Add relay API test for client id ready frame and proxy forwarding**

Add to `mcode-relay/test/relay.test.ts`:

```ts
it("forwards relay client id on authorized proxy calls", async () => {
  store.addOffer({
    code: "123456",
    secret: "secret",
    targetId: "desktop-1",
    targetAgent: "mcode-desktop",
    ttlSeconds: 300,
  })
  const pair = await request(app.server)
    .post("/v1/pair")
    .set("x-mcode-device-name", "Alice Phone")
    .send({ code: "123456", secret: "secret" })

  const sendProxyRequest = vi.spyOn(hub, "sendProxyRequest").mockResolvedValue({
    status: 200,
    body: { ok: true },
  })

  const res = await request(app.server)
    .post("/v1/proxy/acp_prompt")
    .set("authorization", `Bearer ${pair.body.accessToken}`)
    .set("x-mcode-client-id", "client-phone-1")
    .send({ prompt: "hello" })

  expect(res.status).toBe(200)
  expect(sendProxyRequest).toHaveBeenCalledWith(
    "desktop-1",
    "acp_prompt",
    { prompt: "hello" },
    undefined,
    expect.objectContaining({
      clientId: "client-phone-1",
      targetId: "desktop-1",
      deviceName: "Alice Phone",
    })
  )
})
```

- [ ] **Step 6: Run relay tests**

Run: `cd mcode-relay; npm test -- --run test/hub.test.ts test/relay.test.ts`

Expected: PASS.

- [ ] **Step 7: Update architecture note progress**

Append under the P22 section of `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`:

```md
Implementation progress:

- Relay now treats app clients as multiple subscribers, assigns/reuses
  `clientId`, includes it in `/v1/events` ready frames, and forwards client
  identity on `proxy_request` to Desktop.
```

- [ ] **Step 8: Commit relay client identity**

Run:

```bash
git add -- mcode-relay/src/protocol/types.ts mcode-relay/src/tunnel/hub.ts mcode-relay/src/server.ts mcode-relay/test/hub.test.ts mcode-relay/test/relay.test.ts docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md docs/superpowers/plans/2026-06-28-mcode-p22-multi-client-session-coordination.md
git commit -m "feat(relay): forward p22 client identity"
```

---

### Task 2: Desktop Hosted Turn Coordination

**Files:**
- Modify: `mcode-desktop/src-tauri/src/app_state.rs`
- Modify: `mcode-desktop/src-tauri/src/runtime/mod.rs`
- Modify: `mcode-desktop/src-tauri/src/runtime/codex_cli.rs`
- Modify: `mcode-desktop/src-tauri/src/runtime/claude_cli.rs`
- Modify: `mcode-desktop/src-tauri/src/gateway/upstream.rs`
- Modify: `mcode-desktop/src-tauri/src/health.rs`
- Test: `mcode-desktop/src-tauri/tests/desktop_p22_multi_client_session.rs`
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`

**Interfaces:**
- Consumes: relay `proxy_request.clientId` and `proxy_request.client`.
- Produces: payload metadata fields `sourceClientId` and `source_client_id` before runtime dispatch.
- Produces: `TurnBusy` error payload rendered as `{ code: "turn_busy", message, activeTurnId, activeTurnOwnerClientId, retryable: true }`.
- Produces: `CliRuntimeSession.active_turn_owner_client_id: Option<String>`.
- Produces: `CliPendingInteraction.responder_client_id: Option<String>`.
- Produces health fields `active_turn_owner_client_id`, `active_turn_count`, and responder metadata in pending interactions.

- [ ] **Step 1: Write Desktop tests for busy rejection and first responder wins**

Create `mcode-desktop/src-tauri/tests/desktop_p22_multi_client_session.rs`:

```rust
use std::sync::Arc;

use mcode_desktop_lib::app_state::AppState;
use mcode_desktop_lib::health::build_health_snapshot;
use mcode_desktop_lib::runtime::{
    dispatch_desktop_proxy_with_state, capture_pending_interaction, AcpEventEnvelope,
};
use serde_json::json;

#[tokio::test]
async fn p22_records_active_turn_owner_and_rejects_concurrent_prompt() {
    let state = Arc::new(AppState::new_for_test());
    let connected = dispatch_desktop_proxy_with_state(
        state.as_ref(),
        "acp_connect",
        json!({ "agentType": "claude_code", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();
    let session_id = connected["sessionId"].as_str().unwrap();

    mcode_desktop_lib::runtime::begin_hosted_turn_for_test(
        state.as_ref(),
        session_id,
        "turn-live",
        Some("client-phone".to_string()),
    )
    .unwrap();

    let error = dispatch_desktop_proxy_with_state(
        state.as_ref(),
        "acp_prompt",
        json!({
            "sessionId": session_id,
            "prompt": "second turn",
            "sourceClientId": "client-watch"
        }),
    )
    .await
    .unwrap_err();

    let message = error.to_string();
    assert!(message.contains("\"code\":\"turn_busy\""));
    assert!(message.contains("\"activeTurnOwnerClientId\":\"client-phone\""));
}

#[tokio::test]
async fn p22_first_responder_wins_for_pending_permission() {
    let state = AppState::new_for_test();
    capture_pending_interaction(
        &state,
        "session-1",
        &AcpEventEnvelope {
            event_type: "permission_request".to_string(),
            connection_id: "session-1".to_string(),
            data: json!({ "requestId": "perm-1", "description": "Run command?" }),
        },
    );

    let first = dispatch_desktop_proxy_with_state(
        &state,
        "acp_respond_permission",
        json!({
            "sessionId": "session-1",
            "requestId": "perm-1",
            "decision": "allow",
            "sourceClientId": "client-phone"
        }),
    )
    .await
    .unwrap();
    assert_eq!(first["interaction"]["responderClientId"], "client-phone");
    assert_eq!(first["events"][0]["data"]["responderClientId"], "client-phone");

    let second = dispatch_desktop_proxy_with_state(
        &state,
        "acp_respond_permission",
        json!({
            "sessionId": "session-1",
            "requestId": "perm-1",
            "decision": "deny",
            "sourceClientId": "client-watch"
        }),
    )
    .await
    .unwrap_err();
    assert!(second.to_string().contains("permission interaction not found"));

    let health = build_health_snapshot(&state);
    assert_eq!(
        health.cli_pending_interactions[0].responder_client_id.as_deref(),
        Some("client-phone")
    );
}
```

- [ ] **Step 2: Run Desktop P22 test and verify failure**

Run: `cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml --test desktop_p22_multi_client_session`

Expected: FAIL because active turn owner and responder metadata are not implemented.

- [ ] **Step 3: Extend Desktop state structs**

In `mcode-desktop/src-tauri/src/runtime/mod.rs`, add to `CliRuntimeSession`:

```rust
pub active_turn_owner_client_id: Option<String>,
pub active_turn_started_at_ms: Option<u64>,
```

Add to `CliPendingInteraction`:

```rust
pub responder_client_id: Option<String>,
```

Update every `CliRuntimeSession` and `CliPendingInteraction` construction with `None` for new fields, including tests and recovery snapshot restoration if compilation requires it.

In `mcode-desktop/src-tauri/src/app_state.rs`, add:

```rust
pub hosted_active_turns: Mutex<HashMap<String, HostedActiveTurn>>,

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostedActiveTurn {
    pub session_id: String,
    pub active_turn_id: String,
    pub owner_client_id: Option<String>,
    pub started_at_ms: u64,
}
```

Initialize `hosted_active_turns` in `Default`.

- [ ] **Step 4: Implement source client extraction and active-turn guard**

In `mcode-desktop/src-tauri/src/runtime/mod.rs`, add:

```rust
pub fn extract_source_client_id(payload: &Value) -> Option<String> {
    payload
        .get("sourceClientId")
        .and_then(Value::as_str)
        .or_else(|| payload.get("source_client_id").and_then(Value::as_str))
        .or_else(|| {
            payload
                .get("client")
                .and_then(Value::as_object)
                .and_then(|client| client.get("clientId").and_then(Value::as_str))
        })
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

pub fn begin_hosted_turn(
    state: &AppState,
    session_id: &str,
    active_turn_id: impl Into<String>,
    owner_client_id: Option<String>,
) -> Result<()> {
    let active_turn_id = active_turn_id.into();
    let now = now_ms();
    let mut active = state
        .hosted_active_turns
        .lock()
        .map_err(|_| anyhow!("hosted active turn lock poisoned"))?;
    if let Some(existing) = active.get(session_id) {
        return Err(turn_busy_error(existing));
    }
    active.insert(
        session_id.to_string(),
        HostedActiveTurn {
            session_id: session_id.to_string(),
            active_turn_id: active_turn_id.clone(),
            owner_client_id: owner_client_id.clone(),
            started_at_ms: now,
        },
    );
    drop(active);
    update_session_active_turn_owner(state, session_id, Some(active_turn_id), owner_client_id, Some(now));
    Ok(())
}

pub fn end_hosted_turn(state: &AppState, session_id: &str) {
    if let Ok(mut active) = state.hosted_active_turns.lock() {
        active.remove(session_id);
    }
    update_session_active_turn_owner(state, session_id, None, None, None);
}

pub fn begin_hosted_turn_for_test(
    state: &AppState,
    session_id: &str,
    active_turn_id: &str,
    owner_client_id: Option<String>,
) -> Result<()> {
    begin_hosted_turn(state, session_id, active_turn_id.to_string(), owner_client_id)
}
```

Implement `turn_busy_error(existing)` as an `anyhow!` containing compact JSON:

```rust
anyhow!(
    "{}",
    json!({
        "code": "turn_busy",
        "message": "another device is running a turn",
        "activeTurnId": existing.active_turn_id,
        "activeTurnOwnerClientId": existing.owner_client_id,
        "retryable": true,
    })
)
```

Add helper `update_session_active_turn_owner` to mutate matching `CliRuntimeSession`.

- [ ] **Step 5: Merge relay client metadata in Desktop upstream proxy requests**

In `mcode-desktop/src-tauri/src/gateway/upstream.rs`, update `RelayControlFrame::ProxyRequest`:

```rust
ProxyRequest {
    #[serde(rename = "requestId")]
    request_id: String,
    command: String,
    #[serde(default)]
    payload: serde_json::Value,
    #[serde(rename = "clientId", default)]
    client_id: Option<String>,
    #[serde(default)]
    client: Option<serde_json::Value>,
},
```

Before dispatching, merge client metadata:

```rust
let payload = merge_proxy_client_metadata(payload, client_id, client);
```

Implement:

```rust
fn merge_proxy_client_metadata(
    payload: serde_json::Value,
    client_id: Option<String>,
    client: Option<serde_json::Value>,
) -> serde_json::Value {
    let mut object = match payload {
        serde_json::Value::Object(object) => object,
        _ => serde_json::Map::new(),
    };
    if let Some(client_id) = client_id.filter(|value| !value.trim().is_empty()) {
        object.entry("sourceClientId".to_string()).or_insert(serde_json::Value::String(client_id));
    }
    if let Some(client) = client {
        object.entry("client".to_string()).or_insert(client);
    }
    serde_json::Value::Object(object)
}
```

- [ ] **Step 6: Apply active-turn guard to Codex and Claude prompts**

For Codex app-server prompt in `mcode-desktop/src-tauri/src/runtime/codex_cli.rs`:

- Replace `let _turn_guard = app_server.turn_lock.lock().await;` with `try_lock()`.
- If `try_lock()` fails, return the same `turn_busy` JSON error using current app-server active turn id when available.
- After acquiring, call `begin_hosted_turn(state.as_ref(), &connection_id, provisional_turn_id, extract_source_client_id(&payload))`.
- When `turn/started` later provides a provider turn id, update session active turn id but keep owner client id.
- Always call `end_hosted_turn(state.as_ref(), &connection_id)` on success, cancellation, and error.

For Claude stdio prompt in `mcode-desktop/src-tauri/src/runtime/claude_cli.rs`:

- Use `connection_id = extract_connection_id(&payload, "claude-cli")`.
- Call `begin_hosted_turn(state, &connection_id, request_id_or_generated, extract_source_client_id(&payload))` before `run_streaming_cli_process`.
- Call `end_hosted_turn(state, &connection_id)` after process completion or error.
- For stateless `dispatch_claude_proxy` without `state`, keep current behavior because no Desktop session host exists.

- [ ] **Step 7: Add responder metadata to interaction resolution events**

In `respond_interaction`, compute:

```rust
let responder_client_id = extract_source_client_id(&payload);
```

Pass it into `mark_interaction_resolved` and store it on `CliPendingInteraction.responder_client_id`.

In `resolved_interaction_event`, add:

```rust
"responderClientId": interaction.responder_client_id,
```

Also include `responderClientId` in the response root for easier app use.

- [ ] **Step 8: Expose health diagnostics**

In `mcode-desktop/src-tauri/src/health.rs`, add to `DesktopHealthSnapshot`:

```rust
pub active_turn_count: usize,
pub active_turn_owner_client_id: Option<String>,
```

Populate from `state.hosted_active_turns`.

- [ ] **Step 9: Run Desktop tests**

Run:

```bash
cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml --test desktop_p22_multi_client_session
cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml
```

Expected: PASS.

- [ ] **Step 10: Update architecture note progress**

Append:

```md
- Desktop now records active turn ownership per hosted official CLI session,
  rejects concurrent prompt attempts with `turn_busy`, and annotates resolved
  permission/question interactions with `responderClientId`.
```

- [ ] **Step 11: Commit Desktop coordination**

Run:

```bash
git add -- mcode-desktop/src-tauri/src/app_state.rs mcode-desktop/src-tauri/src/runtime/mod.rs mcode-desktop/src-tauri/src/runtime/codex_cli.rs mcode-desktop/src-tauri/src/runtime/claude_cli.rs mcode-desktop/src-tauri/src/gateway/upstream.rs mcode-desktop/src-tauri/src/health.rs mcode-desktop/src-tauri/tests/desktop_p22_multi_client_session.rs docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md docs/superpowers/plans/2026-06-28-mcode-p22-multi-client-session-coordination.md
git commit -m "feat(desktop): coordinate p22 hosted turns"
```

---

### Task 3: App Client Identity and Multi-device Copy

**Files:**
- Create: `mcode-app/src/services/gateway/relayClientIdentity.ts`
- Modify: `mcode-app/src/services/gateway/relayRecovery.ts`
- Modify: `mcode-app/src/services/gateway/relayGateway.ts`
- Modify: `mcode-app/src/services/gateway/error.ts`
- Modify: `mcode-app/src/types/acp.ts`
- Modify: `mcode-app/src/stores/conversationRuntime.ts`
- Test: `mcode-app/tests/services/relayClientIdentity.spec.ts`
- Test: `mcode-app/tests/services/gatewayError.spec.ts`
- Test: `mcode-app/tests/stores/conversationRuntime.spec.ts`
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`

**Interfaces:**
- Produces: `getRelayClientId(): string` persistent helper.
- Produces: `buildRelayEventsUrl(relayUrl, checkpoint, clientId?)`.
- Consumes: relay ready frame `clientId`.
- Consumes: Desktop error code `turn_busy`.
- Consumes: resolved interaction payload `responderClientId`.

- [ ] **Step 1: Write app client id tests**

Create `mcode-app/tests/services/relayClientIdentity.spec.ts`:

```ts
import { getRelayClientId, __resetRelayClientIdForTest } from "@/services/gateway/relayClientIdentity"

describe("relayClientIdentity", () => {
  beforeEach(() => {
    ;(globalThis as any).uni = {
      getStorageSync: jest.fn(),
      setStorageSync: jest.fn(),
    }
    __resetRelayClientIdForTest()
  })

  it("creates and persists a stable relay client id", () => {
    const first = getRelayClientId()
    const second = getRelayClientId()

    expect(first).toMatch(/^mcode-client-/)
    expect(second).toBe(first)
    expect((globalThis as any).uni.setStorageSync).toHaveBeenCalledWith("mcode:relay-client-id", first)
  })

  it("reuses a valid stored relay client id", () => {
    ;(globalThis as any).uni.getStorageSync.mockReturnValue("mcode-client-existing")

    expect(getRelayClientId()).toBe("mcode-client-existing")
  })
})
```

- [ ] **Step 2: Write app error copy test**

Create or update `mcode-app/tests/services/gatewayError.spec.ts`:

```ts
import { toResponseErrorMessage } from "@/services/gateway/error"

describe("gateway error copy", () => {
  it("maps turn_busy to multi-device busy copy", () => {
    expect(toResponseErrorMessage({ code: "turn_busy" }, 409)).toBe(
      "其他设备正在执行任务，请等待当前任务完成。"
    )
  })
})
```

- [ ] **Step 3: Run app focused tests and verify failure**

Run:

```bash
cd mcode-app
npm run test:unit -- relayClientIdentity gatewayError
```

Expected: FAIL because helper and error mapping do not exist yet.

- [ ] **Step 4: Implement persistent relay client id**

Create `mcode-app/src/services/gateway/relayClientIdentity.ts`:

```ts
const STORAGE_KEY = "mcode:relay-client-id"
let cachedRelayClientId = ""

function randomSuffix() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

function isValidRelayClientId(value: unknown): value is string {
  return typeof value === "string" && /^mcode-client-[a-zA-Z0-9._:-]{6,96}$/.test(value.trim())
}

export function getRelayClientId(): string {
  if (cachedRelayClientId) return cachedRelayClientId
  try {
    const stored = uni.getStorageSync(STORAGE_KEY)
    if (isValidRelayClientId(stored)) {
      cachedRelayClientId = stored.trim()
      return cachedRelayClientId
    }
  } catch {
    // Storage can be unavailable in tests or restricted runtimes.
  }
  cachedRelayClientId = `mcode-client-${randomSuffix()}`
  try {
    uni.setStorageSync(STORAGE_KEY, cachedRelayClientId)
  } catch {
    // Best effort; in-memory id still keeps this runtime stable.
  }
  return cachedRelayClientId
}

export function __resetRelayClientIdForTest() {
  cachedRelayClientId = ""
}
```

- [ ] **Step 5: Send client id on relay HTTP and event connections**

Update `mcode-app/src/services/gateway/relayRecovery.ts`:

```ts
export function buildRelayEventsUrl(relayUrl: string, checkpoint?: unknown, clientId?: string): string {
  const base = relayUrl.replace(/^http/, "ws").replace(/\/$/, "")
  const params = new URLSearchParams()
  const normalized = normalizeRelayEventCheckpoint(checkpoint)
  if (normalized) params.set("lastEventId", String(normalized))
  if (clientId) params.set("clientId", clientId)
  const query = params.toString()
  return `${base}/v1/events${query ? `?${query}` : ""}`
}
```

Update tests that call `buildRelayEventsUrl`.

In `mcode-app/src/services/gateway/relayGateway.ts`:

```ts
import { getRelayClientId } from "./relayClientIdentity"

function getHeaders(session?: RelaySessionInfo | null): HeadersInit {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-mcode-client-id": getRelayClientId(),
  }
  // existing authorization handling
}

const eventsUrl = buildRelayEventsUrl(this.relayUrl, options.lastEventId, getRelayClientId())
```

- [ ] **Step 6: Map busy copy**

In `mcode-app/src/services/gateway/relayRecovery.ts`, update `describeGatewayFailureCode`:

```ts
case "turn_busy":
  return "其他设备正在执行任务，请等待当前任务完成。"
case "interaction_resolved":
  return "该请求已由其他设备处理。"
```

- [ ] **Step 7: Add responder metadata types and runtime behavior**

In `mcode-app/src/types/acp.ts`:

```ts
export interface PermissionResolvedEvent {
  requestId: string
  responderClientId?: string | null
}
```

For question resolved payload, add an interface if not present:

```ts
export interface QuestionResolvedEvent {
  questionId: string
  responderClientId?: string | null
}
```

In `mcode-app/src/api/acp.ts` normalization for `permission_resolved` and `question_resolved`, preserve `responderClientId`.

In `mcode-app/src/stores/conversationRuntime.ts`, existing resolved handling clears pending controls. Ensure it does not require the current device to be responder. If UI status message exists, set a short recoverable note when `responderClientId` differs from `getRelayClientId()`:

```ts
const responderClientId = firstString(event.data?.responderClientId, event.data?.responder_client_id)
if (responderClientId && responderClientId !== getRelayClientId()) {
  session.lastError = null
  session.statusMessage = "该请求已由其他设备处理。"
}
```

If `statusMessage` is not available on runtime session, keep the first slice to clearing pending controls and rely on toast/error copy only; do not add a broad UI refactor.

- [ ] **Step 8: Add conversation runtime test for responder from another device**

Update `mcode-app/tests/stores/conversationRuntime.spec.ts` with a focused test using existing store helpers:

```ts
it("clears pending permission when another device resolves it", () => {
  const { store, session } = createRuntimeStoreWithSession()
  store.applyEvent(1, {
    type: "permission_request",
    connectionId: session.connectionId,
    data: { id: "perm-1", description: "Run command?", options: [] },
  } as any)

  expect(session.pendingPermission?.id).toBe("perm-1")

  store.applyEvent(1, {
    type: "permission_resolved",
    connectionId: session.connectionId,
    data: { requestId: "perm-1", responderClientId: "other-device" },
  } as any)

  expect(session.pendingPermission).toBeNull()
})
```

Adapt the helper names to the existing test file rather than creating a parallel runtime harness.

- [ ] **Step 9: Run app tests**

Run:

```bash
cd mcode-app
npm run test:unit -- relayClientIdentity gatewayError conversationRuntime
npm run test:unit
```

Expected: PASS.

- [ ] **Step 10: Update architecture note progress**

Append:

```md
- App now persists a per-install relay `clientId`, sends it on relay HTTP and
  event connections, maps `turn_busy` to multi-device busy copy, and treats
  resolved interactions from any device as authoritative.
```

- [ ] **Step 11: Commit app client identity and copy**

Run:

```bash
git add -- mcode-app/src/services/gateway/relayClientIdentity.ts mcode-app/src/services/gateway/relayRecovery.ts mcode-app/src/services/gateway/relayGateway.ts mcode-app/src/services/gateway/error.ts mcode-app/src/types/acp.ts mcode-app/src/api/acp.ts mcode-app/src/stores/conversationRuntime.ts mcode-app/tests/services/relayClientIdentity.spec.ts mcode-app/tests/services/gatewayError.spec.ts mcode-app/tests/stores/conversationRuntime.spec.ts docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md docs/superpowers/plans/2026-06-28-mcode-p22-multi-client-session-coordination.md
git commit -m "feat(app): add p22 relay client identity"
```

---

### Task 4: P22 Integration Verification and Progress Lock

**Files:**
- Modify: `docs/superpowers/plans/2026-06-28-mcode-p22-multi-client-session-coordination.md`
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`

**Interfaces:**
- Consumes: all previous task outputs.
- Produces: checked plan progress and a final architecture note summary for native clients.

- [ ] **Step 1: Run full verification**

Run:

```bash
cd mcode-relay
npm test
npm run typecheck
cd ..\mcode-app
npm run test:unit
cd ..
cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml
git diff --check
```

Expected: all pass. If a test fails, use `systematic-debugging` before changing code.

- [ ] **Step 2: Update plan checkboxes**

Check off every completed step in this plan file. Leave any blocked step unchecked with a short reason directly under that step.

- [ ] **Step 3: Finalize architecture note**

Add a short final P22 status paragraph:

```md
P22 first slice status:

- Implemented multi-client event observation with relay `clientId`.
- Implemented Desktop-hosted active turn coordination with `turn_busy`.
- Implemented first-valid-responder-wins metadata for interactions.
- Not implemented: prompt queueing and explicit cancel/takeover of another
  device's active turn.
```

- [ ] **Step 4: Commit P22 verification record**

Run:

```bash
git add -- docs/superpowers/plans/2026-06-28-mcode-p22-multi-client-session-coordination.md docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md
git commit -m "docs(app): record p22 multi-client completion"
```

---

## Self-Review

- Spec coverage: covered multi-subscriber relay, client id assignment/reuse, Desktop-hosted active turn state, `turn_busy`, first responder wins, app copy, native replication notes, and non-goals against single-controller lease.
- Placeholder scan: no `TBD`, `TODO`, or unspecified implementation steps remain.
- Type consistency: plan consistently uses `targetAgent`, `clientId`, `sourceClientId`, `activeTurnOwnerClientId`, and `responderClientId`.
