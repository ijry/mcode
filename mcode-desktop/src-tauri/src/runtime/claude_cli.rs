use anyhow::{anyhow, Result};
use serde_json::{json, Value};

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
