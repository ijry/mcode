<template>
  <view class="detail-body">
    <slot name="history"></slot>
    <scroll-view
      class="message-list"
      :style="messageListPageStyle"
      scroll-y
      :scroll-top="messageScrollTop"
      :scroll-into-view="messageScrollIntoView"
      :scroll-with-animation="messageScrollWithAnimation"
      :upper-threshold="upperThreshold"
      @scroll="emit('message-scroll', $event)"
      @scrolltoupper="emit('message-scroll-upper')"
    >
      <view class="message-list__content" :style="messageListContentStyle">
        <slot name="content"></slot>
      </view>
    </scroll-view>
    <view class="composer-stack">
      <view class="input-status-wrap">
        <slot name="status"></slot>
      </view>
      <view class="input-wrap" :style="inputWrapStyle">
        <slot name="composer"></slot>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { StyleValue } from "vue"

defineProps<{
  messageListPageStyle?: StyleValue
  messageListContentStyle?: StyleValue
  inputWrapStyle?: StyleValue
  messageScrollTop?: number
  messageScrollIntoView?: string
  messageScrollWithAnimation?: boolean
  upperThreshold?: number
}>()

const emit = defineEmits<{
  (event: "message-scroll", payload: unknown): void
  (event: "message-scroll-upper"): void
}>()
</script>

<style scoped lang="scss">
.detail-body {
  position: relative;
  height: 100%;
  min-height: 100%;
  overflow: hidden;
}

.message-list {
  box-sizing: border-box;
  padding-left: 0;
  padding-right: 0;
  width: 100%;
  max-width: 920rpx;
  margin: 0 auto;
  overflow: hidden;
}

.message-list__content {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  box-sizing: content-box;
}

.composer-stack {
  position: absolute;
  left: 50%;
  width: calc(100% - 40rpx);
  bottom: 6px;
  z-index: 30;
  max-width: 920rpx;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10rpx;
}

.input-status-wrap {
  width: auto;
  max-width: 100%;
  padding: 10rpx 14rpx;
  border-radius: 999rpx;
  background: color-mix(in srgb, var(--up-page-bg-color, var(--up-bg-color, #f5f6f8)) 90%, transparent 10%);
  border: 1rpx solid color-mix(in srgb, var(--up-border-color, #dadbde) 36%, transparent 64%);
  box-shadow: 0 8rpx 18rpx rgba(15, 23, 42, 0.025);
  backdrop-filter: blur(16rpx);
  box-sizing: border-box;
}

.input-wrap {
  width: 100%;
  background: color-mix(in srgb, var(--up-card-bg-color, #ffffff) 76%, transparent 24%);
  border: 1rpx solid color-mix(in srgb, var(--up-border-color, #dadbde) 64%, transparent 36%);
  border-radius: 34rpx;
  padding: 16rpx 16rpx;
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
  box-shadow: 0 -4rpx 24rpx rgba(15, 23, 42, 0.03), 0 18rpx 42rpx rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(22rpx);
  box-sizing: border-box;
}
</style>
