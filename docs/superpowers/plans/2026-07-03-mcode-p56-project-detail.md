# MCode P56 Project Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the P56 project detail workbench so project list taps open a unified Files/Git/Sessions/Terminal/Todos page for codeg-main connections.

**Architecture:** Add a new project detail route that owns project context resolution and embeds focused panels. Extract reusable Git and sessions panels from the existing standalone pages, add small typed services for files, terminal, project routing, and project-bound local todos, and keep mcode-desktop unsupported states scoped to the affected tabs.

**Tech Stack:** Vue 3, uni-app, uview-plus, TypeScript, Jest, xterm.js (`@xterm/xterm`, `@xterm/addon-fit`), codeg-main gateway commands.

## Global Constraints

- Scope is codeg-main first; mcode-desktop keeps sessions and local todos but shows unsupported states for Files, Git, and Terminal.
- Project list primary tap route must become `/pages/project-detail/index`.
- Existing `/pages/sessions/index`, `/pages/project-git/index`, `/pages/project-git-commit/index`, and `/pages/project-git-diff/index` routes must remain available.
- Terminal must use `@xterm/xterm` and `@xterm/addon-fit`; do not build a plain text terminal substitute.
- Files tab supports browse, preview, copy, and create file/folder; it does not implement full editor save behavior in P56.
- Local todo storage must remain backward compatible with rows that lack project metadata.
- Use uview-plus runtime theme variables with `--up-*` names only; do not add `--mcode-*` color/background/border/shadow aliases.
- Every mcode implementation change must update a Markdown note under `docs/mcode-architecture-notes/`.
- Preserve unrelated dirty worktree changes.

---

## File Structure

- Create `mcode-app/src/services/projectDetail.ts`: route builder/parser, connection target helpers, unsupported-state helpers.
- Create `mcode-app/tests/services/projectDetail.spec.ts`: project detail route and unsupported helper tests.
- Modify `mcode-app/src/pages.json`: register `pages/project-detail/index`.
- Modify `mcode-app/src/pages/projects/index.vue`: route primary project taps into the new detail page.
- Modify `mcode-app/src/pages/todos/todoState.ts`: optional project metadata and project filtering helpers.
- Modify `mcode-app/tests/pages/todos/todoState.spec.ts`: old-row compatibility and project-bound todo tests.
- Create `mcode-app/src/services/projectFiles.ts`: file tree normalization and codeg-main file command wrappers.
- Create `mcode-app/tests/services/projectFiles.spec.ts`: file normalization and payload tests.
- Create `mcode-app/src/services/projectTerminal.ts`: terminal command wrappers and terminal event normalization helpers.
- Create `mcode-app/tests/services/projectTerminal.spec.ts`: terminal command payload and event tests.
- Modify `mcode-app/package.json` and `mcode-app/pnpm-lock.yaml`: add xterm dependencies.
- Create `mcode-app/src/pages/project-detail/projectGitSplitState.ts`: persisted split ratio helpers.
- Create `mcode-app/tests/pages/project-detail/projectGitSplitState.spec.ts`: split key/clamp/storage tests.
- Create `mcode-app/src/pages/project-detail/components/ProjectUnsupportedState.vue`: shared tab unsupported/empty/error block.
- Create `mcode-app/src/pages/project-detail/components/ProjectSessionsPanel.vue`: reusable project session list.
- Modify `mcode-app/src/pages/sessions/index.vue`: wrap the reusable sessions panel while preserving the standalone page.
- Create `mcode-app/src/pages/project-detail/components/ProjectGitPanel.vue`: reusable Git panel with optional split layout.
- Modify `mcode-app/src/pages/project-git/index.vue`: wrap the reusable Git panel while preserving the standalone page.
- Create `mcode-app/src/pages/project-detail/components/ProjectFilesPanel.vue`: files tab UI.
- Create `mcode-app/src/pages/project-detail/components/ProjectTerminalPanel.vue`: xterm-backed terminal tab UI.
- Create `mcode-app/src/pages/project-detail/components/ProjectTodosPanel.vue`: project-bound local todo tab UI.
- Create `mcode-app/src/pages/project-detail/index.vue`: project detail shell and tab integration.
- Update `docs/mcode-architecture-notes/2026-07-03-p56-project-detail-workbench.md`: record final implementation details and known unsupported desktop behavior.

---

### Task 1: Project Detail Route And Project List Navigation

**Files:**
- Create: `mcode-app/src/services/projectDetail.ts`
- Create: `mcode-app/tests/services/projectDetail.spec.ts`
- Modify: `mcode-app/src/pages.json`
- Modify: `mcode-app/src/pages/projects/index.vue`

**Interfaces:**
- Produces: `buildProjectDetailRoute(params)`, `parseProjectDetailRouteOptions(options)`, `isWorkspaceCapableConnection(connection)`, `workspaceUnsupportedText(connection)`.
- Consumes: `ConnectionContext` from `@/services/connectionContext`.

- [ ] **Step 1: Write the failing route/helper tests**

Create `mcode-app/tests/services/projectDetail.spec.ts`:

```ts
import {
  buildProjectDetailRoute,
  isWorkspaceCapableConnection,
  parseProjectDetailRouteOptions,
  workspaceUnsupportedText,
} from "@/services/projectDetail"

describe("projectDetail", () => {
  it("builds a detail route carrying connection, folder, project name, and path", () => {
    expect(
      buildProjectDetailRoute({
        connectionId: "conn123",
        folderId: 42,
        projectName: "demo 项目",
        projectPath: "D:/Repos/demo",
      })
    ).toBe(
      "/pages/project-detail/index?connectionId=conn123&folderId=42&projectName=demo%20%E9%A1%B9%E7%9B%AE&projectPath=D%3A%2FRepos%2Fdemo"
    )
  })

  it("parses route options into a project detail context", () => {
    expect(
      parseProjectDetailRouteOptions({
        connectionId: "conn123",
        folderId: "42",
        projectName: "demo%20%E9%A1%B9%E7%9B%AE",
        projectPath: "D%3A%2FRepos%2Fdemo",
      })
    ).toEqual({
      connectionId: "conn123",
      folderId: 42,
      projectName: "demo 项目",
      projectPath: "D:/Repos/demo",
    })
  })

  it("treats codeg connections as workspace capable and desktop as unsupported", () => {
    expect(isWorkspaceCapableConnection({ targetAgent: "codeg" } as any)).toBe(true)
    expect(isWorkspaceCapableConnection({ gatewaySession: { targetAgent: "codeg" } } as any)).toBe(true)
    expect(isWorkspaceCapableConnection({ targetAgent: "mcode-desktop" } as any)).toBe(false)
  })

  it("returns a clear unsupported message for desktop connections", () => {
    expect(workspaceUnsupportedText({ targetAgent: "mcode-desktop" } as any)).toBe(
      "当前连接暂不支持项目文件、Git 和终端功能，请使用 codeg-main 连接。"
    )
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
cd mcode-app
npm run test:unit -- tests/services/projectDetail.spec.ts
```

Expected: FAIL because `@/services/projectDetail` does not exist.

- [ ] **Step 3: Implement the project detail helper module**

Create `mcode-app/src/services/projectDetail.ts`:

```ts
import type { ConnectionContext } from "@/services/connectionContext"

export interface ProjectDetailRouteParams {
  connectionId: string
  folderId: number
  projectName: string
  projectPath?: string | null
}

export interface ProjectDetailRouteContext {
  connectionId: string
  folderId: number
  projectName: string
  projectPath: string
}

export function buildProjectDetailRoute(params: ProjectDetailRouteParams) {
  const connectionId = encodeURIComponent(params.connectionId)
  const projectName = encodeURIComponent(params.projectName)
  const projectPath = encodeURIComponent(params.projectPath || "")
  return `/pages/project-detail/index?connectionId=${connectionId}&folderId=${params.folderId}&projectName=${projectName}&projectPath=${projectPath}`
}

export function parseProjectDetailRouteOptions(
  options: Record<string, unknown> | undefined
): ProjectDetailRouteContext {
  return {
    connectionId: String(options?.connectionId || "").trim(),
    folderId: Number(options?.folderId || 0),
    projectName: decodeURIComponent(String(options?.projectName || "").trim()),
    projectPath: decodeURIComponent(String(options?.projectPath || "").trim()),
  }
}

export function isWorkspaceCapableConnection(connection: Partial<ConnectionContext> | null | undefined) {
  const targetAgent = String(
    (connection as any)?.targetAgent ||
      (connection as any)?.gatewaySession?.targetAgent ||
      ""
  ).trim()
  if (!targetAgent) return true
  return targetAgent === "codeg" || targetAgent === "opencode"
}

export function workspaceUnsupportedText(connection: Partial<ConnectionContext> | null | undefined) {
  if (isWorkspaceCapableConnection(connection)) return ""
  return "当前连接暂不支持项目文件、Git 和终端功能，请使用 codeg-main 连接。"
}
```

