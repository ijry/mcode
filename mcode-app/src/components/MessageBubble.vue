<template>
  <view :class="['message-bubble', `message-${message.role}`]">
    <!-- 头像 -->
    <view class="message-avatar">
      <u-avatar :size="40" :text="message.role === 'user' ? '我' : 'AI'"></u-avatar>
    </view>

    <!-- 内容 -->
    <view class="message-content">
      <!-- 渲染每个内容部分 -->
      <view v-for="(part, index) in message.content" :key="index" class="content-part">
        <!-- 文本内容 -->
        <view v-if="part.type === 'text'" class="text-content">
          <MarkdownRenderer :content="part.text || ''" />
        </view>

        <!-- 思考内容 -->
        <view v-else-if="part.type === 'thinking'" class="thinking-content">
          <view class="thinking-header">
            <u-icon name="bulb" size="16" color="#ff9900"></u-icon>
            <text class="thinking-label">思考中...</text>
          </view>
          <view class="thinking-text">{{ part.thinking }}</view>
        </view>

        <!-- 工具调用 -->
        <view v-else-if="part.type === 'tool_call'" class="tool-call-content">
          <ToolCallBlock :toolCall="part.tool_call!" />
        </view>

        <!-- 图片 -->
        <view v-else-if="part.type === 'image'" class="image-content">
          <image
            :src="part.image?.url"
            mode="widthFix"
            class="message-image"
            @click="previewImage(part.image?.url)"
          />
        </view>

        <!-- 计划 -->
        <view v-else-if="part.type === 'plan'" class="plan-content">
          <view class="plan-header">
            <u-icon name="list" size="16" color="#2979ff"></u-icon>
            <text class="plan-label">执行计划</text>
          </view>
          <view v-for="(step, idx) in part.plan?.steps" :key="idx" class="plan-step">
            <u-icon
              :name="step.completed ? 'checkbox-mark' : 'checkbox'"
              size="14"
              :color="step.completed ? '#19be6b' : '#909399'"
            ></u-icon>
            <text class="step-text">{{ step.description }}</text>
          </view>
        </view>
      </view>

      <!-- 状态指示器 -->
      <view v-if="message.status === 'streaming'" class="streaming-indicator">
        <view class="dot"></view>
        <view class="dot"></view>
        <view class="dot"></view>
      </view>

      <!-- 错误信息 -->
      <view v-if="message.error" class="error-message">
        <u-icon name="error-circle" size="16" color="#fa3534"></u-icon>
        <text class="error-text">{{ message.error }}</text>
      </view>

      <!-- 操作按钮 -->
      <view class="message-actions">
        <u-button size="mini" type="default" plain @click="copyMessage">
          <u-icon name="copy" size="12"></u-icon>
        </u-button>
        <u-button
          v-if="message.role === 'assistant' && showRegenerate"
          size="mini"
          type="default"
          plain
          @click="$emit('regenerate')"
        >
          <u-icon name="reload" size="12"></u-icon>
        </u-button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue"
import type { MessageTurn } from "@/types/acp"
import MarkdownRenderer from "./MarkdownRenderer.vue"
import ToolCallBlock from "./ToolCallBlock.vue"

const props = defineProps<{
  message: MessageTurn
  showRegenerate?: boolean
}>()

const emit = defineEmits<{
  regenerate: []
}>()

function copyMessage() {
  const textContent = props.message.content
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("\n")

  uni.setClipboardData({
    data: textContent,
    success: () => {
      uni.showToast({ title: "已复制", icon: "success" })
    },
  })
}

function previewImage(url?: string) {
  if (!url) return
  uni.previewImage({
    urls: [url],
    current: url,
  })
}
</script>

<style scoped lang="scss">
.message-bubble {
  display: flex;
  gap: 20rpx;
  margin-bottom: 30rpx;
  animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20rpx);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message-user {
  flex-direction: row-reverse;
}

.message-avatar {
  flex-shrink: 0;
}

.message-content {
  flex: 1;
  max-width: 70%;
  padding: 20rpx 24rpx;
  border-radius: 16rpx;
  word-wrap: break-word;
  position: relative;
}

.message-user .message-content {
  background-color: #2979ff;
  color: #ffffff;
}

.message-assistant .message-content {
  background-color: #ffffff;
  color: #303133;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.05);
}

.content-part {
  margin-bottom: 20rpx;

  &:last-child {
    margin-bottom: 0;
  }
}

.text-content {
  font-size: 28rpx;
  line-height: 1.6;
}

.thinking-content {
  padding: 20rpx;
  background-color: #fff7e6;
  border-radius: 12rpx;
  border-left: 6rpx solid #ff9900;
}

.thinking-header {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 16rpx;
}

.thinking-label {
  font-size: 26rpx;
  font-weight: 600;
  color: #ff9900;
}

.thinking-text {
  font-size: 24rpx;
  color: #606266;
  line-height: 1.5;
}

.tool-call-content {
  margin: 16rpx 0;
}

.image-content {
  margin: 16rpx 0;
}

.message-image {
  width: 100%;
  border-radius: 12rpx;
}

.plan-content {
  padding: 20rpx;
  background-color: #f0f9ff;
  border-radius: 12rpx;
  border-left: 6rpx solid #2979ff;
}

.plan-header {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 16rpx;
}

.plan-label {
  font-size: 26rpx;
  font-weight: 600;
  color: #2979ff;
}

.plan-step {
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
  margin-bottom: 12rpx;
  font-size: 24rpx;
  color: #606266;

  &:last-child {
    margin-bottom: 0;
  }
}

.step-text {
  flex: 1;
  line-height: 1.5;
}

.streaming-indicator {
  display: flex;
  gap: 8rpx;
  margin-top: 16rpx;
}

.dot {
  width: 12rpx;
  height: 12rpx;
  background-color: #909399;
  border-radius: 50%;
  animation: pulse 1.4s infinite ease-in-out;

  &:nth-child(1) {
    animation-delay: -0.32s;
  }

  &:nth-child(2) {
    animation-delay: -0.16s;
  }
}

@keyframes pulse {
  0%,
  80%,
  100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  40% {
    opacity: 1;
    transform: scale(1);
  }
}

.error-message {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-top: 16rpx;
  padding: 16rpx;
  background-color: #fef0f0;
  border-radius: 8rpx;
}

.error-text {
  font-size: 24rpx;
  color: #fa3534;
}

.message-actions {
  display: flex;
  gap: 16rpx;
  margin-top: 16rpx;
  opacity: 0;
  transition: opacity 0.2s;
}

.message-bubble:hover .message-actions {
  opacity: 1;
}
</style>
