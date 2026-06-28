# MCode P23 Active Turn Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any paired MCode client cancel an active Desktop-hosted official CLI turn while all connected clients observe consistent cancellation lifecycle events.

**Architecture:** Relay remains a stateless transport and forwards P22 `clientId` metadata on `acp_cancel`. Desktop owns the active turn, records cancel requester metadata, emits `turn_cancel_requested` and final settlement events, and uses existing Codex/Claude cancellation paths. App normalizes the new events and updates runtime copy/state without introducing mobile-side official CLI agents.

**Tech Stack:** TypeScript/Fastify/WebSocket/Vitest for `mcode-relay`; Rust/Tauri/Tokio/Cargo tests for `mcode-desktop`; Vue 3/uni-app/TypeScript/Jest for `mcode-app`.

## Global Constraints

- Use `targetAgent`, never `targetType`.
- Do not add a single-controller lease.
- Do not move official CLI ownership from Desktop to relay or app clients.
- Do not add mobile-side `codex` or `claude` target agents.
- Do not add prompt queueing.
- Do not create a separate `acp_takeover` command in this slice.
- Do not introduce VS Code or code-server assumptions.
- `clientId` is operational metadata, not authentication.
- Every mcode change must include or update `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`.
- App target/agent-specific logic must live under `mcode-app/src/agents/<agent>/` when new agent-specific behavior is added; P23 should not need new agent-specific directories.
- For `mcode-app` styling, use uview `--up-*` runtime theme variables only; P23 should not add CSS variables or styling.

---

## File Structure

- `mcode-relay/test/relay.test.ts`: add explicit API coverage that `acp_cancel` receives the same P22 `ClientIdentity` forwarding as `acp_prompt`.
- `mcode-desktop/src-tauri/src/app_state.rs`: extend `HostedActiveTurn` with cancel requester metadata.
- `mcode-desktop/src-tauri/src/runtime/mod.rs`: add cancel metadata helpers, turn-control event builders, idempotent active-turn cancel handling, and `acp_cancel` dispatch behavior.
- `mcode-desktop/src-tauri/src/health.rs`: expose top-level active-turn cancel requester diagnostics.
- `mcode-desktop/src-tauri/tests/desktop_p23_active_turn_control.rs`: add focused Rust tests for cancel metadata, idempotency, events, and health.
- `mcode-app/src/types/acp.ts`: add event union members and payload interfaces for `turn_cancel_requested`, `turn_cancelled`, and `turn_cancel_failed`.
- `mcode-app/src/api/acp.ts`: normalize turn-control event payloads from Desktop/relay.
- `mcode-app/src/stores/conversationRuntime.ts`: update runtime state and user copy for local vs other-device cancellation.
- `mcode-app/tests/stores/conversationRuntime.spec.ts`: cover runtime handling of cancel requested, cancelled, and failed events.
- `mcode-app/tests/api/acpTurnControlEvents.spec.ts`: cover ACP turn-control event normalization through `acpApi.normalizeRealtimeEvent(...)`.
- `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`: record implementation progress and native replication details.

---

### Task 1: Relay Cancel Client Identity Coverage

**Files:**
- Modify: `mcode-relay/test/relay.test.ts`
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`

**Interfaces:**
- Consumes: existing `buildClientIdentity(req, auth)` in `mcode-relay/src/server.ts`.
- Consumes: existing `RelayHub.sendProxyRequest(targetId, command, payload, timeoutMs, client)` signature.
- Produces: test guarantee that `/v1/proxy/acp_cancel` forwards `ClientIdentity`.

- [x] **Step 1: Add relay API test for `acp_cancel` client identity forwarding**

Append this test near the existing `"forwards relay client id on authorized proxy calls"` test in `mcode-relay/test/relay.test.ts`:

```ts
it("forwards relay client id on authorized cancel calls", async () => {
  store.addOffer({
    code: "223344",
    secret: "cancel-secret",
    targetId: "desktop-1",
    targetAgent: "mcode-desktop",
    ttlSeconds: 300,
  })
  const pair = await request(app.server)
    .post("/v1/pair")
    .set("x-mcode-device-name", "Alice Watch")
    .send({ code: "223344", secret: "cancel-secret" })

  const sendProxyRequest = vi.spyOn(hub, "sendProxyRequest").mockResolvedValue({
    status: 200,
    body: { status: "cancel_requested" },
  })

  const res = await request(app.server)
    .post("/v1/proxy/acp_cancel")
    .set("authorization", `Bearer ${pair.body.accessToken}`)
    .set("x-mcode-client-id", "client-watch-1")
    .send({ sessionId: "session-1", reason: "user_cancelled_from_watch" })

  expect(res.status).toBe(200)
  expect(sendProxyRequest).toHaveBeenCalledWith(
    "desktop-1",
    "acp_cancel",
    { sessionId: "session-1", reason: "user_cancelled_from_watch" },
    undefined,
    expect.objectContaining({
      clientId: "client-watch-1",
      targetId: "desktop-1",
      deviceName: "Alice Watch",
    })
  )
})
```

- [x] **Step 2: Run focused relay test**

Run:

```bash
cd mcode-relay
npm test -- --run test/relay.test.ts
```

Expected: PASS. If it fails because `acp_cancel` is not forwarding client identity, fix `mcode-relay/src/server.ts` by ensuring the existing `/v1/proxy/:command` path does not special-case cancel and always passes `buildClientIdentity(req, auth)` to `sendProxyRequest`.

- [x] **Step 3: Update architecture note progress**

Append under the P23 section in `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`:

```md
Implementation progress:

