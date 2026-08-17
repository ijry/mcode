# Conversation Prompt Connection Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use Inline Execution for this plan. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Automatically recover one stale ACP conversation connection and retry the unsent prompt once.

**Architecture:** Keep stale-connection classification as a pure detail-send helper. Extend the conversation runtime with a focused invalidation API that drops local connection ownership and then reuses its existing discovery/connect flow. Both detail send surfaces call a shared retry helper so each draft is submitted at most twice and non-stale failures retain existing behavior.

**Tech Stack:** Vue 3, TypeScript, Pinia, Vitest, uni-app.

## Global Constraints

- Detect only backend connection not found errors; do not retry network, authentication, or agent failures.
- Invalidate client-side state before reconnecting; reconnect using existing conversation/external-session metadata.
- Retry the exact draft once only, without duplicating its optimistic user turn.
- Update docs/mcode-architecture-notes/ with web flow, compatibility, and native replication guidance.

---

### Task 1: Add failing helper tests

**Files:**
- Modify: mcode-app/tests/pages/conversation-detail/detailPromptSend.spec.ts
- Modify: mcode-app/src/pages/conversation-detail/detailPromptSend.ts

**Interfaces:**
- Produces: isConnectionNotFoundError(message: string): boolean

- [ ] Add assertions for backend acp_prompt: connection not found: <id> and unrelated errors.
- [ ] Run pnpm vitest run tests/pages/conversation-detail/detailPromptSend.spec.ts and verify the missing export fails.
- [ ] Implement a normalized case-insensitive classifier matching connection not found.
- [ ] Rerun the targeted test and verify it passes.

### Task 2: Add runtime stale-connection invalidation

**Files:**
- Modify: mcode-app/src/stores/conversationRuntime.ts
- Test: mcode-app/tests/stores/conversationRuntime.spec.ts

**Interfaces:**
- Produces: invalidateConnection(conversationId: number, expectedConnectionId?: string): boolean
- Consumes: connectionSessionManager.clearConversation(conversationId).

- [ ] Add a failing test that binds a managed connection, invalidates its matching ID, and verifies runtime and manager state no longer reuse it.
- [ ] Run pnpm vitest run tests/stores/conversationRuntime.spec.ts and verify failure.
- [ ] Implement invalidation by detaching realtime handlers, removing the cached connection, clearing the manager mapping, resetting connectionId, and making the session idle unless it is actively processing a turn.
- [ ] Rerun the targeted test and verify it passes.

### Task 3: Retry prompt once in both detail send paths

**Files:**
- Modify: mcode-app/src/pages/conversation-detail/index.vue
- Modify: mcode-app/src/pages/conversation-detail/ConversationDetailInteractivePane.vue
- Test: mcode-app/tests/pages/conversation-detail/detailPromptSend.spec.ts

**Interfaces:**
- Consumes: isConnectionNotFoundError(message) and runtime.invalidateConnection(conversationId, connectionId).
- Behavior: call acpPrompt once, then on stale-connection failure reconnect through ensureConversationReadyForSend() and submit the same blocks once.

- [ ] Add helper-level tests for retry decision so stale failures retry once and unrelated failures never retry.
- [ ] Run the prompt-send targeted test and verify it fails.
- [ ] Add a local send wrapper in each page that invalidates only the failing matching connection, reconnects, and retries once; create the optimistic turn only after a successful request.
- [ ] Rerun targeted prompt and runtime tests.

### Task 4: Document and verify

**Files:**
- Create: docs/mcode-architecture-notes/conversation-prompt-stale-connection-recovery.md

- [ ] Document stale-ID detection, invalidate/reconnect/retry data flow, UI behavior, backward compatibility, and iOS/Android replication.
- [ ] Run pnpm vitest run tests/pages/conversation-detail/detailPromptSend.spec.ts tests/stores/conversationRuntime.spec.ts.
- [ ] Inspect git diff --check and git status --short.
