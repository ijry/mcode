# MCode Conversation Detail Multi-Tab Redesign Design

## Goal

Redesign `mcode-app` conversation detail to match the new Stitch mobile detail concept while turning the page into a real multi-session tab host.

The page must:

- render real interactive conversation tabs with `up-tabs`
- keep those tabs aligned with remote PC opened tabs in real time
- use `swiper` for left/right gesture switching between conversation bodies
- lazily mount only the current tab body and its adjacent bodies
- preserve existing conversation runtime authority, local-first detail hydration, opened-tab sync, and multi-client coordination behavior

## Current Context

`mcode-app/src/pages/conversation-detail/index.vue` is the active conversation detail page. It already owns:

- route parsing and connection resolution
- local-first detail hydration
- realtime runtime binding
- scroll restore
- composer state
- permission/question UI
- agent config UI
- remote opened-tab coordination before prompt send

Recent work already established important constraints:

- conversation detail is local-first and SQLite-backed
- realtime runtime state remains authoritative over stale remote snapshots
- remote PC opened tabs are cached and synchronized through `openedTabsRealtimeCache`
- mobile writes to remote opened tabs only through `pcTabSyncService`
- routing should prefer short local `connectionId` references

This redesign must build on those rules instead of replacing them with a page-local tab system.

## Non-Goals

- Do not change ACP, realtime, SQLite, opened-tab sync, or hot runtime protocols.
- Do not replace `up-tabs` with a custom tab widget.
- Do not render every tab body eagerly.
- Do not introduce a second independent mobile-only tab truth source.
- Do not redesign the desktop app or the remote opened-tab protocol.
- Do not remove the existing conversation-detail runtime/persistence behavior.

## Recommended Approach

Use remote opened tabs as the only tab truth source and split the page into a shell/body model.

The page becomes a multi-session detail shell:

1. `up-tabs` renders the current opened-tab snapshot for the active remote instance.
2. `swiper` renders one conversation detail body per tab.
3. Each tab body owns isolated UI state through a parent-scoped per-tab state record.
4. The shell listens to `tabs://changed` for tab membership/order/activity updates and to `conversation://changed` for conversation summary/title refresh.

This preserves existing remote coordination while making the UI match the new design language.

## Visual Direction

The Stitch concept establishes a clear visual system:

- light surface-first palette
- atmospheric blurred background blobs
- glass-like translucent containers
- dual fixed top regions
- centered narrow message canvas
- floating bottom composer dock
- rounded message bubbles and slim status rails

Within `mcode-app`, these visuals should be adapted to the current theme system:

- prefer `--up-page-bg-color`, `--up-card-bg-color`, `--up-main-color`, `--up-content-color`, `--up-tips-color`, `--up-border-color`, and `--up-primary`
- do not add new `--mcode-*` aliases for the redesign colors
- keep dark-mode compatibility by mapping the glass and contrast system to existing `uview-plus` runtime theme variables

The result should feel close to the Stitch frame without copying Tailwind-only implementation details literally.

## Page Architecture

### 1. Detail shell

The top-level conversation detail page remains responsible for:

- route parsing
- `connectionId` resolution
- active remote instance resolution
- opened-tab snapshot subscription and mutation
- current tab selection
- `swiper` index synchronization
- lazy-mount window calculation
- high-level page measurements for fixed header/tab/composer offsets

### 2. Per-tab state owner

The shell must maintain isolated UI state per tab session. Each state slice should at minimum hold:

- conversation identity (`conversationId`, `folderId`, `agentType`)
- detail loading/error state
- composer draft text
- queued attachments/drafts
- pending permission UI state
- pending ask-question UI state
- plan drawer visibility
- scroll restore metadata
- agent config panel expansion state
- any body-local loading flags

This state must not leak between tabs.

### 3. Reusable conversation detail body

Single-session content rendering should move behind a focused body boundary. The body renders:

- toolbar/status content that belongs to one conversation
- message list
- pending permission/question cards
- composer and tool area
- body-local overlays and indicators

The body must not own cross-tab orchestration.

## Tabs Data Model

Tabs must come from the remote opened-tab snapshot for the current instance.

Each rendered mobile tab model should derive from the opened-tab item plus locally known conversation metadata:

- remote tab id
- `conversation_id`
- `folder_id`
- `agent_type`
- remote `is_active`
- local display title
- local hot/runtime flags when available

If the route-opened conversation is not currently present in the opened-tab snapshot, the page should first ensure it exists through the existing `pcTabSyncService` path before presenting the full tab shell.

## Synchronization Rules

### Opened tabs

`openedTabsRealtimeCache` remains the source for membership/order/activity.

The page should:

1. read the latest snapshot for the current instance
2. subscribe to `tabs://changed`
3. re-derive the mobile tab list whenever the snapshot changes
4. keep the current visual selection stable when possible after remote updates

