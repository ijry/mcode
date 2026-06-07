<template>
  <view class="tool-group">
    <view class="tool-group__summary" @click="toggleExpanded">
      <view class="tool-group__left">
        <view :class="['tool-group__dot', `tool-group__dot--${groupStatus}`]"></view>
        <text class="tool-group__label">{{ summaryLabel }}</text>
        <text v-if="failureCount > 0" class="tool-group__failure">· {{ failureCount }} 个失败</text>
      </view>
      <up-icon
        :name="expanded ? 'arrow-up' : 'arrow-down'"
        size="12"
        :color="upThemeVar('--up-light-color', '#c0c4cc')"
      ></up-icon>
    </view>

    <view v-if="expanded" class="tool-group__body">
      <ToolCallBlock v-for="toolCall in toolCalls" :key="toolCall.id" :toolCall="toolCall" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import type { ToolCall } from "@/types/acp"
import ToolCallBlock from "./ToolCallBlock.vue"

const props = defineProps<{
  toolCalls: ToolCall[]
}>()

const expanded = ref(false)

const classifiedCounts = computed(() => {
  let command = 0
  let fileChange = 0
  let network = 0
  let other = 0

  for (const toolCall of props.toolCalls) {
    const kind = classifyToolCall(toolCall)
    if (kind === "command") command += 1
    else if (kind === "file_change") fileChange += 1
    else if (kind === "network") network += 1
    else other += 1
  }

  return { command, fileChange, network, other }
})

const failureCount = computed(() =>
  props.toolCalls.filter((toolCall) => toolCall.status === "error").length
)

const groupStatus = computed(() => {
  if (props.toolCalls.some((toolCall) => toolCall.status === "running")) return "running"
  if (failureCount.value > 0) return "error"
  if (props.toolCalls.every((toolCall) => toolCall.status === "completed")) return "completed"
  return "pending"
})

const summaryLabel = computed(() => {
  const { command, fileChange, network, other } = classifiedCounts.value
  const chunks: string[] = []

  if (command > 0) chunks.push(`运行 ${command} 个命令`)
  if (fileChange > 0) chunks.push(`编辑 ${fileChange} 次文件`)
  if (network > 0) chunks.push(`请求 ${network} 次网络`)

  const covered = command + fileChange + network
  if (other > 0 || covered === 0) {
    chunks.push(`调用 ${props.toolCalls.length} 个工具`)
  }

  return chunks.join(" · ")
})

function toggleExpanded() {
  expanded.value = !expanded.value
}

function classifyToolCall(toolCall: ToolCall): "command" | "file_change" | "network" | "other" {
  const name = String(toolCall.name || "").trim().toLowerCase()
  const input = toolCall.input || {}
  const inputText = JSON.stringify(input).toLowerCase()

  if (
    /shell|command|terminal|bash|powershell|cmd|exec|run/.test(name) ||
    "command" in input ||
    "cmd" in input ||
    "script" in input
  ) {
    return "command"
  }

  if (
    /edit|write|rewrite|replace|patch|file/.test(name) ||
    "path" in input ||
    "file_path" in input ||
    "target_file" in input ||
    "old_string" in input ||
    "new_string" in input ||
    "content" in input ||
    /apply_patch|create_file|write_file|replace_in_file/.test(inputText)
  ) {
    return "file_change"
  }

  if (/fetch|search|request|http|web|browser|download/.test(name)) {
    return "network"
  }

  return "other"
}
</script>

<style scoped lang="scss">
.tool-group {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.tool-group__summary {
  min-height: 48rpx;
  padding: 10rpx 18rpx;
  border-radius: 999rpx;
  background: color-mix(in srgb, var(--mcode-card-soft-bg) 88%, var(--mcode-card-bg) 12%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  box-sizing: border-box;
}

.tool-group__left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10rpx;
  flex-wrap: wrap;
}

.tool-group__dot {
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
  flex-shrink: 0;

  &--running { background: #2979ff; animation: tool-group-pulse 1s infinite; }
  &--completed { background: #8f9bb3; }
  &--error { background: #fa3534; }
  &--pending { background: var(--mcode-border-color); }
}

.tool-group__label {
  font-size: 22rpx;
  line-height: 1.2;
  color: var(--mcode-text-secondary);
}

.tool-group__failure {
  font-size: 22rpx;
  line-height: 1.2;
  color: #fa3534;
}

.tool-group__body {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

@keyframes tool-group-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}
</style>
