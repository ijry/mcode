use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::{mpsc, watch, Mutex};
use tokio_tungstenite::tungstenite::Message;

use crate::chat_channel::error::ChatChannelError;
use crate::chat_channel::traits::ChatChannelBackend;
use crate::chat_channel::types::*;

pub struct McodeBackend {
    channel_id: i32,
    token: String,
    config: McodeConfig,
    client: reqwest::Client,
    status: Arc<Mutex<ChannelConnectionStatus>>,
    shutdown_tx: Arc<Mutex<Option<watch::Sender<bool>>>>,
}

impl McodeBackend {
    const DEFAULT_DIRECT_BASE_URL: &'static str = "http://127.0.0.1:3080";

    pub fn new(
        channel_id: i32,
        token: String,
        config: McodeConfig,
    ) -> Result<Self, ChatChannelError> {
        Self::validate_config(&config)?;
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(20))
            .build()
            .unwrap_or_default();

        Ok(Self {
            channel_id,
            token,
            config,
            client,
            status: Arc::new(Mutex::new(ChannelConnectionStatus::Disconnected)),
            shutdown_tx: Arc::new(Mutex::new(None)),
        })
    }

    fn validate_config(config: &McodeConfig) -> Result<(), ChatChannelError> {
        match config.connection_mode {
            McodeConnectionMode::Relay => {
                if config.relay_url.as_deref().unwrap_or("").trim().is_empty() {
                    return Err(ChatChannelError::ConfigurationInvalid(
                        "relay_url is required for relay mode".into(),
                    ));
                }
            }
            McodeConnectionMode::Direct => {
                if config
                    .direct_base_url
                    .as_deref()
                    .unwrap_or("")
                    .trim()
                    .is_empty()
                {
                    return Err(ChatChannelError::ConfigurationInvalid(
                        "direct_base_url is required for direct mode".into(),
                    ));
                }
            }
        }
        Ok(())
    }

    async fn probe_with(
        client: &reqwest::Client,
        config: &McodeConfig,
        token: &str,
    ) -> Result<(), ChatChannelError> {
        let (url, is_relay_mode) = match config.connection_mode {
            McodeConnectionMode::Relay => {
                let base = config
                    .relay_url
                    .as_deref()
                    .unwrap_or("")
                    .trim()
                    .trim_end_matches('/');
                if base.is_empty() {
                    return Err(ChatChannelError::ConfigurationInvalid(
                        "relay_url is required for relay mode".into(),
                    ));
                }
                (format!("{base}/health"), true)
            }
            McodeConnectionMode::Direct => {
                let base = config
                    .direct_base_url
                    .as_deref()
                    .unwrap_or(Self::DEFAULT_DIRECT_BASE_URL)
                    .trim()
                    .trim_end_matches('/');
                if base.is_empty() {
                    return Err(ChatChannelError::ConfigurationInvalid(
                        "direct_base_url is required for direct mode".into(),
                    ));
                }
                (format!("{base}/api/health"), false)
            }
        };

        let mut req = if is_relay_mode {
            client.get(url)
        } else {
            client.post(url).json(&serde_json::json!({}))
        };

        if !token.trim().is_empty() {
            req = req.bearer_auth(token.trim());
        }

        let resp = req
            .send()
            .await
            .map_err(|e| ChatChannelError::ConnectionFailed(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(ChatChannelError::ConnectionFailed(format!(
                "health check failed: {status} {body}"
            )));
        }

        Ok(())
    }

    async fn probe_once(&self) -> Result<(), ChatChannelError> {
        Self::probe_with(&self.client, &self.config, &self.token).await
    }

    async fn monitor_loop(
        client: reqwest::Client,
        config: McodeConfig,
        token: String,
        channel_id: i32,
        status: Arc<Mutex<ChannelConnectionStatus>>,
        mut shutdown_rx: watch::Receiver<bool>,
    ) {
        if config.connection_mode == McodeConnectionMode::Direct {
            loop {
                tokio::select! {
                    _ = shutdown_rx.changed() => {
                        break;
                    }
                    _ = tokio::time::sleep(Duration::from_secs(60)) => {
                        let result = Self::probe_with(&client, &config, &token).await;
                        let mut guard = status.lock().await;
                        *guard = match result {
                            Ok(_) => ChannelConnectionStatus::Connected,
                            Err(_) => ChannelConnectionStatus::Error,
                        };
                    }
                }
            }
            return;
        }

        let relay_url = config
            .relay_url
            .as_deref()
            .unwrap_or("")
            .trim()
            .trim_end_matches('/')
            .to_string();
        let relay_ws_base = if relay_url.starts_with("https://") {
            format!("wss://{}", &relay_url["https://".len()..])
        } else if relay_url.starts_with("http://") {
            format!("ws://{}", &relay_url["http://".len()..])
        } else {
            relay_url.clone()
        };
        let target_id = format!("codeg-{channel_id}");
        let pairing_code = format!("{:06}", channel_id.unsigned_abs() % 1_000_000);
        let direct_base = config
            .direct_base_url
            .as_deref()
            .unwrap_or(Self::DEFAULT_DIRECT_BASE_URL)
            .trim()
            .trim_end_matches('/')
            .to_string();

        loop {
            if *shutdown_rx.borrow() {
                break;
            }

            let ws_url = format!(
                "{relay_ws_base}/v1/tunnel/desktop?targetId={}&targetName={}",
                urlencoding::encode(&target_id),
                urlencoding::encode(&target_id)
            );

            let connect = tokio_tungstenite::connect_async(&ws_url).await;
            let (mut ws_stream, _) = match connect {
                Ok(conn) => {
                    *status.lock().await = ChannelConnectionStatus::Connected;
                    conn
                }
                Err(e) => {
                    eprintln!("[MCode] relay ws connect failed: {e}");
                    *status.lock().await = ChannelConnectionStatus::Error;
                    tokio::select! {
                        _ = shutdown_rx.changed() => break,
                        _ = tokio::time::sleep(Duration::from_secs(3)) => {}
                    }
                    continue;
                }
            };

            let hello = serde_json::json!({
                "type": "desktop_hello",
                "targetId": target_id,
                "targetName": target_id,
            });
            if ws_stream
                .send(Message::Text(hello.to_string().into()))
                .await
                .is_err()
            {
                *status.lock().await = ChannelConnectionStatus::Error;
                continue;
            }

            // Pairing material: code + token(secret)
            let pair_offer = serde_json::json!({
                "type": "pair_offer",
                "code": pairing_code,
                "secret": token,
                "targetName": target_id,
                "relayUrl": relay_url,
            });
            let _ = ws_stream
                .send(Message::Text(pair_offer.to_string().into()))
                .await;

            let mut heartbeat = tokio::time::interval(Duration::from_secs(20));

            loop {
                tokio::select! {
                    _ = shutdown_rx.changed() => {
                        let _ = ws_stream.close(None).await;
                        return;
                    }
                    _ = heartbeat.tick() => {
                        let hb = serde_json::json!({"type":"desktop_heartbeat"});
                        if ws_stream.send(Message::Text(hb.to_string().into())).await.is_err() {
                            *status.lock().await = ChannelConnectionStatus::Error;
                            break;
                        }
                    }
                    msg = ws_stream.next() => {
                        let Some(msg) = msg else {
                            *status.lock().await = ChannelConnectionStatus::Disconnected;
                            break;
                        };
                        let msg = match msg {
                            Ok(m) => m,
                            Err(e) => {
                                eprintln!("[MCode] relay ws recv error: {e}");
                                *status.lock().await = ChannelConnectionStatus::Error;
                                break;
                            }
                        };

                        if !msg.is_text() {
                            continue;
                        }
                        let text = match msg.into_text() {
                            Ok(t) => t,
                            Err(_) => continue,
                        };
                        let parsed: serde_json::Value = match serde_json::from_str(&text) {
                            Ok(v) => v,
                            Err(_) => continue,
                        };
                        let msg_type = parsed.get("type").and_then(|v| v.as_str()).unwrap_or("");
                        if msg_type != "proxy_request" {
                            continue;
                        }

                        let request_id = parsed
                            .get("requestId")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        let command = parsed
                            .get("command")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        let payload = parsed.get("payload").cloned().unwrap_or(serde_json::json!({}));

                        if request_id.is_empty() || command.is_empty() {
                            let bad = serde_json::json!({
                                "type": "proxy_response",
                                "requestId": request_id,
                                "ok": false,
                                "status": 400,
                                "error": "invalid proxy request",
                            });
                            let _ = ws_stream.send(Message::Text(bad.to_string().into())).await;
                            continue;
                        }

                        let local_url = format!("{direct_base}/api/{command}");
                        let mut req = client.post(local_url).json(&payload);
                        if !token.trim().is_empty() {
                            req = req.bearer_auth(token.trim());
                        }
                        let relay_response = match req.send().await {
                            Ok(resp) => {
                                let status_code = resp.status().as_u16();
                                let text = resp.text().await.unwrap_or_default();
                                let body = serde_json::from_str::<serde_json::Value>(&text)
                                    .unwrap_or_else(|_| serde_json::json!(text));
                                serde_json::json!({
                                    "type": "proxy_response",
                                    "requestId": request_id,
                                    "ok": status_code < 400,
                                    "status": status_code,
                                    "body": body,
                                })
                            }
                            Err(e) => serde_json::json!({
                                "type": "proxy_response",
                                "requestId": request_id,
                                "ok": false,
                                "status": 502,
                                "error": format!("proxy failed: {e}"),
                            }),
                        };
                        if ws_stream
                            .send(Message::Text(relay_response.to_string().into()))
                            .await
                            .is_err()
                        {
                            *status.lock().await = ChannelConnectionStatus::Error;
                            break;
                        }
                    }
                }
            }

            tokio::select! {
                _ = shutdown_rx.changed() => break,
                _ = tokio::time::sleep(Duration::from_secs(2)) => {}
            }
        }
    }
}

