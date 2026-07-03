# MCode P56 Project Detail Design

## Goal

P56 adds a project detail page for MCode App. The project list no longer opens the project session list directly; tapping a project opens a single project workbench that hosts files, Git, sessions, terminal, and project-bound local todos.

Scope for this iteration is codeg-main first. Existing mcode-desktop connections keep working for project sessions and local todos, but files, Git, and terminal show an unsupported state until desktop exposes the same workspace-level proxy commands.

## Current Context

- `mcode-app/src/pages/projects/index.vue` lists remote projects and currently opens `/pages/sessions/index`.
- `/pages/sessions/index.vue` loads project conversations through `loadRemoteProjectConversations` and opens details through `ensureConversationTab`.
- `/pages/project-git/index.vue` already implements Git workspace status, branch switching, push, commit history, commit action sheet, and routes into commit/diff pages.
- Local todos are stored under `mcode_todos` through `pages/todos/todoState.ts` and are not currently bound to projects.
- codeg-main exposes the workspace commands needed for this page: file tree/read/create, Git, and terminal commands.
- mcode-desktop currently exposes folder registration and CLI session proxy commands, not project file/Git/terminal proxy commands.

## Selected Approach

Use a new `/pages/project-detail/index` page with a compact project header and fixed tab bar:

`文件 / Git / 会话 / 终端 / 待办`

The page owns connection/project resolution and passes the resolved `CodegGateway`, `connectionId`, `folderId`, `projectName`, and `projectPath` into embedded panels. Old pages remain available for compatibility and deep links. Git and session logic should be extracted into reusable panels so the detail page and old pages can share behavior instead of duplicating large blocks.

## Page Architecture

### Project Detail Shell

Responsibilities:

- Parse route parameters: `connectionId`, `folderId`, `projectName`, `projectPath`.
- Resolve and persist the current connection through existing connection context helpers.
- Determine whether the gateway supports codeg-main workspace commands. The first version can use optimistic command calls plus targeted unsupported error handling; a later version can promote this to explicit capability detection.
- Render a compact header with project name, path, connection name, and summary counts.
- Render the tab bar and lazy-load tab content.
- Surface per-tab loading, empty, error, and unsupported states without taking down the entire page.

### Routing

`projects/index.vue` changes project-card click behavior from:

`/pages/sessions/index?connectionId=...&folderId=...&projectName=...`

to:

`/pages/project-detail/index?connectionId=...&folderId=...&projectName=...&projectPath=...`

The project action sheet can keep its Git management entry for compatibility, but the primary flow is the detail page.

## Tab Behavior

### Files

The files tab shows a mobile file browser for the project root:

- Root path is `projectPath`.
- Display a tree or expandable list of directories/files.
- File click reads and previews the selected file.
- Provide copy path and copy content actions.
- Provide first-version create actions for new file and new folder using codeg-main workspace file creation commands.
- Do not implement a full code editor/save workflow in P56. File editing can be a later feature.

Service boundary:

- Add `projectFiles` helpers for `get_file_tree`, `read_file_preview`, and `create_file_tree_entry`.
- Normalize file tree nodes into a simple UI model that can tolerate optional backend fields.
- Keep all file paths workspace-confined by sending `rootPath = projectPath` plus relative `path`.

### Git

The Git tab embeds the existing project Git management behavior:

- Extract current Git page core UI into `ProjectGitPanel.vue`.
- Reuse existing `projectGit.ts` service helpers.
- Workspace status is the upper pane.
- Commit history is the lower pane.
- A drag handle between panes changes their relative height.
- Height ratio is clamped to usable bounds and persisted in local storage. Storage key must include `connectionId` and `folderId`.
- Commit detail and diff can continue to use existing `/pages/project-git-commit/index` and `/pages/project-git-diff/index` routes.

### Sessions

The sessions tab embeds the project conversation list:

- Extract the current `/pages/sessions/index.vue` list into `ProjectSessionsPanel.vue`.
- Reuse `loadRemoteProjectConversations`.
- Continue calling `ensureConversationTab` before navigating to conversation detail.
- Conversation detail route remains unchanged.

### Terminal

The terminal tab uses xterm.js as a hard dependency rather than a simplified text terminal.

Dependencies:

- `@xterm/xterm`
- `@xterm/addon-fit`

