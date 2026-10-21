<template>
  <AskQuestionResultBlock v-if="isAskQuestion" :toolCall="toolCall" />

  <!--
    设计稿 M09「新配色」的形制：一行彩色状态点 + 一行小字，**没有容器**。
    工具调用在时间线里是「过程记录」而不是内容本身，套一个描边卡片会让它比
    AI 正文更抢眼；去掉容器后它自然退为背景信息。
    展开态仍然需要容器承载参数/结果（见 `.tool-body`）。
  -->
  <view
    v-else
    :class="[
      'tool-block',
      `tool-block--${toolCall.status || 'pending'}`,
      expanded && 'tool-block--expanded',
    ]"
  >
    <!-- 头部 -->
    <view class="tool-hd" @click="toggleExpanded">
      <view class="tool-hd__left">
        <view :class="['tool-status-dot', `tool-status-dot--${toolCall.status || 'pending'}`]"></view>
        <text class="tool-line">{{ toolSummaryText }}</text>
      </view>
      <view class="tool-hd__right">
        <up-icon
          :name="expanded ? 'arrow-up' : 'arrow-down'"
          size="12"
          :color="upThemeVar('--up-light-color', '#c0c4cc')"
        ></up-icon>
      </view>
    </view>

    <!-- 展开体 -->
    <view v-if="expanded" class="tool-body">
      <view class="tool-body__meta">
        <text class="tool-body__name">{{ toolCall.name }}</text>
        <text class="tool-body__status">{{ statusText }}</text>
      </view>

      <!-- 输入参数 -->
      <view v-if="toolCall.input" class="tool-section">
        <view class="section-label">
          <up-icon name="arrow-right-double" size="12" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
          <text>输入参数</text>
        </view>
        <scroll-view scroll-x class="code-scroll">
          <view class="code-block code-block--dark">
            <text class="code-text">{{ formatJson(toolCall.input) }}</text>
          </view>
        </scroll-view>
      </view>

      <!-- 输出结果 -->
      <view v-if="toolCall.output" class="tool-section">
        <view class="section-label">
          <up-icon name="arrow-left-double" size="12" :color="upThemeVar('--up-success', '#19be6b')"></up-icon>
          <text class="section-label__text--success">输出结果</text>
        </view>
        <view class="code-block code-block--success">
          <text class="code-text code-text--dark">{{ toolCall.output }}</text>
        </view>
      </view>

      <!-- 错误 -->
      <view v-if="toolCall.error" class="tool-section">
        <view class="section-label">
          <up-icon name="close-circle" size="12" :color="upThemeVar('--up-error', '#fa3534')"></up-icon>
          <text class="section-label__text--error">错误信息</text>
        </view>
        <view class="code-block code-block--error">
          <text class="code-text code-text--dark">{{ toolCall.error }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from "vue"
import type { ToolCall } from "@/types/acp"
import AskQuestionResultBlock from "./AskQuestionResultBlock.vue"
import { isAskQuestionToolCall } from "@/services/conversation/askQuestionResult"

const props = defineProps<{
  toolCall: ToolCall
}>()

const expanded = ref(false)

const isAskQuestion = computed(() => isAskQuestionToolCall(props.toolCall))

/**
 * 折叠态那行小字。设计稿里是「编辑 src/auth/login.ts」「运行 pnpm test login.spec.ts」
 * 这种「动词 + 目标」的短句，而不是裸工具名（`Read` / `Bash`）——
 * 用户关心的是「它对我的项目做了什么」，不是适配器内部的方法名。
 */
const toolSummaryText = computed(() => {
  const name = String(props.toolCall.name || "").trim()
  const input = (props.toolCall.input || {}) as Record<string, unknown>
  const lower = name.toLowerCase()

  /** 从 input 里挑第一个像路径/命令的字符串 */
  const pickTarget = (keys: string[]): string => {
    for (const key of keys) {
      const value = input[key]
      if (typeof value === "string" && value.trim()) return value.trim()
    }
    return ""
  }

  // 文件类：编辑 / 读取 / 写入
  if (/edit|write|rewrite|replace|patch|create_file|apply_patch/.test(lower)) {
    const target = pickTarget(["file_path", "path", "target_file", "filename"])
    return target ? `编辑 ${target}` : "编辑文件"
  }
  if (/read|view|cat|open_file/.test(lower)) {
    const target = pickTarget(["file_path", "path", "target_file", "filename"])
    return target ? `读取 ${target}` : "读取文件"
  }
  // 命令类
  if (/shell|command|terminal|bash|exec|run|cmd/.test(lower)) {
    const command = pickTarget(["command", "cmd", "script"])
    if (command) {
      const firstLine = command.split("\n")[0].trim()
      return `运行 ${firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine}`
    }
    return "运行命令"
  }
  // 网络类
  if (/fetch|search|request|http|web|browser|download/.test(lower)) {
    const target = pickTarget(["query", "url", "q"])
    return target ? `搜索 ${target}` : "网络请求"
  }
  // 兜底：保留原始工具名，至少让用户知道发生了什么
  return name || "工具调用"
})

const statusText = computed(() => {
  const map: Record<string, string> = {
    running: "运行中",
    completed: "已完成",
    error: "失败",
  }
  return map[props.toolCall.status || ""] || "待执行"
})

function toggleExpanded() {
  expanded.value = !expanded.value
}

function formatJson(obj: any): string {
  try {
    return JSON.stringify(obj, null, 2)
  } catch {
    return String(obj)
  }
}
</script>

<style scoped lang="scss">
.tool-block {
  /* 折叠态：无容器，只有一行文字（设计稿形制） */
  display: flex;
  flex-direction: column;
  gap: 8rpx;

  /* 展开态才需要容器承载代码块 */
  &--expanded {
    padding: 8rpx 10rpx 12rpx;
    border-radius: 12rpx;
    background-color: color-mix(in srgb, var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6)) 55%, transparent 45%);
  }
}

