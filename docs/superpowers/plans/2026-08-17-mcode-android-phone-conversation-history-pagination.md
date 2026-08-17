# Android Phone Conversation History Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use inline execution in the current checkout to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not create a worktree or delegate to subagents.

**Goal:** Rebuild Android phone conversation-detail history pagination on top of the current `main` so the server owns the page window, SQLite caches only the first tail window, and older pages remain remote-only in the active detail session.

**Architecture:** `detailHistoryPaging.ts` is the strict protocol boundary: it parses CodeG’s snake_case metadata, builds fixed-size requests, verifies page continuity and prefix-hash seams, merges turns deterministically, and advances an in-memory window. `conversationRuntime` stores one `historyWindow` per runtime session. `index.vue` owns tail-window hydration and the bounded SQLite cache; `ConversationDetailInteractivePane.vue` owns loading/validating/prepending an older remote page, discarding stale responses, and restoring the visible-item anchor. No local cursor may choose an older-page request.

**Tech Stack:** Vue 3 Composition API, Pinia, TypeScript, Jest, uni-app `scroll-view`, gateway RPC, sql.js SQLite.

## Global Constraints

- Work only in `mcode-app` plus Markdown documentation under this repository. Do not modify `ios_native` or `android-watch`.
- Execute inline in the current `main1` checkout. Do not create a worktree, do not delegate, do not use `git reset --hard`, `git checkout -- .`, or `git add .`.
- Keep `main1` based on the current `main`; preserve unrelated post-pagination commits. At the end, fold pagination changes into exactly the four pagination commit boundaries below rather than leaving a fifth corrective pagination commit.
- The initial request must be `get_folder_conversation({ conversationId, tailTurns: 30 })`; an older-page request must be `get_folder_conversation_turns({ conversationId, beforeIndex: historyWindow.turns_offset, limit: 30 })`.
- Require `turns_offset`, `turns_total`, `assistant_turns_before_offset`, and `prefix_hash` on every tail/page window, plus `prefix_hash_before_index` on every older page. Missing or invalid protocol data must surface an error containing `请升级 CodeG`; never fall back to a full-history fetch.
- SQLite may cache only the validated current tail window. Every older page is remote-only and memory-only: it must not call `persistConversationTurns`, write `conversation_turns` / `conversation_parts`, or be reloaded from SQLite after prepending.
- A successful tail refresh replaces the cached turn set for that conversation so pre-existing full-history or older-page rows cannot become a first screen or a local pagination source.
- Delete old local pagination machinery: `HistoryPageCursor`, `oldestLoadedCursor`, SQLite count/timestamp cursor calculations, `getOlderTurns` detail paging, and local-history expansion helpers used solely for detail pagination.
- Preserve current real-time and optimistic/user-message behavior. A remote page must never overwrite a volatile runtime state.
- Keep the active `ConversationDetailInteractivePane`; do not re-enable the disabled legacy `ConversationDetailBody` branch in `index.vue`.
- Do not add new theme aliases. If the UI must change, use existing `--up-*` uview runtime variables only.
- Update `docs/mcode-architecture-notes/2026-08-17-android-phone-conversation-history-pagination.md` with protocol/data flow, UI behavior, compatibility behavior, and native Android/iOS replication guidance.

---

## File Structure

| File | Responsibility after this work |
| --- | --- |
| `mcode-app/src/types/acp.ts` | Wire-compatible `ConversationHistoryWindow` and `ConversationTurnsPage` types. |
| `mcode-app/src/pages/conversation-detail/detailHistoryPaging.ts` | Protocol parsing, request payloads, seam/boundary checks, immutable merge, window advance. |
| `mcode-app/src/stores/conversationRuntime.ts` | Per-runtime-session `historyWindow` lifecycle; no cache-derived detail pagination expansion. |
| `mcode-app/src/pages/conversation-detail/ConversationDetailInteractivePane.vue` | Older remote page request, stale response guard, prepend, and visual anchor restoration only. |
| `mcode-app/src/pages/conversation-detail/index.vue` | Tail hydration plus first-window cache read/write; no local cursor/page loading state. |
| `mcode-app/src/services/conversation/conversationDetailPersistence.ts` | Replace a conversation’s cached turns atomically with the tail window; no standalone older-page persistence API. |
| `mcode-app/src/services/db/repositories/conversationRepository.ts` | Transactional delete-and-replace primitive for a single conversation’s cached turns and parts. |
| `mcode-app/src/pages/conversation-detail/detailScrollState.ts` / `detailTabState.ts` | Visual scroll state only; no history cursor or has-more state. |
| `mcode-app/tests/**` | Behavioral tests and source contracts for protocol strictness, session isolation, remote-only loading, cache replacement, and legacy-path removal. |

