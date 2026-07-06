# P67 Conversation List Bulk Send Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add P67 bulk-send support to the top-level mcode conversation list so users can select multiple visible outer session cards and send the same text, including a quick "继续", to all selected sessions.

**Architecture:** Keep all selection and popup state local to `mcode-app/src/pages/conversations/index.vue`. Identify selected sessions by `connectionKey:conversationId`, reuse existing gateway/auth/session helpers, and send each selected text prompt sequentially through the existing `acp_prompt` route. Add a concise architecture note for native client replication.

**Tech Stack:** Vue 3 `<script setup>`, uni-app, uview-plus, Pinia conversation runtime store, existing `CodegGateway`, Jest source-contract tests.

## Global Constraints

- Scope is only the top-level conversation list rendered from `group.cards` in `mcode-app/src/pages/conversations/index.vue`.
- Do not add selection behavior to the secondary "历史会话" panel or project history conversations.
- Reuse existing `acp_connect` / `acp_prompt` gateway behavior; do not add backend routes or ACP protocol fields.
- Bulk send must process selected conversations sequentially and continue after per-conversation failures.
- Keep selections screen-local and clear them when exiting selection mode or entering history mode.
- Use uview runtime theme variables with the `--up-*` prefix. Do not introduce new `--mcode-*` color aliases.
- Every mcode change must include or update a Markdown note under `docs/mcode-architecture-notes/`.
- This implementation plan filename includes `P67`.
- Preserve unrelated uncommitted changes in the working tree. Stage only files listed in each task.

---

## File Structure

- Modify: `mcode-app/src/pages/conversations/index.vue`
  - Owns the visible top-level session card UI, selection state, bulk-send popup state, per-item send loop, and page-scoped styles.
- Create: `mcode-app/tests/pages/conversations/conversationListBulkSendContract.spec.ts`
  - Source-contract tests for P67 template structure, history exclusion, card tap behavior, popup copy, and send pipeline.
- Create: `docs/mcode-architecture-notes/2026-07-06-p67-conversation-list-bulk-send.md`
  - Architecture, protocol/data-flow, UI behavior, compatibility, and native iOS/Android replication guidance.

---

### Task 1: Top-Level Selection Mode

**Files:**
- Create: `mcode-app/tests/pages/conversations/conversationListBulkSendContract.spec.ts`
- Modify: `mcode-app/src/pages/conversations/index.vue`

**Interfaces:**
- Consumes: existing `filteredConnectionGroups`, `LiveSessionCard`, `openLiveSession(card, groupKey)`, `showHistoryPanel`.
- Produces:
  - `const selectionMode = ref(false)`
  - `interface BulkSelectionItem`
  - `function handleLiveCardClick(card: LiveSessionCard, groupKey: string): void`
  - `function toggleConversationSelection(card: LiveSessionCard, connectionKeyValue: string): void`
  - `function isConversationSelected(card: LiveSessionCard, connectionKeyValue: string): boolean`
  - `function isSelectableLiveCard(card: LiveSessionCard): boolean`
  - `const selectedBulkItems = computed<BulkSelectionItem[]>(...)`

- [ ] **Step 1: Write the failing selection contract tests**

Create `mcode-app/tests/pages/conversations/conversationListBulkSendContract.spec.ts`:

```ts
import fs from "node:fs"
import path from "node:path"

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf8")
}

function extractBlock(source: string, startToken: string, endToken: string) {
  const start = source.indexOf(startToken)
  const end = source.indexOf(endToken, start)
  if (start < 0 || end < 0) {
    throw new Error(`Failed to extract block from ${startToken}`)
  }
  return source.slice(start, end)
}

describe("P67 conversation list bulk send contract", () => {
  it("renders selection controls only on top-level live cards", () => {
    const source = read("../../../src/pages/conversations/index.vue")

    expect(source).toContain('class="conversations-header__select"')
    expect(source).toContain('{{ selectionMode ? "取消" : "选择" }}')
    expect(source).toContain('v-if="selectionMode && isSelectableLiveCard(card)"')
    expect(source).toContain("bulk-select-check")
    expect(source).toContain('@click="handleLiveCardClick(card, group.key)"')

    const historyBlock = extractBlock(
      source,
      '<view v-else class="history-list">',
      '<!-- 创建会话底部弹层 -->'
    )
    expect(historyBlock).not.toContain("bulk-select-check")
    expect(historyBlock).not.toContain("toggleConversationSelection")
    expect(historyBlock).not.toContain("handleLiveCardClick")
  })

  it("routes top-level card taps to selection toggling before detail navigation", () => {
    const source = read("../../../src/pages/conversations/index.vue")
    const block = extractBlock(
      source,
      "function handleLiveCardClick(card: LiveSessionCard, groupKey: string) {",
      "\nfunction openLiveSession(card: LiveSessionCard, groupKey?: string) {"
    )

    expect(block).toContain("if (selectionMode.value) {")
    expect(block).toContain("toggleConversationSelection(card, groupKey)")
    expect(block).toContain("return")
    expect(block).toContain("openLiveSession(card, groupKey)")
    expect(block.indexOf("toggleConversationSelection(card, groupKey)"))
      .toBeLessThan(block.indexOf("openLiveSession(card, groupKey)"))
  })
})
```

