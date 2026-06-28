use std::sync::atomic::Ordering;

use crate::app_state::{AppState, DiagnosticEntry, GatewayProvider, PairOffer, UpstreamStatus};
use crate::runtime::{
    queued_prompt_snapshots, CliPendingInteraction, CliRuntimeSession, CliRuntimeStatus,
    CliSessionStatus, QueuedPromptSnapshot,
};
use crate::tunnel::LocalServiceConfig;

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopHealthSnapshot {
    pub target_agent: String,
    pub target_id: String,
    pub display_name: String,
    pub version: String,
    pub upstream_status: UpstreamStatus,
    pub upstream_error: Option<String>,
    pub gateway_provider: Option<GatewayProvider>,
    pub gateway_base_url: Option<String>,
    pub capabilities: Vec<String>,
    pub cli_runtimes: Vec<CliRuntimeStatus>,
    pub cli_sessions: Vec<CliRuntimeSession>,
    pub cli_pending_interactions: Vec<CliPendingInteraction>,
    pub pair_offer: Option<PairOffer>,
    pub local_services: Vec<LocalServiceConfig>,
    pub diagnostics: Vec<DiagnosticEntry>,
    pub upstream_reconnect_attempt: u32,
    pub upstream_next_retry_delay_ms: Option<u64>,
    pub last_ack_event_id: Option<u64>,
    pub recovery_storage_mode: String,
    pub queued_outbound_event_count: usize,
    pub oldest_queued_local_event_id: Option<u64>,
    pub last_ack_local_event_id: Option<u64>,
    pub last_relay_event_id: Option<u64>,
    pub replay_supported: bool,
    pub interrupted_session_count: usize,
    pub stale_pending_interaction_count: usize,
    pub active_turn_count: usize,
    pub active_turn_owner_client_id: Option<String>,
    pub active_turn_cancel_requested_by_client_id: Option<String>,
    pub active_turn_cancel_requested_at_ms: Option<u64>,
    pub prompt_queue_count: usize,
    pub prompt_queue: Vec<QueuedPromptSnapshot>,
    pub active_controller_id: Option<String>,
    pub shutdown_requested: bool,
}

pub fn desktop_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

