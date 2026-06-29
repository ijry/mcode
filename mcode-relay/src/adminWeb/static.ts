import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { FastifyInstance } from "fastify"

const assetRoot = join(dirname(fileURLToPath(import.meta.url)), "assets")
const adminContentSecurityPolicy = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ")

const adminAssets: Record<string, { file: string; contentType: string; cacheControl: string }> = {
  "index.html": {
    file: "index.html",
    contentType: "text/html; charset=utf-8",
    cacheControl: "no-store",
  },
  "admin.css": {
    file: "admin.css",
    contentType: "text/css; charset=utf-8",
    cacheControl: "no-cache",
  },
  "admin.js": {
    file: "admin.js",
    contentType: "application/javascript; charset=utf-8",
    cacheControl: "no-cache",
  },
}

export function registerAdminWebRoutes(app: FastifyInstance): void {
  app.get("/admin", async (_req, reply) => sendAdminAsset(reply, "index.html"))
  app.get("/admin/", async (_req, reply) => sendAdminAsset(reply, "index.html"))

  app.get("/admin/assets/:file", async (req, reply) => {
    const params = req.params as { file?: string }
    const file = String(params.file || "").trim()
    if (!adminAssets[file] || file.includes("/") || file.includes("\\")) {
      return reply.code(404).send({ error: "admin asset not found" })
    }
    return sendAdminAsset(reply, file)
  })
}

async function sendAdminAsset(reply: { header: (name: string, value: string) => unknown; send: (payload: unknown) => unknown; code: (statusCode: number) => { send: (payload: unknown) => unknown } }, file: string) {
  const asset = adminAssets[file]
  if (!asset) return reply.code(404).send({ error: "admin asset not found" })

  const body = await readFile(join(assetRoot, asset.file), "utf8")
  reply.header("content-type", asset.contentType)
  reply.header("cache-control", asset.cacheControl)
  reply.header("x-content-type-options", "nosniff")
  reply.header("referrer-policy", "no-referrer")
  reply.header("content-security-policy", adminContentSecurityPolicy)
  reply.header("x-frame-options", "DENY")
  reply.header("permissions-policy", "camera=(), microphone=(), geolocation=()")
  return reply.send(body)
}
