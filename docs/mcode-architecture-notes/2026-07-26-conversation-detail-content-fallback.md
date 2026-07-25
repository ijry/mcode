# Conversation Detail Content Fallback

## Scope

This change prevents the conversation-detail middle area from becoming blank
when the detail shell has not mounted, the first conversation load is pending,
or the load fails. It also fixes the `off` multitask mode so a route with
`folderId=0` still creates its required single detail page.

## Architecture And Data Flow

`detailTabsPresentation.buildDetailFallbackTab()` is the single-tab source for
the detail route. It requires only a positive `conversationId`; `folderId` is
optional and is preserved as `0`. `initializeDetailTabsShell()` now checks the
multitask mode immediately after validating the conversation id. In `off`
mode it initializes the local single-tab shell before resolving an instance or
requiring a folder id. PC and mobile-local multitask modes retain their
instance-backed initialization paths.

The parent detail page owns the load attempt state: active load, a
conversation-scoped error message, and a shell fallback when no active pane is
mounted. It passes the active state to `ConversationDetailInteractivePane`.
The pane derives its presentation through
`resolveDetailContentFallbackPresentation()` with this precedence: rendered
messages and active runtime work first, then initial loading, load failure,
and finally a confirmed empty conversation. A retry emits to the parent and
runs the normal shell initialization plus `loadConversation()` path; it does
not clear cache or invoke the separate hard-refresh gesture.

## UI Behavior

- A slow initial request shows `正在加载会话内容...`.
- A failed request shows the error text and a `重新加载` action.
- A new, successfully loaded conversation with no turns states that it has no
  messages yet.
- If the shell itself has no mounted active page, it shows the same loading or
  failure state; an otherwise unexplained shell issue shows a reload action.
- The existing upper-left navigation remains the only back control.

## Compatibility

No ACP protocol, API payload, storage key, or database schema changes are
required. Existing PC synchronization remains gated by the multitask setting.
`folderId=0` is accepted only for rendering the local detail fallback tab; any
feature that needs a real folder still receives the original route value.

## Native iOS/Android Replication Guidance

Native clients should construct the non-multitask detail screen from a valid
conversation id even if the folder is absent or represented by zero. Keep load
state scoped to the active conversation so late requests cannot overwrite a
newly selected screen. Render a persistent content state in the message area:
loading, error with a normal reload operation, or explicit empty conversation.
Do not rely only on transient toast notifications, and do not add a redundant
back button when standard navigation is already visible.
