# Create Conversation Preferred Config

## Scope

The mobile `mcode-app` create-conversation flow now sends selected agent
session config values as `preferredConfigValues` in the initial `acp_connect`
request. This matches the desktop/web contract and fixes agents such as Codex
that need model/config choices applied during session startup rather than only
after `session/new` has completed.

## Data Flow

When the create sheet submits:

1. The selected `agentType`, `preferredModeId`, and `selectedValues` are
   snapshotted from the create form.
2. `acp_connect` receives `preferredModeId` plus `preferredConfigValues`.
3. Config probing uses a 70 second request/proxy timeout for
   `acp_describe_agent_options`, matching the backend's 60 second agent probe
   budget plus network margin. This prevents slower agents such as Codex from
   being reported as "config load failed" by the mobile gateway before the
   backend finishes probing selectors.
4. The Codeg backend maps the camelCase payload to
   `preferred_mode_id` / `preferred_config_values` and applies them through
   `apply_preferred_session_options` before selector readiness is emitted.
5. The existing post-connect `acp_set_config_option` loop remains as a
   compatibility fallback and keeps older remotes behaving consistently.

## UI Behavior

The create sheet behavior is unchanged. The model/config summary still comes
from `acp_describe_agent_options`, and user selections are persisted in the
short-lived create config cache. The visible difference is that a new Codex
conversation starts with the selected config instead of falling back to remote
defaults or failing before the later config update can take effect.

## Compatibility

Older remotes that ignore `preferredConfigValues` still receive the same
post-connect `acp_set_config_option` calls. Newer remotes apply the preferred
values during session initialization, which is required for strict agents and
safe for agents whose current values already match. Relay servers should use a
longer timeout for `acp_describe_agent_options`; the default short proxy timeout
is not sufficient for agents that need to spawn a CLI process before publishing
selectors.

## Native Replication Guidance

iOS and Android clients should include both startup preference fields when
creating a new ACP session:

- `preferredModeId`: selected mode id, or omitted/null when none is selected.
- `preferredConfigValues`: map of config option id to selected value id.

Do not rely only on setting config after connect. Keep the post-connect update
loop as a fallback for remote versions that predate preferred config support.
Use a config-probe timeout of at least 70 seconds for direct and relayed
requests.