### Conversation summary/title updates

The page should continue listening to `conversation://changed` so tab labels and related session metadata can refresh when a conversation title/status changes.

`conversation://changed` is not the membership truth for tabs. It is only a metadata refresh source layered on top of opened tabs.

## Interaction Model

### Tab selection

- Tapping an `up-tabs` item switches the active `swiper` page.
- Swiping horizontally changes the selected `up-tabs` item.
- The selected tab is the active mobile session surface.

### Lazy mount window

Only these bodies should be mounted:

- current tab
- previous adjacent tab if present
- next adjacent tab if present

All other tabs keep only lightweight metadata until they move into the render window.

### Close tab

The close affordance is part of the real tab behavior and must write back to remote opened tabs.

When closing a tab:

1. build the next opened-tab snapshot without that tab
2. save it through the existing remote tab write path
3. wait for or locally apply the resulting snapshot update

When closing the active tab:

- switch to the immediate right tab if one exists
- otherwise switch to the immediate left tab
- if no tabs remain, fall back to leaving the detail page or showing the empty state, depending on existing route expectations

### Activation semantics

Existing mobile behavior should stay conservative and must not unexpectedly steal PC focus unless the current write path already allows it. This redesign should preserve the current opened-tab activation contract rather than broaden it.

## Swiper Layout Rules

The content region becomes a horizontal session canvas, but each body still renders a vertical conversation timeline.

Rules:

- `swiper` owns horizontal page switching only
- each `swiper-item` contains one conversation detail body
- vertical scrolling and message anchoring remain body-local
- page-level fixed offsets must account for navbar height, tabs strip height, and floating bottom dock height

The redesign must not reintroduce old nested scroll issues that prior conversation-detail work already addressed.

## UI Structure

### Top region

The page should have two fixed layers:

1. top app bar
   - back action
   - connection/conversation identity
   - lightweight status/action affordances
2. tabs strip
   - `up-tabs`
   - horizontally scrollable
   - glass/capsule visual treatment
   - close affordance per tab

### Main region

- centered narrow conversation canvas
- glass-like system notices and status chips
- rounded message bubbles
- lighter code/tool/status surfaces

### Bottom region

- floating glass composer dock
- slim real-time session status row above or within the dock
- primary send action
- tool buttons below the input row

Existing permission/question surfaces remain functionally intact but visually migrate into the new glass-card system.

## Routing And Entry

The page continues to accept the current route identity for the initially opened conversation and should continue following P43 short-route expectations:

- prefer `connectionId`
- keep old encoded connection payloads only as fallback during compatibility windows

Initial page entry should select the route conversation if it exists in the opened tabs after synchronization. If multiple tabs exist, the route conversation should become the initially visible `swiper` page.

## Error Handling

This redesign adds new UI coordination but should keep error ownership at the page shell:

- tab snapshot load failure should degrade to a single-session detail fallback when possible
- tab close/save failures should not corrupt the current local visible session
- malformed opened-tab items should be filtered defensively
- stale or out-of-order `tabs://changed` payloads should continue to be ignored by version rules

## Testing

Required coverage should include:

- opened-tab snapshot maps correctly to rendered mobile tabs
- route-opened conversation is ensured into opened tabs when missing
- `up-tabs` selection updates `swiper`
- `swiper` change updates selected tab
- only current and adjacent tab bodies mount
- closing a non-active tab preserves the current visible tab
- closing the active tab switches right first, then left
- `tabs://changed` reorders/adds/removes tabs without leaking per-tab state
- `conversation://changed` refreshes tab labels/metadata without changing membership rules
- existing runtime/prompt/permission/question behavior still works inside one tab body

## Compatibility

This redesign is UI-architecture heavy but protocol-light:

- no ACP contract changes
- no SQLite schema changes
- no realtime protocol changes
- no opened-tab protocol changes
- no route contract expansion beyond current conversation-detail expectations

The main compatibility requirement is to preserve all existing conversation-detail correctness guarantees while changing the visible shell and adding multi-tab orchestration.

## Native iOS/Android Guidance

Native clients should follow the same model:

- use remote opened tabs as the only tab membership/order truth
- keep one isolated detail-state slice per visible session tab
- connect tab strip selection and horizontal pager position bidirectionally
- lazily mount only current and adjacent session pages
- treat conversation summary updates separately from opened-tab membership updates
- closing an active tab should move right first, then left
- keep runtime, storage, and network side effects in the screen/controller layer, not inside the single-session detail body view

## Rollout

Implement in focused stages:

1. extract or introduce the single-session detail body boundary
2. add opened-tab-derived tab shell state
3. add `up-tabs` and `swiper` synchronization
4. add lazy-mount window behavior
5. add close-tab remote sync behavior
6. apply the new visual system to navbar, tabs strip, canvas, and composer dock
7. verify existing runtime/detail correctness under multi-tab switching
