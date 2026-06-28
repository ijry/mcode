import { describeGatewayFailureCode } from "./relayRecovery"

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null
}

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function extractStatusCode(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value)
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed)
  }
  return null
}

function pickNestedMessage(value: unknown, seen = new Set<unknown>()): string | null {
  if (seen.has(value)) return null
  if (value && (typeof value === "object" || typeof value === "string")) {
    seen.add(value)
  }

  const direct = normalizeString(value)
  if (direct) {
    const parsed = tryParseJson(direct)
    if (parsed && parsed !== value) {
      const nested = pickNestedMessage(parsed, seen)
      if (nested) return nested
    }
    const statusCode = extractStatusCode(direct)
    if (statusCode && statusCode >= 100 && statusCode <= 599) {
      return `HTTP ${statusCode}`
    }
    return direct
  }

  const record = asObject(value)
  if (!record) return null

  const classified = describeGatewayFailureCode(record.code)
  if (classified) return classified

  const nestedCandidates = [
    record.detail,
    record.message,
    record.errMsg,
    record.error,
    record.cause,
    record.data,
    record.response,
    record.body,
  ]
  for (const candidate of nestedCandidates) {
    const nested = pickNestedMessage(candidate, seen)
    if (nested) return nested
  }

  const statusCode =
    extractStatusCode(record.statusCode) ??
    extractStatusCode(record.status) ??
    extractStatusCode(record.code)
  if (statusCode) {
    return `HTTP ${statusCode}`
  }

  return null
}

export function toErrorMessage(error: unknown, fallback = "请求失败"): string {
  if (error instanceof Error) {
    const nested = pickNestedMessage(error.message)
    if (nested) return nested
    const cause = (error as { cause?: unknown }).cause
    if (cause !== undefined) {
      const causeMessage = pickNestedMessage(cause)
      if (causeMessage) return causeMessage
    }
  }

  const message = pickNestedMessage(error)
  if (message) return message

  try {
    const serialized = JSON.stringify(error)
    if (serialized && serialized !== "{}") {
      return serialized
    }
  } catch {
    // ignore
  }

  return fallback
}

export function toResponseErrorMessage(body: unknown, statusCode: number): string {
  const message = pickNestedMessage(body)
  if (message) {
    if (/^HTTP \d+$/.test(message) && statusCode >= 400) {
      return `HTTP ${statusCode}`
    }
    return message
  }
  return `HTTP ${statusCode}`
}
