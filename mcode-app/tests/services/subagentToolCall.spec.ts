import {
  buildSubagentCapsuleView,
  clampSubagentStats,
  formatSubagentDuration,
  isSubagentPart,
  isSubagentToolCall,
  isSubagentToolName,
  normalizeSubagentStats,
  parseSubagentLaunch,
} from "@/services/conversation/subagentToolCall"
import type { ToolCall } from "@/types/acp"

function toolCall(patch: Partial<ToolCall> = {}): ToolCall {
  return {
    id: "tool-1",
    name: "Task",
    input: {},
    status: "completed",
    ...patch,
  } as ToolCall
}

describe("subagentToolCall 识别", () => {
  // 这张矩阵是本次改动风险最集中的地方：判错一边是「一个子智能体任务被并进
  // 『调用 N 个工具』的通用分组、正文继续整段撑爆父气泡」，判错另一边是「每个
  // TaskCreate / wait_agent 都长出一个假胶囊」。逐条锁死。
  it.each([
    // 四家原生的发起工具名
    ["Task", true],
    ["Agent", true],
    ["spawn_agent", true],
    ["spawn_subagent", true],
    // `task` 只能精确相等。TaskCreate/TaskUpdate/TaskList 归一后是 taskcreate/…，
    // 前缀匹配会把整个计划面板变成子智能体胶囊。
    ["TaskCreate", false],
    ["TaskUpdate", false],
    ["TaskList", false],
    ["TaskGet", false],
    // DENY：这些名字含 `agent` 词边界，会被 freeform 兜底误收。
    ["wait_agent", false],
    ["close_agent", false],
    // 另一套委派系统（codeg `delegate_to_agent`），本模块不接管。
    ["delegate_to_agent", false],
    ["get_delegation_status", false],
    ["cancel_delegation", false],
    ["background_task", false],
    // freeform 兜底：自定义名字里带独立的 `agent` 词。
    ["call_omo_agent", true],
    // mcp 前缀要剥掉再判。
    ["mcp__foo__spawn_agent", true],
    ["mcp__foo__TaskCreate", false],
    // 空/垃圾输入
    ["", false],
    ["Read", false],
    ["Grep", false],
  ])("isSubagentToolName(%p) === %p", (name, expected) => {
    expect(isSubagentToolName(name)).toBe(expected)
  })

  // 这条单独拎出来：freeform 兜底最初写成 `/\bagent\b/`，而 `canonicalToolName` 把所有
  // 分隔符归一成 `_`、`_` 在正则里算单词字符，于是 `\b` 在 snake_case 内部永远不成立 ——
  // 整个兜底是死代码，连 DENY 列表「挡住 wait_agent 假胶囊」的理由都落在一个从不触发的
  // 分支上（DENY 命中在前，所以矩阵里那几条 false 照样是绿的、掩盖了这个 bug）。
  it("matches the agent word segment without relying on regex word boundaries", () => {
    expect(isSubagentToolName("call_omo_agent")).toBe(true)
    expect(isSubagentToolName("my agent runner")).toBe(true)
    expect(isSubagentToolName("Agent-Runner")).toBe(true)
    // 只有独立词段才算。`spawn_subagent` 能中是靠上面那个精确集，不是靠这个兜底。
    expect(isSubagentToolName("agentic_loop")).toBe(false)
    expect(isSubagentToolName("subagent")).toBe(false)
  })

  it("treats the claudeCode.subagent marker as authoritative", () => {
    // 权威标记优先于工具名：服务端认出来了，名字长什么样都不重要。
    expect(
      isSubagentToolCall(
        toolCall({ name: "SomeUnknownTool", meta: { claudeCode: { subagent: true } } }),
      ),
    ).toBe(true)
  })

  it("requires the marker to be a strict boolean true", () => {
    // 字符串 `"true"` 不算。truthy 判断会让任何带这个键的调用都变成胶囊，
    // 而这个键在协议里是可选的、上游拼错过大小写。
    expect(
      isSubagentToolCall(
        toolCall({ name: "Read", meta: { claudeCode: { subagent: "true" } } }),
      ),
    ).toBe(false)
    expect(isSubagentToolCall(toolCall({ name: "Read", meta: { claudeCode: { subagent: 1 } } }))).toBe(
      false,
    )
    expect(isSubagentToolCall(toolCall({ name: "Read", meta: {} }))).toBe(false)
    expect(isSubagentToolCall(toolCall({ name: "Read", meta: null }))).toBe(false)
  })

  it("keeps DENY ahead of the input shape and the name", () => {
    // 判定顺序是语义的一部分：DENY 必须挡在 input 形状之前，否则一个带
    // subagent_type 的 wait_agent（等待子智能体完成，本身不是发起）会长出第二个胶囊。
    expect(
      isSubagentToolCall(toolCall({ name: "wait_agent", input: { subagent_type: "Explore" } })),
    ).toBe(false)
  })

  it("falls back to the input shape for unnamed launchers", () => {
    expect(isSubagentToolCall(toolCall({ name: "run", input: { subagent_type: "Explore" } }))).toBe(
      true,
    )
    expect(isSubagentToolCall(toolCall({ name: "run", input: { subagentType: "Explore" } }))).toBe(
      true,
    )
    // 键存在即算，值为空串也算 —— 形状本身就是信号。
    expect(isSubagentToolCall(toolCall({ name: "run", input: { subagent_type: "" } }))).toBe(true)
  })

  it("ignores non tool_call parts", () => {
    expect(isSubagentPart({ type: "text", text: "Task" } as any)).toBe(false)
    expect(isSubagentPart({ type: "tool_call", tool_call: toolCall() } as any)).toBe(true)
    expect(isSubagentPart(null)).toBe(false)
    expect(isSubagentToolCall(null)).toBe(false)
  })
})

