# MCode P63 Conversation Detail Summer Theme Design

## Goal

The conversation-detail page already supports `default`, `matrix`, `sweet`, and the recently refined `sweet` jelly-glass presentation. This revision adds a new detail-page theme for summer.

The selected direction is:

- clear island atmosphere
- strong visible summer elements
- a "西瓜海浪" visual identity

The result should read as a deliberate seasonal skin, not a generic blue theme with a few red accents.

## Current Context

Existing relevant boundaries:

- `mcode-app/src/pages/conversation-detail/detailCyberMode.ts` already owns the detail-theme enum, storage helpers, menu actions, and phase derivation
- `mcode-app/src/pages/conversation-detail/index.vue` already renders page-level atmosphere components and threads `detailTheme` plus `cyberEffectPhase` through the detail shell
- `mcode-app/src/pages/conversation-detail/index.scss` already contains page-level theme branches for `matrix` and `sweet`
- `mcode-app/src/components/MessageBubble.vue` already supports theme-specific visual branches without changing message protocol

Current theme-system constraints must remain true:

- detail theme state stays in `mcode_detail_theme_v1`
- the feature remains detail-page local and visual-only
- no ACP, realtime, route, SQLite, or runtime store contract changes
- background image precedence continues to be handled by the detail-page shell

## Non-Goals

- Do not add per-conversation or per-tab theme overrides.
- Do not add text decode, glitch, or high-frequency motion to the summer theme.
- Do not build a full illustrated beach poster behind the conversation content.
- Do not introduce raster-only theme assets when SVG can express the shape cleanly.
- Do not weaken existing `default`, `matrix`, or `sweet` behavior.

## Selected Direction

The chosen summer direction is `西瓜海浪`.

This means:

- sea blue remains the primary atmosphere base
- watermelon red becomes a clear secondary signal color
- beach sand gold, coconut cream, and palm green support the palette
- watermelon slices, wave shapes, palm leaves, and coconuts appear as visible themed elements

The theme should look like a summer-limited conversation skin with strong recognition, not a travel poster and not a children's sticker collage.

## Visual Contract

### 1. Page Base

The page base should be split into a fresh coastal atmosphere:

- upper zone: sea-sky blues
- lower zone: soft sand golds
- occasional white surf or foam transitions

This split should make the theme feel like a place, not just a color wash.

### 2. Decorative Elements

The summer theme uses strong elements, but they are still staged around the conversation UI:

- watermelon slices as the most visible decorative motif
- wave forms as the main motion and structure language
- palm leaves as framing accents near top corners or side edges
- coconut shapes as secondary punctuation, usually lower on the screen

These elements should not be tiled across the whole page. They should behave like a themed set around the content.

### 3. Message And Surface Treatment

The message area remains readable-first, but it should inherit the summer palette:

- outer bubbles and panels use sea-glass style translucent surfaces
- some user-facing accents may shift toward juice or coral glass
- nested `thinking`, `tool`, `plan`, and similar blocks should feel like cooler frosted cards with slightly lower opacity than outer bubbles

The content area should feel seasonal without becoming visually heavy.

### 4. Accent Hierarchy

Color hierarchy should be explicit:

- sea blue / aqua: main atmosphere and structural UI color
- watermelon red / coral: active highlight and seasonal signature
- sand gold / coconut cream: balancing warmth
- palm green: restrained accent only

Avoid letting red and green dominate simultaneously in large equal areas; that creates the wrong seasonal association.

## Page Area Design

### Navbar

The navbar should use a light aqua glass shell with subtle wave or palm framing near the edges. The title and subtitle must remain unobstructed and easy to read.

### Tabs

Tabs should become sea-salt jelly pills:

- inactive tabs lean aqua/white
- active tab uses watermelon/coral emphasis
- borders stay soft and bright rather than dark

### Message Area

The message area should preserve the existing translucent theme strategy while changing the palette:

- assistant bubbles lean sea-glass blue-white
- user bubbles may carry a slightly warmer juice-tinted surface
- nested cards remain more transparent and cooler than the outer layer

### Composer

The composer should resemble a chilled transparent tray placed near the shore:

- input shell remains glassy and soft
- the send button becomes the strongest themed control
- the send button should feel like a sparkling watermelon soda button rather than a generic theme circle

## Motion Contract

Motion must stay low-frequency and supportive:

- slow wave drift
- light palm sway
- subtle glint or shimmer on selected accents

No decorative high-frequency flashing. No constant bouncing. No matrix-like textual effects.

The existing `idle | ramp | streaming | settle` phases can still tune background intensity, but only through atmosphere strength and not through content mutation.

## SVG Asset Strategy

Strong summer elements should be implemented primarily with a small set of page-local SVG shapes:

- watermelon slice
- palm leaf or frond
- coconut
- wave layers / foam accents

SVG is preferred because it keeps style, opacity, scale, and layering consistent across H5 and app webviews. The goal is a coherent illustrated system, not mixed-source decorative fragments.

## Architecture Approach

Follow the existing theme architecture instead of inventing a separate rendering path:

- extend the detail-theme enum with a summer id
- add a dedicated page-level atmosphere component for the summer theme
- add page-level summer selectors in `index.scss`
- add `MessageBubble.vue` summer theme styling in the same pattern as `sweet`
- keep `ConversationDetailInteractivePane.vue`, `ConversationDetailReadonlyTimeline.vue`, and `ConversationDetailBody.vue` on the same prop-driven theme flow they already use

No protocol or store logic should become aware of the summer theme beyond the existing detail-theme presentation path.

## Data Flow And Compatibility

No new data flow is introduced.

The page continues to:

1. restore `detailTheme`
2. derive `cyberEffectPhase`
3. pass theme/phase props to child surfaces
4. let each surface map them into presentation only

Background-image precedence should match `matrix` and `sweet`: when the summer theme is active, the custom background image is visually hidden but not deleted.

## Failure And Degrade Behavior

If a decorative layer is too visually strong or expensive:

- reduce decorative density first
- reduce motion second
- preserve readable conversation content at all costs

If some SVG or atmospheric layer fails on a platform, the page should degrade to the summer palette and glass surfaces rather than collapsing layout or blocking interaction.

## Testing

Required source-contract coverage should include:

- detail theme enum and menu actions include the new summer theme
- the detail shell renders the summer atmosphere component when selected
- page stylesheet exposes a dedicated `summer` branch for navbar, tabs, composer, and panel chrome
- `MessageBubble.vue` exposes a summer theme branch without affecting `matrix` or `sweet`
- existing theme tests continue to pass after the new theme is added

Manual verification should explicitly cover:

- summer theme entry from the detail more-menu
- switching between `default`, `matrix`, `sweet`, and `summer`
- long and short conversation content under the summer background
- readability of `thinking`, `tool`, and `plan` cards
- mobile top navbar and bottom composer readability over strong decorations
- performance on lower-end devices with reduced summer motion if necessary

## Native iOS And Android Guidance

Native clients should mirror the same contract:

- keep the summer theme in the same detail-theme enum family as `default`, `matrix`, and `sweet`
- render strong summer elements as page-level decoration rather than message content
- prefer vector shapes or programmatic drawing for waves, watermelon slices, palm leaves, and coconuts
- keep message and input surfaces translucent but readable
- use summer phases only to scale atmosphere intensity, not to transform message text

## Compatibility

This revision is a visual expansion of the existing detail-theme system:

- existing themes remain available
- existing storage keeps working with a new theme id added
- no protocol, persistence, or runtime schema changes are required

The theme should ship as another first-class detail-page skin inside the current architecture.
