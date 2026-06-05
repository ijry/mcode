# MCode Inline Permission Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render agent permission requests inline above the composer in `mcode-app` and let users respond by tapping the server-provided options.

**Architecture:** Normalize ACP pending-permission payloads into `conversationRuntime` session state, hydrate the same state from snapshots, and let the conversation detail page render and submit that state through the existing `acp_respond_permission` API.

**Tech Stack:** Vue 3, Pinia, uni-app, TypeScript, `vue-tsc`

---

### Task 1: Runtime Permission State

**Files:**
- Modify: `mcode-app/src/types/acp.ts`
- Modify: `mcode-app/src/stores/conversationRuntime.ts`

- [ ] **Step 1: Add runtime-facing permission types and session field**

Add `pendingPermission: PermissionRequest | null` to `RuntimeSession` and ensure `PermissionRequest` / `PermissionOption` remain available from `@/types/acp`.

- [ ] **Step 2: Normalize snapshot pending permission**

Implement a helper in `conversationRuntime.ts` that maps `snapshot.pending_permission` into the existing runtime permission shape using the raw request id, tool-call-derived description, and ACP option list.

- [ ] **Step 3: Update live event handling**

When `handleEvent()` receives `permission_request`, store the normalized request on the session instead of only flipping status.

- [ ] **Step 4: Clear lifecycle state**

Clear `pendingPermission` during `turn_complete`, `disconnect`, and `clearSession`, and expose a tiny runtime method for local UI success-path clearing.

- [ ] **Step 5: Verify type integrity**

Run: `npx vue-tsc --noEmit`
Expected: no new type errors from permission-state changes.

### Task 2: Inline Conversation Detail UI

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`

- [ ] **Step 1: Remove dead picker path**

Delete the unused permission picker refs/template block and replace them with computed state for the active pending permission request.

- [ ] **Step 2: Render inline permission card**

Add a card above the composer with title, description, empty-state hint, and one button per option.

- [ ] **Step 3: Submit approval responses**

Implement a submit handler that guards missing ids, calls `acpApi.acpRespondPermission`, shows loading state, clears runtime pending permission on success, and surfaces a toast on failure.

- [ ] **Step 4: Add scoped styles**

Style the card and actions so it reads as a system approval surface and works in the existing mobile layout.

- [ ] **Step 5: Verify page types**

Run: `npx vue-tsc --noEmit`
Expected: conversation detail still type-checks after the UI changes.

### Task 3: Manual Validation

**Files:**
- No file changes

- [ ] **Step 1: Inspect git diff**

Run: `git diff -- mcode-app/src/types/acp.ts mcode-app/src/stores/conversationRuntime.ts mcode-app/src/pages/conversation-detail/index.vue docs/superpowers/specs/2026-06-05-mcode-inline-permission-approval-design.md docs/superpowers/plans/2026-06-05-mcode-inline-permission-approval.md`
Expected: diff only contains the inline permission approval work.

- [ ] **Step 2: Summarize residual risk**

Record that this change is type-checked but still depends on live ACP permission payloads for end-to-end runtime verification.
