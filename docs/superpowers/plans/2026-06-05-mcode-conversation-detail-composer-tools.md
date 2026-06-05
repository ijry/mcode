# MCode Conversation Detail Composer Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the conversation detail `+` action with an inline composer tools panel that supports attachment upload, todo insertion, and live session config changes for model, reasoning strength, and permission profile.

**Architecture:** Keep the first version local to the conversation detail page, but extract pure helper logic for config-category mapping and todo parsing into a focused service module so the page does not absorb all of the complexity. The detail page will probe remote agent options after runtime connection setup, render one expandable config row at a time, apply changes immediately when a live ACP connection exists, and replay queued local selections when the page obtains a connection later.

**Tech Stack:** Vue 3 `<script setup>`, uni-app, TypeScript, existing ACP HTTP APIs, Pinia runtime store, `vue-tsc`

---

## File Structure

### Files to create

- `mcode-app/src/services/conversation/composerTools.ts`
  - Pure helpers for dynamic config mapping, default selection projection, and local todo parsing.

### Files to modify

- `mcode-app/src/pages/conversation-detail/index.vue`
  - Replace the old attachment action sheet entry with the inline tools panel, local panel state, todo picker, remote config probe, immediate config apply, deferred config replay, and scoped styles.
- `mcode-app/src/types/acp.ts`
  - Reuse existing remote agent option types from the detail page import surface if the page currently imports too narrow a type subset.

### No new global store or backend API changes

- Keep deferred selections page-local in v1.
- Reuse `acp_describe_agent_options`, `acp_set_mode`, `acp_set_config_option`, `acp_connect`, and the existing upload helpers.

---

### Task 1: Extract pure composer-tools helpers

**Files:**
- Create: `mcode-app/src/services/conversation/composerTools.ts`
- Modify: `mcode-app/src/types/acp.ts`

- [ ] **Step 1: Add helper-owned types and empty-state builders**

Create `src/services/conversation/composerTools.ts` with the page-local helper types that the detail page will import:

```ts
import type {
  AgentOptionsSnapshot,
  SessionConfigOptionInfo,
  SessionConfigOptionValueInfo,
  SessionModeInfo,
  SessionModeStateInfo,
} from "@/types/acp"

export type ComposerConfigKey = "model" | "reasoning" | "permission" | ""

export interface DetailAgentConfigState {
  status: "idle" | "loading" | "ready" | "failed"
  modes: SessionModeStateInfo | null
  configOptions: SessionConfigOptionInfo[]
  selectedModeId: string | null
  selectedValues: Record<string, string>
  message: string
}

export interface ComposerTodoItem {
  id: string
  text: string
  completed: boolean
}

export function createEmptyDetailAgentConfigState(message = ""): DetailAgentConfigState {
  return {
    status: "idle",
    modes: null,
    configOptions: [],
    selectedModeId: null,
    selectedValues: {},
    message,
  }
}
```

- [ ] **Step 2: Add default-selection and category-matching helpers**

Continue the same file with deterministic projection helpers:

```ts
const REASONING_KEYWORDS = ["reasoning", "thinking", "effort"]
const PERMISSION_KEYWORDS = ["permission", "approval", "sandbox", "auth"]

function normalizeLabel(value: unknown) {
  return String(value || "").trim().toLowerCase()
}

function containsKeyword(option: SessionConfigOptionInfo, keywords: string[]) {
  const haystack = [
    option.id,
    option.name,
    option.description,
    option.category,
  ]
    .map(normalizeLabel)
    .join(" ")

  return keywords.some((keyword) => haystack.includes(keyword))
}

export function buildDefaultSelectedValues(options: SessionConfigOptionInfo[]) {
  const selected: Record<string, string> = {}
  for (const option of options) {
    const current =
      typeof option.kind?.current_value === "string" && option.kind.current_value
        ? option.kind.current_value
        : option.kind?.options?.[0]?.value
    if (current) selected[option.id] = current
  }
  return selected
}

export function findReasoningOption(options: SessionConfigOptionInfo[]) {
  return options.find((option) => containsKeyword(option, REASONING_KEYWORDS)) ?? null
}

export function findPermissionOption(options: SessionConfigOptionInfo[]) {
  return options.find((option) => containsKeyword(option, PERMISSION_KEYWORDS)) ?? null
}
```

