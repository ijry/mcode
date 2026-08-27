import type { ContentPart, MessageTurn } from "@/types/acp";
import { ensureConversationSchema } from "@/services/db/migrations";
import {
  getConversationSummaryById,
  replaceCompletedTurns,
  upsertConversationSummary,
  type ConversationSummaryRecord,
  type PersistedTurnRecord,
} from "@/services/db/repositories/conversationRepository";
import { normalizeConversationSummaryStatus } from "./conversationSummaryStatus";
import { readLocalTurnCacheEnabled } from "./localTurnCachePreference";
import {
  buildPersistedTurnStorageId,
  buildTurnDedupeKey,
  dropEmptyThinkingParts,
  normalizeTurnRole,
} from "./conversationTurnIdentity";
import { clampSubagentStats } from "./subagentToolCall";
import { normalizeAgentType } from "@/services/conversation/agentType"

// 去重键算法集中在 conversationTurnIdentity（纯函数、不依赖 SQLite 驱动），这里
// 继续 re-export 以保持既有引用点不变，并确保「落库时算的键」与「归一化/时间线
// 折叠时算的键」永远来自同一份实现。
export { buildTurnDedupeKey };

interface PersistConversationDetailInput {
  instanceKey: string;
  conversationId: number;
  detail: any;
  fallbackFolderId?: number;
  fallbackConnectionId?: string | null;
  persistTurns?: boolean;
}

export interface PersistConversationDetailResult {
  persistedTurnCount: number;
  summary: ConversationSummaryRecord | null;
}

interface NormalizedTurn extends MessageTurn {
  seq?: number | null;
}

interface BuildPersistedTurnInput {
  turn: Pick<MessageTurn, "id" | "role" | "content" | "timestamp" | "status">;
  conversationId: number;
  instanceKey: string;
  seq?: number | null;
  dedupeId?: string | null;
}

export async function persistConversationDetailSnapshot(
  input: PersistConversationDetailInput,
): Promise<PersistConversationDetailResult> {
  await ensureConversationSchema();

  // 实验性开关关闭（默认）时**一条轮次都不写**。摘要仍然写 —— 关掉摘要会让会话列表
  // 在离线时整个空白，那不是这个开关的语义（见 `localTurnCachePreference` 的说明）。
  const shouldPersistTurns =
    input.persistTurns !== false && readLocalTurnCacheEnabled();
  const currentSummary = input.instanceKey
    ? await getConversationSummaryById(input.instanceKey, input.conversationId)
    : null;
  const normalizedTurns = shouldPersistTurns
    ? normalizeTurns(input.detail?.turns)
    : [];
  const summary = buildSummaryRecord(input, currentSummary, normalizedTurns);

  if (summary) {
    console.warn("[conversation-summary] persist detail snapshot", {
      conversationId: input.conversationId,
      instanceKey: input.instanceKey,
      persistTurns: shouldPersistTurns,
      currentStatus: currentSummary?.status ?? null,
      detailStatus:
        input.detail?.status ?? input.detail?.summary?.status ?? null,
      nextStatus: summary.status,
      turnCount: normalizedTurns.length,
    });
    await upsertConversationSummary(summary);
  }

  if (shouldPersistTurns) {
    await replaceCompletedTurns(
      input.conversationId,
      normalizedTurns.map((turn) =>
        buildPersistedTurnRecord({
          turn,
          conversationId: input.conversationId,
          instanceKey: input.instanceKey,
          seq: turn.seq ?? turn.timestamp,
          dedupeId: turn.id,
        }),
      ),
    );
  }

  return {
    persistedTurnCount: shouldPersistTurns ? normalizedTurns.length : 0,
    summary,
  };
}


