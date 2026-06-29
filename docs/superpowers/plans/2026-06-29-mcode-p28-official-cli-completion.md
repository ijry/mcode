# MCode P28 Official CLI Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Desktop-hosted official CLI lifecycle so Codex and Claude both expose a consistent commercial-grade session, streaming, interaction, cancel, and recovery surface under `mcode-desktop`.

**Architecture:** `mcode-desktop` owns a single official CLI host layer that wraps Codex and Claude adapters behind the same Desktop session model. The app and relay keep their current ACP-style protocol and never learn provider-specific process details. Provider-specific binaries and output quirks stay isolated in adapter modules; shared runtime helpers handle process execution, event normalization, cancel registration, diagnostics, and reconnect recovery.

**Tech Stack:** Rust 2021, Tauri 2, Tokio process/io/sync, serde/serde_json, existing Desktop runtime session registry, existing ACP-style event normalizer, existing relay event push protocol, Rust integration tests with fake CLI commands.

## Global Constraints

- Use `targetAgent`, never `targetType`.
- Do not add mobile-side `codex` or `claude` target agents.
- Do not add VS Code or code-server assumptions.
- Do not move official CLI state into relay.
- Do not change the app/relay external ACP-style protocol.
- Do not add new queue policy behavior; P24-P27 already own prompt queueing.
- Do not make the app understand CLI-specific process details.
- Every mcode change must update `docs/mcode-architecture-notes/`.
- Keep official CLI credentials, tokens, and process details local to Desktop.

---

## File Structure

- Modify: `mcode-desktop/src-tauri/src/runtime/mod.rs`
  - Centralize official CLI session lifecycle, session snapshots, and shared host behavior.
- Modify: `mcode-desktop/src-tauri/src/runtime/process_stdio.rs`
  - Extend generic streaming process execution for richer session state, cancel, and diagnostics plumbing.
- Modify: `mcode-desktop/src-tauri/src/runtime/codex_cli.rs`
  - Align Codex prompt/session handling with the shared host contract and diagnostics shape.
- Modify: `mcode-desktop/src-tauri/src/runtime/claude_cli.rs`
  - Complete Claude prompt/session handling with the same host contract and diagnostics shape.
- Modify: `mcode-desktop/src-tauri/src/app_state.rs`
  - Add any missing host/session bookkeeping fields that the shared runtime needs.
- Modify: `mcode-desktop/src-tauri/src/health.rs`
  - Expose richer official CLI session diagnostics for both providers.
