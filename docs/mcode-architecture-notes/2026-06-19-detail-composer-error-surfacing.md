# Detail Composer Error Surfacing

## Architecture

`mcode-app` conversation detail continues to store ACP send/runtime failures in
the runtime session `inputErrorMessage`. The detail page now treats that field as
a composer-local error surface, not only as top toolbar status text.

## Protocol And Data Flow

No ACP command, websocket event, relay/direct gateway, persistence, or queue
protocol changes are required.

1. `sendDraft` calls `acpPrompt`.
2. If the prompt request fails, the existing catch path normalizes the thrown
   value with `toErrorMessage`.
3. The normalized text is written to `runtime.setSessionError(...)`, which stores
   it in `session.inputErrorMessage`.
4. The detail page derives `runtimeErrorText` from `inputErrorMessage`.
5. When the error is not already represented by a network reachability warning,
   the composer renders a persistent multi-line error card under the input area.

HTTP status-only failures such as `HTTP 423` therefore remain visible near the
send affordance instead of relying on the narrow toolbar status swiper.

## UI Behavior

Runtime errors are still elevated into the top status area, but they are no
longer suppressed below the composer just because the top status also contains
the same text. The composer card shows a `发送失败` label plus the full normalized
message.

Network reachability warnings keep precedence under the composer to avoid
stacking a generic send error below a more actionable connection-health warning.
Retry feedback still follows the existing dedupe rule when it is already shown
as the active top status.

## Compatibility

This is a client-only presentation change. Existing sessions, queued drafts,
gateway errors, and remote clients remain compatible.

The UI uses uview-plus runtime `--up-*` theme variables and does not introduce
new app-specific theme aliases.

## Native iOS/Android Replication Guidance

Native clients should surface normalized ACP send/runtime errors in two places:

- A compact conversation status area can show the current runtime error.
- The composer should also show a persistent multi-line error card whenever the
  user needs to understand why sending failed.

Do not hide the composer error solely because the toolbar already displays the
same text. Continue to let explicit network-health warnings override generic
runtime error cards.
