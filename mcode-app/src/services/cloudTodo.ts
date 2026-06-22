import { useAccountStore } from "@/stores/account"
import { resolveXycloudBaseUrl, XycloudApiError } from "@/services/xycloudAuth"

// 云端待办状态：0 未开始，1 已完成，2 已取消
export const CLOUD_TODO_STATUS_PENDING = 0
export const CLOUD_TODO_STATUS_DONE = 1
export const CLOUD_TODO_STATUS_CANCELLED = 2

export interface CloudTodoItem {
  id: string
  title: string
  content: string
  completed: boolean
  status: number
  cateId: number
  pid: number
  level: number
  isTop: boolean
  startTime: number
  endTime: number
  doneTime: number
  createTime: number
  updateTime: number
}

export interface CloudTodoCreatePayload {
  title: string
  content?: string
  cateId?: number
  startTime?: number
  endTime?: number
}

export interface CloudTodoUpdatePayload {
  id: string
  title?: string
  content?: string
  status?: number
}

export class CloudTodoApiError extends Error {
  code: number
  payload: unknown
  response: unknown

  constructor(message: string, options: { code: number; payload?: unknown; response?: unknown }) {
    super(message)
    this.name = "CloudTodoApiError"
    this.code = options.code
    this.payload = options.payload
    this.response = options.response
  }
}

// 列出当前账号下的全部待办（cateId = -1 表示不按分类过滤）
export async function fetchCloudTodos(params: { cateId?: number } = {}): Promise<CloudTodoItem[]> {
  const cateId = typeof params.cateId === "number" ? params.cateId : -1
  const data = await requestCloudTodo("GET", "/v1/todo/item/lists", undefined, { cateId })
  const payload = normalizeRecord(data)
  return flattenTodoTree(normalizeArray(payload.dataList)).map(normalizeTodo)
}

export async function createCloudTodo(payload: CloudTodoCreatePayload): Promise<void> {
  const body: Record<string, unknown> = {
    title: String(payload.title || "").trim(),
    content: String(payload.content || ""),
  }
  if (typeof payload.cateId === "number") body.cateId = payload.cateId
  if (typeof payload.startTime === "number") body.startTime = payload.startTime
  if (typeof payload.endTime === "number") body.endTime = payload.endTime
  await requestCloudTodo("POST", "/v1/todo/item/add", body)
}

export async function updateCloudTodo(payload: CloudTodoUpdatePayload): Promise<void> {
  const body: Record<string, unknown> = { id: payload.id }
  if (typeof payload.title === "string") body.title = payload.title.trim()
  if (typeof payload.content === "string") body.content = payload.content
  if (typeof payload.status === "number") body.status = payload.status
  await requestCloudTodo("PUT", "/v1/todo/item/edit", body)
}

export async function deleteCloudTodo(id: string): Promise<void> {
  await requestCloudTodo("DELETE", "/v1/todo/item/delete", { id })
}

function normalizeTodo(value: unknown): CloudTodoItem {
  const record = normalizeRecord(value)
  const status = toNumber(record.status)
  return {
    id: firstString(record.id, record.gid),
    title: firstString(record.title),
    content: firstString(record.content),
    completed: status === CLOUD_TODO_STATUS_DONE,
    status,
    cateId: toNumber(record.cateId),
    pid: toNumber(record.pid),
    level: toNumber(record.level),
    isTop: Boolean(toNumber(record.isTop)),
    startTime: toNumber(record.startTime),
    endTime: toNumber(record.endTime),
    doneTime: toNumber(record.doneTime),
    createTime: toNumber(record.createTime),
    updateTime: toNumber(record.updateTime),
  }
}

// 后端 lists 返回的是 list2tree 后的树结构，这里展开为平铺列表
function flattenTodoTree(nodes: unknown[]): Record<string, any>[] {
  const result: Record<string, any>[] = []
  for (const node of nodes) {
    const record = normalizeRecord(node)
    if (!record.id && !record.gid) continue
    const children = normalizeArray(record._child ?? record.children)
    result.push(record)
    if (children.length > 0) {
      result.push(...flattenTodoTree(children))
    }
  }
  return result
}

async function requestCloudTodo(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  data?: Record<string, unknown>,
  query?: Record<string, unknown>
): Promise<unknown> {
  const url = resolveRequestUrl(path, query)
  const account = useAccountStore()
  const header: Record<string, string> = {
    "content-type": "application/json",
  }
  if (account.token) {
    header.Authorization = account.token
  }

  const response = (await uni.request({
    url,
    method,
    data: method === "GET" ? undefined : data || {},
    header,
  })) as {
    statusCode?: number
    data?: unknown
    errMsg?: string
  }

  const statusCode = toNumber(response.statusCode)
  const body = normalizeRecord(response.data)
  const bodyCode = toNumber(body.code || statusCode)
  if (bodyCode !== 200) {
    const message = firstString(body.msg, body.message, response.errMsg, `待办接口请求失败(${bodyCode})`)
    // 401/402 走统一的登录态失效处理
    if (bodyCode === 401 || bodyCode === 402) {
      throw new XycloudApiError(message, {
        code: bodyCode,
        payload: data,
        response,
      })
    }
    throw new CloudTodoApiError(message, {
      code: bodyCode,
      payload: data,
      response,
    })
  }
  return typeof body.data === "undefined" ? body : body.data
}

function resolveRequestUrl(path: string, query?: Record<string, unknown>) {
  const base = resolveXycloudBaseUrl()
  const cleanPath = `/${String(path || "").trim().replace(/^\/+/, "")}`
  const suffix = Object.entries(query || {})
    .map(([key, value]) => [key, normalizeQueryValue(value)] as [string, string])
    .filter(([, value]) => value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&")
  return `${base}${cleanPath}${suffix ? `?${suffix}` : ""}`
}

function normalizeQueryValue(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value === "string" && value.trim()) return value.trim()
  return ""
}

function normalizeRecord(value: unknown): Record<string, any> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, any>
  }
  return {}
}

function normalizeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
    if (typeof value === "number" && Number.isFinite(value)) return String(value)
  }
  return ""
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return Math.trunc(parsed)
  }
  return 0
}
