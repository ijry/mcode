# Conversations Liquid Glass UI

## Architecture

- The conversations page remains a single `mcode-app` uni-app/Vue page at `mcode-app/src/pages/conversations/index.vue`.
- The change is presentation-only: existing connection discovery, live session grouping, history loading, conversation creation, agent config selection, and navigation handlers stay in the page component.
- Styling uses uview-plus runtime theme variables directly through `--up-*` CSS variables and existing `upThemeVar(...)` bindings. No `--mcode-*` theme aliases are introduced.

## Protocol And Data Flow

- No API, relay, gateway, ACP, or xycloud protocol changes are introduced.
- The overview still renders connection groups from the existing active connection/runtime state, then opens live sessions with the current connection key and tab id.
- The history panel still loads per-connection project sections and opens stored conversations through the existing conversation navigation flow.
- Search, create, picker, action sheet, and refresh behavior reuse the existing page state and service calls.

## UI Behavior

- The conversations page adds a liquid-glass backdrop with blurred animated blobs behind the content.
- The top area uses a transparent sticky header, large page title, glass search bar, and circular create action.
- Live session and history entry cards use translucent card surfaces, rounded corners, blur, light borders, and status chips.
- History mode keeps the existing grouped project collapse behavior while restyling the mode bar, project sections, and conversation cards.
- Empty, loading, create dialog, config dialog, and create-progress states retain their behavior and are visually aligned to the updated surface treatment.

## Compatibility

- Runtime dark/light mode should continue to follow uview-plus variables such as `--up-page-bg-color`, `--up-card-bg-color`, `--up-main-color`, `--up-content-color`, `--up-tips-color`, `--up-border-color`, and `--up-primary`.
- `backdrop-filter`, `color-mix`, and large blur effects are enhancement styles. Platforms that do not support them should keep readable card backgrounds, borders, and text colors via the fallback `--up-*` values.
- No persistent data migration is required.

## Native iOS And Android Guidance

- Keep the data model unchanged: render active connection groups, live tab cards, and a per-connection history/project list from the same runtime/session sources.
- Recreate the background with three softly blurred colored radial layers behind the scroll content. Animate slow translation/scale where performance allows.
- Use native blur/material surfaces for header action, search field, live cards, and history cards. If blur is unavailable or expensive, fall back to a semi-transparent card color plus a 1 px light border.
- Preserve the two-mode interaction model: default grouped overview, and history mode entered from a group-specific history card with an explicit back control.
- Respect system dark mode by mapping colors to the same semantic roles as the uview variables above rather than hard-coding light backgrounds.
