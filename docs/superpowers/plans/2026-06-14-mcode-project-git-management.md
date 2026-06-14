# MCode Project Git Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adjust the existing `mcode-app` project git management flow so commit history no longer renders inline file lists, but instead drills into a commit-detail page and then into a dedicated diff page, while keeping workspace state above history and allowing workspace files to open diff as well.

**Architecture:** Keep the current full connection-context routing chain and reuse the existing `codeg-main` web git RPC surface directly through `mcode-app/src/services/projectGit.ts`. The existing history page becomes a summary/index page, a new commit-detail page renders a selected commit's file list from already-loaded route data, and a new diff page loads either `git_show_diff(path, commit, file)` or `git_diff(path, file)` depending on whether the user came from commit history or the current workspace.

**Tech Stack:** Vue 3 `script setup`, uni-app pages/navigation, `uview-plus` components, TypeScript service helpers, Jest unit tests, existing remote web RPC protocol exposed by `codeg-main`.

---

## File Structure

### Existing files to modify

- `mcode-app/src/pages/projects/index.vue`
  - Responsibility: preserve project-session primary navigation, keep the right-side action-sheet entry for `Git 管理`, and ensure the route params are built consistently through a shared helper.
- `mcode-app/src/pages/project-git/index.vue`
  - Responsibility: render the git page, load all required data through the resolved connection context, keep workspace status above history, route commit taps to the commit-detail page, and route workspace file taps to the diff page.
- `mcode-app/src/pages/project-git-commit/index.vue`
  - Responsibility: render a second-level page for one commit, showing commit metadata and changed files, and route file taps to the diff page.
- `mcode-app/src/pages/project-git-diff/index.vue`
  - Responsibility: load the diff text for either a workspace file or a commit file and render it through a structured split diff viewer.
- `mcode-app/src/components/GitDiffViewer.vue`
  - Responsibility: render parsed unified diff hunks with split old/new columns, line numbers, and colored addition/deletion rows.
- `mcode-app/src/services/projectGit.ts`
  - Responsibility: typed wrappers around the remote git RPC calls, route/presentation helpers, route builders for commit-detail and diff pages, payload encode/decode helpers for passing commit/file metadata between pages, and diff/file-status presentation helpers.
- `mcode-app/src/pages.json`
  - Responsibility: page registration for `pages/project-git/index`, `pages/project-git-commit/index`, and `pages/project-git-diff/index`.
- `mcode-app/tests/services/projectGit.spec.ts`
  - Responsibility: service/helper regression tests for route building, git status normalization, summary counters, and branch-view gating.
- `mcode-app/tests/pages/projectGitPresentation.spec.ts`
  - Responsibility: page-facing helper/presentation tests so project-git-specific UI rules are covered separately from the lower-level service tests.
- `docs/mcode-architecture-notes/2026-06-14-project-git-management.md`
  - Responsibility: required concise architecture note covering data flow, UI behavior, compatibility, and native replication guidance.

### Reference files to inspect while implementing

- `mcode-app/src/services/connectionContext.ts`
- `mcode-app/src/services/projectSessions.ts`
- `mcode-app/src/services/gateway/types.ts`
- `mcode-app/src/services/gateway/directGateway.ts`
- `mcode-app/src/services/gateway/relayGateway.ts`
- `mcode-app/src/pages/sessions/index.vue`
- `codeg-main/src/lib/types.ts`
- `codeg-main/src/lib/api.ts`
- `codeg-main/src-tauri/src/web/router.rs`

### Current workspace state to respect

The workspace already contains uncommitted project-git files:

- `mcode-app/src/pages/project-git/index.vue`
- `mcode-app/src/services/projectGit.ts`
- `mcode-app/tests/services/projectGit.spec.ts`
- `mcode-app/tests/pages/projectGitPresentation.spec.ts`
- `docs/mcode-architecture-notes/2026-06-14-project-git-management.md`

This plan therefore treats them as partial implementations to refine rather than files to create from scratch.

## Task 1: Extend shared project git service helpers for drill-down navigation and diff loading

