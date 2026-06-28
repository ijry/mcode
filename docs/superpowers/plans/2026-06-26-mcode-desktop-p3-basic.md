# MCode Desktop P3 Basic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `mcode-desktop` a usable optional desktop host that can connect to an official or custom MCode gateway, register itself, generate pair QR payloads, expose health/version/capabilities, and configure local HTTP services such as `127.0.0.1:1080`.

**Architecture:** P3 keeps `mcode-desktop` focused on desktop host fundamentals: state, gateway upstream lifecycle, pair offer generation, health/capability reporting, and local service configuration. It does not implement P4's streaming TCP/HTTP tunnel transport and does not implement P5's Claude/Codex official CLI adapters; it only publishes capabilities and service metadata needed by those later phases.

**Tech Stack:** `mcode-desktop` frontend uses Vue 3, Pinia, Vite, Vitest, and Tauri JS API. `mcode-desktop` backend uses Tauri 2, Rust 2021, serde, tokio, tokio-tungstenite, futures-util, url, and Cargo integration tests. `mcode-relay` remains the gateway protocol peer already upgraded in prior commits.

## Global Constraints

- The authoritative field name is `targetAgent`, not `targetType`.
- Preserve the ability to run MCode without `mcode-desktop`; P3 must not make desktop mandatory for `codeg` or `opencode`.
- Treat `codex` official CLI and `claude` official CLI as future `mcode-desktop` capabilities; P3 does not proxy either CLI.
- User-visible copy must prefer `网关`; do not add new `中继` copy.
- `mcode-desktop` must remain a Tauri desktop app with tray/background lifecycle, not a CLI-first product.
- P3 service exposure defaults to loopback only: `127.0.0.1`; any non-loopback host must be rejected in P3.
- Every mcode change must update a Markdown note under `docs/mcode-architecture-notes/`.
- P3 output must be independently verifiable through frontend tests, Rust tests, and a successful `cargo test`.

---

## File Structure

- `mcode-desktop/src/lib/pairing.ts`
  - Owns desktop-generated v2 gateway QR payloads and pair offer serialization.
- `mcode-desktop/src/lib/pairing.spec.ts`
  - Locks QR payload behavior for official and custom gateways.
- `mcode-desktop/src/lib/runtimeApi.ts`
  - Wraps Tauri `invoke()` calls for gateway connect/disconnect, pair offer generation, health, capabilities, and service config commands.
- `mcode-desktop/src/stores/desktopRuntime.ts`
  - Holds frontend runtime state and async actions that call `runtimeApi`.
- `mcode-desktop/src/pages/ConnectionsPage.vue`
  - Shows gateway provider settings, connection status, pair code, and QR payload.
- `mcode-desktop/src/pages/TunnelPage.vue`
  - Configures local HTTP service name/host/port/protocol and displays validation/status.
- `mcode-desktop/src-tauri/src/app_state.rs`
  - Stores gateway config, upstream status, target metadata, current pair offer, local services, and diagnostic log entries.
- `mcode-desktop/src-tauri/src/commands.rs`
  - Exposes Tauri commands consumed by the frontend.
- `mcode-desktop/src-tauri/src/gateway/upstream.rs`
  - Builds gateway websocket URLs, connects outbound upstream, sends `desktop_hello` and `pair_offer`, and tracks status.
- `mcode-desktop/src-tauri/src/pairing.rs`
  - Generates pair codes/secrets and v2 QR JSON payloads consistent with `mcode-app`.
- `mcode-desktop/src-tauri/src/health.rs`
  - Produces health/version/capability snapshots.
- `mcode-desktop/src-tauri/src/tunnel/mod.rs`
  - Owns local service config validation and default HTTP service binding metadata.
- `mcode-desktop/src-tauri/tests/desktop_p3_runtime.rs`
  - Tests gateway URL construction, pair payload generation, health snapshot, and loopback service validation.
- `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`
  - Records P3 desktop behavior for native iOS/Android replication and future desktop implementation work.

### Task 1: Backend State, Health Snapshot, And Capability Contract

**Files:**
- Modify: `mcode-desktop/src-tauri/src/app_state.rs`
- Create: `mcode-desktop/src-tauri/src/health.rs`
- Modify: `mcode-desktop/src-tauri/src/lib.rs`
- Create: `mcode-desktop/src-tauri/tests/desktop_p3_runtime.rs`
- Modify: `mcode-desktop/src-tauri/Cargo.toml`

**Interfaces:**
- Consumes:
  - Existing `AppState`
  - Existing capability constants in `mcode-desktop/src-tauri/src/runtime/mod.rs`
- Produces:
  - `pub enum GatewayProvider { Official, Custom }`
  - `pub enum UpstreamStatus { Offline, Connecting, Online, Error }`
  - `pub struct GatewayConfig { provider: GatewayProvider, base_url: String }`
  - `pub struct DesktopHealthSnapshot`
  - `AppState.target_id` as the stable relay target identity for desktop registration
  - `pub fn desktop_version() -> &'static str`
  - `pub fn build_health_snapshot(state: &AppState) -> DesktopHealthSnapshot`
  - `impl AppState { pub fn new_for_test() -> Self }`

- [ ] **Step 1: Write failing Rust tests for P3 health and state defaults**

Add this to `mcode-desktop/src-tauri/tests/desktop_p3_runtime.rs`:

