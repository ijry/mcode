use anyhow::{anyhow, Result};
use serde_json::{json, Value};

pub async fn dispatch_codex_proxy(command: &str, payload: Value) -> Result<Value> {
    match command {
        "list_open_folder_details" | "list_all_conversations" | "acp_prompt" => Ok(json!({
            "runtime": "codex-cli",
            "command": command,
            "payload": payload,
            "status": "not_started"
        })),
        _ => Err(anyhow!("unsupported codex command: {command}")),
    }
}
