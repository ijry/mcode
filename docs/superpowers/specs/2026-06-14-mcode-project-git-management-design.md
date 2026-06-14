# MCode Project Git Management Design

## Goal

Add a full project-level git management flow to `mcode-app`, entered from a new dropdown menu on the right side of each project card in the project list, while keeping the project card body navigation to project sessions unchanged.

## Problem

`mcode-app` already has a remote connection list, a project list, and a project session list, but it does not yet expose the remote project's git state and history as a first-class mobile workflow.

At the same time, `codeg-main` already exposes a substantial set of web git APIs:

- `get_git_branch`
- `git_status`
- `git_log`
- `git_list_all_branches`
- `git_commit_branches`
- `git_new_branch`
- `git_reset`
- `git_checkout`
- `git_push`
- related pure git RPC routes for diff and push metadata

The missing piece is not a new backend git subsystem. The missing piece is a mobile-oriented page and interaction model that maps those existing APIs into a usable project-level git management experience.

## User Outcomes

After this change:

1. The project list card body still opens the project session list.
2. Each project card gains a right-side dropdown menu.
3. Selecting `Git 管理` opens a dedicated project git page.
4. The top of the git page shows the current workspace state.
5. The rest of the page shows git commit history for the project.
6. Users can perform the core project git actions from mobile:
   - inspect workspace changes
   - inspect commit history
   - switch branches
   - create a branch from a commit
   - reset the current branch to a commit
   - push changes

## Non-Goals

1. Replacing the existing project session page.
2. Redesigning the connection list or project list beyond adding the new project-card menu entry.
3. Introducing a new mcode-specific git backend protocol.
4. Supporting complex merge, rebase, or conflict-resolution editing flows on mobile in v1.
5. Mirroring desktop-only popup-window flows such as `open_push_window` on mobile.

## Recommended Approach

Reuse the existing `codeg-main` web git RPC endpoints directly from `mcode-app`, and build one dedicated mobile project git page that composes those APIs into a safe mobile workflow.

This is the recommended approach because:

1. `codeg-main` already has the core git capabilities.
2. Reusing the existing RPC surface keeps desktop and mobile behavior aligned.
3. A new mobile-only git backend layer would duplicate protocol logic and drift over time.
4. The remaining work is mostly front-end state composition and mobile interaction design, not backend git implementation.

Alternatives considered:

### 1. New aggregated read endpoint plus existing write endpoints

Rejected as the primary approach because it adds a second read protocol that the mobile app alone depends on, while the current RPC surface is already sufficient.

### 2. Full mcode-only git service layer

Rejected because it duplicates existing backend logic and increases long-term maintenance cost without unlocking meaningfully different user outcomes.

## Navigation And Entry Design

### Project List Card Behavior

Approved interaction:

1. The project card body continues to open the project session list.
2. The right side of the project card gets a dropdown-menu trigger.
3. The dropdown contains at least:
   - `Git 管理`
4. Optionally, the dropdown may also include:
   - `项目会话`

The important rule is that the primary tap target remains session-oriented, and git management becomes an explicit secondary action.

### New Page

Add a dedicated page:

- `/pages/project-git/index`

Route parameters should include:

- `connection`
- `folderId`
- `projectName`
- optional `projectPath`

The page must continue to use the same encoded complete connection context already established in the connection -> project list -> project session flow, rather than falling back to a global current connection assumption.

## Page Layout

The page should have two major sections.

### 1. Workspace Status Card

This section is always shown above the history list and is the first visible information block on the page.

It displays:

- current branch
- project path
- counts for:
  - modified
  - added
  - deleted
  - untracked
- current workspace change entries

It also contains the top-level actions:

- refresh
- push
- branch switch

### 2. Commit History List

Below the workspace status card, render git history for the project.

The history page is still history-first, but the approved requirement is that the top of that history flow is the current workspace status, not the first commit card.

Each commit item should support:

- expand to inspect changed files
- view diff
- create a branch from this commit
- reset to this commit

## Data And Routing Model

### Identity For Git Operations

All git RPC operations on the mobile page should use the project's filesystem `path` as the git identity key.

`folderId` remains useful for:

- navigation
- linking back to project sessions
- preserving project context in routes

But git actions themselves should consistently target `path`, because that is what the existing `codeg-main` git APIs already expect.

### Connection Context

The git page should reuse the existing connection context helpers:

- `decodeConnectionContext`
- `resolveConnectionContext`
- `persistResolvedConnection`
- `encodeConnectionContext`

This preserves compatibility with both direct and relay connections and keeps project git navigation aligned with the already-approved project/session navigation architecture.

## RPC Mapping

The mobile page should reuse existing web APIs directly.

### Initial Read Load

Load these calls in parallel for the first screen:

1. `get_git_branch(path)`
2. `git_status(path, showAllUntracked=true)`
3. `git_list_all_branches(path)`
4. `git_log(path, limit, branch?, remote?)`

### Lazy Read Load

Only fetch commit-branch membership when needed:

1. `git_commit_branches(path, commit)`

This should happen when:

- a commit card expands
- or a commit action menu opens and needs branch-context display

### Write Operations

Use the existing write APIs directly:

1. branch switch:
   - `git_checkout`
2. create branch:
   - `git_new_branch(path, branchName, startPoint)`
3. reset:
   - `git_reset(path, commit, mode)`
4. push:
   - `git_push`

### Refresh Behavior

After any successful write operation, refresh:

1. current branch
2. workspace status
3. branch list
4. commit history

Commit-branch membership can be lazily reloaded again when the relevant card is opened.

## Frontend State Model

