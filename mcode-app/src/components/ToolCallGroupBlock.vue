<template>
  <view class="tool-group">
    <view
      class="tool-group__summary"
      :class="translucent && 'tool-group__summary--translucent'"
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
    // 最后一条兜底才需要看 input 的**文本**。以前 `JSON.stringify(input).toLowerCase()`
    // 写在函数开头、无条件执行：一个 Write/Edit 的 input 可能是几十 KB 文件内容，而
    // `classifiedCounts` 在气泡里每次 props 变化都要把每个工具走一遍。
    // 挪到真正需要它的位置（前面的分支都不用），命中率极低的那条兜底才付这个钱。
    matchesFileChangeInputText(input)
  ) {
    return "file_change"
  }

  if (/fetch|search|request|http|web|browser|download/.test(name)) {
    return "network"
  }

  return "other"
}

const FILE_CHANGE_INPUT_TEXT_RE = /apply_patch|create_file|write_file|replace_in_file/

/** 兜底：input 的键名没命中，但值里带着「这是一次文件改写」的标记。 */
function matchesFileChangeInputText(input: Record<string, unknown>): boolean {
  for (const value of Object.values(input)) {
    if (typeof value !== "string") continue
    if (FILE_CHANGE_INPUT_TEXT_RE.test(value.toLowerCase())) return true
  }
  return false
}
</script>

<style scoped lang="scss">
.tool-group {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10rpx;
}

/*
 * 分组摘要。设计稿里工具调用是一行「彩点 + 小字」的裸文本，没有胶囊底。
 * 这里的可点区域保留（否则用户不知道能展开），但把底色收成透明，
 * 只在按下时给一点点反馈 —— 让整条时间线保持同一张纸面。
 */
.tool-group__summary {
  min-height: 32rpx;
  padding: 2rpx 0;
  border-radius: 8rpx;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: space-between;
  align-self: flex-start;
  max-width: 100%;
  gap: 12rpx;
  box-sizing: border-box;

  &:active {
    opacity: 0.6;
  }
}

.tool-group__summary--translucent {
  background: transparent;
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
