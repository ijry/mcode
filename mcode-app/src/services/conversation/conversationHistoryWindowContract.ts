import type { ConversationHistoryWindow } from "@/types/acp"

/**
 * 会话历史分页的**协议常量与契约判定**。
 *
 * 放在 services 层而不是 `pages/conversation-detail/detailHistoryPaging.ts`，是因为
 * `api/` 与 `stores/` 也需要它，而这两层从不 import `@/pages`（层级倒置）。
 * 页面侧的 `detailHistoryPaging.ts` re-export 这里的常量，保持既有引用点不变。
 *
 * 服务端契约见 `codeg-plus/src-tauri/src/commands/turn_window.rs`。
 */

/**
 * 尾窗请求的默认条数。
 *
 * 注意这是**请求**条数，不是响应条数：服务端会把窗口起点向前对齐到 user 轮次边界
 * （`turn_window.rs` 的 `round_align_backward`，注释写明 "alignment only ever ADDS
 * earlier turns"），溢出由 `ROUND_ALIGN_CAP = 200` 兜住。所以请求 30 条实际可能
 * 返回 30~230 条。**任何地方都不能假设 `detail.turns.length <= 30`**，
 * 一切以服务端回报的 `turns_offset` / `turns_total` 为准。
 */
export const DEFAULT_CONVERSATION_HISTORY_PAGE_SIZE = 30

/**
 * 只读元数据（folderId / title / agentType / status 等）时用的最小窗口。
 *
 * 这些调用点根本不看轮次内容，拉全量纯属浪费流量。服务端 clamp 是 `1..=500`
 * （`MAX_WINDOW_TURNS`），`tailTurns: 0` 会被 clamp 成 1 而不是空窗口，所以直接写 1。
 *
 * 关键：**带上窗口参数的意义不止是省流量**。不带任何窗口选择器时服务端走 legacy
 * 分支（`resolve_turn_window_req` 的 `(None, None) => Ok(None)`），四个窗口元数据
 * 字段会因 `skip_serializing_if` 被整体省略 —— 下游一切基于窗口的判定都会失效。
 */
export const METADATA_ONLY_CONVERSATION_TAIL_TURNS = 1

export interface ConversationTurnWindowRequest {
  tailTurns?: number
  fromIndex?: number
}

/**
 * 判定一个 `get_folder_conversation` 响应是否是**窗口化**响应。
 *
 * 对齐 codeg-plus 前端的 `isWindowedDetail`（`src/lib/turn-window.ts`）：只认
 * `turns_offset` / `turns_total` / `prefix_hash` 三个字段。刻意不查
 * `assistant_turns_before_offset` 与 `uncovered_prefix_max_ts` —— 后者在 offset 为 0
 * 时合法地为 None，拿它做判定会把「已在最开头的窗口」误判成 legacy 全量响应。
 *
 * 为什么需要这个判定：窗口化响应里除 `turns` 之外的字段**仍描述完整会话**
 * （`conversations.rs` 的 `apply_turn_window` 只切 `turns`）。所以拿尾窗的
 * `turns` 去累加 token 或数轮次，会把「最近 30 轮」当成「整个会话」上报。
 */
export function isWindowedConversationDetail(
  detail: unknown,
): detail is Record<string, any> & ConversationHistoryWindow {
  if (!detail || typeof detail !== "object") return false
  const raw = detail as Record<string, any>
  return (
    typeof raw.turns_offset === "number" &&
    Number.isFinite(raw.turns_offset) &&
    typeof raw.turns_total === "number" &&
    Number.isFinite(raw.turns_total) &&
    typeof raw.prefix_hash === "string" &&
    raw.prefix_hash.trim().length > 0
  )
}
