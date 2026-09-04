/**
 * DSH 手机桥的 `CodegGateway` 实现。
 *
 * 应用侧的每条 ACP 命令都从 `gateway.call()` 过，事件都从 `connectEvents()` 进，
 * 所以只要在这一个类里把两套词汇对上，会话详情、流式渲染、审批与提问都不用改。
 * 换句话说：DSH 支持的耦合点只有这一个文件加同目录的几个兄弟，其余改动都是把
 * `"dsh"` 加进几个封闭联合。
 *
 * 做不到的命令会**明确报错**，不返回空值。dsh 里没有后台任务看板、没有 Git 面板、
 * 没有文件树；让这些命令静默成功只会让界面给出做不到的承诺，而报错能让上层的
 * 能力判断把入口关掉。
 *
 * @module agents/dsh/bridgeGateway
 */
import type { CodegGateway, EventChannelConnection, PairParams, RelaySessionInfo } from "@/services/gateway/types"
import { GatewayCommandError } from "@/services/gateway/commandError"
import { toErrorMessage } from "@/services/gateway/error"
import { decodeSocketPayload } from "@/services/gateway/socketPayload"
import { buildRemoteInstanceKey } from "@/services/realtime/instance-key"
import { toAcpEvents, toAcpMessage, DSH_UNSUPPORTED_HINT } from "./acpTranslation"
import {
  DSH_APPROVAL_OUTCOME,
  DSH_PROTOCOL_VERSION,
  DSH_STREAM_PROTOCOL,
  DSH_TARGET_AGENT,
  buildDshEventsWsUrl,
  buildDshTokenProtocol,
  withDshRoutePrefix,
  type DshHello,
  type DshPairResponse,
  type DshSessionRow,
  type DshWsEnvelope,
} from "./protocol"

/** dsh 装依赖、跑长回合都可能很慢；只给这些命令放宽超时。 */
const TIMEOUT_MS: Record<string, number> = {
  acp_connect: 60_000,
  acp_prompt: 60_000,
  acp_describe_agent_options: 30_000,
}

function isH5Runtime() {
  // #ifdef H5
  return true
  // #endif
  return false
}

/** 合成的智能体列表：桥后面只有一个 dsh，但列表形状要与其它宿主一致。 */
function dshAgentList(hello: DshHello | null) {
  return [
    {
      agent_type: "dsh",
      name: "DeepSeek Harness",
      description: hello?.dshVersion ? `dsh ${hello.dshVersion}` : "DeepSeek Harness",
      available: true,
      enabled: true,
      sort_order: 0,
    },
  ]
}

export class DshBridgeGateway implements CodegGateway {
  /** 桥是直连的（局域网或隧道），不经过 relay。 */
  readonly mode = "direct" as const

  private baseUrl: string
  private session: RelaySessionInfo
  private hello: DshHello | null = null

  constructor(baseUrl: string, session: RelaySessionInfo) {
    this.baseUrl = withDshRoutePrefix(baseUrl)
    this.session = { ...session }
  }

  /** 一次桥请求，拆开 `{ ok, value }` 信封。 */
  private async request<T>(
    path: string,
    options: { method?: "GET" | "POST"; body?: unknown; timeout?: number; auth?: boolean } = {}
  ): Promise<T> {
    const method = options.method ?? "GET"
    const auth = options.auth !== false
    const res = await uni.request({
      url: `${this.baseUrl}${path}`,
      method,
      data: options.body ?? (method === "POST" ? {} : undefined),
      timeout: options.timeout,
      header: {
        "content-type": "application/json",
        ...(auth && this.session.accessToken ? { authorization: `Bearer ${this.session.accessToken}` } : {}),
      },
    })

    const statusCode = Number((res as any).statusCode || 0)
    const body = (res.data ?? null) as { ok?: boolean; value?: unknown; error?: { code?: string; message?: string; dshCode?: string } } | null

    if (body !== null && body.ok === true) return body.value as T

    // 桥的错误信封比 HTTP 状态更具体，优先用它；两者都没有时才退回状态码。
    const detail = body?.error?.message ?? `HTTP ${statusCode || "?"}`
    const code = body?.error?.code ?? ""
    throw new GatewayCommandError({
      command: path,
      statusCode: statusCode || 500,
      message: `${path}: ${detail}${body?.error?.dshCode ? `（dsh: ${body.error.dshCode}）` : ""}`,
      body: { code, ...(body?.error ?? {}) },
    })
  }

