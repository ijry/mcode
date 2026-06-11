# Detail Status Unification

## Scope

The mobile `mcode-app` conversation detail page now resolves visible runtime
status through one centralized status-state layer instead of multiple unrelated
template branches.

## Architecture And Data Flow

The detail page derives a single `DetailStatusState` from:

- shared realtime bridge health
- runtime error text
- API retry state
- runtime activity state
- long-wait timing
- short-lived recovery acknowledgement

`DetailStatusState` carries:

- `code`
- `severity`
- `text`
- `icon`
- `loading`
- optional action metadata

The top banner, navbar status wording, and composer retry/error dedupe now all
read from this single resolved state instead of each re-implementing priority
rules.

## UI Behavior

Status priority remains unchanged, but the display logic is now consistent:

1. bridge recovered
2. bridge reconnecting
3. bridge error
4. runtime error
5. API retry
6. waiting permission
7. waiting question
8. connecting
9. long wait
10. thinking
11. running tool
12. idle

When a status is promoted to the top banner, lower-level duplicate retry/error
copy in the composer area is suppressed by checking the resolved status code.

## Compatibility

This refactor does not change ACP transport or payloads. It only centralizes
client-side presentation logic so future detail status additions have one
integration point.

## Native iOS/Android Replication Guidance

Native clients should implement the same pattern: build one resolved detail
status object first, then let navbar badges, top banners, and inline feedback
read from that object. Do not duplicate priority logic across multiple UI
surfaces.
