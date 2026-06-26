# MCode Desktop P5 Official CLI Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `mcode-desktop` a first usable official CLI adapter layer for Claude and Codex, without exposing official credentials to MCode app or relay.

**Architecture:** P5 keeps mobile and relay protocols unchanged. Relay sends `proxy_request` frames to desktop; desktop routes those commands to runtime adapters, manages local process execution, and returns `proxy_response`. The first slice supports CLI detection/status, agent listing/options, and non-interactive prompt execution; richer session restore, permission prompts, and streaming event normalization remain follow-up work.

**Tech Stack:** Tauri 2 Rust backend, `tokio::process::Command`, serde JSON command payloads, Vue/Pinia desktop UI, Vitest, Cargo tests, existing `mcode-relay` proxy request protocol.

## Global Constraints

- Use `targetAgent`, not `targetType`.
- Desktop remains optional; MCode can still connect directly to `codeg` and `opencode`.
- Codex official CLI and Claude official CLI are exposed only as `mcode-desktop` capabilities.
- Relay must not receive official CLI tokens or credentials.
- User-visible copy must use `网关`, not newly introduced `中继`.
- P5 first slice does not promise full official CLI session restore or permission mediation.
- Every mcode change must update a Markdown note under `docs/mcode-architecture-notes/`.

---

## File Structure

- `mcode-desktop/src-tauri/src/runtime/mod.rs`
  - Owns common CLI status, process output, command routing, and capability refresh.
- `mcode-desktop/src-tauri/src/runtime/codex_cli.rs`
  - Detects and invokes Codex CLI. Uses `codex --version` and `codex exec --json --cd <dir> <prompt>` for non-interactive prompts when requested.
- `mcode-desktop/src-tauri/src/runtime/claude_cli.rs`
  - Detects Claude CLI. Returns installed/missing status and reserves non-interactive prompt invocation behind adapter functions.
- `mcode-desktop/src-tauri/src/gateway/upstream.rs`
  - Handles relay `proxy_request` frames and sends `proxy_response`.
- `mcode-desktop/src-tauri/src/commands.rs`
  - Adds a Tauri command to refresh CLI runtime status.
- `mcode-desktop/src-tauri/src/health.rs`
  - Includes CLI runtime statuses in health snapshots.
- `mcode-desktop/src-tauri/tests/desktop_p5_cli_adapters.rs`
  - Tests detection normalization, command routing, and upstream proxy response frames.
- `mcode-desktop/src/lib/runtimeApi.ts`
  - Adds CLI runtime status types and refresh command wrapper.
- `mcode-desktop/src/stores/desktopRuntime.ts`
  - Stores runtime statuses and updates capabilities.
- `mcode-desktop/src/pages/AgentsPage.vue`
  - New desktop UI tab for Codex/Claude CLI status.
- `mcode-desktop/src/App.vue`
  - Adds “智能体” tab.
- `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`
  - Documents P5 adapter boundary and native replication guidance.

### Task 1: Common Runtime Status And Detection

**Files:**
- Modify: `mcode-desktop/src-tauri/Cargo.toml`
- Modify: `mcode-desktop/src-tauri/src/runtime/mod.rs`
- Modify: `mcode-desktop/src-tauri/src/runtime/codex_cli.rs`
- Modify: `mcode-desktop/src-tauri/src/runtime/claude_cli.rs`
- Create: `mcode-desktop/src-tauri/tests/desktop_p5_cli_adapters.rs`

**Interfaces:**
- Produces:
  - `CliRuntimeKind`
  - `CliRuntimeStatus`
  - `refresh_cli_runtime_statuses()`
  - `detect_cli_runtime(kind, binary)`

- [ ] **Step 1: Add tests for status normalization**

Create tests that verify missing binaries return `installed = false`, version text is normalized, and capabilities map to `desktop.runtime.codex-cli` / `desktop.runtime.claude-cli`.

- [ ] **Step 2: Implement detection**

Use `tokio::process::Command` to run `<binary> --version`. Add `process` to the existing tokio feature list.

- [ ] **Step 3: Verify**

Run: `cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml --test desktop_p5_cli_adapters`

Expected: PASS.

### Task 2: Proxy Request Routing And Responses

**Files:**
- Modify: `mcode-desktop/src-tauri/src/runtime/mod.rs`
- Modify: `mcode-desktop/src-tauri/src/runtime/codex_cli.rs`
- Modify: `mcode-desktop/src-tauri/src/runtime/claude_cli.rs`
- Modify: `mcode-desktop/src-tauri/src/gateway/upstream.rs`
- Modify: `mcode-desktop/src-tauri/tests/desktop_p5_cli_adapters.rs`

**Interfaces:**
- Produces:
  - `dispatch_desktop_proxy(command, payload)`
  - `build_proxy_response_frame(request_id, result)`
  - `RelayControlFrame::ProxyRequest`

- [ ] **Step 1: Add routing tests**

Test `desktop_cli_status`, `acp_list_agents`, `acp_describe_agent_options`, unsupported command errors, and WebSocket `proxy_request` -> `proxy_response`.

- [ ] **Step 2: Implement routing**

Route status/options commands locally. Route `acp_prompt` to adapter-specific prompt execution only when payload selects `agentType = codex | claude_code`; otherwise return a clear error.

- [ ] **Step 3: Verify**

Run: `cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml --test desktop_p5_cli_adapters`

Expected: PASS.

### Task 3: Desktop UI And Health

**Files:**
- Modify: `mcode-desktop/src-tauri/src/commands.rs`
- Modify: `mcode-desktop/src-tauri/src/health.rs`
- Modify: `mcode-desktop/src-tauri/src/lib.rs`
- Modify: `mcode-desktop/src/lib/runtimeApi.ts`
- Modify: `mcode-desktop/src/stores/desktopRuntime.ts`
- Create: `mcode-desktop/src/pages/AgentsPage.vue`
- Modify: `mcode-desktop/src/App.vue`

**Interfaces:**
- Produces:
  - Tauri command `desktop_refresh_cli_status()`
  - Health field `cliRuntimes`
  - UI tab “智能体” showing Codex/Claude install/version/status.

- [ ] **Step 1: Add runtime API tests**

Extend `runtimeApi.spec.ts` to verify `refreshCliStatus()` invokes `desktop_refresh_cli_status`.

- [ ] **Step 2: Implement command and UI**

Refresh CLI status updates capabilities and health, while keeping credentials local.

- [ ] **Step 3: Verify**

Run: `cd mcode-desktop && npm test`

Run: `cd mcode-desktop && npm run build`

Expected: PASS.

### Task 4: Documentation And Full Verification

**Files:**
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`
- Modify: `mcode-desktop/README.md`

**Interfaces:**
- Produces:
  - P5 official CLI adapter architecture note and runbook.

- [ ] **Step 1: Update docs**

Document that P5 first slice supports detection, capability publication, proxy routing, and non-interactive prompt execution; full streaming/session/permission behavior remains follow-up work.

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

- Spec coverage: Covers P5 adapter foundation, desktop-only credential boundary, relay proxy request handling, capability exposure, and UI status. Full session restore and permission mediation are explicitly deferred.
- Placeholder scan: No `TBD`, `TODO`, or open-ended implementation steps are present.
- Type consistency: Uses `targetAgent`, `desktop.runtime.codex-cli`, `desktop.runtime.claude-cli`, `proxy_request`, and `proxy_response` consistently with existing relay protocol.
