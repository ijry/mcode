import type { ContentPart, MessageTurn } from "@/types/acp"

/**
 * 轮次身份（去重键）计算：与来源无关，纯函数，不依赖 SQLite 驱动。
 *
 * 单独成模块的原因：`conversationDetailPersistence` 顶层 import 了 `services/db`
 * （进而 import `sql.js/dist/sql-wasm.wasm?url`，只有 Vite 能解析的 URL 后缀）。
 * 归一化层（`detailDataNormalization`）与时间线层都需要这套键，但它们不该被拖进
 * 持久化依赖链 —— 否则纯展示模块在单测里会因为 wasm URL 无法解析而整个跑不起来。
 *
 * `conversationDetailPersistence` 继续 re-export 这里的实现，保持既有引用点不变，
 * 也保证「落库时算的键」与「归一化时算的键」永远是同一份代码。
 */

/**
 * Claude Code 上下文压缩摘要的正文前缀，与服务端
 * `parsers/claude.rs` 的 `CONTEXT_CONTINUATION_PREFIX` 逐字一致。
 *
 * 服务端已经据此把这条记录改判成 `system` 角色下发，客户端**不需要**再判定角色；
 * 保留这个常量只为把折叠提示的标签说得更具体（「上下文已压缩」而非泛泛的「系统消息」）。
 * 改动前先核对 Rust 侧那个常量，两边必须同字面量。
 */
export const CONTEXT_CONTINUATION_PREFIX =
  "This session is being continued from a previous conversation"

/**
 * 与服务端 `TurnRole`（`models/message.rs`）一一对应的三种角色。
 *
 * `system` 必须显式识别：上下文压缩摘要在 JSONL 里是 `type: "user"`，解析器
 * （`parsers/claude.rs` 的 `is_context_continuation`）会把它改判成 System 后下发，
 * 且这是**全部十个解析器共有**的第三种角色，不是 Claude 特例。早先归一化写的是
 * `rawRole === "user" ? "user" : "assistant"`，`system` 落进 else 分支被当成 agent
 * 回复渲染，详情页因此会显示出「会话被压缩」的内部说明。
 *
 * 放在这个纯模块里是为了让两处归一化（`detailDataNormalization` 的展示版与
 * `conversationDetailPersistence` 的落库版）共用同一份判定 —— 这两份实现历史上
 * 已经悄悄漂移过一次。
 *
 * 未知角色仍退回 assistant（保守：宁可多渲染也不要静默丢消息）。
 */
export function normalizeTurnRole(rawRole: unknown): MessageTurn["role"] {
  const role = String(rawRole || "").toLowerCase()
  if (role === "user") return "user"
  if (role === "system") return "system"
  return "assistant"
}

/**
 * 这一条 `thinking` 块是不是「空胶囊」，应当在**历史路径**上丢弃。
 *
 * 服务端**确实会下发空的 thinking**，不是 mcode 造出来的：Claude Code 的 transcript 里有
 * redacted-thinking 胶囊 `{"type":"thinking","thinking":"","signature":"…"}`，
 * `parsers/claude.rs` 取值用 `as_str()` —— 对 `""` 返回 `Some("")`，于是无条件 push 一个
 * `Thinking { text: "" }`，没有任何 `is_empty` 守卫。而 `group_into_turns` 会把一条
 * assistant 消息和它后面所有 tool-result 折成**一个**轮次，所以工具密集的一轮里 N 个空胶囊
 * 全挤进同一个气泡 —— 用户看到的就是「很多个深度思考，点开还是空的」。
 *
 * codeg-plus 收的是完全一样的载荷，它不显示纯粹因为前端有过滤
 * （`src/lib/adapters/ai-elements-adapter.ts` 的 `adaptContentBlock` 之后那一段）。
 *
 * **必须只在非流式路径上丢。** 流式期间的空 thinking 是**合法的实时状态**：它驱动
 * 「正在思考」指示器，且对 reasoning-redacting 模型来说这个空状态是**永久**的（正文永远不会
 * 补上来）。流式期间一并丢掉，就会把「思考中」的反馈整个抹掉。参考实现的注释把这一点写死成
 * `!isStreaming` 的 gate，并有两条专门测试锁着（保留空块 / 历史丢弃各一条）。
 */
export function isEmptyThinkingPart(part: ContentPart | null | undefined) {
  if (!part || (part as { type?: unknown }).type !== "thinking") return false
  return !String((part as { thinking?: unknown }).thinking ?? "").trim()
}

