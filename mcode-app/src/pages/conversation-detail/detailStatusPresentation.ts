import type { ApiRetryEvent, RealtimeBridgeHealth } from "@/types/acp"

export type DetailBannerTone = "info" | "warning" | "error"
export type DetailStatusCode =
  | "bridge_recovered"
  | "bridge_reconnecting"
  | "bridge_error"
  | "runtime_error"
  | "api_retry"
  | "waiting_permission"
  | "waiting_question"
  | "connecting"
  | "long_wait"
  | "thinking"
  | "running_tool"
  | "idle"

export interface DetailStatusState {
  code: DetailStatusCode
  severity: DetailBannerTone
  text: string
  icon: string
  iconColor: string
  loading: boolean
  actionKey?: "reconnect" | "inspect"
  actionLabel?: string
}

export type ThemeColorResolver = (name: string, fallback: string) => string

export function buildRuntimeRetryText(retry?: ApiRetryEvent | null) {
  if (!retry) return ""

  const pieces: string[] = []
  if (retry.error) pieces.push(retry.error)
  if (typeof retry.errorStatus === "number") pieces.push(`HTTP ${Math.trunc(retry.errorStatus)}`)
  if (typeof retry.attempt === "number" && typeof retry.maxRetries === "number") {
    pieces.push(`正在重试 ${Math.trunc(retry.attempt)}/${Math.trunc(retry.maxRetries)}`)
  } else if (typeof retry.attempt === "number") {
    pieces.push(`正在重试（第 ${Math.trunc(retry.attempt)} 次）`)
  } else {
    pieces.push("正在重试")
  }
  if (typeof retry.retryDelayMs === "number") {
    pieces.push(`${(retry.retryDelayMs / 1000).toFixed(1)}s 后继续`)
  }
  return pieces.filter(Boolean).join(" · ")
}

export function buildNetworkReachabilityFeedbackText(input: {
  bridgeHealth?: RealtimeBridgeHealth | null
  runtimeRetryText: string
  runtimeErrorText: string
  isNetworkFailure: (message: string) => boolean
}) {
  const health = input.bridgeHealth
  if (health?.state === "reconnecting") {
    const retryText = health.nextRetryDelayMs && health.nextRetryDelayMs > 0
      ? `，${(health.nextRetryDelayMs / 1000).toFixed(1)}s 后自动重试`
      : ""
    return `实时连接已断开，正在恢复${retryText}。请检查主机网络可达性和内网穿透连接稳定性。`
  }
  if (health?.state === "error") {
    return "实时连接异常。请检查主机网络可达性、内网穿透地址是否仍在线，以及电脑端 Web 服务是否开启。"
  }

  if (input.runtimeRetryText && input.isNetworkFailure(input.runtimeRetryText)) {
    return `${input.runtimeRetryText}。请检查主机网络可达性和连接稳定性。`
  }

  if (input.runtimeErrorText && input.isNetworkFailure(input.runtimeErrorText)) {
    return `${input.runtimeErrorText}。请检查主机网络可达性、内网穿透地址稳定性，以及电脑端 Web 服务状态。`
  }

  return ""
}

export function buildDetailStatusState(input: {
  bridgeHealth?: RealtimeBridgeHealth | null
  showBridgeRecoveredBanner: boolean
  runtimeErrorText: string
  runtimeRetryText: string
  runtimeStatus: string
  longWaitElapsedMs: number
  activeModelStatusLabel: string
  planTaskCount: number
  themeColor: ThemeColorResolver
}): DetailStatusState {
  const health = input.bridgeHealth
  const color = input.themeColor
  if (input.showBridgeRecoveredBanner) {
    return {
      code: "bridge_recovered",
      severity: "info",
      text: "实时连接已恢复",
      icon: "checkmark-circle-fill",
      iconColor: color("--up-success", "#19be6b"),
      loading: false,
    }
  }
  if (health?.state === "reconnecting") {
    const retrySuffix = health.nextRetryDelayMs && health.nextRetryDelayMs > 0
      ? `，${(health.nextRetryDelayMs / 1000).toFixed(1)}s 后重试`
      : ""
    return {
      code: "bridge_reconnecting",
      severity: "error",
      text: `实时连接已断开，正在重连第 ${Math.max(1, health.reconnectAttempt)} 次${retrySuffix}`,
      icon: "reload",
      iconColor: color("--up-error", "#fa3534"),
      loading: true,
      actionKey: "reconnect",
      actionLabel: "立即重试",
    }
  }
  if (health?.state === "error") {
    return {
      code: "bridge_error",
      severity: "error",
      text: "实时连接异常，正在尝试恢复",
      icon: "close-circle-fill",
      iconColor: color("--up-error", "#fa3534"),
      loading: false,
      actionKey: "reconnect",
      actionLabel: "立即重试",
    }
  }
  if (input.runtimeErrorText) {
    return {
      code: "runtime_error",
      severity: "error",
      text: input.runtimeErrorText,
      icon: "close-circle-fill",
      iconColor: color("--up-error", "#fa3534"),
      loading: false,
    }
  }
  if (input.runtimeRetryText) {
    return {
      code: "api_retry",
      severity: "warning",
      text: input.runtimeRetryText,
      icon: "reload",
      iconColor: color("--up-warning", "#f9ae3d"),
      loading: true,
    }
  }
  if (input.runtimeStatus === "waiting_permission") {
    return {
      code: "waiting_permission",
      severity: "warning",
      text: "智能体正在等待你的授权",
      icon: "alert-circle",
      iconColor: color("--up-warning", "#f9ae3d"),
      loading: false,
    }
  }
  if (input.runtimeStatus === "waiting_question") {
    return {
      code: "waiting_question",
      severity: "warning",
      text: "智能体正在等待你的选择",
      icon: "question-circle",
      iconColor: color("--up-warning", "#f9ae3d"),
      loading: false,
    }
  }
  if (input.runtimeStatus === "connecting") {
    return {
      code: "connecting",
      severity: "info",
      text: "正在连接智能体...",
      icon: "reload",
      iconColor: color("--up-primary", "#2979ff"),
      loading: true,
    }
  }
  if (
    (input.runtimeStatus === "thinking" || input.runtimeStatus === "running_tool")
    && input.longWaitElapsedMs >= 20_000
  ) {
    return {
      code: "long_wait",
      severity: "info",
      text: "远端仍在处理，请保持页面打开",
      icon: "clock",
      iconColor: color("--up-primary", "#2979ff"),
      loading: false,
      actionKey: "inspect",
      actionLabel: input.planTaskCount > 0 ? "查看计划" : "查看最近一步",
    }
  }
  if (input.runtimeStatus === "thinking") {
    return {
      code: "thinking",
      severity: "info",
      text: input.activeModelStatusLabel || "思考中",
      icon: "reload",
      iconColor: color("--up-primary", "#2979ff"),
      loading: true,
    }
  }
  if (input.runtimeStatus === "running_tool") {
    return {
      code: "running_tool",
      severity: "info",
      text: input.activeModelStatusLabel || "执行命令中",
      icon: "reload",
      iconColor: color("--up-primary", "#2979ff"),
      loading: true,
    }
  }
  return {
    code: "idle",
    severity: "info",
    text: "",
    icon: "info-circle",
    iconColor: color("--up-primary", "#2979ff"),
    loading: false,
  }
}

