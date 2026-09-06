/**
 * DSH 桥的帧 → MCode 的 ACP 事件；ACP 命令 → 桥的接口。
 *
 * 这个文件是整个 DSH 支持的关键：`AcpApiClient` 的每一条命令都走
 * `gateway.call(command, payload)`，事件也统一从 `connectEvents(onEvent)` 进来。
 * 于是只要在这一层把两套词汇对上，会话详情、流式渲染、审批与提问就全都不用改 ——
 * 应用侧对「宿主是 dsh」这件事一无所知。
 *
 * 纯函数，没有 I/O、没有时钟、没有 `uni`。所以它是这套支持里最值得单独测的一块，
 * 也是上游 dsh 改词汇时最先红的一块。
 *
 * @module agents/dsh/acpTranslation
 */
import type { EventEnvelope } from "@/types/acp"
import { DSH_APPROVAL_OUTCOME, DSH_FRAME, type DshFrame, type DshMessage } from "./protocol"

/** 桥不做的命令：dsh 里没有这些概念，装作能做只会让界面给出做不到的承诺。 */
export const DSH_UNSUPPORTED_HINT: Record<string, string> = {
  work_task_list: "DeepSeek Harness 没有后台任务看板",
  get_file_tree: "DeepSeek Harness 手机桥不提供文件浏览",
  list_open_folder_details: "DeepSeek Harness 用工作区（workspace）而不是打开的文件夹",
  git_status: "DeepSeek Harness 手机桥不提供 Git 面板",
}

/**
 * `arguments` 是模型原样产出的 JSON 字符串，桥不解析它。
 *
 * 这里解析失败**不**抛错也不丢弃：一个畸形的参数串本身就是用户该看到的信息
 * （模型确实生成了这个东西），所以退化成 `{ _raw }` 交给通用渲染。
 */
export function parseToolInput(args: unknown): Record<string, unknown> {
  if (args === null || args === undefined) return {}
  if (typeof args === "object") return args as Record<string, unknown>
  const raw = String(args)
  if (raw.trim() === "") return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : { _raw: raw }
  } catch {
    return { _raw: raw }
  }
}

/** 桥的审批请求 → ACP 的两个选项。dsh 只接受「允许这一次」和「拒绝」。 */
export function approvalOptions() {
  return [
    { id: DSH_APPROVAL_OUTCOME.allow, label: "允许这一次" },
    { id: DSH_APPROVAL_OUTCOME.deny, label: "拒绝" },
  ]
}

/** 桥的提问 → ACP 的 `QuestionSpec`。缺字段一律给出可渲染的默认值。 */
export function questionSpecs(questions: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(questions)) return []
  return questions.map((item, index) => {
    const row = (item ?? {}) as Record<string, unknown>
    const options = Array.isArray(row.options) ? row.options : []
    return {
      id: String(row.id ?? `q${index}`),
      question: String(row.question ?? ""),
      header: String(row.header ?? ""),
      multi_select: row.multiSelect === true,
      options: options.map((option) => {
        const cell = (option ?? {}) as Record<string, unknown>
        return { label: String(cell.label ?? ""), description: String(cell.description ?? "") }
      }),
    }
  })
}

/** 已完成消息 → 会话详情用的行。桥已经把 dsh 的事件溯源折叠过了。 */
export function toAcpMessage(message: DshMessage) {
  return {
    id: message.messageId,
    role: message.role,
    content: message.text,
    thinking: message.reasoning ?? "",
    timestamp: message.at,
    seq: message.seq,
    interrupted: message.interrupted === true,
    ...(message.toolCalls === undefined
      ? {}
      : {
          toolCalls: message.toolCalls.map((call) => ({
            id: call.callId,
            name: call.name,
            input: parseToolInput(call.arguments),
            status: "completed" as const,
          })),
        }),
    ...(message.toolResult === undefined ? {} : { toolResult: message.toolResult }),
  }
}

