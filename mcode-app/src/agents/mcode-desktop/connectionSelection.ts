import { buildConnectionKey, type ConnectionContext } from "@/services/connectionContext"

export interface DesktopConnectionOption {
  key: string
  label: string
  subtitle: string
  targetId: string
  gatewayBaseUrl: string
  paired: boolean
  connection: ConnectionContext
}

export function buildDesktopConnectionOptions(
  connections: ConnectionContext[]
): DesktopConnectionOption[] {
  return connections
    .filter(
      (connection) =>
        connection.targetAgent === "mcode-desktop" &&
        connection.routeMode === "gateway"
    )
    .map((connection, index) => {
      const key = buildConnectionKey(connection) || `mcode-desktop::gateway::${index}`
      const targetId =
        firstString(connection.gatewaySession?.targetId, connection.targetProfile?.targetId) || ""
      const displayName = firstString(
        connection.gatewaySession?.displayName,
        connection.targetProfile?.displayName,
        connection.name,
        targetId,
        `MCode Desktop ${index + 1}`
      )
      const gatewayBaseUrl = String(connection.gatewayBaseUrl || "").trim()
      return {
        key,
        label: displayName,
        subtitle: gatewayBaseUrl || "官方网关",
        targetId,
        gatewayBaseUrl,
        paired: Boolean(connection.gatewaySession?.accessToken),
        connection,
      }
    })
}

export function chooseDesktopConnection(
  options: DesktopConnectionOption[],
  preferredKey?: string | null
): DesktopConnectionOption | null {
  if (!options.length) return null
  const normalizedPreferredKey = String(preferredKey || "").trim()
  if (normalizedPreferredKey) {
    const preferred = options.find((option) => option.key === normalizedPreferredKey)
    if (preferred) return preferred
  }
  return options.find((option) => option.paired) || options[0]
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value || "").trim()
    if (text) return text
  }
  return ""
}
