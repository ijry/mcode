import type { BubbleDisplayPart, ContentPart, ToolCall } from "@/types/acp"
import { buildGoalDisplayParts } from "./goalToolCall"
import { isEmptyThinkingPart } from "./conversationTurnIdentity"
import { isSubagentToolCall } from "./subagentToolCall"

/**
 * 把一轮的 content parts 折成气泡实际渲染的列表：goal 生命周期收成 `goal_run`、
 * 原生子智能体单独成 `subagent_call` 胶囊、其余相邻工具调用并成 `tool_call_group`。
 *
 * 抽成纯模块的原因有两个：
 *
 * 1. 这段分组循环原先在 `MessageBubble.vue` 和 `GoalToolCallBlock.vue` 各有一份。
 *    加子智能体豁免时若不抽，就会出现「`/goal` 运行块里的子智能体仍被并进
 *    『调用 N 个工具』」的功能缺口。
 * 2. 原先它只有 `fs.readFileSync` + `toContain` 的源码文本测试，挡不住行为回归 ——
 *    `isEmptyThinkingPart` 曾在 `MessageBubble.vue` 里被调用却没被 import，
 *    非流式轮次每次重算都 `ReferenceError`，而那两条文本断言一直是绿的。
 */
export function buildBubbleDisplayParts(input: {
  parts: ContentPart[]
  isStreaming?: boolean
  /** true 时跳过 goal 生命周期折叠 —— 供 `GoalToolCallBlock` 复用，防止 goal 卡里再套 goal 卡。 */
  skipGoalRuns?: boolean
}): BubbleDisplayPart[] {
  const isStreaming = Boolean(input.isStreaming)
  const source = input.skipGoalRuns
    ? input.parts || []
    : buildGoalDisplayParts(input.parts || [], isStreaming)

  const grouped: BubbleDisplayPart[] = []
  let pendingToolCalls: ToolCall[] = []

  const flushPendingToolCalls = () => {
    if (pendingToolCalls.length === 0) return
    grouped.push({ type: "tool_call_group", tool_calls: pendingToolCalls })
    pendingToolCalls = []
  }

  for (const part of source) {
    if (part.type === "tool_call" && (part as ContentPart).tool_call) {
      const toolCall = (part as ContentPart).tool_call as ToolCall
      // 原生子智能体自带一整段会话，并进通用工具组就会退化成「调用 N 个工具」，
      // 且它的正文会把父气泡撑得极长。单独成胶囊，默认折叠。
      if (isSubagentToolCall(toolCall)) {
        flushPendingToolCalls()
        grouped.push({ type: "subagent_call", tool_call: toolCall })
        continue
      }
      pendingToolCalls.push(toolCall)
      continue
    }

    // 兜底丢弃空的 thinking 胶囊：服务端确实会发 `{type:"thinking",thinking:""}`，
    // 一轮里可能有很多个，渲染出来就是一排点开全空的「深度思考」。
    // 归一化层（`dropEmptyThinkingParts`）已经滤过一遍，这里是第二道防线 ——
    // 参考实现 codeg-plus 同样是两层（适配器丢弃 + 渲染层 `expandable` 守卫）。
    //
    // **流式期间不能丢**：空 thinking 是驱动「正在思考」的合法实时状态，对
    // reasoning-redacting 模型来说正文永远不会补上来，丢了就等于把思考反馈抹掉。
    //
    // 过滤必须发生在这里（分配下标之前）而不是模板的 `v-else-if` 上：折叠状态
    // `isThinkingCollapsed(index)` 用的是渲染列表的下标，在模板里跳过会让下标与
    // 实际渲染项错位，点一个展开另一个。
    if (!isStreaming && isEmptyThinkingPart(part as ContentPart)) {
      continue
    }

    flushPendingToolCalls()
    grouped.push(part as BubbleDisplayPart)
  }

  flushPendingToolCalls()
  return grouped
}
