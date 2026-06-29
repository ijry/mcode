import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import request from "supertest"
import { afterEach, describe, expect, it } from "vitest"
import type { RelayConfig } from "../src/config.js"
import {
  AdminCredentialStore,
  JsonFileAdminCredentialStoreStorage,
  toSafeAdminCredentialRecord,
} from "../src/admin/credentials.js"
import { sha256Hex } from "../src/auth/tokens.js"
import { PairingStore } from "../src/pairing/store.js"
import { buildRelayApp } from "../src/server.js"
import { RelayHub } from "../src/tunnel/hub.js"

const OWNER_TOKEN = "owner-secret"

function config(overrides: Partial<RelayConfig> = {}): RelayConfig {
  return {
    PORT: 0,
    HOST: "127.0.0.1",
    JWT_SECRET: "test-secret",
    PAIRING_CODE_TTL_SECONDS: 300,
    ACCESS_TOKEN_TTL_SECONDS: 60,
    REFRESH_TOKEN_TTL_SECONDS: 120,
    GATEWAY_NAME: "Credential Gateway",
    PUBLIC_BASE_URL: "https://gateway.example.com",
    GATEWAY_PROVIDER: "custom",
    DEPLOYMENT_ENV: "production",
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
    }),
    ADMIN_CREDENTIAL_STORE_PATH: "",
    PAIRING_STORE_PATH: "",
    REPLAY_STORE_PATH: "",
    ALLOW_DEV_SECRETS: false,
    ...overrides,
  }
}

async function appFor(configOverrides: Partial<RelayConfig> = {}) {
  const cfg = config(configOverrides)
  const adminCredentialStore = new AdminCredentialStore(
    cfg.ADMIN_CREDENTIAL_STORE_PATH
      ? new JsonFileAdminCredentialStoreStorage(cfg.ADMIN_CREDENTIAL_STORE_PATH)
      : null
  )
  const store = new PairingStore(null, { auditEventLimit: cfg.AUDIT_EVENT_LIMIT })
  store.upsertTenant({ tenantId: "tenant-a", tenantName: "Tenant A" })
  const app = await buildRelayApp({
    config: cfg,
    store,
    hub: new RelayHub(),
    adminCredentialStore,
  })
  await app.ready()
  return { app, store, adminCredentialStore }
}

describe("admin credential store", () => {
  let tempDir: string | null = null

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true })
      tempDir = null
    }
  })

  it("creates hashed credentials and exposes only safe records", () => {
    const store = new AdminCredentialStore()
    const created = store.createCredential({
      role: "admin",
      tenantId: "tenant-a",
      label: "Tenant operator",
    })

    expect(created.token).toMatch(/^mca_/)
    expect(created.record.tokenHash).toBe(sha256Hex(created.token))
    expect(created.record.tokenHash).not.toBe(created.token)
    expect(store.resolveToken(created.token)?.credentialId).toBe(created.record.credentialId)
    expect(toSafeAdminCredentialRecord(created.record)).not.toHaveProperty("tokenHash")
  })

  it("revokes credentials and restores json snapshots", () => {
    tempDir = mkdtempSync(join(tmpdir(), "mcode-admin-credentials-"))
    const storePath = join(tempDir, "credentials.json")
    const storage = new JsonFileAdminCredentialStoreStorage(storePath)
    const store = new AdminCredentialStore(storage)
    const created = store.createCredential({ role: "auditor", tenantId: "tenant-a" })

    expect(store.resolveToken(created.token)).toBeTruthy()
    store.revokeCredential(created.record.credentialId, "rotation")
    expect(store.resolveToken(created.token)).toBeNull()

    const restored = new AdminCredentialStore(new JsonFileAdminCredentialStoreStorage(storePath))
    const restoredRecord = restored.listCredentials()[0]
    expect(restoredRecord).toMatchObject({
      credentialId: created.record.credentialId,
      role: "auditor",
      tenantId: "tenant-a",
      revokeReason: "rotation",
    })
    expect(restored.resolveToken(created.token)).toBeNull()
  })
})

describe("admin credential api", () => {
  it("lets owners create list and revoke dynamic credentials", async () => {
    const { app, store } = await appFor()

    const created = await request(app.server)
      .post("/v1/admin/credentials")
      .set("x-mcode-admin-token", OWNER_TOKEN)
      .send({ role: "admin", tenantId: "tenant-a", label: "Tenant A admin" })
    const token = created.body.token
    const ownDevices = await request(app.server)
      .get("/v1/admin/devices")
      .set("x-mcode-admin-token", token)
    const listed = await request(app.server)
      .get("/v1/admin/credentials")
      .set("x-mcode-admin-token", OWNER_TOKEN)
    const revoked = await request(app.server)
      .post(`/v1/admin/credentials/${created.body.credential.credentialId}/revoke`)
      .set("x-mcode-admin-token", OWNER_TOKEN)
      .send({ reason: "rotated" })
    const blocked = await request(app.server)
      .get("/v1/admin/devices")
      .set("x-mcode-admin-token", token)

    await app.close()

    expect(created.status).toBe(200)
    expect(token).toMatch(/^mca_/)
    expect(created.body.credential).toMatchObject({
      role: "admin",
      tenantId: "tenant-a",
      label: "Tenant A admin",
    })
    expect(JSON.stringify(created.body.credential)).not.toContain(token)
    expect(JSON.stringify(created.body.credential)).not.toContain(sha256Hex(token))
    expect(ownDevices.status).toBe(200)
    expect(listed.status).toBe(200)
    expect(JSON.stringify(listed.body)).not.toContain(token)
    expect(JSON.stringify(listed.body)).not.toContain(sha256Hex(token))
    expect(revoked.status).toBe(200)
    expect(revoked.body.credential.revokedAt).toBeTruthy()
    expect(blocked.status).toBe(401)
    expect(store.listAuditEvents().map((event) => event.type)).toEqual(
      expect.arrayContaining(["admin_credential.created", "admin_credential.revoked"])
    )
    expect(JSON.stringify(store.listAuditEvents())).not.toContain(token)
    expect(JSON.stringify(store.listAuditEvents())).not.toContain(sha256Hex(token))
  })

  it("blocks non-owner credentials from managing credentials", async () => {
    const { app } = await appFor()
    const created = await request(app.server)
      .post("/v1/admin/credentials")
      .set("x-mcode-admin-token", OWNER_TOKEN)
      .send({ role: "auditor", tenantId: "tenant-a", label: "Tenant A auditor" })

    const listed = await request(app.server)
      .get("/v1/admin/credentials")
      .set("x-mcode-admin-token", created.body.token)
    const mutation = await request(app.server)
      .post("/v1/admin/credentials")
      .set("x-mcode-admin-token", created.body.token)
      .send({ role: "admin", tenantId: "tenant-a" })

    await app.close()

    expect(created.status).toBe(200)
    expect(listed.status).toBe(403)
    expect(mutation.status).toBe(403)
  })

  it("rejects tenant scoped credentials without tenant id", async () => {
    const { app } = await appFor()

    const res = await request(app.server)
      .post("/v1/admin/credentials")
      .set("x-mcode-admin-token", OWNER_TOKEN)
      .send({ role: "admin" })

    await app.close()

    expect(res.status).toBe(400)
    expect(res.body.error).toContain("tenantId")
  })
})