- Relay coverage now explicitly verifies that `acp_cancel` forwards the same
  P22 `clientId` metadata as prompt and interaction commands.
```

- [x] **Step 4: Commit relay coverage**

Run:

```bash
git add -- mcode-relay/test/relay.test.ts docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md docs/superpowers/plans/2026-06-28-mcode-p23-active-turn-control.md
git commit -m "test(relay): cover p23 cancel client identity"
```

---

### Task 2: Desktop Active Turn Cancel Coordination

**Files:**
- Modify: `mcode-desktop/src-tauri/src/app_state.rs`
- Modify: `mcode-desktop/src-tauri/src/runtime/mod.rs`
- Modify: `mcode-desktop/src-tauri/src/health.rs`
- Create: `mcode-desktop/src-tauri/tests/desktop_p23_active_turn_control.rs`
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`

**Interfaces:**
- Consumes: `extract_source_client_id(payload: &Value) -> Option<String>`.
- Consumes: `begin_hosted_turn_for_test(state, session_id, active_turn_id, owner_client_id)`.
- Produces: `HostedActiveTurn.cancel_requested_by_client_id: Option<String>`.
- Produces: `HostedActiveTurn.cancel_requested_at_ms: Option<u64>`.
- Produces: `HostedActiveTurn.cancel_reason: Option<String>`.
- Produces: `CliRuntimeSession.cancel_requested_by_client_id: Option<String>`.
- Produces: `CliRuntimeSession.cancel_requested_at_ms: Option<u64>`.
- Produces: `CliRuntimeSession.cancel_reason: Option<String>`.
- Produces: `DesktopHealthSnapshot.active_turn_cancel_requested_by_client_id: Option<String>`.
- Produces: `DesktopHealthSnapshot.active_turn_cancel_requested_at_ms: Option<u64>`.
- Produces event envelope types `turn_cancel_requested` and `turn_cancelled`.

- [ ] **Step 1: Add Desktop tests for active turn cancel metadata and events**

Create `mcode-desktop/src-tauri/tests/desktop_p23_active_turn_control.rs`:

