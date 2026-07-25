# mcode-app 实时使用本地 uview-plus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `mcode-app` 在 H5 和 App 平台从本地 uview-plus 工作区实时解析组件、运行时代码与 Sass 主题，同时不改变小程序的 npm 依赖解析。

**Architecture:** `mcode-app/vite.config.js` 在 Vite 配置加载期读取 `UNI_PLATFORM`。仅对 `h5` 与 `app` 为模块名 `uview-plus` 添加精确 alias，使所有同名 JavaScript、Vue 自动组件和 Sass 导入统一指向本地源码根目录；其他平台没有该 alias，继续由 `node_modules` 和 `pnpm-lock.yaml` 提供版本。用构建命令验证真实解析路径，而不是增加与 Vite 解析器脱节的单元测试。

**Tech Stack:** Vite 5、`@dcloudio/vite-plugin-uni`、uview-plus、Node `path`、pnpm、Sass。

## Global Constraints

- 本地 uview-plus 源码根目录固定为 `D:/Repos/xyito/open/uview-plus/src/uni_modules/uview-plus`。
- 仅在 `process.env.UNI_PLATFORM === "h5"` 或 `process.env.UNI_PLATFORM === "app"` 时配置 `uview-plus` alias。
- 小程序平台必须继续解析 `mcode-app/node_modules` 中由 `mcode-app/pnpm-lock.yaml` 固定的 `uview-plus@3.8.42`。
- 不修改 `mcode-app/package.json`、`mcode-app/pnpm-lock.yaml`、uview-plus 源码、主题变量或业务页面。
- 本地目录缺失时不得增加回退逻辑；Vite 必须以模块解析错误显式失败。
- 每项 mcode 改动必须更新 `docs/mcode-architecture-notes/`，写明架构、数据流、UI、兼容性及 iOS/Android 复刻边界。
- 实施仅使用 Inline Execution；不要创建隔离 worktree 或使用 Subagent-Driven 流程。
- 除非用户明确要求，实施不创建 Git 提交。

---

### Task 1: 按平台解析本地 uview-plus

**Files:**
- Modify: `mcode-app/vite.config.js:1-35`

**Interfaces:**
- Consumes: `process.env.UNI_PLATFORM`，由 uni CLI 在目标平台构建时设置。
- Consumes: 本地源码目录 `D:/Repos/xyito/open/uview-plus/src/uni_modules/uview-plus`。
- Produces: `resolve.alias`；在 H5/App 平台将模块请求 `uview-plus`（及其子路径）解析到本地源码根目录。

- [ ] **Step 1: 检查本地源码的可解析入口**

Run:

```powershell
Get-Item 'D:\Repos\xyito\open\uview-plus\src\uni_modules\uview-plus'
Get-ChildItem 'D:\Repos\xyito\open\uview-plus\src\uni_modules\uview-plus' -Force | Select-Object -First 20 Name
```

Expected: 目录存在，且包含 `package.json`、组件或库入口，能够作为 `uview-plus` 模块根目录。

- [ ] **Step 2: 在配置顶层定义条件 alias 列表**

Modify `mcode-app/vite.config.js`：在现有 import 区域新增 `node:path` 导入；在 `const uni` 后建立空数组 `alias`。仅当平台为 H5 或 App 时向数组追加以下对象，使用 `path.resolve` 保持跨 Windows 路径格式：

```js
if (process.env.UNI_PLATFORM === "h5" || process.env.UNI_PLATFORM === "app") {
  alias.push({
    find: "uview-plus",
    replacement: path.resolve(
      "D:/Repos/xyito/open/uview-plus/src/uni_modules/uview-plus",
    ),
  })
}
```

不要检查路径存在性，也不要在路径缺失时回退 npm 依赖。不要移动或修改 `UniUpRoot`、`optimizeDeps.exclude`、SCSS `additionalData` 和服务端口配置。

- [ ] **Step 3: 将条件 alias 连接到 Vite 解析器**

在 `export default defineConfig({ ... })` 的顶层配置内添加：

```js
resolve: {
  alias,
},
```

放在 `plugins` 与 `optimizeDeps` 相邻的位置。该引用使 `import "uview-plus"`、`uview-plus/libs/root/index.js` 和 `@import "uview-plus/theme.scss"` 共享相同的解析来源。

- [ ] **Step 4: 审查配置差异与平台条件**

Run:

```powershell
git diff --check -- mcode-app/vite.config.js
git diff -- mcode-app/vite.config.js
```

Expected: 无空白错误；唯一行为变化是 `h5`/`app` 的 `uview-plus` alias；没有改动 npm 依赖或小程序配置。

