use std::sync::{Arc, Mutex};

use mcode_desktop_lib::app_state::AppState;
use mcode_desktop_lib::health::build_health_snapshot;
use mcode_desktop_lib::runtime::{
    begin_hosted_turn_for_test, dispatch_desktop_proxy_with_event_sink,
    dispatch_desktop_proxy_with_state, AcpEventEnvelope,
};
use serde_json::json;

#[tokio::test]
async fn p23_cancel_records_requester_and_emits_events() {
    let state = AppState::new_for_test();
    let connected = dispatch_desktop_proxy_with_state(
        &state,
        "acp_connect",
        json!({ "agentType": "claude_code", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();
    let session_id = connected["sessionId"].as_str().unwrap();
    begin_hosted_turn_for_test(
        &state,
        session_id,
        "turn-live",
        Some("client-phone".to_string()),
    )
    .unwrap();

    let events = Arc::new(Mutex::new(Vec::<AcpEventEnvelope>::new()));
    let sink_events = Arc::clone(&events);
    let response = dispatch_desktop_proxy_with_event_sink(
        &state,
        "acp_cancel",
        json!({
            "sessionId": session_id,
            "reason": "user_cancelled_from_watch",
            "sourceClientId": "client-watch"
        }),
        Some(Arc::new(move |event| {
            sink_events.lock().unwrap().push(event);
        })),
    )
    .await
    .unwrap();

    assert_eq!(response["status"], "canceled");
    assert_eq!(response["cancelStatus"], "cancel_requested");
    assert_eq!(response["activeTurnId"], "turn-live");
    assert_eq!(response["activeTurnOwnerClientId"], "client-phone");
    assert_eq!(response["cancelRequestedByClientId"], "client-watch");
    assert_eq!(
        response["session"]["cancelRequestedByClientId"],
        "client-watch"
    );

    let captured = events.lock().unwrap().clone();
    assert_eq!(captured[0].event_type, "turn_cancel_requested");
    assert_eq!(captured[0].data["activeTurnId"], "turn-live");
    assert_eq!(
        captured[0].data["activeTurnOwnerClientId"],
        "client-phone"
    );
    assert_eq!(
        captured[0].data["cancelRequestedByClientId"],
        "client-watch"
    );
    assert_eq!(captured[1].event_type, "turn_cancelled");
    assert_eq!(captured[1].data["status"], "canceled");

    let health = build_health_snapshot(&state);
    assert_eq!(health.active_turn_count, 0);
    assert_eq!(
        health
            .cli_sessions
            .iter()
            .find(|session| session.session_id == session_id)
            .unwrap()
            .cancel_requested_by_client_id
            .as_deref(),
        Some("client-watch")
    );
}

#[tokio::test]
async fn p23_duplicate_cancel_is_idempotent_while_turn_is_cancelling() {
    let state = AppState::new_for_test();
    let connected = dispatch_desktop_proxy_with_state(
        &state,
        "acp_connect",
        json!({ "agentType": "claude_code", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();
    let session_id = connected["sessionId"].as_str().unwrap();
    begin_hosted_turn_for_test(
        &state,
        session_id,
        "turn-live",
        Some("client-phone".to_string()),
    )
    .unwrap();

    let first = mcode_desktop_lib::runtime::request_hosted_turn_cancel_for_test(
        &state,
        session_id,
        Some("client-watch".to_string()),
        Some("first".to_string()),
    )
    .unwrap();
    let second = mcode_desktop_lib::runtime::request_hosted_turn_cancel_for_test(
        &state,
        session_id,
        Some("client-tablet".to_string()),
        Some("second".to_string()),
    )
    .unwrap();

    assert_eq!(
        first.cancel_requested_by_client_id.as_deref(),
        Some("client-watch")
    );
    assert_eq!(
        second.cancel_requested_by_client_id.as_deref(),
        Some("client-watch")
    );
    assert_eq!(second.cancel_reason.as_deref(), Some("first"));
}
