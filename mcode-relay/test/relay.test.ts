import request from "supertest"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
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

  beforeEach(async () => {
    const built = await createTestApp()
    app = built.app
    store = built.store
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
})
