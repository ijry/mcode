# MCode P63 Conversation Detail Sweet Theme Enhancement Design

## Goal

The new conversation-detail theme system already supports `default`, `matrix`, and `sweet`. The current `sweet` theme is directionally correct but still reads like a standard pink glass UI.

This revision upgrades `sweet` into a clearer "奶油果冻" presentation:

- message surfaces become more transparent so the page atmosphere can show through
- the background becomes richer and cuter through layered bubbles and highlights
- foreground controls adopt the same soft jelly language instead of staying close to the default theme

The result should feel cute, soft, and intentional without hurting readability or mobile performance.

## Current Context

Existing relevant boundaries:

- `mcode-app/src/pages/conversation-detail/index.vue` already owns detail-theme selection and passes `detailTheme` plus `cyberEffectPhase`
- `mcode-app/src/pages/conversation-detail/ConversationDetailSweetBubbles.vue` already renders the sweet-theme atmosphere layer
- `mcode-app/src/pages/conversation-detail/index.scss` already restyles page chrome for `.page--sweet`
- `mcode-app/src/components/MessageBubble.vue` already has `bubble-wrap--theme-sweet`

Important constraints already established in the codebase:

- theme state continues using `mcode_detail_theme_v1`
- `sweet` remains a visual-only detail-page theme
- no ACP, realtime, SQLite, route, or runtime-store changes are allowed
- the theme must coexist with the current `default` and `matrix` implementations without regressions

## Non-Goals

- Do not add new theme values or new persistence keys.
- Do not add `matrix`-style text decode or high-frequency glitch effects to `sweet`.
- Do not convert the theme into a sticker-heavy or childlike layout with large hearts or dense icons.
- Do not introduce canvas rendering, protocol flags, or per-conversation theme overrides.

## Selected Approach

Keep the current `sweet` theme architecture and strengthen only the presentation layer:

- enrich `ConversationDetailSweetBubbles.vue` from a single bubble field into a layered decorative atmosphere
- lower the opacity of sweet-theme message surfaces and nested cards so the background can read through
- restyle tabs, navbar, panels, composer, and send button into a shared jelly-pill design language
- preserve the existing `detailTheme` and `cyberEffectPhase` flow so runtime logic does not change

This keeps the work local to the detail page, minimizes risk, and builds on the already shipped theme system.

## Visual Contract

### 1. Page base

The page should look like a soft dessert surface rather than a pink tint:

- cream-pink to berry-milk gradient base
- soft radial glow patches near corners
- no hard dark borders or sharp rectangular blocks

The palette should stay pastel and creamy, not neon pink.

### 2. Background atmosphere

The sweet atmosphere should become richer through layered but low-intensity decoration:

- large slow jelly bubbles as the primary decorative layer
- smaller lighter bubbles as secondary depth
- a sparse set of tiny star-like glints or candy highlights as accent only

The decorative system should feel fuller than the current version, but every element remains low-opacity and low-frequency. The user should notice a cute environment, not a noisy animated wallpaper.

### 3. Message surfaces

Message readability stays primary, but the message area should feel lighter:

- assistant and user bubbles become more transparent than the current sweet theme
- nested `thinking`, `tool`, `plan`, and similar cards become even more transparent than the outer bubble
- text can gain a slight transparency reduction to avoid looking too heavy against soft glass, but body copy must remain easy to read on mobile

This means the message zone should no longer look like dense white cards sitting on top of a cute background.

### 4. Foreground chrome

Foreground controls should match the same jelly language:

- tabs become thicker, softer pills with subtle highlight and light pink edge treatment
- navbar and dropdown/panel shells keep glass depth but lose any overly rigid frame feeling
- the composer becomes a unified jelly tray rather than several unrelated blocks
- the send button becomes the highest-emphasis "soft candy" control with brighter highlight and a gentle pressed feel

## Component Design

### `ConversationDetailSweetBubbles.vue`

Upgrade the atmosphere renderer to support multiple decorative groups while keeping the component page-local and presentational:

- large bubbles with stronger inner highlight and soft edge thickness
- small bubbles with lighter blur and lower alpha
- tiny glints/highlights for cute sparkle punctuation
- phase-aware opacity and speed tuning still driven by the existing `CyberEffectPhase`

The animation model stays slow and linear. No fast shimmer loops or aggressive parallax.

### `index.scss`

Strengthen `.page--sweet` styling for:

- page gradient and glow overlays
- tabs and active-tab emphasis
- navbar shell
- composer shell, input shell, tool rows, drawers, and panels
- send button highlight and jelly depth

These styles should make the page feel cohesive even when there is little message content on screen.

### `MessageBubble.vue`

Refine `bubble-wrap--theme-sweet` so bubble surfaces feel like translucent jelly cards instead of normal cards with a pink tint:

- lower bubble background alpha
- soften borders and shadows
- reduce the visual weight of nested block backgrounds
- keep text and markdown readable with controlled contrast

The change is presentational only. Message rendering logic, parts ordering, and runtime behavior stay unchanged.

## Data Flow And Architecture

No new data flow is introduced.

The page continues to:

1. restore `detailTheme`
2. derive `cyberEffectPhase`
3. pass theme/phase props to child detail surfaces
4. let each child surface map those props into visual styling only

The sweet-theme enhancement must continue to live entirely inside the existing page/theme presentation path.

## Failure And Degrade Behavior

This is a visual enhancement, so failure handling is simple:

- if some decorative layer does not render on a platform, the page should fall back to the simpler sweet background without breaking layout
- if a specific translucent treatment hurts readability, text contrast wins over atmosphere richness
- if mobile performance drops, reduce decorative density or motion before reducing core page usability

No user data, protocol state, or interaction flow should depend on these visuals.

## Testing

Update or add tests to cover the source contract where practical:

- sweet-theme background component exposes richer layered atmosphere data instead of a single flat look
- page sweet-theme styles include the strengthened chrome classes for tabs, navbar, composer, and send button
- `MessageBubble.vue` sweet-theme styling keeps the sweet wrapper and applies the lighter translucent surface contract
- existing detail-theme tests continue to pass

Manual verification should explicitly cover:

- sweet theme with short conversation content
- sweet theme with long scrolling conversation content
- assistant/user bubbles plus thinking/tool/plan nested blocks
- low-content screens where chrome and background dominate the page
- mobile readability around the composer and send button
- switching between `default`, `matrix`, and `sweet`

## Compatibility

The enhancement keeps all existing theme behavior intact:

- `default` remains unchanged
- `matrix` remains unchanged
- `sweet` keeps using the existing theme enum and storage key
- no backend or runtime contracts change

This revision is safe to ship as a visual refinement of an already introduced theme option.
