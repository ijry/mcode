# P45 App 添加文件夹项目

## 背景

P45 让 MCode App 支持把文件夹添加为项目。MCode App 已能通过 `list_open_folder_details` 读取连接下的项目，但缺少移动端添加文件夹入口。`codeg-main` 已有远端文件系统浏览协议；`mcode-desktop` 当前没有同名 proxy 命令，因此本次设计要求 App 复用同一协议，并在 desktop 端补齐轻量项目注册能力。

## 架构

- App 侧新增可复用的远端目录浏览组件，由当前连接的 `CodegGateway` 驱动。
- 会话首页的连接分组标题右侧新增添加项目入口。
- 当某连接 `projects.length === 0` 且没有加载错误时，分组主体显示“添加文件夹”空状态卡。
- 项目列表页也提供同一添加入口，避免用户必须回到会话首页。
- `mcode-desktop` 新增轻量 `open_folders` 状态，不移植 `codeg-main` 的完整 folder DB。
- `open_folders` 存入 desktop recovery snapshot，旧 snapshot 通过默认空数组兼容。

## 协议与数据流

App 通过现有 direct 或 relay gateway 调用以下命令：

- `get_home_directory`
- `list_directory_entries`，参数 `{ path }`
- `create_folder_directory`，参数 `{ path }`
- `open_folder`，参数 `{ path }`
- `list_open_folder_details`
- `list_opened_tabs`
- `list_all_conversations`

`list_directory_entries` 是目录浏览专用接口。`mcode-desktop` 返回
`{ name, path, isDirectory, hasChildren }`；`codeg-main` 返回目录过滤后的
`{ name, path, hasChildren }`，不带 `isDirectory`。App 归一化时必须把缺失
`isDirectory` / `is_dir` 的条目视为目录，但仍要过滤显式
`isDirectory: false` / `is_dir: false` 的条目，避免文件混入。

成功添加流程：

1. 用户从连接分组或项目页点击添加项目。
2. App 调 `get_home_directory` 初始化目录浏览器。
3. 用户浏览目录时，App 调 `list_directory_entries({ path })`。
4. 用户可在当前浏览目录下输入名称并调 `create_folder_directory({ path })` 新建子目录。
5. 新建成功后，App 刷新当前父目录列表，留在父目录，并把新目录设为待确认路径。
6. 用户确认后，App 先验证当前路径可读取，再调 `open_folder({ path })`。
7. 服务端返回 folder detail。
8. App 强制刷新受影响连接的 `list_open_folder_details`、打开标签和会话摘要。
9. 新项目进入会话总览、历史项目分组、创建会话项目 picker 和项目列表页。

失败流程：

- 目录读取失败时保留弹层，显示错误文案。
- 新建目录失败时保留弹层和当前浏览路径，不做本地乐观插入。
- `open_folder` 失败时不做本地乐观插入。
- 旧 desktop 不支持命令时，提示当前连接需升级桌面端。

## Desktop 行为

`mcode-desktop` 在 proxy dispatcher 中新增运行时无关命令：

- `get_home_directory`：返回用户 home，失败时回退到当前工作目录。
- `list_directory_entries`：只返回直接子目录，字段包含 `name`、`path`、`isDirectory`、`hasChildren`。
- `create_folder_directory`：创建指定目录路径，使用 `create_dir_all` 兼容多级目录创建。
- `open_folder`：校验并 canonicalize 目录，按 canonical path 去重 upsert，写入 recovery snapshot。
- `list_open_folder_details`：返回 `open_folders`。
- `list_opened_tabs`：返回 `{ version: 0, items: [] }`，让 App 会话总览复用现有打开标签快照协议。
- `list_all_conversations`：返回 `[]`，保持项目和历史会话加载流程兼容；desktop 新项目仍可作为新建会话 working directory 使用。

推荐 desktop folder 数据结构：

```rust
pub struct DesktopOpenFolder {
    pub id: i32,
    pub name: String,
    pub path: String,
    pub opened_at_ms: u64,
    pub updated_at_ms: u64,
}
```

ID 由 desktop 本地生成并随 snapshot 持久化。重复打开同一路径返回已有项目，更新 `updated_at_ms`。

## UI 行为

- 入口放在连接分组名称行右侧，不替代全局新建会话按钮。
- 0 项目连接的主体区域显示可点击添加卡片，避免空列表死端。
- 目录浏览器是远端主机浏览器，不是手机本地文件选择器。
- 浏览器应支持 home、上一级、路径输入、目录列表、选择和确认。
- 目录行主体点击语义是进入下一级；左侧选择控件语义是选中该目录作为待添加项目。
- 路径输入框表示当前浏览位置；底部文案表示当前待添加目录，二者不能因为点选子目录而混淆。
- 新建文件夹入口位于目录浏览工具栏；名称不能为空，不能包含路径分隔符，不能是 `.` 或 `..`。
- 新建成功后保持当前浏览路径不变，只刷新列表并选中新目录，方便直接确认添加。
- 每次打开浏览器都要有请求代际保护，旧请求返回后不得覆盖新会话状态。
- 样式继续使用 `--up-*` uview runtime theme variables，不新增 `--mcode-*` 颜色或阴影别名。

## 兼容性

- `codeg-main` 连接直接使用已有命令。
- `mcode-desktop` 新版本提供同名命令。
- 老 desktop 不支持 `create_folder_directory` 时，新建目录会失败并提示升级，但浏览和选择已有目录仍可用。
- App 兼容 `codeg-main` 省略目录标记的目录专用返回值；显式非目录条目仍会被丢弃。
- 老 desktop snapshot 没有 `openFolders` 时按空数组处理。
- `list_opened_tabs` 和 `list_all_conversations` 在 desktop 可返回空结果，不阻断项目展示或新建会话。
- 不涉及 xycloud，账号 token 和 xycloud 域名规则不变。

## iOS / Android 原生复刻要求

- 原生端必须通过连接 gateway 浏览远端或桌面主机目录，不能使用手机本地文件选择器替代。
- 原生端解析目录列表时应兼容缺失 `isDirectory` 的目录专用条目；只有服务端显式标记为非目录时才过滤。
- 原生端目录行应拆分进入与选择：点击行主体进入目录，点击左侧选择控件只更新待确认路径。
- 原生端新建目录必须调用 gateway `create_folder_directory`，不能只在本地 UI 中插入假条目。
- 原生端新建成功后应刷新父目录并选中新目录，不自动进入新目录。
- 原生目录浏览器应实现 home、上级目录、路径输入、目录列表、选择确认、错误提示和加载态。
- `open_folder` 返回值是项目注册的唯一权威来源，原生端不要自行生成项目 ID。
- 添加成功后只刷新当前连接的项目和会话概览数据。
- 对不支持命令的旧 desktop，应显示升级提示，不隐藏连接或清空已有会话。
