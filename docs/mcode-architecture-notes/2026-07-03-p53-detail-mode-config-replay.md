# P53 Detail Mode Config Replay

## Architecture

P53 fixes tabs-detail entry replaying an unsupported ACP config option. `mcode-app` treats ACP session modes and ACP session config options as separate selector channels. Agent option snapshots may include both `modes` and a config option with id `mode`; when real session modes are present, that config option is a UI mirror and must not be stored in `DetailAgentConfigState.configOptions`.

## Protocol and Data Flow

Conversation create and conversation detail both call `acp_describe_agent_options`, then normalize the snapshot through `createReadyDetailAgentConfigState()`. The normalized state keeps `selectedModeId` for `acp_set_mode` and removes only config option id `mode` when `modes.available_modes` is non-empty. Pending replay, create-time `preferredConfigValues`, and manual config changes therefore do not send `acp_set_config_option` for `mode`.

## UI Behavior

The permission row continues to show session modes when available. Agents that expose permission only as a normal config option still render and replay that config option because the filter is active only when session modes exist.

## Compatibility

Existing cached snapshots and persisted selections may still contain `selectedValues.mode`; normalization drops it because it is no longer part of the projected config option list. No storage migration is required.

## Native Replication

iOS and Android clients should normalize agent option snapshots the same way: if a snapshot contains non-empty `modes.available_modes`, keep the mode selection in the mode channel and remove any config option whose id is exactly `mode` before building defaults or replay payloads. Native clients should still support non-`mode` permission/sandbox config options from agents that do not provide session modes.
