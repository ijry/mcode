use std::sync::Arc;

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::app_state::AppState;

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
        request: Value,
    },
    #[serde(rename = "controller_attached")]
    ControllerAttached {
        #[serde(rename = "controllerId")]
        controller_id: String,
    },
    #[serde(other)]
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UpstreamSocket {
    pub relay_url: String,
}

pub async fn connect_upstream(state: Arc<AppState>, relay_url: &str) -> Result<DesktopUpstreamHello> {
    let socket = open_upstream_socket(relay_url).await?;
    let display_name = "MCode Desktop";
    let hello = DesktopUpstreamHello::from_state(&socket.relay_url, display_name, &state);
    Ok(hello)
}

pub async fn open_upstream_socket(relay_url: &str) -> Result<UpstreamSocket> {
    let relay_url = relay_url.trim();
    if relay_url.is_empty() {
        return Err(anyhow!("relay url is required"));
    }
    Ok(UpstreamSocket {
        relay_url: relay_url.to_string(),
    })
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
