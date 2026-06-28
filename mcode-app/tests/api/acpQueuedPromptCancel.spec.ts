import { acpApi } from "@/api/acp"

describe("acpApi queued prompt cancellation", () => {
  afterEach(() => {
    acpApi.__setRequestHookForTest(null)
  })

  it("sends acp_cancel_queued_prompt with explicit session id", async () => {
    const calls: Array<{ endpoint: string; data: any }> = []
    acpApi.__setRequestHookForTest((endpoint, data) => {
      calls.push({ endpoint, data })
      return { status: "cancelled" }
    })

    await expect(
      acpApi.acpCancelQueuedPrompt("conn-1", "queue-1", "session-1")
    ).resolves.toEqual({ status: "cancelled" })

    expect(calls).toEqual([{
      endpoint: "/acp_cancel_queued_prompt",
      data: {
        connectionId: "conn-1",
        sessionId: "session-1",
        queueItemId: "queue-1",
        reason: "user_cancelled",
      },
    }])
  })

  it("defaults session id to connection id", async () => {
    const calls: Array<{ endpoint: string; data: any }> = []
    acpApi.__setRequestHookForTest((endpoint, data) => {
      calls.push({ endpoint, data })
      return { status: "cancelled" }
    })

    await acpApi.acpCancelQueuedPrompt("conn-1", "queue-1")

    expect(calls[0].data.sessionId).toBe("conn-1")
  })

  it("sends acp_cancel_all_queued_prompts with explicit session id", async () => {
    const calls: Array<{ endpoint: string; data: any }> = []
    acpApi.__setRequestHookForTest((endpoint, data) => {
      calls.push({ endpoint, data })
      return { status: "cancelled", cancelledCount: 2 }
    })

    await expect(
      acpApi.acpCancelAllQueuedPrompts("conn-1", "session-1")
    ).resolves.toEqual({ status: "cancelled", cancelledCount: 2 })

    expect(calls).toEqual([{
      endpoint: "/acp_cancel_all_queued_prompts",
      data: {
        connectionId: "conn-1",
        sessionId: "session-1",
        reason: "user_cancelled_all",
      },
    }])
  })
})