**Files:**
- Modify: `mcode-app/src/services/projectGit.ts`
- Modify: `mcode-app/tests/services/projectGit.spec.ts`

- [ ] **Step 1: Expand the failing service tests around the helpers that already exist**

Replace `mcode-app/tests/services/projectGit.spec.ts` with:

```ts
import {
  buildProjectGitRoute,
  buildWorkspaceStatusSummary,
  isCurrentBranchHistoryView,
  normalizeGitStatusEntries,
} from "@/services/projectGit"

describe("projectGit service", () => {
  it("normalizes git status entries and preserves supported statuses", () => {
    expect(
      normalizeGitStatusEntries([
        { status: "M", file: "src/App.vue" },
        { status: "A", file: "src/new.ts" },
        { status: "D", file: "src/old.ts" },
        { status: "??", file: "README.md" },
      ])
    ).toEqual([
      { status: "M", file: "src/App.vue" },
      { status: "A", file: "src/new.ts" },
      { status: "D", file: "src/old.ts" },
      { status: "??", file: "README.md" },
    ])
  })

  it("ignores invalid git status rows", () => {
    expect(
      normalizeGitStatusEntries([
        null,
        { status: "", file: "src/empty.ts" },
        { status: "M" },
        { file: "src/missing-status.ts" },
        { status: "A", file: "src/kept.ts" },
      ])
    ).toEqual([{ status: "A", file: "src/kept.ts" }])
  })

  it("builds workspace summary counters from git status entries", () => {
    expect(
      buildWorkspaceStatusSummary([
        { status: "M", file: "src/App.vue" },
        { status: " M", file: "src/changed.ts" },
        { status: "A", file: "src/new.ts" },
        { status: "D", file: "src/old.ts" },
        { status: "??", file: "README.md" },
      ])
    ).toEqual({
      modified: 2,
      added: 1,
      deleted: 1,
      untracked: 1,
    })
  })

  it("counts combined status flags without dropping non-delete changes", () => {
    expect(
      buildWorkspaceStatusSummary([
        { status: "AM", file: "src/both.ts" },
        { status: "MD", file: "src/remove-after-edit.ts" },
      ])
    ).toEqual({
      modified: 2,
      added: 1,
      deleted: 1,
      untracked: 0,
    })
  })

  it("treats only the selected current branch as reset-safe", () => {
    expect(isCurrentBranchHistoryView("main", "main")).toBe(true)
    expect(isCurrentBranchHistoryView("main", "feature/mobile")).toBe(false)
    expect(isCurrentBranchHistoryView("main", "origin/main")).toBe(false)
    expect(isCurrentBranchHistoryView(null, "main")).toBe(false)
  })

  it("builds a route carrying connection, folder, project name, and project path", () => {
    expect(
      buildProjectGitRoute({
        encodedConnection: "ctx123",
        folderId: 42,
        projectName: "demo",
        projectPath: "D:/Repos/demo",
      })
    ).toBe(
      "/pages/project-git/index?connection=ctx123&folderId=42&projectName=demo&projectPath=D%3A%2FRepos%2Fdemo"
    )
  })
})
```

- [ ] **Step 2: Run the service test to capture current failures**

Run:

```bash
pnpm test:unit -- projectGit.spec.ts
```

Expected: FAIL if the current `buildWorkspaceStatusSummary` still returns early after `D` or `A` and therefore under-counts combined status flags.

- [ ] **Step 3: Fix the service helper behavior and keep the RPC wrappers aligned with the real gateway signature**

Update `mcode-app/src/services/projectGit.ts` so:

1. `buildWorkspaceStatusSummary` counts `D`, `A`, and `M` independently instead of returning early.
2. The route helper remains the single source of truth for git-page navigation.
3. The remote wrappers continue to use `gateway.call(command, payload)` only, matching `CodegGateway` from `mcode-app/src/services/gateway/types.ts`.

The corrected counter logic should be:

```ts
export function buildWorkspaceStatusSummary(
  entries: GitStatusEntry[]
): WorkspaceStatusSummary {
  return entries.reduce<WorkspaceStatusSummary>(
    (summary, entry) => {
      const normalizedStatus = entry.status.trim().toUpperCase()
      if (normalizedStatus === "??") {
        summary.untracked += 1
        return summary
      }
      if (normalizedStatus.includes("D")) {
        summary.deleted += 1
      }
      if (normalizedStatus.includes("A")) {
        summary.added += 1
      }
      if (normalizedStatus.includes("M")) {
        summary.modified += 1
      }
      return summary
    },
    { modified: 0, added: 0, deleted: 0, untracked: 0 }
  )
}
```

- [ ] **Step 4: Run the service test again**

Run:

```bash
pnpm test:unit -- projectGit.spec.ts
```

Expected: PASS with all helper tests green.

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/services/projectGit.ts mcode-app/tests/services/projectGit.spec.ts
git commit -m "fix: harden mobile project git helpers"
```

## Task 2: Normalize the project list git entry flow around the shared route helper

**Files:**
- Modify: `mcode-app/src/pages/projects/index.vue`
- Modify: `mcode-app/tests/pages/projectGitPresentation.spec.ts`

- [ ] **Step 1: Replace the page-facing helper test with focused routing/presentation coverage**

Replace `mcode-app/tests/pages/projectGitPresentation.spec.ts` with:

```ts
import {
  buildProjectGitRoute,
  buildWorkspaceStatusSummary,
  isCurrentBranchHistoryView,
} from "@/services/projectGit"

describe("project git routing helpers", () => {
  it("builds a route carrying connection, folder, project name, and project path", () => {
    expect(
      buildProjectGitRoute({
        encodedConnection: "ctx123",
        folderId: 42,
        projectName: "demo",
        projectPath: "D:/Repos/demo",
      })
    ).toBe(
      "/pages/project-git/index?connection=ctx123&folderId=42&projectName=demo&projectPath=D%3A%2FRepos%2Fdemo"
    )
  })
})

describe("project git presentation helpers", () => {
  it("summarizes workspace counters for the page header", () => {
    expect(
      buildWorkspaceStatusSummary([
        { status: "M", file: "src/App.vue" },
        { status: "A", file: "src/new.ts" },
        { status: "D", file: "src/old.ts" },
        { status: "??", file: "README.md" },
      ])
    ).toEqual({
      modified: 1,
      added: 1,
      deleted: 1,
      untracked: 1,
    })
  })

  it("allows reset only on the current branch view", () => {
    expect(isCurrentBranchHistoryView("main", "main")).toBe(true)
    expect(isCurrentBranchHistoryView("main", "origin/main")).toBe(false)
    expect(isCurrentBranchHistoryView("main", "feature/mobile")).toBe(false)
  })
})
```

- [ ] **Step 2: Run the focused presentation test**

Run:

```bash
pnpm test:unit -- projectGitPresentation.spec.ts
```

Expected: PASS once Task 1 helper fixes are in place.

- [ ] **Step 3: Refine the project list page without regressing the primary tap target**

In `mcode-app/src/pages/projects/index.vue`, verify and tighten these behaviors:

1. The `.project-card__tap` wrapper remains the only primary session-navigation target.
2. The right-side menu keeps `.stop` propagation so it never opens project sessions.
3. `projectActions` stays a computed value or local constant with `Git 管理`.
4. `handleProjectActionSelect` uses `buildProjectGitRoute(...)` and passes:
   - `encodedConnection`
   - `folderId`
   - `projectName`
   - `projectPath`

The navigation body should remain:

```ts
function handleProjectActionSelect() {
  const item = currentProjectAction.value
  showProjectActionSheet.value = false
  if (!item || !connection.value) return
  const encodedConnection = encodeConnectionContext(connection.value)
  uni.navigateTo({
    url: buildProjectGitRoute({
      encodedConnection,
      folderId: item.id,
      projectName: item.name,
      projectPath: item.path,
    }),
  })
}
```

- [ ] **Step 4: Re-run the presentation test after the page cleanup**

Run:

```bash
pnpm test:unit -- projectGitPresentation.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/pages/projects/index.vue mcode-app/tests/pages/projectGitPresentation.spec.ts
git commit -m "feat: stabilize project git entry navigation"
```

## Task 3: Harden the project git page data-load flow and branch-history state

**Files:**
- Modify: `mcode-app/src/pages/project-git/index.vue`

- [ ] **Step 1: Capture the current type/runtime risk before editing**

Run:

```bash
pnpm exec vue-tsc --noEmit
```

Expected: FAIL or WARN on the current `project-git` page if the page still relies on loose `any`, duplicated decode logic, or event-handler shapes that do not line up cleanly with the existing uni-app typings.

- [ ] **Step 2: Tighten the page state around the resolved gateway and branch selection**

In `mcode-app/src/pages/project-git/index.vue`:

1. Replace `resolvedGateway = ref<any>(null)` with a typed ref based on `CodegGateway`.
2. Keep the page keyed by:
   - `connection`
   - `folderId`
   - `projectName`
   - `projectPath`
3. On load, decode `connection`, parse ids/names, and call `loadPage()`.
4. Inside `loadPage()`:
   - resolve the connection context
   - persist the resolved connection
   - cache `resolved.gateway`
   - load branch, status, branches, and git log in parallel
   - keep `selectedBranch` equal to `currentBranch` on first load only

The relevant typed state should look like:

```ts
import type { CodegGateway } from "@/services/gateway"

