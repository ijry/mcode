import {
  isActiveConversationSummaryStatus,
  normalizeConversationSummaryStatus,
} from "@/services/conversation/conversationSummaryStatus"
import type { ConversationStatusMode } from "@/pages/conversations/conversationOverviewPresentation"

/**
 * 会话行长按菜单的裁决层。
 *
 * 菜单项**由会话当前状态推导**，不是一张固定的表：置顶与否决定出现「置顶」还是
 * 「取消置顶」，是否已归档决定「归档」还是「取消归档」，正在进行的会话干脆不给
 * 删除入口。组件因此不需要判断任何状态，只管把结果渲染成一张 action sheet。
 */

/**
 * 置顶要走的网关命令名。
 *
 * 服务端（`codeg`，`web/handlers/conversations.rs`）确实有这条：
 * `update_conversation_pinned`，payload `{ conversationId, pinned }`，写的是
 * `conversation.pinned_at`（置顶时间，取消置顶写回 null）。
 *
 * 注意**它不是布尔字段**：会话的置顶是时间戳，标签的置顶才是 `is_pinned`。读回置顶
 * 态必须走 `resolveConversationPinned`，只认 `is_pinned` 会永远读到 false。
 */
export const CONVERSATION_PIN_COMMAND = "update_conversation_pinned"

/**
 * 归档就是服务端的「完成」。
 *
 * 会话没有独立的归档字段，服务端的状态枚举就是 in_progress / pending_review /
 * completed / cancelled 四个（见 `codeg` 的 `update_conversation_status_core`，它只
 * 校验枚举合法性、不限迁移方向）。`completed` 是其中唯一表达「这件事已经了结」的
 * 状态，所以归档写 `completed`、取消归档退回 `pending_review`。
 *
 * **取消归档不退回 `in_progress`**：那等于凭空宣布这个会话正在跑，会把它推进
 * 「不可删除」的那一侧 —— 用户刚取消归档，马上又删不掉。
 */
export const CONVERSATION_ARCHIVED_STATUS = "completed"
export const CONVERSATION_UNARCHIVED_STATUS = "pending_review"

/**
 * 归档成功后的提示文案。
 *
 * 归档写的是 `completed`。当前若是「进行中」模式（排除 completed），归档后这条会话会立刻
 * 从列表上消失。只弹一句「已归档」，用户看到的是「我点了归档，会话不见了」，跟被删掉没区别，
 * 而且取消归档的入口（长按那一行）也跟着一起没了 —— 所以必须说清去「已归档」视图找回。
 *
 * 其它模式下它仍在列表里（全部 / 已置顶 / 已归档），多说这句反而是噪音。
 *
 * 入参是**当前列表的状态模式**，不是某个布尔开关：模式是用户自选的视图，文案据此指路。
 */
export function resolveArchiveSuccessToast(mode: ConversationStatusMode): string {
  return mode === "running" ? "已归档；可在「已归档」视图中查看" : "已归档"
}

export type ConversationRowActionId =
  | "rename"
  | "pin"
  | "unpin"
  | "archive"
  | "unarchive"
  | "delete"

export interface ConversationRowAction {
  id: ConversationRowActionId
  /** up-action-sheet 的条目文案。 */
  name: string
  color?: string
}

const ACTION_PRIMARY_COLOR = "#2979ff"
const ACTION_DANGER_COLOR = "#fa3534"

/** 归档态 = 服务端状态 `completed`。 */
export function isConversationArchived(status?: string | null) {
  return normalizeConversationSummaryStatus(status) === CONVERSATION_ARCHIVED_STATUS
}

/**
 * 能不能删。
 *
 * 正在跑的会话不给删：它有活的进程、可能还有未落盘的工具调用，删掉会把状态机撕开
 * 一半。其余状态（含「待处理」）都允许。
 */
export function canDeleteConversation(status?: string | null) {
  return !isActiveConversationSummaryStatus(status)
}

/**
 * 按会话状态组装菜单。
 *
 * 顺序固定为 改名 → 置顶 → 归档 → 删除：前三项是可逆的低风险动作，删除永远压在最后
 * 且是唯一的危险色。删除在会话进行中时**整项不出现** —— 留一个点了必然被拦的入口，
 * 不如一开始就不给。
 */
export function buildConversationRowActions(input: {
  status?: string | null
  isPinned?: boolean | null
}): ConversationRowAction[] {
  const archived = isConversationArchived(input.status)
  const actions: ConversationRowAction[] = [
    { id: "rename", name: "改名", color: ACTION_PRIMARY_COLOR },
    input.isPinned
      ? { id: "unpin", name: "取消置顶", color: ACTION_PRIMARY_COLOR }
      : { id: "pin", name: "置顶", color: ACTION_PRIMARY_COLOR },
    archived
      ? { id: "unarchive", name: "取消归档", color: ACTION_PRIMARY_COLOR }
      : { id: "archive", name: "归档", color: ACTION_PRIMARY_COLOR },
  ]

  if (canDeleteConversation(input.status)) {
    actions.push({ id: "delete", name: "删除", color: ACTION_DANGER_COLOR })
  }

  return actions
}

/**
 * 菜单标题用会话名。
 *
 * 会话名是用户自己起的，长起来没有上限；标题行不换行的话会把整个面板撑歪，
 * 所以超出部分截掉并补省略号。没名字的会话退回通用标题。
 */
export function resolveRowActionSheetTitle(title?: string | null) {
  const text = String(title || "").trim()
  if (!text) return "会话操作"
  return text.length > 20 ? `${text.slice(0, 20)}…` : text
}

/** 从 up-action-sheet 的回调里取回被点的那一项（带回退，见调用处注释）。 */
export function resolveSelectedRowAction(
  actions: ConversationRowAction[],
  event?: { index?: number; name?: string } | null
): ConversationRowAction | null {
  const byIndex = actions[Number(event?.index)]
  if (byIndex) return byIndex
  const name = String(event?.name || "").trim()
  if (!name) return null
  return actions.find((item) => item.name === name) || null
}