/* ===== 头部 ===== */
.tool-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8rpx;
  transition: opacity 0.15s;

  &:active { opacity: 0.6; }
}

.tool-hd__left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.tool-hd__right {
  display: flex;
  align-items: center;
  gap: 12rpx;
  flex-shrink: 0;
}

/*
 * 状态点：设计稿是 8×8 圆角 4 的实心块（不是描边圆）。
 * 颜色按语义分：运行中绿、待执行橙、完成灰、失败红 —— 与设计稿一致，
 * 完成态刻意用中性灰而不是绿色，避免时间线里一路绿灯抢注意力。
 */
.tool-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 4px;
  flex-shrink: 0;

  &--running   { background-color: #34c759; animation: pulse 1.4s ease-in-out infinite; }
  &--completed { background-color: var(--up-tips-color, #909193); }
  &--error     { background-color: var(--up-error, #fa3534); }
  &--pending   { background-color: var(--up-warning, #f9ae3d); }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}

/* 折叠态正文：12px 中性字，等宽不留白 —— 行内混排路径时更好读 */
.tool-line {
  font-size: 24rpx;
  line-height: 1.35;
  color: var(--up-content-color, #606266);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

/* ===== 展开体 ===== */
.tool-body {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  padding-top: 4rpx;
}

.tool-body__meta {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.tool-body__name {
  font-size: 22rpx;
  font-family: "Courier New", monospace;
  font-weight: 600;
  color: var(--up-main-color, #303133);
}

.tool-body__status {
  font-size: 22rpx;
  color: var(--up-tips-color, #909193);
}

.tool-section {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.section-label {
  display: flex;
  align-items: center;
  gap: 6rpx;
  font-size: 22rpx;
  color: var(--up-tips-color, #909193);
  font-weight: 500;

  &__text--success { color: var(--up-success, #19be6b); }
  &__text--error   { color: var(--up-error, #fa3534); }
}

/* ===== 代码块 ===== */
.code-scroll {
  border-radius: 10rpx;
  overflow: hidden;
}

.code-block {
  padding: 16rpx 20rpx;
  border-radius: 10rpx;

  &--dark    { background-color: #101318; }
  &--success { background-color: color-mix(in srgb, var(--up-success, #19be6b) 12%, var(--up-card-bg-color, #ffffff) 88%); border-left: 4rpx solid var(--up-success, #19be6b); }
  &--error   { background-color: color-mix(in srgb, var(--up-error, #fa3534) 12%, var(--up-card-bg-color, #ffffff) 88%); border-left: 4rpx solid var(--up-error, #fa3534); }
}

.code-text {
  font-size: 22rpx;
  font-family: "Courier New", monospace;
  line-height: 1;
  white-space: pre;
  color: #d7dde8;

  &--dark { color: var(--up-main-color, #303133); white-space: pre-wrap; word-break: break-all; }
}
</style>
