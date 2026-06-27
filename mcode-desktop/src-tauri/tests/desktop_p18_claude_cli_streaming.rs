use std::sync::{Arc, Mutex};
use std::time::Duration;

use mcode_desktop_lib::app_state::AppState;
use mcode_desktop_lib::health::build_health_snapshot;
use mcode_desktop_lib::runtime::{
    dispatch_desktop_proxy_with_event_sink, dispatch_desktop_proxy_with_state, AcpEventEnvelope,
};
use serde_json::json;
use tokio::sync::Mutex as AsyncMutex;

static CLAUDE_ENV_LOCK: AsyncMutex<()> = AsyncMutex::const_new(());

fn fake_claude_command(script: &str) -> String {
    if cfg!(windows) {
        format!("powershell -NoProfile -ExecutionPolicy Bypass -File {script}")
    } else {
        format!("sh {script}")
    }
}

fn write_fake_claude_script(name: &str, body: &str) -> std::path::PathBuf {
    let extension = if cfg!(windows) { "ps1" } else { "sh" };
    let path = std::env::temp_dir().join(format!(
        "mcode-desktop-p18-claude-{name}-{}.{}",
        std::process::id(),
        extension
    ));
    std::fs::write(&path, body).unwrap();
    path
}

fn text_stream_script() -> &'static str {
    if cfg!(windows) {
        r#"
Write-Output 'hello from claude'
Start-Sleep -Milliseconds 100
Write-Output '{"type":"content_delta","text":"json delta"}'
"#
    } else {
        r#"
printf '%s\n' 'hello from claude'
sleep 0.1
printf '%s\n' '{"type":"content_delta","text":"json delta"}'
"#
    }
}

fn cancel_script() -> &'static str {
    if cfg!(windows) {
        r#"
Write-Output '{"type":"content_delta","text":"started"}'
Start-Sleep -Seconds 10
Write-Output '{"type":"content_delta","text":"should-not-finish"}'
"#
    } else {
        r#"
printf '%s\n' '{"type":"content_delta","text":"started"}'
sleep 10
printf '%s\n' '{"type":"content_delta","text":"should-not-finish"}'
"#
    }
}

fn interaction_script() -> &'static str {
    if cfg!(windows) {
        r#"
Write-Output '{"type":"permission_request","requestId":"claude-perm-1","description":"Allow Claude shell command?"}'
Write-Output '{"type":"question_request","questionId":"claude-question-1","questions":[{"id":"choice","question":"Pick a branch"}]}'
"#
    } else {
        r#"
printf '%s\n' '{"type":"permission_request","requestId":"claude-perm-1","description":"Allow Claude shell command?"}'
printf '%s\n' '{"type":"question_request","questionId":"claude-question-1","questions":[{"id":"choice","question":"Pick a branch"}]}'
"#
    }
}