- [ ] **Step 4: Register the new page route**

In `mcode-app/src/pages.json`, add this page after `pages/projects/index`:

```json
{
  "path": "pages/project-detail/index",
  "style": {
    "navigationStyle": "custom",
    "navigationBarTitleText": "项目详情",
    "enablePullDownRefresh": false
  }
}
```

- [ ] **Step 5: Change project card taps to the detail route**

In `mcode-app/src/pages/projects/index.vue`, add:

```ts
import { buildProjectDetailRoute } from "@/services/projectDetail"
```

Replace `openProjectSessions` with:

```ts
function openProjectSessions(item: ProjectListItem) {
  const connectionId = getCurrentConnectionId()
  if (!connectionId) return
  uni.navigateTo({
    url: buildProjectDetailRoute({
      connectionId,
      folderId: item.id,
      projectName: item.name,
      projectPath: item.path,
    }),
  })
}
```

Keep `buildProjectGitRoute` for the existing action-sheet Git entry.

- [ ] **Step 6: Run the focused tests**

Run:

```powershell
cd mcode-app
npm run test:unit -- tests/services/projectDetail.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit route helpers**

Run:

```powershell
git add -- mcode-app/src/services/projectDetail.ts mcode-app/tests/services/projectDetail.spec.ts mcode-app/src/pages.json mcode-app/src/pages/projects/index.vue
git commit -m "feat(app): route projects to detail workbench"
```

---

### Task 2: Project-Bound Local Todo State

**Files:**
- Modify: `mcode-app/src/pages/todos/todoState.ts`
- Modify: `mcode-app/tests/pages/todos/todoState.spec.ts`

**Interfaces:**
- Produces: `TodoProjectBinding`, `createProjectTodoItem(text, binding, now)`, `isTodoBoundToProject(item, binding)`, `getProjectTodoSections(items, binding, keyword)`.
- Consumes: existing local todo storage shape under `mcode_todos`.

- [ ] **Step 1: Add failing project-bound todo tests**

Append to `mcode-app/tests/pages/todos/todoState.spec.ts`:

```ts
import {
  createProjectTodoItem,
  getProjectTodoSections,
  isTodoBoundToProject,
} from "@/pages/todos/todoState"

describe("project-bound todos", () => {
  it("normalizes old rows without adding project metadata", () => {
    const normalized = normalizeStoredTodos([{ id: "1", text: "旧待办", completed: false }], 100)
    expect(normalized[0]).toEqual({
      id: "1",
      text: "旧待办",
      completed: false,
      createdAt: 100,
      completedAt: null,
      hidden: false,
      hiddenAt: null,
    })
  })

  it("creates project-bound todos with connection and project metadata", () => {
    expect(
      createProjectTodoItem(
        "修复登录",
        { connectionId: "conn123", projectId: 42, projectName: "demo" },
        200
      )
    ).toMatchObject({
      id: "200",
      text: "修复登录",
      connectionId: "conn123",
      projectId: 42,
      projectName: "demo",
      completed: false,
    })
  })

  it("filters visible todos by connection and project id", () => {
    const binding = { connectionId: "conn123", projectId: 42, projectName: "demo" }
    const items = [
      createProjectTodoItem("当前项目任务", binding, 1),
      createProjectTodoItem("其他项目任务", { connectionId: "conn123", projectId: 43 }, 2),
      createTodoItem("未绑定任务", 3),
      { ...createProjectTodoItem("已完成", binding, 4), completed: true, completedAt: 5 },
    ]

    expect(isTodoBoundToProject(items[0], binding)).toBe(true)
    const sections = getProjectTodoSections(items, binding, "")
    expect(sections.inProgress.map((item) => item.text)).toEqual(["当前项目任务"])
    expect(sections.completed.map((item) => item.text)).toEqual(["已完成"])
  })
})
```

- [ ] **Step 2: Run the todo tests to verify failure**

Run:

```powershell
cd mcode-app
npm run test:unit -- tests/pages/todos/todoState.spec.ts
```

Expected: FAIL because the new exports do not exist.

- [ ] **Step 3: Extend `TodoItem` and helper functions**

In `mcode-app/src/pages/todos/todoState.ts`, update the interface and add helpers:

```ts
export interface TodoProjectBinding {
  connectionId: string
  projectId: number
  projectName?: string | null
}

export interface TodoItem {
  id: string
  text: string
  completed: boolean
  createdAt: number
  completedAt: number | null
  hidden: boolean
  hiddenAt: number | null
  connectionId?: string | null
  projectId?: number | null
  projectName?: string | null
}
```

Replace `createTodoItem` with:

```ts
export function createTodoItem(
  text: string,
  now = Date.now(),
  binding?: TodoProjectBinding | null
): TodoItem {
  const item: TodoItem = {
    id: String(now),
    text: text.trim(),
    completed: false,
    createdAt: now,
    completedAt: null,
    hidden: false,
    hiddenAt: null,
  }
  if (!binding) return item
  return {
    ...item,
    connectionId: binding.connectionId,
    projectId: binding.projectId,
    projectName: binding.projectName || null,
  }
}

export function createProjectTodoItem(
  text: string,
  binding: TodoProjectBinding,
  now = Date.now()
): TodoItem {
  return createTodoItem(text, now, binding)
}
```

Inside `normalizeStoredTodos`, after building the base todo object, preserve project metadata only when it is valid:

```ts
const projectId = toTimestamp(row.projectId)
const connectionId = typeof row.connectionId === "string" ? row.connectionId.trim() : ""
const projectName = typeof row.projectName === "string" ? row.projectName.trim() : ""
const normalized: TodoItem = {
  id: String(row.id ?? now),
  text,
  completed: Boolean(row.completed),
  createdAt: toTimestamp(row.createdAt, now) ?? now,
  completedAt: toTimestamp(row.completedAt),
  hidden: Boolean(row.hidden),
  hiddenAt: toTimestamp(row.hiddenAt),
}
if (connectionId && projectId && projectId > 0) {
  normalized.connectionId = connectionId
  normalized.projectId = projectId
  normalized.projectName = projectName || null
}
return normalized
```

Add:

```ts
export function isTodoBoundToProject(item: TodoItem, binding: TodoProjectBinding) {
  return (
    String(item.connectionId || "") === binding.connectionId &&
    Number(item.projectId || 0) === binding.projectId
  )
}

export function getProjectTodoSections(
  items: TodoItem[],
  binding: TodoProjectBinding,
  keyword: string
) {
  return getVisibleTodoSections(
    items.filter((item) => isTodoBoundToProject(item, binding)),
    keyword
  )
}
```

- [ ] **Step 4: Run the todo tests**

Run:

```powershell
cd mcode-app
npm run test:unit -- tests/pages/todos/todoState.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit todo state changes**

Run:

```powershell
git add -- mcode-app/src/pages/todos/todoState.ts mcode-app/tests/pages/todos/todoState.spec.ts
git commit -m "feat(app): bind local todos to projects"
```

---

### Task 3: Project File Service

**Files:**
- Create: `mcode-app/src/services/projectFiles.ts`
- Create: `mcode-app/tests/services/projectFiles.spec.ts`

