# Conversation List Status Freshness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the conversation list reflect fresh status when returning to the page and keep persisted summary statuses aligned with conversation-level status semantics.

**Architecture:** Keep the existing conversation list data flow, but add an explicit force-refresh path so lifecycle refreshes are not blocked by the 15-second cache gate. Normalize runtime/realtime statuses back into conversation-summary statuses before writing SQLite summaries, so list rendering continues to use one stable status vocabulary.

**Tech Stack:** uni-app, Vue 3, Pinia, TypeScript, local SQLite summary repository

---

### Task 1: Force overview refresh on explicit reload paths

**Files:**
- Modify: `mcode-app/src/pages/conversations/index.vue`

- [ ] Add a `force` option to `loadOverviewData()`.
- [ ] Make `onShow` call the forced path so returning from detail always refreshes.
- [ ] Make pull-to-refresh and post-mutation reloads use the forced path.

### Task 2: Normalize persisted summary status vocabulary

**Files:**
- Modify: `mcode-app/src/services/conversation/conversationSyncService.ts`

- [ ] Add a local mapper from runtime status to conversation summary status.
- [ ] Convert realtime `status_changed` events before `upsertConversationSummary()`.
- [ ] Preserve existing turn-complete calibration path as the source of terminal truth.

### Task 3: Verify targeted behavior

**Files:**
- Modify: none

- [ ] Run a TypeScript check or targeted lint/test command for touched files if available.
- [ ] Re-read diffs for `index.vue` and `conversationSyncService.ts` to confirm no unrelated changes.
