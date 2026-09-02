<script setup lang="ts">
import { computed, getCurrentInstance } from "vue"
import type { WorkTask } from "@/types/workTask"
import { isTaskSpinning, taskStatusLabel, taskStatusTone } from "../taskStatus"

/**
 * 状态胶囊。列表卡片与详情页共用同一个组件 —— 同一个状态在两处必须长得一样，
 * 也必须叫同一个名字（文案与色调都从 `taskStatus.ts` 这个纯模块来）。
 */
const props = defineProps<{
  task: Pick<WorkTask, "status" | "failure_reason">
}>()

const currentInstance = getCurrentInstance()
// upThemeVar 是 uview-plus 用 Options API mixin 注入的，`<script setup>` 里裸调会
// ReferenceError，必须经 proxy 取。与 ConversationsSearchBar 同一写法。
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

const label = computed(() => taskStatusLabel(props.task))
const tone = computed(() => taskStatusTone(props.task))
const spinning = computed(() => isTaskSpinning(props.task))
const spinnerColor = computed(() => upThemeVar("--up-primary", "#2979ff"))
</script>

<template>
  <view :class="['task-status-chip', `task-status-chip--${tone}`]">
    <up-loading-icon
      v-if="spinning"
      mode="circle"
      size="14"
      :color="spinnerColor"
    ></up-loading-icon>
    <text class="task-status-chip__text">{{ label }}</text>
  </view>
</template>

<style scoped lang="scss">
/* 胶囊本体的类在 ../index.scss（跨组件共享）；这里只补组件私有的排版微调。 */
@import "../index.scss";

.task-status-chip {
  min-width: 0;
}
</style>
