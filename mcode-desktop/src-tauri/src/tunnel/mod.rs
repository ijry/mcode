use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;

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