- Create or modify: `mcode-desktop/src-tauri/tests/desktop_p28_official_cli_completion.rs`
  - Cover session shape, streaming, interactions, cancel, and reconnect behavior for both providers.
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`
  - Record P28 implemented behavior and native replication guidance.
- Modify: `docs/superpowers/plans/2026-06-29-mcode-p28-official-cli-completion.md`
  - Mark steps complete as work lands.

---

### Task 1: Define P28 Behavior With Failing Desktop Tests

**Files:**
- Create: `mcode-desktop/src-tauri/tests/desktop_p28_official_cli_completion.rs`

**Interfaces:**
- Consumes: `dispatch_desktop_proxy_with_state`, `dispatch_desktop_proxy_with_event_sink`, `build_health_snapshot`
- Produces: failing tests that pin the required P28 official CLI host behavior

- [x] **Step 1: Write the failing session-shape test**

Create the file with a test that opens a Codex session and a Claude session and asserts the same Desktop-owned snapshot shape:

```rust
#[tokio::test]
async fn p28_codex_and_claude_sessions_share_the_same_host_shape() {
    let state = AppState::new_for_test();
    let codex = dispatch_desktop_proxy_with_state(
        &state,
        "acp_connect",
        json!({ "agentType": "codex", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();
    let claude = dispatch_desktop_proxy_with_state(
        &state,
        "acp_connect",
        json!({ "agentType": "claude_code", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();

    assert_eq!(codex["targetAgent"], "mcode-desktop");
    assert_eq!(claude["targetAgent"], "mcode-desktop");
    assert_eq!(codex["status"], "connected");
    assert_eq!(claude["status"], "connected");
    assert!(codex["sessionId"].as_str().unwrap().len() > 8);
    assert!(claude["sessionId"].as_str().unwrap().len() > 8);
}
```

- [x] **Step 2: Write the failing streaming test**

Add a prompt test that feeds a fake Codex binary and a fake Claude binary through the same host boundary and asserts:

- both emit ordered `stream_batch` events
- both populate `runtime`, `protocol`, `eventCount`, and `streamedEventCount`
- both keep `lastEventAtMs` in the session snapshot

Use provider-specific temp scripts and environment overrides, similar to the existing P18/P16 tests.

- [x] **Step 3: Write the failing interaction test**

Add a prompt test for both providers that emits permission/question request records and asserts:

- pending interactions appear in `build_health_snapshot`
- resolved `acp_respond_permission` and `acp_respond_question` return `permission_resolved` / `question_resolved`
- session state keeps `targetAgent = mcode-desktop`

- [x] **Step 4: Write the failing cancel/reconnect test**

Add tests that assert:

- `acp_cancel` stops the active prompt for both providers
- a restarted Desktop snapshot marks running sessions as `interrupted`
- `stderrPreview` and `exitCode` remain visible in the health/session snapshot

- [x] **Step 5: Run the tests and confirm the current code is still incomplete**

Run:

```powershell
cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml p28_ -- --nocapture
```

Expected: failures or missing-behavior assertions that define the remaining P28 work.

---

### Task 2: Add A Shared Official CLI Host Contract

**Files:**
- Modify: `mcode-desktop/src-tauri/src/runtime/mod.rs`
- Modify: `mcode-desktop/src-tauri/src/app_state.rs`
- Modify: `mcode-desktop/src-tauri/src/health.rs`

**Interfaces:**
- Consumes: `CliRuntimeSession`, `CliPendingInteraction`, `HostedActiveTurn`, `CliProcessControl`
- Produces: a provider-neutral Desktop host session model and richer diagnostics

- [x] **Step 1: Add the host fields required by the tests**

If a test needs additional Desktop-owned state, add the minimum missing fields to `AppState` and `CliRuntimeSession`. Keep them provider-neutral.

Minimum accepted additions for this phase are:

- `active_turn_id`
- `active_turn_owner_client_id`
- `pendingPermissionCount`
- `pendingQuestionCount`
- `protocol`
- `recoverableState`

- [x] **Step 2: Make health expose the shared host snapshot**

Extend `DesktopHealthSnapshot` so both providers surface the same host diagnostics:

- current provider name
- protocol
- status
- last prompt preview
- last event timestamp
- exit code
- stderr preview
- pending interaction counts
- interruption/cancel diagnostics

- [x] **Step 3: Keep host state provider-neutral**

Ensure `acp_connect` / `acp_prompt` session creation and completion paths store the same Desktop-hosted shape for Codex and Claude, even if the underlying adapter differs.

---

### Task 3: Complete Shared Streaming And Interaction Plumbing

**Files:**
- Modify: `mcode-desktop/src-tauri/src/runtime/process_stdio.rs`
- Modify: `mcode-desktop/src-tauri/src/runtime/codex_cli.rs`
- Modify: `mcode-desktop/src-tauri/src/runtime/claude_cli.rs`
- Modify: `mcode-desktop/src-tauri/src/runtime/events.rs`

**Interfaces:**
- Consumes: `run_streaming_cli_process(...)`, `normalize_cli_output_events(...)`
- Produces: provider-neutral event batches, pending interaction capture, and cancellation behavior

- [x] **Step 1: Move generic process streaming into the shared helper**

`process_stdio.rs` should own the reusable execution path for:

- command spawning
- stdout/stderr collection
- cancel registration
- event sink emission
- exit-code / stderr-preview diagnostics

Keep provider-specific command building out of the helper.

- [x] **Step 2: Make Codex use the shared host contract**

Ensure Codex prompt execution returns the same host fields as Claude:

- `runtime`
- `protocol`
- `status`
- `canceled`
- `exitCode`
- `stderrPreview`
- `events`
- `eventCount`
- `streamedEventCount`

If Codex still has app-server special handling, keep it intact but make the CLI path conform to the same host contract.

- [x] **Step 3: Make Claude use the shared host contract**

Ensure Claude prompt execution uses the same host boundary and returns the same response shape. Keep permission and question records in the shared pending interaction model.

- [x] **Step 4: Preserve event ordering and deduplication**

Make sure structured provider output and line-based output both end up as ordered ACP-style events without double-counting or duplicate completion events.

---

### Task 4: Finalize Cancel, Recovery, And Diagnostics

**Files:**
- Modify: `mcode-desktop/src-tauri/src/runtime/mod.rs`
- Modify: `mcode-desktop/src-tauri/src/health.rs`
- Modify: `mcode-desktop/src-tauri/src/recovery.rs` if any session snapshot fields must be restored
- Modify: `mcode-desktop/src-tauri/tests/desktop_p28_official_cli_completion.rs`

**Interfaces:**
- Consumes: shared host session state
- Produces: stable cancel, interrupted-session, and recovery diagnostics

- [x] **Step 1: Make cancel terminate the active provider cleanly**

Verify `acp_cancel` cancels both Codex and Claude active sessions through the same Desktop host contract.

- [x] **Step 2: Ensure interrupted sessions recover as interrupted**

If Desktop restarts while a provider session is active, restore that session as `interrupted` rather than pretending it is resumable.

- [x] **Step 3: Surface the right diagnostics**

Make sure health/session snapshots expose:

- provider name
- protocol
- active turn id
- owner client id
- last prompt preview
- last event time
- pending interaction counts
- exit code
- stderr preview
- recoverable interruption state

- [x] **Step 4: Run the P28 tests again**

Run:

```powershell
cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml p28_ -- --nocapture
```

Expected: all P28 tests pass.

---

### Task 5: Record The P28 Architecture Note

**Files:**
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`

**Interfaces:**
- Produces: documented P28 behavior and native replication guidance

- [x] **Step 1: Add a P28 section to the architecture note**

Record:

- official CLI sessions are Desktop-hosted
- Codex and Claude share the same host contract
- the app still only sees ACP-style events
- recovery preserves `interrupted` state and diagnostics

- [x] **Step 2: Add native replication guidance**

Document that native clients should copy the session model, not the provider internals, and should treat interrupted official CLI sessions as requiring a new prompt.

- [x] **Step 3: Mark this plan complete**

Update the plan file as tasks complete and keep the wording consistent with the implemented Desktop behavior.

---

## Self-Review Checklist

- P28 stays inside `mcode-desktop` official CLI host behavior.
- The plan does not add new target agents, queue policy, or gateway behavior.
- The test-first task defines the expected session, streaming, interaction, and cancel surface before code changes.
- Shared host state, adapter-specific code, diagnostics, and docs are separated into different tasks.
- All file paths are exact and existing runtime/tests are reused where possible.
