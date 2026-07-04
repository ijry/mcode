# MCode P60 Composer Mentions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add codeg-main-compatible `@` references to the MCode App conversation composer.

**Architecture:** Keep the current plain-text uni-app composer and insert serialized reference Markdown into `inputText`. A focused service owns reference encoding, trigger detection, filtering, and remote source adaptation; the page owns loading and panel interaction.

**Tech Stack:** Vue 3 `<script setup>`, uni-app, uview-plus, TypeScript service helpers, Jest.

## Global Constraints

- Work in the current checkout because the user chose not to create a worktree.
- Do not modify or revert existing unrelated changes.
- Preserve existing `QueuedDraft.text`, attachments, draft queue, and prompt-send contracts.
- Use uview-plus runtime theme variables with the `--up-*` prefix.
- Do not introduce new `--mcode-*` theme aliases.
- Every mcode change must add or update a note under `docs/mcode-architecture-notes/`.

---

## File Structure

- Create `mcode-app/src/services/composerReferences.ts`: reference types, Markdown/URI encoding, trigger replacement, source normalization, and result filtering.
- Create `mcode-app/tests/services/composerReferences.spec.ts`: service coverage for encoding, trigger detection, insertion, and grouping.
- Modify `mcode-app/src/pages/conversation-detail/index.vue`: load references from the active gateway, show the `@` panel, and insert selected references.
- Modify `mcode-app/src/pages/conversation-detail/index.scss`: mention panel styles using `--up-*` variables.
- Create `docs/mcode-architecture-notes/2026-07-04-p60-composer-mentions.md`: architecture, protocol/data flow, compatibility, and native guidance.

---

### Task 1: Reference Service

**Files:**
- Create: `mcode-app/src/services/composerReferences.ts`
- Test: `mcode-app/tests/services/composerReferences.spec.ts`

**Interfaces:**
- Produces: `MentionReferenceKind`, `MentionReferenceItem`, `MentionReferenceGroup`, `MentionTriggerState`.
- Produces: `buildFileUri(path)`, `referenceToMarkdown(item)`, `resolveMentionTrigger(text, cursor)`, `applyMentionReference(text, trigger, item)`, `buildMentionReferenceGroups(input)`.

- [ ] Write tests for Markdown escaping, `file://` URI construction, trigger detection, and replacement.
- [ ] Implement the pure service.
- [ ] Run `npm test -- --runTestsByPath tests/services/composerReferences.spec.ts`.

### Task 2: Composer Integration

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`
- Modify: `mcode-app/src/pages/conversation-detail/index.scss`

**Interfaces:**
- Consumes: `buildMentionReferenceGroups()`, `resolveMentionTrigger()`, `applyMentionReference()`.
- Produces: `@` panel with grouped agents/files/sessions/commits and selected Markdown insertion.

- [ ] Add mention state refs, computed filtered groups, and async loader.
- [ ] Wire textarea input/blur to update the trigger and cursor.
- [ ] Render the mention panel above the existing composer.
- [ ] Insert selected reference into `inputText` and close the panel.
- [ ] Keep send/quick reply/upload behavior unchanged.

### Task 3: Documentation And Verification

**Files:**
- Create: `docs/mcode-architecture-notes/2026-07-04-p60-composer-mentions.md`

**Interfaces:**
- Produces: concise native replication guidance.

- [ ] Add the architecture note.
- [ ] Run the focused Jest test.
- [ ] Run `git diff --check`.
