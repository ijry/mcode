# 项目级 Git 管理

## 背景

`mcode-app` 原有连接 -> 项目列表 -> 项目会话导航链路已打通，但项目列表还没有项目级 Git 管理入口。

本次改动在项目列表卡片右侧新增下拉菜单入口，新增独立的 `Git 管理` 页，显示：

1. 当前工作区状态
2. 当前分支
3. 提交历史
4. 常用 Git 管理动作

## 数据流与协议

- 页面继续通过完整 `connection` 上下文恢复远端连接，不依赖全局当前连接。
- Git RPC 统一按项目 `path` 调用，不按 `folderId` 调用。
- `folderId` 仅用于页面路由和返回项目会话页。
- 直接复用现有远端 Web API：
  - `get_git_branch`
  - `git_status`
  - `git_log`
  - `git_list_all_branches`
  - `git_commit_branches`
  - `git_checkout`
  - `git_new_branch`
  - `git_reset`
  - `git_push_info`
  - `git_push`
- 不新增 mcode 专用 Git 聚合协议。

## UI 行为

- 项目卡片主体仍进入项目会话页。
- 项目卡片右侧菜单新增 `Git 管理`。
- Git 页最上方固定显示当前工作区状态，再显示提交历史。
- 顶部动作包含：
  - 刷新
  - Push
  - 切分支
- 每条提交支持：
  - 新建分支
  - Reset 到这里

## 兼容性

- 不改变原有项目会话页入口。
- 不改变会话详情页协议。
- 不依赖桌面端 `open_push_window` 之类弹窗接口。
- 非 Git 仓库时显示专用错误态。

## iOS / Android 原生复刻要求

- 原生实现也必须继续显式透传完整连接上下文。
- Git 操作统一按项目绝对路径或服务端可识别的工作区路径标识执行。
- 页首先显示工作区当前状态，再显示历史。
- `reset` 只能在当前分支视角下允许执行。
- 冲突处理、复杂 merge / rebase 不要求在首版原生页实现，可提示回桌面端处理。
