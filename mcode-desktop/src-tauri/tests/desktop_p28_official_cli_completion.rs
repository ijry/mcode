use std::fs;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use mcode_desktop_lib::app_state::AppState;
use mcode_desktop_lib::health::build_health_snapshot;
use mcode_desktop_lib::recovery::{
    apply_recovery_snapshot, build_recovery_snapshot, save_recovery_snapshot_to_path,
};
use mcode_desktop_lib::runtime::{
    dispatch_desktop_proxy_with_event_sink, dispatch_desktop_proxy_with_state, AcpEventEnvelope,
    CliSessionStatus,
};
use serde_json::json;
use tokio::sync::Mutex as AsyncMutex;

static OFFICIAL_CLI_ENV_LOCK: AsyncMutex<()> = AsyncMutex::const_new(());

fn fake_command(script: &str) -> String {
    if cfg!(windows) {
        format!("powershell -NoProfile -ExecutionPolicy Bypass -File {script}")
    } else {
        format!("sh {script}")
    }
}

fn write_script(name: &str, body: &str) -> std::path::PathBuf {
    let extension = if cfg!(windows) { "ps1" } else { "sh" };
    let path = std::env::temp_dir().join(format!(
        "mcode-desktop-p28-{name}-{}.{}",
        std::process::id(),
        extension
    ));
    fs::write(&path, body).unwrap();
    path
}

fn codex_stream_script() -> &'static str {
    if cfg!(windows) {
        r#"
Write-Output '{"type":"content_delta","text":"codex line 1"}'
Start-Sleep -Milliseconds 100
Write-Output '{"type":"content_delta","text":"codex line 2"}'
"#
    } else {
        r#"
printf '%s\n' '{"type":"content_delta","text":"codex line 1"}'
sleep 0.1
printf '%s\n' '{"type":"content_delta","text":"codex line 2"}'
"#
    }
}

fn claude_stream_script() -> &'static str {
    if cfg!(windows) {
        r#"
Write-Output 'claude line 1'
Start-Sleep -Milliseconds 100
Write-Output '{"type":"content_delta","text":"claude line 2"}'
"#
    } else {
        r#"
printf '%s\n' 'claude line 1'
sleep 0.1
printf '%s\n' '{"type":"content_delta","text":"claude line 2"}'
"#
    }
}

fn interaction_script(prefix: &str) -> String {
    format!(
        r#"
Write-Output '{{"type":"permission_request","requestId":"{prefix}-perm-1","description":"Allow {prefix} shell command?"}}'
Write-Output '{{"type":"question_request","questionId":"{prefix}-question-1","questions":[{{"id":"choice","question":"Pick a branch"}}]}}'
"#
    )
}

fn cancel_script(prefix: &str) -> String {
    format!(
        r#"
Write-Output '{{"type":"content_delta","text":"{prefix} started"}}'
Start-Sleep -Seconds 10
Write-Output '{{"type":"content_delta","text":"{prefix} should-not-finish"}}'
"#
    )
}

