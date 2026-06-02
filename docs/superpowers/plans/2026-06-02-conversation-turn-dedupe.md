# Conversation Turn Dedupe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SQLite the single source of truth for completed conversation turns and dedupe turns across realtime, calibration, and replay.

**Architecture:** Add a stable persisted-turn dedupe key enforced by SQLite, then route all completed-turn writes through shared normalization and upsert helpers. After realtime completion succeeds, clear completed runtime buffers and reload the visible detail window from SQLite.

**Tech Stack:** Vue 3, Pinia, TypeScript, sql.js / plus.sqlite

---

### Task 1: Add persisted-turn dedupe schema

**Files:**
- Modify: `mcode-app/src/services/db/schema.ts`
- Modify: `mcode-app/src/services/db/migrations.ts`

- [ ] Add `dedupe_key` to `conversation_turns`.
- [ ] Add a unique index on `(conversation_id, dedupe_key)`.
- [ ] Add a lightweight migration path for existing local DBs.

### Task 2: Unify persisted turn normalization

**Files:**
- Modify: `mcode-app/src/services/db/repositories/conversationRepository.ts`
- Modify: `mcode-app/src/services/conversation/conversationDetailPersistence.ts`

- [ ] Extend persisted turn types with `dedupeKey`.
- [ ] Change turn writes to upsert by `(conversation_id, dedupe_key)`.
- [ ] Add stable content normalization and fallback fingerprint generation.

### Task 3: Make runtime hand off to SQLite

**Files:**
- Modify: `mcode-app/src/stores/conversationRuntime.ts`
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`
- Modify: `mcode-app/src/services/conversation/conversationSyncService.ts`

- [ ] Persist completed runtime turns through the shared upsert path.
- [ ] Reload the visible conversation window from SQLite after successful completion.
- [ ] Keep calibration / replay on the shared upsert path without duplicating turns.

### Task 4: Validate targeted behavior

**Files:**
- Verify: `mcode-app`

- [ ] Run `pnpm type-check`.
- [ ] Run `git diff --check` on changed files.
- [ ] Confirm only the pre-existing `MarkdownRenderer.vue` type issue remains if type-check still fails.