- [ ] **Step 3: Add summary and todo helpers**

Finish the helper file with value lookup and local todo parsing:

```ts
export function findModeName(modes: SessionModeStateInfo | null, selectedModeId: string | null) {
  if (!modes || !selectedModeId) return ""
  return modes.available_modes.find((mode) => mode.id === selectedModeId)?.name || ""
}

export function findSelectedOptionValueName(
  option: SessionConfigOptionInfo | null,
  selectedValues: Record<string, string>
) {
  if (!option) return ""
  const selectedValue = selectedValues[option.id]
  return option.kind.options.find((item) => item.value === selectedValue)?.name || ""
}

export function parseIncompleteTodos(raw: unknown): ComposerTodoItem[] {
  const source = Array.isArray(raw) ? raw : []
  return source
    .map((item) => ({
      id: String((item as Record<string, unknown>)?.id || ""),
      text: String((item as Record<string, unknown>)?.text || "").trim(),
      completed: Boolean((item as Record<string, unknown>)?.completed),
    }))
    .filter((item) => item.id && item.text && !item.completed)
}

export function createReadyDetailAgentConfigState(snapshot: AgentOptionsSnapshot): DetailAgentConfigState {
  const configOptions = Array.isArray(snapshot?.config_options) ? snapshot.config_options : []
  const modes = snapshot?.modes ?? null
  return {
    status: "ready",
    modes,
    configOptions,
    selectedModeId: modes?.current_mode_id ?? null,
    selectedValues: buildDefaultSelectedValues(configOptions),
    message: !modes && configOptions.length === 0 ? "该智能体将使用远端默认配置" : "",
  }
}
```

- [ ] **Step 4: Verify helper/type surface**

Run: `rg -n "createEmptyDetailAgentConfigState|buildDefaultSelectedValues|findReasoningOption|findPermissionOption|parseIncompleteTodos" mcode-app/src/services/conversation/composerTools.ts`

Expected: one definition for each exported helper in `composerTools.ts`.

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/services/conversation/composerTools.ts mcode-app/src/types/acp.ts
git commit -m "feat: add composer tools helper module"
```

---

### Task 2: Replace the old `+` behavior with an inline panel shell

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`

- [ ] **Step 1: Add helper imports and local panel state**

Update the detail page imports and local refs:

```ts
import type {
  AgentOptionsSnapshot,
  PromptInputBlock,
  ToolCall,
  ContentPart,
  MessageTurn,
  PermissionRequest,
  SessionConfigOptionInfo,
} from "@/types/acp"
import {
  createEmptyDetailAgentConfigState,
  createReadyDetailAgentConfigState,
  findModeName,
  findPermissionOption,
  findReasoningOption,
  findSelectedOptionValueName,
  parseIncompleteTodos,
  type ComposerConfigKey,
  type ComposerTodoItem,
  type DetailAgentConfigState,
} from "@/services/conversation/composerTools"

const showComposerTools = ref(false)
const expandedConfigKey = ref<ComposerConfigKey>("")
const showAttachmentKinds = ref(false)
const showTodoPicker = ref(false)
const detailAgentConfig = ref<DetailAgentConfigState>(createEmptyDetailAgentConfigState())
const availableTodos = ref<ComposerTodoItem[]>([])
let detailAgentProbeToken = 0
```

- [ ] **Step 2: Replace the old input-row `+` handler and insert the panel template**

In the template, replace:

```vue
<view class="input-action" @click="openAttachActions">
  <up-icon name="plus" size="18" color="#606266"></up-icon>
</view>
```

with:

```vue
<view class="input-action" @click="toggleComposerTools">
  <up-icon :name="showComposerTools ? 'close' : 'plus'" size="18" color="#606266"></up-icon>
</view>
```

Then insert the panel between `permission-card` and `upload-queue`:

```vue
<view v-if="showComposerTools" class="composer-tools">
  <view class="composer-tools__section">
    <text class="composer-tools__title">快捷操作</text>
    <view class="composer-tools__actions">
      <view class="composer-tools__action" @click="toggleAttachmentKinds">
        <text>附件上传</text>
      </view>
      <view class="composer-tools__action" @click="openTodoPicker">
        <text>从待办选择获取任务</text>
      </view>
    </view>
    <view v-if="showAttachmentKinds" class="composer-tools__subactions">
      <view class="composer-tools__subaction" @click="handleChooseImages">图片</view>
      <view class="composer-tools__subaction" @click="handleChooseFiles">文件</view>
    </view>
  </view>

  <view class="composer-tools__section">
    <text class="composer-tools__title">会话配置</text>
    <!-- config rows inserted in Task 4 -->
  </view>
</view>
```

