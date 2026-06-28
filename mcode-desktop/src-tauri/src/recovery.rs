use std::collections::VecDeque;
use std::fs;
use std::path::Path;
use std::sync::atomic::Ordering;

use anyhow::Result;
use serde_json::Value;

use crate::app_state::{AppState, DiagnosticEntry, GatewayConfig};
use crate::runtime::{
    persistent_queued_prompts, restore_persistent_queued_prompts, CliPendingInteraction,
    CliRuntimeSession, CliSessionStatus, PersistentQueuedPrompt,
};
use crate::tunnel::LocalServiceConfig;

pub const DESKTOP_STATE_SCHEMA: &str = "mcode.desktop.state.v1";
pub const DEFAULT_OUTBOUND_QUEUE_LIMIT: usize = 500;

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueuedOutboundEvent {
    pub local_event_id: u64,
    pub event: Value,
    pub queued_at_ms: u64,
}

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutboundEventQueue {
    next_local_event_id: u64,
    limit: usize,
    pending: VecDeque<QueuedOutboundEvent>,
    last_ack_local_event_id: Option<u64>,
    last_relay_event_id: Option<u64>,
    overflow_count: u64,
}

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopRecoverySnapshot {
    pub schema: String,
    pub target_id: String,
    pub display_name: String,
    pub gateway_config: Option<GatewayConfig>,
    pub relay_url: Option<String>,
    pub local_services: Vec<LocalServiceConfig>,
    pub last_ack_local_event_id: Option<u64>,
    pub last_relay_event_id: Option<u64>,
    pub queued_outbound_events: Vec<QueuedOutboundEvent>,
    #[serde(default)]
    pub queued_prompts: Vec<PersistentQueuedPrompt>,
    pub cli_sessions: Vec<CliRuntimeSession>,
    pub pending_interactions: Vec<CliPendingInteraction>,
    pub diagnostics: Vec<DiagnosticEntry>,
}

impl OutboundEventQueue {
    pub fn new(limit: usize) -> Self {
        Self {
            next_local_event_id: 1,
            limit,
            pending: VecDeque::new(),
            last_ack_local_event_id: None,
            last_relay_event_id: None,
            overflow_count: 0,
        }
    }

    pub fn enqueue(&mut self, event: Value) -> QueuedOutboundEvent {
        let queued = QueuedOutboundEvent {
            local_event_id: self.next_local_event_id,
            event,
            queued_at_ms: now_ms(),
        };
        self.next_local_event_id = self.next_local_event_id.saturating_add(1);
        self.pending.push_back(queued.clone());
        while self.pending.len() > self.limit {
            self.pending.pop_front();
            self.overflow_count = self.overflow_count.saturating_add(1);
        }
        queued
    }

    pub fn ack(&mut self, local_event_id: u64, relay_event_id: u64) {
        self.pending
            .retain(|event| event.local_event_id != local_event_id);
        self.last_ack_local_event_id = Some(local_event_id);
        self.last_relay_event_id = Some(relay_event_id);
    }

    pub fn pending(&self) -> Vec<QueuedOutboundEvent> {
        self.pending.iter().cloned().collect()
    }

    pub fn restore_pending(&mut self, events: Vec<QueuedOutboundEvent>) {
        self.pending = events.into_iter().collect();
        self.next_local_event_id = self
            .pending
            .iter()
            .map(|event| event.local_event_id)
            .max()
            .unwrap_or(0)
            .saturating_add(1);
    }

    pub fn last_ack_local_event_id(&self) -> Option<u64> {
        self.last_ack_local_event_id
    }

    pub fn last_relay_event_id(&self) -> Option<u64> {
        self.last_relay_event_id
    }

    pub fn oldest_local_event_id(&self) -> Option<u64> {
        self.pending.front().map(|event| event.local_event_id)
    }

    pub fn overflow_count(&self) -> u64 {
        self.overflow_count
    }
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

pub fn save_recovery_snapshot(state: &AppState) -> Result<()> {
    let Some(path) = state
        .recovery_storage_path
        .read()
        .ok()
        .and_then(|value| value.clone())
    else {
        return Ok(());
    };
    save_recovery_snapshot_to_path(state, Path::new(&path))
}

pub fn save_recovery_snapshot_to_path(state: &AppState, path: impl AsRef<Path>) -> Result<()> {
    let snapshot = build_recovery_snapshot(state)?;
    if let Some(parent) = path.as_ref().parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, serde_json::to_string_pretty(&snapshot)?)?;
    Ok(())
}

pub fn load_recovery_snapshot(path: impl AsRef<Path>) -> Result<Option<DesktopRecoverySnapshot>> {
    if !path.as_ref().exists() {
        return Ok(None);
    }
    let snapshot: DesktopRecoverySnapshot = serde_json::from_str(&fs::read_to_string(path)?)?;
    if snapshot.schema != DESKTOP_STATE_SCHEMA {
        return Ok(None);
    }
    Ok(Some(snapshot))
}