function buildSummaryRecord(
  input: PersistConversationDetailInput,
  currentSummary: ConversationSummaryRecord | null,
  turns: NormalizedTurn[],
): ConversationSummaryRecord | null {
  if (!input.instanceKey) return null;

  const rawDetail =
    input.detail && typeof input.detail === "object" ? input.detail : {};
  const summary =
    rawDetail.summary && typeof rawDetail.summary === "object"
      ? rawDetail.summary
      : {};
  const newestTurn = turns.reduce<NormalizedTurn | null>((latest, turn) => {
    if (!latest) return turn;
    return turn.timestamp >= latest.timestamp ? turn : latest;
  }, null);
  const lastMessageAt =
    newestTurn?.timestamp ??
    parseTimestamp(
      rawDetail.updatedAt,
      rawDetail.updated_at,
      summary.updated_at,
    ) ??
    currentSummary?.lastMessageAt ??
    Date.now();

  return {
    id: input.conversationId,
    instanceKey: input.instanceKey,
    folderId:
      firstNumber(
        rawDetail.folderId,
        rawDetail.folder_id,
        summary.folderId,
        summary.folder_id,
        currentSummary?.folderId,
        input.fallbackFolderId,
      ) ?? 0,
    title:
      firstString(
        rawDetail.title,
        rawDetail.conversationTitle,
        summary.title,
        currentSummary?.title,
      ) || `会话 #${input.conversationId}`,
    agentType: normalizeAgentType(
      firstString(
        rawDetail.agentType,
        rawDetail.agent_type,
        summary.agentType,
        summary.agent_type,
        currentSummary?.agentType,
      ) || "claude_code",
    ),
    externalId:
      firstString(
        rawDetail.sessionId,
        rawDetail.session_id,
        summary.externalId,
        summary.external_id,
        currentSummary?.externalId,
      ) || null,
    connectionId:
      firstString(
        input.fallbackConnectionId,
        rawDetail.connectionId,
        rawDetail.connection_id,
        summary.connectionId,
        summary.connection_id,
        currentSummary?.connectionId,
      ) || null,
    status: normalizeConversationSummaryStatus(
      firstString(rawDetail.status, summary.status, currentSummary?.status) ||
        "unknown",
    ),
    lastTurnId: newestTurn?.id || currentSummary?.lastTurnId || null,
    lastMessageAt,
    unreadCount: currentSummary?.unreadCount ?? 0,
    isPinned: currentSummary?.isPinned ?? false,
    deletedAt: currentSummary?.deletedAt ?? null,
    updatedAt:
      parseTimestamp(
        rawDetail.updatedAt,
        rawDetail.updated_at,
        summary.updated_at,
      ) ?? lastMessageAt,
  };
}

export function buildPersistedTurnRecord(
  input: BuildPersistedTurnInput,
): PersistedTurnRecord {
  const turn = input.turn;
  const dedupeKey = buildTurnDedupeKey({
    turnId: input.dedupeId || turn.id,
    role: turn.role,
    content: turn.content,
    timestamp: turn.timestamp,
  });
  const persistedTurnId = buildPersistedTurnStorageId(
    input.instanceKey,
    input.conversationId,
    dedupeKey,
  );
  return {
    id: persistedTurnId,
    conversationId: input.conversationId,
    instanceKey: input.instanceKey,
    dedupeKey,
    role: turn.role,
    createdAt: turn.timestamp,
    seq: input.seq ?? turn.timestamp,
    status: turn.status ?? "completed",
    version: 1,
    parts: turn.content.map((part, index) => ({
      id: `${persistedTurnId}:${index}`,
      partIndex: index,
      type: part.type,
      payloadJson: JSON.stringify(toPersistedPartPayload(part)),
      updatedAt: turn.timestamp,
    })),
  };
}

function toPersistedPartPayload(part: ContentPart): Record<string, any> {
  if (part.type === "text") return { text: part.text || "" };
  if (part.type === "thinking") return { thinking: part.thinking || "" };
  if (part.type === "tool_call") return { tool_call: part.tool_call || {} };
  if (part.type === "tool_result")
    return { tool_result: part.tool_result || {} };
  if (part.type === "image") return { image: part.image || {} };
  if (part.type === "plan") return { plan: part.plan || {} };
  return { ...part };
}

function normalizeTurns(rawTurns: unknown): NormalizedTurn[] {
  if (!Array.isArray(rawTurns)) return [];
  return rawTurns
    .map((raw, index) => normalizeTurn(raw, index))
    .filter(Boolean) as NormalizedTurn[];
}

