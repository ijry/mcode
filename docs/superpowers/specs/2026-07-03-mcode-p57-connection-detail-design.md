# MCode P57 Connection Detail Design

## Goal

P57 adds a connection detail page to MCode App. The page shows connection basics at the top and hosts four tabs: folders, settings, connection info, and config code.

## Scope

- Add `pages/connection-detail/index` as the connection-level workbench.
- Keep the existing connections tab as the connection list and entry point.
- Reuse the existing folders/project list behavior instead of duplicating its remote calls.
- Add a new settings tab that mirrors the desktop `codeg-main` settings taxonomy where mobile can safely call existing remote commands.
- Keep unsupported desktop-local preferences visible as protocol gaps rather than fake editable settings.
- Add or update one Markdown architecture note under `docs/mcode-architecture-notes/`.

## Page Structure

The detail page resolves a stored connection by `connectionId` using the existing connection context helpers. The top area shows:

- connection name
- target label, such as CodeG, OpenCode, or MCode Desktop
- route label, such as direct or gateway
- base URL or gateway URL
- online / reconnecting / error / unconnected state
- target capabilities and protocol version when present

Below the header, a fixed tab strip switches among:

1. `文件夹`
2. `设置`
3. `连接信息`
4. `配置码`

The route uses the normal uni-app navigation bar with `navigationBarTitleText: "连接详情"` and `enablePullDownRefresh: false`. Styling must use uview-plus runtime variables with the `--up-*` prefix and must not introduce new `--mcode-*` color, background, border, or shadow aliases.

## Folders Tab

The folders tab reuses the current project list behavior from `pages/projects/index.vue`.

Implementation extracts the project-list body into `components/projects/ProjectFolderList.vue`, with these inputs:

- `connection: ConnectionContext | null`
- `embedded?: boolean`, where `true` hides the standalone project-page header and lets the connection detail page own the surrounding chrome

The reusable body owns:

- resolving the connection to `CodegGateway`
- calling `loadRemoteProjects(gateway)`
- calling `buildProjectListItems(instanceKey, projects)`
- opening project sessions through the same route as the current project list
- opening the remote directory browser
- adding projects through `openRemoteFolder(gateway, path)`
- pull-to-refresh or local refresh entry points

`pages/projects/index.vue` becomes a thin route wrapper around the reusable body. The P57 connection detail page renders the same component in its folders tab without changing the remote folder protocol.

## Settings Tab

The settings tab is a new App UI. It uses an iOS-style grouped list similar to the reference screenshot, with restrained MCode styling and `--up-*` theme variables.

Top-level list groups and rows:

- `个性化`
  - `外观`
  - `语言`
  - `通用`
  - `快捷消息`

`通用` opens a subpanel for `委派` and `对话工具`. `快捷消息` remains a direct top-level row, matching the reference screenshot and avoiding an extra tap for a frequent composer workflow.

The first version performs real remote reads and writes only for settings already exposed by `codeg-main` HTTP commands through the existing app gateway:

- Language:
  - read `get_system_language_settings`
  - write `update_system_language_settings`
  - support `system`, `en`, `zh_cn`, `zh_tw`, `ja`, `ko`, `es`, `de`, `fr`, `pt`, `ar`
- Delegation:
  - read `get_delegation_settings`
  - write `set_delegation_settings`
  - expose enabled, depth limit, completed cache MB
  - do not edit per-agent defaults in P57; if `agent_defaults` exists, show only a read-only count such as `已配置 N 个智能体默认值`
- Quick messages:
  - list `quick_messages_list`
  - create `quick_messages_create`
  - update `quick_messages_update`
  - delete `quick_messages_delete`
  - P57 does not implement reorder; mobile keeps the server order returned by `quick_messages_list`
- Conversation tools:
  - expose `get_feedback_settings` / `set_feedback_settings` for feedback tools if the remote supports them
  - expose `get_question_settings` / `set_question_settings` for ask-question behavior if the remote supports them
  - unsupported command failures degrade to a clear "当前桌面端不支持" message

Appearance is partly protocol-limited. `codeg-main` app-wide theme color and zoom are currently managed by frontend localStorage / DOM state, not by the HTTP command surface. P57 still shows the desktop accent-color options so users understand what maps to desktop settings, but it must not present changes as remotely applied unless a backend command exists. The row opens a panel that explains:

- dark/light/system appearance mode and accent color belong to desktop appearance preferences
- mobile remote editing of accent color needs a future desktop preference command
- current P57 can display the option set but cannot persist it to the desktop host

## Connection Info Tab

The connection info tab is read-only and uses the local connection record plus the resolved remote descriptor. It shows:

- local connection id
- target agent
- route mode
- gateway provider
- direct base URL or gateway base URL
- target id / display name from gateway session when present
- protocol version
- capabilities
- linked / connected status

Secret values such as direct tokens, pair secrets, access tokens, and refresh tokens must not be displayed. If needed, show only presence labels such as `已保存`.

## Config Code Tab

The config-code tab reuses existing config-code logic:

- generate via `buildConnectionConfigCode(connection)`
- display the connection name and connection subtitle
- show the QR code when supported by the existing component
- show the raw code in a scrollable text block
- copy with `uni.setClipboardData`

The tab replaces the current action-sheet-only access path. The old action-sheet `配置码` action can navigate to the detail page's config-code tab or continue opening the existing popup; the preferred final behavior is to route users into the new detail page for consistency.

## Connection List Integration

The connection card opens the detail page when the user taps the main card surface. The existing primary footer action still connects and opens projects for users who want the old fast path. The overflow menu keeps existing actions, with the config-code action routing to the new tab when the route supports an initial tab query.

Suggested route:

```text
/pages/connection-detail/index?connectionId=<id>&tab=<folders|settings|info|config>
```

The page must also accept a full encoded `connection` parameter only as a fallback, matching existing route compatibility patterns.

## Error Handling

- Missing connection: show a local error state and a back action.
- Connection resolution failure: keep the local info and show remote-dependent tabs as failed with retry.
- Unsupported remote commands: show row-level unsupported messages; do not clear other loaded settings.
- Settings save failure: restore the previous value when the UI was optimistic, and show the command error.
- Config-code generation failure: show the existing error text from `buildConnectionConfigCode`.

## Compatibility

- `codeg-main` connections support folders, language, delegation, quick messages, feedback/question settings if the connected desktop version exposes the matching commands.
- `mcode-desktop` connections support folders from P45. They may not support the `codeg-main` settings commands; the settings tab must degrade per row.
- Existing project list route continues to work.
- Existing connection storage remains `ConnectionRecordV2`; P57 adds no new connection schema version.
- No xycloud integration is involved.

## Tests

Add focused app tests for:

- route building and initial-tab normalization for connection detail
- settings command wrappers and normalization for language, delegation, quick messages, and unsupported command errors
- config-code tab reuses `buildConnectionConfigCode` output
- project/folders component still exposes add-folder and project-open behavior after extraction

The current worktree baseline has unrelated failing conversation-detail style contract tests. P57 verification runs targeted new tests and then the full app unit suite; pre-existing failures are called out separately.

## Native iOS / Android Replication

Native clients implement connection detail as the connection-level workbench and keep the same tab model. The folders tab must use the remote gateway folder protocol, not phone-local file pickers. Settings rows must be driven by the same desktop command names and must degrade per row when a desktop host lacks a command. Native clients must never show secrets in connection info. Config code generation must match the existing App payload format exactly so Wear OS and other import flows stay compatible.