- [ ] **Step 2: Run the contract tests to verify they fail**

Run from `mcode-app`:

```bash
npm run test:unit -- --runTestsByPath tests/pages/conversations/conversationListBulkSendContract.spec.ts
```

Expected: FAIL because `conversations-header__select`, `selectionMode`, `bulk-select-check`, and `handleLiveCardClick` do not exist yet.

- [ ] **Step 3: Add header selection entry**

In `mcode-app/src/pages/conversations/index.vue`, replace the current header action block:

```vue
<view class="conversations-header__action" @click="createConversation()">
  <up-icon name="plus" size="20" :color="upThemeVar('--up-primary', '#2f7cf6')"></up-icon>
</view>
```

with:

```vue
<view class="conversations-header__actions">
  <view
    v-if="showSelectionEntry"
    class="conversations-header__select"
    @click="toggleSelectionMode"
  >
    <text class="conversations-header__select-text">{{ selectionMode ? "取消" : "选择" }}</text>
  </view>
  <view
    v-if="!selectionMode"
    class="conversations-header__action"
    @click="createConversation()"
  >
    <up-icon name="plus" size="20" :color="upThemeVar('--up-primary', '#2f7cf6')"></up-icon>
  </view>
</view>
```

- [ ] **Step 4: Update top-level live card click and checkbox template**

In the top-level `v-for="card in group.cards"` block, replace:

```vue
class="live-card"
:style="upThemeCardStyle"
@click="openLiveSession(card, group.key)"
```

with:

```vue
:class="[
  'live-card',
  selectionMode && isSelectableLiveCard(card) && 'live-card--selecting',
  isConversationSelected(card, group.key) && 'live-card--selected',
]"
:style="upThemeCardStyle"
@click="handleLiveCardClick(card, group.key)"
```

Inside that same `live-card`, insert this block immediately before `<view class="live-card__main">`:

```vue
<view
  v-if="selectionMode && isSelectableLiveCard(card)"
  :class="[
    'bulk-select-check',
    isConversationSelected(card, group.key) && 'bulk-select-check--active',
  ]"
  @click.stop="toggleConversationSelection(card, group.key)"
>
  <up-icon
    v-if="isConversationSelected(card, group.key)"
    name="checkmark"
    size="14"
    color="#ffffff"
  ></up-icon>
</view>
```

- [ ] **Step 5: Add selection state and computed values**

After `interface ConnectionGroup extends ConnectionConversationSnapshot { ... }`, add:

```ts
interface BulkSelectionItem {
  key: string
  connectionKey: string
  conversationId: number
  folderId: number
  agentType: string
  title: string
  projectName: string
}
```

After `const connectionGroups = ref<ConnectionGroup[]>([])`, add:

```ts
const selectionMode = ref(false)
const selectedConversationMap = ref<Record<string, BulkSelectionItem>>({})
```

After `const filteredConnectionGroups = computed<DisplayConnectionGroup[]>(() => { ... })`, add:

```ts
const showSelectionEntry = computed(() => {
  if (showHistoryPanel.value) return false
  return filteredConnectionGroups.value.some((group) =>
    group.cards.some((card) => isSelectableLiveCard(card))
  )
})

const selectedBulkItems = computed<BulkSelectionItem[]>(() =>
  Object.values(selectedConversationMap.value)
)

const selectedBulkCount = computed(() => selectedBulkItems.value.length)
```

