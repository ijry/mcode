# MCode P29 Shared Queue Priority And Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or the repo's equivalent task execution flow. Track progress with checkbox items and keep this file updated as work lands.

**Goal:** Add Desktop-hosted shared queue reorder and priority controls for official CLI sessions so every paired client sees and can operate on the same ordered queue state.

**Architecture:** `mcode-desktop` remains the sole authority for shared prompt queue order and priority. The app only sends reorder/priority commands and renders queue state from Desktop snapshots and event pushes. Relay continues to forward requests and broadcasts without owning queue state. Queue order is deterministic, multi-client safe, and persisted through Desktop recovery alongside the existing P24-P27 queue state.

**Tech Stack:** Rust 2021, Tauri 2, existing Desktop runtime and recovery layers, existing ACP proxy/event flow, TypeScript/Vue app helpers, Jest unit tests, Rust integration tests.

**Status:** Implemented in this workspace; validation passed for the new P29 Desktop and app tests.

## Global Constraints

- Use `targetAgent`, never `targetType`.
- Do not add mobile-side `codex` or `claude` target agents.
- Do not move queue ownership into relay.
- Do not change prompt execution semantics, cancellation semantics, or clear-all semantics.
- Do not introduce drag-and-drop as a protocol dependency.
- Do not add prompt-body auditing or enterprise workflow changes.
- Every mcode change must update `docs/mcode-architecture-notes/`.
- Keep queue order and priority as shared Desktop session state, not local client state.

## File Structure

- Modify: `mcode-desktop/src-tauri/src/app_state.rs`
  - Add or refine queue order, priority, and capability metadata needed by the shared queue control surface.
- Modify: `mcode-desktop/src-tauri/src/runtime/mod.rs`
  - Add queue reorder and priority command handlers plus shared queue mutation helpers.
- Modify: `mcode-desktop/src-tauri/src/gateway/upstream.rs`
  - Forward the new queue commands and broadcast resulting queue events to subscribed clients.
- Modify: `mcode-desktop/src-tauri/src/health.rs`
  - Expose queue reorder / priority capability flags and ordered queue diagnostics.
- Modify: `mcode-desktop/src-tauri/src/recovery.rs`
  - Persist and restore queue ordering and priority metadata alongside existing queued prompt state.
- Create or modify: `mcode-desktop/src-tauri/tests/desktop_p29_shared_queue_priority.rs`
  - Cover reorder, priority, recovery, and invalid-state behavior.
- Modify: `mcode-app/src/api/acp.ts`
  - Add proxy wrappers for reorder and priority commands.
- Modify: `mcode-app/src/pages/conversation-detail/detailDraftQueue.ts`
  - Add helper logic for queue item ordering, priority, and capability gating.
- Modify: `mcode-app/src/pages/conversation-detail/detailPromptSend.ts`
  - Ensure queued prompt handling keeps the new shared queue state authoritative.
- Create or modify: `mcode-app/tests/api/acpQueuedPromptPriority.spec.ts`
  - Cover API wrappers and response handling for the new commands.
- Create or modify: `mcode-app/tests/pages/conversation-detail/detailDraftQueue.spec.ts`
  - Cover helper behavior for reorder / priority visibility and state handling.
- Modify: `docs/mcode-architecture-notes/2026-06-29-mcode-p29-shared-queue-priority.md`
  - Record implemented behavior and native replication guidance.
- Modify: `docs/superpowers/plans/2026-06-29-mcode-p29-shared-queue-priority.md`
  - Mark tasks complete as work lands.

---

### Task 1: Define And Pin The Queue Control Surface With Tests

**Files:**
- Create: `mcode-desktop/src-tauri/tests/desktop_p29_shared_queue_priority.rs`
- Create: `mcode-app/tests/api/acpQueuedPromptPriority.spec.ts`
- Create: `mcode-app/tests/pages/conversation-detail/detailDraftQueue.spec.ts`

**Interfaces:**
- Consumes: queue snapshot helpers, ACP proxy command wrappers, queue presentation helpers
- Produces: failing tests that pin the required reorder, priority, and gating behavior

- [ ] **Step 1: Write the Desktop reorder test**

Add a Rust integration test that seeds a Desktop session with at least three queued prompts and asserts:

- `acp_reorder_queued_prompt` changes `queuePosition`
- `turn_queue_reordered` is emitted
- the active turn is not modified
- reorder of a running item returns a recoverable `invalid_queue_state`

- [ ] **Step 2: Write the Desktop priority test**

Add a Rust integration test that asserts:

- `acp_set_queued_prompt_priority` updates `priorityTier`
- the ordered queue snapshot changes deterministically
- `turn_queue_priority_changed` is emitted
- priority changes survive snapshot restore

- [ ] **Step 3: Write the App API wrapper tests**

Add Jest coverage for the `acp.ts` wrappers that asserts:

- the app sends the new reorder and priority commands through the existing proxy surface
- the wrappers preserve `sessionId`, `queueItemId`, `sourceClientId`, and priority/action fields
- older or unsupported responses are surfaced as recoverable failures

- [ ] **Step 4: Write the App queue helper tests**

Add Jest coverage for `detailDraftQueue.ts` that asserts:

