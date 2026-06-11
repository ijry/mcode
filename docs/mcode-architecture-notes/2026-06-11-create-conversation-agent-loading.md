# Create Conversation Agent Loading

## Scope

The mobile `mcode-app` create-conversation sheet now treats the remote
`acp_list_agents` response as the source of truth for selectable agents.
Hard-coded agent labels remain only for display fallback, not as valid create
options.

## Data Flow

When the create sheet opens or the selected connection changes:

1. The app reads a fresh per-connection agent-list cache.
2. If no fresh cache exists, it calls the selected connection gateway with
   `acp_list_agents`.
3. The result is filtered to agents where `enabled !== false` and
   `available !== false`.
4. The first available remote or cached agent becomes the fallback only when
   the persisted selection is not in the returned list.

An empty or failed remote result leaves the selectable list empty and stores a
visible error message. The create button remains disabled until a valid agent
selection exists.

## UI Behavior

The create button is disabled while agents are loading, when the list failed to
load, or when the current selection is not present in the available list. The
sheet shows the concrete load error, or a no-available-agents hint for empty
lists.

During submit, the selected agent is copied into a local `agentType` snapshot.
That same value is used for `acp_connect`, `create_conversation`, local summary
seeding, and runtime binding. This prevents an async agent-list refresh from
changing the recorded conversation agent after the connection has already been
opened.

## Compatibility

This change does not alter backend endpoints or payload formats. Existing
cached valid agent lists still work until their normal TTL expires. Invalid or
empty cache entries do not produce default create options.

## Native Replication Guidance

iOS and Android clients should use the same gate:

- Do not show hard-coded agents as creatable options.
- Disable submit while `acp_list_agents` is in flight.
- Disable submit and show an error when `acp_list_agents` fails.
- Treat an empty filtered list as no available agents.
- Snapshot the selected `agentType` at submit start and reuse it for all create
  calls and local persistence in that request.
