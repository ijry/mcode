<template>
  <view
    :class="[
      'goal-card',
      `goal-card--${tone}`,
      expanded && 'goal-card--expanded',
      translucent && 'goal-card--translucent',
    ]"
  >
    <view class="goal-card__summary" @click="toggleExpanded">
      <view :class="['goal-card__dot', isRunning && 'goal-card__dot--running']"></view>
      <view class="goal-card__main">
        <text :class="['goal-card__title', isRunning && 'goal-card__title--running']">
          {{ headerText }}
        </text>
        <view class="goal-card__chips">
          <text v-if="statusLabel" class="goal-card__chip">{{ statusLabel }}</text>
          <text v-if="tokenSummary" class="goal-card__chip">{{ tokenSummary }}</text>
          <text v-if="durationSummary" class="goal-card__chip">{{ durationSummary }}</text>
        </view>
      </view>
      <up-icon
        :name="expanded ? 'arrow-up' : 'arrow-down'"
        size="13"
        :color="iconColor"
      ></up-icon>
    </view>

    <view v-if="expanded" class="goal-card__body">
      <view v-if="goal.objective" class="goal-card__section">
        <text class="goal-card__label">目标</text>
        <text class="goal-card__objective">{{ goal.objective }}</text>
      </view>

      <view v-if="nestedDisplayParts.length > 0" class="goal-card__section">
        <text class="goal-card__label">过程</text>
        <view
          v-for="(item, index) in nestedDisplayParts"
          :key="index"
          class="goal-card__nested"
        >
          <up-markdown
            v-if="item.type === 'text'"
            class="goal-card__markdown"
            :content="item.text || ''"
          ></up-markdown>
          <view v-else-if="item.type === 'thinking'" class="goal-card__thinking">
            <text>{{ item.thinking }}</text>
          </view>
          <ToolCallGroupBlock
            v-else-if="item.type === 'tool_call_group'"
            :toolCalls="item.tool_calls || []"
            :translucent="translucent"
          />
          <SubagentCapsuleBlock
            v-else-if="item.type === 'subagent_call'"
            :key="item.tool_call.id"
            :toolCall="item.tool_call"
            :transcript="subagentTranscript(item.tool_call.id)"
            :translucent="translucent"
          />
          <ToolCallBlock
            v-else-if="item.type === 'tool_call'"
            :toolCall="item.tool_call!"
          />
          <view v-else-if="item.type === 'tool_result'" class="goal-card__result">
            <text>{{ item.tool_result?.output || '（无输出）' }}</text>
          </view>
          <view v-else-if="item.type === 'plan'" class="goal-card__plan">
            <view v-for="(step, stepIndex) in item.plan?.steps" :key="stepIndex" class="goal-card__plan-step">
              <text>{{ step.completed ? '✓' : '•' }}</text>
              <text>{{ step.description }}</text>
            </view>
          </view>
          <image
            v-else-if="item.type === 'image'"
            class="goal-card__image"
            :src="item.image?.url"
            mode="widthFix"
          />
        </view>
      </view>

      <view class="goal-card__meta">
        <text v-if="statusLabel">状态：{{ statusLabel }}</text>
        <text v-if="tokenSummary">已用：{{ tokenSummary }}</text>
        <text v-if="budgetSummary">预算：{{ budgetSummary }}</text>
        <text v-if="remainingSummary">剩余：{{ remainingSummary }}</text>
        <text v-if="durationSummary">耗时：{{ durationSummary }}</text>
      </view>

      <view v-if="errorText" class="goal-card__error">
        <text>{{ errorText }}</text>
      </view>

      <view class="goal-card__collapse" @click.stop="collapseExpanded">
        <text class="goal-card__collapse-text">收起</text>
        <up-icon name="arrow-up" size="12" :color="iconColor"></up-icon>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import type { BubbleDisplayPart, ContentPart, ToolCall } from "@/types/acp"
import { parseGoalToolCall } from "@/services/conversation/goalToolCall"
import { buildBubbleDisplayParts } from "@/services/conversation/bubbleDisplayParts"
import SubagentCapsuleBlock from "./SubagentCapsuleBlock.vue"
import ToolCallBlock from "./ToolCallBlock.vue"
import ToolCallGroupBlock from "./ToolCallGroupBlock.vue"

