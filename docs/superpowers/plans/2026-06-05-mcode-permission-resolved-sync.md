# MCode Permission Resolved Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `mcode-app` clear an inline permission card immediately when another client resolves the same ACP permission request.

**Architecture:** Add a small `permission_resolved` event shape to the front-end ACP protocol layer and route it into the existing runtime `clearPendingPermission` path keyed by request id.

**Tech Stack:** Vue 3, Pinia, uni-app, TypeScript, `vue-tsc`

---

### Task 1: Front-End ACP Event Support

**Files:**
- Modify: `mcode-app/src/types/acp.ts`
- Modify: `mcode-app/src/api/acp.ts`

- [ ] **Step 1: Extend event union**

Add `permission_resolved` to the allowed `EventEnvelope.type` union and define a tiny payload shape with `requestId`.

- [ ] **Step 2: Parse backend event**

Teach `AcpApiClient.normalizeEvent` to map backend `permission_resolved` records into the new frontend event shape using `request_id`.

- [ ] **Step 3: Verify static consistency**

Run: `npx vue-tsc --noEmit`
Expected: no new type errors caused by the ACP event additions.

### Task 2: Runtime Permission Cleanup

**Files:**
- Modify: `mcode-app/src/stores/conversationRuntime.ts`

- [ ] **Step 1: Handle resolved event**

Add a `permission_resolved` switch branch that clears only the matching pending permission request for the active session.

- [ ] **Step 2: Preserve stale-event safety**

Use the existing `clearPendingPermission(conversationId, requestId)` helper so an older resolved event cannot wipe a newer permission request.

- [ ] **Step 3: Re-run verification**

Run: `npx vue-tsc --noEmit`
Expected: only pre-existing repo baseline issues remain.
