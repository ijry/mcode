# P48 Conversation Detail Tool Call Summary Pills

P48 updates the mobile `mcode-app` conversation detail timeline to render grouped tool and command calls as compact neutral summary pills. Failure counts remain red, but the collapsed pill background, primary label, and leading indicator are no longer tinted by status.

## Architecture and Data Flow

`MessageBubble` continues to render `ToolCallGroupBlock` for adjacent tool calls and `ToolCallBlock` for single tool calls. Both components still consume the existing `ToolCall.status` field from ACP-normalized turns:

1. `running` maps to the active/running treatment.
2. `completed` maps to the success treatment.
3. `error` maps to the failed treatment.
4. Missing status remains neutral/pending.

No protocol, persistence, transport, store, or timeline grouping behavior changes.

## UI Behavior

Grouped tool-call summary pills use a very light neutral gray background and have no visible border. This mirrors `codeg-main`'s `bg-muted/60` collapsed tool group trigger; in the default light theme that starts from `--muted: oklch(0.97 0 0)`, so mcode approximates it with a 60% hover/page gray and 40% card background mix. The collapsed summary is content-width and left-aligned, matching the compact command/status pill treatment instead of stretching to the full message width. The leading indicator is a neutral expand/collapse arrow, not a status-colored dot. Failure count is shown as a compact red badge inside the summary.

Assistant message bubbles no longer draw their own border. Expanded tool detail content still uses the available message width so long command inputs and outputs remain readable. Expanded single tool cards keep their existing layout, status dot, status tag, input, output, and error sections. Their border, icon color, status dot, and output/error labels still use the runtime status colors.

## Theme and Compatibility

The implementation uses existing uview runtime theme variables: `--up-primary`, `--up-success`, `--up-error`, `--up-border-color`, `--up-card-bg-color`, `--up-hover-bg-color`, and `--up-bg-color`. It does not introduce `--mcode-*` aliases. The neutral grouped-summary background should remain a translucent/mixed muted gray, not a status color.

This is presentation-only and remains compatible with old conversation records because records without a tool status continue to render as pending/neutral.

## Native iOS/Android Replication

Native clients should mirror the same status mapping from the tool call model:

1. Render grouped command/tool summaries as content-width compact pills, not full-width bars.
2. Use a common light gray background and no border for collapsed grouped summaries.
3. Keep the primary summary text neutral.
4. Use a neutral expand/collapse arrow as the leading indicator.
5. Render the failure count in the error color when failed tool calls exist.
6. Keep expanded tool details full-width within the message bubble.
7. Use native theme tokens equivalent to primary, success, error, card background, and muted page background.
