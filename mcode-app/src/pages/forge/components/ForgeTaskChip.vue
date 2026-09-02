<script setup lang="ts">
import { computed, getCurrentInstance } from "vue"
import { forgeChipState, forgeTaskStatusLabel, forgeTaskStatusTone } from "../forgeScenario"
import type { ForgeTaskLink } from "@/types/forge"

/**
 * 行上的三态动作。
 *
 * - **没有任务** → 「处理」按钮；
 * - **活跃任务** → 状态芯片，点进任务详情；
 * - **终态任务** → 状态芯片 + 「再次处理」。
 *
 * 为什么终态仍然显示芯片而不是直接变回「处理」：那个 issue 上一次的处理结果（完成 /
 * 取消 / 失败）是决定要不要再来一次的依据。直接抹掉它会让用户在一个刚失败过的工作项上
 * 重复触发同一个任务。
 */
const props = defineProps<{
  link: ForgeTaskLink | null
}>()

const emit = defineEmits<{
  (event: "start"): void
  (event: "openTask", taskId: number): void
}>()

const currentInstance = getCurrentInstance()
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

const state = computed(() => forgeChipState(props.link))
const statusLabel = computed(() =>
  props.link ? forgeTaskStatusLabel(props.link.status) : ""
)
const statusColor = computed(() => {
  if (!props.link) return upThemeVar("--up-content-color", "#606266")
  const tone = forgeTaskStatusTone(props.link.status)
  return tone.themeVar ? upThemeVar(tone.themeVar, tone.fallback) : tone.fallback
})
</script>

<template>
  <view class="forge-task-chip">
    <view v-if="state === 'none'" class="forge-task-chip__start" @click.stop="emit('start')">
      <text>处理</text>
    </view>

    <template v-else>
      <view
        class="forge-task-chip__status"
        :style="{ color: statusColor, borderColor: statusColor }"
        @click.stop="props.link && emit('openTask', props.link.task_id)"
      >
        <text>{{ statusLabel }}</text>
      </view>
      <!-- 终态才给「再次处理」—— 活跃任务上再触发一次会得到 duplicate，那是一次
           白跑的往返加一个需要解释的弹层。 -->
      <view
        v-if="state === 'terminal'"
        class="forge-task-chip__again"
        @click.stop="emit('start')"
      >
        <up-icon
          name="reload"
          size="13"
          :color="upThemeVar('--up-tips-color', '#909193')"
        ></up-icon>
      </view>
    </template>
  </view>
</template>

<style scoped lang="scss">
.forge-task-chip {
  display: flex;
  align-items: center;
  gap: 8rpx;
  flex-shrink: 0;
}

.forge-task-chip__start {
  padding: 8rpx 20rpx;
  border-radius: 999rpx;
  background: var(--up-primary, #2979ff);
  color: #ffffff;
  font-size: 21rpx;
  font-weight: 700;
}

.forge-task-chip__status {
  padding: 6rpx 16rpx;
  border-radius: 999rpx;
  border: 1rpx solid transparent;
  font-size: 20rpx;
  font-weight: 600;
}

.forge-task-chip__again {
  width: 40rpx;
  height: 40rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}
</style>
