use anyhow::{anyhow, Result};
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::{oneshot, Mutex as AsyncMutex};

use super::json_rpc::{
    JsonRpcInboundRequestHandler, JsonRpcNotificationHandler, JsonRpcStdioTransport,
};
use super::process_stdio::{
    command_parts_from_env, extract_connection_id as process_extract_connection_id,
    extract_prompt_text as process_extract_prompt_text,
    extract_working_dir as process_extract_working_dir, run_streaming_cli_process,
    StreamingCliProcessRequest,
};
use super::{
    register_live_interaction_waiter, update_session_provider_diagnostics, AcpEventEnvelope,
    CliEventSink,
};
use crate::app_state::{AppState, CliProcessControl};

#[derive(Clone)]
pub struct CodexAppServerSession {
    working_dir: String,
    thread_id: String,
    transport: JsonRpcStdioTransport,
    turn_context: Arc<Mutex<CodexAppServerTurnContext>>,
    turn_lock: Arc<AsyncMutex<()>>,
    created_at_ms: u64,
}

#[derive(Default)]
struct CodexAppServerTurnContext {
    events: Option<Arc<Mutex<Vec<AcpEventEnvelope>>>>,
    event_sink: Option<CliEventSink>,
    active_turn_id: Option<String>,
}

pub async fn dispatch_codex_proxy(
    command: &str,
    payload: Value,
    event_sink: Option<CliEventSink>,
) -> Result<Value> {
    match command {
        "acp_prompt" => run_codex_prompt(None, payload, event_sink).await,
        "list_open_folder_details" | "list_all_conversations" => Ok(json!({
            "runtime": "codex-cli",
            "command": command,
            "items": [],
            "status": "empty",
            "message": "Official Codex CLI adapter does not expose historical MCode folders in this P5 slice."
        })),
        _ => Err(anyhow!("unsupported codex command: {command}")),
    }
}

pub async fn run_codex_prompt_with_state(
    state: &AppState,
    payload: Value,
    event_sink: Option<CliEventSink>,
) -> Result<Value> {
    run_codex_prompt(Some(state), payload, event_sink).await
}

pub async fn run_codex_prompt_with_arc_state(
    state: Arc<AppState>,
    payload: Value,
    event_sink: Option<CliEventSink>,
) -> Result<Value> {
    if codex_app_server_enabled() {
        match run_codex_app_server_prompt(Arc::clone(&state), payload.clone(), event_sink.clone())
            .await
        {
            Ok(response) => return Ok(response),
            Err(error) if codex_app_server_required() => return Err(error),
            Err(_) => {}
        }
    }
    run_codex_exec_prompt(Some(state.as_ref()), payload, event_sink).await
}

async fn run_codex_prompt(
    state: Option<&AppState>,
    payload: Value,
    event_sink: Option<CliEventSink>,
) -> Result<Value> {
    run_codex_exec_prompt(state, payload, event_sink).await
}

async fn run_codex_exec_prompt(
    state: Option<&AppState>,
    payload: Value,
    event_sink: Option<CliEventSink>,
) -> Result<Value> {
    let prompt = process_extract_prompt_text(&payload)?;
    let (binary, mut args) = codex_command_parts();
    args.push("exec".to_string());
    args.push("--json".to_string());
    if let Some(working_dir) = process_extract_working_dir(&payload) {
        args.push("--cd".to_string());
        args.push(working_dir);
    }
    args.push(prompt);

    let connection_id = process_extract_connection_id(&payload, "codex-cli");
    let output = run_streaming_cli_process(StreamingCliProcessRequest {
        state,
        runtime: "codex-cli",
        protocol: "codex-cli-exec",
        connection_id,
        binary,
        args,
        working_dir: None,
        payload: &payload,
        event_sink,
    })
    .await?;
    let event_count = output.events.len();

    Ok(json!({
        "runtime": "codex-cli",
        "status": if output.canceled { "canceled" } else { "completed" },
        "canceled": output.canceled,
        "exitCode": output.exit_code,
        "stderrPreview": output.stderr_preview,
        "stdout": output.stdout,
        "stderr": output.stderr,
        "events": output.events,
        "eventCount": event_count,
        "streamedEventCount": output.streamed_event_count,
    }))
}

