# P67 Conversation List Bulk Send

## Architecture

P67 adds screen-local selection state to the top-level mcode conversation list. The feature lives in `mcode-app/src/pages/conversations/index.vue` and applies only to outer connection-group session cards rendered from `group.cards`. Each selected target is stored by `connectionKey:conversationId` to avoid id collisions across multiple desktop or relay connections.

## Protocol And Data Flow

No backend route or ACP protocol change is required. The mobile client resolves the selected card's saved connection, creates the existing `CodegGateway`, syncs auth, preserves the remote tab with `ensureConversationTab`, recovers or creates a runtime ACP connection with `runtime.connect`, and sends `blocks: [{ type: "text", text }]` through the existing `acp_prompt` command. Selected targets are processed sequentially so one failed conversation does not block the remaining sends.

## UI Behavior

When top-level selectable session cards exist, the header shows "选择". Entering selection mode replaces single-card navigation with checkbox toggling and hides the create button. A fixed bottom action bar displays the selected count and opens the "批量发送" bottom sheet. The sheet warns "本次将会一键将内容发送给所有勾选的会话", provides a "继续" quick chip, accepts custom text, and disables confirm while empty or sending. The "历史会话" card and the secondary history panel are not selectable.

## Compatibility

Selections are not persisted and are cleared when selection mode exits, the list loses selectable cards, or the user enters the history panel. Existing single-card open behavior, live preview ownership, conversation summary refresh, and tabbar active-session badge behavior remain unchanged outside selection mode. Styling uses existing uview runtime theme variables with `--up-*` names and introduces no `--mcode-*` color aliases.

## Native iOS/Android Replication

Native clients should implement this as view-local state on the top-level session list only. Store selected targets by `(connectionKey, conversationId)`, show checkboxes only in selection mode, and do not expose selection inside the history list. The bulk-send sheet should include the same warning copy, a "继续" quick input, custom text input, and a disabled confirm state for empty text. Send selected conversations sequentially through the existing ACP prompt path and report aggregate success/failure to the user.
