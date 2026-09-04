<template>
  <view class="marquee">
    <!-- 隐藏探针：始终测量单份文本的自然宽度，不受显示状态影响 -->
    <text class="marquee__probe">{{ text }}</text>

    <view
      v-if="scrolling"
      class="marquee__track marquee__track--scroll"
      :style="trackStyle"
    >
      <text class="marquee__text">{{ text }}</text>
      <text class="marquee__text marquee__text--dup">{{ text }}</text>
    </view>
    <text v-else class="marquee__static">{{ text }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"

const props = withDefaults(
  defineProps<{
    text?: string
    // 滚动速度，单位 px/s
    speed?: number
    // 两份文本之间的间隔，单位 px
    gap?: number
  }>(),
  {
    text: "",
    speed: 90,
    gap: 48,
  }
)

const instance = getCurrentInstance()
const scrolling = ref(false)
const distance = ref(0)
const duration = ref(0)

const trackStyle = computed(() => {
  if (!scrolling.value) return {}
  return {
    "--marquee-distance": `${distance.value}px`,
    "--marquee-gap": `${props.gap}px`,
    animationDuration: `${duration.value}s`,
  } as Record<string, string>
})

function measure() {
  if (!instance) return
  const query = uni.createSelectorQuery().in(instance)
  query.select(".marquee").boundingClientRect()
  query.select(".marquee__probe").boundingClientRect()
  query.exec((rects: any[]) => {
    const wrapRect = rects?.[0]
    const textRect = rects?.[1]
    const wrapWidth = Number(wrapRect?.width || 0)
    const textWidth = Number(textRect?.width || 0)
    if (!wrapWidth || !textWidth || textWidth <= wrapWidth + 1) {
      scrolling.value = false
      return
    }
    // 无缝滚动：位移一份文本宽度 + 间隔，第二份刚好补位
    distance.value = Math.ceil(textWidth + props.gap)
    duration.value = Math.max(4, distance.value / Math.max(1, props.speed))
    scrolling.value = true
  })
}

/**
 * 文字变化时重新测量并重启动画 —— 但必须防抖。
 *
 * 这个组件用在会话列表的实时预览卡上（`:text="card.livePreviewText"`），流式期间那个值
 * 每批 token 都变。一次 `measure()` 是两个 `boundingClientRect`（在 app-vue 下是跨线程
 * 桥接往返），加上 `scrolling` 先 false 再 true 造成的两次重渲染与 CSS 动画重启（视觉上
 * 还会闪）。不防抖就是每个预览卡每批 token 一轮强制布局。
 */
const MEASURE_DEBOUNCE_MS = 300
let measureTimer: ReturnType<typeof setTimeout> | null = null

function clearMeasureTimer() {
  if (!measureTimer) return
  clearTimeout(measureTimer)
  measureTimer = null
}

function scheduleMeasure() {
  if (measureTimer) return
  measureTimer = setTimeout(() => {
    measureTimer = null
    void nextTick(() => measure())
  }, MEASURE_DEBOUNCE_MS)
}

watch(
  () => props.text,
  (next, previous) => {
    // 文本清空/首次出现是状态切换，立刻处理；持续增长走防抖。
    if (!next || !previous) {
      clearMeasureTimer()
      scrolling.value = false
      void nextTick(() => measure())
      return
    }
    scheduleMeasure()
  }
)

onMounted(() => {
  void nextTick(() => measure())
})

onBeforeUnmount(() => {
  clearMeasureTimer()
})
</script>

<style scoped lang="scss">
.marquee {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

// 静态态：单行省略号，绝不撑破容器（含无空格的英文/代码）
.marquee__static {
  display: block;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  word-break: break-all;
  color: inherit;
  font-size: inherit;
  font-weight: inherit;
  line-height: inherit;
}

// 隐藏探针：脱离文档流，仅用于测量自然宽度
.marquee__probe {
  position: absolute;
  top: 0;
  left: 0;
  visibility: hidden;
  pointer-events: none;
  white-space: nowrap;
  color: inherit;
  font-size: inherit;
  font-weight: inherit;
  line-height: inherit;
}

.marquee__track {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  color: inherit;
  font-size: inherit;
  font-weight: inherit;
  line-height: inherit;
  will-change: transform;
}

.marquee__track--scroll {
  animation-name: marqueeScroll;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}

.marquee__text {
  flex-shrink: 0;
  white-space: nowrap;
  color: inherit;
  font-size: inherit;
  font-weight: inherit;
  line-height: inherit;
}

.marquee__text--dup {
  margin-left: var(--marquee-gap, 48px);
}

@keyframes marqueeScroll {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(calc(-1 * var(--marquee-distance, 0px)));
  }
}
</style>
