# MCode P18 Claude CLI Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `mcode-desktop` execute Claude official CLI prompts with streaming events, cancellation, diagnostics, and P15 pending-interaction integration.

**Architecture:** Claude remains a local Desktop capability under `targetAgent = mcode-desktop`; MCode app and relay continue using `proxy_request`, `proxy_response`, and `event_push`. P18 adds a conservative process-based adapter around `claude -p --output-format stream-json --verbose --include-partial-messages`, with environment overrides for tests and deployments. Shared process streaming helpers keep Codex and Claude lifecycle behavior aligned without making relay understand either CLI.

**Tech Stack:** Rust 2021, Tauri 2, Tokio process/io/sync, serde_json, existing MCode Desktop runtime session registry, existing ACP-style event normalizer, existing relay event push protocol.

## Global Constraints

- Use `targetAgent`, not `targetType`.
- Do not introduce mobile-side `codex` or `claude` target agents; official CLIs remain `mcode-desktop` capabilities.
- Do not send official CLI credentials or tokens to MCode app or mcode-relay.
- Do not add VS Code or code-server assumptions.
- Do not invent an unstable Claude stdin permission protocol.
- Preserve existing Codex behavior and existing relay wire protocol.
- Every mcode change must update `docs/mcode-architecture-notes/`.
- Claude CLI command behavior is based on Anthropic Claude Code CLI reference for `-p`, `--output-format stream-json`, `--verbose`, `--include-partial-messages`, and `--permission-mode`.

---

## File Structure

- Modify: `mcode-desktop/src-tauri/src/runtime/mod.rs`
  - Route Claude session prompts through a state-aware adapter path with `CliEventSink`.
  - Export the new process helper module.
- Create: `mcode-desktop/src-tauri/src/runtime/process_stdio.rs`
  - Own generic line-based CLI process execution, command override parsing, stdout/stderr collection, event sink emission, process cancel registration, and prompt payload extraction.
- Modify: `mcode-desktop/src-tauri/src/runtime/codex_cli.rs`
  - Replace duplicated Codex `codex exec --json` process plumbing with the shared helper while leaving Codex app-server code untouched.
- Modify: `mcode-desktop/src-tauri/src/runtime/claude_cli.rs`
  - Implement Claude `acp_prompt` execution through the shared helper.
  - Build default Claude print-mode arguments and support test/production command overrides.
- Test: `mcode-desktop/src-tauri/tests/desktop_p18_claude_cli_streaming.rs`
  - Cover Claude text streaming, Claude JSONL streaming, cancellation, diagnostics, pending interactions, and response commands.
- Modify: `docs/superpowers/plans/2026-06-26-mcode-p7-p12-roadmap-status.md`
  - Add P18 status and implemented scope after the code lands.
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`
  - Replace the P18 planned section with implemented behavior and native replication guidance.

---

### Task 1: Add Claude Streaming Tests

**Files:**
- Test: `mcode-desktop/src-tauri/tests/desktop_p18_claude_cli_streaming.rs`

**Interfaces:**
- Consumes: `dispatch_desktop_proxy_with_state(state, command, payload)`
- Consumes: `dispatch_desktop_proxy_with_event_sink(state, command, payload, event_sink)`
- Consumes: `AcpEventEnvelope`
- Produces: failing P18 tests that define required Claude behavior

- [ ] **Step 1: Create the P18 test file**

Create `mcode-desktop/src-tauri/tests/desktop_p18_claude_cli_streaming.rs` with this structure:

```rust
use std::sync::{Arc, Mutex};
use std::time::Duration;

use mcode_desktop_lib::app_state::AppState;
use mcode_desktop_lib::health::build_health_snapshot;
use mcode_desktop_lib::runtime::{
    dispatch_desktop_proxy_with_event_sink, dispatch_desktop_proxy_with_state, AcpEventEnvelope,
};
use serde_json::json;
use tokio::sync::Mutex as AsyncMutex;

static CLAUDE_ENV_LOCK: AsyncMutex<()> = AsyncMutex::const_new(());

fn fake_claude_command(script: &str) -> String {
    if cfg!(windows) {
        format!("powershell -NoProfile -ExecutionPolicy Bypass -File {script}")
    } else {
        format!("sh {script}")
    }
}

fn write_fake_claude_script(name: &str, body: &str) -> std::path::PathBuf {
    let extension = if cfg!(windows) { "ps1" } else { "sh" };
    let path = std::env::temp_dir().join(format!(
        "mcode-desktop-p18-claude-{name}-{}.{}",
        std::process::id(),
        extension
    ));
    std::fs::write(&path, body).unwrap();
    path
}

