<template>
  <view v-if="enabled" :class="['cyber-rain', `cyber-rain--${phase}`]" aria-hidden="true">
    <view
      v-for="column in columns"
      :key="column.id"
      class="cyber-rain__column"
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

const BASE_STREAMS = [
  "01010100101100101010010110100101",
  "10100101010110010101101001010110",
  "00101101001010110010101001011010",
  "11001010100101101001010110010101",
  "01011010010101100101010010110100",
  "10101100101010010110100101011001",
]

const columns = computed(() =>
  BASE_STREAMS.map((stream, index) => {
    const phase = props.phase || "idle"
    const duration =
      phase === "streaming" ? 7.2 : phase === "ramp" ? 10.4 : phase === "settle" ? 8.4 : 13.6
    const opacity =
      phase === "streaming" ? 0.56 : phase === "ramp" ? 0.34 : phase === "settle" ? 0.26 : 0.18

    return {
      id: `cyber-col-${index}`,
      stream: stream.split("").join("\n"),
      style: {
        left: `${8 + index * 14}%`,
        animationDelay: `${(index % 5) * -1.5}s`,
        animationDuration: `${duration + index * 0.35}s`,
        opacity,
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
}

.cyber-rain__column {
  position: absolute;
  top: -36%;
  width: 40rpx;
  height: 172%;
  animation: cyberRainColumn linear infinite;
}

.cyber-rain__stream {
  display: block;
  white-space: pre-line;
  font-size: 18rpx;
  line-height: 20rpx;
  font-family: "Courier New", monospace;
  color: rgba(110, 255, 163, 0.82);
  text-shadow: 0 0 12rpx rgba(58, 255, 136, 0.3);
}

@keyframes cyberRainColumn {
  from {
    transform: translate3d(0, -12%, 0);
  }
  to {
    transform: translate3d(0, 42%, 0);
  }
}
</style>
