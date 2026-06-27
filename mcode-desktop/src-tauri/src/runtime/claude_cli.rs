use anyhow::{anyhow, Result};
use serde_json::{json, Value};

use super::{detect_cli_runtime, CliRuntimeKind};

pub async fn dispatch_claude_proxy(command: &str, payload: Value) -> Result<Value> {
    match command {
        "list_projects" | "list_conversations" => Ok(json!({
            "runtime": "claude-cli",
            "command": command,
            "items": [],
            "status": "empty",
            "message": "Official Claude CLI adapter does not expose historical MCode sessions in this P5 slice."
        })),
        "acp_prompt" | "prompt" => run_claude_prompt(payload).await,
        _ => Err(anyhow!("unsupported claude command: {command}")),
    }
}

async fn run_claude_prompt(_payload: Value) -> Result<Value> {
    let status = detect_cli_runtime(
        CliRuntimeKind::ClaudeCli,
        CliRuntimeKind::ClaudeCli.binary(),
    )
    .await;
    if !status.installed {
        return Err(anyhow!(
            "Claude CLI is not available on this desktop: {}",
            status
                .error
                .unwrap_or_else(|| "binary not found".to_string())
        ));
    }

    Err(anyhow!(
        "Claude CLI prompt execution is reserved for a later P5 adapter slice after command semantics are verified."
    ))
}