### Task 2: 记录平台依赖来源与原生边界

**Files:**
- Create: `docs/mcode-architecture-notes/2026-07-26-mcode-app-live-uview-plus.md`

**Interfaces:**
- Consumes: `mcode-app/vite.config.js` 中以 `UNI_PLATFORM` 为条件的 `resolve.alias`。
- Produces: 面向 Web/uni 与原生实现者的构建来源、兼容性和复刻边界说明。

- [ ] **Step 1: 创建 mcode 架构说明**

创建 Markdown 文件，正文必须包含以下准确内容：

```markdown
# mcode-app 实时使用本地 uview-plus

## 架构与数据流

- uni CLI 在构建开始前提供 `UNI_PLATFORM`；Vite 据此决定模块来源。
- H5 与 App 为 `uview-plus` 配置 alias，目标为 `D:/Repos/xyito/open/uview-plus/src/uni_modules/uview-plus`。
- 所有 `uview-plus` 的 JavaScript、自动组件与 Sass 主题导入经过同一个 Vite 解析规则，因此本地源码修改会在下一次开发重载或构建时生效。
- 小程序不配置 alias，继续使用 `mcode-app/node_modules` 和 `pnpm-lock.yaml` 中的固定版本。

## UI 与兼容性

- 本次不新增页面、交互、主题 token 或网络协议；H5/App 的组件表现取决于本地 uview-plus 源码版本。
- H5/App 工作区必须存在该本地源码目录。目录缺失时保留 Vite 的解析错误，不能悄悄回退到 npm 版本。
- 小程序与 H5/App 在本地源码更新后可能暂时存在组件行为差异；发布前应按目标平台分别回归。

## 原生 iOS/Android 复刻

该配置是 uni/Vite 构建期行为，不需要 Swift、Kotlin 或桥接层实现。若原生客户端需要同等组件行为，应同步等价的 uview-plus 功能，而不是复制 alias 配置。
```

- [ ] **Step 2: 检查说明覆盖项目要求**

Run:

```powershell
Get-Content -Raw 'docs\mcode-architecture-notes\2026-07-26-mcode-app-live-uview-plus.md'
```

Expected: 说明明确包含架构、构建数据流、UI 行为、兼容性和 iOS/Android 复刻指导；没有未完成占位符。

### Task 3: 验证 H5 实时解析与小程序隔离

**Files:**
- Verify: `mcode-app/vite.config.js`
- Verify: `docs/mcode-architecture-notes/2026-07-26-mcode-app-live-uview-plus.md`

**Interfaces:**
- Consumes: Task 1 产出的 `resolve.alias` 和 Task 2 的架构说明。
- Produces: H5 构建成功、构建产物或日志验证本地来源、小程序平台不命中条件 alias 的记录。

- [ ] **Step 1: 验证 H5 配置会暴露本地 alias**

在 `mcode-app` 目录执行：

```powershell
$env:UNI_PLATFORM = 'h5'
node -e "import('./vite.config.js').then(({default: config}) => { const resolved = typeof config === 'function' ? config({ command: 'build', mode: 'production' }) : config; Promise.resolve(resolved).then(value => console.log(JSON.stringify(value.resolve.alias, null, 2))) })"
```

Expected: 输出中存在 `find: "uview-plus"`，其 `replacement` 解析到 `D:\Repos\xyito\open\uview-plus\src\uni_modules\uview-plus`。

- [ ] **Step 2: 运行 H5 生产构建**

在 `mcode-app` 目录执行：

```powershell
pnpm build:h5
```

Expected: 命令以退出码 0 完成；若失败，只修复本次 alias 所致的模块解析问题，不处理无关的预存构建故障。

- [ ] **Step 3: 验证小程序平台不生成本地 alias**

在 `mcode-app` 目录执行：

```powershell
$env:UNI_PLATFORM = 'mp-weixin'
node -e "import('./vite.config.js').then(({default: config}) => { const resolved = typeof config === 'function' ? config({ command: 'build', mode: 'production' }) : config; Promise.resolve(resolved).then(value => console.log(JSON.stringify(value.resolve.alias, null, 2))) })"
```

Expected: 输出为空数组 `[]`；该结果证明小程序仍由既有 node_modules/npm 解析链处理 `uview-plus`。

- [ ] **Step 4: 运行配置与文档最终检查**

Run from repository root:

```powershell
git diff --check
git status --short -- mcode-app/vite.config.js docs/mcode-architecture-notes/2026-07-26-mcode-app-live-uview-plus.md
```

Expected: `git diff --check` 无输出；状态仅显示本任务的 Vite 配置和架构说明文件，另有既存用户改动时不触碰也不归入本任务。
