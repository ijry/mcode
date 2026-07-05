# P65 Conversation List Live Stream Preview Design

## Goal

Add an opt-in conversation-list live message preview for `mcode-app`. The feature is disabled by default. When enabled, the conversation list actively subscribes to a bounded set of in-progress conversations and renders one compact live-message line below each affected session card.

## User Setting

- Add a local preference named `conversationListLiveStreamEnabled`, stored with `uni.setStorageSync`.
- Default value is `false`.
- Surface it in the profile/settings UI under a new "会话设置" section as "会话列表实时消息流".
- Copy should make the cost explicit: enabling it subscribes to running conversations from the list page and may increase network, CPU, and battery usage.

## Scope

In scope:

- Conversation list cards can show one live preview line for active/in-progress conversations.
- The list page actively attaches to running conversations when the setting is enabled.
- Preview subscriptions are capped and cleaned up when no longer needed.
- The implementation must preserve existing detail-page realtime behavior.

Out of scope:

- Showing full markdown rendering, tool logs, or multi-line transcripts in the list.
- Persisting preview text as conversation history.
- Changing backend ACP protocol, realtime frame shape, or detail-page transport semantics.
- Subscribing to every historical conversation.

## Architecture

### Preference Service

Create a small service, for example `src/services/conversation/conversationListLiveStreamPreference.ts`, with:

- `readConversationListLiveStreamEnabled(): boolean`
- `writeConversationListLiveStreamEnabled(enabled: boolean): boolean`
- `CONVERSATION_LIST_LIVE_STREAM_ENABLED_KEY`

The service should normalize unknown storage values to `false`.

### Profile UI

Update `src/pages/profile/index.vue`:

- Add a "会话设置" section.
- Add a switch row for "会话列表实时消息流".
- Initialize from the preference service on mount.
- Persist immediately when toggled.

### List Preview Orchestrator

The list page should own a lightweight preview controller inside `src/pages/conversations/index.vue` or a focused helper module if the code becomes too large.

Responsibilities:

- Watch the setting, loaded cards, and current runtime statuses.
- Select eligible preview cards:
  - `conversationId > 0`
  - display status is `in_progress`, `thinking`, `running_tool`, `waiting_permission`, or `waiting_question`
  - card has enough metadata to resolve `agentType`, `instanceKey`, and resume/external session id when needed
- Cap active preview subscriptions to 5 conversations.
- Attach only while the conversations page is visible and the setting is enabled.
- Detach preview-owned subscriptions when the setting is disabled, the page unloads, a card leaves the eligible set, or a conversation completes.

### Subscription Ownership

The implementation must not clear or detach realtime state owned by the detail page.

For each preview target, record whether the list created the runtime connection:

- If a runtime/managed connection already exists for the conversation, the list should only render from it and must not clear it.
- If the list creates the connection for preview, mark it as preview-owned.
- If the user opens the detail page for a preview-owned conversation, transfer ownership by leaving the runtime intact and letting the detail page reuse the active connection.
- On list cleanup, detach only preview-owned conversations that have not been transferred or otherwise adopted.

If existing runtime APIs cannot express this safely, add a small ownership marker or cleanup API rather than calling `runtime.clearSession()` blindly.

## Data Flow

1. User enables "会话列表实时消息流".
2. Conversation list loads connection groups and computes display card statuses.
3. Preview controller selects up to 5 eligible in-progress cards.
4. For each selected card, the controller ensures a runtime connection:
   - reuse existing managed connection if present
   - otherwise call the existing runtime connect/adopt path with the card's agent/session metadata
5. Existing realtime routing updates `runtime.sessions[conversationId].liveMessage`.
6. The card renders a one-line text summary derived from runtime state.
7. On `turn_complete`, `status_changed`, page hide/unload, setting disabled, or card removal, the preview controller reconciles active subscriptions and releases only preview-owned unused ones.

## Preview Text Rules

Render a single line under the session title when the setting is enabled and a preview exists:

- For text content: show the latest non-empty `text` delta projection.
- For thinking content: prefix with "思考：" and show the latest thinking text.
- For running tools: show "正在调用工具：<tool name>".
- For pending permission/question: show "等待确认" or "等待回答".
- For placeholder thinking only: show "思考中…".
- Empty preview state should render nothing.

The line should use existing `--up-*` theme variables, `u-line-1`, and no new `--mcode-*` color aliases.

## Performance Policy

- Default off means no new active per-conversation subscriptions.
- Enabled mode is bounded to 5 active preview subscriptions.
- UI rendering is one line per card, with no markdown rendering.
- Reconciliation should be debounced or scheduled to avoid reconnect churn during rapid list refreshes.
- Page hide/unload must release preview-owned subscriptions unless ownership is transferred.

## Error Handling

- Failed preview attach should not block list loading.
- Attach failures should be logged with `console.warn`.
- A failed card may simply omit the preview line and keep its status chip.
- If realtime bridge falls back to polling, retain existing bridge behavior; do not introduce a second polling mechanism.

## Compatibility

- Existing detail page behavior remains authoritative for full conversation rendering.
- Existing global list subscriptions (`conversation://changed`, `tabs://changed`, `pet://sessions`) remain unchanged.
- Older backends without attach support should fall back through the current `subscribeEvents` path already used by `attachConversationRealtime`.
- The preference is local to the mobile client and does not require backend migration.

## Native iOS/Android Replication Guidance

Native clients should implement the same structure:

- Store a local boolean preference defaulting to disabled.
- When enabled and the conversation list is visible, select at most 5 in-progress visible/listed sessions.
- Reuse the app-wide realtime bridge and send per-session attach requests.
- Render only a single plain-text preview line.
- Track preview-owned session attachments separately from detail-owned attachments.
- Release preview-owned attachments when the setting is disabled or the list is no longer active.

## Tests

Add unit coverage for:

- Preference default/normalization behavior.
- Preview text projection from representative live-message content.
- Eligibility/cap selection for in-progress cards.
- Ownership cleanup: existing runtime sessions are not cleared by list cleanup.

Add manual verification notes for:

- Setting defaults off after fresh install.
- Enabling shows live preview for a running session.
- Disabling removes previews and detaches preview-owned subscriptions.
- Opening detail from a previewed card keeps the live stream connected.
