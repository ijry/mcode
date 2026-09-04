import {
  canEditSharedPromptQueue,
  buildTimelineTailSignature,
  draftSummary,
  formatQueueTime,
  formatTokenCountK,
  hasSharedPromptQueue,
  isAssistantTailSignature,
  isSharedPromptQueueCancelDisabled,
  isSharedPromptQueueClearDisabled,
  isStoppableRuntimeStatus,
  looksLikeNetworkFailure,
  queueStatusText,
  sharedPromptQueueItemPreview,
  sharedPromptQueueItemSource,
  sharedPromptQueuePriorityLabel,
  sharedPromptQueuePositionLabel,
  sharedPromptQueueSummary,
  sharedPromptQueueTitle,
} from "@/pages/conversation-detail/detailRuntimePresentation"
import type { QueuedDraft, UploadedAttachment } from "@/pages/conversation-detail/detailDataNormalization"

const attachment = (name: string): UploadedAttachment => ({
  id: name,
  name,
  url: `https://file/${name}`,
  size: 1,
  type: "text/plain",
  kind: "file",
})

describe("detailRuntimePresentation", () => {
  it("formats token counts in compact K units", () => {
    expect(formatTokenCountK(0)).toBe("0")
    expect(formatTokenCountK(999)).toBe("<1K")
    expect(formatTokenCountK(1500)).toBe("1.5K")
    expect(formatTokenCountK(12_300)).toBe("12.3K")
    expect(formatTokenCountK(123_400)).toBe("123K")
  })

  it("detects stoppable runtime statuses", () => {
    expect(isStoppableRuntimeStatus("thinking")).toBe(true)
    expect(isStoppableRuntimeStatus("running_tool")).toBe(true)
    expect(isStoppableRuntimeStatus("waiting_permission")).toBe(true)
    expect(isStoppableRuntimeStatus("waiting_question")).toBe(true)
    expect(isStoppableRuntimeStatus("connected")).toBe(false)
  })

  // `buildTimelineTailSignature` 取代了原来的 `buildLiveActivitySignature`（后者把整条
  // live 正文序列化成字符串，被两个 watch 在每个流式 delta 上各调一次）。这里锁的是
  // 「常数长度 + 内容真变才变 + role 编在第一段」这三条契约。
  describe("buildTimelineTailSignature", () => {
    it("encodes assistant role first when a live message is streaming", () => {
      const signature = buildTimelineTailSignature({
        localTurns: [{ id: "t1", role: "user", status: "completed" }],
        liveMessage: { id: "live-9", content: [{ type: "text", text: "hello" }] },
      })

      expect(isAssistantTailSignature(signature)).toBe(true)
      expect(signature).toBe("assistant|live-9|1|text|5|||0")
    })

    it("falls back to the last completed turn when there is no live message", () => {
      const signature = buildTimelineTailSignature({
        localTurns: [
          { id: "t1", role: "user", status: "completed" },
          { id: "t2", role: "assistant", status: "completed" },
        ],
        liveMessage: null,
      })

      expect(signature).toBe("assistant|t2|2|completed")
      expect(isAssistantTailSignature(signature)).toBe(true)
    })

    it("marks a user tail as not-assistant", () => {
      const signature = buildTimelineTailSignature({
        localTurns: [{ id: "t1", role: "user", status: "completed" }],
        liveMessage: null,
      })

      expect(isAssistantTailSignature(signature)).toBe(false)
    })

    it("changes when the streaming tail grows and stays put when nothing moved", () => {
      const build = (text: string) =>
        buildTimelineTailSignature({
          localTurns: [],
          liveMessage: { id: "live-1", content: [{ type: "text", text }] },
        })

      expect(build("ab")).not.toBe(build("abc"))
      expect(build("abc")).toBe(build("abc"))
    })

    it("tracks the tail tool call without serializing its payload", () => {
      const signature = buildTimelineTailSignature({
        localTurns: [],
        liveMessage: {
          id: "live-1",
          content: [
            { type: "text", text: "hi" },
            {
              type: "tool_call",
              tool_call: {
                id: "tool-7",
                name: "Read",
                status: "running",
                // 大载荷不能进签名 —— 长度是常数级的，内容不是。
                input: { path: "a".repeat(10_000) },
                output: "b".repeat(10_000),
              },
            },
          ],
        },
      })

      expect(signature).toBe("assistant|live-1|2|tool_call|0|tool-7|running|10000")
      expect(signature.length).toBeLessThan(80)
    })

    it("returns an empty signature for an empty timeline", () => {
      expect(buildTimelineTailSignature({ localTurns: [], liveMessage: null })).toBe("")
      expect(isAssistantTailSignature("")).toBe(false)
    })
  })

  it("formats queued draft labels", () => {
    const draft: QueuedDraft = {
      id: "draft-1",
      text: "  send this  ",
      attachments: [attachment("a.txt")],
      createdAt: new Date(2026, 0, 1, 9, 5).getTime(),
      status: "pending",
    }

    expect(draftSummary(draft)).toBe("send this（1 个附件）")
    expect(draftSummary({ ...draft, text: "  ", attachments: [attachment("a.txt"), attachment("b.txt")] }))
      .toBe("附件消息（2 个）")
    expect(queueStatusText("sending")).toBe("发送中")
    expect(queueStatusText("failed")).toBe("失败")
    expect(queueStatusText("pending")).toBe("待发送")
    expect(formatQueueTime(draft.createdAt)).toBe("09:05")
  })

  it("formats shared Desktop prompt queue copy", () => {
    const queue = {
      count: 2,
      items: [
        {
          queueItemId: "queue-1",
          queuePosition: 1,
          priorityTier: "high",
          sourceClientId: "client-phone",
          sourceDeviceName: "Phone",
          promptPreview: "run tests",
          createdAtMs: new Date(2026, 0, 1, 9, 5).getTime(),
        },
        {
          queueItemId: "queue-2",
          queuePosition: 2,
          priorityTier: "normal",
          sourceClientId: "client-watch",
          sourceDeviceName: "Watch",
          promptPreview: "",
        },
      ],
    }

    expect(hasSharedPromptQueue(queue)).toBe(true)
    expect(sharedPromptQueueTitle(queue)).toBe("Desktop 队列 2")
    expect(sharedPromptQueueSummary(queue)).toBe("run tests")
    expect(sharedPromptQueueItemPreview(queue.items[1])).toBe("队列任务")
    expect(sharedPromptQueueItemSource(queue.items[0], "client-phone")).toBe("当前设备")
    expect(sharedPromptQueueItemSource(queue.items[1], "client-phone")).toBe("Watch")
    expect(sharedPromptQueueItemSource({ queueItemId: "queue-3" }, "client-phone")).toBe("其他设备")
    expect(sharedPromptQueuePositionLabel(queue.items[0], 0)).toBe("#1")
    expect(sharedPromptQueuePositionLabel({ queueItemId: "queue-3" }, 2)).toBe("#3")
    expect(sharedPromptQueuePriorityLabel(queue.items[0])).toBe("高优先级")
    expect(sharedPromptQueuePriorityLabel(queue.items[1])).toBe("普通")
  })

  it("gates shared queue mutations on Desktop capability metadata", () => {
    const queue = { count: 1, items: [{ queueItemId: "queue-1" }] }
    expect(canEditSharedPromptQueue(queue, [])).toBe(false)
    expect(canEditSharedPromptQueue(queue, ["desktop.queue.reorder"])).toBe(true)
    expect(canEditSharedPromptQueue(queue, ["desktop.queue.priority"])).toBe(true)
  })

  it("detects shared queue cancel disabled state", () => {
    expect(isSharedPromptQueueCancelDisabled("", new Set())).toBe(true)
    expect(isSharedPromptQueueCancelDisabled("queue-1", new Set(["queue-1"]))).toBe(true)
    expect(isSharedPromptQueueCancelDisabled("queue-1", ["queue-2"])).toBe(false)
  })

  it("detects shared queue clear disabled state", () => {
    expect(isSharedPromptQueueClearDisabled({ count: 1, items: [] }, "conn-1", false)).toBe(false)
    expect(isSharedPromptQueueClearDisabled({ count: 0, items: [] }, "conn-1", false)).toBe(true)
    expect(isSharedPromptQueueClearDisabled({ count: 1, items: [] }, "", false)).toBe(true)
    expect(isSharedPromptQueueClearDisabled({ count: 1, items: [] }, "conn-1", true)).toBe(true)
  })

  it("detects network-like failure copy", () => {
    expect(looksLikeNetworkFailure("WebSocket connection timed out")).toBe(true)
    expect(looksLikeNetworkFailure("主机网络不可达")).toBe(true)
    expect(looksLikeNetworkFailure("permission denied")).toBe(false)
  })
})
