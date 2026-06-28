# MCode P16 Codex App-Server JSON-RPC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first real interactive Codex official CLI control channel in `mcode-desktop` using `codex app-server --listen stdio://`.

**Architecture:** Keep official CLIs behind `targetAgent = mcode-desktop`. Add a reusable newline-framed JSON-RPC stdio transport, use it from the Codex adapter when app-server mode is enabled, convert app-server notifications/requests into existing MCode ACP-style events, and resolve live permission/question requests through the existing `acp_respond_permission` / `acp_respond_question` proxy commands. Keep `codex exec --json` as fallback.

**Tech Stack:** Rust 2021, Tauri 2, Tokio process/io/sync, serde_json, existing desktop `CliEventSink`, existing relay `event_push` / `proxy_response`.

## Global Constraints

- Use `targetAgent`, not `targetType`.
- Do not introduce mobile-side `codex` or `claude` target agents; official CLIs remain `mcode-desktop` capabilities.
- Do not add VS Code/code-server assumptions.
- Every mcode change must update `docs/mcode-architecture-notes/`.
- P16 must not change relay wire protocol; reuse `/v1/proxy/:command`, `proxy_response.events[]`, and `event_push`.
- Codex app-server is an internal desktop adapter implementation; if it fails or is disabled, fall back to the existing `codex exec --json` path.
- Claude execution remains conservative until its official SDK/stream protocol is separately implemented.

---

### Task 1: JSON-RPC Stdio Transport

**Files:**
- Create: `mcode-desktop/src-tauri/src/runtime/json_rpc.rs`
- Modify: `mcode-desktop/src-tauri/src/runtime/mod.rs`
- Test: `mcode-desktop/src-tauri/tests/desktop_p16_jsonrpc.rs`

**Interfaces:**
- Produces: `JsonRpcStdioTransport`
- Produces: `JsonRpcMessageHandler`
- Produces: `JsonRpcInboundRequestHandler`

- [x] Add newline-framed JSON-RPC 2.0 request/response/notification parsing.
- [x] Spawn child processes with piped stdin/stdout/stderr and optional cwd.
- [x] Support outbound request with timeout and response/error matching by id.
- [x] Support inbound request callbacks and write JSON-RPC responses.
- [x] Support notifications for app-server timeline events.

### Task 2: Codex App-Server Adapter Path

**Files:**
- Modify: `mcode-desktop/src-tauri/src/runtime/codex_cli.rs`
- Modify: `mcode-desktop/src-tauri/src/app_state.rs`
- Test: `mcode-desktop/src-tauri/tests/desktop_p16_codex_app_server.rs`

**Interfaces:**
- Produces: `MCODE_DESKTOP_CODEX_APP_SERVER=1`
- Produces: `MCODE_DESKTOP_TEST_CODEX_APP_SERVER_COMMAND`
- Produces: fallback to `codex exec --json`

- [x] Prefer `codex app-server --listen stdio://` only when explicitly enabled.
- [x] Initialize app-server using `initialize` then `initialized`.
- [x] Start a Codex thread with `thread/start`.
- [x] Send prompt turns with `turn/start`.
- [x] Convert app-server notifications to ACP-style events in the existing event sink.
- [x] Return a compatible proxy response containing `runtime`, `status`, `events`, `eventCount`, and `streamedEventCount`.

### Task 3: Live Permission/Question Waiters

**Files:**
- Modify: `mcode-desktop/src-tauri/src/app_state.rs`
- Modify: `mcode-desktop/src-tauri/src/runtime/mod.rs`
- Modify: `mcode-desktop/src-tauri/src/runtime/codex_cli.rs`
- Test: `mcode-desktop/src-tauri/tests/desktop_p16_codex_app_server.rs`

**Interfaces:**
- Produces: `state.cli_interaction_waiters`
- Consumes: `acp_respond_permission`
- Consumes: `acp_respond_question`

- [x] Capture app-server inbound permission/question requests immediately into pending interaction state.
- [x] Store a oneshot waiter for live JSON-RPC request resolution.
- [x] Resolve the waiter from `acp_respond_permission` / `acp_respond_question`.
- [x] If no live waiter exists, keep P15 behavior and only mark pending state resolved.
- [x] Format permission responses in a provider-tolerant shape inspired by LinkShell.

### Task 4: Docs And Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-06-26-mcode-p7-p12-roadmap-status.md`
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`
- Test: desktop Rust test suite
- Test: desktop npm test/build
- Test: relay npm test

**Verification:**
- Run: `cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml p16_ -- --nocapture`
- Run: `cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml`
- Run: `cd mcode-desktop && npm test`
- Run: `cd mcode-desktop && npm run build`
- Run: `cd mcode-relay && npm test`

- [x] Document P16 behavior, compatibility, limitations, and native replication guidance.
- [x] Record P16 completion in the roadmap status document.
- [x] Run the verification commands and record any remaining risks.

## Completion Notes

- `cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml p16_ -- --nocapture`: passed.
- `cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml`: passed.
- `cd mcode-desktop && npm test`: passed.
- `cd mcode-desktop && npm run build`: passed.
- `cd mcode-relay && npm test`: passed.
- Remaining product risk: app-server is still opt-in until real Codex CLI version compatibility is validated outside fake test scripts.
