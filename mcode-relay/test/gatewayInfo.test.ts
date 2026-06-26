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
    GATEWAY_NAME: "Enterprise Gateway",
    PUBLIC_BASE_URL: "https://gateway.example.com",
    GATEWAY_PROVIDER: "custom",
    DEPLOYMENT_ENV: "production",
    LOG_POLICY: "metadata-only",
    AUDIT_POLICY: "external",
    ALLOW_DEV_SECRETS: false,
    ...overrides,
  }
}

async function appFor(configOverrides: Partial<RelayConfig> = {}) {
  const app = await buildRelayApp({
    config: config(configOverrides),
    store: new PairingStore(),
    hub: new RelayHub(),
  })
  await app.ready()
  return app
}

describe("gateway info", () => {
  it("returns public health with version protocol security and stats", async () => {
    const app = await appFor()
    const res = await request(app.server).get("/health")
    await app.close()

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      status: "ok",
      name: "Enterprise Gateway",
      provider: "custom",
      baseUrl: "https://gateway.example.com",
      protocolVersion: "1",
      environment: "production",
      security: {
        jwtSecretConfigured: true,
        publicBaseUrlConfigured: true,
        devSecretsAllowed: false,
        productionReady: true,
      },
      stats: {
        targets: 0,
        sessions: 0,
        desktopsOnline: 0,
      },
    })
    expect(res.body.version).toBeTruthy()
    expect(JSON.stringify(res.body)).not.toContain("test-secret")
  })

  it("returns gateway info for client diagnostics", async () => {
    const app = await appFor()
    const res = await request(app.server).get("/v1/gateway/info")
    await app.close()

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      name: "Enterprise Gateway",
      provider: "custom",
      baseUrl: "https://gateway.example.com",
      version: expect.any(String),
      protocolVersion: "1",
      features: expect.arrayContaining([
        "pairing",
        "proxy",
        "events.replay",
        "tunnel.http",
        "desktop.upstream",
      ]),
      deployment: {
        environment: "production",
        logPolicy: "metadata-only",
        auditPolicy: "external",
      },
    })
    expect(JSON.stringify(res.body)).not.toContain("test-secret")
  })

  it("reports production warnings for default development secrets", async () => {
    const app = await appFor({
      JWT_SECRET: "dev-secret",
      PUBLIC_BASE_URL: "",
      ALLOW_DEV_SECRETS: true,
    })
    const res = await request(app.server).get("/health")
    await app.close()

    expect(res.body.security.productionReady).toBe(false)
    expect(res.body.security.warnings).toEqual(
      expect.arrayContaining([
        "JWT_SECRET uses the development default",
        "PUBLIC_BASE_URL is not configured",
        "development secrets are allowed",
      ])
    )
  })
})
