# MCode P63 Conversation Detail Cyber Mode Design

## Goal

P63 adds an experimental `cyber mode` to `mcode-app` conversation detail.

When enabled, conversation detail should switch into a Matrix-like terminal presentation:

- full-page black and green terminal styling
- weak idle binary rain across the page
- stronger realtime binary rain while the assistant is streaming
- the latest assistant live message appears to decode from falling `0/1` characters into the real streaming text

This is a visual-only experiment. It must not change ACP, realtime, SQLite, routing, or conversation runtime authority.

## Current Context

`mcode-app/src/pages/conversation-detail/index.vue` already owns:

- the page-level atmosphere layer (`detail-atmosphere`)
- the top navbar and more-menu entry point
- local-first detail hydration
- realtime runtime binding
- live message rendering
- per-tab shell coordination for multi-session detail
- page-level storage-backed background-image customization

Relevant existing boundaries already exist:

- `ConversationDetailInteractivePane.vue` owns the active tab's interactive timeline and composer
- `ConversationDetailReadonlyTimeline.vue` renders passive conversation content for non-active contexts
- `MessageBubble.vue` renders message parts and already knows whether a message is `streaming`
- conversation detail page styles already live in `mcode-app/src/pages/conversation-detail/index.scss`

Recent conversation-detail work also establishes important constraints:

- opened tabs remain the only multi-tab membership truth
- conversation runtime stays authoritative over stale snapshots
- message rendering must remain local-first and fast to restore
- page visual work should continue using `uview-plus` runtime `--up-*` theme variables rather than introducing `--mcode-*` color aliases

## Non-Goals

- Do not change ACP payloads, websocket events, or runtime store schemas.
- Do not add a server-controlled cyber-mode flag.
- Do not make cyber mode per conversation or per tab in this iteration.
- Do not replace the current detail page structure with a separate cyber-only page.
- Do not introduce a Canvas-based renderer in the first version.
- Do not animate historical messages into decoded text one-by-one.

## Selected Approach

Implement cyber mode as a page-local visual layer enhancement with a single global storage-backed toggle.

The feature is controlled from the conversation-detail more menu and applies to all conversation-detail tabs and future detail entries until disabled.

The first version uses:

- page-level class switches
- CSS-driven binary rain and scanning effects
- deterministic helper functions for effect state and text decoding
- optional message-bubble overlays for the currently streaming assistant message

This keeps the experiment inside conversation detail, reuses existing rendering flow, and avoids protocol or runtime risks.

## Toggle And Persistence

### Entry point

The toggle lives in the conversation-detail more menu:

- when disabled: `炫酷模式`
- when enabled: `关闭炫酷模式`

This keeps the experiment close to the affected page without adding new settings surfaces in P63.

### Persistence scope

The toggle is truly global for `mcode-app` conversation detail. It is not keyed by:

- conversation id
- folder id
- tab id
- connection id
- instance key

Recommended storage key:

- `mcode_detail_cyber_mode_v1`

The key stores a boolean snapshot only. Future versions can migrate the key if effect tuning needs a breaking reset.

## Page Architecture

### 1. Page shell ownership

`mcode-app/src/pages/conversation-detail/index.vue` remains the owner of:

- reading and writing the global cyber-mode storage key
- resolving the more-menu item label
- applying page-level cyber-mode classes
- deciding the current cyber effect phase from runtime state
- passing cyber props into the active interactive pane and readonly timeline surfaces

Cyber mode must not create a second visual-orchestration entry outside the page shell.

### 2. Pure helper module

Add a new page-local helper:

- `mcode-app/src/pages/conversation-detail/detailCyberMode.ts`

Responsibilities:

- storage key constants
- menu-label helpers
- effect-phase derivation
- decode-progress derivation
- binary character generation helpers
- low-power or reduced-effect downgrade rules

This module must stay pure. It should not call gateways, stores, repositories, or `uni` networking APIs.

### 3. Active-pane rendering

`ConversationDetailInteractivePane.vue` receives cyber-mode props and applies them to:

- message canvas classes
- composer chrome
- tool-row and panel chrome
- active streaming message overlay behavior

Only the active pane should run the stronger realtime decode effect.

### 4. Passive timeline rendering

`ConversationDetailReadonlyTimeline.vue` may adopt:

- terminal palette
- weak binary rain ambiance
- green-accent loading/generating visuals

It must not run the expensive decode overlay for off-focus or readonly content.

### 5. Message-level decode overlay

`MessageBubble.vue` receives optional cyber-render props.

The overlay only activates when all conditions hold:

- cyber mode is enabled
- message role is `assistant`
- message status is `streaming`
- the rendered part is text-like content
- the message belongs to the active conversation pane

All other message parts keep normal rendering behavior plus the theme restyle.

## Visual Model

### Base look

When cyber mode is enabled, the entire conversation detail page shifts into a terminal presentation:

- dark page base
- green signal color for active highlights
- darker tab and composer shells
- subtle scanline/noise treatment
- weak glowing borders and text accents

The visual system should continue deriving backgrounds, borders, and text hierarchy from `--up-*` runtime theme variables, then tint them toward the cyber palette at this call site only.

### Idle state

Idle state should feel alive but not noisy:

- low-density binary rain
- low contrast and low opacity
- slow vertical movement
- no message decoding overlay

This is the default when no reply is actively streaming.

