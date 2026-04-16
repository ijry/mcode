import { createHash } from "node:crypto"
import { randomUUID } from "node:crypto"
import { SignJWT, jwtVerify } from "jose"

export type AccessMode = "relay" | "direct"

export interface AccessClaims {
  sub: string
  targetId: string
  targetName?: string | null
  mode: AccessMode
}

export interface RefreshClaims {
  sub: string
  targetId: string
}

const issuer = "mcode-relay"
const audience = "mcode-client"

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret)
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

export async function signAccessToken(
  claims: AccessClaims,
  secret: string,
  ttlSeconds: number
): Promise<string> {
  return new SignJWT({
    targetId: claims.targetId,
    targetName: claims.targetName ?? null,
    mode: claims.mode,
    typ: "access",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(claims.sub)
    .setIssuedAt()
    .setJti(randomUUID())
    .setExpirationTime(nowSeconds() + ttlSeconds)
    .sign(secretKey(secret))
}

export async function signRefreshToken(
  claims: RefreshClaims,
  secret: string,
  ttlSeconds: number
): Promise<string> {
  return new SignJWT({
    targetId: claims.targetId,
    typ: "refresh",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(claims.sub)
    .setIssuedAt()
    .setJti(randomUUID())
    .setExpirationTime(nowSeconds() + ttlSeconds)
    .sign(secretKey(secret))
}

export async function verifyAccessToken(token: string, secret: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, secretKey(secret), {
    issuer,
    audience,
  })
  if (payload.typ !== "access") {
    throw new Error("invalid access token")
  }
  const mode = payload.mode === "direct" ? "direct" : "relay"
  return {
    sub: String(payload.sub ?? ""),
    targetId: String(payload.targetId ?? ""),
    targetName: payload.targetName == null ? null : String(payload.targetName),
    mode,
  }
}

export async function verifyRefreshToken(token: string, secret: string): Promise<RefreshClaims> {
  const { payload } = await jwtVerify(token, secretKey(secret), {
    issuer,
    audience,
  })
  if (payload.typ !== "refresh") {
    throw new Error("invalid refresh token")
  }
  return {
    sub: String(payload.sub ?? ""),
    targetId: String(payload.targetId ?? ""),
  }
}
