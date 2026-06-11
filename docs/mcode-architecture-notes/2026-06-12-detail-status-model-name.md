# Detail Status Model Name

## Scope

The mobile `mcode-app` conversation detail toolbar now shows the concrete active
model name during runtime activity instead of generic copy like "智能体思考中".

## Architecture And Data Flow

The detail page already derives `modelSummary` from the remote agent config
snapshot and local config selection cache. Runtime status still comes from the
conversation runtime store.

This change adds one presentation-level projection:

- When runtime state is `thinking`, show `<model name> 思考中`.
- When runtime state is `running_tool`, show `<model name> 执行命令中`.
- If the model name is unavailable, still fall back to the short generic status.

No ACP payloads, persistence schema, or runtime transport state were changed.
The toolbar and resolved status text still read from the same centralized detail
status state; only the wording for active runtime states now uses the selected
model label.

## UI Behavior

Users now see concrete labels such as `GPT5.4 思考中` or `Sonnet4.6 执行命令中`
in the detail toolbar/status area when the remote side is actively processing.
This keeps the status bar tied to the model the user selected in the model
config panel instead of a generic "agent" concept.

Long-wait, reconnect, permission, question, retry, and error states keep their
existing higher-priority copy and are not replaced by model-name wording.

## Compatibility

This is a client-side wording change only. Existing detail config loading,
runtime state resolution, and cache behavior stay unchanged. The change reuses
existing uview-plus runtime theme variables and does not introduce new theme
aliases.

## Native iOS/Android Replication Guidance

Native clients should keep runtime status resolution separate from model
selection resolution, then combine them at the final presentation layer:

- Read the active model label from the same source used by the model config UI.
- Read per-conversation runtime state from the runtime session.
- When runtime is `thinking` or `running_tool`, format the status string with
  the concrete model label if one is available.
- Preserve existing higher-priority transport, retry, permission, question, and
  error messaging above model-status wording.
