# Detail Token Usage Backfill

## Scope

`mcode-app` conversation detail now fills the bottom token stats from parsed
conversation detail usage, matching the desktop `codeg` behavior.

## Architecture And Data Flow

There are two separate token-like data sources:

- ACP realtime `usage_update` contains `used` and `size`; this represents live
  context-window occupancy.
- `get_folder_conversation` returns parsed turn/session usage after the
  transcript is available. This usage includes `input_tokens`,
  `output_tokens`, `cache_creation_input_tokens`, and
  `cache_read_input_tokens`.

Mobile detail stats now use the second source. The runtime store exposes
`applyConversationDetailStats(conversationId, detail)`, which prefers
`detail.session_stats.total_usage` and falls back to summing
`detail.turns[].usage`.

Existing detail fetch and reconcile paths call this method:

- initial remote detail load
- metadata hydrate when it has a full detail payload
- local-hydrate remote reconcile
- resume remote reconcile
- runtime `turn_complete` calibration and replay-gap calibration

Realtime `usage_update` no longer mutates split input/output/total stats,
because mapping `used` to input tokens and `0` to output tokens produces
misleading output.

## UI Behavior

The detail stats bar still displays `输入 / 输出 / 总计`. Output becomes non-zero
after the parsed conversation detail includes output usage. Input includes
ordinary input plus cache read/write input tokens so that the compact mobile
bar remains consistent with total usage without adding extra columns.

If the backend or agent transcript does not provide parsed usage, the stats bar
keeps the previous zero/default values rather than guessing output tokens.

## Compatibility

No ACP protocol, database schema, or realtime transport change is required.
Older servers that do not provide `session_stats` or per-turn `usage` continue
to work; they simply cannot show split output usage.

The change is runtime-only for token stats and does not alter persisted
conversation turns.

## Native iOS/Android Replication Guidance

Native clients should not derive input/output token counts from realtime
`usage_update.used`. Treat `used/size` as context-window progress only.

After loading or reconciling `get_folder_conversation`, compute split token
stats from `session_stats.total_usage` when present, otherwise sum assistant
turn `usage` values. Update the visible stats whenever a completed turn triggers
detail calibration. If no parsed usage exists, hide or keep zero split stats
rather than fabricating output tokens.
