# mcode Connection Agent And Provider Management Design

## Scope

mcode adds connection-scoped remote settings for the desktop codeg host. Each saved connection card exposes two right-side menu entries: `智能体管理` and `模型供应商`. The card body still opens the project list.

## Architecture

The implementation adds a focused `mcode-app/src/services/remoteSettings.ts` module that owns shared types, route builders, RPC wrappers, event normalization, task id generation, and env text parsing/serialization. Pages resolve the selected connection with the existing `resolveConnectionContext()` flow, then call the remote codeg web commands through the resolved `CodegGateway`.

## UI Behavior

`pages/connection-agents/index` loads the remote agent list and model provider list, shows each agent's enabled/available/install state, and opens a detail panel for edits. The detail panel supports enabled toggling, model-provider binding, `KEY=value` env edits, raw native config edits, reorder up/down actions, install/prepare/download/uninstall actions, and live progress logs.

`pages/model-providers/index` lists providers grouped/filterable by agent type and provides add/edit/delete forms for name, API URL, API key, agent type, and model. Claude Code model values are edited as raw text/JSON initially; this keeps parity with backend capability without cloning the full desktop structured form.

## Protocol And Data Flow

Agent RPCs use existing backend commands: `acp_list_agents`, `acp_update_agent_env`, `acp_update_agent_config`, `acp_reorder_agents`, `acp_download_agent_binary`, `acp_install_uv_tool`, `acp_prepare_npx_agent`, and `acp_uninstall_agent`.

Provider RPCs use `list_model_providers`, `create_model_provider`, `update_model_provider`, and `delete_model_provider`.

Long-running agent operations generate task ids on the client and subscribe to the gateway event stream. The page filters `app://agent-install` events by `task_id` and refreshes agents after `completed` or `failed`. It also refreshes on `app://acp-agents-updated`.

## Error Handling And Compatibility

The pages show loading, empty, and error states and keep edits local until save. Old hosts without these commands will surface command-specific errors. Existing direct and relay connection contexts are preserved through `encodeConnectionContext()` and `persistResolvedConnection()`.

## Testing

Unit tests cover route builders, env parsing/serialization, RPC payload shapes, event normalization, task ids, and presentation helpers used by the pages.
