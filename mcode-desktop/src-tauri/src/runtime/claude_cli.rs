use anyhow::{anyhow, Result};
use serde_json::{json, Value};

pub async fn dispatch_claude_proxy(command: &str, payload: Value) -> Result<Value> {
    match command {
        "list_projects" | "list_conversations" | "prompt" => Ok(json!({
            "runtime": "claude-cli",
            "command": command,
            "payload": payload,
            "status": "not_started"
        })),
        _ => Err(anyhow!("unsupported claude command: {command}")),
    }
}