#[tokio::test]
async fn p28_codex_and_claude_sessions_share_the_same_host_shape() {
    let _env_lock = OFFICIAL_CLI_ENV_LOCK.lock().await;
    let codex_script = write_script("codex-connect", "Write-Output 'codex ready'");
    let claude_script = write_script("claude-connect", "Write-Output 'claude ready'");
    std::env::set_var(
        "MCODE_DESKTOP_TEST_CODEX_COMMAND",
        fake_command(codex_script.to_str().unwrap()),
    );
    std::env::set_var(
        "MCODE_DESKTOP_TEST_CLAUDE_COMMAND",
        fake_command(claude_script.to_str().unwrap()),
    );

    let state = AppState::new_for_test();
    let codex = dispatch_desktop_proxy_with_state(
        &state,
        "acp_connect",
        json!({ "agentType": "codex", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();
    let claude = dispatch_desktop_proxy_with_state(
        &state,
        "acp_connect",
        json!({ "agentType": "claude_code", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();

    std::env::remove_var("MCODE_DESKTOP_TEST_CODEX_COMMAND");
    std::env::remove_var("MCODE_DESKTOP_TEST_CLAUDE_COMMAND");

    assert_eq!(codex["targetAgent"], "mcode-desktop");
    assert_eq!(claude["targetAgent"], "mcode-desktop");
    assert_eq!(codex["status"], "connected");
    assert_eq!(claude["status"], "connected");
    assert!(codex["sessionId"].as_str().unwrap().len() > 8);
    assert!(claude["sessionId"].as_str().unwrap().len() > 8);
}

#[tokio::test]
async fn p28_streams_codex_and_claude_events_with_shared_session_fields() {
    let _env_lock = OFFICIAL_CLI_ENV_LOCK.lock().await;
    let codex_script = write_script("codex-stream", codex_stream_script());
    let claude_script = write_script("claude-stream", claude_stream_script());
    std::env::set_var(
        "MCODE_DESKTOP_TEST_CODEX_COMMAND",
        fake_command(codex_script.to_str().unwrap()),
    );
    std::env::set_var(
        "MCODE_DESKTOP_TEST_CLAUDE_COMMAND",
        fake_command(claude_script.to_str().unwrap()),
    );

    let state = AppState::new_for_test();
    let codex_session = dispatch_desktop_proxy_with_state(
        &state,
        "acp_connect",
        json!({ "agentType": "codex", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();
    let claude_session = dispatch_desktop_proxy_with_state(
        &state,
        "acp_connect",
        json!({ "agentType": "claude_code", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();
    let codex_session_id = codex_session["sessionId"].as_str().unwrap().to_string();
    let claude_session_id = claude_session["sessionId"].as_str().unwrap().to_string();
    let events = Arc::new(Mutex::new(Vec::<AcpEventEnvelope>::new()));
    let sink_events = Arc::clone(&events);

    let codex_response = dispatch_desktop_proxy_with_event_sink(
        &state,
        "acp_prompt",
        json!({ "sessionId": codex_session_id, "prompt": "codex stream" }),
        Some(Arc::new(move |event| {
            sink_events.lock().unwrap().push(event);
        })),
    )
    .await
    .unwrap();
    let claude_response = dispatch_desktop_proxy_with_state(
        &state,
        "acp_prompt",
        json!({ "sessionId": claude_session_id, "prompt": "claude stream" }),
    )
    .await
    .unwrap();

    std::env::remove_var("MCODE_DESKTOP_TEST_CODEX_COMMAND");
    std::env::remove_var("MCODE_DESKTOP_TEST_CLAUDE_COMMAND");

    eprintln!("codex_response={}", codex_response);
    eprintln!("claude_response={}", claude_response);
    for response in [&codex_response, &claude_response] {
        assert!(response["runtime"] == "codex-cli" || response["runtime"] == "claude-cli");
        assert!(response.get("protocol").and_then(|value| value.as_str()).is_some());
        assert!(response["eventCount"].as_u64().unwrap() >= 2);
        assert!(response["streamedEventCount"].as_u64().unwrap() >= 1);
        assert!(response["exitCode"].is_number() || response["exitCode"].is_null());
        assert!(response["stderrPreview"].is_null() || response["stderrPreview"].is_string());
        assert!(response["session"]["lastEventAtMs"].as_u64().is_some());
        assert_eq!(response["session"]["targetAgent"], "mcode-desktop");
    }

    let events = events.lock().unwrap();
    assert!(events
        .iter()
        .filter(|event| event.event_type == "stream_batch")
        .count()
        >= 1);
    assert!(events
        .windows(2)
        .any(|pair| pair[0].event_type == "stream_batch" && pair[1].event_type == "stream_batch"));
}

#[tokio::test]
async fn p28_captures_and_resolves_official_cli_interactions() {
    let _env_lock = OFFICIAL_CLI_ENV_LOCK.lock().await;
    let codex_script = write_script("codex-interactions", &interaction_script("codex"));
    let claude_script = write_script("claude-interactions", &interaction_script("claude"));
    std::env::set_var(
        "MCODE_DESKTOP_TEST_CODEX_COMMAND",
        fake_command(codex_script.to_str().unwrap()),
    );
    std::env::set_var(
        "MCODE_DESKTOP_TEST_CLAUDE_COMMAND",
        fake_command(claude_script.to_str().unwrap()),
    );

    let state = Arc::new(AppState::new_for_test());
    let codex_session = dispatch_desktop_proxy_with_state(
        state.as_ref(),
        "acp_connect",
        json!({ "agentType": "codex", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();
    let claude_session = dispatch_desktop_proxy_with_state(
        state.as_ref(),
        "acp_connect",
        json!({ "agentType": "claude_code", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();
    let codex_session_id = codex_session["sessionId"].as_str().unwrap().to_string();
    let claude_session_id = claude_session["sessionId"].as_str().unwrap().to_string();

    dispatch_desktop_proxy_with_state(
        state.as_ref(),
        "acp_prompt",
        json!({ "sessionId": codex_session_id, "prompt": "trigger codex interactions" }),
    )
    .await
    .unwrap();
    dispatch_desktop_proxy_with_state(
        state.as_ref(),
        "acp_prompt",
        json!({ "sessionId": claude_session_id, "prompt": "trigger claude interactions" }),
    )
    .await
    .unwrap();

    let health = build_health_snapshot(state.as_ref());
    assert!(health.cli_pending_interactions.iter().any(|interaction| {
        interaction.kind == "permission" && interaction.interaction_id == "codex-perm-1"
    }));
    assert!(health.cli_pending_interactions.iter().any(|interaction| {
        interaction.kind == "question" && interaction.interaction_id == "claude-question-1"
    }));

    let codex_permission = dispatch_desktop_proxy_with_state(
        state.as_ref(),
        "acp_respond_permission",
        json!({
            "sessionId": codex_session_id,
            "requestId": "codex-perm-1",
            "decision": "allow"
        }),
    )
    .await
    .unwrap();
    let claude_question = dispatch_desktop_proxy_with_state(
        state.as_ref(),
        "acp_respond_question",
        json!({
            "sessionId": claude_session_id,
            "questionId": "claude-question-1",
            "answer": { "branch": "main" }
        }),
    )
    .await
    .unwrap();

    std::env::remove_var("MCODE_DESKTOP_TEST_CODEX_COMMAND");
    std::env::remove_var("MCODE_DESKTOP_TEST_CLAUDE_COMMAND");

    assert_eq!(codex_permission["events"][0]["type"], "permission_resolved");
    assert_eq!(claude_question["events"][0]["type"], "question_resolved");
    assert_eq!(codex_permission["targetAgent"], "mcode-desktop");
    assert_eq!(claude_question["targetAgent"], "mcode-desktop");
}

#[tokio::test]
async fn p28_cancel_and_recovery_surface_interrupted_official_cli_sessions() {
    let _env_lock = OFFICIAL_CLI_ENV_LOCK.lock().await;
    let codex_script = write_script("codex-cancel", &cancel_script("codex"));
    let claude_script = write_script("claude-cancel", &cancel_script("claude"));
    std::env::set_var(
        "MCODE_DESKTOP_TEST_CODEX_COMMAND",
        fake_command(codex_script.to_str().unwrap()),
    );
    std::env::set_var(
        "MCODE_DESKTOP_TEST_CLAUDE_COMMAND",
        fake_command(claude_script.to_str().unwrap()),
    );

    let state = Arc::new(AppState::new_for_test());
    let codex_session = dispatch_desktop_proxy_with_state(
        state.as_ref(),
        "acp_connect",
        json!({ "agentType": "codex", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();
    let claude_session = dispatch_desktop_proxy_with_state(
        state.as_ref(),
        "acp_connect",
        json!({ "agentType": "claude_code", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();
    let codex_session_id = codex_session["sessionId"].as_str().unwrap().to_string();
    let claude_session_id = claude_session["sessionId"].as_str().unwrap().to_string();

    let codex_state = Arc::clone(&state);
    let codex_prompt_session_id = codex_session_id.clone();
    let codex_prompt = tokio::spawn(async move {
        dispatch_desktop_proxy_with_state(
            codex_state.as_ref(),
            "acp_prompt",
            json!({ "sessionId": codex_prompt_session_id, "prompt": "codex cancel" }),
        )
        .await
    });
    let claude_state = Arc::clone(&state);
    let claude_prompt_session_id = claude_session_id.clone();
    let claude_prompt = tokio::spawn(async move {
        dispatch_desktop_proxy_with_state(
            claude_state.as_ref(),
            "acp_prompt",
            json!({ "sessionId": claude_prompt_session_id, "prompt": "claude cancel" }),
        )
        .await
    });

    tokio::time::sleep(Duration::from_millis(250)).await;
    let codex_canceled = dispatch_desktop_proxy_with_state(
        state.as_ref(),
        "acp_cancel",
        json!({ "sessionId": codex_session_id }),
    )
    .await
    .unwrap();
    let claude_canceled = dispatch_desktop_proxy_with_state(
        state.as_ref(),
        "acp_cancel",
        json!({ "sessionId": claude_session_id }),
    )
    .await
    .unwrap();

    let codex_response = tokio::time::timeout(Duration::from_secs(3), codex_prompt)
        .await
        .expect("codex prompt should stop after cancel")
        .expect("codex prompt task should join")
        .expect("codex prompt should resolve");
    let claude_response = tokio::time::timeout(Duration::from_secs(3), claude_prompt)
        .await
        .expect("claude prompt should stop after cancel")
        .expect("claude prompt task should join")
        .expect("claude prompt should resolve");

    assert_eq!(codex_canceled["status"], "canceled");
    assert_eq!(claude_canceled["status"], "canceled");
    assert_eq!(codex_response["status"], "canceled");
    assert_eq!(claude_response["status"], "canceled");
    assert_eq!(codex_response["session"]["status"], "canceled");
    assert_eq!(claude_response["session"]["status"], "canceled");
    assert!(codex_response["session"]["stderrPreview"].is_string() || codex_response["session"]["stderrPreview"].is_null());
    assert!(claude_response["session"]["stderrPreview"].is_string() || claude_response["session"]["stderrPreview"].is_null());

    let path = std::env::temp_dir().join(format!(
        "mcode-desktop-p28-recovery-state-{}.json",
        std::process::id()
    ));
    save_recovery_snapshot_to_path(state.as_ref(), &path).unwrap();
    let snapshot = build_recovery_snapshot(state.as_ref()).unwrap();
    let restored = AppState::new_for_test();
    apply_recovery_snapshot(&restored, snapshot).unwrap();
    fs::remove_file(&path).ok();

    let health = build_health_snapshot(&restored);
    assert!(health
        .cli_sessions
        .iter()
        .all(|session| session.status != CliSessionStatus::Running));
    assert!(health.cli_sessions.iter().any(|session| {
        session.status == CliSessionStatus::Interrupted || session.status == CliSessionStatus::Canceled
    }) || health.cli_sessions.is_empty());
    assert!(health
        .cli_sessions
        .iter()
        .all(|session| session.target_agent == "mcode-desktop"));
}
