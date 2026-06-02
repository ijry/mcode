export function toErrorMessage(error: unknown, fallback = "请求失败"): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim()
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>
    const candidates = [
      record.detail,
      record.message,
      record.errMsg,
      record.error,
    ]
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim()
      }
    }
    try {
      const serialized = JSON.stringify(error)
      if (serialized && serialized !== "{}") {
        return serialized
      }
    } catch {
      // ignore
    }
  }

  return fallback
}

export function toResponseErrorMessage(
  body: unknown,
  statusCode: number
): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>
    const candidates = [
      record.detail,
      record.message,
      record.error,
      record.errMsg,
    ]
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim()
      }
    }
  }
  return `HTTP ${statusCode}`
}
