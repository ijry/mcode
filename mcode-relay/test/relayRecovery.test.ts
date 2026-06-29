import type { AddressInfo } from "node:net"
import request from "supertest"
import { describe, expect, it } from "vitest"
import WebSocket from "ws"
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
    GATEWAY_NAME: "Recovery Gateway",
    PUBLIC_BASE_URL: "https://gateway.example.com",
    GATEWAY_PROVIDER: "custom",
    DEPLOYMENT_ENV: "development",
    LOG_POLICY: "standard",
    AUDIT_POLICY: "disabled",
    ACCESS_POLICY: "allow-all",
    ADMIN_TOKEN: "admin-secret",
    ADMIN_TOKEN_ROLES: "",
    PAIRING_STORE_PATH: "",
    REPLAY_STORE_PATH: "",
    ALLOW_DEV_SECRETS: true,
    ...overrides,
  }
}

async function appFor(configOverrides: Partial<RelayConfig> = {}) {
  const store = new PairingStore()
  const hub = new RelayHub()
  const app = await buildRelayApp({
    config: config(configOverrides),
    store,
    hub,
  })
  await app.ready()
  return { app, store, hub }
}

describe("relay recovery behavior", () => {
  it("returns classified proxy errors when the desktop target is offline", async () => {
    const { app, store } = await appFor()
    store.addOffer({
      code: "123456",
      secret: "secret",
      targetId: "desktop-1",
      targetAgent: "mcode-desktop",
      ttlSeconds: 300,
    })
    const pair = await request(app.server).post("/v1/pair").send({
      code: "123456",
      secret: "secret",
    })

    const proxyOffline = await request(app.server)
      .post("/v1/proxy/acp_list_agents")
      .set("authorization", `Bearer ${pair.body.accessToken}`)
      .send({})
    await app.close()

    expect(proxyOffline.status).toBe(503)
    expect(proxyOffline.body).toEqual({
      code: "target_offline",
      message: "target offline",
    })
  })

  it("acks desktop event pushes with local event ids", async () => {
    const { app } = await appFor()
    await app.listen({ port: 0, host: "127.0.0.1" })
    const address = app.server.address() as AddressInfo
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/v1/tunnel/desktop`)

    try {
      await onceOpen(socket)
      socket.send(
        JSON.stringify({
          type: "desktop_hello",
          targetId: "desktop-1",
          displayName: "Work Desktop",
          targetAgent: "mcode-desktop",
        })
      )
      socket.send(
        JSON.stringify({
          type: "event_push",
          localEventId: 10,
          event: { channel: "acp://event", payload: { type: "delta" } },
        })
      )

      const ack = await onceJsonMessage(socket)
      expect(ack).toMatchObject({
        type: "ack",
        eventId: 1,
        localEventId: 10,
      })
    } finally {
      socket.close()
      await app.close()
    }
  })
})

function onceOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("open", () => resolve())
    socket.once("error", reject)
  })
}

function onceJsonMessage(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for websocket message")), 1000)
    socket.once("message", (raw) => {
      clearTimeout(timer)
      resolve(JSON.parse(raw.toString()) as Record<string, unknown>)
    })
    socket.once("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}
