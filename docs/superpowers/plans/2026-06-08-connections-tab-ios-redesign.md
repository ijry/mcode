# Connections Tab iOS Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `mcode-app`'s connections tab into the iOS-style layout from the approved UI MCP design while keeping all connection behavior unchanged.

**Architecture:** Keep the existing connection runtime, storage, and gateway logic inside `mcode-app/src/pages/connections/index.vue`, but extract a tiny presentation helper for display copy so the template stays readable. Layer a local iOS-like surface palette, larger rounded cards, and badge/status treatments on top of the current uview-plus theme bridge; do not introduce new business data or routing.

**Tech Stack:** Vue 3, uni-app, uview-plus, TypeScript, Jest, H5 build smoke checks

---

### Task 1: Extract display copy helpers and lock them with unit tests

**Files:**
- Create: `mcode-app/src/pages/connections/connectionPresentation.ts`
- Create: `mcode-app/tests/pages/connections/connectionPresentation.spec.ts`
- Modify: `mcode-app/src/pages/connections/index.vue`

- [ ] **Step 1: Write the failing tests**

```ts
import {
  getConnectionBadgeText,
  getConnectionModeLabel,
  getConnectionSubtitle,
} from "@/pages/connections/connectionPresentation"

describe("connection presentation", () => {
  it("formats the two connection mode labels", () => {
    expect(getConnectionModeLabel("direct")).toBe("直连模式")
    expect(getConnectionModeLabel("relay")).toBe("中继模式")
  })

  it("formats the subtitle from mode and url", () => {
    expect(getConnectionSubtitle("direct", "http://127.0.0.1:3089")).toBe(
      "直连模式 · http://127.0.0.1:3089"
    )
    expect(getConnectionSubtitle("relay", "https://relay.example.com")).toBe(
      "中继模式 · https://relay.example.com"
    )
  })

  it("maps online state to badge text", () => {
    expect(getConnectionBadgeText(true)).toBe("CONNECTED")
    expect(getConnectionBadgeText(false)).toBe("OFFLINE")
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run in `mcode-app`:

```bash
pnpm test:unit -- --runInBand tests/pages/connections/connectionPresentation.spec.ts
```

Expected: fail because `connectionPresentation.ts` does not exist yet.

- [ ] **Step 3: Implement the helper and switch the page to use it**

```ts
export type ConnectionMode = "direct" | "relay"

export function getConnectionModeLabel(mode: ConnectionMode): string {
  return mode === "direct" ? "直连模式" : "中继模式"
}

export function getConnectionSubtitle(mode: ConnectionMode, url: string): string {
  return `${getConnectionModeLabel(mode)} · ${url}`
}

export function getConnectionBadgeText(isOnline: boolean): string {
  return isOnline ? "CONNECTED" : "OFFLINE"
}
```

Update `index.vue` to import the helpers and replace inline subtitle/status text with them.

- [ ] **Step 4: Run the tests and confirm they pass**

Run in `mcode-app`:

```bash
pnpm test:unit -- --runInBand tests/pages/connections/connectionPresentation.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/pages/connections/connectionPresentation.ts mcode-app/src/pages/connections/index.vue mcode-app/tests/pages/connections/connectionPresentation.spec.ts
git commit -m "feat(app): add connection presentation helpers"
```

---

### Task 2: Rebuild the page shell and top summary area

**Files:**
- Modify: `mcode-app/src/pages/connections/index.vue`

- [ ] **Step 1: Replace the old header block with the new iOS-style shell**

Use a top section shaped like this:

```vue
<view class="connections-page" :style="[upThemeVars, upThemePageStyle]">
  <view class="connections-shell">
    <view class="connections-shell__topbar">
      <view class="connections-shell__brand">
        <text class="connections-shell__brand-mark">MCode</text>
        <text class="connections-shell__brand-copy">我的连接</text>
        <text class="connections-shell__brand-subtitle">管理与切换你的远程连接</text>
      </view>

      <u-button class="connections-shell__action" type="primary" size="small" @click="openAddPopup()">
        + 新增连接
      </u-button>
    </view>
  </view>
</view>
```

- [ ] **Step 2: Rework the page styling around iOS surface tokens**

Add a local palette and shell styles that use a light background, white cards, soft shadows, and large radii:

```scss
.connections-page {
  min-height: 100vh;
  background: #f2f2f7;
}

.connections-shell {
  padding: 24rpx 24rpx 40rpx;
}

.connections-shell__topbar {
  display: flex;
  justify-content: space-between;
  gap: 20rpx;
  align-items: flex-start;
}

.connections-shell__brand-copy {
  display: block;
  font-size: 44rpx;
  line-height: 1.1;
  font-weight: 700;
  color: #111827;
}
```

- [ ] **Step 3: Run a build smoke check**

Run in `mcode-app`:

```bash
pnpm build:h5
```

Expected: build succeeds and the top shell template compiles cleanly.

- [ ] **Step 4: Commit**

```bash
git add mcode-app/src/pages/connections/index.vue
git commit -m "feat(app): rebuild connections page shell"
```

---

### Task 3: Restyle the connection list, empty state, and add-card entry

**Files:**
- Modify: `mcode-app/src/pages/connections/index.vue`

- [ ] **Step 1: Rewrite each connection item into a richer iOS card**

Use a card structure that separates the icon, name, badge, subtitle, and action row:

```vue
<view
  v-for="(conn, index) in connections"
  :key="index"
  class="connection-card"
  :class="{ 'connection-card--online': isConnectionConnected(conn) }"
  @click="activateConnection(conn)"