```rust
use std::sync::{Arc, Mutex};

use mcode_desktop_lib::app_state::AppState;
use mcode_desktop_lib::health::build_health_snapshot;
use mcode_desktop_lib::runtime::{
    begin_hosted_turn_for_test, dispatch_desktop_proxy_with_event_sink, dispatch_desktop_proxy_with_state,
    AcpEventEnvelope,
};
use serde_json::json;

#[tokio::test]
async fn p23_cancel_records_requester_and_emits_events() {
    let state = AppState::new_for_test();
    let connected = dispatch_desktop_proxy_with_state(
        &state,
        "acp_connect",
        json!({ "agentType": "claude_code", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();
    let session_id = connected["sessionId"].as_str().unwrap();
    begin_hosted_turn_for_test(
        &state,
        session_id,
        "turn-live",
        Some("client-phone".to_string()),
    )
    .unwrap();

    let events = Arc::new(Mutex::new(Vec::<AcpEventEnvelope>::new()));
    let sink_events = Arc::clone(&events);
    let response = dispatch_desktop_proxy_with_event_sink(
        &state,
        "acp_cancel",
        json!({
            "sessionId": session_id,
            "reason": "user_cancelled_from_watch",
            "sourceClientId": "client-watch"
        }),
        Some(Arc::new(move |event| {
            sink_events.lock().unwrap().push(event);
        })),
    )
    .await
    .unwrap();

    assert_eq!(response["status"], "cancel_requested");
    assert_eq!(response["activeTurnId"], "turn-live");
    assert_eq!(response["activeTurnOwnerClientId"], "client-phone");
    assert_eq!(response["cancelRequestedByClientId"], "client-watch");
    assert_eq!(response["session"]["cancelRequestedByClientId"], "client-watch");

    let captured = events.lock().unwrap().clone();
    assert_eq!(captured[0].event_type, "turn_cancel_requested");
    assert_eq!(captured[0].data["activeTurnId"], "turn-live");
    assert_eq!(captured[0].data["activeTurnOwnerClientId"], "client-phone");
    assert_eq!(captured[0].data["cancelRequestedByClientId"], "client-watch");
    assert_eq!(captured[1].event_type, "turn_cancelled");
    assert_eq!(captured[1].data["status"], "canceled");

    let health = build_health_snapshot(&state);
    assert_eq!(health.active_turn_count, 0);
    assert_eq!(
        health
            .cli_sessions
            .iter()
            .find(|session| session.session_id == session_id)
            .unwrap()
            .cancel_requested_by_client_id
            .as_deref(),
        Some("client-watch")
    );
}

#[tokio::test]
async fn p23_duplicate_cancel_is_idempotent_while_turn_is_cancelling() {
    let state = AppState::new_for_test();
    let connected = dispatch_desktop_proxy_with_state(
        &state,
        "acp_connect",
        json!({ "agentType": "claude_code", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();
    let session_id = connected["sessionId"].as_str().unwrap();
    begin_hosted_turn_for_test(
        &state,
        session_id,
        "turn-live",
        Some("client-phone".to_string()),
    )
    .unwrap();

    let first = mcode_desktop_lib::runtime::request_hosted_turn_cancel_for_test(
        &state,
        session_id,
        Some("client-watch".to_string()),
        Some("first".to_string()),
    )
    .unwrap();
    let second = mcode_desktop_lib::runtime::request_hosted_turn_cancel_for_test(
        &state,
        session_id,
        Some("client-tablet".to_string()),
        Some("second".to_string()),
    )
    .unwrap();

    assert_eq!(first.cancel_requested_by_client_id.as_deref(), Some("client-watch"));
    assert_eq!(second.cancel_requested_by_client_id.as_deref(), Some("client-watch"));
    assert_eq!(second.cancel_reason.as_deref(), Some("first"));
}
```

- [ ] **Step 2: Run Desktop P23 tests and verify failure**

Run:

```bash
cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml --test desktop_p23_active_turn_control
```

Expected: FAIL because cancel metadata fields and `request_hosted_turn_cancel_for_test` do not exist yet.

- [ ] **Step 3: Extend Desktop active turn and session structs**

In `mcode-desktop/src-tauri/src/app_state.rs`, replace `HostedActiveTurn` with:

```rust
#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostedActiveTurn {
    pub session_id: String,
    pub active_turn_id: String,
    pub owner_client_id: Option<String>,
    pub started_at_ms: u64,
    pub cancel_requested_by_client_id: Option<String>,
    pub cancel_requested_at_ms: Option<u64>,
    pub cancel_reason: Option<String>,
}
```

In `mcode-desktop/src-tauri/src/runtime/mod.rs`, add these fields to `CliRuntimeSession` after `cancel_requested`:

```rust
pub cancel_requested_by_client_id: Option<String>,
pub cancel_requested_at_ms: Option<u64>,
pub cancel_reason: Option<String>,
```

Update every `CliRuntimeSession` construction and recovery restore compile error with `None` for these fields. In `connect_cli_session`, set all three to `None` for new sessions.

- [ ] **Step 4: Populate new active turn fields in `begin_hosted_turn`**

In `mcode-desktop/src-tauri/src/runtime/mod.rs`, update the `HostedActiveTurn` insert in `begin_hosted_turn`:

```rust
HostedActiveTurn {
    session_id: session_id.to_string(),
    active_turn_id: active_turn_id.clone(),
    owner_client_id: owner_client_id.clone(),
    started_at_ms: now,
    cancel_requested_by_client_id: None,
    cancel_requested_at_ms: None,
    cancel_reason: None,
}
```

Update `turn_busy_error` to include cancel diagnostics:

```rust
"cancelRequestedByClientId": existing.cancel_requested_by_client_id,
"cancelRequestedAtMs": existing.cancel_requested_at_ms,
```

- [ ] **Step 5: Add cancel reason extraction and active-turn cancel helper**

Add below `begin_hosted_turn_for_test` in `mcode-desktop/src-tauri/src/runtime/mod.rs`:

