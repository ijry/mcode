import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import type { RelayConfig } from "../src/config.js"
import { JsonFilePairingStoreStorage, PairingStore } from "../src/pairing/store.js"
import { createRelayContext } from "../src/server.js"

function withTempDir(fn: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "mcode-relay-store-"))
  try {
    fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function config(overrides: Partial<RelayConfig> = {}): RelayConfig {
  return {
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
    ADMIN_CREDENTIAL_STORE_PATH: "",
    PAIRING_STORE_PATH: "",
    REPLAY_STORE_PATH: "",
    ALLOW_DEV_SECRETS: true,
    ...overrides,
  }
}

describe("pairing store persistence", () => {
  it("restores tenants targets sessions and audit events from json storage", () => {
    withTempDir((dir) => {
      const filePath = join(dir, "pairing-store.json")
      const storage = new JsonFilePairingStoreStorage(filePath)
      const store = new PairingStore(storage)
      const tenant = store.upsertTenant({
        tenantId: "enterprise-a",
        tenantName: "Enterprise A",
      })

      store.upsertTarget({
        targetId: "desktop-1",
        targetName: "Office Desktop",
        targetAgent: "mcode-desktop",
        capabilities: ["desktop.tunnel.available", "agent.codex"],
        protocolVersion: "1",
        relayUrl: "https://gateway.example.com",
        tenantId: tenant.tenantId,
      })
      store.markTargetSeen("desktop-1")
      const session = store.createSession("desktop-1", {
        deviceName: "User Phone",
        deviceUserAgent: "MCode Test",
      })
      store.revokeSession(session.sessionId, "lost device")
      store.addAuditEvent({
        type: "session.revoked",
        tenantId: tenant.tenantId,
        targetId: "desktop-1",
        sessionId: session.sessionId,
        actor: "admin",
        message: "lost device",
      })

      const restored = new PairingStore(new JsonFilePairingStoreStorage(filePath))
      const restoredTarget = restored.getTarget("desktop-1")
      const restoredSession = restored.listSessions().find((item) => item.sessionId === session.sessionId)
      const restoredAuditEvent = restored.listAuditEvents(10).find((item) => item.type === "session.revoked")
      const restoredTenant = restored.getTenant(tenant.tenantId)

      expect(restoredTarget).toMatchObject({
        targetId: "desktop-1",
        tenantId: tenant.tenantId,
        targetName: "Office Desktop",
        targetAgent: "mcode-desktop",
        capabilities: ["desktop.tunnel.available", "agent.codex"],
        protocolVersion: "1",
        relayUrl: "https://gateway.example.com",
        preferredMode: "relay",
        revoked: false,
      })
      expect(restoredTarget?.lastSeenAt).toEqual(expect.any(Number))
      expect(restoredSession).toMatchObject({
        sessionId: session.sessionId,
        targetId: "desktop-1",
        tenantId: tenant.tenantId,
        deviceName: "User Phone",
        deviceUserAgent: "MCode Test",
        revokeReason: "lost device",
      })
      expect(restoredSession?.revokedAt).toEqual(expect.any(Number))
      expect(restoredAuditEvent).toMatchObject({
        type: "session.revoked",
        tenantId: tenant.tenantId,
        targetId: "desktop-1",
        sessionId: session.sessionId,
        actor: "admin",
        message: "lost device",
      })
      expect(restoredTenant).toMatchObject({
        tenantId: tenant.tenantId,
        tenantName: "Enterprise A",
      })
      expect(restored.listTenants().map((item) => item.tenantId)).toContain("default")
    })
  })

  it("does not restore short lived pair offers", () => {
    withTempDir((dir) => {
      const filePath = join(dir, "pairing-store.json")
      const store = new PairingStore(new JsonFilePairingStoreStorage(filePath))
      store.upsertTarget({ targetId: "desktop-1", targetAgent: "mcode-desktop", protocolVersion: "1" })
      store.addOffer({
        code: "123456",
        secret: "secret",
        targetId: "desktop-1",
        targetAgent: "mcode-desktop",
        protocolVersion: "1",
        ttlSeconds: 300,
      })

      const restored = new PairingStore(new JsonFilePairingStoreStorage(filePath))

      expect(restored.getTarget("desktop-1")).not.toBeNull()
      expect(restored.consumeOffer("123456", "secret")).toBeNull()
    })
  })

  it("drops v1 snapshots missing required target protocol fields", () => {
    withTempDir((dir) => {
      const filePath = join(dir, "pairing-store.json")
      writeFileSync(
        filePath,
        JSON.stringify(
          {
            targets: [
              {
                targetId: "desktop-legacy",
                targetName: "Legacy Desktop",
                capabilities: ["desktop.tunnel.available"],
                relayUrl: "https://gateway.example.com",
              },
            ],
            sessions: [
              {
                sessionId: "session-legacy",
                targetId: "desktop-legacy",
                deviceName: "Legacy Phone",
                deviceUserAgent: "MCode Legacy",
                createdAt: 1,
                updatedAt: 1,
                revokedAt: null,
                revokeReason: null,
              },
            ],
            auditEvents: [
              {
                eventId: "event-legacy",
                type: "session.created",
                targetId: "desktop-legacy",
                sessionId: "session-legacy",
                actor: "pair",
                message: null,
                createdAt: 1,
                metadata: {},
              },
            ],
          },
          null,
          2
        ),
        "utf8"
      )

      const restored = new PairingStore(new JsonFilePairingStoreStorage(filePath))

      expect(restored.getTarget("desktop-legacy")).toBeNull()
      expect(restored.listSessions()).toEqual([])
      expect(restored.listAuditEvents(10)).toEqual([])
      expect(restored.listTenants().map((item) => item.tenantId)).toContain("default")
    })
  })

  it("falls back to empty state when the json storage file is invalid", () => {
    withTempDir((dir) => {
      const filePath = join(dir, "pairing-store.json")
      writeFileSync(filePath, "{invalid json", "utf8")

      const store = new PairingStore(new JsonFilePairingStoreStorage(filePath))

      expect(store.listTargets()).toEqual([])
      expect(store.listSessions()).toEqual([])
      expect(store.listAuditEvents()).toEqual([])
    })
  })

  it("creates the default relay context with json storage when configured", () => {
    withTempDir((dir) => {
      const filePath = join(dir, "pairing-store.json")
      const context = createRelayContext({ config: config({ PAIRING_STORE_PATH: filePath }) })

      context.store.upsertTarget({ targetId: "desktop-1", targetAgent: "mcode-desktop", protocolVersion: "1" })

      const restored = new PairingStore(new JsonFilePairingStoreStorage(filePath))
      expect(restored.getTarget("desktop-1")?.targetAgent).toBe("mcode-desktop")
    })
  })
})
