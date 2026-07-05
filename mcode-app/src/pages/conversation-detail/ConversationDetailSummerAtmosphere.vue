<template>
  <view v-if="enabled" :class="['summer-atmosphere', `summer-atmosphere--${phase}`]" aria-hidden="true">
    <view
      v-for="wave in waveLayers"
      :key="wave.id"
      class="summer-atmosphere__wave"
      :style="wave.style"
    ></view>

    <view
      v-for="slice in watermelonSlices"
      :key="slice.id"
      class="summer-atmosphere__piece summer-atmosphere__slice"
      :style="slice.style"
    >
      <svg class="summer-atmosphere__svg" viewBox="0 0 112 112" focusable="false" aria-hidden="true">
        <path d="M18 68c9-28 41-44 72-35-4 18-14 30-28 37-14 7-29 8-44 5z" fill="#ff5a6e" />
        <path d="M18 68c5 15 18 24 38 27 18 2 33-2 46-12-5 13-16 22-31 27-21 7-40 3-53-12z" fill="#2fb84f" />
        <path d="M23 69c11-21 38-33 64-27-5 11-13 20-24 25-12 5-25 7-40 2z" fill="#ff90a0" />
        <g fill="#422d16">
          <ellipse cx="52" cy="49" rx="2.2" ry="4" transform="rotate(-18 52 49)" />
          <ellipse cx="65" cy="44" rx="2.2" ry="4" transform="rotate(12 65 44)" />
          <ellipse cx="74" cy="55" rx="2.2" ry="4" transform="rotate(28 74 55)" />
        </g>
      </svg>
    </view>

    <view
      v-for="leaf in palmLeaves"
      :key="leaf.id"
      class="summer-atmosphere__piece summer-atmosphere__leaf"
      :style="leaf.style"
    >
      <svg class="summer-atmosphere__svg" viewBox="0 0 128 106" focusable="false" aria-hidden="true">
        <path d="M18 97c7-23 24-47 49-65 15-11 33-20 50-24-5 20-16 39-32 56-18 18-39 29-67 33z" fill="#1fa56d" />
        <path d="M42 91c7-22 19-43 37-62" stroke="#dff9e9" stroke-width="7" stroke-linecap="round" />
        <path d="M70 78c6-17 15-32 27-45" stroke="#dff9e9" stroke-width="6" stroke-linecap="round" />
      </svg>
    </view>

    <view
      v-for="coconut in coconuts"
      :key="coconut.id"
      class="summer-atmosphere__piece summer-atmosphere__coconut"
      :style="coconut.style"
    >
      <svg class="summer-atmosphere__svg" viewBox="0 0 88 88" focusable="false" aria-hidden="true">
        <ellipse cx="44" cy="52" rx="26" ry="22" fill="#8f5f2d" />
        <path d="M18 52c8-16 22-25 26-25s18 9 26 25c-8 8-17 12-26 12s-18-4-26-12z" fill="#fff5da" />
        <rect x="40" y="16" width="8" height="20" rx="4" fill="#4f7b2f" />
        <path d="M53 36l13-8" stroke="#ff7a8f" stroke-width="3.5" stroke-linecap="round" />
      </svg>
    </view>
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

function phaseOpacity(idleValue: number, rampValue: number, streamingValue: number, settleValue: number) {
  if (currentPhase.value === "streaming") return streamingValue
  if (currentPhase.value === "ramp") return rampValue
  if (currentPhase.value === "settle") return settleValue
  return idleValue
}

const waveLayers = computed(() =>
  Array.from({ length: 3 }, (_, index) => ({
    id: `summer-wave-${index}`,
    style: {
      left: index === 0 ? "-8%" : "-4%",
      width: index === 0 ? "116%" : "108%",
      height: `${112 - index * 16}rpx`,
      bottom: `${86 - index * 18}rpx`,
      opacity: phaseOpacity(0.28 - index * 0.04, 0.34 - index * 0.05, 0.44 - index * 0.08, 0.3 - index * 0.04),
      animationDuration: `${15 + index * 2.6}s`,
      animationDelay: `${index * -1.6}s`,
    },
  }))
)

