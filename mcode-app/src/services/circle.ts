import { useAccountStore } from "@/stores/account"
import { resolveXycloudBaseUrl, XycloudApiError } from "@/services/xycloudAuth"

export interface CircleTopic {
  id: number
  name: string
  title: string
  description: string
  cover: string
  postCount: number
  memberCount: number
  heatText: string
}

export interface CircleUserTitle {
  title: string
  bgColor: string
}

export interface CirclePost {
  id: number
  uid: number
  author: string
  avatar: string
  avatarText: string
  userTitle: CircleUserTitle | null
  title: string
  content: string
  images: string[]
  topicIds: number[]
  topicTitles: string[]
  topicList: CircleTopic[]
  likeCount: number
  commentCount: number
  favoriteCount: number
  viewCount: number
  liked: boolean
  favorited: boolean
  postTime: number
  timeText: string
}

export interface CircleComment {
  id: string
  uid: number
  author: string
  avatar: string
  avatarText: string
  content: string
  createTime: number
  timeText: string
  replyCount: number
  likeCount: number
  children: CircleComment[]
}

export interface CirclePostListResult {
  posts: CirclePost[]
  topics: CircleTopic[]
  total: number
  page: number
  limit: number
}

export interface CircleTopicListResult {
  topics: CircleTopic[]
  total: number
  page: number
  limit: number
}

export interface CircleCommentListResult {
  comments: CircleComment[]
  total: number
  page: number
  limit: number
}

export interface CirclePublishPayload {
  title?: string
  content: string
  topicIds?: number[]
  images?: string[]
}

export interface CircleImageUploadResult {
  url: string
  path: string
  name: string
}

type CircleOrder = "latest" | "hot"

export class CircleApiError extends Error {
  code: number
  payload: unknown
  response: unknown

  constructor(message: string, options: { code: number; payload?: unknown; response?: unknown }) {
    super(message)
    this.name = "CircleApiError"
    this.code = options.code
    this.payload = options.payload
    this.response = options.response
  }
}

export async function fetchCirclePosts(params: {
  order?: CircleOrder
  page?: number
  limit?: number
  keyword?: string
  topicId?: number
} = {}): Promise<CirclePostListResult> {
  const data = await requestCircle("GET", "/v1/circle/post/lists", undefined, {
    order: params.order || "latest",
    page: params.page || 1,
    limit: params.limit || 10,
    keyword: params.keyword || "",
    topicId: params.topicId || "",
  })
  const payload = normalizeRecord(data)
  const pageInfo = normalizeRecord(payload.dataPage)
  return {
    posts: normalizeArray(payload.dataList).map(normalizePost),
    topics: normalizeArray(payload.hotTopics).map(normalizeTopic),
    total: toNumber(pageInfo.total),
    page: toNumber(pageInfo.page) || params.page || 1,
    limit: toNumber(pageInfo.limit) || params.limit || 10,
  }
}

export async function fetchCircleTopics(params: {
  page?: number
  limit?: number
  siteRec?: string
} = {}): Promise<CircleTopicListResult> {
  const data = await requestCircle("GET", "/v1/circle/topic/lists", undefined, {
    page: params.page || 1,
    limit: params.limit || 30,
    siteRec: params.siteRec || "",
  })
  const payload = normalizeRecord(data)
  const pageInfo = normalizeRecord(payload.dataPage)
  return {
    topics: normalizeArray(payload.dataList).map(normalizeTopic),
    total: toNumber(pageInfo.total),
    page: toNumber(pageInfo.page) || params.page || 1,
    limit: toNumber(pageInfo.limit) || params.limit || 30,
  }
}

export async function fetchCirclePost(postId: number): Promise<CirclePost> {
  const id = toNumber(postId)
  const data = await requestCircle("GET", `/v1/circle/post/info/${id}`)
  const payload = normalizeRecord(data)
  return normalizePost(payload.post || payload.info || payload)
}

export async function publishCirclePost(payload: CirclePublishPayload): Promise<{ id: number }> {
  const data = await requestCircle("POST", "/v1/circle/post/add", {
    title: String(payload.title || "").trim(),
    content: payload.content.trim(),
    topicIds: (payload.topicIds || []).filter((id) => Number.isFinite(id) && id > 0).join(","),
    images: payload.images || [],
  })
  const record = normalizeRecord(data)
  return { id: toNumber(record.id) }
}

