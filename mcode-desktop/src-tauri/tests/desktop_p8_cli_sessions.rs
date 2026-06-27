use mcode_desktop_lib::app_state::AppState;
use mcode_desktop_lib::health::build_health_snapshot;
use mcode_desktop_lib::runtime::dispatch_desktop_proxy_with_state;
use serde_json::json;

#[tokio::test]
async fn p8_creates_and_snapshots_cli_sessions() {
    let state = AppState::new_for_test();

    let response = dispatch_desktop_proxy_with_state(
        &state,
        "acp_connect",
        json!({ "agentType": "codex", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();

    let session_id = response["sessionId"].as_str().unwrap();
    assert!(session_id.starts_with("cli-"));
    assert_eq!(response["runtime"], "codex-cli");
    assert_eq!(response["agentType"], "codex");
    assert_eq!(response["status"], "connected");
    assert!(response["workingDir"]
        .as_str()
        .unwrap()
        .contains("mcode-desktop"));

    let snapshot = dispatch_desktop_proxy_with_state(
        &state,
        "acp_get_session_snapshot",
        json!({ "sessionId": session_id }),
    )
    .await
    .unwrap();

    assert_eq!(snapshot["session"]["sessionId"], session_id);
    assert_eq!(snapshot["session"]["status"], "connected");

    let health = build_health_snapshot(&state);
    assert_eq!(health.cli_sessions.len(), 1);
    assert_eq!(health.cli_sessions[0].session_id, session_id);
}

#[tokio::test]
async fn p8_resumes_disconnects_and_cancels_cli_sessions() {
    let state = AppState::new_for_test();
    let connected = dispatch_desktop_proxy_with_state(
        &state,
        "acp_connect",
        json!({ "agentType": "claude_code", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();
    let session_id = connected["sessionId"].as_str().unwrap();
    assert_eq!(connected["id"], session_id);
    assert_eq!(connected["connectionId"], session_id);

    let disconnected = dispatch_desktop_proxy_with_state(
        &state,
        "acp_disconnect",
        json!({ "connectionId": session_id }),
    )
    .await
    .unwrap();
    assert_eq!(disconnected["status"], "disconnected");

    let resumed = dispatch_desktop_proxy_with_state(
        &state,
        "acp_connect",
        json!({ "sessionId": session_id }),
    )
    .await
    .unwrap();
    assert_eq!(resumed["sessionId"], session_id);
    assert_eq!(resumed["status"], "connected");

    let canceled = dispatch_desktop_proxy_with_state(
        &state,
        "acp_cancel",
        json!({ "connection_id": session_id }),
    )
    .await
    .unwrap();
    assert_eq!(canceled["status"], "canceled");
    assert_eq!(canceled["canceled"], true);
    assert_eq!(canceled["session"]["cancelRequested"], true);
}

#[tokio::test]
async fn p8_rejects_invalid_session_working_dir_and_runtime_mismatch() {
    let state = AppState::new_for_test();
    let cargo_toml = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml");

    let invalid_working_dir = dispatch_desktop_proxy_with_state(
        &state,
        "acp_connect",
        json!({ "agentType": "codex", "workingDir": cargo_toml }),
    )
    .await
    .unwrap_err()
    .to_string();
    assert!(invalid_working_dir.contains("workingDir is not a directory"));

    let connected = dispatch_desktop_proxy_with_state(
        &state,
        "acp_connect",
        json!({ "agentType": "codex", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();
    let session_id = connected["sessionId"].as_str().unwrap();

    let mismatch = dispatch_desktop_proxy_with_state(
        &state,
        "acp_prompt",
        json!({
            "sessionId": session_id,
            "agentType": "claude_code",
            "prompt": "do not execute"
        }),
    )
    .await
    .unwrap_err()
    .to_string();
    assert!(mismatch.contains("belongs to codex-cli"));
}
