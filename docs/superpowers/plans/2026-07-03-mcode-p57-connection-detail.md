# MCode P57 Connection Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a connection detail page with folders, settings, connection info, and config-code tabs.

**Architecture:** Add pure TypeScript route/settings helpers first, then reuse the current project list by extracting it into a shared component. The new connection detail page owns the tab shell and embeds focused tab components for settings, connection info, and config code.

**Tech Stack:** Vue 3 `<script setup>`, uni-app, uview-plus, Pinia-adjacent connection helpers, Jest.

## Global Constraints

- Work only in `D:\Repos\xyito\lingyun\mcode\.worktrees\p57-connection-detail-page`.
- Use existing `ConnectionRecordV2` storage and `resolveConnectionContext()`; do not add a new connection schema version.
- Use existing `CodegGateway.call(command, payload)` for all remote settings commands.
- Use uview-plus runtime theme variables with the `--up-*` prefix.
- Do not introduce new `--mcode-*` color, background, border, or shadow aliases.
- Do not display direct tokens, pair secrets, access tokens, or refresh tokens.
- Every mcode change must add or update a note under `docs/mcode-architecture-notes/`.
- Existing full `pnpm test:unit` baseline has unrelated conversation-detail style contract failures; targeted P57 tests must pass and full-suite residual failures must be reported separately.

---

## File Structure

- Create `mcode-app/src/services/connectionDetail.ts`: route helpers, tab normalization, safe connection display helpers.
- Create `mcode-app/src/services/connectionDetailSettings.ts`: typed wrappers and normalizers for desktop settings commands.
- Create `mcode-app/tests/services/connectionDetail.spec.ts`: route and display helper coverage.
- Create `mcode-app/tests/services/connectionDetailSettings.spec.ts`: settings wrapper payload and normalization coverage.
- Create `mcode-app/src/components/projects/ProjectFolderList.vue`: reusable folder/project list body extracted from `pages/projects/index.vue`.
- Modify `mcode-app/src/pages/projects/index.vue`: thin route wrapper that passes a resolved local connection into `ProjectFolderList`.
- Create `mcode-app/tests/pages/projects/projectFolderListContract.spec.ts`: source-level contract for extraction and wrapper reuse.
- Create `mcode-app/src/pages/connection-detail/index.vue`: detail shell, connection header, tab strip, route loading.
- Create `mcode-app/src/pages/connection-detail/components/ConnectionSettingsTab.vue`: grouped settings list and editors.
- Create `mcode-app/src/pages/connection-detail/components/ConnectionInfoTab.vue`: read-only connection metadata.
- Create `mcode-app/src/pages/connection-detail/components/ConnectionConfigCodeTab.vue`: QR/text/copy config-code UI.
- Create `mcode-app/src/pages/connection-detail/connectionDetailPresentation.ts`: presentation rows for connection info and appearance options.
- Create `mcode-app/tests/pages/connection-detail/connectionDetailPresentation.spec.ts`: presentation helper coverage.
- Create `mcode-app/tests/pages/connection-detail/connectionDetailPageContract.spec.ts`: source-level page contract.
- Modify `mcode-app/src/pages.json`: register `pages/connection-detail/index`.
- Modify `mcode-app/src/pages/connections/index.vue`: route main card and config-code action to the new detail page.
- Create `docs/mcode-architecture-notes/2026-07-03-p57-connection-detail.md`: architecture, data flow, compatibility, native guidance.

---

### Task 1: Route And Settings Service Boundaries

**Files:**
- Create: `mcode-app/src/services/connectionDetail.ts`
- Create: `mcode-app/src/services/connectionDetailSettings.ts`
- Test: `mcode-app/tests/services/connectionDetail.spec.ts`
- Test: `mcode-app/tests/services/connectionDetailSettings.spec.ts`

**Interfaces:**
- Produces: `ConnectionDetailTab`, `normalizeConnectionDetailTab(value)`, `buildConnectionDetailRoute({ connectionId, tab })`, `getConnectionEndpointLabel(connection)`, `maskSecretPresence(value)`.
- Produces: `SystemLanguageSettings`, `DelegationSettings`, `QuickMessage`, `BooleanToolSettings`, `getRemoteLanguageSettings(gateway)`, `updateRemoteLanguageSettings(gateway, settings)`, `getRemoteDelegationSettings(gateway)`, `setRemoteDelegationSettings(gateway, settings)`, `listRemoteQuickMessages(gateway)`, `createRemoteQuickMessage(gateway, payload)`, `updateRemoteQuickMessage(gateway, payload)`, `deleteRemoteQuickMessage(gateway, id)`, `getRemoteFeedbackSettings(gateway)`, `setRemoteFeedbackSettings(gateway, settings)`, `getRemoteQuestionSettings(gateway)`, `setRemoteQuestionSettings(gateway, settings)`, `isUnsupportedSettingsCommand(error)`.
- Consumes: `CodegGateway`, `ConnectionRecordV2`.

- [ ] **Step 1: Write route helper tests**

Create `mcode-app/tests/services/connectionDetail.spec.ts`:

