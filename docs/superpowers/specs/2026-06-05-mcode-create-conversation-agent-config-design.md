# MCode Create Conversation Agent Config Design

## Goal

Upgrade the `mcode-app` create-conversation sheet so users can configure a new conversation with agent-specific runtime options before creation, and have those options take effect on the real remote session immediately, including empty conversations with no initial task content.

## Problem

The current create-conversation flow in `mcode-app` only lets the user choose:

- connection
- project
- agent
- optional title
- optional task content

This is insufficient for modern agent runtimes because real session behavior depends on agent-specific selectors such as:

- model choice
- reasoning effort / mode
- permission profile (for example Claude `bypass`)

Those selectors already exist on the remote `codeg` side through ACP agent probing and per-connection session option APIs, but `mcode-app` does not surface or apply them during conversation creation.

## User Outcomes

After this change:

1. The create-conversation sheet shows agent-specific configuration only for the currently selected agent.
2. The configuration is loaded dynamically from the remote `codeg` instance instead of being hardcoded in `mcode-app`.
3. Creating a conversation without initial task content still applies the selected config to the real remote session.
4. If config discovery fails, the user can still create the conversation and the remote default config is used.

## Non-Goals

- Editing agent config after conversation creation in the conversation detail page.
- Building local static fallback schemas per agent.
- Designing an advanced config cache or offline config replay system.
- Changing the existing backend agent config schema in `codeg-main`.

## Existing Capabilities To Reuse

The remote `codeg` server already exposes enough primitives for this feature:

- `probe_agent_options`
  - returns dynamic `modes` and `config_options` for a target agent
- `acp_connect`
  - creates a real ACP connection and supports `preferredModeId`
- `acp_set_config_option`
  - applies per-option values to a live connection
- `create_conversation`
  - creates the DB conversation row
- `acp_prompt`
  - optionally sends the initial task content

This means the feature should be implemented as an `mcode-app` orchestration change, not as a new config protocol.

## Recommended Approach

Use dynamic remote probing and live option application during create.

Why this is the recommended approach:

- It guarantees the UI only shows options the current remote agent instance actually supports.
- It avoids duplicating agent capability tables in `mcode-app`.
- It keeps behavior aligned with `codeg-main` ACP selectors and future agent upgrades.

Alternatives considered:

1. Hardcode agent config schemas in `mcode-app`
- Rejected because schemas drift quickly and would become inaccurate.

2. Build a single generic create form for all agents
- Rejected because it would show irrelevant fields and create confusing no-op settings.

3. Apply config only when the first prompt is sent
- Rejected because empty conversations must also be created with real config applied.

## UX Design

### Create Sheet Layout

The create-conversation sheet keeps the current structure:

- connection
- project
- agent
- title
- task content

The agent section is enhanced in two ways:

1. The label uses `智能体`, not `模型`.
2. Below agent selection, a new `智能体配置` section appears.

### Agent Selection

Agent selection remains the icon-based single-select grid already introduced in the create sheet.

### Dynamic Config Section

When an agent is selected:

1. `mcode-app` requests that agent's options from the remote server.
2. While loading, the config section shows a loading state.
3. If options are returned:
   - render `modes` as one selectable group
   - render each `config_option` as its own selectable group
4. If the agent exposes no selectors:
   - show a compact hint: `该智能体将使用远端默认配置`
5. If option discovery fails:
   - show a warning hint: `读取失败，将使用远端默认配置`
   - keep create enabled

### Option Presentation

For the first version, render all selectors as explicit single-choice groups:

- mode group: pill or card radio list
- each config option: its own pill or card radio list

Do not use nested dialogs or pickers for the first version. The create sheet should remain fast to scan and fast to submit.

## Data Model In MCode

Add a local UI-only state structure in the create-conversation page:

- selected agent option snapshot
- loading state for option probe
- probe failure state
- selected mode id
- selected config option values keyed by `configId`

Suggested shape:

```ts
interface CreateAgentConfigState {
  status: "idle" | "loading" | "ready" | "failed"
  modes: SessionModeStateInfo | null
  configOptions: SessionConfigOptionInfo[]
  selectedModeId: string | null
  selectedValues: Record<string, string>
}
```

This state is ephemeral to the create sheet and resets when the sheet closes, connection changes, or project context is replaced.

## Remote Read Flow

### Trigger Points

Probe agent options when:

- the create sheet opens with a selected agent
- the selected agent changes
- the selected connection changes

### Request Behavior

Use the selected connection's gateway and call the remote agent option probe endpoint for the selected agent.

