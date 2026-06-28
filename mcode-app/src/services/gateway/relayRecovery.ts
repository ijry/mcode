import type {
  RelayReadyFrame,
  RelayRecoveryMissFrame,
  RelayWrappedEventFrame,
} from "./types"

export type RelayRealtimeFrame =
  | ({ kind: "ready" } & RelayReadyFrame)
  | ({ kind: "replay_miss" } & RelayRecoveryMissFrame)
  | ({ kind: "event" } & RelayWrappedEventFrame)
  | { kind: "legacy"; payload: unknown }

export function normalizeRelayEventCheckpoint(value: unknown): number | null {
  const parsed = typeof value === "string" && value.trim() ? Number(value) : value
  if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed <= 0) {
    return null
  }
  return Math.trunc(parsed)
}

export function buildRelayEventsUrl(
  relayUrl: string,
  checkpoint?: unknown,
  clientId?: string
): string {
  const base = relayUrl.replace(/^http/, "ws").replace(/\/$/, "")
  const params = new URLSearchParams()
  const normalized = normalizeRelayEventCheckpoint(checkpoint)
  if (normalized) params.set("lastEventId", String(normalized))
  if (clientId) params.set("clientId", clientId)
  const query = params.toString()
  return `${base}/v1/events${query ? `?${query}` : ""}`
}

export function classifyRelayRealtimeFrame(raw: unknown): RelayRealtimeFrame {
  if (!raw || typeof raw !== "object") return { kind: "legacy", payload: raw }
  const record = raw as Record<string, unknown>
  if (record.type === "ready") {
    return {
      kind: "ready",
      type: "ready",
      replayWindowStart: normalizeNullableNumber(record.replayWindowStart),
      lastEventId: normalizeNullableNumber(record.lastEventId),
      replayAvailable: record.replayAvailable === true,
    }
  }
  if (record.type === "replay_miss") {
    return {
      kind: "replay_miss",
      type: "replay_miss",
      requestedLastEventId: normalizeNullableNumber(record.requestedLastEventId),
      replayWindowStart: normalizeNullableNumber(record.replayWindowStart),
      lastEventId: normalizeNullableNumber(record.lastEventId),
    }
  }
  const eventId = normalizeRelayEventCheckpoint(record.eventId)
  const channel = typeof record.channel === "string" ? record.channel.trim() : ""
  if (eventId && channel) {
    return {
      kind: "event",
      eventId,
      channel,
      payload: record.payload,
      controllerId: typeof record.controllerId === "string" ? record.controllerId : null,
      localEventId: normalizeNullableNumber(record.localEventId),
    }
  }
  return { kind: "legacy", payload: raw }
}

export function describeGatewayFailureCode(code: unknown): string {
  switch (typeof code === "string" ? code : "") {
    case "target_offline":
      return "MCode Desktop 当前不在线，请确认电脑端已连接网关后重试。"
    case "request_timeout":
      return "网关请求超时，可以稍后重试或检查 Desktop 与网关连接。"
    case "session_revoked":
      return "网关会话已失效，请刷新连接或重新配对。"
    case "desktop_replaced":
      return "Desktop 上游连接已切换，正在重新连接实时通道。"
    case "gateway_shutdown":
      return "网关正在重启，请稍后重试。"
    case "turn_busy":
      return "其他设备正在执行任务，请等待当前任务完成。"
    case "interaction_resolved":
      return "该请求已由其他设备处理。"
    default:
      return ""
  }
}

function normalizeNullableNumber(value: unknown): number | null {
  if (value == null) return null
  return normalizeRelayEventCheckpoint(value)
}
