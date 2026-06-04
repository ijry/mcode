# Home Slogan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lightweight homepage slogan, `随时随地 AI Coding`, below the primary action on the connections homepage without changing any existing behavior.

**Architecture:** Keep the change isolated to the connections page SFC by adding one static template node inside the existing header and one small scoped style block. Preserve the file's current uncommitted tutorial-related changes and avoid touching connection logic, empty states, or popup flows.

**Tech Stack:** Uni-app, Vue 3 SFC, scoped SCSS, TypeScript, pnpm

---

### Task 1: Add The Homepage Slogan To The Connections Header

**Files:**
- Modify: `mcode-app/src/pages/connections/index.vue`
- Reference: `docs/superpowers/specs/2026-06-04-home-slogan-design.md`

- [ ] **Step 1: Re-check the target file and preserve unrelated local edits**

Run:

```bash
git -C D:/Repos/xyito/lingyun/mcode diff -- mcode-app/src/pages/connections/index.vue
```

Expected: a diff is already present for tutorial-related styles near the bottom of the file. Keep those edits intact and layer the slogan change on top of the current working tree version instead of reconstructing the file from HEAD.

- [ ] **Step 2: Add the static slogan node under the existing add button**

Update the header block in `mcode-app/src/pages/connections/index.vue` from:

```vue
    <view class="header">
      <view class="add-conn-btn" @click="showAddPopup = true">
        <u-icon name="plus" size="18" color="#2979ff"></u-icon>
        <text class="add-conn-btn__text">新增连接</text>
      </view>
    </view>
```

to:

```vue
    <view class="header">
      <view class="add-conn-btn" @click="showAddPopup = true">
        <u-icon name="plus" size="18" color="#2979ff"></u-icon>
        <text class="add-conn-btn__text">新增连接</text>
      </view>
      <text class="header-slogan">随时随地 AI Coding</text>
    </view>
```

Expected: the page header now contains one lightweight brand line that appears in both empty and non-empty connection states.

- [ ] **Step 3: Add minimal scoped styles for the slogan**

Insert the following style block in `mcode-app/src/pages/connections/index.vue` immediately after the existing `.add-conn-btn__text` rule:

```scss
.header-slogan {
  display: block;
  margin-top: 16rpx;
  padding-left: 4rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #5c6b77;
  letter-spacing: 1rpx;
}
```

Expected: the slogan reads as a subdued subtitle, aligns visually with the button above it, and does not overpower the primary action.

- [ ] **Step 4: Run a targeted static check**

Run:

```bash
pnpm -C D:/Repos/xyito/lingyun/mcode/mcode-app exec vue-tsc --noEmit -p tsconfig.json
```

Expected: the command completes without new errors caused by `src/pages/connections/index.vue`.

- [ ] **Step 5: Do a quick visual verification in H5 preview**

Run:

```bash
pnpm -C D:/Repos/xyito/lingyun/mcode/mcode-app dev:h5
```

Then open the connections homepage and verify:

```text
1. “随时随地 AI Coding” appears directly below “新增连接”.
2. The slogan is visible when there are no connections.
3. The slogan is still visible above the list when connections exist.
4. Existing tutorial entry and popup behavior remain unchanged.
```

Expected: layout spacing remains clean and the new line reads like a homepage subtitle rather than a second primary control.

- [ ] **Step 6: Commit only the page change**

Run:

```bash
git -C D:/Repos/xyito/lingyun/mcode add -- mcode-app/src/pages/connections/index.vue
git -C D:/Repos/xyito/lingyun/mcode commit -m "feat: add home slogan to connections page"
```

Expected: the commit contains only the homepage slogan update in `mcode-app/src/pages/connections/index.vue`.
