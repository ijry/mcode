# MCode P26 Desktop Queue Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist Desktop-hosted queued prompts across Desktop restarts and restore them as manageable shared queue state.

**Architecture:** P26 extends the existing P19 Desktop recovery snapshot with serializable queued prompt records. Runtime-only queue items keep `event_sink` in memory, while persisted records store prompt metadata and payload without relay tokens or official CLI credentials. Relay remains transport-only and app clients keep using the P24/P25 queue model.

**Tech Stack:** Rust/Tauri Desktop backend, serde JSON recovery snapshots, existing Desktop health snapshots, existing Rust integration tests.

## Global Constraints

- Use `targetAgent`, never `targetType`.
- Do not persist active provider turns or attempt official CLI process resume.
- Do not add relay-side queue storage.
- Do not add queue reorder, priority, bulk cancel, ownership policies, or TTL in P26.
- Do not add mobile-side `codex` or `claude` target agents.
- Every mcode change must update `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`.

---

## File Structure

- Modify `mcode-desktop/src-tauri/src/runtime/mod.rs`: add persistent queue conversion helpers and expose restore helpers.
- Modify `mcode-desktop/src-tauri/src/recovery.rs`: add `queued_prompts` to `DesktopRecoverySnapshot`, build/apply queue state.
- Modify `mcode-desktop/src-tauri/tests/desktop_p19_recovery_snapshot.rs`: add P26 recovery coverage near existing snapshot tests.
- Modify `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`: record P26 architecture and native guidance.
- Modify this plan file as tasks complete.

## Task 1: Persistent Queue Snapshot Model