>
  <view class="connection-card__icon">
    <u-icon
      :name="conn.mode === 'direct' ? 'wifi' : 'cloud'"
      size="24"
      :color="isConnectionConnected(conn) ? '#007aff' : '#8e8e93'"
    />
  </view>

  <view class="connection-card__body">
    <view class="connection-card__head">
      <text class="connection-card__name">{{ conn.name }}</text>
      <text class="connection-card__badge" :class="{ 'connection-card__badge--online': isConnectionConnected(conn) }">
        {{ getConnectionBadgeText(isConnectionConnected(conn)) }}
      </text>
      <view class="connection-card__menu" @click.stop="showConnectionMenu(conn, index)">
        <u-icon name="more-dot-fill" size="18" color="#c7c7cc" />
      </view>
    </view>

    <text class="connection-card__meta">
      {{ getConnectionSubtitle(conn.mode, conn.url) }}
    </text>

    <view class="connection-card__footer">
      <text class="connection-card__footer-link">管理连接</text>
      <u-icon name="arrow-right" size="14" color="#007aff" />
    </view>
  </view>
</view>
```

- [ ] **Step 2: Add a dedicated `添加新设备` card and refresh the empty state**

Keep the add action visible as a card-style entry even when connections exist, and make the empty state use the same visual system:

```vue
<view class="connection-card connection-card--add" @click="openAddPopup()">
  <view class="connection-card__icon connection-card__icon--add">
    <u-icon name="plus" size="22" color="#007aff" />
  </view>
  <view class="connection-card__body">
    <text class="connection-card__name">添加新设备</text>
    <text class="connection-card__meta">新增直连或中继连接</text>
  </view>
</view>
```

- [ ] **Step 3: Apply the card spacing, badge, and empty-state styles**

Add styles that match the reference cards:

```scss
.connection-card {
  display: flex;
  gap: 18rpx;
  padding: 22rpx;
  margin-bottom: 16rpx;
  border-radius: 24rpx;
  background: #fff;
  box-shadow: 0 8rpx 30rpx rgba(47, 124, 246, 0.08);
}

.connection-card__badge {
  padding: 6rpx 14rpx;
  border-radius: 9999rpx;
  font-size: 20rpx;
  color: #6b7280;
  background: rgba(142, 142, 147, 0.12);
}

.connection-card__badge--online {
  color: #007aff;
  background: rgba(0, 122, 255, 0.12);
}
```

- [ ] **Step 4: Run a build smoke check**

Run in `mcode-app`:

```bash
pnpm build:h5
```

Expected: build succeeds and the list card markup compiles.

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/pages/connections/index.vue
git commit -m "feat(app): restyle connection cards"
```

---

### Task 4: Polish the add/edit popup, tutorial entry, and auxiliary info card

**Files:**
- Modify: `mcode-app/src/pages/connections/index.vue`

- [ ] **Step 1: Restyle the bottom popup into a softer iOS sheet**

Keep the existing form logic, but restyle the container, header, subsection, and buttons to match the reference card language:

```vue
<u-popup :show="showAddPopup" mode="bottom" :round="20" @close="closeAddPopup">
  <view class="connections-sheet">
    <view class="connections-sheet__header">
      <text class="connections-sheet__title">{{ popupTitle }}</text>
      <u-icon name="close" size="22" @click="closeAddPopup()" />
    </view>

    <view class="tutorial-entry" @click="openTutorialPopup">
      <view class="tutorial-entry__copy">
        <text class="tutorial-entry__eyebrow">SETUP GUIDE</text>
        <text class="tutorial-entry__title">部署教程</text>
        <text class="tutorial-entry__desc">第一次连接前先准备 codeg 服务</text>
      </view>
      <u-icon name="arrow-right" size="16" color="#007aff" />
    </view>
  </view>
</u-popup>
```

- [ ] **Step 2: Restyle the tutorial popup without changing its content**

Keep the current steps and external link behavior, but align spacing, typography, and rounded corners with the new sheet style.

- [ ] **Step 3: Reuse the existing illustration for one lightweight info card**

Bring `hero-banner` or `app-intro-box` back as a single supplemental info card using `/static/illustrations/connection-ai-coding-hero.svg` and static text only. Do not add extra remote data, promo flows, or additional cards beyond one support card.

- [ ] **Step 4: Run a build smoke check**

Run in `mcode-app`:

```bash
pnpm build:h5
```

Expected: build succeeds and the popup shells stay intact.

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/pages/connections/index.vue
git commit -m "feat(app): polish connection popups and support card"
```

---

### Task 5: Final verification and handoff

**Files:**
- Validate: `mcode-app/src/pages/connections/index.vue`
- Validate: `mcode-app/src/pages/connections/connectionPresentation.ts`
- Validate: `mcode-app/tests/pages/connections/connectionPresentation.spec.ts`

- [ ] **Step 1: Run the full H5 build**

Run in `mcode-app`:

```bash
pnpm build:h5
```

Expected: no syntax errors, no missing assets, and no page routing regressions.

- [ ] **Step 2: Manually verify the redesigned page**

Check these states in H5 or a device preview:

```text
1. Top shell shows the new title hierarchy and primary action.
2. Connection cards use the new rounded iOS-style layout.
3. The add-card entry is visible and clickable.
4. Empty state still offers a clear add action.
5. The tutorial entry opens and closes without losing form state.
6. Connection, edit, delete, and toggle flows still work exactly as before.
7. No horizontal scroll or clipped text appears at 390px width.
```

- [ ] **Step 3: Leave the workspace ready for the next step**

If any small polish issues appear during preview, fix them in the same file and rerun `pnpm build:h5` before handing off.