**Interfaces:**
- Produces: `ProjectFileNode`, `ProjectFilePreview`, `normalizeProjectFileTree(input)`, `getRemoteProjectFileTree(gateway, rootPath, maxDepth)`, `readRemoteProjectFilePreview(gateway, rootPath, path)`, `createRemoteProjectFileEntry(gateway, rootPath, path, name, kind)`.
- Consumes: `CodegGateway.call`.

- [ ] **Step 1: Write failing file service tests**

Create `mcode-app/tests/services/projectFiles.spec.ts`:

```ts
import {
  createRemoteProjectFileEntry,
  getRemoteProjectFileTree,
  normalizeProjectFileTree,
  readRemoteProjectFilePreview,
} from "@/services/projectFiles"

describe("projectFiles", () => {
  it("normalizes nested file tree nodes", () => {
    expect(
      normalizeProjectFileTree([
        {
          name: "src",
          path: "src",
          kind: "directory",
          children: [{ name: "App.vue", path: "src/App.vue", kind: "file" }],
        },
        { name: "README.md", path: "README.md", isDirectory: false },
      ])
    ).toEqual([
      {
        id: "src",
        name: "src",
        path: "src",
        kind: "directory",
        depth: 0,
        children: [
          {
            id: "src/App.vue",
            name: "App.vue",
            path: "src/App.vue",
            kind: "file",
            depth: 1,
            children: [],
          },
        ],
      },
      {
        id: "README.md",
        name: "README.md",
        path: "README.md",
        kind: "file",
        depth: 0,
        children: [],
      },
    ])
  })

  it("requests the project file tree with root path and max depth", async () => {
    const gateway = { call: jest.fn().mockResolvedValue([]) }
    await getRemoteProjectFileTree(gateway as any, "D:/Repos/demo", 4)
    expect(gateway.call).toHaveBeenCalledWith("get_file_tree", {
      path: "D:/Repos/demo",
      maxDepth: 4,
    })
  })

  it("requests workspace-confined file preview", async () => {
    const gateway = {
      call: jest.fn().mockResolvedValue({ content: "hello", truncated: false, language: "text" }),
    }
    await readRemoteProjectFilePreview(gateway as any, "D:/Repos/demo", "README.md")
    expect(gateway.call).toHaveBeenCalledWith("read_file_preview", {
      rootPath: "D:/Repos/demo",
      path: "README.md",
    })
  })

  it("creates files and folders through create_file_tree_entry", async () => {
    const gateway = { call: jest.fn().mockResolvedValue("src/new.ts") }
    await createRemoteProjectFileEntry(gateway as any, "D:/Repos/demo", "src", "new.ts", "file")
    expect(gateway.call).toHaveBeenCalledWith("create_file_tree_entry", {
      rootPath: "D:/Repos/demo",
      path: "src",
      name: "new.ts",
      kind: "file",
    })
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
cd mcode-app
npm run test:unit -- tests/services/projectFiles.spec.ts
```

Expected: FAIL because `@/services/projectFiles` does not exist.

- [ ] **Step 3: Implement file service**

Create `mcode-app/src/services/projectFiles.ts`:

```ts
import type { CodegGateway } from "@/services/gateway"

export type ProjectFileKind = "file" | "directory"

export interface ProjectFileNode {
  id: string
  name: string
  path: string
  kind: ProjectFileKind
  depth: number
  children: ProjectFileNode[]
}

export interface ProjectFilePreview {
  content: string
  language: string | null
  truncated: boolean
}

export function normalizeProjectFileTree(input: unknown, depth = 0): ProjectFileNode[] {
  const list = Array.isArray(input) ? input : []
  return list
    .map((item) => normalizeProjectFileNode(item, depth))
    .filter((item): item is ProjectFileNode => Boolean(item))
}

function normalizeProjectFileNode(input: unknown, depth: number): ProjectFileNode | null {
  if (!input || typeof input !== "object") return null
  const raw = input as Record<string, unknown>
  const name = pickString(raw.name)
  const path = pickString(raw.path, raw.relativePath, raw.relative_path, name)
  if (!name || !path) return null
  const rawKind = pickString(raw.kind, raw.type).toLowerCase()
  const isDirectory =
    rawKind === "directory" ||
    rawKind === "dir" ||
    raw.isDirectory === true ||
    raw.is_dir === true
  return {
    id: path,
    name,
    path,
    kind: isDirectory ? "directory" : "file",
    depth,
    children: normalizeProjectFileTree(raw.children, depth + 1),
  }
}

export async function getRemoteProjectFileTree(
  gateway: CodegGateway,
  rootPath: string,
  maxDepth = 4
): Promise<ProjectFileNode[]> {
  const raw = await gateway.call<unknown>("get_file_tree", {
    path: rootPath,
    maxDepth,
  })
  return normalizeProjectFileTree(raw)
}

export async function readRemoteProjectFilePreview(
  gateway: CodegGateway,
  rootPath: string,
  path: string
): Promise<ProjectFilePreview> {
  const raw = await gateway.call<unknown>("read_file_preview", { rootPath, path })
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  return {
    content: pickString(record.content, record.text),
    language: pickString(record.language, record.lang) || null,
    truncated: Boolean(record.truncated),
  }
}

export async function createRemoteProjectFileEntry(
  gateway: CodegGateway,
  rootPath: string,
  path: string,
  name: string,
  kind: ProjectFileKind
): Promise<string> {
  return gateway.call<string>("create_file_tree_entry", {
    rootPath,
    path,
    name,
    kind: kind === "directory" ? "dir" : "file",
  })
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}
```

- [ ] **Step 4: Run file service tests**

Run:

```powershell
cd mcode-app
npm run test:unit -- tests/services/projectFiles.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit file service**

Run:

```powershell
git add -- mcode-app/src/services/projectFiles.ts mcode-app/tests/services/projectFiles.spec.ts
git commit -m "feat(app): add project file service"
```

---

### Task 4: Project Terminal Dependencies And Service

**Files:**
- Modify: `mcode-app/package.json`
- Modify: `mcode-app/pnpm-lock.yaml`
- Create: `mcode-app/src/services/projectTerminal.ts`
- Create: `mcode-app/tests/services/projectTerminal.spec.ts`

**Interfaces:**
- Produces: `spawnProjectTerminal`, `writeProjectTerminal`, `resizeProjectTerminal`, `killProjectTerminal`, `listProjectTerminals`, `normalizeTerminalChannelFrame`, `isTerminalOutputChannel`, `isTerminalExitChannel`.
- Consumes: `CodegGateway.call` and `CodegGateway.connectEvents`.

- [ ] **Step 1: Add xterm dependencies**

Run:

```powershell
cd mcode-app
pnpm add @xterm/xterm @xterm/addon-fit
```

Expected: `package.json` gains both dependencies and `pnpm-lock.yaml` changes.

- [ ] **Step 2: Write failing terminal service tests**

Create `mcode-app/tests/services/projectTerminal.spec.ts`:

```ts
import {
  isTerminalExitChannel,
  isTerminalOutputChannel,
  killProjectTerminal,
  normalizeTerminalChannelFrame,
  resizeProjectTerminal,
  spawnProjectTerminal,
  writeProjectTerminal,
} from "@/services/projectTerminal"