async fn run_codex_app_server_prompt(
    state: Arc<AppState>,
    payload: Value,
    event_sink: Option<CliEventSink>,
) -> Result<Value> {
    let connection_id = extract_connection_id(&payload).unwrap_or_else(|| "codex-cli".to_string());
    let working_dir = extract_working_dir(&payload)
        .unwrap_or(std::env::current_dir()?.to_string_lossy().to_string());
    let content = extract_app_server_content_blocks(&payload)?;
    let has_realtime_sink = event_sink.is_some();
    let events = Arc::new(Mutex::new(Vec::<AcpEventEnvelope>::new()));
    let app_server =
        acquire_codex_app_server_session(Arc::clone(&state), &connection_id, &working_dir).await?;
    let _turn_guard = app_server.turn_lock.lock().await;
    bind_app_server_turn_context(&app_server, Arc::clone(&events), event_sink.clone());
    update_session_provider_diagnostics(
        state.as_ref(),
        &connection_id,
        Some("codex-app-server"),
        Some(app_server.thread_id.clone()),
        Some(None),
        Some(!app_server.transport.is_closed()),
        app_server.transport.stderr_preview(),
    );

    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();
    let registered =
        register_process_control(state.as_ref(), &connection_id, &payload, cancel_tx).is_ok();
    let result = run_codex_app_server_turn(
        &app_server,
        &payload,
        &connection_id,
        &working_dir,
        content,
        cancel_rx,
    )
    .await;

    if registered {
        unregister_process_control(state.as_ref(), &connection_id);
    }

    let mut canceled = false;
    let turn_result = match result {
        Ok(AppServerTurnOutcome::Completed(value)) => value,
        Ok(AppServerTurnOutcome::Canceled) => {
            canceled = true;
            json!({ "canceled": true })
        }
        Err(error) => {
            clear_app_server_turn_context(&app_server);
            if app_server.transport.is_closed() {
                remove_codex_app_server_session(state.as_ref(), &connection_id).await;
            }
            return Err(error);
        }
    };
    append_app_server_completion(
        state.as_ref(),
        &connection_id,
        &events,
        &event_sink,
        canceled,
    );
    let stderr_preview = app_server.transport.stderr_preview();
    let active_turn_id = app_server_active_turn_id(&app_server);
    let app_server_active = !app_server.transport.is_closed();
    clear_app_server_turn_context(&app_server);
    update_session_provider_diagnostics(
        state.as_ref(),
        &connection_id,
        Some("codex-app-server"),
        Some(app_server.thread_id.clone()),
        Some(None),
        Some(app_server_active),
        stderr_preview.clone(),
    );
    let events = events
        .lock()
        .map(|events| events.clone())
        .unwrap_or_default();
    let streamed_event_count = if has_realtime_sink { events.len() } else { 0 };
    let event_count = events.len();

    Ok(json!({
        "runtime": "codex-cli",
        "protocol": "codex-app-server",
        "status": if canceled { "canceled" } else { "completed" },
        "canceled": canceled,
        "stderrPreview": stderr_preview,
        "providerThreadId": app_server.thread_id,
        "activeTurnId": active_turn_id,
        "appServerActive": app_server_active,
        "appServerCreatedAtMs": app_server.created_at_ms,
        "turn": turn_result,
        "events": events,
        "eventCount": event_count,
        "streamedEventCount": streamed_event_count,
    }))
}

async fn acquire_codex_app_server_session(
    state: Arc<AppState>,
    connection_id: &str,
    working_dir: &str,
) -> Result<CodexAppServerSession> {
    let mut sessions = state.codex_app_server_sessions.lock().await;
    if let Some(existing) = sessions.get(connection_id).cloned() {
        if existing.working_dir == working_dir && !existing.transport.is_closed() {
            return Ok(existing);
        }
        if let Some(stale) = sessions.remove(connection_id) {
            let _ = stale.transport.stop().await;
        }
    }

    let session = create_codex_app_server_session(
        Arc::clone(&state),
        connection_id.to_string(),
        working_dir.to_string(),
    )
    .await?;
    sessions.insert(connection_id.to_string(), session.clone());
    Ok(session)
}

