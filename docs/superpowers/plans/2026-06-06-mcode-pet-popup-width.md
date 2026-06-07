# MCode Pet Popup Width Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Narrow the mobile pet setup popup and pet detail panel so both keep a consistent `32rpx` horizontal inset without changing any pet behavior.

**Architecture:** Keep the work isolated to the two existing pet SFCs. In [`PetFloat.vue`](D:/Repos/xyito/lingyun/mcode/mcode-app/src/components/pet/PetFloat.vue), remove the fixed setup popup minimum width and replace it with a viewport-based card width. In [`PetPanel.vue`](D:/Repos/xyito/lingyun/mcode/mcode-app/src/components/pet/PetPanel.vue), keep the bottom popup behavior but make the visible panel an inset card by making the popup background transparent and letting the child container own the card background, radius, and spacing.

**Tech Stack:** Uni-app, Vue 3 SFC, scoped SCSS, uview-plus `up-popup`, TypeScript, npm

---

## File Structure

**Files that change in this feature:**

- `mcode-app/src/components/pet/PetFloat.vue`
  Responsible for the first-run centered pet setup popup. This file will own the centered card width, background, and shadow for the setup flow.

- `mcode-app/src/components/pet/PetPanel.vue`
  Responsible for the bottom pet detail popup. This file will own the inset card layout, visible panel background, and horizontal spacing while preserving the current tabbed content.

**Files that must not be touched during execution:**

- `mcode-app/index.html`
- `mcode-app/vite.config.cjs`

Those files already have unrelated local edits in the working tree. Preserve them exactly as-is.

---

### Task 1: Re-check The Working Tree And Confirm The Popup Styling Hooks

**Files:**
- Modify: `mcode-app/src/components/pet/PetFloat.vue`
- Modify: `mcode-app/src/components/pet/PetPanel.vue`
- Reference: `docs/superpowers/specs/2026-06-06-mcode-pet-popup-width-design.md`
- Reference: `mcode-app/node_modules/uview-plus/components/u-popup/u-popup.vue`

- [ ] **Step 1: Re-check the current working tree and preserve unrelated edits**

Run:

```bash
git -C D:/Repos/xyito/lingyun/mcode status --short
git -C D:/Repos/xyito/lingyun/mcode diff -- mcode-app/src/components/pet/PetFloat.vue mcode-app/src/components/pet/PetPanel.vue
```

Expected:

```text
1. `mcode-app/index.html` and `mcode-app/vite.config.cjs` are already modified for unrelated work.
2. `PetFloat.vue` and `PetPanel.vue` are the only feature files you are about to edit.
3. Do not revert or clean unrelated local changes.
```

- [ ] **Step 2: Confirm the popup component supports transparent backgrounds and custom content styling**

Run:

```bash
rg -n "bgColor|customStyle|safeAreaInsetBottom" D:/Repos/xyito/lingyun/mcode/mcode-app/node_modules/uview-plus/components/u-popup/u-popup.vue
```

Expected:

```text
The output shows `bgColor`, `customStyle`, and `safeAreaInsetBottom` support in the installed popup component.
```

This verification matters because the implementation relies on `bgColor="transparent"` so the visible card comes from the child container instead of the full-width popup wrapper.

---

### Task 2: Narrow The Centered Pet Setup Popup In `PetFloat.vue`

**Files:**
- Modify: `mcode-app/src/components/pet/PetFloat.vue`
- Reference: `docs/superpowers/specs/2026-06-06-mcode-pet-popup-width-design.md`

- [ ] **Step 1: Add a transparent popup background to the centered setup popup**

Update the popup opening tag in [`PetFloat.vue`](D:/Repos/xyito/lingyun/mcode/mcode-app/src/components/pet/PetFloat.vue) from:

```vue
  <up-popup
    v-model:show="showSetup"
    mode="center"
    :round="20"
    :close-on-click-overlay="false"
  >
```

to:

```vue
  <up-popup
    v-model:show="showSetup"
    mode="center"
    :round="20"
    bgColor="transparent"
    :close-on-click-overlay="false"
  >
```

Expected:

```text
The popup wrapper stops painting its own full content background, so the visible shape is controlled entirely by `.pet-setup`.
```

