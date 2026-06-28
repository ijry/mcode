pub mod claude_cli;
pub mod codex_cli;
pub mod events;
pub mod json_rpc;
pub mod process_stdio;

pub use events::{normalize_cli_output_events, AcpEventEnvelope};

use std::path::PathBuf;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{anyhow, Result};
use serde_json::{json, Value};
use tokio::process::Command;
use tokio::sync::oneshot;
use uuid::Uuid;

use crate::app_state::{AppState, CliInteractionWaiter, HostedActiveTurn};

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

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CliSessionStatus {
    Connected,
    Running,
    Completed,
    Canceled,
    Disconnected,
    Error,
    Interrupted,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliRuntimeSession {
    pub session_id: String,
    pub runtime: CliRuntimeKind,
    pub agent_type: String,
    pub working_dir: String,
    pub status: CliSessionStatus,
    pub protocol: Option<String>,
    pub provider_thread_id: Option<String>,
    pub active_turn_id: Option<String>,
    pub active_turn_owner_client_id: Option<String>,
    pub active_turn_started_at_ms: Option<u64>,
    pub app_server_active: bool,
    pub created_at_ms: u64,
    pub updated_at_ms: u64,
    pub active_request_id: Option<String>,
    pub cancel_requested: bool,
    #[serde(default)]
    pub cancel_requested_by_client_id: Option<String>,
    #[serde(default)]
    pub cancel_requested_at_ms: Option<u64>,
    #[serde(default)]
    pub cancel_reason: Option<String>,
    pub last_prompt_preview: Option<String>,
    pub error: Option<String>,
    pub last_event_at_ms: Option<u64>,
    pub exit_code: Option<i32>,
    pub stderr_preview: Option<String>,
}

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliPendingInteraction {
    pub interaction_id: String,
    pub session_id: String,
    pub kind: String,
    pub status: String,
    pub created_at_ms: u64,
    pub resolved_at_ms: Option<u64>,
    pub decision: Option<String>,
    pub value: Option<Value>,
    pub responder_client_id: Option<String>,
    pub summary: String,
    pub data: Value,
}

pub type CliEventSink = Arc<dyn Fn(AcpEventEnvelope) + Send + Sync>;
const DEFAULT_PROMPT_QUEUE_LIMIT: usize = 20;

#[derive(Clone)]
pub struct QueuedPromptItem {
    pub queue_item_id: String,
    pub session_id: String,
    pub runtime: CliRuntimeKind,
    pub agent_type: String,
    pub payload: Value,
    pub source_client_id: Option<String>,
    pub source_device_name: Option<String>,
    pub prompt_preview: Option<String>,
    pub created_at_ms: u64,
    pub event_sink: Option<CliEventSink>,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueuedPromptSnapshot {
    pub queue_item_id: String,
    pub session_id: String,
    pub runtime: CliRuntimeKind,
    pub agent_type: String,
    pub source_client_id: Option<String>,
    pub source_device_name: Option<String>,
    pub prompt_preview: Option<String>,
    pub created_at_ms: u64,
    pub queue_position: usize,
    pub queue_length: usize,
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
    let codex =
        detect_cli_runtime(CliRuntimeKind::CodexCli, CliRuntimeKind::CodexCli.binary()).await;
    let claude = detect_cli_runtime(
        CliRuntimeKind::ClaudeCli,
        CliRuntimeKind::ClaudeCli.binary(),
    )
    .await;
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
    let state = AppState::new_for_test();
    dispatch_desktop_proxy_with_state(&state, command, payload).await
}

pub async fn dispatch_desktop_proxy_with_state(
    state: &AppState,
    command: &str,
    payload: Value,
) -> Result<Value> {
    dispatch_desktop_proxy_with_event_sink(state, command, payload, None).await
}

pub async fn dispatch_desktop_proxy_with_event_sink(
    state: &AppState,
    command: &str,
    payload: Value,
    event_sink: Option<CliEventSink>,
) -> Result<Value> {
    match command {
        "desktop_cli_status" => {
            let statuses = refresh_cli_runtime_statuses().await;
            Ok(json!({ "runtimes": statuses }))
        }
        "acp_list_agents" => {
            let statuses = refresh_cli_runtime_statuses().await;
            Ok(json!(statuses
                .iter()
                .map(status_to_agent_info)
                .collect::<Vec<_>>()))
        }
        "acp_describe_agent_options" => describe_agent_options(payload).await,
        "acp_connect" => connect_cli_session(state, payload),
        "acp_disconnect" => close_cli_session(state, payload, CliSessionStatus::Disconnected).await,
        "acp_cancel" => cancel_cli_session(state, payload, event_sink).await,
        "acp_cancel_queued_prompt" => cancel_queued_prompt(state, payload, event_sink),
        "acp_get_session_snapshot" | "acp_get_sessions" => get_session_snapshot(state, payload),
        "acp_respond_permission" => respond_permission(state, payload),
        "acp_respond_question" => respond_question(state, payload),
        "acp_prompt" => dispatch_prompt_with_state(state, payload, event_sink).await,
        _ => Err(anyhow!("unsupported desktop proxy command: {command}")),
    }
}

pub async fn dispatch_desktop_proxy_with_event_sink_arc(
    state: Arc<AppState>,
    command: &str,
    payload: Value,
    event_sink: Option<CliEventSink>,
) -> Result<Value> {
    match command {
        "acp_prompt" => dispatch_prompt_with_state_arc(state, payload, event_sink).await,
        "acp_cancel" => {
            let session_id = extract_session_id(&payload).map(ToString::to_string);
            let result = cancel_cli_session(state.as_ref(), payload, event_sink.clone()).await;
            if result.is_ok() {
                if let Some(session_id) = session_id {
                    start_next_queued_prompt_if_idle(Arc::clone(&state), session_id, event_sink);
                }
            }
            result
        }
        "acp_cancel_queued_prompt" => cancel_queued_prompt(state.as_ref(), payload, event_sink),
        _ => {
            dispatch_desktop_proxy_with_event_sink(state.as_ref(), command, payload, event_sink)
                .await
        }
    }
}

async fn describe_agent_options(payload: Value) -> Result<Value> {
    let agent_type = extract_agent_type(&payload).unwrap_or_default();
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

async fn dispatch_prompt_with_event_sink(
    payload: Value,
    event_sink: Option<CliEventSink>,
) -> Result<Value> {
    let agent_type = extract_agent_type(&payload).unwrap_or_default();
    let runtime = runtime_from_agent_type(agent_type)
        .ok_or_else(|| anyhow!("unsupported desktop agent type: {agent_type}"))?;

    match runtime {
        CliRuntimeKind::CodexCli => {
            codex_cli::dispatch_codex_proxy("acp_prompt", payload, event_sink).await
        }
        CliRuntimeKind::ClaudeCli => {
            claude_cli::dispatch_claude_proxy("acp_prompt", payload, event_sink).await
        }
    }
}

fn connect_cli_session(state: &AppState, payload: Value) -> Result<Value> {
    let requested_session_id = extract_session_id(&payload).map(ToString::to_string);
    let existing = requested_session_id
        .as_ref()
        .and_then(|session_id| find_cli_session(state, session_id));

    if requested_session_id.is_some() && existing.is_none() {
        return Err(anyhow!(
            "cli session not found: {}",
            requested_session_id.unwrap_or_default()
        ));
    }

    let runtime = resolve_runtime_for_session(&payload, existing.as_ref())?;
    let working_dir = resolve_working_dir_for_session(&payload, existing.as_ref())?;
    let now = now_ms();
    let session = if let Some(mut session) = existing {
        if session.runtime != runtime {
            return Err(anyhow!(
                "cli session {} belongs to {}",
                session.session_id,
                session.runtime.id()
            ));
        }
        session.working_dir = working_dir;
        session.status = CliSessionStatus::Connected;
        session.updated_at_ms = now;
        session.active_request_id = None;
        session.cancel_requested = false;
        session.cancel_requested_by_client_id = None;
        session.cancel_requested_at_ms = None;
        session.cancel_reason = None;
        session.error = None;
        session
    } else {
        CliRuntimeSession {
            session_id: format!("cli-{}", Uuid::new_v4()),
            runtime: runtime.clone(),
            agent_type: runtime.agent_type().to_string(),
            working_dir,
            status: CliSessionStatus::Connected,
            protocol: None,
            provider_thread_id: None,
            active_turn_id: None,
            active_turn_owner_client_id: None,
            active_turn_started_at_ms: None,
            app_server_active: false,
            created_at_ms: now,
            updated_at_ms: now,
            active_request_id: None,
            cancel_requested: false,
            cancel_requested_by_client_id: None,
            cancel_requested_at_ms: None,
            cancel_reason: None,
            last_prompt_preview: None,
            error: None,
            last_event_at_ms: None,
            exit_code: None,
            stderr_preview: None,
        }
    };

    upsert_cli_session(state, session.clone())?;
    let _ = crate::recovery::save_recovery_snapshot(state);
    Ok(session_response(&session))
}

async fn close_cli_session(
    state: &AppState,
    payload: Value,
    status: CliSessionStatus,
) -> Result<Value> {
    let session_id = extract_session_id(&payload)
        .ok_or_else(|| anyhow!("cli session id is required"))?
        .to_string();
    let session = {
        let now = now_ms();
        let mut sessions = state
            .cli_sessions
            .write()
            .map_err(|_| anyhow!("cli session lock poisoned"))?;
        let session = sessions
            .iter_mut()
            .find(|session| session.session_id == session_id)
            .ok_or_else(|| anyhow!("cli session not found: {session_id}"))?;

        session.status = status.clone();
        session.updated_at_ms = now;
        session.active_request_id = None;
        session.cancel_requested = status == CliSessionStatus::Canceled;
        session.error = None;
        session.active_turn_id = None;
        session.active_turn_owner_client_id = None;
        session.active_turn_started_at_ms = None;
        if status == CliSessionStatus::Disconnected {
            session.app_server_active = false;
        }
        session.clone()
    };

    if status == CliSessionStatus::Disconnected {
        codex_cli::stop_codex_app_server_session(state, &session_id).await;
    }
    end_hosted_turn(state, &session_id);
    let _ = crate::recovery::save_recovery_snapshot(state);

    Ok(json!({
        "id": session.session_id,
        "connectionId": session.session_id,
        "sessionId": session.session_id,
        "session_id": session.session_id,
        "status": session.status,
        "canceled": status == CliSessionStatus::Canceled,
        "session": session,
    }))
}

async fn cancel_cli_session(
    state: &AppState,
    payload: Value,
    event_sink: Option<CliEventSink>,
) -> Result<Value> {
    let session_id = extract_session_id(&payload)
        .ok_or_else(|| anyhow!("cli session id is required"))?
        .to_string();
    let cancel_snapshot = request_hosted_turn_cancel(
        state,
        &session_id,
        extract_source_client_id(&payload),
        extract_cancel_reason(&payload),
    )?;
    if let Some(snapshot) = cancel_snapshot.as_ref() {
        if !snapshot.already_requested {
            emit_event(&event_sink, turn_cancel_requested_event(snapshot));
        }
    }

    cancel_active_process(state, &session_id);
    let response = close_cli_session(state, payload, CliSessionStatus::Canceled).await?;

    if let Some(snapshot) = cancel_snapshot.as_ref() {
        if !snapshot.already_requested {
            emit_event(&event_sink, turn_cancelled_event(snapshot));
        }
        return Ok(json!({
            "id": session_id,
            "connectionId": session_id,
            "sessionId": session_id,
            "session_id": session_id,
            "status": "canceled",
            "cancelStatus": "cancel_requested",
            "canceled": true,
            "activeTurnId": snapshot.active_turn_id,
            "activeTurnOwnerClientId": snapshot.owner_client_id,
            "cancelRequestedByClientId": snapshot.cancel_requested_by_client_id,
            "cancelRequestedAtMs": snapshot.cancel_requested_at_ms,
            "reason": snapshot.cancel_reason,
            "session": response.get("session").cloned().unwrap_or(Value::Null),
        }));
    }

    Ok(response)
}

fn get_session_snapshot(state: &AppState, payload: Value) -> Result<Value> {
    let sessions = state
        .cli_sessions
        .read()
        .map_err(|_| anyhow!("cli session lock poisoned"))?
        .clone();

    if let Some(session_id) = extract_session_id(&payload) {
        let session = sessions
            .iter()
            .find(|session| session.session_id == session_id)
            .cloned()
            .ok_or_else(|| anyhow!("cli session not found: {session_id}"))?;
        return Ok(json!({
            "id": session.session_id,
            "connectionId": session.session_id,
            "sessionId": session.session_id,
            "session_id": session.session_id,
            "session": session,
        }));
    }

    Ok(json!({
        "sessions": sessions,
    }))
}

async fn dispatch_prompt_with_state(
    state: &AppState,
    payload: Value,
    event_sink: Option<CliEventSink>,
) -> Result<Value> {
    let Some(session_id) = extract_session_id(&payload).map(ToString::to_string) else {
        return dispatch_prompt_with_event_sink(payload, event_sink).await;
    };

    let running_session = match mark_prompt_started(state, &session_id, &payload) {
        Ok(session) => session,
        Err(error) if is_turn_busy_error(&error) && should_queue_if_busy(&payload) => {
            return enqueue_prompt_when_busy(state, &session_id, payload, event_sink);
        }
        Err(error) => return Err(error),
    };
    let prompt_payload = merge_session_into_prompt_payload(payload, &running_session);
    let result = dispatch_session_prompt(state, &running_session, prompt_payload, event_sink).await;
    match result {
        Ok(body) => {
            capture_pending_interactions_from_response(state, &session_id, &body);
            let completed = mark_session_completed(state, &session_id, &body)?;
            Ok(attach_session_to_response(body, completed))
        }
        Err(error) => {
            if is_turn_busy_error(&error) {
                return Err(error);
            }
            mark_session_error(state, &session_id, error.to_string())?;
            Err(error)
        }
    }
}

async fn dispatch_prompt_with_state_arc(
    state: Arc<AppState>,
    payload: Value,
    event_sink: Option<CliEventSink>,
) -> Result<Value> {
    let Some(session_id) = extract_session_id(&payload).map(ToString::to_string) else {
        return dispatch_prompt_with_event_sink(payload, event_sink).await;
    };

    let running_session = match mark_prompt_started(state.as_ref(), &session_id, &payload) {
        Ok(session) => session,
        Err(error) if is_turn_busy_error(&error) && should_queue_if_busy(&payload) => {
            return enqueue_prompt_when_busy(state.as_ref(), &session_id, payload, event_sink);
        }
        Err(error) => return Err(error),
    };
    let prompt_payload = merge_session_into_prompt_payload(payload, &running_session);
    let queue_event_sink = event_sink.clone();
    let result = dispatch_session_prompt_arc(
        Arc::clone(&state),
        &running_session,
        prompt_payload,
        event_sink,
    )
    .await;
    match result {
        Ok(body) => {
            capture_pending_interactions_from_response(state.as_ref(), &session_id, &body);
            let completed = mark_session_completed(state.as_ref(), &session_id, &body)?;
            start_next_queued_prompt_if_idle(
                Arc::clone(&state),
                session_id.clone(),
                queue_event_sink.clone(),
            );
            Ok(attach_session_to_response(body, completed))
        }
        Err(error) => {
            if is_turn_busy_error(&error) {
                return Err(error);
            }
            mark_session_error(state.as_ref(), &session_id, error.to_string())?;
            start_next_queued_prompt_if_idle(
                Arc::clone(&state),
                session_id.clone(),
                queue_event_sink.clone(),
            );
            Err(error)
        }
    }
}

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

fn resolve_runtime_for_session(
    payload: &Value,
    existing: Option<&CliRuntimeSession>,
) -> Result<CliRuntimeKind> {
    if let Some(agent_type) = extract_agent_type(payload) {
        return runtime_from_agent_type(agent_type)
            .ok_or_else(|| anyhow!("unsupported desktop agent type: {agent_type}"));
    }
    existing
        .map(|session| session.runtime.clone())
        .ok_or_else(|| anyhow!("agentType is required for acp_connect"))
}

fn resolve_working_dir_for_session(
    payload: &Value,
    existing: Option<&CliRuntimeSession>,
) -> Result<String> {
    if let Some(working_dir) = extract_working_dir(payload) {
        return normalize_working_dir(working_dir);
    }
    if let Some(session) = existing {
        return Ok(session.working_dir.clone());
    }
    normalize_working_dir("")
}

fn mark_prompt_started(
    state: &AppState,
    session_id: &str,
    payload: &Value,
) -> Result<CliRuntimeSession> {
    {
        let sessions = state
            .cli_sessions
            .read()
            .map_err(|_| anyhow!("cli session lock poisoned"))?;
        let session = sessions
            .iter()
            .find(|session| session.session_id == session_id)
            .ok_or_else(|| anyhow!("cli session not found: {session_id}"))?;
        if let Some(agent_type) = extract_agent_type(payload) {
            let runtime = runtime_from_agent_type(agent_type)
                .ok_or_else(|| anyhow!("unsupported desktop agent type: {agent_type}"))?;
            if runtime != session.runtime {
                return Err(anyhow!(
                    "cli session {} belongs to {}",
                    session.session_id,
                    session.runtime.id()
                ));
            }
        }
    }

    begin_hosted_turn(
        state,
        session_id,
        extract_request_id(payload)
            .map(ToString::to_string)
            .unwrap_or_else(|| format!("turn-{}", Uuid::new_v4())),
        extract_source_client_id(payload),
    )?;
    let mut sessions = state
        .cli_sessions
        .write()
        .map_err(|_| anyhow!("cli session lock poisoned"))?;
    let session = sessions
        .iter_mut()
        .find(|session| session.session_id == session_id)
        .ok_or_else(|| {
            end_hosted_turn(state, session_id);
            anyhow!("cli session not found: {session_id}")
        })?;

    if let Some(agent_type) = extract_agent_type(payload) {
        let runtime = runtime_from_agent_type(agent_type)
            .ok_or_else(|| anyhow!("unsupported desktop agent type: {agent_type}"))?;
        if runtime != session.runtime {
            end_hosted_turn(state, session_id);
            return Err(anyhow!(
                "cli session {} belongs to {}",
                session.session_id,
                session.runtime.id()
            ));
        }
    }

    session.status = CliSessionStatus::Running;
    session.updated_at_ms = now_ms();
    session.active_request_id = extract_request_id(payload).map(ToString::to_string);
    session.cancel_requested = false;
    session.cancel_requested_by_client_id = None;
    session.cancel_requested_at_ms = None;
    session.cancel_reason = None;
    session.last_prompt_preview = extract_prompt_preview(payload);
    session.error = None;
    session.exit_code = None;
    session.stderr_preview = None;
    session.active_turn_id = None;
    session.active_turn_owner_client_id = extract_source_client_id(payload);
    session.active_turn_started_at_ms = Some(now_ms());
    let session = session.clone();
    drop(sessions);
    let _ = crate::recovery::save_recovery_snapshot(state);
    Ok(session)
}

fn mark_session_completed(
    state: &AppState,
    session_id: &str,
    body: &Value,
) -> Result<CliRuntimeSession> {
    let status = if body
        .get("canceled")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        CliSessionStatus::Canceled
    } else {
        CliSessionStatus::Completed
    };
    update_session_after_prompt(
        state,
        session_id,
        status,
        None,
        extract_exit_code(body),
        extract_stderr_preview(body),
        response_has_events(body),
        extract_protocol(body),
        extract_provider_thread_id(body),
        extract_active_turn_id(body),
        body.get("appServerActive").and_then(Value::as_bool),
    )
}

fn mark_session_error(
    state: &AppState,
    session_id: &str,
    error: String,
) -> Result<CliRuntimeSession> {
    update_session_after_prompt(
        state,
        session_id,
        CliSessionStatus::Error,
        Some(error),
        None,
        None,
        false,
        None,
        None,
        None,
        None,
    )
}

fn update_session_after_prompt(
    state: &AppState,
    session_id: &str,
    status: CliSessionStatus,
    error: Option<String>,
    exit_code: Option<i32>,
    stderr_preview: Option<String>,
    has_events: bool,
    protocol: Option<String>,
    provider_thread_id: Option<String>,
    active_turn_id: Option<String>,
    app_server_active: Option<bool>,
) -> Result<CliRuntimeSession> {
    let mut sessions = state
        .cli_sessions
        .write()
        .map_err(|_| anyhow!("cli session lock poisoned"))?;
    let session = sessions
        .iter_mut()
        .find(|session| session.session_id == session_id)
        .ok_or_else(|| anyhow!("cli session not found: {session_id}"))?;
    session.status = status;
    session.updated_at_ms = now_ms();
    session.active_request_id = None;
    session.error = error;
    session.exit_code = exit_code;
    session.stderr_preview = stderr_preview;
    session.protocol = protocol;
    session.provider_thread_id = provider_thread_id;
    session.active_turn_id = active_turn_id;
    session.active_turn_owner_client_id = None;
    session.active_turn_started_at_ms = None;
    session.app_server_active = app_server_active.unwrap_or(false);
    if has_events {
        session.last_event_at_ms = Some(now_ms());
    }
    let session = session.clone();
    drop(sessions);
    end_hosted_turn(state, session_id);
    let _ = crate::recovery::save_recovery_snapshot(state);
    Ok(session)
}

pub fn update_session_provider_diagnostics(
    state: &AppState,
    session_id: &str,
    protocol: Option<&str>,
    provider_thread_id: Option<String>,
    active_turn_id: Option<Option<String>>,
    app_server_active: Option<bool>,
    stderr_preview: Option<String>,
) {
    if let Ok(mut sessions) = state.cli_sessions.write() {
        if let Some(session) = sessions
            .iter_mut()
            .find(|session| session.session_id == session_id)
        {
            if let Some(protocol) = protocol {
                session.protocol = Some(protocol.to_string());
            }
            if let Some(provider_thread_id) = provider_thread_id {
                session.provider_thread_id = Some(provider_thread_id);
            }
            if let Some(active_turn_id) = active_turn_id {
                session.active_turn_id = active_turn_id;
            }
            if let Some(app_server_active) = app_server_active {
                session.app_server_active = app_server_active;
            }
            if let Some(stderr_preview) = stderr_preview {
                session.stderr_preview = Some(stderr_preview);
            }
            session.updated_at_ms = now_ms();
        }
    }
    let _ = crate::recovery::save_recovery_snapshot(state);
}

pub fn begin_hosted_turn(
    state: &AppState,
    session_id: &str,
    active_turn_id: impl Into<String>,
    owner_client_id: Option<String>,
) -> Result<()> {
    let active_turn_id = active_turn_id.into();
    let now = now_ms();
    let mut active = state
        .hosted_active_turns
        .lock()
        .map_err(|_| anyhow!("hosted active turn lock poisoned"))?;
    if let Some(existing) = active.get(session_id) {
        return Err(turn_busy_error(existing));
    }
    active.insert(
        session_id.to_string(),
        HostedActiveTurn {
            session_id: session_id.to_string(),
            active_turn_id: active_turn_id.clone(),
            owner_client_id: owner_client_id.clone(),
            started_at_ms: now,
            cancel_requested_by_client_id: None,
            cancel_requested_at_ms: None,
            cancel_reason: None,
        },
    );
    drop(active);
    update_session_active_turn_owner(
        state,
        session_id,
        Some(active_turn_id),
        owner_client_id,
        Some(now),
    );
    Ok(())
}

pub fn begin_hosted_turn_for_test(
    state: &AppState,
    session_id: &str,
    active_turn_id: &str,
    owner_client_id: Option<String>,
) -> Result<()> {
    begin_hosted_turn(
        state,
        session_id,
        active_turn_id.to_string(),
        owner_client_id,
    )
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HostedTurnCancelSnapshot {
    pub session_id: String,
    pub active_turn_id: String,
    pub owner_client_id: Option<String>,
    pub cancel_requested_by_client_id: Option<String>,
    pub cancel_requested_at_ms: Option<u64>,
    pub cancel_reason: Option<String>,
    pub already_requested: bool,
}

pub fn request_hosted_turn_cancel(
    state: &AppState,
    session_id: &str,
    requester_client_id: Option<String>,
    reason: Option<String>,
) -> Result<Option<HostedTurnCancelSnapshot>> {
    let mut active = state
        .hosted_active_turns
        .lock()
        .map_err(|_| anyhow!("hosted active turn lock poisoned"))?;
    let Some(turn) = active.get_mut(session_id) else {
        return Ok(None);
    };
    let already_requested = turn.cancel_requested_by_client_id.is_some();
    if !already_requested {
        turn.cancel_requested_by_client_id =
            requester_client_id.or_else(|| Some("unknown".to_string()));
        turn.cancel_requested_at_ms = Some(now_ms());
        turn.cancel_reason = reason;
    }
    let snapshot = HostedTurnCancelSnapshot {
        session_id: turn.session_id.clone(),
        active_turn_id: turn.active_turn_id.clone(),
        owner_client_id: turn.owner_client_id.clone(),
        cancel_requested_by_client_id: turn.cancel_requested_by_client_id.clone(),
        cancel_requested_at_ms: turn.cancel_requested_at_ms,
        cancel_reason: turn.cancel_reason.clone(),
        already_requested,
    };
    drop(active);
    update_session_cancel_request(
        state,
        session_id,
        snapshot.cancel_requested_by_client_id.clone(),
        snapshot.cancel_requested_at_ms,
        snapshot.cancel_reason.clone(),
    );
    Ok(Some(snapshot))
}

pub fn request_hosted_turn_cancel_for_test(
    state: &AppState,
    session_id: &str,
    requester_client_id: Option<String>,
    reason: Option<String>,
) -> Result<HostedTurnCancelSnapshot> {
    request_hosted_turn_cancel(state, session_id, requester_client_id, reason)?
        .ok_or_else(|| anyhow!("hosted active turn not found: {session_id}"))
}

pub fn end_hosted_turn(state: &AppState, session_id: &str) {
    if let Ok(mut active) = state.hosted_active_turns.lock() {
        active.remove(session_id);
    }
    update_session_active_turn_owner(state, session_id, None, None, None);
}

pub fn start_next_queued_prompt_if_idle(
    state: Arc<AppState>,
    session_id: String,
    event_sink: Option<CliEventSink>,
) {
    let active = state
        .hosted_active_turns
        .lock()
        .map(|active| active.contains_key(&session_id))
        .unwrap_or(true);
    if active {
        return;
    }
    let item = {
        let mut queues = match state.queued_prompts.lock() {
            Ok(queues) => queues,
            Err(_) => return,
        };
        let Some(queue) = queues.get_mut(&session_id) else {
            return;
        };
        if queue.is_empty() {
            queues.remove(&session_id);
            return;
        }
        let item = queue.remove(0);
        if queue.is_empty() {
            queues.remove(&session_id);
        }
        item
    };
    let snapshot = queued_prompt_snapshot(&item, 1, queued_prompt_count(&state, &session_id));
    let sink = item.event_sink.clone().or(event_sink);
    emit_event(&sink, turn_dequeued_event(&snapshot));
    emit_event(
        &sink,
        turn_started_event(&snapshot, Some(item.queue_item_id.clone())),
    );
    let prompt_state = Arc::clone(&state);
    tokio::spawn(async move {
        let result = dispatch_prompt_with_state_arc(
            Arc::clone(&prompt_state),
            item.payload,
            item.event_sink.clone(),
        )
        .await;
        if let Err(error) = result {
            emit_event(
                &item.event_sink,
                turn_queue_failed_event(&snapshot, &error.to_string()),
            );
        }
    });
}

fn queued_prompt_count(state: &AppState, session_id: &str) -> usize {
    state
        .queued_prompts
        .lock()
        .ok()
        .and_then(|queues| queues.get(session_id).map(Vec::len))
        .unwrap_or(0)
}

fn update_session_active_turn_owner(
    state: &AppState,
    session_id: &str,
    active_turn_id: Option<String>,
    owner_client_id: Option<String>,
    started_at_ms: Option<u64>,
) {
    if let Ok(mut sessions) = state.cli_sessions.write() {
        if let Some(session) = sessions
            .iter_mut()
            .find(|session| session.session_id == session_id)
        {
            session.active_turn_id = active_turn_id;
            session.active_turn_owner_client_id = owner_client_id;
            session.active_turn_started_at_ms = started_at_ms;
            session.updated_at_ms = now_ms();
        }
    }
}

fn update_session_cancel_request(
    state: &AppState,
    session_id: &str,
    requester_client_id: Option<String>,
    requested_at_ms: Option<u64>,
    reason: Option<String>,
) {
    if let Ok(mut sessions) = state.cli_sessions.write() {
        if let Some(session) = sessions
            .iter_mut()
            .find(|session| session.session_id == session_id)
        {
            session.cancel_requested = true;
            session.cancel_requested_by_client_id = requester_client_id;
            session.cancel_requested_at_ms = requested_at_ms;
            session.cancel_reason = reason;
            session.updated_at_ms = now_ms();
        }
    }
}

fn should_queue_if_busy(payload: &Value) -> bool {
    !payload
        .get("queueIfBusy")
        .or_else(|| payload.get("queue_if_busy"))
        .and_then(Value::as_bool)
        .map(|value| !value)
        .unwrap_or(false)
}

fn enqueue_prompt_when_busy(
    state: &AppState,
    session_id: &str,
    payload: Value,
    event_sink: Option<CliEventSink>,
) -> Result<Value> {
    let session = find_cli_session(state, session_id)
        .ok_or_else(|| anyhow!("cli session not found: {session_id}"))?;
    let active_turn = state
        .hosted_active_turns
        .lock()
        .map_err(|_| anyhow!("hosted active turn lock poisoned"))?
        .get(session_id)
        .cloned();
    let Some(active_turn) = active_turn else {
        return Err(anyhow!(
            "active turn not found for busy session: {session_id}"
        ));
    };
    let item = QueuedPromptItem {
        queue_item_id: format!("queue-{}", Uuid::new_v4()),
        session_id: session_id.to_string(),
        runtime: session.runtime.clone(),
        agent_type: session.agent_type.clone(),
        source_client_id: extract_source_client_id(&payload),
        source_device_name: extract_source_device_name(&payload),
        prompt_preview: extract_prompt_preview(&payload),
        created_at_ms: now_ms(),
        payload,
        event_sink: event_sink.clone(),
    };
    let snapshot = push_queued_prompt(state, item)?;
    emit_event(&event_sink, turn_queued_event(&snapshot));
    emit_event(&event_sink, turn_queue_updated_event(&snapshot));
    Ok(json!({
        "status": "queued",
        "queued": true,
        "queueItemId": snapshot.queue_item_id,
        "queuePosition": snapshot.queue_position,
        "queueLength": snapshot.queue_length,
        "sessionId": snapshot.session_id,
        "connectionId": snapshot.session_id,
        "activeTurnId": active_turn.active_turn_id,
        "activeTurnOwnerClientId": active_turn.owner_client_id,
        "sourceClientId": snapshot.source_client_id,
        "promptPreview": snapshot.prompt_preview,
        "createdAtMs": snapshot.created_at_ms,
    }))
}

fn push_queued_prompt(state: &AppState, item: QueuedPromptItem) -> Result<QueuedPromptSnapshot> {
    let mut queues = state
        .queued_prompts
        .lock()
        .map_err(|_| anyhow!("queued prompt lock poisoned"))?;
    let queue = queues.entry(item.session_id.clone()).or_default();
    if queue.len() >= DEFAULT_PROMPT_QUEUE_LIMIT {
        return Err(anyhow!(
            "{}",
            json!({
                "code": "turn_queue_full",
                "message": "prompt queue is full",
                "sessionId": item.session_id,
                "queueLimit": DEFAULT_PROMPT_QUEUE_LIMIT,
                "retryable": true,
            })
        ));
    }
    queue.push(item);
    let position = queue.len();
    let snapshot = queued_prompt_snapshot(
        queue
            .last()
            .ok_or_else(|| anyhow!("queued prompt was not stored"))?,
        position,
        queue.len(),
    );
    Ok(snapshot)
}

fn cancel_queued_prompt(
    state: &AppState,
    payload: Value,
    event_sink: Option<CliEventSink>,
) -> Result<Value> {
    let session_id = extract_session_id(&payload)
        .ok_or_else(|| anyhow!("cli session id is required"))?
        .to_string();
    let queue_item_id = extract_queue_item_id(&payload)
        .ok_or_else(|| anyhow!("queueItemId is required"))?
        .to_string();
    let mut queues = state
        .queued_prompts
        .lock()
        .map_err(|_| anyhow!("queued prompt lock poisoned"))?;
    let queue = queues
        .get_mut(&session_id)
        .ok_or_else(|| anyhow!("queued prompt not found: {queue_item_id}"))?;
    let index = queue
        .iter()
        .position(|item| item.queue_item_id == queue_item_id)
        .ok_or_else(|| anyhow!("queued prompt not found: {queue_item_id}"))?;
    let item = queue.remove(index);
    let queue_length = queue.len();
    let snapshot = queued_prompt_snapshot(&item, index + 1, queue_length);
    if queue.is_empty() {
        queues.remove(&session_id);
    }
    drop(queues);
    emit_event(&event_sink, turn_queue_cancelled_event(&snapshot));
    emit_event(&event_sink, turn_queue_updated_event(&snapshot));
    Ok(json!({
        "status": "cancelled",
        "queueItemId": snapshot.queue_item_id,
        "sessionId": snapshot.session_id,
        "queueLength": queue_length,
    }))
}

fn queued_prompt_snapshot(
    item: &QueuedPromptItem,
    queue_position: usize,
    queue_length: usize,
) -> QueuedPromptSnapshot {
    QueuedPromptSnapshot {
        queue_item_id: item.queue_item_id.clone(),
        session_id: item.session_id.clone(),
        runtime: item.runtime.clone(),
        agent_type: item.agent_type.clone(),
        source_client_id: item.source_client_id.clone(),
        source_device_name: item.source_device_name.clone(),
        prompt_preview: item.prompt_preview.clone(),
        created_at_ms: item.created_at_ms,
        queue_position,
        queue_length,
    }
}

pub fn queued_prompt_snapshots(state: &AppState) -> Vec<QueuedPromptSnapshot> {
    state
        .queued_prompts
        .lock()
        .map(|queues| {
            queues
                .values()
                .flat_map(|queue| {
                    let queue_length = queue.len();
                    queue.iter().enumerate().map(move |(index, item)| {
                        queued_prompt_snapshot(item, index + 1, queue_length)
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn turn_queued_event(snapshot: &QueuedPromptSnapshot) -> AcpEventEnvelope {
    queue_event("turn_queued", snapshot)
}

fn turn_queue_updated_event(snapshot: &QueuedPromptSnapshot) -> AcpEventEnvelope {
    queue_event("turn_queue_updated", snapshot)
}

fn turn_queue_cancelled_event(snapshot: &QueuedPromptSnapshot) -> AcpEventEnvelope {
    queue_event("turn_queue_cancelled", snapshot)
}

fn turn_dequeued_event(snapshot: &QueuedPromptSnapshot) -> AcpEventEnvelope {
    queue_event("turn_dequeued", snapshot)
}

fn turn_started_event(
    snapshot: &QueuedPromptSnapshot,
    active_turn_id: Option<String>,
) -> AcpEventEnvelope {
    let mut event = queue_event("turn_started", snapshot);
    if let Value::Object(ref mut data) = event.data {
        data.insert(
            "activeTurnId".to_string(),
            Value::String(active_turn_id.unwrap_or_else(|| snapshot.queue_item_id.clone())),
        );
    }
    event
}

fn turn_queue_failed_event(snapshot: &QueuedPromptSnapshot, message: &str) -> AcpEventEnvelope {
    let mut event = queue_event("turn_queue_failed", snapshot);
    if let Value::Object(ref mut data) = event.data {
        data.insert("message".to_string(), Value::String(message.to_string()));
    }
    event
}

fn queue_event(event_type: &str, snapshot: &QueuedPromptSnapshot) -> AcpEventEnvelope {
    AcpEventEnvelope {
        event_type: event_type.to_string(),
        connection_id: snapshot.session_id.clone(),
        data: json!({
            "sessionId": snapshot.session_id,
            "queueItemId": snapshot.queue_item_id,
            "queuePosition": snapshot.queue_position,
            "queueLength": snapshot.queue_length,
            "sourceClientId": snapshot.source_client_id,
            "sourceDeviceName": snapshot.source_device_name,
            "promptPreview": snapshot.prompt_preview,
            "createdAtMs": snapshot.created_at_ms,
            "runtime": snapshot.runtime.id(),
            "agentType": snapshot.agent_type,
        }),
    }
}

fn turn_busy_error(existing: &HostedActiveTurn) -> anyhow::Error {
    anyhow!(
        "{}",
        json!({
            "code": "turn_busy",
            "message": "another device is running a turn",
            "activeTurnId": existing.active_turn_id,
            "activeTurnOwnerClientId": existing.owner_client_id,
            "cancelRequestedByClientId": existing.cancel_requested_by_client_id,
            "cancelRequestedAtMs": existing.cancel_requested_at_ms,
            "retryable": true,
        })
    )
}

fn is_turn_busy_error(error: &anyhow::Error) -> bool {
    error.to_string().contains("\"code\":\"turn_busy\"")
}

pub fn mark_session_event(state: &AppState, session_id: &str) {
    if let Ok(mut sessions) = state.cli_sessions.write() {
        if let Some(session) = sessions
            .iter_mut()
            .find(|session| session.session_id == session_id)
        {
            session.last_event_at_ms = Some(now_ms());
            session.updated_at_ms = now_ms();
        }
    }
    let _ = crate::recovery::save_recovery_snapshot(state);
}

fn cancel_active_process(state: &AppState, session_id: &str) {
    if let Ok(mut processes) = state.cli_processes.lock() {
        if let Some(mut process) = processes.remove(session_id) {
            let _ = process.cancel_tx.take().map(|cancel_tx| cancel_tx.send(()));
        }
    }
}

pub fn capture_pending_interaction(state: &AppState, session_id: &str, event: &AcpEventEnvelope) {
    let kind = match event.event_type.as_str() {
        "permission_request" => "permission",
        "question_request" => "question",
        _ => return,
    };
    let interaction_id = interaction_id_from_event(kind, &event.data);
    let summary = interaction_summary(kind, &event.data);
    let now = now_ms();
    if let Ok(mut interactions) = state.cli_pending_interactions.write() {
        interactions.retain(|existing| {
            !(existing.session_id == session_id && existing.interaction_id == interaction_id)
        });
        interactions.push(CliPendingInteraction {
            interaction_id,
            session_id: session_id.to_string(),
            kind: kind.to_string(),
            status: "pending".to_string(),
            created_at_ms: now,
            resolved_at_ms: None,
            decision: None,
            value: None,
            responder_client_id: None,
            summary,
            data: event.data.clone(),
        });
        if interactions.len() > 100 {
            let excess = interactions.len() - 100;
            interactions.drain(0..excess);
        }
    }
    let _ = crate::recovery::save_recovery_snapshot(state);
}

pub fn register_live_interaction_waiter(
    state: &AppState,
    session_id: &str,
    kind: &str,
    source: Option<String>,
    data: Value,
) -> Result<(String, oneshot::Receiver<Value>)> {
    let event_type = match kind {
        "permission" => "permission_request",
        "question" => "question_request",
        _ => return Err(anyhow!("unsupported live interaction kind: {kind}")),
    };
    let event = AcpEventEnvelope {
        event_type: event_type.to_string(),
        connection_id: session_id.to_string(),
        data,
    };
    capture_pending_interaction(state, session_id, &event);
    let interaction_id = interaction_id_from_event(kind, &event.data);
    let (response_tx, response_rx) = oneshot::channel::<Value>();
    let waiter = CliInteractionWaiter {
        session_id: session_id.to_string(),
        interaction_id: interaction_id.clone(),
        kind: kind.to_string(),
        source,
        created_at_ms: now_ms(),
        response_tx,
    };
    let key = live_interaction_key(session_id, kind, &interaction_id);
    let mut waiters = state
        .cli_interaction_waiters
        .lock()
        .map_err(|_| anyhow!("cli interaction waiter lock poisoned"))?;
    waiters.insert(key, waiter);
    Ok((interaction_id, response_rx))
}

fn capture_pending_interactions_from_response(state: &AppState, session_id: &str, body: &Value) {
    let Some(events) = body.get("events").and_then(Value::as_array) else {
        return;
    };
    let streamed_event_count = body
        .get("streamedEventCount")
        .and_then(Value::as_u64)
        .unwrap_or(0) as usize;
    for event in events.iter().skip(streamed_event_count) {
        let event_type = event
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        if event_type != "permission_request" && event_type != "question_request" {
            continue;
        }
        let data = event.get("data").cloned().unwrap_or_else(|| json!({}));
        capture_pending_interaction(
            state,
            session_id,
            &AcpEventEnvelope {
                event_type,
                connection_id: session_id.to_string(),
                data,
            },
        );
    }
    let _ = crate::recovery::save_recovery_snapshot(state);
}

fn respond_permission(state: &AppState, payload: Value) -> Result<Value> {
    respond_interaction(state, payload, "permission")
}

fn respond_question(state: &AppState, payload: Value) -> Result<Value> {
    respond_interaction(state, payload, "question")
}

fn respond_interaction(state: &AppState, payload: Value, kind: &str) -> Result<Value> {
    let session_id = extract_session_id(&payload)
        .ok_or_else(|| anyhow!("cli session id is required"))?
        .to_string();
    let interaction_id = extract_interaction_id(&payload, kind)
        .ok_or_else(|| anyhow!("{kind} interaction id is required"))?
        .to_string();
    let decision = payload
        .get("decision")
        .and_then(Value::as_str)
        .or_else(|| payload.get("response").and_then(Value::as_str))
        .or_else(|| payload.get("answer").and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .unwrap_or_else(|| "resolved".to_string());
    let value = payload
        .get("value")
        .cloned()
        .or_else(|| payload.get("answer").cloned())
        .or_else(|| payload.get("response").cloned());
    let responder_client_id = extract_source_client_id(&payload);
    let interaction = mark_interaction_resolved(
        state,
        &session_id,
        &interaction_id,
        kind,
        decision.clone(),
        value.clone(),
        responder_client_id,
    )?;
    let event = resolved_interaction_event(&session_id, &interaction, &decision, value.clone());
    let live_resolved = resolve_live_interaction_waiter(
        state,
        &session_id,
        &interaction_id,
        kind,
        &decision,
        value.clone(),
        &interaction,
    );

    Ok(json!({
        "ok": true,
        "sessionId": session_id,
        "interactionId": interaction_id,
        "kind": kind,
        "status": "resolved",
        "decision": decision,
        "value": value,
        "responderClientId": interaction.responder_client_id,
        "liveResolved": live_resolved,
        "interaction": interaction,
        "events": [event],
        "eventCount": 1,
    }))
}

fn resolve_live_interaction_waiter(
    state: &AppState,
    session_id: &str,
    interaction_id: &str,
    kind: &str,
    decision: &str,
    value: Option<Value>,
    interaction: &CliPendingInteraction,
) -> bool {
    let key = live_interaction_key(session_id, kind, interaction_id);
    let waiter = state
        .cli_interaction_waiters
        .lock()
        .ok()
        .and_then(|mut waiters| waiters.remove(&key));
    let Some(waiter) = waiter else {
        return false;
    };
    let response = format_live_interaction_response(
        kind,
        waiter.source.as_deref(),
        decision,
        value,
        interaction,
    );
    waiter.response_tx.send(response).is_ok()
}

fn format_live_interaction_response(
    kind: &str,
    source: Option<&str>,
    decision: &str,
    value: Option<Value>,
    interaction: &CliPendingInteraction,
) -> Value {
    if kind == "question" {
        return format_live_question_response(source, value, interaction);
    }
    format_live_permission_response(source, decision, value)
}

fn format_live_permission_response(
    source: Option<&str>,
    decision: &str,
    value: Option<Value>,
) -> Value {
    let outcome = normalize_permission_outcome(decision);
    let option_id = value
        .as_ref()
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(decision);
    let option_id = option_id.to_string();

    match source {
        Some("item/commandExecution/requestApproval") | Some("item/fileChange/requestApproval") => {
            json!({
                "decision": match outcome {
                    "allow" => "accept",
                    "deny" => "decline",
                    _ => "cancel",
                }
            })
        }
        Some("item/permissions/requestApproval") => {
            if outcome == "allow" {
                json!({
                    "permissions": {
                        "type": "managed",
                        "network": { "enabled": true },
                        "fileSystem": { "type": "fullAccess" }
                    },
                    "scope": if option_id.contains("session") { "session" } else { "turn" },
                })
            } else {
                json!({
                    "permissions": {
                        "type": "managed",
                        "network": { "enabled": false },
                        "fileSystem": { "type": "readOnly" }
                    }
                })
            }
        }
        Some("claude/requestApproval") => json!({
            "behavior": if outcome == "allow" { "allow" } else { "deny" }
        }),
        Some("mcpServer/elicitation/request") => {
            if outcome == "allow" {
                json!({
                    "action": "accept",
                    "content": value.unwrap_or_else(|| json!({ "optionId": option_id })),
                    "_meta": { "source": "mcode-desktop" },
                })
            } else {
                json!({
                    "action": if outcome == "cancelled" { "cancel" } else { "decline" },
                    "content": {},
                    "_meta": { "source": "mcode-desktop" },
                })
            }
        }
        _ => {
            if outcome == "cancelled" {
                json!({ "outcome": { "outcome": "cancelled" } })
            } else {
                json!({ "outcome": { "outcome": "selected", "optionId": option_id } })
            }
        }
    }
}

fn format_live_question_response(
    source: Option<&str>,
    value: Option<Value>,
    interaction: &CliPendingInteraction,
) -> Value {
    let answer = value.unwrap_or(Value::Null);
    match source {
        Some("mcpServer/elicitation/request") => json!({
            "action": if answer.is_null() { "cancel" } else { "accept" },
            "content": answer,
            "_meta": { "source": "mcode-desktop" },
        }),
        Some("claude/askUserQuestion") => json!({
            "behavior": if answer.is_null() { "deny" } else { "allow" },
            "updatedInput": {
                "questions": interaction.data.get("questions").cloned().unwrap_or_else(|| json!([])),
                "answers": answer,
            },
        }),
        _ => json!({
            "answers": answer,
        }),
    }
}

fn normalize_permission_outcome(decision: &str) -> &'static str {
    match decision.trim().to_lowercase().as_str() {
        "allow" | "allowed" | "approve" | "approved" | "accept" | "accepted" | "yes" => "allow",
        "deny" | "denied" | "reject" | "rejected" | "decline" | "declined" | "no" => "deny",
        "cancel" | "cancelled" | "canceled" => "cancelled",
        _ => "allow",
    }
}

fn live_interaction_key(session_id: &str, kind: &str, interaction_id: &str) -> String {
    format!("{session_id}:{kind}:{interaction_id}")
}

fn mark_interaction_resolved(
    state: &AppState,
    session_id: &str,
    interaction_id: &str,
    kind: &str,
    decision: String,
    value: Option<Value>,
    responder_client_id: Option<String>,
) -> Result<CliPendingInteraction> {
    let now = now_ms();
    let mut interactions = state
        .cli_pending_interactions
        .write()
        .map_err(|_| anyhow!("cli pending interaction lock poisoned"))?;
    let interaction = interactions
        .iter_mut()
        .find(|interaction| {
            interaction.session_id == session_id
                && interaction.interaction_id == interaction_id
                && interaction.kind == kind
                && interaction.status == "pending"
        })
        .ok_or_else(|| anyhow!("{kind} interaction not found: {interaction_id}"))?;
    interaction.status = "resolved".to_string();
    interaction.resolved_at_ms = Some(now);
    interaction.decision = Some(decision);
    interaction.value = value;
    interaction.responder_client_id = responder_client_id;
    let interaction = interaction.clone();
    drop(interactions);
    let _ = crate::recovery::save_recovery_snapshot(state);
    Ok(interaction)
}

fn resolved_interaction_event(
    session_id: &str,
    interaction: &CliPendingInteraction,
    decision: &str,
    value: Option<Value>,
) -> AcpEventEnvelope {
    match interaction.kind.as_str() {
        "permission" => AcpEventEnvelope {
            event_type: "permission_resolved".to_string(),
            connection_id: session_id.to_string(),
            data: json!({
                "requestId": interaction.interaction_id,
                "decision": decision,
                "value": value,
                "status": "resolved",
                "responderClientId": interaction.responder_client_id,
            }),
        },
        _ => AcpEventEnvelope {
            event_type: "question_resolved".to_string(),
            connection_id: session_id.to_string(),
            data: json!({
                "questionId": interaction.interaction_id,
                "answer": value,
                "decision": decision,
                "status": "resolved",
                "responderClientId": interaction.responder_client_id,
            }),
        },
    }
}

fn turn_cancel_requested_event(snapshot: &HostedTurnCancelSnapshot) -> AcpEventEnvelope {
    AcpEventEnvelope {
        event_type: "turn_cancel_requested".to_string(),
        connection_id: snapshot.session_id.clone(),
        data: json!({
            "sessionId": snapshot.session_id,
            "activeTurnId": snapshot.active_turn_id,
            "activeTurnOwnerClientId": snapshot.owner_client_id,
            "cancelRequestedByClientId": snapshot.cancel_requested_by_client_id,
            "cancelRequestedAtMs": snapshot.cancel_requested_at_ms,
            "reason": snapshot.cancel_reason,
        }),
    }
}

fn turn_cancelled_event(snapshot: &HostedTurnCancelSnapshot) -> AcpEventEnvelope {
    AcpEventEnvelope {
        event_type: "turn_cancelled".to_string(),
        connection_id: snapshot.session_id.clone(),
        data: json!({
            "sessionId": snapshot.session_id,
            "activeTurnId": snapshot.active_turn_id,
            "cancelRequestedByClientId": snapshot.cancel_requested_by_client_id,
            "status": "canceled",
        }),
    }
}

fn emit_event(event_sink: &Option<CliEventSink>, event: AcpEventEnvelope) {
    if let Some(sink) = event_sink.as_ref() {
        sink(event);
    }
}

fn interaction_id_from_event(kind: &str, data: &Value) -> String {
    match kind {
        "permission" => data
            .get("id")
            .and_then(Value::as_str)
            .or_else(|| data.get("requestId").and_then(Value::as_str))
            .or_else(|| data.get("request_id").and_then(Value::as_str))
            .unwrap_or("permission")
            .trim()
            .to_string(),
        _ => data
            .get("questionId")
            .and_then(Value::as_str)
            .or_else(|| data.get("question_id").and_then(Value::as_str))
            .or_else(|| data.get("id").and_then(Value::as_str))
            .unwrap_or("question")
            .trim()
            .to_string(),
    }
}

fn interaction_summary(kind: &str, data: &Value) -> String {
    let text = match kind {
        "permission" => data
            .get("description")
            .and_then(Value::as_str)
            .or_else(|| data.get("message").and_then(Value::as_str))
            .or_else(|| data.get("type").and_then(Value::as_str)),
        _ => data.get("question").and_then(Value::as_str).or_else(|| {
            data.get("questions")
                .and_then(Value::as_array)
                .and_then(|questions| questions.first())
                .and_then(|question| {
                    question
                        .get("question")
                        .and_then(Value::as_str)
                        .or_else(|| question.get("label").and_then(Value::as_str))
                })
        }),
    };
    text.map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(kind)
        .to_string()
}

fn extract_interaction_id<'a>(payload: &'a Value, kind: &str) -> Option<&'a str> {
    payload
        .get("interactionId")
        .and_then(Value::as_str)
        .or_else(|| payload.get("interaction_id").and_then(Value::as_str))
        .or_else(|| {
            if kind == "permission" {
                payload
                    .get("requestId")
                    .and_then(Value::as_str)
                    .or_else(|| payload.get("request_id").and_then(Value::as_str))
            } else {
                payload
                    .get("questionId")
                    .and_then(Value::as_str)
                    .or_else(|| payload.get("question_id").and_then(Value::as_str))
            }
        })
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn find_cli_session(state: &AppState, session_id: &str) -> Option<CliRuntimeSession> {
    state.cli_sessions.read().ok().and_then(|sessions| {
        sessions
            .iter()
            .find(|session| session.session_id == session_id)
            .cloned()
    })
}

fn upsert_cli_session(state: &AppState, session: CliRuntimeSession) -> Result<()> {
    let mut sessions = state
        .cli_sessions
        .write()
        .map_err(|_| anyhow!("cli session lock poisoned"))?;
    sessions.retain(|existing| existing.session_id != session.session_id);
    sessions.push(session);
    Ok(())
}

fn session_response(session: &CliRuntimeSession) -> Value {
    json!({
        "id": session.session_id,
        "connectionId": session.session_id,
        "sessionId": session.session_id,
        "session_id": session.session_id,
        "runtime": session.runtime.id(),
        "agentType": session.agent_type,
        "workingDir": session.working_dir,
        "status": session.status,
        "session": session,
    })
}

fn attach_session_to_response(body: Value, session: CliRuntimeSession) -> Value {
    match body {
        Value::Object(mut object) => {
            object.insert(
                "sessionId".to_string(),
                Value::String(session.session_id.clone()),
            );
            object.insert(
                "connectionId".to_string(),
                Value::String(session.session_id.clone()),
            );
            object.insert("session".to_string(), json!(session));
            Value::Object(object)
        }
        other => json!({
            "id": session.session_id,
            "connectionId": session.session_id,
            "sessionId": session.session_id,
            "session_id": session.session_id,
            "session": session,
            "result": other,
        }),
    }
}

fn merge_session_into_prompt_payload(payload: Value, session: &CliRuntimeSession) -> Value {
    let mut object = match payload {
        Value::Object(object) => object,
        _ => serde_json::Map::new(),
    };
    object
        .entry("agentType".to_string())
        .or_insert_with(|| Value::String(session.agent_type.clone()));
    object
        .entry("workingDir".to_string())
        .or_insert_with(|| Value::String(session.working_dir.clone()));
    Value::Object(object)
}

fn extract_agent_type(payload: &Value) -> Option<&str> {
    payload
        .get("agentType")
        .and_then(Value::as_str)
        .or_else(|| payload.get("agent_type").and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn extract_session_id(payload: &Value) -> Option<&str> {
    payload
        .get("sessionId")
        .and_then(Value::as_str)
        .or_else(|| payload.get("session_id").and_then(Value::as_str))
        .or_else(|| payload.get("connectionId").and_then(Value::as_str))
        .or_else(|| payload.get("connection_id").and_then(Value::as_str))
        .or_else(|| payload.get("id").and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

pub fn extract_source_client_id(payload: &Value) -> Option<String> {
    payload
        .get("sourceClientId")
        .and_then(Value::as_str)
        .or_else(|| payload.get("source_client_id").and_then(Value::as_str))
        .or_else(|| {
            payload
                .get("client")
                .and_then(Value::as_object)
                .and_then(|client| client.get("clientId").and_then(Value::as_str))
        })
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn extract_source_device_name(payload: &Value) -> Option<String> {
    payload
        .get("sourceDeviceName")
        .and_then(Value::as_str)
        .or_else(|| payload.get("source_device_name").and_then(Value::as_str))
        .or_else(|| {
            payload
                .get("client")
                .and_then(Value::as_object)
                .and_then(|client| client.get("deviceName").and_then(Value::as_str))
        })
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn extract_cancel_reason(payload: &Value) -> Option<String> {
    payload
        .get("reason")
        .and_then(Value::as_str)
        .or_else(|| payload.get("cancelReason").and_then(Value::as_str))
        .or_else(|| payload.get("cancel_reason").and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn extract_queue_item_id(payload: &Value) -> Option<&str> {
    payload
        .get("queueItemId")
        .and_then(Value::as_str)
        .or_else(|| payload.get("queue_item_id").and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn extract_request_id(payload: &Value) -> Option<&str> {
    payload
        .get("requestId")
        .and_then(Value::as_str)
        .or_else(|| payload.get("request_id").and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn extract_working_dir(payload: &Value) -> Option<&str> {
    payload
        .get("workingDir")
        .and_then(Value::as_str)
        .or_else(|| payload.get("working_dir").and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn normalize_working_dir(value: &str) -> Result<String> {
    let path = if value.trim().is_empty() {
        std::env::current_dir()?
    } else {
        PathBuf::from(value.trim())
    };
    let absolute = if path.is_absolute() {
        path
    } else {
        std::env::current_dir()?.join(path)
    };
    let canonical = absolute.canonicalize()?;
    if !canonical.is_dir() {
        return Err(anyhow!(
            "workingDir is not a directory: {}",
            canonical.display()
        ));
    }
    Ok(canonical.to_string_lossy().to_string())
}

fn extract_prompt_preview(payload: &Value) -> Option<String> {
    let text = payload
        .get("prompt")
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .or_else(|| {
            payload
                .get("blocks")
                .and_then(Value::as_array)
                .map(|blocks| {
                    blocks
                        .iter()
                        .filter_map(extract_block_text_for_preview)
                        .collect::<Vec<_>>()
                        .join("\n")
                })
        })?;
    let text = text.trim();
    if text.is_empty() {
        None
    } else {
        Some(truncate_preview(text, 160))
    }
}

fn extract_block_text_for_preview(block: &Value) -> Option<String> {
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

fn truncate_preview(value: &str, max_chars: usize) -> String {
    let mut output = String::new();
    for (index, character) in value.chars().enumerate() {
        if index >= max_chars {
            output.push_str("...");
            break;
        }
        output.push(character);
    }
    output
}

fn extract_exit_code(body: &Value) -> Option<i32> {
    body.get("exitCode")
        .and_then(Value::as_i64)
        .and_then(|value| i32::try_from(value).ok())
        .or_else(|| {
            body.get("exit_code")
                .and_then(Value::as_i64)
                .and_then(|value| i32::try_from(value).ok())
        })
}

fn extract_stderr_preview(body: &Value) -> Option<String> {
    body.get("stderrPreview")
        .and_then(Value::as_str)
        .or_else(|| body.get("stderr_preview").and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn extract_protocol(body: &Value) -> Option<String> {
    body.get("protocol")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn extract_provider_thread_id(body: &Value) -> Option<String> {
    body.get("providerThreadId")
        .and_then(Value::as_str)
        .or_else(|| body.get("provider_thread_id").and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn extract_active_turn_id(body: &Value) -> Option<String> {
    body.get("activeTurnId")
        .and_then(Value::as_str)
        .or_else(|| body.get("active_turn_id").and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn response_has_events(body: &Value) -> bool {
    body.get("eventCount")
        .and_then(Value::as_u64)
        .map(|value| value > 0)
        .unwrap_or_else(|| {
            body.get("events")
                .and_then(Value::as_array)
                .map(|events| !events.is_empty())
                .unwrap_or(false)
        })
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

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}
