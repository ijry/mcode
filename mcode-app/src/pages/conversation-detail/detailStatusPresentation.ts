import type { ApiRetryEvent, RealtimeBridgeHealth } from "@/types/acp"

export type DetailBannerTone = "info" | "warning" | "error"
export type DetailStatusCode =
  | "bridge_recovered"
  | "replay_miss"
  | "bridge_reconnecting"
  | "bridge_error"
  | "agent_disconnected"
  | "runtime_error"
  | "api_retry"
  | "attach_settling"
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
  actionKey?: "reconnect" | "reconnect_agent" | "inspect"
  actionLabel?: string
  /**
   * 诊断证据（agent stderr 尾巴），来自 `AcpEvent::Error` 的 `details`。
   *
   * 与 `text` 分开返回而不是拼进去：它可能有几十行，胶囊里塞不下 —— UI 默认折叠，
   * 点一下才展开。只在真的拿到证据时才有值，所以模板可以直接用它判断「有没有可展开的内容」。
   */
  details?: string
}

export type ThemeColorResolver = (name: string, fallback: string) => string

/**
 * attach 之后「瞬态状态还没到齐」的窗口长度。
 *
 * Claude 的重试首个间隔约 0.5s 且指数退避，3s 足够让第一条 `api_retry` 事件到达；
 * 再长就会在正常会话上白挂一条噪音文案。
 */