- [ ] **Step 6: Add selection helper functions**

Insert these functions immediately before `function openHistoryPanel(group: ConnectionGroup) {`:

```ts
function buildBulkSelectionKey(connectionKeyValue: string, conversationId: number): string {
  return `${connectionKeyValue}:${conversationId}`
}

function isSelectableLiveCard(card: LiveSessionCard): boolean {
  return Number(card.conversationId || 0) > 0
}

function buildBulkSelectionItem(
  card: LiveSessionCard,
  connectionKeyValue: string
): BulkSelectionItem | null {
  const conversationId = Number(card.conversationId || 0)
  if (!connectionKeyValue || conversationId <= 0) return null
  return {
    key: buildBulkSelectionKey(connectionKeyValue, conversationId),
    connectionKey: connectionKeyValue,
    conversationId,
    folderId: Number(card.folderId || 0),
    agentType: normalizeAgentType(card.agentType),
    title: card.title || "未命名会话",
    projectName: card.projectName || "未命名项目",
  }
}

function isConversationSelected(
  card: LiveSessionCard,
  connectionKeyValue: string
): boolean {
  const conversationId = Number(card.conversationId || 0)
  if (!connectionKeyValue || conversationId <= 0) return false
  return Boolean(selectedConversationMap.value[
    buildBulkSelectionKey(connectionKeyValue, conversationId)
  ])
}

function toggleConversationSelection(card: LiveSessionCard, connectionKeyValue: string) {
  const item = buildBulkSelectionItem(card, connectionKeyValue)
  if (!item) return
  const next = { ...selectedConversationMap.value }
  if (next[item.key]) {
    delete next[item.key]
  } else {
    next[item.key] = item
  }
  selectedConversationMap.value = next
}

function clearConversationSelection() {
  selectedConversationMap.value = {}
}

function toggleSelectionMode() {
  selectionMode.value = !selectionMode.value
  if (!selectionMode.value) {
    clearConversationSelection()
  }
}

function exitSelectionMode() {
  selectionMode.value = false
  clearConversationSelection()
}

function handleLiveCardClick(card: LiveSessionCard, groupKey: string) {
  if (selectionMode.value) {
    toggleConversationSelection(card, groupKey)
    return
  }
  openLiveSession(card, groupKey)
}
```

- [ ] **Step 7: Clear selection when entering history or losing selectable cards**

In `openHistoryPanel(group: ConnectionGroup)`, add `exitSelectionMode()` as the first statement:

```ts
function openHistoryPanel(group: ConnectionGroup) {
  exitSelectionMode()
  historyGroupKey.value = group.key
  historyGroupTitle.value = group.name
  projects.value = group.projects
  showHistoryPanel.value = true
  void ensureHistoryProjectsLoaded(group)
}
```

After the existing watchers near `filteredConnectionGroups`, add:

```ts
watch(
  () =>
    filteredConnectionGroups.value
      .flatMap((group) =>
        group.cards
          .filter((card) => isSelectableLiveCard(card))
          .map((card) => buildBulkSelectionKey(group.key, Number(card.conversationId || 0)))
      )
      .join("|"),
  () => {
    const available = new Set(
      filteredConnectionGroups.value.flatMap((group) =>
        group.cards
          .filter((card) => isSelectableLiveCard(card))
          .map((card) => buildBulkSelectionKey(group.key, Number(card.conversationId || 0)))
      )
    )
    const next: Record<string, BulkSelectionItem> = {}
    for (const item of selectedBulkItems.value) {
      if (available.has(item.key)) {
        next[item.key] = item
      }
    }
    selectedConversationMap.value = next
    if (!showSelectionEntry.value) {
      exitSelectionMode()
    }
  }
)
```

- [ ] **Step 8: Add selection styles**

In the `<style scoped lang="scss">` block near the header styles, add:

```scss
.conversations-header__actions {
  display: flex;
  align-items: center;
  gap: 12rpx;
  flex-shrink: 0;
}

.conversations-header__select {
  min-width: 84rpx;
  height: 56rpx;
  padding: 0 18rpx;
  border-radius: 999rpx;
  background: color-mix(in srgb, var(--up-primary, #2f7cf6) 10%, var(--up-card-bg-color, #ffffff) 90%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.conversations-header__select-text {
  font-size: 24rpx;
  line-height: 1;
  font-weight: 700;
  color: var(--up-primary, #2f7cf6);
}
```

