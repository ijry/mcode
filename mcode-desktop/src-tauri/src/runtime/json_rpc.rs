use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::{anyhow, Result};
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{oneshot, Mutex as AsyncMutex};

pub type JsonRpcRequestFuture = Pin<Box<dyn Future<Output = Result<Value>> + Send>>;
pub type JsonRpcInboundRequestHandler =
    Arc<dyn Fn(String, Value) -> JsonRpcRequestFuture + Send + Sync>;
pub type JsonRpcNotificationHandler = Arc<dyn Fn(String, Value) + Send + Sync>;

type PendingResult = std::result::Result<Value, String>;

#[derive(Clone)]
pub struct JsonRpcStdioTransport {
    inner: Arc<JsonRpcTransportInner>,
}

struct JsonRpcTransportInner {
    stdin: AsyncMutex<ChildStdin>,
    child: AsyncMutex<Child>,
    pending: Mutex<HashMap<String, oneshot::Sender<PendingResult>>>,
    next_id: AtomicU64,
    closed: AtomicBool,
    stderr: Mutex<String>,
    on_notification: JsonRpcNotificationHandler,
    on_request: JsonRpcInboundRequestHandler,
}

impl JsonRpcStdioTransport {
    pub async fn spawn(
        binary: String,
        args: Vec<String>,
        cwd: Option<String>,
        on_notification: JsonRpcNotificationHandler,
        on_request: JsonRpcInboundRequestHandler,
    ) -> Result<Self> {
        let mut command = Command::new(binary);
        command.args(args);
        if let Some(cwd) = cwd {
            command.current_dir(cwd);
        }
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = command.spawn()?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| anyhow!("json-rpc child stdin unavailable"))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| anyhow!("json-rpc child stdout unavailable"))?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| anyhow!("json-rpc child stderr unavailable"))?;

        let transport = Self {
            inner: Arc::new(JsonRpcTransportInner {
                stdin: AsyncMutex::new(stdin),
                child: AsyncMutex::new(child),
                pending: Mutex::new(HashMap::new()),
                next_id: AtomicU64::new(1),
                closed: AtomicBool::new(false),
                stderr: Mutex::new(String::new()),
                on_notification,
                on_request,
            }),
        };

        spawn_stdout_reader(stdout, Arc::clone(&transport.inner));
        spawn_stderr_reader(stderr, Arc::clone(&transport.inner));

        Ok(transport)
    }

    pub async fn request(
        &self,
        method: impl Into<String>,
        params: Value,
        timeout: Option<Duration>,
    ) -> Result<Value> {
        let method = method.into();
        let id = self.inner.next_id.fetch_add(1, Ordering::SeqCst);
        let id_key = id.to_string();
        let message = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });
        let (tx, rx) = oneshot::channel::<PendingResult>();
        {
            let mut pending = self
                .inner
                .pending
                .lock()
                .map_err(|_| anyhow!("json-rpc pending lock poisoned"))?;
            pending.insert(id_key.clone(), tx);
        }

        if let Err(error) = self.write_message(&message).await {
            self.remove_pending(&id_key);
            return Err(error);
        }

        let result = match timeout {
            Some(timeout) => tokio::time::timeout(timeout, rx)
                .await
                .map_err(|_| anyhow!("json-rpc request timed out: {method}"))?
                .map_err(|_| anyhow!("json-rpc transport closed: {method}"))?,
            None => rx
                .await
                .map_err(|_| anyhow!("json-rpc transport closed: {method}"))?,
        };
        result.map_err(|message| anyhow!(message))
    }

    pub async fn notify(&self, method: impl Into<String>, params: Value) -> Result<()> {
        let message = json!({
            "jsonrpc": "2.0",
            "method": method.into(),
            "params": params,
        });
        self.write_message(&message).await
    }

    pub async fn stop(&self) -> Result<()> {
        self.fail_all("json-rpc transport stopped");
        let mut child = self.inner.child.lock().await;
        let _ = child.kill().await;
        Ok(())
    }

    pub fn is_closed(&self) -> bool {
        self.inner.closed.load(Ordering::SeqCst)
    }

    pub fn stderr_preview(&self) -> Option<String> {
        self.inner
            .stderr
            .lock()
            .ok()
            .and_then(|stderr| first_non_empty_line(&stderr))
    }

    async fn write_message(&self, message: &Value) -> Result<()> {
        if self.inner.closed.load(Ordering::SeqCst) {
            return Err(anyhow!("json-rpc transport is closed"));
        }
        let raw = serde_json::to_string(message)?;
        let mut stdin = self.inner.stdin.lock().await;
        stdin.write_all(raw.as_bytes()).await?;
        stdin.write_all(b"\n").await?;
        stdin.flush().await?;
        Ok(())
    }

    fn remove_pending(&self, id_key: &str) {
        if let Ok(mut pending) = self.inner.pending.lock() {
            pending.remove(id_key);
        }
    }

    fn fail_all(&self, message: &str) {
        fail_all_pending(&self.inner, message);
    }
}

