import type { ContentPart, MessageTurn } from "@/types/acp"
import type {
  PersistedTurnPartRow,
  PersistedTurnWithParts,
} from "@/services/db/repositories/conversationRepository"
import { buildTurnDedupeKey, dropEmptyThinkingParts, normalizeTurnRole } from "@/services/conversation/conversationTurnIdentity"
import { clampSubagentStats } from "@/services/conversation/subagentToolCall"

export interface UploadedAttachment {
  id: string
  url: string
  name: string
  size: number
  type: string
  kind: "image" | "file"
  localPath?: string
  remoteUrl?: string
  data?: string
}

export interface QueuedDraft {
  id: string
  text: string
  attachments: UploadedAttachment[]
  createdAt: number
  status: "pending" | "sending" | "failed"
  error?: string
}

export interface ConversationDraftSnapshot {
  composerText: string
  draftQueue: QueuedDraft[]
  attachments: UploadedAttachment[]
  queueExpanded: boolean
}

export interface ConversationDraftRestoreState extends ConversationDraftSnapshot {}

export type RestoredIdFactory = (prefix: string) => string

export function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return undefined
}

export function toObject(raw: unknown): Record<string, any> | null {
  if (!raw) return null
  if (typeof raw === "object") return raw as Record<string, any>
  if (typeof raw !== "string") return null

  const text = raw.trim()
  if (!text) return null

  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === "object") return parsed as Record<string, any>
    return null
  } catch {
    return null
  }
}

