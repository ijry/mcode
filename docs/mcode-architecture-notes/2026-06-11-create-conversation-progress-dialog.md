# Create Conversation Progress Dialog

## Scope

The mobile `mcode-app` create-conversation flow now shows a blocking progress
dialog after the user submits the create sheet. This improves feedback for slow
agent startup, config probing, and first prompt dispatch.

## Data Flow

On submit, the create form snapshots the selected agent, mode id, config values,
and config option list before closing the sheet. The existing request sequence is
unchanged:

1. Resolve the selected connection and project.
2. Call `acp_connect` with `preferredModeId` and `preferredConfigValues`.
3. Re-apply selected config options through `acp_set_config_option` as the
   compatibility fallback.
4. Call `create_conversation`.
5. Seed the local conversation summary.
6. Optionally send the initial task through `acp_prompt`.
7. Bind runtime state, refresh the list, and open the created conversation.

The progress dialog is driven by the existing `creating` state. A local timer
rotates non-percent stage labels while creation is active and is cleared when
creation ends or the page unloads.

## UI Behavior

The bottom create sheet closes once validation passes and the asynchronous create
request starts. A centered modal appears with a looping loading animation,
message `正在创建会话`, and guidance `正在连接智能体并初始化会话，请不要关闭页面。`

The dialog is not dismissible by tapping the overlay. It closes automatically on
success or failure because `creating` returns to `false`. Success continues to
show the existing success toast and opens the new conversation. Failure keeps the
existing failure toast behavior.

The dialog uses uview runtime theme variables with the `--up-*` prefix for
backgrounds, borders, text, and primary color. No `--mcode-*` color aliases are
introduced.

## Compatibility

No backend endpoint, payload, or persisted schema changes are required. Closing
the sheet does not clear in-flight startup preferences because submit snapshots
the selected mode, config values, and config option list before mutating sheet
visibility.

## Native Replication Guidance

iOS and Android clients should present a non-dismissible modal after create
validation passes and before the first network call starts. Use an indeterminate
animation rather than a fake percentage because the ACP steps do not report real
progress.

Native clients must snapshot the submitted agent and config values before hiding
the form. The modal should remain visible through connect, config fallback,
conversation creation, summary persistence, optional initial prompt dispatch,
and navigation. Dismiss it only after success navigation is triggered or after a
failure message is shown.
