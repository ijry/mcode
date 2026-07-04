# Project List Git Menu Removal

## Architecture

The project list no longer exposes a per-project overflow menu for Git management. `ProjectFolderList` keeps one primary interaction per project card: tapping the card opens `project-detail` with the selected `connectionId`, `folderId`, `projectName`, and `projectPath`.

Git operations remain owned by the project detail workbench through its Git panel. The standalone `project-git` route and Git services are unchanged for compatibility with existing deep links and detail-level navigation.

## UI Behavior

- Project cards show project name, path, session count, active session count, and the right arrow.
- The former right-side three-dot button and `Git 管理` action sheet are removed.
- Users reach Git from the project detail page instead of choosing it directly from the list.
- Empty, loading, error, refresh, and add-folder states are unchanged.

## Protocol And Data Flow

No gateway protocol, storage schema, or API payload changes are introduced. The project list still loads remote folders through the existing connection context and `loadRemoteProjects` flow, then builds local session counts with `buildProjectListItems`.

## Compatibility

Existing native and web clients can continue to support old Git deep links if present, but new list implementations should not show a project overflow menu whose only action is Git. Removing the list shortcut does not change project identity parameters passed to the detail page.

## Native iOS/Android Guidance

Native project list cells should make the whole cell the detail navigation target and omit the trailing overflow/menu button. Keep the trailing disclosure indicator if the platform pattern uses one. Place Git entry points inside the project detail screen so list behavior stays focused on project selection.