The request should be tied to the currently active create-sheet context so stale async responses do not overwrite a newer agent selection.

### Selection Defaults

When options load successfully:

- default `selectedModeId` to `modes.current_mode_id` when present
- otherwise leave `selectedModeId = null`
- default each config option to its currently selected or first available value, depending on the payload shape exposed by the remote server

If a later probe for the same agent returns a different option set, re-project local selections onto the new schema and drop invalid values.

## Create Flow

### Required Behavior

Create must produce a real configured remote session even when task content is empty.

### Order Of Operations

On create:

1. Resolve connection and project as today.
2. Call `acp_connect` for the selected agent.
3. Pass `preferredModeId` if a mode is selected.
4. Apply each selected config option via `acp_set_config_option`.
5. Create the conversation row with `create_conversation`.
6. If task content exists, send it through `acp_prompt`.
7. If task content is empty, keep the configured connection alive for later use by conversation detail.

### Why Connect First

The ACP option APIs operate on a live connection, so the system must connect before it can apply selectors. This also satisfies the user requirement that an empty conversation already be configured before the first message is sent.

## Empty Conversation Semantics

When the user creates a conversation with no task content:

- the conversation row exists remotely
- a live ACP connection has already been created
- selected mode and config options have already been applied

When the user opens that conversation in detail view later, `mcode-app` should reuse the existing configured session when possible instead of creating a fresh default session and losing the selected config.

This design does not require the detail page to expose config editing; it only requires the create flow and runtime reuse path to preserve the already-configured connection.

## Failure Handling

### Probe Failure

If agent option probing fails:

- show non-blocking warning text
- allow create
- create uses remote defaults

### Connect Failure

If `acp_connect` fails:

- fail the create flow
- show a concrete error toast
- do not create the conversation row

### Config Apply Failure

If any `acp_set_config_option` fails:

- fail the create flow
- show an error that config application failed
- do not continue to `create_conversation`

This is required because the user explicitly asked for real effective config, not best-effort config.

### Conversation Row Creation Failure

If conversation creation fails after the connection has already been created and configured:

- surface an error
- leave later cleanup behavior to existing connection lifecycle handling for the first version

This is acceptable for v1 because create failure after successful connect is less common, and the higher priority is preserving correctness of applied config during success paths.

## Integration With Existing Sidebar Refresh Workaround

The current `mcode-app` create flow already includes a workaround that calls:

- `open_folder_by_id`
- `open_folder_in_workspace`

after conversation creation to stimulate `codeg` sidebar refresh.

This workaround should remain in place and run after the conversation row is created, regardless of whether task content is empty.

## Testing Strategy

### Manual

Verify with at least:

1. Codex agent with selectable model and reasoning mode
2. Claude agent with selectable permission profile such as `bypass`
3. An agent that exposes no extra config options
4. Probe failure path
5. Empty conversation create path
6. Create with initial task content path

Expected outcomes:

- selected config appears in UI only for the relevant agent
- config is applied before prompt send
- empty conversation later resumes with the configured session
- failure to probe falls back cleanly to defaults

### Guard Conditions

The implementation should explicitly protect against:

- stale probe responses overwriting current agent state
- sending config values that are no longer present in the latest payload
- creating a conversation before config application completes

## Implementation Boundaries

### Files Expected To Change

Primary:

- `mcode-app/src/pages/conversations/index.vue`

Likely supporting additions:

- `mcode-app/src/types/acp.ts`
- `mcode-app/src/api/acp.ts`

Potential runtime reuse support if current detail flow cannot reuse the preconfigured connection:

- `mcode-app/src/stores/conversationRuntime.ts`
- `mcode-app/src/services/conversation/connectionSessionManager.ts`
- `mcode-app/src/pages/conversation-detail/index.vue`

### Boundary Rule

Do not add agent-specific hardcoded config schemas unless the remote probe payload is missing information needed to render the selector labels. Any such fallback must be additive and minimal.

## Open Decision Resolved

The user confirmed:

- config must be real effective behavior, not UI-only
- selectors should be shown per agent, not as a universal form
- options should be read dynamically from the remote
- first version should cover all supported agents
- probe failure should still allow creation using remote defaults
- empty conversations must also create a real configured remote session

## Success Criteria

The feature is complete when:

1. Create sheet dynamically loads and renders per-agent selectors.
2. Creating a conversation applies selected mode and config options on the remote connection before use.
3. Empty conversations preserve configured runtime behavior for later interaction.
4. Failures degrade exactly as specified above.
5. Existing sidebar refresh workaround still functions.
