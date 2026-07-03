# Agent Default Chinese Output Rule

**Date:** 2026-07-03  
**Scope:** Repository agent collaboration instructions

## Architecture

The root `AGENTS.md` now defines a repository-wide communication rule: agent-facing normal replies and reasoning summaries default to Chinese unless the user explicitly requests another language.

## Behavior

- User-facing progress updates, reasoning summaries, implementation plans, validation results, and final handoff notes default to Chinese.
- Code, commands, logs, protocol fields, API paths, error originals, and third-party library/API names remain in their original language.

## Compatibility

This change only affects agent collaboration instructions. It does not change application runtime behavior, data protocols, UI output, or build artifacts.

## Native iOS/Android Replication Guidance

No native client replication is required. Native teams can treat this as a contributor workflow rule only.