/**
 * 丢弃一组 part 里所有的空 thinking 胶囊（见 `isEmptyThinkingPart`）。
 *
 * 只用于**非流式**路径：历史归一化与落库。流式累加器不要调这个 ——
 * 空 thinking 在流式期间是驱动「正在思考」的合法状态。
 */
export function dropEmptyThinkingParts(parts: ContentPart[]): ContentPart[] {
  return parts.filter((part) => !isEmptyThinkingPart(part))
}

export function buildTurnDedupeKey(input: {
  turnId?: string | null
  role: string
  content: ContentPart[]
  timestamp: number
}) {
  const turnId = firstString(input.turnId)
  if (turnId) {
    // CodeG 解析器的 turn id 按下标派生（turn-N），历史被压缩重写时整段平移，
    // 因此它不能作为跨来源身份，退化成内容指纹。
    if (turnId.startsWith("turn-")) {
      return buildFallbackTurnFingerprint(input.role, input.content, input.timestamp)
    }
    return `remote:${turnId}`
  }
  return buildFallbackTurnFingerprint(input.role, input.content, input.timestamp)
}

export function buildFallbackTurnFingerprint(
  role: string,
  content: ContentPart[],
  timestamp: number,
) {
  const contentHash = stableHashString(stableSerializeContent(content))
  const timeBucket = Math.floor(Number(timestamp || 0) / 1000)
  return `fp:${role}:${contentHash}:${timeBucket}`
}

export function buildPersistedTurnStorageId(
  instanceKey: string,
  conversationId: number,
  dedupeKey: string,
) {
  return `turn:${stableHashString(`${instanceKey}:${conversationId}:${dedupeKey}`)}`
}

/**
 * 单条轮次的**基础**身份键（与落库用的 `dedupeKey` 不是同一层）。
 *
 * 优先用与来源无关的 `dedupeKey`：历史页来自服务端（解析器给的 `turn-N`），而当前
 * 窗口可能是本地缓存水合出来的（SQLite 的 `turn:<hash>`）。只按 `id` 比对时同一条
 * 轮次认不出来，会在列表顶部重复插入一份。
 *
 * 两者都拿不到时返回空串 —— 调用方据此放弃对该条去重、原样保留，宁可重复也不要
 * 静默丢消息。
 *
 * **合并/去重请走 `resolveTurnMergeIdentityAliases`，不要直接用这一个键。** 单键不足以
 * 认出同一条轮次的实时副本与缓存副本（见那个函数的说明），这正是详情页「消息重复 2 次」
 * 的根因。这里保持内部可见就是为了不给调用方留那个坑。
 */
function resolveTurnBaseMergeIdentity(turn: MessageTurn): string {
  const dedupeKey = typeof turn?.dedupeKey === "string" ? turn.dedupeKey.trim() : ""
  if (dedupeKey) return `k:${turn?.role}:${dedupeKey}`
  const id = typeof turn?.id === "string" ? turn.id.trim() : ""
  return id ? `i:${id}` : ""
}

/**
 * 同一条轮次可能被认出的**全部**身份键。
 *
 * 为什么不能只用一个键：实时追加的轮次**故意不带**
 * `dedupeKey`（`findInFlightUserTurnByContentSignature` 靠它的缺席区分「落库后换了 id
 * 的同一条 prompt」和「排队发送的重复文本」，所以不能给它补上），身份是 `i:<messageId>`；
 * 而 `persistCompletedTurns` 落库时传的是 `dedupeId: turn.id`，于是缓存里那份的
 * `dedupeKey` 正是 `remote:<messageId>`，身份变成 `k:<role>:remote:<messageId>`。
 * 两个键不相等 —— 同一条 prompt 在详情页显示两遍，且一直粘在列表顶部。这就是用户报的
 * 「消息重复 2 次」。
 *
 * 所以这里把 `buildTurnDedupeKey` 那一步**原路反推**回去：`remote:<X>` 只可能来自
 * `turnId === X`，两者指的必然是同一条轮次。这是等价关系，不是启发式猜测。
 *
 * **返回的键严格等于「基础键 + 这一条反推」**，不多不少。特别是：带 `dedupeKey` 的
 * 轮次**不会**把自己的 `id` 也加进来 —— 缓存那份的 id 是 SQLite 的 `turn:<hash>`
 * （由 dedupeKey 派生，加了等于没加），而远端解析器那份的 id 是 `turn-N`，**按下标派生、
 * 历史被压缩重写时整段平移**（见 `codeg-turn-id-not-stable-identity`）。把 `turn-N` 抬成
 * 身份键会让两条**不同**的逻辑轮次因为 id 恰好漂到同一个值而被误合并 —— 那是静默丢消息。
 * 同理 `turn-N` 也不参与反推：`buildTurnDedupeKey` 对它退化成内容指纹，压根不存在
 * `remote:turn-N` 这个键。
 *
 * 返回的键之间是「或」的关系：任意一个撞上就是同一条轮次。
 */
