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
    GATEWAY_NAME: "Admin Web Gateway",
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
    ADMIN_TOKEN: "owner-secret",
    ADMIN_TOKEN_ROLES: JSON.stringify({
      "owner-secret": { role: "owner" },
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
  const app = await buildRelayApp({
    config: cfg,
    store: new PairingStore(null, { auditEventLimit: cfg.AUDIT_EVENT_LIMIT }),
    hub: new RelayHub(),
  })
  await app.ready()
  return app
}

describe("relay admin web console", () => {
  it("serves the admin shell and allowlisted assets", async () => {
    const app = await appFor()

    const shell = await request(app.server).get("/admin")
    const script = await request(app.server).get("/admin/assets/admin.js")
    const missing = await request(app.server).get("/admin/assets/unknown.js")

    await app.close()

    expect(shell.status).toBe(200)
    expect(shell.headers["content-type"]).toContain("text/html")
    expect(shell.headers["x-content-type-options"]).toBe("nosniff")
    expect(shell.text).toContain("网关管理后台")
    expect(shell.text).toContain("/admin/assets/admin.js")
    expect(script.status).toBe(200)
    expect(script.headers["content-type"]).toContain("application/javascript")
    expect(script.text).toContain("sessionStorage")
    expect(missing.status).toBe(404)
  })

  it("keeps admin APIs protected even when the web console is public", async () => {
    const app = await appFor()

    const shell = await request(app.server).get("/admin")
    const blocked = await request(app.server).get("/v1/admin/devices")
    const allowed = await request(app.server)
      .get("/v1/admin/devices")
      .set("x-mcode-admin-token", "owner-secret")

    await app.close()

    expect(shell.status).toBe(200)
    expect(blocked.status).toBe(401)
    expect(allowed.status).toBe(200)
  })
})
