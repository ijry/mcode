# MCode P35 Session Detail Body Design

## Goal

Extract all `session-detail` content below the navigation bar into one reusable body component so the same UI block can be rendered by multiple tabs for multiple sessions without cross-tab state leakage.

## Current Context

`mcode-app/src/pages/session-detail/index.vue` is still a small legacy page. It currently renders:

- a title
- the message input
- send/stop/approve actions
- the event list

All of that content is inline in the page component today. This makes the page hard to reuse as-is when a future multi-tab session surface needs to render multiple independent session bodies in the same navigation shell.

## Scope

This design targets only `mcode-app/src/pages/session-detail/index.vue`.

It introduces one new reusable component for everything below the navbar and updates the page to consume that component.

## Non-Goals

- Do not redesign the legacy `session-detail` UI.
- Do not change ACP method names, payload shapes, or gateway wiring.
- Do not move session state ownership into the reusable component.
- Do not split the body into smaller subcomponents in this phase.
- Do not change current route structure or navigation bar behavior.
- Do not modify `conversation-detail/index.vue` in this phase.

## Recommended Approach

Use a single controlled body component.

The page remains the screen shell and owns page-level concerns such as route parsing, store access, and gateway calls. A new `SessionDetailBody` component owns only the rendering of the content below the navbar and emits UI intents back to the parent.

This keeps future multi-tab composition simple: each tab can maintain its own isolated session state and render the same body component instance with different props.

## Component Boundary

### Page responsibilities

`mcode-app/src/pages/session-detail/index.vue` remains responsible for:

- resolving the current session identity
- reading and updating store-backed state
- creating and using the gateway
- mapping button clicks to ACP calls
- providing per-tab state to the child component

### Body component responsibilities

`SessionDetailBody` is responsible for:

- rendering the title/content shell below the navbar
- rendering the current input value
- rendering send/stop/approve actions
- rendering the event list
- emitting user intent back to the parent

The body component must not import `useSessionStore()`, `useAuthStore()`, or directly call the gateway.

## Interface

The reusable component should be controlled by its parent. A minimal first-pass contract is:

- `messageText: string`
- `events: SessionEventLike[]`
- `title?: string`
- `sendDisabled?: boolean`
- `stopDisabled?: boolean`
- `approveDisabled?: boolean`

Emits:

- `update:messageText`
- `send`
- `stop`
- `approve`

This contract is intentionally small and flat because the current page is small. If the legacy page grows later, it can be promoted to a controller object, but that is unnecessary for P35.

## Multi-Tab State Model

Future tabs must not share mutable UI state implicitly through the body component.

The parent tab container should hold a separate state slice per session tab, including:

- current `messageText`
- event list source or derived event list
- action in-flight flags if needed later
- any session-specific action handlers

`SessionDetailBody` receives only the state for the current rendered tab instance. Reusing the same component across tabs must not cause one tab's input text or action state to appear in another tab.

## Data Flow

For the current single-page usage:

1. `session-detail/index.vue` reads the current session state from the store.
2. The page passes `messageText`, `events`, and action flags into `SessionDetailBody`.
3. `SessionDetailBody` emits `update:messageText`, `send`, `stop`, or `approve`.
4. The page handles those emits, performs gateway/store work, and updates the state it passes back down.

For future multi-tab usage, the same flow repeats per tab with a tab-scoped session state owner above the body component.

## Testing Expectations

At implementation time, verify:

- the page still renders the same controls and event list after the extraction
- typing in the body updates only the parent-owned input state
- send/stop/approve still trigger the same parent handlers
- the new component can be mounted with arbitrary props without a store
- the session-detail split does not introduce new `vue-tsc` errors in the extracted page/component pair

If unit coverage is added, prefer a focused component test for `SessionDetailBody` plus a light page integration test to ensure the parent wiring is unchanged.

## Compatibility Considerations

This is a client-side component-boundary refactor only.

- no API contract changes
- no protocol changes
- no storage-schema changes
- no route changes
- no theme-variable changes

Existing behavior should remain the same for the current single-session page. The only intended change is that the body becomes reusable for future multi-session tab layouts.

## Native iOS/Android Guidance

Native clients should mirror the same separation:

- keep navigation-shell concerns in the screen/controller layer
- keep per-tab session state in the parent tab host
- make the reusable body view a pure render surface driven by parent state and callbacks

Do not hide session ownership inside the reusable body view if the product needs multiple simultaneous session tabs, because that makes tab isolation and lifecycle control harder to reason about.

## Rollout

1. Add the reusable session-detail body component.
2. Move the existing page content below the navbar into that component.
3. Keep the page as the owner of store and gateway actions.
4. Verify the current single-page behavior stays the same.
5. Reuse the same component from the future multi-tab session host.
