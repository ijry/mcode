# Goal Card Expanded Collapse

## Architecture

`mcode-app` keeps Codex `/goal` runs as a presentation-only `GoalToolCallBlock`.
This change only adjusts that component's expanded shell: the collapsed summary
keeps the pill-shaped capsule, while the expanded card switches the outer shell
to a normal rounded rectangle so the body is not clipped by a `999rpx` radius.

## Data Flow

No protocol or persistence data changes. `buildGoalDisplayParts(...)` still
derives `goal_run` parts from existing `create_goal` / `update_goal` tool calls,
and `GoalToolCallBlock` continues to parse objective, status, token, budget,
remaining-token, duration, nested content, and error fields from the same props.

## UI Behavior

- Collapsed goal cards remain compact capsules.
- Expanded goal cards use a smaller outer radius and visible overflow to avoid
  the capsule corner masking the inner body.
- Expanded goal cards now render a bottom `收起` action that sets the local
  expanded state to `false`; the summary row remains the primary toggle.

## Compatibility

Existing conversations and upstream goal tool-call payloads are unchanged.
The new collapse action is local UI state only and does not affect streaming,
history hydration, or grouped nested tool calls.

## Native iOS/Android Replication Guidance

Native clients should model the same two visual states: render the collapsed
summary as a pill, but render the expanded container as a rounded card rather
than clipping all children through the pill outline. Place a bottom-centered
collapse control after metadata/errors so long goal runs can be closed without
scrolling back to the summary.
