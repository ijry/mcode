# Detail Session Config No Auto Replay

## Architecture

`mcode-app` now treats conversation-detail agent config as session-local state. The detail screen still remembers the last selection for UI continuity, but it no longer treats that cached selection as a command that should be replayed into any live ACP connection.

## Protocol and Data Flow

Conversation detail config storage keys now include the conversation id, so one session's mode/config choices do not bleed into another session that happens to use the same connection, agent type, and project path. When `session.connectionId` appears or changes, the detail page reloads config metadata only; it does not call `acp_set_mode` or `acp_set_config_option` automatically.

## UI Behavior

Opening or reattaching to an in-progress conversation no longer flips the remote session to a cached permission preset such as `read-only`. Permission/model/reasoning changes still apply immediately when the user explicitly taps a live selector.

## Compatibility

Previously persisted detail config selections used a broader per-project key. Those cached entries are left in storage but are no longer read by the detail screen because the key now includes the conversation id. No migration is required.

## Native Replication

iOS and Android clients should keep create-time config defaults separate from detail-time live-session controls. Persist detail selections per conversation, not just per project/agent. On attach/reconnect, refresh selector UI only; do not send mode/config mutation RPCs unless the user explicitly triggered the change in the current session view.
