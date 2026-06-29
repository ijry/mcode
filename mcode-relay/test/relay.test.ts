import request from "supertest"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { buildRelayApp } from "../src/server.js"
import { PairingStore } from "../src/pairing/store.js"
import { RelayHub } from "../src/tunnel/hub.js"

async function createTestApp() {
  const store = new PairingStore()
  const hub = new RelayHub()
  const app = await buildRelayApp({
    config: {
      PORT: 0,
      HOST: "127.0.0.1",
      JWT_SECRET: "test-secret",
      PAIRING_CODE_TTL_SECONDS: 300,
      ACCESS_TOKEN_TTL_SECONDS: 60,
      REFRESH_TOKEN_TTL_SECONDS: 120,
      GATEWAY_NAME: "Test Gateway",
      PUBLIC_BASE_URL: "https://gateway.example.com",
      GATEWAY_PROVIDER: "custom",
      DEPLOYMENT_ENV: "development",
      LOG_POLICY: "standard",
      AUDIT_POLICY: "disabled",
      AUDIT_EVENT_LIMIT: 1000,
      AUDIT_WEBHOOK_URL: "",
      AUDIT_WEBHOOK_SECRET: "",
      AUDIT_WEBHOOK_TIMEOUT_MS: 3000,
      ACCESS_POLICY: "allow-all",
      ADMIN_TOKEN: "admin-secret",
      ADMIN_TOKEN_ROLES: "",
      PAIRING_STORE_PATH: "",
      REPLAY_STORE_PATH: "",
      ALLOW_DEV_SECRETS: true,
    },
    store,
    hub,
  })
  await app.ready()
  return { app, store, hub }
}

