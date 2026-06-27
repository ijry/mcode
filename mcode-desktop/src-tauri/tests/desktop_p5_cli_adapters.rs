use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use mcode_desktop_lib::app_state::{AppState, GatewayConfig, GatewayProvider};
use mcode_desktop_lib::gateway::upstream::{build_proxy_response_frame, connect_upstream};
use mcode_desktop_lib::runtime::{
    apply_cli_statuses_to_state, detect_cli_runtime, dispatch_desktop_proxy, CliRuntimeKind,
    CliRuntimeStatus,
};
use serde_json::{json, Value};
use tokio::net::TcpListener;
use tokio_tungstenite::{accept_async, tungstenite::Message};

#[tokio::test]
async fn p5_normalizes_missing_cli_runtime_status() {
    let status = detect_cli_runtime(
        CliRuntimeKind::CodexCli,
        "mcode-definitely-missing-cli-binary",
    )
    .await;

    assert_eq!(status.id, "codex-cli");
    assert_eq!(status.binary, "mcode-definitely-missing-cli-binary");
    assert!(!status.installed);
    assert_eq!(status.status, "missing");
    assert_eq!(status.capability, "desktop.runtime.codex-cli");
    assert!(status.error.is_some());
}

#[tokio::test]
async fn p5_normalizes_cli_version_to_first_line() {
    let status = detect_cli_runtime(CliRuntimeKind::ClaudeCli, "rustc").await;

    assert!(status.installed);
    assert_eq!(status.capability, "desktop.runtime.claude-cli");
    let version = status.version.expect("rustc should report a version");
    assert!(version.starts_with("rustc "));
    assert!(!version.contains('\n'));
}

#[test]
fn p5_applies_installed_runtime_capabilities_to_state() {
    let state = AppState::new_for_test();
    apply_cli_statuses_to_state(
        &state,
        &[
            runtime_status(CliRuntimeKind::CodexCli, true),
            runtime_status(CliRuntimeKind::ClaudeCli, false),
        ],
    );

    let capabilities = state.capabilities.read().unwrap().clone();
    assert!(capabilities.contains(&"desktop.tunnel.available".to_string()));
    assert!(capabilities.contains(&"desktop.runtime.codex-cli".to_string()));
    assert!(!capabilities.contains(&"desktop.runtime.claude-cli".to_string()));
    assert_eq!(state.cli_runtimes.read().unwrap().len(), 2);
}

#[tokio::test]
async fn p5_routes_desktop_agent_listing_and_options() {
    let agents = dispatch_desktop_proxy("acp_list_agents", json!({}))
        .await
        .unwrap();
    let agents = agents.as_array().expect("agent list should be an array");

    assert!(agents.iter().any(|agent| agent["agent_type"] == "codex"));
    assert!(agents
        .iter()
        .any(|agent| agent["agent_type"] == "claude_code"));

    let options = dispatch_desktop_proxy(
        "acp_describe_agent_options",
        json!({ "agentType": "codex" }),
    )
    .await
    .unwrap();

    assert_eq!(options["agentType"], "codex");
    assert_eq!(options["runtime"], "codex-cli");
    assert!(options["modes"].is_null());
    assert!(options["config_options"].as_array().unwrap().is_empty());
}

#[tokio::test]
async fn p5_rejects_unsupported_desktop_proxy_commands() {
    let error = dispatch_desktop_proxy("unknown_command", json!({}))
        .await
        .unwrap_err()
        .to_string();

    assert!(error.contains("unsupported desktop proxy command"));
}

#[test]
fn p5_builds_proxy_response_frames() {
    let ok = build_proxy_response_frame("proxy-1", Ok(json!({ "ok": true })));
    assert_eq!(ok["type"], "proxy_response");
    assert_eq!(ok["requestId"], "proxy-1");
    assert_eq!(ok["ok"], true);
    assert_eq!(ok["body"], json!({ "ok": true }));

    let error = build_proxy_response_frame("proxy-2", Err("failed".to_string()));
    assert_eq!(error["type"], "proxy_response");
    assert_eq!(error["requestId"], "proxy-2");
    assert_eq!(error["ok"], false);
    assert_eq!(error["error"], "failed");
}

#[tokio::test]
async fn p5_upstream_replies_to_proxy_request_frames() {
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
                    "type": "proxy_request",
                    "requestId": "proxy-1",
                    "command": "acp_describe_agent_options",
                    "payload": { "agentType": "codex" }
                })
                .to_string()
                .into(),
            ))
            .await
            .unwrap();

        while let Some(Ok(message)) = socket.next().await {
            if message.is_text() {
                let value: Value = serde_json::from_str(message.to_text().unwrap()).unwrap();
                if value["type"] == "proxy_response" {
                    return value;
                }
            }
        }
        panic!("desktop did not send proxy_response");
    });

    let state = Arc::new(AppState::new_for_test());
    *state.relay_url.write().unwrap() = Some(format!("http://{relay_addr}"));
    *state.gateway_config.write().unwrap() = Some(GatewayConfig {
        provider: GatewayProvider::Official,
        base_url: format!("http://{relay_addr}"),
    });

    let desktop = tokio::spawn(connect_upstream(Arc::clone(&state)));
    let response = tokio::time::timeout(Duration::from_secs(3), relay_server)
        .await
        .expect("relay should receive proxy_response")
        .expect("relay task should finish");
    desktop.abort();

    assert_eq!(response["type"], "proxy_response");
    assert_eq!(response["requestId"], "proxy-1");
    assert_eq!(response["ok"], true);
    assert_eq!(response["body"]["runtime"], "codex-cli");
    assert!(response["body"]["config_options"]
        .as_array()
        .unwrap()
        .is_empty());
}

fn runtime_status(runtime: CliRuntimeKind, installed: bool) -> CliRuntimeStatus {
    CliRuntimeStatus {
        id: runtime.id().to_string(),
        display_name: runtime.display_name().to_string(),
        binary: runtime.binary().to_string(),
        installed,
        version: installed.then(|| "test 1.0.0".to_string()),
        capability: runtime.capability().to_string(),
        status: if installed { "available" } else { "missing" }.to_string(),
        error: None,
        runtime,
    }
}
