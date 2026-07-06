# P65 Conversation List Live Stream Preview

## Architecture

The feature is controlled by a local mobile preference, `mcode_conversation_list_live_stream_enabled`, defaulting to `false`. When enabled, the conversation list reuses the existing per-instance realtime bridge and opens per-conversation preview subscriptions through the existing runtime `connect` flow.

## Data Flow

The list page derives eligible cards from loaded conversation groups, resolves display status, and selects at most 5 in-progress conversations. For each selected conversation without an existing managed runtime connection, the list calls `runtime.connect(conversationId, agentType, undefined, undefined, lastAppliedSeq, instanceKey)`. Realtime events update `runtime.sessions[conversationId].liveMessage`, and the card renders a single plain-text preview line from that runtime state.

## UI Behavior

The Profile page exposes "会话列表实时消息流" under "会话设置". It is off by default. The setting row renders the icon/title as a single non-wrapping title row, with the explanatory copy below it and the switch pinned to the right so narrow screens do not squeeze the title into vertical text. When off, the list creates no preview-owned per-conversation subscriptions. When on, in-progress cards are sorted ahead of idle/history cards, and each eligible card may show one preview strip such as generated text, thinking text, running tool name, waiting confirmation, or waiting answer. Long preview text is rendered through a local marquee component that measures overflow on the client and falls back to a single-line ellipsis when scrolling is not needed. The marquee's static and scrolling render paths must keep the same explicit typography inheritance so switching into scrolling mode does not fall back to platform default text size.

## Compatibility

No ACP protocol or backend route changes are required. Existing global list events remain unchanged. Detail pages remain authoritative for full conversation rendering. The list page tracks preview-owned sessions and releases only those sessions when the list is hidden, unloaded, disabled, or no longer eligible.

## Native iOS/Android Replication

Native clients should store the same default-off local preference, reuse the shared realtime bridge, attach at most 5 in-progress visible/listed conversations while the list screen is active, render one plain-text preview line, and release only preview-owned attachments when leaving the list. Detail-screen attachments must not be cleared by list cleanup. If native clients switch between ellipsis and marquee rendering, both states should use the same font size, weight, line height, and color.
