export interface GatewayQrPayloadInput {
  name: string
  gatewayProvider: "official" | "custom"
  gatewayBaseUrl?: string
  pairCode: string
  pairSecret: string
}

export interface DesktopGatewayQrPayload {
  version: 2
  name: string
  targetAgent: "mcode-desktop"
  routeMode: "gateway"
  gatewayProvider: "official" | "custom"
  gatewayBaseUrl?: string
  pairCode: string
  pairSecret: string
}

export interface PairOfferInput {
  name: string
  gatewayProvider?: "official" | "custom"
  gatewayBaseUrl?: string
}

export interface PairOfferResult {
  code: string
  secret: string
  qrPayload: string
}

export function buildGatewayQrPayload(input: GatewayQrPayloadInput): DesktopGatewayQrPayload {
  const payload: DesktopGatewayQrPayload = {
    version: 2,
    name: input.name.trim() || "MCode Desktop",
    targetAgent: "mcode-desktop",
    routeMode: "gateway",
    gatewayProvider: input.gatewayProvider,
    pairCode: input.pairCode,
    pairSecret: input.pairSecret,
  }

  const gatewayBaseUrl = input.gatewayBaseUrl?.trim().replace(/\/+$/, "")
  if (gatewayBaseUrl) {
    payload.gatewayBaseUrl = gatewayBaseUrl
  }

  return payload
}

export async function generatePairOffer(input: PairOfferInput): Promise<PairOfferResult> {
  const code = generatePairCode()
  const secret = generateSecret()
  const payload = buildGatewayQrPayload({
    name: input.name,
    gatewayProvider: input.gatewayProvider ?? "official",
    gatewayBaseUrl: input.gatewayBaseUrl,
    pairCode: code,
    pairSecret: secret,
  })

  return {
    code,
    secret,
    qrPayload: JSON.stringify(payload),
  }
}

function generatePairCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const left = randomToken(alphabet, 4)
  const right = randomToken(alphabet, 4)
  return `${left}-${right}`
}

function generateSecret(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.()
  return randomUuid || randomToken("abcdefghijklmnopqrstuvwxyz0123456789", 32)
}

function randomToken(alphabet: string, length: number): string {
  const bytes = new Uint8Array(length)
  globalThis.crypto?.getRandomValues?.(bytes)
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("")
}
