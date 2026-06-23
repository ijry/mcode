# 2026-06-23 circle comment thread target

## Architecture

圈子评论使用 xycloud 公共评论模块 `/v1/comment/comment/*`。前端评论树必须遵守后端对 `pid` 与 `tpid` 的线程语义，否则本地乐观更新会显示成功，但刷新后列表接口无法把回复挂回原楼层。

## Protocol And Data Flow

后端实现位于 `app/_common/comment/controller/Comment.php`：

- 顶层评论：`pid = 0`
- 任意回复：`pid = 被直接回复的评论 id`
- 所属楼层：`tpid = 楼层主评论 id`

列表接口 `/v1/comment/comment/lists` 只查询：

- 顶层：`pid = 0`
- 子回复：`tpid = 顶层评论 id`

因此“回复一级评论”时，`tpid` 不能传 `0`，必须传该一级评论自己的 `id`。

## UI Behavior

- 回复一级评论时，发送成功后刷新页面仍能出现在该楼层下
- 回复二级评论时，仍然挂在所属一级评论楼层下，同时 `pid` 指向被直接回复的那条评论
- 前端本地插入与后端刷新后的树结构保持一致
- 评论提交成功后，前端立即重新调用列表接口，以服务端返回结果回填评论树，而不是仅依赖本地乐观插入

## Compatibility

- 不涉及圈子帖子接口、分页或排序
- 只修正评论提交参数，不改评论列表接口
- 兼容现有公共评论模块数据结构

## Native Replication

iOS / Android 原生端接同一评论接口时，构造回复参数必须遵循：

- 顶层评论：`pid = 0`
- 回复一级评论：`pid = 一级评论 id`，`tpid = 一级评论 id`
- 回复楼层内其他回复：`pid = 目标回复 id`，`tpid = 一级评论 id`
