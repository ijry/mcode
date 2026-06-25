use std::sync::RwLock;

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
pub struct PairOffer {
    pub code: String,
    pub secret: String,
    pub qr_payload: String,
}

pub struct AppState {
    pub relay_url: RwLock<Option<String>>,
    pub pair_offer: RwLock<Option<PairOffer>>,
    pub capabilities: RwLock<Vec<String>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            relay_url: RwLock::new(None),
            pair_offer: RwLock::new(None),
            capabilities: RwLock::new(vec!["desktop.tunnel.available".to_string()]),
        }
    }
}
