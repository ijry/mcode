# P35 Session Detail Body

## Architecture

`mcode-app/src/pages/session-detail/index.vue` now acts as a thin page shell. All content below the navbar lives in `mcode-app/src/components/session/SessionDetailBody.vue`.

The page continues to own store access and ACP gateway calls. The body component is fully controlled by parent props and emits, so future multi-tab session hosts can render one body per tab with isolated state instead of letting a shared component own global session state.

The reusable body contract is centralized in `mcode-app/src/pages/session-detail/sessionDetailBodyContract.ts`. This keeps the render boundary explicit and gives future tab containers one stable place to mirror prop and event semantics.

## Protocol And Data Flow

There is no protocol change. The page still calls the same ACP methods:

- `acp_prompt`
- `acp_cancel`
- `acp_respond_permission`

The only flow change is the local Vue component boundary:

1. the page reads the active session state from the store
2. the page passes `messageText` and `events` into `SessionDetailBody`
3. `SessionDetailBody` emits `update:messageText`, `send`, `stop`, and `approve`
4. the page performs gateway/store work and re-renders with the new state

This is compatible with a future multi-tab host because the same four-step flow can run once per tab with independent parent-owned state.

## UI Behavior

The visible legacy `session-detail` UI stays the same. Users still see the title, input, send/stop/approve buttons, and event list in the same order.

The only user-visible behavioral constraint added by P35 is architectural: body state is now expected to be parent-owned so multiple tabs can avoid leaking input text or action state into each other.

## Compatibility

This is a client-side component-boundary refactor only.

- no ACP payload changes
- no route changes
- no storage-schema changes
- no store-shape changes
- no theme-variable changes

Existing `session` store data and rendered event-key semantics remain compatible. `SessionDetailBody` still keys event rows with `time` first and falls back to the render index when `time` is missing.

## Native iOS/Android Guidance

Native clients should preserve the same split:

- the screen/controller layer owns session selection, gateway access, and state mutation
- a reusable session body view renders one session instance from parent-provided state
- a tab host keeps one mutable state slice per tab/session rather than hiding shared state inside the reusable body view

If native clients add multi-session tabs later, they should treat the reusable body view as a pure render surface plus UI intents, not as the owner of session lifecycle or transport state.
