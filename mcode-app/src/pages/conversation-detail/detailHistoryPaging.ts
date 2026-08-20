import type {
  ConversationHistoryWindow,
  ConversationTurnsPage,
} from "@/types/acp"
import {
  DEFAULT_CONVERSATION_HISTORY_PAGE_SIZE,
  isWindowedConversationDetail,
} from "@/services/conversation/conversationHistoryWindowContract"
import {
  mergeTailIntoTurnsWithSeam,
  prependHistoryPageTurns,
} from "@/services/conversation/conversationTurnIdentity"

// 协议常量与窗口化判定集中在 services 层（api/ 与 stores/ 也要用，而那两层不能
// import @/pages）。轮次合并同理 —— runtime store 修坍缩时要用同一份去重逻辑。
// 这里 re-export 以保持既有引用点不变。
export {
  DEFAULT_CONVERSATION_HISTORY_PAGE_SIZE,
  isWindowedConversationDetail,
  mergeTailIntoTurnsWithSeam,
  prependHistoryPageTurns,
}

const PAGING_UPGRADE_MESSAGE =
  "当前 CodeG 服务端不支持会话历史分页，请升级 CodeG 后重试。"

function invalidPagingMetadata(): Error {
  return new Error(PAGING_UPGRADE_MESSAGE)
}

function readNonNegativeInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim())
    return Number.isSafeInteger(parsed) ? parsed : null
  }
  return null
}

function readRequiredHash(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function readOptionalTimestamp(value: unknown): number | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? undefined : parsed
  }
  return undefined
}

function parseWindow(raw: any): ConversationHistoryWindow {
  const turnsOffset = readNonNegativeInteger(raw?.turns_offset)
  const turnsTotal = readNonNegativeInteger(raw?.turns_total)
  const assistantTurnsBeforeOffset = readNonNegativeInteger(
    raw?.assistant_turns_before_offset,
  )
  const prefixHash = readRequiredHash(raw?.prefix_hash)
  if (
    turnsOffset == null ||
    turnsTotal == null ||
    assistantTurnsBeforeOffset == null ||
    prefixHash == null ||
    turnsOffset > turnsTotal ||
    assistantTurnsBeforeOffset > turnsOffset
  ) {
    throw invalidPagingMetadata()
  }

  const timestamp = readOptionalTimestamp(
    raw?.uncovered_prefix_max_ts ?? raw?.uncoveredPrefixMaxTimestamp,
  )
  const hasTimestamp =
    Object.prototype.hasOwnProperty.call(raw ?? {}, "uncovered_prefix_max_ts") ||
    Object.prototype.hasOwnProperty.call(raw ?? {}, "uncoveredPrefixMaxTimestamp")
  if (hasTimestamp && timestamp === undefined) throw invalidPagingMetadata()

  return {
    turns_offset: turnsOffset,
    turns_total: turnsTotal,
    assistant_turns_before_offset: assistantTurnsBeforeOffset,
    prefix_hash: prefixHash,
    ...(timestamp !== undefined ? { uncovered_prefix_max_ts: timestamp } : {}),
  }
}

export function requireConversationHistoryWindow(raw: unknown): ConversationHistoryWindow {
  return parseWindow(raw)
}

export function requireConversationTurnsPage(raw: unknown): ConversationTurnsPage {
  const window = parseWindow(raw)
  const prefixHashBeforeIndex = readRequiredHash((raw as any)?.prefix_hash_before_index)
  const turns = (raw as any)?.turns
  if (prefixHashBeforeIndex == null || !Array.isArray(turns)) {
    throw invalidPagingMetadata()
  }
  return {
    ...window,
    turns,
    prefix_hash_before_index: prefixHashBeforeIndex,
  }
}

export function buildTailHistoryRequest(conversationId: number) {
  return {
    conversationId,
    tailTurns: DEFAULT_CONVERSATION_HISTORY_PAGE_SIZE,
  }
}