#[tokio::test]
async fn p18_streams_claude_text_and_jsonl_events() {
    let _env_lock = CLAUDE_ENV_LOCK.lock().await;
    let script = write_fake_claude_script("stream", text_stream_script());
    std::env::set_var(
        "MCODE_DESKTOP_TEST_CLAUDE_COMMAND",
        fake_claude_command(script.to_str().unwrap()),
    );

    let state = AppState::new_for_test();
    let connected = dispatch_desktop_proxy_with_state(
        &state,
        "acp_connect",
        json!({ "agentType": "claude_code", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();
    let session_id = connected["sessionId"].as_str().unwrap().to_string();
    let events = Arc::new(Mutex::new(Vec::<AcpEventEnvelope>::new()));
    let sink_events = Arc::clone(&events);

    let response = dispatch_desktop_proxy_with_event_sink(
        &state,
        "acp_prompt",
        json!({ "sessionId": session_id, "prompt": "hello claude" }),
        Some(Arc::new(move |event| {
            sink_events.lock().unwrap().push(event);
        })),
    )
    .await
    .unwrap();

    std::env::remove_var("MCODE_DESKTOP_TEST_CLAUDE_COMMAND");
    assert_eq!(response["runtime"], "claude-cli");
    assert_eq!(response["protocol"], "claude-cli-stdio");
    assert_eq!(response["status"], "completed");
    assert_eq!(response["canceled"], false);
    assert!(response["eventCount"].as_u64().unwrap() >= 4);
    assert_eq!(response["session"]["status"], "completed");
    assert_eq!(response["session"]["protocol"], "claude-cli-stdio");
    assert!(response["session"]["lastEventAtMs"].as_u64().is_some());

    let events = events.lock().unwrap();
    assert!(events.iter().any(|event| {
        event.event_type == "stream_batch" && event.data["delta"] == "hello from claude"
    }));
    assert!(events
        .iter()
        .any(|event| event.event_type == "stream_batch" && event.data["delta"] == "json delta"));
    assert!(!events
        .iter()
        .any(|event| event.event_type == "turn_complete"));
}

#[tokio::test]
async fn p18_acp_cancel_kills_active_claude_process() {
    let _env_lock = CLAUDE_ENV_LOCK.lock().await;
    let script = write_fake_claude_script("cancel", cancel_script());
    std::env::set_var(
        "MCODE_DESKTOP_TEST_CLAUDE_COMMAND",
        fake_claude_command(script.to_str().unwrap()),
    );

    let state = Arc::new(AppState::new_for_test());
    let connected = dispatch_desktop_proxy_with_state(
        state.as_ref(),
        "acp_connect",
        json!({ "agentType": "claude_code", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();
    let session_id = connected["sessionId"].as_str().unwrap().to_string();
    let prompt_state = Arc::clone(&state);
    let prompt_session_id = session_id.clone();

    let prompt_task = tokio::spawn(async move {
        dispatch_desktop_proxy_with_state(
            prompt_state.as_ref(),
            "acp_prompt",
            json!({ "sessionId": prompt_session_id, "prompt": "keep running" }),
        )
        .await
    });

    tokio::time::sleep(Duration::from_millis(300)).await;
    let canceled = dispatch_desktop_proxy_with_state(
        state.as_ref(),
        "acp_cancel",
        json!({ "sessionId": session_id }),
    )
    .await
    .unwrap();
    let response = tokio::time::timeout(Duration::from_secs(3), prompt_task)
        .await
        .expect("prompt should stop after cancel")
        .expect("prompt task should join")
        .expect("prompt should resolve as canceled response");

    std::env::remove_var("MCODE_DESKTOP_TEST_CLAUDE_COMMAND");
    assert_eq!(canceled["status"], "canceled");
    assert_eq!(response["status"], "canceled");
    assert_eq!(response["canceled"], true);
    assert_eq!(response["session"]["status"], "canceled");
}

#[tokio::test]
async fn p18_captures_and_resolves_claude_interactions() {
    let _env_lock = CLAUDE_ENV_LOCK.lock().await;
    let script = write_fake_claude_script("interactions", interaction_script());
    std::env::set_var(
        "MCODE_DESKTOP_TEST_CLAUDE_COMMAND",
        fake_claude_command(script.to_str().unwrap()),
    );

    let state = Arc::new(AppState::new_for_test());
    let connected = dispatch_desktop_proxy_with_state(
        state.as_ref(),
        "acp_connect",
        json!({ "agentType": "claude_code", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();
    let session_id = connected["sessionId"].as_str().unwrap().to_string();

    let response = dispatch_desktop_proxy_with_state(
        state.as_ref(),
        "acp_prompt",
        json!({ "sessionId": session_id, "prompt": "trigger claude interactions" }),
    )
    .await
    .unwrap();
    assert_eq!(response["runtime"], "claude-cli");

    let health = build_health_snapshot(state.as_ref());
    assert!(health.cli_pending_interactions.iter().any(|interaction| {
        interaction.kind == "permission"
            && interaction.interaction_id == "claude-perm-1"
            && interaction.summary == "Allow Claude shell command?"
    }));
    assert!(health.cli_pending_interactions.iter().any(|interaction| {
        interaction.kind == "question"
            && interaction.interaction_id == "claude-question-1"
            && interaction.summary == "Pick a branch"
    }));

    let permission = dispatch_desktop_proxy_with_state(
        state.as_ref(),
        "acp_respond_permission",
        json!({
            "sessionId": session_id,
            "requestId": "claude-perm-1",
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
            "questionId": "claude-question-1",
            "answer": { "branch": "main" }
        }),
    )
    .await
    .unwrap();

    std::env::remove_var("MCODE_DESKTOP_TEST_CLAUDE_COMMAND");
    assert_eq!(permission["liveResolved"], false);
    assert_eq!(permission["events"][0]["type"], "permission_resolved");
    assert_eq!(question["liveResolved"], false);
    assert_eq!(question["events"][0]["type"], "question_resolved");
}
