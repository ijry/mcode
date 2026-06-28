use std::sync::Arc;
use std::time::Duration;

use mcode_desktop_lib::app_state::AppState;
use mcode_desktop_lib::health::build_health_snapshot;
use mcode_desktop_lib::runtime::{
    dispatch_desktop_proxy_with_event_sink_arc, dispatch_desktop_proxy_with_state,
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
        "mcode-desktop-p17-app-server-{name}-{}.{}",
        std::process::id(),
        extension
    ));
    std::fs::write(&path, body).unwrap();
    path
}

#[tokio::test]
async fn p17_reuses_codex_app_server_thread_for_same_desktop_session() {
    let _env_lock = CODEX_APP_SERVER_ENV_LOCK.lock().await;
    let counter_path = std::env::temp_dir().join(format!(
        "mcode-desktop-p17-thread-start-count-{}.txt",
        std::process::id()
    ));
    let _ = std::fs::remove_file(&counter_path);
    let script = if cfg!(windows) {
        write_fake_codex_app_server_script(
            "reuse",
            &format!(
                r#"
$ErrorActionPreference = 'Stop'
$countPath = '{}'
while ($true) {{
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) {{ break }}
  $msg = $line | ConvertFrom-Json
  if ($msg.method -eq 'initialize') {{
    [Console]::Out.WriteLine((@{{ jsonrpc='2.0'; id=$msg.id; result=@{{ ok=$true }} }} | ConvertTo-Json -Compress -Depth 20))
    [Console]::Out.Flush()
    continue
  }}
  if ($msg.method -eq 'initialized') {{
    continue
  }}
  if ($msg.method -eq 'thread/start') {{
    if (Test-Path $countPath) {{ $count = [int](Get-Content $countPath) }} else {{ $count = 0 }}
    Set-Content -Path $countPath -Value ($count + 1)
    [Console]::Out.WriteLine((@{{ jsonrpc='2.0'; method='thread/started'; params=@{{ threadId='thread-reuse' }} }} | ConvertTo-Json -Compress -Depth 20))
    [Console]::Out.WriteLine((@{{ jsonrpc='2.0'; id=$msg.id; result=@{{ thread=@{{ id='thread-reuse' }} }} }} | ConvertTo-Json -Compress -Depth 20))
    [Console]::Out.Flush()
    continue
  }}
  if ($msg.method -eq 'turn/start') {{
    $turnId = 'turn-' + $msg.id
    [Console]::Out.WriteLine((@{{ jsonrpc='2.0'; method='turn/started'; params=@{{ turnId=$turnId }} }} | ConvertTo-Json -Compress -Depth 20))
    [Console]::Out.WriteLine((@{{ jsonrpc='2.0'; method='item/agentMessage/delta'; params=@{{ delta=('reply-' + $msg.id) }} }} | ConvertTo-Json -Compress -Depth 20))
    [Console]::Out.WriteLine((@{{ jsonrpc='2.0'; method='turn/completed'; params=@{{ turnId=$turnId }} }} | ConvertTo-Json -Compress -Depth 20))
    [Console]::Out.WriteLine((@{{ jsonrpc='2.0'; id=$msg.id; result=@{{ turn=@{{ id=$turnId }} }} }} | ConvertTo-Json -Compress -Depth 20))
    [Console]::Out.Flush()
    continue
  }}
}}
"#,
                counter_path.to_string_lossy().replace('\\', "\\\\")
            ),
        )
    } else {
        write_fake_codex_app_server_script(
            "reuse",
            &format!(
                r#"
count_path='{}'
while IFS= read -r line; do
  case "$line" in
    *'"method":"initialize"'*) echo '{{"jsonrpc":"2.0","id":1,"result":{{"ok":true}}}}' ;;
    *'"method":"thread/start"'*) count=0; [ -f "$count_path" ] && count=$(cat "$count_path"); echo $((count + 1)) > "$count_path"; echo '{{"jsonrpc":"2.0","method":"thread/started","params":{{"threadId":"thread-reuse"}}}}'; echo '{{"jsonrpc":"2.0","id":2,"result":{{"thread":{{"id":"thread-reuse"}}}}}}' ;;
    *'"method":"turn/start"'*) echo '{{"jsonrpc":"2.0","method":"turn/started","params":{{"turnId":"turn-reuse"}}}}'; echo '{{"jsonrpc":"2.0","method":"item/agentMessage/delta","params":{{"delta":"reply"}}}}'; echo '{{"jsonrpc":"2.0","method":"turn/completed","params":{{"turnId":"turn-reuse"}}}}'; echo '{{"jsonrpc":"2.0","id":3,"result":{{"turn":{{"id":"turn-reuse"}}}}}}' ;;
  esac
