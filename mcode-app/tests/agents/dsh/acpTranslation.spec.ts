/**
 * 桥的帧 → ACP 事件。
 *
 * 这一层是「会话详情不用改一行就能跑 dsh」的全部原因，所以它的每条映射都值得钉住：
 * 少一条帧只是少显示一点东西，多映射一条或映射错一条会让界面显示假状态。
 */
import { toAcpEvents, parseToolInput, questionSpecs, toAcpMessage } from "@/agents/dsh/acpTranslation"

const frame = (type: string, extra: Record<string, unknown> = {}) => ({ type, sessionId: "s1", ...extra })

describe("dsh frame to acp event", () => {
  it("turns text and reasoning deltas into one stream, split by contentType", () => {
    const text = toAcpEvents(frame("message/delta", { kind: "text", text: "你" }), "s1", 7)
    expect(text).toEqual([
      { type: "stream_batch", connectionId: "s1", seq: 7, data: { delta: "你", contentType: "text" } },
    ])

    const thinking = toAcpEvents(frame("message/delta", { kind: "reasoning", text: "嗯" }), "s1", 8)
    expect(thinking[0].data.contentType).toBe("thinking")

    // 空增量不该产生一条什么都不显示的事件。
    expect(toAcpEvents(frame("message/delta", { kind: "text", text: "" }), "s1")).toEqual([])
  })

  it("does not replay the assistant message after streaming it", () => {
    const events = toAcpEvents(
      frame("message/end", {
        message: { messageId: "a1", role: "assistant", seq: 3, at: 1, text: "已经流过去了" },
      }),
      "s1"
    )
    // 定稿再发一遍正文会让气泡里出现两份内容。
    expect(events).toEqual([])
  })

  it("surfaces a user message so a second phone sees what the first sent", () => {
    const events = toAcpEvents(
      frame("message/end", {
        message: { messageId: "u1", role: "user", seq: 2, at: 10, text: "看看 CI" },
      }),
      "s1"
    )
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe("user_message")
    expect(events[0].data).toMatchObject({ id: "u1", role: "user", content: "看看 CI", seq: 2 })
  })

  it("pairs a tool call with its result by callId", () => {
    const call = toAcpEvents(
      frame("tool/call", { callId: "c9", name: "bash", arguments: '{"cmd":"ls"}' }),
      "s1"
    )
    expect(call[0].type).toBe("tool_call")
    expect(call[0].data).toEqual({ id: "c9", name: "bash", input: { cmd: "ls" }, status: "running" })

    const okResult = toAcpEvents(frame("tool/result", { callId: "c9", ok: true, text: "a\nb" }), "s1")
    expect(okResult[0].type).toBe("tool_call_update")
    expect(okResult[0].data).toEqual({ id: "c9", status: "completed", output: "a\nb" })

    const failed = toAcpEvents(frame("tool/result", { callId: "c9", ok: false, text: "boom" }), "s1")
    expect(failed[0].data.status).toBe("error")
  })

  it("reports the start of a turn once and its end once", () => {
    expect(toAcpEvents(frame("session/status", { running: true }), "s1")[0].type).toBe("turn_started")
    // 结束由 turn/end 表达；两边都发会让状态胶囊闪一下。
    expect(toAcpEvents(frame("session/status", { running: false }), "s1")).toEqual([])
    const end = toAcpEvents(frame("turn/end", { turn: 2, reason: "stop" }), "s1")
    expect(end[0].type).toBe("turn_complete")
    expect(end[0].data).toEqual({ turn: 2, reason: "stop" })
  })

  it("keeps the request id dsh minted on an approval, and offers only two outcomes", () => {
    const events = toAcpEvents(
      frame("approval/requested", {
        requestId: "rpc-9",
        approvalId: "ap-9",
        toolName: "bash",
        callId: "c1",
        reason: "写到工作区外面",
      }),
      "s1"
    )
    expect(events[0].type).toBe("permission_request")
    // 用新 id 回答会让 dsh 一直等下去。
    expect(events[0].data.id).toBe("rpc-9")
    expect(events[0].data.description).toBe("写到工作区外面")
    expect(events[0].data.details).toEqual({ toolName: "bash", callId: "c1", approvalId: "ap-9" })
    expect(events[0].data.options.map((option: { id: string }) => option.id)).toEqual([
      "allowed-once",
      "rejected",
    ])
  })

  it("reshapes a question batch into QuestionSpec rows", () => {
    const events = toAcpEvents(
      frame("question/requested", {
        requestId: "rpc-q",
        questions: [
          { id: "q1", question: "选哪个？", header: "方案", multiSelect: true, options: [{ label: "A" }] },
          {},
        ],
      }),
      "s1"
    )
    expect(events[0].type).toBe("question_request")
    expect(events[0].data.question_id).toBe("rpc-q")
    expect(events[0].data.questions[0]).toEqual({
      id: "q1",
      question: "选哪个？",
      header: "方案",
      multi_select: true,
      options: [{ label: "A", description: "" }],
    })
    // 缺字段的一行也要能渲染，而不是让整批崩掉。
    expect(events[0].data.questions[1]).toEqual({
      id: "q1",
      question: "",
      header: "",
      multi_select: false,
      options: [],
    })
  })

  it("reports errors and drops what it does not understand", () => {
    const error = toAcpEvents(frame("error", { code: "dsh_error", message: "爆了" }), "s1")
    expect(error[0].type).toBe("error")
    expect(error[0].data).toEqual({ message: "爆了", code: "dsh_error" })

    for (const type of ["hello", "session/added", "session/removed", "session/title", "message/start", "something/new"]) {
      expect(toAcpEvents(frame(type), "s1")).toEqual([])
    }
  })
})

describe("dsh tool input parsing", () => {
  it("keeps a malformed argument string visible instead of throwing it away", () => {
    expect(parseToolInput('{"a":1}')).toEqual({ a: 1 })
    expect(parseToolInput("")).toEqual({})
    expect(parseToolInput(undefined)).toEqual({})
    // 模型确实生成了这个东西，用户该看到它。
    expect(parseToolInput("{not json")).toEqual({ _raw: "{not json" })
    expect(parseToolInput("42")).toEqual({ _raw: "42" })
    expect(parseToolInput({ already: "parsed" })).toEqual({ already: "parsed" })
  })
})

describe("dsh message projection", () => {
  it("carries reasoning, tool calls, and the interrupted marker", () => {
    const row = toAcpMessage({
      messageId: "a1",
      role: "assistant",
      seq: 5,
      at: 99,
      text: "正文",
      reasoning: "想了想",
      interrupted: true,
      toolCalls: [{ callId: "c1", name: "bash", arguments: '{"cmd":"ls"}' }],
    })
    expect(row).toMatchObject({
      id: "a1",
      role: "assistant",
      content: "正文",
      thinking: "想了想",
      seq: 5,
      timestamp: 99,
      interrupted: true,
    })
    expect(row.toolCalls).toEqual([{ id: "c1", name: "bash", input: { cmd: "ls" }, status: "completed" }])
  })

  it("omits absent optional fields rather than emitting empty ones", () => {
    const row = toAcpMessage({ messageId: "u1", role: "user", seq: 1, at: 0, text: "hi" })
    expect("toolCalls" in row).toBe(false)
    expect("toolResult" in row).toBe(false)
    expect(row.thinking).toBe("")
    expect(row.interrupted).toBe(false)
  })
})

describe("question spec normalization", () => {
  it("tolerates a non-array batch", () => {
    expect(questionSpecs(undefined)).toEqual([])
    expect(questionSpecs("nope")).toEqual([])
  })
})
