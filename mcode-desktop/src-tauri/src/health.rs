use crate::app_state::{AppState, DiagnosticEntry, GatewayProvider, PairOffer, UpstreamStatus};
use crate::runtime::CliRuntimeStatus;
use crate::tunnel::LocalServiceConfig;

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
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
    pub pair_offer: Option<PairOffer>,
    pub local_services: Vec<LocalServiceConfig>,
    pub diagnostics: Vec<DiagnosticEntry>,
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
        gateway_provider: gateway_config.as_ref().map(|config| config.provider.clone()),
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
    }
}