export function resolveTurnMergeIdentityAliases(turn: MessageTurn): string[] {
  const base = resolveTurnBaseMergeIdentity(turn)
  // 身份完全不可知（既没 id 也没 dedupeKey）：不给任何键，调用方据此放弃去重、原样保留。
  if (!base) return []

  const dedupeKey = typeof turn?.dedupeKey === "string" ? turn.dedupeKey.trim() : ""
  if (dedupeKey) {
    // 缓存那份的 id 认不出实时那份，但它的 dedupeKey 里装着原始 messageId，
    // 反推出来正好等于实时那份的 `i:` 键。
    const remoteTurnId = dedupeKey.startsWith("remote:")
      ? dedupeKey.slice("remote:".length).trim()
      : ""
    return isReversibleTurnId(remoteTurnId) ? [base, `i:${remoteTurnId}`] : [base]
  }

  // 反方向：实时那份只有 id，要能撞上缓存那份的 `k:` 键。
  const id = typeof turn?.id === "string" ? turn.id.trim() : ""
  return isReversibleTurnId(id) ? [base, `k:${turn?.role}:remote:${id}`] : [base]
}

/**
 * `turn-N` 是解析器按下标派生的 id，历史被压缩重写时整段平移，因此
 * `buildTurnDedupeKey` 对它退化成内容指纹 —— `remote:turn-N` 这个键不存在，不可反推。
 */
function isReversibleTurnId(turnId: string) {
  return Boolean(turnId) && !turnId.startsWith("turn-")
}

/**
 * 把一页更早的历史接到当前时间线前面，按身份去重（先出现者胜）。
 *
 * 用别名集合而不是单个键：跨来源的两份副本（实时 / SQLite 缓存 / 远端解析器）身份键
 * 形式不同，见 `resolveTurnMergeIdentityAliases`。
 */
export function prependHistoryPageTurns(
  currentTurns: MessageTurn[],
  olderTurns: MessageTurn[],
): MessageTurn[] {
  const result: MessageTurn[] = []
  const seen = new Set<string>()
  for (const turn of [...olderTurns, ...currentTurns]) {
    const aliases = resolveTurnMergeIdentityAliases(turn)
    // 身份完全不可知（既没 id 也没 dedupeKey）时原样保留 —— 宁可重复也不要静默丢消息。
    if (aliases.some((identity) => seen.has(identity))) continue
    aliases.forEach((identity) => seen.add(identity))
    result.push(turn)
  }
  return result
}

export interface TailMergeResult {
  turns: MessageTurn[]
  /**
   * 尾部第一条轮次在内存时间线里的下标 —— 也就是接缝位置，同时等于「被原样保留下来的
   * 前缀条数」。找不到任何重叠时为 `null`。
   *
   * 调用方**不要**用 `turns.length - tailTurns.length` 反推：合并会去重，两个数字不总是
   * 差这么多。远端调用点要拿这个数去断言窗口坐标能不能接上，算错就等于把空洞判成合法。
   *
   * `null` 与 `0` 必须区别对待：
   * - `0` —— 尾部覆盖了整段内存（或内存本来是空的），合并结果就是尾部本身；
   * - `null` —— 两段完全不重叠，**无法证明拼接后是连续的**。此时不能声称时间线还从
   *   原来那个更早的坐标开始，否则会留下一个永不报错的空洞。
   */
  seamIndex: number | null
}

