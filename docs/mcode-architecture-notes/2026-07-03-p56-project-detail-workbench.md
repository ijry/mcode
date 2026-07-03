# P56 项目详情工作台

## 架构

P56 新增 `pages/project-detail/index` 作为项目工作台。项目列表点击项目后进入详情页，而不是直接进入项目会话列表。详情页统一解析 `connectionId`、`folderId`、`projectName`、`projectPath`，并解析出 `CodegGateway` 后传给文件、Git、会话、终端、待办五个嵌入面板。

旧的项目会话页、Git 管理页、提交详情页和 Diff 页继续保留。实现时将 Git 与会话列表主体抽成可复用面板，详情页嵌入这些面板，旧独立页也可继续复用。

## 协议与数据流

- 文件：codeg-main 连接调用 `get_file_tree`、`read_file_preview`、`create_file_tree_entry`。文件树使用 uview-plus `up-tree` 展示；根目录初次只读取浅层树；展开文件夹后用 `projectPath + 相对文件夹路径` 异步读取该目录子级，预览与创建仍传 `rootPath = projectPath` 和相对 `path`，避免越过项目根目录。
- Git：继续复用现有 `projectGit.ts` 的 `git_status`、`git_log`、`git_diff`、`git_show_diff`、分支、push、reset 等命令封装。
- 会话：继续通过 `loadRemoteProjectConversations(gateway, folderId)` 读取项目会话；打开会话前继续调用 `ensureConversationTab`。
- 终端：codeg-main 连接调用 `terminal_spawn`、`terminal_write`、`terminal_resize`、`terminal_kill`、`terminal_list`。移动端 Web/H5 使用 `@xterm/xterm` 与 `@xterm/addon-fit` 渲染真实终端；xterm 挂载点必须是 H5 原生 DOM 节点，不能直接把 uni `view` 组件 ref 传给 `terminal.open(...)`。
- 待办：本地 `TodoItem` 增加可选 `projectId`、`connectionId`、`projectName` 字段。项目详情页创建的本地待办自动绑定当前项目。

## UI 行为

详情页顶部显示紧凑项目信息区，下面用 uview-plus 分段器显示纯文字标签：`文件 / Git / 会话 / 终端 / 待办`。每个标签自行加载数据并显示独立的 loading、empty、error、unsupported 状态。

Git 标签采用上下分区：上方工作区变更，下方提交历史，中间拖拽条调整高度。高度比例按 `connectionId + folderId` 写入本地 storage，并在可用范围内 clamp。

终端标签强依赖 xterm.js。进入终端标签时创建终端实例并 spawn 项目目录下的终端；输入通过 `onData` 写入后端，尺寸变化通过 FitAddon 计算后调用 resize。离开页面或关闭终端时 kill 后端终端。

待办标签只显示当前项目绑定的本地待办。全局待办页继续显示本地全部待办，避免旧数据或项目绑定数据从原入口消失。

## 兼容性

本阶段优先支持 codeg-main。mcode-desktop 当前未暴露文件、Git、终端 workspace 命令，因此这些标签显示“当前连接暂不支持此功能”；会话和项目本地待办仍可使用。

旧本地待办没有项目字段时按未绑定待办处理。旧项目会话、Git、提交详情和 Diff 深链继续可用。

## iOS / Android 复刻要求

- 原生端应实现相同项目详情结构和五个标签。
- 文件标签必须通过连接 gateway 读取项目根下文件，不能使用手机本地文件系统替代。
- Git 标签应复用同一后端协议，并持久化项目级工作区/历史分割比例。
- 终端标签必须使用真实终端 emulator，并桥接到 `terminal_*` 后端命令；不能仅用普通文本日志替代交互终端。
- 待办模型必须兼容旧数据，并按 `connectionId + projectId` 过滤当前项目待办。
- 不支持某个协议的连接应在对应标签内提示，不应阻断整个详情页。

## Implementation Update

- 项目列表主点击入口已切换到 `pages/project-detail/index`，旧会话页、Git 页、提交详情页和 Diff 页继续保留为可深链访问页面。
- 详情页通过 `projectDetail.ts` 统一构造和解析 `connectionId`、`folderId`、`projectName`、`projectPath`，并在页面层解析 `CodegGateway` 后注入文件与终端面板。
- 详情页标签栏使用 uview-plus `u-subsection` 分段器，不再使用图标标签。
- 文件树采用 uview-plus `up-tree`，初始只加载浅层节点，文件夹展开后异步请求子级并插入到当前树，避免一次性展开完整项目树。
- 文件、Git、终端仅在 codeg-main workspace 协议可用时启用；mcode-desktop 在对应标签显示局部不支持提示，会话与项目本地待办仍可使用。
- Git 独立页改为复用 `ProjectGitPanel`；详情页开启 split mode，工作区与提交历史高度比例按 `connectionId + folderId` 写入本地 storage。
- 终端面板强依赖 `@xterm/xterm` 与 `@xterm/addon-fit`，监听 `terminal://output/<terminalId>` 和 `terminal://exit/<terminalId>`，输入通过 `terminal_write` 写回后端。H5 侧使用原生 `<div>` 作为终端宿主，并通过 `data-terminal-host` 回退解析真实 DOM，避免 uni `view` ref 在 `xterm.open()` 中缺少 `ownerDocument`。
- 本地待办以 `connectionId + projectId` 绑定项目，项目页创建的待办仍写入全局 `mcode_todos`，旧待办数据不增加项目字段并保持兼容。