```rust
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HostedTurnCancelSnapshot {
    pub session_id: String,
    pub active_turn_id: String,
    pub owner_client_id: Option<String>,
    pub cancel_requested_by_client_id: Option<String>,
    pub cancel_requested_at_ms: Option<u64>,
    pub cancel_reason: Option<String>,
    pub already_requested: bool,
}

pub fn request_hosted_turn_cancel(
    state: &AppState,
    session_id: &str,
    requester_client_id: Option<String>,
    reason: Option<String>,
) -> Result<Option<HostedTurnCancelSnapshot>> {
    let mut active = state
        .hosted_active_turns
        .lock()
        .map_err(|_| anyhow!("hosted active turn lock poisoned"))?;
    let Some(turn) = active.get_mut(session_id) else {
        return Ok(None);
    };
    let already_requested = turn.cancel_requested_by_client_id.is_some();
    if !already_requested {
        turn.cancel_requested_by_client_id = requester_client_id.or_else(|| Some("unknown".to_string()));
        turn.cancel_requested_at_ms = Some(now_ms());
        turn.cancel_reason = reason;
    }
    let snapshot = HostedTurnCancelSnapshot {
        session_id: turn.session_id.clone(),
        active_turn_id: turn.active_turn_id.clone(),
        owner_client_id: turn.owner_client_id.clone(),
        cancel_requested_by_client_id: turn.cancel_requested_by_client_id.clone(),
        cancel_requested_at_ms: turn.cancel_requested_at_ms,
        cancel_reason: turn.cancel_reason.clone(),
        already_requested,
    };
    drop(active);
    update_session_cancel_request(
        state,
        session_id,
        snapshot.cancel_requested_by_client_id.clone(),
        snapshot.cancel_requested_at_ms,
        snapshot.cancel_reason.clone(),
    );
    Ok(Some(snapshot))
}

pub fn request_hosted_turn_cancel_for_test(
    state: &AppState,
    session_id: &str,
    requester_client_id: Option<String>,
    reason: Option<String>,
) -> Result<HostedTurnCancelSnapshot> {
    request_hosted_turn_cancel(state, session_id, requester_client_id, reason)?
        .ok_or_else(|| anyhow!("hosted active turn not found: {session_id}"))
}
```

Add helper near `update_session_active_turn_owner`:

```rust
fn update_session_cancel_request(
    state: &AppState,
    session_id: &str,
    requester_client_id: Option<String>,
    requested_at_ms: Option<u64>,
    reason: Option<String>,
) {
    if let Ok(mut sessions) = state.cli_sessions.write() {
        if let Some(session) = sessions
            .iter_mut()
            .find(|session| session.session_id == session_id)
        {
            session.cancel_requested = true;
            session.cancel_requested_by_client_id = requester_client_id;
            session.cancel_requested_at_ms = requested_at_ms;
            session.cancel_reason = reason;
            session.updated_at_ms = now_ms();
        }
    }
}
```

Add:

```rust
fn extract_cancel_reason(payload: &Value) -> Option<String> {
    payload
        .get("reason")
        .and_then(Value::as_str)
        .or_else(|| payload.get("cancelReason").and_then(Value::as_str))
        .or_else(|| payload.get("cancel_reason").and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}
```

- [ ] **Step 6: Keep cancel metadata when ending active turn**

Replace `end_hosted_turn` with a version that does not erase cancel diagnostics from the session:

```rust
pub fn end_hosted_turn(state: &AppState, session_id: &str) {
    if let Ok(mut active) = state.hosted_active_turns.lock() {
        active.remove(session_id);
    }
    update_session_active_turn_owner(state, session_id, None, None, None);
}
```

Then update `update_session_active_turn_owner` to only touch active turn fields and not reset the new cancel requester fields.

In `connect_cli_session` and `mark_prompt_started`, explicitly reset stale cancel metadata when a new session or new turn starts:

```rust
session.cancel_requested = false;
session.cancel_requested_by_client_id = None;
session.cancel_requested_at_ms = None;
session.cancel_reason = None;
```

In `update_session_after_prompt`, do not overwrite cancel metadata unless a new prompt starts.

- [ ] **Step 7: Add turn-control event builders**

Add near `resolved_interaction_event` in `mcode-desktop/src-tauri/src/runtime/mod.rs`:

```rust
fn turn_cancel_requested_event(snapshot: &HostedTurnCancelSnapshot) -> AcpEventEnvelope {
    AcpEventEnvelope {
        event_type: "turn_cancel_requested".to_string(),
        connection_id: snapshot.session_id.clone(),
        data: json!({
            "sessionId": snapshot.session_id,
            "activeTurnId": snapshot.active_turn_id,
            "activeTurnOwnerClientId": snapshot.owner_client_id,
            "cancelRequestedByClientId": snapshot.cancel_requested_by_client_id,
            "cancelRequestedAtMs": snapshot.cancel_requested_at_ms,
            "reason": snapshot.cancel_reason,
        }),
    }
}

fn turn_cancelled_event(snapshot: &HostedTurnCancelSnapshot) -> AcpEventEnvelope {
    AcpEventEnvelope {
        event_type: "turn_cancelled".to_string(),
        connection_id: snapshot.session_id.clone(),
        data: json!({
            "sessionId": snapshot.session_id,
            "activeTurnId": snapshot.active_turn_id,
            "cancelRequestedByClientId": snapshot.cancel_requested_by_client_id,
            "status": "canceled",
        }),
    }
}
```

