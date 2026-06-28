# MCode P27 Queue Policy Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-slice Desktop queue policy controls, restored queue expiry, and app clear-all queue action.

**Architecture:** Desktop owns queue policy and enforcement. Relay remains transport-only. The app gets a thin `acp_cancel_all_queued_prompts` wrapper and a shared queue clear action that does not optimistically mutate rows.

**Tech Stack:** Rust/Tauri Desktop backend, serde health/recovery snapshots, Vue/uni-app, TypeScript, Jest, existing ACP gateway protocol.

## Global Constraints

- Use `targetAgent`, never `targetType`.
- Do not add relay-side queue storage or policy state.
- Do not implement queue reorder, priority, scheduling weights, or ownership restriction enforcement in P27.
- Do not add mobile-side `codex` or `claude` target agents.
- Do not optimistically remove shared queue rows in the app.
- Every mcode change must update `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`.
- Keep app theme styling on uview-plus `--up-*` runtime variables; do not add `--mcode-*` aliases.

---

## File Structure

- Modify `mcode-desktop/src-tauri/src/app_state.rs`: add `PromptQueuePolicy` and expired queue counter to `AppState`.
- Modify `mcode-desktop/src-tauri/src/health.rs`: expose `prompt_queue_policy` and `expired_prompt_queue_count`.
- Modify `mcode-desktop/src-tauri/src/runtime/mod.rs`: use policy queue limit and add cancel-all command.
- Modify `mcode-desktop/src-tauri/src/recovery.rs`: filter expired restored queued prompts.
- Modify `mcode-desktop/src-tauri/tests/desktop_p24_prompt_queue.rs`: add cancel-all and policy tests.
- Modify `mcode-desktop/src-tauri/tests/desktop_p19_recovery_snapshot.rs`: add restored-expiry test.
- Modify `mcode-app/src/api/acp.ts`: add `acpCancelAllQueuedPrompts(...)`.
- Modify `mcode-app/tests/api/acpQueuedPromptCancel.spec.ts`: cover clear-all payload.
- Modify `mcode-app/src/pages/conversation-detail/detailRuntimePresentation.ts`: add clear-all disabled helper.
- Modify `mcode-app/tests/pages/conversation-detail/detailRuntimePresentation.spec.ts`: cover clear-all helper.
- Modify `mcode-app/src/pages/conversation-detail/index.vue`: add clear action state and handler.
- Modify `mcode-app/src/pages/conversation-detail/index.scss`: add clear action styles using `--up-*` variables.
- Modify `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`: record P27 behavior.
- Modify this plan file as tasks complete.

## Task 1: Desktop Queue Policy And Restore Expiry

