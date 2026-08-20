<template>
  <view :class="['subagent', `subagent--${view.state}`, expanded && 'subagent--expanded']">
    <!--
      折叠头。没有 body 时退化成一枚**纯胶囊**（无边框无箭头、点击无响应）——
      子智能体刚发起、`agent_stats` 还没回来时就是这种形态，给它挂个点不开的箭头
      比不挂更糟。
    -->
    <view
      :class="[
        'subagent__summary',
        translucent && 'subagent__summary--translucent',
        view.hasBody && 'subagent__summary--tappable',
      ]"
      @click="toggleExpanded"
    >
      <!--
        进行中转圈。必须是 `<view>` 兄弟节点而不是塞进 `<text>` 里 ——
        App-Plus 下 `<text>` 只渲染文本子节点，组件会被整个吞掉。
      -->
      <up-loading-icon
        v-if="view.isRunning"
        class="subagent__spinner"
        mode="circle"
        size="14"
        :color="upThemeVar('--up-primary', '#2979ff')"
      ></up-loading-icon>
      <up-icon
        v-else-if="view.state === 'completed'"
        name="checkmark-circle"
        size="14"
        :color="upThemeVar('--up-success', '#19be6b')"
      ></up-icon>
      <!-- 失败态不给图标：红字本身已经足够醒目，再加图标会和右侧箭头挤成一排色块。 -->
      <view v-else-if="view.state === 'pending'" class="subagent__dot"></view>

      <text :class="['subagent__title', view.isError && 'subagent__title--error']">
        {{ view.title }}
      </text>

      <text v-if="statusLabel" class="subagent__status">{{ statusLabel }}</text>
      <text v-if="view.durationText" class="subagent__duration">{{ view.durationText }}</text>

      <up-icon
        v-if="view.hasBody"
        :name="expanded ? 'arrow-up' : 'arrow-down'"
        size="12"
        :color="upThemeVar('--up-light-color', '#c0c4cc')"
      ></up-icon>
    </view>

    <view v-if="expanded && view.hasBody" class="subagent__body">
      <view v-if="view.launch.prompt" class="subagent__section">
        <text class="subagent__label">任务</text>
        <text class="subagent__prompt">{{ view.launch.prompt }}</text>
      </view>

      <!--
        内层工具只渲染成扁平文本行，**绝不**递归 `ToolCallBlock` / 本组件自身：
        子智能体里可以再起子智能体，递归组件在长会话里会炸出成百上千个节点，
        而这个胶囊存在的全部理由就是把长度压回去。
      -->
      <view v-if="view.stats && view.stats.toolCalls.length > 0" class="subagent__section">
        <text class="subagent__label">过程（{{ view.stats.toolCalls.length }}）</text>
        <view
          v-for="(item, index) in view.stats.toolCalls"
          :key="index"
          class="subagent__tool"
        >
          <text :class="['subagent__tool-name', item.isError && 'subagent__tool-name--error']">
            {{ item.toolName }}
          </text>
          <text v-if="item.inputPreview" class="subagent__tool-preview">{{ item.inputPreview }}</text>
        </view>
        <text v-if="truncatedHint" class="subagent__truncated">{{ truncatedHint }}</text>
      </view>

      <view v-if="view.transcriptTail" class="subagent__section">
        <text class="subagent__label">实时输出</text>
        <text class="subagent__transcript">{{ view.transcriptTail }}</text>
      </view>

      <view v-if="outputText" class="subagent__section">
        <text class="subagent__label">结果</text>
        <text class="subagent__transcript">{{ outputText }}</text>
      </view>

      <view v-if="errorText" class="subagent__error">
        <text>{{ errorText }}</text>
      </view>

      <view v-if="metaLine" class="subagent__meta">
        <text>{{ metaLine }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
import type { ToolCall } from "@/types/acp"
import { buildSubagentCapsuleView } from "@/services/conversation/subagentToolCall"

const props = withDefaults(
  defineProps<{
    toolCall: ToolCall
    /** `conversationRuntime.getSubagentTranscripts()` 里属于本次调用的实时正文。 */
    transcript?: string | null
    translucent?: boolean
  }>(),
  {
    transcript: "",
    translucent: false,
  }
)

const view = computed(() =>
  buildSubagentCapsuleView({
    toolCall: props.toolCall,
    transcript: props.transcript,
  })
)

/**
 * 默认折叠 —— 这是本组件存在的理由。
 *
 * 只有一条自动规则：**失败自动展开**，因为失败信息不看就等于没报错。它由
 * `userToggled` 守住：用户手动收起过之后，后续状态变化不再抢夺控制权。
 *
 * 参考实现里还有一条「running → completed 自动收起」，这里**故意不抄**：手机端
 * 用户很可能正展开读实时输出，子智能体一完成就把面板从拇指底下抽走。
 */
const expanded = ref(view.value.isError)
const userToggled = ref(false)

watch(
  () => view.value.isError,
  (isError) => {
    if (isError && !userToggled.value) expanded.value = true
  }
)

const statusLabel = computed(() => {
  const map: Record<string, string> = {
    pending: "待执行",
    running: "进行中",
    error: "失败",
  }
  // completed 不给标签：已完成是常态，右侧还有耗时，再加一枚「已完成」纯噪声。
  return map[view.value.state] || ""
})

const truncatedHint = computed(() => {
  const truncated = view.value.stats?.toolCallsTruncated
  if (!truncated || truncated <= 0) return ""
  return `另有 ${truncated} 个工具调用未展示`
})

const outputText = computed(() => {
  const output = String(props.toolCall.output || "").trim()
  if (!output) return ""
  // 失败时 output 与 error 往往是同一段文本（归一化时 `error: isError ? output`），
  // 只渲染一次。
  if (view.value.isError && output === String(props.toolCall.error || "").trim()) return ""
  return output
})

const errorText = computed(() => String(props.toolCall.error || "").trim())

const metaLine = computed(() => {
  const stats = view.value.stats
  if (!stats) return ""
  const chunks: string[] = []
  if (stats.agentType) chunks.push(stats.agentType)
  if (typeof stats.totalToolUseCount === "number") chunks.push(`${stats.totalToolUseCount} 次工具调用`)
  if (typeof stats.totalTokens === "number") chunks.push(`${formatTokens(stats.totalTokens)} tokens`)
  // 子智能体自报的状态与 `ToolCall.status` 可能不一致，作为明细放在这里，不上胶囊。
  if (stats.status) chunks.push(stats.status)
  return chunks.join(" · ")
})

function toggleExpanded() {
  if (!view.value.hasBody) return
  userToggled.value = true
  expanded.value = !expanded.value
}

function formatTokens(count: number): string {
  const abs = Math.abs(count)
  if (abs >= 1000) return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}K`
  return String(count)
}
</script>

<style scoped lang="scss">
.subagent {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10rpx;
  width: 100%;
}

.subagent__summary {
  min-height: 48rpx;
  padding: 10rpx 18rpx;
  border-radius: 999rpx;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 9%, var(--up-card-bg-color, #ffffff) 91%);
  display: flex;
  align-items: center;
  align-self: flex-start;
  max-width: 100%;
  gap: 10rpx;
  box-sizing: border-box;
}

.subagent--completed .subagent__summary {
  background: color-mix(in srgb, var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6)) 60%, var(--up-card-bg-color, #ffffff) 40%);
}

.subagent--error .subagent__summary {
  background: color-mix(in srgb, var(--up-error, #fa3534) 10%, var(--up-card-bg-color, #ffffff) 90%);
}

.subagent__summary--translucent {
  background: color-mix(in srgb, var(--up-card-bg-color, #ffffff) 36%, transparent 64%);
}

.subagent__summary--tappable:active {
  opacity: 0.72;
}

.subagent__spinner {
  flex-shrink: 0;
}

.subagent__dot {
  width: 10rpx;
  height: 10rpx;
  border-radius: 999rpx;
  background: var(--up-border-color, #dadbde);
  flex-shrink: 0;
}

.subagent__title {
  font-size: 22rpx;
  line-height: 1.2;
  font-weight: 600;
  color: var(--up-content-color, #606266);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex-shrink: 1;
}

.subagent__title--error {
  color: var(--up-error, #fa3534);
}

.subagent__status,
.subagent__duration {
  font-size: 20rpx;
  line-height: 1.2;
  color: var(--up-tips-color, #909193);
  flex-shrink: 0;
}

.subagent__body {
  width: 100%;
  padding: 16rpx;
  border-radius: 18rpx;
  background: color-mix(in srgb, var(--up-card-bg-color, #ffffff) 82%, transparent 18%);
  border: 1rpx solid color-mix(in srgb, var(--up-border-color, #dadbde) 62%, transparent 38%);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.subagent__section {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.subagent__label {
  font-size: 22rpx;
  line-height: 1.2;
  font-weight: 600;
  color: var(--up-tips-color, #909193);
}

.subagent__prompt,
.subagent__transcript {
  font-size: 24rpx;
  line-height: 1.45;
  color: var(--up-content-color, #606266);
  white-space: pre-wrap;
  word-break: break-word;
}

.subagent__tool {
  display: flex;
  align-items: baseline;
  gap: 8rpx;
}

.subagent__tool-name {
  font-size: 22rpx;
  line-height: 1.35;
  font-family: "Courier New", monospace;
  color: var(--up-main-color, #303133);
  flex-shrink: 0;
}

.subagent__tool-name--error {
  color: var(--up-error, #fa3534);
}

.subagent__tool-preview {
  font-size: 22rpx;
  line-height: 1.35;
  color: var(--up-tips-color, #909193);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.subagent__truncated,
.subagent__meta {
  font-size: 20rpx;
  line-height: 1.35;
  color: var(--up-tips-color, #909193);
}

.subagent__error {
  padding: 12rpx;
  border-radius: 12rpx;
  background: color-mix(in srgb, var(--up-error, #fa3534) 12%, var(--up-card-bg-color, #ffffff) 88%);
  font-size: 22rpx;
  line-height: 1.45;
  color: var(--up-error, #fa3534);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