Near the `.live-card` styles, add:

```scss
.live-card--selecting {
  padding-left: 86rpx;
}

.live-card--selected {
  border-color: color-mix(in srgb, var(--up-primary, #2979ff) 58%, var(--up-border-color, #dadbde) 42%);
  box-shadow: 0 10rpx 36rpx color-mix(in srgb, var(--up-primary, #2979ff) 16%, transparent) !important;
}

.bulk-select-check {
  position: absolute;
  left: 24rpx;
  top: 50%;
  width: 42rpx;
  height: 42rpx;
  border-radius: 999rpx;
  transform: translateY(-50%);
  border: 2rpx solid var(--up-border-color, #dadbde);
  background: var(--up-card-bg-color, #ffffff);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
}

.bulk-select-check--active {
  border-color: var(--up-primary, #2979ff);
  background: var(--up-primary, #2979ff);
}
```

- [ ] **Step 9: Run the contract tests**

Run from `mcode-app`:

```bash
npm run test:unit -- --runTestsByPath tests/pages/conversations/conversationListBulkSendContract.spec.ts
```

Expected: PASS for the two selection tests.

- [ ] **Step 10: Commit Task 1**

```bash
git add mcode-app/src/pages/conversations/index.vue mcode-app/tests/pages/conversations/conversationListBulkSendContract.spec.ts
git commit -m "feat(app): add p67 conversation selection mode"
```

---

### Task 2: Bulk Send Popup And Sequential Send Pipeline

**Files:**
- Modify: `mcode-app/tests/pages/conversations/conversationListBulkSendContract.spec.ts`
- Modify: `mcode-app/src/pages/conversations/index.vue`

**Interfaces:**
- Consumes: Task 1 `selectedBulkItems`, `selectedBulkCount`, `exitSelectionMode`, connection helpers, `runtime`, `ensureConversationTab`.
- Produces:
  - `const showBulkSendDialog = ref(false)`
  - `const bulkSendText = ref("")`
  - `const bulkSending = ref(false)`
  - `const BULK_SEND_QUICK_TEXT = "继续"`
  - `async function confirmBulkSend(): Promise<void>`
  - `async function sendBulkSelectionItem(item: BulkSelectionItem, text: string): Promise<void>`
  - `async function ensureBulkSendConnection(item: BulkSelectionItem, instanceKey: string): Promise<string>`

- [ ] **Step 1: Extend contract tests for popup and send chain**

Append these tests inside the existing `describe("P67 conversation list bulk send contract", () => { ... })` block:

```ts
  it("renders the bulk-send popup with warning copy and quick continue input", () => {
    const source = read("../../../src/pages/conversations/index.vue")

    expect(source).toContain('v-model:show="showBulkSendDialog"')
    expect(source).toContain("批量发送")
    expect(source).toContain("本次将会一键将内容发送给所有勾选的会话")
    expect(source).toContain('const BULK_SEND_QUICK_TEXT = "继续"')
    expect(source).toContain('@click="applyBulkQuickText(BULK_SEND_QUICK_TEXT)"')
    expect(source).toContain('v-model="bulkSendText"')
    expect(source).toContain(':disabled="bulkSendSubmitDisabled"')
    expect(source).toContain('@click="confirmBulkSend"')
  })

  it("bulk sends selected cards through the existing ACP prompt pipeline", () => {
    const source = read("../../../src/pages/conversations/index.vue")
    const confirmBlock = extractBlock(
      source,
      "async function confirmBulkSend() {",
      "\nasync function sendBulkSelectionItem("
    )
    const sendBlock = extractBlock(
      source,
      "async function sendBulkSelectionItem(",
      "\nasync function ensureBulkSendConnection("
    )
    const ensureBlock = extractBlock(
      source,
      "async function ensureBulkSendConnection(",
      "\nfunction showConversationMenu("
    )

    expect(confirmBlock).toContain("for (const item of items)")
    expect(confirmBlock).toContain("await sendBulkSelectionItem(item, text)")
    expect(confirmBlock).toContain("await loadOverviewData({ force: true })")
    expect(confirmBlock).toContain("await refreshActiveSessionTabBadge()")

    expect(sendBlock).toContain("const conn = findConnectedConnectionByKey(item.connectionKey)")
    expect(sendBlock).toContain("syncAuthToConnection(conn)")
    expect(sendBlock).toContain("await ensureConversationTab({")
    expect(sendBlock).toContain('activation: "preserve"')
    expect(sendBlock).toContain('origin: "mcode-mobile-bulk-send"')
    expect(sendBlock).toContain("await ensureBulkSendConnection(item, instanceKey)")
    expect(sendBlock).toContain('await gateway.call("acp_prompt", {')
    expect(sendBlock).toContain('blocks: [{ type: "text", text }]')
    expect(sendBlock).toContain("folderId: item.folderId")
    expect(sendBlock).toContain("conversationId: item.conversationId")

    expect(ensureBlock).toContain("runtime.getManagedConversation(item.conversationId)?.connectionId")
    expect(ensureBlock).toContain("await runtime.connect(")
    expect(ensureBlock).toContain("runtime.sessions.get(item.conversationId)?.lastAppliedSeq")
  })
```