  /** `POST /pair`：用一次性配对码换一对令牌。 */
  async pair(params: PairParams): Promise<RelaySessionInfo | null> {
    if (params.directBaseUrl) this.baseUrl = withDshRoutePrefix(params.directBaseUrl)
    // 已经有令牌就不要再烧一张配对码：码是一次性的，重复配对会把它换掉，
    // 而这次连接原本根本不需要新码。
    if (!params.code && this.session.accessToken) return this.session

    const value = await this.request<DshPairResponse>("/pair", {
      method: "POST",
      auth: false,
      body: {
        code: params.code ?? "",
        secret: params.secret ?? "",
        deviceName: "MCode",
      },
    })
    this.session = {
      accessToken: value.accessToken,
      refreshToken: value.refreshToken,
      targetId: value.target?.targetId,
      targetAgent: value.target?.targetAgent,
      displayName: value.target?.displayName,
      capabilities: value.target?.capabilities,
      protocolVersion: value.target?.protocolVersion ?? DSH_PROTOCOL_VERSION,
    }
    return this.session
  }

  /** `POST /session/refresh`：两半令牌一起换。 */
  async refreshAuth(): Promise<void> {
    if (!this.session.refreshToken) {
      throw new Error("DeepSeek Harness 会话已失效，且没有刷新令牌，请重新配对")
    }
    const value = await this.request<DshPairResponse>("/session/refresh", {
      method: "POST",
      auth: false,
      body: { refreshToken: this.session.refreshToken },
    })
    this.session.accessToken = value.accessToken
    this.session.refreshToken = value.refreshToken
  }

  getRemoteInstanceDescriptor() {
    const principal = this.session.targetId
      ? `dsh:${this.session.targetId}`
      : `dsh:${(this.session.accessToken || "anonymous").slice(0, 16)}`
    return {
      instanceKey: buildRemoteInstanceKey({ mode: this.mode, baseUrl: this.baseUrl, principal }),
      mode: this.mode,
      baseUrl: this.baseUrl,
      principal,
      authToken: this.session.accessToken || undefined,
    }
  }