```rust
use mcode_desktop_lib::app_state::{AppState, UpstreamStatus};
use mcode_desktop_lib::health::build_health_snapshot;

#[test]
fn p3_health_snapshot_reports_desktop_identity_and_capabilities() {
    let state = AppState::new_for_test();
    let snapshot = build_health_snapshot(&state);

    assert_eq!(snapshot.target_agent, "mcode-desktop");
    assert!(snapshot.target_id.starts_with("desktop-"));
    assert_eq!(snapshot.display_name, "MCode Desktop");
    assert_eq!(snapshot.upstream_status, UpstreamStatus::Offline);
    assert!(snapshot.capabilities.contains(&"desktop.tunnel.available".to_string()));
    assert!(!snapshot.version.is_empty());
}
```

- [ ] **Step 2: Run the Rust test and verify it fails**

Run: `cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml p3_health_snapshot_reports_desktop_identity_and_capabilities`

Expected: FAIL with unresolved `health`, `UpstreamStatus`, or `new_for_test`.

- [ ] **Step 3: Add the target identity dependency**

Add to `mcode-desktop/src-tauri/Cargo.toml`:

```toml
uuid = { version = "1", features = ["v4"] }
```

- [ ] **Step 4: Implement state and health snapshot**

Replace `mcode-desktop/src-tauri/src/app_state.rs` content with:

```rust
use std::sync::RwLock;
use uuid::Uuid;

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GatewayProvider {
    Official,
    Custom,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum UpstreamStatus {
    Offline,
    Connecting,
    Online,
    Error,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GatewayConfig {
    pub provider: GatewayProvider,
    pub base_url: String,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
pub struct PairOffer {
    pub code: String,
    pub secret: String,
    pub qr_payload: String,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticEntry {
    pub level: String,
    pub message: String,
    pub created_at_ms: u64,
}

pub struct AppState {
    pub target_id: RwLock<String>,
    pub relay_url: RwLock<Option<String>>,
    pub gateway_config: RwLock<Option<GatewayConfig>>,
    pub upstream_status: RwLock<UpstreamStatus>,
    pub upstream_error: RwLock<Option<String>>,
    pub pair_offer: RwLock<Option<PairOffer>>,
    pub capabilities: RwLock<Vec<String>>,
    pub display_name: RwLock<String>,
    pub diagnostics: RwLock<Vec<DiagnosticEntry>>,
}

impl AppState {
    pub fn new_for_test() -> Self {
        Self::default()
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            target_id: RwLock::new(format!("desktop-{}", Uuid::new_v4())),
            relay_url: RwLock::new(None),
            gateway_config: RwLock::new(None),
            upstream_status: RwLock::new(UpstreamStatus::Offline),
            upstream_error: RwLock::new(None),
            pair_offer: RwLock::new(None),
            capabilities: RwLock::new(vec!["desktop.tunnel.available".to_string()]),
            display_name: RwLock::new("MCode Desktop".to_string()),
            diagnostics: RwLock::new(Vec::new()),
        }
    }
}
```

Create `mcode-desktop/src-tauri/src/health.rs`:

```rust
use crate::app_state::{AppState, UpstreamStatus};

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopHealthSnapshot {
    pub target_agent: String,
    pub target_id: String,
    pub display_name: String,
    pub version: String,
    pub upstream_status: UpstreamStatus,
    pub upstream_error: Option<String>,
    pub capabilities: Vec<String>,
}

pub fn desktop_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

pub fn build_health_snapshot(state: &AppState) -> DesktopHealthSnapshot {
    DesktopHealthSnapshot {
        target_agent: "mcode-desktop".to_string(),
        target_id: state
            .target_id
            .read()
            .map(|value| value.clone())
            .unwrap_or_else(|_| "desktop-unknown".to_string()),
        display_name: state
            .display_name
            .read()
            .map(|value| value.clone())
            .unwrap_or_else(|_| "MCode Desktop".to_string()),
        version: desktop_version().to_string(),
        upstream_status: state
            .upstream_status
            .read()
            .map(|value| value.clone())
            .unwrap_or(UpstreamStatus::Error),
        upstream_error: state.upstream_error.read().ok().and_then(|value| value.clone()),
        capabilities: state
            .capabilities
            .read()
            .map(|value| value.clone())
            .unwrap_or_default(),
    }
}
```

Update `mcode-desktop/src-tauri/src/lib.rs` module list:

```rust
pub mod app_state;
pub mod bridge;
pub mod commands;
pub mod gateway;
pub mod health;
pub mod pairing;
pub mod runtime;
pub mod tray;
pub mod tunnel;
```

- [ ] **Step 5: Run the Rust test and verify it passes**

Run: `cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml p3_health_snapshot_reports_desktop_identity_and_capabilities`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add mcode-desktop/src-tauri/src/app_state.rs \
  mcode-desktop/src-tauri/Cargo.toml \
  mcode-desktop/src-tauri/Cargo.lock \
  mcode-desktop/src-tauri/src/health.rs \
  mcode-desktop/src-tauri/src/lib.rs \
  mcode-desktop/src-tauri/tests/desktop_p3_runtime.rs
git commit -m "feat(desktop): add p3 runtime health state"
```

### Task 2: Pair Offer Generation And Gateway QR Payloads

**Files:**
- Create: `mcode-desktop/src-tauri/src/pairing.rs`
- Modify: `mcode-desktop/src-tauri/src/app_state.rs`
- Modify: `mcode-desktop/src-tauri/src/lib.rs`
- Modify: `mcode-desktop/src-tauri/tests/desktop_p3_runtime.rs`
- Modify: `mcode-desktop/src/lib/pairing.ts`
- Modify: `mcode-desktop/src/lib/pairing.spec.ts`

**Interfaces:**
- Consumes:
  - `GatewayProvider`
  - Existing TypeScript `buildGatewayQrPayload()`
- Produces:
  - Rust `pub struct GatewayQrPayload`
  - Rust `pub fn build_gateway_qr_payload(input: GatewayQrPayloadInput) -> GatewayQrPayload`
  - Rust `pub fn generate_pair_offer(input: PairOfferRequest) -> PairOffer`
  - TypeScript QR payload includes optional `gatewayBaseUrl` for custom gateways.

- [ ] **Step 1: Write failing Rust and TypeScript tests**

Append to `mcode-desktop/src-tauri/tests/desktop_p3_runtime.rs`:

```rust
use mcode_desktop_lib::app_state::GatewayProvider;
use mcode_desktop_lib::pairing::{
    build_gateway_qr_payload, generate_pair_offer, GatewayQrPayloadInput, PairOfferRequest,
};