describe("projectTerminal", () => {
  it("spawns a terminal in the project working directory", async () => {
    const gateway = { call: jest.fn().mockResolvedValue("term-1") }
    await spawnProjectTerminal(gateway as any, { workingDir: "D:/Repos/demo", terminalId: "term-1" })
    expect(gateway.call).toHaveBeenCalledWith("terminal_spawn", {
      workingDir: "D:/Repos/demo",
      shell: null,
      initialCommand: null,
      terminalId: "term-1",
    })
  })

  it("writes, resizes, and kills by terminal id", async () => {
    const gateway = { call: jest.fn().mockResolvedValue(null) }
    await writeProjectTerminal(gateway as any, "term-1", "ls\r")
    await resizeProjectTerminal(gateway as any, "term-1", 80, 24)
    await killProjectTerminal(gateway as any, "term-1")
    expect(gateway.call).toHaveBeenNthCalledWith(1, "terminal_write", {
      terminalId: "term-1",
      data: "ls\r",
    })
    expect(gateway.call).toHaveBeenNthCalledWith(2, "terminal_resize", {
      terminalId: "term-1",
      cols: 80,
      rows: 24,
    })
    expect(gateway.call).toHaveBeenNthCalledWith(3, "terminal_kill", {
      terminalId: "term-1",
    })
  })

  it("normalizes terminal event frames from the global channel", () => {
    expect(
      normalizeTerminalChannelFrame({
        channel: "terminal://output/term-1",
        payload: { data: "hello" },
      })
    ).toEqual({
      channel: "terminal://output/term-1",
      payload: { data: "hello" },
    })
    expect(isTerminalOutputChannel("terminal://output/term-1", "term-1")).toBe(true)
    expect(isTerminalExitChannel("terminal://exit/term-1", "term-1")).toBe(true)
  })
})
```

- [ ] **Step 3: Run tests to verify service failure**

Run:

```powershell
cd mcode-app
npm run test:unit -- tests/services/projectTerminal.spec.ts
```

Expected: FAIL because `@/services/projectTerminal` does not exist.

- [ ] **Step 4: Implement terminal service**

Create `mcode-app/src/services/projectTerminal.ts`:

```ts
import type { CodegGateway } from "@/services/gateway"

export interface ProjectTerminalSpawnParams {
  workingDir: string
  shell?: string | null
  initialCommand?: string | null
  terminalId?: string | null
}

export interface ProjectTerminalInfo {
  id: string
  terminalId: string
  workingDir: string
  shell: string | null
  exited: boolean
}

export interface TerminalChannelFrame {
  channel: string
  payload: unknown
}

export function isDomTerminalRuntime() {
  return typeof window !== "undefined" && typeof document !== "undefined"
}

export async function spawnProjectTerminal(
  gateway: CodegGateway,
  params: ProjectTerminalSpawnParams
): Promise<string> {
  return gateway.call<string>("terminal_spawn", {
    workingDir: params.workingDir,
    shell: params.shell ?? null,
    initialCommand: params.initialCommand ?? null,
    terminalId: params.terminalId ?? null,
  })
}

export async function writeProjectTerminal(
  gateway: CodegGateway,
  terminalId: string,
  data: string
) {
  return gateway.call<void>("terminal_write", { terminalId, data })
}

export async function resizeProjectTerminal(
  gateway: CodegGateway,
  terminalId: string,
  cols: number,
  rows: number
) {
  return gateway.call<void>("terminal_resize", { terminalId, cols, rows })
}

export async function killProjectTerminal(gateway: CodegGateway, terminalId: string) {
  return gateway.call<void>("terminal_kill", { terminalId })
}

export async function listProjectTerminals(gateway: CodegGateway): Promise<ProjectTerminalInfo[]> {
  const raw = await gateway.call<unknown>("terminal_list")
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      const record = item && typeof item === "object" ? (item as Record<string, unknown>) : null
      if (!record) return null
      const id = pickString(record.id, record.terminalId, record.terminal_id)
      if (!id) return null
      return {
        id,
        terminalId: id,
        workingDir: pickString(record.workingDir, record.working_dir),
        shell: pickString(record.shell) || null,
        exited: Boolean(record.exited),
      } satisfies ProjectTerminalInfo
    })
    .filter((item): item is ProjectTerminalInfo => Boolean(item))
}

export function normalizeTerminalChannelFrame(raw: unknown): TerminalChannelFrame | null {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null
  if (!record) return null
  const channel = pickString(record.channel)
  if (channel) {
    return { channel, payload: record.payload ?? record.data ?? null }
  }
  const nested = record.payload && typeof record.payload === "object"
    ? (record.payload as Record<string, unknown>)
    : null
  const nestedChannel = pickString(nested?.channel)
  if (!nested || !nestedChannel) return null
  return { channel: nestedChannel, payload: nested.payload ?? nested.data ?? null }
}

export function isTerminalOutputChannel(channel: string, terminalId: string) {
  return channel === `terminal://output/${terminalId}`
}

export function isTerminalExitChannel(channel: string, terminalId: string) {
  return channel === `terminal://exit/${terminalId}`
}

export function extractTerminalOutputText(payload: unknown) {
  if (typeof payload === "string") return payload
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null
  return pickString(record?.data, record?.text)
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}
```

- [ ] **Step 5: Run terminal service tests**

Run:

```powershell
cd mcode-app
npm run test:unit -- tests/services/projectTerminal.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit terminal service and dependencies**

Run:

```powershell
git add -- mcode-app/package.json mcode-app/pnpm-lock.yaml mcode-app/src/services/projectTerminal.ts mcode-app/tests/services/projectTerminal.spec.ts
git commit -m "feat(app): add xterm project terminal service"
```

---

### Task 5: Git Split State Helpers

**Files:**
- Create: `mcode-app/src/pages/project-detail/projectGitSplitState.ts`
- Create: `mcode-app/tests/pages/project-detail/projectGitSplitState.spec.ts`

**Interfaces:**
- Produces: `DEFAULT_PROJECT_GIT_SPLIT_RATIO`, `buildProjectGitSplitStorageKey(connectionId, folderId)`, `clampProjectGitSplitRatio(value)`, `readProjectGitSplitRatio(storage, connectionId, folderId)`, `writeProjectGitSplitRatio(storage, connectionId, folderId, ratio)`.
- Consumes: storage-like object with `getStorageSync` and `setStorageSync`.

- [ ] **Step 1: Write failing split helper tests**

Create `mcode-app/tests/pages/project-detail/projectGitSplitState.spec.ts`:

```ts
import {
  buildProjectGitSplitStorageKey,
  clampProjectGitSplitRatio,
  readProjectGitSplitRatio,
  writeProjectGitSplitRatio,
} from "@/pages/project-detail/projectGitSplitState"

describe("projectGitSplitState", () => {
  it("builds a per-project storage key", () => {
    expect(buildProjectGitSplitStorageKey("conn123", 42)).toBe(
      "mcode_project_git_split:conn123:42"
    )
  })

  it("clamps the split ratio to usable bounds", () => {
    expect(clampProjectGitSplitRatio(0.1)).toBe(0.3)
    expect(clampProjectGitSplitRatio(0.55)).toBe(0.55)
    expect(clampProjectGitSplitRatio(0.9)).toBe(0.75)
    expect(clampProjectGitSplitRatio(Number.NaN)).toBe(0.5)
  })

  it("reads and writes through uni-like storage", () => {
    const store = new Map<string, unknown>()
    const storage = {
      getStorageSync: (key: string) => store.get(key),
      setStorageSync: (key: string, value: unknown) => store.set(key, value),
    }
    writeProjectGitSplitRatio(storage, "conn123", 42, 0.7)
    expect(readProjectGitSplitRatio(storage, "conn123", 42)).toBe(0.7)
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
cd mcode-app
npm run test:unit -- tests/pages/project-detail/projectGitSplitState.spec.ts
```

Expected: FAIL because helper file does not exist.

- [ ] **Step 3: Implement split helper**

Create `mcode-app/src/pages/project-detail/projectGitSplitState.ts`:

```ts
export const DEFAULT_PROJECT_GIT_SPLIT_RATIO = 0.5
const MIN_PROJECT_GIT_SPLIT_RATIO = 0.3
const MAX_PROJECT_GIT_SPLIT_RATIO = 0.75

export interface ProjectGitSplitStorage {
  getStorageSync(key: string): unknown
  setStorageSync(key: string, value: unknown): unknown
}

export function buildProjectGitSplitStorageKey(connectionId: string, folderId: number) {
  return `mcode_project_git_split:${connectionId}:${folderId}`
}

export function clampProjectGitSplitRatio(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_PROJECT_GIT_SPLIT_RATIO
  return Math.min(MAX_PROJECT_GIT_SPLIT_RATIO, Math.max(MIN_PROJECT_GIT_SPLIT_RATIO, value))
}

export function readProjectGitSplitRatio(
  storage: ProjectGitSplitStorage,
  connectionId: string,
  folderId: number
) {
  const raw = Number(storage.getStorageSync(buildProjectGitSplitStorageKey(connectionId, folderId)))
  return clampProjectGitSplitRatio(raw)
}

export function writeProjectGitSplitRatio(
  storage: ProjectGitSplitStorage,
  connectionId: string,
  folderId: number,
  ratio: number
) {
  storage.setStorageSync(
    buildProjectGitSplitStorageKey(connectionId, folderId),
    clampProjectGitSplitRatio(ratio)
  )
}
```

