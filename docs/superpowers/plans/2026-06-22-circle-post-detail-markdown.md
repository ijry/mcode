# Circle Post Detail Markdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shareable circle post detail page, Markdown rendering for circle post bodies, and Markdown insertion tools on publishing.

**Architecture:** The circle service owns all API normalization and gains a post info read method. The feed navigates to a new detail route while preserving inline actions. Publish uses a small pure Markdown insertion helper plus existing upload APIs to keep UI behavior testable.

**Tech Stack:** uni-app, Vue 3 script setup, TypeScript, uview-plus `up-markdown`, Jest.

## Global Constraints

- Prefer `uview-plus` runtime theme variables with the `--up-*` prefix for dark-mode styling.
- Do not introduce new `--mcode-*` theme aliases.
- When binding component props through `upThemeVar(...)`, only pass variables that exist in the uview runtime theme table.
- Every mcode change must include or update a Markdown note under `docs/mcode-architecture-notes/`.
- Do not modify unrelated dirty files from the main workspace.

---

### Task 1: Circle Service Post Info

**Files:**
- Modify: `mcode-app/src/services/circle.ts`
- Modify: `mcode-app/tests/services/circle.spec.ts`

**Interfaces:**
- Produces: `fetchCirclePost(postId: number): Promise<CirclePost>`
- Consumes: existing `requestCircle`, `normalizePost`, and `CirclePost`.

- [ ] Add a failing test for `fetchCirclePost(101)` verifying `GET /v1/circle/post/info?id=101`.
- [ ] Add a failing test that accepts wrapped post payloads from `data.post` or `data.info`.
- [ ] Implement `fetchCirclePost` using existing normalization helpers.
- [ ] Run `npm run test:unit -- tests/services/circle.spec.ts`.

### Task 2: Publish Markdown Helper

**Files:**
- Create: `mcode-app/src/pages/circles/markdownTools.ts`
- Create: `mcode-app/tests/pages/circles/markdownTools.spec.ts`

**Interfaces:**
- Produces: `insertMarkdownSnippet(input: { value: string; snippet: string; cursor?: number | null; selectionStart?: number | null; selectionEnd?: number | null }): { value: string; cursor: number }`
- Produces: `createMarkdownImageSnippet(url: string, alt?: string): string`

- [ ] Add tests for cursor insertion, selected range replacement, append fallback, and image snippet creation.
- [ ] Implement the helper as a pure TypeScript module.
- [ ] Run `npm run test:unit -- tests/pages/circles/markdownTools.spec.ts`.

### Task 3: Feed Markdown and Navigation

**Files:**
- Modify: `mcode-app/src/pages.json`
- Modify: `mcode-app/src/pages/circles/index.vue`

**Interfaces:**
- Consumes: route `/pages/circles/detail?id=<id>`.

- [ ] Register `pages/circles/detail` with custom navigation style.
- [ ] Replace feed body plain text rendering with `up-markdown`.
- [ ] Add card body navigation to the detail route.
- [ ] Add event stop modifiers on post actions to prevent accidental navigation.

### Task 4: Detail Page

**Files:**
- Create: `mcode-app/src/pages/circles/detail.vue`

**Interfaces:**
- Consumes: `fetchCirclePost`, `fetchCircleComments`, `publishCircleComment`, `toggleCircleAction`.

- [ ] Build loading, error, empty, and loaded states.
- [ ] Render author metadata, title, `up-markdown` body, topics, image grid, actions, comments, and comment composer.
- [ ] Implement optimistic like/favorite updates with rollback on API error.
- [ ] Implement share metadata with post title/content excerpt and `/pages/circles/detail?id=<id>` path.

### Task 5: Publish Toolbar

**Files:**
- Modify: `mcode-app/src/pages/circles/publish.vue`
- Modify: `mcode-app/src/pages/circles/markdownTools.ts`

**Interfaces:**
- Consumes: `insertMarkdownSnippet` and `createMarkdownImageSnippet`.

- [ ] Add Markdown toolbar UI above the textarea.
- [ ] Track textarea cursor and insert snippets at cursor where platform events provide it.
- [ ] Implement bold, italic, code, and link insertion.
- [ ] Implement Markdown image upload insertion via existing `uploadCircleImage`.
- [ ] Preserve existing attachment image grid behavior.

### Task 6: Architecture Note and Verification

**Files:**
- Create: `docs/mcode-architecture-notes/2026-06-22-circle-post-detail-markdown.md`

**Interfaces:**
- Documents: architecture, protocol/data flow, UI behavior, compatibility, and native replication guidance.

- [ ] Write the required mcode architecture note.
- [ ] Run `npm run test:unit -- tests/services/circle.spec.ts tests/pages/circles/markdownTools.spec.ts`.
- [ ] Run `npm run build:h5` if available within the environment.

### Task 7: Nested Comment Reply Protocol

**Files:**
- Modify: `mcode-app/src/services/circle.ts`
- Modify: `mcode-app/tests/services/circle.spec.ts`
- Modify: `mcode-app/src/pages/circles/index.vue`
- Modify: `mcode-app/src/pages/circles/detail.vue`
- Modify: `docs/mcode-architecture-notes/2026-06-22-circle-post-detail-markdown.md`

**Interfaces:**
- Produces: `publishCircleComment({ postId, content, pid?, tpid? })`.
- Consumes: xycloud comment protocol where `pid` is the direct parent and `tpid` is the top-level floor id.

- [x] Add service test for nested reply payload.
- [x] Extend service payload to pass `pid` and `tpid`.
- [x] Add reply target state and UI to the feed comment popup.
- [x] Add reply target state and UI to the detail comment thread.
- [x] Document top-level and nested reply rules for native replication.
