# P40 Detail Live Scroll Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop conversation detail realtime output from periodically scrolling upward on Android.

**Architecture:** Add a small pure decision helper in `detailScrollState.ts` and use it from `scheduleViewportSync()`. Routine viewport sync will measure layout and scroll to bottom only when bottom-follow is enabled; explicit restore/history functions remain responsible for restoring anchors or scrollTop.

**Tech Stack:** TypeScript, Vue/uni-app, Jest.

## Global Constraints

- P40 is an app-side conversation detail stability fix.
- Do not change ACP, relay, Desktop, tunnel, proxy, or persistence protocols.
- Keep explicit restore/history/manual-bottom behavior intact.
- Every mcode change must update `docs/mcode-architecture-notes/`.

---

### Task 1: Add Viewport Sync Decision Helper

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/detailScrollState.ts`
- Modify: `mcode-app/tests/pages/conversation-detail/detailScrollState.spec.ts`

**Interfaces:**
- Produces: `resolveViewportSyncAction(input): ViewportSyncAction`

- [x] **Step 1: Add tests**

Cover restoring state, forced bottom, bottom-follow, and non-bottom routine sync.

- [x] **Step 2: Implement helper**

Return `none`, `bottom`, or `scrollTop`. Routine non-bottom sync returns `none`
unless an explicit scrollTop restore is requested.

### Task 2: Apply To Detail Page

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`

- [x] **Step 1: Replace fallback scrollTop restore**

Use `resolveViewportSyncAction()` in `scheduleViewportSync()`.

- [x] **Step 2: Keep explicit scroll paths untouched**

Do not modify `restoreScrollState()`, `loadOlderTurns()`, `scrollToBottom()`,
or manual bottom behavior except for imports.

### Task 3: Docs, Verification, Commit

**Files:**
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`

- [x] **Step 1: Update docs**

Document root cause, behavior, compatibility, and native guidance.

- [x] **Step 2: Run verification**

Run targeted conversation detail scroll tests.

- [x] **Step 3: Commit**

Commit message: `fix(app): add p40 live scroll stability`.