function normalizeTurn(raw: any, index: number): NormalizedTurn | null {
  if (!raw || typeof raw !== "object") return null;
  // 与展示侧归一化共用同一份角色判定：`system`（上下文压缩摘要）必须显式识别，
  // 否则会被当成 assistant 落库，重载后依然把压缩说明当 agent 回复渲染出来。
  const role = normalizeTurnRole(raw.role);
  const content = normalizeContentParts(raw.content, raw.blocks);
  const id = firstString(raw.id) || `turn-${index}-${Date.now()}`;
  const timestamp =
    parseTimestamp(raw.timestamp, raw.createdAt, raw.created_at) ?? Date.now();

  return {
    id,
    role,
    content,
    timestamp,
    status: raw.status,
    error: firstString(raw.error) || undefined,
    seq: firstNumber(raw.seq, raw.sequence, raw.index) ?? timestamp,
  };
}

/**
 * 落库侧的内容归一化。与展示侧（`detailDataNormalization.normalizeContentParts`）保持
 * 同样的结构：解析出来之后统一丢弃空 thinking 胶囊，**空块因此也不会进 SQLite** ——
 * 否则清了缓存才好、重载又会把它们读回来。
 *
 * 过滤放在出口而不是 `normalizeBlocks` 里逐条跳过，原因见展示侧那份注释
 * （里面的 `parts.length > 0` 分支选择依赖「这一路有没有解析出东西」）。
 */
function normalizeContentParts(
  rawContent: unknown,
  rawBlocks?: unknown,
): ContentPart[] {
  return dropEmptyThinkingParts(
    selectNormalizedContentParts(rawContent, rawBlocks),
  );
}

function selectNormalizedContentParts(
  rawContent: unknown,
  rawBlocks?: unknown,
): ContentPart[] {
  if (Array.isArray(rawBlocks) && rawBlocks.length > 0) {
    const parts = normalizeBlocks(rawBlocks);
    if (parts.length > 0) return parts;
  }

  if (Array.isArray(rawContent)) {
    const hasCodegToolBlocks = rawContent.some((part: any) => {
      const type = firstString(part?.type);
      return type === "tool_use" || type === "tool_result";
    });
    if (hasCodegToolBlocks) {
      const parts = normalizeBlocks(rawContent);
      if (parts.length > 0) return parts;
    }
    return rawContent
      .map((part) => normalizeContentPart(part))
      .filter(Boolean) as ContentPart[];
  }

  const text = firstString(rawContent);
  if (text) return [{ type: "text", text }];
  return [];
}

function normalizeContentPart(raw: any): ContentPart | null {
  if (!raw || typeof raw !== "object") {
    const text = firstString(raw);
    return text ? { type: "text", text } : null;
  }

  const type = firstString(raw.type);
  if (type === "text")
    return { type: "text", text: firstString(raw.text) || "" };
  if (type === "thinking") {
    return {
      type: "thinking",
      thinking: firstString(raw.thinking, raw.text) || "",
    };
  }
  if (
    type === "tool_call" &&
    raw.tool_call &&
    typeof raw.tool_call === "object"
  ) {
    return {
      type: "tool_call",
      tool_call: {
        id: firstString(raw.tool_call.id) || `tool-${Date.now()}`,
        name: firstString(raw.tool_call.name) || "unknown",
        input:
          raw.tool_call.input && typeof raw.tool_call.input === "object"
            ? raw.tool_call.input
            : {},
        status: raw.tool_call.status,
        output:
          firstString(raw.tool_call.output, raw.tool_call.rawOutput) ||
          undefined,
        error: firstString(raw.tool_call.error) || undefined,
        rawOutput: firstString(raw.tool_call.rawOutput) || undefined,
        meta: recordFromUnknown(raw.tool_call.meta),
        agentStats:
          clampSubagentStats(
            raw.tool_call.agentStats ?? raw.tool_call.agent_stats,
          ) || null,
      },
    };
  }
  if (type === "image" && raw.image && typeof raw.image === "object") {
    return {
      type: "image",
      image: {
        url: firstString(raw.image.url) || "",
        alt: firstString(raw.image.alt) || undefined,
      },
    };
  }
  if (type === "plan" && raw.plan && typeof raw.plan === "object") {
    const steps = Array.isArray(raw.plan.steps) ? raw.plan.steps : [];
    return {
      type: "plan",
      plan: {
        steps: steps
          .map((step: any) => ({
            description:
              firstString(step?.description, step?.title, step?.content) || "",
            completed: Boolean(step?.completed),
          }))
          .filter((step: any) => step.description),
        status: raw.plan.status,
      },
    };
  }

  const text = firstString(raw.text, raw.content, raw.description);
  return text ? { type: "text", text } : null;
}

