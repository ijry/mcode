import type { ConnectionContext } from "@/services/connectionContext"

export interface ProjectDetailRouteParams {
  connectionId: string
  folderId: number
  projectName: string
  projectPath?: string | null
}

export interface ProjectDetailRouteContext {
  connectionId: string
  folderId: number
  projectName: string
  projectPath: string
}

export function buildProjectDetailRoute(params: ProjectDetailRouteParams) {
  const connectionId = encodeURIComponent(params.connectionId)
  const projectName = encodeURIComponent(params.projectName)
  const projectPath = encodeURIComponent(params.projectPath || "")
  return `/pages/project-detail/index?connectionId=${connectionId}&folderId=${params.folderId}&projectName=${projectName}&projectPath=${projectPath}`
}

export function parseProjectDetailRouteOptions(
  options: Record<string, unknown> | undefined
): ProjectDetailRouteContext {
  return {
    connectionId: String(options?.connectionId || "").trim(),
    folderId: Number(options?.folderId || 0),
    projectName: decodeURIComponent(String(options?.projectName || "").trim()),
    projectPath: decodeURIComponent(String(options?.projectPath || "").trim()),
  }
}

export function isWorkspaceCapableConnection(
  connection: Partial<ConnectionContext> | null | undefined
) {
  const targetAgent = String(
    (connection as any)?.targetAgent ||
      (connection as any)?.gatewaySession?.targetAgent ||
      ""
  ).trim()
  if (!targetAgent) return true
  return targetAgent === "codeg" || targetAgent === "opencode"
}

export function workspaceUnsupportedText(
  connection: Partial<ConnectionContext> | null | undefined
) {
  if (isWorkspaceCapableConnection(connection)) return ""
  return "当前连接暂不支持项目文件、Git 和终端功能，请使用 codeg-main 连接。"
}