---

### Task 1: Add and verify the strict server-window protocol helpers

**Files:**
- Modify: `mcode-app/src/types/acp.ts`
- Create/Modify: `mcode-app/src/pages/conversation-detail/detailHistoryPaging.ts`
- Create/Modify: `mcode-app/tests/pages/conversation-detail/detailHistoryPaging.spec.ts`

**Interfaces:**
- Produces `ConversationHistoryWindow` with `turns_offset`, `turns_total`, `assistant_turns_before_offset`, `prefix_hash`, and optional `uncovered_prefix_max_ts`.
- Produces `ConversationTurnsPage extends ConversationHistoryWindow` with `turns: MessageTurn[]` and `prefix_hash_before_index`.
- Produces `DEFAULT_CONVERSATION_HISTORY_PAGE_SIZE = 30`, `buildTailHistoryRequest(conversationId)`, `buildOlderHistoryRequest(conversationId, beforeIndex)`, `requireConversationHistoryWindow(raw)`, `requireConversationTurnsPage(raw)`, `hasOlderConversationHistory(window)`, `canApplyOlderHistoryPage(current, page)`, `advanceConversationHistoryWindow(current, page)`, and `prependHistoryPageTurns(currentTurns, olderTurns)`.
- Consumed by Tasks 2–4.

- [ ] **Step 1: Write failing protocol tests.**

  Add individual tests that assert:

  ```ts
  expect(buildTailHistoryRequest(42)).toEqual({ conversationId: 42, tailTurns: 30 })
  expect(buildOlderHistoryRequest(42, 60)).toEqual({ conversationId: 42, beforeIndex: 60, limit: 30 })
  ```

  Add negative cases for absent metadata, fractional/negative/out-of-range offsets, missing/blank hashes, missing older-page seam hash, non-contiguous pages, total changes that invalidate the loaded boundary, and malformed optional timestamps. Each protocol failure must contain `请升级 CodeG`.

  Add a merge test proving the older page is prepended in chronological order, duplicate message ids are removed at the seam, and neither input array is mutated.

- [ ] **Step 2: Confirm the new tests fail for the intended missing/incorrect behavior.**

  Run:

  ```bash
  cd mcode-app
  npm run test:unit -- tests/pages/conversation-detail/detailHistoryPaging.spec.ts
  ```

  Expected: the new assertions fail because the present helper is incomplete or accepts an invalid window.

- [ ] **Step 3: Implement the smallest strict helper changes.**

  Preserve CodeG’s snake_case field names. Parse only non-negative safe integers; require `0 <= assistant_turns_before_offset <= turns_offset <= turns_total`; require non-blank hashes. Treat an invalid optional timestamp as invalid metadata only when the field is present. `canApplyOlderHistoryPage` must require a matching seam hash, `page.turns_offset < current.turns_offset`, exact `page.turns_offset + page.turns.length === current.turns_offset`, and a total compatible with the existing loaded tail boundary. `advanceConversationHistoryWindow` must retain the existing `turns_total` so a concurrent newly appended turn cannot move the loaded boundary.

- [ ] **Step 4: Verify green and inspect the diff.**

  Run the focused test from Step 2 and then:

  ```bash
  git diff --check
  git diff -- mcode-app/src/types/acp.ts mcode-app/src/pages/conversation-detail/detailHistoryPaging.ts mcode-app/tests/pages/conversation-detail/detailHistoryPaging.spec.ts
  ```

- [ ] **Step 5: Commit the protocol boundary.**

  Commit or create an autosquash fixup for the first pagination boundary:

  ```bash
  git add mcode-app/src/types/acp.ts mcode-app/src/pages/conversation-detail/detailHistoryPaging.ts mcode-app/tests/pages/conversation-detail/detailHistoryPaging.spec.ts
  git commit -m "feat(app): add conversation history paging protocol"
  ```

---

### Task 2: Keep the history window isolated to each runtime session

