# MCode Force-Kill Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make mobile force-kill recovery restore the correct remote conversation runtime and live connection.

**Architecture:** Scope the local runtime table and repository by `instance_key + conversation_id`, then make the detail page read/write runtime with the resolved remote instance. Refresh auth before remote recovery calls and persist state after reconnect/snapshot hydration.

**Tech Stack:** uni-app, Vue 3, Pinia, sql.js SQLite, Jest.

---

### Task 1: Runtime Storage Isolation

**Files:**
- Modify: `mcode-app/src/services/db/schema.ts`
- Modify: `mcode-app/src/services/db/migrations.ts`
- Modify: `mcode-app/src/services/db/repositories/runtimeRepository.ts`

- [ ] Change `conversation_runtime` primary key to `(instance_key, conversation_id)`.
- [ ] Add a migration that rebuilds legacy `conversation_runtime` tables whose primary key is only `conversation_id`.
- [ ] Change runtime repository reads and deletes to require `instanceKey`.
- [ ] Keep `saveDraftState` preserving existing row fields for the same instance only.

### Task 2: Detail Recovery Wiring

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`

- [ ] Resolve `instanceKey` before local runtime reads.
- [ ] Call `getRuntime(instanceKey, conversationId)`.
- [ ] Call `saveDraftState` with the resolved instance key.
- [ ] Call `clearRuntime(instanceKey, conversationId)` when clearing detail runtime.
- [ ] Refresh gateway auth before remote detail metadata fetches.
- [ ] Persist runtime state after reconnect and live snapshot hydration.

### Task 3: Tests

**Files:**
- Create or modify: `mcode-app/tests/services/runtimeRepository.spec.ts`

- [ ] Add a test that stores two rows with the same `conversationId` and different `instanceKey` values.
- [ ] Add a test that verifies `saveDraftState` preserves fields for only the matching instance.
- [ ] Run `pnpm test:unit`.

### Task 4: Verification

**Files:**
- No new files expected.

- [ ] Run focused tests.
- [ ] Run the full unit suite if focused tests pass.
- [ ] Inspect `git diff` for accidental unrelated changes.