Add helper:

```rust
fn emit_event(event_sink: &Option<CliEventSink>, event: AcpEventEnvelope) {
    if let Some(sink) = event_sink.as_ref() {
        sink(event);
    }
}
```

- [ ] **Step 8: Route `acp_cancel` through active-turn cancellation**

Change `dispatch_desktop_proxy_with_event_sink` match arm:

```rust
"acp_cancel" => cancel_cli_session(state, payload, event_sink).await,
```

Change `dispatch_desktop_proxy_with_event_sink_arc` non-prompt path to preserve event sink for cancel:

```rust
match command {
    "acp_prompt" => dispatch_prompt_with_state_arc(state, payload, event_sink).await,
    "acp_cancel" => cancel_cli_session(state.as_ref(), payload, event_sink).await,
    _ => dispatch_desktop_proxy_with_event_sink(state.as_ref(), command, payload, event_sink).await,
}
```

Implement:

```rust
async fn cancel_cli_session(
    state: &AppState,
    payload: Value,
    event_sink: Option<CliEventSink>,
) -> Result<Value> {
    let session_id = extract_session_id(&payload)
        .ok_or_else(|| anyhow!("cli session id is required"))?
        .to_string();
    let cancel_snapshot = request_hosted_turn_cancel(
        state,
        &session_id,
        extract_source_client_id(&payload),
        extract_cancel_reason(&payload),
    )?;
    if let Some(snapshot) = cancel_snapshot.as_ref() {
        if !snapshot.already_requested {
            emit_event(&event_sink, turn_cancel_requested_event(snapshot));
            cancel_active_process(state, &session_id);
        }
    }

    let response = close_cli_session(state, payload, CliSessionStatus::Canceled).await?;
    if let Some(snapshot) = cancel_snapshot.as_ref() {
        if !snapshot.already_requested {
            emit_event(&event_sink, turn_cancelled_event(snapshot));
        }
        return Ok(json!({
            "id": session_id,
            "connectionId": session_id,
            "sessionId": session_id,
            "session_id": session_id,
            "status": "cancel_requested",
            "canceled": true,
            "activeTurnId": snapshot.active_turn_id,
            "activeTurnOwnerClientId": snapshot.owner_client_id,
            "cancelRequestedByClientId": snapshot.cancel_requested_by_client_id,
            "cancelRequestedAtMs": snapshot.cancel_requested_at_ms,
            "reason": snapshot.cancel_reason,
            "session": response.get("session").cloned().unwrap_or(Value::Null),
        }));
    }
    Ok(response)
}
```

After this change, remove the direct `cancel_active_process` call from `close_cli_session` to avoid duplicate cancellation; `cancel_cli_session` handles it for `acp_cancel`. If a future internal caller needs to close as canceled without going through `cancel_cli_session`, it must call `cancel_active_process` before `close_cli_session`.

In `close_cli_session`, delete this block:

```rust
if status == CliSessionStatus::Canceled {
    cancel_active_process(state, &session_id);
}
```

- [ ] **Step 9: Expose health diagnostics**

In `mcode-desktop/src-tauri/src/health.rs`, add to `DesktopHealthSnapshot`:

```rust
pub active_turn_cancel_requested_by_client_id: Option<String>,
pub active_turn_cancel_requested_at_ms: Option<u64>,
```

Change `active_turn_snapshot` tuple to include owner and cancel requester:

```rust
let active_turn_snapshot = state.hosted_active_turns.lock().ok().map(|active| {
    (
        active.len(),
        active.values().next().and_then(|turn| turn.owner_client_id.clone()),
        active
            .values()
            .next()
            .and_then(|turn| turn.cancel_requested_by_client_id.clone()),
        active.values().next().and_then(|turn| turn.cancel_requested_at_ms),
    )
});
```

Populate:

```rust
active_turn_count: active_turn_snapshot.as_ref().map(|(count, _, _, _)| *count).unwrap_or(0),
active_turn_owner_client_id: active_turn_snapshot
    .as_ref()
    .and_then(|(_, owner_client_id, _, _)| owner_client_id.clone()),
active_turn_cancel_requested_by_client_id: active_turn_snapshot
    .as_ref()
    .and_then(|(_, _, requester_client_id, _)| requester_client_id.clone()),
active_turn_cancel_requested_at_ms: active_turn_snapshot
    .and_then(|(_, _, _, requested_at_ms)| requested_at_ms),
```

