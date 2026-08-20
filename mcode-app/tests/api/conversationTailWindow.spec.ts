import { acpApi } from "@/api/acp"
import {
  DEFAULT_CONVERSATION_HISTORY_PAGE_SIZE,
  METADATA_ONLY_CONVERSATION_TAIL_TURNS,
} from "@/services/conversation/conversationHistoryWindowContract"

/**
 * 全量会话查询必须无法被表达。
 *
 * 服务端 `resolve_turn_window_req(None, None) => Ok(None)` 会走 legacy 分支返回**完整**
 * 轮次列表，并且四个窗口元数据字段被 `skip_serializing_if` 整体省略。这条路不是冷门
 * 分支 —— `calibrateAfterReplayGap` 在流式期间每 ≥1.5s 被触发一次，手机端曾因此在每次
 * 回复过程中反复全量拉取整个会话历史。
 */
describe("get_folder_conversation always carries a turn window", () => {
  const calls: Array<{ endpoint: string; data: any }> = []

  beforeEach(() => {
    calls.length = 0
    acpApi.__setRequestHookForTest((endpoint, data) => {
      calls.push({ endpoint, data })
      return { turns: [] }
    })
  })

  afterEach(() => {
    acpApi.__setRequestHookForTest(null)
  })

  it("defaults to a 30-turn tail window", async () => {
    await acpApi.getFolderConversation(42)

    expect(calls).toHaveLength(1)
    expect(calls[0].endpoint).toBe("/get_folder_conversation")
    expect(calls[0].data).toEqual({
      conversationId: 42,
      tailTurns: DEFAULT_CONVERSATION_HISTORY_PAGE_SIZE,
    })
    expect(DEFAULT_CONVERSATION_HISTORY_PAGE_SIZE).toBe(30)
  })

  it("lets metadata-only callers ask for the minimum window", async () => {
    await acpApi.getFolderConversation(42, {
      tailTurns: METADATA_ONLY_CONVERSATION_TAIL_TURNS,
    })

    // 服务端 clamp 是 1..=500，`tailTurns: 0` 会被抬成 1，所以直接写 1 更诚实。
    expect(METADATA_ONLY_CONVERSATION_TAIL_TURNS).toBe(1)
    expect(calls[0].data).toEqual({ conversationId: 42, tailTurns: 1 })
  })

  it("never puts an undefined selector on the wire", async () => {
    // 两个选择器互斥：`tailTurns: undefined` 作为显式 key 上线会让服务端把它和
    // fromIndex 同时视为「已提供」而报 mutually exclusive。
    await acpApi.getFolderConversation(42, { fromIndex: 90 })

    expect(calls[0].data).toEqual({ conversationId: 42, fromIndex: 90 })
    expect(Object.prototype.hasOwnProperty.call(calls[0].data, "tailTurns")).toBe(false)
  })

  it("refuses to express a full fetch even when handed an empty selector", async () => {
    // 空对象是唯一可能绕过默认参数的写法（默认值只在实参为 undefined 时生效），
    // 所以兜底逻辑在函数体里，不在签名上。
    await acpApi.getFolderConversation(42, {})

    expect(calls[0].data).toEqual({
      conversationId: 42,
      tailTurns: DEFAULT_CONVERSATION_HISTORY_PAGE_SIZE,
    })
  })

  it("keeps the two selectors mutually exclusive when both are given", async () => {
    // 服务端对同时提供两个选择器会直接报错。fromIndex 更具体（它是翻页坐标，
    // 且永不向前对齐），优先它。
    await acpApi.getFolderConversation(42, { fromIndex: 90, tailTurns: 30 })

    expect(calls[0].data).toEqual({ conversationId: 42, fromIndex: 90 })
  })
})