#[async_trait]
impl ChatChannelBackend for McodeBackend {
    fn channel_type(&self) -> ChannelType {
        ChannelType::Mcode
    }

    async fn start(
        &self,
        _command_tx: mpsc::Sender<IncomingCommand>,
    ) -> Result<(), ChatChannelError> {
        *self.status.lock().await = ChannelConnectionStatus::Connecting;
        self.probe_once().await?;
        *self.status.lock().await = ChannelConnectionStatus::Connected;

        let (shutdown_tx, shutdown_rx) = watch::channel(false);
        *self.shutdown_tx.lock().await = Some(shutdown_tx);

        let client = self.client.clone();
        let config = self.config.clone();
        let token = self.token.clone();
        let status = self.status.clone();
        let channel_id = self.channel_id;
        tokio::spawn(async move {
            McodeBackend::monitor_loop(client, config, token, channel_id, status, shutdown_rx)
                .await;
        });

        Ok(())
    }

    async fn stop(&self) -> Result<(), ChatChannelError> {
        if let Some(tx) = self.shutdown_tx.lock().await.take() {
            let _ = tx.send(true);
        }
        *self.status.lock().await = ChannelConnectionStatus::Disconnected;
        Ok(())
    }

    async fn status(&self) -> ChannelConnectionStatus {
        *self.status.lock().await
    }

    async fn send_message(&self, _text: &str) -> Result<SentMessageId, ChatChannelError> {
        Ok(SentMessageId(format!("mcode-{}-text", self.channel_id)))
    }

    async fn send_rich_message(
        &self,
        _message: &RichMessage,
    ) -> Result<SentMessageId, ChatChannelError> {
        Ok(SentMessageId(format!("mcode-{}-rich", self.channel_id)))
    }

    async fn test_connection(&self) -> Result<(), ChatChannelError> {
        self.probe_once().await
    }
}
