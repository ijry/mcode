# MCode P45 Add Folder Project Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** P45 lets MCode App add folders as projects for both `codeg-main` and `mcode-desktop` connections through a host-backed directory browser.

**Architecture:** Reuse `codeg-main` command names in the App and add the missing runtime-agnostic proxy commands to `mcode-desktop`. Desktop stores opened folders in its existing recovery snapshot, while the App adds a reusable remote directory browser and refreshes only the affected connection group after `open_folder`.

**Tech Stack:** Vue 3 + uni-app + uview-plus + Pinia in `mcode-app`; Rust + Tauri 2 + Tokio in `mcode-desktop`; Jest for App unit tests; Cargo integration tests for desktop.

## Global Constraints

- Use existing `CodegGateway.call(command, payload)` for all App folder commands.
- Use only `--up-*` uview runtime theme variables for App styling; do not add new `--mcode-*` color/background/border/shadow aliases.
- The browser selects folders on the connected desktop or remote host, not the phone filesystem.
- `codeg-main` and `mcode-desktop` must expose the same App-side command names: `get_home_directory`, `list_directory_entries`, `open_folder`, `list_open_folder_details`.
- `mcode-desktop` must persist opened folders through the existing recovery snapshot.
- Existing desktop snapshots without `openFolders` must load as an empty folder list.
- `list_all_conversations` may remain empty for desktop folders in this feature.
- The implementation must include or update `docs/mcode-architecture-notes/`.
- Do not use xycloud for this feature.

---

## File Structure

- Create `mcode-desktop/src-tauri/src/folders.rs`: runtime-agnostic desktop folder registry commands, directory listing helpers, path normalization, tests use these through the runtime dispatcher.
- Modify `mcode-desktop/src-tauri/src/lib.rs`: export the new `folders` module.
- Modify `mcode-desktop/src-tauri/src/app_state.rs`: add `DesktopOpenFolder` type and `open_folders` state.
- Modify `mcode-desktop/src-tauri/src/recovery.rs`: serialize and restore `open_folders` with a default for old snapshots.
- Modify `mcode-desktop/src-tauri/src/runtime/mod.rs`: dispatch folder commands and `list_opened_tabs`.
- Create `mcode-desktop/src-tauri/tests/desktop_p30_folder_projects.rs`: Rust integration tests for folder commands and snapshot restore.
- Create `mcode-app/src/services/remoteDirectoryBrowser.ts`: pure App helper functions for directory-entry normalization, parent path resolution, and command wrappers.
- Create `mcode-app/tests/services/remoteDirectoryBrowser.spec.ts`: Jest tests for helper behavior.
- Create `mcode-app/src/components/remote/RemoteDirectoryBrowser.vue`: reusable uview popup for host-backed directory browsing.
- Modify `mcode-app/src/pages/conversations/index.vue`: add connection-group add-project entry, zero-project empty card, browser popup, and refresh flow.
- Modify `mcode-app/src/pages/projects/index.vue`: add project-page add action and reusable browser.
- Update `docs/mcode-architecture-notes/2026-07-01-p45-app-add-folder-project.md`: record final command support, including `list_opened_tabs` desktop compatibility.

---

### Task 1: Desktop Folder Project Protocol

**Files:**
- Create: `mcode-desktop/src-tauri/src/folders.rs`
- Create: `mcode-desktop/src-tauri/tests/desktop_p30_folder_projects.rs`
- Modify: `mcode-desktop/src-tauri/src/lib.rs`
- Modify: `mcode-desktop/src-tauri/src/app_state.rs`
- Modify: `mcode-desktop/src-tauri/src/recovery.rs`
- Modify: `mcode-desktop/src-tauri/src/runtime/mod.rs`

**Interfaces:**
- Consumes: `AppState`, `save_recovery_snapshot`, `now_ms`.
- Produces: `DesktopOpenFolder`, `dispatch_folder_proxy(state, command, payload) -> anyhow::Result<serde_json::Value>`, and dispatcher support for `get_home_directory`, `list_directory_entries`, `open_folder`, `list_open_folder_details`, `list_opened_tabs`, `list_all_conversations`.

- [ ] **Step 1: Write failing desktop integration tests**

Create `mcode-desktop/src-tauri/tests/desktop_p30_folder_projects.rs`:

```rust
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

    let first = dispatch_desktop_proxy_with_state(
        &state,
        "open_folder",
        json!({ "path": root }),
    )
    .await
    .unwrap();
    let second = dispatch_desktop_proxy_with_state(
        &state,
        "open_folder",
        json!({ "path": root }),
    )
    .await
    .unwrap();
    let list = dispatch_desktop_proxy_with_state(
        &state,
        "list_open_folder_details",
        json!({}),
    )
    .await
    .unwrap();

    assert_eq!(first["id"], second["id"]);
    assert_eq!(list.as_array().unwrap().len(), 1);
    assert!(first["path"].as_str().unwrap().contains("mcode-desktop-p30-open"));

    fs::remove_dir_all(root).ok();
}

#[tokio::test]
async fn p30_restores_open_folders_from_recovery_snapshot() {
    let root = temp_root("restore");
    let state = AppState::new_for_test();
    let opened = dispatch_desktop_proxy_with_state(
        &state,
        "open_folder",
        json!({ "path": root }),
    )
    .await
    .unwrap();

    let snapshot = build_recovery_snapshot(&state).unwrap();
    let restored = AppState::new_for_test();
    apply_recovery_snapshot(&restored, snapshot).unwrap();
    let list = dispatch_desktop_proxy_with_state(
        &restored,
        "list_open_folder_details",
        json!({}),
    )
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
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```powershell
cd mcode-desktop/src-tauri
cargo test --test desktop_p30_folder_projects
```

Expected: FAIL with unresolved imports or unsupported commands for folder project protocol.

- [ ] **Step 3: Add desktop folder state**

In `mcode-desktop/src-tauri/src/app_state.rs`, add imports and type near the existing serializable state types:

```rust
#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopOpenFolder {
    pub id: i32,
    pub name: String,
    pub path: String,
    pub opened_at_ms: u64,
    pub updated_at_ms: u64,
}
```

Add the field to `AppState`:

```rust
pub open_folders: RwLock<Vec<DesktopOpenFolder>>,
```

Initialize it in `impl Default for AppState`:

```rust
open_folders: RwLock::new(Vec::new()),
```

- [ ] **Step 4: Persist folder state in recovery snapshots**

In `mcode-desktop/src-tauri/src/recovery.rs`, add `DesktopOpenFolder` to the import:

```rust
use crate::app_state::{AppState, DesktopOpenFolder, DiagnosticEntry, GatewayConfig};
```

Add this field to `DesktopRecoverySnapshot`:

```rust
#[serde(default)]
pub open_folders: Vec<DesktopOpenFolder>,
```

Add this to `build_recovery_snapshot`:

```rust
open_folders: state
    .open_folders
    .read()
    .map(|value| value.clone())
    .unwrap_or_default(),
```

Add this to `apply_recovery_snapshot`:

```rust
if let Ok(mut open_folders) = state.open_folders.write() {
    *open_folders = snapshot.open_folders;
}
```

- [ ] **Step 5: Implement desktop folder commands**

Create `mcode-desktop/src-tauri/src/folders.rs`:

```rust
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
```

- [ ] **Step 6: Export and dispatch folder commands**

In `mcode-desktop/src-tauri/src/lib.rs`, add:

```rust
pub mod folders;
```

In `mcode-desktop/src-tauri/src/runtime/mod.rs`, add the import:

```rust
use crate::folders::dispatch_folder_proxy;
```

Add these match arms in `dispatch_desktop_proxy_with_event_sink` before the final `_`:

```rust
"get_home_directory"
| "list_directory_entries"
| "open_folder"
| "list_open_folder_details"
| "list_opened_tabs"
| "list_all_conversations" => dispatch_folder_proxy(state, command, payload).await,
```

- [ ] **Step 7: Run desktop tests**

Run:

```powershell
cd mcode-desktop/src-tauri
cargo test --test desktop_p30_folder_projects
cargo test --test desktop_p19_recovery_snapshot
```

Expected: PASS.

- [ ] **Step 8: Commit desktop protocol**

Run:

```powershell
git add -- mcode-desktop/src-tauri/src/folders.rs mcode-desktop/src-tauri/src/lib.rs mcode-desktop/src-tauri/src/app_state.rs mcode-desktop/src-tauri/src/recovery.rs mcode-desktop/src-tauri/src/runtime/mod.rs mcode-desktop/src-tauri/tests/desktop_p30_folder_projects.rs
git commit -m "feat(desktop): add folder project proxy commands"
```

---

### Task 2: App Remote Directory Helpers

**Files:**
- Create: `mcode-app/src/services/remoteDirectoryBrowser.ts`
- Create: `mcode-app/tests/services/remoteDirectoryBrowser.spec.ts`

**Interfaces:**
- Consumes: `CodegGateway.call`.
- Produces: `RemoteDirectoryEntry`, `RemoteProjectFolder`, `normalizeDirectoryEntries(input)`, `parentDirectoryPath(path)`, `getHomeDirectory(gateway)`, `listDirectoryEntries(gateway, path)`, `openRemoteFolder(gateway, path)`.

- [ ] **Step 1: Write failing Jest tests**

Create `mcode-app/tests/services/remoteDirectoryBrowser.spec.ts`:

```ts
import {
  normalizeDirectoryEntries,
  parentDirectoryPath,
} from "@/services/remoteDirectoryBrowser"

