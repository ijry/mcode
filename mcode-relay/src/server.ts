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
import { JsonFilePairingStoreStorage, PairingStore } from "./pairing/store.js"
import type { PairSessionRecord, TargetRecord } from "./pairing/store.js"
import { buildGatewayHealth, buildGatewayInfo } from "./gateway/info.js"
import { JsonFileReplayStoreStorage, ReplayStore } from "./protocol/replayStore.js"
import { RelayHub, RelayRequestError } from "./tunnel/hub.js"
import { normalizeTunnelPath } from "./tunnel/httpProxy.js"
import type { TargetAgent, TargetMetadata, TunnelHttpResponse } from "./protocol/types.js"

export interface RelayAppContext {
  config: RelayConfig
  store: PairingStore
  hub: RelayHub
}

export function createRelayContext(overrides: Partial<RelayAppContext> = {}): RelayAppContext {
  const config = overrides.config ?? loadConfig()
  return {
    config,
    store: overrides.store ?? createDefaultPairingStore(config),
    hub: overrides.hub ?? createDefaultRelayHub(config),
  }
}

function createDefaultPairingStore(config: RelayConfig): PairingStore {
  const storePath = config.PAIRING_STORE_PATH.trim()
  return new PairingStore(storePath ? new JsonFilePairingStoreStorage(storePath) : null)
}

function createDefaultRelayHub(config: RelayConfig): RelayHub {
  const replayStorePath = config.REPLAY_STORE_PATH.trim()
  return new RelayHub({
    replayStore: new ReplayStore(
      replayStorePath ? new JsonFileReplayStoreStorage(replayStorePath) : null,
      1000
    ),
    replayWindowSize: 1000,
  })
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

async function authenticateSession(
  req: FastifyRequest,
  context: RelayAppContext
): Promise<{
  claims: Awaited<ReturnType<typeof authenticate>>
  session: PairSessionRecord
  target: TargetRecord
}> {
  const claims = await authenticate(req, context.config)
  const session = context.store.getSession(claims.sub)
  if (!session) {
    throw new AuthError("session revoked")
  }
  const target = context.store.getTarget(claims.targetId)
  if (!target || target.revoked) {
    throw new AuthError("target revoked")
  }
  return { claims, session, target }
}

function getAdminToken(req: FastifyRequest): string | null {
  const header = req.headers["x-mcode-admin-token"]
  if (typeof header === "string" && header.trim()) return header.trim()
  return getBearerToken(req)
}

function authenticateAdmin(req: FastifyRequest, config: RelayConfig): boolean {
  const expected = config.ADMIN_TOKEN.trim()
  if (!expected) return false
  return getAdminToken(req) === expected
}

function adminActor(req: FastifyRequest): string {
  const actor = req.headers["x-mcode-admin-actor"]
  return typeof actor === "string" && actor.trim() ? actor.trim() : "admin"
}

function normalizeLimit(req: FastifyRequest): number {
  const query = req.query && typeof req.query === "object" ? (req.query as Record<string, unknown>) : {}
  const limit = Number(query.limit ?? 100)
  return Number.isFinite(limit) ? Math.max(1, Math.min(Math.trunc(limit), 500)) : 100
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

function normalizeWebSocketData(raw: Buffer | ArrayBuffer | Buffer[] | string): Buffer {
  if (Buffer.isBuffer(raw)) return raw
  if (Array.isArray(raw)) return Buffer.concat(raw)
  if (typeof raw === "string") return Buffer.from(raw, "utf8")
  return Buffer.from(raw)
}

function relayErrorPayload(error: unknown): { status: number; body: { code: string; message: string } } {
  if (error instanceof RelayRequestError) {
    const status =
      error.code === "request_timeout" ? 504 : error.code === "target_offline" ? 503 : 409
    return { status, body: { code: error.code, message: error.message } }
  }
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes("timeout")) return { status: 504, body: { code: "request_timeout", message } }
  if (message.includes("offline")) return { status: 503, body: { code: "target_offline", message } }
  return { status: 500, body: { code: "gateway_shutdown", message } }
}

function closeSocketWithError(socket: WebSocket, message: string, code = "gateway_shutdown"): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "error", code, error: message }))
    socket.close()
  }
}

