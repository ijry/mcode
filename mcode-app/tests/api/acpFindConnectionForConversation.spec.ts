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

  it("keeps the requested remote instance with the ACP request", async () => {
    const calls: Array<{ endpoint: string; data: any; options: any }> = []
    acpApi.__setRequestHookForTest((endpoint, data, options) => {
      calls.push({ endpoint, data, options })
      return null
    })

    await acpApi.acpFindConnectionForConversation(
      502,
      "codex",
      undefined,
      { instanceKey: "instance-codex" }
    )

    expect(calls[0]).toEqual(expect.objectContaining({
      endpoint: "/acp_find_connection_for_conversation",
      options: { instanceKey: "instance-codex" },
    }))
  })
})
