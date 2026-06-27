use std::sync::{Arc, Mutex};
use std::time::Duration;

use mcode_desktop_lib::runtime::json_rpc::{
    JsonRpcInboundRequestHandler, JsonRpcNotificationHandler, JsonRpcStdioTransport,
};
use serde_json::json;

fn fake_command(script: &str) -> (String, Vec<String>) {
    if cfg!(windows) {
        (
            "powershell".to_string(),
            vec![
                "-NoProfile".to_string(),
                "-ExecutionPolicy".to_string(),
                "Bypass".to_string(),
                "-File".to_string(),
                script.to_string(),
            ],
        )
    } else {
        ("sh".to_string(), vec![script.to_string()])
    }
}

fn write_fake_script(name: &str, body: &str) -> std::path::PathBuf {
    let extension = if cfg!(windows) { "ps1" } else { "sh" };
    let path = std::env::temp_dir().join(format!(
        "mcode-desktop-p16-jsonrpc-{name}-{}.{}",
        std::process::id(),
        extension
    ));
    std::fs::write(&path, body).unwrap();
    path
}

#[tokio::test]
async fn p16_jsonrpc_transport_handles_requests_notifications_and_inbound_requests() {
    let script = if cfg!(windows) {
        write_fake_script(
            "stdio",
            r#"
$ErrorActionPreference = 'Stop'
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $msg = $line | ConvertFrom-Json
  if ($msg.method -eq 'initialize') {
    [Console]::Out.WriteLine((@{ jsonrpc='2.0'; id=$msg.id; result=@{ ok=$true } } | ConvertTo-Json -Compress -Depth 20))
    [Console]::Out.WriteLine((@{ jsonrpc='2.0'; id='server-1'; method='server/ask'; params=@{ question='approve?' } } | ConvertTo-Json -Compress -Depth 20))
    [Console]::Out.Flush()
    continue
  }
  if ($msg.method -eq 'echo') {
    [Console]::Out.WriteLine((@{ jsonrpc='2.0'; id=$msg.id; result=@{ echo=$msg.params.text } } | ConvertTo-Json -Compress -Depth 20))
    [Console]::Out.Flush()
    continue
  }
  if ($msg.id -eq 'server-1') {
    [Console]::Out.WriteLine((@{ jsonrpc='2.0'; method='server/accepted'; params=$msg.result } | ConvertTo-Json -Compress -Depth 20))
    [Console]::Out.Flush()
    continue
  }
}
"#,
        )
    } else {
        write_fake_script(
            "stdio",
            r#"
while IFS= read -r line; do
  case "$line" in
    *'"method":"initialize"'*) echo '{"jsonrpc":"2.0","id":1,"result":{"ok":true}}'; echo '{"jsonrpc":"2.0","id":"server-1","method":"server/ask","params":{"question":"approve?"}}' ;;
    *'"method":"echo"'*) echo '{"jsonrpc":"2.0","id":2,"result":{"echo":"hello"}}' ;;
    *'"id":"server-1"'*) echo '{"jsonrpc":"2.0","method":"server/accepted","params":{"approved":true}}' ;;
  esac
done
"#,
        )
    };
    let (binary, args) = fake_command(script.to_str().unwrap());
    let notifications = Arc::new(Mutex::new(Vec::<(String, serde_json::Value)>::new()));
    let notification_log = Arc::clone(&notifications);
    let on_notification: JsonRpcNotificationHandler = Arc::new(move |method, params| {
        notification_log.lock().unwrap().push((method, params));
    });
    let on_request: JsonRpcInboundRequestHandler =
        Arc::new(move |_method, _params| Box::pin(async move { Ok(json!({ "approved": true })) }));
    let transport = JsonRpcStdioTransport::spawn(binary, args, None, on_notification, on_request)
        .await
        .unwrap();

    let initialized = transport
        .request(
            "initialize",
            json!({ "clientInfo": { "name": "test" } }),
            Some(Duration::from_secs(5)),
        )
        .await
        .unwrap();
    let echoed = transport
        .request(
            "echo",
            json!({ "text": "hello" }),
            Some(Duration::from_secs(5)),
        )
        .await
        .unwrap();

    tokio::time::sleep(Duration::from_millis(200)).await;
    let _ = transport.stop().await;
    assert_eq!(initialized["ok"], true);
    assert_eq!(echoed["echo"], "hello");
    assert!(notifications
        .lock()
        .unwrap()
        .iter()
        .any(|(method, params)| method == "server/accepted" && params["approved"] == true));
}
