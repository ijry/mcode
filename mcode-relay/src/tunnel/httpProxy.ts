export function buildTunnelProxyPath(targetId: string, port: number, pathname = "/"): string {
  const cleanTargetId = encodeURIComponent(String(targetId || "").trim())
  const cleanPort = Math.trunc(Number(port))
  const cleanPath = normalizeTunnelPath(pathname)
  return `/v1/tunnel/${cleanTargetId}/${cleanPort}${cleanPath}`
}

export function normalizeTunnelPath(pathname = "/"): string {
  const path = String(pathname || "/").trim() || "/"
  return path.startsWith("/") ? path : `/${path}`
}
