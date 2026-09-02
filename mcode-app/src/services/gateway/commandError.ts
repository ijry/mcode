/**
 * 网关命令失败时抛出的**类型化**错误。
 *
 * ## 为什么需要它
 *
 * 两个 gateway 原来在 `statusCode >= 400` 时抛
 * `new Error(\`${command}: ${toResponseErrorMessage(res.data, statusCode)}\`)`。
 * 那个函数走 `pickNestedMessage`，把响应体里的 `detail` / `message` 挑出来变成一句
 * 人话 —— 于是服务端 `AppCommandError` 的 `code` / `i18n_key` / `i18n_params` 在
 * **第一步**就永久蒸发了，后面任何层级都无法还原。
 *
 * 而仓库面板有三个**可恢复**的失败必须按 key 分支（`Forge.errors.noAccount` /
 * `unsupportedHost` / `wrongForge`，全部 HTTP 422），恢复动作各不相同：一个是
 * 「去添加账号」，一个是「换个项目」，一个是「静默重试」。靠匹配英文 message 子串
 * 做不到 —— Rust 侧的注释明说判别符是 key 而不是 code（`configuration_missing`
 * 被多种失败共用，死 token 与无账号会撞同一个 code），认错的代价是 token 过期时
 * 给用户一颗「添加账号」按钮，他加完发现问题一点没变。
 *
 * ## 兼容性
 *
 * `GatewayCommandError extends Error`，且 `message` 与改动前**逐字节相同**，所以
 * 既有的 `error instanceof Error`、`error.message`、`toErrorMessage(error)` 三种读法
 * 全部照旧。只有需要结构的调用方才去看 `.app`。
 *
 * 服务端形状见 `codeg-plus/src-tauri/src/app_error.rs`：
 * `{code, message, detail?, i18n_key?, i18n_params?}`；状态码映射在
 * `web/handlers/error.rs`（forge 那三个是 422）。
 */

export interface AppCommandErrorBody {
  /** 服务端的错误分类（`configuration_missing` / `invalid_input` / …）。 */
  code: string
  message: string
  detail: string | null
  /**
   * i18n 键。**这是唯一可靠的判别符** —— 只有服务端认为「用户能对此做点什么」的
   * 失败才带 key，其余为 null。
   */
  i18n_key: string | null
  /** key 的插值参数（forge 那三个带 `host`，两个带 `provider`）。 */
  i18n_params: Record<string, string> | null
}

export class GatewayCommandError extends Error {
  readonly command: string
  readonly statusCode: number
  /** 解析成功的 `AppCommandError`；不是这个形状时为 null（下载端点、代理层的错误等）。 */
  readonly app: AppCommandErrorBody | null
  /** 原始响应体，兜底用。 */
  readonly body: unknown

  constructor(params: {
    command: string
    statusCode: number
    message: string
    body: unknown
  }) {
    super(params.message)
    this.name = "GatewayCommandError"
    this.command = params.command
    this.statusCode = params.statusCode
    this.body = params.body
    this.app = parseAppCommandError(params.body)
  }
}

/**
 * 把响应体解析成 `AppCommandError`，形状不对就返回 null。
 *
 * 判据是**同时**有 `code` 与 `message` 两个字符串字段 —— 只看其中一个会把
 * relay 层的失败（`{code: "target_offline"}`，没有 message）也认成服务端错误，
 * 而那两者的恢复动作完全不同。
 */
export function parseAppCommandError(body: unknown): AppCommandErrorBody | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null
  const raw = body as Record<string, unknown>
  const code = typeof raw.code === "string" ? raw.code.trim() : ""
  const message = typeof raw.message === "string" ? raw.message.trim() : ""
  if (!code || !message) return null
  return {
    code,
    message,
    detail: typeof raw.detail === "string" && raw.detail.trim() ? raw.detail.trim() : null,
    i18n_key:
      typeof raw.i18n_key === "string" && raw.i18n_key.trim() ? raw.i18n_key.trim() : null,
    i18n_params: normalizeParams(raw.i18n_params),
  }
}

/**
 * 从任意 error 里取出结构化部分。
 *
 * 调用方通常只有一个 `unknown`（catch 到的东西），而链路上可能包了一层 —— 所以
 * 这里也看 `cause`。取不到就是 null，调用方退回 `toErrorMessage`。
 */
export function extractAppCommandError(error: unknown): AppCommandErrorBody | null {
  if (error instanceof GatewayCommandError) return error.app
  if (error && typeof error === "object") {
    const cause = (error as { cause?: unknown }).cause
    if (cause instanceof GatewayCommandError) return cause.app
  }
  return null
}

/** i18n 参数只保留字符串值 —— 它们要进文案模板，一个对象插值进去是 `[object Object]`。 */
function normalizeParams(input: unknown): Record<string, string> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null
  const result: Record<string, string> = {}
  Object.entries(input as Record<string, unknown>).forEach(([key, value]) => {
    if (typeof value === "string") result[key] = value
    else if (typeof value === "number" || typeof value === "boolean") result[key] = String(value)
  })
  return Object.keys(result).length > 0 ? result : null
}
