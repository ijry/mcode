use std::sync::{Arc, Mutex};
use std::time::Duration;

use mcode_desktop_lib::app_state::AppState;
use mcode_desktop_lib::health::build_health_snapshot;
use mcode_desktop_lib::runtime::{
    dispatch_desktop_proxy_with_event_sink_arc, dispatch_desktop_proxy_with_state, AcpEventEnvelope,
};
use serde_json::json;
use tokio::sync::Mutex as AsyncMutex;

static CODEX_APP_SERVER_ENV_LOCK: AsyncMutex<()> = AsyncMutex::const_new(());

fn fake_codex_app_server_command(script: &str) -> String {
    if cfg!(windows) {
        format!("powershell -NoProfile -ExecutionPolicy Bypass -File {script}")
    } else {
        format!("sh {script}")
    }
}

fn write_fake_codex_app_server_script(name: &str, body: &str) -> std::path::PathBuf {
    let extension = if cfg!(windows) { "ps1" } else { "sh" };
    let path = std::env::temp_dir().join(format!(
        "mcode-desktop-p16-app-server-{name}-{}.{}",
        std::process::id(),
        extension
    ));
    std::fs::write(&path, body).unwrap();
    path
}

#[tokio::test]
async fn p16_codex_app_server_resolves_live_permission_request() {
    let _env_lock = CODEX_APP_SERVER_ENV_LOCK.lock().await;
    let script = if cfg!(windows) {
        write_fake_codex_app_server_script(
            "permission",
            r#"
$ErrorActionPreference = 'Stop'
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $msg = $line | ConvertFrom-Json
  if ($msg.method -eq 'initialize') {
    [Console]::Out.WriteLine((@{ jsonrpc='2.0'; id=$msg.id; result=@{ ok=$true } } | ConvertTo-Json -Compress -Depth 20))
    [Console]::Out.Flush()
    continue
  }
  if ($msg.method -eq 'initialized') {
    continue
  }
  if ($msg.method -eq 'thread/start') {
    [Console]::Out.WriteLine((@{ jsonrpc='2.0'; method='thread/started'; params=@{ threadId='thread-1' } } | ConvertTo-Json -Compress -Depth 20))
    [Console]::Out.WriteLine((@{ jsonrpc='2.0'; id=$msg.id; result=@{ thread=@{ id='thread-1' } } } | ConvertTo-Json -Compress -Depth 20))
    [Console]::Out.Flush()
    continue
  }
  if ($msg.method -eq 'turn/start') {
    $turnId = $msg.id
    [Console]::Out.WriteLine((@{ jsonrpc='2.0'; method='turn/started'; params=@{ turnId='turn-1' } } | ConvertTo-Json -Compress -Depth 20))
    [Console]::Out.WriteLine((@{ jsonrpc='2.0'; method='item/agentMessage/delta'; params=@{ delta='hello' } } | ConvertTo-Json -Compress -Depth 20))
    [Console]::Out.WriteLine((@{ jsonrpc='2.0'; id='perm-1'; method='item/commandExecution/requestApproval'; params=@{ requestId='perm-1'; description='Run command?'; toolCall=@{ name='shell'; input='pwd' }; options=@(@{ id='allow'; label='Allow' }, @{ id='deny'; label='Deny' }) } } | ConvertTo-Json -Compress -Depth 20))
    [Console]::Out.Flush()
    $permissionLine = [Console]::In.ReadLine()
    $permission = $permissionLine | ConvertFrom-Json
    if ($permission.result.decision -eq 'accept') {
      [Console]::Out.WriteLine((@{ jsonrpc='2.0'; method='item/agentMessage/delta'; params=@{ delta=' approved' } } | ConvertTo-Json -Compress -Depth 20))
    }
    [Console]::Out.WriteLine((@{ jsonrpc='2.0'; method='turn/completed'; params=@{ turnId='turn-1' } } | ConvertTo-Json -Compress -Depth 20))
    [Console]::Out.WriteLine((@{ jsonrpc='2.0'; id=$turnId; result=@{ turn=@{ id='turn-1' } } } | ConvertTo-Json -Compress -Depth 20))
    [Console]::Out.Flush()
    continue
  }
}
"#,
        )
    } else {
        write_fake_codex_app_server_script(
            "permission",
            r#"
while IFS= read -r line; do
  case "$line" in
    *'"method":"initialize"'*) echo '{"jsonrpc":"2.0","id":1,"result":{"ok":true}}' ;;
    *'"method":"thread/start"'*) echo '{"jsonrpc":"2.0","method":"thread/started","params":{"threadId":"thread-1"}}'; echo '{"jsonrpc":"2.0","id":2,"result":{"thread":{"id":"thread-1"}}}' ;;
    *'"method":"turn/start"'*) echo '{"jsonrpc":"2.0","method":"turn/started","params":{"turnId":"turn-1"}}'; echo '{"jsonrpc":"2.0","method":"item/agentMessage/delta","params":{"delta":"hello"}}'; echo '{"jsonrpc":"2.0","id":"perm-1","method":"item/commandExecution/requestApproval","params":{"requestId":"perm-1","description":"Run command?","toolCall":{"name":"shell","input":"pwd"},"options":[{"id":"allow","label":"Allow"},{"id":"deny","label":"Deny"}]}}'; read permission; echo '{"jsonrpc":"2.0","method":"item/agentMessage/delta","params":{"delta":" approved"}}'; echo '{"jsonrpc":"2.0","method":"turn/completed","params":{"turnId":"turn-1"}}'; echo '{"jsonrpc":"2.0","id":3,"result":{"turn":{"id":"turn-1"}}}' ;;
  esac
