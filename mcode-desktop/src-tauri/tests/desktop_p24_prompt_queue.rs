use std::sync::{Arc, Mutex};
use std::time::Duration;

use mcode_desktop_lib::app_state::AppState;
use mcode_desktop_lib::health::build_health_snapshot;
use mcode_desktop_lib::runtime::{
    begin_hosted_turn_for_test, dispatch_desktop_proxy_with_event_sink,
    dispatch_desktop_proxy_with_event_sink_arc, dispatch_desktop_proxy_with_state,
    start_next_queued_prompt_if_idle, AcpEventEnvelope,
};
use serde_json::json;

fn fake_claude_command(script: &str) -> String {
    if cfg!(windows) {
        format!("powershell -NoProfile -ExecutionPolicy Bypass -File {script}")
    } else {
        format!("sh {script}")
    }
}

fn write_fake_claude_script() -> std::path::PathBuf {
    let extension = if cfg!(windows) { "ps1" } else { "sh" };
    let path = std::env::temp_dir().join(format!(
        "mcode-desktop-p24-claude-{}.{}",
        std::process::id(),
        extension
    ));
    let body = if cfg!(windows) {
        "Write-Output '{\"type\":\"content_delta\",\"text\":\"queued-ran\"}'\n"
    } else {
        "printf '%s\\n' '{\"type\":\"content_delta\",\"text\":\"queued-ran\"}'\n"
    };
    std::fs::write(&path, body).unwrap();
    path
}

#[tokio::test]
async fn p24_queues_prompt_when_session_turn_is_busy() {
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
        "acp_prompt",
        json!({
            "sessionId": session_id,
            "prompt": "queued ask",
            "sourceClientId": "client-watch",
            "client": { "deviceName": "Watch" }
        }),
        Some(Arc::new(move |event| {
            sink_events.lock().unwrap().push(event);
        })),
    )
    .await
    .unwrap();

    assert_eq!(response["status"], "queued");
    assert_eq!(response["queued"], true);
    assert_eq!(response["queuePosition"], 1);
    assert_eq!(response["queueLength"], 1);
    assert_eq!(response["activeTurnId"], "turn-live");
    assert_eq!(response["activeTurnOwnerClientId"], "client-phone");
    assert_eq!(response["sourceClientId"], "client-watch");
    assert_eq!(response["promptPreview"], "queued ask");

    let captured = events.lock().unwrap().clone();
    assert_eq!(captured[0].event_type, "turn_queued");
    assert_eq!(captured[0].data["queuePosition"], 1);
    assert_eq!(captured[0].data["sourceClientId"], "client-watch");
    assert_eq!(captured[1].event_type, "turn_queue_updated");

    let health = build_health_snapshot(&state);
    assert_eq!(health.prompt_queue_count, 1);
    assert_eq!(
        health.prompt_queue[0].prompt_preview.as_deref(),
        Some("queued ask")
    );
}