/**
 * 用一段**权威的尾部轮次**刷新时间线尾巴，同时保住用户往上翻出来的前缀。
 *
 * 两个调用点、同一个问题：
 * - `reloadLocalTurns`（runtime store）—— 尾部来自本地 SQLite 缓存；
 * - `applyRemoteHistoryWindowDetail`（详情页）—— 尾部来自服务端 30 条尾窗。
 *
 * 两边过去都是**整体替换**。而本地缓存只留最新一页、远端尾窗也只有一页，于是用户往上
 * 翻到 200 条后再发一条消息，列表就被静默砍回一页；更糟的是
 * `historyWindow.turns_offset` 不跟着变，下一页历史会拼在错误的接缝上留下**空洞**
 * —— 不报错，消息只是凭空消失。
 *
 * 做法：在内存时间线里找到第一条被尾部覆盖的轮次，它之前的部分就是「尾部管不到的
 * 前缀」，原样保留；从那条起交给尾部 —— 尾部是权威来源，携带最新状态与规范 id。
 * 因为 `memory[seam]` 就是 `tail[0]`，只要内存本来是连续的，拼出来也一定连续。
 *
 * 完全找不到重叠时返回 `seamIndex: null`，**并按时间戳决定拼接方向** —— 不能无条件把
 * 尾部接在内存之后。曾经那么做，症状是用户报的「突然刷新出一段莫名其妙的历史，加在
 * 实时对话后边」：
 *
 * - 详情页刚进来时内存里往往只有**实时**的两三条尾部轮次（列表页的实时预览预连接过
 *   会话，realtime 事件把它们填进 `localTurns`，且实时轮次**故意不带** `dedupeKey`，
 *   身份是 `i:<messageId>`）；
 * - 服务端 30 条尾窗的起点会被 `round_align_backward` 向前对齐到**用户轮次边界**，
 *   所以它常常从一条更早的用户消息开始（截图里那条「继续」）；
 * - 而尾窗里那些轮次的身份是解析器的 `turn-N` → `buildTurnDedupeKey` 对它**退化成
 *   内容指纹**，`isReversibleTurnId` 也拒绝反推。于是两段的身份键**永不相等**，
 *   接缝必然找不到 —— 这不是罕见的边界，是首次进入详情页的常态路径。
 *
 * 此时按原来的「尾部接在后面」，一整页更早的历史就被放到了更晚的实时内容之后。
 * 时间线层不做任何排序（`buildConversationTimeline` 原样保留数组顺序），所以错位
 * 直接显形。
 *
 * 判据用 `timestamp`：它在所有来源上都已被归一化成 number（`normalizeTurn` 解析
 * 字符串、`mapPersistedTurnToMessage` 取 `createdAt`），是这里唯一能跨来源比较的量。
 * 身份键回答「是不是同一条」，时间戳回答「谁在前」—— 认不出同一条时，仍然答得出谁在前。
 */
export function mergeTailIntoTurnsWithSeam(
  currentTurns: MessageTurn[],
  tailTurns: MessageTurn[],
): TailMergeResult {
  if (currentTurns.length === 0) {
    return { turns: tailTurns, seamIndex: 0 }
  }
  // 别名集合：缓存那份的 `k:<role>:remote:<X>` 与实时那份的 `i:<X>` 必须互相撞上，
  // 否则同一条 prompt 认不出接缝，会被拼成两条（详情页「消息重复 2 次」）。
  const tailIdentities = new Set(tailTurns.flatMap(resolveTurnMergeIdentityAliases))
  let seam: number | null = null
  for (let index = 0; index < currentTurns.length; index += 1) {
    const aliases = resolveTurnMergeIdentityAliases(currentTurns[index])
    if (aliases.some((identity) => tailIdentities.has(identity))) {
      seam = index
      break
    }
  }
  if (seam === 0) {
    return { turns: tailTurns, seamIndex: 0 }
  }
  const preservedPrefix = currentTurns.slice(0, seam ?? currentTurns.length)
  if (seam == null) {
    // 认不出接缝：两段的先后只能靠时间戳判断。尾部整体更早就必须放在前面，
    // 否则一页历史会被拼到实时对话之后（见函数头部的说明）。
    return {
      turns: shouldPlaceTailBeforeCurrent(currentTurns, tailTurns)
        ? prependHistoryPageTurns(currentTurns, tailTurns)
        : prependHistoryPageTurns(tailTurns, preservedPrefix),
      seamIndex: null,
    }
  }
  return {
    turns: prependHistoryPageTurns(tailTurns, preservedPrefix),
    seamIndex: seam,
  }
}

/**
 * 两段完全不重叠时，`tailTurns` 是否整体早于 `currentTurns`。
 *
 * 比「尾部最新一条」与「内存最早一条」：只有尾部**整段**都严格早于内存开头时才敢把它
 * 放到前面。用最新对最早（而不是首条对首条）是刻意的 —— 它要求两段在时间上真正不交叠，
 * 交错的两段维持原来的「尾部在后」语义，不去猜一个交叉顺序。
 *
 * 用严格 `<` 而不是 `<=`：相等意味着**分不出先后**（同一秒内的两条，或时间戳精度不足），
 * 那时重排没有依据，必须维持原语义。这不是理论边界 —— 时间戳全相等的输入正是
 * 「谁在前」不可知的情形，凭它调换一整段的位置只会把顺序搅得更乱。
 *
 * 拿不到有效时间戳时返回 false，同样退回原语义（尾部在后）：宁可顺序可疑也不要凭
 * `0` 或 `NaN` 把一段内容甩到最前面。
 */
