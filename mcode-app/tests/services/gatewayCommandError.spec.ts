import {
  extractAppCommandError,
  GatewayCommandError,
  parseAppCommandError,
} from "@/services/gateway/commandError"
import { toErrorMessage } from "@/services/gateway/error"

/** 服务端 `AppCommandError` 的线上形状（`codeg-plus/src-tauri/src/app_error.rs`）。 */
const NO_ACCOUNT_BODY = {
  code: "configuration_missing",
  message: "no account configured for github.com",
  detail: null,
  i18n_key: "Forge.errors.noAccount",
  i18n_params: { host: "github.com", provider: "GitHub" },
}

describe("GatewayCommandError", () => {
  /**
   * **最重要的兼容性断言。** `message` 必须与改动前逐字节相同 —— 所有既有调用点
   * 都在读 `error.message` 或把它喂给 `toErrorMessage`，改了文案会让一批断言与
   * 一批用户可见的提示同时变。
   */
  it("keeps the message shape every existing caller reads", () => {
    const error = new GatewayCommandError({
      command: "forge_list_issues",
      statusCode: 422,
      message: "forge_list_issues: no account configured for github.com",
      body: NO_ACCOUNT_BODY,
    })
    expect(error.message).toBe("forge_list_issues: no account configured for github.com")
    expect(error instanceof Error).toBe(true)
    // `toErrorMessage` 对它的处理与对一个普通 Error 完全一样 —— 这是「既有调用点
    // 不受影响」的实际含义。
    expect(toErrorMessage(error)).toBe(
      toErrorMessage(new Error("forge_list_issues: no account configured for github.com"))
    )
  })

  /** 结构化部分要活下来 —— 这是整个改动的目的。 */
  it("preserves the structured body the string form loses", () => {
    const error = new GatewayCommandError({
      command: "forge_list_issues",
      statusCode: 422,
      message: "x",
      body: NO_ACCOUNT_BODY,
    })
    expect(error.app?.i18n_key).toBe("Forge.errors.noAccount")
    expect(error.app?.i18n_params).toEqual({ host: "github.com", provider: "GitHub" })
    expect(error.statusCode).toBe(422)
    expect(error.command).toBe("forge_list_issues")
  })
})

describe("parseAppCommandError", () => {
  it("reads a full error body", () => {
    expect(parseAppCommandError(NO_ACCOUNT_BODY)).toEqual(NO_ACCOUNT_BODY)
  })

  it("normalizes the optional fields to null", () => {
    const parsed = parseAppCommandError({ code: "invalid_input", message: "bad" })
    expect(parsed).toEqual({
      code: "invalid_input",
      message: "bad",
      detail: null,
      i18n_key: null,
      i18n_params: null,
    })
  })

  /**
   * 判据是**同时**有 code 与 message。只看其中一个会把 relay 层的失败
   * （`{code: "target_offline"}`，没有 message）也认成服务端错误 —— 而两者的恢复
   * 动作完全不同。
   */
  it("refuses a body that is not an AppCommandError", () => {
    expect(parseAppCommandError({ code: "target_offline" })).toBeNull()
    expect(parseAppCommandError({ message: "boom" })).toBeNull()
    expect(parseAppCommandError("Not Found")).toBeNull()
    expect(parseAppCommandError(null)).toBeNull()
    expect(parseAppCommandError([{ code: "a", message: "b" }])).toBeNull()
  })

  /** i18n 参数要进文案模板，一个对象插值进去是 `[object Object]`。 */
  it("keeps only stringifiable i18n params", () => {
    const parsed = parseAppCommandError({
      code: "c",
      message: "m",
      i18n_params: { host: "a.com", count: 3, ok: true, nested: { x: 1 } },
    })
    expect(parsed?.i18n_params).toEqual({ host: "a.com", count: "3", ok: "true" })
  })

  it("drops an empty params object rather than keeping a blank one", () => {
    expect(parseAppCommandError({ code: "c", message: "m", i18n_params: {} })?.i18n_params).toBeNull()
  })
})

describe("extractAppCommandError", () => {
  it("finds the body on a typed error", () => {
    const error = new GatewayCommandError({
      command: "c",
      statusCode: 422,
      message: "m",
      body: NO_ACCOUNT_BODY,
    })
    expect(extractAppCommandError(error)?.i18n_key).toBe("Forge.errors.noAccount")
  })

  /** 链路上可能包了一层，所以也看 cause。 */
  it("looks through a wrapping error's cause", () => {
    const inner = new GatewayCommandError({
      command: "c",
      statusCode: 422,
      message: "m",
      body: NO_ACCOUNT_BODY,
    })
    const outer = new Error("wrapped")
    ;(outer as any).cause = inner
    expect(extractAppCommandError(outer)?.i18n_key).toBe("Forge.errors.noAccount")
  })

  /** 取不到就是 null，调用方退回 `toErrorMessage` —— 不抛，不猜。 */
  it("returns null for a plain error", () => {
    expect(extractAppCommandError(new Error("boom"))).toBeNull()
    expect(extractAppCommandError("boom")).toBeNull()
    expect(extractAppCommandError(undefined)).toBeNull()
  })
})
