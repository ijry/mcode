# 手机端补上 git 提交（Git 面板「提交」）

落地 [[2026-09-04-11-12-background-activity-mobile-gap]] 第四节第 2 条：mcode 能看 status、
能读 diff、能 push、能 reset，**独缺「提交」**，于是审过的改动没法在手机上变成一个提交。
服务端一行未改 —— `git_commit` 一直都在（约 500 条 HTTP 命令里的一条），只是客户端没调。

## 一、服务端语义（两条必须知道的）

`git_commit`（`codeg-plus/src-tauri/src/web/handlers/git.rs:685-707` →
`commands/folders.rs:2694` 的 `git_commit_core`）入参 `{path, folderId?, message, files[]}`，
返回 `{committed_files}`。它做两步：

1. `git add -- <files>`，但**先剔除已暂存的删除**（`git diff --cached --diff-filter=D`）——
   那些文件在工作区和索引里都不存在了，`git add` 会失败；
2. `git commit -m <message>`，**不带 pathspec**。

由此两条语义：

- **提交的是整个索引，不是只有勾选的文件。** 在 PC 上、或智能体自己 `git add` 过的东西会
  一并进这个提交。界面必须说出来，否则会被当成 bug。
- **作者可能被服务端覆盖**：`resolve_commit_author` 按 git 账号配置注入
  `user.name`/`user.email`。手机端无从干预，也不该干预。

返回的 `committed_files` 数的是**这个提交里的文件数**，因此可能大于勾选数 ——
它正好是上面第一条的观测证据，所以文案在两者不等时明说「含此前已暂存的内容」。

## 二、客户端改动

### `services/projectGit.ts`

新增 `commitRemoteChanges(gateway, path, message, files, folderId?)`，同时读
`committed_files` / `committedFiles` 两种拼法，拿不到时回落勾选数。

### `pages/project-detail/projectGitCommitForm.ts`（新增纯模块）

勾选集与校验放纯模块，两条判断值得单测锁死：

- **按文件去重。** `git status --porcelain` 对同一个文件可以给出多行（索引态与工作区态各一条）
  —— 面板列表的 key 用的正是 `${status}:${file}`，重复是预期的。传给 `git add` 的路径必须去重，
  否则同一个 pathspec 出现两次。多条状态码合并显示在行尾（如 `M MM`）。
- **一个都不勾不是错误。** 第二步是不带 pathspec 的 `git commit`，所以「不勾任何文件」等于
  「提交已暂存的内容」，是合法且有用的动作。真正会失败的是「索引里也空」，而那只有服务端知道
  —— 让它报错、原样透出，不在客户端猜。

默认全选：手机上最常见的动作是「智能体刚改完、我看过 diff 了、提交」。

### `components/ProjectGitPanel.vue`

工作区操作行加「提交」，打开底部弹层（不是居中：文件多要能滚，居中弹窗在小屏上会把输入框
顶到键盘后面）。弹层含提交说明、全选/全不选、文件勾选清单、那条「会包含已暂存内容 + 作者由 PC
配置决定」的说明、错误行、提交按钮。

三个细节：

- **每次打开都按当前工作区重建勾选集** —— 上一次的选择可能指向已经被提交/被丢弃的文件；
- **失败时不清提交说明**（手机上打字最贵），只在成功后清；
- 提交中禁止关闭弹层，成功后 `loadPage()` 重新拉 status 与 log。

## 三、没有做

`git_pull` / `git_fetch` / `git_stash` 仍然缺（见分析笔记第四节第 2 条：一旦分叉，手机侧仍是死路）。
本次只补提交这一步，因为它是「审过 → 落地」链条上唯一缺的一环，而 pull/merge 涉及冲突处理，
是另一件事。

## 四、原生端（iOS / Android）复刻要点

1. 调 `POST /api/git_commit`，`{path, folderId, message, files}`（camelCase）。
2. **勾选集按文件去重**；`git status` 同一文件可能多行。
3. 界面要说明「提交包含此前已暂存的内容」，并在返回的 `committed_files` 大于勾选数时明说 ——
   这不是 bug，是 `git commit` 不带 pathspec 的必然结果。
4. 空勾选是合法请求，不要在客户端拦。
5. 作者信息由服务端解析，不要在客户端拼 `user.name`。
