# Detail Awaiting First Response

## Scope

`mcode-app` conversation detail now distinguishes between a truly idle empty
conversation and a conversation that is already processing but has not emitted
its first visible message yet.

## UI Behavior

The detail page keeps the existing `加载会话中...` state only for initial detail
fetch while runtime data is still unresolved.

If the conversation has no rendered messages but the runtime is already in an
active wait state such as `connecting`, `thinking`, `running_tool`,
`waiting_permission`, or `waiting_question`, the page now shows a dedicated
"awaiting response" card instead of the generic empty placeholder.

The waiting card includes:

1. A small status badge that reflects the current runtime phase.
2. A headline and helper copy that explain the task has already been sent.
3. A staged assistant bubble skeleton with fixed three-dot typing animation.
4. A long-wait footnote after extended processing so the user does not assume
   the session is broken.

The generic `开始新的对话吧` empty state is now reserved for conversations that
are genuinely idle and have no active processing state.

## Data Flow

No transport or backend payload changes are required. The page derives the
waiting card entirely from existing local detail state:

- rendered message count
- detail `loading`
- runtime status
- pending permission/question presence
- long-wait elapsed timer already maintained by the page

This keeps the behavior consistent for both "newly created then navigated into"
and "later temporarily empty but still processing" scenarios.

## Compatibility

The change is presentation-only. It does not modify persisted conversation
records, runtime snapshots, or ACP protocol messages.

Because the waiting card is driven from existing runtime status values, older
servers and locally restored sessions continue to work without migration.

## Native Replication Guidance

iOS and Android clients should implement the same state split:

- show a fetch-loading state only while the detail record itself is unresolved
- show an awaiting-response card whenever no visible messages exist but the
  runtime is still active
- keep a persistent typing indicator visible even before the first assistant
  message is materialized

The waiting card should be replaced immediately once the first visible message
arrives. Long waits should add secondary reassurance text after roughly 15 to
20 seconds.