  /**
   * ACP 命令 → 桥接口。
   *
   * 表在这里而不是散在调用点：一条命令能不能做、做的时候打到哪个接口，是宿主的
   * 属性，应该在宿主的适配器里回答。不认识的命令抛错而不是返回 `{}` —— 静默成功
   * 会让上层以为功能可用。
   */
  async call<T>(command: string, payload: Record<string, unknown> = {}): Promise<T> {
    const timeout = TIMEOUT_MS[command]
    const sessionId = String(payload.connectionId ?? payload.sessionId ?? "")

    try {
      switch (command) {
        case "health":
          this.hello = await this.request<DshHello>("/hello", { auth: false })
          return { ok: true, targetAgent: this.hello.targetAgent, version: this.hello.dshVersion } as T

        case "acp_list_agents":
          if (this.hello === null) {
            this.hello = await this.request<DshHello>("/hello", { auth: false })
          }
          return dshAgentList(this.hello) as T

        // dsh 的模型与授权模式走它自己的设置，手机上不暴露：给一个空快照，
        // 让创建会话的表单不显示任何选项，而不是显示一组假的。
        case "acp_describe_agent_options":
          return { modes: null, config_options: [] } as T

        case "acp_connect": {
          const existing = String(payload.sessionId ?? "")
          if (existing !== "") return existing as T
          const created = await this.request<{ sessionId: string }>("/sessions", {
            method: "POST",
            timeout,
            body: {
              ...(payload.workingDir ? { cwd: String(payload.workingDir) } : {}),
              ...(payload.workspaceId ? { workspaceId: String(payload.workspaceId) } : {}),
            },
          })
          return created.sessionId as T
        }

        // 桥没有连接对象，会话就是会话：断开只是本地停掉事件流。
        case "acp_disconnect":
          return undefined as T

        case "acp_prompt": {
          const blocks = Array.isArray(payload.blocks) ? payload.blocks : []
          return (await this.request("/sessions/" + encodeURIComponent(sessionId) + "/prompt", {
            method: "POST",
            timeout,
            body: {
              text: blocks
                .map((block) => (block as Record<string, unknown>)?.text ?? "")
                .filter((text) => String(text).trim() !== "")
                .join("\n"),
              images: blocks
                .filter((block) => (block as Record<string, unknown>)?.type === "image")
                .map((block) => {
                  const cell = block as Record<string, unknown>
                  return { mediaType: String(cell.mediaType ?? "image/png"), data: String(cell.data ?? "") }
                }),
              mode: payload.mode === "steer" ? "steer" : "queue",
            },
          })) as T
        }

        case "acp_cancel":
          return (await this.request("/sessions/" + encodeURIComponent(sessionId) + "/cancel", {
            method: "POST",
          })) as T

        case "acp_get_sessions":
        case "acp_get_session_snapshot": {
          const value = await this.request<{ items: DshSessionRow[] }>("/sessions")
          return { sessions: value.items ?? [] } as T
        }

        case "acp_respond_permission":
          return (await this.request("/answers", {
            method: "POST",
            body: {
              kind: "approval",
              requestId: String(payload.requestId ?? ""),
              sessionId,
              approvalId: String(payload.approvalId ?? payload.requestId ?? ""),
              outcome:
                String(payload.optionId ?? "") === DSH_APPROVAL_OUTCOME.allow
                  ? DSH_APPROVAL_OUTCOME.allow
                  : DSH_APPROVAL_OUTCOME.deny,
            },
          })) as T

        case "acp_respond_question": {
          const answer = (payload.answer ?? {}) as { answers?: Array<{ questionId?: string; labels?: string[] }> }
          return (await this.request("/answers", {
            method: "POST",
            body: {
              kind: "question",
              requestId: String(payload.questionId ?? payload.requestId ?? ""),
              sessionId,
              answers: (answer.answers ?? []).map((item) => ({
                id: String(item?.questionId ?? ""),
                selected: Array.isArray(item?.labels) ? item.labels.map(String) : [],
              })),
            },
          })) as T
        }

        case "get_conversation_messages":
        case "acp_get_history": {
          const value = await this.request<{ messages: unknown[]; hasMore: boolean }>(
            "/sessions/" + encodeURIComponent(sessionId) + "/messages?limit=" + Number(payload.limit ?? 40)
          )
          return {
            messages: (value.messages ?? []).map((message) => toAcpMessage(message as never)),
            hasMore: value.hasMore === true,
          } as T
        }

        default: {
          const hint = DSH_UNSUPPORTED_HINT[command]
          throw new Error(
            hint === undefined
              ? `DeepSeek Harness 手机桥不支持 ${command}`
              : `${hint}，所以不支持 ${command}`
          )
        }
      }
    } catch (error) {
      if (error instanceof GatewayCommandError) throw error
      throw new Error(`${command}: ${toErrorMessage(error)}`)
    }
  }

