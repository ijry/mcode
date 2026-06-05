# MCode Create Conversation Agent Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add agent-specific dynamic configuration to the `mcode-app` create-conversation sheet, and make those options take real effect on the remote session even for empty conversations.

**Architecture:** `mcode-app` will probe remote ACP agent selectors dynamically per selected agent, render those selectors in the create sheet, and on create will establish a live ACP connection first, apply the selected mode and config options, then create and optionally prompt the conversation. Empty conversations will persist the configured connection/runtime link so the later detail page reuses the already-configured session instead of opening a fresh default one.

**Tech Stack:** `uni-app`, Vue 3 `<script setup>`, existing ACP HTTP endpoints, local conversation runtime store, TypeScript.

---

## File Structure

### Existing files to modify

- `mcode-app/src/types/acp.ts`
  - Extend local ACP types to describe remote agent option snapshots and config selector payloads.
- `mcode-app/src/api/acp.ts`
  - Add explicit client methods for probing agent options and for connecting with mode/config application support.
- `mcode-app/src/pages/conversations/index.vue`
  - Add create-sheet config UI, probe lifecycle, config selection state, and create orchestration changes.
- `mcode-app/src/pages/conversation-detail/index.vue`
  - Reuse preconfigured live ACP connections for empty conversations when available, instead of always creating a fresh default session.
- `mcode-app/src/services/conversation/connectionSessionManager.ts`
  - If needed, expose a small helper for reusing or looking up a preconfigured connection/session by conversation id.
- `mcode-app/src/stores/conversationRuntime.ts`
  - Persist the newly created configured connection/session metadata for empty conversations so detail view can adopt it.

### No new files required for v1

- Keep the implementation local to current create/detail/runtime modules.
- Avoid introducing a separate “agent config service” file unless the page logic becomes unmanageable during implementation.

---

### Task 1: Add ACP agent option snapshot types

**Files:**
- Modify: `mcode-app/src/types/acp.ts`

- [ ] **Step 1: Write the failing type usage target**

Add the following interfaces to the plan scratch so later tasks have stable names:

```ts
export interface SessionModeInfo {
  id: string
  name: string
  description?: string | null
}

export interface SessionModeStateInfo {
  current_mode_id: string
  available_modes: SessionModeInfo[]
}

export interface SessionConfigOptionValueInfo {
  id: string
  name: string
  description?: string | null
}

export interface SessionConfigOptionInfo {
  id: string
  name: string
  description?: string | null
  value: string | null
  available_values: SessionConfigOptionValueInfo[]
}

export interface AgentOptionsSnapshot {
  modes: SessionModeStateInfo | null
  config_options: SessionConfigOptionInfo[]
}
```

- [ ] **Step 2: Add the types to `src/types/acp.ts`**

Insert the exact interfaces above below the existing mode / connection types so page code can import them from one place.

- [ ] **Step 3: Run a focused search to verify names are unique**

Run: `rg -n "interface AgentOptionsSnapshot|interface SessionConfigOptionInfo|interface SessionModeStateInfo" src/types/acp.ts`

Expected: one definition per interface in `src/types/acp.ts`

- [ ] **Step 4: Commit**

```bash
git add mcode-app/src/types/acp.ts
git commit -m "feat: add local ACP agent option snapshot types"
```

---

### Task 2: Add ACP API methods for probing and applying selectors

**Files:**
- Modify: `mcode-app/src/api/acp.ts`
- Modify: `mcode-app/src/types/acp.ts`

- [ ] **Step 1: Add imports for the new types**

Update the top import block in `src/api/acp.ts` to include:

```ts
import type {
  PromptInputBlock,
  ConnectionInfo,
  EventEnvelope,
  UploadAttachmentResult,
  ConversationDetail,
  AgentOptionsSnapshot,
} from "@/types/acp"
```

- [ ] **Step 2: Add a probe method to the ACP client**

Add this method near the ACP agent/status helpers:

