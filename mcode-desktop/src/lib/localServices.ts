export interface LocalServiceConfig {
  name: string
  host: string
  port: number
  protocol: "http"
  enabled: boolean
}

export function buildLocalServiceConfig(input: {
  name: string
  host: string
  port: number | string
  protocol?: "http"
  enabled?: boolean
}): LocalServiceConfig {
  const name = input.name.trim()
  const host = input.host.trim()
  const port = Math.trunc(Number(input.port))

  if (!name) throw new Error("服务名称不能为空")
  if (host !== "127.0.0.1") throw new Error("P3 only allows 127.0.0.1")
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error("端口无效")

  return {
    name,
    host,
    port,
    protocol: input.protocol || "http",
    enabled: input.enabled ?? true,
  }
}

export function describeServiceBind(service: LocalServiceConfig | null): string {
  if (!service) return "127.0.0.1:1080"
  return `${service.host}:${service.port}`
}
