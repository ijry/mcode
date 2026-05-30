<template>
  <view class="tool-call-block">
    <view class="tool-header" @click="toggleExpanded">
      <view class="tool-info">
        <u-icon name="tool" size="16" :color="statusColor"></u-icon>
        <text class="tool-name">{{ toolCall.name }}</text>
        <u-tag
          :text="statusText"
          :type="statusType"
          size="mini"
          plain
        ></u-tag>
      </view>
      <u-icon
        :name="expanded ? 'arrow-up' : 'arrow-down'"
        size="14"
        color="#909399"
      ></u-icon>
    </view>

    <view v-if="expanded" class="tool-body">
      <!-- 输入参数 -->
      <view v-if="toolCall.input" class="tool-section">
        <text class="section-label">输入参数:</text>
        <view class="json-content">
          <text class="json-text">{{ formatJson(toolCall.input) }}</text>
        </view>
      </view>

      <!-- 输出结果 -->
      <view v-if="toolCall.output" class="tool-section">
        <text class="section-label">输出结果:</text>
        <view class="output-content">
          <text class="output-text">{{ toolCall.output }}</text>
        </view>
      </view>

      <!-- 错误信息 -->
      <view v-if="toolCall.error" class="tool-section">
        <text class="section-label error-label">错误信息:</text>
        <view class="error-content">
          <text class="error-text">{{ toolCall.error }}</text>
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

const statusColor = computed(() => {
  switch (props.toolCall.status) {
    case "running":
      return "#2979ff"
    case "completed":
      return "#19be6b"
    case "error":
      return "#fa3534"
    default:
      return "#909399"
  }
})

const statusText = computed(() => {
  switch (props.toolCall.status) {
    case "running":
      return "运行中"
    case "completed":
      return "已完成"
    case "error":
      return "失败"
    default:
      return "待执行"
  }
})

const statusType = computed(() => {
  switch (props.toolCall.status) {
    case "running":
      return "primary"
    case "completed":
      return "success"
    case "error":
      return "error"
    default:
      return "info"
  }
})

function toggleExpanded() {
  expanded.value = !expanded.value
}

function formatJson(obj: any): string {
  try {
    return JSON.stringify(obj, null, 2)
  } catch (error) {
    return String(obj)
  }
}
</script>

<style scoped lang="scss">
.tool-call-block {
  margin: 16rpx 0;
  border: 1rpx solid #dcdfe6;
  border-radius: 12rpx;
  overflow: hidden;
  background-color: #fafafa;
}

.tool-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx 24rpx;
  cursor: pointer;
  transition: background-color 0.2s;

  &:active {
    background-color: #f5f7fa;
  }
}

.tool-info {
  display: flex;
  align-items: center;
  gap: 12rpx;
  flex: 1;
}

.tool-name {
  font-size: 26rpx;
  font-weight: 600;
  color: #303133;
  font-family: "Courier New", Courier, monospace;
}

.tool-body {
  padding: 0 24rpx 20rpx;
}

.tool-section {
  margin-bottom: 20rpx;

  &:last-child {
    margin-bottom: 0;
  }
}

.section-label {
  display: block;
  font-size: 24rpx;
  font-weight: 600;
  color: #606266;
  margin-bottom: 12rpx;
}

.error-label {
  color: #fa3534;
}

.json-content {
  padding: 20rpx;
  background-color: #282c34;
  border-radius: 8rpx;
  overflow-x: auto;
}

.json-text {
  font-size: 22rpx;
  font-family: "Courier New", Courier, monospace;
  color: #abb2bf;
  line-height: 1.5;
  white-space: pre;
}

.output-content {
  padding: 20rpx;
  background-color: #f0f9ff;
  border-radius: 8rpx;
  border-left: 6rpx solid #2979ff;
}

.output-text {
  font-size: 24rpx;
  color: #303133;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.error-content {
  padding: 20rpx;
  background-color: #fef0f0;
  border-radius: 8rpx;
  border-left: 6rpx solid #fa3534;
}

.error-text {
  font-size: 24rpx;
  color: #fa3534;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>
