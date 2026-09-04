# Git 面板补上「拉取」，冲突走常驻提示

接着 [[2026-09-04-12-16-project-git-commit-mobile]]：能提交、能 push，但**不能同步** ——
分支一旦分叉，手机侧就是死路（push 被拒，没有任何补救入口）。本次补 `git_pull`。

## 一、冲突是正常返回值，不是错误

`git_pull`（`codeg-plus/src-tauri/src/web/handlers/git.rs:584-600`）入参 `{path, credentials}`，
返回 `{updated_files, conflict?}`，其中
`GitConflictInfo{has_conflicts, conflicted_files, operation, upstream_commit}`
（`commands/folders.rs:181-192`）**放在成功响应里** —— pull 确实执行了、工作区确实变了，
只是留下了待解决的冲突。

**手机端解决不了冲突**（三栏合并编辑器是桌面端能力，见分析笔记的能力对照）。所以：

- 冲突走**常驻提示**（红框 + 「知道了」手动关闭），不是 toast。一闪而过的提示会让用户
  以为同步成功了，而工作区里躺着一堆冲突标记 —— 这是最糟的失败模式。
- 提示文案必须同时给三件事：**有冲突**、**哪些文件**、**去电脑端**。少任何一条都不够用。
  文件多于 3 个时折成「等 N 个文件」，避免一条提示占半屏。

判据与文案在 `pages/project-detail/projectGitSyncPresentation.ts`（纯模块 + 单测），
因为这条分支的措辞是产品决定，不是顺手写的字符串。

## 二、没有做 `git_fetch`

服务端有 `git_fetch` / `git_fetch_remote`，但工作区操作行已经有五个动作
（刷新 / 切分支 / 提交 / 拉取 / Push），再塞一个在手机上会换行；而 `git pull` 自己就会 fetch，
「远端有没有新分支」这个场景更适合放进切分支的动作面板 —— 那是另一次改动。
**没有为它留下未使用的导出**（写了又删）。

`git_stash` / `merge` / `rebase` 仍然缺，见分析笔记第四节第 2 条。

## 三、原生端（iOS / Android）复刻要点

1. `POST /api/git_pull`，`{path, credentials: null}`；返回 `{updated_files, conflict}`。
2. **`conflict.has_conflicts` 为真时不要抛错**，那是成功响应；也不要用瞬时提示。
3. 冲突提示必须列出文件名并明确指向电脑端 —— 移动端没有合并能力。
4. 拉取完成后要重新拉 status 与 log（工作区已经变了）。
