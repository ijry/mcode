# MCode P60 Composer Mentions Design

## Goal

P60 adds `@` reference insertion to the conversation-detail composer, matching codeg-main reference semantics while keeping the mobile composer lightweight.

## Scope

- Support `@` suggestions for files, agents, sessions, and commits.
- Preserve the existing `up-textarea`, `inputText`, draft queue, and prompt-send flow.
- Insert codeg-main-compatible Markdown tokens into the plain-text composer:
  - file: `[name](file://...)`
  - agent: `[@name](codeg://agent/<agent_type>)`
  - session: `[title](codeg://session/<conversation_id>)`
  - commit: `[hash](codeg://commit/<project_path>@<full_hash>)`
- Keep attachments as the existing out-of-band image/file chips.
- Add one architecture note under `docs/mcode-architecture-notes/`.

## Architecture

The mobile implementation does not port Tiptap. Instead, a pure TypeScript reference service owns trigger detection, Markdown escaping, URI construction, result filtering, and remote-source adaptation. The Vue page owns loading references from the active connection, showing a compact panel above the composer, and replacing the active `@query` token with the selected Markdown reference.

The send path remains compatible because references live inside `QueuedDraft.text`. Codeg receives a text block containing the same inline links emitted by codeg-main. Non-codeg targets already receive plain text, so references degrade to readable Markdown links instead of requiring new ACP block types.

## Data Sources

- Files use `get_file_tree` through `getRemoteProjectFileTree()` and the active conversation project path.
- Agents use `acp_list_agents` and hide disabled agents.
- Sessions use `list_all_conversations` scoped to the active `folderId`.
- Commits use `git_log` for the active project path.

Results are grouped in display order: agents, files, sessions, commits. Search matches label, id, detail, and keywords case-insensitively.

## UI Behavior

Typing an active trailing `@query` opens the mention panel. The panel shows loading, empty, and grouped result states. Tapping a result replaces the active trigger range and appends a trailing space. The panel closes on send, composer clear, or when the trigger no longer exists.

Because uni-app textarea cursor behavior differs by platform, P60 uses the best known cursor from textarea events and falls back to the end of the text. This keeps mobile behavior predictable without introducing a rich editor.

## Compatibility

Existing draft persistence remains valid because `ConversationDraftSnapshot.composerText` is still a string. Existing queued drafts, optimistic user messages, and retry behavior require no schema migration.

Native iOS and Android clients should implement the same reference service contract: detect `@query`, load the four grouped sources, insert codeg-main-compatible Markdown tokens into the text buffer, and send the existing text prompt block.