pub fn build_recovery_snapshot(state: &AppState) -> Result<DesktopRecoverySnapshot> {
    let queue = state.outbound_event_queue.lock().ok();
    let last_ack_local_event_id = state
        .last_ack_local_event_id
        .read()
        .map(|value| *value)
        .unwrap_or(None)
        .or_else(|| queue.as_ref().and_then(|queue| queue.last_ack_local_event_id()));
    let last_relay_event_id = state
        .last_relay_event_id
        .read()
        .map(|value| *value)
        .unwrap_or(None)
        .or_else(|| queue.as_ref().and_then(|queue| queue.last_relay_event_id()))
        .or_else(|| {
            state
                .last_ack_event_id
                .read()
                .map(|value| *value)
                .unwrap_or(None)
        });

    Ok(DesktopRecoverySnapshot {
        schema: DESKTOP_STATE_SCHEMA.to_string(),
        target_id: state
            .target_id
            .read()
            .map(|value| value.clone())
            .unwrap_or_default(),
        display_name: state
            .display_name
            .read()
            .map(|value| value.clone())
            .unwrap_or_default(),
        gateway_config: state.gateway_config.read().ok().and_then(|value| value.clone()),
        relay_url: state.relay_url.read().ok().and_then(|value| value.clone()),
        local_services: state
            .local_services
            .read()
            .map(|value| value.clone())
            .unwrap_or_default(),
        last_ack_local_event_id,
        last_relay_event_id,
        queued_outbound_events: queue.map(|queue| queue.pending()).unwrap_or_default(),
        queued_prompts: persistent_queued_prompts(state),
        cli_sessions: state
            .cli_sessions
            .read()
            .map(|value| value.clone())
            .unwrap_or_default(),
        pending_interactions: state
            .cli_pending_interactions
            .read()
            .map(|value| value.clone())
            .unwrap_or_default(),
        diagnostics: state
            .diagnostics
            .read()
            .map(|value| value.clone())
            .unwrap_or_default(),
    })
}

pub fn apply_recovery_snapshot(
    state: &AppState,
    snapshot: DesktopRecoverySnapshot,
) -> Result<()> {
    if let Ok(mut target_id) = state.target_id.write() {
        *target_id = snapshot.target_id;
    }
    if let Ok(mut display_name) = state.display_name.write() {
        *display_name = snapshot.display_name;
    }
    if let Ok(mut gateway_config) = state.gateway_config.write() {
        *gateway_config = snapshot.gateway_config;
    }
    if let Ok(mut relay_url) = state.relay_url.write() {
        *relay_url = snapshot.relay_url;
    }
    if let Ok(mut services) = state.local_services.write() {
        *services = snapshot.local_services;
    }
    if let Ok(mut last_ack) = state.last_ack_local_event_id.write() {
        *last_ack = snapshot.last_ack_local_event_id;
    }
    if let Ok(mut last_relay) = state.last_relay_event_id.write() {
        *last_relay = snapshot.last_relay_event_id;
    }
    if let Ok(mut last_ack_event_id) = state.last_ack_event_id.write() {
        *last_ack_event_id = snapshot.last_relay_event_id;
    }
    if let Ok(mut queue) = state.outbound_event_queue.lock() {
        queue.restore_pending(snapshot.queued_outbound_events);
    }
    let (queued_prompts, expired_count) =
        filter_restorable_queued_prompts(state, snapshot.queued_prompts);
    if expired_count > 0 {
        state
            .expired_prompt_queue_count
            .fetch_add(expired_count as u64, Ordering::SeqCst);
    }
    restore_persistent_queued_prompts(state, queued_prompts);

    let interrupted_session_ids = snapshot
        .cli_sessions
        .iter()
        .filter(|session| session.status == CliSessionStatus::Running)
        .map(|session| session.session_id.clone())
        .collect::<std::collections::HashSet<_>>();
    let sessions = snapshot
        .cli_sessions
        .into_iter()
        .map(interrupt_running_session)
        .collect::<Vec<_>>();
    let interactions = snapshot
        .pending_interactions
        .into_iter()
        .map(|mut interaction| {
            if interrupted_session_ids.contains(&interaction.session_id)
                && interaction.status == "pending"
            {
                interaction.status = "stale".to_string();
            }
            interaction
        })
        .collect::<Vec<_>>();

    if let Ok(mut cli_sessions) = state.cli_sessions.write() {
        *cli_sessions = sessions;
    }
    if let Ok(mut pending) = state.cli_pending_interactions.write() {
        *pending = interactions;
    }
    if let Ok(mut diagnostics) = state.diagnostics.write() {
        let mut restored_diagnostics = snapshot.diagnostics;
        if expired_count > 0 {
            restored_diagnostics.push(DiagnosticEntry {
                level: "warning".to_string(),
                message: format!(
                    "{expired_count} expired queued prompt(s) were dropped during recovery"
                ),
                created_at_ms: now_ms(),
            });
        }
        *diagnostics = restored_diagnostics.into_iter().rev().take(50).collect();
        diagnostics.reverse();
    }
    Ok(())
}

fn interrupt_running_session(mut session: CliRuntimeSession) -> CliRuntimeSession {
    if session.status == CliSessionStatus::Running {
        session.status = CliSessionStatus::Interrupted;
        session.active_request_id = None;
        session.cancel_requested = false;
        session.cancel_requested_by_client_id = None;
        session.cancel_requested_at_ms = None;
        session.cancel_reason = None;
        session.active_turn_id = None;
        session.active_turn_owner_client_id = None;
        session.active_turn_started_at_ms = None;
        session.app_server_active = false;
        session.error = Some("Desktop restarted while the CLI session was running".to_string());
        session.updated_at_ms = now_ms();
    }
    session
}

fn filter_restorable_queued_prompts(
    state: &AppState,
    prompts: Vec<PersistentQueuedPrompt>,
) -> (Vec<PersistentQueuedPrompt>, usize) {
    let max_age_ms = state
        .prompt_queue_policy
        .read()
        .map(|policy| policy.max_restored_age_ms)
        .unwrap_or(crate::app_state::DEFAULT_PROMPT_QUEUE_MAX_RESTORED_AGE_MS);
    let now = now_ms();
    let mut kept = Vec::new();
    let mut expired = 0usize;
    for prompt in prompts {
        let age = now.saturating_sub(prompt.created_at_ms);
        if prompt.created_at_ms == 0 || age <= max_age_ms {
            kept.push(prompt);
        } else {
            expired += 1;
        }
    }
    (kept, expired)
}
