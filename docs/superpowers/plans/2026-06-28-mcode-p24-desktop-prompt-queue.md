# MCode P24 Desktop Prompt Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Desktop-hosted prompt queue so multiple MCode clients can submit prompts to the same official CLI session and have Desktop run them serially.

**Architecture:** Desktop owns the queue per CLI `sessionId`, relay remains transport-only, and app clients consume queue events as shared session state. First slice uses in-memory queues only and auto-starts the next queued prompt after the active turn settles.

**Tech Stack:** Rust/Tauri/Tokio/Cargo tests for `mcode-desktop`; TypeScript/Jest for `mcode-app`; existing relay event transport.

## Global Constraints

- Use `targetAgent`, never `targetType`.
- Do not make relay the prompt queue owner.
- Do not persist queued prompts across Desktop restart in P24.
- Do not add mobile-side `codex` or `claude` target agents.
- Do not add a separate `acp_takeover` command.
- Every mcode change must update `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`.

---

## File Structure

- Modify `mcode-desktop/src-tauri/src/app_state.rs`: add queue storage.
- Modify `mcode-desktop/src-tauri/src/runtime/mod.rs`: add queue item model, enqueue/cancel helpers, queue events, and background auto-start.
- Modify `mcode-desktop/src-tauri/src/health.rs`: expose queue diagnostics.
- Create `mcode-desktop/src-tauri/tests/desktop_p24_prompt_queue.rs`: Desktop queue tests.
- Modify `mcode-app/src/types/acp.ts`: add queue event payload types.
- Modify `mcode-app/src/api/acp.ts`: normalize queue lifecycle events.
- Modify `mcode-app/src/stores/conversationRuntime.ts`: store shared queue state.
- Modify `mcode-app/tests/api/acpTurnControlEvents.spec.ts`: add queue event normalization tests.
- Modify `mcode-app/tests/stores/conversationRuntime.spec.ts`: add queue runtime state tests.
- Modify `mcode-app/src/pages/conversation-detail/detailPromptSend.ts`: treat queued prompt response as accepted.
- Modify `mcode-app/tests/pages/conversation-detail/detailPromptSend.spec.ts`: cover queued response acceptance.
- Modify `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`: record P24 protocol and native guidance.

## Task 1: Desktop Queue Core

**Files:**
- Modify: `mcode-desktop/src-tauri/src/app_state.rs`
- Modify: `mcode-desktop/src-tauri/src/runtime/mod.rs`
- Create: `mcode-desktop/src-tauri/tests/desktop_p24_prompt_queue.rs`

**Interfaces:**
- Produces `QueuedPromptItem`.
- Produces `enqueue_prompt_if_busy(...) -> Option<QueuedPromptSnapshot>`.
- Produces `acp_cancel_queued_prompt`.
- Produces queue events through existing `CliEventSink`.

- [ ] Step 1: Add `queued_prompts: Mutex<HashMap<String, Vec<QueuedPromptItem>>>` to `AppState`.
- [ ] Step 2: Add `QueuedPromptItem` and `QueuedPromptSnapshot` structs in `runtime/mod.rs`.
- [ ] Step 3: In `dispatch_desktop_proxy_with_event_sink`, route `acp_cancel_queued_prompt`.
- [ ] Step 4: When `begin_hosted_turn` returns `turn_busy`, enqueue the prompt if `queueIfBusy !== false`.
- [ ] Step 5: Return `status = queued`, `queued = true`, `queueItemId`, `queuePosition`, `queueLength`, `activeTurnId`, and `activeTurnOwnerClientId`.
- [ ] Step 6: Emit `turn_queued` and `turn_queue_updated`.
- [ ] Step 7: Add tests for enqueue response and queue full rejection.

## Task 2: Desktop Auto-Start And Cancel

**Files:**
- Modify: `mcode-desktop/src-tauri/src/runtime/mod.rs`
- Modify: `mcode-desktop/src-tauri/src/health.rs`
- Modify: `mcode-desktop/src-tauri/tests/desktop_p24_prompt_queue.rs`

**Interfaces:**
- Consumes `dispatch_prompt_with_state_arc`.
- Produces queue diagnostics in health snapshot.

- [ ] Step 1: Add `start_next_queued_prompt_if_idle(state: Arc<AppState>, sessionId, eventSink)`.
- [ ] Step 2: Call it after successful prompt completion, prompt error, and cancel settlement.
- [ ] Step 3: Emit `turn_dequeued` and `turn_started` when a queued item begins.
- [ ] Step 4: Implement `acp_cancel_queued_prompt` for queued items.
- [ ] Step 5: Expose queue count and per-session summaries in health.
- [ ] Step 6: Add tests for cancel queued item and auto-start next queued item after active turn ends.

## Task 3: App Protocol And Runtime State

**Files:**
- Modify: `mcode-app/src/types/acp.ts`
- Modify: `mcode-app/src/api/acp.ts`
- Modify: `mcode-app/src/stores/conversationRuntime.ts`
- Modify: `mcode-app/tests/api/acpTurnControlEvents.spec.ts`
- Modify: `mcode-app/tests/stores/conversationRuntime.spec.ts`

**Interfaces:**
- Produces `TurnQueuedEvent`, `TurnQueueUpdatedEvent`, `TurnDequeuedEvent`, `TurnStartedEvent`, `TurnQueueCancelledEvent`, `TurnQueueFailedEvent`.
- Produces runtime shared queue fields on the conversation session.

- [ ] Step 1: Add ACP queue event payload interfaces and union members.
- [ ] Step 2: Normalize queue events in `acp.ts`.
- [ ] Step 3: Add `sharedPromptQueue` state to conversation runtime sessions.
- [ ] Step 4: Handle queue events by updating queue count/items and copy.
- [ ] Step 5: Add app unit tests for event normalization and runtime state updates.

## Task 4: App Send Acceptance

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/detailPromptSend.ts`
- Modify: `mcode-app/tests/pages/conversation-detail/detailPromptSend.spec.ts`
- Modify: `mcode-app/src/pages/conversation-detail/index.vue` if required by existing helper signatures.

**Interfaces:**
- Consumes ACP prompt response body.
- Produces send-attempt result that treats `status = queued` as accepted.

- [ ] Step 1: Add helper `isQueuedPromptResponse(response)` in `detailPromptSend.ts`.
- [ ] Step 2: Use helper in send path so queued response does not remove optimistic user turn as failure.
- [ ] Step 3: Keep existing `turn_busy` failure behavior for older Desktop or `queueIfBusy = false`.
- [ ] Step 4: Add focused unit tests.

## Task 5: Docs, Verification, Commit

**Files:**
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`
- Modify: this plan file

- [ ] Step 1: Add P24 architecture note section with protocol, compatibility, and native guidance.
- [ ] Step 2: Mark plan progress complete.
- [ ] Step 3: Run `cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml`.
- [ ] Step 4: Run `cd mcode-app; npm run test:unit`.
- [ ] Step 5: Run `git diff --check`.
- [ ] Step 6: Commit with `git commit -m "feat(desktop): queue p24 hosted prompts"`.

## Self-Review

- Spec coverage: Desktop enqueue, queue events, auto-start, cancel queued prompt, app normalization/runtime state, queued send acceptance, docs, and tests are covered.
- Scope control: P24 does not persist queued prompts and does not move queue ownership to relay.
- Type consistency: plan uses `sessionId`, `queueItemId`, `sourceClientId`, `activeTurnId`, and `targetAgent` consistently.

