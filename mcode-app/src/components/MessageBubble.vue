<template>
  <view :class="['bubble-wrap', `bubble-wrap--${message.role}`]">
    <!-- 头像 -->
    <view class="bubble-avatar">
      <up-avatar
        :size="36"
        :text="message.role === 'user' ? '我' : 'AI'"
        :bgColor="message.role === 'user' ? '#2979ff' : '#f0f0f0'"
        :color="message.role === 'user' ? '#fff' : '#606266'"
        fontSize="24"
      ></up-avatar>
    </view>

    <!-- 气泡内容 -->
    <view class="bubble-body">
      <view :class="['bubble', `bubble--${message.role}`]">
        <!-- 内容渲染 -->
        <view v-for="(part, index) in message.content" :key="index" class="part-wrap">
          <!-- 文本 -->
          <view v-if="part.type === 'text'" class="part-text">
            <up-markdown :content="part.text || ''"></up-markdown>
          </view>

          <!-- 思考 -->
          <view v-else-if="part.type === 'thinking'" class="part-thinking">
            <view class="thinking-hd">
              <up-icon name="bulb" size="15" color="#f0a020"></up-icon>
              <text class="thinking-hd__label">深度思考</text>
            </view>
            <text class="thinking-hd__text">{{ part.thinking }}</text>
          </view>

          <!-- 工具调用 -->
          <view v-else-if="part.type === 'tool_call'" class="part-tool">
            <ToolCallBlock :toolCall="part.tool_call!" />
          </view>

          <!-- 图片 -->
          <view v-else-if="part.type === 'image'" class="part-image">
            <image
              :src="part.image?.url"
              mode="widthFix"
              class="msg-image"
              @click="previewImage(part.image?.url)"
            />
          </view>

          <!-- 计划 -->
          <view v-else-if="part.type === 'plan'" class="part-plan">
            <view class="plan-hd">
              <up-icon name="list" size="15" color="#2979ff"></up-icon>
              <text class="plan-hd__label">执行计划</text>
            </view>
            <view v-for="(step, idx) in part.plan?.steps" :key="idx" class="plan-step">
              <up-icon
                :name="step.completed ? 'checkmark-circle-fill' : 'circle'"
                size="15"
                :color="step.completed ? '#19be6b' : '#c0c4cc'"
              ></up-icon>
              <text :class="['plan-step__text', step.completed && 'plan-step__text--done']">
                {{ step.description }}
              </text>
            </view>
          </view>
        </view>

        <!-- 流式指示器 -->
        <view v-if="message.status === 'streaming'" class="typing-dots">
          <view class="dot"></view>
          <view class="dot"></view>
          <view class="dot"></view>
        </view>

        <!-- 错误 -->
        <view v-if="message.error" class="bubble-error">
          <up-icon name="close-circle" size="15" color="#fa3534"></up-icon>
          <text class="bubble-error__text">{{ message.error }}</text>
        </view>
      </view>

      <!-- 操作栏 -->
      <view :class="['bubble-actions', `bubble-actions--${message.role}`]">
        <view class="action-btn" @click="copyMessage">
          <up-icon name="copy" size="14" color="#c0c4cc"></up-icon>
        </view>
        <view
          v-if="message.role === 'assistant' && showRegenerate"
          class="action-btn"
          @click="$emit('regenerate')"
        >
          <up-icon name="reload" size="14" color="#c0c4cc"></up-icon>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { MessageTurn } from "@/types/acp"
import ToolCallBlock from "./ToolCallBlock.vue"

const props = defineProps<{
  message: MessageTurn
  showRegenerate?: boolean
}>()

const emit = defineEmits<{
  regenerate: []
}>()

function copyMessage() {
  const text = props.message.content
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("\n")

  uni.setClipboardData({
    data: text,
    success: () => uni.showToast({ title: "已复制", icon: "success" }),
  })
}

function previewImage(url?: string) {
  if (!url) return
  uni.previewImage({ urls: [url], current: url })
}
</script>

