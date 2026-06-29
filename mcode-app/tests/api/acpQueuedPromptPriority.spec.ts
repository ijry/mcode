import { acpApi } from "@/api/acp"

describe("acpApi queued prompt priority controls", () => {
  afterEach(() => {
    acpApi.__setRequestHookForTest(null)
  })

  it("sends acp_reorder_queued_prompt with explicit session id", async () => {
    const calls: Array<{ endpoint: string; data: any }> = []
    acpApi.__setRequestHookForTest((endpoint, data) => {
      calls.push({ endpoint, data })
      return { status: "reordered" }
    })

    await expect(
      acpApi.acpReorderQueuedPrompt("conn-1", "queue-1", "move_top", "session-1")
    ).resolves.toEqual({ status: "reordered" })

    expect(calls).toEqual([{
      endpoint: "/acp_reorder_queued_prompt",
      data: {
        connectionId: "conn-1",
        sessionId: "session-1",
        queueItemId: "queue-1",
        action: "move_top",
      },
    }])
  })

  it("defaults reorder session id to the connection id", async () => {
    const calls: Array<{ endpoint: string; data: any }> = []
    acpApi.__setRequestHookForTest((endpoint, data) => {
      calls.push({ endpoint, data })
      return { status: "reordered" }
    })

    await acpApi.acpReorderQueuedPrompt("conn-1", "queue-1", "move_down")

    expect(calls[0].data.sessionId).toBe("conn-1")
  })

  it("sends acp_set_queued_prompt_priority with explicit session id", async () => {
    const calls: Array<{ endpoint: string; data: any }> = []
    acpApi.__setRequestHookForTest((endpoint, data) => {
      calls.push({ endpoint, data })
      return { status: "updated" }
    })

    await expect(
      acpApi.acpSetQueuedPromptPriority("conn-1", "queue-1", "high", "session-1")
    ).resolves.toEqual({ status: "updated" })

    expect(calls).toEqual([{
      endpoint: "/acp_set_queued_prompt_priority",
      data: {
        connectionId: "conn-1",
        sessionId: "session-1",
        queueItemId: "queue-1",
        priorityTier: "high",
      },
    }])
  })
})
