# PC Tab Sync Write Gate

## Scope

This change makes the conversation-detail multitask preference authoritative
for every mobile-client write to remote Codeg `opened_tabs`. It prevents opening
a detail page, creating a conversation, sending a bulk prompt, or closing a tab
from changing PC tabs when the preference is `off` or `mobile`.

## Architecture And Data Flow

All remote opened-tab mutations pass through
`pcTabSyncService`: `ensureConversationTab`,
`ensureConversationTabForPrompt`, or `closeConversationTab`. Those public
functions now read `mcode_detail_tab_multitask_mode` through
`readDetailTabMultitaskMode()` before reading or writing the remote snapshot.

Only the `pc` value permits `list_opened_tabs` or `save_opened_tabs`. `off` and
`mobile` return `null` before using the gateway or the opened-tabs cache. This
central gate covers callers in the conversation overview, project sessions,
detail shell, conversation creation, prompt-time ensure-tab, bulk sending, and
tab closing without duplicating preference checks at every call site.

## UI Behavior

With sync disabled, opening a conversation still navigates to the same detail
page and loads the same messages, but it does not add or activate a desktop
tab. With local-mobile tabs selected, local tab state continues to use
`mobileDetailTabs`; remote PC tabs remain untouched. The existing `pc` behavior
is unchanged.

## Compatibility

No ACP protocol, Codeg API, storage key, or database schema changes are made.
The default mode remains `off`; existing users who explicitly selected `pc`
retain remote tab synchronization. A service-level test verifies that both
`off` and `mobile` make zero gateway and cache calls.

## Native iOS/Android Replication Guidance

Native clients should apply this gate at the common remote opened-tabs service,
not only in individual screens. Treat the user preference as a precondition for
every remote tab read or write. In `off` and local-mobile modes, short-circuit
before creating network requests or updating remote-tab caches; preserve normal
detail navigation and local-mobile tab behavior.
