import request from "supertest"
import { describe, expect, it } from "vitest"
import type { RelayConfig } from "../src/config.js"
import { PairingStore } from "../src/pairing/store.js"
import { buildRelayApp } from "../src/server.js"
import { RelayHub } from "../src/tunnel/hub.js"

function config(overrides: Partial<RelayConfig> = {}): RelayConfig {
  return {
    PORT: 0,
    HOST: "127.0.0.1",
    JWT_SECRET: "test-secret",
    PAIRING_CODE_TTL_SECONDS: 300,
    ACCESS_TOKEN_TTL_SECONDS: 60,
    REFRESH_TOKEN_TTL_SECONDS: 120,
    GATEWAY_NAME: "Service Gateway",
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
    ADMIN_CREDENTIAL_STORE_PATH: "",
    PAIRING_STORE_PATH: "",
    REPLAY_STORE_PATH: "",
    ALLOW_DEV_SECRETS: true,
    ...overrides,
  }
}

async function appFor() {
  const store = new PairingStore()
  const app = await buildRelayApp({
    config: config(),
    store,
    hub: new RelayHub(),
  })
  await app.ready()
  return { app, store }
}

describe("target services", () => {
  it("returns current target local services from pair metadata", async () => {
    const { app, store } = await appFor()
    store.addOffer({
      code: "123456",
      secret: "secret",
      targetId: "desktop-1",
      targetAgent: "mcode-desktop",
      capabilities: ["desktop.tunnel.available"],
      localServices: [
        { name: "Code", host: "127.0.0.1", port: 1080, protocol: "http", enabled: true },
        { name: "Raw TCP", host: "127.0.0.1", port: 9000, protocol: "tcp", enabled: false },
      ],
      ttlSeconds: 300,
    })

    const pair = await request(app.server)
      .post("/v1/pair")
      .send({ code: "123456", secret: "secret" })
    const services = await request(app.server)
      .get("/v1/target-services")
      .set("authorization", `Bearer ${pair.body.accessToken}`)

    await app.close()

    expect(pair.status).toBe(200)
    expect(pair.body.target.localServices).toEqual([
      { name: "Code", host: "127.0.0.1", port: 1080, protocol: "http", enabled: true },
      { name: "Raw TCP", host: "127.0.0.1", port: 9000, protocol: "tcp", enabled: false },
    ])
    expect(services.status).toBe(200)
    expect(services.body).toMatchObject({
      targetId: "desktop-1",
      targetAgent: "mcode-desktop",
      services: [
        { name: "Code", host: "127.0.0.1", port: 1080, protocol: "http", enabled: true },
        { name: "Raw TCP", host: "127.0.0.1", port: 9000, protocol: "tcp", enabled: false },
      ],
    })
  })

  it("normalizes unsafe service metadata", async () => {
    const { app, store } = await appFor()
    store.addOffer({
      code: "123456",
      secret: "secret",
      targetId: "desktop-1",
      targetAgent: "mcode-desktop",
      capabilities: ["desktop.tunnel.available"],
      localServices: [
        { name: "Unsafe", host: "0.0.0.0" as "127.0.0.1", port: 1080, protocol: "http", enabled: true },
        { name: "Code", host: "127.0.0.1", port: 1080, protocol: "http", enabled: true },
        { name: "Duplicate", host: "127.0.0.1", port: 1080, protocol: "http", enabled: true },
      ],
      ttlSeconds: 300,
    })

    const pair = await request(app.server)
      .post("/v1/pair")
      .send({ code: "123456", secret: "secret" })
    const services = await request(app.server)
      .get("/v1/target-services")
      .set("authorization", `Bearer ${pair.body.accessToken}`)

    await app.close()

    expect(services.body.services).toEqual([
      { name: "Code", host: "127.0.0.1", port: 1080, protocol: "http", enabled: true },
    ])
  })

  it("requires an authenticated session", async () => {
    const { app } = await appFor()

    const res = await request(app.server).get("/v1/target-services")

    await app.close()

    expect(res.status).toBe(401)
  })
})
