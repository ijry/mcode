# Connections Deployment Tutorial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a globally visible deployment tutorial entry inside the add-connection popup and show a dedicated tutorial popup with the Codeg desktop setup steps and release link.

**Architecture:** Keep the feature local to the existing connections page in `mcode-app/src/pages/connections/index.vue`. Add one UI state flag for the tutorial popup, render a lightweight entry between the popup header and subsection switcher, and use small page-local helpers to open the tutorial popup and launch the GitHub release URL with a toast fallback on failure.

**Tech Stack:** Vue 3 `<script setup>` with TypeScript, uni-app, uView Plus components, `pnpm`, `vue-tsc`

---

## File Structure

- Modify: `mcode-app/src/pages/connections/index.vue`
  - Own the new tutorial entry UI
  - Own the tutorial popup markup
  - Own the local popup visibility state
  - Own the external-link helper with H5/App fallback and toast error handling
- Modify: `docs/superpowers/plans/2026-06-04-connections-deployment-tutorial.md`
  - Mark completed steps during execution if using the plan inline

No new components, stores, routes, or API modules are needed. The existing page already contains the add-connection popup, so the smallest and safest change is to keep all new behavior inside that page.

### Task 1: Add Tutorial Entry And Popup State

**Files:**
- Modify: `mcode-app/src/pages/connections/index.vue`

- [x] **Step 1: Add the tutorial entry and popup markup in the template so typecheck fails on missing bindings**

Insert the following blocks into `mcode-app/src/pages/connections/index.vue`.

Place this block after the existing `.popup-header` block and before `<u-subsection ...>`:

```vue
        <view class="tutorial-entry" @click="openTutorialPopup">
          <view class="tutorial-entry__copy">
            <text class="tutorial-entry__title">部署教程</text>
            <text class="tutorial-entry__desc">首次使用前请先完成电脑端配置</text>
          </view>
          <u-icon name="arrow-right" size="16" color="#2979ff"></u-icon>
        </view>
```

Place this block after the existing add-connection `<u-popup ...>` block and before the closing `</view>` for `.page`:

```vue
    <u-popup v-model:show="showTutorialPopup" mode="center" :round="16">
      <view class="tutorial-popup">
        <view class="popup-header">
          <text class="popup-title">部署教程</text>
          <u-icon name="close" size="24" @click="showTutorialPopup = false"></u-icon>
        </view>

        <view class="tutorial-steps">
          <view class="tutorial-step">
            <text class="tutorial-step__index">1</text>
            <view class="tutorial-step__body">
              <text class="tutorial-step__title">在自己电脑下载安装 codeg</text>
              <text class="tutorial-step__link" @click="openDeploymentGuideLink">
                https://github.com/xintaofei/codeg/releases/tag/v0.14.11
              </text>
            </view>
          </view>

          <view class="tutorial-step">
            <text class="tutorial-step__index">2</text>
            <view class="tutorial-step__body">
              <text class="tutorial-step__title">
                打开 codeg，点击右上角齿轮图标，然后点击 web服务 开启
              </text>
              <text class="tutorial-step__desc">拷贝这里的连接地址和访问 token</text>
            </view>
          </view>

          <view class="tutorial-step">
            <text class="tutorial-step__index">3</text>
            <view class="tutorial-step__body">
              <text class="tutorial-step__title">
                如果需要外网访问，请使用 ngrok 等内网穿透工具即可
              </text>
            </view>
          </view>
        </view>
      </view>
    </u-popup>
```

- [x] **Step 2: Run typecheck to verify the new bindings fail before implementation**

Run:

```bash
pnpm exec vue-tsc --noEmit -p tsconfig.json
```

Workdir:

```bash
mcode-app
```

