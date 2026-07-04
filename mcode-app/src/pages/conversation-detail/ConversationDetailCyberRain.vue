<template>
  <view v-if="enabled" :class="['cyber-rain', `cyber-rain--${phase}`]" aria-hidden="true">
    <view
      v-for="column in columns"
      :key="column.id"
      :class="['cyber-rain__column', `cyber-rain__column--${column.tier}`]"
      :style="column.style"
    >
      <text class="cyber-rain__stream">{{ column.stream }}</text>
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

const CYBER_RAIN_COLUMN_COUNT = 18

const BASE_STREAMS = [
  "01010100101100101010010110100101",
  "10100101010110010101101001010110",
  "00101101001010110010101001011010",
  "11001010100101101001010110010101",
  "01011010010101100101010010110100",
  "10101100101010010110100101011001",
  "01100101101001011010100101100101",
  "10010110100101011001010110100101",
  "00110101011010010101100101101001",
]

const columns = computed(() =>
  Array.from({ length: CYBER_RAIN_COLUMN_COUNT }, (_, index) => {
    const phase = props.phase || "idle"
    const stream = BASE_STREAMS[index % BASE_STREAMS.length]
    const tier = index % 3 === 0 ? "bright" : index % 3 === 1 ? "mid" : "dim"
    const duration =
      phase === "streaming" ? 4.8 : phase === "ramp" ? 6.4 : phase === "settle" ? 7.6 : 9.8
    const opacityBase =
      phase === "streaming" ? 0.86 : phase === "ramp" ? 0.62 : phase === "settle" ? 0.42 : 0.28
    const tierBoost = tier === "bright" ? 0.16 : tier === "mid" ? 0.02 : -0.1

    return {
      id: `cyber-col-${index}`,
      tier,
      stream: `${stream}${BASE_STREAMS[(index + 4) % BASE_STREAMS.length]}`.split("").join("\n"),
      style: {
        left: `${(index * 5.6 + (index % 2) * 2.4) % 98}%`,
        animationDelay: `${(index % 7) * -0.92}s`,
        animationDuration: `${duration + (index % 6) * 0.42}s, 0.42s`,
        opacity: Math.max(0.12, Math.min(0.98, opacityBase + tierBoost)),
        fontSize: `${16 + (index % 4) * 2}rpx`,
        filter: tier === "bright" ? "blur(0)" : "blur(0.45rpx)",
      },
    }
  })
)
</script>

<style scoped lang="scss">
.cyber-rain {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  mix-blend-mode: screen;
  opacity: 0.94;
}

.cyber-rain--idle {
  opacity: 0.56;
}

.cyber-rain--ramp,
.cyber-rain--settle {
  opacity: 0.82;
}

.cyber-rain--streaming {
  opacity: 1;
}

.cyber-rain__column {
  position: absolute;
  top: -82%;
  width: 34rpx;
  height: 246%;
  animation-name: cyberRainColumn, cyberRainFlicker;
  animation-timing-function: linear, steps(3);
  animation-iteration-count: infinite, infinite;
  animation-duration: inherit, 0.42s;
  will-change: transform, opacity;
}

.cyber-rain__column--bright {
  text-shadow: 0 0 16rpx rgba(78, 255, 143, 0.72), 0 0 34rpx rgba(0, 255, 65, 0.32);
}

.cyber-rain__column--mid {
  text-shadow: 0 0 12rpx rgba(58, 255, 136, 0.42);
}

.cyber-rain__column--dim {
  text-shadow: 0 0 8rpx rgba(58, 255, 136, 0.24);
}

.cyber-rain__stream {
  display: block;
  white-space: pre-line;
  font-size: inherit;
  line-height: 1.08;
  font-family: "Courier New", monospace;
  color: rgba(124, 255, 158, 0.92);
}

@keyframes cyberRainColumn {
  from {
    transform: translate3d(0, -18%, 0);
  }
  to {
    transform: translate3d(0, 54%, 0);
  }
}

@keyframes cyberRainFlicker {
  0%, 100% {
    opacity: 0.76;
  }
  33% {
    opacity: 1;
  }
  66% {
    opacity: 0.48;
  }
}
</style>
