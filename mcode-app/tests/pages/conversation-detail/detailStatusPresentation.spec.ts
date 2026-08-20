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

  describe("agent disconnect and error details", () => {
    // 用户报「智能体 ACP 断开连接的报错有办法获取到吗，还有别的报错似乎无法获取」。
    // 两个成因：`disconnected` 此前不是一个被识别的状态；`AcpEvent::Error` 的
    // `details`（agent stderr 尾巴）在归一化时被丢掉了。
    const base = {
      showBridgeRecoveredBanner: false,
      runtimeRetryText: "",
      longWaitElapsedMs: 0,
      activeModelStatusLabel: "",
      planTaskCount: 0,
      themeColor,
    }

    it("surfaces a disconnected agent as its own state, ahead of runtime_error", () => {
      // 断连时 runtimeErrorText 往往就是导致断连的那条 Error —— 两者说的是同一件事，
      // 而「断开了」比「出错了」更可操作。所以 agent_disconnected 必须排在前面。
      expect(buildDetailStatusState({
        ...base,
        runtimeErrorText: "agent exited with code 1",
        runtimeStatus: "disconnected",
      })).toEqual(expect.objectContaining({
        code: "agent_disconnected",
        severity: "error",
        text: "agent exited with code 1",
      }))
    })

    it("falls back to a generic disconnect message when no error text arrived", () => {
      expect(buildDetailStatusState({
        ...base,
        runtimeErrorText: "",
        runtimeStatus: "disconnected",
      })).toEqual(expect.objectContaining({
        code: "agent_disconnected",
        text: "智能体连接已断开",
      }))
    })

    it("carries stderr details separately from the pill text", () => {
      // details 可能有几十行，胶囊里塞不下 —— 必须单独返回，让 UI 默认折叠。
      const state = buildDetailStatusState({
        ...base,
        runtimeErrorText: "turn failed",
        runtimeErrorDetails: "stderr:\nline 1\nline 2",
        runtimeStatus: "error",
      })

      expect(state.code).toBe("runtime_error")
      expect(state.text).toBe("turn failed")
      expect(state.details).toBe("stderr:\nline 1\nline 2")
      // 证据不能被拼进胶囊文案里。
      expect(state.text).not.toContain("line 1")
    })

    it("omits details when the event carried none", () => {
      expect(buildDetailStatusState({
        ...base,
        runtimeErrorText: "turn failed",
        runtimeStatus: "error",
      }).details).toBeUndefined()
    })

    it("labels a disconnected agent as 已断开 rather than 运行异常", () => {
      expect(buildRuntimeStatusLabel({
        detailStatusCode: "agent_disconnected",
        runtimeStatus: "disconnected",
        activeModelStatusLabel: "",
      })).toBe("已断开")
      expect(buildRuntimeStatusClass({
        detailStatusCode: "agent_disconnected",
        runtimeStatus: "disconnected",
      })).toBe("error")
    })
  })

  describe("attach settling window", () => {
    // 用户报「打开一个正在 504 重试的会话，一开始不显示重试报错，过了一会却又显示了」。
    // 成因：重试横幅是纯瞬态提示，服务端**刻意不放进快照**，要等下一次 api_retry 事件
    // 推过来才有。重试是指数退避的，那个空窗可能好几秒，期间显示「思考中」看起来一切正常。
    const base = {
      showBridgeRecoveredBanner: false,
      runtimeErrorText: "",
      runtimeRetryText: "",
      longWaitElapsedMs: 0,
      activeModelStatusLabel: "",
      planTaskCount: 0,
      themeColor,
    }

    it("marks the first seconds after attach as syncing, not as normal thinking", () => {
      expect(buildDetailStatusState({
        ...base,
        runtimeStatus: "thinking",
        attachElapsedMs: 800,
      })).toEqual(expect.objectContaining({
        code: "attach_settling",
        text: "正在同步远端状态...",
        loading: true,
      }))
    })

    it("falls back to the normal thinking label once the window passes", () => {
      expect(buildDetailStatusState({
        ...base,
        runtimeStatus: "thinking",
        attachElapsedMs: 5_000,
      }).code).toBe("thinking")
    })

    it("never overrides a concrete signal that already arrived", () => {
      // 只要拿到确切信息就不该再显示这条模糊文案 —— 它是「还不知道」的占位。
      expect(buildDetailStatusState({
        ...base,
        runtimeStatus: "thinking",
        attachElapsedMs: 500,
        runtimeRetryText: "server_error HTTP 504 · 正在重试 1/10",
      }).code).toBe("api_retry")

      expect(buildDetailStatusState({
        ...base,
        runtimeStatus: "thinking",
        attachElapsedMs: 500,
        runtimeErrorText: "turn failed",
      }).code).toBe("runtime_error")

      expect(buildDetailStatusState({
        ...base,
        runtimeStatus: "waiting_permission",
        attachElapsedMs: 500,
      }).code).toBe("waiting_permission")
    })

    it("does not apply when the session is idle or the timestamp is unknown", () => {
      // 空闲会话没有「远端在忙」这回事，不该挂同步态。
      expect(buildDetailStatusState({
        ...base,
        runtimeStatus: "idle",
        attachElapsedMs: 500,
      }).code).toBe("idle")
      // 拿不到 attach 时刻（老状态/未记录）时保持原行为。
      expect(buildDetailStatusState({
        ...base,
        runtimeStatus: "thinking",
      }).code).toBe("thinking")
    })

    it("keeps the spinner class so the pill does not flash grey", () => {
      expect(buildRuntimeStatusClass({
        detailStatusCode: "attach_settling",
        runtimeStatus: "thinking",
      })).toBe("running")
      expect(buildRuntimeStatusLabel({
        detailStatusCode: "attach_settling",
        runtimeStatus: "thinking",
        activeModelStatusLabel: "",
      })).toBe("同步中")
    })
  })
})
