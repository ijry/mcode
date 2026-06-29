import request from "supertest"
import { describe, expect, it } from "vitest"
import type { RelayConfig } from "../src/config.js"
import { PairingStore } from "../src/pairing/store.js"
import { buildRelayApp } from "../src/server.js"
import { RelayHub } from "../src/tunnel/hub.js"

const OWNER_TOKEN = "owner-secret"
const AUDITOR_TOKEN = "audit-secret"

function config(overrides: Partial<RelayConfig> = {}): RelayConfig {
  return {
    PORT: 0,
    HOST: "127.0.0.1",
    JWT_SECRET: "test-secret",
    PAIRING_CODE_TTL_SECONDS: 300,
    ACCESS_TOKEN_TTL_SECONDS: 60,
    REFRESH_TOKEN_TTL_SECONDS: 120,
    GATEWAY_NAME: "Audit Gateway",
    PUBLIC_BASE_URL: "https://gateway.example.com",
    GATEWAY_PROVIDER: "custom",
    DEPLOYMENT_ENV: "development",
    LOG_POLICY: "standard",
    AUDIT_POLICY: "external",
    AUDIT_EVENT_LIMIT: 3,
    AUDIT_WEBHOOK_URL: "",
    AUDIT_WEBHOOK_SECRET: "",
    AUDIT_WEBHOOK_TIMEOUT_MS: 3000,
    ACCESS_POLICY: "token-role",
    ADMIN_TOKEN: OWNER_TOKEN,
    ADMIN_TOKEN_ROLES: JSON.stringify({
      [OWNER_TOKEN]: { role: "owner" },
      [AUDITOR_TOKEN]: { role: "auditor", tenantId: "tenant-a" },
    }),
    ADMIN_CREDENTIAL_STORE_PATH: "",
    PAIRING_STORE_PATH: "",
    REPLAY_STORE_PATH: "",
    ALLOW_DEV_SECRETS: true,
    ...overrides,
  }
}

async function appFor(configOverrides: Partial<RelayConfig> = {}) {
  const cfg = config(configOverrides)
  const store = new PairingStore(null, { auditEventLimit: cfg.AUDIT_EVENT_LIMIT })
  seedAuditEvents(store)
  const app = await buildRelayApp({
    config: cfg,
    store,
    hub: new RelayHub(),
  })
  await app.ready()
  return { app, store }
}

function seedAuditEvents(store: PairingStore): void {
  store.addAuditEvent({ type: "old.pruned", tenantId: "tenant-a" })
  store.addAuditEvent({
    type: "session.created",
    tenantId: "tenant-a",
    metadata: {
      accessToken: "secret-access",
      nested: { authorization: "Bearer secret", safe: "visible" },
    },
  })
  store.addAuditEvent({ type: "target.revoked", tenantId: "tenant-b" })
  store.addAuditEvent({ type: "session.refreshed", tenantId: "tenant-a" })
}

describe("audit export", () => {
  it("prunes audit events by configured retention limit", async () => {
    const { app, store } = await appFor()

    const res = await request(app.server)
      .get("/v1/admin/audit-events")
      .set("x-mcode-admin-token", OWNER_TOKEN)
      .query({ limit: 10 })

    await app.close()

    expect(store.getAuditEventLimit()).toBe(3)
    expect(res.status).toBe(200)
    expect(res.body.events.map((event: any) => event.type)).not.toContain("old.pruned")
    expect(res.body.events).toHaveLength(3)
  })

  it("exports tenant scoped JSON and redacts sensitive metadata", async () => {
    const { app } = await appFor()

    const res = await request(app.server)
      .get("/v1/admin/audit-events/export")
      .set("x-mcode-admin-token", AUDITOR_TOKEN)
      .query({ limit: 10 })

    await app.close()

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      format: "json",
      tenantId: "tenant-a",
      count: 2,
    })
    expect(res.body.events.map((event: any) => event.tenantId)).toEqual(["tenant-a", "tenant-a"])
    const created = res.body.events.find((event: any) => event.type === "session.created")
    expect(created.metadata.accessToken).toBe("[redacted]")
    expect(created.metadata.nested.authorization).toBe("[redacted]")
    expect(created.metadata.nested.safe).toBe("visible")
  })

  it("exports JSONL for owner queries", async () => {
    const { app } = await appFor()

    const res = await request(app.server)
      .get("/v1/admin/audit-events/export")
      .set("x-mcode-admin-token", OWNER_TOKEN)
      .query({ format: "jsonl", tenantId: "tenant-b", limit: 10 })

    await app.close()

    expect(res.status).toBe(200)
    expect(res.headers["content-type"]).toContain("application/x-ndjson")
    const lines = res.text.trim().split("\n")
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0])).toMatchObject({
      type: "target.revoked",
      tenantId: "tenant-b",
    })
  })

  it("blocks cross tenant audit export for tenant scoped auditors", async () => {
    const { app } = await appFor()

    const res = await request(app.server)
      .get("/v1/admin/audit-events/export")
      .set("x-mcode-admin-token", AUDITOR_TOKEN)
      .query({ tenantId: "tenant-b" })

    await app.close()

    expect(res.status).toBe(403)
    expect(res.body.error).toBe("forbidden")
  })
})
