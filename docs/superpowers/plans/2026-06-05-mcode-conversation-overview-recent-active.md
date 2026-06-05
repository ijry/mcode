# MCode Conversation Overview Recent Active Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the mcode conversation overview show opened tabs first and all same-day active conversations after them, while unifying the overview and history page onto the same conversation-summary snapshot path.

**Architecture:** Extract the overview/history assembly logic out of `mcode-app/src/pages/conversations/index.vue` into a focused conversation snapshot helper that can build one connection snapshot from folders, opened tabs, and summary records. Update the page to render that snapshot, seed a new local summary immediately after successful conversation creation, and keep remote calibration as the source of truth.

**Tech Stack:** Vue 3 + uni-app, TypeScript, local SQLite summary repository, existing ACP gateway calls

---

## File Structure

- Modify: `mcode-app/src/pages/conversations/index.vue`
  - Keep the page responsible for UI state, lifecycle hooks, gateway orchestration, and user actions.
  - Remove inline snapshot-assembly logic that is better expressed as pure helpers.
- Create: `mcode-app/src/services/conversation/conversationOverviewSnapshot.ts`
  - Centralize snapshot assembly for overview cards and history projects.
  - Own same-day filtering, `conversationId` dedupe, and card ordering.
- Optional Modify: `mcode-app/src/services/db/repositories/conversationRepository.ts`
  - Only if the page-level `Promise.all(folders.map(listConversationSummaries))` becomes too awkward after extraction.
  - Prefer not to touch this file unless a small helper materially simplifies snapshot loading.

## Task 1: Extract Shared Conversation Snapshot Assembly

**Files:**
- Create: `mcode-app/src/services/conversation/conversationOverviewSnapshot.ts`
- Modify: `mcode-app/src/pages/conversations/index.vue`

- [ ] **Step 1: Add a failing typecheck target by importing a snapshot builder that does not exist yet**

Add this import near the existing conversation imports in `mcode-app/src/pages/conversations/index.vue`:

```ts
import {
  buildConnectionConversationSnapshot,
  mapConversationSummaryRecordToConversation,
  mapConversationToSummaryRecord,
  type ConnectionConversationSnapshot,
  type ConversationOverviewConversation,
  type ConversationOverviewProject,
  type ConversationOverviewOpenedTab,
} from "@/services/conversation/conversationOverviewSnapshot"
```

Replace the local interfaces with aliases to the new helper types:

```ts
type Project = ConversationOverviewProject
type Conversation = ConversationOverviewConversation
type OpenedTabItem = ConversationOverviewOpenedTab

interface LiveSessionCard {
  tabId: number
  conversationId?: number
  folderId: number
  projectName: string
  agentType: string
  title: string
  updatedAt?: string
  status: string
  isActive: boolean
}

interface ConnectionGroup extends ConnectionConversationSnapshot {
  cards: LiveSessionCard[]
}
```

- [ ] **Step 2: Run typecheck to verify the new import fails**

Run:

```bash
pnpm exec vue-tsc --noEmit -p tsconfig.json
```

Expected: FAIL with `Cannot find module '@/services/conversation/conversationOverviewSnapshot'` or missing exported symbol errors.

- [ ] **Step 3: Create the shared snapshot helper with exact exported types and pure assembly functions**

Create `mcode-app/src/services/conversation/conversationOverviewSnapshot.ts` with:

```ts
import type { ConversationSummaryRecord } from "@/services/db/repositories/conversationRepository"
import { normalizeConversationSummaryStatus } from "@/services/conversation/conversationSummaryStatus"

export interface ConversationOverviewConversation {
  id: number
  title?: string
  agent_type?: string
  updated_at?: string
  folder_id?: number
  status?: string
  external_id?: string
  externalId?: string
}

export interface ConversationOverviewProject {
  id: number
  name: string
  path: string
  conversations?: ConversationOverviewConversation[]
}

export interface ConversationOverviewOpenedTab {
  id: number
  folder_id: number
  conversation_id?: number | null
  agent_type?: string
  position?: number
  is_active?: boolean
  is_pinned?: boolean
}

export interface ConversationOverviewCard {
  tabId: number
  conversationId?: number
  folderId: number
  projectName: string
  agentType: string
  title: string
  updatedAt?: string
  status: string
  isActive: boolean
}

export interface ConnectionConversationSnapshot {
  key: string
  name: string
  mode: "direct" | "relay"
  url: string
  projects: ConversationOverviewProject[]
  openTabCards: ConversationOverviewCard[]
  recentActiveCards: ConversationOverviewCard[]
  loadError: string | null
}

interface BuildSnapshotInput {
  connectionKey: string
  connectionName: string
  mode: "direct" | "relay"
  url: string
  folders: ConversationOverviewProject[]
  tabs: ConversationOverviewOpenedTab[]
  conversations: ConversationOverviewConversation[]
  now?: number
}

export function buildConnectionConversationSnapshot(
  input: BuildSnapshotInput
): ConnectionConversationSnapshot {
  const folderMap = new Map<number, ConversationOverviewProject>()
  input.folders.forEach((folder) => {
    folderMap.set(folder.id, folder)
  })

  const conversations = input.conversations.filter((conversation) => Number(conversation.id) > 0)
  const convMap = new Map<number, ConversationOverviewConversation>()
  conversations.forEach((conversation) => {
    convMap.set(conversation.id, conversation)
  })

  const openTabCards = input.tabs
    .map((tab) => {
      const conversation = tab.conversation_id ? convMap.get(tab.conversation_id) : undefined
      const project = folderMap.get(tab.folder_id)
      return {
        tabId: tab.id,
        conversationId: tab.conversation_id || undefined,
        folderId: tab.folder_id,
        projectName: project?.name || project?.path || "未命名项目",
        agentType: normalizeAgentType(tab.agent_type || conversation?.agent_type),
        title: conversation?.title || `标签会话 #${tab.id}`,
        updatedAt: conversation?.updated_at,
        status: normalizeConversationStatus(conversation?.status),
        isActive: Boolean(tab.is_active),
      } satisfies ConversationOverviewCard
    })
    .sort((a, b) => {
      const activeDiff = Number(b.isActive) - Number(a.isActive)
      if (activeDiff !== 0) return activeDiff
      return Number(a.tabId) - Number(b.tabId)
    })

  const openedConversationIds = new Set(
    openTabCards
      .map((card) => Number(card.conversationId || 0))
      .filter((conversationId) => conversationId > 0)
  )

  const startOfToday = getStartOfTodayTimestamp(input.now ?? Date.now())

  const recentActiveCards = conversations
    .filter((conversation) => {
      if (openedConversationIds.has(conversation.id)) return false
      return getConversationActivityTimestamp(conversation) >= startOfToday
    })
    .sort(
      (left, right) =>
        getConversationActivityTimestamp(right) - getConversationActivityTimestamp(left)
    )
    .map((conversation) => {
      const project = folderMap.get(Number(conversation.folder_id || 0))
      return {
        tabId: -conversation.id,
        conversationId: conversation.id,
        folderId: Number(conversation.folder_id || 0),
        projectName: project?.name || project?.path || "未命名项目",
        agentType: normalizeAgentType(conversation.agent_type),
        title: conversation.title || `会话 #${conversation.id}`,
        updatedAt: conversation.updated_at,
        status: normalizeConversationStatus(conversation.status),
        isActive: false,
      } satisfies ConversationOverviewCard
    })

  const projects = input.folders.map((folder) => ({
    ...folder,
    conversations: conversations.filter((conversation) => conversation.folder_id === folder.id),
  }))

  return {
    key: input.connectionKey,
    name: input.connectionName,
    mode: input.mode,
    url: input.url,
    projects,
    openTabCards,
    recentActiveCards,
    loadError: null,
  }
}