describe("remoteDirectoryBrowser", () => {
  it("normalizes camelCase and snake_case directory entries", () => {
    expect(
      normalizeDirectoryEntries([
        { name: "src", path: "/repo/src", isDirectory: true, hasChildren: true },
        { name: "docs", path: "/repo/docs", is_dir: true, has_children: false },
        { name: "file.txt", path: "/repo/file.txt", isDirectory: false },
        { name: "", path: "/repo/empty", isDirectory: true },
      ])
    ).toEqual([
      { name: "src", path: "/repo/src", isDirectory: true, hasChildren: true },
      { name: "docs", path: "/repo/docs", isDirectory: true, hasChildren: false },
    ])
  })

  it("unwraps data arrays from gateway envelopes", () => {
    expect(
      normalizeDirectoryEntries({
        data: [{ name: "work", path: "D:/work", isDirectory: true }],
      })
    ).toEqual([
      { name: "work", path: "D:/work", isDirectory: true, hasChildren: false },
    ])
  })

  it("resolves POSIX parent paths without crossing root", () => {
    expect(parentDirectoryPath("/Users/admin/project")).toBe("/Users/admin")
    expect(parentDirectoryPath("/Users")).toBe("/")
    expect(parentDirectoryPath("/")).toBe("")
  })

  it("resolves Windows parent paths without crossing drive root", () => {
    expect(parentDirectoryPath("D:\\Repos\\xyito\\lingyun")).toBe("D:\\Repos\\xyito")
    expect(parentDirectoryPath("D:\\Repos")).toBe("D:\\")
    expect(parentDirectoryPath("D:\\")).toBe("")
  })
})
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```powershell
cd mcode-app
npm run test:unit -- tests/services/remoteDirectoryBrowser.spec.ts
```

Expected: FAIL because `@/services/remoteDirectoryBrowser` does not exist.

- [ ] **Step 3: Implement helper module**

Create `mcode-app/src/services/remoteDirectoryBrowser.ts`:

```ts
import type { CodegGateway } from "@/services/gateway"

export interface RemoteDirectoryEntry {
  name: string
  path: string
  isDirectory: boolean
  hasChildren: boolean
}

export interface RemoteProjectFolder {
  id: number
  name: string
  path: string
}

export function normalizeDirectoryEntries(input: unknown): RemoteDirectoryEntry[] {
  const list = normalizeList(input)
  return list
    .map((item) => {
      const raw = item && typeof item === "object" ? (item as Record<string, unknown>) : null
      if (!raw) return null
      const name = pickString(raw.name)
      const path = pickString(raw.path)
      const isDirectory = Boolean(raw.isDirectory ?? raw.is_dir)
      if (!name || !path || !isDirectory) return null
      return {
        name,
        path,
        isDirectory: true,
        hasChildren: Boolean(raw.hasChildren ?? raw.has_children),
      } satisfies RemoteDirectoryEntry
    })
    .filter((item): item is RemoteDirectoryEntry => Boolean(item))
}

export function normalizeRemoteProjectFolder(input: unknown): RemoteProjectFolder | null {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : null
  if (!raw) return null
  const id = Number(raw.id || 0)
  const path = pickString(raw.path)
  if (!Number.isFinite(id) || id <= 0 || !path) return null
  return {
    id,
    name: pickString(raw.name) || path,
    path,
  }
}

export function parentDirectoryPath(input: string): string {
  const path = String(input || "").trim().replace(/[\\/]+$/, "")
  if (!path) return ""

  const windowsRoot = path.match(/^[A-Za-z]:$/)
  if (windowsRoot) return ""
  const windowsDrive = path.match(/^([A-Za-z]:)([\\/].*)?$/)
  if (windowsDrive) {
    const drive = windowsDrive[1]
    const rest = path.slice(drive.length).replace(/^[/\\]+/, "")
    if (!rest) return ""
    const parts = rest.split(/[\\/]+/).filter(Boolean)
    if (parts.length <= 1) return `${drive}\\`
    return `${drive}\\${parts.slice(0, -1).join("\\")}`
  }

  if (path === "/") return ""
  const parts = path.split("/").filter(Boolean)
  if (parts.length <= 1) return path.startsWith("/") ? "/" : ""
  return `${path.startsWith("/") ? "/" : ""}${parts.slice(0, -1).join("/")}`
}

export async function getHomeDirectory(gateway: CodegGateway): Promise<string> {
  const raw = await gateway.call<unknown>("get_home_directory")
  return pickString(raw)
}

export async function listDirectoryEntries(
  gateway: CodegGateway,
  path: string
): Promise<RemoteDirectoryEntry[]> {
  const raw = await gateway.call<unknown>("list_directory_entries", { path })
  return normalizeDirectoryEntries(raw)
}

export async function openRemoteFolder(
  gateway: CodegGateway,
  path: string
): Promise<RemoteProjectFolder> {
  const raw = await gateway.call<unknown>("open_folder", { path })
  const folder = normalizeRemoteProjectFolder(raw)
  if (!folder) {
    throw new Error("添加项目失败：返回数据异常")
  }
  return folder
}

function normalizeList(input: unknown): unknown[] {
  if (Array.isArray(input)) return input
  if (input && typeof input === "object" && Array.isArray((input as any).data)) {
    return (input as any).data
  }
  return []
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}
```

