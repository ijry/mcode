use std::sync::RwLock;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

use crate::runtime::{CliRuntimeStatus, CAPABILITY_TUNNEL_AVAILABLE};
use crate::tunnel::{default_code_service, LocalServiceConfig};

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GatewayProvider {
    Official,
    Custom,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GatewayConfig {
    pub provider: GatewayProvider,
    pub base_url: String,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum UpstreamStatus {
    Offline,
    Connecting,
    Online,
    Error,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairOffer {
    pub code: String,
    pub secret: String,
    pub qr_payload: String,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticEntry {
    pub level: String,
    pub message: String,
    pub created_at_ms: u64,
}

pub struct AppState {
    pub target_id: RwLock<String>,
    pub relay_url: RwLock<Option<String>>,
    pub gateway_config: RwLock<Option<GatewayConfig>>,
    pub upstream_status: RwLock<UpstreamStatus>,
    pub upstream_error: RwLock<Option<String>>,
    pub pair_offer: RwLock<Option<PairOffer>>,
    pub capabilities: RwLock<Vec<String>>,
    pub cli_runtimes: RwLock<Vec<CliRuntimeStatus>>,
    pub display_name: RwLock<String>,
    pub diagnostics: RwLock<Vec<DiagnosticEntry>>,
    pub local_services: RwLock<Vec<LocalServiceConfig>>,
}

impl AppState {
    pub fn new_for_test() -> Self {
        Self::default()
    }

    pub fn push_diagnostic(&self, level: impl Into<String>, message: impl Into<String>) {
        if let Ok(mut diagnostics) = self.diagnostics.write() {
            diagnostics.push(DiagnosticEntry {
                level: level.into(),
                message: message.into(),
                created_at_ms: now_ms(),
            });
            if diagnostics.len() > 50 {
                let excess = diagnostics.len() - 50;
                diagnostics.drain(0..excess);
            }
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            target_id: RwLock::new(format!("desktop-{}", Uuid::new_v4())),
            relay_url: RwLock::new(None),
            gateway_config: RwLock::new(None),
            upstream_status: RwLock::new(UpstreamStatus::Offline),
            upstream_error: RwLock::new(None),
            pair_offer: RwLock::new(None),
            capabilities: RwLock::new(vec![CAPABILITY_TUNNEL_AVAILABLE.to_string()]),
            cli_runtimes: RwLock::new(Vec::new()),
            display_name: RwLock::new("MCode Desktop".to_string()),
            diagnostics: RwLock::new(Vec::new()),
            local_services: RwLock::new(vec![default_code_service()]),
        }
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}
