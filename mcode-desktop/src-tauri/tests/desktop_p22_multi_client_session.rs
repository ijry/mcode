use std::sync::Arc;

use mcode_desktop_lib::app_state::AppState;
use mcode_desktop_lib::health::build_health_snapshot;
use mcode_desktop_lib::runtime::{
    capture_pending_interaction, dispatch_desktop_proxy_with_state, AcpEventEnvelope,
};
use serde_json::json;

#[tokio::test]
async fn p22_records_active_turn_owner_and_rejects_concurrent_prompt() {
    let state = Arc::new(AppState::new_for_test());
    let connected = dispatch_desktop_proxy_with_state(
        state.as_ref(),
        "acp_connect",
        json!({ "agentType": "claude_code", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();
    let session_id = connected["sessionId"].as_str().unwrap();

    mcode_desktop_lib::runtime::begin_hosted_turn_for_test(
        state.as_ref(),
        session_id,
        "turn-live",
        Some("client-phone".to_string()),
    )
    .unwrap();

    let error = dispatch_desktop_proxy_with_state(
        state.as_ref(),
        "acp_prompt",
        json!({
            "sessionId": session_id,
            "prompt": "second turn",
            "sourceClientId": "client-watch",
            "queueIfBusy": false
        }),
    )
    .await
    .unwrap_err();

    let message = error.to_string();
    assert!(message.contains("\"code\":\"turn_busy\""));
    assert!(message.contains("\"activeTurnOwnerClientId\":\"client-phone\""));
}

#[tokio::test]
async fn p22_first_responder_wins_for_pending_permission() {
    let state = AppState::new_for_test();
    capture_pending_interaction(
        &state,
        "session-1",
        &AcpEventEnvelope {
            event_type: "permission_request".to_string(),
            connection_id: "session-1".to_string(),
            data: json!({ "requestId": "perm-1", "description": "Run command?" }),
        },
    );

    let first = dispatch_desktop_proxy_with_state(
        &state,
        "acp_respond_permission",
        json!({
            "sessionId": "session-1",
            "requestId": "perm-1",
            "decision": "allow",
            "sourceClientId": "client-phone"
        }),
    )
    .await
    .unwrap();
    assert_eq!(first["interaction"]["responderClientId"], "client-phone");
    assert_eq!(first["events"][0]["data"]["responderClientId"], "client-phone");

    let second = dispatch_desktop_proxy_with_state(
        &state,
        "acp_respond_permission",
        json!({
            "sessionId": "session-1",
            "requestId": "perm-1",
            "decision": "deny",
            "sourceClientId": "client-watch"
        }),
    )
    .await
    .unwrap_err();
    assert!(second.to_string().contains("permission interaction not found"));

    let health = build_health_snapshot(&state);
    assert_eq!(
        health.cli_pending_interactions[0]
            .responder_client_id
            .as_deref(),
        Some("client-phone")
    );
}