#[test]
fn p3_pair_payload_matches_mcode_v2_gateway_schema() {
    let payload = build_gateway_qr_payload(GatewayQrPayloadInput {
        name: "Workstation".to_string(),
        gateway_provider: GatewayProvider::Custom,
        gateway_base_url: Some("https://gateway.example.com".to_string()),
        pair_code: "ABCD-1234".to_string(),
        pair_secret: "secret".to_string(),
    });

    assert_eq!(payload.version, 2);
    assert_eq!(payload.target_agent, "mcode-desktop");
    assert_eq!(payload.route_mode, "gateway");
    assert_eq!(payload.gateway_provider, GatewayProvider::Custom);
    assert_eq!(payload.gateway_base_url.as_deref(), Some("https://gateway.example.com"));
}

#[test]
fn p3_generate_pair_offer_returns_code_secret_and_json_payload() {
    let offer = generate_pair_offer(PairOfferRequest {
        name: "Workstation".to_string(),
        gateway_provider: GatewayProvider::Official,
        gateway_base_url: None,
    });

    assert!(offer.code.contains('-'));
    assert_eq!(offer.code.len(), 9);
    assert_eq!(offer.code.chars().nth(4), Some('-'));
    assert!(offer.secret.len() >= 32);
    assert!(offer.qr_payload.contains("\"targetAgent\":\"mcode-desktop\""));
}
```

Add to `mcode-desktop/src/lib/pairing.spec.ts`:

```ts
it("includes custom gateway base url in v2 desktop payloads", () => {
  expect(
    buildGatewayQrPayload({
      name: "Workstation",
      gatewayProvider: "custom",
      gatewayBaseUrl: "https://gateway.example.com/",
      pairCode: "WXYZ-6789",
      pairSecret: "secret",
    })
  ).toMatchObject({
    version: 2,
    targetAgent: "mcode-desktop",
    routeMode: "gateway",
    gatewayProvider: "custom",
    gatewayBaseUrl: "https://gateway.example.com",
  })
})
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml p3_pair_payload_matches_mcode_v2_gateway_schema`

Expected: FAIL with unresolved `pairing`.

Run: `cd mcode-desktop && npm test -- src/lib/pairing.spec.ts`

Expected: FAIL until trailing slash normalization is added.

- [ ] **Step 3: Implement Rust pairing module and normalize TypeScript URL**

Create `mcode-desktop/src-tauri/src/pairing.rs`:

```rust
use crate::app_state::{GatewayProvider, PairOffer};
use uuid::Uuid;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GatewayQrPayloadInput {
    pub name: String,
    pub gateway_provider: GatewayProvider,
    pub gateway_base_url: Option<String>,
    pub pair_code: String,
    pub pair_secret: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PairOfferRequest {
    pub name: String,
    pub gateway_provider: GatewayProvider,
    pub gateway_base_url: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GatewayQrPayload {
    pub version: u8,
    pub name: String,
    pub target_agent: String,
    pub route_mode: String,
    pub gateway_provider: GatewayProvider,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gateway_base_url: Option<String>,
    pub pair_code: String,
    pub pair_secret: String,
}

pub fn build_gateway_qr_payload(input: GatewayQrPayloadInput) -> GatewayQrPayload {
    GatewayQrPayload {
        version: 2,
        name: normalize_name(&input.name),
        target_agent: "mcode-desktop".to_string(),
        route_mode: "gateway".to_string(),
        gateway_provider: input.gateway_provider,
        gateway_base_url: input.gateway_base_url.map(|value| trim_url(&value)).filter(|value| !value.is_empty()),
        pair_code: input.pair_code,
        pair_secret: input.pair_secret,
    }
}

pub fn generate_pair_offer(input: PairOfferRequest) -> PairOffer {
    let code = generate_pair_code();
    let secret = generate_pair_secret();
    let payload = build_gateway_qr_payload(GatewayQrPayloadInput {
        name: input.name,
        gateway_provider: input.gateway_provider,
        gateway_base_url: input.gateway_base_url,
        pair_code: code.clone(),
        pair_secret: secret.clone(),
    });
    PairOffer {
        code,
        secret,
        qr_payload: serde_json::to_string(&payload).expect("gateway QR payload serializes"),
    }
}

fn generate_pair_code() -> String {
    let raw = Uuid::new_v4().simple().to_string().to_uppercase();
    format!("{}-{}", &raw[0..4], &raw[4..8])
}

fn generate_pair_secret() -> String {
    Uuid::new_v4().simple().to_string()
}

fn normalize_name(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        "MCode Desktop".to_string()
    } else {
        trimmed.to_string()
    }
}

fn trim_url(value: &str) -> String {
    value.trim().trim_end_matches('/').to_string()
}
```

Update TypeScript `buildGatewayQrPayload()` URL normalization:

```ts
const gatewayBaseUrl = input.gatewayBaseUrl?.trim().replace(/\/+$/, "")
```

- [ ] **Step 4: Run tests and verify they pass**

Run: `cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml p3_pair`

Expected: PASS for the two P3 pairing tests.

Run: `cd mcode-desktop && npm test -- src/lib/pairing.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mcode-desktop/src-tauri/src/pairing.rs \
  mcode-desktop/src-tauri/src/lib.rs \
  mcode-desktop/src-tauri/tests/desktop_p3_runtime.rs \
  mcode-desktop/src/lib/pairing.ts \
  mcode-desktop/src/lib/pairing.spec.ts
git commit -m "feat(desktop): add p3 pair offer payloads"
```

### Task 3: Gateway Upstream URL, Registration Frames, And Status Lifecycle

**Files:**
- Modify: `mcode-desktop/src-tauri/Cargo.toml`
- Modify: `mcode-desktop/src-tauri/src/gateway/upstream.rs`
- Modify: `mcode-desktop/src-tauri/src/app_state.rs`
- Modify: `mcode-desktop/src-tauri/tests/desktop_p3_runtime.rs`

**Interfaces:**
- Consumes:
  - `AppState`
  - `DesktopUpstreamHello`
  - `PairOffer`
- Produces:
  - `pub fn build_upstream_ws_url(base_url: &str) -> Result<String>`
  - `pub fn build_pair_offer_frame(target_id: &str, display_name: &str, offer: &PairOffer, capabilities: Vec<String>) -> serde_json::Value`
  - `pub async fn connect_upstream(state: Arc<AppState>) -> Result<()>`
  - `pub async fn mark_upstream_connecting(state: &AppState, config: GatewayConfig)`
  - `pub async fn mark_upstream_online(state: &AppState)`
  - `pub async fn mark_upstream_error(state: &AppState, message: impl Into<String>)`

- [ ] **Step 1: Write failing upstream URL, frame, and outbound connection tests**

Append to `mcode-desktop/src-tauri/tests/desktop_p3_runtime.rs`:

```rust
use std::sync::{Arc, Mutex};

use futures_util::StreamExt;
use mcode_desktop_lib::app_state::{AppState, GatewayConfig, GatewayProvider, PairOffer};
use mcode_desktop_lib::gateway::upstream::{
    build_pair_offer_frame, build_upstream_ws_url, connect_upstream,
};
use tokio::net::TcpListener;
use tokio_tungstenite::accept_async;

#[test]
fn p3_builds_gateway_upstream_websocket_url() {
    assert_eq!(
        build_upstream_ws_url("https://relay.example.com").unwrap(),
        "wss://relay.example.com/v1/tunnel/desktop"
    );
    assert_eq!(
        build_upstream_ws_url("http://127.0.0.1:8787/").unwrap(),
        "ws://127.0.0.1:8787/v1/tunnel/desktop"
    );
}

#[test]
fn p3_builds_pair_offer_frame_for_relay_registration() {
    let frame = build_pair_offer_frame(
        "desktop-1",
        "Workstation",
        &PairOffer {
            code: "ABCD-1234".to_string(),
            secret: "secret".to_string(),
            qr_payload: "{}".to_string(),
        },
        vec!["desktop.tunnel.available".to_string()],
    );

    assert_eq!(frame["type"], "pair_offer");
    assert_eq!(frame["targetAgent"], "mcode-desktop");
    assert_eq!(frame["targetName"], "Workstation");
    assert_eq!(frame["capabilities"][0], "desktop.tunnel.available");
}

#[tokio::test]
async fn p3_connects_to_gateway_and_sends_registration_frames() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let received = Arc::new(Mutex::new(Vec::<String>::new()));
    let received_for_server = Arc::clone(&received);

    let server = tokio::spawn(async move {
        let (stream, _) = listener.accept().await.unwrap();
        let mut socket = accept_async(stream).await.unwrap();
        while let Some(Ok(message)) = socket.next().await {
            if message.is_text() {
                received_for_server
                    .lock()
                    .unwrap()
                    .push(message.to_text().unwrap().to_string());
            }
            if received_for_server.lock().unwrap().len() >= 2 {
                break;
            }
        }
    });

    let state = Arc::new(AppState::new_for_test());
    *state.relay_url.write().unwrap() = Some(format!("http://{addr}"));
    *state.gateway_config.write().unwrap() = Some(GatewayConfig {
        provider: GatewayProvider::Official,
        base_url: format!("http://{addr}"),
    });
    *state.pair_offer.write().unwrap() = Some(PairOffer {
        code: "PAIR-1234".to_string(),
        secret: "secret".to_string(),
        qr_payload: "{}".to_string(),
    });

    connect_upstream(Arc::clone(&state)).await.unwrap();
    server.await.unwrap();

    let frames = received.lock().unwrap();
    assert!(frames.iter().any(|frame| frame.contains("\"type\":\"desktop_hello\"")));
    assert!(frames.iter().any(|frame| frame.contains("\"type\":\"pair_offer\"")));
}
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml p3_builds_gateway_upstream`

Expected: FAIL with unresolved functions.

- [ ] **Step 3: Implement upstream URL and frame helpers**

Add dependencies in `mcode-desktop/src-tauri/Cargo.toml`:

```toml
futures-util = "0.3"
tokio = { version = "1", features = ["macros", "rt-multi-thread", "sync", "time"] }
tokio-tungstenite = { version = "0.26", features = ["native-tls"] }
url = "2"
```

Add to `mcode-desktop/src-tauri/src/gateway/upstream.rs`:

```rust
use std::sync::Arc;