**Files:**
- Modify: `mcode-app/src/stores/conversationRuntime.ts`
- Modify: `mcode-app/tests/stores/conversationRuntime.spec.ts`

**Interfaces:**
- `RuntimeSession.historyWindow: ConversationHistoryWindow | null` belongs to exactly one conversation session.
- `setConversationHistoryWindow(conversationId, window)` copies/sets the active session window.
- `clearConversationHistoryWindow(conversationId)` clears it when a tail response is stale, invalid, or the session is reset.
- No `RuntimeSession` cache-hydration method may expand through local `getOlderTurns` pages for detail pagination.

- [ ] **Step 1: Write failing store tests.**

  Add tests with two sessions proving that setting a window for conversation A does not mutate B, a reset/eviction clears A’s window, and a newly created replacement session starts with `historyWindow: null`. Add a source/behavior test for the cache hydration helper proving it returns only the newest cached tail rows rather than paging through `getOlderTurns` to achieve user-turn coverage.

- [ ] **Step 2: Confirm the tests fail.**

  Run:

  ```bash
  cd mcode-app
  npm run test:unit -- tests/stores/conversationRuntime.spec.ts
  ```

  Expected: the added isolation/reset or local-expansion assertion fails.

- [ ] **Step 3: Implement per-session lifecycle changes.**

  Initialize `historyWindow` to `null` in the session factory, expose explicit set/clear methods, and clear it on paths that discard/recreate a non-hot session. Remove the local `getNewestTurnsWithUserCoverage`/`getOlderTurns` expansion loop from runtime cache hydration; retain only bounded newest-turn reading for first-screen cache recovery.

- [ ] **Step 4: Verify green and check the task diff.**

  ```bash
  cd mcode-app
  npm run test:unit -- tests/stores/conversationRuntime.spec.ts
  git diff --check
  ```

- [ ] **Step 5: Commit the session-state boundary.**

  ```bash
  git add mcode-app/src/stores/conversationRuntime.ts mcode-app/tests/stores/conversationRuntime.spec.ts
  git commit -m "feat(app): track conversation history windows per session"
  ```

---

