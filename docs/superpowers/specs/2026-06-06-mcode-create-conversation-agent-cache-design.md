# MCode Create Conversation Agent Cache Design

## Goal

Reduce redundant remote loading in the `mcode-app` create-conversation sheet by caching:

- available agent list
- agent config option snapshots
- the user's most recent agent/config selections

This should make reopening the sheet feel immediate while still allowing remote option data to refresh on a bounded schedule.

## Problem

The current create-conversation flow probes remote state too often:

1. Opening the sheet reloads the available agent list from the remote instance.
2. Switching agent or project reloads the selected agent's option snapshot from the remote instance.
3. The UI does not remember the user's last selected agent, mode, or config option values across opens.

This produces unnecessary latency and repeated remote calls even when the data has not changed.

## User Outcomes

After this change:

1. Reopening the create sheet within 24 hours reuses the cached agent list for the selected connection.
2. Reopening or switching back to a previously used `connection + agent + projectPath` context within 24 hours reuses the cached option snapshot.
3. The user's latest chosen agent/config values are restored even after the 24 hour snapshot cache expires.
4. If a previously chosen value is no longer valid for the current remote snapshot, the UI falls back to a valid default automatically.

## Scope

This change is limited to the create-conversation page:

- `mcode-app/src/pages/conversations/index.vue`

No backend protocol changes are required.

## Non-Goals

- Cross-device sync of cached selections
- Offline creation
- New database tables or SQLite persistence for create-sheet cache
- Changing conversation detail behavior

## Recommended Approach

Use `uni` local storage with two cache classes:

1. **24 hour TTL caches**
   - agent list cache, keyed by connection
   - agent option snapshot cache, keyed by `connection + agentType + projectPath`

2. **Persistent selection caches**
   - last selected agent, keyed by connection
   - last selected mode/config values, keyed by `connection + agentType + projectPath`

This approach is recommended because:

- it is local to the existing page
- it matches the user's requested 24 hour remote-data cache behavior
- it keeps "last chosen values" persistent until the user changes them again

## Cache Model

### Agent List Cache

- Storage key: page-local `uni` storage entry
- Scope: one entry per connection
- TTL: 24 hours
- Value: normalized `CreateAgentOption[]`

### Agent Option Snapshot Cache

- Storage key: page-local `uni` storage entry
- Scope: one entry per `connection + agentType + projectPath`
- TTL: 24 hours
- Value: remote `AgentOptionsSnapshot`

### Persistent Selection Cache

- No TTL
- Connection-level record for last `agentType`
- Context-level record for last `selectedModeId` and `selectedValues`

## Load Flow

### Opening Create Conversation

1. Resolve the target connection.
2. Restore the last selected `agentType` for that connection if present.
3. Read the cached agent list for that connection.
4. If the list cache is fresh, render it immediately.
5. Read the cached option snapshot for `connection + agentType + projectPath`.
6. If the snapshot cache is fresh, render it immediately.
7. Overlay the persistent selection values on top of the snapshot when they are still valid.
8. Only call the remote APIs when the corresponding 24 hour cache is missing or expired.

### Changing Agent

1. Persist the selected agent at connection scope immediately.
2. Recompute the current config context key.
3. Try the 24 hour option snapshot cache first.
4. Overlay persistent selections for that context.
5. Fetch remote data only when no fresh snapshot cache exists.

### Changing Project

1. Keep the current connection and agent.
2. Recompute the context key using the new `projectPath`.
3. Restore the cached option snapshot and persistent selection for that context when available.
4. Otherwise fetch the remote snapshot once and repopulate the cache.

## Selection Rules

Persistent selections are updated when the user changes:

- agent
- mode
- config option value

They are not time-limited. A later create-sheet interaction replaces the stored values.

If a stored value is not present in the currently loaded snapshot:

- invalid mode ids are dropped and replaced with the remote current mode or first available mode
- invalid config option values are dropped and replaced with the option's current/default value

## Failure Handling

If a remote fetch fails:

- preserve current fallback UI behavior
- keep create available
- continue using any already-restored cached data when present

Cache decode failures should degrade silently to empty cache and refetch when needed.

## Testing Strategy

Manual verification should cover:

1. Open create sheet twice within 24 hours on the same connection and confirm no second remote list fetch is needed.
2. Select an agent, mode, and config value; close and reopen; confirm values restore.
3. Switch project and confirm context-specific config cache is used.
4. Expire or delete cache and confirm remote fetch still works.
5. Simulate a changed remote option set and confirm invalid stored values fall back cleanly.