function normalizeBlocks(rawBlocks: unknown[]): ContentPart[] {
  const parts: ContentPart[] = [];
  const consumedResultIndexes = new Set<number>();

  for (let index = 0; index < rawBlocks.length; index++) {
    if (consumedResultIndexes.has(index)) continue;
    const block = rawBlocks[index] as any;
    if (!block || typeof block !== "object") continue;
    const type = firstString(block.type);
    if (type === "text") {
      parts.push({ type: "text", text: firstString(block.text) || "" });
      continue;
    }
    if (type === "thinking") {
      parts.push({ type: "thinking", thinking: firstString(block.text) || "" });
      continue;
    }
    if (type === "image") {
      const uri = firstString(block.uri);
      const data = firstString(block.data);
      const mime = firstString(block.mime_type) || "image/png";
      parts.push({
        type: "image",
        image: {
          url: uri || (data ? `data:${mime};base64,${data}` : ""),
          alt: "image",
        },
      });
      continue;
    }
    if (type === "tool_use") {
      const toolUseId = firstString(block.tool_use_id);
      const inputPreview = firstString(block.input_preview);
      const nextBlock = rawBlocks[index + 1] as any;
      const canPairByPosition =
        !toolUseId &&
        nextBlock &&
        typeof nextBlock === "object" &&
        firstString(nextBlock.type) === "tool_result" &&
        !firstString(nextBlock.tool_use_id);
      const matchedResult = toolUseId
        ? rawBlocks.find(
            (candidate: any) =>
              candidate &&
              typeof candidate === "object" &&
              firstString(candidate.type) === "tool_result" &&
              firstString(candidate.tool_use_id) === toolUseId,
          )
        : canPairByPosition
          ? nextBlock
          : null;

      if (canPairByPosition) {
        consumedResultIndexes.add(index + 1);
      }

      const output = matchedResult
        ? firstString(matchedResult.output_preview) || ""
        : undefined;
      const isError = Boolean(matchedResult?.is_error);
      parts.push({
        type: "tool_call",
        tool_call: {
          id: toolUseId || `tool-${index}-${Date.now()}`,
          name: firstString(block.tool_name) || "tool",
          input: toObject(inputPreview) || {},
          output,
          status: matchedResult ? (isError ? "error" : "completed") : "running",
          error: isError ? output : undefined,
          meta: recordFromUnknown(block.meta),
          // 子智能体的状态/耗时/内层工具列表都在 tool_result 的 agent_stats 上。
          agentStats: clampSubagentStats(matchedResult?.agent_stats) || null,
        },
      });
      continue;
    }
    if (type === "tool_result") {
      const toolUseId = firstString(block.tool_use_id);
      const output = firstString(block.output_preview) || "";
      if (toolUseId) {
        const matched = [...parts]
          .reverse()
          .find(
            (part) =>
              part.type === "tool_call" && part.tool_call?.id === toolUseId,
          );
        if (matched?.tool_call) {
          matched.tool_call.output = output;
          matched.tool_call.status = block.is_error ? "error" : "completed";
          if (block.is_error) matched.tool_call.error = output;
          // 带 tool_use_id 的常规配对会走到这里（`consumedResultIndexes` 只在按位置
          // 配对时才登记），所以 agent_stats 也要在这条路上回填。
          const stats = clampSubagentStats(block.agent_stats);
          if (stats) matched.tool_call.agentStats = stats;
          continue;
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
      });
    }
  }

  return parts;
}

function toObject(text: string): Record<string, any> | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * `meta` 在线上已经是对象，不是 JSON 串 —— 上面那个 `toObject` 只吃字符串，
 * 直接拿它解对象会走进 catch 静默变 null。
 */
function recordFromUnknown(value: unknown): Record<string, any> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, any>;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function parseTimestamp(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const timestamp = new Date(value).getTime();
      if (Number.isFinite(timestamp)) {
        return timestamp;
      }
    }
  }
  return null;
}