export function mapConversationSummaryRecordToConversation(
  record: ConversationSummaryRecord
): ConversationOverviewConversation {
  return {
    id: record.id,
    title: record.title,
    agent_type: normalizeAgentType(record.agentType),
    updated_at: formatTimestamp(record.updatedAt || record.lastMessageAt),
    folder_id: record.folderId,
    status: normalizeConversationStatus(record.status),
  }
}

export function mapConversationToSummaryRecord(
  instanceKey: string,
  conversation: ConversationOverviewConversation,
  now = Date.now()
): ConversationSummaryRecord {
  const timestamp = parseTimestamp(conversation.updated_at) || now
  return {
    id: conversation.id,
    instanceKey,
    folderId: Number(conversation.folder_id || 0),
    title: conversation.title || "未命名会话",
    agentType: normalizeAgentType(conversation.agent_type),
    externalId: firstString(conversation.external_id, conversation.externalId) || null,
    connectionId: null,
    status: normalizeConversationStatus(conversation.status),
    lastTurnId: null,
    lastMessageAt: timestamp,
    unreadCount: 0,
    isPinned: false,
    deletedAt: null,
    updatedAt: timestamp,
  }
}

export function getConversationActivityTimestamp(
  conversation: Pick<ConversationOverviewConversation, "updated_at">
) {
  return parseTimestamp(conversation.updated_at) || 0
}