const resolvedGateway = ref<CodegGateway | null>(null)
const currentBranch = ref<string | null>(null)
const selectedBranch = ref<string | null>(null)
const workspaceEntries = ref<GitStatusEntry[]>([])
const gitEntries = ref<GitLogEntry[]>([])
const branchList = ref<GitBranchList | null>(null)
```

The load flow should keep the current branch on first load:

```ts
const [branch, statusEntries, branches, logResult] = await Promise.all([
  getRemoteGitBranch(resolved.gateway, projectPath.value),
  getRemoteGitStatus(resolved.gateway, projectPath.value),
  getRemoteGitBranches(resolved.gateway, projectPath.value),
  getRemoteGitLog(resolved.gateway, projectPath.value, selectedBranch.value),
])

currentBranch.value = branch
if (!selectedBranch.value) {
  selectedBranch.value = branch
}
workspaceEntries.value = statusEntries
branchList.value = branches
gitEntries.value = logResult.entries
```

- [ ] **Step 3: Make branch switching correctly change both the checkout target and the history target**

The current half-implementation checks out the branch immediately. Keep that behavior for the approved v1, but make the state transition explicit:

```ts
async function handleBranchSelect(action: { name: string }) {
  if (!resolvedGateway.value || !projectPath.value) return
  selectedBranch.value = action.name
  showBranchActionSheet.value = false
  await checkoutRemoteBranch(resolvedGateway.value, projectPath.value, action.name)
  await loadPage()
}
```

Also deduplicate `branchActions` so a branch shown in both local/remote lists only renders once:

```ts
const branchActions = computed(() =>
  [
    ...(branchList.value?.local || []).map((name) => ({ name })),
    ...(branchList.value?.remote || []).map((name) => ({ name })),
  ].filter(
    (entry, index, array) =>
      array.findIndex((item) => item.name === entry.name) === index
  )
)
```

- [ ] **Step 4: Re-run the type check**

Run:

```bash
pnpm exec vue-tsc --noEmit
```

Expected: PASS or significantly fewer page-level typing issues, with `project-git/index.vue` clean.

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/pages/project-git/index.vue
git commit -m "fix: stabilize project git page loading state"
```

## Task 4: Finish and verify branch creation, reset, and push interactions on the git page

**Files:**
- Modify: `mcode-app/src/pages/project-git/index.vue`
- Modify: `mcode-app/src/services/projectGit.ts`

- [ ] **Step 1: Verify the real RPC payload names against the existing service wrappers**

Inspect the current wrappers in `mcode-app/src/services/projectGit.ts` and confirm they stay aligned with the existing RPC commands already used elsewhere in the app:

```ts
checkoutRemoteBranch(...): gateway.call<void>("git_checkout", { path, branchName })
createRemoteBranch(...): gateway.call<void>("git_new_branch", { path, branchName, startPoint })
resetRemoteBranch(...): gateway.call<void>("git_reset", { path, commit, mode })
getRemotePushInfo(...): gateway.call<GitPushInfo>("git_push_info", { path })
pushRemoteBranch(...): gateway.call("git_push", {
  path,
  remoteName: remoteName ?? null,
  setUpstream: Boolean(setUpstream),
})
```

If the current service already matches this, keep the wrapper signatures stable and focus the edits on page behavior.

- [ ] **Step 2: Make commit-action flows explicit and safe on the page**

In `mcode-app/src/pages/project-git/index.vue`, ensure:

1. opening a commit action sheet stores `currentCommitAction`
2. branch creation resets the input value and opens the popup
3. reset only opens when `isCurrentBranchHistoryView(currentBranch.value, selectedBranch.value)` is true
4. reset mode changes are typed cleanly through a helper instead of inline casts when possible

Keep these handlers:

```ts
function openCommitActionSheet(entry: GitLogEntry) {
  currentCommitAction.value = entry
  void preloadCommitBranches(entry)
  showCommitActionSheet.value = true
}

function handleCommitActionSelect(action: { name: string }) {
  showCommitActionSheet.value = false
  if (action.name === "新建分支") {
    createBranchName.value = ""
    showCreateBranchPopup.value = true
    return
  }
  if (
    action.name === "Reset 到这里" &&
    isCurrentBranchHistoryView(currentBranch.value, selectedBranch.value)
  ) {
    resetMode.value = "mixed"
    showResetPopup.value = true
  }
}

function handleResetModeChange(value: string) {
  resetMode.value = value as GitResetMode
}
```

- [ ] **Step 3: Finish the write-operation success paths**

Keep the approved refresh-after-success behavior:

```ts
async function submitCreateBranch() {
  if (
    !resolvedGateway.value ||
    !projectPath.value ||
    !currentCommitAction.value ||
    !createBranchName.value.trim()
  ) {
    return
  }

  await createRemoteBranch(
    resolvedGateway.value,
    projectPath.value,
    createBranchName.value.trim(),
    currentCommitAction.value.full_hash
  )
  showCreateBranchPopup.value = false
  await loadPage()
}

async function submitReset() {
  if (!resolvedGateway.value || !projectPath.value || !currentCommitAction.value) return

  await resetRemoteBranch(
    resolvedGateway.value,
    projectPath.value,
    currentCommitAction.value.full_hash,
    resetMode.value
  )
  showResetPopup.value = false
  await loadPage()
}

async function handlePush() {
  if (!resolvedGateway.value || !projectPath.value) return
  const info = await getRemotePushInfo(resolvedGateway.value, projectPath.value)
  const remoteName = info.tracking_remote || info.remotes[0]?.name || null
  await pushRemoteBranch(
    resolvedGateway.value,
    projectPath.value,
    remoteName,
    !info.tracking_remote
  )
  await loadPage()
}
```

The page should keep the top action row containing:

```vue
<view class="project-git-action" @click="refreshPage">
  <text>刷新</text>
</view>
<view class="project-git-action project-git-action--primary" @click="openBranchSheet">
  <text>切分支</text>
</view>
<view class="project-git-action" @click="handlePush">
  <text>Push</text>
</view>
```

- [ ] **Step 4: Run the focused tests and type check**

Run:

```bash
pnpm test:unit -- projectGit.spec.ts projectGitPresentation.spec.ts
pnpm exec vue-tsc --noEmit
```

