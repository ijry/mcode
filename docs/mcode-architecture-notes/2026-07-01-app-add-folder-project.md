# App 添加文件夹项目

## 背景

MCode App 已能通过 `list_open_folder_details` 读取连接下的项目，但缺少移动端添加文件夹入口。`codeg-main` 已有远端文件系统浏览协议；`mcode-desktop` 当前没有同名 proxy 命令，因此本次设计要求 App 复用同一协议，并在 desktop 端补齐轻量项目注册能力。

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
- `open_folder`，参数 `{ path }`
- `list_open_folder_details`

成功添加流程：

1. 用户从连接分组或项目页点击添加项目。
2. App 调 `get_home_directory` 初始化目录浏览器。
3. 用户浏览目录时，App 调 `list_directory_entries({ path })`。
4. 用户确认后，App 先验证当前路径可读取，再调 `open_folder({ path })`。
5. 服务端返回 folder detail。
6. App 强制刷新受影响连接的 `list_open_folder_details`、打开标签和会话摘要。
7. 新项目进入会话总览、历史项目分组、创建会话项目 picker 和项目列表页。

失败流程：

- 目录读取失败时保留弹层，显示错误文案。
- `open_folder` 失败时不做本地乐观插入。
- 旧 desktop 不支持命令时，提示当前连接需升级桌面端。

## Desktop 行为

`mcode-desktop` 在 proxy dispatcher 中新增运行时无关命令：

- `get_home_directory`：返回用户 home，失败时回退到当前工作目录。
- `list_directory_entries`：只返回直接子目录，字段包含 `name`、`path`、`isDirectory`、`hasChildren`。
- `open_folder`：校验并 canonicalize 目录，按 canonical path 去重 upsert，写入 recovery snapshot。
- `list_open_folder_details`：返回 `open_folders`。

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
- 每次打开浏览器都要有请求代际保护，旧请求返回后不得覆盖新会话状态。
- 样式继续使用 `--up-*` uview runtime theme variables，不新增 `--mcode-*` 颜色或阴影别名。

## 兼容性

- `codeg-main` 连接直接使用已有命令。
- `mcode-desktop` 新版本提供同名命令。
- 老 desktop snapshot 没有 `openFolders` 时按空数组处理。
- `list_all_conversations` 对 desktop 新项目可继续返回空数组；本功能只要求项目能被添加并作为新建会话 working directory 使用。
- 不涉及 xycloud，账号 token 和 xycloud 域名规则不变。

## iOS / Android 原生复刻要求

- 原生端必须通过连接 gateway 浏览远端或桌面主机目录，不能使用手机本地文件选择器替代。
- 原生目录浏览器应实现 home、上级目录、路径输入、目录列表、选择确认、错误提示和加载态。
- `open_folder` 返回值是项目注册的唯一权威来源，原生端不要自行生成项目 ID。
- 添加成功后只刷新当前连接的项目和会话概览数据。
- 对不支持命令的旧 desktop，应显示升级提示，不隐藏连接或清空已有会话。