- [ ] **Step 4: Run split helper tests**

Run:

```powershell
cd mcode-app
npm run test:unit -- tests/pages/project-detail/projectGitSplitState.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit split helper**

Run:

```powershell
git add -- mcode-app/src/pages/project-detail/projectGitSplitState.ts mcode-app/tests/pages/project-detail/projectGitSplitState.spec.ts
git commit -m "feat(app): persist project git split"
```

---

### Task 6: Reusable Sessions Panel

**Files:**
- Create: `mcode-app/src/pages/project-detail/components/ProjectUnsupportedState.vue`
- Create: `mcode-app/src/pages/project-detail/components/ProjectSessionsPanel.vue`
- Modify: `mcode-app/src/pages/sessions/index.vue`

**Interfaces:**
- Produces: `ProjectSessionsPanel` props `{ connection, folderId, projectName }`, emits `count-change`.
- Consumes: `loadRemoteProjectConversations`, `ensureConversationTab`, `resolveConnectionContext`.

- [ ] **Step 1: Create the shared state component**

Create `mcode-app/src/pages/project-detail/components/ProjectUnsupportedState.vue`:

```vue
<template>
  <view class="project-tab-state" :style="upThemeCardStyle">
    <view class="project-tab-state__icon">
      <up-icon :name="icon || 'info-circle'" size="22" :color="upThemeVar('--up-primary', '#2979ff')"></up-icon>
    </view>
    <text class="project-tab-state__title">{{ title }}</text>
    <text class="project-tab-state__text">{{ text }}</text>
    <view v-if="actionText" class="project-tab-state__action" @click="emit('action')">
      <text>{{ actionText }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance } from "vue"

defineProps<{
  title: string
  text: string
  icon?: string
  actionText?: string
}>()

const emit = defineEmits<{
  (event: "action"): void
}>()

const currentInstance = getCurrentInstance()
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (name: string, fallback: string) =>
  currentInstance?.proxy?.upThemeVar?.(name, fallback) ?? `var(${name}, ${fallback})`
</script>

