# MCode Conversation Detail Logic Cleanup Design

## Goal

Reduce the size and cognitive load of `mcode-app/src/pages/conversation-detail/index.vue` by extracting pure, testable logic from the page into focused TypeScript helper modules.

This first phase must preserve current UI, routing, API calls, runtime lifecycle, realtime behavior, local cache behavior, dark-mode styling, and mobile/native compatibility.

## Current Context

`conversation-detail/index.vue` is the active conversation detail page. It is currently responsible for template rendering, lifecycle hooks, remote and local detail hydration, realtime runtime binding, scroll restoration, composer state, draft queue handling, attachment upload, permission responses, ask-question responses, plan-task extraction, normalization, and presentation formatting.

The older `session-detail/index.vue` is a minimal legacy page and is not used by the current conversation navigation paths. This cleanup targets only `conversation-detail/index.vue`.

Recent architecture work made conversation detail local-first with SQLite-backed turns, realtime runtime authority, PC tab synchronization, hot-session preservation, token usage backfill, and stopped-session tail reconciliation. This cleanup must not change those behaviors.

## Non-Goals

- Do not split Vue template sections into child components in this phase.
- Do not change page layout, text, styling, theme variables, or `uview-plus` prop bindings.
- Do not change ACP, realtime, opened-tab sync, SQLite persistence, or runtime store protocols.
- Do not change send queue semantics, optimistic message behavior, permission behavior, ask-question behavior, or scroll behavior.
- Do not remove `session-detail/index.vue` in this phase.

## Approach

Use a low-risk extraction strategy:

1. Identify logic that is pure or can be made pure with explicit inputs.
2. Move that logic into focused helper modules under `mcode-app/src/pages/conversation-detail/`.
3. Replace inline page functions with imports while keeping the same page-level state ownership.
4. Add Jest tests for the extracted modules before or alongside the extraction.

The Vue page remains the owner of:

- lifecycle hooks
- refs and computed values that depend on page state
- store mutations
- API calls
- `uni.*` side effects
- timers and watchers
- layout measurement and scroll scheduling

The extracted modules own only deterministic transformation and presentation logic.

## Proposed Modules

### `detailMessagePresentation.ts`

Responsibilities:

- Merge adjacent assistant message turns into renderable message items.
- Clone content parts for merged assistant content.
- Keep stable anchor and key behavior equivalent to the current inline `renderMessageItems` computed.

Inputs:

- `MessageTurn[]`

Outputs:

- `RenderMessageItem[]`

Compatibility:

- A single assistant turn keeps its original key and anchor.
- Consecutive assistant turns merge into one render item anchored to the last assistant turn.
- User turns flush any buffered assistant turns before being emitted.

### `detailPlanPresentation.ts`

Responsibilities:

- Extract plan tasks from tool calls and plan content parts.
- Normalize task status, tool names, and plan-step keys.
- Format task status labels and counts.

Inputs:

- `ContentPart[]` from rendered messages or turns
- existing `ToolCall` and plan part shapes

Outputs:

- ordered `PlanTask[]`
- status labels and count helpers

Compatibility:

- Preserve support for `tasklist`, `task_list`, `todowrite`, `taskcreate`, `task_create`, `taskupdate`, and `task_update`.
- Preserve fallback task ids and labels currently generated in the page.

### `detailInteractionPresentation.ts`

Responsibilities:

- Split permission descriptions into user-facing text lines and command blocks.
- Detect permission command lines and continuations.
- Manage ask-question answer shaping through pure helpers that consume a selection map.
- Normalize question labels and recommended markers.

Inputs:

- permission description text
- pending question state
- selection map
- declined flag

Outputs:

- permission description presentation parts
- `QuestionAnswer`
- question label metadata

Compatibility:

- Keep the default permission text `智能体请求继续当前操作`.
- Keep recommended suffix detection based on `(recommended)`.
- Keep declined ask-question answer shape as `{ answers: [], declined: true }`.

### `detailDataNormalization.ts`

Responsibilities:

- Normalize conversation turns and content parts from backend detail payloads.
- Normalize agent type aliases.
- Normalize generic object payloads from JSON strings.
- Normalize attachments, draft queue items, and draft snapshots used by page persistence.

Inputs:

