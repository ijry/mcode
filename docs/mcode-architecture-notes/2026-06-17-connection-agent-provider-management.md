# Connection Agent And Model Provider Management

## Architecture

mcode now exposes remote codeg settings from each saved connection card. The connection card body still opens the project list; the right-side action sheet adds `智能体管理` and `模型供应商`.

Shared mobile behavior lives in `mcode-app/src/services/remoteSettings.ts`. It defines agent/provider types, route builders, `KEY=value` env helpers, task id generation, event normalization, presentation helpers, and typed RPC wrappers over `CodegGateway.call()`.

The two pages resolve the full encoded connection context with `resolveConnectionContext()`, persist refreshed direct/relay credentials with `persistResolvedConnection()`, then call the selected remote host. No global current-connection singleton is introduced.

## Protocol And Data Flow

Agent page RPCs:

- `acp_list_agents` loads sorted `AcpAgentInfo[]`.
- `list_model_providers` loads provider choices for agent binding.
- `acp_update_agent_env` saves `enabled`, parsed `env`, and `modelProviderId`.
- `acp_update_agent_config` saves raw `configJson`, `codexConfigToml`, `codexAuthJson`, and `opencodeAuthJson`.
- `acp_reorder_agents` persists the visible agent order.
- `acp_download_agent_binary`, `acp_install_uv_tool`, `acp_prepare_npx_agent`, and `acp_uninstall_agent` run long tasks with a generated client `taskId`.

Provider page RPCs:

- `list_model_providers`
- `create_model_provider`
- `update_model_provider`
- `delete_model_provider`

Long-running agent operations subscribe through `gateway.connectEvents()`. The page extracts global frames, filters `app://agent-install` by `task_id`, appends live logs, and refreshes agent state on terminal events. It also refreshes on `app://acp-agents-updated`.

Install progress is a client-side presentation model because current backend install events carry only `task_id`, `kind`, and a string `payload`. mcode parses explicit percentages from log text when available. If no percentage exists, it advances a bounded fallback progress value from event/log count, pins completed tasks to 100%, and keeps failed tasks at the latest known progress. The UI shows this as an inline agent progress card plus a detailed bottom log popup.

Gateway request timeouts are extended for install/download/prepare/uninstall commands because these operations can exceed the default uni request timeout while the backend continues streaming progress.

## UI Behavior

`pages/connection-agents/index` shows a mobile list/detail layout. Users can select an agent, toggle enabled state, bind a model provider where supported, edit env text, edit raw native config fields, reorder agents, and run download/prepare/uninstall actions. Long-task logs appear in a bottom popup.

`pages/model-providers/index` lists providers with agent-type filters. A bottom editor supports create/edit/delete with name, agent type, API URL, API key, and model text. Editing leaves API key blank by default; blank key means unchanged.

Both pages use uview-plus runtime `--up-*` theme variables and do not add new mcode color aliases.

## Compatibility

Direct and relay connections both work because all calls go through `CodegGateway`. Older desktop hosts that do not implement these commands will return command-level errors that are shown in the page error or toast state.

The model-provider editor intentionally treats Claude Code model selection as text/JSON rather than a structured multi-model form. This preserves backend compatibility while keeping the first mobile implementation compact.

## Native iOS/Android Replication Guidance

Native clients should:

- Reuse the saved connection payload shape and route equivalent of `encodeConnectionContext()`.
- Resolve direct or relay credentials before page load and persist refreshed sessions back to the connection store.
- Implement the same RPC payload keys: `agentType`, `modelProviderId`, `configJson`, `codexConfigToml`, `codexAuthJson`, `opencodeAuthJson`, `taskId`, `apiUrl`, `apiKey`.
- Maintain one event stream per active settings page, parse `{ channel, payload }` frames, filter `app://agent-install` by task id, and refresh agents on `app://acp-agents-updated`.
- Derive install progress from `app://agent-install` event kind and payload text; parse `%` values when present and otherwise use bounded fallback progress while retaining raw logs.
- Treat env text as one `KEY=value` per line, ignoring blank lines/comments and invalid keys.