done
"#,
        )
    };
    std::env::set_var(
        "MCODE_DESKTOP_TEST_CODEX_APP_SERVER_COMMAND",
        fake_codex_app_server_command(script.to_str().unwrap()),
    );
    std::env::set_var("MCODE_DESKTOP_CODEX_APP_SERVER_REQUIRED", "1");

    let state = Arc::new(AppState::new_for_test());
    let connected = dispatch_desktop_proxy_with_state(
        state.as_ref(),
        "acp_connect",
        json!({ "agentType": "codex", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();
    let session_id = connected["sessionId"].as_str().unwrap().to_string();
    let events = Arc::new(Mutex::new(Vec::<AcpEventEnvelope>::new()));
    let sink_events = Arc::clone(&events);
    let prompt_state = Arc::clone(&state);
    let prompt_session_id = session_id.clone();

    let prompt_task = tokio::spawn(async move {
        dispatch_desktop_proxy_with_event_sink_arc(
            prompt_state,
            "acp_prompt",
            json!({ "sessionId": prompt_session_id, "prompt": "need approval" }),
            Some(Arc::new(move |event| {
                sink_events.lock().unwrap().push(event);
            })),
        )
        .await
    });

    let mut saw_pending = false;
    for _ in 0..20 {
        let health = build_health_snapshot(state.as_ref());
        saw_pending = health.cli_pending_interactions.iter().any(|interaction| {
            interaction.session_id == session_id
                && interaction.interaction_id == "perm-1"
                && interaction.status == "pending"
        });
        if saw_pending {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    assert!(saw_pending, "permission request should become pending");

    let resolved = dispatch_desktop_proxy_with_state(
        state.as_ref(),
        "acp_respond_permission",
        json!({
            "sessionId": session_id,
            "requestId": "perm-1",
            "decision": "allow"
        }),
    )
    .await
    .unwrap();
    let response = tokio::time::timeout(Duration::from_secs(5), prompt_task)
        .await
        .expect("prompt should complete after permission response")
        .expect("prompt task should join")
        .expect("prompt should return success");
    let disconnected = dispatch_desktop_proxy_with_state(
        state.as_ref(),
        "acp_disconnect",
        json!({ "sessionId": session_id }),
    )
    .await
    .unwrap();

    std::env::remove_var("MCODE_DESKTOP_TEST_CODEX_APP_SERVER_COMMAND");
    std::env::remove_var("MCODE_DESKTOP_CODEX_APP_SERVER_REQUIRED");

    assert_eq!(resolved["liveResolved"], true);
    assert_eq!(disconnected["status"], "disconnected");
    assert_eq!(response["protocol"], "codex-app-server");
    assert_eq!(response["status"], "completed");
    assert!(response["eventCount"].as_u64().unwrap() >= 5);
    let events = events.lock().unwrap();
    assert!(events.iter().any(|event| event.data["delta"] == "hello"));
    assert!(events.iter().any(|event| event.data["delta"] == "approved"));
    assert!(events
        .iter()
        .any(|event| event.event_type == "permission_request"));
    assert!(events
        .iter()
        .any(|event| event.event_type == "turn_complete"));
    let health = build_health_snapshot(state.as_ref());
    assert!(health
        .cli_pending_interactions
        .iter()
        .any(|interaction| interaction.interaction_id == "perm-1"
            && interaction.status == "resolved"));
}
