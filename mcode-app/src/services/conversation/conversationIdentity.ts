/**
 * 会话号的解析。
 *
 * 抽出来的直接理由是 `pages/conversations/index.vue` 与 `pages/todos/index.vue` 里有两份
 * **逐字相同**的副本（都用在「新建会话后取 id」这一步）。
 *
 * 之所以需要这么宽容：`create_conversation` 的返回形状在不同后端版本间变过 —— 有时是裸
 * 数字，有时是 `{id}`，有时是 `{conversationId}`，且数字可能以字符串下发。少认一种，
 * 新建会话就会报「创建会话失败：返回数据异常」，而会话其实已经在服务端建好了。
 */
export function parseConversationId(input: unknown): number {
  if (typeof input === "number" && Number.isFinite(input)) return input
  if (typeof input === "string") {
    const parsed = Number(input)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  if (input && typeof input === "object") {
    // `id` 优先于 `conversationId`：两者同时出现时前者是会话自身的主键。
    const maybeId = (input as any).id ?? (input as any).conversationId
    if (typeof maybeId === "number" && Number.isFinite(maybeId)) return maybeId
    if (typeof maybeId === "string") {
      const parsed = Number(maybeId)
      if (Number.isFinite(parsed) && parsed > 0) return parsed
    }
  }
  // 0 是「解析失败」的哨兵值，调用方靠它抛「返回数据异常」。
  return 0
}