```ts
import {
  buildConnectionDetailRoute,
  getConnectionEndpointLabel,
  maskSecretPresence,
  normalizeConnectionDetailTab,
} from "@/services/connectionDetail"

describe("connectionDetail service", () => {
  it("normalizes tabs with folders as fallback", () => {
    expect(normalizeConnectionDetailTab("settings")).toBe("settings")
    expect(normalizeConnectionDetailTab("info")).toBe("info")
    expect(normalizeConnectionDetailTab("config")).toBe("config")
    expect(normalizeConnectionDetailTab("bad")).toBe("folders")
  })

  it("builds connection detail routes with encoded ids and tabs", () => {
    expect(
      buildConnectionDetailRoute({ connectionId: "conn 1", tab: "config" })
    ).toBe("/pages/connection-detail/index?connectionId=conn%201&tab=config")
  })

  it("formats endpoints without exposing secrets", () => {
    expect(
      getConnectionEndpointLabel({
        version: 2,
        id: "conn_a",
        name: "Local",
        targetAgent: "codeg",
        routeMode: "direct",
        directBaseUrl: "http://127.0.0.1:3089",
        directToken: "secret",
      })
    ).toBe("http://127.0.0.1:3089")
    expect(maskSecretPresence("secret")).toBe("已保存")
    expect(maskSecretPresence("")).toBe("未保存")
  })
})
```

- [ ] **Step 2: Implement route helper code**

Create `mcode-app/src/services/connectionDetail.ts`:

```ts
import type { ConnectionRecordV2 } from "@/services/connectionSchema"
import {
  getConnectionRouteLabel,
  getConnectionTargetLabel,
} from "@/pages/connections/connectionPresentation"

export type ConnectionDetailTab = "folders" | "settings" | "info" | "config"

const TABS = new Set<ConnectionDetailTab>(["folders", "settings", "info", "config"])

export function normalizeConnectionDetailTab(value: unknown): ConnectionDetailTab {
  return typeof value === "string" && TABS.has(value as ConnectionDetailTab)
    ? (value as ConnectionDetailTab)
    : "folders"
}

export function buildConnectionDetailRoute(params: {
  connectionId: string
  tab?: ConnectionDetailTab
}) {
  const tab = normalizeConnectionDetailTab(params.tab || "folders")
  return `/pages/connection-detail/index?connectionId=${encodeURIComponent(
    params.connectionId
  )}&tab=${tab}`
}

export function getConnectionEndpointLabel(connection: Pick<
  ConnectionRecordV2,
  "routeMode" | "directBaseUrl" | "gatewayBaseUrl" | "gatewayProvider"
>) {
  if (connection.routeMode === "direct") return connection.directBaseUrl || ""
  return connection.gatewayBaseUrl || connection.gatewayProvider || "official"
}

export function getConnectionKindLabel(
  connection: Pick<ConnectionRecordV2, "targetAgent" | "routeMode">
) {
  return `${getConnectionTargetLabel(connection)} · ${getConnectionRouteLabel(connection)}`
}

export function maskSecretPresence(value: unknown) {
  return typeof value === "string" && value.trim() ? "已保存" : "未保存"
}
```

- [ ] **Step 3: Write settings wrapper tests**

Create `mcode-app/tests/services/connectionDetailSettings.spec.ts`:

```ts
import {
  createRemoteQuickMessage,
  deleteRemoteQuickMessage,
  getRemoteDelegationSettings,
  getRemoteFeedbackSettings,
  getRemoteLanguageSettings,
  getRemoteQuestionSettings,
  isUnsupportedSettingsCommand,
  listRemoteQuickMessages,
  normalizeDelegationSettings,
  normalizeLanguageSettings,
  setRemoteDelegationSettings,
  setRemoteFeedbackSettings,
  setRemoteQuestionSettings,
  updateRemoteLanguageSettings,
  updateRemoteQuickMessage,
} from "@/services/connectionDetailSettings"

describe("connectionDetailSettings service", () => {
  it("normalizes language settings", () => {
    expect(normalizeLanguageSettings({ mode: "manual", language: "zh_cn" })).toEqual({
      mode: "manual",
      language: "zh_cn",
    })
    expect(normalizeLanguageSettings({ mode: "bad", language: "bad" })).toEqual({
      mode: "system",
      language: "en",
    })
  })

  it("normalizes delegation settings with bounded numbers", () => {
    expect(
      normalizeDelegationSettings({
        enabled: true,
        depth_limit: 12,
        completed_cache_max_mb: -1,
        agent_defaults: { codex: {} },
      })
    ).toEqual({
      enabled: true,
      depth_limit: 8,
      completed_cache_max_mb: 0,
      agent_defaults: { codex: {} },
    })
  })

  it("calls desktop setting commands with expected payloads", async () => {
    const gateway = { call: jest.fn().mockResolvedValue({ enabled: true }) }

    await getRemoteLanguageSettings(gateway as any)
    await updateRemoteLanguageSettings(gateway as any, { mode: "manual", language: "zh_cn" })
    await getRemoteDelegationSettings(gateway as any)
    await setRemoteDelegationSettings(gateway as any, {
      enabled: true,
      depth_limit: 2,
      completed_cache_max_mb: 512,
    })
    await listRemoteQuickMessages(gateway as any)
    await createRemoteQuickMessage(gateway as any, { title: "A", content: "B" })
    await updateRemoteQuickMessage(gateway as any, { id: 1, title: "C", content: "D" })
    await deleteRemoteQuickMessage(gateway as any, 1)
    await getRemoteFeedbackSettings(gateway as any)
    await setRemoteFeedbackSettings(gateway as any, { enabled: true })
    await getRemoteQuestionSettings(gateway as any)
    await setRemoteQuestionSettings(gateway as any, { enabled: false })

    expect(gateway.call).toHaveBeenCalledWith("get_system_language_settings")
    expect(gateway.call).toHaveBeenCalledWith("update_system_language_settings", {
      settings: { mode: "manual", language: "zh_cn" },
    })
    expect(gateway.call).toHaveBeenCalledWith("get_delegation_settings")
    expect(gateway.call).toHaveBeenCalledWith("set_delegation_settings", {
      settings: { enabled: true, depth_limit: 2, completed_cache_max_mb: 512 },
    })
    expect(gateway.call).toHaveBeenCalledWith("quick_messages_list")
    expect(gateway.call).toHaveBeenCalledWith("quick_messages_create", {
      title: "A",
      content: "B",
    })
    expect(gateway.call).toHaveBeenCalledWith("quick_messages_update", {
      id: 1,
      title: "C",
      content: "D",
    })
    expect(gateway.call).toHaveBeenCalledWith("quick_messages_delete", { id: 1 })
    expect(gateway.call).toHaveBeenCalledWith("get_feedback_settings")
    expect(gateway.call).toHaveBeenCalledWith("set_feedback_settings", {
      settings: { enabled: true },
    })
    expect(gateway.call).toHaveBeenCalledWith("get_question_settings")
    expect(gateway.call).toHaveBeenCalledWith("set_question_settings", {
      settings: { enabled: false },
    })
  })

  it("detects unsupported command errors", () => {
    expect(isUnsupportedSettingsCommand(new Error("404 not found"))).toBe(true)
    expect(isUnsupportedSettingsCommand("unsupported desktop folder command")).toBe(true)
    expect(isUnsupportedSettingsCommand(new Error("network timeout"))).toBe(false)
  })
})
```

