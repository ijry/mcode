# Conversation Detail Toolbar Restore

The mobile `mcode-app` conversation detail page again uses a dedicated toolbar directly under the native navbar. Runtime status is no longer rendered inside the navbar subtitle area; the navbar returns to title-only content and the toolbar owns status plus the primary plan entry.

## Architecture and Data Flow

The detail page keeps the same runtime-state inputs as before. `runtimeStatusLabel` and `runtimeStatusClass` are still computed from the existing local runtime/session state. This change only moves where those derived values render:

1. `up-navbar` center slot shows conversation identity only.
2. `detail-toolbar` renders the status dot and status text.
3. When plan tasks exist, the toolbar primary action opens the existing plan drawer and shows progress as `completed/total`.
4. The existing `refreshConversation()` action remains available as a smaller secondary icon action inside the toolbar.

No protocol, persistence, ACP transport, or cache behavior changes.

## UI Behavior

Users now see:

1. Native navbar: back button and conversation title.
2. Top toolbar below navbar: current runtime status, primary plan entry, secondary refresh icon, and rightmost stop action when the session can be interrupted.
3. The previous floating plan button is removed so the plan drawer has a single consistent entry point in the toolbar.
4. The stop action no longer appears in the bottom composer tool row; interruption controls now live with the other conversation-level actions.
5. Existing detail status banner continues to render below the toolbar when richer runtime/error guidance is needed.
6. The refresh icon keeps normal single-tap reload behavior, but three rapid taps within a short window open a hidden "clear current conversation cache and reload" confirmation flow for recovery.

This restores the earlier visual hierarchy where transient status belongs to the page chrome, not the native navbar title area.

## Compatibility

This is presentation-only. Existing routes, stores, computed status values, and refresh semantics are unchanged. No server or database migration is required.

## Native iOS/Android Replication

Replicate the same split structure in native clients:

1. Keep the OS/navigation bar title focused on conversation identity.
2. Render a separate in-page toolbar immediately below it.
3. Use the toolbar's main action slot for plan/task progress when such tasks exist.
4. Keep manual refresh and stop-session as smaller secondary actions on the right edge of the toolbar.
5. Make the status text region flexible so action buttons cannot collapse the runtime label to zero width.
6. Keep richer warning/error banners as a separate row below the toolbar rather than overloading the navigation bar subtitle.
7. For recovery UX, triple-tap on refresh should clear only the active conversation's local view cache, in-memory runtime session, and persisted runtime snapshot before reloading. Do not clear global cache for other conversations.