### Task 3: Safely prepend an older remote page without persisting it

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/ConversationDetailInteractivePane.vue`
- Modify: `mcode-app/tests/pages/conversation-detail/conversationDetailBodyContract.spec.ts`
- Modify if necessary: `mcode-app/src/pages/conversation-detail/detailHistoryPaging.ts`
- Modify if necessary: `mcode-app/tests/pages/conversation-detail/detailHistoryPaging.spec.ts`

**Interfaces:**
- `loadOlderTurns()` reads only `runtimeSession.historyWindow.turns_offset` to create the older-page RPC request.
- It captures the conversation id, runtime session object, complete window fingerprint, and volatile-runtime fingerprint before awaiting the RPC.
- A matching page is prepended to `runtimeSession.localTurns`; then `runtime.setConversationHistoryWindow()` advances the in-memory window.
- No older-page path imports or calls `persistConversationTurns`, `getOlderTurns`, `getNewestTurns`, or a SQLite merge helper.

- [ ] **Step 1: Write failing loader/contract tests.**

  Extend the detail contract suite to assert that the active pane contains all of:

  ```ts
  buildOlderHistoryRequest(targetConversationId, capturedWindow.turns_offset)
  requireConversationTurnsPage(rawPage)
  isCurrentOlderHistoryRequest(...)
  canApplyOlderHistoryPage(capturedWindow, page)
  prependHistoryPageTurns(...)
  advanceConversationHistoryWindow(capturedWindow, page)
  ```

  Assert it does **not** contain `persistConversationTurns`, `getOlderTurns`, `getNewestTurns`, or `conversationDetailPersistence` imports. Add a focused pure test if a helper is extracted for stale-window fingerprint comparison.

  Keep/extend assertions that a seam mismatch clears the current window and emits a tail reload, that volatile streaming/permission/question/current-user-turn state prevents loading, and that `setProgrammaticAnchor(firstVisibleMessageId)` runs only after a successful prepend and `nextTick`.

- [ ] **Step 2: Confirm red.**

  ```bash
  cd mcode-app
  npm run test:unit -- tests/pages/conversation-detail/conversationDetailBodyContract.spec.ts tests/pages/conversation-detail/detailHistoryPaging.spec.ts
  ```

  Expected: the new remote-only assertion fails while the old persistence import/call exists.

- [ ] **Step 3: Implement the safe remote-only loader.**

  Remove the persistence import and call. Keep `loadingOlder` as an in-pane request guard. Before the request, reject inactive details, absent/non-earlier windows, and volatile runtime state. After parsing, discard a response unless it still targets the same active conversation, same session object, same window fields, no volatile state, and same runtime fingerprint. On invalid seam/boundary, clear the window and request a fresh tail window; never concatenate a potentially different history version. On success, normalize every page turn, prepend/dedupe into memory, advance the window, wait for Vue layout, then restore the pre-prepend visible anchor.

- [ ] **Step 4: Verify green.**

  Run the tests from Step 2, then:

  ```bash
  git diff --check
  git diff -- mcode-app/src/pages/conversation-detail/ConversationDetailInteractivePane.vue mcode-app/tests/pages/conversation-detail/conversationDetailBodyContract.spec.ts
  ```

- [ ] **Step 5: Commit page safety.**

  ```bash
  git add mcode-app/src/pages/conversation-detail/ConversationDetailInteractivePane.vue mcode-app/tests/pages/conversation-detail/conversationDetailBodyContract.spec.ts mcode-app/src/pages/conversation-detail/detailHistoryPaging.ts mcode-app/tests/pages/conversation-detail/detailHistoryPaging.spec.ts
  git commit -m "fix(app): validate conversation history page seams"
  ```

---

### Task 4: Integrate tail hydration, replace the bounded cache, and delete old local paging

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`
- Modify: `mcode-app/src/pages/conversation-detail/detailScrollState.ts`
- Modify: `mcode-app/src/pages/conversation-detail/detailTabState.ts`
- Modify: `mcode-app/src/services/conversation/conversationDetailPersistence.ts`
- Modify: `mcode-app/src/services/db/repositories/conversationRepository.ts`
- Modify: `mcode-app/tests/pages/conversation-detail/conversationDetailBodyContract.spec.ts`
- Modify/Delete obsolete expectations in: `mcode-app/tests/pages/conversation-detail/detailScrollState.spec.ts`, `mcode-app/tests/pages/conversation-detail/detailTabState.spec.ts`
- Modify: `mcode-app/tests/services/conversationDetailPersistence.spec.ts`
- Modify/Create: `mcode-app/tests/services/conversationRepository.spec.ts`
- Modify: `docs/mcode-architecture-notes/2026-08-17-android-phone-conversation-history-pagination.md`
- Modify: `docs/superpowers/plans/2026-08-17-mcode-android-phone-conversation-history-pagination.md`

**Interfaces:**
- Initial/refresh `get_folder_conversation` tail responses are parsed through `requireConversationHistoryWindow`, placed in the session, and may replace the single cached tail window.
- `replaceCompletedTurns(conversationId, inputs)` atomically removes prior `conversation_parts` and `conversation_turns` for that conversation, then persists only the normalized tail turns.
- `persistConversationDetailSnapshot()` calls the replacement operation only when `persistTurns !== false`; remove `persistConversationTurns()` entirely.
- `DetailTabState` and `detailScrollState.ts` no longer represent local history cursors or cache-derived `hasMoreHistory` state.

- [x] **Step 1: Write failing cache and removal tests.**

  Replace the old persistence test for `persistConversationTurns()` with a tail snapshot test. Mock the repository’s replacement primitive and assert it is called once with the normalized tail turns; assert the summary behavior is preserved. Add repository coverage for deletion order/transaction semantics so conversation parts are removed before turns, then the new tail records are inserted.

  Extend the detail contract test so `index.vue` does not contain `HistoryPageCursor`, `oldestLoadedCursor`, `getOlderTurns`, `countConversationTurns`, `getOldestCursorFromPersistedTurns`, `restoreHistoryCursorFromCache`, or local-cache-derived `beforeIndex` logic. Update tab/scroll-state tests to remove expected cursor fields and deleted helper exports.

- [x] **Step 2: Confirm red.**

  ```bash
  cd mcode-app
  npm run test:unit -- tests/services/conversationDetailPersistence.spec.ts tests/services/conversationRepository.spec.ts tests/pages/conversation-detail/detailScrollState.spec.ts tests/pages/conversation-detail/detailTabState.spec.ts tests/pages/conversation-detail/conversationDetailBodyContract.spec.ts
  ```

  Expected: the test suite fails because older-page persistence and local cursor code still exist.

