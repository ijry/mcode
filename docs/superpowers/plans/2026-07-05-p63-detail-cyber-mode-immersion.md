# P63 Cyber Mode Immersion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade P63 cyber mode from a light UI with green overlays into a full Matrix-style black terminal presentation.

**Architecture:** Keep the existing toggle, storage, phase derivation, and DOM rendering. Strengthen page/pane/message styling, increase binary rain density, and restrict decode to the latest streaming assistant text part only.

**Tech Stack:** Vue 3 `script setup`, uni-app, uview-plus runtime theme variables, scoped SCSS, Jest source-contract tests.

## Global Constraints

- Do not change ACP payloads, websocket events, runtime store schemas, SQLite schemas, route contracts, or opened-tab sync.
- Keep storage key `mcode_detail_cyber_mode_v1`.
- Do not introduce Canvas in this revision.
- Use DOM/CSS effects and keep stronger animation limited to the active streaming assistant message.
- Do not introduce new `--mcode-*` theme aliases.
- Every mcode change must update `docs/mcode-architecture-notes/`.

---

## File Structure

- Modify: `mcode-app/src/pages/conversation-detail/ConversationDetailCyberRain.vue`
  Purpose: increase density and phase intensity of binary rain.
- Modify: `mcode-app/src/pages/conversation-detail/index.scss`
  Purpose: force terminal black surfaces and deep cyber selectors across scoped child components.
- Modify: `mcode-app/src/components/MessageBubble.vue`
  Purpose: own bubble-level terminal styling and latest-text-only decode.
- Modify: `mcode-app/tests/pages/conversation-detail/detailCyberLayout.spec.ts`
  Purpose: assert stronger rain and terminal page styling contracts.
- Modify: `mcode-app/tests/pages/conversation-detail/messageBubbleCyberMode.spec.ts`
  Purpose: assert latest-text-only decode and cyber bubble class contracts.
- Modify: `docs/mcode-architecture-notes/2026-07-05-p63-detail-cyber-mode.md`
  Purpose: document the stronger immersion rules and native replication guidance.

### Task 1: Lock the Strong Visual Contract in Tests

**Files:**
- Modify: `mcode-app/tests/pages/conversation-detail/detailCyberLayout.spec.ts`
- Modify: `mcode-app/tests/pages/conversation-detail/messageBubbleCyberMode.spec.ts`

**Interfaces:**
- Consumes existing `ConversationDetailCyberRain.vue`, `index.scss`, and `MessageBubble.vue`.
- Produces failing assertions for dense rain, terminal black base, deep cyber selectors, `bubble-wrap--cyber`, and latest text decode.

- [ ] **Step 1: Add layout contract assertions**

Add assertions that `index.scss` contains `#000000`, `page--cyber::before`, `:deep(.detail-interactive-pane--cyber .bubble--assistant)`, `:deep(.detail-interactive-pane--cyber .part-thinking)`, and `:deep(.detail-interactive-pane--cyber .input-wrap)`. Add assertions that `ConversationDetailCyberRain.vue` includes at least twelve stream seeds and phase-specific classes.

- [ ] **Step 2: Add message contract assertions**

Add assertions that `MessageBubble.vue` contains `bubble-wrap--cyber`, `latestCyberTextPartIndex`, and `index === latestCyberTextPartIndex`.

- [ ] **Step 3: Run tests and verify they fail**

Run: `cd mcode-app && npm run test:unit -- --runTestsByPath tests/pages/conversation-detail/detailCyberLayout.spec.ts tests/pages/conversation-detail/messageBubbleCyberMode.spec.ts`

Expected: FAIL before implementation.

### Task 2: Implement Strong Terminal Styling

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/ConversationDetailCyberRain.vue`
- Modify: `mcode-app/src/pages/conversation-detail/index.scss`
- Modify: `mcode-app/src/components/MessageBubble.vue`

**Interfaces:**
- Consumes `cyberModeEnabled`, `cyberEffectPhase`, and existing message props.
- Produces a black/green terminal page skin, dense rain, and latest-only streaming decode.

- [ ] **Step 1: Increase rain density**

Expand `BASE_STREAMS` to at least twelve strings, add varied left offsets, font sizes, opacity, blur, and phase classes for `streaming`, `ramp`, `settle`, and `idle`.

- [ ] **Step 2: Strengthen page cyber styles**

Make `.page--cyber` black. Add scanline/noise pseudo layers, dark navbar/tabs/composer/panel surfaces, and `:deep(...)` selectors for child component internals that cannot be reached through normal scoped selectors.

- [ ] **Step 3: Strengthen message bubble cyber styles**

Add `bubble-wrap--cyber` to the root class. Use this class inside `MessageBubble.vue` scoped styles to darken assistant/user bubbles, text, thinking blocks, tool blocks, plan blocks, typing dots, and the active decode overlay.

- [ ] **Step 4: Restrict decode to latest text**

Compute `latestCyberTextPartIndex` from `displayParts`. Update `shouldRenderCyberDecode(text, index)` so decode returns true only for the latest non-empty text part.

- [ ] **Step 5: Run targeted tests**

Run: `cd mcode-app && npm run test:unit -- --runTestsByPath tests/pages/conversation-detail/detailCyberLayout.spec.ts tests/pages/conversation-detail/messageBubbleCyberMode.spec.ts`

Expected: PASS.

### Task 3: Update Architecture Note and Verify

**Files:**
- Modify: `docs/mcode-architecture-notes/2026-07-05-p63-detail-cyber-mode.md`

**Interfaces:**
- Consumes completed Task 2 behavior.
- Produces native guidance for strong terminal mode and latest-text-only decode.

- [ ] **Step 1: Update architecture note**

Document that strong immersion mode forces black terminal surfaces, uses dense DOM rain, and decodes only the latest streaming assistant text part.

- [ ] **Step 2: Run focused regression tests**

Run: `cd mcode-app && npm run test:unit -- --runTestsByPath tests/pages/conversation-detail/detailCyberMode.spec.ts tests/pages/conversation-detail/detailCyberLayout.spec.ts tests/pages/conversation-detail/messageBubbleCyberMode.spec.ts tests/pages/conversation-detail/conversationDetailBodyContract.spec.ts`

Expected: PASS.

- [ ] **Step 3: Type-check changed files indirectly**

Run: `cd mcode-app && npx vue-tsc --noEmit`

Expected: The command may still fail on existing unrelated repository-wide type errors, but output must not include `src/pages/conversation-detail` or `src/components/MessageBubble.vue`.

- [ ] **Step 4: Commit**

Commit code, tests, docs, spec, and plan together with:

`git commit -m "feat(detail): strengthen P63 cyber mode immersion"`
