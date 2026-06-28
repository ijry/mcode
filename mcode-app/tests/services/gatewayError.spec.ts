import { toErrorMessage, toResponseErrorMessage } from "@/services/gateway/error"

describe("gateway error normalization", () => {
  it("surfaces backend detail for HTTP 429 save failures", () => {
    expect(
      toResponseErrorMessage(
        {
          code: "rate_limited",
          message: "Too Many Requests",
          detail: "保存过于频繁，请稍后再试",
        },
        429
      )
    ).toBe("保存过于频繁，请稍后再试")
  })

  it("unwraps JSON-stringified command errors", () => {
    expect(
      toErrorMessage(
        new Error(
          JSON.stringify({
            code: "rate_limited",
            message: "Too Many Requests",
            detail: "请求过于频繁，请稍后重试",
          })
        )
      )
    ).toBe("请求过于频繁，请稍后重试")
  })

  it("falls back to explicit HTTP status when no backend message exists", () => {
    expect(toResponseErrorMessage({}, 423)).toBe("HTTP 423")
    expect(toResponseErrorMessage({ statusCode: 429 }, 429)).toBe("HTTP 429")
    expect(toErrorMessage({ response: { status: 429 } })).toBe("HTTP 429")
    expect(toErrorMessage("429")).toBe("HTTP 429")
  })

  it("maps classified gateway failure codes before generic message", () => {
    expect(toResponseErrorMessage({ code: "target_offline", message: "target offline" }, 503))
      .toContain("Desktop")
    expect(toResponseErrorMessage({ code: "session_revoked", message: "revoked" }, 401))
      .toContain("重新配对")
    expect(toErrorMessage(new Error(JSON.stringify({ code: "request_timeout", message: "timeout" }))))
      .toContain("重试")
  })
})