- [x] **Step 3: Replace only the cached tail window.**

  Add a repository primitive that runs in one SQLite transaction: delete `conversation_parts` associated with the conversation’s old turns, delete those turns, then insert the current tail records. Make `persistConversationDetailSnapshot()` use it when tail turns are persisted. Delete the standalone `persistConversationTurns()` API.

  In `index.vue`, keep bounded `getNewestTurns(..., 30)` only for first-screen cache recovery; remove local cursor saving/restoring, local count checks, user-turn expansion loops, cache-derived has-more state, and disabled legacy older-page handler. A cached tail may render while the remote tail request is in flight, but a successful remote tail response replaces cache and session window. If the server cannot provide a valid window, surface the upgrade error and do not trigger a full-history fallback.

  Remove `HistoryPageCursor` and cursor helpers from `detailScrollState.ts`, cursor/has-more fields from `detailTabState.ts`, and their tests/imports. Do not remove generic visual scroll restoration helpers that are unrelated to pagination.

- [x] **Step 4: Update architectural documentation.**

  Make the architecture note explicitly state the initial-tail cache/replacement behavior, remote-only older-page behavior, stale response/seam handling, absence of fallback for old CodeG, and direct Android/iOS replication rules. Ensure the plan’s global constraints match the delivered behavior.

- [x] **Step 5: Verify green across affected suites.**

  ```bash
  cd mcode-app
  npm run test:unit -- tests/pages/conversation-detail/detailHistoryPaging.spec.ts tests/stores/conversationRuntime.spec.ts tests/pages/conversation-detail/conversationDetailBodyContract.spec.ts tests/pages/conversation-detail/detailScrollState.spec.ts tests/pages/conversation-detail/detailTabState.spec.ts tests/services/conversationDetailPersistence.spec.ts tests/services/conversationRepository.spec.ts
  git diff --check
  ```

- [ ] **Step 6: Commit integration and documentation.**

  ```bash
  git add docs/mcode-architecture-notes/2026-08-17-android-phone-conversation-history-pagination.md docs/superpowers/plans/2026-08-17-mcode-android-phone-conversation-history-pagination.md mcode-app/src/pages/conversation-detail/index.vue mcode-app/src/pages/conversation-detail/detailScrollState.ts mcode-app/src/pages/conversation-detail/detailTabState.ts mcode-app/src/services/conversation/conversationDetailPersistence.ts mcode-app/src/services/db/repositories/conversationRepository.ts mcode-app/tests/pages/conversation-detail/conversationDetailBodyContract.spec.ts mcode-app/tests/pages/conversation-detail/detailScrollState.spec.ts mcode-app/tests/pages/conversation-detail/detailTabState.spec.ts mcode-app/tests/services/conversationDetailPersistence.spec.ts mcode-app/tests/services/conversationRepository.spec.ts
  git commit -m "feat(app): integrate phone conversation history paging"
  ```

---

## Final Integration and History Verification

- [ ] Re-read the global constraints and verify every item against the final diff.
- [ ] Run the full suite:

  ```bash
  cd mcode-app
  npm run test:unit
  ```

- [ ] If the project’s local uni-app build environment is available, run the appropriate Android/custom build command and report the exact result; otherwise report that only unit verification was available.
- [ ] Verify no removed local-pagination symbol remains:

  ```bash
  rg -n 'HistoryPageCursor|oldestLoadedCursor|persistConversationTurns|getOlderTurns|countConversationTurns|getOldestCursorFromPersistedTurns|restoreHistoryCursorFromCache' mcode-app/src mcode-app/tests
  ```

  Expected: no hits except deliberately retained generic repository APIs not used by detail pagination; inspect every hit rather than hiding it.

- [ ] Verify history and whitespace:

  ```bash
  git diff --check main...HEAD
  git merge-base --is-ancestor main HEAD
  git log --oneline --reverse main..HEAD
  git status --short --branch
  ```

- [ ] Use an interactive autosquash rebase only after all tests are green to fold corrective pagination work and the pagination docs into the four required boundaries, while preserving unrelated commits after them. Re-run the focused suites and `git diff --check` after the history rewrite.
