use uuid::Uuid;

use crate::app_state::{GatewayProvider, PairOffer};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GatewayQrPayloadInput {
    pub name: String,
    pub gateway_provider: GatewayProvider,
    pub gateway_base_url: Option<String>,
    pub pair_code: String,
    pub pair_secret: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PairOfferRequest {
    pub name: String,
    pub gateway_provider: GatewayProvider,
    pub gateway_base_url: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GatewayQrPayload {
    pub version: u8,
    pub name: String,
    pub target_agent: String,
    pub route_mode: String,
    pub gateway_provider: GatewayProvider,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gateway_base_url: Option<String>,
    pub pair_code: String,
    pub pair_secret: String,
}

pub fn build_gateway_qr_payload(input: GatewayQrPayloadInput) -> GatewayQrPayload {
    GatewayQrPayload {
        version: 2,
        name: normalize_name(&input.name),
        target_agent: "mcode-desktop".to_string(),
        route_mode: "gateway".to_string(),
        gateway_provider: input.gateway_provider,
        gateway_base_url: input
            .gateway_base_url
            .map(|value| normalize_url(&value))
            .filter(|value| !value.is_empty()),
        pair_code: input.pair_code,
        pair_secret: input.pair_secret,
    }
}

pub fn generate_pair_offer(input: PairOfferRequest) -> PairOffer {
    let code = generate_pair_code();
    let secret = generate_pair_secret();
    let payload = build_gateway_qr_payload(GatewayQrPayloadInput {
        name: input.name,
        gateway_provider: input.gateway_provider,
        gateway_base_url: input.gateway_base_url,
        pair_code: code.clone(),
        pair_secret: secret.clone(),
    });

    PairOffer {
        code,
        secret,
        qr_payload: serde_json::to_string(&payload).expect("gateway QR payload serializes"),
    }
}

fn generate_pair_code() -> String {
    let raw = Uuid::new_v4().simple().to_string().to_uppercase();
    format!("{}-{}", &raw[0..4], &raw[4..8])
}

fn generate_pair_secret() -> String {
    Uuid::new_v4().simple().to_string()
}

fn normalize_name(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        "MCode Desktop".to_string()
    } else {
        trimmed.to_string()
    }
}

fn normalize_url(value: &str) -> String {
    value.trim().trim_end_matches('/').to_string()
}
