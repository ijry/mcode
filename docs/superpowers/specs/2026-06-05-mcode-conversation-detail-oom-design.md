# mcode Conversation Detail OOM Design

## Goal

Stop `RangeError: Out of memory` on the conversation detail page by removing unnecessary full-history remote fetch and full-history normalization from non-history-critical paths.

## Root Cause

The detail page still calls `get_folder_conversation` in metadata and catch-up paths. That endpoint returns full `turns`. Even when the caller only needs metadata, the frontend currently still reads and normalizes `detail.turns`, which duplicates large conversation payloads in memory.

## Approved Approach

1. Treat `persistTurns: false` as a hard contract: do not normalize or persist remote turns.
2. When detail already has local turns or hot runtime state, skip remote metadata hydration that requires full remote detail.
3. Remove the post-connect full-detail catch-up fetch from the detail page.
4. Stop using full-detail calibration on `turn_complete` just to refresh summary status.

## Expected Outcome

- Entering a large conversation detail no longer loads the full remote history unless local history is missing and a cold bootstrap is required.
- Metadata-only code paths stay metadata-only in memory usage.
- Existing local-first detail rendering and realtime sync remain intact.
