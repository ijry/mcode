import type { RelayConfig } from "../config.js"
import type { AuditEventRecord } from "../pairing/store.js"

export interface AuditWebhookSinkStatus {
  enabled: boolean
  deliveredCount: number
  failedCount: number
  lastDeliveredAt: number | null
  lastErrorAt: number | null
  lastError: string | null
}

export class AuditWebhookSink {
  private readonly url: string
  private readonly secret: string
  private readonly timeoutMs: number
  private readonly status: AuditWebhookSinkStatus

  constructor(config: Pick<RelayConfig, "AUDIT_WEBHOOK_URL" | "AUDIT_WEBHOOK_SECRET" | "AUDIT_WEBHOOK_TIMEOUT_MS">) {
    this.url = config.AUDIT_WEBHOOK_URL.trim()
    this.secret = config.AUDIT_WEBHOOK_SECRET.trim()
    this.timeoutMs = Math.max(1, Math.trunc(config.AUDIT_WEBHOOK_TIMEOUT_MS))
    this.status = {
      enabled: this.url !== "",
      deliveredCount: 0,
      failedCount: 0,
      lastDeliveredAt: null,
      lastErrorAt: null,
      lastError: null,
    }
  }

  deliver(event: AuditEventRecord): void {
    if (!this.status.enabled) return
    void this.postEvent(event)
  }

  getStatus(): AuditWebhookSinkStatus {
    return { ...this.status }
  }

  private async postEvent(event: AuditEventRecord): Promise<void> {
    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
      }
      if (this.secret) {
        headers["x-mcode-audit-secret"] = this.secret
      }
      const response = await fetch(this.url, {
        method: "POST",
        headers,
        body: JSON.stringify({ event }),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
      if (!response.ok) {
        throw new Error(`webhook responded ${response.status}`)
      }
      this.status.deliveredCount += 1
      this.status.lastDeliveredAt = Date.now()
      this.status.lastError = null
    } catch (error) {
      this.status.failedCount += 1
      this.status.lastErrorAt = Date.now()
      this.status.lastError = error instanceof Error ? error.message : String(error)
    }
  }
}
