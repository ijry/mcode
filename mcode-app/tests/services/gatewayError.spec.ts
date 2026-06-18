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
    expect(toResponseErrorMessage({ statusCode: 429 }, 429)).toBe("HTTP 429")
    expect(toErrorMessage({ response: { status: 429 } })).toBe("HTTP 429")
    expect(toErrorMessage("429")).toBe("HTTP 429")
  })
})
