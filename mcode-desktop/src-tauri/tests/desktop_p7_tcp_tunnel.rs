use std::sync::Arc;
use std::time::Duration;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use futures_util::{SinkExt, StreamExt};
use mcode_desktop_lib::app_state::{AppState, GatewayConfig, GatewayProvider};
use mcode_desktop_lib::gateway::upstream::connect_upstream;
use mcode_desktop_lib::tunnel::{LocalServiceConfig, LocalServiceProtocol};
use serde_json::{json, Value};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio_tungstenite::{accept_async, tungstenite::Message};

#[tokio::test]
async fn p7_upstream_proxies_raw_tcp_bytes_to_loopback_service() {
    let (local_port, local_server) = spawn_local_tcp_echo_server().await;
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
                    "type": "tcp_connect",
                    "streamId": "stream-1",
                    "port": local_port
                })
                .to_string()
                .into(),
            ))
            .await
            .unwrap();
        socket
            .send(Message::Text(
                json!({
                    "type": "tcp_data",
                    "streamId": "stream-1",
                    "dataBase64": BASE64.encode(b"ping")
                })
                .to_string()
                .into(),
            ))
            .await
            .unwrap();

        while let Some(Ok(message)) = socket.next().await {
            if message.is_text() {
                let value: Value = serde_json::from_str(message.to_text().unwrap()).unwrap();
                if value["type"] == "tcp_data" {
                    return value;
                }
            }
        }
        panic!("desktop did not send tcp_data");
    });

    let state = Arc::new(AppState::new_for_test());
    *state.relay_url.write().unwrap() = Some(format!("http://{relay_addr}"));
    *state.gateway_config.write().unwrap() = Some(GatewayConfig {
        provider: GatewayProvider::Official,
        base_url: format!("http://{relay_addr}"),
    });
    *state.local_services.write().unwrap() = vec![LocalServiceConfig {
        name: "Raw TCP".to_string(),
        host: "127.0.0.1".to_string(),
        port: local_port,
        protocol: LocalServiceProtocol::Tcp,
        enabled: true,
    }];

    let desktop = tokio::spawn(connect_upstream(Arc::clone(&state)));
    let response = tokio::time::timeout(Duration::from_secs(3), relay_server)
        .await
        .expect("relay should receive tcp_data")
        .expect("relay task should finish");
    desktop.abort();
    let local_request = local_server.await.unwrap();

    assert_eq!(local_request, b"ping");
    assert_eq!(response["type"], "tcp_data");
    assert_eq!(response["streamId"], "stream-1");
    let data = response["dataBase64"]
        .as_str()
        .expect("tcp_data should contain dataBase64");
    assert_eq!(BASE64.decode(data.as_bytes()).unwrap(), b"pong");
}

async fn spawn_local_tcp_echo_server() -> (u16, tokio::task::JoinHandle<Vec<u8>>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let server = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        let mut buffer = [0_u8; 32];
        let size = stream.read(&mut buffer).await.unwrap();
        stream.write_all(b"pong").await.unwrap();
        buffer[..size].to_vec()
    });
    (port, server)
}
