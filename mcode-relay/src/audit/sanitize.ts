import type { AuditEventRecord } from "../pairing/store.js"

export function sanitizeAuditEvent(event: AuditEventRecord): AuditEventRecord {
  return {
    ...event,
    metadata: sanitizeAuditMetadata(event.metadata) as Record<string, unknown>,
  }
}

export function sanitizeAuditMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeAuditMetadata(item))
  if (!value || typeof value !== "object") return value
  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    result[key] = isSensitiveAuditKey(key) ? "[redacted]" : sanitizeAuditMetadata(item)
  }
  return result
}

function isSensitiveAuditKey(key: string): boolean {
  return /token|secret|authorization|password/i.test(key)
}
