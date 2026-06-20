import type { ContentPart, MessageTurn } from "@/types/acp"

export interface RenderMessageItem {
  key: string
  anchorId: string
  sourceIds: string[]
  message: MessageTurn
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
