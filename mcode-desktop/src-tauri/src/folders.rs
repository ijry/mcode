use std::path::{Path, PathBuf};

use anyhow::{anyhow, Result};
use serde::Serialize;
use serde_json::{json, Value};

use crate::app_state::{AppState, DesktopOpenFolder};
use crate::recovery::{now_ms, save_recovery_snapshot};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopDirectoryEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub has_children: bool,
}

pub async fn dispatch_folder_proxy(
    state: &AppState,
    command: &str,
    payload: Value,
) -> Result<Value> {
    match command {
        "get_home_directory" => Ok(json!(get_home_directory())),
        "list_directory_entries" => {
            let path = extract_path(&payload)?;
            Ok(json!(list_directory_entries(&path)?))
        }
        "open_folder" => {
            let path = extract_path(&payload)?;
            Ok(json!(open_folder(state, &path)?))
        }
        "list_open_folder_details" => Ok(json!(list_open_folder_details(state))),
        "list_opened_tabs" => Ok(json!({ "version": 0, "items": [] })),
        "list_all_conversations" => Ok(json!([])),
        _ => Err(anyhow!("unsupported desktop folder command: {command}")),
    }
}

fn extract_path(payload: &Value) -> Result<String> {
    payload
        .get("path")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .ok_or_else(|| anyhow!("path is required"))
}

fn get_home_directory() -> String {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| {
            std::env::current_dir()
                .ok()
                .map(|path| path.to_string_lossy().to_string())
        })
        .unwrap_or_else(|| ".".to_string())
}

fn canonical_directory(path: &str) -> Result<PathBuf> {
    let canonical = std::fs::canonicalize(path)
        .map_err(|error| anyhow!("directory is not readable: {error}"))?;
    if !canonical.is_dir() {
        return Err(anyhow!("path is not a directory"));
    }
    Ok(canonical)
}

fn folder_name(path: &Path) -> String {
    path.file_name()
        .and_then(|value| value.to_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .unwrap_or_else(|| path.to_string_lossy().to_string())
}

fn has_child_directory(path: &Path) -> bool {
    std::fs::read_dir(path)
        .ok()
        .into_iter()
        .flat_map(|entries| entries.filter_map(|entry_result| entry_result.ok()))
        .any(|entry| entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false))
}

fn list_directory_entries(path: &str) -> Result<Vec<DesktopDirectoryEntry>> {
    let root = canonical_directory(path)?;
    let mut entries = std::fs::read_dir(&root)
        .map_err(|error| anyhow!("directory is not readable: {error}"))?
        .filter_map(|entry_result| entry_result.ok())
        .filter_map(|entry| {
            let file_type = entry.file_type().ok()?;
            if !file_type.is_dir() {
                return None;
            }
            let path = entry.path();
            Some(DesktopDirectoryEntry {
                name: folder_name(&path),
                path: path.to_string_lossy().to_string(),
                is_directory: true,
                has_children: has_child_directory(&path),
            })
        })
        .collect::<Vec<_>>();
    entries.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    Ok(entries)
}

fn list_open_folder_details(state: &AppState) -> Vec<DesktopOpenFolder> {
    state
        .open_folders
        .read()
        .map(|folders| folders.clone())
        .unwrap_or_default()
}

fn open_folder(state: &AppState, path: &str) -> Result<DesktopOpenFolder> {
    let canonical = canonical_directory(path)?;
    let canonical_path = canonical.to_string_lossy().to_string();
    let now = now_ms();
    let folder = {
        let mut folders = state
            .open_folders
            .write()
            .map_err(|_| anyhow!("open folders lock poisoned"))?;
        if let Some(existing) = folders.iter_mut().find(|item| item.path == canonical_path) {
            existing.updated_at_ms = now;
            existing.clone()
        } else {
            let next_id = folders
                .iter()
                .map(|folder| folder.id)
                .max()
                .unwrap_or(0)
                .saturating_add(1);
            let folder = DesktopOpenFolder {
                id: next_id,
                name: folder_name(&canonical),
                path: canonical_path,
                opened_at_ms: now,
                updated_at_ms: now,
            };
            folders.push(folder.clone());
            folder
        }
    };
    save_recovery_snapshot(state)?;
    Ok(folder)
}