function getStartOfTodayTimestamp(now: number) {
  const date = new Date(now)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function normalizeAgentType(value?: string): string {
  const raw = String(value || "").trim().toLowerCase().replace(/[\s-]/g, "_")
  if (!raw) return "claude_code"
  if (raw === "claudecode") return "claude_code"
  if (raw === "codex_cli") return "codex"
  if (raw === "gemini_cli" || raw === "google_gemini" || raw === "gemini_code") return "gemini"
  if (raw === "cline_cli") return "cline"
  if (raw === "opencode") return "open_code"
  if (raw === "open_code_cli") return "open_code"
  if (raw === "openclaw") return "open_claw"
  if (raw === "open_claw_cli") return "open_claw"
  return raw
}

function normalizeConversationStatus(value?: string): string {
  return normalizeConversationSummaryStatus(value)
}

function parseTimestamp(value?: string | number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  const time = value ? new Date(value).getTime() : 0
  return Number.isFinite(time) ? time : 0
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

function formatTimestamp(value: number): string {
  return new Date(value).toISOString()
}
```

- [ ] **Step 4: Replace inline card/project assembly in the page with the snapshot helper**

Update `loadConnectionGroup()` in `mcode-app/src/pages/conversations/index.vue` so it reads local summary by folder and builds a full snapshot instead of the old tab-only group:

```ts
async function loadConnectionGroup(conn: ConnectionItem): Promise<ConnectionGroup> {
  const gateway = await createConnectionGateway(conn)
  const descriptor = gateway.getRemoteInstanceDescriptor()
  const foldersRaw = await gateway.call<unknown>("list_all_folder_details")
  const folders = normalizeList(foldersRaw) as Project[]
  const tabsRaw = await gateway.call<unknown>("list_opened_tabs")
  const tabs = normalizeList(tabsRaw) as OpenedTabItem[]
  const localConversations = (await loadLocalConversationSummaries(descriptor.instanceKey, folders)) || []
  return toConnectionGroup(
    buildConnectionConversationSnapshot({
      connectionKey: connectionKey(conn),
      connectionName: conn.name,
      mode: conn.mode,
      url: conn.url,
      folders,
      tabs,
      conversations: localConversations,
    })
  )
}
```

Replace the old `buildConnectionGroup()`, `applyHistoryProjects()`, `mapSummaryRecordToConversation()`, and `mapConversationToSummaryRecord()` page-local logic with:

```ts
function toConnectionGroup(snapshot: ConnectionConversationSnapshot): ConnectionGroup {
  return {
    ...snapshot,
    cards: [...snapshot.openTabCards, ...snapshot.recentActiveCards],
  }
}

function replaceConnectionGroup(nextGroup: ConnectionGroup) {
  const index = connectionGroups.value.findIndex((group) => group.key === nextGroup.key)
  if (index < 0) return
  const nextGroups = [...connectionGroups.value]
  nextGroups.splice(index, 1, nextGroup)
  connectionGroups.value = nextGroups
  if (showHistoryPanel.value && historyGroupKey.value === nextGroup.key) {
    projects.value = nextGroup.projects
  }
}
```

- [ ] **Step 5: Run typecheck to verify the extracted helper compiles**

Run:

```bash
pnpm exec vue-tsc --noEmit -p tsconfig.json
```

Expected: PASS with exit code `0`.

- [ ] **Step 6: Commit the extraction**

Run:

```bash
git add mcode-app/src/pages/conversations/index.vue mcode-app/src/services/conversation/conversationOverviewSnapshot.ts
git commit -m "refactor: extract conversation overview snapshot builder"
```

## Task 2: Unify Overview and History Refresh on the Shared Snapshot Path

**Files:**
- Modify: `mcode-app/src/pages/conversations/index.vue`

- [ ] **Step 1: Add a failing typecheck by referencing a snapshot refresh helper that does not exist yet**

In `mcode-app/src/pages/conversations/index.vue`, change `ensureHistoryProjectsLoaded()` to call a missing helper:

```ts
const remoteSnapshot = await loadRemoteConnectionSnapshot(conn, group.projects)
replaceConnectionGroup(remoteSnapshot)
```

Do not define `loadRemoteConnectionSnapshot()` yet.

- [ ] **Step 2: Run typecheck to confirm the missing helper error**

Run:

```bash
pnpm exec vue-tsc --noEmit -p tsconfig.json
```

Expected: FAIL with `Cannot find name 'loadRemoteConnectionSnapshot'`.

- [ ] **Step 3: Implement remote calibration through the same snapshot builder used by overview**

Add these helpers in `mcode-app/src/pages/conversations/index.vue`:

```ts
async function loadRemoteConnectionSnapshot(
  conn: ConnectionItem,
  folders: Project[],
  tabs: OpenedTabItem[]
): Promise<ConnectionGroup> {
  const gateway = await createConnectionGateway(conn)
  const descriptor = gateway.getRemoteInstanceDescriptor()
  const remoteConversations = await fetchRemoteConversations(gateway, folders)
  await persistConversationSummaries(descriptor.instanceKey, remoteConversations)
  return toConnectionGroup(
    buildConnectionConversationSnapshot({
      connectionKey: connectionKey(conn),
      connectionName: conn.name,
      mode: conn.mode,
      url: conn.url,
      folders,
      tabs,
      conversations: remoteConversations,
    })
  )
}

async function refreshConnectionGroupFromRemote(conn: ConnectionItem, current: ConnectionGroup) {
  const gateway = await createConnectionGateway(conn)
  const descriptor = gateway.getRemoteInstanceDescriptor()
  const foldersRaw = await gateway.call<unknown>("list_all_folder_details")
  const folders = normalizeList(foldersRaw) as Project[]
  const tabsRaw = await gateway.call<unknown>("list_opened_tabs")
  const tabs = normalizeList(tabsRaw) as OpenedTabItem[]
  const remoteConversations = await fetchRemoteConversations(gateway, folders)
  await persistConversationSummaries(descriptor.instanceKey, remoteConversations)
  replaceConnectionGroup(
    toConnectionGroup(
      buildConnectionConversationSnapshot({
        connectionKey: current.key,
        connectionName: current.name,
        mode: current.mode,
        url: current.url,
        folders,
        tabs,
        conversations: remoteConversations,
      })
    )
  )
}
```

Then rewrite `ensureHistoryProjectsLoaded()` so it preserves local snapshot rendering but remote-calibrates the full group, not just `projects`:

```ts
async function ensureHistoryProjectsLoaded(group: ConnectionGroup) {
  if (group.loadError) return

  const key = group.key
  if (historyLoadPromiseMap.has(key)) {
    await historyLoadPromiseMap.get(key)
    return
  }

  const task = (async () => {
    historyLoading.value = true
    try {
      const conn = getConnectedConnections().find((item) => connectionKey(item) === key)
      if (!conn) return
      await refreshConnectionGroupFromRemote(conn, group)
    } catch (error) {
      console.warn("load history projects skipped:", error)
    } finally {
      historyLoading.value = false
      historyLoadPromiseMap.delete(key)
    }
  })()

  historyLoadPromiseMap.set(key, task)
  await task
}
```

- [ ] **Step 4: Make the initial overview load perform local-first render and remote replacement**

Change the `Promise.all` block in `loadOverviewData()` to:

```ts
const groups = await Promise.all(
  connections.map(async (conn) => {
    try {
      const initialGroup = await loadConnectionGroup(conn)
      void refreshConnectionGroupFromRemote(conn, initialGroup).catch((error) => {
        console.warn("refresh connection group from remote skipped:", error)
      })
      return initialGroup
    } catch (error) {
      return buildConnectionErrorGroup(conn, toErrorMessage(error))
    }
  })
)
```

Keep the existing connection-level error semantics unchanged.

- [ ] **Step 5: Run typecheck and a production build to verify the unified refresh path**

Run:

```bash
pnpm exec vue-tsc --noEmit -p tsconfig.json
pnpm build:h5
```

Expected:

- `vue-tsc` exits `0`
- `build:h5` completes without TypeScript or Vue compile errors

- [ ] **Step 6: Commit the shared refresh-path change**

Run:

```bash
git add mcode-app/src/pages/conversations/index.vue
git commit -m "refactor: unify conversation overview and history snapshots"
```

## Task 3: Seed New Conversation Summary Immediately After Create

**Files:**
- Modify: `mcode-app/src/pages/conversations/index.vue`

- [ ] **Step 1: Add a failing typecheck by calling a missing summary seeding helper after create success**

Insert this call in `confirmCreate()` immediately after `newConversationId` is resolved and before `acp_prompt` runs:

```ts
await seedCreatedConversationSummary({
  gateway,
  instanceKey: gateway.getRemoteInstanceDescriptor().instanceKey,
  conversationId: newConversationId,
  folderId: selectedProjectId.value,
  title: newConversationTitle.value,
  agentType: selectedAgentType.value,
})
```

Do not define `seedCreatedConversationSummary()` yet.

- [ ] **Step 2: Run typecheck to verify the helper is missing**

Run:

```bash
pnpm exec vue-tsc --noEmit -p tsconfig.json
```

Expected: FAIL with `Cannot find name 'seedCreatedConversationSummary'`.

- [ ] **Step 3: Implement immediate summary seeding with remote-detail fallback**

Add this helper near the other summary persistence functions in `mcode-app/src/pages/conversations/index.vue`:

```ts
async function seedCreatedConversationSummary(input: {
  gateway: Awaited<ReturnType<typeof createConnectionGateway>>
  instanceKey: string
  conversationId: number
  folderId: number
  title: string
  agentType: string
}) {
  const now = Date.now()

  await upsertConversationSummary({
    id: input.conversationId,
    instanceKey: input.instanceKey,
    folderId: input.folderId,
    title: input.title.trim() || `会话 #${input.conversationId}`,
    agentType: normalizeAgentType(input.agentType),
    externalId: null,
    connectionId: null,
    status: normalizeConversationStatus("in_progress"),
    lastTurnId: null,
    lastMessageAt: now,
    unreadCount: 0,
    isPinned: false,
    deletedAt: null,
    updatedAt: now,
  })

  try {
    const detail = await input.gateway.call<any>("get_conversation", {
      conversationId: input.conversationId,
    })
    const title = firstString(detail?.title, detail?.summary?.title) || input.title.trim()
    await upsertConversationSummary({
      id: input.conversationId,
      instanceKey: input.instanceKey,
      folderId: Number(detail?.folder_id || detail?.folderId || input.folderId),
      title: title || `会话 #${input.conversationId}`,
      agentType: normalizeAgentType(
        firstString(detail?.agent_type, detail?.agentType) || input.agentType
      ),
      externalId: null,
      connectionId: null,
      status: normalizeConversationStatus(
        firstString(detail?.status, detail?.summary?.status) || "in_progress"
      ),
      lastTurnId: null,
      lastMessageAt: now,
      unreadCount: 0,
      isPinned: false,
      deletedAt: null,
      updatedAt: now,
    })
  } catch (error) {
    console.warn("seed created conversation detail skipped:", error)
  }
}
```

- [ ] **Step 4: Keep the existing forced reload but make sure it now sees the seeded summary**

Leave this end of `confirmCreate()` intact:

```ts
markConversationListDirty()
await loadOverviewData({ force: true })
openConversation(
  { id: newConversationId, folder_id: selectedProjectId.value },
  selectedConnectionKey.value
)
```

The important behavior change is that `loadOverviewData({ force: true })` now has a same-day local summary to include even when codeg did not open a tab.

- [ ] **Step 5: Run typecheck and build after create-flow seeding**

Run:

```bash
pnpm exec vue-tsc --noEmit -p tsconfig.json
pnpm build:h5
```

Expected:

- both commands exit `0`
- no `index.vue` compile errors around `confirmCreate()`

- [ ] **Step 6: Commit the create-flow fix**

Run:

```bash
git add mcode-app/src/pages/conversations/index.vue
git commit -m "feat: surface same-day conversations in overview"
```

## Task 4: Manual Verification and Cleanup

**Files:**
- Review: `mcode-app/src/pages/conversations/index.vue`
- Review: `mcode-app/src/services/conversation/conversationOverviewSnapshot.ts`

- [ ] **Step 1: Verify there are no stale local helpers duplicating snapshot logic**

Search for the old page-local helpers:

```bash
rg -n "buildConnectionGroup|applyHistoryProjects|loadLocalConversationSummariesForTabs|mapSummaryRecordToConversation|mapConversationToSummaryRecord" mcode-app/src/pages/conversations/index.vue
```

Expected:

- `buildConnectionGroup`
- `applyHistoryProjects`
- `loadLocalConversationSummariesForTabs`
- `mapSummaryRecordToConversation`
- `mapConversationToSummaryRecord`

should no longer exist in `index.vue`.

- [ ] **Step 2: Run final static checks**

Run:

```bash
pnpm exec vue-tsc --noEmit -p tsconfig.json
pnpm build:h5
```

Expected: both commands exit `0`.

- [ ] **Step 3: Manually validate the required product scenarios**

Use the app and verify:

1. Open the conversations page with at least one live codeg tab.
2. Confirm opened-tab cards still render before any same-day active cards.
3. Create a new conversation in mcode without relying on a codeg tab opening.
4. Return to the conversations overview.
5. Confirm the new conversation appears under the same connection after the opened tabs.
6. Open the connection's “历史会话” page and confirm the same conversation exists there too.
7. Pick a conversation that is both open in codeg and updated today; confirm it only appears once in the overview.

- [ ] **Step 4: Commit any cleanup required by the final verification pass**

Run:

```bash
git add mcode-app/src/pages/conversations/index.vue mcode-app/src/services/conversation/conversationOverviewSnapshot.ts
git commit -m "chore: finalize conversation overview recent-active flow"
```

## Self-Review

- **Spec coverage:** Covered shared snapshot assembly, same-day active ordering, `conversationId` dedupe, local-first and remote-calibrated loading, history-page reuse, and create-time summary seeding.
- **Placeholder scan:** No `TODO`/`TBD` placeholders remain. Each code-changing step includes concrete code and commands.
- **Type consistency:** The plan uses one helper module for `ConnectionConversationSnapshot`, `ConversationOverviewConversation`, and `ConversationOverviewOpenedTab`; later page steps reference the same names consistently.