- [ ] **Step 10: Run Desktop focused tests**

Run:

```bash
cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml --test desktop_p23_active_turn_control
cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml --test desktop_p22_multi_client_session
```

Expected: PASS.

- [ ] **Step 11: Update architecture note progress**

Append under P23 implementation progress:

```md
- Desktop now records active-turn cancel requester metadata, emits
  `turn_cancel_requested` and `turn_cancelled`, treats duplicate cancel requests
  as idempotent, and keeps the active-turn guard authoritative until
  cancellation settlement.
```

- [ ] **Step 12: Commit Desktop active turn control**

Run:

```bash
git add -- mcode-desktop/src-tauri/src/app_state.rs mcode-desktop/src-tauri/src/runtime/mod.rs mcode-desktop/src-tauri/src/health.rs mcode-desktop/src-tauri/tests/desktop_p23_active_turn_control.rs docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md docs/superpowers/plans/2026-06-28-mcode-p23-active-turn-control.md
git commit -m "feat(desktop): coordinate p23 active turn cancellation"
```

---

### Task 3: App Turn-control Event Handling

**Files:**
- Modify: `mcode-app/src/types/acp.ts`
- Modify: `mcode-app/src/api/acp.ts`
- Modify: `mcode-app/src/stores/conversationRuntime.ts`
- Modify: `mcode-app/tests/stores/conversationRuntime.spec.ts`
- Create: `mcode-app/tests/api/acpTurnControlEvents.spec.ts`
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`

**Interfaces:**
- Consumes: `getRelayClientId(): string` from `mcode-app/src/services/gateway/relayClientIdentity.ts`.
- Produces event types `turn_cancel_requested`, `turn_cancelled`, `turn_cancel_failed` in `EventEnvelope`.
- Produces runtime copy:
  - local requester: `正在取消当前任务...`
  - other requester: `其他设备正在取消当前任务。`
  - failure: `取消当前任务失败，请刷新后重试。`

- [ ] **Step 1: Add app runtime tests for turn-control events**

Append to `mcode-app/tests/stores/conversationRuntime.spec.ts`:

```ts
jest.mock('@/services/gateway/relayClientIdentity', () => ({
  getRelayClientId: jest.fn(() => 'client-phone'),
}))
```

If the file already has mocks at the top, place this alongside them before importing the store. Then append tests:

```ts
it('shows local cancel-request copy for active turn cancellation', () => {
  const { store, session } = prepareSession()
  session.status = 'thinking'

  store.handleEvent({
    type: 'turn_cancel_requested',
    connectionId: 'conn-1',
    data: {
      activeTurnId: 'turn-live',
      cancelRequestedByClientId: 'client-phone',
    },
  } as any)

  expect(session.status).toBe('thinking')
  expect(session.inputErrorMessage).toBe('正在取消当前任务...')
})

it('shows other-device cancel-request copy for active turn cancellation', () => {
  const { store, session } = prepareSession()
  session.status = 'thinking'

  store.handleEvent({
    type: 'turn_cancel_requested',
    connectionId: 'conn-1',
    data: {
      activeTurnId: 'turn-live',
      cancelRequestedByClientId: 'client-watch',
    },
  } as any)

  expect(session.status).toBe('thinking')
  expect(session.inputErrorMessage).toBe('其他设备正在取消当前任务。')
})

it('clears generating state after turn_cancelled', () => {
  const { store, session } = prepareSession()
  session.status = 'thinking'
  session.inputErrorMessage = '正在取消当前任务...'
  session.liveMessage = {
    role: 'assistant',
    content: [{ type: 'text', text: 'partial' }],
    isStreaming: true,
    timestamp: Date.now(),
  }

  store.handleEvent({
    type: 'turn_cancelled',
    connectionId: 'conn-1',
    data: { activeTurnId: 'turn-live', status: 'canceled' },
  } as any)

  expect(session.status).toBe('connected')
  expect(session.inputErrorMessage).toBeNull()
  expect(session.liveMessage).toBeNull()
})

it('surfaces recoverable copy after turn_cancel_failed', () => {
  const { store, session } = prepareSession()
  session.status = 'thinking'

  store.handleEvent({
    type: 'turn_cancel_failed',
    connectionId: 'conn-1',
    data: { message: 'provider refused interrupt' },
  } as any)

  expect(session.status).toBe('error')
  expect(session.inputErrorMessage).toBe('取消当前任务失败，请刷新后重试。')
})
```

- [ ] **Step 2: Run app runtime tests and verify failure**

Run:

```bash
cd mcode-app
npm run test:unit -- conversationRuntime
```

Expected: FAIL because event types and handlers do not exist yet.

- [ ] **Step 3: Extend ACP event types**

In `mcode-app/src/types/acp.ts`, extend `EventEnvelope["type"]`:

```ts
    | "turn_cancel_requested"
    | "turn_cancelled"
    | "turn_cancel_failed"