describe("subagentToolCall 解析 input", () => {
  it("reads the four vendors' spellings", () => {
    expect(
      parseSubagentLaunch(
        toolCall({
          input: {
            subagent_type: "Explore",
            description: "找出所有归一化点",
            prompt: "grep 一下",
            model: "sonnet",
          },
        }),
      ),
    ).toEqual({
      subagentType: "Explore",
      description: "找出所有归一化点",
      prompt: "grep 一下",
      model: "sonnet",
    })

    // Codex `spawn_agent` 用 agent_type。
    expect(parseSubagentLaunch(toolCall({ input: { agent_type: "coder" } })).subagentType).toBe(
      "coder",
    )
  })

  it("returns nulls instead of empty strings for missing fields", () => {
    // 标题拼接靠 null 判断决定要不要拼冒号，空串会拼出 ": " 这种残缺前缀。
    expect(parseSubagentLaunch(toolCall({ input: {} }))).toEqual({
      subagentType: null,
      description: null,
      prompt: null,
      model: null,
    })
    expect(parseSubagentLaunch(toolCall({ input: { subagent_type: "   " } })).subagentType).toBeNull()
    expect(parseSubagentLaunch(toolCall({ input: null as any })).description).toBeNull()
  })
})

describe("subagentToolCall 解析 agent_stats", () => {
  it("maps the server snake_case in exactly one place", () => {
    // 6 处归一化都只做哑透传，字段映射只在这里发生 —— 服务端加字段时不用改归一化。
    const stats = normalizeSubagentStats({
      agent_type: "Explore",
      status: "completed",
      total_duration_ms: 12_500,
      total_tokens: 4321,
      total_tool_use_count: 9,
      child_session_id: "sess-child",
      tool_calls: [
        { tool_name: "Grep", input_preview: "{}", output_preview: "3 hits", is_error: false },
        { tool_name: "Read", is_error: true },
      ],
    })

    expect(stats).toEqual({
      agentType: "Explore",
      status: "completed",
      totalDurationMs: 12_500,
      totalTokens: 4321,
      totalToolUseCount: 9,
      childSessionId: "sess-child",
      toolCallsTruncated: null,
      toolCalls: [
        { toolName: "Grep", inputPreview: "{}", outputPreview: "3 hits", isError: false },
        { toolName: "Read", inputPreview: null, outputPreview: null, isError: true },
      ],
    })
  })

  it("also accepts camelCase and drops nameless entries", () => {
    const stats = normalizeSubagentStats({
      agentType: "coder",
      totalDurationMs: 500,
      toolCalls: [{ toolName: "Edit", isError: true }, { input_preview: "no name" }, null, "junk"],
    })
    expect(stats?.agentType).toBe("coder")
    expect(stats?.toolCalls).toEqual([
      { toolName: "Edit", inputPreview: null, outputPreview: null, isError: true },
    ])
  })

  it("returns null for non-objects", () => {
    expect(normalizeSubagentStats(null)).toBeNull()
    expect(normalizeSubagentStats(undefined)).toBeNull()
    expect(normalizeSubagentStats("{}")).toBeNull()
    // 数组也要拒：`recordFromUnknown` 排除 Array，否则会拿到一个字段全 null 的空壳
    // stats，胶囊上就多出一行「状态：—」。
    expect(normalizeSubagentStats([])).toBeNull()
  })
})

describe("clampSubagentStats", () => {
  it("keeps the newest tool calls and reports how many were dropped", () => {
    const raw = {
      status: "completed",
      tool_calls: Array.from({ length: 35 }, (_, index) => ({ tool_name: `Tool${index}` })),
    }
    const clamped = clampSubagentStats(raw)

    expect(clamped?.tool_calls).toHaveLength(30)
    // 留尾部：越晚的调用越接近最终结果。
    expect(clamped?.tool_calls[0].tool_name).toBe("Tool5")
    expect(clamped?.tool_calls[29].tool_name).toBe("Tool34")
    // 裁掉的条数必须透出来，否则展开后是一份掐了头的列表却没有任何提示，
    // 用户会以为子智能体只跑了这几个工具。
    expect(clamped?.tool_calls_truncated).toBe(5)
    expect(normalizeSubagentStats(clamped).toolCallsTruncated).toBe(5)
  })

  it("clamps previews and leaves the payload snake_case", () => {
    const clamped = clampSubagentStats(
      {
        agent_type: "Explore",
        tool_calls: [{ tool_name: "Read", input_preview: "x".repeat(500), output_preview: "y" }],
      },
      { maxPreviewChars: 10 },
    )

    expect(clamped?.tool_calls[0].input_preview).toBe(`${"x".repeat(10)}…`)
    expect(clamped?.tool_calls[0].output_preview).toBe("y")
    // 输出保持 snake_case —— 它就是要被原样存进 SQLite 的形状
    // （`toPersistedPartPayload` 存整个 tool_call）。转成 camelCase 会让缓存那份
    // 和远端那份形状不一致。
    expect(clamped?.agent_type).toBe("Explore")
    expect(clamped).not.toHaveProperty("agentType")
  })

  it("does not invent a truncation count when nothing was dropped", () => {
    const clamped = clampSubagentStats({ tool_calls: [{ tool_name: "Read" }] })
    expect(clamped).not.toHaveProperty("tool_calls_truncated")
  })

  it("returns null for non-objects so归一化 can store null", () => {
    expect(clampSubagentStats(null)).toBeNull()
    expect(clampSubagentStats("{}")).toBeNull()
  })
})