const ATTACH_SETTLING_WINDOW_MS = 3_000

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
  /** `AcpEvent::Error` 的 `details`（agent stderr 尾巴）。可能很长，UI 默认折叠。 */
  runtimeErrorDetails?: string
  runtimeStatus: string
  /**
   * 距离本会话 attach（拿到快照）过去了多久，毫秒。`0`/缺省表示不适用。
   *
   * 用来标出「刚接上、瞬态状态还没到齐」这个窗口。重试横幅（Claude 的 `api_retry`、
   * codex 的 `TurnRetrying`）是**纯瞬态提示，服务端刻意不放进快照**
   * （`codeg-plus/src-tauri/src/acp/session_state.rs`：「与 Claude 的 api_retry 一样是
   * 前端瞬态提示（重试横幅），不进快照 —— 回合边界会清除它」）。
   *
   * 于是冷启动进入一个正在 504 重试的会话时，前几秒只能显示「思考中」——
   * 用户报的原话：「一开始是不显示这个重试报错的，但是过了一会却又显示了」。
   * 重试是指数退避的，那个空窗可能有好几秒。
   *
   * 服务端不改的前提下这个空窗消不掉，但至少不该让它读起来像「一切正常」。
   */
  attachElapsedMs?: number
  /**
   * 当前活跃的 AIR 失败记录是否建议 `retry`
   * （`services/conversation/sessionFailureRecords.ts` 的 `sessionFailureSuggestsRetry`）。
   *
   * 用它决定「运行异常」时给不给重连入口。缺省 `false` = 不给 —— 拿不到适配器的建议时
   * 宁可少一个入口，也不要给一个点了没用的。
   */
  failureSuggestsRetry?: boolean
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
  if (health?.recoveryIssue === "replay_miss") {
    return {
      code: "replay_miss",
      severity: "warning",
      text: health.recoveryMessage || "实时事件有缺口，正在刷新会话状态。部分中间状态可能已跳过。",
      icon: "warning-fill",
      iconColor: color("--up-warning", "#f9ae3d"),
      loading: true,
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
  // agent 进程死了 / 连接被拆掉。排在 `runtimeErrorText` **之前**：断连时那条文案往往
  // 就是导致断连的那个 Error，两者说的是同一件事，而「断开了」比「出错了」更可操作 ——
  // 前者能给出重连入口。
  //
  // 与上面几条 bridge_* 的区别要说清楚：那些是**传输层**（手机↔CodeG 主机的 WebSocket）
  // 断了，重连它由 `acpApi.reconnectRealtimeBridge` 自动做；这一条是 **ACP agent 进程**
  // 没了，传输层好得很，事件收得到 —— 收到的正是「agent 死了」。两者的恢复手段完全不同。
  if (input.runtimeStatus === "disconnected") {
    return {
      code: "agent_disconnected",
      severity: "error",
      text: input.runtimeErrorText || "智能体连接已断开",
      icon: "close-circle-fill",
      iconColor: color("--up-error", "#fa3534"),
      loading: false,
      details: input.runtimeErrorDetails || undefined,
      // 与上面 bridge_* 的 `reconnect` 是**两个不同的动作**：那个重连手机↔主机的
      // WebSocket，这个重新拉起 ACP agent 进程。用同一个 actionKey 会让「agent 死了」
      // 时去重连一条本来就好好的传输通道，点了没反应。
      actionKey: "reconnect_agent",
      actionLabel: "重新连接智能体",
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
      details: input.runtimeErrorDetails || undefined,
      /*
        重连入口的可用性**取决于适配器自己的建议**（AIR `session_failures` 记录里的
        `actions`，词表是 `retry|login|new_session`），而不是从错误文案里猜关键字。

        这是接那条通道最实在的收益：`login`（登录过期）和 `new_session`（会话失效）时
        给「重新连接」是误导 —— 重连不会解决它们，用户点几次然后放弃。只有 `retry`
        才真的可能恢复。

        拿不到记录时（Claude 的重试走 SDK 消息旁路、或旧后端不发 AIR）保持原样不给按钮：
        宁可少一个入口，也不要给一个点了没用的。
      */
      ...(input.failureSuggestsRetry
        ? { actionKey: "reconnect_agent" as const, actionLabel: "重新连接智能体" }
        : {}),
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
      icon: "error-circle",
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
  /*
    刚 attach 上、且远端正忙的那几秒：瞬态状态（重试横幅）还没推过来，此时显示
    「思考中」会让一个正在 504 重试的会话看起来一切正常。

    排在 `long_wait` / `thinking` / `running_tool` **之前**，但在所有真实错误、
    `api_retry`、等待授权/选择**之后** —— 只要拿到了任何确切信息，就不该再显示这条
    模糊的过渡文案。

    `ATTACH_SETTLING_WINDOW_MS` 取 3s：Claude 重试首个间隔约 0.5s、指数退避，3s 足够
    让第一条 `api_retry` 到达；再长就会在正常会话上白挂一条噪音。
  */
  if (
    input.attachElapsedMs != null
    && input.attachElapsedMs > 0
    && input.attachElapsedMs < ATTACH_SETTLING_WINDOW_MS
    && (input.runtimeStatus === "thinking" || input.runtimeStatus === "running_tool")
  ) {
    return {
      code: "attach_settling",
      severity: "info",
      text: "正在同步远端状态...",
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
  if (input.detailStatusCode === "replay_miss") return "恢复中"
  // 「已断开」而不是「运行异常」：agent 进程没了，这是个终态，不是运行中的故障。
  if (input.detailStatusCode === "agent_disconnected") return "已断开"
  if (input.detailStatusCode === "attach_settling") return "同步中"
  if (input.runtimeStatus === "disconnected") return "已断开"
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
  if (input.detailStatusCode === "replay_miss") return "pending"
  if (input.detailStatusCode === "agent_disconnected") return "error"
  // 同步中仍然是「在跑」，不是异常 —— 用 running 让转圈动效延续，别闪成灰色。
  if (input.detailStatusCode === "attach_settling") return "running"
  if (input.runtimeStatus === "disconnected") return "error"
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

/**
 * 本回合已运行时间的紧凑文案：`45s` / `1m30s` / `30m` / `1h1m`。
 *
 * 三段规则与既有的 `formatSubagentDuration`（子智能体胶囊的耗时）保持同一形制 ——
 * 无空格、最多两个单位、为 0 的低位单位省略。仓库里已经有那一份，界面上再出现一种
 * `1h 1m 1s` 的写法只会让同一个概念读起来像两件事。
 *
 * **一小时以上不再显示秒。** 那个量级上秒是噪音，而且它决定了刷新频率：秒可见时标签
 * 每秒变一次，跨过一小时后每分钟才变一次。
 *
 * 负值夹到 0：`startedAt` 在「中途接入正在跑的会话」这条路上来自**主机时钟**
 * （attach 快照的 `live_message.started_at`），而这里用手机时钟做减法，两边有偏移。
 * 主机快一点会算出负数，显示成 `0s` 无害；主机慢一点只能虚高，客户端无从校正。
 */
export function formatRunElapsed(ms: number): string {
  const total = Number.isFinite(ms) ? Math.max(0, Math.floor(ms)) : 0
  const hours = Math.floor(total / 3_600_000)
  const minutes = Math.floor((total % 3_600_000) / 60_000)
  const seconds = Math.floor((total % 60_000) / 1_000)

  if (hours > 0) return minutes > 0 ? `${hours}h${minutes}m` : `${hours}h`
  if (minutes > 0) return seconds > 0 ? `${minutes}m${seconds}s` : `${minutes}m`
  return `${seconds}s`
}

/**
 * 哪些运行状态该显示已运行时间。
 *
 * 四个状态都算「本回合还没结束」，与 PC 端一致 —— codeg-plus 的计时器挂在
 * `connStatus === "prompting"` 上，而它的 `prompting` 并不因为挂起授权/提问而改变
 * （`pending_permission` 是另一个字段）。手机端把那一个状态拆成了四个值，所以要逐个列出。
 *
 * 等待授权/提问期间**继续计时**是有意的：那时用户最想知道的恰恰是「它卡在这儿多久了」。
 */
const RUN_ELAPSED_STATUSES = new Set<string>([
  "thinking",
  "running_tool",
  "waiting_permission",
  "waiting_question",
])

/**
 * 已运行时间的可见性。`startedAt` 为 0/缺失时不显示 —— 中途接入且快照里没有
 * `live_message` 时拿不到回合起点，宁可不显示，也不要从 attach 那一刻重新计时
 * （那会把一个跑了半小时的回合显示成刚开始）。
 */
export function shouldShowRunElapsed(runtimeStatus: string, startedAt: number): boolean {
  if (!Number.isFinite(startedAt) || startedAt <= 0) return false
  return RUN_ELAPSED_STATUSES.has(runtimeStatus)
}
