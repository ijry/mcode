# MCode Pet Motion Scene Design

Date: 2026-06-07
Status: Draft for review

## Goal

Upgrade the floating pet from simple emotion-based CSS motion into a reusable motion-scene system that can support many small pet animations such as eating, sleeping with `zzz`, stretching, and playful actions. The desired direction is closer to Apple Watch Snoopy face behavior in spirit: many short, varied, personality-rich moments driven by context and randomness.

This phase should prioritize:

- A scalable motion architecture rather than one-off animation patches
- Noticeably richer pet behavior on the floating pet first
- H5-safe rendering and maintainable animation composition
- An extensible configuration model so many more motions can be added later

This phase should not attempt:

- Hundreds of handcrafted unique sprite poses in one pass
- Full parity with every complex animated watch-face behavior
- Simultaneous redesign of both floating pet and panel pet presentation

## Product Direction

The chosen direction is a middle-ground architecture:

- Keep the existing pet emotion system
- Add a motion engine that chooses short scene animations
- Add a scene layer for props and effects
- Ship a first batch of reusable high-impact animations
- Make it easy to grow the motion library over time

This avoids the current limitation where richer behavior would require hardcoding more and more `keyframes` into `PetSprite.vue`, while also avoiding the heavy first-pass cost of building a huge manual pose library.

## Scope

### In scope

- Floating pet motion-system upgrade
- Motion selection engine with cooldowns, priorities, and randomness
- Scene rendering layer for props and effects
- First batch of “story-like” motions:
  - look around
  - tail swish
  - stretch and yawn
  - sleep curl
  - sleep `zzz`
  - snack nibble
  - snack happy chew
  - play hop
  - play ball
  - self-proud / post-success flourish
- Trigger integration with existing pet interaction and idle behavior
- Unit tests for config selection and engine behavior

### Out of scope

- Large pet panel animation overhaul
- Species-specific large motion libraries for every pet species
- Audio sync per animation
- Frame-by-frame animation authoring tools
- Server-driven animation packs

## Current Constraints

The current implementation has these boundaries:

- `PetSprite.vue` renders a single SVG symbol chosen by `emotion`
- Most animation is CSS transform-based, not scene-based
- `petEngine.ts` decides bubble/emotion behavior but does not manage a motion queue
- `PetFloat.vue` wires interactions and transient tap animations
- Sprite art is currently sparse, especially beyond the fox

This means the current architecture can support “more movement,” but not a large library of varied pet moments without becoming brittle.

## Proposed Architecture

### 1. Emotion layer remains

The existing `emotion` remains the top-level mood signal:

- `idle`
- `sleeping`
- `curious`
- `busy`
- `alert`
- `happy`
- `sad`
- `excited`
- `bored`

Emotion continues to answer: what is the pet’s general state?

### 2. Motion layer is added

A new `motion` concept is introduced to represent the short-lived current action.

Examples:

- `idle-look-around`
- `idle-tail-swish`
- `sleep-curl`
- `sleep-zzz`
- `stretch-yawn`
- `snack-nibble`
- `snack-happy-chew`
- `play-hop`
- `play-ball`
- `self-proud`

Motion answers: what is the pet doing right now?

The motion layer is independent from emotion but constrained by it. For example:

- `sleeping` may allow `sleep-curl` and `sleep-zzz`
- `busy` should not allow playful motions
- `idle` can allow ambient idle motions

### 3. Scene layer is added

A new scene layer renders auxiliary visuals around the pet.

Examples:

- `zzz`
- snack / cookie
- crumbs
- ball
- sparkles
- sweat drop

Scene answers: what extra visual context appears with the motion?

This allows one base sprite plus several motion combinations without requiring a unique full-pose asset for every situation.

## Component Structure

### `PetSprite.vue`

Responsibilities:

- Render the base pet body / expression
- Apply body motion classes
- Remain the source of the pet’s primary visual form

Changes:

- Accept a new `motion` prop
- Layer motion classes in addition to emotion classes
- Keep current interaction handling compatible

### `PetScene.vue`

New component.

Responsibilities:

- Render scene props and effect overlays
- Position elements relative to the floating pet
- Animate decorative items independently of the body

Expected supported decorations in phase 1:

- `zzz`
- `snack`
- `crumbs`
- `ball`
- `sparkles`
- `sweat`

### `PetFloat.vue`

Responsibilities:

- Keep floating positioning and touch handling
- Consume `emotion`, `motion`, and active scene data
- Continue handling tap / double tap / long press

Changes:

- Render both `PetSprite` and `PetScene`
- Use motion state from engine instead of only ad hoc tap interaction
- Preserve current interaction sound and speech behavior

## Motion Engine

### `petMotionConfig.ts`

New configuration source for motion templates.

Each motion template should define:

- `id`
- `group`
- `durationMs`
- `cooldownMs`
- `weight`
- `allowedEmotions`
- `allowedHours`
- `interruptible`
- `sceneDecorations`
- `bodyClass`
- optional `trigger`