- [ ] **Step 4: Run helper tests**

Run:

```powershell
cd mcode-app
npm run test:unit -- tests/services/remoteDirectoryBrowser.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit App helpers**

Run:

```powershell
git add -- mcode-app/src/services/remoteDirectoryBrowser.ts mcode-app/tests/services/remoteDirectoryBrowser.spec.ts
git commit -m "feat(app): add remote directory browser helpers"
```

---

### Task 3: App Remote Directory Browser Component

**Files:**
- Create: `mcode-app/src/components/remote/RemoteDirectoryBrowser.vue`

**Interfaces:**
- Consumes: `CodegGateway`, `getHomeDirectory`, `listDirectoryEntries`, `parentDirectoryPath`.
- Produces Vue component props `{ show: boolean; gateway: CodegGateway | null; title?: string }`, emits `update:show`, `select(path: string)`.

- [ ] **Step 1: Create the component**

Create `mcode-app/src/components/remote/RemoteDirectoryBrowser.vue`:

```vue
<template>
  <up-popup :show="show" mode="bottom" :round="28" @close="close">
    <view class="remote-dir" :style="upThemeCardStyle">
      <view class="remote-dir__head">
        <view class="remote-dir__title-block">
          <text class="remote-dir__eyebrow">REMOTE FOLDER</text>
          <text class="remote-dir__title">{{ title || "添加文件夹" }}</text>
        </view>
        <view class="remote-dir__close" @click="close">
          <up-icon name="close" size="16" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
        </view>
      </view>

      <view class="remote-dir__toolbar">
        <view class="remote-dir__tool" @click="goHome">
          <up-icon name="home" size="15" :color="upThemeVar('--up-primary', '#2979ff')"></up-icon>
        </view>
        <view class="remote-dir__tool" @click="goParent">
          <up-icon name="arrow-upward" size="15" :color="upThemeVar('--up-primary', '#2979ff')"></up-icon>
        </view>
        <input
          class="remote-dir__input"
          :value="pathInput"
          placeholder="输入远端目录路径"
          placeholder-class="remote-dir__placeholder"
          @input="handleInput"
          @confirm="navigateInput"
        />
      </view>

      <view v-if="errorMessage" class="remote-dir__error">
        <text class="remote-dir__error-text">{{ errorMessage }}</text>
      </view>

      <view class="remote-dir__body">
        <view v-if="loading" class="remote-dir__state">
          <up-loading-icon mode="circle" size="26" :color="upThemeVar('--up-primary', '#2979ff')"></up-loading-icon>
          <text class="remote-dir__state-text">正在读取目录...</text>
        </view>
        <view v-else-if="entries.length === 0" class="remote-dir__state">
          <text class="remote-dir__state-title">没有子目录</text>
          <text class="remote-dir__state-text">可以直接选择当前目录。</text>
        </view>
        <scroll-view v-else class="remote-dir__list" scroll-y enhanced>
          <view
            v-for="entry in entries"
            :key="entry.path"
            class="remote-dir__row"
            :class="{ 'remote-dir__row--selected': normalizePath(entry.path) === normalizePath(selectedPath) }"
            @click="selectEntry(entry.path)"
          >
            <view class="remote-dir__folder">
              <up-icon name="folder" size="18" :color="upThemeVar('--up-primary', '#2979ff')"></up-icon>
            </view>
            <view class="remote-dir__row-main">
              <text class="remote-dir__row-name u-line-1">{{ entry.name }}</text>
              <text class="remote-dir__row-path u-line-1">{{ entry.path }}</text>
            </view>
            <view class="remote-dir__row-action" @click.stop="navigateTo(entry.path)">
              <up-icon name="arrow-right" size="13" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
            </view>
          </view>
        </scroll-view>
      </view>

      <view class="remote-dir__footer">
        <text class="remote-dir__selected u-line-1">{{ selectedPath || "请选择目录" }}</text>
        <up-button
          type="primary"
          shape="circle"
          :loading="confirming"
          :disabled="!selectedPath || confirming"
          @click="confirmSelection"
        >选择此文件夹</up-button>
      </view>
    </view>
  </up-popup>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, ref, watch } from "vue"
import type { CodegGateway } from "@/services/gateway"
import {
  getHomeDirectory,
  listDirectoryEntries,
  parentDirectoryPath,
  type RemoteDirectoryEntry,
} from "@/services/remoteDirectoryBrowser"

const props = defineProps<{
  show: boolean
  gateway: CodegGateway | null
  title?: string
}>()

const emit = defineEmits<{
  (event: "update:show", value: boolean): void
  (event: "select", path: string): void
}>()

const currentInstance = getCurrentInstance()
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})

const loading = ref(false)
const confirming = ref(false)
const errorMessage = ref("")
const pathInput = ref("")
const selectedPath = ref("")
const entries = ref<RemoteDirectoryEntry[]>([])
let sessionSeq = 0
let navSeq = 0

