use std::collections::BTreeMap;

use anyhow::{anyhow, Result};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use tokio::net::TcpStream;
use url::Url;

use crate::app_state::AppState;

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LocalServiceProtocol {
    Http,
    Tcp,
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
        return Err(anyhow!("tunnel only allows loopback host 127.0.0.1"));
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
#[serde(rename_all = "camelCase")]
pub struct TunnelHttpRequest {
    pub port: u16,
    pub method: String,
    pub path: String,
    #[serde(default)]
    pub query: Map<String, Value>,
    #[serde(default)]
    pub headers: BTreeMap<String, Value>,
    #[serde(default)]
    pub body: Option<Value>,
}

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TunnelHttpResponse {
    pub status: u16,
    #[serde(default)]
    pub headers: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub body: Option<Value>,
}

pub async fn serve_tunnel_request(
    state: &AppState,
    request: TunnelHttpRequest,
) -> Result<TunnelHttpResponse> {
    let service = find_enabled_service(state, request.port)?;
    let result = proxy_http_request(&service, request).await;
    match &result {
        Ok(response) => state.push_diagnostic(
            "info",
            format!(
                "{} {}:{} -> {}",
                service.name, service.host, service.port, response.status
            ),
        ),
        Err(error) => state.push_diagnostic(
            "error",
            format!(
                "{} {}:{} -> {}",
                service.name, service.host, service.port, error
            ),
        ),
    }
    result
}

pub async fn proxy_http_request(
    service: &LocalServiceConfig,
    request: TunnelHttpRequest,
) -> Result<TunnelHttpResponse> {
    let service = validate_local_service_config(service.clone())?;
    if service.protocol != LocalServiceProtocol::Http {
        return Err(anyhow!("local service is not configured for http tunnel"));
    }
    if !service.enabled {
        return Err(anyhow!("local service is disabled"));
    }
    if request.port != service.port {
        return Err(anyhow!("requested tunnel port is not configured"));
    }

    let method = Method::from_bytes(request.method.as_bytes())?;
    let url = build_local_service_url(&service, &request)?;
    let client = reqwest::Client::new();
    let mut builder = client.request(method, url);

    for (key, value) in request.headers.iter() {
        if should_forward_header(key) {
            if let Some(header_value) = normalize_header_value(value) {
                builder = builder.header(key, header_value);
            }
        }
    }

    if let Some(body) = request.body {
        builder = match body {
            Value::Null => builder,
            Value::String(value) => builder.body(value),
            other => builder.json(&other),
        };
    }

    let response = builder.send().await?;
    let status = response.status().as_u16();
    let headers = collect_response_headers(response.headers());
    let content_type = headers
        .get("content-type")
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();
    let bytes = response.bytes().await?;
    let body = if bytes.is_empty() {
        None
    } else if content_type.contains("application/json") {
        serde_json::from_slice::<Value>(&bytes).ok()
    } else {
        Some(Value::String(String::from_utf8_lossy(&bytes).to_string()))
    };

    Ok(TunnelHttpResponse {
        status,
        headers,
        body,
    })
}

pub async fn open_tcp_stream(state: &AppState, port: u16) -> Result<TcpStream> {
    let service = find_enabled_service(state, port)?;
    let service = validate_local_service_config(service)?;
    if service.protocol != LocalServiceProtocol::Tcp {
        return Err(anyhow!("local service is not configured for tcp tunnel"));
    }

    TcpStream::connect(format!("{}:{}", service.host, service.port))
        .await
        .map_err(Into::into)
}

fn find_enabled_service(state: &AppState, port: u16) -> Result<LocalServiceConfig> {
    let services = state
        .local_services
        .read()
        .map_err(|_| anyhow!("local service lock poisoned"))?;
    services
        .iter()
        .find(|service| service.port == port && service.enabled)
        .cloned()
        .ok_or_else(|| anyhow!("enabled local service for port {port} is not configured"))
}

fn build_local_service_url(
    service: &LocalServiceConfig,
    request: &TunnelHttpRequest,
) -> Result<Url> {
    let mut url = Url::parse(&format!("http://{}:{}", service.host, service.port))?;
    url.set_path(normalize_request_path(&request.path).as_str());
    {
        let mut query_pairs = url.query_pairs_mut();
        for (key, value) in request.query.iter() {
            match value {
                Value::Array(values) => {
                    for item in values {
                        query_pairs.append_pair(key, value_to_query_string(item).as_str());
                    }
                }
                Value::Null => {}
                other => {
                    query_pairs.append_pair(key, value_to_query_string(other).as_str());
                }
            }
        }
    }
    Ok(url)
}

fn normalize_request_path(path: &str) -> String {
    let trimmed = path.trim();
    if trimmed.is_empty() || trimmed == "/" {
        "/".to_string()
    } else if trimmed.starts_with('/') {
        trimmed.to_string()
    } else {
        format!("/{trimmed}")
    }
}

fn value_to_query_string(value: &Value) -> String {
    match value {
        Value::String(value) => value.clone(),
        Value::Bool(value) => value.to_string(),
        Value::Number(value) => value.to_string(),
        other => other.to_string(),
    }
}

fn normalize_header_value(value: &Value) -> Option<String> {
    match value {
        Value::String(value) => Some(value.clone()),
        Value::Array(values) => {
            let parts = values
                .iter()
                .filter_map(|value| value.as_str().map(ToString::to_string))
                .collect::<Vec<_>>();
            if parts.is_empty() {
                None
            } else {
                Some(parts.join(", "))
            }
        }
        _ => None,
    }
}

fn should_forward_header(key: &str) -> bool {
    !matches!(
        key.to_ascii_lowercase().as_str(),
        "authorization"
            | "connection"
            | "content-length"
            | "host"
            | "keep-alive"
            | "proxy-authenticate"
            | "proxy-authorization"
            | "te"
            | "trailer"
            | "transfer-encoding"
            | "upgrade"
    )
}

fn collect_response_headers(headers: &reqwest::header::HeaderMap) -> BTreeMap<String, String> {
    let mut result = BTreeMap::new();
    for (key, value) in headers.iter() {
        let lower = key.as_str().to_ascii_lowercase();
        if !should_forward_response_header(&lower) {
            continue;
        }
        if let Ok(value) = value.to_str() {
            result.insert(lower, value.to_string());
        }
    }
    result
}

fn should_forward_response_header(key: &str) -> bool {
    !matches!(
        key,
        "connection" | "content-length" | "keep-alive" | "transfer-encoding" | "upgrade"
    )
}
