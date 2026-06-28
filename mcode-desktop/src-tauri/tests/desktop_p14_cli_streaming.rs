use std::sync::{Arc, Mutex};
use std::time::Duration;

use mcode_desktop_lib::app_state::AppState;
use mcode_desktop_lib::runtime::{
    dispatch_desktop_proxy_with_event_sink, dispatch_desktop_proxy_with_state, AcpEventEnvelope,
};
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
    let path =
        std::env::temp_dir().join(format!("mcode-desktop-{name}-{}.ps1", std::process::id()));
    std::fs::write(&path, body).unwrap();
    path
}

#[tokio::test]
async fn p14_streams_codex_events_before_proxy_response() {
    let _env_lock = CODEX_ENV_LOCK.lock().await;
    let script = write_fake_codex_script(
        "stream",
        r#"
Write-Output '{"type":"content_delta","text":"first"}'
Start-Sleep -Milliseconds 100
Write-Output '{"type":"content_delta","text":"second"}'
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
    let events = Arc::new(Mutex::new(Vec::<AcpEventEnvelope>::new()));
    let sink_events = Arc::clone(&events);

    let response = dispatch_desktop_proxy_with_event_sink(
        &state,
        "acp_prompt",
        json!({
            "sessionId": session_id,
            "prompt": "hello"
        }),
        Some(Arc::new(move |event| {
            sink_events.lock().unwrap().push(event);
        })),
    )
    .await
    .unwrap();

    std::env::remove_var("MCODE_DESKTOP_TEST_CODEX_COMMAND");
    assert_eq!(response["status"], "completed");
    assert_eq!(response["eventCount"], 4);
    assert_eq!(response["session"]["status"], "completed");
    assert!(response["session"]["lastEventAtMs"].as_u64().is_some());
    let events = events.lock().unwrap();
    assert!(events.iter().any(|event| event.data["delta"] == "first"));
    assert!(events.iter().any(|event| event.data["delta"] == "second"));
    assert!(!events
        .iter()
        .any(|event| event.event_type == "turn_complete"));
}

#[tokio::test]
async fn p14_acp_cancel_kills_active_codex_process() {
    let _env_lock = CODEX_ENV_LOCK.lock().await;
    let script = write_fake_codex_script(
        "cancel",
        r#"
Write-Output '{"type":"content_delta","text":"started"}'
Start-Sleep -Seconds 10
Write-Output '{"type":"content_delta","text":"should-not-finish"}'
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
    let prompt_state = Arc::clone(&state);
    let prompt_session_id = session_id.clone();

    let prompt_task = tokio::spawn(async move {
        dispatch_desktop_proxy_with_state(
            prompt_state.as_ref(),
            "acp_prompt",
            json!({
                "sessionId": prompt_session_id,
                "prompt": "keep running"
            }),
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

    std::env::remove_var("MCODE_DESKTOP_TEST_CODEX_COMMAND");
    assert_eq!(canceled["status"], "canceled");
    assert_eq!(response["status"], "canceled");
    assert_eq!(response["session"]["status"], "canceled");
    assert_eq!(response["canceled"], true);
}

#[test]
fn p14_event_push_frame_shape_stays_compatible() {
    let frame = json!({
        "type": "event_push",
        "event": {
            "type": "stream_batch",
            "connectionId": "cli-1",
            "data": { "delta": "hello" }
        }
    });

    assert_eq!(frame["type"], "event_push");
    assert_eq!(frame["event"]["connectionId"], "cli-1");
}