use anyhow::{anyhow, Result};
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use url::Url;

use crate::app_state::{AppState, GatewayConfig, PairOffer, UpstreamStatus};

pub fn build_upstream_ws_url(base_url: &str) -> Result<String> {
    let mut url = Url::parse(base_url.trim())?;
    let scheme = match url.scheme() {
        "https" => "wss",
        "http" => "ws",
        other => return Err(anyhow!("unsupported gateway scheme: {other}")),
    };
    url.set_scheme(scheme).map_err(|_| anyhow!("invalid gateway scheme"))?;
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
            provider: crate::app_state::GatewayProvider::Custom,
            base_url: relay_url.clone(),
        });
    mark_upstream_connecting(&state, config).await;

    let ws_url = build_upstream_ws_url(&relay_url)?;
    let (socket, _) = connect_async(ws_url).await?;
    let (mut writer, mut reader) = socket.split();

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
    let capabilities = state
        .capabilities
        .read()
        .map(|value| value.clone())
        .unwrap_or_default();

    let hello = DesktopUpstreamHello::new(target_id.clone(), display_name.clone(), capabilities.clone());
    writer
        .send(Message::Text(serde_json::to_string(&hello)?))
        .await?;

    let pair_offer = state.pair_offer.read().ok().and_then(|value| value.clone());
    if let Some(offer) = pair_offer {
        let frame = build_pair_offer_frame(&target_id, &display_name, &offer, capabilities);
        writer.send(Message::Text(frame.to_string())).await?;
    }

    mark_upstream_online(&state).await;

    while let Some(message) = reader.next().await {
        let message = message?;
        if message.is_text() {
            let frame = parse_upstream_frame(message.to_text()?)?;
            handle_upstream_frame(&state, frame).await?;
        }
    }

    Ok(())
}

