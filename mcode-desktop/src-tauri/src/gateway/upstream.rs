use std::sync::Arc;

use anyhow::{anyhow, Result};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use url::Url;

use crate::app_state::{AppState, GatewayConfig, GatewayProvider, PairOffer, UpstreamStatus};

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
pub struct DesktopUpstreamHello {
    #[serde(rename = "type")]
    pub frame_type: String,
    #[serde(rename = "targetId")]
    pub target_id: String,
    #[serde(rename = "targetAgent")]
    pub target_agent: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
    pub capabilities: Vec<String>,
    #[serde(rename = "protocolVersion")]
    pub protocol_version: String,
    #[serde(rename = "relayUrl", skip_serializing_if = "Option::is_none")]
    pub relay_url: Option<String>,
}

impl DesktopUpstreamHello {
    pub fn new(
        target_id: impl Into<String>,
        display_name: impl Into<String>,
        capabilities: Vec<String>,
    ) -> Self {
        Self {
            frame_type: "desktop_hello".to_string(),
            target_id: target_id.into(),
            target_agent: "mcode-desktop".to_string(),
            display_name: display_name.into(),
            capabilities,
            protocol_version: "1".to_string(),
            relay_url: None,
        }
    }

    pub fn from_state(target_id: &str, display_name: &str, state: &AppState) -> Self {
        let capabilities = state
            .capabilities
            .read()
            .map(|value| value.clone())
            .unwrap_or_default();
        Self::new(target_id, display_name, capabilities)
    }
}

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(tag = "type")]
pub enum RelayControlFrame {
    #[serde(rename = "ack")]
    Ack {
        #[serde(rename = "eventId")]
        event_id: u64,
    },
    #[serde(rename = "tunnel_request")]
    TunnelRequest {
        #[serde(rename = "requestId")]
        request_id: String,
        request: serde_json::Value,
    },
    #[serde(rename = "controller_attached")]
    ControllerAttached {
        #[serde(rename = "controllerId")]
        controller_id: String,
    },
    #[serde(other)]
    Unknown,
}

pub fn build_upstream_ws_url(base_url: &str) -> Result<String> {
    let mut url = Url::parse(base_url.trim())?;
    let scheme = match url.scheme() {
        "https" => "wss",
        "http" => "ws",
        other => return Err(anyhow!("unsupported gateway scheme: {other}")),
    };
    url.set_scheme(scheme).map_err(|_| anyhow!("invalid gateway scheme"))?;
    url.set_path("/v1/tunnel/desktop");
    url.set_query(None);
    Ok(url.to_string())
}

pub fn build_pair_offer_frame(
    target_id: &str,
    display_name: &str,
    offer: &PairOffer,
    capabilities: Vec<String>,
) -> serde_json::Value {
    json!({
        "type": "pair_offer",
        "targetId": target_id,
        "targetName": display_name,
        "displayName": display_name,
        "targetAgent": "mcode-desktop",
        "capabilities": capabilities,
        "protocolVersion": "1",
        "code": offer.code,
        "secret": offer.secret,
    })
}

pub async fn connect_upstream(state: Arc<AppState>) -> Result<()> {
    let relay_url = state
        .relay_url
        .read()
        .ok()
        .and_then(|value| value.clone())
        .ok_or_else(|| anyhow!("relay url is required"))?;
    let config = state
        .gateway_config
        .read()
        .ok()
        .and_then(|value| value.clone())
        .unwrap_or(GatewayConfig {
            provider: GatewayProvider::Official,
            base_url: relay_url.clone(),
        });
    mark_upstream_connecting(&state, config).await;

    let ws_url = build_upstream_ws_url(&relay_url)?;
    let (socket, _) = connect_async(ws_url).await?;
    let (mut writer, mut reader) = socket.split();

    let target_id = state
        .target_id
        .read()
        .map(|value| value.clone())
        .unwrap_or_else(|_| "desktop-unknown".to_string());
    let display_name = state
        .display_name
        .read()
        .map(|value| value.clone())
        .unwrap_or_else(|_| "MCode Desktop".to_string());
    let capabilities = state
        .capabilities
        .read()
        .map(|value| value.clone())
        .unwrap_or_default();

    let mut hello = DesktopUpstreamHello::from_state(&target_id, &display_name, &state);
    hello.relay_url = Some(relay_url.clone());
    writer
        .send(Message::Text(serde_json::to_string(&hello)?.into()))
        .await?;

    let pair_offer = state.pair_offer.read().ok().and_then(|value| value.clone());
    if let Some(offer) = pair_offer {
        let frame = build_pair_offer_frame(&target_id, &display_name, &offer, capabilities);
        writer
            .send(Message::Text(frame.to_string().into()))
            .await?;
    }

    mark_upstream_online(&state).await;

    while let Some(message) = reader.next().await {
        let message = message?;
        if message.is_text() {
            let frame = parse_upstream_frame(message.to_text()?)?;
            handle_upstream_frame(&state, frame).await?;
        }
    }

    mark_upstream_error(&state, "gateway upstream closed").await;
    Err(anyhow!("gateway upstream closed"))
}

pub fn parse_upstream_frame(message: &str) -> Result<RelayControlFrame> {
    serde_json::from_str(message).map_err(Into::into)
}

pub async fn handle_upstream_frame(_state: &AppState, frame: RelayControlFrame) -> Result<()> {
    match frame {
        RelayControlFrame::Unknown => Err(anyhow!("unknown upstream frame")),
        _ => Ok(()),
    }
}

pub async fn mark_upstream_connecting(state: &AppState, config: GatewayConfig) {
    if let Ok(mut gateway_config) = state.gateway_config.write() {
        *gateway_config = Some(config);
    }
    if let Ok(mut status) = state.upstream_status.write() {
        *status = UpstreamStatus::Connecting;
    }
    if let Ok(mut error) = state.upstream_error.write() {
        *error = None;
    }
}

pub async fn mark_upstream_online(state: &AppState) {
    if let Ok(mut status) = state.upstream_status.write() {
        *status = UpstreamStatus::Online;
    }
    if let Ok(mut error) = state.upstream_error.write() {
        *error = None;
    }
}

pub async fn mark_upstream_error(state: &AppState, message: impl Into<String>) {
    if let Ok(mut status) = state.upstream_status.write() {
        *status = UpstreamStatus::Error;
    }
    if let Ok(mut error) = state.upstream_error.write() {
        *error = Some(message.into());
    }
}
