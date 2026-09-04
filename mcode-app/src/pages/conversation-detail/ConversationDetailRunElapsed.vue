<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue"
import { formatRunElapsed } from "./detailStatusPresentation"

/**
 * 状态胶囊里的「已运行时间」。对齐 PC 端 `LiveTurnStats` 里那枚计时器
 * （`codeg-plus/src/components/message/live-turn-stats.tsx`）：同一个语义、同一个起点。
 *
 * **为什么要单独做一个组件，而不是在 pane 里读一个 tick ref。**
 * 秒级文案意味着每秒要变一次。状态胶囊住在
 * `ConversationDetailInteractivePane` 的模板里，而那份模板同时 `v-for` 出整条消息
 * 时间线（尾窗允许 230 轮）—— 在 pane 里读 tick 会让整棵 vnode 树每秒重建一次，正是
 * `2026-09-04-05-05-detail-streaming-performance-fixes` 那一轮刚消除掉的开销。计时器
 * 连同它的响应式依赖一起关在这个叶子组件里，重渲染范围就只有这一个文本节点。
 *
 * `label` 存的是**已经格式化好的字符串**而不是时间戳：同值赋 ref 不触发更新，所以跨过
 * 一小时（不再显示秒）之后，定时器仍是 1s 一跳，而重渲染变成每分钟一次。
 */
const props = defineProps<{
  /** 本回合起点（epoch ms）。取 `session.liveMessage.timestamp`。 */
  startedAt: number
  /**
   * 暂停计时。详情页是 swiper 多 tab，非当前页的 pane 仍然挂载着 —— 看不见的地方
   * 不必每秒醒一次。
   */
  paused?: boolean
}>()

const label = ref("")
let timer: ReturnType<typeof setInterval> | null = null

function sync() {
  label.value = formatRunElapsed(Date.now() - props.startedAt)
}

function stop() {
  if (!timer) return
  clearInterval(timer)
  timer = null
}

function start() {
  // 先算一遍再起表：否则挂载后的第一秒是空文案，胶囊会先窄一下再变宽。
  sync()
  if (timer) return
  timer = setInterval(sync, 1000)
}

watch(
  () => [props.startedAt, props.paused] as const,
  () => {
    stop()
    if (props.paused) {
      // 暂停时仍然刷一次：切回这一页的瞬间要看到正确的值，而不是离开前那一刻的旧值。
      sync()
      return
    }
    start()
  },
  { immediate: true }
)

onBeforeUnmount(stop)
</script>

<template>
  <text class="input-status-row__elapsed">· {{ label }}</text>
</template>

<style scoped lang="scss">
/*
 * 基础形制自带，不 `@import "./index.scss"` —— 那张表 3700 行，为一个文本节点整份
 * 复制一遍不值得。主题重着色（cyber / sweet / summer）另一说：它们和
 * `.input-status-row__text` 的重着色写在一起（`index.scss`），靠 scoped 样式会把父组件
 * 的 scope id 也打在子组件根节点上而命中这里。
 */
.input-status-row__elapsed {
  flex-shrink: 0;
  /* 比状态文案再淡一档：它是附注，不该和「思考中」抢读。 */
  font-size: 18rpx;
  line-height: 1.25;
  color: var(--up-light-color, #c0c4cc);
  white-space: nowrap;
  /* 等宽数字，秒位跳动时胶囊宽度不抖。 */
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
}
</style>
