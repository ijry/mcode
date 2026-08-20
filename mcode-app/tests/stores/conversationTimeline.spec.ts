import {
  buildConversationTimeline,
  dedupeTurnsByRoleAndId,
} from "@/stores/conversationTimeline"
import type { ContentPart, LiveMessage, MessageTurn } from "@/types/acp"

function userTurn(id: string, text: string, extra: Partial<MessageTurn> = {}): MessageTurn {
  return {
    id,
    role: "user",
    content: [{ type: "text", text }],
    timestamp: 1000,
    status: "completed",
    ...extra,
  }
}

function assistantTurn(id: string, text: string, extra: Partial<MessageTurn> = {}): MessageTurn {
  return {
    id,
    role: "assistant",
    content: [{ type: "text", text }],
    timestamp: 2000,
    status: "completed",
    ...extra,
  }
}

function liveMessage(content: ContentPart[], extra: Partial<LiveMessage> = {}): LiveMessage {
  return {
    id: "live-1",
    role: "assistant",
    content,
    isStreaming: true,
    timestamp: 3000,
    ...extra,
  }
}

function toolCallPart(id: string, name: string, extra: Record<string, unknown> = {}): ContentPart {
  return {
    type: "tool_call",
    tool_call: { id, name, ...extra },
  } as ContentPart
}

describe("buildConversationTimeline", () => {
  // 详情页"用户消息和 agent 消息各重复 2 次"的核心成因：同一条逻辑轮次在不同来源
  // 里拿到不同 id —— SQLite 是 turn:<hash>，服务端载荷是解析器的 turn-N。仅按
  // [role, id] 去重时两者互不相识，于是每条消息各渲染一遍。
  it("folds turns that share a dedupeKey but came from different id spaces", () => {
    const timeline = buildConversationTimeline({
      conversationId: 7,
      localTurns: [
        // 本地缓存水合出来的那一份（SQLite 存储 id）
        userTurn("turn:9f2a1c", "帮我看下这个 bug", { dedupeKey: "remote:turn-4" }),
        assistantTurn("turn:1b8e77", "我来定位一下", { dedupeKey: "remote:turn-5" }),
        // 远端对账后又插进来的同一条轮次（服务端解析器 id）
        userTurn("turn-4", "帮我看下这个 bug", { dedupeKey: "remote:turn-4" }),
        assistantTurn("turn-5", "我来定位一下", { dedupeKey: "remote:turn-5" }),
      ],
      liveMessage: null,
    })

    // 折叠后每条逻辑轮次只剩一条：user 保留先出现的那份（避免正在展示的消息被
    // 换掉导致跳动），assistant 保留后出现的那份（远端/重载的内容更完整）。
    expect(timeline.map((entry) => entry.turn.id)).toEqual([
      "turn:9f2a1c",
      "turn-5",
    ])
    expect(timeline.map((entry) => entry.turn.role)).toEqual(["user", "assistant"])
  })

  // 必须守住的既有不变量：用户连续发送相同文本（例如两次"继续"）是两条独立消息，
  // 不能因为内容相同就被折叠掉。它们的 dedupeKey 不同（时间桶/远端 id 不同）。
  it("keeps repeated identical user text as separate messages", () => {
    const timeline = buildConversationTimeline({
      conversationId: 7,
      localTurns: [
        userTurn("turn-1", "继续", { dedupeKey: "remote:turn-1", timestamp: 1000 }),
        userTurn("turn-2", "继续", { dedupeKey: "remote:turn-2", timestamp: 2000 }),
      ],
      liveMessage: null,
    })

    expect(timeline).toHaveLength(2)
    expect(timeline.map((entry) => entry.turn.id)).toEqual(["turn-1", "turn-2"])
  })

  it("keeps turns without a dedupeKey on id-only identity", () => {
    const timeline = buildConversationTimeline({
      conversationId: 7,
      localTurns: [
        userTurn("live-user-a", "实时轮次"),
        userTurn("live-user-b", "实时轮次"),
      ],
      liveMessage: null,
    })

    expect(timeline).toHaveLength(2)
  })

  // 同一 dedupeKey 的用户轮次保留"先出现"的那条（本地已渲染的那份），避免远端对账
  // 把正在展示的消息换掉导致列表跳动；assistant 仍保留最后一条（内容更完整）。
  it("retains the first user copy and the last assistant copy", () => {
    const turns = dedupeTurnsByRoleAndId([
      userTurn("first-user", "问题", { dedupeKey: "remote:turn-1" }),
      userTurn("second-user", "问题", { dedupeKey: "remote:turn-1" }),
      assistantTurn("first-assistant", "部分回答", { dedupeKey: "remote:turn-2" }),
      assistantTurn("second-assistant", "完整回答", { dedupeKey: "remote:turn-2" }),
    ])

    expect(turns.map((turn) => turn.id)).toEqual(["first-user", "second-assistant"])
  })

  it("does not fold different turns that merely share a role", () => {
    const timeline = buildConversationTimeline({
      conversationId: 7,
      localTurns: [
        assistantTurn("turn-1", "第一段", { dedupeKey: "remote:turn-1" }),
        assistantTurn("turn-2", "第二段", { dedupeKey: "remote:turn-2" }),
        assistantTurn("turn-3", "第三段", { dedupeKey: "remote:turn-3" }),
      ],
      liveMessage: null,
    })

    expect(timeline).toHaveLength(3)
  })
})