### Ramp-up state

When the session transitions into active work such as `thinking`, `running_tool`, or other pre-stream response states:

- binary density and glow increase slightly
- the latest-response area receives stronger localized visual emphasis
- the page communicates that output is about to materialize

### Streaming state

When a live assistant message exists:

- weak binary rain continues page-wide
- a focused binary overlay appears around the latest streaming assistant message
- falling random glyphs gradually resolve into the actual live message text
- already-decoded leading text becomes stable
- the undecoded tail continues flickering until more live content arrives

This effect must track the real `liveMessage` growth without changing the underlying message data.

### Settle state

When the assistant finishes:

- the decode overlay fades out quickly
- the final message remains as a normal readable assistant bubble
- the page returns to weak idle ambiance instead of strong animation

## Decode Behavior

The decode effect is a presentation layer over the real streaming assistant text.

Recommended behavior:

1. Read the current assistant streaming text from the normal message content path.
2. Compute a decode-progress fraction from runtime phase plus elapsed animation ticks.
3. Reveal the real text progressively from left to right.
4. Fill unrevealed positions with falling `0/1`-heavy glyph output.
5. Preserve line breaks and approximate text length so the bubble does not jump excessively.

Important constraints:

- do not replace the source message content
- do not mutate runtime turns or message parts
- do not attempt markdown-perfect partial decoding in the first version
- for complex markdown blocks, fall back to plain text-like decoding or normal text fade-in

## Interaction Rules

- The more-menu toggle is immediate and does not require page reload.
- Switching tabs preserves cyber mode because the flag is global.
- Only the active tab receives the high-frequency decode effect.
- Closing or opening tabs does not change the cyber-mode toggle.
- Returning to conversation detail later restores the toggle from storage automatically.

## Background Image Interaction

Conversation detail already supports shared background-image customization.

In P63:

- cyber mode visually takes precedence over custom background imagery
- enabling cyber mode should hide the background-image atmosphere treatment
- background-image storage must remain untouched
- disabling cyber mode should restore the existing background-image presentation automatically

This avoids destructive interactions between two page-wide atmosphere systems.

## Data Flow

1. User opens conversation detail.
2. Page shell restores the global cyber-mode boolean from storage.
3. Normal local-first detail hydration, runtime restore, opened-tab sync, and realtime binding continue unchanged.
4. Page shell derives a cyber phase from current runtime status and live-message presence.
5. Shell passes `cyberModeEnabled` and phase props into the active pane and message bubbles.
6. If the assistant is streaming, the active message bubble computes decode presentation from the real streaming content.
7. When streaming ends, the overlay fades and the page returns to idle ambiance.

No backend, ACP, SQLite, or runtime persistence flows are altered.

## Performance And Downgrade Strategy

P63 should favor stability over maximal spectacle.

Rules:

- use DOM/CSS effects first
- avoid per-character timers across every message in the timeline
- confine stronger animation to the active streaming assistant message
- keep readonly and off-window tabs on the weak ambiance path only

If the device or platform cannot sustain the full overlay, downgrade to:

- page-level binary rain
- terminal color treatment
- lightweight green scanline on the latest assistant bubble
- plain text fade-in instead of aggressive character-by-character decode

The downgrade rules should be centralized in `detailCyberMode.ts`.

## Testing

Required coverage should include:

- menu label helper returns the correct enabled/disabled wording
- storage snapshot helpers normalize missing or malformed data safely
- cyber phase derivation matches runtime states such as idle, thinking, running-tool, streaming, and settled
- background-image precedence logic hides the image without deleting stored configuration
- conversation-detail shell passes cyber props only where intended
- `MessageBubble.vue` enables decode overlay only for active streaming assistant text
- normal user messages, completed assistant messages, tool calls, permission cards, and question cards remain readable and do not enter decode mode
- readonly timeline adopts cyber styling without running strong decode behavior

Manual verification should explicitly cover:

- toggle on/off from the more menu
- switching between multiple detail tabs
- warm reopen with restored toggle
- assistant streaming with short and long replies
- dark-mode and light-mode baselines under cyber mode
- background-image coexistence

## Compatibility

P63 is intentionally protocol-light:

- no ACP changes
- no realtime event changes
- no runtime-store schema changes
- no SQLite schema changes
- no route contract changes
- no opened-tab sync changes

The feature is an optional visual experiment. Disabling it must return conversation detail to the current behavior with no data migration requirements beyond the single global storage key.

## Native iOS/Android Guidance

Native clients should mirror the same high-level contract:

- store one global boolean for conversation-detail cyber mode
- keep effect orchestration in the screen/controller layer
- treat the effect as a presentation overlay on top of real streaming text
- apply strong decode animation only to the active streaming assistant message
- keep idle ambiance weak and readable
- hide custom detail background imagery while cyber mode is active without deleting user configuration

Native implementations do not need to copy the exact CSS mechanics, but should preserve the same state machine:

- idle
- ramp-up
- streaming decode
- settle

## Rollout

Implement in focused stages:

1. add the global storage-backed toggle and more-menu wiring
2. add pure cyber-mode helpers for state and decode derivation
3. add page-level cyber classes and terminal restyling
4. add weak binary-rain idle ambiance
5. add active-pane streaming decode overlay for assistant text
6. add background-image precedence handling
7. verify performance, readability, and multi-tab behavior
