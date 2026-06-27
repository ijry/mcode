use std::sync::atomic::Ordering;

use crate::app_state::{AppState, DiagnosticEntry, GatewayProvider, PairOffer, UpstreamStatus};
use crate::runtime::{CliPendingInteraction, CliRuntimeSession, CliRuntimeStatus};
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
        cli_sessions: state
            .cli_sessions
            .read()
            .map(|value| value.clone())
            .unwrap_or_default(),
        cli_pending_interactions: state
            .cli_pending_interactions
            .read()
            .map(|value| value.clone())
            .unwrap_or_default(),
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
        active_controller_id: state
            .active_controller_id
            .read()
            .ok()
            .and_then(|value| value.clone()),
        shutdown_requested: state.shutdown_requested.load(Ordering::SeqCst),
    }
}
