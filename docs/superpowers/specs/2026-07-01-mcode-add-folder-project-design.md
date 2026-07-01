# MCode Add Folder Project Design

## Goal

Support adding folders as projects from MCode App, including connections backed by `mcode-desktop`. The mobile app should let users browse the connected machine filesystem, select a folder, register it as a project, and immediately use it in the existing session and project flows.

## Problem

MCode App can list projects through `list_open_folder_details`, but it has no mobile entry for adding a folder. `codeg-main` already has a server-side directory browser protocol:

- `get_home_directory`
- `list_directory_entries`
- `open_folder`

MCode App can call arbitrary gateway commands, so `codeg-main` connections can reuse that protocol. `mcode-desktop` currently does not expose these folder commands and returns an empty project list for the Codex adapter slice. To make this feature work for desktop connections, desktop needs a small folder registry and matching proxy commands.

## User Outcomes

After this change:

1. Each connection group in the conversation overview has an add-project action on the right side of the connection name row.
2. If a connected connection has zero projects, the group body shows an add-folder empty state instead of only "暂无打开中的标签会话".
3. Tapping add opens an in-app directory browser for the remote or desktop host filesystem.
4. Selecting a directory calls `open_folder` for that connection.
5. The newly opened folder appears as a project in the overview, history project list, project picker, and `/pages/projects/index`.
6. `codeg-main` and `mcode-desktop` connections use the same App-side command names.

## Non-Goals

1. Cloning repositories or project bootstrapping.
2. Removing or reordering projects.
3. Porting the full `codeg-main` folder database to `mcode-desktop`.
4. Adding historical conversation storage to `mcode-desktop` in this feature.
5. Adding native platform file dialogs in MCode App. The browser must inspect the connected host through gateway commands.

## Recommended Approach

Reuse the `codeg-main` directory browser protocol and implement the missing desktop proxy commands with a lightweight persistent folder registry.

This approach is recommended because:

1. It keeps App behavior aligned across `codeg-main` and `mcode-desktop`.
2. It avoids coupling MCode App to local mobile filesystem APIs, which cannot browse the connected desktop host.
3. It avoids porting `codeg-main`'s DB and migration stack into `mcode-desktop`.
4. It fits the existing gateway abstraction, where App code calls command names without caring whether the connection is direct or relay.

Alternatives considered:

### 1. App-only UI with unsupported desktop fallback

Rejected because the requested behavior explicitly includes `mcode-desktop` support.

### 2. Proxy desktop folder commands to `codeg-main`

Rejected because it would require users to run a separate backend and would make MCode Desktop less standalone.

### 3. Full `codeg-main` folder DB port

Rejected because this feature only needs open-folder registration and listing. A full DB port adds migrations and maintenance surface without improving the v1 user flow.

## App UI Design

### Entry Points

Conversation overview:

- Add an icon button to the right side of each `group-section__header`.
- The button label is visually compact, using the existing uview icon style and `--up-*` theme variables.
- It calls `openAddProjectBrowser(group.key)`.

Zero-project group body:

- When a group has no load error and `group.projects.length === 0`, render an empty card inside the group cards area.
- The card title should be "添加文件夹".
- The card helper text should explain that the folder will become a project for this connection.
- The primary tap target opens the same directory browser.

Project list page:

- Add an "添加项目" action in the header area for consistency.
- If `projectItems.length === 0`, replace the passive empty copy with an actionable add-folder state.

### Directory Browser

Create a reusable mobile component at `mcode-app/src/components/remote/RemoteDirectoryBrowser.vue`.

The component should support:

- popup or full-height bottom sheet presentation
- initial loading from `get_home_directory`
- current path input
- home action
- parent-directory action
- directory list loaded by `list_directory_entries`
- row tap to select a directory
- optional expand or navigate behavior for child directories
- confirm action that validates the selected path by loading it before calling `onSelect`
- stale-request guards so a slow response from an old open session cannot overwrite the current browser state

The browser should only display directories. If the backend returns file entries in the future, the App should filter non-directory entries out for this flow.

### Refresh Behavior

After `open_folder` succeeds:

1. Show a success toast.
2. Refresh the affected connection group from remote.
3. If the history panel is open for that same connection, update `projects` from the refreshed group.
4. Keep the user on the current overview page.