const props = withDefaults(defineProps<{
  start: ToolCall
  end?: ToolCall | null
  items?: ContentPart[]
  isRunning?: boolean
  translucent?: boolean
  /** 与 `MessageBubble` 同源，按父 tool_call id 索引的子智能体实时正文。 */
  subagentTranscripts?: Record<string, string>
}>(), {
  end: null,
  items: () => [],
  isRunning: false,
  translucent: false,
})

const expanded = ref(false)

const goal = computed(() => {
  const start = parseGoalToolCall(props.start)
  const end = props.end ? parseGoalToolCall(props.end) : null
  return {
    objective: end?.objective ?? start?.objective ?? null,
    status: end?.status ?? start?.status ?? null,
    tokensUsed: end?.tokensUsed ?? start?.tokensUsed ?? null,
    tokenBudget: end?.tokenBudget ?? start?.tokenBudget ?? null,
    remainingTokens: end?.remainingTokens ?? start?.remainingTokens ?? null,
    timeUsedSeconds: end?.timeUsedSeconds ?? start?.timeUsedSeconds ?? null,
  }
})

const normalizedStatus = computed(() => normalizeStatus(goal.value.status))
const isRunning = computed(() => Boolean(props.isRunning))
const tone = computed(() => statusTone(normalizedStatus.value))
const iconColor = computed(() => {
  if (tone.value === "error") return "var(--up-error, #fa3534)"
  if (tone.value === "complete") return "var(--up-success, #19be6b)"
  if (tone.value === "active") return "var(--up-primary, #2979ff)"
  return "var(--up-tips-color, #909193)"
})
const statusLabel = computed(() => goalStatusLabel(normalizedStatus.value, goal.value.status))
const headerText = computed(() =>
  goal.value.objective ? `目标：${goal.value.objective}` : "目标"
)
const tokenSummary = computed(() => formatTokens(goal.value.tokensUsed))
const budgetSummary = computed(() => formatTokens(goal.value.tokenBudget))
const remainingSummary = computed(() => formatTokens(goal.value.remainingTokens))
const durationSummary = computed(() => formatDuration(goal.value.timeUsedSeconds))
const errorText = computed(() => props.end?.error || props.start.error || "")

/**
 * 与气泡共用同一份分组实现，`skipGoalRuns` 防止 goal 卡里再折出一层 goal 卡。
 *
 * 抽出去之前这里是气泡那段循环的手抄副本，加子智能体豁免时若不合并，就会出现
 * 「`/goal` 运行块里的子智能体仍被并进『调用 N 个工具』」的功能缺口。
 * goal 内层不走流式过滤（`isStreaming` 保持 false）：这些 items 都是已解析完的历史块。
 */
const nestedDisplayParts = computed<BubbleDisplayPart[]>(() =>
  buildBubbleDisplayParts({
    parts: props.items || [],
    skipGoalRuns: true,
  })
)

function subagentTranscript(toolCallId: string): string {
  return props.subagentTranscripts?.[toolCallId] || ""
}

function toggleExpanded() {
  expanded.value = !expanded.value
}

function collapseExpanded() {
  expanded.value = false
}

function normalizeStatus(status: string | null): string | null {
  if (!status) return null
  return status.toLowerCase().replace(/[\s-]+/g, "_")
}

function goalStatusLabel(normalized: string | null, raw: string | null) {
  const map: Record<string, string> = {
    active: "进行中",
    complete: "已完成",
    completed: "已完成",
    blocked: "已阻塞",
    budget_limited: "预算受限",
    usage_limited: "用量受限",
    paused: "已暂停",
  }
  return normalized ? map[normalized] || raw : raw
}

function statusTone(status: string | null): "active" | "complete" | "error" | "muted" {
  if (status === "active") return "active"
  if (status === "complete" || status === "completed") return "complete"
  if (status === "blocked" || status === "budget_limited" || status === "usage_limited") {
    return "error"
  }
  return "muted"
}