async fn create_codex_app_server_session(
    state: Arc<AppState>,
    connection_id: String,
    working_dir: String,
) -> Result<CodexAppServerSession> {
    let turn_context = Arc::new(Mutex::new(CodexAppServerTurnContext::default()));
    let notification_state = Arc::clone(&state);
    let notification_context = Arc::clone(&turn_context);
    let notification_connection_id = connection_id.clone();
    let on_notification: JsonRpcNotificationHandler = Arc::new(move |method, params| {
        if method == "turn/started" {
            let turn_id = extract_app_server_turn_id(&params);
            set_context_active_turn_id(&notification_context, turn_id.clone());
            update_session_provider_diagnostics(
                notification_state.as_ref(),
                &notification_connection_id,
                Some("codex-app-server"),
                None,
                Some(turn_id),
                Some(true),
                None,
            );
        }
        for event in normalize_codex_app_server_notification(
            &notification_connection_id,
            &method,
            params.clone(),
        ) {
            push_app_server_context_event(
                notification_state.as_ref(),
                &notification_connection_id,
                &notification_context,
                event,
            );
        }
        if method == "turn/completed" {
            set_context_active_turn_id(&notification_context, None);
            update_session_provider_diagnostics(
                notification_state.as_ref(),
                &notification_connection_id,
                Some("codex-app-server"),
                None,
                Some(None),
                Some(true),
                None,
            );
        }
    });

    let request_state = Arc::clone(&state);
    let request_context = Arc::clone(&turn_context);
    let request_connection_id = connection_id.clone();
    let on_request: JsonRpcInboundRequestHandler = Arc::new(move |method, params| {
        let state = Arc::clone(&request_state);
        let context = Arc::clone(&request_context);
        let connection_id = request_connection_id.clone();
        Box::pin(async move {
            let Some(kind) = interaction_kind_for_app_server_method(&method) else {
                return Ok(json!({}));
            };
            let data = app_server_interaction_data(kind, &method, params);
            let (_interaction_id, response_rx) = register_live_interaction_waiter(
                state.as_ref(),
                &connection_id,
                kind,
                Some(method.clone()),
                data.clone(),
            )?;
            let event = AcpEventEnvelope {
                event_type: format!("{kind}_request"),
                connection_id: connection_id.clone(),
                data,
            };
            push_app_server_context_event(state.as_ref(), &connection_id, &context, event);
            match tokio::time::timeout(Duration::from_secs(300), response_rx).await {
                Ok(Ok(response)) => Ok(response),
                _ => Ok(json!({ "outcome": { "outcome": "cancelled" } })),
            }
        })
    });

    let (binary, args) = codex_app_server_command_parts();
    let transport = JsonRpcStdioTransport::spawn(
        binary,
        args,
        Some(working_dir.clone()),
        on_notification,
        on_request,
    )
    .await?;

    let initialized = async {
        transport
            .request(
                "initialize",
                json!({
                    "clientInfo": { "name": "MCode Desktop", "version": env!("CARGO_PKG_VERSION") },
                    "capabilities": { "experimentalApi": true },
                }),
                Some(Duration::from_secs(30)),
            )
            .await?;
        transport.notify("initialized", json!({})).await?;
        let thread = transport
            .request(
                "thread/start",
                json!({
                    "cwd": working_dir.clone(),
                    "sessionStartSource": "startup",
                }),
                Some(Duration::from_secs(30)),
            )
            .await?;
        Ok::<Value, anyhow::Error>(thread)
    }
    .await;

    let thread = match initialized {
        Ok(thread) => thread,
        Err(error) => {
            let _ = transport.stop().await;
            return Err(error);
        }
    };
    let thread_id = extract_app_server_session_id(&thread).unwrap_or_else(|| connection_id.clone());
    update_session_provider_diagnostics(
        state.as_ref(),
        &connection_id,
        Some("codex-app-server"),
        Some(thread_id.clone()),
        Some(None),
        Some(true),
        transport.stderr_preview(),
    );

    Ok(CodexAppServerSession {
        working_dir,
        thread_id,
        transport,
        turn_context,
        turn_lock: Arc::new(AsyncMutex::new(())),
        created_at_ms: now_ms(),
    })
}