export async function updateCirclePost(payload: CirclePublishPayload & { id: number }): Promise<{ id: number }> {
  const id = Math.max(0, Math.trunc(Number(payload.id || 0)))
  const data = await requestCircle("POST", `/v1/circle/post/edit/${id}`, {
    title: String(payload.title || "").trim(),
    content: payload.content.trim(),
    topicIds: (payload.topicIds || []).filter((topicId) => Number.isFinite(topicId) && topicId > 0).join(","),
    images: payload.images || [],
  })
  const record = normalizeRecord(data)
  return { id: toNumber(record.id) || id }
}

export async function uploadCircleImage(filePath: string): Promise<CircleImageUploadResult> {
  const account = useAccountStore()
  const header: Record<string, string> = {}
  if (account.token) {
    header.Authorization = account.token
  }

  const response = await new Promise<{ statusCode?: number; data?: unknown; errMsg?: string }>((resolve, reject) => {
    uni.uploadFile({
      url: resolveRequestUrl("/v1/core/index/upload"),
      filePath,
      name: "file",
      header,
      success: resolve,
      fail: (error) => reject(new CircleApiError(firstString(error?.errMsg, "图片上传失败"), {
        code: 0,
        payload: { filePath },
        response: error,
      })),
    })
  })

  const statusCode = toNumber(response.statusCode)
  const body = normalizeRecord(parseUploadResponseData(response.data))
  const bodyCode = toNumber(body.code || statusCode)
  if (bodyCode !== 200) {
    throw new CircleApiError(firstString(body.msg, body.message, response.errMsg, `图片上传失败(${bodyCode})`), {
      code: bodyCode,
      payload: { filePath },
      response,
    })
  }
  const data = normalizeRecord(body.data)
  const url = firstString(data.url, data.path)
  if (!url) {
    throw new CircleApiError("图片上传结果缺少 URL", {
      code: bodyCode,
      payload: { filePath },
      response,
    })
  }
  return {
    url,
    path: firstString(data.path),
    name: firstString(data.name),
  }
}

export async function toggleCircleAction(postId: number, actionType: 1 | 2): Promise<boolean> {
  const data = await requestCircle("POST", "/v1/action/action/set", {
    dataModel: "circle_post",
    dataId: postId,
    actionType,
  })
  const record = normalizeRecord(data)
  return toNumber(record.currentValue) === 1
}

export async function fetchCircleComments(params: {
  postId: number
  page?: number
  limit?: number
}): Promise<CircleCommentListResult> {
  const data = await requestCircle("GET", "/v1/comment/comment/lists", undefined, {
    dataModel: "circle_post",
    dataId: params.postId,
    page: params.page || 1,
    limit: params.limit || 20,
    sortBy: "createTime desc",
  })
  const payload = normalizeRecord(data)
  const pageInfo = normalizeRecord(payload.dataPage)
  return {
    comments: normalizeArray(payload.dataList).map(normalizeComment),
    total: toNumber(pageInfo.total),
    page: toNumber(pageInfo.page) || params.page || 1,
    limit: toNumber(pageInfo.limit) || params.limit || 20,
  }
}

export async function publishCircleComment(params: {
  postId: number
  content: string
  pid?: string | number
  tpid?: string | number
}): Promise<CircleComment> {
  const data = await requestCircle("POST", "/v1/comment/comment/add", {
    dataModel: "circle_post",
    dataId: params.postId,
    content: params.content.trim(),
    pid: normalizeCommentRef(params.pid),
    tpid: normalizeCommentRef(params.tpid),
  })
  const record = normalizeRecord(data)
  return normalizeComment(record.comment || record)
}

function normalizeCommentRef(value: unknown): string | number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.trunc(value))
  if (typeof value === "string" && value.trim()) return value.trim()
  return 0
}