Expected: PASS on both commands.

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/pages/project-git/index.vue mcode-app/src/services/projectGit.ts mcode-app/tests/services/projectGit.spec.ts mcode-app/tests/pages/projectGitPresentation.spec.ts
git commit -m "feat: finish mobile project git actions"
```

## Task 5: Finalize the required architecture note and verify scope alignment

**Files:**
- Modify: `docs/mcode-architecture-notes/2026-06-14-project-git-management.md`

- [ ] **Step 1: Reconcile the note with the final implementation**

Open `docs/mcode-architecture-notes/2026-06-14-project-git-management.md` and ensure it explicitly covers:

1. the project-card right-side `Git 管理` entry
2. preserved card-body navigation to project sessions
3. full connection-context routing
4. git RPC keyed by project `path`
5. direct reuse of:
   - `get_git_branch`
   - `git_status`
   - `git_log`
   - `git_list_all_branches`
   - `git_commit_branches`
   - `git_checkout`
   - `git_new_branch`
   - `git_reset`
   - `git_push_info`
   - `git_push`
6. the “workspace status first, history second” page behavior
7. reset gating to the current-branch view
8. the non-goal that conflict-heavy merge/rebase flows stay desktop-oriented

If any item is missing, patch the note inline until the final content matches the implemented behavior.

- [ ] **Step 2: Read the note back for verification**

Run:

```bash
Get-Content docs/mcode-architecture-notes/2026-06-14-project-git-management.md
```

Expected: The note fully covers architecture, data flow, UI behavior, compatibility, and iOS/Android replication guidance.

- [ ] **Step 3: Commit**

```bash
git add docs/mcode-architecture-notes/2026-06-14-project-git-management.md
git commit -m "docs: finalize project git management note"
```

## Task 6: Verify the final change set against the current dirty workspace

**Files:**
- Verify: `mcode-app/src/pages/projects/index.vue`
- Verify: `mcode-app/src/pages/project-git/index.vue`
- Verify: `mcode-app/src/services/projectGit.ts`
- Verify: `mcode-app/tests/services/projectGit.spec.ts`
- Verify: `mcode-app/tests/pages/projectGitPresentation.spec.ts`
- Verify: `docs/mcode-architecture-notes/2026-06-14-project-git-management.md`

- [ ] **Step 1: Run the focused Jest tests**

Run:

```bash
pnpm test:unit -- projectGit.spec.ts projectGitPresentation.spec.ts
```

Expected: PASS with both service and presentation helper tests green.

- [ ] **Step 2: Run the app type check**

Run:

```bash
pnpm exec vue-tsc --noEmit
```

Expected: PASS with no TypeScript errors in the updated project-git flow.

- [ ] **Step 3: Review only the relevant diff**

Run:

```bash
git diff -- mcode-app/src/pages/projects/index.vue mcode-app/src/pages/project-git/index.vue mcode-app/src/services/projectGit.ts mcode-app/tests/services/projectGit.spec.ts mcode-app/tests/pages/projectGitPresentation.spec.ts docs/mcode-architecture-notes/2026-06-14-project-git-management.md
```

Expected: The diff shows:
- preserved project-card primary navigation
- right-side git-management entry
- workspace status rendered above commit history
- direct reuse of the existing git RPC surface
- safe reset gating
- required architecture note

- [ ] **Step 4: Commit the final converged state**

```bash
git add mcode-app/src/pages/projects/index.vue mcode-app/src/pages/project-git/index.vue mcode-app/src/services/projectGit.ts mcode-app/tests/services/projectGit.spec.ts mcode-app/tests/pages/projectGitPresentation.spec.ts docs/mcode-architecture-notes/2026-06-14-project-git-management.md
git commit -m "feat: complete mobile project git management"
```

## Self-Review

### Spec coverage

Covered requirements:

- project-card right-side dropdown entry
- preserved primary navigation to project sessions
- dedicated git page route
- workspace status at the top
- commit history below
- direct reuse of existing remote git RPC
- branch switching
- branch creation from commit
- reset gating to current branch view
- push without desktop popup dependency
- required architecture note

Known intentional limitation preserved from the spec:

- no mobile-first merge/rebase/conflict-resolution workflow in v1

### Placeholder scan

No `TODO`, `TBD`, or “similar to” instructions remain. Each task lists exact files, concrete commands, and concrete code or content blocks.

### Type consistency

The plan uses the current `CodegGateway` signature from `mcode-app/src/services/gateway/types.ts`, the current helper/module names already present in `projectGit.ts`, and Jest-based `pnpm test:unit -- <pattern>` commands that match the repo’s current test runner configuration.