- [ ] **Step 3: Add panel toggle helpers and remove the old action sheet path**

Delete `openAttachActions()` and add:

```ts
function toggleComposerTools() {
  showComposerTools.value = !showComposerTools.value
  if (!showComposerTools.value) {
    expandedConfigKey.value = ""
    showAttachmentKinds.value = false
  }
}

function closeComposerTools() {
  showComposerTools.value = false
  expandedConfigKey.value = ""
  showAttachmentKinds.value = false
}

function toggleAttachmentKinds() {
  showAttachmentKinds.value = !showAttachmentKinds.value
}
```

- [ ] **Step 4: Keep viewport measurement in sync with the new panel**

Extend the existing composer-layout watcher input:

```ts
watch(
  () => [
    attachments.value.length,
    uploadQueue.value.length,
    draftQueue.value.length,
    queueExpanded.value,
    slashState.value.visible,
    filteredSlashCommands.value.length,
    showComposerTools.value,
    showAttachmentKinds.value,
    showTodoPicker.value,
    expandedConfigKey.value,
  ],
  () => {
    if (!hasInitialBottomScroll.value) return
    scheduleViewportSync()
  }
)
```

- [ ] **Step 5: Verify the shell compiles**

Run: `npx vue-tsc --noEmit`

Expected: the detail page type-checks after the old attachment action sheet path is removed.

- [ ] **Step 6: Commit**

```bash
git add mcode-app/src/pages/conversation-detail/index.vue
git commit -m "feat: add inline composer tools shell"
```

---

### Task 3: Wire quick actions for attachment upload and todo insertion

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`

- [ ] **Step 1: Add attachment wrappers that honor the mixed-collapse rule**

Keep `chooseImages()` and `chooseFiles()` unchanged, but add wrappers:

```ts
function handleChooseImages() {
  showAttachmentKinds.value = false
  closeComposerTools()
  chooseImages()
}

function handleChooseFiles() {
  showAttachmentKinds.value = false
  closeComposerTools()
  chooseFiles()
}
```

- [ ] **Step 2: Add todo-sheet open and select behavior**

Insert local todo helpers:

```ts
function loadAvailableTodos() {
  const raw = uni.getStorageSync("mcode_todos")
  availableTodos.value = parseIncompleteTodos(raw)
}

function openTodoPicker() {
  loadAvailableTodos()
  showTodoPicker.value = true
}

function selectTodoForComposer(item: ComposerTodoItem) {
  inputText.value = inputText.value.trim()
    ? `${inputText.value}\n${item.text}`
    : item.text
  showTodoPicker.value = false
  closeComposerTools()
}
```

- [ ] **Step 3: Render the todo bottom sheet**

Add a bottom popup after the existing plan drawer popup:

```vue
<up-popup v-model:show="showTodoPicker" mode="bottom" :round="20">
  <view class="todo-picker">
    <view class="todo-picker__hd">
      <text class="todo-picker__title">选择待办</text>
    </view>
    <view v-if="availableTodos.length === 0" class="todo-picker__empty">
      <text>暂无未完成待办</text>
    </view>
    <view
      v-for="item in availableTodos"
      :key="item.id"
      class="todo-picker__item"
      @click="selectTodoForComposer(item)"
    >
      <text class="todo-picker__text">{{ item.text }}</text>
    </view>
  </view>
</up-popup>
```

- [ ] **Step 4: Add scoped styles for the quick-action panel and todo sheet**

Append styles shaped like:

```scss
.composer-tools {
  margin-bottom: 20rpx;
  padding: 24rpx;
  border-radius: 24rpx;
  background: #ffffff;
  box-shadow: 0 12rpx 32rpx rgba(15, 23, 42, 0.06);
}

.composer-tools__actions,
.composer-tools__subactions {
  display: flex;
  gap: 16rpx;
  flex-wrap: wrap;
}

