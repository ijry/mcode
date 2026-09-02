<script setup lang="ts">
import { computed, getCurrentInstance } from "vue"
import ForgeStateChip from "./ForgeStateChip.vue"
import ForgeLabelChip from "./ForgeLabelChip.vue"
import ForgeTaskChip from "./ForgeTaskChip.vue"
import { authorInitial, rowMetaText, visibleLabels } from "../forgeRowPresentation"
import type { ForgeIssueRow, ForgeTaskLink } from "@/types/forge"

/**
 * 列表里的一行。
 *
 * 完全受控：自己不持有状态，也不发任何请求。点整行 = 进详情；右侧是任务三态动作
 * （无任务 → 处理 / 活跃 → 状态芯片 / 终态 → 芯片 + 再次处理）。
 *
 * 布局是「字形 | 标题+标签+元信息 | 右侧」三列，标题最多两行截断 —— 行高必须
 * 可预测，否则同一屏里几行高几行矮，列表读起来是锯齿。
 */
const props = defineProps<{
  row: ForgeIssueRow
  /** 共享的渲染时刻，让同一屏所有相对时间口径一致。 */
  now: number
  /** 这一行对应的任务（反查得来）。`null` = 还没有人处理过它。 */
  taskLink?: ForgeTaskLink | null
}>()

const emit = defineEmits<{
  (event: "open"): void
  (event: "start"): void
  (event: "openTask", taskId: number): void
}>()

const currentInstance = getCurrentInstance()
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

const labels = computed(() => visibleLabels(props.row.labels))
const meta = computed(() => rowMetaText(props.row, props.now))
const initial = computed(() => authorInitial(props.row.author))
</script>

<template>
  <view class="forge-row" @click="emit('open')">
    <view class="forge-row__glyph">
      <ForgeStateChip :row="props.row" />
    </view>

    <view class="forge-row__body">
      <text class="forge-row__title">{{ props.row.title }}</text>

      <view v-if="labels.shown.length > 0" class="forge-row__labels">
        <ForgeLabelChip v-for="label in labels.shown" :key="label.name" :label="label" />
        <text v-if="labels.hidden > 0" class="forge-row__labels-more">+{{ labels.hidden }}</text>
      </view>

      <view class="forge-row__meta">
        <!-- 头像失败时退回首字母：一个空圆圈读起来像还在加载。 -->
        <image
          v-if="props.row.author_avatar"
          class="forge-row__avatar"
          :src="props.row.author_avatar"
          mode="aspectFill"
        ></image>
        <view v-else class="forge-row__avatar forge-row__avatar--text">
          <text>{{ initial }}</text>
        </view>
        <text class="forge-row__meta-text">{{ meta }}</text>
        <!-- 评论数只在 > 0 时出现 —— 「0 条评论」是一句没有信息的话。 -->
        <view v-if="props.row.comments > 0" class="forge-row__comments">
          <up-icon
            name="chat"
            size="13"
            :color="upThemeVar('--up-tips-color', '#909193')"
          ></up-icon>
          <text class="forge-row__meta-text">{{ props.row.comments }}</text>
        </view>
      </view>
    </view>

    <!-- 任务动作。整行可点进详情，所以这里的子元素都 stop 掉冒泡（在 ForgeTaskChip
         内部做）。 -->
    <view class="forge-row__action">
      <ForgeTaskChip
        :link="props.taskLink || null"
        @start="emit('start')"
        @openTask="emit('openTask', $event)"
      />
    </view>
  </view>
</template>

<style scoped lang="scss">
@import "../index.scss";

.forge-row {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
  padding: 22rpx;
  border-radius: 24rpx;
  background: var(--up-card-bg-color, #ffffff);
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.forge-row__glyph {
  padding-top: 4rpx;
}

.forge-row__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.forge-row__title {
  font-size: 28rpx;
  font-weight: 600;
  line-height: 1.4;
  color: var(--up-main-color, #303133);
  /* 两行截断：行高要可预测。 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

.forge-row__labels {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 8rpx;
  overflow: hidden;
}

.forge-row__labels-more {
  font-size: 20rpx;
  color: var(--up-tips-color, #909193);
  flex-shrink: 0;
}

.forge-row__meta {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.forge-row__avatar {
  width: 32rpx;
  height: 32rpx;
  border-radius: 999rpx;
  flex-shrink: 0;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.forge-row__avatar--text {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18rpx;
  color: var(--up-content-color, #606266);
}

.forge-row__meta-text {
  font-size: 21rpx;
  color: var(--up-tips-color, #909193);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.forge-row__comments {
  display: flex;
  align-items: center;
  gap: 4rpx;
  flex-shrink: 0;
}

.forge-row__action {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  padding-top: 2rpx;
}
</style>
