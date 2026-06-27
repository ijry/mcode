pub mod app_state;
pub mod bridge;
pub mod commands;
pub mod gateway;
pub mod health;
pub mod pairing;
pub mod recovery;
pub mod runtime;
pub mod tray;
pub mod tunnel;

use std::sync::Arc;

use app_state::AppState;
use tauri::{AppHandle, Manager};

#[tauri::command]
fn show_window(app: AppHandle) -> Result<(), String> {
    tray::show_main_window(&app)
}

#[tauri::command]
fn hide_window(app: AppHandle) -> Result<(), String> {
    tray::hide_main_window(&app)
}

#[tauri::command]
fn shutdown_runtime(app: AppHandle) {
    if let Some(state) = app.try_state::<Arc<AppState>>() {
        gateway::request_upstream_shutdown(state.inner().as_ref());
    }
    app.exit(0)
}

pub fn run() {
    tauri::Builder::default()
        .manage(Arc::new(load_initial_app_state()))
        .setup(|app| {
            tray::install_tray_icon(app.handle())?;
            Ok(())
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            tray::MENU_ID_SHOW_WINDOW => {
                let _ = tray::show_main_window(app);
            }
            tray::MENU_ID_HIDE_WINDOW => {
                let _ = tray::hide_main_window(app);
            }
            tray::MENU_ID_SHUTDOWN_RUNTIME => {
                if let Some(state) = app.try_state::<Arc<AppState>>() {
                    gateway::request_upstream_shutdown(state.inner().as_ref());
                }
                app.exit(0);
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            show_window,
            hide_window,
            shutdown_runtime,
            commands::desktop_get_health,
            commands::desktop_refresh_cli_status,
            commands::desktop_configure_gateway,
            commands::desktop_connect_gateway,
            commands::desktop_generate_pair_offer,
            commands::desktop_save_local_service
        ])
        .run(tauri::generate_context!())
        .expect("failed to run MCode Desktop")
}

fn load_initial_app_state() -> AppState {
    let state = AppState::default();
    let path = std::env::var("MCODE_DESKTOP_STATE_PATH")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    if let Some(path) = path {
        if let Ok(mut storage_path) = state.recovery_storage_path.write() {
            *storage_path = Some(path.clone());
        }
        match recovery::load_recovery_snapshot(&path) {
            Ok(Some(snapshot)) => {
                let _ = recovery::apply_recovery_snapshot(&state, snapshot);
                state.push_diagnostic("info", "recovery snapshot loaded");
            }
            Ok(None) => {}
            Err(error) => {
                state.push_diagnostic("error", format!("recovery snapshot load failed: {error}"));
            }
        }
    }
    state
}
