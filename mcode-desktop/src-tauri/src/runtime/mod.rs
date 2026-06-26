pub mod claude_cli;
pub mod codex_cli;

use anyhow::{anyhow, Result};
use serde_json::{json, Value};
use tokio::process::Command;

use crate::app_state::AppState;

pub const CAPABILITY_CODEX_CLI: &str = "desktop.runtime.codex-cli";
pub const CAPABILITY_CLAUDE_CLI: &str = "desktop.runtime.claude-cli";
pub const CAPABILITY_TUNNEL_AVAILABLE: &str = "desktop.tunnel.available";

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum CliRuntimeKind {
    CodexCli,
    ClaudeCli,
}

impl CliRuntimeKind {
    pub fn id(&self) -> &'static str {
        match self {
            Self::CodexCli => "codex-cli",
            Self::ClaudeCli => "claude-cli",
        }
    }

    pub fn binary(&self) -> &'static str {
        match self {
            Self::CodexCli => "codex",
            Self::ClaudeCli => "claude",
        }
    }

    pub fn display_name(&self) -> &'static str {
        match self {
            Self::CodexCli => "Codex CLI",
            Self::ClaudeCli => "Claude CLI",
        }
    }

    pub fn capability(&self) -> &'static str {
        match self {
            Self::CodexCli => CAPABILITY_CODEX_CLI,
            Self::ClaudeCli => CAPABILITY_CLAUDE_CLI,
        }
    }

    pub fn agent_type(&self) -> &'static str {
        match self {
            Self::CodexCli => "codex",
            Self::ClaudeCli => "claude_code",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliRuntimeStatus {
    pub runtime: CliRuntimeKind,
    pub id: String,
    pub display_name: String,
    pub binary: String,
    pub installed: bool,
    pub version: Option<String>,
    pub capability: String,
    pub status: String,
    pub error: Option<String>,
}

pub fn detect_capabilities(codex_path: Option<&str>, claude_path: Option<&str>) -> Vec<String> {
    let mut capabilities = vec![CAPABILITY_TUNNEL_AVAILABLE.to_string()];

    if has_binary_hint(codex_path) {
        capabilities.push(CAPABILITY_CODEX_CLI.to_string());
    }
    if has_binary_hint(claude_path) {
        capabilities.push(CAPABILITY_CLAUDE_CLI.to_string());
    }

    capabilities
}

pub async fn refresh_cli_runtime_statuses() -> Vec<CliRuntimeStatus> {
    let codex = detect_cli_runtime(CliRuntimeKind::CodexCli, CliRuntimeKind::CodexCli.binary()).await;
    let claude =
        detect_cli_runtime(CliRuntimeKind::ClaudeCli, CliRuntimeKind::ClaudeCli.binary()).await;
    vec![codex, claude]
}

pub async fn refresh_cli_status_into_state(state: &AppState) -> Vec<CliRuntimeStatus> {
    let statuses = refresh_cli_runtime_statuses().await;
    apply_cli_statuses_to_state(state, &statuses);
    statuses
}

pub fn apply_cli_statuses_to_state(state: &AppState, statuses: &[CliRuntimeStatus]) {
    if let Ok(mut cli_runtimes) = state.cli_runtimes.write() {
        *cli_runtimes = statuses.to_vec();
    }
    if let Ok(mut capabilities) = state.capabilities.write() {
        let mut next = capabilities
            .iter()
            .filter(|capability| {
                capability.as_str() != CAPABILITY_CODEX_CLI
                    && capability.as_str() != CAPABILITY_CLAUDE_CLI
            })
            .cloned()
            .collect::<Vec<_>>();
        if !next.contains(&CAPABILITY_TUNNEL_AVAILABLE.to_string()) {
            next.push(CAPABILITY_TUNNEL_AVAILABLE.to_string());
        }
        for status in statuses {
            if status.installed && !next.contains(&status.capability) {
                next.push(status.capability.clone());
            }
        }
        *capabilities = next;
    }
}

pub async fn detect_cli_runtime(kind: CliRuntimeKind, binary: &str) -> CliRuntimeStatus {
    let output = Command::new(binary).arg("--version").output().await;
    match output {
        Ok(output) if output.status.success() => {
            let version = normalize_version_output(&output.stdout, &output.stderr);
            build_cli_status(kind, binary, true, version, None)
        }
        Ok(output) => {
            let message = normalize_version_output(&output.stderr, &output.stdout)
                .unwrap_or_else(|| format!("{binary} --version failed"));
            build_cli_status(kind, binary, false, None, Some(message))
        }
        Err(error) => build_cli_status(kind, binary, false, None, Some(error.to_string())),
    }
}

pub async fn dispatch_desktop_proxy(command: &str, payload: Value) -> Result<Value> {
    match command {
        "desktop_cli_status" => {
            let statuses = refresh_cli_runtime_statuses().await;
            Ok(json!({ "runtimes": statuses }))
        }
        "acp_list_agents" => {
            let statuses = refresh_cli_runtime_statuses().await;
            Ok(json!(
                statuses
                    .iter()
                    .map(status_to_agent_info)
                    .collect::<Vec<_>>()
            ))
        }
        "acp_describe_agent_options" => describe_agent_options(payload).await,
        "acp_prompt" => dispatch_prompt(payload).await,
        _ => Err(anyhow!("unsupported desktop proxy command: {command}")),
    }
}

async fn describe_agent_options(payload: Value) -> Result<Value> {
    let agent_type = payload
        .get("agentType")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    let runtime = runtime_from_agent_type(agent_type)
        .ok_or_else(|| anyhow!("unsupported desktop agent type: {agent_type}"))?;
    Ok(json!({
        "agentType": agent_type,
        "runtime": runtime.id(),
        "modes": null,
        "config_options": [],
        "message": "MCode Desktop uses local official CLI credentials; tokens are not sent to MCode app or gateway."
    }))
}

async fn dispatch_prompt(payload: Value) -> Result<Value> {
    let agent_type = payload
        .get("agentType")
        .and_then(Value::as_str)
        .or_else(|| payload.get("agent_type").and_then(Value::as_str))
        .unwrap_or("")
        .trim();
    let runtime = runtime_from_agent_type(agent_type)
        .ok_or_else(|| anyhow!("unsupported desktop agent type: {agent_type}"))?;

    match runtime {
        CliRuntimeKind::CodexCli => codex_cli::dispatch_codex_proxy("acp_prompt", payload).await,
        CliRuntimeKind::ClaudeCli => claude_cli::dispatch_claude_proxy("acp_prompt", payload).await,
    }
}

fn status_to_agent_info(status: &CliRuntimeStatus) -> Value {
    json!({
        "agent_type": status.runtime.agent_type(),
        "agentType": status.runtime.agent_type(),
        "name": status.display_name,
        "description": format!("{} via MCode Desktop local official CLI adapter.", status.display_name),
        "runtime": status.id,
        "installed": status.installed,
        "available": status.installed,
        "enabled": true,
        "version": status.version,
        "status": status.status,
        "capabilities": if status.installed { vec![status.capability.clone()] } else { Vec::<String>::new() },
    })
}

fn runtime_from_agent_type(value: &str) -> Option<CliRuntimeKind> {
    match value {
        "codex" | "codex_cli" | "codex-cli" => Some(CliRuntimeKind::CodexCli),
        "claude" | "claude_code" | "claude-cli" | "claude_cli" => Some(CliRuntimeKind::ClaudeCli),
        _ => None,
    }
}

fn build_cli_status(
    kind: CliRuntimeKind,
    binary: &str,
    installed: bool,
    version: Option<String>,
    error: Option<String>,
) -> CliRuntimeStatus {
    CliRuntimeStatus {
        id: kind.id().to_string(),
        display_name: kind.display_name().to_string(),
        binary: binary.to_string(),
        installed,
        version,
        capability: kind.capability().to_string(),
        status: if installed { "available" } else { "missing" }.to_string(),
        error,
        runtime: kind,
    }
}

fn normalize_version_output(stdout: &[u8], stderr: &[u8]) -> Option<String> {
    let stdout = String::from_utf8_lossy(stdout).trim().to_string();
    if !stdout.is_empty() {
        return Some(stdout.lines().next().unwrap_or("").trim().to_string());
    }
    let stderr = String::from_utf8_lossy(stderr).trim().to_string();
    if !stderr.is_empty() {
        return Some(stderr.lines().next().unwrap_or("").trim().to_string());
    }
    None
}

fn has_binary_hint(path: Option<&str>) -> bool {
    path.map(|value| !value.trim().is_empty()).unwrap_or(false)
}