- [ ] **Step 4: Implement settings wrapper code**

Create `mcode-app/src/services/connectionDetailSettings.ts` with these exported types and functions:

```ts
import type { CodegGateway } from "@/services/gateway"

export type AppLocale =
  | "en" | "zh_cn" | "zh_tw" | "ja" | "ko" | "es" | "de" | "fr" | "pt" | "ar"
export type LanguageMode = "system" | "manual"

export interface SystemLanguageSettings {
  mode: LanguageMode
  language: AppLocale
}

export interface DelegationSettings {
  enabled: boolean
  depth_limit: number
  completed_cache_max_mb: number
  agent_defaults?: Record<string, unknown>
}

export interface QuickMessage {
  id: number
  title: string
  content: string
  sort_order: number
  created_at: string
  updated_at: string
}

export interface BooleanToolSettings {
  enabled: boolean
}

const LOCALES = new Set<AppLocale>([
  "en", "zh_cn", "zh_tw", "ja", "ko", "es", "de", "fr", "pt", "ar",
])

export function normalizeLanguageSettings(input: unknown): SystemLanguageSettings {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {}
  const mode = raw.mode === "manual" ? "manual" : "system"
  const language = LOCALES.has(raw.language as AppLocale) ? (raw.language as AppLocale) : "en"
  return { mode, language }
}

export function normalizeDelegationSettings(input: unknown): DelegationSettings {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {}
  return {
    enabled: Boolean(raw.enabled),
    depth_limit: clampInt(raw.depth_limit, 1, 8, 1),
    completed_cache_max_mb: Math.max(0, Math.trunc(Number(raw.completed_cache_max_mb || 0))),
    ...(raw.agent_defaults && typeof raw.agent_defaults === "object"
      ? { agent_defaults: raw.agent_defaults as Record<string, unknown> }
      : {}),
  }
}

export function normalizeBooleanToolSettings(input: unknown): BooleanToolSettings {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {}
  return { enabled: Boolean(raw.enabled) }
}

export async function getRemoteLanguageSettings(gateway: CodegGateway) {
  return normalizeLanguageSettings(await gateway.call("get_system_language_settings"))
}

export async function updateRemoteLanguageSettings(
  gateway: CodegGateway,
  settings: SystemLanguageSettings
) {
  return normalizeLanguageSettings(
    await gateway.call("update_system_language_settings", { settings })
  )
}

export async function getRemoteDelegationSettings(gateway: CodegGateway) {
  return normalizeDelegationSettings(await gateway.call("get_delegation_settings"))
}

export async function setRemoteDelegationSettings(
  gateway: CodegGateway,
  settings: DelegationSettings
) {
  return normalizeDelegationSettings(
    await gateway.call("set_delegation_settings", { settings })
  )
}

export const listRemoteQuickMessages = (gateway: CodegGateway) =>
  gateway.call<QuickMessage[]>("quick_messages_list")
export const createRemoteQuickMessage = (
  gateway: CodegGateway,
  payload: Pick<QuickMessage, "title" | "content">
) => gateway.call<QuickMessage>("quick_messages_create", payload)
export const updateRemoteQuickMessage = (
  gateway: CodegGateway,
  payload: Pick<QuickMessage, "id"> & Partial<Pick<QuickMessage, "title" | "content">>
) => gateway.call<QuickMessage>("quick_messages_update", {
  id: payload.id,
  title: payload.title ?? null,
  content: payload.content ?? null,
})
export const deleteRemoteQuickMessage = (gateway: CodegGateway, id: number) =>
  gateway.call<void>("quick_messages_delete", { id })

export const getRemoteFeedbackSettings = async (gateway: CodegGateway) =>
  normalizeBooleanToolSettings(await gateway.call("get_feedback_settings"))
export const setRemoteFeedbackSettings = async (
  gateway: CodegGateway,
  settings: BooleanToolSettings
) => normalizeBooleanToolSettings(await gateway.call("set_feedback_settings", { settings }))
export const getRemoteQuestionSettings = async (gateway: CodegGateway) =>
  normalizeBooleanToolSettings(await gateway.call("get_question_settings"))
export const setRemoteQuestionSettings = async (
  gateway: CodegGateway,
  settings: BooleanToolSettings
) => normalizeBooleanToolSettings(await gateway.call("set_question_settings", { settings }))

export function isUnsupportedSettingsCommand(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "")
  return /unsupported|not found|404|unknown command|no handler/i.test(message)
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const next = Math.trunc(Number(value))
  if (!Number.isFinite(next)) return fallback
  return Math.min(max, Math.max(min, next))
}
```