// 用户截图里标记 ② 的重复：一条逻辑回复被解析器拆成多条连续 assistant 轮次落盘，
// 而 live_message 仍累加着整轮内容，于是「已落盘的前半段」在列表里出现两次 ——
// 第二次带着"执行命令中"的实时气泡从这条回复的开头重播。
// 这些场景下服务端的 in_flight_user_turn_id 是 null（有 ≥2 条尾随 assistant 轮次时
// codeg-plus 主动不打标），所以修复不能依赖它。
describe("buildConversationTimeline live message overlap", () => {
  it("suppresses a multi-segment assistant run covered by the live message", () => {
    const timeline = buildConversationTimeline({
      conversationId: 7,
      localTurns: [
        userTurn("turn-1", "看下那个会话的历史"),
        assistantTurn("turn-2", "我先拉取更多历史。"),
        assistantTurn("turn-3", "找到几个具体问题。"),
      ],
      liveMessage: liveMessage([
        { type: "text", text: "我先拉取更多历史。" },
        { type: "text", text: "找到几个具体问题。" },
        { type: "text", text: "正在执行命令" },
      ]),
      inFlightUserTurnId: null,
    })

    expect(timeline.map((entry) => entry.turn.id)).toEqual(["turn-1", "live-7-live-1"])
    expect(timeline.map((entry) => entry.phase)).toEqual(["completed", "streaming"])
  })

  it("suppresses the covered run even when tool call state drifted", () => {
    const timeline = buildConversationTimeline({
      conversationId: 7,
      localTurns: [
        userTurn("turn-1", "跑一下测试"),
        assistantTurn("turn-2", "我来跑测试。", {
          content: [
            { type: "text", text: "我来跑测试。" },
            // 落盘时记录的是 tool_use 的初始态：还没有 output、status 是 pending
            toolCallPart("call-a", "Bash", { status: "pending" }),
          ],
        }),
      ],
      liveMessage: liveMessage([
        { type: "text", text: "我来跑测试。" },
        // 实时累加器解析 active_tool_calls 后带上了结果
        toolCallPart("call-a", "Bash", { status: "completed", output: "620 passed" }),
        { type: "text", text: "测试通过了。" },
      ]),
      inFlightUserTurnId: null,
    })

    expect(timeline.map((entry) => entry.turn.id)).toEqual(["turn-1", "live-7-live-1"])
  })

  // 关键的反向保护：外部客户端发来的新用户轮次可能还没落盘（等 backfill 补），
  // 此时尾随 assistant 轮次属于**上一轮**，不能因为「live 在跑」就被抹掉。
  it("keeps trailing assistant turns from an earlier turn", () => {
    const timeline = buildConversationTimeline({
      conversationId: 7,
      localTurns: [
        userTurn("turn-1", "第一个问题"),
        assistantTurn("turn-2", "上一轮的完整回答，与本轮无关。"),
      ],
      liveMessage: liveMessage([{ type: "text", text: "这是新一轮的回答。" }]),
      inFlightUserTurnId: null,
    })

    expect(timeline.map((entry) => entry.turn.id)).toEqual([
      "turn-1",
      "turn-2",
      "live-7-live-1",
    ])
  })

  it("suppresses only the covered suffix of a trailing assistant run", () => {
    const timeline = buildConversationTimeline({
      conversationId: 7,
      localTurns: [
        userTurn("turn-1", "第一个问题"),
        assistantTurn("turn-2", "上一轮的回答。"),
        assistantTurn("turn-3", "本轮第一段。"),
      ],
      liveMessage: liveMessage([
        { type: "text", text: "本轮第一段。" },
        { type: "text", text: "本轮第二段。" },
      ]),
      inFlightUserTurnId: null,
    })

    expect(timeline.map((entry) => entry.turn.id)).toEqual([
      "turn-1",
      "turn-2",
      "live-7-live-1",
    ])
  })

  it("keeps persisted turns while the live message is a thinking placeholder", () => {
    const timeline = buildConversationTimeline({
      conversationId: 7,
      localTurns: [
        userTurn("turn-1", "继续"),
        assistantTurn("turn-2", "好的。"),
      ],
      liveMessage: liveMessage([], { isPlaceholderThinking: true, content: [] }),
      inFlightUserTurnId: null,
    })

    expect(timeline.map((entry) => entry.turn.id)).toEqual([
      "turn-1",
      "turn-2",
      "live-7-live-1",
    ])
  })

  // system 轮次（上下文压缩摘要）不是 assistant，必须终止尾部 assistant 串的扫描：
  // 它既不能被抑制掉（那会让「上下文已压缩」提示凭空消失），也不能让它前面那些
  // 属于上一轮的 assistant 轮次被顺带抹掉。
  it("stops the trailing assistant scan at a system turn", () => {
    const timeline = buildConversationTimeline({
      conversationId: 7,
      localTurns: [
        userTurn("turn-1", "继续"),
        assistantTurn("turn-2", "压缩前的回答。"),
        {
          id: "turn-3",
          role: "system",
          content: [{ type: "text", text: "This session is being continued…" }],
          timestamp: 2500,
          status: "completed",
        },
        assistantTurn("turn-4", "压缩后的第一段。"),
      ],
      liveMessage: liveMessage([
        { type: "text", text: "压缩后的第一段。" },
        { type: "text", text: "压缩后的第二段。" },
      ]),
      inFlightUserTurnId: null,
    })

    expect(timeline.map((entry) => entry.turn.id)).toEqual([
      "turn-1",
      "turn-2",
      "turn-3",
      "live-7-live-1",
    ])
  })
})
