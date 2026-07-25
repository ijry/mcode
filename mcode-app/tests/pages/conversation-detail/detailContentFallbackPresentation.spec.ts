import {
  resolveDetailContentFallbackPresentation,
} from "@/pages/conversation-detail/detailContentFallbackPresentation"

describe("detailContentFallbackPresentation", () => {
  it("keeps existing messages and active runtime states ahead of content fallbacks", () => {
    expect(resolveDetailContentFallbackPresentation({
      hasRenderedMessages: true,
      isWaitingForRuntime: false,
      initialLoading: true,
      loadErrorMessage: "network failed",
    }).code).toBe("none")

    expect(resolveDetailContentFallbackPresentation({
      hasRenderedMessages: false,
      isWaitingForRuntime: true,
      initialLoading: true,
      loadErrorMessage: "network failed",
    }).code).toBe("none")
  })

  it("renders loading, error, and truly empty conversation states in order", () => {
    expect(resolveDetailContentFallbackPresentation({
      hasRenderedMessages: false,
      isWaitingForRuntime: false,
      initialLoading: true,
    })).toEqual({ code: "loading" })

    expect(resolveDetailContentFallbackPresentation({
      hasRenderedMessages: false,
      isWaitingForRuntime: false,
      initialLoading: false,
      loadErrorMessage: "请求超时",
    })).toEqual({ code: "error", message: "请求超时" })

    expect(resolveDetailContentFallbackPresentation({
      hasRenderedMessages: false,
      isWaitingForRuntime: false,
      initialLoading: false,
    })).toEqual({ code: "empty" })
  })
})
