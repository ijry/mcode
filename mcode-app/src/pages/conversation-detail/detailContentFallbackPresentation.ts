export type DetailContentFallbackCode = "none" | "loading" | "error" | "empty"

export type DetailContentFallbackPresentation =
  | { code: "none" | "loading" | "empty" }
  | { code: "error"; message: string }

export function resolveDetailContentFallbackPresentation(input: {
  hasRenderedMessages: boolean
  isWaitingForRuntime: boolean
  initialLoading: boolean
  loadErrorMessage?: string | null
}): DetailContentFallbackPresentation {
  if (input.hasRenderedMessages || input.isWaitingForRuntime) {
    return { code: "none" }
  }
  if (input.initialLoading) {
    return { code: "loading" }
  }

  const message = String(input.loadErrorMessage || "").trim()
  if (message) {
    return { code: "error", message }
  }
  return { code: "empty" }
}