```ts
  async acpProbeAgentOptions(agentType: string): Promise<AgentOptionsSnapshot> {
    return await this.request("/acp_probe_agent_options", {
      agentType,
    })
  }
```

If the actual remote endpoint name in this repo differs after implementation inspection, use the real route, but keep the call shape stable for page code.

- [ ] **Step 3: Keep connect/config methods aligned with create flow**

Verify the page can call:

```ts
await acpApi.acpConnect(agentType, workingDir, sessionId, preferredModeId)
await acpApi.acpSetConfigOption(connectionId, configId, valueId)
```

No signature change is needed if current methods already accept these values. Only normalize naming or comments if required.

- [ ] **Step 4: Run a focused search to confirm the new API surface exists**

Run: `rg -n "acpProbeAgentOptions|acpSetConfigOption|acpConnect\\(" src/api/acp.ts`

Expected: all three methods appear in `src/api/acp.ts`

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/api/acp.ts mcode-app/src/types/acp.ts
git commit -m "feat: add ACP agent option probe API"
```

---

### Task 3: Add create-sheet config state and remote probe lifecycle

**Files:**
- Modify: `mcode-app/src/pages/conversations/index.vue`

- [ ] **Step 1: Add create-sheet config state types inside the page**

Insert local page-only state shapes such as:

```ts
interface CreateAgentConfigState {
  status: "idle" | "loading" | "ready" | "failed"
  modes: SessionModeStateInfo | null
  configOptions: SessionConfigOptionInfo[]
  selectedModeId: string | null
  selectedValues: Record<string, string>
  message: string
}
```

- [ ] **Step 2: Add reactive state for create config**

Add refs near the other create-sheet state:

```ts
const createAgentConfig = ref<CreateAgentConfigState>({
  status: "idle",
  modes: null,
  configOptions: [],
  selectedModeId: null,
  selectedValues: {},
  message: "",
})

let createAgentProbeToken = 0
```

- [ ] **Step 3: Add helpers to reset and project defaults**

Add helper functions:

```ts
function resetCreateAgentConfig(message = "") {
  createAgentConfig.value = {
    status: "idle",
    modes: null,
    configOptions: [],
    selectedModeId: null,
    selectedValues: {},
    message,
  }
}