- [ ] **Step 5: Run targeted tests**

Run:

```powershell
pnpm exec jest --config jest.config.cjs --runInBand tests/services/connectionDetail.spec.ts tests/services/connectionDetailSettings.spec.ts
```

Expected: both new test files pass.

- [ ] **Step 6: Commit**

```powershell
git add mcode-app/src/services/connectionDetail.ts mcode-app/src/services/connectionDetailSettings.ts mcode-app/tests/services/connectionDetail.spec.ts mcode-app/tests/services/connectionDetailSettings.spec.ts
git commit -m "feat(app): add connection detail service helpers"
```

---

### Task 2: Extract Reusable Folder List Component

**Files:**
- Create: `mcode-app/src/components/projects/ProjectFolderList.vue`
- Modify: `mcode-app/src/pages/projects/index.vue`
- Test: `mcode-app/tests/pages/projects/projectFolderListContract.spec.ts`

**Interfaces:**
- Consumes: `ConnectionContext`, `CodegGateway`, `loadRemoteProjects`, `buildProjectListItems`, `openRemoteFolder`.
- Produces: `ProjectFolderList` component with prop `connection` and prop `embedded`.
- Produces: route wrapper page that passes the stored connection to `ProjectFolderList`.

- [ ] **Step 1: Write extraction contract test**

Create `mcode-app/tests/pages/projects/projectFolderListContract.spec.ts`:

```ts
import fs from "node:fs"
import path from "node:path"

const root = path.resolve(__dirname, "../../../src")

function readSource(relative: string) {
  return fs.readFileSync(path.join(root, relative), "utf8")
}

describe("ProjectFolderList extraction", () => {
  it("keeps folder loading and add-folder behavior in the reusable component", () => {
    const source = readSource("components/projects/ProjectFolderList.vue")
    expect(source).toContain("loadRemoteProjects")
    expect(source).toContain("buildProjectListItems")
    expect(source).toContain("RemoteDirectoryBrowser")
    expect(source).toContain("openRemoteFolder")
    expect(source).toContain("defineExpose")
  })

  it("keeps projects page as a route wrapper", () => {
    const source = readSource("pages/projects/index.vue")
    expect(source).toContain("ProjectFolderList")
    expect(source).toContain("findStoredConnectionById")
    expect(source).toContain("decodeConnectionContext")
  })
})
```

- [ ] **Step 2: Create `ProjectFolderList.vue`**

Create `mcode-app/src/components/projects/ProjectFolderList.vue` by moving the project-list template, script loading logic, directory browser, and styles from `pages/projects/index.vue`. Keep this public component contract:

```ts
const props = defineProps<{
  connection: ConnectionContext | null
  embedded?: boolean
}>()

const emit = defineEmits<{
  (event: "resolved", connection: ConnectionContext): void
}>()

defineExpose({
  refresh: () => loadPage(),
})
```

Inside `loadPage`, replace direct writes to a page-local `connection` ref with:

```ts
const connectionRef = ref<ConnectionContext | null>(props.connection)

watch(
  () => props.connection,
  (next) => {
    connectionRef.value = next
    void loadPage()
  },
  { immediate: true }
)

const resolved = await resolveConnectionContext(connectionRef.value)
connectionRef.value = resolved.connection
persistResolvedConnection(resolved.connection)
emit("resolved", resolved.connection)
```

Keep the existing `openProjectSessions`, `openProjectActionSheet`, `handleProjectActionSelect`, `openAddProjectBrowser`, and `handleRemoteFolderSelected` behavior intact.

- [ ] **Step 3: Reduce `pages/projects/index.vue` to a wrapper**

Replace the page body with:

```vue
<template>
  <ProjectFolderList
    ref="folderListRef"
    :connection="connection"
    @resolved="connection = $event"
  />
</template>
```

