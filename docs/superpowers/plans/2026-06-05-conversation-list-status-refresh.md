# Conversation List Status Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent stale conversation detail snapshots or remote list refreshes from overwriting newer live conversation statuses in the conversation list.

**Architecture:** Keep the existing conversation list/data flow intact, but normalize summary statuses into one canonical set and merge summary writes with timestamp-aware conflict resolution. Live/runtime states remain authoritative when they are newer, while newer terminal snapshots can still close out an active conversation.

**Tech Stack:** Vue 3, TypeScript, uni-app, sql.js-backed local repository

---

### Task 1: Canonicalize Summary Statuses

**Files:**
- Create: `mcode-app/src/services/conversation/conversationSummaryStatus.ts`
- Modify: `mcode-app/src/services/conversation/conversationDetailPersistence.ts`
- Modify: `mcode-app/src/services/conversation/conversationSyncService.ts`
- Modify: `mcode-app/src/pages/conversations/index.vue`
- Test: `pnpm exec vue-tsc --noEmit`

- [ ] **Step 1: Add a shared status helper**

```ts
export function normalizeConversationSummaryStatus(value?: string | null): string {
  // Map runtime-only states like connected/thinking to in_progress,
  // map idle to pending_review, and canonicalize legacy variants.
}
```

- [ ] **Step 2: Normalize detail snapshot writes**

```ts
status: normalizeConversationSummaryStatus(
  firstString(rawDetail.status, summary.status, currentSummary?.status) || "unknown"
)
```

- [ ] **Step 3: Normalize realtime status updates**

```ts
const normalizedStatus = mapRealtimeConversationStatusToSummaryStatus(
  nextStatus,
  current.status
)
```

- [ ] **Step 4: Normalize list rendering**

```ts
function normalizeConversationStatus(value?: string): string {
  return normalizeConversationSummaryStatus(value)
}
```

- [ ] **Step 5: Run type check**

Run: `pnpm exec vue-tsc --noEmit`
Expected: passes without introducing new type errors

### Task 2: Merge Stale Summary Writes Safely

**Files:**
- Modify: `mcode-app/src/services/db/repositories/conversationRepository.ts`
- Test: `pnpm exec vue-tsc --noEmit`

- [ ] **Step 1: Merge incoming summary rows before writing**

```ts
const current = await getConversationSummaryById(input.instanceKey, input.id)
const next = current
  ? mergeConversationSummaryRecord(current, input)
  : normalizeConversationSummaryRecord(input)
```

- [ ] **Step 2: Preserve newer terminal state from stale writes**

```ts
status: mergeConversationSummaryStatus({
  currentStatus: current.status,
  currentUpdatedAt: current.updatedAt,
  incomingStatus: incoming.status,
  incomingUpdatedAt: incoming.updatedAt,
})
```

- [ ] **Step 3: Prevent timestamp rollback**

```ts
updatedAt: Math.max(current.updatedAt, incoming.updatedAt),
lastMessageAt: Math.max(current.lastMessageAt, incoming.lastMessageAt),
```

- [ ] **Step 4: Re-run type check**

Run: `pnpm exec vue-tsc --noEmit`
Expected: passes without introducing new type errors
