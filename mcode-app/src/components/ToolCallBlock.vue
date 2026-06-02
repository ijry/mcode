<template>
  <view class="tool-block">
    <!-- 头部 -->
    <view class="tool-hd" @click="toggleExpanded">
      <view class="tool-hd__left">
        <view :class="['tool-status-dot', `tool-status-dot--${toolCall.status || 'pending'}`]"></view>
        <up-icon name="setting-fill" size="15" :color="iconColor"></up-icon>
        <text class="tool-name">{{ toolCall.name }}</text>
      </view>
      <view class="tool-hd__right">
        <up-tag
          :text="statusText"
          :type="tagType"
          size="mini"
          plain
        ></up-tag>
        <up-icon
          :name="expanded ? 'arrow-up' : 'arrow-down'"
          size="13"
          color="#c0c4cc"
        ></up-icon>
      </view>
    </view>

    <!-- 展开体 -->
    <view v-if="expanded" class="tool-body">
      <!-- 输入参数 -->
      <view v-if="toolCall.input" class="tool-section">
        <view class="section-label">
          <up-icon name="arrow-right-double" size="12" color="#909399"></up-icon>
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
          <up-icon name="arrow-left-double" size="12" color="#19be6b"></up-icon>
          <text class="section-label__text--success">输出结果</text>
        </view>
        <view class="code-block code-block--success">
          <text class="code-text code-text--dark">{{ toolCall.output }}</text>
        </view>
      </view>

      <!-- 错误 -->
      <view v-if="toolCall.error" class="tool-section">
        <view class="section-label">
          <up-icon name="close-circle" size="12" color="#fa3534"></up-icon>
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

const props = defineProps<{
  toolCall: ToolCall
}>()

const expanded = ref(false)

const iconColor = computed(() => {
  const map: Record<string, string> = {
    running: "#2979ff",
    completed: "#19be6b",
    error: "#fa3534",
  }
  return map[props.toolCall.status || ""] || "#909399"
})

const statusText = computed(() => {
  const map: Record<string, string> = {
    running: "运行中",
    completed: "已完成",
    error: "失败",
  }
  return map[props.toolCall.status || ""] || "待执行"
})

const tagType = computed(() => {
  const map: Record<string, string> = {
    running: "primary",
    completed: "success",
    error: "error",
  }
  return map[props.toolCall.status || ""] || "info"
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
  border-radius: 12rpx;
  overflow: hidden;
  background-color: #f8f9fa;
  border: 1rpx solid #e8e8e8;
}

/* ===== 头部 ===== */
.tool-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1px 4px;
  transition: background-color 0.15s;

  &:active { background-color: #f0f0f0; }
}

.tool-hd__left {
  display: flex;
  align-items: center;
  gap: 10rpx;
  flex: 1;
  min-width: 0;
}

.tool-hd__right {
  display: flex;
  align-items: center;
  gap: 12rpx;
  flex-shrink: 0;
}

.tool-hd__right :deep(.u-tag) {
  line-height: 16px !important;
  min-height: 16px !important;
}

.tool-status-dot {
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
  flex-shrink: 0;

  &--running  { background-color: #2979ff; animation: pulse 1s infinite; }
  &--completed { background-color: #19be6b; }
  &--error    { background-color: #fa3534; }
  &--pending  { background-color: #c0c4cc; }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}

.tool-name {
  font-size: 24rpx;
  font-family: "Courier New", monospace;
  color: #303133;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ===== 展开体 ===== */
.tool-body {
  padding: 0 20rpx 20rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
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
  color: #909399;
  font-weight: 500;

  &__text--success { color: #19be6b; }
  &__text--error   { color: #fa3534; }
}

/* ===== 代码块 ===== */
.code-scroll {
  border-radius: 10rpx;
  overflow: hidden;
}

.code-block {
  padding: 16rpx 20rpx;
  border-radius: 10rpx;

  &--dark    { background-color: #1e2029; }
  &--success { background-color: #f0fff4; border-left: 4rpx solid #19be6b; }
  &--error   { background-color: #fff1f0; border-left: 4rpx solid #fa3534; }
}

.code-text {
  font-size: 22rpx;
  font-family: "Courier New", monospace;
  line-height: 1;
  white-space: pre;
  color: #abb2bf;

  &--dark { color: #303133; white-space: pre-wrap; word-break: break-all; }
}
</style>