#[tokio::test]
async fn p24_can_cancel_queued_prompt_without_touching_active_turn() {
    let state = AppState::new_for_test();
    let connected = dispatch_desktop_proxy_with_state(
        &state,
        "acp_connect",
        json!({ "agentType": "claude_code", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();
    let session_id = connected["sessionId"].as_str().unwrap();
    begin_hosted_turn_for_test(&state, session_id, "turn-live", None).unwrap();
    let queued = dispatch_desktop_proxy_with_state(
        &state,
        "acp_prompt",
        json!({ "sessionId": session_id, "prompt": "queued ask" }),
    )
    .await
    .unwrap();
    let queue_item_id = queued["queueItemId"].as_str().unwrap();

    let response = dispatch_desktop_proxy_with_state(
        &state,
        "acp_cancel_queued_prompt",
        json!({ "sessionId": session_id, "queueItemId": queue_item_id }),
    )
    .await
    .unwrap();

    assert_eq!(response["status"], "cancelled");
    assert_eq!(response["queueItemId"], queue_item_id);
    let health = build_health_snapshot(&state);
    assert_eq!(health.prompt_queue_count, 0);
    assert_eq!(health.active_turn_count, 1);
}

#[tokio::test]
async fn p24_queue_if_busy_false_preserves_turn_busy_behavior() {
    let state = AppState::new_for_test();
    let connected = dispatch_desktop_proxy_with_state(
        &state,
        "acp_connect",
        json!({ "agentType": "claude_code", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();
    let session_id = connected["sessionId"].as_str().unwrap();
    begin_hosted_turn_for_test(&state, session_id, "turn-live", None).unwrap();

    let error = dispatch_desktop_proxy_with_state(
        &state,
        "acp_prompt",
        json!({ "sessionId": session_id, "prompt": "no queue", "queueIfBusy": false }),
    )
    .await
    .unwrap_err();

    assert!(error.to_string().contains("\"code\":\"turn_busy\""));
    assert_eq!(build_health_snapshot(&state).prompt_queue_count, 0);
}

#[tokio::test]
async fn p24_rejects_prompt_when_queue_is_full() {
    let state = AppState::new_for_test();
    let connected = dispatch_desktop_proxy_with_state(
        &state,
        "acp_connect",
        json!({ "agentType": "claude_code", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();
    let session_id = connected["sessionId"].as_str().unwrap();
    begin_hosted_turn_for_test(&state, session_id, "turn-live", None).unwrap();

    for index in 0..20 {
        let response = dispatch_desktop_proxy_with_state(
            &state,
            "acp_prompt",
            json!({ "sessionId": session_id, "prompt": format!("queued ask {index}") }),
        )
        .await
        .unwrap();
        assert_eq!(response["status"], "queued");
        assert_eq!(response["queuePosition"], index + 1);
    }

    let error = dispatch_desktop_proxy_with_state(
        &state,
        "acp_prompt",
        json!({ "sessionId": session_id, "prompt": "overflow ask" }),
    )
    .await
    .unwrap_err();

    assert!(error.to_string().contains("\"code\":\"turn_queue_full\""));
    assert_eq!(build_health_snapshot(&state).prompt_queue_count, 20);
}

#[tokio::test]
async fn p24_starts_next_queued_prompt_after_active_turn_settles() {
    let script = write_fake_claude_script();
    std::env::set_var(
        "MCODE_DESKTOP_TEST_CLAUDE_COMMAND",
        fake_claude_command(script.to_str().unwrap()),
    );

    let state = Arc::new(AppState::new_for_test());
    let connected = dispatch_desktop_proxy_with_event_sink_arc(
        Arc::clone(&state),
        "acp_connect",
        json!({ "agentType": "claude_code", "workingDir": env!("CARGO_MANIFEST_DIR") }),
        None,
    )
    .await
    .unwrap();
    let session_id = connected["sessionId"].as_str().unwrap().to_string();
    begin_hosted_turn_for_test(&state, &session_id, "turn-live", None).unwrap();
    let events = Arc::new(Mutex::new(Vec::<AcpEventEnvelope>::new()));
    let sink_events = Arc::clone(&events);

    dispatch_desktop_proxy_with_event_sink_arc(
        Arc::clone(&state),
        "acp_prompt",
        json!({ "sessionId": session_id, "prompt": "queued ask" }),
        Some(Arc::new(move |event| {
            sink_events.lock().unwrap().push(event);
        })),
    )
    .await
    .unwrap();
    mcode_desktop_lib::runtime::end_hosted_turn(&state, &session_id);
    start_next_queued_prompt_if_idle(Arc::clone(&state), session_id.clone(), None);

    tokio::time::sleep(Duration::from_millis(500)).await;
    std::env::remove_var("MCODE_DESKTOP_TEST_CLAUDE_COMMAND");

    let captured = events.lock().unwrap().clone();
    assert!(captured
        .iter()
        .any(|event| event.event_type == "turn_dequeued"));
    assert!(captured
        .iter()
        .any(|event| event.event_type == "turn_started"));
    assert_eq!(build_health_snapshot(&state).prompt_queue_count, 0);
    let session = build_health_snapshot(&state)
        .cli_sessions
        .into_iter()
        .find(|session| session.session_id == session_id)
        .unwrap();
    assert_eq!(
        session.status,
        mcode_desktop_lib::runtime::CliSessionStatus::Completed
    );
}