pub async fn mark_upstream_connecting(state: &AppState, config: GatewayConfig) {
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
```

- [ ] **Step 4: Run tests and verify they pass**

Run: `cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml p3_builds`

Expected: PASS for upstream URL and pair offer frame tests.

- [ ] **Step 5: Commit**

```bash
git add mcode-desktop/src-tauri/Cargo.toml \
  mcode-desktop/src-tauri/Cargo.lock \
  mcode-desktop/src-tauri/src/gateway/upstream.rs \
  mcode-desktop/src-tauri/tests/desktop_p3_runtime.rs
git commit -m "feat(desktop): add p3 gateway upstream frames"
```

### Task 4: Local HTTP Service Configuration

**Files:**
- Modify: `mcode-desktop/src-tauri/src/app_state.rs`
- Modify: `mcode-desktop/src-tauri/src/tunnel/mod.rs`
- Modify: `mcode-desktop/src-tauri/tests/desktop_p3_runtime.rs`
- Create: `mcode-desktop/src/lib/localServices.ts`
- Create: `mcode-desktop/src/lib/localServices.spec.ts`

**Interfaces:**
- Consumes:
  - Existing `TunnelBinding`
- Produces:
  - Rust `pub enum LocalServiceProtocol { Http }`
  - Rust `pub struct LocalServiceConfig`
  - Rust `pub fn validate_local_service_config(config: LocalServiceConfig) -> Result<LocalServiceConfig>`
  - Rust `pub fn default_code_service() -> LocalServiceConfig`
  - TypeScript `buildLocalServiceConfig(input): LocalServiceConfig`

- [ ] **Step 1: Write failing Rust and TypeScript tests**

Append to `mcode-desktop/src-tauri/tests/desktop_p3_runtime.rs`:

```rust
use mcode_desktop_lib::tunnel::{
    default_code_service, validate_local_service_config, LocalServiceConfig, LocalServiceProtocol,
};

#[test]
fn p3_accepts_loopback_http_service_on_1080() {
    let service = default_code_service();
    assert_eq!(service.name, "Code");
    assert_eq!(service.host, "127.0.0.1");
    assert_eq!(service.port, 1080);
    assert_eq!(service.protocol, LocalServiceProtocol::Http);
    assert!(validate_local_service_config(service).is_ok());
}

#[test]
fn p3_rejects_non_loopback_service_hosts() {
    let result = validate_local_service_config(LocalServiceConfig {
        name: "Unsafe".to_string(),
        host: "0.0.0.0".to_string(),
        port: 1080,
        protocol: LocalServiceProtocol::Http,
        enabled: true,
    });
    assert!(result.unwrap_err().to_string().contains("loopback"));
}
```

Create `mcode-desktop/src/lib/localServices.spec.ts`:

```ts
import { buildLocalServiceConfig } from "./localServices"

it("builds the default loopback code service", () => {
  expect(buildLocalServiceConfig({ name: "Code", host: "127.0.0.1", port: 1080 })).toEqual({
    name: "Code",
    host: "127.0.0.1",
    port: 1080,
    protocol: "http",
    enabled: true,
  })
})

it("rejects non-loopback hosts in P3", () => {
  expect(() => buildLocalServiceConfig({ name: "Unsafe", host: "0.0.0.0", port: 1080 })).toThrow(
    "P3 only allows 127.0.0.1"
  )
})
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml p3_accepts_loopback_http_service_on_1080`

Expected: FAIL with unresolved service config types.

Run: `cd mcode-desktop && npm test -- src/lib/localServices.spec.ts`

Expected: FAIL with missing `localServices`.

- [ ] **Step 3: Implement local service validation**

Add to `mcode-desktop/src-tauri/src/tunnel/mod.rs`:

```rust
use anyhow::{anyhow, Result};

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LocalServiceProtocol {
    Http,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalServiceConfig {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub protocol: LocalServiceProtocol,
    pub enabled: bool,
}

pub fn default_code_service() -> LocalServiceConfig {
    LocalServiceConfig {
        name: "Code".to_string(),
        host: "127.0.0.1".to_string(),
        port: 1080,
        protocol: LocalServiceProtocol::Http,
        enabled: true,
    }
}

pub fn validate_local_service_config(config: LocalServiceConfig) -> Result<LocalServiceConfig> {
    if config.name.trim().is_empty() {
        return Err(anyhow!("service name is required"));
    }
    if config.host != "127.0.0.1" {
        return Err(anyhow!("P3 only allows loopback host 127.0.0.1"));
    }
    if config.port == 0 {
        return Err(anyhow!("service port is required"));
    }
    Ok(LocalServiceConfig {
        name: config.name.trim().to_string(),
        host: config.host,
        port: config.port,
        protocol: config.protocol,
        enabled: config.enabled,
    })
}
```

Create `mcode-desktop/src/lib/localServices.ts`:

```ts
export interface LocalServiceConfig {
  name: string
  host: string
  port: number
  protocol: "http"
  enabled: boolean
}

export function buildLocalServiceConfig(input: {
  name: string
  host: string
  port: number
  protocol?: "http"
  enabled?: boolean
}): LocalServiceConfig {
  const name = input.name.trim()
  const host = input.host.trim()
  const port = Math.trunc(Number(input.port))

  if (!name) throw new Error("服务名称不能为空")
  if (host !== "127.0.0.1") throw new Error("P3 only allows 127.0.0.1")
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error("端口无效")

  return {
    name,
    host,
    port,
    protocol: input.protocol || "http",
    enabled: input.enabled ?? true,
  }
}
```

- [ ] **Step 4: Run tests and verify they pass**

Run: `cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml p3_accepts_loopback p3_rejects_non_loopback`

Expected: PASS.

Run: `cd mcode-desktop && npm test -- src/lib/localServices.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mcode-desktop/src-tauri/src/tunnel/mod.rs \
  mcode-desktop/src-tauri/tests/desktop_p3_runtime.rs \
  mcode-desktop/src/lib/localServices.ts \
  mcode-desktop/src/lib/localServices.spec.ts
git commit -m "feat(desktop): add p3 local service configuration"
```

### Task 5: Tauri Commands And Frontend Runtime Integration

**Files:**
- Create: `mcode-desktop/src-tauri/src/commands.rs`
- Modify: `mcode-desktop/src-tauri/src/lib.rs`
- Modify: `mcode-desktop/src/lib/runtimeApi.ts`
- Modify: `mcode-desktop/src/stores/desktopRuntime.ts`
- Modify: `mcode-desktop/src/pages/ConnectionsPage.vue`
- Modify: `mcode-desktop/src/pages/TunnelPage.vue`
- Modify: `mcode-desktop/src/lib/pairing.spec.ts`
- Modify: `mcode-desktop/src/lib/localServices.spec.ts`

**Interfaces:**
- Consumes:
  - `build_health_snapshot`
  - `generate_pair_offer`
  - `validate_local_service_config`
- Produces Tauri commands:
  - `desktop_get_health() -> DesktopHealthSnapshot`
  - `desktop_configure_gateway(provider, base_url) -> DesktopHealthSnapshot`
  - `desktop_connect_gateway() -> DesktopHealthSnapshot`
  - `desktop_generate_pair_offer(name, provider, base_url) -> PairOffer`
  - `desktop_save_local_service(config) -> LocalServiceConfig`
- Produces frontend API:
  - `getDesktopHealth()`
  - `configureGateway(input)`
  - `connectGatewayUpstream()`
  - `generateDesktopPairOffer(input)`
  - `saveLocalService(config)`

- [ ] **Step 1: Write failing frontend API tests with mocked Tauri invoke**

Create `mcode-desktop/src/lib/runtimeApi.spec.ts`:

```ts
import { beforeEach, expect, it, vi } from "vitest"
import {
  connectGatewayUpstream,
  configureGateway,
  generateDesktopPairOffer,
  getDesktopHealth,
  saveLocalService,
} from "./runtimeApi"

const invokeMock = vi.fn()

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, payload?: unknown) => invokeMock(command, payload),
}))

