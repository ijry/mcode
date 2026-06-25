use std::sync::Arc;
use std::time::Duration;

use futures_util::StreamExt;
use mcode_desktop_lib::app_state::{
    AppState, GatewayConfig, GatewayProvider, PairOffer, UpstreamStatus,
};
use mcode_desktop_lib::gateway::upstream::{
    build_pair_offer_frame, build_upstream_ws_url, connect_upstream,
};
use mcode_desktop_lib::health::build_health_snapshot;
use mcode_desktop_lib::pairing::{
    build_gateway_qr_payload, generate_pair_offer, GatewayQrPayloadInput, PairOfferRequest,
};
use mcode_desktop_lib::tunnel::{
    default_code_service, validate_local_service_config, LocalServiceConfig, LocalServiceProtocol,
};
use tokio::net::TcpListener;
use tokio_tungstenite::accept_async;

#[test]
fn p3_health_snapshot_reports_desktop_identity_and_capabilities() {
    let state = AppState::new_for_test();
    let snapshot = build_health_snapshot(&state);

    assert_eq!(snapshot.target_agent, "mcode-desktop");
    assert!(snapshot.target_id.starts_with("desktop-"));
    assert_eq!(snapshot.display_name, "MCode Desktop");
    assert_eq!(snapshot.upstream_status, UpstreamStatus::Offline);
    assert!(snapshot
        .capabilities
        .contains(&"desktop.tunnel.available".to_string()));
    assert!(!snapshot.version.is_empty());
}

#[test]
fn p3_pair_payload_matches_mcode_v2_gateway_schema() {
    let payload = build_gateway_qr_payload(GatewayQrPayloadInput {
        name: "Workstation".to_string(),
        gateway_provider: GatewayProvider::Custom,
        gateway_base_url: Some("https://gateway.example.com/".to_string()),
        pair_code: "ABCD-1234".to_string(),
        pair_secret: "secret".to_string(),
    });

    assert_eq!(payload.version, 2);
    assert_eq!(payload.target_agent, "mcode-desktop");
    assert_eq!(payload.route_mode, "gateway");
    assert_eq!(payload.gateway_provider, GatewayProvider::Custom);
    assert_eq!(
        payload.gateway_base_url.as_deref(),
        Some("https://gateway.example.com")
    );
}

#[test]
fn p3_generate_pair_offer_returns_code_secret_and_json_payload() {
    let offer = generate_pair_offer(PairOfferRequest {
        name: "Workstation".to_string(),
        gateway_provider: GatewayProvider::Official,
        gateway_base_url: Some("http://127.0.0.1:8787".to_string()),
    });

    assert!(offer.code.contains('-'));
    assert_eq!(offer.code.len(), 9);
    assert_eq!(offer.code.chars().nth(4), Some('-'));
    assert!(offer.secret.len() >= 32);
    assert!(offer.qr_payload.contains("\"targetAgent\":\"mcode-desktop\""));
}

#[test]
fn p3_builds_gateway_upstream_websocket_url() {
    assert_eq!(
        build_upstream_ws_url("https://relay.example.com").unwrap(),
        "wss://relay.example.com/v1/tunnel/desktop"
    );
    assert_eq!(
        build_upstream_ws_url("http://127.0.0.1:8787/").unwrap(),
        "ws://127.0.0.1:8787/v1/tunnel/desktop"
    );
}

#[test]
fn p3_builds_pair_offer_frame_for_relay_registration() {
    let frame = build_pair_offer_frame(
        "desktop-1",
        "Workstation",
        &PairOffer {
            code: "ABCD-1234".to_string(),
            secret: "secret".to_string(),
            qr_payload: "{}".to_string(),
        },
        vec!["desktop.tunnel.available".to_string()],
    );

    assert_eq!(frame["type"], "pair_offer");
    assert_eq!(frame["targetAgent"], "mcode-desktop");
    assert_eq!(frame["targetName"], "Workstation");
    assert_eq!(frame["capabilities"][0], "desktop.tunnel.available");
}

#[tokio::test]
async fn p3_connects_to_gateway_and_sends_registration_frames() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();

    let server = tokio::spawn(async move {
        let (stream, _) = listener.accept().await.unwrap();
        let mut socket = accept_async(stream).await.unwrap();
        let mut frames = Vec::<String>::new();
        while let Some(Ok(message)) = socket.next().await {
            if message.is_text() {
                frames.push(message.to_text().unwrap().to_string());
            }
            if frames.len() >= 2 {
                break;
            }
        }
        frames
    });

    let state = Arc::new(AppState::new_for_test());
    *state.relay_url.write().unwrap() = Some(format!("http://{addr}"));
    *state.gateway_config.write().unwrap() = Some(GatewayConfig {
        provider: GatewayProvider::Official,
        base_url: format!("http://{addr}"),
    });
    *state.pair_offer.write().unwrap() = Some(PairOffer {
        code: "PAIR-1234".to_string(),
        secret: "secret".to_string(),
        qr_payload: "{}".to_string(),
    });

    let client = tokio::spawn(connect_upstream(Arc::clone(&state)));
    let frames = tokio::time::timeout(Duration::from_secs(3), server)
        .await
        .expect("gateway should receive desktop frames")
        .expect("server task should finish");
    client.abort();

    assert!(frames
        .iter()
        .any(|frame| frame.contains("\"type\":\"desktop_hello\"")));
    assert!(frames
        .iter()
        .any(|frame| frame.contains("\"type\":\"pair_offer\"")));
}

#[test]
fn p3_accepts_loopback_http_service_on_1080() {
    let service = default_code_service();
    assert_eq!(service.name, "Code");
    assert_eq!(service.host, "127.0.0.1");
    assert_eq!(service.port, 1080);
    assert_eq!(service.protocol, LocalServiceProtocol::Http);
    assert!(validate_local_service_config(service).is_ok());
}

#[test]
fn p3_rejects_non_loopback_service_hosts() {
    let result = validate_local_service_config(LocalServiceConfig {
        name: "Unsafe".to_string(),
        host: "0.0.0.0".to_string(),
        port: 1080,
        protocol: LocalServiceProtocol::Http,
        enabled: true,
    });
    assert!(result.unwrap_err().to_string().contains("loopback"));
}
