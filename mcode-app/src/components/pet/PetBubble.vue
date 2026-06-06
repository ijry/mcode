<template>
  <up-transition
    mode="fade-up"
    :show="!!message"
    :duration="300"
  >
    <view
      v-if="message"
      class="pet-bubble"
      :class="{ 'pet-bubble--flash': message.flash }"
    >
      <text class="pet-bubble__text">{{ message.text }}</text>
      <view class="pet-bubble__arrow" />
    </view>
  </up-transition>
</template>

<script setup lang="ts">
import type { BubbleMessage } from '@/types/pet'

defineProps<{
  message: BubbleMessage | null
}>()
</script>

<style lang="scss" scoped>
.pet-bubble {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-bottom: 12rpx;
  background: #fff;
  border-radius: 16rpx;
  padding: 10rpx 20rpx;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.12);
  white-space: nowrap;
  max-width: 300rpx;
  z-index: 1;

  &__text {
    font-size: 24rpx;
    color: #333;
    line-height: 1.4;
  }

  &__arrow {
    position: absolute;
    bottom: -10rpx;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 10rpx solid transparent;
    border-right: 10rpx solid transparent;
    border-top: 10rpx solid #fff;
  }

  &--flash {
    animation: bubble-flash 1s ease-in-out infinite;
  }
}

@keyframes bubble-flash {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@media (prefers-color-scheme: dark) {
  .pet-bubble {
    background: #333;
    box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.3);

    &__text {
      color: #e5e5e5;
    }

    &__arrow {
      border-top-color: #333;
    }
  }
}
</style>
