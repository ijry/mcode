use std::collections::BTreeMap;
use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use mcode_desktop_lib::app_state::{AppState, GatewayConfig, GatewayProvider};
use mcode_desktop_lib::gateway::upstream::connect_upstream;
use mcode_desktop_lib::tunnel::{
    proxy_http_request, serve_tunnel_request, LocalServiceConfig, LocalServiceProtocol,
    TunnelHttpRequest,
};
use serde_json::{json, Map, Value};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio_tungstenite::{accept_async, tungstenite::Message};

#[tokio::test]
async fn p4_proxies_json_http_request_to_loopback_service() {
    let (port, server) = spawn_local_http_server(
        "HTTP/1.1 201 Created\r\ncontent-type: application/json\r\nx-local-test: ok\r\ncontent-length: 16\r\n\r\n{\"proxied\":true}",
    )
    .await;

    let service = LocalServiceConfig {
        name: "Code".to_string(),
        host: "127.0.0.1".to_string(),
        port,
        protocol: LocalServiceProtocol::Http,
        enabled: true,
    };
    let response = proxy_http_request(&service, tunnel_request(port, "POST", "/preview"))
        .await
        .unwrap();
    let raw_request = server.await.unwrap();

    assert!(raw_request.starts_with("POST /preview?tab=1 HTTP/1.1"));
    assert!(raw_request.contains("{\"hello\":\"world\"}"));
    assert_eq!(response.status, 201);
    assert_eq!(
        response.headers.get("x-local-test").map(String::as_str),
        Some("ok")
    );
    assert_eq!(response.body, Some(json!({ "proxied": true })));
}

#[tokio::test]
async fn p4_rejects_unconfigured_tunnel_ports() {
    let state = AppState::new_for_test();
    let result = serve_tunnel_request(&state, tunnel_request(65000, "GET", "/")).await;

    assert!(result
        .unwrap_err()
        .to_string()
        .contains("enabled local service for port 65000 is not configured"));
}

#[tokio::test]
async fn p4_upstream_replies_to_tunnel_request_frames() {
    let (local_port, local_server) = spawn_local_http_server(
        "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: 11\r\n\r\n{\"ok\":true}",
    )
    .await;
    let relay = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let relay_addr = relay.local_addr().unwrap();

    let relay_server = tokio::spawn(async move {
        let (stream, _) = relay.accept().await.unwrap();
        let mut socket = accept_async(stream).await.unwrap();
        let hello = socket.next().await.unwrap().unwrap();
        assert!(hello
            .to_text()
            .unwrap()
            .contains("\"type\":\"desktop_hello\""));

        socket
            .send(Message::Text(
                json!({
                    "type": "tunnel_request",
                    "requestId": "request-1",
                    "request": {
                        "port": local_port,
                        "method": "GET",
                        "path": "/status",
                        "query": {},
                        "headers": {},
                        "body": null
                    }
                })
                .to_string()
                .into(),
            ))
            .await
            .unwrap();

        while let Some(Ok(message)) = socket.next().await {
            if message.is_text() {
                let value: Value = serde_json::from_str(message.to_text().unwrap()).unwrap();
                if value["type"] == "tunnel_response" {
                    return value;
                }
            }
        }
        panic!("desktop did not send tunnel_response");
    });

    let state = Arc::new(AppState::new_for_test());
    *state.relay_url.write().unwrap() = Some(format!("http://{relay_addr}"));
    *state.gateway_config.write().unwrap() = Some(GatewayConfig {
        provider: GatewayProvider::Official,
        base_url: format!("http://{relay_addr}"),
    });
    *state.local_services.write().unwrap() = vec![LocalServiceConfig {
        name: "Code".to_string(),
        host: "127.0.0.1".to_string(),
        port: local_port,
        protocol: LocalServiceProtocol::Http,
        enabled: true,
    }];

    let desktop = tokio::spawn(connect_upstream(Arc::clone(&state)));
    let response = tokio::time::timeout(Duration::from_secs(3), relay_server)
        .await
        .expect("relay should receive tunnel_response")
        .expect("relay task should finish");
    desktop.abort();
    local_server.await.unwrap();

    assert_eq!(response["type"], "tunnel_response");
    assert_eq!(response["requestId"], "request-1");
    assert_eq!(response["ok"], true);
    assert_eq!(response["status"], 200);
    assert_eq!(response["body"], json!({ "ok": true }));
}

fn tunnel_request(port: u16, method: &str, path: &str) -> TunnelHttpRequest {
    let mut query = Map::new();
    query.insert("tab".to_string(), Value::String("1".to_string()));
    let mut headers = BTreeMap::new();
    headers.insert(
        "content-type".to_string(),
        Value::String("application/json".to_string()),
    );
    headers.insert(
        "authorization".to_string(),
        Value::String("Bearer should-not-forward".to_string()),
    );

    TunnelHttpRequest {
        port,
        method: method.to_string(),
        path: path.to_string(),
        query,
        headers,
        body: Some(json!({ "hello": "world" })),
    }
}

async fn spawn_local_http_server(response: &'static str) -> (u16, tokio::task::JoinHandle<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let server = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        let mut buffer = vec![0_u8; 4096];
        let mut request = Vec::new();
        loop {
            let read = stream.read(&mut buffer).await.unwrap();
            if read == 0 {
                break;
            }
            request.extend_from_slice(&buffer[..read]);
            if request.windows(4).any(|window| window == b"\r\n\r\n")
                && request_body_complete(&request)
            {
                break;
            }
        }
        stream.write_all(response.as_bytes()).await.unwrap();
        String::from_utf8_lossy(&request).to_string()
    });
    (port, server)
}

fn request_body_complete(request: &[u8]) -> bool {
    let text = String::from_utf8_lossy(request);
    let Some(header_end) = text.find("\r\n\r\n") else {
        return false;
    };
    let content_length = text[..header_end]
        .lines()
        .find_map(|line| {
            let (key, value) = line.split_once(':')?;
            if key.eq_ignore_ascii_case("content-length") {
                value.trim().parse::<usize>().ok()
            } else {
                None
            }
        })
        .unwrap_or(0);
    request.len() >= header_end + 4 + content_length
}
