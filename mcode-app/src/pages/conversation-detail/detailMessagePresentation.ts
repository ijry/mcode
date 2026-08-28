import type { ContentPart, MessageTurn } from "@/types/acp"

export interface RenderMessageItem {
  key: string
  anchorId: string
  sourceIds: string[]
  message: MessageTurn
}

/**
 * 返回时间线上最新的用户轮次。
 *
 * 轮次数组可能由历史尾窗与实时事件拼接而成，数组末尾不再等价于最新消息。
 * 有效时间戳优先；同一时间戳或全部缺失时保留原数组位置作为稳定 tie-break，
 * 以保证连续发送相同文本时不会随机切换目标。
 */
export function findLatestUserMessage(messages: MessageTurn[]): MessageTurn | undefined {
  let latest: MessageTurn | undefined
  let latestTimestamp: number | null = null
  let latestIndex = -1
  let hasTimestamp = false

  messages.forEach((message, index) => {
    if (message?.role !== "user") return
    const timestamp = Number(message.timestamp)
    const validTimestamp = Number.isFinite(timestamp) && timestamp > 0

    if (!latest) {
      latest = message
      latestTimestamp = validTimestamp ? timestamp : null
      hasTimestamp = validTimestamp
      latestIndex = index
      return
    }

    if (validTimestamp && (!hasTimestamp || timestamp >= (latestTimestamp as number))) {
      latest = message
      latestTimestamp = timestamp
      hasTimestamp = true
      latestIndex = index
      return
    }

    if (!hasTimestamp && !validTimestamp && index >= latestIndex) {
      latest = message
      latestIndex = index
    }
  })

  return latest
}

function cloneContentParts(parts: ContentPart[]): ContentPart[] {
  return JSON.parse(JSON.stringify(parts || [])) as ContentPart[]
}

export function buildRenderMessageItems(messages: MessageTurn[]): RenderMessageItem[] {
  if (!Array.isArray(messages) || messages.length === 0) return []

  const result: RenderMessageItem[] = []
  let assistantBuffer: MessageTurn[] = []

  const pushBufferedAssistantMessages = () => {
    if (assistantBuffer.length === 0) return

    if (assistantBuffer.length === 1) {
      const single = assistantBuffer[0]
      result.push({
        key: single.id,
        anchorId: single.id,
        sourceIds: [single.id],
        message: single,
      })
      assistantBuffer = []
      return
    }

    const first = assistantBuffer[0]
    const last = assistantBuffer[assistantBuffer.length - 1]
    result.push({
      key: `merged-${first.id}-${last.id}`,
      anchorId: last.id,
      sourceIds: assistantBuffer.map((item) => item.id),
      message: {
        ...last,
        id: last.id,
        content: assistantBuffer.flatMap((item) => cloneContentParts(item.content || [])),
        timestamp: last.timestamp,
      },
    })
    assistantBuffer = []
  }

  for (const message of messages) {
    // 只有 assistant 轮次参与合并。system（上下文压缩摘要等注入上下文）必须独立成项，
    // 否则会被拼进相邻 agent 回复的气泡里，等于把内部说明混进正文。
    if (message.role === "assistant") {
      assistantBuffer.push(message)
      continue
    }

    pushBufferedAssistantMessages()
    result.push({
      key: message.id,
      anchorId: message.id,
      sourceIds: [message.id],
      message,
    })
  }

  pushBufferedAssistantMessages()
  return result
}
