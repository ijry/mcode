# Conversation Create Title Hidden / Thinking Pill Compacting

## Scope

`mcode-app` now hides the optional title field in the create-conversation sheet
and shortens the assistant thinking label from `深度思考` to `思考`.

## Architecture And Data Flow

The create sheet still collects connection, project, agent, and task content.
The title input is no longer part of the visible flow, so normal users cannot
override the conversation title at create time from the list page UI.

The underlying create request path is otherwise unchanged: the page still opens
the dialog, resolves connection/project/agent state, creates the conversation,
and then seeds the summary and sends the task content through the existing
runtime flow.

## UI Behavior

- Create sheet: title field removed; the sheet jumps directly from agent config
  to task content.
- Message bubble: thinking capsules now use the shorter label `思考`.
- Thinking capsule shape: the thinking block is compact and pill-like instead
  of stretching across the whole row, so it reads like a summary control rather
  than a full-width panel.

## Compatibility

This is presentation-focused. Existing conversations, persisted turns, runtime
state, and ACP transport are unchanged.

The change does not introduce new `--mcode-*` theme aliases. Styling continues
to use `uview-plus` runtime theme variables with the `--up-*` prefix.

## Native iOS/Android Replication Guidance

- Hide the optional title field from the create-conversation sheet.
- Keep the create request flow otherwise identical: connection, project, agent,
  task content, then conversation creation.
- Render assistant thinking as a compact pill summary labeled `思考`, not a
  full-width card.
- Preserve existing thought content expansion/collapse behavior and do not
  change persisted message schema for historical turns.