function buildDefaultSelectedValues(options: SessionConfigOptionInfo[]) {
  const selected: Record<string, string> = {}
  for (const option of options) {
    const current = typeof option.value === "string" && option.value
      ? option.value
      : option.available_values[0]?.id
    if (current) selected[option.id] = current
  }
  return selected
}
```

- [ ] **Step 4: Add a probe function tied to current connection + agent**

Add a function shaped like:

```ts
async function loadCreateAgentConfig() {
  if (!showCreateDialog.value || !selectedConnectionKey.value || !selectedAgentType.value) {
    resetCreateAgentConfig("")
    return
  }

  const targetConn = getConnectedConnections().find(
    (item) => connectionKey(item) === selectedConnectionKey.value
  )
  if (!targetConn) {
    resetCreateAgentConfig("连接不可用，将使用远端默认配置")
    return
  }

  const token = ++createAgentProbeToken
  createAgentConfig.value = {
    status: "loading",
    modes: null,
    configOptions: [],
    selectedModeId: null,
    selectedValues: {},
    message: "",
  }

  try {
    const gateway = await createConnectionGateway(targetConn)
    const snapshot = await gateway.call<AgentOptionsSnapshot>("acp_probe_agent_options", {
      agentType: selectedAgentType.value,
    })
    if (token !== createAgentProbeToken) return

    const configOptions = Array.isArray(snapshot?.config_options)
      ? snapshot.config_options
      : []
    const modes = snapshot?.modes ?? null

    createAgentConfig.value = {
      status: "ready",
      modes,
      configOptions,
      selectedModeId: modes?.current_mode_id ?? null,
      selectedValues: buildDefaultSelectedValues(configOptions),
      message:
        !modes && configOptions.length === 0
          ? "该智能体将使用远端默认配置"
          : "",
    }
  } catch (error) {
    if (token !== createAgentProbeToken) return
    resetCreateAgentConfig("读取失败，将使用远端默认配置")
    createAgentConfig.value.status = "failed"
  }
}
```

- [ ] **Step 5: Trigger probing from create-sheet lifecycle**

Add watchers or explicit calls so probe runs when:

```ts
watch(
  () => [showCreateDialog.value, selectedConnectionKey.value, selectedAgentType.value],
  ([open]) => {
    if (!open) {
      createAgentProbeToken += 1
      resetCreateAgentConfig("")
      return
    }
    void loadCreateAgentConfig()
  }
)
```

- [ ] **Step 6: Run a focused search to verify probe flow exists**

Run: `rg -n "CreateAgentConfigState|loadCreateAgentConfig|createAgentProbeToken|buildDefaultSelectedValues" src/pages/conversations/index.vue`

Expected: all four symbols appear

- [ ] **Step 7: Commit**

```bash
git add mcode-app/src/pages/conversations/index.vue
git commit -m "feat: add create-sheet agent config probe state"
```

---

### Task 4: Render dynamic agent config selectors in the create sheet

**Files:**
- Modify: `mcode-app/src/pages/conversations/index.vue`

- [ ] **Step 1: Add computed helpers for UI rendering**

Add helpers such as:

```ts
const hasCreateAgentConfig = computed(() => {
  return Boolean(
    createAgentConfig.value.modes ||
    createAgentConfig.value.configOptions.length > 0
  )
})
```

And event handlers:

```ts
function selectCreateMode(modeId: string) {
  createAgentConfig.value.selectedModeId = modeId
}

function selectCreateConfigValue(configId: string, valueId: string) {
  createAgentConfig.value = {
    ...createAgentConfig.value,
    selectedValues: {
      ...createAgentConfig.value.selectedValues,
      [configId]: valueId,
    },
  }
}
```

- [ ] **Step 2: Add config section to the create-sheet template**

Insert a new form group below the agent selector:

```vue
<view class="form-group">
  <text class="form-label">智能体配置</text>

  <view v-if="createAgentConfig.status === 'loading'" class="config-loading">
    <up-loading-icon size="18" color="#2979ff"></up-loading-icon>
    <text class="config-loading__text">正在读取可用配置...</text>
  </view>

  <view
    v-else-if="createAgentConfig.message"
    class="config-hint"
  >
    <text class="config-hint__text">{{ createAgentConfig.message }}</text>
  </view>

  <view v-if="createAgentConfig.modes" class="config-section">
    <text class="config-section__title">模式</text>
    <view class="config-chip-grid">
      <view
        v-for="mode in createAgentConfig.modes.available_modes"
        :key="mode.id"
        :class="[
          'config-chip',
          createAgentConfig.selectedModeId === mode.id && 'config-chip--active',
        ]"
        @click="selectCreateMode(mode.id)"
      >
        <text class="config-chip__title">{{ mode.name }}</text>
      </view>
    </view>
  </view>

  <view
    v-for="option in createAgentConfig.configOptions"
    :key="option.id"
    class="config-section"
  >
    <text class="config-section__title">{{ option.name }}</text>
    <view class="config-chip-grid">
      <view
        v-for="value in option.available_values"
        :key="value.id"
        :class="[
          'config-chip',
          createAgentConfig.selectedValues[option.id] === value.id && 'config-chip--active',
        ]"
        @click="selectCreateConfigValue(option.id, value.id)"
      >
        <text class="config-chip__title">{{ value.name }}</text>
      </view>
    </view>
  </view>
</view>
```

- [ ] **Step 3: Add minimal styles for the config section**

Add scoped styles:

```scss
.config-loading {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 12rpx 4rpx;
}

