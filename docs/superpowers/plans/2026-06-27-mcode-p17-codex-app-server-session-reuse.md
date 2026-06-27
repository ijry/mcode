# MCode P17 Codex App-Server Session Reuse

## Goal

P17 upgrades the P16 Codex app-server integration from one app-server process per
prompt to one app-server client per MCode Desktop CLI session. This keeps the
MCode app and relay protocol unchanged while letting Desktop reuse the provider
thread, surface app-server diagnostics, and cancel active turns through the
Codex app-server control channel.

## Implemented Scope

- `AppState` now owns `codexAppServerSessions`, keyed by MCode CLI `sessionId`.
- A Codex app-server process is created on the first `acp_prompt` for a Codex
  desktop session and reused for later prompts with the same `sessionId` and
  `workingDir`.
- If the `workingDir` changes or the JSON-RPC transport is closed, Desktop stops
  the stale app-server process and creates a fresh provider thread.
- `CliRuntimeSession` now includes desktop diagnostics:
  `protocol`, `providerThreadId`, `activeTurnId`, and `appServerActive`.
- `acp_cancel` still returns through the existing proxy command, but an active
  Codex app-server turn now receives `turn/interrupt` with `threadId` and
  `turnId` before Desktop falls back to stopping the transport.
- `acp_disconnect` stops the persistent Codex app-server process for that
  Desktop session.
- Current turn event collection is rebound per prompt, so long-lived app-server
  notification/request handlers can still write into the correct prompt response
  and realtime event sink.

## Verification

- Added `desktop_p17_codex_app_server_session_reuse.rs`.
- Verified a second prompt reuses one `thread/start` provider thread.
- Verified `acp_cancel` sends `turn/interrupt` and returns a canceled response.
- Updated the P16 app-server test to call `acp_disconnect` because app-server
  lifetime is now session-level rather than prompt-level.

## Compatibility

- No app or relay wire protocol changes.
- Codex and Claude remain MCode Desktop capabilities, not mobile-side
  `targetAgent` values.
- `codex exec --json` fallback remains unchanged when app-server is disabled or
  optional app-server startup fails.
- App-server remains opt-in through `MCODE_DESKTOP_CODEX_APP_SERVER=1` or the
  test command override until real-world Codex CLI compatibility is validated.

## Remaining Work

- Persist provider thread mapping across Desktop restart.
- Add richer app-server health diagnostics for unexpected process exit.
- Add Claude live-control support when a stable official mechanism is verified.
