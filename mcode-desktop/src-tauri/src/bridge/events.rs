use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
pub struct RelayEventFrame {
    #[serde(rename = "eventId")]
    pub event_id: u64,
    pub channel: String,
    pub payload: Value,
    #[serde(rename = "controllerId", skip_serializing_if = "Option::is_none")]
    pub controller_id: Option<String>,
}

pub fn emit_event_with_ack(event_id: u64, channel: &str, payload: Value) -> RelayEventFrame {
    RelayEventFrame {
        event_id,
        channel: channel.to_string(),
        payload,
        controller_id: None,
    }
}