const watermelonSlices = computed(() => [
  {
    id: "slice-top-left",
    style: {
      top: "52rpx",
      left: "8rpx",
      width: "132rpx",
      opacity: phaseOpacity(0.82, 0.88, 0.94, 0.84),
      transform: "rotate(-8deg)",
      animationDuration: "11.8s",
    },
  },
  {
    id: "slice-middle-right",
    style: {
      top: "148rpx",
      right: "10rpx",
      width: "118rpx",
      opacity: phaseOpacity(0.74, 0.8, 0.88, 0.78),
      transform: "rotate(14deg)",
      animationDuration: "13.4s",
    },
  },
])

const palmLeaves = computed(() => [
  {
    id: "leaf-left",
    style: {
      top: "0",
      left: "0",
      width: "156rpx",
      opacity: phaseOpacity(0.78, 0.84, 0.92, 0.8),
      transform: "rotate(-2deg)",
      animationDuration: "16.2s",
    },
  },
  {
    id: "leaf-right",
    style: {
      top: "8rpx",
      right: "-8rpx",
      width: "118rpx",
      opacity: phaseOpacity(0.7, 0.78, 0.86, 0.74),
      transform: "rotate(12deg) scaleX(-1)",
      animationDuration: "17.6s",
    },
  },
])

const coconuts = computed(() => [
  {
    id: "coconut-bottom-right",
    style: {
      bottom: "134rpx",
      right: "18rpx",
      width: "102rpx",
      opacity: phaseOpacity(0.72, 0.78, 0.84, 0.74),
      animationDuration: "14.8s",
    },
  },
])
</script>

<style scoped lang="scss">
.summer-atmosphere {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.summer-atmosphere__wave,
.summer-atmosphere__piece {
  position: absolute;
  will-change: transform, opacity;
}

.summer-atmosphere__wave {
  border-radius: 52% 48% 0 0 / 82% 78% 0 0;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.54), rgba(255, 255, 255, 0.08)),
    radial-gradient(circle at 24% 18%, rgba(255, 255, 255, 0.72), transparent 32%);
  filter: blur(0.4rpx);
  animation: summerWaveDrift ease-in-out infinite;
}

.summer-atmosphere__piece {
  filter: drop-shadow(0 12rpx 24rpx rgba(10, 101, 128, 0.12));
}

.summer-atmosphere__slice {
  animation: summerSliceFloat ease-in-out infinite;
}

.summer-atmosphere__leaf {
  transform-origin: top center;
  animation: summerPalmSway ease-in-out infinite;
}

.summer-atmosphere__coconut {
  animation: summerCoconutFloat ease-in-out infinite;
}

.summer-atmosphere__svg {
  display: block;
  width: 100%;
  height: auto;
}

.summer-atmosphere--idle {
  opacity: 0.9;
}

.summer-atmosphere--ramp,
.summer-atmosphere--settle {
  opacity: 0.96;
}

.summer-atmosphere--streaming {
  opacity: 1;
}

@keyframes summerWaveDrift {
  0%, 100% {
    transform: translate3d(0, 0, 0);
  }
  50% {
    transform: translate3d(18rpx, -8rpx, 0);
  }
}

@keyframes summerSliceFloat {
  0%, 100% {
    transform: translate3d(0, 0, 0) rotate(0deg);
  }
  50% {
    transform: translate3d(8rpx, -10rpx, 0) rotate(3deg);
  }
}

@keyframes summerPalmSway {
  0%, 100% {
    transform: translate3d(0, 0, 0) rotate(0deg);
  }
  50% {
    transform: translate3d(0, 6rpx, 0) rotate(4deg);
  }
}

@keyframes summerCoconutFloat {
  0%, 100% {
    transform: translate3d(0, 0, 0);
  }
  50% {
    transform: translate3d(-6rpx, -8rpx, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .summer-atmosphere__wave,
  .summer-atmosphere__slice,
  .summer-atmosphere__leaf,
  .summer-atmosphere__coconut {
    animation: none !important;
  }
}
</style>