watch(
  () => props.show,
  (open) => {
    sessionSeq += 1
    if (!open) {
      resetState()
      return
    }
    void initialize()
  }
)

function upThemeVar(name: string, fallback: string) {
  const vars = currentInstance?.proxy?.upThemeVars || {}
  return (vars as Record<string, string>)[name] || `var(${name}, ${fallback})`
}

function resetState() {
  loading.value = false
  confirming.value = false
  errorMessage.value = ""
  pathInput.value = ""
  selectedPath.value = ""
  entries.value = []
}

function close() {
  emit("update:show", false)
}

async function initialize() {
  const seq = sessionSeq
  resetState()
  if (!props.gateway) {
    errorMessage.value = "连接不可用"
    return
  }
  loading.value = true
  try {
    const home = await getHomeDirectory(props.gateway)
    if (seq !== sessionSeq) return
    await navigateTo(home)
  } catch (error) {
    if (seq !== sessionSeq) return
    errorMessage.value = toErrorMessage(error, "读取主目录失败")
  } finally {
    if (seq === sessionSeq) loading.value = false
  }
}

async function navigateTo(path: string) {
  const target = String(path || "").trim()
  if (!target || !props.gateway) return
  const seq = sessionSeq
  const currentNav = ++navSeq
  loading.value = true
  errorMessage.value = ""
  try {
    const nextEntries = await listDirectoryEntries(props.gateway, target)
    if (seq !== sessionSeq || currentNav !== navSeq) return
    pathInput.value = target
    selectedPath.value = target
    entries.value = nextEntries
  } catch (error) {
    if (seq !== sessionSeq || currentNav !== navSeq) return
    errorMessage.value = toErrorMessage(error, "读取目录失败")
  } finally {
    if (seq === sessionSeq && currentNav === navSeq) loading.value = false
  }
}

function selectEntry(path: string) {
  selectedPath.value = path
  pathInput.value = path
}

function handleInput(event: Event) {
  pathInput.value = String((event.target as HTMLInputElement)?.value || "")
  selectedPath.value = pathInput.value
}

function navigateInput() {
  void navigateTo(pathInput.value)
}

function goHome() {
  if (!props.gateway) return
  void (async () => {
    try {
      await navigateTo(await getHomeDirectory(props.gateway!))
    } catch (error) {
      errorMessage.value = toErrorMessage(error, "读取主目录失败")
    }
  })()
}

function goParent() {
  const parent = parentDirectoryPath(pathInput.value || selectedPath.value)
  if (!parent) return
  void navigateTo(parent)
}

async function confirmSelection() {
  const target = selectedPath.value.trim()
  if (!target || !props.gateway || confirming.value) return
  const seq = sessionSeq
  confirming.value = true
  errorMessage.value = ""
  try {
    await listDirectoryEntries(props.gateway, target)
    if (seq !== sessionSeq) return
    emit("select", target)
  } catch (error) {
    if (seq !== sessionSeq) return
    errorMessage.value = toErrorMessage(error, "该目录不可读取")
  } finally {
    if (seq === sessionSeq) confirming.value = false
  }
}

function normalizePath(path: string) {
  return String(path || "").replace(/[\\/]+$/, "") || path
}

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  return fallback
}
</script>

