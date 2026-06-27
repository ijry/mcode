use serde_json::Value;
use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::{Mutex, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::oneshot;
use tokio::sync::Mutex as AsyncMutex;
use uuid::Uuid;

use crate::recovery::{OutboundEventQueue, DEFAULT_OUTBOUND_QUEUE_LIMIT};
use crate::runtime::{
    codex_cli::CodexAppServerSession, CliPendingInteraction, CliRuntimeSession, CliRuntimeStatus,
    CAPABILITY_TUNNEL_AVAILABLE,
};
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

pub struct CliProcessControl {
    pub request_id: Option<String>,
    pub started_at_ms: u64,
    pub cancel_tx: Option<oneshot::Sender<()>>,
}

pub struct CliInteractionWaiter {
    pub session_id: String,
    pub interaction_id: String,
    pub kind: String,
    pub source: Option<String>,
    pub created_at_ms: u64,
    pub response_tx: oneshot::Sender<Value>,
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
    pub cli_sessions: RwLock<Vec<CliRuntimeSession>>,
    pub cli_processes: Mutex<HashMap<String, CliProcessControl>>,
    pub codex_app_server_sessions: AsyncMutex<HashMap<String, CodexAppServerSession>>,
    pub cli_pending_interactions: RwLock<Vec<CliPendingInteraction>>,
    pub cli_interaction_waiters: Mutex<HashMap<String, CliInteractionWaiter>>,
    pub display_name: RwLock<String>,
    pub diagnostics: RwLock<Vec<DiagnosticEntry>>,
    pub local_services: RwLock<Vec<LocalServiceConfig>>,
    pub upstream_reconnect_attempt: RwLock<u32>,
    pub upstream_next_retry_delay_ms: RwLock<Option<u64>>,
    pub last_ack_event_id: RwLock<Option<u64>>,
    pub last_ack_local_event_id: RwLock<Option<u64>>,
    pub last_relay_event_id: RwLock<Option<u64>>,
    pub outbound_event_queue: Mutex<OutboundEventQueue>,
    pub recovery_storage_path: RwLock<Option<String>>,
    pub replay_supported: RwLock<bool>,
    pub active_controller_id: RwLock<Option<String>>,
    pub shutdown_requested: AtomicBool,
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
            cli_sessions: RwLock::new(Vec::new()),
            cli_processes: Mutex::new(HashMap::new()),
            codex_app_server_sessions: AsyncMutex::new(HashMap::new()),
            cli_pending_interactions: RwLock::new(Vec::new()),
            cli_interaction_waiters: Mutex::new(HashMap::new()),
            display_name: RwLock::new("MCode Desktop".to_string()),
            diagnostics: RwLock::new(Vec::new()),
            local_services: RwLock::new(vec![default_code_service()]),
            upstream_reconnect_attempt: RwLock::new(0),
            upstream_next_retry_delay_ms: RwLock::new(None),
            last_ack_event_id: RwLock::new(None),
            last_ack_local_event_id: RwLock::new(None),
            last_relay_event_id: RwLock::new(None),
            outbound_event_queue: Mutex::new(OutboundEventQueue::new(DEFAULT_OUTBOUND_QUEUE_LIMIT)),
            recovery_storage_path: RwLock::new(
                std::env::var("MCODE_DESKTOP_STATE_PATH")
                    .ok()
                    .map(|value| value.trim().to_string())
                    .filter(|value| !value.is_empty()),
            ),
            replay_supported: RwLock::new(false),
            active_controller_id: RwLock::new(None),
            shutdown_requested: AtomicBool::new(false),
        }
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}