  /**
   * 事件流。
   *
   * 用 WebSocket 而不是 SSE：桥两个载体都有，但 App 运行时的 `EventSource` 不可靠，
   * 这也是应用现有直连传输选 WebSocket 的原因。令牌走 `Authorization` 头拿不到
   * （浏览器不允许给 WebSocket 设头），所以用桥约定的子协议。
   *
   * `lastEventId` 直接交给桥：还在环形缓冲里的帧会补发，超出范围时 `hello` 帧里
   * `gap: true`，此时上层应该重新拉一次历史而不是渲染出一个洞。
   */
  async connectEvents(
    onEvent: (event: unknown) => void,
    options: { lastEventId?: number | null } = {}
  ): Promise<EventChannelConnection> {
    const url = buildDshEventsWsUrl(this.baseUrl, { lastEventId: options.lastEventId ?? null })
    const protocols = [DSH_STREAM_PROTOCOL, buildDshTokenProtocol(this.session.accessToken || "")]

    const readyCallbacks = new Set<() => void>()
    const closeCallbacks = new Set<() => void>()
    const errorCallbacks = new Set<() => void>()
    let opened = false

    const fire = (callbacks: Set<() => void>, label: string) => {
      callbacks.forEach((callback) => {
        try {
          callback()
        } catch (error) {
          console.error(`dsh bridge ${label} callback failed`, error)
        }
      })
    }

    /** 一条下行消息 → 零或多条 ACP 事件。 */
    const deliver = (raw: unknown) => {
      const decoded = decodeSocketPayload(raw) as DshWsEnvelope | null
      if (decoded === null || typeof decoded !== "object") return
      const frame = decoded.data
      if (frame === null || typeof frame !== "object") return
      const sessionId = String(frame.sessionId ?? "")
      for (const event of toAcpEvents(frame, sessionId, decoded.eventId)) onEvent(event)
    }

    if (isH5Runtime()) {
      const ws = new WebSocket(url, protocols)
      ws.addEventListener("open", () => {
        opened = true
        fire(readyCallbacks, "ready")
      })
      ws.addEventListener("close", () => {
        opened = false
        fire(closeCallbacks, "close")
      })
      ws.addEventListener("error", () => {
        opened = false
        fire(errorCallbacks, "error")
      })
      ws.addEventListener("message", (event) => deliver(event.data))
      return {
        isOpen: () => opened && ws.readyState === WebSocket.OPEN,
        // 下行流。桥忽略客户端发来的应用数据，所以这里明确返回 false，
        // 而不是假装发送成功。
        send: () => false,
        onReady: (callback) => {
          if (opened && ws.readyState === WebSocket.OPEN) {
            callback()
            return () => {}
          }
          readyCallbacks.add(callback)
          return () => readyCallbacks.delete(callback)
        },
        onClose: (callback) => {
          closeCallbacks.add(callback)
          return () => closeCallbacks.delete(callback)
        },
        onError: (callback) => {
          errorCallbacks.add(callback)
          return () => errorCallbacks.delete(callback)
        },
        close: () => {
          readyCallbacks.clear()
          closeCallbacks.clear()
          errorCallbacks.clear()
          ws.close()
        },
      }
    }

    const task: any = uni.connectSocket({ url, protocols, complete: () => {} })
    task.onOpen(() => {
      opened = true
      fire(readyCallbacks, "ready")
    })
    task.onClose(() => {
      opened = false
      fire(closeCallbacks, "close")
    })
    task.onError(() => {
      opened = false
      fire(errorCallbacks, "error")
    })
    task.onMessage((message: { data: unknown }) => deliver(message.data))

    return {
      isOpen: () => opened,
      send: () => false,
      onReady: (callback) => {
        if (opened) {
          callback()
          return () => {}
        }
        readyCallbacks.add(callback)
        return () => readyCallbacks.delete(callback)
      },
      onClose: (callback) => {
        closeCallbacks.add(callback)
        return () => closeCallbacks.delete(callback)
      },
      onError: (callback) => {
        errorCallbacks.add(callback)
        return () => errorCallbacks.delete(callback)
      },
      close: () => {
        readyCallbacks.clear()
        closeCallbacks.clear()
        errorCallbacks.clear()
        task.close({})
      },
    }
  }

  /** 桥宣称的目标信息，供 driver 写进 `targetProfile`。 */
  describeTarget() {
    return {
      targetAgent: DSH_TARGET_AGENT as "dsh",
      targetId: this.session.targetId,
      displayName: this.session.displayName,
      capabilities: this.session.capabilities,
      protocolVersion: this.session.protocolVersion ?? DSH_PROTOCOL_VERSION,
    }
  }

  /** 当前令牌对，供 driver 落盘。 */
  currentSession(): RelaySessionInfo {
    return { ...this.session }
  }
}