fn text_stream_script() -> &'static str {
    if cfg!(windows) {
        r#"
Write-Output 'hello from claude'
Start-Sleep -Milliseconds 100
Write-Output '{"type":"content_delta","text":"json delta"}'
"#
    } else {
        r#"
printf '%s\n' 'hello from claude'
sleep 0.1
printf '%s\n' '{"type":"content_delta","text":"json delta"}'
"#
    }
}

fn cancel_script() -> &'static str {
    if cfg!(windows) {
        r#"
Write-Output '{"type":"content_delta","text":"started"}'
Start-Sleep -Seconds 10
Write-Output '{"type":"content_delta","text":"should-not-finish"}'
"#
    } else {
        r#"
printf '%s\n' '{"type":"content_delta","text":"started"}'
sleep 10
printf '%s\n' '{"type":"content_delta","text":"should-not-finish"}'
"#
    }
}

fn interaction_script() -> &'static str {
    if cfg!(windows) {
        r#"
Write-Output '{"type":"permission_request","requestId":"claude-perm-1","description":"Allow Claude shell command?"}'
Write-Output '{"type":"question_request","questionId":"claude-question-1","questions":[{"id":"choice","question":"Pick a branch"}]}'
"#
    } else {
        r#"
printf '%s\n' '{"type":"permission_request","requestId":"claude-perm-1","description":"Allow Claude shell command?"}'
printf '%s\n' '{"type":"question_request","questionId":"claude-question-1","questions":[{"id":"choice","question":"Pick a branch"}]}'
"#
    }
}
```

- [ ] **Step 2: Add happy-path streaming test**

Append:

```rust
#[tokio::test]
async fn p18_streams_claude_text_and_jsonl_events() {
    let _env_lock = CLAUDE_ENV_LOCK.lock().await;
    let script = write_fake_claude_script("stream", text_stream_script());
    std::env::set_var(
        "MCODE_DESKTOP_TEST_CLAUDE_COMMAND",
        fake_claude_command(script.to_str().unwrap()),
    );

    let state = AppState::new_for_test();
    let connected = dispatch_desktop_proxy_with_state(
        &state,
        "acp_connect",
        json!({ "agentType": "claude_code", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();
    let session_id = connected["sessionId"].as_str().unwrap().to_string();
    let events = Arc::new(Mutex::new(Vec::<AcpEventEnvelope>::new()));
    let sink_events = Arc::clone(&events);

    let response = dispatch_desktop_proxy_with_event_sink(
        &state,
        "acp_prompt",
        json!({ "sessionId": session_id, "prompt": "hello claude" }),
        Some(Arc::new(move |event| {
            sink_events.lock().unwrap().push(event);
        })),
    )
    .await
    .unwrap();

    std::env::remove_var("MCODE_DESKTOP_TEST_CLAUDE_COMMAND");
    assert_eq!(response["runtime"], "claude-cli");
    assert_eq!(response["protocol"], "claude-cli-stdio");
    assert_eq!(response["status"], "completed");
    assert_eq!(response["canceled"], false);
    assert!(response["eventCount"].as_u64().unwrap() >= 4);
    assert_eq!(response["session"]["status"], "completed");
    assert_eq!(response["session"]["protocol"], "claude-cli-stdio");
    assert!(response["session"]["lastEventAtMs"].as_u64().is_some());

    let events = events.lock().unwrap();
    assert!(events.iter().any(|event| event.event_type == "stream_batch" && event.data["delta"] == "hello from claude"));
    assert!(events.iter().any(|event| event.event_type == "stream_batch" && event.data["delta"] == "json delta"));
    assert!(!events.iter().any(|event| event.event_type == "turn_complete"));
}
```

- [ ] **Step 3: Add cancellation test**

Append:

```rust
#[tokio::test]
async fn p18_acp_cancel_kills_active_claude_process() {
    let _env_lock = CLAUDE_ENV_LOCK.lock().await;
    let script = write_fake_claude_script("cancel", cancel_script());
    std::env::set_var(
        "MCODE_DESKTOP_TEST_CLAUDE_COMMAND",
        fake_claude_command(script.to_str().unwrap()),
    );

    let state = Arc::new(AppState::new_for_test());
    let connected = dispatch_desktop_proxy_with_state(
        state.as_ref(),
        "acp_connect",
        json!({ "agentType": "claude_code", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();
    let session_id = connected["sessionId"].as_str().unwrap().to_string();
    let prompt_state = Arc::clone(&state);
    let prompt_session_id = session_id.clone();

    let prompt_task = tokio::spawn(async move {
        dispatch_desktop_proxy_with_state(
            prompt_state.as_ref(),
            "acp_prompt",
            json!({ "sessionId": prompt_session_id, "prompt": "keep running" }),
        )
        .await
    });

    tokio::time::sleep(Duration::from_millis(300)).await;
    let canceled = dispatch_desktop_proxy_with_state(
        state.as_ref(),
        "acp_cancel",
        json!({ "sessionId": session_id }),
    )
    .await
    .unwrap();
    let response = tokio::time::timeout(Duration::from_secs(3), prompt_task)
        .await
        .expect("prompt should stop after cancel")
        .expect("prompt task should join")
        .expect("prompt should resolve as canceled response");

    std::env::remove_var("MCODE_DESKTOP_TEST_CLAUDE_COMMAND");
    assert_eq!(canceled["status"], "canceled");
    assert_eq!(response["status"], "canceled");
    assert_eq!(response["canceled"], true);
    assert_eq!(response["session"]["status"], "canceled");
}
```

- [ ] **Step 4: Add pending interaction test**

Append:

```rust
#[tokio::test]
async fn p18_captures_and_resolves_claude_interactions() {
    let _env_lock = CLAUDE_ENV_LOCK.lock().await;
    let script = write_fake_claude_script("interactions", interaction_script());
    std::env::set_var(
        "MCODE_DESKTOP_TEST_CLAUDE_COMMAND",
        fake_claude_command(script.to_str().unwrap()),
    );

    let state = Arc::new(AppState::new_for_test());
    let connected = dispatch_desktop_proxy_with_state(
        state.as_ref(),
        "acp_connect",
        json!({ "agentType": "claude_code", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();
    let session_id = connected["sessionId"].as_str().unwrap().to_string();

    let response = dispatch_desktop_proxy_with_state(
        state.as_ref(),
        "acp_prompt",
        json!({ "sessionId": session_id, "prompt": "trigger claude interactions" }),
    )
    .await
    .unwrap();
    assert_eq!(response["runtime"], "claude-cli");

    let health = build_health_snapshot(state.as_ref());
    assert!(health.cli_pending_interactions.iter().any(|interaction| {
        interaction.kind == "permission"
            && interaction.interaction_id == "claude-perm-1"
            && interaction.summary == "Allow Claude shell command?"
    }));
    assert!(health.cli_pending_interactions.iter().any(|interaction| {
        interaction.kind == "question"
            && interaction.interaction_id == "claude-question-1"
            && interaction.summary == "Pick a branch"
    }));

    let permission = dispatch_desktop_proxy_with_state(
        state.as_ref(),
        "acp_respond_permission",
        json!({
            "sessionId": session_id,
            "requestId": "claude-perm-1",
            "decision": "allow"
        }),
    )
    .await
    .unwrap();
    let question = dispatch_desktop_proxy_with_state(
        state.as_ref(),
        "acp_respond_question",
        json!({
            "sessionId": session_id,
            "questionId": "claude-question-1",
            "answer": { "branch": "main" }
        }),
    )
    .await
    .unwrap();

    std::env::remove_var("MCODE_DESKTOP_TEST_CLAUDE_COMMAND");
    assert_eq!(permission["liveResolved"], false);
    assert_eq!(permission["events"][0]["type"], "permission_resolved");
    assert_eq!(question["liveResolved"], false);
    assert_eq!(question["events"][0]["type"], "question_resolved");
}
```

- [ ] **Step 5: Run tests to verify the current unsupported adapter fails**

Run:

```powershell
cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml p18_ -- --nocapture
```

Expected: the new tests fail with an error containing `Claude CLI prompt execution is reserved` or equivalent unsupported Claude prompt behavior.

---

### Task 2: Add Shared Streaming Process Helper

**Files:**
- Create: `mcode-desktop/src-tauri/src/runtime/process_stdio.rs`
- Modify: `mcode-desktop/src-tauri/src/runtime/mod.rs`

**Interfaces:**
- Produces: `StreamingCliProcessRequest<'a>`
- Produces: `StreamingCliProcessOutput`
- Produces: `run_streaming_cli_process(request) -> Result<StreamingCliProcessOutput>`
- Produces: `command_parts_from_env(variables, default_binary) -> (String, Vec<String>)`
- Produces: `extract_connection_id(payload, fallback) -> String`
- Produces: `extract_working_dir(payload) -> Option<String>`
- Produces: `extract_prompt_text(payload) -> Result<String>`
- Produces: `first_non_empty_line(value) -> Option<String>`

- [ ] **Step 1: Register the module**

Modify `mcode-desktop/src-tauri/src/runtime/mod.rs`:

```rust
pub mod process_stdio;
```

- [ ] **Step 2: Create the helper file**

Create `mcode-desktop/src-tauri/src/runtime/process_stdio.rs`:

```rust
use std::process::Stdio;

use anyhow::{anyhow, Result};
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
use tokio::process::Command;
use tokio::sync::oneshot;

use super::events::{normalize_cli_output_events, normalize_cli_output_line_events, AcpEventEnvelope};
use super::CliEventSink;
use crate::app_state::{AppState, CliProcessControl};

pub struct StreamingCliProcessRequest<'a> {
    pub state: Option<&'a AppState>,
    pub runtime: &'static str,
    pub protocol: &'static str,
    pub connection_id: String,
    pub binary: String,
    pub args: Vec<String>,
    pub working_dir: Option<String>,
    pub payload: &'a Value,
    pub event_sink: Option<CliEventSink>,
}

pub struct StreamingCliProcessOutput {
    pub stdout: String,
    pub stderr: String,
    pub events: Vec<AcpEventEnvelope>,
    pub streamed_event_count: usize,
    pub exit_code: Option<i32>,
    pub stderr_preview: Option<String>,
    pub canceled: bool,
}

pub async fn run_streaming_cli_process(
    request: StreamingCliProcessRequest<'_>,
) -> Result<StreamingCliProcessOutput> {
    let mut command = Command::new(&request.binary);
    command.args(&request.args);
    if let Some(working_dir) = request.working_dir.as_deref() {
        command.current_dir(working_dir);
    }
    command.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = command.spawn()?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| anyhow!("{} stdout pipe unavailable", request.runtime))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| anyhow!("{} stderr pipe unavailable", request.runtime))?;
    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();
    let registered = request
        .state
        .and_then(|state| register_process_control(state, &request.connection_id, request.payload, cancel_tx).ok())
        .is_some();

    let stdout_task = tokio::spawn(read_stdout_events(
        stdout,
        request.runtime,
        request.connection_id.clone(),
        request.event_sink.clone(),
    ));
    let stderr_task = tokio::spawn(read_pipe_text(stderr));

    let mut canceled = false;
    let status = tokio::select! {
        status = child.wait() => status?,
        _ = cancel_rx => {
            canceled = true;
            let _ = child.kill().await;
            child.wait().await?
        }
    };

    if registered {
        if let Some(state) = request.state {
            unregister_process_control(state, &request.connection_id);
        }
    }

    let (stdout, streamed_event_count) = stdout_task
        .await
        .map_err(|error| anyhow!("{} stdout task failed: {error}", request.runtime))??;
    let stderr = stderr_task
        .await
        .map_err(|error| anyhow!("{} stderr task failed: {error}", request.runtime))??;
    let exit_code = status.code();
    let stderr_preview = first_non_empty_line(&stderr);

    if !status.success() && !canceled {
        return Err(anyhow!(
            "{} failed: {}",
            request.runtime,
            stderr_preview.clone().unwrap_or_else(|| "unknown error".to_string())
        ));
    }

    let events = normalize_cli_output_events(request.runtime, &request.connection_id, &stdout);
    Ok(StreamingCliProcessOutput {
        stdout,
        stderr,
        events,
        streamed_event_count,
        exit_code,
        stderr_preview,
        canceled,
    })
}

async fn read_stdout_events<R>(
    stdout: R,
    runtime: &'static str,
    connection_id: String,
    event_sink: Option<CliEventSink>,
) -> Result<(String, usize)>
where
    R: AsyncRead + Unpin,
{
    let mut reader = BufReader::new(stdout).lines();
    let mut stdout = String::new();
    let mut streamed_event_count = 0_usize;
    while let Some(line) = reader.next_line().await? {
        stdout.push_str(&line);
        stdout.push('\n');
        if let Some(sink) = event_sink.as_ref() {
            for event in normalize_cli_output_line_events(runtime, &connection_id, &line) {
                sink(event);
                streamed_event_count += 1;
            }
        }
    }
    Ok((stdout, streamed_event_count))
}

async fn read_pipe_text<R>(pipe: R) -> Result<String>
where
    R: AsyncRead + Unpin,
{
    let mut reader = BufReader::new(pipe).lines();
    let mut output = String::new();
    while let Some(line) = reader.next_line().await? {
        output.push_str(&line);
        output.push('\n');
    }
    Ok(output)
}

fn register_process_control(
    state: &AppState,
    session_id: &str,
    payload: &Value,
    cancel_tx: oneshot::Sender<()>,
) -> Result<()> {
    let mut processes = state
        .cli_processes
        .lock()
        .map_err(|_| anyhow!("cli process lock poisoned"))?;
    processes.insert(
        session_id.to_string(),
        CliProcessControl {
            request_id: extract_request_id(payload),
            started_at_ms: now_ms(),
            cancel_tx: Some(cancel_tx),
        },
    );
    Ok(())
}

fn unregister_process_control(state: &AppState, session_id: &str) {
    if let Ok(mut processes) = state.cli_processes.lock() {
        processes.remove(session_id);
    }
}

pub fn command_parts_from_env(variables: &[&str], default_binary: &str) -> (String, Vec<String>) {
    for variable in variables {
        if let Ok(command) = std::env::var(variable) {
            let parts = split_command_line(&command);
            if let Some((binary, args)) = parts.split_first() {
                return (binary.clone(), args.to_vec());
            }
        }
    }
    (default_binary.to_string(), Vec::new())
}

pub fn split_command_line(command: &str) -> Vec<String> {
    command
        .split_whitespace()
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .map(ToString::to_string)
        .collect()
}

pub fn extract_connection_id(payload: &Value, fallback: &str) -> String {
    payload
        .get("connectionId")
        .and_then(Value::as_str)
        .or_else(|| payload.get("connection_id").and_then(Value::as_str))
        .or_else(|| payload.get("sessionId").and_then(Value::as_str))
        .or_else(|| payload.get("session_id").and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .unwrap_or_else(|| fallback.to_string())
}

pub fn extract_working_dir(payload: &Value) -> Option<String> {
    payload
        .get("workingDir")
        .or_else(|| payload.get("working_dir"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn extract_request_id(payload: &Value) -> Option<String> {
    payload
        .get("requestId")
        .and_then(Value::as_str)
        .or_else(|| payload.get("request_id").and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

pub fn extract_prompt_text(payload: &Value) -> Result<String> {
    if let Some(text) = payload.get("prompt").and_then(Value::as_str) {
        let text = text.trim();
        if !text.is_empty() {
            return Ok(text.to_string());
        }
    }

    let blocks = payload
        .get("blocks")
        .and_then(Value::as_array)
        .ok_or_else(|| anyhow!("acp_prompt requires prompt text or blocks"))?;
    let text = blocks
        .iter()
        .filter_map(extract_block_text)
        .collect::<Vec<_>>()
        .join("\n");
    let text = text.trim();
    if text.is_empty() {
        return Err(anyhow!("acp_prompt blocks did not contain text"));
    }
    Ok(text.to_string())
}

fn extract_block_text(block: &Value) -> Option<String> {
    if let Some(text) = block.as_str() {
        return Some(text.to_string());
    }
    let record = block.as_object()?;
    for key in ["text", "content", "value"] {
        if let Some(text) = record.get(key).and_then(Value::as_str) {
            return Some(text.to_string());
        }
    }
    None
}

pub fn first_non_empty_line(value: &str) -> Option<String> {
    value
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(ToString::to_string)
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}
```

- [ ] **Step 3: Run focused compile check**

Run:

```powershell
cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml p9_ -- --nocapture
```

Expected: compile succeeds and P9 event tests pass.

- [ ] **Step 4: Commit helper**

```powershell
git add mcode-desktop/src-tauri/src/runtime/mod.rs mcode-desktop/src-tauri/src/runtime/process_stdio.rs
git commit -m "feat(desktop): add shared cli process streaming helper"
```

---

### Task 3: Port Codex Exec Path To Shared Helper

**Files:**
- Modify: `mcode-desktop/src-tauri/src/runtime/codex_cli.rs`

**Interfaces:**
- Consumes: `StreamingCliProcessRequest`
- Consumes: `run_streaming_cli_process`
- Consumes: `command_parts_from_env`
- Consumes: `extract_connection_id`
- Consumes: `extract_working_dir`
- Consumes: `extract_prompt_text`
- Produces: unchanged Codex `codex exec --json` response shape

- [ ] **Step 1: Replace Codex process imports**

In `mcode-desktop/src-tauri/src/runtime/codex_cli.rs`, remove these imports when no longer used by Codex exec:

```rust
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
```

Add:

```rust
use super::process_stdio::{
    command_parts_from_env, extract_connection_id, extract_prompt_text, extract_working_dir,
    run_streaming_cli_process, StreamingCliProcessRequest,
};
```

- [ ] **Step 2: Replace `run_codex_exec_prompt` body**

Update `run_codex_exec_prompt` so the process execution block uses the helper:

```rust
async fn run_codex_exec_prompt(
    state: Option<&AppState>,
    payload: Value,
    event_sink: Option<CliEventSink>,
) -> Result<Value> {
    let prompt = extract_prompt_text(&payload)?;
    let (binary, mut args) = codex_command_parts();
    args.push("exec".to_string());
    args.push("--json".to_string());
    args.push(prompt);

    let connection_id = extract_connection_id(&payload, "codex-cli");
    let output = run_streaming_cli_process(StreamingCliProcessRequest {
        state,
        runtime: "codex-cli",
        protocol: "codex-cli-exec",
        connection_id,
        binary,
        args,
        working_dir: extract_working_dir(&payload),
        payload: &payload,
        event_sink,
    })
    .await?;
    let event_count = output.events.len();

    Ok(json!({
        "runtime": "codex-cli",
        "status": if output.canceled { "canceled" } else { "completed" },
        "canceled": output.canceled,
        "exitCode": output.exit_code,
        "stderrPreview": output.stderr_preview,
        "stdout": output.stdout,
        "stderr": output.stderr,
        "events": output.events,
        "eventCount": event_count,
        "streamedEventCount": output.streamed_event_count,
    }))
}
```

- [ ] **Step 3: Replace `codex_command_parts`**

Use the shared command override parser:

```rust
fn codex_command_parts() -> (String, Vec<String>) {
    command_parts_from_env(&["MCODE_DESKTOP_TEST_CODEX_COMMAND"], "codex")
}
```

Keep `codex_app_server_command_parts()` unchanged except for replacing its local `split_command_line()` call with `command_parts_from_env()` only if the resulting code stays simple. The app-server path is not part of P18.

- [ ] **Step 4: Remove duplicate helpers only after compile confirms they are unused**

Remove local copies from `codex_cli.rs` when the compiler reports they are unused:

```rust
read_stdout_events
read_pipe_text
register_process_control
unregister_process_control
split_command_line
extract_connection_id
extract_working_dir
extract_request_id
extract_prompt_text
extract_block_text
first_non_empty_line
```

Keep any helper still used by Codex app-server code. If `first_non_empty_line` is still needed by app-server fallback diagnostics, import it from `process_stdio`.

- [ ] **Step 5: Verify Codex regression coverage**

Run:

```powershell
cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml p14_ -- --nocapture
cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml p16_ -- --nocapture
cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml p17_ -- --nocapture
```

Expected: P14, P16, and P17 tests pass.

- [ ] **Step 6: Commit Codex refactor**

```powershell
git add mcode-desktop/src-tauri/src/runtime/codex_cli.rs
git commit -m "refactor(desktop): share codex cli process streaming"
```

---

### Task 4: Implement Claude CLI Streaming Adapter

**Files:**
- Modify: `mcode-desktop/src-tauri/src/runtime/claude_cli.rs`
- Modify: `mcode-desktop/src-tauri/src/runtime/mod.rs`
- Test: `mcode-desktop/src-tauri/tests/desktop_p18_claude_cli_streaming.rs`

**Interfaces:**
- Consumes: `run_streaming_cli_process`
- Produces: `run_claude_prompt_with_state(state, payload, event_sink) -> Result<Value>`
- Produces: `claude_command_parts() -> (String, Vec<String>)`
- Produces: `build_claude_args(prefix_args, prompt, payload) -> Vec<String>`

- [ ] **Step 1: Change runtime dispatch to use state-aware Claude prompt execution**

In `mcode-desktop/src-tauri/src/runtime/mod.rs`, update both session prompt dispatch functions:

```rust
async fn dispatch_session_prompt(
    state: &AppState,
    session: &CliRuntimeSession,
    payload: Value,
    event_sink: Option<CliEventSink>,
) -> Result<Value> {
    match session.runtime {
        CliRuntimeKind::CodexCli => {
            codex_cli::run_codex_prompt_with_state(state, payload, event_sink).await
        }
        CliRuntimeKind::ClaudeCli => {
            claude_cli::run_claude_prompt_with_state(state, payload, event_sink).await
        }
    }
}
```

```rust
async fn dispatch_session_prompt_arc(
    state: Arc<AppState>,
    session: &CliRuntimeSession,
    payload: Value,
    event_sink: Option<CliEventSink>,
) -> Result<Value> {
    match session.runtime {
        CliRuntimeKind::CodexCli => {
            codex_cli::run_codex_prompt_with_arc_state(state, payload, event_sink).await
        }
        CliRuntimeKind::ClaudeCli => {
            claude_cli::run_claude_prompt_with_state(state.as_ref(), payload, event_sink).await
        }
    }
}
```

- [ ] **Step 2: Update Claude adapter signature for non-session fallback**

In `mcode-desktop/src-tauri/src/runtime/claude_cli.rs`, make prompt execution accept optional state and event sink:

```rust
use super::process_stdio::{
    command_parts_from_env, extract_connection_id, extract_prompt_text, extract_working_dir,
    run_streaming_cli_process, StreamingCliProcessRequest,
};
use super::{detect_cli_runtime, CliEventSink, CliRuntimeKind};
use crate::app_state::AppState;

pub async fn dispatch_claude_proxy(
    command: &str,
    payload: Value,
    event_sink: Option<CliEventSink>,
) -> Result<Value> {
    match command {
        "list_projects" | "list_conversations" => Ok(json!({
            "runtime": "claude-cli",
            "command": command,
            "items": [],
            "status": "empty",
            "message": "Official Claude CLI adapter does not expose historical MCode sessions."
        })),
        "acp_prompt" | "prompt" => run_claude_prompt(None, payload, event_sink).await,
        _ => Err(anyhow!("unsupported claude command: {command}")),
    }
}

pub async fn run_claude_prompt_with_state(
    state: &AppState,
    payload: Value,
    event_sink: Option<CliEventSink>,
) -> Result<Value> {
    run_claude_prompt(Some(state), payload, event_sink).await
}
```

Update non-session runtime call sites to pass `None` as the event sink where needed:

```rust
CliRuntimeKind::ClaudeCli => claude_cli::dispatch_claude_proxy("acp_prompt", payload, event_sink).await,
```

- [ ] **Step 3: Implement Claude command construction**

Add to `claude_cli.rs`:

```rust
fn claude_command_parts() -> (String, Vec<String>) {
    command_parts_from_env(
        &[
            "MCODE_DESKTOP_TEST_CLAUDE_COMMAND",
            "MCODE_DESKTOP_CLAUDE_COMMAND",
        ],
        "claude",
    )
}

fn build_claude_args(mut args: Vec<String>, prompt: String, payload: &Value) -> Vec<String> {
    args.push("-p".to_string());
    args.push(prompt);
    args.push("--output-format".to_string());
    args.push("stream-json".to_string());
    args.push("--verbose".to_string());
    args.push("--include-partial-messages".to_string());

    if let Some(permission_mode) = payload
        .get("permissionMode")
        .or_else(|| payload.get("permission_mode"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        args.push("--permission-mode".to_string());
        args.push(map_claude_permission_mode(permission_mode).to_string());
    }

    args
}

fn map_claude_permission_mode(value: &str) -> &'static str {
    match value {
        "acceptEdits" | "accept_edits" | "accept-edits" => "acceptEdits",
        "plan" => "plan",
        "auto" => "auto",
        "dontAsk" | "dont_ask" | "dont-ask" => "dontAsk",
        "bypassPermissions" | "bypass_permissions" | "bypass-permissions" => "bypassPermissions",
        _ => "default",
    }
}
```

- [ ] **Step 4: Implement `run_claude_prompt`**

Replace the unsupported error with:

```rust
async fn run_claude_prompt(
    state: Option<&AppState>,
    payload: Value,
    event_sink: Option<CliEventSink>,
) -> Result<Value> {
    let status = detect_cli_runtime(
        CliRuntimeKind::ClaudeCli,
        CliRuntimeKind::ClaudeCli.binary(),
    )
    .await;
    if !status.installed && std::env::var("MCODE_DESKTOP_TEST_CLAUDE_COMMAND").is_err() {
        return Err(anyhow!(
            "Claude CLI is not available on this desktop: {}",
            status
                .error
                .unwrap_or_else(|| "binary not found".to_string())
        ));
    }

    let prompt = extract_prompt_text(&payload)?;
    let (binary, prefix_args) = claude_command_parts();
    let args = build_claude_args(prefix_args, prompt, &payload);
    let connection_id = extract_connection_id(&payload, "claude-cli");
    let output = run_streaming_cli_process(StreamingCliProcessRequest {
        state,
        runtime: "claude-cli",
        protocol: "claude-cli-stdio",
        connection_id,
        binary,
        args,
        working_dir: extract_working_dir(&payload),
        payload: &payload,
        event_sink,
    })
    .await?;
    let event_count = output.events.len();

    Ok(json!({
        "runtime": "claude-cli",
        "protocol": "claude-cli-stdio",
        "status": if output.canceled { "canceled" } else { "completed" },
        "canceled": output.canceled,
        "exitCode": output.exit_code,
        "stderrPreview": output.stderr_preview,
        "stdout": output.stdout,
        "stderr": output.stderr,
        "events": output.events,
        "eventCount": event_count,
        "streamedEventCount": output.streamed_event_count,
        "liveControl": false,
    }))
}
```

- [ ] **Step 5: Run P18 tests**

Run:

```powershell
cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml p18_ -- --nocapture
```

Expected: all P18 tests pass.

- [ ] **Step 6: Commit Claude adapter**

```powershell
git add mcode-desktop/src-tauri/src/runtime/mod.rs mcode-desktop/src-tauri/src/runtime/claude_cli.rs mcode-desktop/src-tauri/tests/desktop_p18_claude_cli_streaming.rs
git commit -m "feat(desktop): add p18 claude cli streaming adapter"
```

---

### Task 5: Documentation, Verification, And Status

**Files:**
- Modify: `docs/superpowers/plans/2026-06-26-mcode-p7-p12-roadmap-status.md`
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`

**Interfaces:**
- Consumes: implemented P18 behavior from Tasks 2-4
- Produces: updated roadmap status and native replication guidance

- [ ] **Step 1: Update roadmap status table**

In `docs/superpowers/plans/2026-06-26-mcode-p7-p12-roadmap-status.md`, change the title to:

```markdown
# MCode P7-P18 Roadmap Status
```

Add a P18 row:

```markdown
| P18 | Claude CLI streaming session adapter: execute Claude official CLI prompts through Desktop with stdout event streaming, cancellation, diagnostics, and P15 pending-interaction integration. | Implemented first slice. Desktop runs Claude print-mode through a process-based adapter, streams normalized events, kills active Claude prompts on `acp_cancel`, and keeps live-control write-back disabled until a stable Claude control channel is verified. |
```

Add a `## P18 Implemented Scope` section that records:

- default command shape
- environment overrides
- event mapping
- cancellation behavior
- `liveResolved = false` interaction behavior
- compatibility with `targetAgent = mcode-desktop`
- native iOS/Android guidance

- [ ] **Step 2: Update architecture note from planned to implemented**

In `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`, rename:

```markdown
## P18 Planned Claude CLI Streaming Session Adapter
```

to:

```markdown
## P18 Claude CLI Streaming Session Adapter Behavior
```

Replace planning language such as `计划`, `建议`, and `应` with implemented behavior after verifying the final code.

- [ ] **Step 3: Run full verification**

Run:

```powershell
cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml
cd mcode-desktop; npm test; npm run build; cd ..
cd mcode-relay; npm test; cd ..
cd mcode-app; npm run test:unit; cd ..
git diff --check
```

Expected:

- Rust desktop tests pass.
- Desktop frontend tests pass.
- Desktop frontend build passes.
- Relay tests pass.
- App unit tests pass.
- `git diff --check` reports no whitespace errors.

- [ ] **Step 4: Commit docs**

```powershell
git add docs/superpowers/plans/2026-06-26-mcode-p7-p12-roadmap-status.md docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md
git commit -m "docs(desktop): record p18 claude cli streaming"
```

---

## Self-Review Checklist

- Spec coverage: Tasks cover Claude prompt execution, stdout streaming, stderr diagnostics, cancellation, pending interactions, protocol compatibility, native guidance, and docs.
- Type consistency: `StreamingCliProcessRequest`, `StreamingCliProcessOutput`, `run_streaming_cli_process`, `run_claude_prompt_with_state`, and `claude_command_parts` names are used consistently across tasks.
- Relay protocol: No task changes relay frame shapes or app connection model.
- Mobile target model: No task introduces mobile-side `targetAgent = claude`.
- Official CLI risk: The plan uses documented Claude CLI print-mode flags and keeps live-control write-back disabled.
