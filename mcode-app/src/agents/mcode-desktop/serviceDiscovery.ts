import type { LocalServiceMetadata } from "@/services/gateway/types"
import type { ConnectionRecordV2 } from "@/services/connectionSchema"
import {
  buildDesktopTunnelEntry,
  type DesktopServiceEntry,
} from "./capabilities"

export interface DesktopDiscoveredServiceEntry extends DesktopServiceEntry {
  name: string
  host: "127.0.0.1"
  port: number
  bind: string
}

export function buildDesktopServiceEntries(
  connection: Pick<
    ConnectionRecordV2,
    "targetAgent" | "routeMode" | "gatewayBaseUrl" | "gatewaySession" | "targetProfile"
  >,
  services: LocalServiceMetadata[]
): DesktopDiscoveredServiceEntry[] {
  return normalizeServices(services).map((service) => {
    const entry = buildDesktopTunnelEntry({
      connection,
      label: service.name,
      port: service.port,
      protocol: service.protocol,
    })
    return {
      ...entry,
      enabled: service.enabled && entry.enabled,
      reason: service.enabled ? entry.reason : "服务已在 Desktop 端停用。",
      name: service.name,
      host: service.host,
      port: service.port,
      bind: `${service.host}:${service.port}`,
    }
  })
}

function normalizeServices(services: LocalServiceMetadata[]): LocalServiceMetadata[] {
  const seenPorts = new Set<number>()
  const result: LocalServiceMetadata[] = []
  for (const service of services || []) {
    const name = String(service.name || "").trim()
    const port = Number(service.port)
    if (!name || service.host !== "127.0.0.1") continue
    if (!Number.isInteger(port) || port <= 0 || port > 65535 || seenPorts.has(port)) continue
    seenPorts.add(port)
    result.push({
      name,
      host: "127.0.0.1",
      port,
      protocol: service.protocol === "tcp" ? "tcp" : "http",
      enabled: Boolean(service.enabled),
    })
  }
  return result
}
