# MCode P18 Claude CLI Streaming Session Adapter Design

## Purpose

P18 turns the existing Claude official CLI adapter from a detection-only
placeholder into a usable MCode Desktop runtime. The goal is not to expose
Claude as a mobile-side direct agent. Claude official CLI remains a local
Desktop capability under `targetAgent = mcode-desktop`, with credentials and
process state staying on the user's computer.

P18 should close the largest remaining official-CLI product gap after P17:
Codex can now stream, cancel, handle live interactions, and reuse app-server
sessions, while Claude still returns an explicit unsupported error for
`acp_prompt`.

## Scope

P18 implements a conservative, process-based Claude adapter:

- `acp_prompt` works for `agentType = claude_code`.
- Desktop spawns the local `claude` binary with a verified non-interactive
  command shape.
- stdout is read line by line and normalized into existing ACP-style events.
- stderr is captured for diagnostics.
- `acp_cancel` kills the active Claude process through the existing
  `cli_processes` registry.
- Session snapshots expose protocol, exit code, stderr preview, last event time,
  and cancellation state.
- Permission and question events are captured into P15 pending interaction state
  if Claude output contains recognizable request records.

P18 does not implement a Claude live-control channel unless a stable official
stdio, SDK, or server protocol is verified during implementation. If only CLI
stdout is available, `acp_respond_permission` and `acp_respond_question` keep
the P15 behavior: they resolve MCode-visible pending state and emit resolved
events, but do not write responses back into Claude.

## Non-Goals

- Do not add mobile-side `targetAgent = claude`.
- Do not send Anthropic or Claude credentials to MCode app or mcode-relay.
- Do not make relay parse Claude output or understand Claude sessions.
- Do not add VS Code or code-server assumptions.
- Do not invent an unstable stdin protocol for Claude approval responses.
- Do not require P18 to match Codex app-server session reuse; that belongs to a
  later Claude live-control phase if a stable mechanism exists.

## Architecture

The existing routing remains unchanged:

```text
MCode app
  -> mcode-relay /v1/proxy/:command
  -> mcode-desktop proxy_request
  -> runtime::dispatch_desktop_proxy_with_event_sink
  -> claude_cli adapter
  -> local official Claude CLI process
```

Desktop owns Claude process lifecycle. Relay remains a gateway and event fanout
layer only. MCode app consumes the same `event_push` stream and `proxy_response`
body shape already used by Codex.

The adapter should share as much runtime infrastructure as possible with Codex
P14:

- command override parsing
- prompt text/block extraction shape
- event sink emission
- process-control registration
- stdout/stderr line readers
- final response diagnostics

If sharing code requires moving generic helpers out of `codex_cli.rs`, create a
small `runtime/process_adapter.rs` or similar internal module. Keep
Claude-specific command construction and event quirks in `runtime/claude_cli.rs`.

## Command Model

P18 must support test overrides first:

- `MCODE_DESKTOP_TEST_CLAUDE_COMMAND`
- Optional production override: `MCODE_DESKTOP_CLAUDE_COMMAND`

The default binary remains `claude`.

Implementation should verify the actual Claude CLI command shape before making
it the default. The preferred production shape is a non-interactive prompt mode
that can run in a working directory and emit text or structured output. If the
real CLI supports structured JSON/JSONL output, P18 should enable it. If not,
plain text output is still acceptable for P18 as long as it streams and maps to
`stream_batch`.

The final response should include:

- `runtime = "claude-cli"`
- `protocol = "claude-cli-stdio"` or a more specific verified protocol name
- `status = "completed" | "canceled"`
- `canceled`
- `exitCode`
- `stderrPreview`
- `stdout`
- `stderr`
- `events`
- `eventCount`
- `streamedEventCount`

## Event Mapping

P18 reuses `normalize_cli_output_line_events()` and
`normalize_cli_output_events()` where possible. Runtime label should be
`claude-cli` and `connectionId` should be the MCode CLI `sessionId`.

Minimum supported mapping:

- plain stdout line -> `stream_batch`
- recognized tool start -> `tool_call`
- recognized tool update/completion -> `tool_call_update`
- recognized permission request -> `permission_request`
- recognized question/user input request -> `question_request`
- recognized usage record -> `usage_update`
- process completion -> synthesized `status_changed(idle)` and `turn_complete`
  if Claude did not emit equivalent records

The mapper must be defensive. Official CLI output is not treated as a stable
public API unless documented by the vendor. Unknown JSON records should not
crash the adapter; they should either become `stream_batch` text or be ignored
with diagnostics.

## Interaction Handling

P18 should integrate with P15 pending interaction state but remain conservative
about write-back:

- When normalized Claude output produces `permission_request` or
  `question_request`, Desktop records it in `cliPendingInteractions`.
- Mobile/native clients respond with existing `acp_respond_permission` and
  `acp_respond_question`.
- Desktop emits the resolved event through the existing `event_push` path.
- If no verified live Claude waiter exists, `liveResolved = false`.

This keeps the user-visible approval loop consistent without guessing Claude
stdin behavior. A later phase can add true live write-back behind the same
Desktop adapter boundary.

## Error Handling

P18 should fail early and clearly when:

- Claude CLI is not installed.
- The configured command is empty or cannot be spawned.
- `workingDir` is invalid.
- Claude exits non-zero without cancellation.
- stdout/stderr pipes cannot be captured.

For non-zero exit, return an error based on the first non-empty stderr line when
available. For cancellation, return a successful proxy body with
`status = "canceled"` and `canceled = true`, matching the Codex P14 behavior.

## Desktop UI Behavior

The existing Agents page should not need a new top-level section. It should show
Claude sessions with the same diagnostics already used for Codex:

- status
- active request
- last prompt preview
- last event time
- exit code
- stderr preview
- pending interaction count

If P18 introduces `protocol = claude-cli-stdio`, display it as diagnostic text
only. App and native clients should not branch on the exact protocol value.

## Native iOS/Android Replication Guidance

Native clients do not implement Claude process management. They only replicate
the existing Desktop runtime client behavior:

- Create or resume a Desktop CLI session with `acp_connect`.
- Send `acp_prompt` with the returned `sessionId` and `agentType =
  claude_code`.
- Consume `/v1/events` for ACP-style streaming events.
- Use `acp_cancel` for cancellation.
- Use `acp_respond_permission` and `acp_respond_question` for visible
  interactions.
- Call `acp_disconnect` when the user closes the Claude Desktop session.

## Tests

P18 should add Rust integration tests using fake Claude commands:

- missing Claude binary reports a clear unavailable error
- text stdout streams as `stream_batch`
- JSONL stdout maps into ACP-style events
- final response includes diagnostics and skips duplicate streamed events
- `acp_cancel` terminates an active fake Claude process
- permission/question records are captured into pending interactions
- response commands resolve pending Claude interactions without requiring live
  write-back

Desktop frontend tests should only be needed if UI labels or diagnostics change.
Relay and app protocol tests should not need updates because P18 does not change
wire protocol.

## Compatibility

P18 is additive and protocol-compatible:

- `targetAgent` remains `mcode-desktop`.
- Relay wire protocol remains `proxy_request`, `proxy_response`, and
  `event_push`.
- Existing Codex behavior remains unchanged.
- Existing unsupported Claude behavior is replaced by real execution only when
  Claude CLI is installed or explicitly overridden in tests.

## Open Product Risk

The main risk is Claude official CLI command/API stability. The implementation
must verify the command shape locally and keep the adapter tolerant of output
format changes. If a stable Claude SDK or server protocol appears later, the
internal adapter can switch to that mechanism without changing MCode app or
relay protocols.
