# P60 Composer Mentions

## Architecture

The conversation-detail composer supports `@` references without replacing the mobile `up-textarea`. A shared TypeScript service converts files, agents, sessions, and commits into codeg-main-compatible Markdown reference tokens. The Vue page only manages trigger detection, remote loading, panel display, and insertion.

## Data Flow

When the composer has an active trailing `@query`, the detail page loads reference sources from the active gateway:

- `get_file_tree` for project files under the active project path.
- `acp_list_agents` for enabled agents.
- `list_all_conversations` for sessions in the active folder.
- `git_log` for recent commits in the active project.

Selecting a row replaces the active `@query` with an inline token such as `[README.md](file://...)`, `[@Codex](codeg://agent/codex)`, `[会话](codeg://session/123)`, or `[abc1234](codeg://commit/<project>@<hash>)`.

## Protocol And Compatibility

No ACP protocol change is required. References are sent inside the existing text prompt block, so draft persistence, queued drafts, optimistic user turns, retries, and non-codeg targets remain compatible. Attachments keep using the existing out-of-band image/file chip flow.

## UI Behavior

The mention panel appears above the composer, grouped by agents, files, sessions, and commits. It closes when the trigger is gone, after selection, or before sending. Theme styling uses `--up-*` variables only.

## Native iOS/Android Guidance

Native clients should implement the same plain-text insertion contract: detect the active `@query`, fetch the same four sources through the current connection, render grouped results, and replace the trigger range with the serialized Markdown token plus a trailing space. No native rich-text editor is required for protocol compatibility.