done
"#,
                counter_path.to_string_lossy()
            ),
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

    let first = tokio::time::timeout(
        Duration::from_secs(5),
        dispatch_desktop_proxy_with_event_sink_arc(
            Arc::clone(&state),
            "acp_prompt",
            json!({ "sessionId": session_id, "prompt": "first" }),
            None,
        ),
    )
    .await
    .expect("first prompt should complete")
    .unwrap();
    let second = tokio::time::timeout(
        Duration::from_secs(5),
        dispatch_desktop_proxy_with_event_sink_arc(
            Arc::clone(&state),
            "acp_prompt",
            json!({ "sessionId": session_id, "prompt": "second" }),
            None,
        ),
    )
    .await
    .expect("second prompt should complete")
    .unwrap();

    let count = std::fs::read_to_string(&counter_path).unwrap();
    let health = build_health_snapshot(state.as_ref());
    let session = health
        .cli_sessions
        .iter()
        .find(|session| session.session_id == first["sessionId"])
        .cloned()
        .unwrap();
    let disconnected = dispatch_desktop_proxy_with_state(
        state.as_ref(),
        "acp_disconnect",
        json!({ "sessionId": session_id }),
    )
    .await
    .unwrap();

    std::env::remove_var("MCODE_DESKTOP_TEST_CODEX_APP_SERVER_COMMAND");
    std::env::remove_var("MCODE_DESKTOP_CODEX_APP_SERVER_REQUIRED");

    assert_eq!(count.trim(), "1");
    assert_eq!(first["protocol"], "codex-app-server");
    assert_eq!(second["protocol"], "codex-app-server");
    assert_eq!(first["providerThreadId"], "thread-reuse");
    assert_eq!(second["providerThreadId"], "thread-reuse");
    assert_eq!(
        first["appServerCreatedAtMs"],
        second["appServerCreatedAtMs"]
    );
    assert_eq!(session.protocol.as_deref(), Some("codex-app-server"));
    assert_eq!(session.provider_thread_id.as_deref(), Some("thread-reuse"));
    assert!(session.app_server_active);
    assert_eq!(disconnected["status"], "disconnected");
}

