import { acpApi } from "@/api/acp"

describe("acpApi find connection for conversation", () => {
  afterEach(() => {
    acpApi.__setRequestHookForTest(null)
  })

  it("sends conversation and agent identity for direct backend discovery", async () => {
    const calls: Array<{ endpoint: string; data: any }> = []
    acpApi.__setRequestHookForTest((endpoint, data) => {
      calls.push({ endpoint, data })
      return null
    })

    await expect(
      acpApi.acpFindConnectionForConversation(501, "claude_code", "sess-501")
    ).resolves.toBeNull()

    expect(calls).toEqual([{
      endpoint: "/acp_find_connection_for_conversation",
      data: {
        conversationId: 501,
        conversation_id: 501,
        agentType: "claude_code",
        agent_type: "claude_code",
        sessionId: "sess-501",
        session_id: "sess-501",
      },
    }])
  })
})