.todo-picker {
  padding: 24rpx 24rpx calc(24rpx + env(safe-area-inset-bottom));
}
```

- [ ] **Step 5: Verify quick actions**

Run: `npx vue-tsc --noEmit`

Expected: the new wrappers and todo popup type-check with the existing upload helpers and local todo shape.

- [ ] **Step 6: Commit**

```bash
git add mcode-app/src/pages/conversation-detail/index.vue
git commit -m "feat: add composer quick actions"
```

---

### Task 4: Probe remote agent options and render the three config rows

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`

- [ ] **Step 1: Add computed category rows for model, reasoning, and permission**

Add computed state near the other page computeds:

```ts
const reasoningOption = computed(() =>
  findReasoningOption(detailAgentConfig.value.configOptions)
)

const permissionOption = computed(() =>
  findPermissionOption(detailAgentConfig.value.configOptions)
)

const modelSummary = computed(() =>
  findModeName(detailAgentConfig.value.modes, detailAgentConfig.value.selectedModeId) || "远端未提供"
)

const reasoningSummary = computed(() =>
  findSelectedOptionValueName(reasoningOption.value, detailAgentConfig.value.selectedValues) || "远端未提供"
)

const permissionSummary = computed(() =>
  findSelectedOptionValueName(permissionOption.value, detailAgentConfig.value.selectedValues) || "远端未提供"
)
```

- [ ] **Step 2: Add the remote probe lifecycle**

Insert the probe function and connection-aware loader:

```ts
async function loadDetailAgentConfig() {
  const conn = session.value?.connectionId
  if (!conversationId.value || !currentAgentType.value) {
    detailAgentConfig.value = createEmptyDetailAgentConfigState()
    return
  }

  const token = ++detailAgentProbeToken
  detailAgentConfig.value = {
    ...createEmptyDetailAgentConfigState(),
    status: "loading",
  }

  try {
    const snapshot = await acpApi.acpDescribeAgentOptions(currentAgentType.value, undefined)
    if (token !== detailAgentProbeToken) return
    detailAgentConfig.value = createReadyDetailAgentConfigState(snapshot)
  } catch (error) {
    if (token !== detailAgentProbeToken) return
    detailAgentConfig.value = {
      ...createEmptyDetailAgentConfigState("读取失败，将使用远端默认配置"),
      status: "failed",
    }
  }
}
```

Call `void loadDetailAgentConfig()` at the end of `loadConversation()` after `runtime.connect(...)` and snapshot hydration complete.

- [ ] **Step 3: Render one expandable config row at a time**

Fill the `会话配置` section with rows:

```vue
<view class="composer-config-row" @click="toggleConfigRow('model')">
  <text class="composer-config-row__label">模型</text>
  <text class="composer-config-row__value">{{ modelSummary }}</text>
</view>
<view
  v-if="expandedConfigKey === 'model' && detailAgentConfig.modes?.available_modes?.length"
  class="config-chip-grid"
>
  <view
    v-for="mode in detailAgentConfig.modes.available_modes"
    :key="mode.id"
    :class="['config-chip', detailAgentConfig.selectedModeId === mode.id && 'config-chip--active']"
    @click.stop="selectDetailMode(mode.id)"
  >
    <text class="config-chip__title">{{ mode.name }}</text>
  </view>
</view>
```

Repeat the same pattern for `推理强度` and `授权类型`, but render `option.kind.options` and bind clicks to `selectDetailConfigValue(option.id, value.value)`.

- [ ] **Step 4: Add row toggle logic with unavailable guards**

Add:

```ts
function toggleConfigRow(key: ComposerConfigKey) {
  if (key === "model" && !detailAgentConfig.value.modes?.available_modes?.length) return
  if (key === "reasoning" && !reasoningOption.value) return
  if (key === "permission" && !permissionOption.value) return
  expandedConfigKey.value = expandedConfigKey.value === key ? "" : key
}
```

- [ ] **Step 5: Verify config render path**

Run: `npx vue-tsc --noEmit`

Expected: the detail page compiles with dynamic config rows and no references to the old empty `showModelPicker` flow.

- [ ] **Step 6: Commit**

```bash
git add mcode-app/src/pages/conversation-detail/index.vue
git commit -m "feat: render composer config rows"
```

---

