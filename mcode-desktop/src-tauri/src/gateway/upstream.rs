use std::collections::HashMap;
use std::sync::atomic::Ordering;
use std::sync::Arc;

use anyhow::{anyhow, Result};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::tcp::{OwnedReadHalf, OwnedWriteHalf};
use tokio::sync::mpsc;
use tokio::time::{sleep, Duration};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use url::Url;

use crate::app_state::{AppState, GatewayConfig, GatewayProvider, PairOffer, UpstreamStatus};
use crate::recovery::QueuedOutboundEvent;
use crate::runtime::{
    dispatch_desktop_proxy_with_event_sink_arc, refresh_cli_status_into_state, CliEventSink,
};
use crate::tunnel::{open_tcp_stream, serve_tunnel_request, TunnelHttpRequest, TunnelHttpResponse};

type OutboundTx = mpsc::UnboundedSender<Message>;

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
pub struct DesktopUpstreamHello {
    #[serde(rename = "type")]
    pub frame_type: String,
    #[serde(rename = "targetId")]
    pub target_id: String,
    #[serde(rename = "targetAgent")]
    pub target_agent: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
    pub capabilities: Vec<String>,
    #[serde(rename = "protocolVersion")]
    pub protocol_version: String,
    #[serde(rename = "relayUrl", skip_serializing_if = "Option::is_none")]
    pub relay_url: Option<String>,
}

impl DesktopUpstreamHello {
    pub fn new(
        target_id: impl Into<String>,
        display_name: impl Into<String>,
        capabilities: Vec<String>,
    ) -> Self {
        Self {
            frame_type: "desktop_hello".to_string(),
            target_id: target_id.into(),
            target_agent: "mcode-desktop".to_string(),
            display_name: display_name.into(),
            capabilities,
            protocol_version: "1".to_string(),
            relay_url: None,
        }
    }

    pub fn from_state(target_id: &str, display_name: &str, state: &AppState) -> Self {
        let capabilities = state
            .capabilities
            .read()
            .map(|value| value.clone())
            .unwrap_or_default();
        Self::new(target_id, display_name, capabilities)
    }
}

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(tag = "type")]
pub enum RelayControlFrame {
    #[serde(rename = "ack")]
    Ack {
        #[serde(rename = "eventId")]
        event_id: u64,
        #[serde(rename = "localEventId", default)]
        local_event_id: Option<u64>,
    },
    #[serde(rename = "tunnel_request")]
    TunnelRequest {
        #[serde(rename = "requestId")]
        request_id: String,
        request: TunnelHttpRequest,
    },
    #[serde(rename = "proxy_request")]
    ProxyRequest {
        #[serde(rename = "requestId")]
        request_id: String,
        command: String,
        #[serde(default)]
        payload: serde_json::Value,
        #[serde(rename = "clientId", default)]
        client_id: Option<String>,
        #[serde(default)]
        client: Option<serde_json::Value>,
    },
    #[serde(rename = "tcp_connect")]
    TcpConnect {
        #[serde(rename = "streamId")]
        stream_id: String,
        port: u16,
    },
    #[serde(rename = "tcp_data")]
    TcpData {
        #[serde(rename = "streamId")]
        stream_id: String,
        #[serde(rename = "dataBase64")]
        data_base64: String,
    },
    #[serde(rename = "tcp_close")]
    TcpClose {
        #[serde(rename = "streamId")]
        stream_id: String,
    },
    #[serde(rename = "tcp_error")]
    TcpError {
        #[serde(rename = "streamId")]
        stream_id: String,
        #[serde(default)]
        error: String,
    },
    #[serde(rename = "controller_attached")]
    ControllerAttached {
        #[serde(rename = "controllerId")]
        controller_id: String,
    },
    #[serde(other)]
    Unknown,
}

pub fn build_upstream_ws_url(base_url: &str) -> Result<String> {
    let mut url = Url::parse(base_url.trim())?;
    let scheme = match url.scheme() {
        "https" => "wss",
        "http" => "ws",
        other => return Err(anyhow!("unsupported gateway scheme: {other}")),
    };
    url.set_scheme(scheme)
        .map_err(|_| anyhow!("invalid gateway scheme"))?;
    url.set_path("/v1/tunnel/desktop");
    url.set_query(None);
    Ok(url.to_string())
}