function normalizePost(value: unknown): CirclePost {
  const record = normalizeRecord(value)
  const userInfo = normalizeRecord(record.userInfo)
  const userTitle = normalizeUserTitle(record.userTitle)
  const topicList = normalizeArray(record.topicList).map(normalizeTopic)
  const topicIds = normalizeNumberArray(record.topicIdsFormat || record.topicIds)
  const author = firstString(userInfo.nickname, userInfo.name, `用户${toNumber(record.uid) || ""}`, "匿名用户")
  return {
    id: toNumber(record.id),
    uid: toNumber(record.uid),
    author,
    avatar: firstString(userInfo.avatar),
    avatarText: author.slice(0, 1) || "圈",
    userTitle,
    title: firstString(record.title),
    content: firstString(record.content),
    images: normalizeStringArray(record.images),
    topicIds,
    topicTitles: topicList.map((topic) => topic.title).filter(Boolean),
    topicList,
    likeCount: toNumber(record.likeCount),
    commentCount: toNumber(record.commentCount),
    favoriteCount: toNumber(record.favoriteCount),
    viewCount: toNumber(record.viewCount),
    liked: Boolean(record.liked),
    favorited: Boolean(record.favorited),
    postTime: toNumber(record.postTime || record.createTime),
    timeText: formatRelativeTime(toNumber(record.postTime || record.createTime)),
  }
}

function normalizeComment(value: unknown): CircleComment {
  const record = normalizeRecord(value)
  const userInfo = normalizeRecord(record.userInfo)
  const author = firstString(userInfo.nickname, userInfo.name, `用户${toNumber(record.uid) || ""}`, "匿名用户")
  const createTime = toNumber(record.createTime)
  return {
    id: firstString(record.id) || String(toNumber(record.gid)),
    uid: toNumber(record.uid),
    author,
    avatar: firstString(userInfo.avatar),
    avatarText: author.slice(0, 1) || "评",
    content: firstString(record.content),
    createTime,
    timeText: formatRelativeTime(createTime),
    replyCount: toNumber(record.replyCount),
    likeCount: toNumber(record.zanCount),
    children: normalizeArray(record.children).map(normalizeComment),
  }
}

function normalizeTopic(value: unknown): CircleTopic {
  const record = normalizeRecord(value)
  const postCount = toNumber(record.postCount)
  return {
    id: toNumber(record.id),
    name: firstString(record.name, record.nameAlias),
    title: firstString(record.title, "未命名话题"),
    description: firstString(record.description),
    cover: firstString(record.cover),
    postCount,
    memberCount: toNumber(record.memberCount),
    heatText: formatCount(postCount),
  }
}

function normalizeUserTitle(value: unknown): CircleUserTitle | null {
  const record = normalizeRecord(value)
  const title = firstString(record.title)
  if (!title) return null
  return {
    title,
    bgColor: normalizeColor(firstString(record.bgColor, record.titleBgColor)) || "#2979ff",
  }
}

async function requestCircle(
  method: "GET" | "POST",
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
    const message = firstString(body.msg, body.message, response.errMsg, `圈子接口请求失败(${bodyCode})`)
    if (bodyCode === 401 || bodyCode === 402) {
      throw new XycloudApiError(message, {
        code: bodyCode,
        payload: data,
        response,
      })
    }
    throw new CircleApiError(message, {
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
    .map(([key, value]) => [key, normalizeQueryValue(value)])
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

function parseUploadResponseData(value: unknown): unknown {
  if (typeof value !== "string") return value
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

function normalizeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function normalizeStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    try {
      return normalizeStringArray(JSON.parse(value))
    } catch {
      return value ? [value] : []
    }
  }
  return normalizeArray(value).map((item) => String(item || "").trim()).filter(Boolean)
}

function normalizeNumberArray(value: unknown): number[] {
  if (typeof value === "string") {
    return value.split(",").map((item) => toNumber(item)).filter((item) => item > 0)
  }
  return normalizeArray(value).map((item) => toNumber(item)).filter((item) => item > 0)
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

function normalizeColor(value: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : ""
}

function formatCount(value: number): string {
  if (value >= 10000) return `${(value / 10000).toFixed(1).replace(/\.0$/, "")}万`
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`
  return String(Math.max(0, value))
}

function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return ""
  const now = Math.floor(Date.now() / 1000)
  const diff = Math.max(0, now - timestamp)
  if (diff < 60) return "刚刚"
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  if (diff < 172800) return "昨天"
  const date = new Date(timestamp * 1000)
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${month}-${day}`
}