.config-loading__text,
.config-hint__text {
  font-size: 24rpx;
  color: #7a8191;
}

.config-section {
  margin-top: 20rpx;
}

.config-section__title {
  display: block;
  margin-bottom: 12rpx;
  font-size: 24rpx;
  color: #5f6470;
}

.config-chip-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.config-chip {
  padding: 14rpx 20rpx;
  border-radius: 999rpx;
  background: #f5f6f8;
  border: 2rpx solid transparent;
}

.config-chip--active {
  background: #eef4ff;
  border-color: #2979ff;
}

.config-chip__title {
  font-size: 24rpx;
  color: #303133;
}
```

- [ ] **Step 4: Verify there is no dead create-sheet agent config UI path**

Run: `rg -n "智能体配置|config-loading|config-chip-grid|selectCreateConfigValue|selectCreateMode" src/pages/conversations/index.vue`

Expected: all selectors and styles are present

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/pages/conversations/index.vue
git commit -m "feat: render dynamic agent config in create sheet"
```

---

### Task 5: Apply mode and config options before creating the conversation

**Files:**
- Modify: `mcode-app/src/pages/conversations/index.vue`

- [ ] **Step 1: Add a helper to apply selected config to a live connection**

Add:

```ts
async function applyCreateAgentConfig(
  gateway: Awaited<ReturnType<typeof createConnectionGateway>>,
  connectionId: string
) {
  for (const option of createAgentConfig.value.configOptions) {
    const selectedValueId = createAgentConfig.value.selectedValues[option.id]
    if (!selectedValueId) continue
    await gateway.call("acp_set_config_option", {
      connectionId,
      configId: option.id,
      valueId: selectedValueId,
    })
  }
}
```

- [ ] **Step 2: Change `confirmCreate()` so connect happens first**

Refactor the create flow inside `confirmCreate()` to:

```ts
const connectionInfo = await gateway.call<ConnectionInfo>("acp_connect", {
  agentType: selectedAgentType.value,
  preferredModeId: createAgentConfig.value.selectedModeId || undefined,
})
const connectionId = typeof connectionInfo === "string"
  ? connectionInfo
  : connectionInfo?.id

if (!connectionId) {
  throw new Error("智能体连接失败：返回数据异常")
}

await applyCreateAgentConfig(gateway, connectionId)

const createResult = await gateway.call<any>("create_conversation", {
  folderId: selectedProjectId.value,
  agentType: selectedAgentType.value,
  title: newConversationTitle.value || undefined,
})
```

If the current gateway wrapper returns `string` for `acp_connect`, normalize that in local code and keep the error handling explicit.

- [ ] **Step 3: Prompt only after the configured connection already exists**

Replace the current prompt branch with:

```ts
const taskContent = newTaskContent.value.trim()
if (taskContent) {
  await gateway.call("acp_prompt", {
    connectionId,
    blocks: [{ type: "text", text: taskContent }],
    folderId: selectedProjectId.value,
    conversationId: newConversationId,
  })
}
```

This must reuse the already configured `connectionId`, not create a second default connection.

- [ ] **Step 4: Fail hard on config-application error**

Ensure `confirmCreate()` does not swallow `acp_set_config_option` failures. The existing outer `catch` should surface them as `创建失败: ...`.

- [ ] **Step 5: Verify no second `acp_connect` remains in create flow**

Run: `rg -n "acp_connect|acp_prompt|create_conversation" src/pages/conversations/index.vue`

Expected: one `acp_connect` in `confirmCreate`, then `create_conversation`, then optional `acp_prompt`

- [ ] **Step 6: Commit**

```bash
git add mcode-app/src/pages/conversations/index.vue
git commit -m "feat: apply agent config before conversation create"
```

---

### Task 6: Persist configured connection/runtime metadata for empty conversations