describe("relay api", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>["app"]
  let store: PairingStore
  let hub: RelayHub

  beforeEach(async () => {
    const built = await createTestApp()
    app = built.app
    store = built.store
    hub = built.hub
  })

  afterEach(async () => {
    if (app) {
      await app.close()
    }
  })

  it("pairs successfully with a valid code and secret", async () => {
    store.addOffer({
      code: "123456",
      secret: "secret",
      targetId: "target-1",
      targetName: "desktop-1",
      relayUrl: "https://relay.example.com",
      ttlSeconds: 300,
    })

    const res = await request(app.server)
      .post("/v1/pair")
      .send({ code: "123456", secret: "secret", mode: "relay" })

    expect(res.status).toBe(200)
    expect(res.body.accessToken).toBeTruthy()
    expect(res.body.refreshToken).toBeTruthy()
    expect(res.body.target.targetId).toBe("target-1")
  })

  it("returns target agent and capabilities in pair responses", async () => {
    store.addOffer({
      code: "123456",
      secret: "secret",
      targetId: "desktop-1",
      targetName: "Work Mac Mini",
      targetAgent: "mcode-desktop",
      capabilities: ["desktop.runtime.codex-cli"],
      protocolVersion: "1",
      ttlSeconds: 300,
    })

    const res = await request(app.server)
      .post("/v1/pair")
      .send({ code: "123456", secret: "secret" })

    expect(res.status).toBe(200)
    expect(res.body.target.targetId).toBe("desktop-1")
    expect(res.body.target.targetAgent).toBe("mcode-desktop")
    expect(res.body.target.displayName).toBe("Work Mac Mini")
    expect(res.body.target.capabilities).toContain("desktop.runtime.codex-cli")
    expect(res.body.target.protocolVersion).toBe("1")
  })

  it("lists multiple logical targets with different target agents", async () => {
    store.addOffer({
      code: "123456",
      secret: "secret",
      targetId: "codeg-1",
      targetName: "Codeg on Work PC",
      targetAgent: "codeg",
      ttlSeconds: 300,
    })
    const pair = await request(app.server)
      .post("/v1/pair")
      .send({ code: "123456", secret: "secret" })
    store.upsertTarget({
      targetId: "opencode-1",
      targetName: "OpenCode on Work PC",
      targetAgent: "opencode",
    })
    store.upsertTarget({
      targetId: "desktop-1",
      targetName: "MCode Desktop on Work PC",
      targetAgent: "mcode-desktop",
      capabilities: ["desktop.runtime.codex-cli"],
    })

    const res = await request(app.server)
      .get("/v1/targets")
      .set("authorization", `Bearer ${pair.body.accessToken}`)

    expect(res.status).toBe(200)
    expect(res.body.currentTargetId).toBe("codeg-1")
    expect(res.body.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetId: "codeg-1", targetAgent: "codeg" }),
        expect.objectContaining({ targetId: "opencode-1", targetAgent: "opencode" }),
        expect.objectContaining({ targetId: "desktop-1", targetAgent: "mcode-desktop" }),
      ])
    )
  })

  it("rejects pairing with an invalid secret", async () => {
    store.addOffer({
      code: "123456",
      secret: "secret",
      targetId: "target-1",
      ttlSeconds: 300,
    })

    const res = await request(app.server)
      .post("/v1/pair")
      .send({ code: "123456", secret: "wrong" })

    expect(res.status).toBe(401)
  })

  it("refreshes access tokens with a valid refresh token", async () => {
    store.addOffer({
      code: "123456",
      secret: "secret",
      targetId: "target-1",
      targetAgent: "mcode-desktop",
      targetName: "Work Mac Mini",
      capabilities: ["desktop.runtime.claude-cli"],
      protocolVersion: "1",
      ttlSeconds: 300,
    })
    const pair = await request(app.server)
      .post("/v1/pair")
      .send({ code: "123456", secret: "secret" })

    const res = await request(app.server)
      .post("/v1/session/refresh")
      .send({ refreshToken: pair.body.refreshToken })

    expect(res.status).toBe(200)
    expect(res.body.accessToken).toBeTruthy()
    expect(res.body.refreshToken).toBeTruthy()
    expect(res.body.target).toMatchObject({
      targetId: "target-1",
      targetAgent: "mcode-desktop",
      displayName: "Work Mac Mini",
      capabilities: ["desktop.runtime.claude-cli"],
      protocolVersion: "1",
    })
  })

  it("rejects invalid refresh tokens", async () => {
    const res = await request(app.server)
      .post("/v1/session/refresh")
      .send({ refreshToken: "not-a-token" })

    expect(res.status).toBe(401)
  })

  it("blocks unauthorized proxy access", async () => {
    const res = await request(app.server)
      .post("/v1/proxy/list_folders")
      .send({})

    expect(res.status).toBe(401)
  })

  it("forwards relay client id on authorized proxy calls", async () => {
    store.addOffer({
      code: "123456",
      secret: "secret",
      targetId: "desktop-1",
      targetAgent: "mcode-desktop",
      ttlSeconds: 300,
    })
    const pair = await request(app.server)
      .post("/v1/pair")
      .set("x-mcode-device-name", "Alice Phone")
      .send({ code: "123456", secret: "secret" })

    const sendProxyRequest = vi.spyOn(hub, "sendProxyRequest").mockResolvedValue({
      status: 200,
      body: { ok: true },
    })

    const res = await request(app.server)
      .post("/v1/proxy/acp_prompt")
      .set("authorization", `Bearer ${pair.body.accessToken}`)
      .set("x-mcode-client-id", "client-phone-1")
      .send({ prompt: "hello" })

    expect(res.status).toBe(200)
    expect(sendProxyRequest).toHaveBeenCalledWith(
      "desktop-1",
      "acp_prompt",
      { prompt: "hello" },
      undefined,
      expect.objectContaining({
        clientId: "client-phone-1",
        targetId: "desktop-1",
        deviceName: "Alice Phone",
      })
    )
  })

  it("forwards relay client id on authorized cancel calls", async () => {
    store.addOffer({
      code: "223344",
      secret: "cancel-secret",
      targetId: "desktop-1",
      targetAgent: "mcode-desktop",
      ttlSeconds: 300,
    })
    const pair = await request(app.server)
      .post("/v1/pair")
      .set("x-mcode-device-name", "Alice Watch")
      .send({ code: "223344", secret: "cancel-secret" })

    const sendProxyRequest = vi.spyOn(hub, "sendProxyRequest").mockResolvedValue({
      status: 200,
      body: { status: "cancel_requested" },
    })

    const res = await request(app.server)
      .post("/v1/proxy/acp_cancel")
      .set("authorization", `Bearer ${pair.body.accessToken}`)
      .set("x-mcode-client-id", "client-watch-1")
      .send({ sessionId: "session-1", reason: "user_cancelled_from_watch" })

    expect(res.status).toBe(200)
    expect(sendProxyRequest).toHaveBeenCalledWith(
      "desktop-1",
      "acp_cancel",
      { sessionId: "session-1", reason: "user_cancelled_from_watch" },
      undefined,
      expect.objectContaining({
        clientId: "client-watch-1",
        targetId: "desktop-1",
        deviceName: "Alice Watch",
      })
    )
  })

  it("forwards authorized tunnel HTTP requests to the target desktop", async () => {
    store.addOffer({
      code: "123456",
      secret: "secret",
      targetId: "desktop-1",
      targetAgent: "mcode-desktop",
      ttlSeconds: 300,
    })
    const pair = await request(app.server)
      .post("/v1/pair")
      .send({ code: "123456", secret: "secret" })

    const sendTunnelRequest = vi.spyOn(hub, "sendTunnelRequest").mockResolvedValue({
      status: 202,
      headers: { "x-relay-test": "ok" },
      body: { proxied: true },
    })

    const res = await request(app.server)
      .post("/v1/tunnel/desktop-1/1080/preview?tab=1")
      .set("authorization", `Bearer ${pair.body.accessToken}`)
      .send({ hello: "world" })

    expect(res.status).toBe(202)
    expect(res.headers["x-relay-test"]).toBe("ok")
    expect(res.body).toEqual({ proxied: true })
    expect(sendTunnelRequest).toHaveBeenCalledWith(
      "desktop-1",
      expect.objectContaining({
        port: 1080,
        method: "POST",
        path: "/preview",
        query: { tab: "1" },
        body: { hello: "world" },
      }),
      expect.any(Number)
    )
  })

  it("blocks tunnel HTTP requests for a different target", async () => {
    store.addOffer({
      code: "123456",
      secret: "secret",
      targetId: "desktop-1",
      targetAgent: "mcode-desktop",
      ttlSeconds: 300,
    })
    const pair = await request(app.server)
      .post("/v1/pair")
      .send({ code: "123456", secret: "secret" })

    const res = await request(app.server)
      .get("/v1/tunnel/other-target/1080/preview")
      .set("authorization", `Bearer ${pair.body.accessToken}`)

    expect(res.status).toBe(403)
  })

  it("requires admin token for enterprise device APIs", async () => {
    const res = await request(app.server).get("/v1/admin/devices")

    expect(res.status).toBe(401)
  })

  it("lists enterprise devices sessions and audit events", async () => {
    store.addOffer({
      code: "123456",
      secret: "secret",
      targetId: "desktop-1",
      targetAgent: "mcode-desktop",
      ttlSeconds: 300,
    })
    const pair = await request(app.server)
      .post("/v1/pair")
      .set("x-mcode-device-name", "Alice Phone")
      .set("user-agent", "MCode Test")
      .send({ code: "123456", secret: "secret" })

    const devices = await request(app.server)
      .get("/v1/admin/devices")
      .set("x-mcode-admin-token", "admin-secret")
    const sessions = await request(app.server)
      .get("/v1/admin/sessions")
      .set("x-mcode-admin-token", "admin-secret")
    const audit = await request(app.server)
      .get("/v1/admin/audit-events")
      .set("x-mcode-admin-token", "admin-secret")

    expect(pair.status).toBe(200)
    expect(devices.status).toBe(200)
    expect(devices.body.devices[0]).toMatchObject({
      targetId: "desktop-1",
      targetAgent: "mcode-desktop",
      revoked: false,
    })
    expect(sessions.body.sessions[0]).toMatchObject({
      targetId: "desktop-1",
      deviceName: "Alice Phone",
      deviceUserAgent: "MCode Test",
    })
    expect(audit.body.events.some((event: any) => event.type === "session.created")).toBe(true)
  })

  it("scopes enterprise admin data by tenant and allows target reassignment", async () => {
    store.addOffer({
      code: "123456",
      secret: "secret",
      targetId: "desktop-1",
      tenantId: "tenant-a",
      targetAgent: "mcode-desktop",
      ttlSeconds: 300,
    })
    const pair = await request(app.server)
      .post("/v1/pair")
      .send({ code: "123456", secret: "secret" })

    const tenantCreated = await request(app.server)
      .post("/v1/admin/tenants")
      .set("x-mcode-admin-token", "admin-secret")
      .send({ tenantId: "tenant-b", tenantName: "Tenant B" })

    const reassigned = await request(app.server)
      .post("/v1/admin/devices/desktop-1/tenant")
      .set("x-mcode-admin-token", "admin-secret")
      .send({ tenantId: "tenant-b" })

    const tenantADevices = await request(app.server)
      .get("/v1/admin/devices")
      .query({ tenantId: "tenant-a" })
      .set("x-mcode-admin-token", "admin-secret")
    const tenantBDevices = await request(app.server)
      .get("/v1/admin/devices")
      .query({ tenantId: "tenant-b" })
      .set("x-mcode-admin-token", "admin-secret")
    const tenants = await request(app.server)
      .get("/v1/admin/tenants")
      .set("x-mcode-admin-token", "admin-secret")

    expect(pair.status).toBe(200)
    expect(tenantCreated.status).toBe(200)
    expect(reassigned.status).toBe(200)
    expect(reassigned.body.target).toMatchObject({
      targetId: "desktop-1",
      tenantId: "tenant-b",
    })
    expect(tenantADevices.body.devices).toEqual([])
    expect(tenantBDevices.body.devices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: "desktop-1",
          tenantId: "tenant-b",
        }),
      ])
    )
    expect(tenants.body.tenants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tenantId: "default" }),
        expect.objectContaining({ tenantId: "tenant-a" }),
        expect.objectContaining({ tenantId: "tenant-b", tenantName: "Tenant B" }),
      ])
    )
    expect(store.listAuditEvents().some((event) => event.type === "target.tenant_changed")).toBe(true)
  })

  it("revokes sessions through enterprise admin API", async () => {
    store.addOffer({
      code: "123456",
      secret: "secret",
      targetId: "desktop-1",
      targetAgent: "mcode-desktop",
      ttlSeconds: 300,
    })
    const pair = await request(app.server)
      .post("/v1/pair")
      .send({ code: "123456", secret: "secret" })
    const sessionId = store.listSessions()[0].sessionId

    const revoked = await request(app.server)
      .post(`/v1/admin/sessions/${sessionId}/revoke`)
      .set("x-mcode-admin-token", "admin-secret")
      .set("x-mcode-admin-actor", "security")
      .send({ reason: "lost device" })
    const blocked = await request(app.server)
      .post("/v1/proxy/acp_list_agents")
      .set("authorization", `Bearer ${pair.body.accessToken}`)
      .send({})

    expect(revoked.status).toBe(200)
    expect(blocked.status).toBe(401)
    expect(blocked.body.error).toContain("session revoked")
    expect(store.listAuditEvents().some((event) => event.type === "session.revoked")).toBe(true)
  })

  it("revokes targets and blocks refresh tokens", async () => {
    store.addOffer({
      code: "123456",
      secret: "secret",
      targetId: "desktop-1",
      targetAgent: "mcode-desktop",
      ttlSeconds: 300,
    })
    const pair = await request(app.server)
      .post("/v1/pair")
      .send({ code: "123456", secret: "secret" })

    const revoked = await request(app.server)
      .post("/v1/admin/devices/desktop-1/revoke")
      .set("x-mcode-admin-token", "admin-secret")
      .send({ reason: "retired" })
    const refresh = await request(app.server)
      .post("/v1/session/refresh")
      .send({ refreshToken: pair.body.refreshToken })

    expect(revoked.status).toBe(200)
    expect(refresh.status).toBe(401)
    expect(refresh.body.error).toBe("refresh token revoked")
    expect(store.getTarget("desktop-1")?.revoked).toBe(true)
  })
})