#[tokio::test]
async fn p17_acp_cancel_interrupts_active_codex_app_server_turn() {
    let _env_lock = CODEX_APP_SERVER_ENV_LOCK.lock().await;
    let interrupt_path = std::env::temp_dir().join(format!(
        "mcode-desktop-p17-interrupt-{}.txt",
        std::process::id()
    ));
    let _ = std::fs::remove_file(&interrupt_path);
    let script = if cfg!(windows) {
        write_fake_codex_app_server_script(
            "interrupt",
            &format!(
                r#"
$ErrorActionPreference = 'Stop'
$interruptPath = '{}'
while ($true) {{
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) {{ break }}
  $msg = $line | ConvertFrom-Json
  if ($msg.method -eq 'initialize') {{
    [Console]::Out.WriteLine((@{{ jsonrpc='2.0'; id=$msg.id; result=@{{ ok=$true }} }} | ConvertTo-Json -Compress -Depth 20))
    [Console]::Out.Flush()
    continue
  }}
  if ($msg.method -eq 'initialized') {{
    continue
  }}
  if ($msg.method -eq 'thread/start') {{
    [Console]::Out.WriteLine((@{{ jsonrpc='2.0'; id=$msg.id; result=@{{ thread=@{{ id='thread-cancel' }} }} }} | ConvertTo-Json -Compress -Depth 20))
    [Console]::Out.Flush()
    continue
  }}
  if ($msg.method -eq 'turn/start') {{
    $turnRequestId = $msg.id
    [Console]::Out.WriteLine((@{{ jsonrpc='2.0'; method='turn/started'; params=@{{ turnId='turn-cancel' }} }} | ConvertTo-Json -Compress -Depth 20))
    [Console]::Out.Flush()
    while ($true) {{
      $nextLine = [Console]::In.ReadLine()
      if ($null -eq $nextLine) {{ exit 0 }}
      $next = $nextLine | ConvertFrom-Json
      if ($next.method -eq 'turn/interrupt') {{
        Set-Content -Path $interruptPath -Value ($next.params.threadId + ':' + $next.params.turnId)
        [Console]::Out.WriteLine((@{{ jsonrpc='2.0'; id=$next.id; result=@{{ ok=$true }} }} | ConvertTo-Json -Compress -Depth 20))
        [Console]::Out.WriteLine((@{{ jsonrpc='2.0'; method='turn/completed'; params=@{{ turnId='turn-cancel'; status='cancelled' }} }} | ConvertTo-Json -Compress -Depth 20))
        [Console]::Out.WriteLine((@{{ jsonrpc='2.0'; id=$turnRequestId; result=@{{ turn=@{{ id='turn-cancel' }}; status='cancelled' }} }} | ConvertTo-Json -Compress -Depth 20))
        [Console]::Out.Flush()
        break
      }}
    }}
    continue
  }}
}}
"#,
                interrupt_path.to_string_lossy().replace('\\', "\\\\")
            ),
        )
    } else {
        write_fake_codex_app_server_script(
            "interrupt",
            &format!(
                r#"
interrupt_path='{}'
while IFS= read -r line; do
  case "$line" in
    *'"method":"initialize"'*) echo '{{"jsonrpc":"2.0","id":1,"result":{{"ok":true}}}}' ;;
    *'"method":"thread/start"'*) echo '{{"jsonrpc":"2.0","id":2,"result":{{"thread":{{"id":"thread-cancel"}}}}}}' ;;
    *'"method":"turn/start"'*) echo '{{"jsonrpc":"2.0","method":"turn/started","params":{{"turnId":"turn-cancel"}}}}'; read interrupt; echo 'thread-cancel:turn-cancel' > "$interrupt_path"; echo '{{"jsonrpc":"2.0","id":4,"result":{{"ok":true}}}}'; echo '{{"jsonrpc":"2.0","method":"turn/completed","params":{{"turnId":"turn-cancel","status":"cancelled"}}}}'; echo '{{"jsonrpc":"2.0","id":3,"result":{{"turn":{{"id":"turn-cancel"}},"status":"cancelled"}}}}' ;;
  esac
done
"#,
                interrupt_path.to_string_lossy()
            ),
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
    let prompt_state = Arc::clone(&state);
    let prompt_session_id = session_id.clone();
    let prompt_task = tokio::spawn(async move {
        dispatch_desktop_proxy_with_event_sink_arc(
            prompt_state,
            "acp_prompt",
            json!({ "sessionId": prompt_session_id, "prompt": "cancel me" }),
            None,
        )
        .await
    });

    let mut saw_turn = false;
    for _ in 0..20 {
        let health = build_health_snapshot(state.as_ref());
        saw_turn = health.cli_sessions.iter().any(|session| {
            session.session_id == session_id
                && session.active_turn_id.as_deref() == Some("turn-cancel")
        });
        if saw_turn {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    assert!(saw_turn, "active turn id should be visible before cancel");

    let canceled = dispatch_desktop_proxy_with_state(
        state.as_ref(),
        "acp_cancel",
        json!({ "sessionId": session_id }),
    )
    .await
    .unwrap();
    let response = tokio::time::timeout(Duration::from_secs(5), prompt_task)
        .await
        .expect("prompt should stop after interrupt")
        .expect("prompt task should join")
        .expect("prompt should resolve as canceled response");

    let interrupt = std::fs::read_to_string(&interrupt_path).unwrap();
    let disconnected = dispatch_desktop_proxy_with_state(
        state.as_ref(),
        "acp_disconnect",
        json!({ "sessionId": session_id }),
    )
    .await
    .unwrap();

    std::env::remove_var("MCODE_DESKTOP_TEST_CODEX_APP_SERVER_COMMAND");
    std::env::remove_var("MCODE_DESKTOP_CODEX_APP_SERVER_REQUIRED");

    assert_eq!(interrupt.trim(), "thread-cancel:turn-cancel");
    assert_eq!(canceled["status"], "canceled");
    assert_eq!(response["status"], "canceled");
    assert_eq!(response["protocol"], "codex-app-server");
    assert_eq!(response["providerThreadId"], "thread-cancel");
    assert_eq!(response["session"]["status"], "canceled");
    assert_eq!(response["session"]["appServerActive"], true);
    assert_eq!(disconnected["status"], "disconnected");
}