function formatTokens(count: number | null): string | null {
  if (count === null) return null
  const abs = Math.abs(count)
  if (abs >= 1000) {
    return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}K tokens`
  }
  return `${count} tokens`
}

function formatDuration(seconds: number | null): string | null {
  if (seconds === null) return null
  if (seconds < 60) return `${Math.round(seconds)}s`
  const minutes = seconds / 60
  if (minutes < 60) return `${minutes.toFixed(1).replace(/\.0$/, "")}m`
  return `${(minutes / 60).toFixed(1).replace(/\.0$/, "")}h`
}
</script>

<style scoped lang="scss">
.goal-card {
  border-radius: 999rpx;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 10%, var(--up-card-bg-color, #ffffff) 90%);
  border: 1rpx solid color-mix(in srgb, var(--up-primary, #2979ff) 24%, var(--up-border-color, #dadbde) 76%);
  overflow: hidden;
  transition: border-radius 0.16s ease;

  &--complete {
    background: color-mix(in srgb, var(--up-success, #19be6b) 10%, var(--up-card-bg-color, #ffffff) 90%);
    border-color: color-mix(in srgb, var(--up-success, #19be6b) 24%, var(--up-border-color, #dadbde) 76%);
  }

  &--error {
    background: color-mix(in srgb, var(--up-error, #fa3534) 10%, var(--up-card-bg-color, #ffffff) 90%);
    border-color: color-mix(in srgb, var(--up-error, #fa3534) 28%, var(--up-border-color, #dadbde) 72%);
  }

  &--muted {
    background: color-mix(in srgb, var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6)) 74%, var(--up-card-bg-color, #ffffff) 26%);
    border-color: var(--up-border-color, #dadbde);
  }
}

.goal-card--expanded {
  border-radius: 24rpx;
  overflow: visible;
}

.goal-card--translucent {
  background: color-mix(in srgb, var(--up-card-bg-color, #ffffff) 34%, transparent 66%);
  border-color: color-mix(in srgb, var(--up-border-color, #dadbde) 30%, transparent 70%);
  backdrop-filter: blur(8rpx);
}

.goal-card__summary {
  min-height: 54rpx;
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 12rpx 18rpx;
  box-sizing: border-box;
}

.goal-card__dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 999rpx;
  background: currentColor;
  color: v-bind(iconColor);
  flex-shrink: 0;
}

.goal-card__dot--running {
  animation: goalPulse 1s ease-in-out infinite;
}

.goal-card__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.goal-card__title {
  font-size: 24rpx;
  line-height: 1.25;
  font-weight: 700;
  color: var(--up-main-color, #303133);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.goal-card__title--running {
  animation: goalShimmer 1.25s ease-in-out infinite;
}

.goal-card__chips,
.goal-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
}

.goal-card__chip {
  font-size: 20rpx;
  line-height: 1.2;
  color: var(--up-content-color, #606266);
}

.goal-card__body {
  margin: 0 10rpx 10rpx;
  padding: 16rpx;
  border-radius: 18rpx;
  background: color-mix(in srgb, var(--up-card-bg-color, #ffffff) 82%, transparent 18%);
  border: 1rpx solid color-mix(in srgb, var(--up-border-color, #dadbde) 62%, transparent 38%);
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.goal-card__section {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.goal-card__label {
  font-size: 22rpx;
  color: var(--up-tips-color, #909193);
  font-weight: 600;
}

.goal-card__objective,
.goal-card__thinking,
.goal-card__result,
.goal-card__plan,
.goal-card__meta {
  font-size: 24rpx;
  line-height: 1.45;
  color: var(--up-content-color, #606266);
}

.goal-card__markdown {
  font-size: 24rpx;
  color: var(--up-content-color, #606266);
}

.goal-card__nested {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.goal-card__plan-step {
  display: flex;
  gap: 8rpx;
}

.goal-card__image {
  width: 100%;
  max-width: 100%;
  border-radius: 12rpx;
}

.goal-card__error {
  padding: 12rpx;
  border-radius: 12rpx;
  background: color-mix(in srgb, var(--up-error, #fa3534) 12%, var(--up-card-bg-color, #ffffff) 88%);
  font-size: 22rpx;
  line-height: 1.45;
  color: var(--up-error, #fa3534);
  white-space: pre-wrap;
  word-break: break-word;
}

.goal-card__collapse {
  min-height: 44rpx;
  padding: 0 18rpx;
  border-radius: 999rpx;
  border: 1rpx solid color-mix(in srgb, var(--up-primary, #2979ff) 24%, var(--up-border-color, #dadbde) 76%);
  background: color-mix(in srgb, var(--up-primary, #2979ff) 8%, var(--up-card-bg-color, #ffffff) 92%);
  display: flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  gap: 6rpx;
  box-sizing: border-box;

  &:active {
    opacity: 0.72;
  }
}

.goal-card__collapse-text {
  font-size: 22rpx;
  line-height: 1;
  font-weight: 600;
  color: v-bind(iconColor);
}

@keyframes goalPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(0.72); }
}

@keyframes goalShimmer {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.58; }
}
</style>
