<template>
  <view v-if="enabled" :class="['sweet-bubbles', `sweet-bubbles--${phase}`]" aria-hidden="true">
    <view
      v-for="bubble in bubbles"
      :key="bubble.id"
      class="sweet-bubbles__item"
      :style="bubble.style"
    ></view>
    <view class="sweet-bubbles__glow sweet-bubbles__glow--left"></view>
    <view class="sweet-bubbles__glow sweet-bubbles__glow--right"></view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue"
import type { CyberEffectPhase } from "./detailCyberMode"

const props = withDefaults(defineProps<{
  enabled?: boolean
  phase?: CyberEffectPhase
}>(), {
  enabled: false,
  phase: "idle",
})

const bubbles = computed(() =>
  Array.from({ length: 12 }, (_, index) => {
    const phase = props.phase || "idle"
    const size = 74 + (index % 4) * 28
    const duration =
      phase === "streaming" ? 8.8 : phase === "ramp" ? 10.2 : phase === "settle" ? 11.6 : 13.5
    const left = (index * 8.1 + (index % 3) * 2.4) % 94
    const delay = (index % 5) * -1.3
    const opacity =
      phase === "streaming" ? 0.48 : phase === "ramp" ? 0.4 : phase === "settle" ? 0.34 : 0.28
    const hue = index % 3 === 0 ? "rgba(255, 182, 221, 0.9)" : index % 3 === 1 ? "rgba(255, 226, 245, 0.88)" : "rgba(250, 198, 255, 0.86)"

    return {
      id: `sweet-bubble-${index}`,
      style: {
        left: `${left}%`,
        width: `${size}rpx`,
        height: `${size}rpx`,
        bottom: `${-8 - (index % 4) * 14}%`,
        opacity,
        animationDuration: `${duration}s`,
        animationDelay: `${delay}s`,
        background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.92) 0, rgba(255,255,255,0.42) 18%, ${hue} 58%, rgba(255,255,255,0.06) 100%)`,
      },
    }
  })
)
</script>

<style scoped lang="scss">
.sweet-bubbles {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.sweet-bubbles__item {
  position: absolute;
  border-radius: 999rpx;
  box-shadow:
    inset -10rpx -12rpx 20rpx rgba(255, 255, 255, 0.24),
    inset 10rpx 12rpx 18rpx rgba(255, 255, 255, 0.42),
    0 18rpx 44rpx rgba(236, 72, 153, 0.14);
  animation: sweetBubbleFloat linear infinite;
  will-change: transform, opacity;
}

.sweet-bubbles__glow {
  position: absolute;
  border-radius: 999rpx;
  filter: blur(72rpx);
  opacity: 0.6;
}

.sweet-bubbles__glow--left {
  left: -80rpx;
  bottom: 16%;
  width: 260rpx;
  height: 260rpx;
  background: rgba(244, 114, 182, 0.32);
}

.sweet-bubbles__glow--right {
  right: -60rpx;
  top: 12%;
  width: 300rpx;
  height: 300rpx;
  background: rgba(251, 207, 232, 0.36);
}

.sweet-bubbles--idle {
  opacity: 0.78;
}

.sweet-bubbles--ramp,
.sweet-bubbles--settle {
  opacity: 0.9;
}

.sweet-bubbles--streaming {
  opacity: 1;
}

@keyframes sweetBubbleFloat {
  from {
    transform: translate3d(0, 0, 0) scale(0.96);
  }
  50% {
    transform: translate3d(14rpx, -42vh, 0) scale(1.02);
  }
  to {
    transform: translate3d(-10rpx, -92vh, 0) scale(0.98);
  }
}
</style>