export function buildOlderHistoryRequest(conversationId: number, beforeIndex: number) {
  return {
    conversationId,
    beforeIndex,
    limit: DEFAULT_CONVERSATION_HISTORY_PAGE_SIZE,
  }
}

export function hasOlderConversationHistory(window: ConversationHistoryWindow | null | undefined) {
  return Boolean(window && window.turns_offset > 0)
}

export function canApplyOlderHistoryPage(
  current: ConversationHistoryWindow,
  page: ConversationTurnsPage,
) {
  return (
    page.prefix_hash_before_index === current.prefix_hash &&
    page.turns_offset < current.turns_offset &&
    page.turns_offset + page.turns.length === current.turns_offset &&
    // The already loaded tail cannot disappear underneath a page response.
    // A larger total is allowed because a newer turn may arrive concurrently.
    page.turns_total >= current.turns_total
  )
}

export function advanceConversationHistoryWindow(
  current: ConversationHistoryWindow,
  page: ConversationTurnsPage,
): ConversationHistoryWindow {
  return {
    turns_offset: page.turns_offset,
    // A newer turn may arrive between page requests. Preserve the total that
    // describes the currently loaded tail instead of moving its boundary.
    turns_total: current.turns_total,
    assistant_turns_before_offset: page.assistant_turns_before_offset,
    prefix_hash: page.prefix_hash,
    ...(page.uncovered_prefix_max_ts !== undefined
      ? { uncovered_prefix_max_ts: page.uncovered_prefix_max_ts }
      : {}),
  }
}

/**
 * 刷新尾窗后同时决定「时间线」和「窗口坐标」—— 这两件事必须是**一个**决定。
 *
 * 背景：远端只回 30 条尾窗，而用户可能已经往上翻到 200 条。整体替换会把列表砍回一页，
 * 所以要尽量保住尾窗管不到的前缀；但保住前缀就意味着内存时间线比尾窗更深，尾窗自带的
 * `turns_offset` 不再描述时间线的起点。
 *
 * **不能靠算术修正窗口。** `turns_offset` / `prefix_hash` /
 * `assistant_turns_before_offset` 必须是同一次服务端响应里的一组匹配值：`prefix_hash`
 * 是对 `turns[0..turns_offset)` 链式算出来的，把 offset 单独往前挪 N 条之后，
 * `canApplyOlderHistoryPage` 里的 `page.prefix_hash_before_index === current.prefix_hash`
 * 就成了两个不同坐标上的哈希互比，永远不可能相等 —— 分页会静默退化成整页重载。
 *
 * 所以只有两种合法组合，**挑一个**，不做任何拼接：
 *
 * - 接缝能证明连续（`previous.turns_offset + seamIndex === incoming.turns_offset`）
 *   → 保住前缀 + 沿用旧窗口。旧窗口本来就描述 `localTurns[0]`，而合并后的头条仍是
 *   同一条，`prefix_hash` 依然配套；只把 `turns_total` 提到较大值。
 * - 其余情况（没有旧窗口 / 没找到接缝 / 缺口对不上）→ **丢掉前缀**，采用尾窗的轮次
 *   和窗口。
 *
 * 第二种情况下**绝不能只换窗口而留着前缀**。曾经这么做过，理由是「偏浅的 offset 只会
 * 让下一页多回一些已有轮次，`prependHistoryPageTurns` 会按身份去重」—— 这个前提是错的：
 * 去重是**先到先留**且历史页被放在最前面，所以一段已在内存里的轮次会被**搬到列表头部**，
 * 不是被忽略。窗口说 offset 是 200 而 `localTurns[0]` 其实是全局第 0 条时，点一次
 * 「加载更早」就会把第 170~199 条搬到最顶上，时间线错乱且每点一次更乱。
 *
 * 而且那个空洞是**不可恢复**的：没有任何请求能填上「前缀结尾 → `incoming.turns_offset`」
 * 之间那段。宁可丢掉前缀（用户往上滑还能重新翻回来），也不要留一个永不报错的错位时间线。
 */