pub fn build_pair_offer_frame(
    target_id: &str,
    display_name: &str,
    offer: &PairOffer,
    capabilities: Vec<String>,
) -> serde_json::Value {
    json!({
        "type": "pair_offer",
        "targetId": target_id,
        "targetName": display_name,
        "displayName": display_name,
        "targetAgent": "mcode-desktop",
        "capabilities": capabilities,
        "protocolVersion": "1",
        "code": offer.code,
        "secret": offer.secret,
    })
}

pub fn build_tunnel_response_frame(
    request_id: &str,
    result: Result<TunnelHttpResponse, String>,
) -> serde_json::Value {
    match result {
        Ok(response) => json!({
            "type": "tunnel_response",
            "requestId": request_id,
            "ok": true,
            "status": response.status,
            "headers": response.headers,
            "body": response.body,
        }),
        Err(error) => json!({
            "type": "tunnel_response",
            "requestId": request_id,
            "ok": false,
            "error": error,
        }),
    }
}

pub fn build_proxy_response_frame(
    request_id: &str,
    result: std::result::Result<serde_json::Value, String>,
) -> serde_json::Value {
    match result {
        Ok(body) => json!({
            "type": "proxy_response",
            "requestId": request_id,
            "ok": true,
            "body": body,
        }),
        Err(error) => json!({
            "type": "proxy_response",
            "requestId": request_id,
            "ok": false,
            "error": error,
        }),
    }
}

