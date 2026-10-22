import { normalizeConversationStatusMode, type ConversationStatusMode } from "@/pages/conversations/conversationOverviewPresentation"

/**
 * 会话列表左上角「视图」面板里的状态筛选模式（全部 / 进行中 / 已置顶 / 已归档）。
 *
 * 只影响会话列表的**可见性**：不落盘、不改状态、不影响底部 tab 角标（那条走
 * `conversationTabBadgeService` + 服务端 `pet_list_active_sessions`，与列表过滤解耦）。
 * 被切换掉可见性的会话由**左上角视图面板**里的对应模式找回来 —— 列表页没有第二个入口，
 * 空态文案会直接告诉用户当前是哪一类被筛空了。所以默认把全部摊开是安全、可逆的。
 *
 * **与旧版「隐藏已完成」开关的区别**：那个开关默认隐藏 `completed`，用户得先知道有它才找得到
 * 归档；现在四个模式都是可见入口，默认 `all` 更不易让人以为数据丢失。见
 * `conversationOverviewPresentation.ts` 里 `ConversationStatusMode` 的模块注释。
 *
 * 与 [[localTurnCachePreference]] 一样只认严格合法枚举：归一化把任何非法/缺省值退回 `all`。
 */
export const CONVERSATION_STATUS_MODE_KEY = "mcode_conversations_status_mode_v1"

export function readConversationStatusMode(): ConversationStatusMode {
  const stored = uni.getStorageSync(CONVERSATION_STATUS_MODE_KEY)
  const normalized = normalizeConversationStatusMode(stored)
  // 回写归一化后的值：让存储里永远是一个合法枚举，后续读取不再依赖归一化的宽容度。
  uni.setStorageSync(CONVERSATION_STATUS_MODE_KEY, normalized)
  return normalized
}

export function writeConversationStatusMode(mode: ConversationStatusMode): ConversationStatusMode {
  const normalized = normalizeConversationStatusMode(mode)
  uni.setStorageSync(CONVERSATION_STATUS_MODE_KEY, normalized)
  return normalized
}
