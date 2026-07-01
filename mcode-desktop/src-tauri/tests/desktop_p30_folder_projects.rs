use std::fs;

use mcode_desktop_lib::app_state::AppState;
use mcode_desktop_lib::recovery::{apply_recovery_snapshot, build_recovery_snapshot};
use mcode_desktop_lib::runtime::dispatch_desktop_proxy_with_state;
use serde_json::json;

fn temp_root(name: &str) -> std::path::PathBuf {
    let root = std::env::temp_dir().join(format!(
        "mcode-desktop-p30-{name}-{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    root
}

#[tokio::test]
async fn p30_lists_directory_entries_as_directories_only() {
    let root = temp_root("list");
    fs::create_dir_all(root.join("alpha")).unwrap();
    fs::create_dir_all(root.join("beta").join("child")).unwrap();
    fs::write(root.join("file.txt"), "ignored").unwrap();

    let state = AppState::new_for_test();
    let response = dispatch_desktop_proxy_with_state(
        &state,
        "list_directory_entries",
        json!({ "path": root }),
    )
    .await
    .unwrap();
    let entries = response.as_array().unwrap();

    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0]["name"], "alpha");
    assert_eq!(entries[0]["isDirectory"], true);
    assert_eq!(entries[0]["hasChildren"], false);
    assert_eq!(entries[1]["name"], "beta");
    assert_eq!(entries[1]["hasChildren"], true);

    fs::remove_dir_all(root).ok();
}

#[tokio::test]
async fn p30_opens_folders_with_stable_duplicate_ids() {
    let root = temp_root("open");
    let state = AppState::new_for_test();

    let first = dispatch_desktop_proxy_with_state(&state, "open_folder", json!({ "path": root }))
        .await
        .unwrap();
    let second = dispatch_desktop_proxy_with_state(&state, "open_folder", json!({ "path": root }))
        .await
        .unwrap();
    let list = dispatch_desktop_proxy_with_state(&state, "list_open_folder_details", json!({}))
        .await
        .unwrap();

    assert_eq!(first["id"], second["id"]);
    assert_eq!(list.as_array().unwrap().len(), 1);
    assert!(first["path"]
        .as_str()
        .unwrap()
        .contains("mcode-desktop-p30-open"));

    fs::remove_dir_all(root).ok();
}

#[tokio::test]
async fn p30_restores_open_folders_from_recovery_snapshot() {
    let root = temp_root("restore");
    let state = AppState::new_for_test();
    let opened =
        dispatch_desktop_proxy_with_state(&state, "open_folder", json!({ "path": root }))
            .await
            .unwrap();

    let snapshot = build_recovery_snapshot(&state).unwrap();
    let restored = AppState::new_for_test();
    apply_recovery_snapshot(&restored, snapshot).unwrap();
    let list =
        dispatch_desktop_proxy_with_state(&restored, "list_open_folder_details", json!({}))
            .await
            .unwrap();

    assert_eq!(list.as_array().unwrap().len(), 1);
    assert_eq!(list[0]["id"], opened["id"]);
    assert_eq!(list[0]["path"], opened["path"]);

    fs::remove_dir_all(root).ok();
}

#[tokio::test]
async fn p30_returns_empty_opened_tabs_for_app_overview_compatibility() {
    let state = AppState::new_for_test();
    let response = dispatch_desktop_proxy_with_state(&state, "list_opened_tabs", json!({}))
        .await
        .unwrap();

    assert_eq!(response["version"], 0);
    assert!(response["items"].as_array().unwrap().is_empty());
}

#[tokio::test]
async fn p30_returns_empty_conversation_history_for_desktop_projects() {
    let state = AppState::new_for_test();
    let response = dispatch_desktop_proxy_with_state(
        &state,
        "list_all_conversations",
        json!({ "folderIds": [1] }),
    )
    .await
    .unwrap();

    assert!(response.as_array().unwrap().is_empty());
}