- reorder and priority controls are shown only when capability metadata is present
- non-queued items do not expose reorder / priority actions
- queue state stays authoritative to Desktop events instead of local-only state

- [ ] **Step 5: Run the tests and confirm the missing behavior**

Run:

```powershell
cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml p29_ -- --nocapture
npx jest --config jest.config.cjs --runInBand tests/api/acpQueuedPromptPriority.spec.ts tests/pages/conversation-detail/detailDraftQueue.spec.ts
```

Expected: failures that define the missing Desktop and App implementation work.

---

### Task 2: Add Desktop Queue Ordering And Priority State

**Files:**
- Modify: `mcode-desktop/src-tauri/src/app_state.rs`
- Modify: `mcode-desktop/src-tauri/src/runtime/mod.rs`
- Modify: `mcode-desktop/src-tauri/src/health.rs`

**Interfaces:**
- Consumes: `QueuedPromptItem`, `QueuedPromptSnapshot`, queue policy state, recovery snapshot state
- Produces: Desktop-owned queue ordering, priority metadata, and capability flags

- [ ] **Step 1: Extend queue item state only where needed**

Keep the existing queue model stable and add the minimum metadata required to support deterministic ordering and priority:

- `priorityTier`
- `queuePosition`
- ordering timestamps used for restore/reindex

- [ ] **Step 2: Make queue order deterministic**

Implement Desktop-owned reindexing so the queue can be rebuilt after mutation or restore. Preserve existing item identity and prompt content while recomputing positions.

- [ ] **Step 3: Expose capability metadata in health**

Add explicit capability flags for queue reorder and queue priority so the app can hide unsupported controls on older Desktop builds.

- [ ] **Step 4: Keep diagnostics readable**

Ensure health snapshots and diagnostics show ordered queue state without exposing raw prompt bodies beyond the existing bounded preview behavior.

---

### Task 3: Implement Queue Reorder And Priority Commands In Desktop

**Files:**
- Modify: `mcode-desktop/src-tauri/src/runtime/mod.rs`
- Modify: `mcode-desktop/src-tauri/src/gateway/upstream.rs`
- Modify: `mcode-desktop/src-tauri/src/recovery.rs`

**Interfaces:**
- Consumes: shared queue state, event push path, recovery snapshot store
- Produces: reorder and priority command handling plus event broadcasts

- [ ] **Step 1: Implement `acp_reorder_queued_prompt`**

Support `move_up`, `move_down`, `move_top`, and `move_bottom` for queued items in the same hosted session.

- [ ] **Step 2: Implement `acp_set_queued_prompt_priority`**

Support `low`, `normal`, and `high` priority tiers and recompute queue order deterministically after each change.

- [ ] **Step 3: Broadcast queue mutation events**

Emit `turn_queue_reordered`, `turn_queue_priority_changed`, and `turn_queue_updated` through the existing event push path so every connected client converges on the same view.

- [ ] **Step 4: Persist and restore queue state**

Persist the new order and priority metadata in Desktop recovery so restarts preserve the queue presentation and start order.

- [ ] **Step 5: Guard invalid transitions**

Reject reorder or priority changes for items that are no longer queued, and keep the failure recoverable for the app.

---

### Task 4: Surface Queue Controls In The App

**Files:**
- Modify: `mcode-app/src/api/acp.ts`
- Modify: `mcode-app/src/pages/conversation-detail/detailDraftQueue.ts`
- Modify: `mcode-app/src/pages/conversation-detail/detailPromptSend.ts`

**Interfaces:**
- Consumes: Desktop queue capability metadata, shared queue events, current conversation state
- Produces: App wrappers and helper logic for reorder / priority controls

- [ ] **Step 1: Add proxy wrappers**

Expose thin API helpers for the new Desktop commands while keeping the app unaware of Desktop internals.

- [ ] **Step 2: Gate controls on capability metadata**

Only show reorder and priority actions when the Desktop session advertises support for them.

- [ ] **Step 3: Keep queue state authoritative**

Ensure queued prompt presentation still updates from Desktop lifecycle events and snapshots, not from local optimistic order changes.

- [ ] **Step 4: Preserve failure UX**

Map unsupported or invalid queue mutations to recoverable app errors and keep the current queue rows visible.

---

### Task 5: Record The P29 Architecture Note

**Files:**
- Modify: `docs/mcode-architecture-notes/2026-06-29-mcode-p29-shared-queue-priority.md`

**Interfaces:**
- Produces: documented P29 behavior and native replication guidance

- [ ] **Step 1: Add implementation notes**

Describe the final Desktop queue order model, mutation events, and capability gating.

- [ ] **Step 2: Add native replication guidance**

State clearly that native clients must treat reorder and priority as shared Desktop state and must rebuild their visible queue from Desktop events.

- [ ] **Step 3: Mark this plan complete**

Update this file as each task lands and keep the wording aligned with the implemented behavior.

---

## Self-Review Checklist

- P29 stays inside the shared queue control surface and does not introduce new CLI protocols.
- The plan keeps Desktop as the queue authority and relay as transport only.
- The plan includes concrete tests before implementation.
- The plan separates Desktop state, Desktop commands, App wrappers, and documentation into distinct tasks.
- The plan preserves compatibility with P24-P27 queueing, persistence, and clear-all behavior.
