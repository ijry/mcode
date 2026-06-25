import Fastify from "fastify"
import websocket from "@fastify/websocket"
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
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
import type { TargetRecord } from "./pairing/store.js"
import { RelayHub } from "./tunnel/hub.js"
import { normalizeTunnelPath } from "./tunnel/httpProxy.js"
import type { TargetAgent, TargetMetadata, TunnelHttpResponse } from "./protocol/types.js"

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

function normalizeTargetAgent(value: unknown, fallback: TargetAgent = "codeg"): TargetAgent {
  return value === "codeg" || value === "opencode" || value === "mcode-desktop"
    ? value
    : fallback
}

function normalizeCapabilities(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  )
}

function normalizeProtocolVersion(value: unknown): string | undefined {
  const protocolVersion = String(value || "").trim()
  return protocolVersion || undefined
}

function pickDisplayName(message: Record<string, unknown>, fallback?: string | null): string | null {
  const displayName = String(message.displayName || message.targetName || fallback || "").trim()
  return displayName || null
}

function toTargetMetadata(target: TargetRecord): TargetMetadata {
  return {
    targetId: target.targetId,
    targetAgent: target.targetAgent,
    displayName: target.targetName,
    capabilities: target.capabilities,
    protocolVersion: target.protocolVersion,
  }
}

function toTargetResponse(target: TargetRecord, context: RelayAppContext) {
  const metadata = toTargetMetadata(target)
  return {
    ...metadata,
    targetName: target.targetName,
    relayUrl: target.relayUrl,
    preferredMode: target.preferredMode,
    online: context.hub.isDesktopOnline(target.targetId),
  }
}

function normalizeLastEventId(req: FastifyRequest): number {
  const query = req.query && typeof req.query === "object" ? (req.query as Record<string, unknown>) : {}
  const raw = query.lastEventId ?? query.last_event_id ?? 0
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0
}

function normalizeTunnelHeaders(headers: FastifyRequest["headers"]) {
  const result: Record<string, string | string[] | undefined> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "authorization") continue
    result[key] = value
  }
  return result
}

function applyTunnelResponse(reply: FastifyReply, response: TunnelHttpResponse) {
  for (const [key, value] of Object.entries(response.headers ?? {})) {
    const lower = key.toLowerCase()
    if (lower === "content-length" || lower === "transfer-encoding" || lower === "connection") {
      continue
    }
    reply.header(key, value)
  }
  return reply.status(response.status || 200).send(response.body ?? null)
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
      targetAgent: offer.targetAgent,
      capabilities: offer.capabilities,
      protocolVersion: offer.protocolVersion,
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
      target: toTargetResponse(target, context),
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
        ...(target ? { target: toTargetResponse(target, context) } : {}),
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
      ...toTargetResponse(target, context),
      relayUrl: target.relayUrl,
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
      const timeoutMs = command === "acp_describe_agent_options" ? 70_000 : undefined
      const result = await context.hub.sendProxyRequest(
        claims.targetId,
        command,
        payload,
        timeoutMs
      )
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

  app.all("/v1/tunnel/:targetId/:port/*", async (req, reply) => {
    let claims: Awaited<ReturnType<typeof authenticate>>
    try {
      claims = await authenticate(req, context.config)
    } catch (error) {
      return reply.code(401).send({ error: error instanceof Error ? error.message : "Unauthorized" })
    }

    const params = req.params as { targetId: string; port: string; "*": string }
    const targetId = String(params.targetId || "").trim()
    if (!targetId || claims.targetId !== targetId) {
      return reply.code(403).send({ error: "target mismatch" })
    }

    const port = Number(params.port)
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      return reply.code(400).send({ error: "invalid tunnel port" })
    }

    try {
      const response = await context.hub.sendTunnelRequest(
        targetId,
        {
          port,
          method: req.method,
          path: normalizeTunnelPath(params["*"] || "/"),
          query:
            req.query && typeof req.query === "object"
              ? { ...(req.query as Record<string, unknown>) }
              : {},
          headers: normalizeTunnelHeaders(req.headers),
          body: req.body,
        },
        30_000
      )
      return applyTunnelResponse(reply, response)
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

  app.get("/v1/events", { websocket: true }, async (connection, req) => {
    try {
      const claims = await authenticate(req, context.config)
      const socket = connection
      context.hub.attachMobileSubscriber(claims.targetId, socket, normalizeLastEventId(req))
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
        const targetName = pickDisplayName(message, null)
        context.hub.registerDesktop(activeTargetId, socket, targetName)
        context.store.upsertTarget({
          targetId: activeTargetId,
          targetName,
          targetAgent: normalizeTargetAgent(message.targetAgent, "mcode-desktop"),
          capabilities: normalizeCapabilities(message.capabilities),
          protocolVersion: normalizeProtocolVersion(message.protocolVersion),
          relayUrl: typeof message.relayUrl === "string" ? message.relayUrl : null,
          preferredMode: "relay",
        })
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
        const targetName = pickDisplayName(message, null)
        context.store.addOffer({
          code,
          secret,
          targetId: activeTargetId,
          targetName,
          targetAgent: normalizeTargetAgent(message.targetAgent, "mcode-desktop"),
          capabilities: normalizeCapabilities(message.capabilities),
          protocolVersion: normalizeProtocolVersion(message.protocolVersion),
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
        return
      }

      if (message?.type === "tunnel_response") {
        context.hub.handleDesktopTunnelResponse({
          requestId: String(message.requestId ?? ""),
          ok: Boolean(message.ok),
          status: typeof message.status === "number" ? message.status : undefined,
          headers:
            message.headers && typeof message.headers === "object"
              ? (message.headers as Record<string, string>)
              : undefined,
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