fn bind_app_server_turn_context(
    app_server: &CodexAppServerSession,
    events: Arc<Mutex<Vec<AcpEventEnvelope>>>,
    event_sink: Option<CliEventSink>,
) {
    if let Ok(mut context) = app_server.turn_context.lock() {
        context.events = Some(events);
        context.event_sink = event_sink;
        context.active_turn_id = None;
    }
}

fn clear_app_server_turn_context(app_server: &CodexAppServerSession) {
    if let Ok(mut context) = app_server.turn_context.lock() {
        context.events = None;
        context.event_sink = None;
        context.active_turn_id = None;
    }
}

fn set_context_active_turn_id(
    context: &Arc<Mutex<CodexAppServerTurnContext>>,
    turn_id: Option<String>,
) {
    if let Ok(mut context) = context.lock() {
        context.active_turn_id = turn_id;
    }
}

fn set_app_server_active_turn_id(app_server: &CodexAppServerSession, turn_id: Option<String>) {
    set_context_active_turn_id(&app_server.turn_context, turn_id);
}

fn app_server_active_turn_id(app_server: &CodexAppServerSession) -> Option<String> {
    app_server
        .turn_context
        .lock()
        .ok()
        .and_then(|context| context.active_turn_id.clone())
}

fn push_app_server_context_event(
    state: &AppState,
    connection_id: &str,
    context: &Arc<Mutex<CodexAppServerTurnContext>>,
    event: AcpEventEnvelope,
) {
    let (events, event_sink) = context
        .lock()
        .map(|context| (context.events.clone(), context.event_sink.clone()))
        .unwrap_or((None, None));
    if let Some(sink) = event_sink.as_ref() {
        sink(event.clone());
    }
    if let Some(events) = events.as_ref() {
        if let Ok(mut events) = events.lock() {
            events.push(event);
        }
    }
    super::mark_session_event(state, connection_id);
}

async fn interrupt_codex_app_server_turn(app_server: &CodexAppServerSession) -> bool {
    let Some(turn_id) = app_server_active_turn_id(app_server) else {
        return false;
    };
    app_server
        .transport
        .request(
            "turn/interrupt",
            json!({
                "threadId": app_server.thread_id.clone(),
                "turnId": turn_id,
            }),
            Some(Duration::from_secs(5)),
        )
        .await
        .is_ok()
}

pub async fn stop_codex_app_server_session(state: &AppState, session_id: &str) {
    let session = {
        let mut sessions = state.codex_app_server_sessions.lock().await;
        sessions.remove(session_id)
    };
    if let Some(session) = session {
        let _ = session.transport.stop().await;
    }
}

async fn remove_codex_app_server_session(state: &AppState, session_id: &str) {
    let mut sessions = state.codex_app_server_sessions.lock().await;
    sessions.remove(session_id);
}

enum AppServerTurnOutcome {
    Completed(Value),
    Canceled,
}

async fn run_codex_app_server_turn(
    app_server: &CodexAppServerSession,
    payload: &Value,
    _connection_id: &str,
    working_dir: &str,
    content: Vec<Value>,
    cancel_rx: oneshot::Receiver<()>,
) -> Result<AppServerTurnOutcome> {
    let params = build_turn_start_params(payload, &app_server.thread_id, working_dir, content);
    let turn_request = app_server.transport.request("turn/start", params, None);
    tokio::pin!(turn_request);

    tokio::select! {
        result = &mut turn_request => {
            let result = result?;
            if let Some(turn_id) = extract_app_server_turn_id(&result) {
                set_app_server_active_turn_id(app_server, Some(turn_id));
            }
            Ok(AppServerTurnOutcome::Completed(result))
        },
        _ = cancel_rx => {
            let interrupted = interrupt_codex_app_server_turn(app_server).await;
            if interrupted {
                if tokio::time::timeout(Duration::from_secs(5), &mut turn_request).await.is_err() {
                    let _ = app_server.transport.stop().await;
                }
            } else {
                let _ = app_server.transport.stop().await;
            }
            Ok(AppServerTurnOutcome::Canceled)
        }
    }
}