- [ ] **Step 2: Replace the fixed setup popup width with a viewport-based inset card**

Update the `.pet-setup` block in [`PetFloat.vue`](D:/Repos/xyito/lingyun/mcode/mcode-app/src/components/pet/PetFloat.vue) from:

```scss
.pet-setup {
  padding: 40rpx 32rpx;
  min-width: 580rpx;

  &__title {
    font-size: 36rpx;
    font-weight: 600;
    color: #333;
    text-align: center;
    display: block;
    margin-bottom: 32rpx;
  }
```

to:

```scss
.pet-setup {
  width: calc(100vw - 64rpx);
  max-width: 686rpx;
  box-sizing: border-box;
  padding: 40rpx 32rpx;
  border-radius: 20rpx;
  background: #ffffff;
  box-shadow: 0 16rpx 48rpx rgba(15, 23, 42, 0.12);

  &__title {
    font-size: 36rpx;
    font-weight: 600;
    color: #333;
    text-align: center;
    display: block;
    margin-bottom: 32rpx;
  }
```

Expected:

```text
1. The hard `min-width: 580rpx` is gone.
2. The setup popup width now tracks the viewport and leaves roughly `32rpx` on each side.
3. The setup card owns its own background and radius.
```

- [ ] **Step 3: Keep dark mode styling on the card container instead of the popup wrapper**

Ensure the dark-mode override in [`PetFloat.vue`](D:/Repos/xyito/lingyun/mcode/mcode-app/src/components/pet/PetFloat.vue) keeps using `.pet-setup` as the visible card:

```scss
@media (prefers-color-scheme: dark) {
  .pet-setup {
    background: #1f1f1f;

    &__title {
      color: #e5e5e5;
    }

    &__species-item--active {
      border-color: #2979ff;
      background: rgba(41, 121, 255, 0.15);
    }

    &__species-name {
      color: #e5e5e5;
    }
  }
}
```

Expected:

```text
The popup remains a single visible dark card in dark mode rather than showing a separate wrapper background.
```

- [ ] **Step 4: Commit only the setup popup change**

Run:

```bash
git -C D:/Repos/xyito/lingyun/mcode add -- mcode-app/src/components/pet/PetFloat.vue
git -C D:/Repos/xyito/lingyun/mcode commit -m "fix(pet): narrow setup popup width on mobile"
```

Expected:

```text
The commit contains only the `PetFloat.vue` card-width change.
```

---

### Task 3: Turn The Bottom Pet Panel Into An Inset Card In `PetPanel.vue`

**Files:**
- Modify: `mcode-app/src/components/pet/PetPanel.vue`
- Reference: `docs/superpowers/specs/2026-06-06-mcode-pet-popup-width-design.md`

- [ ] **Step 1: Make the bottom popup wrapper transparent so the child panel becomes the visible card**

Update the popup opening tag in [`PetPanel.vue`](D:/Repos/xyito/lingyun/mcode/mcode-app/src/components/pet/PetPanel.vue) from:

```vue
  <up-popup
    :show="show"
    mode="bottom"
    :round="28"
    @close="emit('update:show', false)"
  >
```

to:

```vue
  <up-popup
    :show="show"
    mode="bottom"
    :round="28"
    bgColor="transparent"
    @close="emit('update:show', false)"
  >
```

Expected:

```text
The full-width popup content wrapper stops drawing a solid background, making it possible to inset the visible panel itself.
```

- [ ] **Step 2: Apply the shared `32rpx` horizontal inset and card styling to `.pet-panel`**

Update the top of the `.pet-panel` rule in [`PetPanel.vue`](D:/Repos/xyito/lingyun/mcode/mcode-app/src/components/pet/PetPanel.vue) from:

```scss
.pet-panel {
  padding: 24rpx 32rpx 48rpx;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
```

to:

```scss
.pet-panel {
  margin: 0 32rpx;
  padding: 24rpx 32rpx 48rpx;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  border-radius: 28rpx;
  overflow: hidden;
  background: #ffffff;
  box-shadow: 0 18rpx 56rpx rgba(15, 23, 42, 0.12);
```

Expected:

```text
1. The visible detail panel keeps `32rpx` side insets.
2. The card still uses the existing vertical layout and internal spacing.
3. Rounded corners clip the panel content correctly.
```

- [ ] **Step 3: Keep the dark-mode panel styling on the inset card**

Update the dark-mode `.pet-panel` block in [`PetPanel.vue`](D:/Repos/xyito/lingyun/mcode/mcode-app/src/components/pet/PetPanel.vue) from:

```scss
@media (prefers-color-scheme: dark) {
  .pet-panel {
    background: #1f1f1f;

    &__name { color: #e5e5e5; }
    &__exp-track { background: #333; }
    &__tabs { border-bottom-color: #333; }
    &__handle-bar { background: #555; }
  }
```

to:

```scss
@media (prefers-color-scheme: dark) {
  .pet-panel {
    background: #1f1f1f;
    box-shadow: 0 18rpx 56rpx rgba(0, 0, 0, 0.32);

    &__name { color: #e5e5e5; }
    &__exp-track { background: #333; }
    &__tabs { border-bottom-color: #333; }
    &__handle-bar { background: #555; }
  }
```

Expected:

```text
The inset card remains visually grounded in dark mode instead of looking flat against the overlay.
```

- [ ] **Step 4: Commit only the bottom panel change**

Run:

```bash
git -C D:/Repos/xyito/lingyun/mcode add -- mcode-app/src/components/pet/PetPanel.vue
git -C D:/Repos/xyito/lingyun/mcode commit -m "fix(pet): inset bottom pet panel card on mobile"
```

Expected:

```text
The commit contains only the `PetPanel.vue` card layout change.
```

---

### Task 4: Verify The Mobile Layout And Capture Any Follow-Up Fixes

**Files:**
- Modify: `mcode-app/src/components/pet/PetFloat.vue`
- Modify: `mcode-app/src/components/pet/PetPanel.vue`

- [ ] **Step 1: Run a static TypeScript check**

Run:

```bash
cd D:/Repos/xyito/lingyun/mcode/mcode-app && npx vue-tsc --noEmit
```

Expected:

```text
No new errors are introduced by `PetFloat.vue` or `PetPanel.vue`.
```

- [ ] **Step 2: Run an H5 production build**

Run:

```bash
cd D:/Repos/xyito/lingyun/mcode/mcode-app && npm run build:h5
```

Expected:

```text
The build completes successfully. Existing Sass deprecation warnings are acceptable if they are unchanged.
```

- [ ] **Step 3: Run the H5 dev server for manual mobile verification**

Run:

```bash
cd D:/Repos/xyito/lingyun/mcode/mcode-app && npm run dev:h5
```

Verify the following in a mobile viewport:

```text
1. First-run pet setup popup appears centered with visible left and right inset.
2. The setup popup no longer looks fixed-width or edge-to-edge.
3. Horizontal species scrolling still works.
4. The name input and confirm button remain fully visible.
5. Tapping the floating pet still opens the bottom panel.
6. The bottom pet panel still slides up from the bottom.
7. The visible panel now leaves roughly `32rpx` on both sides.
8. Tab switching and vertical scrolling inside the panel still work.
```

- [ ] **Step 4: If verification reveals layout regressions, make the minimal follow-up adjustment**

If any of the checks in Step 3 fail, apply only the smallest necessary style fix in the same two files. Use one of these minimal follow-up patterns instead of inventing a broader redesign:

```scss
// If the centered setup popup still feels too tight:
.pet-setup {
  padding: 36rpx 28rpx;
}

// If the bottom panel shadow clips awkwardly:
.pet-panel {
  overflow: hidden;
}
```

Expected:

```text
Only minimal style deltas are made, and no new popup structure is introduced.
```

- [ ] **Step 5: Commit any verification-only fix**

Run:

```bash
git -C D:/Repos/xyito/lingyun/mcode add -- mcode-app/src/components/pet/PetFloat.vue mcode-app/src/components/pet/PetPanel.vue
git -C D:/Repos/xyito/lingyun/mcode commit -m "fix(pet): polish mobile popup spacing after verification"
```

Expected:

```text
This commit is only needed if Step 4 changed code. Skip the commit if manual verification passes without follow-up edits.
```
