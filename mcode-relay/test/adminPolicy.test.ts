import request from "supertest"
import { describe, expect, it } from "vitest"
import type { RelayConfig } from "../src/config.js"
import { PairingStore } from "../src/pairing/store.js"
import { buildRelayApp } from "../src/server.js"
import { RelayHub } from "../src/tunnel/hub.js"

const OWNER_TOKEN = "owner-secret"
const AUDITOR_TOKEN = "audit-secret"
const OPS_TOKEN = "ops-secret"

function config(overrides: Partial<RelayConfig> = {}): RelayConfig {
  return {
    PORT: 0,
    HOST: "127.0.0.1",
    JWT_SECRET: "test-secret",
    PAIRING_CODE_TTL_SECONDS: 300,
    ACCESS_TOKEN_TTL_SECONDS: 60,
    REFRESH_TOKEN_TTL_SECONDS: 120,
    GATEWAY_NAME: "Policy Gateway",
    PUBLIC_BASE_URL: "https://gateway.example.com",
    GATEWAY_PROVIDER: "custom",
    DEPLOYMENT_ENV: "development",
    LOG_POLICY: "standard",
    AUDIT_POLICY: "external",
    AUDIT_EVENT_LIMIT: 1000,
    AUDIT_WEBHOOK_URL: "",
    AUDIT_WEBHOOK_SECRET: "",
    AUDIT_WEBHOOK_TIMEOUT_MS: 3000,
    ACCESS_POLICY: "token-role",
    ADMIN_TOKEN: OWNER_TOKEN,
    ADMIN_TOKEN_ROLES: JSON.stringify({
      [OWNER_TOKEN]: { role: "owner" },
      [AUDITOR_TOKEN]: { role: "auditor", tenantId: "tenant-a" },
      [OPS_TOKEN]: { role: "admin", tenantId: "tenant-b" },
    }),
    ADMIN_CREDENTIAL_STORE_PATH: "",
    PAIRING_STORE_PATH: "",
    REPLAY_STORE_PATH: "",
    ALLOW_DEV_SECRETS: true,
    ...overrides,
  }
}

async function appFor(configOverrides: Partial<RelayConfig> = {}) {
  const store = new PairingStore()
  const hub = new RelayHub()
  seedStore(store)
  const app = await buildRelayApp({
    config: config(configOverrides),
    store,
    hub,
  })
  await app.ready()
  return { app, store }
}

function seedStore(store: PairingStore): void {
  store.upsertTenant({ tenantId: "tenant-a", tenantName: "Tenant A" })
  store.upsertTenant({ tenantId: "tenant-b", tenantName: "Tenant B" })
  store.upsertTarget({
    targetId: "desktop-a",
    tenantId: "tenant-a",
    targetAgent: "mcode-desktop",
    targetName: "Desktop A",
    protocolVersion: "1",
  })
  store.upsertTarget({
    targetId: "desktop-b",
    tenantId: "tenant-b",
    targetAgent: "mcode-desktop",
    targetName: "Desktop B",
    protocolVersion: "1",
  })
  store.createSession("desktop-a", { deviceName: "Phone A" })
  store.createSession("desktop-b", { deviceName: "Phone B" })
  store.addAuditEvent({ type: "session.created", tenantId: "tenant-a", targetId: "desktop-a" })
  store.addAuditEvent({ type: "session.created", tenantId: "tenant-b", targetId: "desktop-b" })
}

describe("admin policy", () => {
  it("allows owner tokens to manage tenants devices and audit reads", async () => {
    const { app } = await appFor()

    const tenant = await request(app.server)
      .post("/v1/admin/tenants")
      .set("x-mcode-admin-token", OWNER_TOKEN)
      .send({ tenantId: "tenant-c", tenantName: "Tenant C" })
    const moved = await request(app.server)
      .post("/v1/admin/devices/desktop-a/tenant")
      .set("x-mcode-admin-token", OWNER_TOKEN)
      .send({ tenantId: "tenant-c" })
    const audit = await request(app.server)
      .get("/v1/admin/audit-events")
      .set("x-mcode-admin-token", OWNER_TOKEN)

    await app.close()

    expect(tenant.status).toBe(200)
    expect(moved.status).toBe(200)
    expect(moved.body.target).toMatchObject({ targetId: "desktop-a", tenantId: "tenant-c" })
    expect(audit.status).toBe(200)
    expect(audit.body.events.length).toBeGreaterThan(0)
  })

  it("allows auditors to read their tenant and blocks mutations", async () => {
    const { app } = await appFor()

    const devices = await request(app.server)
      .get("/v1/admin/devices")
      .set("x-mcode-admin-token", AUDITOR_TOKEN)
    const crossTenant = await request(app.server)
      .get("/v1/admin/devices")
      .query({ tenantId: "tenant-b" })
      .set("x-mcode-admin-token", AUDITOR_TOKEN)
    const mutation = await request(app.server)
      .post("/v1/admin/devices/desktop-a/revoke")
      .set("x-mcode-admin-token", AUDITOR_TOKEN)
      .send({ reason: "blocked" })

    await app.close()

    expect(devices.status).toBe(200)
    expect(devices.body.devices).toEqual([
      expect.objectContaining({ targetId: "desktop-a", tenantId: "tenant-a" }),
    ])
    expect(crossTenant.status).toBe(403)
    expect(crossTenant.body.error).toBe("forbidden")
    expect(mutation.status).toBe(403)
    expect(mutation.body.reason).toContain("read-only")
  })

  it("allows tenant admins to mutate their tenant and blocks cross-tenant access", async () => {
    const { app } = await appFor()

    const ownMutation = await request(app.server)
      .post("/v1/admin/devices/desktop-b/revoke")
      .set("x-mcode-admin-token", OPS_TOKEN)
      .send({ reason: "tenant admin" })
    const ownDevices = await request(app.server)
      .get("/v1/admin/devices")
      .set("x-mcode-admin-token", OPS_TOKEN)
    const crossTenant = await request(app.server)
      .post("/v1/admin/devices/desktop-a/revoke")
      .set("x-mcode-admin-token", OPS_TOKEN)
      .send({ reason: "blocked" })

    await app.close()

    expect(ownMutation.status).toBe(200)
    expect(ownDevices.status).toBe(200)
    expect(ownDevices.body.devices).toEqual([
      expect.objectContaining({ targetId: "desktop-b", tenantId: "tenant-b" }),
    ])
    expect(crossTenant.status).toBe(403)
    expect(crossTenant.body.reason).toContain("other tenants")
  })
})