fn build_turn_start_params(
    payload: &Value,
    thread_id: &str,
    working_dir: &str,
    content: Vec<Value>,
) -> Value {
    let model = payload
        .get("model")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("default");
    let reasoning_effort = payload
        .get("reasoningEffort")
        .or_else(|| payload.get("reasoning_effort"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let permission_mode = payload
        .get("permissionMode")
        .or_else(|| payload.get("permission_mode"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let mut params = json!({
        "threadId": thread_id,
        "model": model,
        "input": content,
    });
    if let Some(effort) = reasoning_effort {
        params["effort"] = Value::String(effort.to_string());
    }
    if let Some(policy) = sandbox_policy_for_mode(permission_mode, working_dir) {
        params["sandboxPolicy"] = policy;
    }
    if let Some(policy) = approval_policy_for_mode(permission_mode) {
        params["approvalPolicy"] = Value::String(policy.to_string());
    }
    params
}

fn sandbox_policy_for_mode(mode: Option<&str>, working_dir: &str) -> Option<Value> {
    match mode {
        Some("read_only") | Some("read-only") => Some(json!({
            "type": "readOnly",
            "networkAccess": false,
        })),
        Some("workspace_write") | Some("workspace-write") => Some(json!({
            "type": "workspaceWrite",
            "writableRoots": [working_dir],
            "networkAccess": false,
        })),
        Some("full_access") | Some("full-access") => Some(json!({
            "type": "dangerFullAccess",
        })),
        _ => None,
    }
}

fn approval_policy_for_mode(mode: Option<&str>) -> Option<&'static str> {
    match mode {
        Some("read_only")
        | Some("read-only")
        | Some("workspace_write")
        | Some("workspace-write") => Some("on-request"),
        Some("full_access") | Some("full-access") => Some("never"),
        _ => None,
    }
}

fn normalize_codex_app_server_notification(
    connection_id: &str,
    method: &str,
    params: Value,
) -> Vec<AcpEventEnvelope> {
    match method {
        "thread/started" => vec![AcpEventEnvelope {
            event_type: "status_changed".to_string(),
            connection_id: connection_id.to_string(),
            data: json!({
                "status": "connected",
                "scope": "connection",
                "runtime": "codex-app-server",
                "raw": params,
            }),
        }],
        "turn/started" => vec![AcpEventEnvelope {
            event_type: "status_changed".to_string(),
            connection_id: connection_id.to_string(),
            data: json!({
                "status": "thinking",
                "scope": "connection",
                "runtime": "codex-app-server",
                "turnId": extract_app_server_turn_id(&params),
            }),
        }],
        "turn/completed" => vec![
            AcpEventEnvelope {
                event_type: "status_changed".to_string(),
                connection_id: connection_id.to_string(),
                data: json!({
                    "status": "idle",
                    "scope": "connection",
                    "runtime": "codex-app-server",
                }),
            },
            AcpEventEnvelope {
                event_type: "turn_complete".to_string(),
                connection_id: connection_id.to_string(),
                data: json!({
                    "sessionId": connection_id,
                    "stopReason": "completed",
                    "runtime": "codex-app-server",
                }),
            },
        ],
        "item/agentMessage/delta" => extract_text_from_value(&params)
            .map(|delta| {
                vec![AcpEventEnvelope {
                    event_type: "stream_batch".to_string(),
                    connection_id: connection_id.to_string(),
                    data: json!({
                        "delta": delta,
                        "contentType": "text",
                    }),
                }]
            })
            .unwrap_or_default(),
        "item/started" => vec![AcpEventEnvelope {
            event_type: "tool_call".to_string(),
            connection_id: connection_id.to_string(),
            data: json!({
                "id": first_string_in_value(&params, &["itemId", "id", "toolCallId"]).unwrap_or_else(|| "tool-call".to_string()),
                "name": tool_name_from_app_server_item(&params),
                "input": params.get("item").cloned().unwrap_or_else(|| params.clone()),
                "status": "running",
                "raw": params,
            }),
        }],
        "item/completed" => vec![AcpEventEnvelope {
            event_type: "tool_call_update".to_string(),
            connection_id: connection_id.to_string(),
            data: json!({
                "id": first_string_in_value(&params, &["itemId", "id", "toolCallId"]).unwrap_or_else(|| "tool-call".to_string()),
                "output": extract_text_from_value(&params),
                "status": "completed",
                "raw": params,
            }),
        }],
        "thread/tokenUsage/updated" | "turn/tokenUsage/updated" => vec![AcpEventEnvelope {
            event_type: "usage_update".to_string(),
            connection_id: connection_id.to_string(),
            data: params,
        }],
        _ if method.ends_with("/outputDelta") || method.ends_with("/progress") => {
            extract_text_from_value(&params)
                .map(|delta| {
                    vec![AcpEventEnvelope {
                        event_type: "tool_call_update".to_string(),
                        connection_id: connection_id.to_string(),
                        data: json!({
                            "id": first_string_in_value(&params, &["itemId", "id", "toolCallId", "processId"]).unwrap_or_else(|| "tool-call".to_string()),
                            "output": delta,
                            "status": "running",
                            "raw": params,
                        }),
                    }]
                })
                .unwrap_or_default()
        }
        _ => Vec::new(),
    }
}

fn push_app_server_event(
    state: &AppState,
    connection_id: &str,
    events: &Arc<Mutex<Vec<AcpEventEnvelope>>>,
    event_sink: &Option<CliEventSink>,
    event: AcpEventEnvelope,
) {
    if let Some(sink) = event_sink.as_ref() {
        sink(event.clone());
    }
    if let Ok(mut events) = events.lock() {
        events.push(event);
    }
    super::mark_session_event(state, connection_id);
}

fn append_app_server_completion(
    state: &AppState,
    connection_id: &str,
    events: &Arc<Mutex<Vec<AcpEventEnvelope>>>,
    event_sink: &Option<CliEventSink>,
    canceled: bool,
) {
    let has_completion = events
        .lock()
        .map(|events| {
            events
                .iter()
                .any(|event| event.event_type == "turn_complete")
        })
        .unwrap_or(false);
    if has_completion {
        return;
    }
    push_app_server_event(
        state,
        connection_id,
        events,
        event_sink,
        AcpEventEnvelope {
            event_type: "status_changed".to_string(),
            connection_id: connection_id.to_string(),
            data: json!({
                "status": "idle",
                "scope": "connection",
                "runtime": "codex-app-server",
            }),
        },
    );
    push_app_server_event(
        state,
        connection_id,
        events,
        event_sink,
        AcpEventEnvelope {
            event_type: "turn_complete".to_string(),
            connection_id: connection_id.to_string(),
            data: json!({
                "sessionId": connection_id,
                "stopReason": if canceled { "canceled" } else { "completed" },
                "runtime": "codex-app-server",
            }),
        },
    );
}

fn interaction_kind_for_app_server_method(method: &str) -> Option<&'static str> {
    if method == "mcpServer/elicitation/request"
        || method == "item/tool/requestUserInput"
        || method == "claude/askUserQuestion"
    {
        return Some("question");
    }
    if method == "session/request_permission"
        || method.ends_with("/requestApproval")
        || method == "claude/requestApproval"
    {
        return Some("permission");
    }
    None
}

fn app_server_interaction_data(kind: &str, method: &str, params: Value) -> Value {
    let request_id = first_string_in_value(&params, &["requestId", "id", "permissionId"])
        .unwrap_or_else(|| format!("{kind}-{}", now_ms()));
    if kind == "question" {
        return json!({
            "questionId": request_id,
            "question": first_string_in_value(&params, &["question", "message", "title"]).unwrap_or_else(|| "Input required".to_string()),
            "questions": params.get("questions").cloned().unwrap_or_else(|| json!([])),
            "method": method,
            "raw": params,
        });
    }
    let tool_call = params
        .get("toolCall")
        .cloned()
        .unwrap_or_else(|| params.clone());
    json!({
        "id": request_id,
        "requestId": request_id,
        "type": first_string_in_value(&params, &["permissionType", "kind", "type"]).unwrap_or_else(|| "command".to_string()),
        "description": first_string_in_value(&params, &["description", "message", "title", "context"]).unwrap_or_else(|| "Permission required".to_string()),
        "details": tool_call,
        "options": params.get("options").cloned().unwrap_or_else(|| json!([
            { "id": "allow", "label": "Allow" },
            { "id": "deny", "label": "Deny" }
        ])),
        "method": method,
        "raw": params,
    })
}

fn extract_app_server_content_blocks(payload: &Value) -> Result<Vec<Value>> {
    if let Some(prompt) = payload
        .get("prompt")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return Ok(vec![json!({ "type": "text", "text": prompt })]);
    }
    let blocks = payload
        .get("blocks")
        .and_then(Value::as_array)
        .ok_or_else(|| anyhow!("acp_prompt requires prompt text or blocks"))?;
    let content = blocks
        .iter()
        .filter_map(|block| {
            if let Some(text) = extract_block_text(block) {
                return Some(json!({ "type": "text", "text": text }));
            }
            let record = block.as_object()?;
            if record.get("type").and_then(Value::as_str) == Some("image") {
                let data = record
                    .get("data")
                    .or_else(|| record.get("url"))
                    .and_then(Value::as_str)?;
                return Some(json!({ "type": "image", "url": data }));
            }
            None
        })
        .collect::<Vec<_>>();
    if content.is_empty() {
        return Err(anyhow!(
            "acp_prompt blocks did not contain app-server content"
        ));
    }
    Ok(content)
}

fn extract_app_server_session_id(value: &Value) -> Option<String> {
    value
        .get("thread")
        .and_then(|thread| first_string_in_value(thread, &["id", "threadId"]))
        .or_else(|| first_string_in_value(value, &["threadId", "sessionId", "id"]))
}

fn extract_app_server_turn_id(value: &Value) -> Option<String> {
    value
        .get("turn")
        .and_then(|turn| first_string_in_value(turn, &["id", "turnId"]))
        .or_else(|| first_string_in_value(value, &["turnId", "id"]))
}

fn tool_name_from_app_server_item(value: &Value) -> String {
    let item = value.get("item").unwrap_or(value);
    first_string_in_value(item, &["toolName", "tool", "name", "title"])
        .or_else(|| {
            first_string_in_value(item, &["type"]).map(|item_type| match item_type.as_str() {
                "commandExecution" => "Command".to_string(),
                "fileChange" => "File Change".to_string(),
                "mcpToolCall" => "MCP Tool".to_string(),
                _ => item_type,
            })
        })
        .unwrap_or_else(|| "Tool".to_string())
}

fn extract_text_from_value(value: &Value) -> Option<String> {
    if let Some(text) = value
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
    {
        return Some(text.to_string());
    }
    if let Some(array) = value.as_array() {
        let text = array
            .iter()
            .filter_map(extract_text_from_value)
            .collect::<Vec<_>>()
            .join("");
        return (!text.trim().is_empty()).then_some(text);
    }
    let record = value.as_object()?;
    for key in [
        "delta",
        "text",
        "content",
        "message",
        "output",
        "aggregatedOutput",
        "deltaBase64",
    ] {
        let Some(next) = record.get(key) else {
            continue;
        };
        if key == "deltaBase64" {
            if let Some(decoded) = next.as_str().and_then(decode_base64_text) {
                return Some(decoded);
            }
        } else if let Some(text) = extract_text_from_value(next) {
            return Some(text);
        }
    }
    for key in ["item", "message", "params"] {
        if let Some(text) = record.get(key).and_then(extract_text_from_value) {
            return Some(text);
        }
    }
    None
}

fn first_string_in_value(value: &Value, keys: &[&str]) -> Option<String> {
    let record = value.as_object()?;
    keys.iter().find_map(|key| {
        record
            .get(*key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string)
    })
}

fn decode_base64_text(value: &str) -> Option<String> {
    use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
    BASE64
        .decode(value.as_bytes())
        .ok()
        .and_then(|bytes| String::from_utf8(bytes).ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn register_process_control(
    state: &AppState,
    session_id: &str,
    payload: &Value,
    cancel_tx: oneshot::Sender<()>,
) -> Result<()> {
    let mut processes = state
        .cli_processes
        .lock()
        .map_err(|_| anyhow!("cli process lock poisoned"))?;
    processes.insert(
        session_id.to_string(),
        CliProcessControl {
            request_id: extract_request_id(payload),
            started_at_ms: now_ms(),
            cancel_tx: Some(cancel_tx),
        },
    );
    Ok(())
}

fn unregister_process_control(state: &AppState, session_id: &str) {
    if let Ok(mut processes) = state.cli_processes.lock() {
        processes.remove(session_id);
    }
}

fn codex_command_parts() -> (String, Vec<String>) {
    command_parts_from_env(&["MCODE_DESKTOP_TEST_CODEX_COMMAND"], "codex")
}

fn codex_app_server_command_parts() -> (String, Vec<String>) {
    for variable in [
        "MCODE_DESKTOP_TEST_CODEX_APP_SERVER_COMMAND",
        "MCODE_DESKTOP_CODEX_APP_SERVER_COMMAND",
    ] {
        if let Ok(command) = std::env::var(variable) {
            let parts = split_command_line(&command);
            if let Some((binary, args)) = parts.split_first() {
                return (binary.clone(), args.to_vec());
            }
        }
    }
    (
        "codex".to_string(),
        vec![
            "app-server".to_string(),
            "--listen".to_string(),
            "stdio://".to_string(),
        ],
    )
}

fn codex_app_server_enabled() -> bool {
    std::env::var("MCODE_DESKTOP_TEST_CODEX_APP_SERVER_COMMAND")
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false)
        || std::env::var("MCODE_DESKTOP_CODEX_APP_SERVER")
            .map(|value| matches!(value.trim(), "1" | "true" | "yes" | "on"))
            .unwrap_or(false)
}

fn codex_app_server_required() -> bool {
    std::env::var("MCODE_DESKTOP_CODEX_APP_SERVER_REQUIRED")
        .map(|value| matches!(value.trim(), "1" | "true" | "yes" | "on"))
        .unwrap_or(false)
}

fn split_command_line(command: &str) -> Vec<String> {
    command
        .split_whitespace()
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .map(ToString::to_string)
        .collect()
}

fn extract_connection_id(payload: &Value) -> Option<String> {
    payload
        .get("connectionId")
        .and_then(Value::as_str)
        .or_else(|| payload.get("connection_id").and_then(Value::as_str))
        .or_else(|| payload.get("sessionId").and_then(Value::as_str))
        .or_else(|| payload.get("session_id").and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn extract_working_dir(payload: &Value) -> Option<String> {
    payload
        .get("workingDir")
        .or_else(|| payload.get("working_dir"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn extract_request_id(payload: &Value) -> Option<String> {
    payload
        .get("requestId")
        .and_then(Value::as_str)
        .or_else(|| payload.get("request_id").and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn extract_block_text(block: &Value) -> Option<String> {
    if let Some(text) = block.as_str() {
        return Some(text.to_string());
    }
    let record = block.as_object()?;
    for key in ["text", "content", "value"] {
        if let Some(text) = record.get(key).and_then(Value::as_str) {
            return Some(text.to_string());
        }
    }
    None
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}