pub fn build_event_push_frames(body: &serde_json::Value) -> Vec<serde_json::Value> {
    let streamed_event_count = body
        .get("streamedEventCount")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(0) as usize;
    body.get("events")
        .and_then(serde_json::Value::as_array)
        .map(|events| {
            events
                .iter()
                .skip(streamed_event_count)
                .cloned()
                .map(|event| {
                    json!({
                        "type": "event_push",
                        "event": event,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

pub fn queue_event_for_upstream(
    state: &AppState,
    event: serde_json::Value,
) -> Result<QueuedOutboundEvent> {
    let queued = {
        let mut queue = state
            .outbound_event_queue
            .lock()
            .map_err(|_| anyhow!("outbound event queue lock poisoned"))?;
        queue.enqueue(event)
    };
    let overflow_count = state
        .outbound_event_queue
        .lock()
        .map(|queue| queue.overflow_count())
        .unwrap_or(0);
    if overflow_count > 0 {
        state.push_diagnostic("error", "recovery_queue_overflow");
    }
    let _ = crate::recovery::save_recovery_snapshot(state);
    Ok(queued)
}

pub fn build_event_push_frame(local_event_id: u64, event: serde_json::Value) -> serde_json::Value {
    json!({
        "type": "event_push",
        "localEventId": local_event_id,
        "event": event,
    })
}

pub fn build_tcp_data_frame(stream_id: &str, data: &[u8]) -> serde_json::Value {
    json!({
        "type": "tcp_data",
        "streamId": stream_id,
        "dataBase64": BASE64.encode(data),
    })
}

pub fn build_tcp_close_frame(stream_id: &str) -> serde_json::Value {
    json!({
        "type": "tcp_close",
        "streamId": stream_id,
    })
}

pub fn build_tcp_error_frame(stream_id: &str, error: impl Into<String>) -> serde_json::Value {
    json!({
        "type": "tcp_error",
        "streamId": stream_id,
        "error": error.into(),
    })
}

pub async fn connect_upstream_until_stopped(state: Arc<AppState>) -> Result<()> {
    state.shutdown_requested.store(false, Ordering::SeqCst);
    let mut attempt = 0_u32;

    loop {
        if state.shutdown_requested.load(Ordering::SeqCst) {
            mark_upstream_error(&state, "gateway upstream stopped").await;
            return Ok(());
        }

        match connect_upstream(Arc::clone(&state)).await {
            Ok(()) => {
                reset_reconnect_state(&state);
                return Ok(());
            }
            Err(error) => {
                if state.shutdown_requested.load(Ordering::SeqCst) {
                    mark_upstream_error(&state, "gateway upstream stopped").await;
                    return Ok(());
                }

                attempt = attempt.saturating_add(1);
                let delay_ms = reconnect_delay_ms(attempt);
                record_upstream_retry(&state, attempt, delay_ms);
                mark_upstream_error(&state, error.to_string()).await;
                state.push_diagnostic(
                    "error",
                    format!("gateway upstream reconnect attempt {attempt} in {delay_ms}ms"),
                );
                sleep(Duration::from_millis(delay_ms)).await;
            }
        }
    }
}

pub async fn connect_upstream(state: Arc<AppState>) -> Result<()> {
    let relay_url = state
        .relay_url
        .read()
        .ok()
        .and_then(|value| value.clone())
        .ok_or_else(|| anyhow!("relay url is required"))?;
    let config = state
        .gateway_config
        .read()
        .ok()
        .and_then(|value| value.clone())
        .unwrap_or(GatewayConfig {
            provider: GatewayProvider::Official,
            base_url: relay_url.clone(),
        });
    mark_upstream_connecting(&state, config).await;

    let ws_url = build_upstream_ws_url(&relay_url)?;
    let (socket, _) = connect_async(ws_url).await?;
    let (writer, mut reader) = socket.split();
    let (outbound_tx, mut outbound_rx) = mpsc::unbounded_channel::<Message>();
    tokio::spawn(async move {
        let mut writer = writer;
        while let Some(message) = outbound_rx.recv().await {
            if writer.send(message).await.is_err() {
                break;
            }
        }
    });

    let target_id = state
        .target_id
        .read()
        .map(|value| value.clone())
        .unwrap_or_else(|_| "desktop-unknown".to_string());
    let display_name = state
        .display_name
        .read()
        .map(|value| value.clone())
        .unwrap_or_else(|_| "MCode Desktop".to_string());
    refresh_cli_status_into_state(&state).await;

    let capabilities = state
        .capabilities
        .read()
        .map(|value| value.clone())
        .unwrap_or_default();

    let mut hello = DesktopUpstreamHello::from_state(&target_id, &display_name, &state);
    hello.relay_url = Some(relay_url.clone());
    send_outbound_text(&outbound_tx, serde_json::to_string(&hello)?)?;

    let pair_offer = state.pair_offer.read().ok().and_then(|value| value.clone());
    if let Some(offer) = pair_offer {
        let frame = build_pair_offer_frame(&target_id, &display_name, &offer, capabilities);
        send_outbound_json(&outbound_tx, frame)?;
    }

    mark_upstream_online(&state).await;
    replay_queued_events(&state, &outbound_tx)?;
    let mut tcp_writers: HashMap<String, OwnedWriteHalf> = HashMap::new();

    while let Some(message) = reader.next().await {
        let message = message?;
        if message.is_text() {
            let frame = parse_upstream_frame(message.to_text()?)?;
            match frame {
                RelayControlFrame::TunnelRequest {
                    request_id,
                    request,
                } => {
                    let result = serve_tunnel_request(&state, request)
                        .await
                        .map_err(|error| error.to_string());
                    let response = build_tunnel_response_frame(&request_id, result);
                    send_outbound_json(&outbound_tx, response)?;
                }
                RelayControlFrame::ProxyRequest {
                    request_id,
                    command,
                    payload,
                    client_id,
                    client,
                } => {
                    let payload = merge_proxy_client_metadata(payload, client_id, client);
                    let event_sink =
                        build_upstream_event_sink(Arc::clone(&state), outbound_tx.clone());
                    let result = dispatch_desktop_proxy_with_event_sink_arc(
                        Arc::clone(&state),
                        &command,
                        payload,
                        Some(event_sink),
                    )
                    .await
                    .map_err(|error| error.to_string());
                    if let Ok(body) = &result {
                        for event_frame in build_event_push_frames(body) {
                            let event = event_frame
                                .get("event")
                                .cloned()
                                .unwrap_or(event_frame);
                            let queued = queue_event_for_upstream(state.as_ref(), event)?;
                            send_outbound_json(
                                &outbound_tx,
                                build_event_push_frame(queued.local_event_id, queued.event),
                            )?;
                        }
                    }
                    let response = build_proxy_response_frame(&request_id, result);
                    send_outbound_json(&outbound_tx, response)?;
                }
                RelayControlFrame::TcpConnect { stream_id, port } => {
                    match open_tcp_stream(&state, port).await {
                        Ok(stream) => {
                            let (reader, writer) = stream.into_split();
                            tcp_writers.insert(stream_id.clone(), writer);
                            spawn_tcp_reader(stream_id.clone(), reader, outbound_tx.clone());
                            state.push_diagnostic(
                                "info",
                                format!("tcp stream {stream_id} connected to 127.0.0.1:{port}"),
                            );
                        }
                        Err(error) => {
                            send_outbound_json(
                                &outbound_tx,
                                build_tcp_error_frame(&stream_id, error.to_string()),
                            )?;
                        }
                    }
                }
                RelayControlFrame::TcpData {
                    stream_id,
                    data_base64,
                } => {
                    let bytes = match BASE64.decode(data_base64.as_bytes()) {
                        Ok(bytes) => bytes,
                        Err(error) => {
                            send_outbound_json(
                                &outbound_tx,
                                build_tcp_error_frame(&stream_id, error.to_string()),
                            )?;
                            continue;
                        }
                    };
                    if let Some(writer) = tcp_writers.get_mut(&stream_id) {
                        if let Err(error) = writer.write_all(&bytes).await {
                            tcp_writers.remove(&stream_id);
                            send_outbound_json(
                                &outbound_tx,
                                build_tcp_error_frame(&stream_id, error.to_string()),
                            )?;
                        }
                    } else {
                        send_outbound_json(
                            &outbound_tx,
                            build_tcp_error_frame(&stream_id, "tcp stream not found"),
                        )?;
                    }
                }
                RelayControlFrame::TcpClose { stream_id } => {
                    if let Some(mut writer) = tcp_writers.remove(&stream_id) {
                        let _ = writer.shutdown().await;
                    }
                    state.push_diagnostic("info", format!("tcp stream {stream_id} closed"));
                }
                RelayControlFrame::TcpError { stream_id, error } => {
                    tcp_writers.remove(&stream_id);
                    state.push_diagnostic("error", format!("tcp stream {stream_id}: {error}"));
                }
                other => handle_upstream_frame(&state, other).await?,
            }
        }
    }

    mark_upstream_error(&state, "gateway upstream closed").await;
    Err(anyhow!("gateway upstream closed"))
}

pub fn parse_upstream_frame(message: &str) -> Result<RelayControlFrame> {
    serde_json::from_str(message).map_err(Into::into)
}

fn merge_proxy_client_metadata(
    payload: serde_json::Value,
    client_id: Option<String>,
    client: Option<serde_json::Value>,
) -> serde_json::Value {
    let mut object = match payload {
        serde_json::Value::Object(object) => object,
        _ => serde_json::Map::new(),
    };
    if let Some(client_id) = client_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    {
        object
            .entry("sourceClientId".to_string())
            .or_insert(serde_json::Value::String(client_id));
    }
    if let Some(client) = client {
        object.entry("client".to_string()).or_insert(client);
    }
    serde_json::Value::Object(object)
}

fn send_outbound_text(tx: &OutboundTx, text: String) -> Result<()> {
    tx.send(Message::Text(text.into()))
        .map_err(|_| anyhow!("gateway upstream writer closed"))
}

fn send_outbound_json(tx: &OutboundTx, value: serde_json::Value) -> Result<()> {
    send_outbound_text(tx, value.to_string())
}

fn spawn_tcp_reader(stream_id: String, mut reader: OwnedReadHalf, outbound_tx: OutboundTx) {
    tokio::spawn(async move {
        let mut buffer = vec![0_u8; 8192];
        loop {
            match reader.read(&mut buffer).await {
                Ok(0) => {
                    let _ = send_outbound_json(&outbound_tx, build_tcp_close_frame(&stream_id));
                    break;
                }
                Ok(size) => {
                    let _ = send_outbound_json(
                        &outbound_tx,
                        build_tcp_data_frame(&stream_id, &buffer[..size]),
                    );
                }
                Err(error) => {
                    let _ = send_outbound_json(
                        &outbound_tx,
                        build_tcp_error_frame(&stream_id, error.to_string()),
                    );
                    break;
                }
            }
        }
    });
}

fn replay_queued_events(state: &AppState, outbound_tx: &OutboundTx) -> Result<()> {
    let pending = state
        .outbound_event_queue
        .lock()
        .map_err(|_| anyhow!("outbound event queue lock poisoned"))?
        .pending();
    for queued in pending {
        send_outbound_json(
            outbound_tx,
            build_event_push_frame(queued.local_event_id, queued.event),
        )?;
    }
    Ok(())
}

fn build_upstream_event_sink(state: Arc<AppState>, outbound_tx: OutboundTx) -> CliEventSink {
    std::sync::Arc::new(move |event| {
        if let Ok(queued) = queue_event_for_upstream(state.as_ref(), json!(event)) {
            let _ = send_outbound_json(
                &outbound_tx,
                build_event_push_frame(queued.local_event_id, queued.event),
            );
        }
    })
}

pub async fn handle_upstream_frame(state: &AppState, frame: RelayControlFrame) -> Result<()> {
    match frame {
        RelayControlFrame::Ack {
            event_id,
            local_event_id,
        } => {
            if let Some(local_event_id) = local_event_id {
                if let Ok(mut queue) = state.outbound_event_queue.lock() {
                    queue.ack(local_event_id, event_id);
                }
                if let Ok(mut last_ack) = state.last_ack_local_event_id.write() {
                    *last_ack = Some(local_event_id);
                }
                if let Ok(mut replay_supported) = state.replay_supported.write() {
                    *replay_supported = true;
                }
            }
            if let Ok(mut last_ack) = state.last_ack_event_id.write() {
                *last_ack = Some(event_id);
            }
            if let Ok(mut last_relay_event_id) = state.last_relay_event_id.write() {
                *last_relay_event_id = Some(event_id);
            }
            let _ = crate::recovery::save_recovery_snapshot(state);
            Ok(())
        }
        RelayControlFrame::ControllerAttached { controller_id } => {
            if let Ok(mut active_controller_id) = state.active_controller_id.write() {
                *active_controller_id = Some(controller_id.clone());
            }
            state.push_diagnostic("info", format!("controller attached: {controller_id}"));
            Ok(())
        }
        RelayControlFrame::Unknown => Err(anyhow!("unknown upstream frame")),
        _ => Ok(()),
    }
}

pub async fn mark_upstream_connecting(state: &AppState, config: GatewayConfig) {
    state.shutdown_requested.store(false, Ordering::SeqCst);
    if let Ok(mut gateway_config) = state.gateway_config.write() {
        *gateway_config = Some(config);
    }
    if let Ok(mut status) = state.upstream_status.write() {
        *status = UpstreamStatus::Connecting;
    }
    if let Ok(mut error) = state.upstream_error.write() {
        *error = None;
    }
}

pub async fn mark_upstream_online(state: &AppState) {
    reset_reconnect_state(state);
    if let Ok(mut status) = state.upstream_status.write() {
        *status = UpstreamStatus::Online;
    }
    if let Ok(mut error) = state.upstream_error.write() {
        *error = None;
    }
}

pub async fn mark_upstream_error(state: &AppState, message: impl Into<String>) {
    if let Ok(mut status) = state.upstream_status.write() {
        *status = UpstreamStatus::Error;
    }
    if let Ok(mut error) = state.upstream_error.write() {
        *error = Some(message.into());
    }
}

pub fn record_upstream_retry(state: &AppState, attempt: u32, delay_ms: u64) {
    if let Ok(mut reconnect_attempt) = state.upstream_reconnect_attempt.write() {
        *reconnect_attempt = attempt;
    }
    if let Ok(mut next_retry_delay_ms) = state.upstream_next_retry_delay_ms.write() {
        *next_retry_delay_ms = Some(delay_ms);
    }
}

pub fn request_upstream_shutdown(state: &AppState) {
    state.shutdown_requested.store(true, Ordering::SeqCst);
    if let Ok(mut next_retry_delay_ms) = state.upstream_next_retry_delay_ms.write() {
        *next_retry_delay_ms = None;
    }
}

fn reset_reconnect_state(state: &AppState) {
    if let Ok(mut reconnect_attempt) = state.upstream_reconnect_attempt.write() {
        *reconnect_attempt = 0;
    }
    if let Ok(mut next_retry_delay_ms) = state.upstream_next_retry_delay_ms.write() {
        *next_retry_delay_ms = None;
    }
}

fn reconnect_delay_ms(attempt: u32) -> u64 {
    let exponent = attempt.saturating_sub(1).min(5);
    (1_000_u64.saturating_mul(2_u64.saturating_pow(exponent))).min(30_000)
}
