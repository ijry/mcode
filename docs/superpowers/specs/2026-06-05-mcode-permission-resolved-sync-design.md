# MCode Permission Resolved Sync Design

## Summary

Teach `mcode-app` to consume ACP `permission_resolved` events so a permission card disappears immediately when the same request is approved or denied from another client such as `codeg web`.

## Problem

`mcode-app` currently renders pending permission cards from `permission_request` events and session snapshots, but it does not understand `permission_resolved`. That leaves a stale card visible until some later stream/tool/turn event arrives or the page refreshes.

## Goal

Make permission UI converge immediately across multiple open clients.

## Non-Goals

1. Changing backend ACP payloads.
2. Reworking the permission UI.
3. Adding polling or forced snapshot refreshes.

## Approach

Extend the front-end ACP event model with a `permission_resolved` event carrying `requestId`. Parse that event in `mcode-app/src/api/acp.ts`, then handle it in `conversationRuntime` by clearing the pending permission only when the resolved request id matches the currently rendered one.

## Behavior

1. Two clients can both show the same outstanding permission request.
2. If either client responds, the backend emits `permission_resolved`.
3. `mcode-app` receives the event and calls its existing request-id-aware clear path.
4. If a stale resolved event arrives for an older request, the current card stays intact.

## Testing

Run `npx vue-tsc --noEmit` and confirm there are no new type errors attributable to this change. Existing unrelated repo-wide type baseline issues may remain.
