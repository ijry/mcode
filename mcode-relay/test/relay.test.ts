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
      ACCESS_POLICY: "allow-all",
      ADMIN_TOKEN: "admin-secret",
      PAIRING_STORE_PATH: "",
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