**Files:**
- Modify: `mcode-app/src/pages/conversations/index.vue`
- Modify: `mcode-app/src/stores/conversationRuntime.ts`
- Modify: `mcode-app/src/services/conversation/connectionSessionManager.ts`

- [ ] **Step 1: Inspect existing runtime store/session metadata shape**

Before editing, read the current conversation runtime/session record shape and identify where connection id / session id / agent type are already stored. Use that existing shape instead of inventing a parallel cache.

Run: `rg -n "connectionId|sessionId|agentType|conversationId" src/stores/conversationRuntime.ts src/services/conversation/connectionSessionManager.ts`

Expected: existing runtime/session metadata fields are visible

- [ ] **Step 2: Add or reuse a store action for prebinding a created conversation**

Add a store helper shaped like:

```ts
function bindCreatedConversationRuntime(input: {
  conversationId: number
  folderId: number
  agentType: string
  connectionId: string
  sessionId?: string
}) {
  // store enough metadata so detail view can reuse this connection
}
```

Use existing state shape if such an action already exists under another name.

- [ ] **Step 3: Call the store binding after successful create**

Inside `confirmCreate()` after `newConversationId` is known and before navigation:

```ts
runtime.bindCreatedConversationRuntime({
  conversationId: newConversationId,
  folderId: selectedProjectId.value,
  agentType: selectedAgentType.value,
  connectionId,
  sessionId:
    typeof connectionInfo === "object" && connectionInfo?.sessionId
      ? connectionInfo.sessionId
      : "",
})
```

- [ ] **Step 4: Ensure empty conversations are also marked dirty/openable**

Keep existing:

```ts
markConversationListDirty()
await loadOverviewData({ force: true })
openConversation(...)
```

No behavioral change beyond preserving the configured live runtime.

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/pages/conversations/index.vue mcode-app/src/stores/conversationRuntime.ts mcode-app/src/services/conversation/connectionSessionManager.ts
git commit -m "feat: persist configured runtime for empty conversations"
```

---

### Task 7: Reuse the preconfigured connection in conversation detail

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`
- Modify: `mcode-app/src/stores/conversationRuntime.ts`
- Modify: `mcode-app/src/services/conversation/connectionSessionManager.ts`

- [ ] **Step 1: Write the expected reuse behavior in code comments/tests scratch**

Target behavior:

```ts
// If create flow already established a live connection for this conversation,
// detail page must reuse it instead of calling acp_connect again with defaults.
```

- [ ] **Step 2: Find the current connect-on-open branch**

Search for the branch in `conversation-detail/index.vue` that creates a connection when loading a conversation and identify the exact point where `acp_connect` is called.

Run: `rg -n "acp_connect|connectionId|connectConversation|sessionId" src/pages/conversation-detail/index.vue`

Expected: the detail page connection bootstrap points are visible

- [ ] **Step 3: Add reuse lookup before creating a new connection**

Implement logic shaped like:

```ts
const existingRuntime = runtime.getExistingConversationRuntime(conversationId.value)
if (existingRuntime?.connectionId) {
  // reuse existing connection/session metadata
} else {
  // fall back to current acp_connect path
}
```

The exact helper names should match the real store API after Task 6.

- [ ] **Step 4: Preserve current behavior for conversations without prebound runtime**

Do not regress ordinary history/open paths. Only skip fresh connect when a preconfigured runtime is already known and still valid.

- [ ] **Step 5: Add defensive fallback**

If reuse fails because the stored connection is stale or the detail page cannot hydrate from it, immediately fall back to the existing fresh-connect path and continue loading the conversation.

- [ ] **Step 6: Commit**

```bash
git add mcode-app/src/pages/conversation-detail/index.vue mcode-app/src/stores/conversationRuntime.ts mcode-app/src/services/conversation/connectionSessionManager.ts
git commit -m "feat: reuse configured connection in conversation detail"
```

---

### Task 8: Preserve create-sheet reset semantics and failure messaging

**Files:**
- Modify: `mcode-app/src/pages/conversations/index.vue`

