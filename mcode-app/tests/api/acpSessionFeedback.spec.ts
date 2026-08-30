import { acpApi } from "@/api/acp"

describe("acpApi session feedback", () => {
  afterEach(() => {
    acpApi.__setRequestHookForTest(null)
  })

  it("routes feedback through the requested remote instance", async () => {
    const calls: Array<{ endpoint: string; data: any; options: any }> = []
    const item = {
      id: "feedback-1",
      text: "please keep the change small",
      status: "delivered",
    }
    acpApi.__setRequestHookForTest((endpoint, data, options) => {
      calls.push({ endpoint, data, options })
      return item
    })

    await expect(
      acpApi.acpSubmitSessionFeedback(
        "connection-1",
        "please keep the change small",
        { instanceKey: "remote-codeg" },
      ),
    ).resolves.toBe(item)

    expect(calls).toEqual([{
      endpoint: "/submit_session_feedback",
      data: {
        connectionId: "connection-1",
        text: "please keep the change small",
      },
      options: { instanceKey: "remote-codeg" },
    }])
  })
})