Keep only route parsing and pull-down refresh:

```ts
import { ref } from "vue"
import { onLoad, onPullDownRefresh } from "@dcloudio/uni-app"
import ProjectFolderList from "@/components/projects/ProjectFolderList.vue"
import {
  decodeConnectionContext,
  findStoredConnectionById,
  type ConnectionContext,
} from "@/services/connectionContext"

const connection = ref<ConnectionContext | null>(null)
const folderListRef = ref<InstanceType<typeof ProjectFolderList> | null>(null)

onLoad((options) => {
  connection.value =
    findStoredConnectionById(String(options?.connectionId || "")) ||
    decodeConnectionContext(options?.connection as string)
})

onPullDownRefresh(async () => {
  await folderListRef.value?.refresh()
  uni.stopPullDownRefresh()
})
```

- [ ] **Step 4: Run targeted test**

Run:

```powershell
pnpm exec jest --config jest.config.cjs --runInBand tests/pages/projects/projectFolderListContract.spec.ts
```

Expected: new contract test passes.

- [ ] **Step 5: Commit**

```powershell
git add mcode-app/src/components/projects/ProjectFolderList.vue mcode-app/src/pages/projects/index.vue mcode-app/tests/pages/projects/projectFolderListContract.spec.ts
git commit -m "feat(app): extract reusable project folder list"
```

---

### Task 3: Add Connection Detail Shell, Info Tab, And Config Code Tab

**Files:**
- Create: `mcode-app/src/pages/connection-detail/index.vue`
- Create: `mcode-app/src/pages/connection-detail/components/ConnectionInfoTab.vue`
- Create: `mcode-app/src/pages/connection-detail/components/ConnectionConfigCodeTab.vue`
- Create: `mcode-app/src/pages/connection-detail/connectionDetailPresentation.ts`
- Modify: `mcode-app/src/pages.json`
- Modify: `mcode-app/src/pages/connections/index.vue`
- Test: `mcode-app/tests/pages/connection-detail/connectionDetailPresentation.spec.ts`
- Test: `mcode-app/tests/pages/connection-detail/connectionDetailPageContract.spec.ts`
- Modify: `mcode-app/tests/services/remoteSettings.spec.ts`

**Interfaces:**
- Consumes: Task 1 route helpers and Task 2 `ProjectFolderList`.
- Produces: detail route `/pages/connection-detail/index?connectionId=<id>&tab=<tab>`.
- Produces: info rows that hide secrets and config-code tab that uses `buildConnectionConfigCode`.

- [ ] **Step 1: Add presentation tests**

Create `mcode-app/tests/pages/connection-detail/connectionDetailPresentation.spec.ts`:

```ts
import {
  buildConnectionInfoRows,
  getAppearanceAccentOptions,
} from "@/pages/connection-detail/connectionDetailPresentation"

describe("connection detail presentation", () => {
  it("builds read-only rows without exposing secrets", () => {
    const rows = buildConnectionInfoRows({
      version: 2,
      id: "conn_demo",
      name: "Demo",
      targetAgent: "codeg",
      routeMode: "direct",
      directBaseUrl: "http://127.0.0.1:3089",
      directToken: "secret-token",
      targetProfile: {
        targetAgent: "codeg",
        displayName: "Desktop",
        capabilities: ["folders", "settings"],
        protocolVersion: "1",
      },
    })

    expect(rows).toContainEqual({ label: "连接 ID", value: "conn_demo" })
    expect(rows).toContainEqual({ label: "直连 Token", value: "已保存" })
    expect(rows.map((row) => row.value).join(" ")).not.toContain("secret-token")
  })

  it("keeps desktop accent options visible for protocol-limited appearance", () => {
    expect(getAppearanceAccentOptions().map((item) => item.value)).toEqual([
      "neutral",
      "zinc",
      "slate",
      "stone",
      "gray",
      "red",
      "rose",
      "orange",
      "green",
      "blue",
      "yellow",
      "violet",
    ])
  })
})
```

- [ ] **Step 2: Implement presentation helpers**

Create `mcode-app/src/pages/connection-detail/connectionDetailPresentation.ts`:

```ts
import type { ConnectionRecordV2 } from "@/services/connectionSchema"
import { getConnectionEndpointLabel, maskSecretPresence } from "@/services/connectionDetail"
import {
  getConnectionProviderLabel,
  getConnectionRouteLabel,
  getConnectionTargetLabel,
} from "@/pages/connections/connectionPresentation"

export interface InfoRow {
  label: string
  value: string
}

export const DESKTOP_ACCENT_OPTIONS = [
  "neutral", "zinc", "slate", "stone", "gray", "red",
  "rose", "orange", "green", "blue", "yellow", "violet",
] as const

export function getAppearanceAccentOptions() {
  return DESKTOP_ACCENT_OPTIONS.map((value) => ({ value, label: value }))
}

export function buildConnectionInfoRows(connection: ConnectionRecordV2): InfoRow[] {
  const target = connection.targetProfile || null
  const rows: InfoRow[] = [
    { label: "连接 ID", value: connection.id || "未分配" },
    { label: "目标", value: getConnectionTargetLabel(connection) },
    { label: "路由", value: getConnectionRouteLabel(connection) },
    { label: "网关", value: getConnectionProviderLabel(connection) || "无" },
    { label: "地址", value: getConnectionEndpointLabel(connection) || "未配置" },
    { label: "目标名称", value: target?.displayName || connection.gatewaySession?.displayName || "未返回" },
    { label: "目标 ID", value: target?.targetId || connection.gatewaySession?.targetId || "未返回" },
    { label: "协议版本", value: target?.protocolVersion || connection.gatewaySession?.protocolVersion || "未返回" },
    { label: "能力", value: (target?.capabilities || connection.gatewaySession?.capabilities || []).join(" · ") || "未返回" },
  ]

  if (connection.routeMode === "direct") {
    rows.push({ label: "直连 Token", value: maskSecretPresence(connection.directToken) })
  } else {
    rows.push({ label: "配对码", value: maskSecretPresence(connection.pairCode) })
    rows.push({ label: "配对密钥", value: maskSecretPresence(connection.pairSecret) })
    rows.push({ label: "访问令牌", value: maskSecretPresence(connection.gatewaySession?.accessToken) })
    rows.push({ label: "刷新令牌", value: maskSecretPresence(connection.gatewaySession?.refreshToken) })
  }

  return rows
}
```

- [ ] **Step 3: Add source-level page contract test**

Create `mcode-app/tests/pages/connection-detail/connectionDetailPageContract.spec.ts`:

```ts
import fs from "node:fs"
import path from "node:path"

const root = path.resolve(__dirname, "../../../src")

function readSource(relative: string) {
  return fs.readFileSync(path.join(root, relative), "utf8")
}

describe("connection detail page contract", () => {
  it("registers the page and renders all four tabs", () => {
    const pages = readSource("pages.json")
    const source = readSource("pages/connection-detail/index.vue")
    expect(pages).toContain("pages/connection-detail/index")
    expect(source).toContain("ProjectFolderList")
    expect(source).toContain("ConnectionSettingsTab")
    expect(source).toContain("ConnectionInfoTab")
    expect(source).toContain("ConnectionConfigCodeTab")
    expect(source).toContain("folders")
    expect(source).toContain("settings")
    expect(source).toContain("info")
    expect(source).toContain("config")
  })

  it("routes connections page card and config action into detail", () => {
    const source = readSource("pages/connections/index.vue")
    expect(source).toContain("buildConnectionDetailRoute")
    expect(source).toContain("openConnectionDetail")
    expect(source).toContain("tab: \"config\"")
  })
})
```

- [ ] **Step 4: Register page route**

Add to `mcode-app/src/pages.json` after `pages/projects/index` or near connection pages:

```json
{
  "path": "pages/connection-detail/index",
  "style": {
    "navigationBarTitleText": "连接详情",
    "enablePullDownRefresh": false
  }
}
```

- [ ] **Step 5: Implement info and config tabs**

Create `ConnectionInfoTab.vue` with prop `connection: ConnectionRecordV2 | null` and render `buildConnectionInfoRows(connection)`.

Create `ConnectionConfigCodeTab.vue` with prop `connection: ConnectionRecordV2 | null` and this core behavior:

```ts
const configCodeValue = computed(() => {
  if (!props.connection) return ""
  try {
    return buildConnectionConfigCode(props.connection)
  } catch {
    return ""
  }
})

function copyConfigCode() {
  if (!configCodeValue.value) return
  uni.setClipboardData({
    data: configCodeValue.value,
    success: () => uni.showToast({ title: "已复制配置码", icon: "success" }),
    fail: () => uni.showToast({ title: "复制失败", icon: "none" }),
  })
}
```

Use the existing QR component pattern from `pages/connections/index.vue` if the component is available in the page.

- [ ] **Step 6: Implement detail shell**

Create `mcode-app/src/pages/connection-detail/index.vue` with:

```ts
const connection = ref<ConnectionContext | null>(null)
const activeTab = ref<ConnectionDetailTab>("folders")
const tabs = [
  { key: "folders", label: "文件夹" },
  { key: "settings", label: "设置" },
  { key: "info", label: "连接信息" },
  { key: "config", label: "配置码" },
] as const

onLoad((options) => {
  activeTab.value = normalizeConnectionDetailTab(options?.tab)
  connection.value =
    findStoredConnectionById(String(options?.connectionId || "")) ||
    decodeConnectionContext(options?.connection as string)
})
```

Render:

```vue
<ProjectFolderList
  v-if="activeTab === 'folders'"
  :connection="connection"
  embedded
  @resolved="connection = $event"
/>
<ConnectionSettingsTab
  v-else-if="activeTab === 'settings'"
  :connection="connection"
/>
<ConnectionInfoTab
  v-else-if="activeTab === 'info'"
  :connection="connection"
/>
<ConnectionConfigCodeTab
  v-else
  :connection="connection"
/>
```

- [ ] **Step 7: Wire connections page route**

In `mcode-app/src/pages/connections/index.vue`, import `buildConnectionDetailRoute` and change the card click:

```ts
function openConnectionDetail(conn: ConnectionItem, tab: ConnectionDetailTab = "folders") {
  uni.navigateTo({
    url: buildConnectionDetailRoute({ connectionId: conn.id, tab }),
  })
}
```

