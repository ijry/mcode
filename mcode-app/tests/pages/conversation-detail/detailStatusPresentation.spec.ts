import {
  bottomGeneratingText,
  buildDetailStatusState,
  buildNetworkReachabilityFeedbackText,
  buildRuntimeRetryText,
  buildRuntimeStatusClass,
  buildRuntimeStatusLabel,
  waitingStateBadgeText,
  waitingStateDescription,
  waitingStateFootnote,
  waitingStateTitle,
} from "@/pages/conversation-detail/detailStatusPresentation"
import type { RealtimeBridgeHealth } from "@/types/acp"

const themeColor = (name: string, fallback: string) => `${name}:${fallback}`

const health = (
  state: RealtimeBridgeHealth["state"],
  patch: Partial<RealtimeBridgeHealth> = {}
): RealtimeBridgeHealth => ({
  instanceKey: "instance",
  state,
  reconnectAttempt: 1,
  updatedAt: 1,
  ...patch,
})

describe("detailStatusPresentation", () => {
  it("builds retry and network reachability feedback text", () => {
    expect(buildRuntimeRetryText({
      error: "timeout",
      errorStatus: 504,
      attempt: 2,
      maxRetries: 3,
      retryDelayMs: 1500,
    })).toBe("timeout · HTTP 504 · 正在重试 2/3 · 1.5s 后继续")

    expect(buildRuntimeRetryText({ attempt: 4 })).toBe("正在重试（第 4 次）")
    expect(buildRuntimeRetryText(null)).toBe("")

    expect(buildNetworkReachabilityFeedbackText({
      bridgeHealth: health("reconnecting", { nextRetryDelayMs: 2500 }),
      runtimeRetryText: "",
      runtimeErrorText: "",
      isNetworkFailure: () => false,
    })).toBe("实时连接已断开，正在恢复，2.5s 后自动重试。请检查主机网络可达性和内网穿透连接稳定性。")

    expect(buildNetworkReachabilityFeedbackText({
      runtimeRetryText: "WebSocket timeout",
      runtimeErrorText: "",
      isNetworkFailure: () => true,
    })).toBe("WebSocket timeout。请检查主机网络可达性和连接稳定性。")
  })

  it("builds detail status banner state by priority", () => {
    expect(buildDetailStatusState({
      showBridgeRecoveredBanner: true,
      runtimeErrorText: "ignored",
      runtimeRetryText: "",
      runtimeStatus: "thinking",
      longWaitElapsedMs: 0,
      activeModelStatusLabel: "",
      planTaskCount: 0,
      themeColor,
    })).toEqual(expect.objectContaining({
      code: "bridge_recovered",
      text: "实时连接已恢复",
      iconColor: "--up-success:#19be6b",
    }))

    expect(buildDetailStatusState({
      bridgeHealth: health("reconnecting", { reconnectAttempt: 3, nextRetryDelayMs: 1000 }),
      showBridgeRecoveredBanner: false,
      runtimeErrorText: "",
      runtimeRetryText: "",
      runtimeStatus: "connected",
      longWaitElapsedMs: 0,
      activeModelStatusLabel: "",
      planTaskCount: 0,
      themeColor,
    })).toEqual(expect.objectContaining({
      code: "bridge_reconnecting",
      text: "实时连接已断开，正在重连第 3 次，1.0s 后重试",
      loading: true,
      actionKey: "reconnect",
    }))

    expect(buildDetailStatusState({
      showBridgeRecoveredBanner: false,
      runtimeErrorText: "",
      runtimeRetryText: "",
      runtimeStatus: "running_tool",
      longWaitElapsedMs: 20_000,
      activeModelStatusLabel: "",
      planTaskCount: 1,
      themeColor,
    })).toEqual(expect.objectContaining({
      code: "long_wait",
      actionLabel: "查看计划",
    }))

    expect(buildDetailStatusState({
      showBridgeRecoveredBanner: false,
      runtimeErrorText: "",
      runtimeRetryText: "",
      runtimeStatus: "thinking",
      longWaitElapsedMs: 0,
      activeModelStatusLabel: "Claude 正在思考",
      planTaskCount: 0,
      themeColor,
    })).toEqual(expect.objectContaining({
      code: "thinking",
      text: "Claude 正在思考",
      loading: true,
    }))
  })

  it("shows replay miss as recoverable warning", () => {
    expect(buildDetailStatusState({
      bridgeHealth: health("connected", {
        recoveryIssue: "replay_miss",
        recoveryMessage: "实时事件有缺口，正在刷新会话状态。部分中间状态可能已跳过。",
      }),
      showBridgeRecoveredBanner: false,
      runtimeErrorText: "",
      runtimeRetryText: "",
      runtimeStatus: "connected",
      longWaitElapsedMs: 0,
      activeModelStatusLabel: "",
      planTaskCount: 0,
      themeColor,
    })).toEqual(expect.objectContaining({
      code: "replay_miss",
      severity: "warning",
      text: "实时事件有缺口，正在刷新会话状态。部分中间状态可能已跳过。",
    }))
  })

  it("builds status labels, classes, and waiting copy", () => {
    expect(buildRuntimeStatusLabel({
      detailStatusCode: "bridge_reconnecting",
      runtimeStatus: "connected",
      activeModelStatusLabel: "",
    })).toBe("重连中")
    expect(buildRuntimeStatusLabel({
      detailStatusCode: "idle",
      runtimeStatus: "running_tool",
      activeModelStatusLabel: "",
    })).toBe("执行命令中")
    expect(buildRuntimeStatusClass({ detailStatusCode: "idle", runtimeStatus: "connected" }))
      .toBe("online")
    expect(buildRuntimeStatusClass({ detailStatusCode: "bridge_error", runtimeStatus: "connected" }))
      .toBe("error")

    expect(bottomGeneratingText("running_tool", "")).toBe("正在执行操作")
    expect(bottomGeneratingText("thinking", "正在写回复")).toBe("正在写回复")
    expect(waitingStateBadgeText("waiting_question")).toBe("等待选择")
    expect(waitingStateTitle("connecting")).toBe("正在唤起智能体会话")
    expect(waitingStateDescription("thinking")).toBe("首条回复生成前，这里会先保留一个占位气泡。")
    expect(waitingStateFootnote({
      showWaitingResponseState: true,
      runtimeStatus: "thinking",
      longWaitElapsedMs: 8_000,
    })).toBe("远端仍在处理中。")
    expect(waitingStateFootnote({
      showWaitingResponseState: true,
      runtimeStatus: "waiting_permission",
      longWaitElapsedMs: 20_000,
    })).toBe("")
  })
})