<style scoped lang="scss">
.project-tab-state {
  padding: 48rpx 32rpx;
  border-radius: 24rpx;
  border: 1rpx solid var(--up-border-color, #dadbde);
  background: var(--up-card-bg-color, #ffffff);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14rpx;
  text-align: center;
}

.project-tab-state__icon {
  width: 72rpx;
  height: 72rpx;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 10%, var(--up-card-bg-color, #ffffff) 90%);
}

.project-tab-state__title {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.project-tab-state__text {
  font-size: 24rpx;
  line-height: 1.5;
  color: var(--up-content-color, #606266);
}

.project-tab-state__action {
  margin-top: 8rpx;
  padding: 14rpx 28rpx;
  border-radius: 999rpx;
  background: var(--up-primary, #2979ff);
  color: #ffffff;
  font-size: 24rpx;
  font-weight: 700;
}
</style>
```

- [ ] **Step 2: Create the sessions panel**

Create `mcode-app/src/pages/project-detail/components/ProjectSessionsPanel.vue` by moving the session list behavior from `pages/sessions/index.vue` into this prop-driven component:

```vue
<template>
  <view class="project-sessions-panel">
    <ProjectUnsupportedState
      v-if="!props.connection || props.folderId <= 0"
      title="缺少项目信息"
      text="请返回项目列表重新进入。"
      icon="warning"
    />

    <view v-else-if="loading" class="project-sessions-state" :style="upThemeCardStyle">
      <u-loading-icon mode="circle" size="26" :color="upThemeVar('--up-primary', '#2979ff')"></u-loading-icon>
      <text class="project-sessions-state__text">正在加载项目会话...</text>
    </view>

    <ProjectUnsupportedState
      v-else-if="errorMessage"
      title="加载失败"
      :text="errorMessage"
      icon="warning"
      actionText="重试"
      @action="loadPage"
    />

    <ProjectUnsupportedState
      v-else-if="sessions.length === 0"
      title="暂无会话"
      text="当前项目下还没有会话记录。"
      icon="chat"
    />

    <view v-else class="project-sessions-list">
      <view
        v-for="item in sessions"
        :key="item.id"
        class="project-session-card"
        :style="upThemeCardStyle"
        @click="openConversation(item)"
      >
        <view class="project-session-card__main">
          <view class="project-session-card__head">
            <text class="project-session-card__title">{{ item.title }}</text>
            <view class="project-session-card__status" :class="statusClass(item.status)">
              <text class="project-session-card__status-text">{{ statusText(item.status) }}</text>
            </view>
          </view>
          <view class="project-session-card__meta">
            <text>{{ agentLabel(item.agentType) }}</text>
            <text>·</text>
            <text>{{ formatDateTime(item.updatedAt) }}</text>
          </view>
        </view>
        <u-icon name="arrow-right" size="16" :color="upThemeVar('--up-primary', '#2979ff')"></u-icon>
      </view>
    </view>
  </view>
</template>
```

Use this script in the same file:

```ts
import { computed, getCurrentInstance, ref, watch } from "vue"
import ProjectUnsupportedState from "./ProjectUnsupportedState.vue"
import {
  persistResolvedConnection,
  resolveConnectionContext,
  type ConnectionContext,
} from "@/services/connectionContext"
import { ensureConversationTab } from "@/services/conversation/pcTabSyncService"
import {
  loadRemoteProjectConversations,
  type RemoteConversationRecord,
} from "@/services/projectSessions"
```

Implement the same `loadPage`, `openConversation`, `statusText`, `statusClass`, `agentLabel`, `formatDateTime`, and `toErrorMessage` logic currently in `pages/sessions/index.vue`, replacing `connection.value` and `folderId.value` with props and local `resolvedConnection`.

Expose reload and emit count changes:

```ts
defineExpose({ reload: loadPage })
watch(() => sessions.value.length, (count) => emit("count-change", count), { immediate: true })
```

- [ ] **Step 3: Replace the standalone sessions page body with the panel**

Modify `mcode-app/src/pages/sessions/index.vue` so it keeps its page header, route parsing, and pull-to-refresh, but renders:

```vue
<ProjectSessionsPanel
  ref="sessionsPanelRef"
  :connection="connection"
  :folderId="folderId"
  :projectName="projectName"
  @count-change="sessionCount = $event"
/>
```

The wrapper script should import `ProjectSessionsPanel`, keep `connection`, `projectName`, and `folderId`, add:

```ts
const sessionCount = ref(0)
const sessionsPanelRef = ref<{ reload: () => Promise<void> } | null>(null)
```

and use:

```ts
onPullDownRefresh(async () => {
  await sessionsPanelRef.value?.reload()
  uni.stopPullDownRefresh()
})
```

- [ ] **Step 4: Run type checking**

Run:

```powershell
cd mcode-app
npx vue-tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit sessions extraction**

Run:

```powershell
git add -- mcode-app/src/pages/project-detail/components/ProjectUnsupportedState.vue mcode-app/src/pages/project-detail/components/ProjectSessionsPanel.vue mcode-app/src/pages/sessions/index.vue
git commit -m "feat(app): extract project sessions panel"
```

---

### Task 7: Reusable Git Panel With Draggable Split

**Files:**
- Create: `mcode-app/src/pages/project-detail/components/ProjectGitPanel.vue`
- Modify: `mcode-app/src/pages/project-git/index.vue`

**Interfaces:**
- Produces: `ProjectGitPanel` props `{ connection, folderId, projectName, projectPath, splitMode }`, emits `summary-change`.
- Consumes: `projectGit.ts` helpers and `projectGitSplitState.ts`.

- [ ] **Step 1: Create `ProjectGitPanel.vue` from existing Git logic**

Create `mcode-app/src/pages/project-detail/components/ProjectGitPanel.vue` by moving the content, branch action sheets, commit action sheets, and popups from `pages/project-git/index.vue` into a component with these props:

```ts
const props = withDefaults(defineProps<{
  connection: ConnectionContext | null
  folderId: number
  projectName: string
  projectPath: string
  splitMode?: boolean
}>(), {
  splitMode: false,
})
```

Replace route-owned refs with props:

```ts
const connectionState = ref<ConnectionContext | null>(props.connection)
watch(() => props.connection, (next) => {
  connectionState.value = next
})
```

Keep existing functions and change all route refs as follows:

```ts
folderId.value -> props.folderId
projectName.value -> props.projectName
projectPath.value -> props.projectPath
connection.value -> connectionState.value
```

Emit a summary when status/log loads:

```ts
const emit = defineEmits<{
  (event: "summary-change", value: { branch: string | null; changes: number; commits: number }): void
}>()

function emitSummary() {
  emit("summary-change", {
    branch: currentBranch.value,
    changes: workspaceEntries.value.length,
    commits: gitEntries.value.length,
  })
}
```

Call `emitSummary()` after successful loads and after error loads reset arrays.

- [ ] **Step 2: Add split layout behavior**

In `ProjectGitPanel.vue`, import:

```ts
import {
  DEFAULT_PROJECT_GIT_SPLIT_RATIO,
  clampProjectGitSplitRatio,
  readProjectGitSplitRatio,
  writeProjectGitSplitRatio,
} from "../projectGitSplitState"
```

Add:

```ts
const splitRatio = ref(DEFAULT_PROJECT_GIT_SPLIT_RATIO)
const splitContainerHeight = ref(0)
const draggingSplit = ref(false)

onMounted(() => {
  if (props.splitMode && connectionState.value?.id && props.folderId > 0) {
    splitRatio.value = readProjectGitSplitRatio(uni, connectionState.value.id, props.folderId)
  }
})

const workspacePaneStyle = computed(() =>
  props.splitMode ? { flexBasis: `${splitRatio.value * 100}%` } : {}
)
const historyPaneStyle = computed(() =>
  props.splitMode ? { flexBasis: `${(1 - splitRatio.value) * 100}%` } : {}
)

function startSplitDrag(event: TouchEvent | MouseEvent) {
  if (!props.splitMode) return
  draggingSplit.value = true
  splitContainerHeight.value = 0
  bindSplitDrag()
  updateSplitDrag(event)
}

function updateSplitDrag(event: TouchEvent | MouseEvent) {
  if (!draggingSplit.value) return
  const target = event.currentTarget instanceof HTMLElement
    ? event.currentTarget.parentElement
    : null
  const container = target || document.querySelector(".project-git-panel__split")
  const rect = container?.getBoundingClientRect()
  if (!rect || rect.height <= 0) return
  const clientY = "touches" in event ? event.touches[0]?.clientY : event.clientY
  if (typeof clientY !== "number") return
  splitRatio.value = clampProjectGitSplitRatio((clientY - rect.top) / rect.height)
}

function stopSplitDrag() {
  if (!draggingSplit.value) return
  draggingSplit.value = false
  unbindSplitDrag()
  if (connectionState.value?.id && props.folderId > 0) {
    writeProjectGitSplitRatio(uni, connectionState.value.id, props.folderId, splitRatio.value)
  }
}
```

Use document-level touch/mouse listeners only inside H5 guards:

```ts
function bindSplitDrag() {
  // #ifdef H5
  document.addEventListener("mousemove", updateSplitDrag as any)
  document.addEventListener("mouseup", stopSplitDrag)
  document.addEventListener("touchmove", updateSplitDrag as any, { passive: false })
  document.addEventListener("touchend", stopSplitDrag)
  // #endif
}

function unbindSplitDrag() {
  // #ifdef H5
  document.removeEventListener("mousemove", updateSplitDrag as any)
  document.removeEventListener("mouseup", stopSplitDrag)
  document.removeEventListener("touchmove", updateSplitDrag as any)
  document.removeEventListener("touchend", stopSplitDrag)
  // #endif
}
```

In split mode, render:

```vue
<view class="project-git-panel__split">
  <view class="project-git-panel__pane" :style="workspacePaneStyle">
    <!-- existing workspace card -->
  </view>
  <view class="project-git-panel__drag" @mousedown="startSplitDrag" @touchstart.stop.prevent="startSplitDrag">
    <view class="project-git-panel__drag-line"></view>
  </view>
  <view class="project-git-panel__pane" :style="historyPaneStyle">
    <!-- existing history card -->
  </view>
</view>
```

In non-split mode, render the existing stacked workspace/history layout.

- [ ] **Step 3: Wrap the existing standalone Git page**

Modify `mcode-app/src/pages/project-git/index.vue` so route parsing remains in the page, and the template renders `ProjectGitPanel`:

```vue
<ProjectGitPanel
  :connection="connection"
  :folderId="folderId"
  :projectName="projectName"
  :projectPath="projectPath"
  :splitMode="false"
/>
```

Keep the existing header in the standalone page. Remove duplicated Git workspace/history/action-sheet logic from the page after the component is in place.

- [ ] **Step 4: Run focused tests and type checking**

Run:

```powershell
cd mcode-app
npm run test:unit -- tests/services/projectGit.spec.ts tests/pages/project-detail/projectGitSplitState.spec.ts
npx vue-tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit Git panel extraction**

Run:

```powershell
git add -- mcode-app/src/pages/project-detail/components/ProjectGitPanel.vue mcode-app/src/pages/project-git/index.vue
git commit -m "feat(app): embed project git panel"
```

---

### Task 8: Files, Terminal, And Project Todos Panels

**Files:**
- Create: `mcode-app/src/pages/project-detail/components/ProjectFilesPanel.vue`
- Create: `mcode-app/src/pages/project-detail/components/ProjectTerminalPanel.vue`
- Create: `mcode-app/src/pages/project-detail/components/ProjectTodosPanel.vue`

**Interfaces:**
- Produces: prop-driven panels consumed by `pages/project-detail/index.vue`.
- Consumes: `projectFiles.ts`, `projectTerminal.ts`, `todoState.ts`, and `ProjectUnsupportedState.vue`.

- [ ] **Step 1: Create `ProjectFilesPanel.vue`**

Create a panel with props:

```ts
const props = defineProps<{
  gateway: CodegGateway | null
  projectPath: string
  unsupportedText?: string
}>()
```

Use these state refs:

```ts
const loading = ref(false)
const errorMessage = ref("")
const nodes = ref<ProjectFileNode[]>([])
const selectedFile = ref<ProjectFileNode | null>(null)
const preview = ref<ProjectFilePreview | null>(null)
const showCreatePopup = ref(false)
const createName = ref("")
const createKind = ref<ProjectFileKind>("file")
const createParentPath = ref("")
```

Use service calls:

```ts
async function loadTree() {
  if (!props.gateway || !props.projectPath || props.unsupportedText) return
  loading.value = true
  errorMessage.value = ""
  try {
    nodes.value = await getRemoteProjectFileTree(props.gateway, props.projectPath, 4)
  } catch (error) {
    errorMessage.value = toErrorMessage(error, "读取文件树失败")
  } finally {
    loading.value = false
  }
}

async function openFile(node: ProjectFileNode) {
  if (node.kind !== "file" || !props.gateway) return
  selectedFile.value = node
  preview.value = await readRemoteProjectFilePreview(props.gateway, props.projectPath, node.path)
}

async function submitCreate() {
  if (!props.gateway || !createName.value.trim()) return
  await createRemoteProjectFileEntry(
    props.gateway,
    props.projectPath,
    createParentPath.value,
    createName.value.trim(),
    createKind.value
  )
  showCreatePopup.value = false
  createName.value = ""
  await loadTree()
}
```

Template requirements:

- If `unsupportedText` is present, render `ProjectUnsupportedState`.
- Left section lists files with indentation from `node.depth`.
- Right/bottom preview section shows selected filename and preview content in a scrollable monospace block.
- Provide icon buttons for refresh, create file, create folder, copy path, and copy content.

- [ ] **Step 2: Create `ProjectTerminalPanel.vue`**

Create a panel with props:

```ts
const props = defineProps<{
  gateway: CodegGateway | null
  projectPath: string
  unsupportedText?: string
}>()
```

Use H5-only xterm imports:

```ts
// #ifdef H5
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import "@xterm/xterm/css/xterm.css"
// #endif
```

Use service helpers:

```ts
import {
  extractTerminalOutputText,
  isDomTerminalRuntime,
  isTerminalExitChannel,
  isTerminalOutputChannel,
  killProjectTerminal,
  normalizeTerminalChannelFrame,
  resizeProjectTerminal,
  spawnProjectTerminal,
  writeProjectTerminal,
} from "@/services/projectTerminal"
```

Lifecycle behavior:

```ts
const terminalHost = ref<HTMLElement | null>(null)
const terminalId = ref(`mcode-project-${Date.now()}`)
const running = ref(false)
const errorMessage = ref("")
let terminal: any = null
let fitAddon: any = null
let eventConnection: Awaited<ReturnType<CodegGateway["connectEvents"]>> | null = null

async function startTerminal() {
  if (!props.gateway || !props.projectPath || props.unsupportedText) return
  if (!isDomTerminalRuntime()) {
    errorMessage.value = "当前平台暂不支持交互终端。"
    return
  }
  if (!terminalHost.value) return
  terminal = new Terminal({ cursorBlink: true, fontSize: 13 })
  fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)
  terminal.open(terminalHost.value)
  terminal.onData((data: string) => {
    if (props.gateway) void writeProjectTerminal(props.gateway, terminalId.value, data)
  })
  eventConnection = await props.gateway.connectEvents((raw) => {
    const frame = normalizeTerminalChannelFrame(raw)
    if (!frame) return
    if (isTerminalOutputChannel(frame.channel, terminalId.value)) {
      terminal?.write(extractTerminalOutputText(frame.payload))
    }
    if (isTerminalExitChannel(frame.channel, terminalId.value)) {
      running.value = false
      terminal?.write("\r\n[Process exited]\r\n")
    }
  })
  await spawnProjectTerminal(props.gateway, {
    workingDir: props.projectPath,
    terminalId: terminalId.value,
  })
  running.value = true
  fitTerminal()
}

function fitTerminal() {
  fitAddon?.fit()
  const dims = fitAddon?.proposeDimensions?.()
  if (dims && props.gateway) {
    void resizeProjectTerminal(props.gateway, terminalId.value, dims.cols, dims.rows)
  }
}

async function stopTerminal() {
  eventConnection?.close()
  eventConnection = null
  terminal?.dispose()
  terminal = null
  if (props.gateway && running.value) {
    await killProjectTerminal(props.gateway, terminalId.value).catch(() => {})
  }
  running.value = false
}
```

Call `startTerminal` on mount and `stopTerminal` on unmount. Add a refresh/reconnect icon that calls `stopTerminal` then `startTerminal`.

- [ ] **Step 3: Create `ProjectTodosPanel.vue`**

Create a project todo panel with props:

```ts
const props = defineProps<{
  connectionId: string
  folderId: number
  projectName: string
}>()
```

Use the same storage key as the global todo page:

```ts
const STORAGE_KEY = "mcode_todos"
```

Use helpers:

```ts
const binding = computed(() => ({
  connectionId: props.connectionId,
  projectId: props.folderId,
  projectName: props.projectName,
}))
const sections = computed(() => getProjectTodoSections(todos.value, binding.value, searchKeyword.value))
```

Implement `loadTodos`, `saveTodos`, `createTodo`, `toggleTodo`, `startEdit`, `finishEdit`, and `clearCompletedTodos` using the same local behavior as `pages/todos/index.vue`, but create rows with:

```ts
todos.value.unshift(createProjectTodoItem(text, binding.value, Date.now()))
```

Template requirements:

- Search input and create button.
- "进行中" and "已完成" sections.
- Use existing `TodoCardList` and `TodoCreatePopup` components.
- Do not include cloud todo tabs in the project detail panel.

- [ ] **Step 4: Run focused tests and type checking**

Run:

```powershell
cd mcode-app
npm run test:unit -- tests/services/projectFiles.spec.ts tests/services/projectTerminal.spec.ts tests/pages/todos/todoState.spec.ts
npx vue-tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit detail panels**

Run:

```powershell
git add -- mcode-app/src/pages/project-detail/components/ProjectFilesPanel.vue mcode-app/src/pages/project-detail/components/ProjectTerminalPanel.vue mcode-app/src/pages/project-detail/components/ProjectTodosPanel.vue
git commit -m "feat(app): add project detail feature panels"
```

---

### Task 9: Project Detail Shell Integration

**Files:**
- Create: `mcode-app/src/pages/project-detail/index.vue`
- Update: `docs/mcode-architecture-notes/2026-07-03-p56-project-detail-workbench.md`

**Interfaces:**
- Consumes: all panels and helpers from previous tasks.
- Produces: user-facing project detail workbench route.

- [ ] **Step 1: Create the project detail shell**

Create `mcode-app/src/pages/project-detail/index.vue`:

```vue
<template>
  <view class="page project-detail-page" :style="[upThemeVars, upThemePageStyle]">
    <up-status-bar :bg-color="upThemeVar('--up-page-bg-color', '#f3f4f6')"></up-status-bar>
    <view class="project-detail-shell">
      <view class="project-detail-header" :style="upThemeCardStyle">
        <view class="project-detail-header__top">
          <view class="project-detail-header__back" @click="goBack">
            <up-icon name="arrow-left" size="18" :color="upThemeVar('--up-main-color', '#303133')"></up-icon>
          </view>
          <view class="project-detail-header__copy">
            <text class="project-detail-header__eyebrow">PROJECT</text>
            <text class="project-detail-header__title">{{ project.projectName || "项目详情" }}</text>
            <text class="project-detail-header__path">{{ project.projectPath || "未提供项目路径" }}</text>
          </view>
        </view>
        <view class="project-detail-header__meta">
          <text>{{ connectionName || "当前连接" }}</text>
          <text>·</text>
          <text>{{ folderIdText }}</text>
          <text v-if="gitSummary.branch">· {{ gitSummary.branch }}</text>
        </view>
      </view>

      <view class="project-detail-tabs" :style="upThemeCardStyle">
        <view
          v-for="tab in tabs"
          :key="tab.key"
          class="project-detail-tab"
          :class="{ 'project-detail-tab--active': activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          <up-icon :name="tab.icon" size="15" :color="activeTab === tab.key ? upThemeVar('--up-primary', '#2979ff') : upThemeVar('--up-tips-color', '#909193')"></up-icon>
          <text class="project-detail-tab__text">{{ tab.label }}</text>
        </view>
      </view>

      <ProjectUnsupportedState
        v-if="pageError"
        title="加载失败"
        :text="pageError"
        icon="warning"
        actionText="重试"
        @action="loadConnection"
      />

      <template v-else>
        <ProjectFilesPanel
          v-if="activeTab === 'files'"
          :gateway="resolvedGateway"
          :projectPath="project.projectPath"
          :unsupportedText="workspaceUnsupported"
        />
        <ProjectGitPanel
          v-else-if="activeTab === 'git'"
          :connection="connection"
          :folderId="project.folderId"
          :projectName="project.projectName"
          :projectPath="project.projectPath"
          :splitMode="true"
          @summary-change="gitSummary = $event"
        />
        <ProjectSessionsPanel
          v-else-if="activeTab === 'sessions'"
          :connection="connection"
          :folderId="project.folderId"
          :projectName="project.projectName"
          @count-change="sessionCount = $event"
        />
        <ProjectTerminalPanel
          v-else-if="activeTab === 'terminal'"
          :gateway="resolvedGateway"
          :projectPath="project.projectPath"
          :unsupportedText="workspaceUnsupported"
        />
        <ProjectTodosPanel
          v-else
          :connectionId="project.connectionId"
          :folderId="project.folderId"
          :projectName="project.projectName"
        />
      </template>
    </view>
  </view>
</template>
```

Use this script:

```ts
import { computed, getCurrentInstance, ref } from "vue"
import { onLoad } from "@dcloudio/uni-app"
import ProjectFilesPanel from "./components/ProjectFilesPanel.vue"
import ProjectGitPanel from "./components/ProjectGitPanel.vue"
import ProjectSessionsPanel from "./components/ProjectSessionsPanel.vue"
import ProjectTerminalPanel from "./components/ProjectTerminalPanel.vue"
import ProjectTodosPanel from "./components/ProjectTodosPanel.vue"
import ProjectUnsupportedState from "./components/ProjectUnsupportedState.vue"
import type { CodegGateway } from "@/services/gateway"
import {
  findStoredConnectionById,
  persistResolvedConnection,
  resolveConnectionContext,
  type ConnectionContext,
} from "@/services/connectionContext"
import {
  isWorkspaceCapableConnection,
  parseProjectDetailRouteOptions,
  workspaceUnsupportedText,
  type ProjectDetailRouteContext,
} from "@/services/projectDetail"
```

Use state:

```ts
type ProjectDetailTab = "files" | "git" | "sessions" | "terminal" | "todos"

const currentInstance = getCurrentInstance()
const upThemeVars = computed(() => currentInstance?.proxy?.upThemeVars || {})
const upThemePageStyle = computed(() => currentInstance?.proxy?.upThemePageStyle || {})
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (name: string, fallback: string) =>
  currentInstance?.proxy?.upThemeVar?.(name, fallback) ?? `var(${name}, ${fallback})`

const tabs = [
  { key: "files", label: "文件", icon: "file-text" },
  { key: "git", label: "Git", icon: "git-branch" },
  { key: "sessions", label: "会话", icon: "chat" },
  { key: "terminal", label: "终端", icon: "terminal" },
  { key: "todos", label: "待办", icon: "checkbox-mark" },
] as const

const activeTab = ref<ProjectDetailTab>("files")
const project = ref<ProjectDetailRouteContext>({
  connectionId: "",
  folderId: 0,
  projectName: "",
  projectPath: "",
})
const connection = ref<ConnectionContext | null>(null)
const resolvedGateway = ref<CodegGateway | null>(null)
const pageError = ref("")
const sessionCount = ref(0)
const gitSummary = ref({ branch: null as string | null, changes: 0, commits: 0 })

const connectionName = computed(() => connection.value?.name || "")
const folderIdText = computed(() => (project.value.folderId > 0 ? `项目 #${project.value.folderId}` : "未知项目"))
const workspaceUnsupported = computed(() => {
  if (!project.value.projectPath) return "当前项目缺少路径，无法使用项目文件、Git 和终端功能。"
  return workspaceUnsupportedText(connection.value)
})
```

Implement load and navigation:

```ts
onLoad((options) => {
  project.value = parseProjectDetailRouteOptions(options as Record<string, unknown>)
  connection.value = findStoredConnectionById(project.value.connectionId)
  void loadConnection()
})

async function loadConnection() {
  pageError.value = ""
  if (!project.value.connectionId || project.value.folderId <= 0) {
    pageError.value = "缺少项目或连接信息，请返回项目列表重试。"
    return
  }
  if (!connection.value) {
    pageError.value = "缺少连接信息，请返回连接页重试。"
    return
  }
  try {
    const resolved = await resolveConnectionContext(connection.value)
    connection.value = resolved.connection
    resolvedGateway.value = resolved.gateway
    persistResolvedConnection(resolved.connection)
    if (!isWorkspaceCapableConnection(resolved.connection)) {
      activeTab.value = "sessions"
    }
  } catch (error) {
    pageError.value = toErrorMessage(error)
  }
}

function goBack() {
  uni.navigateBack({ delta: 1 })
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  return "加载项目详情失败"
}
```

Add scoped styles that use only `--up-*` theme variables and keep the header/tabs compact.

- [ ] **Step 2: Ensure unsupported Git tab is scoped**

In `ProjectGitPanel.vue`, if `props.projectPath` is empty, render:

```vue
<ProjectUnsupportedState
  title="Git 暂不可用"
  text="当前项目缺少路径，无法读取 Git 信息。"
  icon="git-branch"
/>
```

If the connection is mcode-desktop, the Git panel load will fail with unsupported command. Catch this in `loadPage` and show:

```ts
errorMessage.value = "当前连接暂不支持项目 Git 功能，请使用 codeg-main 连接。"
```

Keep the error scoped to the Git panel.

- [ ] **Step 3: Update the architecture note**

Append this implementation note to `docs/mcode-architecture-notes/2026-07-03-p56-project-detail-workbench.md`:

```markdown
## Implementation Update

- 项目列表主点击入口已切换到 `pages/project-detail/index`，旧会话与 Git 独立页保留。
- 详情页通过 `projectDetail.ts` 统一构造和解析路由上下文。
- 文件、Git、终端仅在 codeg-main workspace 协议可用时启用；mcode-desktop 在对应标签显示不支持提示。
- 终端输出通过 gateway event channel 监听 `terminal://output/<terminalId>` 和 `terminal://exit/<terminalId>`，写入 xterm 实例。
- 本地待办以 `connectionId + projectId` 绑定项目，旧待办数据不增加项目字段并保持可见。
```

- [ ] **Step 4: Run focused verification**

Run:

```powershell
cd mcode-app
npm run test:unit -- tests/services/projectDetail.spec.ts tests/services/projectFiles.spec.ts tests/services/projectTerminal.spec.ts tests/services/projectGit.spec.ts tests/pages/project-detail/projectGitSplitState.spec.ts tests/pages/todos/todoState.spec.ts
npx vue-tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit shell integration**

Run:

```powershell
git add -- mcode-app/src/pages/project-detail/index.vue docs/mcode-architecture-notes/2026-07-03-p56-project-detail-workbench.md
git commit -m "feat(app): add project detail workbench"
```

---

### Task 10: End-To-End Verification

**Files:**
- No planned source edits. If verification fails, fix the task that introduced the failure and rerun this task.

**Interfaces:**
- Consumes: all P56 tasks.
- Produces: verified implementation status.

- [ ] **Step 1: Run all focused automated checks**

Run:

```powershell
cd mcode-app
npm run test:unit -- tests/services/projectDetail.spec.ts tests/services/projectFiles.spec.ts tests/services/projectTerminal.spec.ts tests/services/projectGit.spec.ts tests/pages/project-detail/projectGitSplitState.spec.ts tests/pages/todos/todoState.spec.ts tests/pages/projectGitPresentation.spec.ts
npx vue-tsc --noEmit
```

Expected: PASS.

- [ ] **Step 2: Run H5 dev server**

Run:

```powershell
cd mcode-app
npm run dev:h5
```

Expected: H5 dev server starts and prints a local URL.

- [ ] **Step 3: Manual smoke test with codeg-main**

In H5:

1. Open a codeg-main connection with at least one project.
2. Tap a project card from the project list.
3. Confirm the route is `pages/project-detail/index` and the header shows project name/path.
4. Open Files, expand a directory, select a file, preview content, copy path/content, create a test folder, and refresh.
5. Open Git, drag the workspace/history divider, refresh the page, and confirm the ratio persists.
6. Open Sessions and tap a session; confirm conversation detail opens.
7. Open Terminal; confirm xterm renders, shell output appears, input writes to the backend, and closing the page kills the terminal.
8. Open Todos; create a todo, complete it, navigate to global Todos, and confirm the todo is still visible globally.

- [ ] **Step 4: Manual smoke test with mcode-desktop**

In H5:

1. Open a mcode-desktop connection with a project folder.
2. Tap the project.
3. Confirm Sessions and Todos work.
4. Confirm Files, Git, and Terminal each show a scoped unsupported message.

- [ ] **Step 5: Check working tree**

Run:

```powershell
git status --short
```

Expected: only unrelated pre-existing dirty files remain. Do not revert unrelated changes.