```

Add interfaces near `TurnCompleteEvent`:

```ts
export interface TurnCancelRequestedEvent {
  sessionId?: string | null
  activeTurnId?: string | null
  activeTurnOwnerClientId?: string | null
  cancelRequestedByClientId?: string | null
  cancelRequestedAtMs?: number | null
  reason?: string | null
}

export interface TurnCancelledEvent {
  sessionId?: string | null
  activeTurnId?: string | null
  cancelRequestedByClientId?: string | null
  status?: string | null
}

export interface TurnCancelFailedEvent {
  sessionId?: string | null
  activeTurnId?: string | null
  cancelRequestedByClientId?: string | null
  message?: string | null
}
```

- [ ] **Step 4: Normalize turn-control events in ACP API**

In `mcode-app/src/api/acp.ts`, add cases in `normalizeAcpEventRecord` before `turn_complete`:

```ts
      case "turn_cancel_requested":
        return {
          connectionId,
          type: "turn_cancel_requested",
          data: {
            sessionId: firstString(record.session_id, record.sessionId),
            activeTurnId: firstString(record.active_turn_id, record.activeTurnId),
            activeTurnOwnerClientId:
              firstString(record.active_turn_owner_client_id, record.activeTurnOwnerClientId) || null,
            cancelRequestedByClientId:
              firstString(record.cancel_requested_by_client_id, record.cancelRequestedByClientId) || null,
            cancelRequestedAtMs:
              firstNumber(record.cancel_requested_at_ms, record.cancelRequestedAtMs) ?? null,
            reason: firstString(record.reason, record.cancel_reason, record.cancelReason) || null,
          },
        }
      case "turn_cancelled":
        return {
          connectionId,
          type: "turn_cancelled",
          data: {
            sessionId: firstString(record.session_id, record.sessionId),
            activeTurnId: firstString(record.active_turn_id, record.activeTurnId),
            cancelRequestedByClientId:
              firstString(record.cancel_requested_by_client_id, record.cancelRequestedByClientId) || null,
            status: firstString(record.status) || "canceled",
          },
        }
      case "turn_cancel_failed":
        return {
          connectionId,
          type: "turn_cancel_failed",
          data: {
            sessionId: firstString(record.session_id, record.sessionId),
            activeTurnId: firstString(record.active_turn_id, record.activeTurnId),
            cancelRequestedByClientId:
              firstString(record.cancel_requested_by_client_id, record.cancelRequestedByClientId) || null,
            message: firstString(record.message) || null,
          },
        }
```

- [ ] **Step 5: Add ACP normalization tests**

Create `mcode-app/tests/api/acpTurnControlEvents.spec.ts`:

```ts
import { acpApi } from "@/api/acp"

