use std::process::Stdio;

use anyhow::{anyhow, Result};
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
use tokio::process::Command;
use tokio::sync::oneshot;

use super::events::{
    normalize_cli_output_events, normalize_cli_output_line_events, AcpEventEnvelope,
};
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
        .and_then(|state| {
            register_process_control(state, &request.connection_id, request.payload, cancel_tx).ok()
        })
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
            stderr_preview
                .clone()
                .unwrap_or_else(|| "unknown error".to_string())
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