Implementation behavior:

- Render only on DOM-capable App targets. Non-DOM targets show a platform unsupported state.
- On first terminal tab activation, call `terminal_spawn` with `workingDir = projectPath`.
- Load `FitAddon` through `Terminal.loadAddon(...)`.
- `Terminal.onData` forwards user input to `terminal_write`.
- Resize events use FitAddon dimensions and call `terminal_resize`.
- Page unload, panel unmount, or explicit close calls `terminal_kill`.
- First version supports one terminal per project detail instance. Multiple terminal tabs can be added later.

References:

- xterm.js official site documents `npm install @xterm/xterm`.
- xterm.js addon guide documents `@xterm/addon-fit` and `Terminal.loadAddon(...)`.

### Todos

The todos tab binds local todos to the current project:

- Extend `TodoItem` with optional `projectId`, `connectionId`, and `projectName`.
- Existing stored todos without these fields remain valid.
- Project detail creates todos with the current project metadata.
- Project detail filters to todos bound to the current `connectionId + folderId`.
- Global todos page continues to read the same storage and show all local todos by default, including old unbound items and project-bound items, so no existing data disappears.
- Existing create/edit/toggle/hide behavior is reused.

## Unsupported And Compatibility Behavior

- codeg-main connections support the full P56 detail page.
- mcode-desktop connections show unsupported states for files, Git, and terminal. Sessions and local project todos remain available.
- Existing `/pages/sessions/index`, `/pages/project-git/index`, commit detail, and diff routes remain registered.
- Old local todo storage is normalized without data loss.
- Missing `projectPath` disables files/Git/terminal and explains that the project path is required.
- Gateway command failures should be scoped to the active tab. A Git failure should not prevent sessions or todos from rendering.

## Styling

- Use uview-plus runtime theme variables with `--up-*` names only.
- Do not add `--mcode-*` theme aliases.
- Keep the design dense and work-focused: no landing-page hero, no decorative section cards, no nested cards.
- Use icon buttons through uview-plus icon components where available.
- Text must fit inside mobile containers; long paths and filenames use wrapping or single-line truncation where appropriate.
- Git split handle must have a stable touch target and must not cause layout jumps.

## Data Flow

1. Project list loads projects through `loadRemoteProjects` and `buildProjectListItems`.
2. User taps a project.
3. Project detail resolves the connection and stores the resolved context.
4. Active tab loads its own data:
   - Files: file tree and selected file preview from codeg-main workspace commands.
   - Git: branch/status/branches/log through existing Git helpers.
   - Sessions: project conversation list from project sessions service.
   - Terminal: xterm instance bound to `terminal_*` gateway commands.
   - Todos: local storage filtered by project binding.
5. Pull-to-refresh or an explicit refresh reloads only the active tab plus header summaries.

## Testing Plan

Unit tests:

- Project detail route builder or project list click target includes `projectPath`.
- Todo normalization keeps old items and adds optional project metadata for new project todos.
- Project todo filtering uses `connectionId + folderId`.
- Git split ratio clamp and storage key behavior.
- File service payloads for tree, preview, and create.
- Terminal service payloads for spawn, write, resize, kill, and list.
- Unsupported-state helper recognizes mcode-desktop or unsupported command failures.

Component/page tests:

- `ProjectSessionsPanel` opens conversations with `ensureConversationTab`.
- `ProjectGitPanel` renders workspace and history and keeps existing action routing.
- `ProjectTerminalPanel` does not instantiate xterm on unsupported platforms.

Verification:

- Run focused Jest tests for project Git, sessions, todos, file helpers, and terminal helpers.
- Run `npx vue-tsc --noEmit`.
- Run H5 manually for codeg-main: project list -> detail -> each tab.

## Native iOS/Android Replication Guidance

- Native clients should implement the same project detail shell and tabs.
- Native file browsing must call workspace-confined backend commands using project root and relative paths.
- Native terminal must use a real terminal emulator component and bridge input/output to `terminal_*` commands. It should not degrade into a plain text log unless the platform cannot host an interactive terminal.
- Git split height should be persisted per project.
- Project-bound todos should use the same optional metadata fields and preserve old unbound todos.
- Unsupported connections should show per-tab unsupported states rather than hiding the whole detail page.