describe("acpApi turn control event normalization", () => {
  it("normalizes turn_cancel_requested metadata", () => {
    expect(acpApi.normalizeRealtimeEvent({
      type: "turn_cancel_requested",
      connectionId: "conn-1",
      data: {
        session_id: "session-1",
        active_turn_id: "turn-1",
        active_turn_owner_client_id: "client-phone",
        cancel_requested_by_client_id: "client-watch",
        cancel_requested_at_ms: 1782630000000,
        reason: "user_cancelled_from_watch",
      },
    })).toMatchObject({
      type: "turn_cancel_requested",
      connectionId: "conn-1",
      data: {
        sessionId: "session-1",
        activeTurnId: "turn-1",
        activeTurnOwnerClientId: "client-phone",
        cancelRequestedByClientId: "client-watch",
        cancelRequestedAtMs: 1782630000000,
        reason: "user_cancelled_from_watch",
      },
    })
  })

  it("normalizes turn_cancelled metadata", () => {
    expect(acpApi.normalizeRealtimeEvent({
      type: "turn_cancelled",
      connectionId: "conn-1",
      data: {
        sessionId: "session-1",
        activeTurnId: "turn-1",
        cancelRequestedByClientId: "client-watch",
        status: "canceled",
      },
    })).toMatchObject({
      type: "turn_cancelled",
      connectionId: "conn-1",
      data: {
        sessionId: "session-1",
        activeTurnId: "turn-1",
        cancelRequestedByClientId: "client-watch",
        status: "canceled",
      },
    })
  })

  it("normalizes turn_cancel_failed metadata", () => {
    expect(acpApi.normalizeRealtimeEvent({
      type: "turn_cancel_failed",
      connectionId: "conn-1",
      data: {
        session_id: "session-1",
        active_turn_id: "turn-1",
        cancel_requested_by_client_id: "client-watch",
        message: "provider refused interrupt",
      },
    })).toMatchObject({
      type: "turn_cancel_failed",
      connectionId: "conn-1",
      data: {
        sessionId: "session-1",
        activeTurnId: "turn-1",
        cancelRequestedByClientId: "client-watch",
        message: "provider refused interrupt",
      },
    })
  })
})
```

- [ ] **Step 6: Handle turn-control events in runtime store**

In `mcode-app/src/stores/conversationRuntime.ts`, add import:

```ts
import { getRelayClientId } from "@/services/gateway/relayClientIdentity"
```

Add cases in `handleEvent` before `turn_complete`:

```ts
      case "turn_cancel_requested": {
        touchHotConversation(session.conversationId)
        const requester = firstString(event.data?.cancelRequestedByClientId)
        session.inputErrorMessage =
          requester && requester === getRelayClientId()
            ? "正在取消当前任务..."
            : "其他设备正在取消当前任务。"
        syncManagedSendPermission(session.conversationId)
        break
      }

      case "turn_cancelled":
        session.liveMessage = null
        session.pendingPermission = null
        session.pendingQuestion = null
        session.status = session.connectionId ? "connected" : "idle"
        session.inputErrorMessage = null
        session.apiRetry = null
        releaseHotConversation(session.conversationId)
        syncManagedSendPermission(session.conversationId)
        break

      case "turn_cancel_failed":
        touchHotConversation(session.conversationId)
        session.status = "error"
        session.inputErrorMessage = "取消当前任务失败，请刷新后重试。"
        syncManagedSendPermission(session.conversationId)
        break
```

- [ ] **Step 7: Run app focused tests**

Run:

```bash
cd mcode-app
npm run test:unit -- conversationRuntime
npm run test:unit -- acpTurnControlEvents
```

Expected: PASS.

- [ ] **Step 8: Update architecture note progress**

Append under P23 implementation progress:

```md
- App now normalizes P23 turn-control events and synchronizes local/other-device
  cancellation copy, cancelled idle transition, and recoverable cancel failure
  state across subscribed clients.
```

- [ ] **Step 9: Commit app turn-control handling**

Run:

```bash
git add -- mcode-app/src/types/acp.ts mcode-app/src/api/acp.ts mcode-app/src/stores/conversationRuntime.ts mcode-app/tests/stores/conversationRuntime.spec.ts mcode-app/tests/api/acpTurnControlEvents.spec.ts docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md docs/superpowers/plans/2026-06-28-mcode-p23-active-turn-control.md
git commit -m "feat(app): handle p23 turn control events"
```

---

### Task 4: P23 Verification and Progress Lock

**Files:**
- Modify: `docs/superpowers/plans/2026-06-28-mcode-p23-active-turn-control.md`
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`

**Interfaces:**
- Consumes: all previous task outputs.
- Produces: checked plan progress and final P23 status in architecture notes.

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

Expected: all pass. If any test fails, use `systematic-debugging` before changing code.

- [ ] **Step 2: Update plan checkboxes**

Check off every completed step in this file. Leave any blocked step unchecked with a short reason directly under that step.

- [ ] **Step 3: Finalize architecture note**

Add a final P23 status paragraph under the P23 section:

```md
P23 first slice status:

- Implemented client-identity forwarding coverage for `acp_cancel`.
- Implemented Desktop-hosted active-turn cancel requester metadata and
  cancellation lifecycle events.
- Implemented app turn-control event normalization and multi-device cancel copy.
- Not implemented: prompt queueing or a separate `acp_takeover` command.
```

- [ ] **Step 4: Commit P23 verification record**

Run:

```bash
git add -- docs/superpowers/plans/2026-06-28-mcode-p23-active-turn-control.md docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md
git commit -m "docs(app): record p23 active turn control completion"
```

---

## Self-Review

- Spec coverage: Tasks cover relay `acp_cancel` client identity, Desktop cancel requester metadata, idempotent cancel request handling, turn-control events, health/session diagnostics, app event normalization, local vs other-device copy, final cancelled/failed runtime behavior, compatibility docs, and native replication guidance.
- Placeholder scan: no `TBD`, `TODO`, or vague "implement later" steps remain.
- Type consistency: Plan consistently uses `targetAgent`, `clientId`, `sourceClientId`, `activeTurnId`, `activeTurnOwnerClientId`, `cancelRequestedByClientId`, `cancelRequestedAtMs`, `turn_cancel_requested`, `turn_cancelled`, and `turn_cancel_failed`.
