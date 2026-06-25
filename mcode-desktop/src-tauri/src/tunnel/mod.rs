use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LocalServiceProtocol {
    Http,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalServiceConfig {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub protocol: LocalServiceProtocol,
    pub enabled: bool,
}

pub fn default_code_service() -> LocalServiceConfig {
    LocalServiceConfig {
        name: "Code".to_string(),
        host: "127.0.0.1".to_string(),
        port: 1080,
        protocol: LocalServiceProtocol::Http,
        enabled: true,
    }
}

pub fn validate_local_service_config(config: LocalServiceConfig) -> Result<LocalServiceConfig> {
    let name = config.name.trim();
    let host = config.host.trim();

    if name.is_empty() {
        return Err(anyhow!("service name is required"));
    }
    if host != "127.0.0.1" {
        return Err(anyhow!("P3 only allows loopback host 127.0.0.1"));
    }
    if config.port == 0 {
        return Err(anyhow!("service port is required"));
    }

    Ok(LocalServiceConfig {
        name: name.to_string(),
        host: host.to_string(),
        port: config.port,
        protocol: config.protocol,
        enabled: config.enabled,
    })
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
pub struct TunnelBinding {
    pub local_bind: String,
    pub upstream_origin: String,
    pub public_port: u16,
}

impl TunnelBinding {
    pub fn for_code_preview(port: u16, upstream_origin: &str) -> Self {
        Self {
            local_bind: format!("127.0.0.1:{port}"),
            upstream_origin: upstream_origin.to_string(),
            public_port: port,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
pub struct TunnelHttpRequest {
    pub method: String,
    pub path: String,
    pub query: Value,
    pub headers: Vec<(String, String)>,
    pub body: Option<Value>,
}

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
pub struct TunnelHttpResponse {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: Option<Value>,
}

pub async fn proxy_http_request(
    upstream_origin: &str,
    request: TunnelHttpRequest,
) -> Result<TunnelHttpResponse> {
    Ok(TunnelHttpResponse {
        status: 501,
        headers: vec![("x-mcode-upstream-origin".to_string(), upstream_origin.to_string())],
        body: Some(serde_json::json!({
            "error": "tunnel proxy not started",
            "method": request.method,
            "path": request.path
        })),
    })
}

pub async fn serve_tunnel_request(
    binding: &TunnelBinding,
    request: TunnelHttpRequest,
) -> Result<TunnelHttpResponse> {
    proxy_http_request(&binding.upstream_origin, request).await
}
