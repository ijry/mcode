# P62 Tabbar Active Sessions Badge

## Architecture

mcode-app reuses the codeg-main pet active-session surface instead of deriving
running state from local conversation cards. The mobile conversation tab calls
`pet_list_active_sessions` on each connected codeg-main instance and sums
`runningCount + waitingCount` into the native tabbar badge for the "会话" tab
(`pages.json` tab index `1`).

The normalization and native tabbar writes live in
`src/services/conversation/tabbarActiveSessions.ts`; the conversations page only
creates per-connection gateways, subscribes to updates, and passes counts to the
service.

## Protocol And Data Flow

codeg-main already exposes:

- Snapshot command / HTTP route: `pet_list_active_sessions`
- Live event channel: `pet://sessions`
- Payload: `{ runningCount, waitingCount, errorCount, sessions }`

mcode-app uses the snapshot on page show, pull refresh, and after conversation
creation. While the conversations page is mounted, it also subscribes to
`pet://sessions` per remote instance through `acpApi.subscribeGlobalEvent`.
Each event updates that instance's count in `activeSessionBadgeCountMap`; the
sum across instances is written to the badge.

Only `runningCount + waitingCount` contributes to the P62 badge. `errorCount`
does not represent an in-progress session, so it is ignored for the tabbar
number.

## UI Behavior

- Count `0`: call `uni.removeTabBarBadge({ index: 1 })`.
- Count `1..99`: call `uni.setTabBarBadge({ index: 1, text: String(count) })`.
- Count `>99`: display `99+`.
- Snapshot failures are logged and excluded from the sum; if all connected
  instances fail, the badge is removed rather than showing a stale value.

## Compatibility

The mobile normalizer accepts both `camelCase` and `snake_case` aggregate fields
and can derive counts from `sessions[].status` if aggregate fields are absent.
This keeps the UI tolerant of older gateway wrappers or direct JSON shape
changes, while the preferred protocol remains codeg-main's `camelCase`
`PetSessionsPayload`.

## Native iOS/Android Replication

Native clients should call `pet_list_active_sessions` for every connected
codeg-main account/instance, sum `runningCount + waitingCount`, and apply that
number to the conversations tab badge. Subscribe to `pet://sessions` on each
instance's event stream while the conversation overview is alive, replacing the
stored per-instance count on each event and recomputing the total. Remove the
badge when the total is zero or all snapshot calls fail.