/**
 * 一帧桥事件 → 零或多条 ACP 事件。
 *
 * 返回数组而不是单个事件是本质的：一帧可能什么都不映射（`hello`、`session/title`
 * 是 App 自己那套状态的事），也可能映射成两条。丢掉不认识的帧而不是猜，是这里
 * 唯一安全的默认 —— 桥以后加一种帧，旧版本 App 应该安静地不显示它，而不是渲染
 * 出一个错的东西。
 *
 * @param frame - 桥的一帧。
 * @param connectionId - ACP 侧的连接 id（= dsh 的 sessionId）。
 * @param seq - 桥给的单调事件号，原样带进 ACP 信封。
 */
export function toAcpEvents(frame: DshFrame, connectionId: string, seq?: number): EventEnvelope[] {
  const wrap = (type: EventEnvelope["type"], data: unknown): EventEnvelope =>
    ({ type, connectionId, ...(seq === undefined ? {} : { seq }), data } as EventEnvelope)

  switch (frame.type) {
    case DSH_FRAME.messageDelta: {
      const text = String(frame.text ?? "")
      if (text === "") return []
      // dsh 的 reasoning 与 text 是两路增量；ACP 用 contentType 区分同一条流。
      return [wrap("stream_batch", { delta: text, contentType: frame.kind === "reasoning" ? "thinking" : "text" })]
    }

    case DSH_FRAME.messageEnd: {
      const message = frame.message as DshMessage | undefined
      if (message === undefined) return []
      if (message.role === "user") {
        return [wrap("user_message", toAcpMessage(message))]
      }
      if (message.role === "tool") {
        // 工具结果已经由 tool/result 帧报过一次状态，这里只补 output。
        return [
          wrap("tool_call_update", {
            id: message.toolResult?.callId ?? "",
            status: message.toolResult?.ok === false ? "error" : "completed",
            output: message.text,
          }),
        ]
      }
      // assistant 的定稿不再补一条 stream_batch：正文已经逐段流过去了，重复一遍
      // 会让气泡里的内容变成两份。
      return []
    }

    case DSH_FRAME.toolCall:
      return [
        wrap("tool_call", {
          id: String(frame.callId ?? ""),
          name: String(frame.name ?? ""),
          input: parseToolInput(frame.arguments),
          status: "running",
        }),
      ]

    case DSH_FRAME.toolResult:
      return [
        wrap("tool_call_update", {
          id: String(frame.callId ?? ""),
          status: frame.ok === false ? "error" : "completed",
          output: String(frame.text ?? ""),
        }),
      ]

    case DSH_FRAME.sessionStatus:
      // 只有「开始跑」需要一条事件：结束由 turn/end 表达，两边都发会让状态胶囊
      // 闪一下。
      return frame.running === true ? [wrap("turn_started", {})] : []

    case DSH_FRAME.turnEnd:
      return [wrap("turn_complete", { turn: frame.turn ?? null, reason: frame.reason ?? null })]

    case DSH_FRAME.approvalRequested:
      return [
        wrap("permission_request", {
          // ACP 用一个 requestId 回答；桥要求原样回传 dsh 铸的那个 rpcId，
          // 所以两者必须是同一个字符串。
          id: String(frame.requestId ?? ""),
          type: "command",
          description: String(frame.reason ?? `${frame.toolName ?? "工具"} 需要授权`),
          details: { toolName: frame.toolName ?? "", callId: frame.callId ?? null, approvalId: frame.approvalId ?? "" },
          options: approvalOptions(),
        }),
      ]

    case DSH_FRAME.approvalResolved:
      return [wrap("permission_resolved", { requestId: String(frame.approvalId ?? "") })]

    case DSH_FRAME.questionRequested:
      return [
        wrap("question_request", {
          question_id: String(frame.requestId ?? ""),
          questions: questionSpecs(frame.questions),
        }),
      ]

    case DSH_FRAME.questionResolved:
      return [wrap("question_resolved", { questionId: String(frame.requestId ?? "") })]

    case DSH_FRAME.error:
      return [
        wrap("error", {
          message: String(frame.message ?? "DeepSeek Harness 报了一个错误"),
          code: String(frame.code ?? ""),
        }),
      ]

    // hello / session/added / session/removed / session/title 都是 App 自己那套
    // 连接与列表状态的事，走各自的刷新路径，不该混进会话事件流。
    default:
      return []
  }
}

