# MCode P14 CLI Streaming Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `mcode-desktop` drive official CLI prompts with a cancellable process lifecycle and first-slice realtime event streaming.

**Architecture:** Keep Codex and Claude official CLIs behind `targetAgent = mcode-desktop`. Add an optional desktop runtime event sink so gateway upstream can push normalized CLI events before `proxy_response`. Track active session cancel handles in `AppState`; `acp_cancel` signals the running process and session state reflects cancellation/exit diagnostics.

**Tech Stack:** Rust 2021, Tauri 2, Tokio process/io/sync, existing `proxy_request` / `event_push` relay protocol.

## Global Constraints

- Use `targetAgent`, not `targetType`.
- Do not introduce mobile-side `codex` or `claude` target agents; official CLIs remain `mcode-desktop` capabilities.
- Do not add VS Code/code-server assumptions.
- Every mcode change must update `docs/mcode-architecture-notes/`.
- App agent-specific code must live under `mcode-app/src/agents/<agent>/` when app changes are needed.
- P14 must not change relay wire protocol; reuse `event_push` and `proxy_response`.

---

### Task 1: Add Runtime Event Sink And Active Process State

**Files:**
- Modify: `mcode-desktop/src-tauri/src/app_state.rs`
- Modify: `mcode-desktop/src-tauri/src/runtime/mod.rs`

**Interfaces:**
- Produces: `CliEventSink = Arc<dyn Fn(AcpEventEnvelope) + Send + Sync>`
- Produces: `dispatch_desktop_proxy_with_event_sink(state, command, payload, event_sink)`
- Produces: `state.cli_processes: Mutex<HashMap<String, CliProcessControl>>`

- [ ] Add a process-control registry to `AppState` keyed by `sessionId`.
- [ ] Add session fields for `lastEventAtMs`, `exitCode`, and `stderrPreview`.
- [ ] Add a proxy dispatcher overload that accepts an optional event sink and keeps the existing no-sink API compatible.
- [ ] Update session start/completion/error helpers to maintain the new diagnostic fields.

### Task 2: Stream Codex Output And Support Cancel

**Files:**
- Modify: `mcode-desktop/src-tauri/src/runtime/codex_cli.rs`
- Modify: `mcode-desktop/src-tauri/src/runtime/mod.rs`
- Test: `mcode-desktop/src-tauri/tests/desktop_p14_cli_streaming.rs`

**Interfaces:**
- Consumes: `CliEventSink`
- Consumes: `AppState.cli_processes`
- Produces: Codex `acp_prompt` streams normalized stdout lines through the sink while preserving final response `events`.
- Produces: `acp_cancel` kills the active child process for the session when present.

- [ ] Add test-only environment overrides for Codex binary and args so tests can run a fake process.
- [ ] Spawn Codex with piped stdout/stderr instead of `Command::output()`.
- [ ] Normalize each stdout line as soon as it arrives and emit events through the sink.
- [ ] Collect stdout/stderr for the final `proxy_response` body.
- [ ] Register a cancel channel before awaiting the child and remove it after exit.
- [ ] On `acp_cancel`, signal the channel, kill the process, and mark the session canceled.

### Task 3: Wire Gateway Upstream Realtime Event Push

**Files:**
- Modify: `mcode-desktop/src-tauri/src/gateway/upstream.rs`
- Test: `mcode-desktop/src-tauri/tests/desktop_p14_cli_streaming.rs`

**Interfaces:**
- Consumes: `dispatch_desktop_proxy_with_event_sink`
- Produces: upstream sends `event_push` frames during prompt execution and still sends `proxy_response` at completion.

- [ ] In proxy request handling, pass an event sink that serializes events as `event_push` frames to outbound WebSocket.
- [ ] Keep the existing post-response `events[]` conversion for compatibility.
- [ ] Add an upstream integration test using a fake Codex process that emits JSONL slowly.

### Task 4: Documentation And Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-06-26-mcode-p7-p12-roadmap-status.md`
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`

**Verification:**
- Run: `cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml`
- Run: `cd mcode-desktop && npm test`
- Run: `cd mcode-desktop && npm run build`

- [ ] Record P14 implemented scope, limitations, and native replication guidance.
- [ ] Verify Rust tests, desktop frontend tests, and desktop build.
