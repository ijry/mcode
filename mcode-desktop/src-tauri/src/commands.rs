use std::sync::Arc;

use tauri::{AppHandle, Emitter, State};

use crate::app_state::{AppState, GatewayConfig, GatewayProvider, PairOffer};
use crate::gateway::upstream::{
    connect_upstream_until_stopped, mark_upstream_connecting, mark_upstream_error,
};
use crate::health::{build_health_snapshot, DesktopHealthSnapshot};
use crate::pairing::{generate_pair_offer, PairOfferRequest};
use crate::runtime::refresh_cli_status_into_state;
use crate::tunnel::{validate_local_service_config, LocalServiceConfig};

#[tauri::command]
pub fn desktop_get_health(state: State<'_, Arc<AppState>>) -> DesktopHealthSnapshot {
    build_health_snapshot(state.inner().as_ref())
}

#[tauri::command]
pub async fn desktop_refresh_cli_status(
    state: State<'_, Arc<AppState>>,
) -> Result<DesktopHealthSnapshot, String> {
    refresh_cli_status_into_state(state.inner().as_ref()).await;
    Ok(build_health_snapshot(state.inner().as_ref()))
}

#[tauri::command]
pub fn desktop_configure_gateway(
    state: State<'_, Arc<AppState>>,
    provider: GatewayProvider,
    base_url: String,
) -> Result<DesktopHealthSnapshot, String> {
    let base_url = normalize_gateway_base_url(&base_url)?;
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
    ensure_pair_offer(state.inner().as_ref())?;

    let config = state
        .inner()
        .gateway_config
        .read()
        .map_err(|_| "gateway config lock poisoned".to_string())?
        .clone()
        .ok_or_else(|| "gateway is not configured".to_string())?;
    mark_upstream_connecting(state.inner().as_ref(), config).await;

    let state = Arc::clone(state.inner());
    let response_state = Arc::clone(&state);
    let runner = Arc::clone(&state);
    tauri::async_runtime::spawn(async move {
        if let Err(error) = connect_upstream_until_stopped(runner).await {
            let message = error.to_string();
            mark_upstream_error(state.as_ref(), message.clone()).await;
            app.emit("desktop-upstream-error", message).ok();
        }
    });

    Ok(build_health_snapshot(response_state.as_ref()))
}

#[tauri::command]
pub fn desktop_generate_pair_offer(
    state: State<'_, Arc<AppState>>,
    name: String,
    provider: GatewayProvider,
    base_url: Option<String>,
) -> Result<PairOffer, String> {
    let offer = generate_pair_offer(PairOfferRequest {
        name: normalized_display_name(&name),
        gateway_provider: provider,
        gateway_base_url: normalize_optional_gateway_base_url(base_url)?,
    });

    if let Ok(mut display_name) = state.inner().display_name.write() {
        *display_name = normalized_display_name(&name);
    }
    if let Ok(mut pair_offer) = state.inner().pair_offer.write() {
        *pair_offer = Some(offer.clone());
    }

    Ok(offer)
}

#[tauri::command]
pub fn desktop_save_local_service(
    state: State<'_, Arc<AppState>>,
    config: LocalServiceConfig,
) -> Result<LocalServiceConfig, String> {
    let config = validate_local_service_config(config).map_err(|error| error.to_string())?;
    if let Ok(mut services) = state.inner().local_services.write() {
        services.retain(|service| service.name != config.name);
        services.push(config.clone());
    }
    Ok(config)
}

fn ensure_pair_offer(state: &AppState) -> Result<(), String> {
    let has_pair_offer = state
        .pair_offer
        .read()
        .map_err(|_| "pair offer lock poisoned".to_string())?
        .is_some();
    if has_pair_offer {
        return Ok(());
    }

    let display_name = state
        .display_name
        .read()
        .map(|value| value.clone())
        .unwrap_or_else(|_| "MCode Desktop".to_string());
    let gateway_config = state
        .gateway_config
        .read()
        .map_err(|_| "gateway config lock poisoned".to_string())?
        .clone()
        .ok_or_else(|| "gateway is not configured".to_string())?;

    let offer = generate_pair_offer(PairOfferRequest {
        name: display_name,
        gateway_provider: gateway_config.provider.clone(),
        gateway_base_url: Some(gateway_config.base_url.clone()),
    });
    if let Ok(mut pair_offer) = state.pair_offer.write() {
        *pair_offer = Some(offer);
    }
    Ok(())
}

fn normalized_display_name(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        "MCode Desktop".to_string()
    } else {
        trimmed.to_string()
    }
}

fn normalize_optional_gateway_base_url(value: Option<String>) -> Result<Option<String>, String> {
    value
        .map(|base_url| normalize_gateway_base_url(&base_url))
        .transpose()
}

fn normalize_gateway_base_url(value: &str) -> Result<String, String> {
    let normalized = value.trim().trim_end_matches('/').to_string();
    if normalized.is_empty() {
        return Err("gateway base URL is required".to_string());
    }
    Ok(normalized)
}