- [ ] **Step 2: Run the contract tests to verify the new tests fail**

Run from `mcode-app`:

```bash
npm run test:unit -- --runTestsByPath tests/pages/conversations/conversationListBulkSendContract.spec.ts
```

Expected: FAIL because the popup state, popup template, and bulk send functions do not exist yet.

- [ ] **Step 3: Add bulk action bar template**

After the closing `</view>` of `.conversations-shell` and before `<!-- 创建会话底部弹层 -->`, insert:

```vue
<view v-if="selectionMode" class="bulk-action-bar" :style="upThemeCardStyle">
  <view class="bulk-action-bar__summary">
    <text class="bulk-action-bar__title">已选择 {{ selectedBulkCount }} 个会话</text>
    <text class="bulk-action-bar__hint">将向所有勾选会话发送同一条内容</text>
  </view>
  <up-button
    type="primary"
    size="small"
    shape="circle"
    :disabled="selectedBulkCount === 0"
    @click="openBulkSendDialog"
  >批量发送</up-button>
</view>
```

- [ ] **Step 4: Add bulk send popup template**

Insert this popup after the create dialog popup and before the create config popup:

```vue
<up-popup v-model:show="showBulkSendDialog" mode="bottom" :round="28" @close="closeBulkSendDialog">
  <view class="bulk-send-sheet" :style="upThemeCardStyle">
    <view class="create-sheet__hd">
      <text class="create-sheet__title">批量发送</text>
      <view class="create-sheet__close" @click="closeBulkSendDialog">
        <up-icon name="close" size="20" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
      </view>
    </view>

    <view class="bulk-send-warning">
      <up-icon name="info-circle" size="18" :color="upThemeVar('--up-primary', '#2979ff')"></up-icon>
      <text class="bulk-send-warning__text">本次将会一键将内容发送给所有勾选的会话</text>
    </view>

    <view class="bulk-send-targets">
      <text class="bulk-send-targets__title">目标会话 {{ selectedBulkCount }} 个</text>
      <text class="bulk-send-targets__hint u-line-2">{{ selectedBulkSummary }}</text>
    </view>

    <view class="form-group">
      <text class="form-label">快捷输入</text>
      <view class="bulk-quick-row">
        <view class="bulk-quick-chip" @click="applyBulkQuickText(BULK_SEND_QUICK_TEXT)">
          <text class="bulk-quick-chip__text">{{ BULK_SEND_QUICK_TEXT }}</text>
        </view>
      </view>
    </view>

    <view class="form-group">
      <text class="form-label">发送内容</text>
      <up-textarea
        v-model="bulkSendText"
        placeholder="请输入要发送给所有勾选会话的内容"
        autoHeight
        count
        :maxlength="1200"
      ></up-textarea>
    </view>

    <up-button
      type="primary"
      :loading="bulkSending"
      :disabled="bulkSendSubmitDisabled"
      shape="circle"
      @click="confirmBulkSend"
      customStyle="margin-top:16rpx"
    >确认批量发送</up-button>

    <view class="safe-bottom"></view>
  </view>
</up-popup>
```

- [ ] **Step 5: Add popup and send computed state**

After `const selectedConversationMap = ref<Record<string, BulkSelectionItem>>({})`, add:

```ts
const showBulkSendDialog = ref(false)
const bulkSendText = ref("")
const bulkSending = ref(false)
const BULK_SEND_QUICK_TEXT = "继续"
```

After `const selectedBulkCount = computed(() => selectedBulkItems.value.length)`, add:

```ts
const selectedBulkSummary = computed(() => {
  const names = selectedBulkItems.value
    .slice(0, 3)
    .map((item) => item.title || `会话 #${item.conversationId}`)
  const extra = selectedBulkCount.value - names.length
  return extra > 0 ? `${names.join("、")} 等 ${selectedBulkCount.value} 个会话` : names.join("、")
})

const bulkSendSubmitDisabled = computed(() =>
  bulkSending.value ||
  selectedBulkCount.value === 0 ||
  bulkSendText.value.trim().length === 0
)
```

- [ ] **Step 6: Add popup helper functions**

Insert these functions after `function exitSelectionMode() { ... }`:

```ts
function openBulkSendDialog() {
  if (selectedBulkCount.value === 0) {
    uni.showToast({ title: "请先勾选会话", icon: "none" })
    return
  }
  bulkSendText.value = ""
  showBulkSendDialog.value = true
}

function closeBulkSendDialog() {
  if (bulkSending.value) return
  showBulkSendDialog.value = false
}