beforeEach(() => {
  invokeMock.mockReset()
})

it("loads desktop health through the tauri command boundary", async () => {
  invokeMock.mockResolvedValue({ targetAgent: "mcode-desktop", upstreamStatus: "offline" })
  await expect(getDesktopHealth()).resolves.toMatchObject({ targetAgent: "mcode-desktop" })
  expect(invokeMock).toHaveBeenCalledWith("desktop_get_health")
})

it("configures custom gateway through tauri", async () => {
  invokeMock.mockResolvedValue({ upstreamStatus: "connecting" })
  await configureGateway({ provider: "custom", baseUrl: "https://gateway.example.com" })
  expect(invokeMock).toHaveBeenCalledWith("desktop_configure_gateway", {
    provider: "custom",
    baseUrl: "https://gateway.example.com",
  })
})

it("starts gateway upstream through tauri", async () => {
  invokeMock.mockResolvedValue({ upstreamStatus: "connecting" })
  await expect(connectGatewayUpstream()).resolves.toMatchObject({ upstreamStatus: "connecting" })
  expect(invokeMock).toHaveBeenCalledWith("desktop_connect_gateway")
})

it("generates pair offers through tauri", async () => {
  invokeMock.mockResolvedValue({ code: "ABCD-1234", secret: "secret", qrPayload: "{}" })
  await expect(generateDesktopPairOffer({ name: "Workstation", provider: "official" })).resolves.toMatchObject({
    code: "ABCD-1234",
  })
})

