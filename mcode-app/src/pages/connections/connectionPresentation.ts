export type ConnectionMode = "direct" | "relay"

export function getConnectionModeLabel(mode: ConnectionMode): string {
  return mode === "direct" ? "直连模式" : "中继模式"
}

export function getConnectionSubtitle(mode: ConnectionMode, url: string): string {
  return `${getConnectionModeLabel(mode)} · ${url}`
}

export function getConnectionBadgeText(isOnline: boolean): string {
  return isOnline ? "CONNECTED" : "OFFLINE"
}
