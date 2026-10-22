/**
 * 「隐藏已完成会话」开关（**默认开启**）。
 *
 * 只影响会话列表的**可见性**：不落盘、不改状态、不影响底部 tab 角标（那条走
 * `conversationTabBadgeService` + 服务端 `pet_list_active_sessions`，与列表过滤解耦）。
 * 被隐藏的会话由**左上角视图面板**里的「显示已完成会话」开关找回来 —— 列表页没有
 * 第二个入口，空态文案和归档提示都指向那里。所以默认帮用户清干净列表是安全、可逆的。
 *
 * **被隐藏 ≠ 被归档，但两者共用同一个状态。** 会话侧没有归档字段，长按菜单里的
 * 「归档」写的就是 `completed`（见 `CONVERSATION_ARCHIVED_STATUS`）。也就是说：开着这个
 * 开关时归档一条会话，它会当场从列表消失 —— 这正是归档想要的效果，代价是取消归档的
 * 入口也一起没了，所以归档成功的提示必须顺带指路。
 *
 * **只挡 `completed`，不挡 `pending_review`。** 这两个状态在 mcode 里的含义差得很远：
 * 轮次跑完时写的是 `pending_review`（`conversationSyncService.ts` 的
 * `markSummaryPendingReview` 硬编码），列表上显示「待处理」；`completed` 只有两个来源
 * —— 远端 `status` 字段，或用户在详情页手动标记。把 `pending_review` 一起藏掉，会让
 * 「刚跑完等我看结果」的会话从列表上消失，那是最糟的一类误解。
 *
 * 与 [[localTurnCachePreference]] 的默认值相反，所以**归一化方向也相反**：那个只认
 * 严格 `true` 为开，这个只认严格 `false` 为关。见 `normalizeHidden` 的注释。
 */
export const HIDE_COMPLETED_CONVERSATIONS_KEY = "mcode_hide_completed_conversations"

/**
 * **只有严格 `false` 才算关闭**，其余一切（包括键不存在时 `uni.getStorageSync` 返回的
 * 空串、以及字符串 `"false"`）都退回默认值 `true`。
 *
 * 这是默认开的开关最容易踩的坑：用 truthy/falsy 判的话，空串会被当成「用户关掉了」，
 * 默认值于是静默失效 —— 用户从没动过开关，列表却不再过滤。
 */
function normalizeHidden(value: unknown) {
  return value !== false
}

export function readHideCompletedConversations() {
  const hidden = normalizeHidden(uni.getStorageSync(HIDE_COMPLETED_CONVERSATIONS_KEY))
  // 回写归一化后的值：让存储里永远是布尔量，后续读取不再依赖 normalize 的宽容度。
  uni.setStorageSync(HIDE_COMPLETED_CONVERSATIONS_KEY, hidden)
  return hidden
}

export function writeHideCompletedConversations(hidden: boolean) {
  const normalized = hidden !== false
  uni.setStorageSync(HIDE_COMPLETED_CONVERSATIONS_KEY, normalized)
  return normalized
}