pub fn build_health_snapshot(state: &AppState) -> DesktopHealthSnapshot {
    let gateway_config = state
        .gateway_config
        .read()
        .ok()
        .and_then(|value| value.clone());
    let cli_sessions = state
        .cli_sessions
        .read()
        .map(|value| value.clone())
        .unwrap_or_default();
    let cli_pending_interactions = state
        .cli_pending_interactions
        .read()
        .map(|value| value.clone())
        .unwrap_or_default();
    let queue_snapshot = state.outbound_event_queue.lock().ok().map(|queue| {
        (
            queue.pending().len(),
            queue.oldest_local_event_id(),
            queue.last_ack_local_event_id(),
            queue.last_relay_event_id(),
        )
    });
    let active_turn_snapshot = state.hosted_active_turns.lock().ok().map(|active| {
        (
            active.len(),
            active
                .values()
                .next()
                .and_then(|turn| turn.owner_client_id.clone()),
            active
                .values()
                .next()
                .and_then(|turn| turn.cancel_requested_by_client_id.clone()),
            active
                .values()
                .next()
                .and_then(|turn| turn.cancel_requested_at_ms),
        )
    });
    let prompt_queue = queued_prompt_snapshots(state);
    let last_relay_event_id = state
        .last_relay_event_id
        .read()
        .map(|value| *value)
        .unwrap_or(None)
        .or_else(|| queue_snapshot.as_ref().and_then(|(_, _, _, relay_id)| *relay_id))
        .or_else(|| {
            state
                .last_ack_event_id
                .read()
                .map(|value| *value)
                .unwrap_or(None)
        });

    DesktopHealthSnapshot {
        target_agent: "mcode-desktop".to_string(),
        target_id: state
            .target_id
            .read()
            .map(|value| value.clone())
            .unwrap_or_else(|_| "desktop-unknown".to_string()),
        display_name: state
            .display_name
            .read()
            .map(|value| value.clone())
            .unwrap_or_else(|_| "MCode Desktop".to_string()),
        version: desktop_version().to_string(),
        upstream_status: state
            .upstream_status
            .read()
            .map(|value| value.clone())
            .unwrap_or(UpstreamStatus::Error),
        upstream_error: state
            .upstream_error
            .read()
            .ok()
            .and_then(|value| value.clone()),
        gateway_provider: gateway_config
            .as_ref()
            .map(|config| config.provider.clone()),
        gateway_base_url: gateway_config.map(|config| config.base_url),
        capabilities: state
            .capabilities
            .read()
            .map(|value| value.clone())
            .unwrap_or_default(),
        cli_runtimes: state
            .cli_runtimes
            .read()
            .map(|value| value.clone())
            .unwrap_or_default(),
        cli_sessions: cli_sessions.clone(),
        cli_pending_interactions: cli_pending_interactions.clone(),
        pair_offer: state.pair_offer.read().ok().and_then(|value| value.clone()),
        local_services: state
            .local_services
            .read()
            .map(|value| value.clone())
            .unwrap_or_default(),
        diagnostics: state
            .diagnostics
            .read()
            .map(|value| value.clone())
            .unwrap_or_default(),
        upstream_reconnect_attempt: state
            .upstream_reconnect_attempt
            .read()
            .map(|value| *value)
            .unwrap_or(0),
        upstream_next_retry_delay_ms: state
            .upstream_next_retry_delay_ms
            .read()
            .map(|value| *value)
            .unwrap_or(None),
        last_ack_event_id: state
            .last_ack_event_id
            .read()
            .map(|value| *value)
            .unwrap_or(None),
        recovery_storage_mode: if state
            .recovery_storage_path
            .read()
            .ok()
            .and_then(|value| value.clone())
            .is_some()
        {
            "json-file".to_string()
        } else {
            "memory".to_string()
        },
        queued_outbound_event_count: queue_snapshot
            .as_ref()
            .map(|(count, _, _, _)| *count)
            .unwrap_or(0),
        oldest_queued_local_event_id: queue_snapshot
            .as_ref()
            .and_then(|(_, oldest, _, _)| *oldest),
        last_ack_local_event_id: state
            .last_ack_local_event_id
            .read()
            .map(|value| *value)
            .unwrap_or(None)
            .or_else(|| queue_snapshot.as_ref().and_then(|(_, _, local_id, _)| *local_id)),
        last_relay_event_id,
        replay_supported: state.replay_supported.read().map(|value| *value).unwrap_or(false),
        interrupted_session_count: cli_sessions
            .iter()
            .filter(|session| session.status == CliSessionStatus::Interrupted)
            .count(),
        stale_pending_interaction_count: cli_pending_interactions
            .iter()
            .filter(|interaction| interaction.status == "stale")
            .count(),
        active_turn_count: active_turn_snapshot
            .as_ref()
            .map(|(count, _, _, _)| *count)
            .unwrap_or(0),
        active_turn_owner_client_id: active_turn_snapshot
            .as_ref()
            .and_then(|(_, owner_client_id, _, _)| owner_client_id.clone()),
        active_turn_cancel_requested_by_client_id: active_turn_snapshot
            .as_ref()
            .and_then(|(_, _, requester_client_id, _)| requester_client_id.clone()),
        active_turn_cancel_requested_at_ms: active_turn_snapshot
            .as_ref()
            .and_then(|(_, _, _, requested_at_ms)| *requested_at_ms),
        prompt_queue_count: prompt_queue.len(),
        prompt_queue,
        active_controller_id: state
            .active_controller_id
            .read()
            .ok()
            .and_then(|value| value.clone()),
        shutdown_requested: state.shutdown_requested.load(Ordering::SeqCst),
    }
}