Use `@click="openConnectionDetail(conn)"` on the main card. Keep the footer `activateConnection(conn)` fast path. In `handleActionSelect`, change `配置码` to:

```ts
} else if (action === "配置码") {
  openConnectionDetail(conn, "config")
}
```

- [ ] **Step 8: Add route helper test coverage**

Modify `mcode-app/tests/services/remoteSettings.spec.ts` only if imports need a route helper relocation. Otherwise leave it unchanged.

- [ ] **Step 9: Run targeted tests**

Run:

```powershell
pnpm exec jest --config jest.config.cjs --runInBand tests/pages/connection-detail/connectionDetailPresentation.spec.ts tests/pages/connection-detail/connectionDetailPageContract.spec.ts tests/services/connectionDetail.spec.ts
```

Expected: targeted tests pass.

- [ ] **Step 10: Commit**

```powershell
git add mcode-app/src/pages/connection-detail mcode-app/src/pages.json mcode-app/src/pages/connections/index.vue mcode-app/tests/pages/connection-detail mcode-app/tests/services/remoteSettings.spec.ts
git commit -m "feat(app): add connection detail shell"
```

---

### Task 4: Implement Settings Tab UI And Remote Editors

**Files:**
- Modify: `mcode-app/src/pages/connection-detail/components/ConnectionSettingsTab.vue`
- Modify: `mcode-app/src/pages/connection-detail/connectionDetailPresentation.ts`
- Test: `mcode-app/tests/pages/connection-detail/connectionDetailPresentation.spec.ts`
- Test: `mcode-app/tests/services/connectionDetailSettings.spec.ts`

**Interfaces:**
- Consumes: Task 1 settings wrappers.
- Produces: grouped settings list with subpanels for appearance, language, general, quick messages.

- [ ] **Step 1: Add presentation coverage for settings rows**

Extend `connectionDetailPresentation.spec.ts` with:

```ts
import { buildSettingsRows } from "@/pages/connection-detail/connectionDetailPresentation"

it("builds P57 settings groups in the approved order", () => {
  expect(buildSettingsRows()).toEqual([
    {
      title: "个性化",
      rows: [
        expect.objectContaining({ key: "appearance", label: "外观" }),
        expect.objectContaining({ key: "language", label: "语言" }),
        expect.objectContaining({ key: "general", label: "通用" }),
        expect.objectContaining({ key: "quickMessages", label: "快捷消息" }),
      ],
    },
  ])
})
```

Add `buildSettingsRows()`:

```ts
export function buildSettingsRows() {
  return [
    {
      title: "个性化",
      rows: [
        { key: "appearance", label: "外观", value: "强调色" },
        { key: "language", label: "语言", value: "系统" },
        { key: "general", label: "通用", value: "委派 · 对话工具" },
        { key: "quickMessages", label: "快捷消息", value: "" },
      ],
    },
  ] as const
}
```

- [ ] **Step 2: Implement settings list shell**

In `ConnectionSettingsTab.vue`, resolve the gateway lazily:

```ts
const props = defineProps<{ connection: ConnectionContext | null }>()
const gateway = ref<CodegGateway | null>(null)
const resolving = ref(false)
const resolveError = ref("")

async function ensureGateway() {
  if (gateway.value) return gateway.value
  if (!props.connection) throw new Error("缺少连接信息")
  resolving.value = true
  try {
    const resolved = await resolveConnectionContext(props.connection)
    persistResolvedConnection(resolved.connection)
    gateway.value = resolved.gateway
    return resolved.gateway
  } finally {
    resolving.value = false
  }
}
```

Render grouped rows with icon buttons from uview icons, arrow-right affordances, and `--up-*` themed cards.

- [ ] **Step 3: Implement appearance panel**

When the `外观` row is tapped, open a bottom popup. Show accent options from `getAppearanceAccentOptions()` as swatches, but disable persistence and display:

```text
桌面端强调色目前是 codeg-main 前端本地偏好，P57 只展示映射选项；远程修改需要桌面端新增偏好命令。
```

- [ ] **Step 4: Implement language panel**

On open:

```ts
const current = await getRemoteLanguageSettings(await ensureGateway())
languageSettings.value = current
```

On picker change:

```ts
const applied = await updateRemoteLanguageSettings(await ensureGateway(), {
  mode: next === "system" ? "system" : "manual",
  language: next === "system" ? languageSettings.value.language : next,
})
languageSettings.value = applied
uni.showToast({ title: "语言设置已保存", icon: "success" })
```

Use picker options `system`, `en`, `zh_cn`, `zh_tw`, `ja`, `ko`, `es`, `de`, `fr`, `pt`, `ar`.

- [ ] **Step 5: Implement general panel**

The general popup has two sections.

Delegation section:

```ts
const settings = await getRemoteDelegationSettings(await ensureGateway())
delegation.value = settings
```

Controls:
- `up-switch` for `enabled`
- numeric `up-input` for `depth_limit`
- numeric `up-input` for `completed_cache_max_mb`
- save button calls `setRemoteDelegationSettings`

Conversation tools section:
- `up-switch` for feedback enabled, using `getRemoteFeedbackSettings` / `setRemoteFeedbackSettings`
- `up-switch` for ask-question enabled, using `getRemoteQuestionSettings` / `setRemoteQuestionSettings`