describe("formatSubagentDuration", () => {
  it.each([
    [0, ""],
    [-5, ""],
    [null, ""],
    [NaN, ""],
    [450, "450ms"],
    [1500, "1.5s"],
    [59_900, "59.9s"],
    [60_000, "1m"],
    [95_000, "1m35s"],
  ])("formats %p as %p", (ms, expected) => {
    expect(formatSubagentDuration(ms as number | null)).toBe(expected)
  })
})

describe("buildSubagentCapsuleView", () => {
  it("takes state from ToolCall.status, not agent_stats.status", () => {
    // 用户看的是这个 tool call。`agent_stats.status` 是子智能体自己的状态，两者
    // 可能不一致（子智能体报 completed、外层 tool_result 还没回来），拿它当胶囊
    // 状态会出现「已完成却还在转圈」或反之。
    const view = buildSubagentCapsuleView({
      toolCall: toolCall({ status: "running", agentStats: { status: "completed" } }),
    })
    expect(view.state).toBe("running")
    expect(view.isRunning).toBe(true)
    expect(view.stats?.status).toBe("completed")
  })

  it("never spins on pending", () => {
    // 附着到一个已有会话时，快照里的调用可能是 pending 且永远不会再收到事件 ——
    // 让 pending 转圈就是一个永久旋转的胶囊。
    const view = buildSubagentCapsuleView({ toolCall: toolCall({ status: "pending" }) })
    expect(view.state).toBe("pending")
    expect(view.isRunning).toBe(false)
  })

  it("maps error status", () => {
    const view = buildSubagentCapsuleView({ toolCall: toolCall({ status: "error", error: "boom" }) })
    expect(view.state).toBe("error")
    expect(view.isError).toBe(true)
    expect(view.hasBody).toBe(true)
  })

  it("builds the title without leaving placeholder fragments", () => {
    expect(
      buildSubagentCapsuleView({
        toolCall: toolCall({ input: { subagent_type: "Explore", description: "找归一化点" } }),
      }).title,
    ).toBe("Explore: 找归一化点")
    expect(
      buildSubagentCapsuleView({ toolCall: toolCall({ input: { subagent_type: "Explore" } }) }).title,
    ).toBe("Explore")
    expect(
      buildSubagentCapsuleView({ toolCall: toolCall({ input: { description: "只有描述" } }) }).title,
    ).toBe("只有描述")
    // 兜底文案独立成句，绝不拼在真实内容前面（"子智能体: Explore" 是噪声）。
    expect(buildSubagentCapsuleView({ toolCall: toolCall() }).title).toBe("子智能体")
    // 没有 subagent_type 时用 agent_stats.agentType 兜底。
    expect(
      buildSubagentCapsuleView({ toolCall: toolCall({ agentStats: { agent_type: "coder" } }) }).title,
    ).toBe("coder")
  })

  it("keeps the transcript tail, not its head", () => {
    // 尾部才是最新进展。裁头保尾意味着流式期间胶囊里看到的是「刚刚发生的事」。
    const view = buildSubagentCapsuleView({
      toolCall: toolCall(),
      transcript: `${"a".repeat(50)}TAIL`,
      transcriptTailChars: 10,
    })
    expect(view.transcriptTail).toBe("aaaaaaTAIL")
    expect(view.hasBody).toBe(true)
  })

  it("reports no body when there is genuinely nothing to expand", () => {
    // hasBody === false 时胶囊不显示展开箭头 —— 点开一片空白比不能点更糟。
    const view = buildSubagentCapsuleView({ toolCall: toolCall({ input: { subagent_type: "Explore" } }) })
    expect(view.hasBody).toBe(false)

    // 只有空白的 output 也不算内容。
    expect(
      buildSubagentCapsuleView({ toolCall: toolCall({ output: "   \n  " }) }).hasBody,
    ).toBe(false)
    // 内层工具列表本身就是可展开内容。
    expect(
      buildSubagentCapsuleView({
        toolCall: toolCall({ agentStats: { tool_calls: [{ tool_name: "Read" }] } }),
      }).hasBody,
    ).toBe(true)
  })
})
