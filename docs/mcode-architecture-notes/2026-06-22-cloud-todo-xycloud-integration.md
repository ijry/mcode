# 云端待办对接 xycloud（2026-06-22）

## 背景

待办页（`mcode-app/src/pages/todos/index.vue`）原有"云端"分签仅为占位（"云端待办即将上线"）。本次将其对接到 xycloud 后端的待办模块 `app/_app/todo`，实现真实的增删改查。

## 数据来源与鉴权

- 后端源码：`xystack/back-end/xycloud/app/_app/todo`。
- 接口路由约定：`/v1/<module>/<controller>/<action>`。
  - 列表 `GET /v1/todo/item/lists`（query `cateId`，传 `-1` 表示不按分类过滤）
  - 新增 `POST /v1/todo/item/add`
  - 修改 `PUT /v1/todo/item/edit`
  - 删除 `DELETE /v1/todo/item/delete`
- 域名：复用与账号、圈子相同的 `resolveXycloudBaseUrl()`（`services/xycloudAuth.ts`）。
- 鉴权：使用账号 token（`useAccountStore().token`）作为 `Authorization` 请求头，与圈子完全一致。
- 多租户：后端按 `cloudId + uid` 隔离数据，前端无需额外传参。

## 服务层

新增 `mcode-app/src/services/cloudTodo.ts`，参考 `services/circle.ts` 的结构：

- `requestCloudTodo(method, path, data?, query?)`：统一请求封装。GET 走 query，其余方法走 JSON body；非 200 抛错，其中 401/402 抛 `XycloudApiError`（触发登录态失效处理），其他抛 `CloudTodoApiError`。
- `fetchCloudTodos({ cateId })`：拉取列表。后端返回 `list2tree` 树结构，用 `flattenTodoTree` 展开为平铺数组（兼容 `_child` / `children`），再 `normalizeTodo` 规范化。
- `createCloudTodo` / `updateCloudTodo` / `deleteCloudTodo`：增改删。
- 状态常量：`0` 未开始、`1` 已完成、`2` 已取消；`completed = (status === 1)`。

`CloudTodoItem` 字段映射后端 `xy_todo_item`：`id/title/content/status/cateId/pid/level/isTop/startTime/endTime/doneTime/createTime/updateTime`。

## 页面行为

- 新增 `cloudTodos / cloudLoading / cloudLoaded / editingCloudId / currentTodoIsCloud` 状态，`isLoggedIn` 由账号 store 派生。
- `cloudToTodoItem` 将 `CloudTodoItem` 映射为通用 `TodoItem`，复用 `getVisibleTodoSections` 与既有卡片/区块组件，分出"进行中/已完成"。
- 切到"云端"分签且已登录且未加载过时触发 `loadCloudTodos`；`onShow` 在云端分签时刷新。
- 未登录时云端分签显示登录引导卡片，点击跳转 `/pages/auth/login`。
- 新增（复用创建弹层）、切换完成（乐观更新 + 失败回滚，完成时给宠物加经验）、编辑（清空标题视为删除）、删除、清除全部已完成（逐条删除）均落到云端接口。
- 错误统一经 `handleCloudError`：`XycloudApiError` 视为登录失效，`account.logout()` 后跳登录；其余 toast 提示。

## 原生端复刻要点

- 同一账号体系：直接复用账号登录 token 作为 `Authorization`，base URL 与账号/圈子共享。
- 列表需展开树结构后再渲染平铺列表；状态字段以整型 0/1/2 表达，UI 的"已完成"= status==1。
- 完成态切换建议乐观更新并在请求失败时回滚，保证手感。
- 401/402 统一按登录失效处理（清账号态并引导重新登录）。
