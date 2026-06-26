use anyhow::{anyhow, Result};
use serde_json::{json, Value};
use tokio::process::Command;

pub async fn dispatch_codex_proxy(command: &str, payload: Value) -> Result<Value> {
    match command {
        "acp_prompt" => run_codex_prompt(payload).await,
        "list_open_folder_details" | "list_all_conversations" => Ok(json!({
            "runtime": "codex-cli",
            "command": command,
            "items": [],
            "status": "empty",
            "message": "Official Codex CLI adapter does not expose historical MCode folders in this P5 slice."
        })),
        _ => Err(anyhow!("unsupported codex command: {command}")),
    }
}

async fn run_codex_prompt(payload: Value) -> Result<Value> {
    let prompt = extract_prompt_text(&payload)?;
    let mut command = Command::new("codex");
    command.arg("exec").arg("--json");

    if let Some(working_dir) = extract_working_dir(&payload) {
        command.arg("--cd").arg(working_dir);
    }

    command.arg(prompt);
    let output = command.output().await?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Err(anyhow!(
            "codex exec failed: {}",
            first_non_empty_line(&stderr).unwrap_or_else(|| "unknown error".to_string())
        ));
    }

    Ok(json!({
        "runtime": "codex-cli",
        "status": "completed",
        "stdout": stdout,
        "stderr": stderr,
    }))
}

fn extract_working_dir(payload: &Value) -> Option<String> {
    payload
        .get("workingDir")
        .or_else(|| payload.get("working_dir"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn extract_prompt_text(payload: &Value) -> Result<String> {
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

fn first_non_empty_line(value: &str) -> Option<String> {
    value
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(ToString::to_string)
}
