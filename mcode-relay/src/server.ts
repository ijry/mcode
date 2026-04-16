import Fastify from "fastify"
import websocket from "@fastify/websocket"
import type { FastifyInstance, FastifyRequest } from "fastify"
import WebSocket from "ws"
import { pathToFileURL } from "node:url"
import { loadConfig, type RelayConfig } from "./config.js"
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "./auth/tokens.js"
import { PairingStore } from "./pairing/store.js"
import { RelayHub } from "./tunnel/hub.js"

export interface RelayAppContext {
  config: RelayConfig
  store: PairingStore
  hub: RelayHub
}

export function createRelayContext(overrides: Partial<RelayAppContext> = {}): RelayAppContext {
  return {
    config: overrides.config ?? loadConfig(),
    store: overrides.store ?? new PairingStore(),
    hub: overrides.hub ?? new RelayHub(),
  }
}

function getBearerToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization
  if (header && header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim() || null
  }
  return null
}

function getQueryToken(req: FastifyRequest): string | null {
  const queryToken = req.query && typeof req.query === "object" ? (req.query as Record<string, unknown>).token : null
  return typeof queryToken === "string" && queryToken.trim() ? queryToken.trim() : null
}

class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AuthError"
  }
}

async function authenticate(
  req: FastifyRequest,
  config: RelayConfig
): Promise<{
  sub: string
  targetId: string
  targetName?: string | null
  mode: "relay" | "direct"
}> {
  const token = getBearerToken(req) ?? getQueryToken(req)
  if (!token) {
    throw new AuthError("Missing bearer token")
  }
  try {
    return await verifyAccessToken(token, config.JWT_SECRET)
  } catch {
    throw new AuthError("Invalid token")
  }
}

function sendJson(socket: WebSocket, value: unknown): void {
  socket.send(JSON.stringify(value))
}

