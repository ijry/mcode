# MCode Inline Permission Approval Design

## Summary

Add inline permission approval UI to `mcode-app` conversation detail so an outstanding agent permission request appears as a card above the composer and the user can tap one of the server-provided options to respond.

## Problem

`mcode-app` already receives ACP `permission_request` events and already exposes `acp_respond_permission(connectionId, requestId, optionId)`, but the conversation detail page does not store the full pending permission request in runtime state and does not render any usable approval UI. The existing permission picker shell is dead code.

## Goals

1. Show the current pending permission request inline above the input box.
2. Render the exact response options returned by ACP as tappable actions.
3. Submit the selected `optionId` through the existing ACP API.
4. Preserve pending permission state when session snapshot hydration restores an active request after refresh/reconnect.

## Non-Goals

1. Writing approval history into the message timeline.
2. Adding a second manual approval entry point elsewhere in the page.
3. Changing backend ACP payload shapes.

## Approach

Store a normalized `pendingPermission` object on each `RuntimeSession`. Populate it from both live `permission_request` events and hydrated session snapshots. Clear it when a turn completes, when the session disconnects, or when the local page successfully responds to the request.

On the conversation detail page, replace the unused permission picker path with an inline approval card rendered above the composer. The card shows a short title, the permission description, optional per-option descriptions, and one button per server-returned option. Clicking a button submits `connectionId + requestId + optionId`, disables the card while the request is in flight, and clears the runtime pending permission on success.

## Data Model

Add a lightweight runtime-facing permission model:

- `PermissionRequest`
  - `id`
  - `type`
  - `description`
  - `details`
  - `options`
- `PermissionOption`
  - `id`
  - `label`
  - `description`

`RuntimeSession.pendingPermission` holds either that object or `null`.

## UI Behavior

When `session.pendingPermission` exists:

1. Show an inline card above the input row.
2. Card title is `需要授权`.
3. Body text prefers the normalized permission description and falls back to `智能体请求继续当前操作`.
4. Render each option as a button using the server-provided label.
5. While a response is submitting, disable all buttons and show a loading label on the selected button.
6. If options are unexpectedly empty, render a passive hint instead of buttons.

## Lifecycle Rules

1. Live `permission_request` event updates `session.pendingPermission` and sets status to `waiting_permission`.
2. Snapshot hydration restores `session.pendingPermission` from `snapshot.pending_permission`.
3. Successful local response clears `session.pendingPermission`.
4. `turn_complete`, `disconnect`, and `clearSession` clear `session.pendingPermission`.
5. Response failure leaves the card intact and surfaces a toast error.

## Error Handling

1. Missing `connectionId` or `requestId` blocks submission and shows a toast.
2. Empty option arrays do not crash rendering.
3. Stale response failure is treated as a regular API failure; the UI remains visible until a later snapshot/event clears it.

## Testing

Run a targeted TypeScript check for `mcode-app` with `vue-tsc --noEmit`. Manual validation should confirm:

1. A live permission request renders the card above the composer.
2. Tapping an option submits once and disables repeated taps while pending.
3. Refreshing into a session snapshot with `pending_permission` restores the card.
4. Successful response removes the card.