**Files:**
- Modify: `mcode-desktop/src-tauri/src/runtime/mod.rs`
- Modify: `mcode-desktop/src-tauri/src/recovery.rs`
- Test: `mcode-desktop/src-tauri/tests/desktop_p19_recovery_snapshot.rs`
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`

**Interfaces:**
- Produces: `PersistentQueuedPrompt`
- Produces: `persistent_queued_prompts(state: &AppState) -> Vec<PersistentQueuedPrompt>`
- Produces: `restore_persistent_queued_prompts(state: &AppState, prompts: Vec<PersistentQueuedPrompt>)`
- Consumes: existing `QueuedPromptItem`, `DesktopRecoverySnapshot`, and `build_health_snapshot(...)`

- [x] Step 1: Add failing test for queue snapshot restore.

Add a test to `mcode-desktop/src-tauri/tests/desktop_p19_recovery_snapshot.rs` that:

```rust
#[tokio::test]
async fn p26_snapshot_restores_queued_prompts_without_active_turn_resume() {
    let path = std::env::temp_dir().join(format!(
        "mcode-desktop-p26-queue-state-{}.json",
        std::process::id()
    ));
    let state = AppState::new_for_test();
    let connected = dispatch_desktop_proxy_with_state(
        &state,
        "acp_connect",
        json!({ "agentType": "claude_code", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();
    let session_id = connected["sessionId"].as_str().unwrap().to_string();
    mcode_desktop_lib::runtime::begin_hosted_turn_for_test(
        &state,
        &session_id,
        "turn-live",
        Some("client-phone".to_string()),
    )
    .unwrap();
    let queued = dispatch_desktop_proxy_with_state(
        &state,
        "acp_prompt",
        json!({
            "sessionId": session_id,
            "prompt": "restore queued ask",
            "sourceClientId": "client-watch",
            "client": { "deviceName": "Watch" }
        }),
    )
    .await
    .unwrap();
    let queue_item_id = queued["queueItemId"].as_str().unwrap().to_string();
    {
        let mut sessions = state.cli_sessions.write().unwrap();
        sessions[0].status = CliSessionStatus::Running;
    }

    save_recovery_snapshot_to_path(&state, &path).unwrap();
    let raw = fs::read_to_string(&path).unwrap();
    assert!(raw.contains("\"queuedPrompts\""));
    assert!(raw.contains("restore queued ask"));

    let snapshot = load_recovery_snapshot(&path).unwrap().unwrap();
    let restored = AppState::new_for_test();
    apply_recovery_snapshot(&restored, snapshot).unwrap();
    fs::remove_file(&path).ok();

    let health = mcode_desktop_lib::health::build_health_snapshot(&restored);
    assert_eq!(health.active_turn_count, 0);
    assert_eq!(health.prompt_queue_count, 1);
    assert_eq!(health.prompt_queue[0].queue_item_id, queue_item_id);
    assert_eq!(health.prompt_queue[0].session_id, session_id);
    assert_eq!(health.prompt_queue[0].source_client_id.as_deref(), Some("client-watch"));
    assert_eq!(health.prompt_queue[0].source_device_name.as_deref(), Some("Watch"));
    assert_eq!(health.prompt_queue[0].prompt_preview.as_deref(), Some("restore queued ask"));
    assert_eq!(health.cli_sessions[0].status, CliSessionStatus::Interrupted);
}
```

- [x] Step 2: Run test to verify it fails.

Run:

```bash
cd mcode-desktop/src-tauri
cargo test --test desktop_p19_recovery_snapshot p26_snapshot_restores_queued_prompts_without_active_turn_resume
```

Expected: FAIL because `queuedPrompts` is not present/restored.

- [x] Step 3: Add persistent queue types and conversion helpers.

In `mcode-desktop/src-tauri/src/runtime/mod.rs`, after `QueuedPromptItem`, add:

```rust
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistentQueuedPrompt {
    pub queue_item_id: String,
    pub session_id: String,
    pub runtime: CliRuntimeKind,
    pub agent_type: String,
    pub payload: Value,
    pub source_client_id: Option<String>,
    pub source_device_name: Option<String>,
    pub prompt_preview: Option<String>,
    pub created_at_ms: u64,
}
```

Add helpers near `queued_prompt_snapshots(...)`:

```rust
pub fn persistent_queued_prompts(state: &AppState) -> Vec<PersistentQueuedPrompt> {
    state
        .queued_prompts
        .lock()
        .map(|queues| {
            queues
                .values()
                .flat_map(|queue| queue.iter().map(persistent_queued_prompt))
                .collect()
        })
        .unwrap_or_default()
}

pub fn restore_persistent_queued_prompts(
    state: &AppState,
    prompts: Vec<PersistentQueuedPrompt>,
) {
    let mut grouped: std::collections::HashMap<String, Vec<QueuedPromptItem>> =
        std::collections::HashMap::new();
    for prompt in prompts {
        grouped
            .entry(prompt.session_id.clone())
            .or_default()
            .push(QueuedPromptItem {
                queue_item_id: prompt.queue_item_id,
                session_id: prompt.session_id,
                runtime: prompt.runtime,
                agent_type: prompt.agent_type,
                payload: prompt.payload,
                source_client_id: prompt.source_client_id,
                source_device_name: prompt.source_device_name,
                prompt_preview: prompt.prompt_preview,
                created_at_ms: prompt.created_at_ms,
                event_sink: None,
            });
    }
    if let Ok(mut queues) = state.queued_prompts.lock() {
        *queues = grouped;
    }
}

fn persistent_queued_prompt(item: &QueuedPromptItem) -> PersistentQueuedPrompt {
    PersistentQueuedPrompt {
        queue_item_id: item.queue_item_id.clone(),
        session_id: item.session_id.clone(),
        runtime: item.runtime.clone(),
        agent_type: item.agent_type.clone(),
        payload: item.payload.clone(),
        source_client_id: item.source_client_id.clone(),
        source_device_name: item.source_device_name.clone(),
        prompt_preview: item.prompt_preview.clone(),
        created_at_ms: item.created_at_ms,
    }
}
```

- [x] Step 4: Extend `DesktopRecoverySnapshot`.

In `mcode-desktop/src-tauri/src/recovery.rs`, import the new helpers:

```rust
use crate::runtime::{
    persistent_queued_prompts, restore_persistent_queued_prompts, CliPendingInteraction,
    CliRuntimeSession, CliSessionStatus, PersistentQueuedPrompt,
};
```

Add field to `DesktopRecoverySnapshot`:

```rust
#[serde(default)]
pub queued_prompts: Vec<PersistentQueuedPrompt>,
```

In `build_recovery_snapshot(...)`, set:

```rust
queued_prompts: persistent_queued_prompts(state),
```

In `apply_recovery_snapshot(...)`, after restoring outbound event queue, call:

```rust
restore_persistent_queued_prompts(state, snapshot.queued_prompts);
```

- [x] Step 5: Update architecture note.

Append a `## P26 Desktop Queue Recovery Behavior` section to `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md` describing:

```md
## P26 Desktop Queue Recovery Behavior

P26 persists Desktop-hosted queued prompts in the existing P19 recovery snapshot.
Only not-yet-started prompts are persisted; active provider turns remain
non-resumable and restore as interrupted sessions.

Desktop behavior:

- `DesktopRecoverySnapshot.queuedPrompts` stores serializable queued prompt
  records without runtime `eventSink`.
- Restored queue items are visible through `desktop_get_health.promptQueue`.
- Desktop boot does not auto-start restored queue items.
- `acp_cancel_queued_prompt` can cancel restored queue items.
- Relay remains transport-only and does not own queue durability.

Native replication:

- Treat restored queue rows the same as live P24 queue rows.
- Keep local drafts separate from Desktop shared queue state.
- Do not create mobile-side Codex or Claude target agents.
```

- [x] Step 6: Run focused test.

Run:

```bash
cd mcode-desktop/src-tauri
cargo test --test desktop_p19_recovery_snapshot p26_snapshot_restores_queued_prompts_without_active_turn_resume
```

Expected: PASS.

- [x] Step 7: Commit Task 1.

```bash
git add mcode-desktop/src-tauri/src/runtime/mod.rs mcode-desktop/src-tauri/src/recovery.rs mcode-desktop/src-tauri/tests/desktop_p19_recovery_snapshot.rs docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md docs/superpowers/plans/2026-06-28-mcode-p26-desktop-queue-recovery.md
git commit -m "feat(desktop): persist queued prompts in recovery"
```

## Task 2: Restored Queue Cancellation And Save Coverage

**Files:**
- Modify: `mcode-desktop/src-tauri/tests/desktop_p19_recovery_snapshot.rs`
- Modify: `mcode-desktop/src-tauri/src/runtime/mod.rs`
- Modify: `docs/superpowers/plans/2026-06-28-mcode-p26-desktop-queue-recovery.md`

**Interfaces:**
- Consumes: Task 1 `queued_prompts` recovery.
- Produces: test coverage that restored queue items can be cancelled.

- [x] Step 1: Add restored cancellation test.

Add this test to `desktop_p19_recovery_snapshot.rs`:

```rust
#[tokio::test]
async fn p26_restored_queued_prompt_can_be_cancelled() {
    let path = std::env::temp_dir().join(format!(
        "mcode-desktop-p26-cancel-restored-{}.json",
        std::process::id()
    ));
    let state = AppState::new_for_test();
    let connected = dispatch_desktop_proxy_with_state(
        &state,
        "acp_connect",
        json!({ "agentType": "claude_code", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();
    let session_id = connected["sessionId"].as_str().unwrap().to_string();
    mcode_desktop_lib::runtime::begin_hosted_turn_for_test(&state, &session_id, "turn-live", None)
        .unwrap();
    let queued = dispatch_desktop_proxy_with_state(
        &state,
        "acp_prompt",
        json!({ "sessionId": session_id, "prompt": "cancel after restore" }),
    )
    .await
    .unwrap();
    let queue_item_id = queued["queueItemId"].as_str().unwrap().to_string();
    save_recovery_snapshot_to_path(&state, &path).unwrap();

    let snapshot = load_recovery_snapshot(&path).unwrap().unwrap();
    let restored = AppState::new_for_test();
    apply_recovery_snapshot(&restored, snapshot).unwrap();
    fs::remove_file(&path).ok();

    let response = dispatch_desktop_proxy_with_state(
        &restored,
        "acp_cancel_queued_prompt",
        json!({ "sessionId": session_id, "queueItemId": queue_item_id }),
    )
    .await
    .unwrap();

    assert_eq!(response["status"], "cancelled");
    assert_eq!(mcode_desktop_lib::health::build_health_snapshot(&restored).prompt_queue_count, 0);
}
```

- [x] Step 2: Ensure queue mutations save recovery snapshot.

In `runtime/mod.rs`, add `let _ = crate::recovery::save_recovery_snapshot(state);`:

- after `push_queued_prompt(state, item)?;`
- after removing an item in `cancel_queued_prompt(...)` and dropping the queue lock
- after removing an item in `start_next_queued_prompt_if_idle(...)` and dropping the queue lock

Do not call save while holding `queued_prompts` lock.

- [x] Step 3: Run focused recovery tests.

Run:

```bash
cd mcode-desktop/src-tauri
cargo test --test desktop_p19_recovery_snapshot
```

Expected: PASS.

- [x] Step 4: Commit Task 2.

```bash
git add mcode-desktop/src-tauri/src/runtime/mod.rs mcode-desktop/src-tauri/tests/desktop_p19_recovery_snapshot.rs docs/superpowers/plans/2026-06-28-mcode-p26-desktop-queue-recovery.md
git commit -m "test(desktop): cover restored queue cancellation"
```

## Task 3: Full Verification And Progress Closure

**Files:**
- Modify: `docs/superpowers/plans/2026-06-28-mcode-p26-desktop-queue-recovery.md`

**Interfaces:**
- Consumes all prior task outputs.
- Produces complete P26 progress record.

- [x] Step 1: Run Desktop prompt queue tests.

Run:

```bash
cd mcode-desktop/src-tauri
cargo test --test desktop_p24_prompt_queue
```

Expected: PASS.

- [x] Step 2: Run Desktop recovery tests.

Run:

```bash
cd mcode-desktop/src-tauri
cargo test --test desktop_p19_recovery_snapshot
```

Expected: PASS.

- [x] Step 3: Run app queue UI regression tests.

Run:

```bash
cd mcode-app
npm run test:unit -- --runTestsByPath tests/pages/conversation-detail/detailRuntimePresentation.spec.ts tests/api/acpQueuedPromptCancel.spec.ts
```

Expected: PASS.

- [x] Step 4: Run repository diff check.

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

- [x] Step 5: Mark all P26 plan checkboxes complete.

Change completed checkboxes in this file from `[ ]` to `[x]`.

- [x] Step 6: Commit verification progress.

```bash
git add docs/superpowers/plans/2026-06-28-mcode-p26-desktop-queue-recovery.md
git commit -m "docs(desktop): complete p26 queue recovery plan"
```

## Self-Review

- Spec coverage: queue persistence, restore, health visibility, cancelability, active-turn non-resume, docs, and verification are covered.
- Scope control: no relay store, queue policies, TTL, reorder, bulk cancel, ownership restrictions, or provider thread resume are included.
- Type consistency: plan uses `queued_prompts`, `queuedPrompts`, `PersistentQueuedPrompt`, and existing `queueItemId` naming consistently across Rust and JSON boundaries.