If `open_folder` fails:

1. Keep the browser open when the failure is path validation or permission related.
2. Show a concise error message.
3. Do not mutate the local project list optimistically.

## App Protocol And Data Flow

The App should call these commands through the existing `CodegGateway`:

```ts
gateway.call<string>("get_home_directory")
gateway.call<DirectoryEntry[]>("list_directory_entries", { path })
gateway.call<Project>("open_folder", { path })
gateway.call<Project[]>("list_open_folder_details")
```

`DirectoryEntry` should be normalized defensively:

```ts
interface DirectoryEntry {
  name: string
  path: string
  isDirectory?: boolean
  is_dir?: boolean
  hasChildren?: boolean
  has_children?: boolean
}
```

The App must continue to resolve connection context through:

- `findConnectedConnectionByKey`
- `createConnectionGateway`
- existing direct or relay gateway auth

No xycloud endpoint is involved.

## Desktop Design

### Folder Registry

Add a lightweight desktop project model:

```rust
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopOpenFolder {
    pub id: i32,
    pub name: String,
    pub path: String,
    pub opened_at_ms: u64,
    pub updated_at_ms: u64,
}
```

Store it in:

- `AppState.open_folders: RwLock<Vec<DesktopOpenFolder>>`
- `DesktopRecoverySnapshot.open_folders` with `#[serde(default)]`

IDs should be stable across restarts by persisting them in the snapshot. When opening a path already present, return the existing folder and update `updated_at_ms`.

Path identity should use canonical path when possible. If canonicalization fails because the path is not readable or does not exist, `open_folder` should return an error and avoid storing the path.

### Desktop Proxy Commands

Register these commands in `dispatch_desktop_proxy_with_event_sink`:

- `get_home_directory`
- `list_directory_entries`
- `open_folder`
- `list_open_folder_details`

The commands should be runtime-agnostic. They belong to `mcode-desktop`, not only Codex or Claude adapters.

Expected command behavior:

- `get_home_directory`: return the current user's home directory, falling back to current working directory if needed.
- `list_directory_entries`: take `{ path }`, read immediate child directories, sort directories by name, and return `{ name, path, isDirectory: true, hasChildren }`.
- `open_folder`: take `{ path }`, validate/canonicalize the directory, upsert it into `open_folders`, save the recovery snapshot, and return the folder detail.
- `list_open_folder_details`: return the current `open_folders`.

`list_all_conversations` may continue returning an empty list for desktop folders in this feature. The session creation flow can still create sessions against a selected working directory.

## Compatibility

### Existing `codeg-main` Connections

`codeg-main` already exposes the command names and remains the source of truth for folder IDs and paths. App normalization must accept existing snake_case or camelCase responses.

### Existing `mcode-desktop` Connections

Older desktop builds will reject the new commands. The App should show a concise unsupported-command error if a connection has not been upgraded. New desktop builds advertise and support the commands.

### Existing Desktop Snapshots

Snapshots without `openFolders` must load successfully and default to an empty folder list.

### Theme And Styling

Use existing `--up-*` runtime theme variables. Do not introduce new `--mcode-*` color, background, border, or shadow aliases.

## Testing

App unit coverage should target pure normalization and path helpers where practical:

- directory entry normalization
- parent path resolution for POSIX and Windows paths
- empty project group state selection

Desktop Rust tests should cover:

- `get_home_directory` returns a non-empty path
- `list_directory_entries` returns only directories and includes `hasChildren`
- `open_folder` upserts duplicate canonical paths
- `list_open_folder_details` returns persisted open folders
- recovery snapshot restores `open_folders`

Manual verification:

1. Connect MCode App to upgraded MCode Desktop.
2. Confirm a zero-project connection shows an add-folder card.
3. Browse to a local folder and add it.
4. Confirm the folder appears in the group, project picker, and project page.
5. Create a session using that folder and verify `workingDir` matches the selected path.

## Native iOS And Android Replication Notes

Native clients must not use the phone filesystem picker for this flow. The selected folder lives on the connected desktop or remote host. Native implementations should:

1. Use the same gateway commands.
2. Render a host-backed directory browser.
3. Preserve stale-response guards per browser open session.
4. Treat `open_folder` response as authoritative.
5. Refresh only the affected connection group after success.
