<template>
  <view class="tool-group">
    <view
      :class="[
        'tool-group__summary',
        translucent && 'tool-group__summary--translucent',
      ]"
      @click="toggleExpanded"
    >
      <view class="tool-group__left">
        <up-icon
          :name="expanded ? 'arrow-down' : 'arrow-right'"
          size="12"
          :color="upThemeVar('--up-light-color', '#c0c4cc')"
        ></up-icon>
        <text class="tool-group__label">{{ summaryLabel }}</text>
        <text v-if="failureCount > 0" class="tool-group__failure">{{ failureCount }} 个失败</text>
      </view>
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
  translucent?: boolean
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
  align-items: flex-start;
  gap: 10rpx;
}

.tool-group__summary {
  min-height: 48rpx;
  padding: 10rpx 18rpx;
  border-radius: 999rpx;
  /* P48: match codeg-main bg-muted/60 while staying on uview --up-* tokens. */
  background: color-mix(in srgb, var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6)) 60%, var(--up-card-bg-color, #ffffff) 40%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  align-self: flex-start;
  max-width: 100%;
  gap: 12rpx;
  box-sizing: border-box;
}

.tool-group__summary--translucent {
  background: color-mix(in srgb, var(--up-card-bg-color, #ffffff) 46%, transparent 54%);
  border: 1rpx solid color-mix(in srgb, var(--up-border-color, #dadbde) 40%, transparent 60%);
}

.tool-group__left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10rpx;
  flex-wrap: wrap;
}

.tool-group__label {
  font-size: 22rpx;
  line-height: 1.2;
  color: var(--up-content-color, #606266);
}

.tool-group__failure {
  padding: 2rpx 8rpx;
  border-radius: 999rpx;
  background: color-mix(in srgb, var(--up-error, #fa3534) 12%, var(--up-card-bg-color, #ffffff) 88%);
  font-size: 22rpx;
  line-height: 1.2;
  color: var(--up-error, #fa3534);
}

.tool-group__body {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

</style>