Example groups:

- `idle`
- `sleep`
- `play`
- `snack`
- `celebration`

### `petMotionEngine.ts`

New service that selects and controls active motions.

Responsibilities:

- Determine which motions are eligible
- Resolve random weighted choices
- Prevent immediate repetition
- Track cooldowns
- Handle event-based preemption
- Expose reactive current motion and scene data

### Motion priorities

High priority:

- tap interaction
- double tap excitement
- level-up celebration
- explicit event reactions

Medium priority:

- sleeping ambient motions
- busy-state compatible ambient motions

Low priority:

- idle variety motions
- time-based idle embellishments

### Preemption rules

- Only one main motion may run at a time
- Higher-priority motions may interrupt lower-priority motions
- Non-interruptible motions should be short and used sparingly
- Scene decorations must be cleared when a motion is replaced

## Trigger Model

### Direct triggers

- Single tap
  - may trigger a friendly interaction motion
- Double tap
  - may trigger a more energetic play / flourish motion
- Level up
  - triggers celebratory motion

### State-based triggers

- `sleeping`
  - may trigger `sleep-curl` or `sleep-zzz`
- `idle`
  - may trigger `look-around`, `tail-swish`, or `stretch-yawn`
- `happy`
  - may trigger `self-proud` or snack-like happy motions

### Time-based shaping

- Late evening / night
  - higher weight for sleep motions
- Afternoon
  - higher weight for `stretch-yawn`

### Cooldown shaping

- Same motion should not replay immediately
- Same group may have partial cooldown shaping to avoid visible repetition

## First Batch Motion Library

Phase 1 motion targets:

1. `idle-look-around`
2. `idle-tail-swish`
3. `stretch-yawn`
4. `sleep-curl`
5. `sleep-zzz`
6. `snack-nibble`
7. `snack-happy-chew`
8. `play-hop`
9. `play-ball`
10. `self-proud`

### Rationale

This set gives a broad emotional range:

- ambient life
- sleepy personality
- food interaction
- playfulness
- task-success delight

It is enough to make the pet feel dramatically more alive without overloading the first implementation.

## Visual Strategy

The animation style should not rely on massive one-off art upfront. Instead it should combine:

- base SVG expression
- CSS body motion
- lightweight props
- timing and randomness

This is the scalable path toward “many animations.”

If future quality demands increase, the system can later absorb:

- more per-motion pose variants
- species-specific decoration placement
- larger prop libraries
- alternate motion packs

without changing the engine contract.

## Species Handling

Phase 1 should optimize for the fox first because:

- it has the richest existing emotion art
- it is the current best visual anchor
- motion infrastructure can be validated on one species before broader rollout

Other species should keep working with graceful fallback:

- if a species lacks a specialized pose or decoration anchor, it uses generic motion behavior
- no species should break or disappear due to missing motion-specific assets

## Performance and Safety Constraints

To keep H5 and mobile WebView performance stable:

- only one main motion at a time
- only one or two decorations at a time
- prefer transform / opacity animation
- avoid large DOM trees
- avoid unbounded animation loops detached from state
- clear timers and active motion state on teardown

The floating pet should remain responsive to drag and taps even while a motion is active.

## Testing Strategy

### Config tests

Validate:

- allowed emotion filtering
- hour filtering
- cooldown filtering
- non-repetition rules
- weight-based eligibility

### Engine tests

Validate:

- event motions preempt idle motions
- sleep motions only run in sleeping-compatible states
- motion teardown clears scene state
- fallback behavior when no motion is eligible

### Component smoke checks

Validate:

- `PetFloat` renders sprite and scene together
- decorations appear only for matching motions
- existing bubble / voice / tap behavior still works

### Build verification

At minimum:

- `vue-tsc --noEmit`
- pet unit tests
- `build:h5`

## Implementation Sequence

1. Add motion config model and unit tests
2. Add motion engine with cooldown / selection logic
3. Add `PetScene.vue`
4. Extend `PetSprite.vue` to accept motion classes
5. Wire motion engine into `petEngine.ts`
6. Render motion + scene from `PetFloat.vue`
7. Add phase 1 motions and decorations
8. Verify H5 build and interaction behavior

## Risks

### Risk: too many moving parts in one phase

Mitigation:

- keep phase 1 to floating pet only
- keep first motion library to about ten motions

### Risk: animation code becomes another monolith

Mitigation:

- separate config, engine, sprite, and scene responsibilities

### Risk: H5 performance drops

Mitigation:

- limit active decorations
- keep animations transform-based
- keep per-motion markup minimal

### Risk: other species look inconsistent

Mitigation:

- fox-first optimization with safe fallback behavior for others

## Success Criteria

This work is successful when:

- the floating pet can perform multiple visibly different ambient motions
- eating, sleeping `zzz`, and playful motions all exist
- motion selection feels varied instead of repetitive
- direct interactions can interrupt ambient motions cleanly
- H5 build remains healthy
- new motions can be added mostly by config and small scene additions rather than engine rewrites
