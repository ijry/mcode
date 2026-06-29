import {
  normalizeConnectionBaseUrl,
  normalizeConnectionRecordV2,
  type ConnectionRecordV2,
} from "@/services/connectionSchema"

export function migrateLegacyStoredConnectionsToV2(): {
  migrated: number
  dropped: number
  connections: ConnectionRecordV2[]
} {
  const raw = uni.getStorageSync("mcode_connections")
  if (!Array.isArray(raw)) return { migrated: 0, dropped: 0, connections: [] }

  let migrated = 0
  let dropped = 0
  const connections: ConnectionRecordV2[] = []

  raw.forEach((item) => {
    const v2 = normalizeConnectionRecordV2(item && typeof item === "object"
      ? { version: 2, ...(item as Record<string, unknown>) }
      : { version: 2 })
    if (v2) {
      connections.push(v2)
      return
    }

    const converted = migrateLegacyConnectionRecord(item)
    if (converted) {
      migrated += 1
      connections.push(converted)
      return
    }

    dropped += 1
  })

  if (migrated > 0 || dropped > 0 || connections.length !== raw.length) {
    uni.setStorageSync("mcode_connections", connections)
  }

  return { migrated, dropped, connections }
}

function migrateLegacyConnectionRecord(input: unknown): ConnectionRecordV2 | null {
  if (!input || typeof input !== "object") return null
  const raw = input as Record<string, unknown>
  const mode = raw.mode === "relay" ? "relay" : raw.mode === "direct" ? "direct" : null
  const url = normalizeConnectionBaseUrl(pickString(raw.url))
  if (!mode || !url) return null

  if (mode === "direct") {
    return normalizeConnectionRecordV2({
      version: 2,
      name: raw.name,
      targetAgent: "codeg",
      routeMode: "direct",
      directBaseUrl: url,
      directToken: raw.directToken,
    })
  }

  return normalizeConnectionRecordV2({
    version: 2,
    name: raw.name,
    targetAgent: "codeg",
    routeMode: "gateway",
    gatewayProvider: "official",
    gatewayBaseUrl: url,
    pairCode: raw.pairCode,
    pairSecret: raw.pairSecret,
    gatewaySession: raw.relaySession,
  })
}

function pickString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : ""
}
