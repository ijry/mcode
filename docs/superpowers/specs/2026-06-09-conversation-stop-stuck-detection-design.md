# Conversation Stop And Stuck Detection Design

## Scope

Add a conversation-detail stop affordance for active responses and a friendly stuck detector for long-running responses that stop producing visible output.

This targets the `codeg-main` React workspace conversation detail UI. It does not add backend APIs because the existing ACP cancellation path already exposes `acp_cancel` through `useConnectionLifecycle`.

## User Experience

- When a tab's connection is responding (`connStatus === "prompting"`), show a small stop button in that tab's detail view.
- Clicking the stop button opens a confirmation dialog before cancelling.
- If the active response remains in `prompting` for 3 minutes without new live output, open a friendly confirmation dialog saying the session may be stuck.
- If the user confirms the stuck prompt, cancel the current response and reload the current persisted conversation detail.
- The stuck prompt does not auto-resend the last user message.

## Architecture

- Keep the feature local to `ConversationTabView`, because each tab owns its ACP context key and can stop only its own connection.
- Reuse `handleCancel` from `useConnectionLifecycle`; this preserves current backend cancellation behavior and viewer/owner routing.
- Track "last received output" in the detail component from `conn.liveMessage` content shape. Reset the timer whenever the response starts, stops, or live output changes.
- Use the existing `AlertDialog` component for both manual stop confirmation and automatic stuck confirmation.
- Reload after stuck-confirm only when the tab has a real DB conversation id. Draft conversations can still be stopped, but cannot reload persisted detail.

## Error Handling

- If cancel fails, surface a toast and log the error.
- If reload after stuck-confirm fails, reuse existing detail reload behavior and error toast.
- The stuck dialog fires once per quiet response segment. If output resumes or the turn completes, the pending timer/dialog is cleared.

## Testing

- Add component-level coverage for the pure stuck-timer decision helper if one is introduced.
- Run the repository's frontend lint or focused test command after implementation; if the full suite is too large, run the narrowest available check that exercises the touched files.