Keep the git page state split into focused local sections rather than one large combined state object.

### Header State

```ts
interface ProjectGitHeaderState {
  folderId: number
  projectName: string
  path: string
  currentBranch: string | null
}
```

### Workspace Status State

```ts
interface ProjectGitWorkspaceState {
  entries: GitStatusEntry[]
}
```

Derived counters:

- modified
- added
- deleted
- untracked

### Branch State

```ts
interface ProjectGitBranchState {
  branchList: GitBranchList | null
  selectedBranch: string | null
  isCurrentBranchView: boolean
}
```

### History State

```ts
interface ProjectGitHistoryState {
  entries: GitLogEntry[]
  hasUpstream: boolean
  openCommitMap: Record<string, boolean>
  commitBranchesMap: Record<string, string[]>
}
```

### Operation State

```ts
interface ProjectGitOperationState {
  loading: boolean
  refreshing: boolean
  switchingBranch: boolean
  pushing: boolean
  creatingBranch: boolean
  resetting: boolean
  errorMessage: string
}
```

This decomposition keeps page refresh, branch actions, and commit-level expansion logic from interfering with one another.

## Interaction Rules

### Workspace Status Card

The workspace status card is always rendered at the top of the page and is expanded by default.

It should show:

- branch summary
- status counters
- individual changed files

Tapping a changed file should open a diff-oriented preview flow if the existing pure git diff APIs are available in a way that fits the mobile page; otherwise the card can remain read-only for file-level inspection in v1 while preserving commit-level diff access.

### Branch Switching

Tapping the branch summary opens a bottom sheet or equivalent mobile branch picker.

The picker should:

1. show local branches first
2. show remote branches second
3. clearly indicate the current branch
4. switch immediately after the user selects a branch
5. refresh the full page after success

### Create Branch From Commit

This action lives on each commit card's menu.

Flow:

1. user taps `新建分支`
2. an input dialog or bottom-sheet form asks for the new branch name
3. the selected commit becomes the `startPoint`
4. on success, the page refreshes current branch, branch list, status, and history

### Reset To Commit

Reset is a high-risk action and must follow strict rules.

Rules:

1. Only allow reset while viewing the current branch.
2. If the user is browsing another branch's history, disable reset.
3. The confirmation UI must show:
   - current branch name
   - target commit hash
   - target commit message
   - reset mode choice

Supported reset modes:

- `soft`
- `mixed`
- `hard`
- `keep`

On success, refresh the full page.

### Push

Push should be executed as a pure RPC flow, not by trying to reuse desktop popup windows.

Expected flow:

1. inspect the current branch/upstream state through the existing push-related APIs
2. if the branch does not yet have an upstream, prompt the user to choose the remote and confirm upstream setup
3. perform push
4. refresh the history list so pushed-state indicators stay accurate

### Commit History

The history section should default to the current branch view.

Each commit card supports:

- collapsed summary
- expandable details
- file list inside the commit
- action menu

The file list may show:

- path
- status
- additions
- deletions

## Error Handling And Limits

### Non-Git Repository

If the project path is not a git repository, the page should show a dedicated empty/error state:

- `当前项目不是 Git 仓库`

This should be distinguished from generic network or remote failures.

### Remote API Failure

If any initial read API fails:

1. show a stable page-level error state
2. keep a `重试` action
3. avoid partial interactive controls that would operate on stale assumptions

### Write Failure

If branch switch, push, new branch, or reset fails:

1. show a clear toast or inline error
2. keep the page open
3. do not optimistically update the visible state beyond what the backend confirmed

### Merge/Rebase/Conflict Cases

The first version should not try to make mobile conflict-resolution a first-class workflow.

If an operation surfaces conflict-related or human-intervention-required errors:

1. show the backend error clearly
2. keep the repo state readable
3. direct the user to handle the complex resolution on desktop

## Compatibility

This feature must preserve:

1. the existing project list primary navigation to project sessions
2. the existing project session page
3. the existing conversation detail page
4. the full connection-context routing model

This feature must not:

1. introduce new `--mcode-*` theme variables for colors/backgrounds/borders/shadows
2. depend on desktop-only popup window flows
3. require a new server-side git aggregation protocol

## Implementation Scope

Primary files:

- `mcode-app/src/pages/projects/index.vue`
- `mcode-app/src/pages.json`
- new `mcode-app/src/pages/project-git/index.vue`
- new or expanded `mcode-app/src/services/projectGit.ts`

Expected supporting test files:

- `mcode-app/tests/pages/projects/...`
- `mcode-app/tests/pages/project-git/...`
- `mcode-app/tests/services/projectGit.spec.ts`

Required mcode architecture note:

- new markdown note under `docs/mcode-architecture-notes/`

## Testing

### Navigation Tests

Verify:

1. tapping the project card body still opens the project sessions page
2. tapping the project-card right-side menu opens the git-management action
3. selecting `Git 管理` opens the new project git page with the expected route params

### Read-State Tests

Verify:

1. `git_status` renders workspace counters and file entries correctly
2. `git_log` renders the commit list correctly
3. `git_list_all_branches` renders local and remote branch groups correctly
4. initial read failure renders the unified retryable error state

### Write-Action Tests

Verify:

1. creating a branch refreshes the page state after success
2. resetting refreshes the page state after success
3. switching branches refreshes the page state after success
4. push refreshes visible pushed-state indicators
5. reset is disabled when the history view is not the current branch

### Compatibility Tests

Verify:

1. non-git repositories render the dedicated not-a-git-repo state
2. old connection context routing still works for project and session flows
3. git-page routing keeps the full connection context instead of assuming a global singleton