export function safeParseArray(value?: string | null) {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function normalizeList(input: unknown): any[] {
  return Array.isArray(input) ? input : []
}

export function normalizeTurns(rawTurns: unknown): MessageTurn[] {
  if (!Array.isArray(rawTurns)) return []
  return rawTurns.map((raw, index) => normalizeTurn(raw, index)).filter(Boolean) as MessageTurn[]
}

/**
 * 与服务端 `TurnRole`（`models/message.rs`）一一对应的三种角色。
 *
 * 实现在 `conversationTurnIdentity`（纯模块），与落库版归一化共用同一份判定，
 * 避免两处归一化再次漂移。这里 re-export 保持既有引用点不变。
 */
export { normalizeTurnRole }

function normalizeTurn(raw: any, index: number): MessageTurn | null {
  if (!raw || typeof raw !== "object") return null
  const role = normalizeTurnRole(raw.role)
  const content = normalizeContentParts(raw.content, raw.blocks)
  const timestamp =
    typeof raw.timestamp === "number"
      ? raw.timestamp
      : typeof raw.timestamp === "string"
        ? Date.parse(raw.timestamp) || Date.now()
        : typeof raw.created_at === "number"
          ? raw.created_at
          : Date.now()
  // 与 SQLite 落库同源的稳定键：CodeG 解析器的 turn id 是「按下标派生」的
  // （turn-N / grok-turn-N / acp-N），历史被压缩重写时整段会平移，因此它不能
  // 当跨来源身份用。dedupeKey 对 turn- 前缀自动退化成内容指纹，正好覆盖这点。
  const dedupeKey = buildTurnDedupeKey({
    turnId: firstString(raw.id),
    role,
    content,
    timestamp,
  })
  // 服务端缺 id 时不要再用 Date.now() 造 id —— 每次归一化都会得到一个新 id，
  // 让同一条轮次在时间线上无限分裂。退回稳定的 dedupeKey 派生 id。
  const id = firstString(raw.id) || `turn-${index}-${dedupeKey}`

  return {
    id,
    dedupeKey,
    role,
    content,
    timestamp,
    status: raw.status,
    error: firstString(raw.error),
  }
}

/**
 * 归一化服务端下发的一轮内容。
 *
 * 末尾统一丢弃**空的 thinking 胶囊**（`dropEmptyThinkingParts`）：服务端确实会发
 * `{"type":"thinking","thinking":""}`，一轮里可能有很多个，不过滤就是一堆点开全空的
 * 「深度思考」折叠块。放在**出口**做而不是在 `normalizeBlocks` / `normalizeContentPart`
 * 里逐条跳过，是因为上面那三处 `if (parts.length > 0) return parts` 的分支选择依赖
 * 「这一路解析出没出东西」—— 在里面过滤会让「只有空 thinking」的一轮被判成解析失败，
 * 从而回退到另一条解析路径，那是行为改变。
 *
 * 这条路径**只喂历史/回放渲染**（`normalizeTurn` 与 `mapPersistedTurnToMessage`），
 * 流式内容走 `conversationRuntime` 的累加器，不经过这里 —— 所以在这里过滤天然满足
 * 「只在非流式路径丢」的要求，见 `isEmptyThinkingPart` 的说明。
 */
export function normalizeContentParts(rawContent: unknown, rawBlocks?: unknown): ContentPart[] {
  return dropEmptyThinkingParts(selectNormalizedContentParts(rawContent, rawBlocks))
}

function selectNormalizedContentParts(rawContent: unknown, rawBlocks?: unknown): ContentPart[] {
  if (Array.isArray(rawBlocks) && rawBlocks.length > 0) {
    const parts = normalizeBlocks(rawBlocks)
    if (parts.length > 0) return parts
  }

  if (Array.isArray(rawContent)) {
    const hasCodegToolBlocks = rawContent.some((part: any) => {
      const type = firstString(part?.type)
      return type === "tool_use" || type === "tool_result"
    })
    if (hasCodegToolBlocks) {
      const parts = normalizeBlocks(rawContent)
      if (parts.length > 0) return parts
    }
    return rawContent
      .map((part) => normalizeContentPart(part))
      .filter(Boolean) as ContentPart[]
  }

  const text = firstString(rawContent)
  if (text) return [{ type: "text", text }]
  return []
}

function normalizeContentPart(raw: any): ContentPart | null {
  if (!raw || typeof raw !== "object") {
    const text = firstString(raw)
    return text ? { type: "text", text } : null
  }

  const type = firstString(raw.type)
  if (type === "text") return { type: "text", text: firstString(raw.text) || "" }
  if (type === "thinking") return { type: "thinking", thinking: firstString(raw.thinking) || "" }
  if (type === "tool_call" && raw.tool_call && typeof raw.tool_call === "object") {
    return {
      type: "tool_call",
      tool_call: {
        id: firstString(raw.tool_call.id) || `tool-${Date.now()}`,
        name: firstString(raw.tool_call.name) || "unknown",
        input: (raw.tool_call.input && typeof raw.tool_call.input === "object")
          ? raw.tool_call.input
          : {},
        status: raw.tool_call.status,
        output: firstString(raw.tool_call.output, raw.tool_call.rawOutput),
        error: firstString(raw.tool_call.error),
        rawOutput: firstString(raw.tool_call.rawOutput),
        meta: toObject(raw.tool_call.meta) || null,
        agentStats:
          clampSubagentStats(raw.tool_call.agentStats ?? raw.tool_call.agent_stats) || null,
      },
    }
  }
  if (type === "image" && raw.image && typeof raw.image === "object") {
    return {
      type: "image",
      image: {
        url: firstString(raw.image.url) || "",
        alt: firstString(raw.image.alt),
      },
    }
  }
  if (type === "plan" && raw.plan && typeof raw.plan === "object") {
    const steps = Array.isArray(raw.plan.steps) ? raw.plan.steps : []
    return {
      type: "plan",
      plan: {
        steps: steps
          .map((step: any) => ({
            description: firstString(step?.description, step?.title, step?.content) || "",
            completed: Boolean(step?.completed),
          }))
          .filter((step: any) => step.description),
        status: raw.plan.status,
      },
    }
  }

  const text = firstString(raw.text, raw.content, raw.description)
  return text ? { type: "text", text } : null
}

export function getTurnContentParts(turn: any): ContentPart[] {
  if (turn?.content && Array.isArray(turn.content)) return turn.content as ContentPart[]
  return normalizeContentParts(turn?.content, turn?.blocks)
}

export function mapPersistedTurnToMessage(turn: PersistedTurnWithParts): MessageTurn {
  return {
    id: turn.id,
    // SQLite 行自带的 dedupe_key 与服务端载荷算出来的键同源，携带它才能让
    // 「本地缓存水合」与「远端对账」认出同一条逻辑轮次。
    dedupeKey: firstString(turn.dedupeKey) || undefined,
    // 与 conversationRuntime 的私有副本共用同一份角色判定，避免两处再次漂移。
    role: normalizeTurnRole(turn.role),
    timestamp: turn.createdAt,
    status: (turn.status as MessageTurn["status"] | undefined) || "completed",
    // 读回时也要滤掉空 thinking：过滤上线前落库的行里已经存了一批空胶囊，
    // 只在写入侧过滤治不了存量缓存。
    content: dropEmptyThinkingParts(
      turn.parts
        .slice()
        .sort((a, b) => a.partIndex - b.partIndex)
        .map(mapPersistedPartToContent)
        .filter(Boolean) as ContentPart[],
    ),
  }
}

function mapPersistedPartToContent(part: PersistedTurnPartRow): ContentPart | null {
  try {
    const payload = JSON.parse(part.payloadJson || "{}") as Record<string, any>
    if (part.type === "text") {
      return {
        type: "text",
        text: String(payload.text || payload.value || ""),
      }
    }
    if (part.type === "thinking") {
      return {
        type: "thinking",
        thinking: String(payload.thinking || payload.text || payload.value || ""),
      }
    }
    if (part.type === "tool_call") {
      return {
        type: "tool_call",
        tool_call: payload.tool_call || payload,
      }
    }
    if (part.type === "image") {
      return {
        type: "image",
        image: payload.image || payload,
      }
    }
    if (part.type === "plan") {
      return {
        type: "plan",
        plan: payload.plan || payload,
      }
    }
  } catch (error) {
    console.warn("failed to parse local part payload", error)
  }
  return null
}

export function normalizeAgentType(raw?: string): string {
  const value = String(raw || "").trim().toLowerCase().replace(/[\s-]/g, "_")
  if (!value) return "claude_code"
  if (value === "claudecode") return "claude_code"
  if (value === "codex_cli") return "codex"
  if (value === "gemini_cli" || value === "google_gemini" || value === "gemini_code") return "gemini"
  if (value === "cline_cli") return "cline"
  if (value === "opencode") return "open_code"
  if (value === "open_code_cli") return "open_code"
  if (value === "openclaw") return "open_claw"
  if (value === "open_claw_cli") return "open_claw"
  return value
}

function normalizeBlocks(rawBlocks: unknown[]): ContentPart[] {
  const parts: ContentPart[] = []
  const consumedResultIndexes = new Set<number>()

  for (let index = 0; index < rawBlocks.length; index++) {
    if (consumedResultIndexes.has(index)) continue
    const block = rawBlocks[index] as any
    if (!block || typeof block !== "object") continue
    const type = firstString(block.type)
    if (type === "text") {
      parts.push({ type: "text", text: firstString(block.text) || "" })
      continue
    }
    if (type === "thinking") {
      parts.push({ type: "thinking", thinking: firstString(block.text) || "" })
      continue
    }
    if (type === "image") {
      const uri = firstString(block.uri)
      const data = firstString(block.data)
      const mime = firstString(block.mime_type) || "image/png"
      parts.push({
        type: "image",
        image: {
          url: uri || (data ? `data:${mime};base64,${data}` : ""),
          alt: "image",
        },
      })
      continue
    }
    if (type === "tool_use") {
      const toolUseId = firstString(block.tool_use_id)
      const inputPreview = firstString(block.input_preview)
      const nextBlock = rawBlocks[index + 1] as any
      const canPairByPosition =
        !toolUseId &&
        nextBlock &&
        typeof nextBlock === "object" &&
        firstString(nextBlock.type) === "tool_result" &&
        !firstString(nextBlock.tool_use_id)
      const matchedResult =
        toolUseId
          ? rawBlocks.find((candidate: any) =>
              candidate &&
              typeof candidate === "object" &&
              firstString(candidate.type) === "tool_result" &&
              firstString(candidate.tool_use_id) === toolUseId
            )
          : canPairByPosition
            ? nextBlock
            : null

      if (canPairByPosition) {
        consumedResultIndexes.add(index + 1)
      }

      const output = matchedResult ? firstString(matchedResult.output_preview) || "" : undefined
      const isError = Boolean(matchedResult?.is_error)
      parts.push({
        type: "tool_call",
        tool_call: {
          id: toolUseId || `tool-${index}-${Date.now()}`,
          name: firstString(block.tool_name) || "tool",
          input: toObject(inputPreview) || {},
          output,
          status: matchedResult ? (isError ? "error" : "completed") : "running",
          error: isError ? output : undefined,
          meta: toObject(block.meta) || null,
          // 子智能体的状态/耗时/内层工具列表都在 tool_result 的 agent_stats 上。
          agentStats: clampSubagentStats(matchedResult?.agent_stats) || null,
        },
      })
      continue
    }
    if (type === "tool_result") {
      const toolUseId = firstString(block.tool_use_id)
      const output = firstString(block.output_preview) || ""
      if (toolUseId) {
        const matched = [...parts].reverse().find(
          (part) => part.type === "tool_call" && part.tool_call?.id === toolUseId
        )
        if (matched?.tool_call) {
          matched.tool_call.output = output
          matched.tool_call.status = block.is_error ? "error" : "completed"
          if (block.is_error) matched.tool_call.error = output
          // 带 tool_use_id 的常规配对会走到这里（`consumedResultIndexes` 只在按位置
          // 配对时才登记），所以 agent_stats 也要在这条路上回填。
          const stats = clampSubagentStats(block.agent_stats)
          if (stats) matched.tool_call.agentStats = stats
          continue
        }
      }
      parts.push({
        type: "tool_call",
        tool_call: {
          id: toolUseId || `tool-${index}-${Date.now()}`,
          name: "tool_result",
          input: {},
          output,
          status: block.is_error ? "error" : "completed",
          error: block.is_error ? output : undefined,
          agentStats: clampSubagentStats(block.agent_stats) || null,
        },
      })
    }
  }

  return parts
}

export function normalizeAttachments(
  source: unknown,
  createId: RestoredIdFactory
): UploadedAttachment[] {
  if (!Array.isArray(source)) return []
  return source
    .map((item, index) => normalizeAttachment(item, index, createId))
    .filter(Boolean) as UploadedAttachment[]
}

function normalizeAttachment(
  source: unknown,
  index: number,
  createId: RestoredIdFactory
): UploadedAttachment | null {
  if (!source || typeof source !== "object") return null
  const record = source as Record<string, unknown>
  const kind = record.kind === "image" ? "image" : record.kind === "file" ? "file" : null
  const url = typeof record.url === "string" ? record.url : ""
  if (!kind || !url) return null
  return {
    id: typeof record.id === "string" && record.id ? record.id : createId(`att-restored-${index}`),
    url,
    name: typeof record.name === "string" ? record.name : "",
    size: Number(record.size || 0),
    type: typeof record.type === "string" ? record.type : "application/octet-stream",
    kind,
    ...(typeof record.localPath === "string" && record.localPath ? { localPath: record.localPath } : {}),
    ...(typeof record.remoteUrl === "string" && record.remoteUrl ? { remoteUrl: record.remoteUrl } : {}),
  }
}

export function normalizeDraftQueue(
  source: unknown,
  createId: RestoredIdFactory
): QueuedDraft[] {
  if (!Array.isArray(source)) return []
  return source
    .map((item, index) => normalizeDraft(item, index, createId))
    .filter(Boolean) as QueuedDraft[]
}

function normalizeDraft(
  source: unknown,
  index: number,
  createId: RestoredIdFactory
): QueuedDraft | null {
  if (!source || typeof source !== "object") return null
  const record = source as Record<string, unknown>
  const rawStatus = record.status === "failed" ? "failed" : record.status === "sending" ? "sending" : "pending"
  const status: QueuedDraft["status"] = rawStatus === "sending" ? "pending" : rawStatus
  return {
    id: typeof record.id === "string" && record.id ? record.id : createId(`draft-restored-${index}`),
    text: typeof record.text === "string" ? record.text : "",
    attachments: normalizeAttachments(record.attachments, createId),
    createdAt: Number(record.createdAt || Date.now()),
    status,
    error: status === "failed" && typeof record.error === "string" ? record.error : undefined,
  }
}

export function cloneAttachments(source: UploadedAttachment[]) {
  return source.map((item) => ({ ...item }))
}

/**
 * 落库前清洗附件：**剔除 `data`（base64 全量图片数据）**。
 *
 * 这不是可选的优化，是必须的：
 *
 * - `data` 单张就可能几 MB（上限见 `PROMPT_IMAGE_MAX_BYTES`）。写进 `uni.storage` 会直接
 *   撞平台配额（通常 10MB 总量）。
 * - 写进 SQLite 更糟：H5 侧每次 `execute` 都会 `h5Db.export()` **把整库 dump 重写进
 *   IndexedDB**（`services/db/sqlite.ts`）。草稿是**每敲一个字**就防抖落盘的，带着几 MB
 *   base64 等于每次按键拷贝一遍整个数据库。
 *
 * 读回那侧本来就不认 `data`（`normalizeAttachment` 的返回对象里没有这个字段），所以这里
 * 剔除**不损失任何能恢复的信息** —— 它补上的是写入侧一直缺的那道对称过滤。
 *
 * 图片数据在发送时按需重读：`prepareDraftForSend` 用 `localPath` / `url` 走
 * `readLocalImageBase64`，读不到就报「本地缓存已失效，请重新选择图片」。所以只存路径是
 * 与既有降级策略配套的，不是偷工减料。
 *
 * **不修改入参**：composer 里那份 attachments 是响应式的、还要继续用来发送，顺手删掉它的
 * `data` 会让紧接着的发送直接失败。
 */
export function sanitizeAttachmentsForPersist(
  source: UploadedAttachment[]
): UploadedAttachment[] {
  return source.map((item) => ({
    id: item.id,
    url: item.url,
    name: item.name,
    size: item.size,
    type: item.type,
    kind: item.kind,
    // 缺失时**不写 undefined 键**，保持与 `normalizeAttachment` 输出同形。
    ...(item.localPath ? { localPath: item.localPath } : {}),
    ...(item.remoteUrl ? { remoteUrl: item.remoteUrl } : {}),
  }))
}

export function cloneDraftQueue(source: QueuedDraft[]) {
  return source.map((item) => ({
    ...item,
    attachments: cloneAttachments(item.attachments),
  }))
}

export function normalizeConversationDraftSnapshot(
  source: unknown,
  createId: RestoredIdFactory
): ConversationDraftSnapshot | null {
  if (!source || typeof source !== "object") return null
  const record = source as Record<string, unknown>
  return {
    composerText: typeof record.composerText === "string" ? record.composerText : "",
    draftQueue: normalizeDraftQueue(record.draftQueue, createId),
    attachments: normalizeAttachments(record.attachments, createId),
    queueExpanded: Boolean(record.queueExpanded),
  }
}

export function resolveConversationDraftRestoreState(input: {
  cachedViewState?: Partial<ConversationDraftSnapshot> | null
  localSnapshot?: ConversationDraftSnapshot | null
  persistedRuntime?: {
    composerText?: string | null
    draftQueueJson?: string | null
    attachmentsJson?: string | null
  } | null
  createId: RestoredIdFactory
}): ConversationDraftRestoreState {
  const sourceComposer =
    input.cachedViewState?.composerText
    ?? input.localSnapshot?.composerText
    ?? input.persistedRuntime?.composerText
    ?? ""
  const sourceDraftQueue =
    input.cachedViewState?.draftQueue
    ?? input.localSnapshot?.draftQueue
    ?? safeParseArray(input.persistedRuntime?.draftQueueJson)
  const sourceAttachments =
    input.cachedViewState?.attachments
    ?? input.localSnapshot?.attachments
    ?? safeParseArray(input.persistedRuntime?.attachmentsJson)
  const draftQueue = normalizeDraftQueue(sourceDraftQueue, input.createId)
  const attachments = normalizeAttachments(sourceAttachments, input.createId)

  return {
    composerText: typeof sourceComposer === "string" ? sourceComposer : "",
    draftQueue,
    attachments,
    queueExpanded:
      typeof input.cachedViewState?.queueExpanded === "boolean"
        ? input.cachedViewState.queueExpanded
        : typeof input.localSnapshot?.queueExpanded === "boolean"
          ? input.localSnapshot.queueExpanded
          : draftQueue.length > 0,
  }
}

export function buildConversationDraftSnapshot(input: ConversationDraftSnapshot): ConversationDraftSnapshot {
  return {
    composerText: input.composerText,
    draftQueue: cloneDraftQueue(input.draftQueue),
    attachments: cloneAttachments(input.attachments),
    queueExpanded: input.queueExpanded,
  }
}

export function isConversationDraftSnapshotEmpty(input: Pick<
  ConversationDraftSnapshot,
  "composerText" | "draftQueue" | "attachments"
>) {
  return input.composerText.length === 0 && input.attachments.length === 0 && input.draftQueue.length === 0
}