<style scoped lang="scss">
/* ===== 行容器 ===== */
.bubble-wrap {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
  animation: fadeUp 0.25s ease;

  &--user {
    flex-direction: row-reverse;
  }
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(16rpx); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ===== 头像 ===== */
.bubble-avatar {
  flex-shrink: 0;
  margin-top: 4rpx;
}

/* ===== 主体 ===== */
.bubble-body {
  flex: 1;
  max-width: 76%;
  display: flex;
  flex-direction: column;
  gap: 8rpx;

  .bubble-wrap--user & {
    align-items: flex-end;
  }
}

/* ===== 气泡 ===== */
.bubble {
  padding: 20rpx 24rpx;
  border-radius: 20rpx;
  word-break: break-word;

  &--user {
    background-color: #2979ff;
    border-top-right-radius: 6rpx;
    color: #ffffff;
  }

  &--assistant {
    background-color: #ffffff;
    border-top-left-radius: 6rpx;
    box-shadow: 0 2rpx 16rpx rgba(0, 0, 0, 0.06);
  }
}

/* ===== 内容区块 ===== */
.part-wrap {
  &:not(:last-child) { margin-bottom: 16rpx; }
}

.part-text {
  font-size: 28rpx;
  line-height: 1.65;
  // 用户消息文本颜色（up-markdown 在 user 气泡内需白色）
  .bubble--user & {
    color: #ffffff;
    :deep(*) { color: #ffffff !important; }
  }
}

/* ===== 思考块 ===== */
.part-thinking {
  padding: 16rpx 20rpx;
  background-color: #fffbf0;
  border-radius: 12rpx;
  border-left: 4rpx solid #f0a020;
}

.thinking-hd {
  display: flex;
  align-items: center;
  gap: 10rpx;
  margin-bottom: 12rpx;
}

.thinking-hd__label {
  font-size: 24rpx;
  font-weight: 600;
  color: #f0a020;
}

.thinking-hd__text {
  font-size: 24rpx;
  color: #86909c;
  line-height: 1.6;
}

/* ===== 计划块 ===== */
.part-plan {
  padding: 16rpx 20rpx;
  background-color: #f0f7ff;
  border-radius: 12rpx;
  border-left: 4rpx solid #2979ff;
}

.plan-hd {
  display: flex;
  align-items: center;
  gap: 10rpx;
  margin-bottom: 16rpx;
}

.plan-hd__label {
  font-size: 24rpx;
  font-weight: 600;
  color: #2979ff;
}

.plan-step {
  display: flex;
  align-items: flex-start;
  gap: 10rpx;
  margin-bottom: 10rpx;

  &:last-child { margin-bottom: 0; }
}

.plan-step__text {
  flex: 1;
  font-size: 24rpx;
  color: #606266;
  line-height: 1.5;

  &--done {
    color: #c0c4cc;
    text-decoration: line-through;
  }
}

/* ===== 图片 ===== */
.part-image { margin: 8rpx 0; }

.msg-image {
  width: 100%;
  border-radius: 12rpx;
}

/* ===== 流式动画 ===== */
.typing-dots {
  display: flex;
  gap: 8rpx;
  padding-top: 8rpx;
}

.dot {
  width: 10rpx;
  height: 10rpx;
  background-color: #c0c4cc;
  border-radius: 50%;
  animation: blink 1.2s infinite ease-in-out;

  &:nth-child(1) { animation-delay: 0s; }
  &:nth-child(2) { animation-delay: 0.2s; }
  &:nth-child(3) { animation-delay: 0.4s; }
}

@keyframes blink {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
  40%            { opacity: 1;   transform: scale(1); }
}

/* ===== 错误 ===== */
.bubble-error {
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-top: 12rpx;
  padding: 12rpx 16rpx;
  background-color: #fff1f0;
  border-radius: 8rpx;
}

.bubble-error__text {
  font-size: 24rpx;
  color: #fa3534;
}

/* ===== 操作栏 ===== */
.bubble-actions {
  display: flex;
  gap: 12rpx;
  opacity: 0;
  transition: opacity 0.2s;

  .bubble-wrap:hover & { opacity: 1; }

  &--user { justify-content: flex-end; }
}

.action-btn {
  width: 48rpx;
  height: 48rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10rpx;
  background-color: #f5f6f8;
  transition: background-color 0.15s;

  &:active { background-color: #e8e8e8; }
}
</style>
