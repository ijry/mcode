# Connection Failure UX

## Summary

`mcode-app` now makes unstable or unreachable connections visible instead of reducing every failure to a quiet "offline" badge.

The change is client-only. It does not modify ACP commands, WebSocket payloads, relay APIs, or stored connection schema.

## Architecture

The connections page keeps the existing split between:

- `connectedMap`: the user wants this connection to stay linked.
- `onlineMap`: the latest observed reachability state.

It adds an in-memory `connectionHealthMap` keyed by `mode + normalized URL`. The health entry stores:

- `state`: `idle | online | reconnecting | error`
- `message`: normalized failure hint
- `attempt`: current reconnect attempt
- `lastFailedAt`
- `nextRetryAt`

Health is intentionally not persisted. On app/page reload the client re-probes saved linked connections and reconstructs health from `/api/health`, relay target status, and event WebSocket open/close/error.

## Data Flow

1. Manual direct save/pair stores the token, then immediately probes `/api/health`.
2. Relay save/pair obtains a relay session, then probes target online status.
3. Successful probe or event socket open marks the connection online and clears health failure metadata.
4. Failed probe, socket close, or socket error clears `onlineMap[key]`, records a user-facing failure message, and schedules reconnect when the connection is still linked.
5. Scheduled reconnect records `reconnecting` plus the next retry timestamp so UI can show that recovery is active.

Conversation detail derives composer feedback from existing realtime bridge health and runtime retry/error state. When the bridge is reconnecting/error, or retry/error text looks network-related, the composer shows a single network reachability warning below the input area.

## UI Behavior

Connection cards now distinguish:

- `在线`: reachable and event socket open.
- `重连中`: linked but currently reconnecting.
- `连接异常`: linked but probe/connect failed.
- `未连接`: not linked by user choice.

Unstable cards show an actionable detail line plus `立即重试`; hard failures also show `排查建议`. Tapping an unstable linked card opens a modal that explains the host/network may be unreachable and lets the user retry or continue opening the project list.

Conversation detail shows a warning under the composer such as "请检查主机网络可达性和内网穿透连接稳定性" when realtime or request retry state indicates network instability. This suppresses duplicate generic retry/error rows while the network warning is active.

## Compatibility

No protocol or persistence migration is required. Existing saved connections and config codes remain compatible.

The UI uses uview-plus runtime theme variables with `--up-*` names. No new app-specific theme aliases are introduced.

## Native iOS/Android Replication Guidance

Native clients should keep desired-link state separate from observed reachability:

- Persist only saved connections and whether the user wants them linked.
- Keep transient health state in memory.
- Probe direct connections with the desktop health endpoint before showing "connected".
- Treat event socket close/error as `reconnecting` if the user still wants the connection linked.
- Show retry/help actions on the connection list instead of hiding recovery in the background.
- In conversation detail, surface transport errors near the composer because this is where users decide whether sending is possible.
