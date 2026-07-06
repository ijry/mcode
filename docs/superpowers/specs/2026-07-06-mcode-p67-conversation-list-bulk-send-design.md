# P67 Conversation List Bulk Send Design

## Scope

P67 adds bulk send only to the top-level conversation list in `mcode-app/src/pages/conversations/index.vue`.
It applies to the outer connection-group session cards rendered from `group.cards`.
It does not apply to the secondary "历史会话" panel or the conversations inside project history groups.

## User Behavior

The top-level conversation page adds an explicit selection entry, shown as "选择" when at least one top-level session card is available.
Entering selection mode shows a checkbox on the left side of each selectable outer session card.
While selection mode is active, tapping a selectable session card toggles its selected state instead of opening the conversation detail page.
The "历史会话" card remains a navigation card and is not selectable.
Exiting selection mode clears all selected cards.

A bulk action bar shows the selected count and a "批量发送" action.
The action is disabled when no session is selected.
Clicking "批量发送" opens a bottom popup.
The popup includes a clear warning: "本次将会一键将内容发送给所有勾选的会话".
It provides a quick input chip for "继续" and a text area for custom content.
Confirm sends the same text to every selected top-level session.

## Architecture

Selection state stays local to the conversation list page.
Each selected item is keyed by `connectionKey:conversationId` so sessions from different desktop/mobile connections can be selected safely without id collisions.
The selected payload stores only the minimum send metadata: connection key, conversation id, folder id, agent type, title, and project name.

Bulk sending reuses existing per-connection gateway resolution:

1. Resolve the selected item's connection from `findConnectedConnectionByKey`.
2. Create or reuse the gateway through `createConnectionGateway`.
3. Sync auth with `syncAuthToConnection`.
4. Ensure the remote tab exists through `ensureConversationTab` with `activation: "preserve"`.
5. Ensure an ACP session by using the existing runtime-managed connection if available, otherwise calling `runtime.connect(conversationId, agentType, undefined, undefined, lastAppliedSeq, instanceKey)`.
6. Send `blocks: [{ type: "text", text }]` with `acp_prompt`, including `folderId` and `conversationId`.

No backend route or ACP protocol change is required.

## Data Flow

The page derives selectable cards from the already-loaded `filteredConnectionGroups`.
Only cards with a positive `conversationId` are selectable.
The selection map is reconciled when overview data changes, so stale selected cards disappear if the list refreshes or a connection goes offline.
Bulk send processes the selected snapshot sequentially to avoid opening many ACP sessions at once and to keep error reporting deterministic.

After a successful send attempt, the page marks the conversation list dirty and refreshes overview data and the active-session badge.
Partial failures are reported with a toast summary such as "已发送 3 个，失败 1 个".
The popup remains open only when all sends fail; otherwise it closes and selection mode exits.

## Error Handling

The confirm button is disabled while sending or when the message is empty.
If a selected connection is no longer connected, that item is counted as failed and the remaining selected items continue.
If `runtime.connect` or `acp_prompt` fails for one conversation, the error is recorded and the loop continues.
The UI reports aggregate success/failure instead of stopping on the first error.

## Compatibility

The feature is mobile-only page state and does not persist selections.
Existing single-card navigation remains unchanged outside selection mode.
Existing live-preview session ownership is preserved; opening or sending does not release unrelated detail-page sessions.
The implementation must continue to use uview runtime theme variables with the `--up-*` prefix and must not add new `--mcode-*` color aliases.

## Testing

Add or update source-contract tests for the conversation list page to assert:

- P67 selection mode UI labels exist.
- Top-level cards toggle selection instead of opening detail while selection mode is active.
- The bulk-send popup contains the required warning copy.
- The implementation calls `acp_prompt` with text blocks and selected conversation metadata.
- The history panel is not made selectable.

## Native iOS/Android Replication

Native clients should add this only to the top-level session list.
Represent selected sessions by `(connectionKey, conversationId)` and keep selection in screen-local memory.
Show checkboxes only while selection mode is active.
Use a bottom sheet with a "继续" quick chip, custom text input, and the same warning copy before confirm.
Resolve each selected connection, ensure an ACP session for the conversation, and send the same text block sequentially to every selected conversation.