### Task 5: Apply config changes immediately and replay local selections after connection

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`

- [ ] **Step 1: Add immediate apply handlers for live connections**

Insert handlers:

```ts
async function selectDetailMode(modeId: string) {
  const conn = session.value?.connectionId
  if (!modeId) return
  if (!conn) {
    detailAgentConfig.value.selectedModeId = modeId
    return
  }
  try {
    await acpApi.acpSetMode(conn, modeId)
    detailAgentConfig.value.selectedModeId = modeId
  } catch (error) {
    uni.showToast({ title: `模型切换失败: ${toErrorMessage(error)}`, icon: "none" })
  }
}

async function selectDetailConfigValue(configId: string, valueId: string) {
  const conn = session.value?.connectionId
  if (!configId || !valueId) return
  if (!conn) {
    detailAgentConfig.value.selectedValues = {
      ...detailAgentConfig.value.selectedValues,
      [configId]: valueId,
    }
    return
  }
  try {
    await acpApi.acpSetConfigOption(conn, configId, valueId)
    detailAgentConfig.value.selectedValues = {
      ...detailAgentConfig.value.selectedValues,
      [configId]: valueId,
    }
  } catch (error) {
    uni.showToast({ title: `配置切换失败: ${toErrorMessage(error)}`, icon: "none" })
  }
}
```

- [ ] **Step 2: Add deferred replay for locally selected values**

Add a replay helper:

```ts
async function applyPendingComposerConfig() {
  const conn = session.value?.connectionId
  if (!conn) return

  if (detailAgentConfig.value.selectedModeId) {
    await acpApi.acpSetMode(conn, detailAgentConfig.value.selectedModeId).catch(() => {})
  }

  for (const option of detailAgentConfig.value.configOptions) {
    const selectedValueId = detailAgentConfig.value.selectedValues[option.id]
    if (!selectedValueId) continue
    await acpApi.acpSetConfigOption(conn, option.id, selectedValueId).catch(() => {})
  }
}
```

- [ ] **Step 3: Replay deferred config after runtime connection becomes available**

Add a watcher:

```ts
watch(
  () => session.value?.connectionId,
  (connectionId) => {
    if (!connectionId) return
    void applyPendingComposerConfig()
  }
)
```

This keeps the deferred-selection rule local to the page and avoids changes to `connectionSessionManager` in v1.

- [ ] **Step 4: Remove dead model-picker state**

Delete these refs and template nodes if they are still present:

```ts
const showModelPicker = ref(false)
const modelColumns = ref<any[]>([])
function onModelConfirm() {}
```

and remove the matching `up-picker` block from the template.

- [ ] **Step 5: Verify live apply and dead-code removal**

Run: `npx vue-tsc --noEmit`

Expected: no new type errors after removing the unused model picker and adding the live/deferred config handlers.

- [ ] **Step 6: Commit**

```bash
git add mcode-app/src/pages/conversation-detail/index.vue
git commit -m "feat: apply composer config changes in detail view"
```

---

### Task 6: Manual validation and diff review

**Files:**
- Modify: `docs/superpowers/plans/2026-06-05-mcode-conversation-detail-composer-tools.md`

- [ ] **Step 1: Run the final type check**

Run: `npx vue-tsc --noEmit`

Expected: PASS or only pre-existing unrelated workspace errors that are documented before merge.

- [ ] **Step 2: Inspect the scoped diff**

Run: `git diff -- mcode-app/src/services/conversation/composerTools.ts mcode-app/src/pages/conversation-detail/index.vue mcode-app/src/types/acp.ts docs/superpowers/specs/2026-06-05-mcode-conversation-detail-composer-tools-design.md docs/superpowers/plans/2026-06-05-mcode-conversation-detail-composer-tools.md`

Expected: diff shows only the inline composer tools work.

- [ ] **Step 3: Manually verify the approved interaction contract**

Confirm all of the following on a real detail page:

```text
1. Tap + opens an inline panel below the composer.
2. Tap + again closes the panel.
3. 附件上传 reveals 图片 / 文件, and choosing either closes the panel.
4. 从待办选择获取任务 opens a todo sheet and choosing an item closes the panel.
5. 模型 / 推理强度 / 授权类型 stay inside the panel and do not auto-close it.
6. Only one config category expands at a time.
7. Missing remote categories show 远端未提供.
8. Pending permission card still renders above the panel.
```

- [ ] **Step 4: Record residual risk**

Document in the implementation summary that deferred config replay is best-effort in v1 and still needs live remote-session verification across reconnect scenarios.