<style scoped lang="scss">
.remote-dir {
  max-height: 86vh;
  padding: 32rpx 24rpx calc(24rpx + env(safe-area-inset-bottom));
  background: var(--up-card-bg-color, #ffffff);
  border-radius: 28rpx 28rpx 0 0;
  display: flex;
  flex-direction: column;
  gap: 22rpx;
}

.remote-dir__head,
.remote-dir__toolbar,
.remote-dir__row,
.remote-dir__footer {
  display: flex;
  align-items: center;
}

.remote-dir__head {
  justify-content: space-between;
}

.remote-dir__title-block {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.remote-dir__eyebrow {
  font-size: 20rpx;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--up-primary, #2979ff);
}

.remote-dir__title {
  font-size: 34rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.remote-dir__close,
.remote-dir__tool,
.remote-dir__folder,
.remote-dir__row-action {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.remote-dir__close,
.remote-dir__tool {
  width: 58rpx;
  height: 58rpx;
  border-radius: 999rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.remote-dir__toolbar {
  gap: 12rpx;
}

.remote-dir__input {
  flex: 1;
  min-width: 0;
  height: 64rpx;
  padding: 0 20rpx;
  border-radius: 999rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  color: var(--up-main-color, #303133);
  font-size: 24rpx;
}

.remote-dir__placeholder {
  color: var(--up-tips-color, #909193);
}

.remote-dir__error {
  padding: 16rpx 18rpx;
  border-radius: 18rpx;
  background: color-mix(in srgb, var(--up-error, #fa3534) 10%, var(--up-card-bg-color, #ffffff) 90%);
}

.remote-dir__error-text {
  font-size: 23rpx;
  color: var(--up-error, #fa3534);
}

.remote-dir__body {
  min-height: 360rpx;
  max-height: 52vh;
}

.remote-dir__list {
  height: 52vh;
}

.remote-dir__state {
  min-height: 360rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  text-align: center;
}

.remote-dir__state-title {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.remote-dir__state-text,
.remote-dir__row-path,
.remote-dir__selected {
  font-size: 22rpx;
  color: var(--up-tips-color, #909193);
}

.remote-dir__row {
  gap: 16rpx;
  padding: 18rpx 8rpx;
  border-bottom: 1rpx solid var(--up-border-color, #dadbde);
}

.remote-dir__row--selected {
  background: color-mix(in srgb, var(--up-primary, #2979ff) 8%, transparent);
}

.remote-dir__folder {
  width: 52rpx;
  height: 52rpx;
  border-radius: 16rpx;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 10%, var(--up-card-bg-color, #ffffff) 90%);
}

.remote-dir__row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.remote-dir__row-name {
  font-size: 27rpx;
  font-weight: 600;
  color: var(--up-main-color, #303133);
}

.remote-dir__row-action {
  width: 48rpx;
  height: 48rpx;
}

.remote-dir__footer {
  gap: 16rpx;
}

.remote-dir__selected {
  flex: 1;
  min-width: 0;
}
</style>
```

- [ ] **Step 2: Verify navigation interaction**

Confirm the component uses a single-tap row selection and the right-side arrow for directory navigation. The row must contain:

```vue
@click="selectEntry(entry.path)"
```

The row action must contain:

```vue
@click.stop="navigateTo(entry.path)"
```

- [ ] **Step 3: Run App helper tests and type check**

Run:

```powershell
cd mcode-app
npm run test:unit -- tests/services/remoteDirectoryBrowser.spec.ts
npx vue-tsc --noEmit
```

Expected: helper tests PASS; type check PASS.

- [ ] **Step 4: Commit browser component**

Run:

```powershell
git add -- mcode-app/src/components/remote/RemoteDirectoryBrowser.vue
git commit -m "feat(app): add remote directory browser component"
```

---

### Task 4: App Overview And Project Page Integration

**Files:**
- Modify: `mcode-app/src/pages/conversations/index.vue`
- Modify: `mcode-app/src/pages/projects/index.vue`
- Modify: `docs/mcode-architecture-notes/2026-07-01-p45-app-add-folder-project.md`

**Interfaces:**
- Consumes: `RemoteDirectoryBrowser`, `openRemoteFolder`, `CodegGateway`.
- Produces: user-visible add-folder entries, `openAddProjectBrowser(connectionKey)`, `handleRemoteFolderSelected(path)`, project-page equivalent flow.

- [ ] **Step 1: Integrate browser state into conversation overview script**

In `mcode-app/src/pages/conversations/index.vue`, add imports:

```ts
import RemoteDirectoryBrowser from "@/components/remote/RemoteDirectoryBrowser.vue"
import { openRemoteFolder } from "@/services/remoteDirectoryBrowser"
```

Add refs near other UI state:

```ts
const showDirectoryBrowser = ref(false)
const directoryBrowserGateway = ref<CodegGateway | null>(null)
const directoryBrowserConnectionKey = ref("")
const addingProject = ref(false)
```

Add methods near other connection actions:

```ts
async function openAddProjectBrowser(groupKey: string) {
  if (addingProject.value) return
  const conn = findConnectedConnectionByKey(groupKey)
  if (!conn) {
    uni.showToast({ title: "连接不存在或已断开", icon: "none" })
    return
  }
  try {
    const gateway = await createConnectionGateway(conn)
    directoryBrowserGateway.value = gateway
    directoryBrowserConnectionKey.value = groupKey
    showDirectoryBrowser.value = true
  } catch (error) {
    uni.showToast({ title: toErrorMessage(error), icon: "none", duration: 3000 })
  }
}

async function handleRemoteFolderSelected(path: string) {
  if (!directoryBrowserGateway.value || !directoryBrowserConnectionKey.value || addingProject.value) {
    return
  }
  addingProject.value = true
  try {
    await openRemoteFolder(directoryBrowserGateway.value, path)
    showDirectoryBrowser.value = false
    const conn = findConnectedConnectionByKey(directoryBrowserConnectionKey.value)
    const current = connectionGroups.value.find(
      (group) => group.key === directoryBrowserConnectionKey.value
    )
    if (conn && current) {
      await refreshConnectionGroupFromRemote(conn, current)
    } else {
      await loadOverviewData({ force: true })
    }
    uni.showToast({ title: "已添加项目", icon: "success" })
  } catch (error) {
    uni.showToast({ title: toErrorMessage(error), icon: "none", duration: 3000 })
  } finally {
    addingProject.value = false
  }
}
```

- [ ] **Step 2: Add conversation overview UI entry**

In the group header template, replace the current header body:

```vue
<view class="group-section__header">
  <text class="group-section__title">{{ group.name }}</text>
  <view
    v-if="group.loadError"
    class="group-section__error"
    @click.stop="showGroupError(group)"
  >
    <up-icon name="warning-fill" size="14" color="#fa3534"></up-icon>
  </view>
</view>
```

with:

```vue
<view class="group-section__header">
  <view class="group-section__title-row">
    <text class="group-section__title">{{ group.name }}</text>
    <view
      v-if="group.loadError"
      class="group-section__error"
      @click.stop="showGroupError(group)"
    >
      <up-icon name="warning-fill" size="14" color="#fa3534"></up-icon>
    </view>
  </view>
  <view
    v-if="!group.loadError"
    class="group-section__add"
    @click.stop="openAddProjectBrowser(group.key)"
  >
    <up-icon name="plus" size="13" :color="upThemeVar('--up-primary', '#2979ff')"></up-icon>
    <text class="group-section__add-text">项目</text>
  </view>
</view>
```

Replace the empty card block:

```vue
<view v-if="group.cards.length === 0" class="group-empty">
  <text class="group-empty__text">
    {{ group.loadError || "暂无打开中的标签会话" }}
  </text>
</view>
```

with:

```vue
<view v-if="group.cards.length === 0 && group.projects.length === 0 && !group.loadError" class="group-add-empty" :style="upThemeCardStyle" @click="openAddProjectBrowser(group.key)">
  <view class="group-add-empty__icon">
    <up-icon name="folder" size="22" :color="upThemeVar('--up-primary', '#2979ff')"></up-icon>
  </view>
  <view class="group-add-empty__copy">
    <text class="group-add-empty__title">添加文件夹</text>
    <text class="group-add-empty__text">选择这台连接上的目录，作为 MCode 项目使用。</text>
  </view>
  <up-icon name="arrow-right" size="13" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
</view>
<view v-else-if="group.cards.length === 0" class="group-empty">
  <text class="group-empty__text">
    {{ group.loadError || "暂无打开中的标签会话" }}
  </text>
</view>
```

Add the browser component before `</view>` at the end of the template:

```vue
<RemoteDirectoryBrowser
  v-model:show="showDirectoryBrowser"
  :gateway="directoryBrowserGateway"
  title="添加项目文件夹"
  @select="handleRemoteFolderSelected"
/>
```

- [ ] **Step 3: Add conversation overview styles**

In `mcode-app/src/pages/conversations/index.vue`, update styles:

```scss
.group-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  margin-bottom: 12rpx;
  padding: 0 8rpx;
}

.group-section__title-row {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.group-section__add {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6rpx;
  padding: 8rpx 12rpx;
  border-radius: 999rpx;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 9%, var(--up-card-bg-color, #ffffff) 91%);
}

.group-section__add-text {
  font-size: 22rpx;
  font-weight: 700;
  color: var(--up-primary, #2979ff);
}

.group-add-empty {
  display: flex;
  align-items: center;
  gap: 18rpx;
  padding: 24rpx 22rpx;
  border-radius: 32rpx;
  background: color-mix(in srgb, var(--up-card-bg-color, #ffffff) 45%, transparent) !important;
  border: 1rpx solid rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(30rpx);
  -webkit-backdrop-filter: blur(30rpx);
}

.group-add-empty__icon {
  width: 62rpx;
  height: 62rpx;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 10%, var(--up-card-bg-color, #ffffff) 90%);
}

.group-add-empty__copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.group-add-empty__title {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.group-add-empty__text {
  font-size: 23rpx;
  line-height: 1.4;
  color: var(--up-content-color, #606266);
}
```

- [ ] **Step 4: Integrate project page add action**

In `mcode-app/src/pages/projects/index.vue`, add imports:

```ts
import RemoteDirectoryBrowser from "@/components/remote/RemoteDirectoryBrowser.vue"
import { openRemoteFolder } from "@/services/remoteDirectoryBrowser"
import type { CodegGateway } from "@/services/gateway"
```

Add refs:

```ts
const showDirectoryBrowser = ref(false)
const directoryBrowserGateway = ref<CodegGateway | null>(null)
const addingProject = ref(false)
```

Add methods:

```ts
async function openAddProjectBrowser() {
  if (!connection.value) {
    errorMessage.value = "缺少连接信息，请返回连接页重试。"
    return
  }
  try {
    const resolved = await resolveConnectionContext(connection.value)
    connection.value = resolved.connection
    persistResolvedConnection(resolved.connection)
    directoryBrowserGateway.value = resolved.gateway
    showDirectoryBrowser.value = true
  } catch (error) {
    uni.showToast({ title: toErrorMessage(error), icon: "none", duration: 3000 })
  }
}

async function handleRemoteFolderSelected(path: string) {
  if (!directoryBrowserGateway.value || addingProject.value) return
  addingProject.value = true
  try {
    await openRemoteFolder(directoryBrowserGateway.value, path)
    showDirectoryBrowser.value = false
    await loadPage()
    uni.showToast({ title: "已添加项目", icon: "success" })
  } catch (error) {
    uni.showToast({ title: toErrorMessage(error), icon: "none", duration: 3000 })
  } finally {
    addingProject.value = false
  }
}
```

Update the header badge area:

```vue
<view class="project-header__actions">
  <view class="project-header__add" @click="openAddProjectBrowser">
    <up-icon name="plus" size="14" :color="upThemeVar('--up-primary', '#2979ff')"></up-icon>
    <text class="project-header__add-text">添加项目</text>
  </view>
  <view class="project-header__badge">
    <text class="project-header__badge-text">{{ projectItems.length }} 个项目</text>
  </view>
</view>
```

Replace the zero-project state text:

```vue
<view v-else-if="projectItems.length === 0" class="project-state project-state--add" :style="upThemeCardStyle" @click="openAddProjectBrowser">
  <view class="project-state__folder">
    <up-icon name="folder" size="26" :color="upThemeVar('--up-primary', '#2979ff')"></up-icon>
  </view>
  <text class="project-state__title">添加文件夹</text>
  <text class="project-state__text">当前连接还没有项目。选择远端目录后即可创建会话。</text>
  <view class="project-state__action">
    <text>选择文件夹</text>
  </view>
</view>
```

Add the browser component before the action sheet:

```vue
<RemoteDirectoryBrowser
  v-model:show="showDirectoryBrowser"
  :gateway="directoryBrowserGateway"
  title="添加项目文件夹"
  @select="handleRemoteFolderSelected"
/>
```

Add project-page styles:

```scss
.project-header__actions {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12rpx;
}

.project-header__add {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 14rpx 18rpx;
  border-radius: 999rpx;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 10%, var(--up-card-bg-color, #ffffff) 90%);
}

.project-header__add-text {
  font-size: 22rpx;
  font-weight: 700;
  color: var(--up-primary, #2979ff);
}

.project-state--add {
  cursor: pointer;
}

.project-state__folder {
  width: 82rpx;
  height: 82rpx;
  border-radius: 26rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 10%, var(--up-card-bg-color, #ffffff) 90%);
}
```

- [ ] **Step 5: Update architecture note**

Append to `docs/mcode-architecture-notes/2026-07-01-p45-app-add-folder-project.md` under Desktop behavior:

```markdown
- `list_opened_tabs`：desktop 在本阶段返回 `{ version: 0, items: [] }`，用于兼容 App 会话总览现有加载链路。否则 0 项目连接添加文件夹后仍会因为缺少打开标签协议显示连接错误。
```

- [ ] **Step 6: Run App verification**

Run:

```powershell
cd mcode-app
npm run test:unit -- tests/services/remoteDirectoryBrowser.spec.ts tests/services/conversationOverviewSnapshot.spec.ts
npx vue-tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit App integration**

Run:

```powershell
git add -- mcode-app/src/pages/conversations/index.vue mcode-app/src/pages/projects/index.vue docs/mcode-architecture-notes/2026-07-01-p45-app-add-folder-project.md
git commit -m "feat(app): add folder project entry points"
```

---

### Task 5: End-To-End Verification

**Files:**
- No source edits are planned in this task. If verification fails, fix the failing code in the task that introduced it, then rerun this task from Step 1.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified working feature and final status.

- [ ] **Step 1: Run focused automated tests**

Run:

```powershell
cd mcode-desktop/src-tauri
cargo test --test desktop_p30_folder_projects
cargo test --test desktop_p19_recovery_snapshot
cd ../../..
cd mcode-app
npm run test:unit -- tests/services/remoteDirectoryBrowser.spec.ts tests/services/conversationOverviewSnapshot.spec.ts
npx vue-tsc --noEmit
```

Expected: all commands PASS.

- [ ] **Step 2: Run broader protocol-adjacent tests**

Run:

```powershell
cd mcode-desktop/src-tauri
cargo test --test desktop_p5_cli_adapters
cd ../../..
cd mcode-app
npm run test:unit -- tests/services/relayGateway.spec.ts tests/agents/mcodeDesktopCapabilities.spec.ts tests/agents/mcode-desktop/readiness.spec.ts
```

Expected: all commands PASS.

- [ ] **Step 3: Manual smoke test**

Start the desktop shell:

```powershell
cd mcode-desktop
npm run tauri -- dev
```

Start the App H5 shell:

```powershell
cd mcode-app
npm run dev:h5
```

Then verify:

1. A connected `mcode-desktop` connection with zero folders shows "添加文件夹" in the conversation overview body.
2. The connection header has a compact add-project action.
3. Directory browser opens to the desktop home directory.
4. Selecting a readable folder closes the browser and refreshes the group.
5. The folder appears in the create-conversation project picker.
6. Creating a session from that folder calls `acp_connect` with `workingDir` equal to the selected folder path.

- [ ] **Step 4: Check working tree**

Run:

```powershell
git status --short
```

Expected: no unexpected uncommitted files. If manual smoke generated logs or build artifacts, remove only files created by this task and do not touch unrelated user changes.