export async function buildRelayApp(context = createRelayContext()): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })
  await app.register(websocket)

  app.get("/health", async () => ({ status: "ok" }))

  app.post("/v1/pair", async (req, reply) => {
    const body = req.body as {
      code?: string
      secret?: string
      mode?: "relay" | "direct"
    }
    const code = body?.code?.trim() ?? ""
    const secret = body?.secret?.trim() ?? ""
    const mode = body?.mode === "direct" ? "direct" : "relay"

    if (!code || !secret) {
      return reply.code(400).send({ error: "code and secret are required" })
    }

    const offer = context.store.consumeOffer(code, secret)
    if (!offer) {
      return reply.code(401).send({ error: "pairing failed" })
    }

    const target = context.store.upsertTarget({
      targetId: offer.targetId,
      targetName: offer.targetName,
      relayUrl: offer.relayUrl,
      preferredMode: mode,
    })
    const session = context.store.createSession(target.targetId)
    const accessToken = await signAccessToken(
      {
        sub: session.sessionId,
        targetId: target.targetId,
        targetName: target.targetName,
        mode,
      },
      context.config.JWT_SECRET,
      context.config.ACCESS_TOKEN_TTL_SECONDS
    )
    const refreshToken = await signRefreshToken(
      {
        sub: session.sessionId,
        targetId: target.targetId,
      },
      context.config.JWT_SECRET,
      context.config.REFRESH_TOKEN_TTL_SECONDS
    )

    return reply.send({
      accessToken,
      refreshToken,
      target: {
        targetId: target.targetId,
        targetName: target.targetName,
        relayUrl: target.relayUrl,
        preferredMode: target.preferredMode,
        online: context.hub.isDesktopOnline(target.targetId),
      },
    })
  })

  app.post("/v1/session/refresh", async (req, reply) => {
    const body = req.body as { refreshToken?: string }
    const refreshToken = body?.refreshToken?.trim() ?? ""
    if (!refreshToken) {
      return reply.code(400).send({ error: "refreshToken is required" })
    }
    try {
      const claims = await verifyRefreshToken(refreshToken, context.config.JWT_SECRET)
      const session = context.store.getSession(claims.sub)
      if (!session) {
        return reply.code(401).send({ error: "refresh token revoked" })
      }
      const target = context.store.getTarget(claims.targetId)
      const accessToken = await signAccessToken(
        {
          sub: session.sessionId,
          targetId: claims.targetId,
          targetName: target?.targetName ?? null,
          mode: target?.preferredMode ?? "relay",
        },
        context.config.JWT_SECRET,
        context.config.ACCESS_TOKEN_TTL_SECONDS
      )
      const nextRefreshToken = await signRefreshToken(
        {
          sub: session.sessionId,
          targetId: claims.targetId,
        },
        context.config.JWT_SECRET,
        context.config.REFRESH_TOKEN_TTL_SECONDS
      )
      context.store.touchSession(session.sessionId)
      return reply.send({
        accessToken,
        refreshToken: nextRefreshToken,
      })
    } catch {
      return reply.code(401).send({ error: "invalid refresh token" })
    }
  })

  app.get("/v1/targets", async (req, reply) => {
    let claims: Awaited<ReturnType<typeof authenticate>>
    try {
      claims = await authenticate(req, context.config)
    } catch (error) {
      return reply.code(401).send({ error: error instanceof Error ? error.message : "Unauthorized" })
    }
    const targets = context.store.listTargets().map((target) => ({
      targetId: target.targetId,
      targetName: target.targetName,
      relayUrl: target.relayUrl,
      preferredMode: target.preferredMode,
      online: context.hub.isDesktopOnline(target.targetId),
      pairedAt: target.pairedAt,
      lastSeenAt: target.lastSeenAt,
    }))
    return reply.send({
      currentTargetId: claims.targetId,
      targets,
    })
  })

  app.post("/v1/proxy/:command", async (req, reply) => {
    let claims: Awaited<ReturnType<typeof authenticate>>
    try {
      claims = await authenticate(req, context.config)
    } catch (error) {
      return reply.code(401).send({ error: error instanceof Error ? error.message : "Unauthorized" })
    }
    const params = req.params as { command: string }
    const command = params.command.trim()
    if (!command) {
      return reply.code(400).send({ error: "command is required" })
    }
    const payload = req.body ?? {}
    try {
      const result = await context.hub.sendProxyRequest(claims.targetId, command, payload)
      const response = result as { status?: number; body?: unknown }
      return reply.status(response.status ?? 200).send(response.body ?? null)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes("offline")) {
        return reply.code(503).send({ error: message })
      }
      if (message.includes("timeout")) {
        return reply.code(504).send({ error: message })
      }
      return reply.code(500).send({ error: message })
    }
  })

  app.post("/v1/mode/switch", async (req, reply) => {
    let claims: Awaited<ReturnType<typeof authenticate>>
    try {
      claims = await authenticate(req, context.config)
    } catch (error) {
      return reply.code(401).send({ error: error instanceof Error ? error.message : "Unauthorized" })
    }
    const body = req.body as { mode?: "relay" | "direct" }
    const mode = body?.mode === "direct" ? "direct" : "relay"
    context.store.setPreferredMode(claims.targetId, mode)
    return reply.send({ ok: true, mode })
  })

  app.get("/v1/events", { websocket: true }, async (connection, req) => {
    try {
      const claims = await authenticate(req, context.config)
      const socket = connection
      context.hub.attachMobileSubscriber(claims.targetId, socket)
      socket.send(JSON.stringify({ type: "ready", targetId: claims.targetId }))
      socket.on("close", () => {
        context.hub.detachMobileSubscriber(claims.targetId, socket)
      })
    } catch {
      connection.close()
    }
  })

  app.get("/v1/tunnel/desktop", { websocket: true }, async (connection, req) => {
    const query = req.query as { targetId?: string; targetName?: string }
    const socket = connection
    let activeTargetId = typeof query?.targetId === "string" ? query.targetId : ""

    if (activeTargetId) {
      context.hub.registerDesktop(activeTargetId, socket, query?.targetName ?? null)
    }

    socket.on("message", async (raw: Buffer | ArrayBuffer | Buffer[]) => {
      let message: any
      try {
        message = JSON.parse(Buffer.isBuffer(raw) ? raw.toString("utf8") : Buffer.from(raw as ArrayBuffer).toString("utf8"))
      } catch {
        return
      }

      if (message?.type === "desktop_hello") {
        activeTargetId = String(message.targetId ?? activeTargetId ?? "").trim()
        if (!activeTargetId) return
        context.hub.registerDesktop(activeTargetId, socket, message.targetName ?? null)
        context.store.markTargetSeen(activeTargetId)
        return
      }

      if (!activeTargetId) {
        return
      }

      if (message?.type === "desktop_heartbeat") {
        context.hub.touchDesktop(activeTargetId)
        context.store.markTargetSeen(activeTargetId)
        return
      }

      if (message?.type === "pair_offer") {
        const code = String(message.code ?? "").trim()
        const secret = String(message.secret ?? "").trim()
        if (!code || !secret) return
        context.store.addOffer({
          code,
          secret,
          targetId: activeTargetId,
          targetName: typeof message.targetName === "string" ? message.targetName : null,
          relayUrl: typeof message.relayUrl === "string" ? message.relayUrl : null,
          ttlSeconds: context.config.PAIRING_CODE_TTL_SECONDS,
        })
        return
      }

      if (message?.type === "event_push") {
        context.hub.broadcastEvent(activeTargetId, message.event ?? message)
        return
      }

      if (message?.type === "proxy_response") {
        context.hub.handleDesktopProxyResponse({
          requestId: String(message.requestId ?? ""),
          ok: Boolean(message.ok),
          status: typeof message.status === "number" ? message.status : undefined,
          body: message.body,
          error: typeof message.error === "string" ? message.error : null,
        })
      }
    })

    socket.on("close", () => {
      if (activeTargetId) {
        context.hub.unregisterDesktop(socket)
      }
    })
  })

  return app
}

export async function startServer(): Promise<void> {
  const app = await buildRelayApp()
  const config = loadConfig()
  await app.listen({ port: config.PORT, host: config.HOST })
  app.log.info({ port: config.PORT, host: config.HOST }, "mcode-relay started")
}

const entryPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : ""
if (entryPath !== "" && import.meta.url === entryPath) {
  startServer().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
