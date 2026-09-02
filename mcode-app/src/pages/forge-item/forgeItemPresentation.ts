import type { ForgeComment, ForgeIssueRow, ForgeItemKind } from "@/types/forge"
import { FORGE_MAX_COMMENT_CHARS } from "@/types/forge"

/**
 * 详情页的呈现规则。**纯模块** —— 不 import uni / pinia / 组件。
 */

/** 详情页的三个分区。issue 只有第一个。 */
export type ForgeDetailTab = "conversation" | "checks" | "files"

export const FORGE_DETAIL_TABS: ForgeDetailTab[] = ["conversation", "checks", "files"]

export function forgeDetailTabLabel(tab: ForgeDetailTab): string {
  switch (tab) {
    case "checks":
      return "检查项"
    case "files":
      return "文件更改"
    default:
      return "对话"
  }
}

/**
 * 这个条目有几个分区。
 *
 * issue 只有对话 —— 它没有分支、没有 CI、没有 diff。给它画三个 tab 里两个空的，
 * 是把「这里没有内容」伪装成「你还没看」。
 */
export function forgeDetailTabsFor(kind: ForgeItemKind): ForgeDetailTab[] {
  return kind === "pr" ? FORGE_DETAIL_TABS : ["conversation"]
}

/**
 * 状态词。
 *
 * 与列表行的字形共享判据（`draft` 压过 `state`），但这里出的是**完整的词** ——
 * 详情页有地方写字，而列表行只有一个图标的位置。
 */
export function forgeItemStateLabel(
  row: Pick<ForgeIssueRow, "state" | "draft" | "is_pr">
): string {
  if (row.draft && row.is_pr) return "草稿"
  switch (row.state) {
    case "open":
      return "进行中"
    case "closed":
      return "已关闭"
    case "merged":
      return "已合并"
    default:
      return row.state || "未知状态"
  }
}

/**
 * 状态按钮该提供哪个动作。
 *
 * `null` = 不提供。已合并的 PR 没有按钮：GitHub 与 GitLab 都不允许重开一个已合并的
 * 变更，给一颗必然失败的按钮比不给更糟。
 */
export function forgeStateActionFor(
  row: Pick<ForgeIssueRow, "state">
): "close" | "reopen" | null {
  if (row.state === "merged") return null
  return row.state === "closed" ? "reopen" : "close"
}

export function forgeStateActionLabel(action: "close" | "reopen"): string {
  return action === "close" ? "关闭" : "重新打开"
}

/**
 * 关闭 / 重开的确认文案。
 *
 * 必须说清**这会发生在远端仓库上，所有关注者都会看到** —— 手机上误触一颗按钮的
 * 代价在这里不是本地状态，而是一群人的通知。
 */
export function forgeStateConfirmText(
  action: "close" | "reopen",
  title: string,
  kind: ForgeItemKind
): { title: string; content: string } {
  const noun = kind === "pr" ? "变更" : "Issue"
  if (action === "close") {
    return {
      title: `关闭这个${noun}？`,
      content: `「${title}」会在远端仓库里被关闭，所有关注的人都会看到。必要时之后还可以重新打开。`,
    }
  }
  return {
    title: `重新打开这个${noun}？`,
    content: `「${title}」会在远端仓库里被重新打开，所有关注的人都会看到。`,
  }
}

/**
 * 评论的时间行：创建时间 +（被编辑过时的）「已编辑」。
 *
 * `updated_at` 只在 forge 说它与 `created_at` 不同时才存在（后端已经过滤），所以它
 * 出现就意味着真的被编辑过 —— 不要自己再比一次，那会把后端的判断复制成两份。
 */
export function forgeCommentTimeText(
  comment: Pick<ForgeComment, "created_at" | "updated_at">,
  format: (iso: string) => string
): string {
  const created = comment.created_at ? format(comment.created_at) : ""
  if (!comment.updated_at) return created
  return created ? `${created} · 已编辑` : "已编辑"
}

/**
 * 按 id 去重地追加下一页评论。
 *
 * 与列表行同一个理由：两次请求之间可能有人发了新评论，把上一页的末条挤到下一页。
 * 重复的**保留旧的那份**（用户可能已经在读它）。
 */
export function appendForgeComments(
  existing: ForgeComment[],
  incoming: ForgeComment[]
): ForgeComment[] {
  const seen = new Set(existing.map((comment) => comment.id))
  const result = existing.slice()
  for (const comment of incoming) {
    if (seen.has(comment.id)) continue
    seen.add(comment.id)
    result.push(comment)
  }
  return result
}

/**
 * 刚发出的评论追加到线程末尾。
 *
 * 用 forge 返回的那一条（带真实 id / 时间 / 永久链接），而不是本地拼一个乐观条目 ——
 * 后者没有 id，会在下一次翻页时和真的那条重复出现。
 */
export function appendPostedForgeComment(
  existing: ForgeComment[],
  posted: ForgeComment
): ForgeComment[] {
  if (existing.some((comment) => comment.id === posted.id)) return existing
  return [...existing, posted]
}

/** 评论输入的校验。返回错误文案，`null` = 可以发。 */
export function validateForgeCommentBody(body: string): string | null {
  const trimmed = String(body || "").trim()
  // 两个 forge 都接受纯空白的评论并把它渲染成一张谁也删不掉的空卡片。
  if (!trimmed) return "评论内容不能为空。"
  if (trimmed.length > FORGE_MAX_COMMENT_CHARS) {
    return `评论超过 ${FORGE_MAX_COMMENT_CHARS} 字，请缩短后再发。`
  }
  return null
}

/**
 * 评论发送失败时说什么。
 *
 * **不能**说「请重试」：一次 POST 可能已经到达 forge 而只是响应丢了，重试就是发两遍
 * 到一个别人在读的线程里。所以措辞是「先确认」而不是「再点一次」，且输入内容要保留。
 */
export function forgeCommentFailureText(message: string): string {
  return `${message}。这条评论可能已经发出，请下拉线程确认后再决定是否重发。`
}