- [ ] **Step 1: Reset config state when opening a fresh create sheet**

Ensure `createConversation(projectId?)` resets:

```ts
resetCreateAgentConfig("")
selectedAgentType.value = "claude_code"
selectedAgentName.value = "Claude Code"
```

and then lets the probe watcher refill state.

- [ ] **Step 2: Reset config state when create succeeds**

After successful create and before leaving the sheet:

```ts
resetCreateAgentConfig("")
```

- [ ] **Step 3: Keep probe-failure flow non-blocking**

Verify the create button disable expression remains based on required connection/project inputs only, not on `createAgentConfig.status`.

- [ ] **Step 4: Keep config-apply failure blocking**

Verify the code path still throws on failed `acp_set_config_option`, and that the outer catch shows the error toast.

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/pages/conversations/index.vue
git commit -m "feat: finalize create-sheet config reset behavior"
```

---

### Task 9: Verification

**Files:**
- Modify: `mcode-app/src/pages/conversations/index.vue`
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`
- Modify: `mcode-app/src/api/acp.ts`
- Modify: `mcode-app/src/types/acp.ts`
- Modify: `mcode-app/src/stores/conversationRuntime.ts`
- Modify: `mcode-app/src/services/conversation/connectionSessionManager.ts`

- [ ] **Step 1: Run focused static verification**

Run: `rg -n "acp_probe_agent_options|applyCreateAgentConfig|bindCreatedConversationRuntime|selectedModeId|selectedValues" src`

Expected: all new flow symbols appear in the intended files only

- [ ] **Step 2: Run TypeScript check**

Run: `npx vue-tsc --noEmit`

Expected: no new errors attributable to the new create-agent-config code. Existing repo-wide errors may remain if unrelated; document them explicitly.

- [ ] **Step 3: Manual verification checklist**

Run these manually in the app:

1. Create a Codex conversation and verify the sheet shows dynamic selector groups.
2. Select a non-default mode/model and create with task content.
3. Create a Claude conversation with a permission-related option such as bypass if exposed.
4. Create an empty conversation and immediately open detail view.
5. Verify empty conversation does not silently reconnect with defaults.
6. Verify an agent with no selectors shows the default hint and still creates successfully.
7. Simulate probe failure and verify creation still works with the fallback hint.

Expected:

- selectors appear only for the chosen agent
- create uses one configured ACP connection
- empty conversations preserve runtime configuration
- fallback messaging matches the spec

- [ ] **Step 4: Final commit**

```bash
git add mcode-app/src/types/acp.ts mcode-app/src/api/acp.ts mcode-app/src/pages/conversations/index.vue mcode-app/src/pages/conversation-detail/index.vue mcode-app/src/stores/conversationRuntime.ts mcode-app/src/services/conversation/connectionSessionManager.ts
git commit -m "feat: add dynamic agent config to create conversation flow"
```

---

## Self-Review

### Spec coverage

- Dynamic per-agent config UI: covered by Tasks 3 and 4
- Remote dynamic option loading: covered by Tasks 2 and 3
- Real config application before create/prompt: covered by Task 5
- Empty conversation real configured session: covered by Tasks 6 and 7
- Probe failure non-blocking fallback: covered by Tasks 3 and 8
- Existing sidebar refresh workaround preserved: covered by Task 5 and manual verification in Task 9

No uncovered spec requirement remains.

### Placeholder scan

- No `TODO`, `TBD`, or “implement later” placeholders remain.
- Each task has concrete file targets, code shapes, commands, and commit steps.

### Type consistency

- `AgentOptionsSnapshot`, `SessionModeStateInfo`, `SessionConfigOptionInfo`, `selectedModeId`, and `selectedValues` naming is consistent across tasks.
- Runtime binding helper names are intentionally marked to align with the actual store API if existing code already exposes equivalent behavior; this is the only place implementer inspection is required before choosing final symbol names.
