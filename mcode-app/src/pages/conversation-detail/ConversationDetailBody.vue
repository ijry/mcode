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
    <view class="composer-safe-area"></view>
    <view class="composer-stack">
      <view :class="['input-status-wrap', translucentMessageList && 'input-status-wrap--translucent']">
        <slot name="status"></slot>
      </view>
      <view
        :class="['input-wrap', translucentMessageList && 'input-wrap--translucent']"
        :style="resolvedInputWrapStyle"
      >
        <slot name="composer"></slot>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type StyleValue } from "vue"

const props = defineProps<{
  messageListPageStyle?: StyleValue
  messageListContentStyle?: StyleValue
  inputWrapStyle?: StyleValue
  translucentMessageList?: boolean
  messageScrollTop?: number
  messageScrollIntoView?: string
  messageScrollWithAnimation?: boolean
  upperThreshold?: number
}>()

const resolvedInputWrapStyle = computed(() =>
  props.translucentMessageList ? undefined : props.inputWrapStyle
)

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
  bottom: calc(env(safe-area-inset-bottom) + 10rpx);
  z-index: 30;
  max-width: 920rpx;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10rpx;
}

.composer-safe-area {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: calc(env(safe-area-inset-bottom) + 12rpx);
  z-index: 29;
  pointer-events: none;
  background: transparent;
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

.input-status-wrap--translucent {
  background: color-mix(in srgb, var(--up-card-bg-color, #ffffff) 50%, transparent 50%);
  border: 1rpx solid color-mix(in srgb, var(--up-border-color, #dadbde) 42%, transparent 58%);
  backdrop-filter: blur(18rpx);
}

.input-wrap {
  width: 100%;
  background: color-mix(in srgb, var(--up-card-bg-color, #ffffff) 76%, transparent 24%);
  border: 1rpx solid color-mix(in srgb, var(--up-border-color, #dadbde) 64%, transparent 36%);
  border-radius: 30rpx;
  padding: 14rpx 16rpx 16rpx;
  box-shadow: 0 -2rpx 18rpx rgba(15, 23, 42, 0.025), 0 14rpx 36rpx rgba(15, 23, 42, 0.07);
  backdrop-filter: blur(20rpx);
  box-sizing: border-box;
}

.input-wrap--translucent {
  background: color-mix(in srgb, var(--up-card-bg-color, #ffffff) 50%, transparent 50%);
  border: 1rpx solid color-mix(in srgb, var(--up-border-color, #dadbde) 42%, transparent 58%);
  backdrop-filter: blur(22rpx);
}
</style>
