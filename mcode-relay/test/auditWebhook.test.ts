import request from "supertest"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { RelayConfig } from "../src/config.js"
import { sanitizeAuditEvent } from "../src/audit/sanitize.js"
import { AuditWebhookSink } from "../src/audit/webhookSink.js"
import type { AuditEventRecord } from "../src/pairing/store.js"
import { PairingStore } from "../src/pairing/store.js"
import { buildRelayApp } from "../src/server.js"
import { RelayHub } from "../src/tunnel/hub.js"

const ADMIN_TOKEN = "admin-secret"

function config(overrides: Partial<RelayConfig> = {}): RelayConfig {
  return {
    PORT: 0,
    HOST: "127.0.0.1",
    JWT_SECRET: "test-secret",
    PAIRING_CODE_TTL_SECONDS: 300,
    ACCESS_TOKEN_TTL_SECONDS: 60,
    REFRESH_TOKEN_TTL_SECONDS: 120,
    GATEWAY_NAME: "Audit Webhook Gateway",
    PUBLIC_BASE_URL: "https://gateway.example.com",
    GATEWAY_PROVIDER: "custom",
    DEPLOYMENT_ENV: "production",
    LOG_POLICY: "standard",
    AUDIT_POLICY: "external",
    AUDIT_EVENT_LIMIT: 1000,
    AUDIT_WEBHOOK_URL: "",
    AUDIT_WEBHOOK_SECRET: "",
    AUDIT_WEBHOOK_TIMEOUT_MS: 3000,
    ACCESS_POLICY: "allow-all",
    ADMIN_TOKEN,
    ADMIN_TOKEN_ROLES: "",
    PAIRING_STORE_PATH: "",
    REPLAY_STORE_PATH: "",
    ALLOW_DEV_SECRETS: false,
    ...overrides,
  }
}

async function appFor(configOverrides: Partial<RelayConfig> = {}) {
  const cfg = config(configOverrides)
  const auditWebhookSink = new AuditWebhookSink(cfg)
  const app = await buildRelayApp({
    config: cfg,
    store: new PairingStore(null, { auditEventLimit: cfg.AUDIT_EVENT_LIMIT }),
    hub: new RelayHub(),
    auditWebhookSink,
  })
  await app.ready()
  return { app, auditWebhookSink }
}

function waitForAsyncDelivery(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe("audit webhook sink", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("posts sanitized audit events to the configured webhook", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 })
    )
    const { app, auditWebhookSink } = await appFor({
      AUDIT_WEBHOOK_URL: "https://audit.example.com/sink",
      AUDIT_WEBHOOK_SECRET: "shared-secret",
    })

    const res = await request(app.server)
      .post("/v1/admin/tenants")
      .set("x-mcode-admin-token", ADMIN_TOKEN)
      .send({ tenantId: "tenant-a", tenantName: "Tenant A" })
    await waitForAsyncDelivery()
    await app.close()

    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://audit.example.com/sink",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json",
          "x-mcode-audit-secret": "shared-secret",
        }),
      })
    )
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(String((init as RequestInit).body))
    expect(body.event).toMatchObject({
      type: "tenant.upserted",
      tenantId: "tenant-a",
      actor: "admin",
    })
    expect(auditWebhookSink.getStatus()).toMatchObject({
      enabled: true,
      deliveredCount: 1,
      failedCount: 0,
    })
  })

  it("does not call fetch when webhook URL is empty", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 })
    )
    const { app, auditWebhookSink } = await appFor()

    const res = await request(app.server)
      .post("/v1/admin/tenants")
      .set("x-mcode-admin-token", ADMIN_TOKEN)
      .send({ tenantId: "tenant-a" })
    await waitForAsyncDelivery()
    await app.close()

    expect(res.status).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(auditWebhookSink.getStatus()).toMatchObject({
      enabled: false,
      deliveredCount: 0,
      failedCount: 0,
    })
  })

  it("does not block API responses when webhook delivery fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"))
    const { app, auditWebhookSink } = await appFor({
      AUDIT_WEBHOOK_URL: "https://audit.example.com/sink",
    })

    const res = await request(app.server)
      .post("/v1/admin/tenants")
      .set("x-mcode-admin-token", ADMIN_TOKEN)
      .send({ tenantId: "tenant-a" })
    await waitForAsyncDelivery()
    await app.close()

    expect(res.status).toBe(200)
    expect(auditWebhookSink.getStatus()).toMatchObject({
      enabled: true,
      deliveredCount: 0,
      failedCount: 1,
      lastError: "network down",
    })
  })

  it("redacts sensitive metadata before delivery", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 })
    )
    const sink = new AuditWebhookSink(config({
      AUDIT_WEBHOOK_URL: "https://audit.example.com/sink",
    }))
    const event: AuditEventRecord = {
      eventId: "event-1",
      type: "session.created",
      tenantId: "tenant-a",
      targetId: "desktop-1",
      sessionId: "session-1",
      actor: "pair",
      message: null,
      createdAt: Date.now(),
      metadata: {
        accessToken: "secret-token",
        nested: {
          authorization: "Bearer secret",
          safe: "visible",
        },
      },
    }

    sink.deliver(sanitizeAuditEvent(event))
    await waitForAsyncDelivery()

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(String((init as RequestInit).body))
    expect(body.event.metadata.accessToken).toBe("[redacted]")
    expect(body.event.metadata.nested.authorization).toBe("[redacted]")
    expect(body.event.metadata.nested.safe).toBe("visible")
  })

  it("exposes safe diagnostics without leaking URL or secret", async () => {
    const { app } = await appFor({
      AUDIT_WEBHOOK_URL: "https://user:pass@audit.internal.example.com/sink",
      AUDIT_WEBHOOK_SECRET: "shared-secret",
    })

    const res = await request(app.server).get("/v1/gateway/info")
    await app.close()

    expect(res.status).toBe(200)
    expect(res.body.deployment.auditWebhook).toMatchObject({
      enabled: true,
      deliveredCount: 0,
      failedCount: 0,
    })
    const body = JSON.stringify(res.body)
    expect(body).not.toContain("audit.internal.example.com")
    expect(body).not.toContain("shared-secret")
    expect(body).not.toContain("user:pass")
  })
})
