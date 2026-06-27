use tauri::menu::{Menu, MenuBuilder, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Runtime};

pub const MENU_ID_SHOW_WINDOW: &str = "show_window";
pub const MENU_ID_HIDE_WINDOW: &str = "hide_window";
pub const MENU_ID_SHUTDOWN_RUNTIME: &str = "shutdown_runtime";

const TRAY_ICON_ID: &str = "mcode-desktop-tray";

pub fn build_tray_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let show_item = MenuItem::with_id(
        app,
        MENU_ID_SHOW_WINDOW,
        "Show MCode Desktop",
        true,
        None::<&str>,
    )?;
    let hide_item = MenuItem::with_id(app, MENU_ID_HIDE_WINDOW, "Hide Window", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let shutdown_item = MenuItem::with_id(
        app,
        MENU_ID_SHUTDOWN_RUNTIME,
        "Stop Bridge",
        true,
        None::<&str>,
    )?;

    MenuBuilder::new(app)
        .items(&[&show_item, &hide_item, &separator, &shutdown_item])
        .build()
}

pub fn install_tray_icon<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let menu = build_tray_menu(app)?;
    let mut builder = TrayIconBuilder::with_id(TRAY_ICON_ID)
        .tooltip("MCode Desktop")
        .menu(&menu)
        .show_menu_on_left_click(false);

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let _ = show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

pub fn show_main_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub fn hide_main_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|error| error.to_string())?;
    }
    Ok(())
}
