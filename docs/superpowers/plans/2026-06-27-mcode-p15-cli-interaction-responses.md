# MCode P15 CLI Interaction Responses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first official CLI permission/question response loop inside `mcode-desktop` without guessing unstable official CLI stdin protocols.

**Architecture:** Keep official CLIs behind `targetAgent = mcode-desktop`. Capture normalized `permission_request` and `question_request` events into desktop session state, expose `acp_respond_permission` and `acp_respond_question` proxy commands, emit resolved ACP events through the existing `event_push` path, and keep the actual official CLI adapter write-back as an internal future implementation.

**Tech Stack:** Rust 2021, Tauri 2, Tokio sync, existing desktop `CliEventSink`, existing relay `event_push` / `proxy_response`.

## Global Constraints

- Use `targetAgent`, not `targetType`.
- Do not introduce mobile-side `codex` or `claude` target agents; official CLIs remain `mcode-desktop` capabilities.
- Do not add VS Code/code-server assumptions.
- Every mcode change must update `docs/mcode-architecture-notes/`.
- P15 must not change relay wire protocol; reuse `/v1/proxy/:command` and `event_push`.
- Do not write to Codex/Claude stdin until their interactive control protocol is verified.

---

### Task 1: Add Pending Interaction State

**Files:**
- Modify: `mcode-desktop/src-tauri/src/app_state.rs`
- Modify: `mcode-desktop/src-tauri/src/runtime/mod.rs`
- Modify: `mcode-desktop/src-tauri/src/health.rs`

**Interfaces:**
- Produces: `CliPendingInteraction`
- Produces: `state.cli_pending_interactions`
- Produces: health snapshot field `cliPendingInteractions`

- [ ] Store pending permission/question interactions keyed by normalized interaction id.
- [ ] Capture `permission_request` and `question_request` events when they pass through the runtime event sink.
- [ ] Include pending interactions in desktop health so the UI can show blocked sessions.

### Task 2: Add Response Proxy Commands

**Files:**
- Modify: `mcode-desktop/src-tauri/src/runtime/mod.rs`
- Modify: `mcode-desktop/src-tauri/src/gateway/upstream.rs`

**Interfaces:**
- Produces: `acp_respond_permission`
- Produces: `acp_respond_question`
- Produces: resolved `permission_resolved` / `question_resolved` ACP events

- [ ] Add response commands that validate session id and pending interaction id.
- [ ] Mark pending interaction resolved with decision/value metadata.
- [ ] Return a proxy response body containing `events[]`.
- [ ] Reuse upstream event forwarding so mobile clients receive the resolved event.

### Task 3: Desktop UI Diagnostics

**Files:**
- Modify: `mcode-desktop/src/lib/runtimeApi.ts`
- Modify: `mcode-desktop/src/pages/AgentsPage.vue`

**Interfaces:**
- Consumes: `cliPendingInteractions`
- Produces: visible pending interaction count and latest pending interaction summary.

- [ ] Add TypeScript types for pending interactions.
- [ ] Show pending interaction count and latest permission/question summary on the Agents page.

### Task 4: Tests, Docs, Verification

**Files:**
- Test: `mcode-desktop/src-tauri/tests/desktop_p15_cli_interactions.rs`
- Modify: `docs/superpowers/plans/2026-06-26-mcode-p7-p12-roadmap-status.md`
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`

**Verification:**
- Run: `cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml p15_ -- --nocapture`
- Run: `cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml`
- Run: `cd mcode-desktop && npm test`
- Run: `cd mcode-desktop && npm run build`
- Run: `cd mcode-relay && npm test`

- [ ] Add tests for capturing permission/question pending state.
- [ ] Add tests for response commands producing resolved events.
- [ ] Document P15 behavior, compatibility, limitations, and native replication guidance.