Expected: FAIL with errors for missing `showTutorialPopup`, `openTutorialPopup`, and `openDeploymentGuideLink`.
Actual: FAIL as expected for the new bindings, plus pre-existing unrelated workspace TypeScript errors in `CodeBlock.vue`, `MarkdownRenderer.vue`, `main.ts`, `conversation-detail/index.vue`, and `sqlite.ts`.

- [x] **Step 3: Add the popup state and open handler in `<script setup>`**

In `mcode-app/src/pages/connections/index.vue`, add the new state near the existing popup state declarations:

```ts
const showTutorialPopup = ref(false)
```

Add the popup open helper near `subsectionChange`:

```ts
function openTutorialPopup() {
  showTutorialPopup.value = true
}
```

- [x] **Step 4: Run typecheck again to verify only the link helper is still missing**

Run:

```bash
pnpm exec vue-tsc --noEmit -p tsconfig.json
```

Workdir:

```bash
mcode-app
```

Expected: FAIL with an error for missing `openDeploymentGuideLink`.
Actual: FAIL as expected for `openDeploymentGuideLink`, with the same pre-existing unrelated workspace TypeScript errors still present.

- [x] **Step 5: Commit the popup-state wiring**

```bash
git add mcode-app/src/pages/connections/index.vue
git commit -m "feat(app): add deployment tutorial popup state"
```

### Task 2: Implement External Link Opening And Failure Fallback

**Files:**
- Modify: `mcode-app/src/pages/connections/index.vue`

- [x] **Step 1: Add a shared release URL constant and external-link helper implementation**

In `mcode-app/src/pages/connections/index.vue`, add this constant near the other top-level page state:

```ts
const DEPLOYMENT_GUIDE_URL =
  "https://github.com/xintaofei/codeg/releases/tag/v0.14.11"
```

Replace the hard-coded tutorial link text in the template with:

```vue
              <text class="tutorial-step__link" @click="openDeploymentGuideLink">
                {{ DEPLOYMENT_GUIDE_URL }}
              </text>
```

Then add these helpers below `openTutorialPopup`:

```ts
function openDeploymentGuideLink() {
  try {
    if (isH5WebSocketRuntime()) {
      window.open(DEPLOYMENT_GUIDE_URL, "_blank", "noopener,noreferrer")
      return
    }

    if (typeof plus !== "undefined" && plus?.runtime?.openURL) {
      plus.runtime.openURL(DEPLOYMENT_GUIDE_URL)
      return
    }

    throw new Error("unsupported runtime")
  } catch {
    uni.showToast({
      title: "打开链接失败，请手动访问",
      icon: "none",
      duration: 2500,
    })
  }
}
```

- [x] **Step 2: Run typecheck to verify the page compiles with the new helper**

Run:

```bash
pnpm exec vue-tsc --noEmit -p tsconfig.json
```

Workdir:

```bash
mcode-app
```

Expected: PASS with no TypeScript errors from `src/pages/connections/index.vue`.
Actual: The connections page no longer introduced new TypeScript errors, but workspace-wide `vue-tsc` still failed due to the same pre-existing unrelated errors outside this page.

- [x] **Step 3: Build the H5 bundle to catch template/runtime integration issues**

Run:

```bash
pnpm build:h5
```

Workdir:

```bash
mcode-app
```

Expected: PASS with a successful uni-app H5 production build.

- [x] **Step 4: Commit the link-opening behavior**

```bash
git add mcode-app/src/pages/connections/index.vue
git commit -m "feat(app): open deployment tutorial release link"
```

### Task 3: Add Styles And Manually Verify The Flow

**Files:**
- Modify: `mcode-app/src/pages/connections/index.vue`

- [x] **Step 1: Add scoped styles for the tutorial entry and tutorial popup**

Append these styles near the existing popup-related styles in `mcode-app/src/pages/connections/index.vue`, after `.popup-title` and before `.form-container`:

```scss
.tutorial-entry {
  margin-bottom: 24rpx;
  padding: 22rpx 24rpx;
  border-radius: 16rpx;
  background-color: #f4f8ff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;

  &:active {
    background-color: #ebf2ff;
  }
}

.tutorial-entry__copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.tutorial-entry__title {
  font-size: 28rpx;
  font-weight: 600;
  color: #2979ff;
}

.tutorial-entry__desc {
  font-size: 24rpx;
  color: #5c6b77;
}

.tutorial-popup {
  width: 640rpx;
  max-width: calc(100vw - 64rpx);
  padding: 36rpx 30rpx;
  background-color: #ffffff;
  border-radius: 24rpx;
}

.tutorial-steps {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.tutorial-step {
  display: flex;
  align-items: flex-start;
  gap: 18rpx;
}

.tutorial-step__index {
  width: 40rpx;
  height: 40rpx;
  border-radius: 999rpx;
  background-color: #2979ff;
  color: #ffffff;
  font-size: 24rpx;
  font-weight: 600;
  line-height: 40rpx;
  text-align: center;
  flex-shrink: 0;
}

.tutorial-step__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.tutorial-step__title {
  font-size: 28rpx;
  line-height: 1.6;
  color: #303133;
}

.tutorial-step__desc {
  font-size: 24rpx;
  line-height: 1.6;
  color: #606266;
}

.tutorial-step__link {
  font-size: 24rpx;
  line-height: 1.6;
  color: #2979ff;
  word-break: break-all;
}
```

- [x] **Step 2: Run typecheck after the styling pass**

Run:

```bash
pnpm exec vue-tsc --noEmit -p tsconfig.json
```

Workdir:

```bash
mcode-app
```

Expected: PASS.
Actual: Workspace-wide `vue-tsc` remained blocked by the same unrelated pre-existing errors; no new connections-page-specific TypeScript errors were introduced by the styling pass.

- [ ] **Step 3: Run the app locally for manual verification**

Run:

```bash
pnpm dev:h5
```

Workdir:

```bash
mcode-app
```

Expected: Local dev server starts successfully and serves the H5 app.
Actual: Completed the runtime-start portion in CLI. `pnpm dev:h5` started successfully on `http://localhost:18889/` after port `18888` was occupied. The browser-click verification steps below still need a human to run interactively.

Then verify these interactions manually in the browser:

```text
1. Open the connections page and click “新增连接”.
2. Confirm “部署教程” is visible below the popup header.
3. Switch between “手动配置” and “扫码连接”; confirm the tutorial entry remains visible.
4. Click “部署教程”; confirm the center popup opens with 3 numbered steps.
5. Close the tutorial popup; confirm the add-connection popup stays open.
6. Click the GitHub release link; confirm it opens in a new browser tab.
```

- [x] **Step 4: Commit the final UI styling and verification-ready page**

```bash
git add mcode-app/src/pages/connections/index.vue
git commit -m "feat(app): add deployment tutorial entry to connections"
```

## Spec Coverage Check

- Global tutorial entry in the add-connection popup: covered by Task 1 Step 1 and Task 3 Step 1
- Entry visible for both manual and scan subsections: covered by Task 1 Step 1 and Task 3 Step 3
- Dedicated tutorial popup with 3 fixed steps: covered by Task 1 Step 1
- GitHub release link opening behavior with failure toast: covered by Task 2 Step 1
- No changes to connection persistence, pairing, switching, or status logic: preserved by limiting edits to page-local popup/template/helpers only

## Placeholder Scan

Checked for placeholder markers, vague wording, and undefined future tasks. None remain in this plan.

## Type Consistency Check

- `showTutorialPopup`, `openTutorialPopup`, `openDeploymentGuideLink`, and `DEPLOYMENT_GUIDE_URL` use the same names in template and script steps
- All implementation work stays inside `mcode-app/src/pages/connections/index.vue`
- Validation commands consistently use `pnpm exec vue-tsc --noEmit -p tsconfig.json` and `pnpm build:h5` from `mcode-app`