fn spawn_stdout_reader<R>(stdout: R, inner: Arc<JsonRpcTransportInner>)
where
    R: AsyncRead + Send + Unpin + 'static,
{
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        loop {
            match reader.next_line().await {
                Ok(Some(line)) => dispatch_line(Arc::clone(&inner), line),
                Ok(None) => {
                    fail_all_pending(&inner, "json-rpc child stdout closed");
                    break;
                }
                Err(error) => {
                    fail_all_pending(&inner, &format!("json-rpc stdout read failed: {error}"));
                    break;
                }
            }
        }
    });
}

fn spawn_stderr_reader<R>(stderr: R, inner: Arc<JsonRpcTransportInner>)
where
    R: AsyncRead + Send + Unpin + 'static,
{
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            if let Ok(mut buffer) = inner.stderr.lock() {
                buffer.push_str(&line);
                buffer.push('\n');
                if buffer.len() > 8_000 {
                    let drain = buffer.len() - 8_000;
                    buffer.drain(0..drain);
                }
            }
        }
    });
}

fn dispatch_line(inner: Arc<JsonRpcTransportInner>, line: String) {
    let line = line.trim();
    if line.is_empty() {
        return;
    }
    let Ok(message) = serde_json::from_str::<Value>(line) else {
        return;
    };

    if let Some(id) = message.get("id") {
        if message.get("result").is_some() || message.get("error").is_some() {
            dispatch_response(&inner, id, &message);
            return;
        }
        if let Some(method) = message.get("method").and_then(Value::as_str) {
            dispatch_inbound_request(inner, id.clone(), method.to_string(), message);
            return;
        }
    }

    if let Some(method) = message.get("method").and_then(Value::as_str) {
        let params = message.get("params").cloned().unwrap_or_else(|| json!({}));
        (inner.on_notification)(method.to_string(), params);
    }
}

fn dispatch_response(inner: &Arc<JsonRpcTransportInner>, id: &Value, message: &Value) {
    let Some(id_key) = id_to_key(id) else {
        return;
    };
    let sender = inner
        .pending
        .lock()
        .ok()
        .and_then(|mut pending| pending.remove(&id_key));
    let Some(sender) = sender else {
        return;
    };
    let result = if let Some(error) = message.get("error") {
        Err(error
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("json-rpc request failed")
            .to_string())
    } else {
        Ok(message.get("result").cloned().unwrap_or(Value::Null))
    };
    let _ = sender.send(result);
}

fn dispatch_inbound_request(
    inner: Arc<JsonRpcTransportInner>,
    id: Value,
    method: String,
    message: Value,
) {
    let params = message.get("params").cloned().unwrap_or_else(|| json!({}));
    tokio::spawn(async move {
        let result = (inner.on_request)(method, params).await;
        let response = match result {
            Ok(result) => json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": result,
            }),
            Err(error) => json!({
                "jsonrpc": "2.0",
                "id": id,
                "error": {
                    "code": -32000,
                    "message": error.to_string(),
                },
            }),
        };
        let raw = match serde_json::to_string(&response) {
            Ok(raw) => raw,
            Err(_) => return,
        };
        let mut stdin = inner.stdin.lock().await;
        let _ = stdin.write_all(raw.as_bytes()).await;
        let _ = stdin.write_all(b"\n").await;
        let _ = stdin.flush().await;
    });
}

fn fail_all_pending(inner: &Arc<JsonRpcTransportInner>, message: &str) {
    if inner.closed.swap(true, Ordering::SeqCst) {
        return;
    }
    let senders = inner
        .pending
        .lock()
        .map(|mut pending| {
            pending
                .drain()
                .map(|(_, sender)| sender)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    for sender in senders {
        let _ = sender.send(Err(message.to_string()));
    }
}

fn id_to_key(id: &Value) -> Option<String> {
    if let Some(value) = id.as_u64() {
        return Some(value.to_string());
    }
    if let Some(value) = id.as_i64() {
        return Some(value.to_string());
    }
    id.as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn first_non_empty_line(value: &str) -> Option<String> {
    value
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(ToString::to_string)
}