export function buildRuntimeStatusLabel(input: {
  detailStatusCode: DetailStatusCode
  runtimeStatus: string
  activeModelStatusLabel: string
}) {
  if (input.detailStatusCode === "bridge_reconnecting") return "重连中"
  if (input.detailStatusCode === "bridge_error") return "连接异常"
  if (input.runtimeStatus === "thinking" || input.runtimeStatus === "running_tool") {
    return input.activeModelStatusLabel || (input.runtimeStatus === "thinking" ? "思考中" : "执行命令中")
  }
  if (input.runtimeStatus === "waiting_permission") return "等待授权"
  if (input.runtimeStatus === "waiting_question") return "等待选择"
  if (input.runtimeStatus === "error") return "运行异常"
  if (input.runtimeStatus === "connected") return "已连接"
  if (input.runtimeStatus === "connecting") return "连接中"
  return "空闲"
}

export function buildRuntimeStatusClass(input: {
  detailStatusCode: DetailStatusCode
  runtimeStatus: string
}) {
  if (input.detailStatusCode === "bridge_reconnecting") return "error"
  if (input.detailStatusCode === "bridge_error") return "error"
  if (input.runtimeStatus === "thinking" || input.runtimeStatus === "running_tool") return "running"
  if (input.runtimeStatus === "waiting_permission" || input.runtimeStatus === "waiting_question") return "pending"
  if (input.runtimeStatus === "error") return "error"
  if (input.runtimeStatus === "connected") return "online"
  return "idle"
}

export function bottomGeneratingText(runtimeStatus: string, activeModelStatusLabel: string) {
  if (runtimeStatus === "running_tool") return activeModelStatusLabel || "正在执行操作"
  return activeModelStatusLabel || "正在整理回复"
}

export function waitingStateBadgeText(runtimeStatus: string) {
  if (runtimeStatus === "waiting_permission") return "等待授权"
  if (runtimeStatus === "waiting_question") return "等待选择"
  if (runtimeStatus === "running_tool") return "执行中"
  if (runtimeStatus === "thinking") return "思考中"
  if (runtimeStatus === "connecting") return "连接中"
  return "处理中"
}

export function waitingStateTitle(runtimeStatus: string) {
  if (runtimeStatus === "waiting_permission") return "智能体需要你确认下一步"
  if (runtimeStatus === "waiting_question") return "智能体需要你补一个选择"
  if (runtimeStatus === "running_tool") return "任务已发出，正在执行操作"
  if (runtimeStatus === "thinking") return "任务已发出，正在整理回复"
  if (runtimeStatus === "connecting") return "正在唤起智能体会话"
  return "正在等待智能体返回"
}

export function waitingStateDescription(runtimeStatus: string) {
  if (runtimeStatus === "waiting_permission") {
    return "完成授权后会继续返回结果，这不是故障。"
  }
  if (runtimeStatus === "waiting_question") {
    return "完成当前选择后，智能体会继续处理并返回消息。"
  }
  if (runtimeStatus === "running_tool") {
    return "智能体已经开始执行，首条消息可能会在操作完成后出现。"
  }
  if (runtimeStatus === "thinking") {
    return "首条回复生成前，这里会先保留一个占位气泡。"
  }
  if (runtimeStatus === "connecting") {
    return "连接建立后会继续生成首条回复，请保持页面打开。"
  }
  return "消息已经在路上，页面会在首条回复生成后自动补全。"
}

export function waitingStateFootnote(input: {
  showWaitingResponseState: boolean
  runtimeStatus: string
  longWaitElapsedMs: number
}) {
  if (!input.showWaitingResponseState) return ""
  if (input.runtimeStatus === "waiting_permission" || input.runtimeStatus === "waiting_question") {
    return ""
  }
  if (input.longWaitElapsedMs >= 20_000) {
    return "首次响应可能需要一点时间，请先不要离开当前页面。"
  }
  if (input.longWaitElapsedMs >= 8_000) {
    return "远端仍在处理中。"
  }
  return ""
}