**Files:**
- Modify: `mcode-desktop/src-tauri/src/app_state.rs`
- Modify: `mcode-desktop/src-tauri/src/health.rs`
- Modify: `mcode-desktop/src-tauri/src/runtime/mod.rs`
- Modify: `mcode-desktop/src-tauri/src/recovery.rs`
- Modify: `mcode-desktop/src-tauri/tests/desktop_p24_prompt_queue.rs`
- Modify: `mcode-desktop/src-tauri/tests/desktop_p19_recovery_snapshot.rs`
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`

**Interfaces:**
- Produces: `PromptQueuePolicy`
- Produces health fields: `promptQueuePolicy`, `expiredPromptQueueCount`
- Consumes: existing `PersistentQueuedPrompt` and queue restore flow.

- [x] Step 1: Add policy health failing test.

Add to `desktop_p24_prompt_queue.rs`:

```rust
#[test]
fn p27_health_exposes_prompt_queue_policy() {
    let state = AppState::new_for_test();
    let health = build_health_snapshot(&state);

    assert_eq!(health.prompt_queue_policy.queue_limit, 20);
    assert_eq!(health.prompt_queue_policy.max_restored_age_ms, 7 * 24 * 60 * 60 * 1000);
    assert!(health.prompt_queue_policy.allow_any_client_cancel);
    assert_eq!(health.expired_prompt_queue_count, 0);
}
```

- [x] Step 2: Add restored expiry failing test.

Add to `desktop_p19_recovery_snapshot.rs`:

```rust
#[tokio::test]
async fn p27_recovery_drops_expired_queued_prompts() {
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
    dispatch_desktop_proxy_with_state(
        &state,
        "acp_prompt",
        json!({ "sessionId": session_id, "prompt": "expired restore" }),
    )
    .await
    .unwrap();
    let mut snapshot = mcode_desktop_lib::recovery::build_recovery_snapshot(&state).unwrap();
    snapshot.queued_prompts[0].created_at_ms = 1;

    let restored = AppState::new_for_test();
    apply_recovery_snapshot(&restored, snapshot).unwrap();
    let health = mcode_desktop_lib::health::build_health_snapshot(&restored);

    assert_eq!(health.prompt_queue_count, 0);
    assert_eq!(health.expired_prompt_queue_count, 1);
    assert!(health
        .diagnostics
        .iter()
        .any(|entry| entry.message.contains("expired queued prompt")));
}
```

- [x] Step 3: Run failing Desktop tests.

Run:

```bash
cd mcode-desktop/src-tauri
cargo test --test desktop_p24_prompt_queue p27_health_exposes_prompt_queue_policy
cargo test --test desktop_p19_recovery_snapshot p27_recovery_drops_expired_queued_prompts
```

Expected: FAIL because fields/policy do not exist.

- [x] Step 4: Add `PromptQueuePolicy` to `app_state.rs`.

Add imports:

```rust
use std::sync::atomic::{AtomicBool, AtomicU64};
```

Add constants and type:

```rust
pub const DEFAULT_PROMPT_QUEUE_LIMIT: usize = 20;
pub const DEFAULT_PROMPT_QUEUE_MAX_RESTORED_AGE_MS: u64 = 7 * 24 * 60 * 60 * 1000;

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptQueuePolicy {
    pub queue_limit: usize,
    pub max_restored_age_ms: u64,
    pub allow_any_client_cancel: bool,
}

impl Default for PromptQueuePolicy {
    fn default() -> Self {
        Self {
            queue_limit: DEFAULT_PROMPT_QUEUE_LIMIT,
            max_restored_age_ms: DEFAULT_PROMPT_QUEUE_MAX_RESTORED_AGE_MS,
            allow_any_client_cancel: true,
        }
    }
}
```

Add fields to `AppState`:

```rust
pub prompt_queue_policy: RwLock<PromptQueuePolicy>,
pub expired_prompt_queue_count: AtomicU64,
```

Initialize in `Default`:

```rust
prompt_queue_policy: RwLock::new(PromptQueuePolicy::default()),
expired_prompt_queue_count: AtomicU64::new(0),
```

- [x] Step 5: Expose policy in health.

In `health.rs`, import `PromptQueuePolicy`, add fields:

```rust
pub prompt_queue_policy: PromptQueuePolicy,
pub expired_prompt_queue_count: u64,
```

Set them in `build_health_snapshot(...)`:

```rust
prompt_queue_policy: state.prompt_queue_policy.read().map(|value| value.clone()).unwrap_or_default(),
expired_prompt_queue_count: state.expired_prompt_queue_count.load(Ordering::SeqCst),
```

- [x] Step 6: Use policy queue limit in runtime.

In `runtime/mod.rs`, remove the local `DEFAULT_PROMPT_QUEUE_LIMIT` constant.

In `push_queued_prompt(...)`, read:

```rust
let queue_limit = state
    .prompt_queue_policy
    .read()
    .map(|policy| policy.queue_limit)
    .unwrap_or(crate::app_state::DEFAULT_PROMPT_QUEUE_LIMIT);
