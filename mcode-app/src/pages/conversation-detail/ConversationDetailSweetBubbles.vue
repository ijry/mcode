<template>
  <view v-if="enabled" :class="['sweet-bubbles', `sweet-bubbles--${phase}`]" aria-hidden="true">
    <view
      v-for="bubble in largeBubbles"
      :key="bubble.id"
      class="sweet-bubbles__item sweet-bubbles__item--large"
      :style="bubble.style"
    ></view>
    <view
      v-for="bubble in smallBubbles"
      :key="bubble.id"
      class="sweet-bubbles__item sweet-bubbles__item--small"
      :style="bubble.style"
    ></view>
    <view
      v-for="sparkle in sparkles"
      :key="sparkle.id"
      class="sweet-bubbles__sparkle"
      :style="sparkle.style"
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

const currentPhase = computed(() => props.phase || "idle")

function resolveLargeBubbleOpacity() {
  if (currentPhase.value === "streaming") {
    return 0.34
  }
  if (currentPhase.value === "ramp") {
    return 0.3
  }
  if (currentPhase.value === "settle") {
    return 0.28
  }
  return 0.26
}

function resolveSmallBubbleOpacity() {
  if (currentPhase.value === "streaming") {
    return 0.26
  }
  if (currentPhase.value === "ramp") {
    return 0.23
  }
  if (currentPhase.value === "settle") {
    return 0.21
  }
  return 0.2
}

const largeBubbles = computed(() =>
  Array.from({ length: 10 }, (_, index) => {
    const size = 92 + (index % 4) * 32
    const duration =
      currentPhase.value === "streaming"
        ? 9.2
        : currentPhase.value === "ramp"
          ? 10.4
          : currentPhase.value === "settle"
            ? 11.8
            : 13.8
    const hue =
      index % 3 === 0
        ? "rgba(255, 194, 224, 0.82)"
        : index % 3 === 1
          ? "rgba(255, 233, 245, 0.78)"
          : "rgba(248, 206, 255, 0.74)"

    return {
      id: `sweet-large-${index}`,
      style: {
        left: `${(index * 9.4 + (index % 3) * 3.2) % 96}%`,
        width: `${size}rpx`,
        height: `${size}rpx`,
        bottom: `${-10 - (index % 4) * 12}%`,
        opacity: resolveLargeBubbleOpacity(),
        animationDuration: `${duration}s`,
        animationDelay: `${(index % 5) * -1.4}s`,
        background: `radial-gradient(circle at 32% 26%, rgba(255,255,255,0.96) 0, rgba(255,255,255,0.58) 16%, ${hue} 62%, rgba(255,255,255,0.04) 100%)`,
      },
    }
  })
)

const smallBubbles = computed(() =>
  Array.from({ length: 14 }, (_, index) => {
    const size = 30 + (index % 5) * 12
    const hue =
      index % 2 === 0 ? "rgba(255, 238, 246, 0.78)" : "rgba(254, 211, 238, 0.72)"

    return {
      id: `sweet-small-${index}`,
      style: {
        left: `${(index * 6.7 + (index % 4) * 5.1) % 98}%`,
        width: `${size}rpx`,
        height: `${size}rpx`,
        bottom: `${-6 - (index % 3) * 11}%`,
        opacity: resolveSmallBubbleOpacity(),
        animationDuration: `${11.6 + (index % 4) * 1.1}s`,
        animationDelay: `${(index % 6) * -1.05}s`,
        background: `radial-gradient(circle at 34% 28%, rgba(255,255,255,0.9) 0, ${hue} 58%, rgba(255,255,255,0.02) 100%)`,
      },
    }
  })
)

const sparkles = computed(() =>
  Array.from({ length: 8 }, (_, index) => ({
    id: `sweet-sparkle-${index}`,
    style: {
      left: `${(index * 11.8 + (index % 2) * 8.4) % 92}%`,
      top: `${14 + (index % 4) * 16}%`,
      animationDelay: `${index * -0.85}s`,
      opacity: currentPhase.value === "streaming" ? 0.7 : currentPhase.value === "ramp" ? 0.62 : 0.52,
    },
  }))
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
  animation: sweetBubbleFloat linear infinite;
  will-change: transform, opacity;
}

.sweet-bubbles__item--large {
  box-shadow:
    inset -12rpx -14rpx 22rpx rgba(255, 255, 255, 0.2),
    inset 12rpx 14rpx 24rpx rgba(255, 255, 255, 0.52),
    0 22rpx 56rpx rgba(236, 72, 153, 0.12);
}

.sweet-bubbles__item--small {
  filter: blur(0.5rpx);
  box-shadow:
    inset 0 0 16rpx rgba(255, 255, 255, 0.42),
    0 10rpx 28rpx rgba(244, 114, 182, 0.08);
}

.sweet-bubbles__sparkle {
  position: absolute;
  width: 16rpx;
  height: 16rpx;
  border-radius: 999rpx;
  background:
    radial-gradient(circle, rgba(255, 255, 255, 0.96) 0, rgba(255, 240, 250, 0.12) 72%, transparent 100%);
  box-shadow: 0 0 18rpx rgba(255, 255, 255, 0.44);
  animation: sweetBubbleSparkle 4.8s ease-in-out infinite;
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

@keyframes sweetBubbleSparkle {
  0%, 100% {
    transform: scale(0.72);
    opacity: 0.42;
  }
  50% {
    transform: scale(1);
    opacity: 0.82;
  }
}
</style>
