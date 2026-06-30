export type SessionDetailEventItem = Record<string, unknown> & {
  time?: number | string | null
}

export interface SessionDetailBodyProps {
  title?: string
  messageText: string
  events: SessionDetailEventItem[]
  sendDisabled?: boolean
  stopDisabled?: boolean
  approveDisabled?: boolean
}

export function getSessionDetailEventKey(
  event: SessionDetailEventItem,
  index: number,
): string {
  return String(event.time ?? index)
}