```

Use `queue_limit` for both the comparison and error payload `queueLimit`.

- [x] Step 7: Filter expired restored prompts.

In `recovery.rs`, before `restore_persistent_queued_prompts(...)`, add:

```rust
let (queued_prompts, expired_count) = filter_restorable_queued_prompts(state, snapshot.queued_prompts);
if expired_count > 0 {
    state.expired_prompt_queue_count.fetch_add(expired_count as u64, std::sync::atomic::Ordering::SeqCst);
    state.push_diagnostic(
        "warning",
        format!("{expired_count} expired queued prompt(s) were dropped during recovery"),
    );
}
restore_persistent_queued_prompts(state, queued_prompts);
```

Add helper:

```rust
fn filter_restorable_queued_prompts(
    state: &AppState,
    prompts: Vec<PersistentQueuedPrompt>,
) -> (Vec<PersistentQueuedPrompt>, usize) {
    let max_age_ms = state
        .prompt_queue_policy
        .read()
        .map(|policy| policy.max_restored_age_ms)
        .unwrap_or(crate::app_state::DEFAULT_PROMPT_QUEUE_MAX_RESTORED_AGE_MS);
    let now = now_ms();
    let mut kept = Vec::new();
    let mut expired = 0usize;
    for prompt in prompts {
        let age = now.saturating_sub(prompt.created_at_ms);
        if prompt.created_at_ms == 0 || age <= max_age_ms {
            kept.push(prompt);
        } else {
            expired += 1;
        }
    }
    (kept, expired)
}
```

- [x] Step 8: Update architecture note.

Append P27 planned/implemented section:

```md
## P27 Queue Policy Controls Behavior

P27 adds first-slice Desktop queue policy controls without moving queue
ownership to relay.

Desktop behavior:

- Health exposes `promptQueuePolicy` and `expiredPromptQueueCount`.
- Queue overflow uses policy `queueLimit`.
- Recovery drops queued prompts older than policy `maxRestoredAgeMs`.
- Expired restored prompts are counted and recorded as Desktop diagnostics.

App behavior:

- App clients may use the policy fields for diagnostics.
- Shared queue rows remain event-authoritative and are not removed
  optimistically.