For unsupported commands, set section error text to `当前桌面端不支持` and keep the rest of the panel usable.

- [ ] **Step 6: Implement quick messages panel**

On open, call `listRemoteQuickMessages`. Render a list ordered by server response. Support:

- create: empty title/content form calls `createRemoteQuickMessage`
- edit: row tap loads title/content into the form and save calls `updateRemoteQuickMessage`
- delete: delete button calls `deleteRemoteQuickMessage`

Do not implement drag reorder in P57. After each mutation, reload the list.

- [ ] **Step 7: Run targeted tests**

Run:

```powershell
pnpm exec jest --config jest.config.cjs --runInBand tests/pages/connection-detail/connectionDetailPresentation.spec.ts tests/services/connectionDetailSettings.spec.ts
```

Expected: targeted tests pass.

- [ ] **Step 8: Commit**

```powershell
git add mcode-app/src/pages/connection-detail/components/ConnectionSettingsTab.vue mcode-app/src/pages/connection-detail/connectionDetailPresentation.ts mcode-app/tests/pages/connection-detail/connectionDetailPresentation.spec.ts mcode-app/tests/services/connectionDetailSettings.spec.ts
git commit -m "feat(app): add connection settings tab"
```

---

### Task 5: Architecture Note And Verification

**Files:**
- Create: `docs/mcode-architecture-notes/2026-07-03-p57-connection-detail.md`
- Modify: files from prior tasks if verification exposes integration gaps.

**Interfaces:**
- Consumes: implemented P57 behavior.
- Produces: native replication guidance and final test record.

- [ ] **Step 1: Add architecture note**

Create `docs/mcode-architecture-notes/2026-07-03-p57-connection-detail.md`:

```md
# P57 连接详情页

## 架构

MCode App 新增 `pages/connection-detail/index` 作为连接级工作台。页面通过本地 `connectionId` 恢复 `ConnectionRecordV2`，顶部展示连接基础信息，下面用四个标签承载 `文件夹`、`设置`、`连接信息`、`配置码`。

文件夹标签复用 `ProjectFolderList`，旧 `pages/projects/index` 只保留路由包装。设置标签通过现有 `CodegGateway.call(command, payload)` 调用 codeg-main 已有设置命令，不新增连接 schema。

## 协议与数据流

- 文件夹：继续使用 `list_open_folder_details`、`open_folder`、`get_home_directory`、`list_directory_entries` 等 P45 协议。
- 语言：`get_system_language_settings` / `update_system_language_settings`。
- 委派：`get_delegation_settings` / `set_delegation_settings`，移动端只编辑 enabled、depth_limit、completed_cache_max_mb。
- 对话工具：`get_feedback_settings` / `set_feedback_settings`、`get_question_settings` / `set_question_settings`。
- 快捷消息：`quick_messages_list`、`quick_messages_create`、`quick_messages_update`、`quick_messages_delete`；P57 不做 reorder。
- 外观强调色：codeg-main 当前是前端 localStorage/DOM 偏好，P57 只展示映射选项和协议缺口，不伪造远端保存。

## UI 行为

连接列表主卡进入详情页；底部主操作继续连接并打开文件夹列表。详情页 tab 顺序是 `文件夹 / 设置 / 连接信息 / 配置码`。设置页采用截图同类的分组列表：`个性化` 下有 `外观`、`语言`、`通用`、`快捷消息`。`通用` 内含 `委派` 与 `对话工具`。

## 兼容性

codeg-main 新版本支持可读写设置。mcode-desktop 或旧 codeg-main 缺少命令时，设置标签按行显示 `当前桌面端不支持`，不阻断文件夹、连接信息或配置码。

## iOS / Android 复刻要求

原生端必须用同一连接 gateway 调用桌面命令。不要在连接信息中展示 secret。文件夹标签必须浏览远端目录。外观强调色在桌面端暴露远端偏好命令前只能展示协议限制。快捷消息 P57 只做增删改查，不做排序。
```

- [ ] **Step 2: Run targeted P57 tests**

Run:

```powershell
pnpm exec jest --config jest.config.cjs --runInBand tests/services/connectionDetail.spec.ts tests/services/connectionDetailSettings.spec.ts tests/pages/projects/projectFolderListContract.spec.ts tests/pages/connection-detail/connectionDetailPresentation.spec.ts tests/pages/connection-detail/connectionDetailPageContract.spec.ts
```

Expected: all targeted P57 tests pass.

- [ ] **Step 3: Run full app unit suite**

Run:

```powershell
pnpm test:unit
```

Expected: either full suite passes, or only the pre-existing conversation-detail style contract failures remain. If new P57 tests fail, fix them before completion.

- [ ] **Step 4: Inspect final diff**

Run:

```powershell
git status --short
git diff --stat HEAD
rg -n "--mcode-" mcode-app/src/pages/connection-detail mcode-app/src/components/projects docs/mcode-architecture-notes/2026-07-03-p57-connection-detail.md
```

Expected: no `--mcode-*` matches in P57 files.

- [ ] **Step 5: Commit**

```powershell
git add docs/mcode-architecture-notes/2026-07-03-p57-connection-detail.md
git commit -m "docs(app): record p57 connection detail behavior"
```
