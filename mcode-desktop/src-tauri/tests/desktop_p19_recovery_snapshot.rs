use std::fs;

use mcode_desktop_lib::app_state::{AppState, GatewayConfig, GatewayProvider};
use mcode_desktop_lib::recovery::{
    apply_recovery_snapshot, load_recovery_snapshot, save_recovery_snapshot_to_path,
};
use mcode_desktop_lib::runtime::{
    dispatch_desktop_proxy_with_state, CliPendingInteraction, CliSessionStatus,
};
use serde_json::json;

#[tokio::test]
async fn p19_snapshot_restores_gateway_services_and_interrupts_running_sessions() {
    let path = std::env::temp_dir().join(format!(
        "mcode-desktop-p19-state-{}.json",
        std::process::id()
    ));
    let state = AppState::new_for_test();

    *state.gateway_config.write().unwrap() = Some(GatewayConfig {
        provider: GatewayProvider::Custom,
        base_url: "https://gateway.example.com".to_string(),
    });
    *state.relay_url.write().unwrap() = Some("https://gateway.example.com".to_string());

    let connected = dispatch_desktop_proxy_with_state(
        &state,
        "acp_connect",
        json!({ "agentType": "codex", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();
    let session_id = connected["sessionId"].as_str().unwrap().to_string();
    {
        let mut sessions = state.cli_sessions.write().unwrap();
        sessions[0].status = CliSessionStatus::Running;
    }
    state
        .cli_pending_interactions
        .write()
        .unwrap()
        .push(CliPendingInteraction {
            interaction_id: "perm-1".to_string(),
            session_id: session_id.clone(),
            kind: "permission".to_string(),
            status: "pending".to_string(),
            created_at_ms: 1,
            resolved_at_ms: None,
            decision: None,
            value: None,
            responder_client_id: None,
            summary: "Run command?".to_string(),
            data: json!({ "id": "perm-1" }),
        });

    save_recovery_snapshot_to_path(&state, &path).unwrap();
    let snapshot = load_recovery_snapshot(&path).unwrap().unwrap();
    let restored = AppState::new_for_test();
    apply_recovery_snapshot(&restored, snapshot).unwrap();
    fs::remove_file(&path).ok();

    let sessions = restored.cli_sessions.read().unwrap();
    assert_eq!(sessions[0].session_id, session_id);
    assert_eq!(sessions[0].status, CliSessionStatus::Interrupted);
    assert_eq!(sessions[0].active_request_id, None);
    assert_eq!(sessions[0].app_server_active, false);

    let interactions = restored.cli_pending_interactions.read().unwrap();
    assert_eq!(interactions[0].status, "stale");
    assert_eq!(
        restored.relay_url.read().unwrap().as_deref(),
        Some("https://gateway.example.com")
    );
}

#[test]
fn p19_snapshot_excludes_pair_codes_and_token_like_fields() {
    let path = std::env::temp_dir().join(format!(
        "mcode-desktop-p19-no-secrets-{}.json",
        std::process::id()
    ));
    let state = AppState::new_for_test();

    save_recovery_snapshot_to_path(&state, &path).unwrap();
    let raw = fs::read_to_string(&path).unwrap();
    fs::remove_file(&path).ok();

    assert!(raw.contains("\"schema\": \"mcode.desktop.state.v1\""));
    assert!(!raw.contains("pairSecret"));
    assert!(!raw.contains("accessToken"));
    assert!(!raw.contains("refreshToken"));
}
