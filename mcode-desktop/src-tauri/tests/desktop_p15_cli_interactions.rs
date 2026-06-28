use std::sync::Arc;

use mcode_desktop_lib::app_state::AppState;
use mcode_desktop_lib::health::build_health_snapshot;
use mcode_desktop_lib::runtime::dispatch_desktop_proxy_with_state;
use serde_json::json;
use tokio::sync::Mutex as AsyncMutex;

static CODEX_ENV_LOCK: AsyncMutex<()> = AsyncMutex::const_new(());

fn fake_codex_command(script: &str) -> String {
    if cfg!(windows) {
        format!("powershell -NoProfile -ExecutionPolicy Bypass -File {script}")
    } else {
        format!("sh {script}")
    }
}

fn write_fake_codex_script(name: &str, body: &str) -> std::path::PathBuf {
    let path = std::env::temp_dir().join(format!(
        "mcode-desktop-p15-{name}-{}.ps1",
        std::process::id()
    ));
    std::fs::write(&path, body).unwrap();
    path
}

#[tokio::test]
async fn p15_captures_permission_and_question_requests_from_cli_events() {
    let _env_lock = CODEX_ENV_LOCK.lock().await;
    let script = write_fake_codex_script(
        "pending",
        r#"
Write-Output '{"type":"permission_request","requestId":"perm-1","description":"Run shell command?"}'
Write-Output '{"type":"question_request","questionId":"question-1","questions":[{"id":"choice","question":"Pick one"}]}'
"#,
    );
    std::env::set_var(
        "MCODE_DESKTOP_TEST_CODEX_COMMAND",
        fake_codex_command(script.to_str().unwrap()),
    );
    let state = AppState::new_for_test();
    let connected = dispatch_desktop_proxy_with_state(
        &state,
        "acp_connect",
        json!({ "agentType": "codex", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();
    let session_id = connected["sessionId"].as_str().unwrap().to_string();

    let response = dispatch_desktop_proxy_with_state(
        &state,
        "acp_prompt",
        json!({ "sessionId": session_id, "prompt": "trigger interactions" }),
    )
    .await
    .unwrap();

    std::env::remove_var("MCODE_DESKTOP_TEST_CODEX_COMMAND");
    assert_eq!(response["eventCount"], 4);
    let health = build_health_snapshot(&state);
    assert_eq!(health.cli_pending_interactions.len(), 2);
    assert!(health
        .cli_pending_interactions
        .iter()
        .any(|interaction| interaction.kind == "permission"
            && interaction.interaction_id == "perm-1"
            && interaction.summary == "Run shell command?"));
    assert!(health
        .cli_pending_interactions
        .iter()
        .any(|interaction| interaction.kind == "question"
            && interaction.interaction_id == "question-1"
            && interaction.summary == "Pick one"));
}

#[tokio::test]
async fn p15_resolves_permission_and_question_requests_as_acp_events() {
    let _env_lock = CODEX_ENV_LOCK.lock().await;
    let script = write_fake_codex_script(
        "resolve",
        r#"
Write-Output '{"type":"permission_request","requestId":"perm-2","description":"Run command?"}'
Write-Output '{"type":"question_request","questionId":"question-2","questions":[{"id":"path","question":"Which path?"}]}'
"#,
    );
    std::env::set_var(
        "MCODE_DESKTOP_TEST_CODEX_COMMAND",
        fake_codex_command(script.to_str().unwrap()),
    );
    let state = Arc::new(AppState::new_for_test());
    let connected = dispatch_desktop_proxy_with_state(
        state.as_ref(),
        "acp_connect",
        json!({ "agentType": "codex", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();
    let session_id = connected["sessionId"].as_str().unwrap().to_string();
    dispatch_desktop_proxy_with_state(
        state.as_ref(),
        "acp_prompt",
        json!({ "sessionId": session_id, "prompt": "trigger interactions" }),
    )
    .await
    .unwrap();

    let permission = dispatch_desktop_proxy_with_state(
        state.as_ref(),
        "acp_respond_permission",
        json!({
            "sessionId": session_id,
            "requestId": "perm-2",
            "decision": "allow"
        }),
    )
    .await
    .unwrap();
    let question = dispatch_desktop_proxy_with_state(
        state.as_ref(),
        "acp_respond_question",
        json!({
            "sessionId": session_id,
            "questionId": "question-2",
            "answer": { "path": "src" }
        }),
    )
    .await
    .unwrap();

    std::env::remove_var("MCODE_DESKTOP_TEST_CODEX_COMMAND");
    assert_eq!(permission["events"][0]["type"], "permission_resolved");
    assert_eq!(permission["events"][0]["data"]["requestId"], "perm-2");
    assert_eq!(permission["events"][0]["data"]["decision"], "allow");
    assert_eq!(question["events"][0]["type"], "question_resolved");
    assert_eq!(question["events"][0]["data"]["questionId"], "question-2");
    assert_eq!(question["events"][0]["data"]["answer"]["path"], "src");

    let health = build_health_snapshot(state.as_ref());
    assert_eq!(
        health
            .cli_pending_interactions
            .iter()
            .filter(|interaction| interaction.status == "resolved")
            .count(),
        2
    );
}
