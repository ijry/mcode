import type { ConnectionContext } from "@/services/connectionContext"

/**
 * 任务详情页的路由构造 / 解析。
 *
 * 按仓库约定，**路由构造器住在 services 层**（同 `services/projectDetail.ts`、
 * `services/remoteSettings.ts` 的 `buildConnectionAgentsRoute`），页面只负责调用 ——
 * 这样「详情页要哪几个参数」只有一处定义，改参数不会漏掉某个入口。
 *
 * 为什么带 `connectionId` 而不只带 `taskId`：任务是**按连接**存在的（每台 codeg
 * 各有自己的一套 work_task 行），单独一个 id 无法定位。这与会话详情页的
 * `?id=&folderId=&connectionId=` 是同一个理由。
 */

export interface TaskDetailRouteParams {
  connectionId: string
  taskId: number
}

export interface TaskDetailRouteContext {
  connectionId: string
  taskId: number
}

export function buildTaskDetailRoute(params: TaskDetailRouteParams): string {
  const connectionId = encodeURIComponent(params.connectionId || "")
  return `/pages/task-detail/index?connectionId=${connectionId}&taskId=${params.taskId}`
}

export function parseTaskDetailRouteOptions(
  options: Record<string, unknown> | undefined
): TaskDetailRouteContext {
  return {
    connectionId: decodeURIComponent(String(options?.connectionId || "").trim()),
    taskId: Number(options?.taskId || 0) || 0,
  }
}

/**
 * 任务功能是否可用于这条连接。
 *
 * `work_task_*` 是 **codeg-plus 独有**的命令族：opencode 与 mcode-desktop 的服务端
 * 都没有这些路由（前者是另一套 agent 协议，后者只是个转发壳）。对它们发请求会拿到
 * 404 —— 与其让用户看到一串网关错误，不如提前说清楚。
 *
 * 与 `services/projectDetail.isWorkspaceCapableConnection` 的差别：那个把 opencode
 * 也算进来（文件 / Git / 终端 opencode 也支持），任务只有 codeg 有。
 */
export function isTaskCapableConnection(
  connection: Partial<ConnectionContext> | null | undefined
): boolean {
  if (!connection) return false
  const targetAgent = String(
    (connection as any)?.targetProfile?.targetAgent ||
      (connection as any)?.targetAgent ||
      (connection as any)?.gatewaySession?.targetAgent ||
      ""
  ).trim()
  // 空值放行：老连接记录可能没有 targetAgent，此时按历史默认（codeg）处理，
  // 让请求自己去报错，而不是凭一个缺失字段把功能藏起来。
  if (!targetAgent) return true
  return targetAgent === "codeg"
}

export function taskUnsupportedText(
  connection: Partial<ConnectionContext> | null | undefined
): string {
  if (isTaskCapableConnection(connection)) return ""
  return "当前连接暂不支持任务功能，请使用 codeg 连接。"
}