function applyBulkQuickText(text: string) {
  bulkSendText.value = text
}
```

- [ ] **Step 7: Add sequential send functions**

Insert these functions immediately before `function showConversationMenu(conv: Conversation) {`:

```ts
async function confirmBulkSend() {
  if (bulkSendSubmitDisabled.value) return
  const text = bulkSendText.value.trim()
  const items = [...selectedBulkItems.value]
  if (!text || items.length === 0) return

  bulkSending.value = true
  let successCount = 0
  let failureCount = 0

  try {
    for (const item of items) {
      try {
        await sendBulkSelectionItem(item, text)
        successCount += 1
      } catch (error) {
        failureCount += 1
        console.warn("[conversation-list-bulk-send] item failed", {
          conversationId: item.conversationId,
          connectionKey: item.connectionKey,
          error,
        })
      }
    }

    if (successCount > 0) {
      showBulkSendDialog.value = false
      exitSelectionMode()
      markConversationListDirty()
      await loadOverviewData({ force: true })
      await refreshActiveSessionTabBadge()
    }

    const title = failureCount > 0
      ? `已发送 ${successCount} 个，失败 ${failureCount} 个`
      : `已发送 ${successCount} 个会话`
    uni.showToast({
      title,
      icon: successCount > 0 ? "success" : "none",
      duration: 3000,
    })
  } finally {
    bulkSending.value = false
  }
}

async function sendBulkSelectionItem(item: BulkSelectionItem, text: string) {
  const conn = findConnectedConnectionByKey(item.connectionKey)
  if (!conn) {
    throw new Error("连接不存在或已断开")
  }

  const gateway = await createConnectionGateway(conn)
  syncAuthToConnection(conn)
  const instanceKey = gateway.getRemoteInstanceDescriptor().instanceKey

  await ensureConversationTab({
    instanceKey,
    gateway,
    folderId: item.folderId,
    conversationId: item.conversationId,
    agentType: item.agentType,
    activation: "preserve",
    origin: "mcode-mobile-bulk-send",
  })

  const connectionId = await ensureBulkSendConnection(item, instanceKey)
  if (!connectionId) {
    throw new Error("未连接到代理")
  }

  await gateway.call("acp_prompt", {
    connectionId,
    blocks: [{ type: "text", text }],
    folderId: item.folderId,
    conversationId: item.conversationId,
  })
}

async function ensureBulkSendConnection(
  item: BulkSelectionItem,
  instanceKey: string
): Promise<string> {
  const managedConnectionId =
    runtime.getManagedConversation(item.conversationId)?.connectionId ||
    runtime.sessions.get(item.conversationId)?.connectionId ||
    ""
  if (managedConnectionId) return managedConnectionId

  const recovered = await runtime.connect(
    item.conversationId,
    normalizeAgentType(item.agentType),
    undefined,
    undefined,
    runtime.sessions.get(item.conversationId)?.lastAppliedSeq,
    instanceKey
  )
  return firstString(
    recovered?.id,
    runtime.getManagedConversation(item.conversationId)?.connectionId,
    runtime.sessions.get(item.conversationId)?.connectionId
  )
}
```

- [ ] **Step 8: Add bulk action and popup styles**

Add these styles near the create sheet styles:

```scss
.bulk-action-bar {
  position: fixed;
  left: 24rpx;
  right: 24rpx;
  bottom: calc(24rpx + env(safe-area-inset-bottom));
  z-index: 30;
  padding: 18rpx 18rpx;
  border-radius: 28rpx;
  background: var(--up-card-bg-color, #ffffff) !important;
  border: 1rpx solid var(--up-border-color, #dadbde);
  box-shadow: 0 18rpx 52rpx rgba(15, 23, 42, 0.16) !important;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
}

.bulk-action-bar__summary {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.bulk-action-bar__title {
  font-size: 26rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.bulk-action-bar__hint {
  font-size: 22rpx;
  color: var(--up-tips-color, #909193);
}

.bulk-send-sheet {
  padding: 36rpx 20rpx 0;
  background-color: var(--up-card-bg-color, #ffffff);
  border-radius: 28rpx 28rpx 0 0;
}

.bulk-send-warning {
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
  padding: 18rpx 20rpx;
  border-radius: 22rpx;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 9%, var(--up-card-bg-color, #ffffff) 91%);
  border: 1rpx solid color-mix(in srgb, var(--up-primary, #2979ff) 20%, var(--up-border-color, #dadbde) 80%);
  margin-bottom: 24rpx;
}

.bulk-send-warning__text {
  flex: 1;
  min-width: 0;
  font-size: 24rpx;
  line-height: 1.45;
  color: var(--up-main-color, #303133);
}

.bulk-send-targets {
  margin-bottom: 24rpx;
  padding: 0 4rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.bulk-send-targets__title {
  font-size: 26rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.bulk-send-targets__hint {
  font-size: 22rpx;
  line-height: 1.4;
  color: var(--up-content-color, #606266);
}

.bulk-quick-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.bulk-quick-chip {
  min-height: 52rpx;
  padding: 0 24rpx;
  border-radius: 999rpx;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 10%, var(--up-card-bg-color, #ffffff) 90%);
  border: 1rpx solid color-mix(in srgb, var(--up-primary, #2979ff) 26%, var(--up-border-color, #dadbde) 74%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.bulk-quick-chip__text {
  font-size: 24rpx;
  font-weight: 700;
  color: var(--up-primary, #2979ff);
}
```

- [ ] **Step 9: Run the P67 contract tests**

Run from `mcode-app`:

```bash
npm run test:unit -- --runTestsByPath tests/pages/conversations/conversationListBulkSendContract.spec.ts
```

Expected: PASS for all P67 contract tests.

- [ ] **Step 10: Run related conversation-list tests**

Run from `mcode-app`:

```bash
npm run test:unit -- --runTestsByPath tests/pages/conversations/conversationListBulkSendContract.spec.ts tests/pages/conversations/detailNavigationContract.spec.ts tests/pages/conversations/conversationLivePreviewLayout.spec.ts
```

Expected: PASS. If `conversationLivePreviewLayout.spec.ts` fails because of unrelated dirty `MarqueeText.vue` changes, inspect `git diff -- mcode-app/src/components/MarqueeText.vue mcode-app/tests/pages/conversations/conversationLivePreviewLayout.spec.ts` and do not revert those unrelated changes.

- [ ] **Step 11: Commit Task 2**

```bash
git add mcode-app/src/pages/conversations/index.vue mcode-app/tests/pages/conversations/conversationListBulkSendContract.spec.ts
git commit -m "feat(app): add p67 conversation bulk send"
```

---

### Task 3: Architecture Note And Final Verification

**Files:**
- Create: `docs/mcode-architecture-notes/2026-07-06-p67-conversation-list-bulk-send.md`
- Verify: `mcode-app/src/pages/conversations/index.vue`
- Verify: `mcode-app/tests/pages/conversations/conversationListBulkSendContract.spec.ts`

**Interfaces:**
- Consumes: Task 1 and Task 2 final behavior.
- Produces: mcode architecture note with protocol/data-flow, UI behavior, compatibility, and native iOS/Android replication guidance.

- [ ] **Step 1: Add the P67 architecture note**

Create `docs/mcode-architecture-notes/2026-07-06-p67-conversation-list-bulk-send.md`:

```md
# P67 Conversation List Bulk Send

## Architecture

P67 adds screen-local selection state to the top-level mcode conversation list. The feature lives in `mcode-app/src/pages/conversations/index.vue` and applies only to outer connection-group session cards rendered from `group.cards`. Each selected target is stored by `connectionKey:conversationId` to avoid id collisions across multiple desktop or relay connections.

## Protocol And Data Flow

No backend route or ACP protocol change is required. The mobile client resolves the selected card's saved connection, creates the existing `CodegGateway`, syncs auth, preserves the remote tab with `ensureConversationTab`, recovers or creates a runtime ACP connection with `runtime.connect`, and sends `blocks: [{ type: "text", text }]` through the existing `acp_prompt` command. Selected targets are processed sequentially so one failed conversation does not block the remaining sends.

## UI Behavior

When top-level selectable session cards exist, the header shows "选择". Entering selection mode replaces single-card navigation with checkbox toggling and hides the create button. A fixed bottom action bar displays the selected count and opens the "批量发送" bottom sheet. The sheet warns "本次将会一键将内容发送给所有勾选的会话", provides a "继续" quick chip, accepts custom text, and disables confirm while empty or sending. The "历史会话" card and the secondary history panel are not selectable.

## Compatibility

Selections are not persisted and are cleared when selection mode exits, the list loses selectable cards, or the user enters the history panel. Existing single-card open behavior, live preview ownership, conversation summary refresh, and tabbar active-session badge behavior remain unchanged outside selection mode. Styling uses existing uview runtime theme variables with `--up-*` names and introduces no `--mcode-*` color aliases.

## Native iOS/Android Replication

Native clients should implement this as view-local state on the top-level session list only. Store selected targets by `(connectionKey, conversationId)`, show checkboxes only in selection mode, and do not expose selection inside the history list. The bulk-send sheet should include the same warning copy, a "继续" quick input, custom text input, and a disabled confirm state for empty text. Send selected conversations sequentially through the existing ACP prompt path and report aggregate success/failure to the user.
```

- [ ] **Step 2: Run P67 and related tests**

Run from `mcode-app`:

```bash
npm run test:unit -- --runTestsByPath tests/pages/conversations/conversationListBulkSendContract.spec.ts tests/pages/conversations/detailNavigationContract.spec.ts tests/pages/conversations/conversationLivePreview.spec.ts tests/pages/conversations/conversationLivePreviewLayout.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Inspect changed files without reverting unrelated work**

Run from repository root:

```bash
git status --short
git diff -- mcode-app/src/pages/conversations/index.vue mcode-app/tests/pages/conversations/conversationListBulkSendContract.spec.ts docs/mcode-architecture-notes/2026-07-06-p67-conversation-list-bulk-send.md
```

Expected:

```text
 M mcode-app/src/pages/conversations/index.vue
?? mcode-app/tests/pages/conversations/conversationListBulkSendContract.spec.ts
?? docs/mcode-architecture-notes/2026-07-06-p67-conversation-list-bulk-send.md
```

If prior tasks were committed, `git status --short` should show only unrelated pre-existing dirty files plus the new architecture note. Do not stage unrelated dirty files such as `mcode-app/src/components/MarqueeText.vue` or the P65 live-preview note.

- [ ] **Step 4: Commit Task 3**

```bash
git add docs/mcode-architecture-notes/2026-07-06-p67-conversation-list-bulk-send.md
git commit -m "docs(app): document p67 conversation bulk send"
```

- [ ] **Step 5: Final report**

Report:

```text
Implemented P67 top-level conversation-list bulk send.
Verified with: npm run test:unit -- --runTestsByPath tests/pages/conversations/conversationListBulkSendContract.spec.ts tests/pages/conversations/detailNavigationContract.spec.ts tests/pages/conversations/conversationLivePreview.spec.ts tests/pages/conversations/conversationLivePreviewLayout.spec.ts
Unrelated pre-existing dirty files were left untouched: docs/mcode-architecture-notes/2026-07-05-p65-conversation-list-live-stream-preview.md, mcode-app/src/components/MarqueeText.vue, mcode-app/tests/pages/conversations/conversationLivePreviewLayout.spec.ts
```