```

- [x] Step 9: Run focused tests.

Run:

```bash
cd mcode-desktop/src-tauri
cargo test --test desktop_p24_prompt_queue p27_health_exposes_prompt_queue_policy
cargo test --test desktop_p19_recovery_snapshot p27_recovery_drops_expired_queued_prompts
```

Expected: PASS.

- [ ] Step 10: Commit Task 1.

```bash
git add mcode-desktop/src-tauri/src/app_state.rs mcode-desktop/src-tauri/src/health.rs mcode-desktop/src-tauri/src/runtime/mod.rs mcode-desktop/src-tauri/src/recovery.rs mcode-desktop/src-tauri/tests/desktop_p24_prompt_queue.rs mcode-desktop/src-tauri/tests/desktop_p19_recovery_snapshot.rs docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md docs/superpowers/plans/2026-06-28-mcode-p27-queue-policy-controls.md
git commit -m "feat(desktop): add prompt queue policy"
```

## Task 2: Desktop Cancel All Queued Prompts

**Files:**
- Modify: `mcode-desktop/src-tauri/src/runtime/mod.rs`
- Modify: `mcode-desktop/src-tauri/tests/desktop_p24_prompt_queue.rs`
- Modify: `docs/superpowers/plans/2026-06-28-mcode-p27-queue-policy-controls.md`

**Interfaces:**
- Produces Desktop proxy command: `acp_cancel_all_queued_prompts`
- Response: `{ status, sessionId, cancelledCount, queueLength }`

- [x] Step 1: Add failing cancel-all test.

Add to `desktop_p24_prompt_queue.rs`:

```rust
#[tokio::test]
async fn p27_cancels_all_queued_prompts_without_touching_active_turn() {
    let state = AppState::new_for_test();
    let connected = dispatch_desktop_proxy_with_state(
        &state,
        "acp_connect",
        json!({ "agentType": "claude_code", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();
    let session_id = connected["sessionId"].as_str().unwrap().to_string();
    begin_hosted_turn_for_test(&state, &session_id, "turn-live", None).unwrap();
    for prompt in ["first queued", "second queued"] {
        dispatch_desktop_proxy_with_state(
            &state,
            "acp_prompt",
            json!({ "sessionId": session_id, "prompt": prompt }),
        )
        .await
        .unwrap();
    }

    let response = dispatch_desktop_proxy_with_state(
        &state,
        "acp_cancel_all_queued_prompts",
        json!({ "sessionId": session_id, "reason": "user_cancelled_all" }),
    )
    .await
    .unwrap();

    assert_eq!(response["status"], "cancelled");
    assert_eq!(response["cancelledCount"], 2);
    assert_eq!(response["queueLength"], 0);
    let health = build_health_snapshot(&state);
    assert_eq!(health.prompt_queue_count, 0);
    assert_eq!(health.active_turn_count, 1);
}
```

- [x] Step 2: Route command in runtime dispatch.

Add both match arms:

```rust
"acp_cancel_all_queued_prompts" => cancel_all_queued_prompts(state, payload, event_sink),
```

and in arc dispatch:

```rust
"acp_cancel_all_queued_prompts" => {
    cancel_all_queued_prompts(state.as_ref(), payload, event_sink)
}
```

- [x] Step 3: Implement `cancel_all_queued_prompts(...)`.

Add near `cancel_queued_prompt(...)`:

```rust
fn cancel_all_queued_prompts(
    state: &AppState,
    payload: Value,
    event_sink: Option<CliEventSink>,
) -> Result<Value> {
    let session_id = extract_session_id(&payload)
        .ok_or_else(|| anyhow!("cli session id is required"))?
        .to_string();
    let removed = {
        let mut queues = state
            .queued_prompts
            .lock()
            .map_err(|_| anyhow!("queued prompt lock poisoned"))?;
        queues.remove(&session_id).unwrap_or_default()
    };
    let cancelled_count = removed.len();
    let snapshots = removed
        .iter()
        .enumerate()
        .map(|(index, item)| queued_prompt_snapshot(item, index + 1, 0))
        .collect::<Vec<_>>();
    let _ = crate::recovery::save_recovery_snapshot(state);
    for snapshot in &snapshots {
        emit_event(&event_sink, turn_queue_cancelled_event(snapshot));
    }
    if let Some(snapshot) = snapshots.last() {
        emit_event(&event_sink, turn_queue_updated_event(snapshot));
    }
    Ok(json!({
        "status": "cancelled",
        "sessionId": session_id,
        "connectionId": session_id,
        "cancelledCount": cancelled_count,
        "queueLength": 0,
    }))
}
```

- [x] Step 4: Run Desktop cancel-all focused test.

Run:

```bash
cd mcode-desktop/src-tauri
cargo test --test desktop_p24_prompt_queue p27_cancels_all_queued_prompts_without_touching_active_turn
```

Expected: PASS.

- [ ] Step 5: Commit Task 2.

```bash
git add mcode-desktop/src-tauri/src/runtime/mod.rs mcode-desktop/src-tauri/tests/desktop_p24_prompt_queue.rs docs/superpowers/plans/2026-06-28-mcode-p27-queue-policy-controls.md
git commit -m "feat(desktop): cancel all queued prompts"
```

## Task 3: App Clear Shared Queue Action

**Files:**
- Modify: `mcode-app/src/api/acp.ts`
- Modify: `mcode-app/tests/api/acpQueuedPromptCancel.spec.ts`
- Modify: `mcode-app/src/pages/conversation-detail/detailRuntimePresentation.ts`
- Modify: `mcode-app/tests/pages/conversation-detail/detailRuntimePresentation.spec.ts`
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`
- Modify: `mcode-app/src/pages/conversation-detail/index.scss`
- Modify: `docs/superpowers/plans/2026-06-28-mcode-p27-queue-policy-controls.md`

**Interfaces:**
- Produces: `acpApi.acpCancelAllQueuedPrompts(connectionId: string, sessionId?: string | null): Promise<any>`
- Produces: `isSharedPromptQueueClearDisabled(queue, connectionId, clearing): boolean`

- [ ] Step 1: Add API test.

Append to `acpQueuedPromptCancel.spec.ts`:

```ts
it("sends acp_cancel_all_queued_prompts with explicit session id", async () => {
  const calls: Array<{ endpoint: string; data: any }> = []
  acpApi.__setRequestHookForTest((endpoint, data) => {
    calls.push({ endpoint, data })
    return { status: "cancelled", cancelledCount: 2 }
  })

  await expect(
    acpApi.acpCancelAllQueuedPrompts("conn-1", "session-1")
  ).resolves.toEqual({ status: "cancelled", cancelledCount: 2 })

  expect(calls).toEqual([{
    endpoint: "/acp_cancel_all_queued_prompts",
    data: {
      connectionId: "conn-1",
      sessionId: "session-1",
      reason: "user_cancelled_all",
    },
  }])
})
```

- [ ] Step 2: Implement App API wrapper.

In `acp.ts`, after `acpCancelQueuedPrompt(...)`, add:

```ts
async acpCancelAllQueuedPrompts(
  connectionId: string,
  sessionId?: string | null
): Promise<any> {
  return await this.request("/acp_cancel_all_queued_prompts", {
    connectionId,
    sessionId: sessionId || connectionId,
    reason: "user_cancelled_all",
  })
}
```

- [ ] Step 3: Add presentation helper test.

Import `isSharedPromptQueueClearDisabled` and append:

```ts
it("detects shared queue clear disabled state", () => {
  expect(isSharedPromptQueueClearDisabled({ count: 1, items: [] }, "conn-1", false)).toBe(false)
  expect(isSharedPromptQueueClearDisabled({ count: 0, items: [] }, "conn-1", false)).toBe(true)
  expect(isSharedPromptQueueClearDisabled({ count: 1, items: [] }, "", false)).toBe(true)
  expect(isSharedPromptQueueClearDisabled({ count: 1, items: [] }, "conn-1", true)).toBe(true)
})
```

- [ ] Step 4: Implement presentation helper.

In `detailRuntimePresentation.ts`, add:

```ts
export function isSharedPromptQueueClearDisabled(
  queue: SharedPromptQueueViewState | null | undefined,
  connectionId: string | null | undefined,
  clearing: boolean
) {
  if (clearing) return true
  if (!String(connectionId || "").trim()) return true
  return !hasSharedPromptQueue(queue)
}
```

- [ ] Step 5: Add page state and handler.

In `index.vue`, import `isSharedPromptQueueClearDisabled`, add:

```ts
const clearingSharedPromptQueue = ref(false)
const sharedPromptQueueClearDisabled = computed(() =>
  isSharedPromptQueueClearDisabled(
    sharedPromptQueue.value,
    firstString(session.value?.connectionId),
    clearingSharedPromptQueue.value
  )
)
```

Add handler near `cancelSharedPromptQueueItem(...)`:

```ts
async function clearSharedPromptQueue() {
  const connectionId = firstString(session.value?.connectionId)
  if (sharedPromptQueueClearDisabled.value || !connectionId) return
  clearingSharedPromptQueue.value = true
  try {
    await acpApi.acpCancelAllQueuedPrompts(connectionId, connectionId)
  } catch (error) {
    uni.showToast({
      title: "清空队列失败，请稍后重试",
      icon: "none",
      duration: 3000,
    })
  } finally {
    clearingSharedPromptQueue.value = false
  }
}
```

- [ ] Step 6: Add clear action template and styles.

Inside `.shared-queue-panel`, before the `v-for`, add:

```vue
<view class="shared-queue-panel__header">
  <text class="shared-queue-panel__hint">等待 Desktop 当前任务完成后执行</text>
  <view
    class="shared-queue-clear"
    :class="{ 'shared-queue-clear--disabled': sharedPromptQueueClearDisabled }"
    @click.stop="clearSharedPromptQueue"
  >
    {{ clearingSharedPromptQueue ? "清空中" : "清空" }}
  </view>
</view>
```

Add styles before `.shared-queue-item`:

```scss
.shared-queue-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
}

.shared-queue-panel__hint {
  font-size: 20rpx;
  color: var(--up-tips-color, #909193);
}

.shared-queue-clear {
  font-size: 20rpx;
  color: #fa3534;
  padding: 6rpx 10rpx;
  border-radius: 999rpx;
  background-color: color-mix(in srgb, #fa3534 10%, var(--up-card-bg-color, #ffffff) 90%);
  flex-shrink: 0;

  &--disabled {
    color: var(--up-tips-color, #909193);
    background-color: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
    pointer-events: none;
  }
}
```

- [ ] Step 7: Run app focused tests.

Run:

```bash
cd mcode-app
npm run test:unit -- --runTestsByPath tests/api/acpQueuedPromptCancel.spec.ts tests/pages/conversation-detail/detailRuntimePresentation.spec.ts
```

Expected: PASS.

- [ ] Step 8: Commit Task 3.

```bash
git add mcode-app/src/api/acp.ts mcode-app/tests/api/acpQueuedPromptCancel.spec.ts mcode-app/src/pages/conversation-detail/detailRuntimePresentation.ts mcode-app/tests/pages/conversation-detail/detailRuntimePresentation.spec.ts mcode-app/src/pages/conversation-detail/index.vue mcode-app/src/pages/conversation-detail/index.scss docs/superpowers/plans/2026-06-28-mcode-p27-queue-policy-controls.md
git commit -m "feat(app): clear shared prompt queue"
```

## Task 4: Verification And Progress Closure

**Files:**
- Modify: `docs/superpowers/plans/2026-06-28-mcode-p27-queue-policy-controls.md`

- [ ] Step 1: Run Desktop prompt queue tests.

Run:

```bash
cd mcode-desktop/src-tauri
cargo test --test desktop_p24_prompt_queue
```

Expected: PASS.

- [ ] Step 2: Run Desktop recovery tests.

Run:

```bash
cd mcode-desktop/src-tauri
cargo test --test desktop_p19_recovery_snapshot
```

Expected: PASS.

- [ ] Step 3: Run App focused tests.

Run:

```bash
cd mcode-app
npm run test:unit -- --runTestsByPath tests/api/acpQueuedPromptCancel.spec.ts tests/pages/conversation-detail/detailRuntimePresentation.spec.ts
```

Expected: PASS.

- [ ] Step 4: Run repository diff check.

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

- [ ] Step 5: Mark all P27 plan checkboxes complete.

Change completed checkboxes in this file from `[ ]` to `[x]`.

- [ ] Step 6: Commit verification progress.

```bash
git add docs/superpowers/plans/2026-06-28-mcode-p27-queue-policy-controls.md
git commit -m "docs(queue): complete p27 policy controls plan"
```

## Self-Review

- Spec coverage: Desktop policy, restored expiry, health exposure, cancel-all command, app API/UI, docs, and tests are covered.
- Scope control: no relay policy state, queue reorder, priority, scheduling weights, ownership restriction enforcement, or mobile direct official CLI target agents are included.
- Type consistency: Rust uses snake_case fields that serialize to camelCase; app methods use `acpCancelAllQueuedPrompts`; command endpoint is `/acp_cancel_all_queued_prompts`.