function shouldPlaceTailBeforeCurrent(
  currentTurns: MessageTurn[],
  tailTurns: MessageTurn[],
) {
  const tailNewest = maxTurnTimestamp(tailTurns)
  const currentOldest = minTurnTimestamp(currentTurns)
  if (tailNewest == null || currentOldest == null) return false
  return tailNewest < currentOldest
}

function maxTurnTimestamp(turns: MessageTurn[]): number | null {
  return reduceTurnTimestamp(turns, (left, right) => (right > left ? right : left))
}

function minTurnTimestamp(turns: MessageTurn[]): number | null {
  return reduceTurnTimestamp(turns, (left, right) => (right < left ? right : left))
}

function reduceTurnTimestamp(
  turns: MessageTurn[],
  pick: (left: number, right: number) => number,
): number | null {
  let result: number | null = null
  for (const turn of turns) {
    const timestamp = Number(turn?.timestamp)
    // 0 也不算有效：归一化在拿不到时间时会退回 `Date.now()`，真正的 0 只可能来自
    // 缺字段的行，用它参与比较等于拿 1970 年当判据。
    if (!Number.isFinite(timestamp) || timestamp <= 0) continue
    result = result == null ? timestamp : pick(result, timestamp)
  }
  return result
}

/**
 * `mergeTailIntoTurnsWithSeam` 的薄封装，只要合并结果。
 *
 * 本地缓存那条路（`reloadLocalTurns`）不需要接缝：缓存刷新不改变时间线往前伸到哪里，
 * `historyWindow` 原封不动就仍然成立。
 *
 * 找不到接缝时保留拼接语义（前缀 + 尾部），不做「整体采用尾部」——
 * 尾部只有一页，丢掉前缀就是把用户翻出来的历史砍掉。同一条 prompt 的实时副本与缓存
 * 副本能互相认出来（`resolveTurnMergeIdentityAliases` 反推 `remote:` 前缀），所以
 * 「认不出接缝」在这条路上就是真的没有重叠，拼接是对的。
 */
export function mergeTailIntoTurns(
  currentTurns: MessageTurn[],
  tailTurns: MessageTurn[],
): MessageTurn[] {
  return mergeTailIntoTurnsWithSeam(currentTurns, tailTurns).turns
}

export function stableSerializeContent(content: ContentPart[]) {
  return JSON.stringify(content.map(stableNormalizePart))
}

function stableNormalizePart(part: ContentPart): Record<string, any> {
  if (part.type === "text") {
    return { type: "text", text: part.text || "" }
  }
  if (part.type === "thinking") {
    return { type: "thinking", thinking: part.thinking || "" }
  }
  if (part.type === "tool_call") {
    return {
      type: "tool_call",
      tool_call: sortUnknown(stripNonContentToolCallFields(part.tool_call || {})),
    }
  }
  if (part.type === "tool_result") {
    return {
      type: "tool_result",
      tool_result: sortUnknown(part.tool_result || {}),
    }
  }
  if (part.type === "image") {
    return {
      type: "image",
      image: sortUnknown(part.image || {}),
    }
  }
  if (part.type === "plan") {
    return {
      type: "plan",
      plan: sortUnknown(part.plan || {}),
    }
  }
  return sortUnknown(part as unknown as Record<string, unknown>) as Record<string, any>
}

/**
 * 从 `tool_call` 里剔除**不参与内容身份**的字段。
 *
 * `agentStats`（子智能体的 `agent_stats`）与 `meta` 都不是内容，而且 `agentStats` 是
 * **原地回填**的：`normalizeBlocks` 先按 `tool_use` 建出 tool_call，等扫到配对的
 * `tool_result` 才 `matched.tool_call.agentStats = stats`。把它算进指纹，同一条轮次在
 * 「回填前」和「回填后」会得到两个不同的 `fp:` 键 —— 本地缓存那份与远端那份认不出是
 * 同一条，详情页直接重复一条消息（正是 `mcode-turn-identity-invariants` 记的那类事故）。
 *
 * `meta` 一并剔除：它是 `_meta` 原样透传，服务端加字段就会平移全表的指纹，而它对
 * 「这一轮讲了什么」毫无贡献。
 */
function stripNonContentToolCallFields(toolCall: Record<string, any>): Record<string, any> {
  const { agentStats, meta, ...rest } = toolCall as Record<string, unknown>
  return rest as Record<string, any>
}

function sortUnknown(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortUnknown)
  }
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = sortUnknown((value as Record<string, unknown>)[key])
        return result
      }, {})
  }
  return value
}

export function stableHashString(input: string) {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  }
  return ""
}