it("saves local service config through tauri", async () => {
  invokeMock.mockResolvedValue({ name: "Code", host: "127.0.0.1", port: 1080, protocol: "http", enabled: true })
  await saveLocalService({ name: "Code", host: "127.0.0.1", port: 1080, protocol: "http", enabled: true })
  expect(invokeMock).toHaveBeenCalledWith("desktop_save_local_service", {
    config: { name: "Code", host: "127.0.0.1", port: 1080, protocol: "http", enabled: true },
  })
})
```

- [ ] **Step 2: Run frontend API test and verify it fails**

Run: `cd mcode-desktop && npm test -- src/lib/runtimeApi.spec.ts`

Expected: FAIL with missing `runtimeApi`.

- [ ] **Step 3: Implement command module and runtime API**

Create `mcode-desktop/src-tauri/src/commands.rs`:

```rust
use std::sync::Arc;

use tauri::{AppHandle, Emitter, State};

use crate::app_state::{AppState, GatewayConfig, GatewayProvider, PairOffer};
use crate::health::{build_health_snapshot, DesktopHealthSnapshot};
use crate::gateway::upstream::connect_upstream;
use crate::pairing::{generate_pair_offer, PairOfferRequest};
use crate::tunnel::{validate_local_service_config, LocalServiceConfig};

#[tauri::command]
pub fn desktop_get_health(state: State<'_, Arc<AppState>>) -> DesktopHealthSnapshot {
    build_health_snapshot(state.inner().as_ref())
}

#[tauri::command]
pub fn desktop_configure_gateway(
    state: State<'_, Arc<AppState>>,
    provider: GatewayProvider,
    base_url: String,
) -> Result<DesktopHealthSnapshot, String> {
    let config = GatewayConfig { provider, base_url };
    if let Ok(mut gateway_config) = state.inner().gateway_config.write() {
        *gateway_config = Some(config.clone());
    }
    if let Ok(mut relay_url) = state.inner().relay_url.write() {
        *relay_url = Some(config.base_url);
    }
    Ok(build_health_snapshot(state.inner().as_ref()))
}

#[tauri::command]
pub async fn desktop_connect_gateway(
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
) -> Result<DesktopHealthSnapshot, String> {
    let state = Arc::clone(state.inner());
    let runner = Arc::clone(&state);
    tauri::async_runtime::spawn(async move {
        if let Err(error) = connect_upstream(runner).await {
            let _ = crate::gateway::upstream::mark_upstream_error(&state, error.to_string()).await;
            app.emit("desktop-upstream-error", error.to_string()).ok();
        }
    });
    Ok(build_health_snapshot(state.as_ref()))
}

#[tauri::command]
pub fn desktop_generate_pair_offer(
    state: State<'_, Arc<AppState>>,
    name: String,
    provider: GatewayProvider,
    base_url: Option<String>,
) -> Result<PairOffer, String> {
    let offer = generate_pair_offer(PairOfferRequest {
        name,
        gateway_provider: provider,
        gateway_base_url: base_url,
    });
    if let Ok(mut pair_offer) = state.inner().pair_offer.write() {
        *pair_offer = Some(offer.clone());
    }
    Ok(offer)
}

#[tauri::command]
pub fn desktop_save_local_service(config: LocalServiceConfig) -> Result<LocalServiceConfig, String> {
    validate_local_service_config(config).map_err(|error| error.to_string())
}
```

Register commands in `mcode-desktop/src-tauri/src/lib.rs`:

```rust
.manage(std::sync::Arc::new(AppState::default()))
.invoke_handler(tauri::generate_handler![
    show_window,
    hide_window,
    shutdown_runtime,
    commands::desktop_get_health,
    commands::desktop_configure_gateway,
    commands::desktop_connect_gateway,
    commands::desktop_generate_pair_offer,
    commands::desktop_save_local_service
])
```

Create `mcode-desktop/src/lib/runtimeApi.ts`:

```ts
import { invoke } from "@tauri-apps/api/core"
import type { LocalServiceConfig } from "./localServices"

export type GatewayProvider = "official" | "custom"

export interface DesktopHealthSnapshot {
  targetAgent: "mcode-desktop"
  displayName: string
  version: string
  upstreamStatus: "offline" | "connecting" | "online" | "error"
  upstreamError?: string | null
  capabilities: string[]
}

export interface PairOffer {
  code: string
  secret: string
  qrPayload: string
}

export function getDesktopHealth() {
  return invoke<DesktopHealthSnapshot>("desktop_get_health")
}

export function configureGateway(input: { provider: GatewayProvider; baseUrl: string }) {
  return invoke<DesktopHealthSnapshot>("desktop_configure_gateway", {
    provider: input.provider,
    baseUrl: input.baseUrl,
  })
}

export function connectGatewayUpstream() {
  return invoke<DesktopHealthSnapshot>("desktop_connect_gateway")
}

export function generateDesktopPairOffer(input: {
  name: string
  provider: GatewayProvider
  baseUrl?: string
}) {
  return invoke<PairOffer>("desktop_generate_pair_offer", {
    name: input.name,
    provider: input.provider,
    baseUrl: input.baseUrl,
  })
}

export function saveLocalService(config: LocalServiceConfig) {
  return invoke<LocalServiceConfig>("desktop_save_local_service", { config })
}
```

- [ ] **Step 4: Wire store and pages to runtime API**

Update `mcode-desktop/src/stores/desktopRuntime.ts` to add actions:

```ts
import { defineStore } from "pinia"
import {
  configureGateway,
  connectGatewayUpstream,
  generateDesktopPairOffer,
  getDesktopHealth,
  saveLocalService,
  type DesktopHealthSnapshot,
  type GatewayProvider,
  type PairOffer,
} from "../lib/runtimeApi"
import type { LocalServiceConfig } from "../lib/localServices"

