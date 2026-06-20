const XYCLOUD_BASE_URL_KEY = "__XYCLOUD_BASE_URL__"
export const XYCLOUD_DEFAULT_BASE_URL = "https://getmcode.lingyun.net/api"

export interface XycloudUserInfo {
  name?: string
  email?: string
  mobile?: string
  avatar?: string
  [key: string]: unknown
}

export interface XycloudSession {
  token: string
  userInfo: XycloudUserInfo | null
}

export interface XycloudSafetyVerifyPayload {
  emailVerify?: string
  emailToken?: string
  mobileVerify?: string
  mobileToken?: string
  gauth?: string
  paypwd?: string
  password?: string
}

export interface XycloudLoginPayload {
  account: string
  password: string
  _verify?: XycloudSafetyVerifyPayload
}

export interface XycloudRegisterEmailPayload {
  email: string
  verify: string
  token: string
  password: string
  inviteCode?: string
  channelName?: string
  agreement: boolean
  _verify?: XycloudSafetyVerifyPayload
}

export interface XycloudRegisterMobilePayload {
  mobile: string
  verify: string
  token: string
  password: string
  inviteCode?: string
  channelName?: string
  agreement: boolean
  _verify?: XycloudSafetyVerifyPayload
}

export interface XycloudVerifySendPayload {
  title: string
  verifyUser?: number
}

export interface XycloudEmailVerifySendPayload extends XycloudVerifySendPayload {
  email?: string
}

export interface XycloudMobileVerifySendPayload extends XycloudVerifySendPayload {
  mobile?: string
}

export class XycloudApiError extends Error {
  code: number
  verifyList: string[]
  payload: unknown
  response: unknown

  constructor(message: string, options: {
    code: number
    verifyList?: string[]
    payload?: unknown
    response?: unknown
  }) {
    super(message)
    this.name = "XycloudApiError"
    this.code = options.code
    this.verifyList = options.verifyList ?? []
    this.payload = options.payload
    this.response = options.response
  }
}

export function setXycloudBaseUrl(baseUrl: string) {
  const runtime = globalThis as Record<string, unknown>
  const normalized = normalizeBaseUrl(baseUrl)
  if (normalized) {
    runtime[XYCLOUD_BASE_URL_KEY] = normalized
    return normalized
  }
  delete runtime[XYCLOUD_BASE_URL_KEY]
  return ""
}

export function resolveXycloudBaseUrl(): string {
  const runtime = globalThis as Record<string, unknown>
  const stored = runtime[XYCLOUD_BASE_URL_KEY]
  if (typeof stored === "string") {
    const override = normalizeBaseUrl(stored)
    if (override) return override
  }
  return XYCLOUD_DEFAULT_BASE_URL
}

export async function login(payload: XycloudLoginPayload): Promise<XycloudSession> {
  const data = await requestXycloud<unknown>("/v1/core/user/login", payload)
  return normalizeSession(data)
}

export async function registerEmail(payload: XycloudRegisterEmailPayload): Promise<XycloudSession> {
  const data = await requestXycloud<unknown>("/v1/reg_email/user/register", payload)
  return normalizeSession(data)
}

export async function registerMobile(payload: XycloudRegisterMobilePayload): Promise<XycloudSession> {
  const data = await requestXycloud<unknown>("/v1/reg_mobile/user/register", payload)
  return normalizeSession(data)
}

export async function sendEmailVerifyCode(payload: XycloudEmailVerifySendPayload): Promise<{ token?: string }> {
  const data = await requestXycloud<unknown>("/v1/email/verify/send", {
    email: payload.email ?? "",
    title: payload.title,
    verifyUser: payload.verifyUser ?? 0,
  })
  return normalizeTokenPayload(data)
}

export async function sendMobileVerifyCode(payload: XycloudMobileVerifySendPayload): Promise<{ token?: string }> {
  const data = await requestXycloud<unknown>("/v1/sms/verify/send", {
    mobile: payload.mobile ?? "",
    title: payload.title,
    verifyUser: payload.verifyUser ?? 0,
  })
  return normalizeTokenPayload(data)
}

async function requestXycloud<T>(path: string, payload: unknown): Promise<T> {
  const url = resolveRequestUrl(path)
  if (!url) {
    throw new XycloudApiError("请先配置 Xycloud 后端地址", {
      code: 500,
      response: null,
      payload,
    })
  }

  const response = (await uni.request({
    url,
    method: "POST",
    data: normalizeRequestData(payload),
    header: {
      "content-type": "application/json",
    },
  })) as {
    statusCode?: number
    data?: unknown
    errMsg?: string
  }

  const statusCode = normalizeCode(response.statusCode)
  const body = normalizeObject(response.data)
  const bodyCode = normalizeCode(body.code ?? statusCode)

  if (bodyCode !== 200) {
    const verifyList = extractVerifyList(body)
    const message = firstString(body.msg, body.message, response.errMsg, `请求失败(${bodyCode})`)
    throw new XycloudApiError(message, {
      code: bodyCode,
      verifyList,
      payload,
      response,
    })
  }

  const responseData = typeof body.data === "undefined" ? body : body.data
  return responseData as T
}

function resolveRequestUrl(path: string): string {
  const baseUrl = resolveXycloudBaseUrl()
  const cleanPath = `/${String(path || "").trim().replace(/^\/+/, "")}`
  if (!baseUrl) return ""
  return `${baseUrl}${cleanPath}`
}

function normalizeBaseUrl(baseUrl: string): string {
  return String(baseUrl || "").trim().replace(/\/+$/, "")
}

function normalizeCode(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value)
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed)
    }
  }
  return 0
}

function normalizeObject(value: unknown): Record<string, any> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, any>
  }
  return {}
}

function normalizeRequestData(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function normalizeSession(data: unknown): XycloudSession {
  const payload = normalizeObject(data)
  const token = firstString(payload.token, payload.accessToken, payload.authToken)
  const userInfo = normalizeUserInfo(payload.userInfo ?? payload.user ?? payload.profile)
  return {
    token,
    userInfo,
  }
}

function normalizeUserInfo(value: unknown): XycloudUserInfo | null {
  if (!value) return null
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      return normalizeUserInfo(parsed)
    } catch {
      return null
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as XycloudUserInfo
  }
  return null
}

function normalizeTokenPayload(data: unknown): { token?: string } {
  const payload = normalizeObject(data)
  const token = firstString(payload.token, payload.verifyToken, payload.data?.token)
  return token ? { token } : {}
}

function extractVerifyList(body: Record<string, any>): string[] {
  const candidate = body.data?.verifyList ?? body.verifyList ?? body.data?.dataList ?? body.dataList
  if (!Array.isArray(candidate)) return []
  return candidate.map((item) => String(item)).filter(Boolean)
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  }
  return ""
}