- unknown backend payloads
- unknown local storage payloads

Outputs:

- `MessageTurn[]`
- `ContentPart[]`
- normalized agent type string
- normalized draft and attachment structures

Compatibility:

- Preserve current fallback ids, role defaults, timestamp fallbacks, supported content part types, Codeg tool block handling, and agent alias mapping.
- Preserve current draft and attachment recovery behavior.

## Data Flow

The page continues to load state in the same order:

1. route options and connection context
2. local conversation summary and newest persisted turns
3. persisted runtime and draft snapshot
4. optional remote detail metadata or calibration
5. realtime connection and live snapshot hydration
6. composer config and slash commands

The extracted helpers are called inside this same flow only to transform payloads or compute presentation models. They do not call gateways, repositories, stores, or `uni`.

## Error Handling

Error handling remains page-owned because it currently depends on `uni.showToast`, `console.warn`, runtime store state, and ACP retry behavior.

Extracted helpers should be defensive:

- accept `unknown` where data comes from backend or local storage
- return empty arrays or safe defaults for malformed input
- avoid throwing for partial conversation payloads

When malformed data currently falls back silently, the extracted module must keep that behavior.

## Testing

Add focused Jest coverage for the extracted modules.

Required test cases:

- assistant render-item merging keeps single assistant turns unmerged and merges only adjacent assistant runs
- plan extraction supports task-list, todo-write, task-create/update, and plan content parts
- task status normalization maps active/completed/failed aliases and defaults to pending
- permission description splitting separates long command-like lines from text
- ask-question answer building includes selected labels, custom other text, and declined responses
- turn/content normalization handles text, thinking, tool call, image, plan, raw blocks, invalid input, and timestamp fallbacks
- agent type normalization preserves existing aliases such as `claudecode`, `codex_cli`, `gemini_cli`, `opencode`, and `openclaw`
- draft and attachment normalization drops invalid entries and preserves valid persisted fields

Run:

```bash
pnpm test:unit -- --runTestsByPath tests/pages/conversation-detail/detailMessagePresentation.spec.ts tests/pages/conversation-detail/detailPlanPresentation.spec.ts tests/pages/conversation-detail/detailInteractionPresentation.spec.ts tests/pages/conversation-detail/detailDataNormalization.spec.ts
```

If the project test runner does not accept `--runTestsByPath` in the nested invocation, run the same files through `npx jest --config jest.config.cjs --runInBand`.

## Documentation

The implementation must add or update a Markdown note under `docs/mcode-architecture-notes/`.

The note should explain:

- this is a client-side refactor with no protocol changes
- extracted helpers are deterministic and native clients can mirror them directly
- UI behavior and compatibility remain unchanged
- native iOS/Android clients should keep runtime/API side effects outside these pure presentation helpers

## Compatibility Considerations

No migration is required. Existing local runtime records, cached view state, persisted turns, draft snapshots, attachment payloads, and ACP/realtime protocols continue to use the same data shapes.

The extracted helpers must keep exported TypeScript types close to the existing page-local interfaces so the page can migrate with minimal template changes.

## Rollout

Implement extraction in small, independently testable steps:

1. Extract message render presentation.
2. Extract plan-task presentation.
3. Extract permission and ask-question presentation.
4. Extract normalization and draft recovery helpers.
5. Update `conversation-detail/index.vue` imports and remove duplicated inline functions.
6. Add the required architecture note.
7. Run targeted Jest tests and a type/build check when feasible.

## Acceptance Criteria

- `conversation-detail/index.vue` loses the extracted pure helper logic while keeping current behavior.
- No template structure or style changes are introduced.
- New helper modules have focused Jest tests.
- Existing page imports compile.
- The required `docs/mcode-architecture-notes/` note exists.
- The final diff makes the page easier to scan without changing ACP, realtime, local-first loading, sending, queueing, permission, question, or scroll semantics.

## Self-Review

- Placeholder scan: no placeholders or deferred requirements remain.
- Scope check: this is a single refactor phase focused on pure logic extraction only.
- Ambiguity check: stateful lifecycle, API, store, timer, and layout behavior stay in the Vue page; deterministic transformation moves to helper modules.
- Consistency check: required architecture note is captured for implementation, and tests cover every extracted logic area.
