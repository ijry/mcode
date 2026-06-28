# MCode Desktop P4 HTTP Tunnel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the first P4 tunnel path so MCode can access a desktop-configured loopback HTTP service through `mcode-relay`.

**Architecture:** Reuse the relay route already present at `/v1/tunnel/:targetId/:port/*`. Relay sends `tunnel_request` frames to the desktop upstream WebSocket; desktop validates the requested port against enabled loopback services, proxies the HTTP request to `127.0.0.1:<port>`, and replies with `tunnel_response`.

**Tech Stack:** `mcode-desktop` Rust/Tauri, `tokio-tungstenite`, `reqwest` for local HTTP only, Vue/Pinia frontend, Vitest, Cargo tests. `mcode-relay` remains the gateway peer and already owns HTTP authentication and request forwarding.

## Global Constraints

- Use `targetAgent`, not `targetType`.
- User-visible copy must use `网关`, not newly introduced `中继`.
- P4 HTTP tunnel remains loopback-only: only configured `127.0.0.1` services are allowed.
- Do not implement P5 Claude/Codex official CLI adapters in this phase.
- Do not claim raw TCP byte-stream support; this plan implements `tunnel.http` over request/response frames.
- Every mcode change must update a Markdown note under `docs/mcode-architecture-notes/`.

---

## File Structure

- `mcode-desktop/src-tauri/src/tunnel/mod.rs`
  - Aligns tunnel request/response structs with relay JSON and implements local loopback HTTP proxying.
- `mcode-desktop/src-tauri/src/gateway/upstream.rs`
  - Handles `tunnel_request` frames and sends `tunnel_response` frames.
- `mcode-desktop/src-tauri/src/app_state.rs`
  - Defaults local service config to `Code@127.0.0.1:1080` and stores access diagnostics.
- `mcode-desktop/src-tauri/src/health.rs`
  - Includes diagnostics in health snapshots.
- `mcode-desktop/src-tauri/tests/desktop_p4_http_tunnel.rs`
  - Covers loopback HTTP proxying and upstream tunnel responses.
- `mcode-desktop/src/lib/runtimeApi.ts`
  - Adds diagnostic types to health snapshots.
- `mcode-desktop/src/stores/desktopRuntime.ts`
  - Stores diagnostics and tunnel service status.
- `mcode-desktop/src/pages/TunnelPage.vue`
  - Shows enabled/disabled service state and recent access logs.
- `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`
  - Documents P4 HTTP tunnel behavior and native replication requirements.

### Task 1: Desktop Local HTTP Proxy

**Files:**
- Modify: `mcode-desktop/src-tauri/Cargo.toml`
- Modify: `mcode-desktop/src-tauri/src/tunnel/mod.rs`
- Modify: `mcode-desktop/src-tauri/tests/desktop_p4_http_tunnel.rs`

**Interfaces:**
- Produces:
  - `TunnelHttpRequest { port, method, path, query, headers, body }`
  - `TunnelHttpResponse { status, headers, body }`
  - `proxy_http_request(service, request)`
  - `serve_tunnel_request(state, request)`

- [ ] **Step 1: Add failing tests**

Create `mcode-desktop/src-tauri/tests/desktop_p4_http_tunnel.rs` with tests that start a local HTTP server on `127.0.0.1:0`, proxy a JSON request through `proxy_http_request`, and reject an unconfigured port through `serve_tunnel_request`.

- [ ] **Step 2: Implement minimal proxy**

Add `reqwest = { version = "0.12", default-features = false, features = ["json"] }` and implement local-only HTTP proxying. Forward safe headers, encode query params, convert JSON bodies, and parse JSON or text responses.

- [ ] **Step 3: Verify**

Run: `cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml desktop_p4_http_tunnel`

Expected: PASS.

### Task 2: Upstream Tunnel Frames

**Files:**
- Modify: `mcode-desktop/src-tauri/src/gateway/upstream.rs`
- Modify: `mcode-desktop/src-tauri/tests/desktop_p4_http_tunnel.rs`

**Interfaces:**
- Produces:
  - `build_tunnel_response_frame(request_id, result)`
  - `connect_upstream` handles `RelayControlFrame::TunnelRequest` by sending a `tunnel_response`.

- [ ] **Step 1: Add failing frame tests**

Extend `desktop_p4_http_tunnel.rs` with a WebSocket relay test that sends a `tunnel_request` to desktop and expects a `tunnel_response` with `ok: true`.

- [ ] **Step 2: Implement frame response**

Update `connect_upstream` to keep the writer in scope for relay frames and call `serve_tunnel_request` when a `TunnelRequest` arrives.

- [ ] **Step 3: Verify**

Run: `cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml desktop_p4_http_tunnel`

Expected: PASS.

### Task 3: Desktop UI State And Logs

**Files:**
- Modify: `mcode-desktop/src-tauri/src/app_state.rs`
- Modify: `mcode-desktop/src-tauri/src/health.rs`
- Modify: `mcode-desktop/src/lib/runtimeApi.ts`
- Modify: `mcode-desktop/src/stores/desktopRuntime.ts`
- Modify: `mcode-desktop/src/pages/TunnelPage.vue`

**Interfaces:**
- Produces:
  - `DiagnosticEntry` in health snapshots.
  - Tunnel page displays enabled service status and recent access/error logs.

- [ ] **Step 1: Add diagnostics to health**

Expose backend diagnostics in `DesktopHealthSnapshot` and map them in `runtimeApi.ts`.

- [ ] **Step 2: Update UI**

Show service enabled state, current bind, and recent diagnostics in `TunnelPage.vue`.

- [ ] **Step 3: Verify**

Run: `cd mcode-desktop && npm test`

Run: `cd mcode-desktop && npm run build`

Expected: PASS.

### Task 4: Documentation And Final Verification

**Files:**
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`
- Modify: `mcode-desktop/README.md`

**Interfaces:**
- Produces:
  - P4 HTTP tunnel architecture note and runbook.

- [ ] **Step 1: Update docs**

Document that P4 implements `tunnel.http` request/response frames through relay, remains loopback-only, and does not implement raw TCP streaming.

- [ ] **Step 2: Full verification**

Run:

```bash
cd mcode-desktop && npm test
cd mcode-desktop && npm run build
cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml
cd mcode-relay && npm test
cd mcode-relay && npm run typecheck
```

Expected: all pass.

## Self-Review

- Spec coverage: Implements P4 HTTP local port access through desktop and relay, with loopback validation and diagnostics. Raw TCP and CLI adapters remain explicitly out of scope.
- Placeholder scan: No `TBD`, `TODO`, or open-ended implementation steps are present.
- Type consistency: The plan uses `targetAgent`, `tunnel_request`, `tunnel_response`, `TunnelHttpRequest`, and `TunnelHttpResponse` consistently with existing relay protocol names.