export async function buildRelayApp(context = createRelayContext()): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })
  await app.register(websocket)

  app.get("/health", async () => buildGatewayHealth(context))

  app.get("/v1/gateway/info", async () => buildGatewayInfo(context))

  app.get("/v1/admin/devices", async (req, reply) => {
    if (!authenticateAdmin(req, context.config)) {
      return reply.code(401).send({ error: "admin token required" })
    }
    return reply.send({
      devices: context.store.listTargets().map((target) => ({
        ...toTargetResponse(target, context),
        pairedAt: target.pairedAt,
        lastSeenAt: target.lastSeenAt,
        revoked: target.revoked,
      })),
    })
  })

  app.get("/v1/admin/sessions", async (req, reply) => {
    if (!authenticateAdmin(req, context.config)) {
      return reply.code(401).send({ error: "admin token required" })
    }
    return reply.send({
      sessions: context.store.listSessions(),
    })
  })

  app.get("/v1/admin/audit-events", async (req, reply) => {
    if (!authenticateAdmin(req, context.config)) {
      return reply.code(401).send({ error: "admin token required" })
    }
    return reply.send({
      events: context.store.listAuditEvents(normalizeLimit(req)),
    })
  })

  app.post("/v1/admin/devices/:targetId/revoke", async (req, reply) => {
    if (!authenticateAdmin(req, context.config)) {
      return reply.code(401).send({ error: "admin token required" })
    }
    const params = req.params as { targetId: string }
    const body = req.body as { reason?: string }
    const targetId = String(params.targetId || "").trim()
    if (!context.store.revokeTarget(targetId, body?.reason)) {
      return reply.code(404).send({ error: "target not found" })
    }
    context.store.addAuditEvent({
      type: "target.revoked",
      targetId,
      actor: adminActor(req),
      message: body?.reason,
    })
    return reply.send({ ok: true })
  })

  app.post("/v1/admin/devices/:targetId/restore", async (req, reply) => {
    if (!authenticateAdmin(req, context.config)) {
      return reply.code(401).send({ error: "admin token required" })
    }
    const params = req.params as { targetId: string }
    const targetId = String(params.targetId || "").trim()
    if (!context.store.restoreTarget(targetId)) {
      return reply.code(404).send({ error: "target not found" })
    }
    context.store.addAuditEvent({
      type: "target.restored",
      targetId,
      actor: adminActor(req),
    })
    return reply.send({ ok: true })
  })

  app.post("/v1/admin/sessions/:sessionId/revoke", async (req, reply) => {
    if (!authenticateAdmin(req, context.config)) {
      return reply.code(401).send({ error: "admin token required" })
    }
    const params = req.params as { sessionId: string }
    const body = req.body as { reason?: string }
    const sessionId = String(params.sessionId || "").trim()
    const session = context.store.listSessions().find((item) => item.sessionId === sessionId)
    if (!context.store.revokeSession(sessionId, body?.reason)) {
      return reply.code(404).send({ error: "session not found" })
    }
    context.store.addAuditEvent({
      type: "session.revoked",
      targetId: session?.targetId ?? null,
      sessionId,
      actor: adminActor(req),
      message: body?.reason,
    })
    return reply.send({ ok: true })
  })

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
    const session = context.store.createSession(target.targetId, {
      deviceName:
        typeof req.headers["x-mcode-device-name"] === "string"
          ? req.headers["x-mcode-device-name"]
          : null,
      deviceUserAgent: req.headers["user-agent"] ?? null,
    })
    context.store.addAuditEvent({
      type: "session.created",
      targetId: target.targetId,
      sessionId: session.sessionId,
      actor: "pair",
      metadata: { mode },
    })
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
      if (!target || target.revoked) {
        return reply.code(401).send({ error: "target revoked" })
      }
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
      context.store.addAuditEvent({
        type: "session.refreshed",
        targetId: claims.targetId,
        sessionId: session.sessionId,
        actor: "refresh",
      })
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
    let auth: Awaited<ReturnType<typeof authenticateSession>>
    try {
      auth = await authenticateSession(req, context)
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
      currentTargetId: auth.claims.targetId,
      targets,
    })
  })

  app.post("/v1/proxy/:command", async (req, reply) => {
    let auth: Awaited<ReturnType<typeof authenticateSession>>
    try {
      auth = await authenticateSession(req, context)
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
        auth.claims.targetId,
        command,
        payload,
        timeoutMs
      )
      const response = result as { status?: number; body?: unknown }
      return reply.status(response.status ?? 200).send(response.body ?? null)
    } catch (error) {
      const failure = relayErrorPayload(error)
      return reply.code(failure.status).send(failure.body)
    }
  })

  app.post("/v1/mode/switch", async (req, reply) => {
    let auth: Awaited<ReturnType<typeof authenticateSession>>
    try {
      auth = await authenticateSession(req, context)
    } catch (error) {
      return reply.code(401).send({ error: error instanceof Error ? error.message : "Unauthorized" })
    }
    const body = req.body as { mode?: "relay" | "direct" }
    const mode = body?.mode === "direct" ? "direct" : "relay"
    context.store.setPreferredMode(auth.claims.targetId, mode)
    return reply.send({ ok: true, mode })
  })

  app.all("/v1/tunnel/:targetId/:port/*", async (req, reply) => {
    let auth: Awaited<ReturnType<typeof authenticateSession>>
    try {
      auth = await authenticateSession(req, context)
    } catch (error) {
      return reply.code(401).send({ error: error instanceof Error ? error.message : "Unauthorized" })
    }

    const params = req.params as { targetId: string; port: string; "*": string }
    const targetId = String(params.targetId || "").trim()
    if (!targetId || auth.claims.targetId !== targetId) {
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
      const failure = relayErrorPayload(error)
      return reply.code(failure.status).send(failure.body)
    }
  })

  app.get("/v1/tunnel-tcp/:targetId/:port", { websocket: true }, async (connection, req) => {
    const socket = connection
    let streamId = ""

    try {
      const auth = await authenticateSession(req, context)
      const params = req.params as { targetId: string; port: string }
      const targetId = String(params.targetId || "").trim()
      if (!targetId || auth.claims.targetId !== targetId) {
        closeSocketWithError(socket, "target mismatch")
        return
      }

      const port = Number(params.port)
      if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        closeSocketWithError(socket, "invalid tunnel port")
        return
      }

      streamId = context.hub.openTcpStream(targetId, port, socket)
      socket.send(JSON.stringify({ type: "ready", targetId, port, streamId }))
    } catch (error) {
      const failure = relayErrorPayload(error)
      closeSocketWithError(socket, failure.body.message, failure.body.code)
      return
    }

    socket.on("message", (raw: Buffer | ArrayBuffer | Buffer[] | string) => {
      try {
        const data = normalizeWebSocketData(raw)
        if (data.length > 0) {
          context.hub.sendTcpData(streamId, data)
        }
      } catch (error) {
        const failure = relayErrorPayload(error)
        closeSocketWithError(socket, failure.body.message, failure.body.code)
        if (streamId) {
          context.hub.closeTcpStream(streamId)
        }
      }
    })
  })

  app.get("/v1/events", { websocket: true }, async (connection, req) => {
    try {
      const auth = await authenticateSession(req, context)
      const socket = connection
      const replay = context.hub.attachMobileSubscriber(
        auth.claims.targetId,
        socket,
        normalizeLastEventId(req)
      )
      if (replay.replayMiss) {
        socket.send(
          JSON.stringify({
            type: "replay_miss",
            requestedLastEventId: replay.requestedLastEventId,
            replayWindowStart: replay.replayWindowStart,
            lastEventId: replay.lastEventId,
          })
        )
      }
      socket.send(
        JSON.stringify({
          type: "ready",
          targetId: auth.claims.targetId,
          replayWindowStart: replay.replayWindowStart,
          lastEventId: replay.lastEventId,
          replayAvailable: replay.replayAvailable,
        })
      )
      socket.on("close", () => {
        context.hub.detachMobileSubscriber(auth.claims.targetId, socket)
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
        const localEventId =
          typeof message.localEventId === "number" && Number.isFinite(message.localEventId)
            ? Math.trunc(message.localEventId)
            : undefined
        const frame = context.hub.broadcastEvent(activeTargetId, message.event ?? message, localEventId)
        sendJson(socket, {
          type: "ack",
          eventId: frame.eventId,
          ...(localEventId !== undefined ? { localEventId } : {}),
        })
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
        return
      }

      if (message?.type === "tcp_data") {
        context.hub.handleDesktopTcpData({
          streamId: String(message.streamId ?? ""),
          dataBase64: String(message.dataBase64 ?? ""),
        })
        return
      }

      if (message?.type === "tcp_close") {
        context.hub.handleDesktopTcpClose({
          streamId: String(message.streamId ?? ""),
        })
        return
      }

      if (message?.type === "tcp_error") {
        context.hub.handleDesktopTcpError({
          streamId: String(message.streamId ?? ""),
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
  const config = loadConfig()
  const app = await buildRelayApp(createRelayContext({ config }))
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