export function resolveRefreshedTailWindow(
  previous: ConversationHistoryWindow | null | undefined,
  incoming: ConversationHistoryWindow,
  seamIndex: number | null,
): ConversationHistoryWindow {
  if (!canKeepPreviousTailWindow(previous, incoming, seamIndex)) {
    return incoming
  }
  return refreshHistoryWindowTotal(previous!, incoming)
}

/**
 * 保住前缀与沿用旧窗口是**同一个**条件 —— 调用方必须用这个判定同时决定两者，
 * 否则就会出现「窗口是浅的、时间线是深的」那种不可恢复的错位。
 */
export function canKeepPreviousTailWindow(
  previous: ConversationHistoryWindow | null | undefined,
  incoming: ConversationHistoryWindow,
  seamIndex: number | null,
) {
  return Boolean(
    previous &&
      seamIndex != null &&
      seamIndex > 0 &&
      previous.turns_offset + seamIndex === incoming.turns_offset,
  )
}

/**
 * 轮次被原样保留（流式中、有 in-flight 用户轮次等）时该记哪个窗口坐标。
 *
 * 既然 `localTurns` 一个字都没动，旧窗口就仍然精确描述 `localTurns[0]` —— 它必须留下。
 * 换成尾窗那一组会让「窗口坐标」和「内存时间线」脱钩：用户翻到 200 条后发一条消息，
 * 窗口被打回第 150 条，接下来点「加载更早」会连着几次拉回已经在内存里的轮次
 * （`prependHistoryPageTurns` 全部去重掉），界面毫无变化，像是按钮坏了。
 *
 * 尾窗刷新在这里只带来一个新信息：会话总轮次可能变多了。所以只提 `turns_total`。
 *
 * **没有旧窗口时返回 `null`，绝不能采纳尾窗那一组。** 曾经这么做过（`: incoming`），
 * 那是错的：窗口的语义是「`localTurns[0]` 在整个会话里的下标」，而这条分支恰恰
 * **不碰** `localTurns`。列表页的实时预览会预连接会话（`conversations/index.vue`
 * 的 `runLivePreviewAttach`），realtime 事件把 `localTurns` 填成两三条**尾部**轮次，
 * 窗口却仍是 null；此时若采纳尾窗的 `turns_offset`（比如 170），窗口就宣称
 * `localTurns[0]` 是全局第 170 条，而它其实是第 198 条。点一次「加载更早」拉回
 * 第 140~169 条，接到第 198 条前面 —— 中间第 170~197 条被**静默跳过**，
 * 且没有任何请求能补上（`canApplyOlderHistoryPage` 的接缝断言用的是同一个错坐标，
 * 不会报错）。
 *
 * 返回 `null` 的代价只是「这一轮先不显示能否翻页」，等流式结束后由
 * `ensureConversationHistoryWindow` 重新探测一次拿到配套的一组，代价可恢复。
 */
export function resolvePreservedTurnsWindow(
  previous: ConversationHistoryWindow | null | undefined,
  incoming: ConversationHistoryWindow,
): ConversationHistoryWindow | null {
  return previous ? refreshHistoryWindowTotal(previous, incoming) : null
}

/**
 * 尾窗刷新只带来一个新信息：会话总轮次可能变多了。窗口的其余三个字段
 * （`turns_offset` / `prefix_hash` / `assistant_turns_before_offset`）必须保持原样 ——
 * 它们是同一次响应里算出来的一组匹配值，不能各自替换。
 */
function refreshHistoryWindowTotal(
  current: ConversationHistoryWindow,
  incoming: ConversationHistoryWindow,
): ConversationHistoryWindow {
  return {
    ...current,
    turns_total: Math.max(current.turns_total, incoming.turns_total),
  }
}
