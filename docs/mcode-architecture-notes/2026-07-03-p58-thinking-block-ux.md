# P58 Thinking Block UX: Brain Icon + Collapsible Behavior

**Date:** 2026-07-03  
**Scope:** `MessageBubble.vue` thinking content part rendering

## Architecture

The thinking section (`part.type === 'thinking'`) in `MessageBubble` now supports:

1. **Brain icon** — replaced the non-existent `up-icon name="bulb"` with an SVG image at `/static/icons/brain.svg`, rendered via `<image>` tag (uview-plus icon font has no brain glyph).
2. **Collapsible header** — clicking the thinking header toggles collapse/expand. A chevron arrow (`arrow-up`/`arrow-down`) indicates state.
3. **Auto-expand during streaming** — when `message.status === 'streaming'`, thinking parts are expanded by default so the user sees real-time reasoning updates.
4. **Auto-collapse on completion** — a `watch` on `isStreaming` detects the `streaming → completed` transition and resets all collapse/expand state, causing every thinking part to collapse.

## Data Flow

- `manuallyCollapsed: Ref<Set<number>>` — tracks parts the user folded *during streaming*.
- `manuallyExpanded: Ref<Set<number>>` — tracks parts the user unfolded *after streaming ended*.
- `isThinkingCollapsed(index)` returns:
  - **streaming**: collapsed only if in `manuallyCollapsed`
  - **non-streaming**: collapsed unless in `manuallyExpanded`
- When streaming ends (watch fires), both sets are cleared → all thinking collapses.

## UI Details

- Header row: brain icon (30rpx) + "深度思考" label + chevron arrow (right-aligned).
- Body uses `v-show` for smooth toggle (no DOM destroy).
- `.part-thinking--collapsed` removes bottom margin from header for compact look.

## Native iOS/Android Replication

- Use a SF Symbols `brain` / Material `psychology` icon for the header.
- Wrap the thinking text in an expandable section; animate height on toggle.
- Observe streaming state: expand on `streaming`, collapse on transition to `completed`.
- Persist manual toggle state per-part within the current message lifecycle (no cross-message persistence needed).