export const useDesktopRuntimeStore = defineStore("desktopRuntime", {
  state: () => ({
    relayStatus: "offline" as DesktopHealthSnapshot["upstreamStatus"],
    activeTargetAgent: "mcode-desktop" as const,
    displayName: "MCode Desktop",
    gatewayProvider: "official" as GatewayProvider,
    gatewayBaseUrl: "",
    capabilities: ["desktop.tunnel.available"] as string[],
    pairCode: "",
    pairSecret: "",
    qrPayload: "",
    tunnelBind: "127.0.0.1:1080",
    localService: null as LocalServiceConfig | null,
  }),
  actions: {
    async refreshHealth() {
      const health = await getDesktopHealth()
      this.relayStatus = health.upstreamStatus
      this.displayName = health.displayName
      this.capabilities = health.capabilities
    },
    async connectGateway() {
      await configureGateway({
        provider: this.gatewayProvider,
        baseUrl: this.gatewayBaseUrl,
      })
      const health = await connectGatewayUpstream()
      this.relayStatus = health.upstreamStatus
    },
    async createPairOffer() {
      const offer: PairOffer = await generateDesktopPairOffer({
        name: this.displayName,
        provider: this.gatewayProvider,
        baseUrl: this.gatewayBaseUrl || undefined,
      })
      this.pairCode = offer.code
      this.pairSecret = offer.secret
      this.qrPayload = offer.qrPayload
    },
    async saveService(config: LocalServiceConfig) {
      this.localService = await saveLocalService(config)
      this.tunnelBind = `${this.localService.host}:${this.localService.port}`
    },
  },
})
```

Update pages to call these actions from buttons and show `runtime.qrPayload` instead of hard-coded fallback data.

- [ ] **Step 5: Run frontend and Rust verification**

Run: `cd mcode-desktop && npm test -- src/lib/runtimeApi.spec.ts src/lib/pairing.spec.ts src/lib/localServices.spec.ts`

Expected: PASS.

Run: `cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add mcode-desktop/src-tauri/src/commands.rs \
  mcode-desktop/src-tauri/src/lib.rs \
  mcode-desktop/src/lib/runtimeApi.ts \
  mcode-desktop/src/lib/runtimeApi.spec.ts \
  mcode-desktop/src/stores/desktopRuntime.ts \
  mcode-desktop/src/pages/ConnectionsPage.vue \
  mcode-desktop/src/pages/TunnelPage.vue
git commit -m "feat(desktop): wire p3 runtime commands"
```

### Task 6: P3 Documentation And Full Verification

**Files:**
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`
- Modify: `mcode-desktop/README.md`

**Interfaces:**
- Consumes:
  - P3 commands and state from Tasks 1-5
- Produces:
  - P3 desktop architecture note
  - P3 desktop runbook

- [ ] **Step 1: Add desktop README**

Create `mcode-desktop/README.md`:

```md
# mcode-desktop

Tauri desktop host for MCode P3.

## P3 Scope

- Connect to official or custom MCode gateway configuration.
- Generate MCode v2 gateway QR payloads for `targetAgent = "mcode-desktop"`.
- Report desktop health, version, and capabilities.
- Configure loopback-only HTTP services such as `127.0.0.1:1080`.

## Not In P3

- Streaming TCP/HTTP tunnel transport.
- Claude official CLI adapter.
- Codex official CLI adapter.
- Enterprise gateway operations features.

## Commands

- `npm run dev`
- `npm run build`
- `npm test`
- `cargo test --manifest-path src-tauri/Cargo.toml`
```

- [ ] **Step 2: Update architecture note**

Append to `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`:

```md
## P3 Desktop Basic Behavior

- `mcode-desktop` can store gateway provider/base URL, generate `version: 2` desktop gateway pair offers, and expose health/version/capability snapshots through Tauri commands.
- P3 local service exposure is configuration-only and loopback-only. `127.0.0.1:1080` is valid; `0.0.0.0` is rejected until a later phase adds explicit unsafe exposure confirmation.
- P3 does not implement stream/tcp tunnel transport. P4 owns relay-to-desktop-to-local streaming.
- P3 does not implement Claude or Codex official CLI adapters. P5 owns official CLI process lifecycle and event normalization.
```

- [ ] **Step 3: Run full P3 verification**

Run: `cd mcode-desktop && npm test`

Expected: PASS for all desktop Vitest files.

Run: `cd mcode-desktop && npm run build`

Expected: PASS.

Run: `cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml`

Expected: PASS.

Run: `git status --short`

Expected: only P3 documentation changes before commit.

- [ ] **Step 4: Commit**

```bash
git add mcode-desktop/README.md \
  docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md
git commit -m "docs(desktop): document p3 desktop basics"
```

## Self-Review

- Spec coverage: This plan covers P3 desktop tray/UI host basics already scaffolded, gateway configuration, outbound gateway registration frame construction, pair QR generation, health/version/capabilities, and loopback HTTP service configuration. P4 stream/tcp tunnel transport and P5 official CLI adapters are explicitly excluded and named as later phases.
- Placeholder scan: No `TBD`, `TODO`, or open-ended implementation steps are present. Each task has concrete files, interfaces, test snippets, commands, and commits.
- Type consistency: The plan uses `targetAgent` consistently. `GatewayProvider`, `UpstreamStatus`, `PairOffer`, `DesktopHealthSnapshot`, and `LocalServiceConfig` are introduced before later tasks consume them.
