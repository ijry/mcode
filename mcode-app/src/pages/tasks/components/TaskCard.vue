<script setup lang="ts">
import { computed, getCurrentInstance } from "vue"
import TaskStatusChip from "./TaskStatusChip.vue"
import type { TaskListEntry } from "../taskPresentation"
import {
  formatRelativeTime,
  taskCardNote,
  taskCardTimestamp,
  taskDiffStat,
} from "../taskPresentation"
import { isMergeQueued, worktreeWasRemoved } from "../taskAcceptance"
import { buildTaskActions, type TaskActionId } from "../taskActions"
import { formatScheduleShort } from "../taskSchedule"
// agent 图标复用会话列表那份**已有**实现，而不是再抄一份。仓库里
// `services/conversation/agentType.ts` 的注释已经记录过复制副本带来的分叉问题；
// 这三个函数是纯的、无副作用，跨页 import 与 `ProjectTodosPanel` 的做法一致。
import {
  overviewAgentLogoClass,
  overviewAgentLogoPath,
  overviewAgentLogoText,
} from "@/pages/conversations/conversationOverviewPresentation"

/**
 * 一张任务卡片。
 *
 * 整卡点击 = 打开详情页；底部动作条里 **一个实心主动作 + 若干图标次动作**，动作集由
 * `taskActions.buildTaskActions` 推导 —— 与详情页共用同一份判定，两处不会给出不同的
 * 可做事项。
 *
 * 副行（错误 / 实时进展 / 结果摘要）只在任务确实有话说时出现，优先级见
 * `taskPresentation.taskCardNote`。
 */
const props = defineProps<{
  entry: TaskListEntry
  /** 该任务在其项目合并队列里的名次（页面算，卡片看不到兄弟节点）。 */
  mergeQueueRank?: number
  /** 共享的渲染时刻，让同一屏所有相对时间口径一致。 */
  now: number
  /**
   * 这张卡上**正在飞**的那个动作 id，空串 = 没有。
   *
   * 刻意是个**字符串**而不是 `Set` / `Map`：小程序的 props 要过 `setData` 的 JSON
   * 序列化，集合类型到不了子组件（在 H5 上却能跑，所以这种错只会在打小程序包时才炸）。
   * 一张卡同一时刻最多只有一个直发命令的动作在飞，所以一个标量就够，顺带让 `setData`
   * 的 diff 只落在真正变了的那张卡上。
   */
  pendingAction?: string
}>()

const emit = defineEmits<{
  (event: "open"): void
  (event: "action", id: TaskActionId): void
}>()

const currentInstance = getCurrentInstance()
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

const task = computed(() => props.entry.task)
const archived = computed(() => task.value.archived_at != null)
const agentType = computed(
  () => task.value.agent_type || task.value.config?.agent_type || ""
)
const agentLogoPath = computed(() => overviewAgentLogoPath(agentType.value))
const agentLogoText = computed(() => overviewAgentLogoText(agentType.value))
const agentLogoClass = computed(() => overviewAgentLogoClass(agentType.value))

const actions = computed(() => buildTaskActions(task.value))
const note = computed(() => taskCardNote(task.value))
const stat = computed(() => taskDiffStat(task.value))
const whenText = computed(() =>
  formatRelativeTime(taskCardTimestamp(task.value), props.now)
)

const scheduleText = computed(() => {
  if (task.value.status !== "todo" || !task.value.scheduled_at) return ""
  return formatScheduleShort(task.value.scheduled_at)
})

const mergeQueuedText = computed(() => {
  if (!isMergeQueued(task.value)) return ""
  const rank = props.mergeQueueRank
  return rank != null && rank > 1 ? `排队合并 · 第 ${rank} 位` : "排队合并中"
})

const worktreeRemoved = computed(() => worktreeWasRemoved(task.value))

/**
 * 「保留 worktree」只在 worktree 确实还在时才说。目录已经没了的时候这句话是假的 ——
 * 那时上面那枚「Worktree 已删除」才是真话。
 */
const worktreeKept = computed(
  () =>
    task.value.status === "canceled" &&
    task.value.worktree_folder_id != null &&
    task.value.worktree_missing !== true
)

const preflight = computed(() => {
  const light = task.value.preflight
  if (!light || task.value.status !== "review") return null
  const tone =
    light.status === "passed" ? "success" : light.status === "failed" ? "error" : ""
  return { ...light, tone }
})

const sourceLabel = computed(() => {
  const meta = task.value.source_meta
  if (!meta || !meta.number) return ""
  return meta.owner_repo ? `#${meta.number} · ${meta.owner_repo}` : `#${meta.number}`
})

/** 这个动作是不是正在飞 —— 主动作与次动作共用同一判定。 */
function isActionPending(actionId: string): boolean {
  return Boolean(props.pendingAction) && props.pendingAction === actionId
}
</script>

<template>
  <view
    :class="['task-card', archived && 'task-card--archived']"
    :style="upThemeCardStyle"
    @click="emit('open')"
  >
    <view class="task-card__head">
      <view :class="['task-card__logo', agentLogoClass, agentLogoPath && 'task-card__logo--real']">
        <image
          v-if="agentLogoPath"
          class="task-card__logo-img"
          :src="agentLogoPath"
          mode="aspectFit"
        />
        <text v-else class="task-card__logo-text">{{ agentLogoText }}</text>
      </view>
      <text class="task-card__title">{{ task.title }}</text>
      <TaskStatusChip :task="task" />
    </view>

    <view class="task-card__meta">
      <text v-if="entry.folderName" class="task-card__meta-text">{{ entry.folderName }}</text>
      <text v-if="entry.folderName && task.work_branch" class="task-card__meta-sep">/</text>
      <text v-if="task.work_branch" class="task-card__meta-branch">{{ task.work_branch }}</text>
      <text v-if="stat" class="task-card__meta-sep">·</text>
      <text v-if="stat" class="task-card__meta-add">+{{ stat.additions }}</text>
      <text v-if="stat" class="task-card__meta-del">-{{ stat.deletions }}</text>
      <text v-if="whenText" class="task-card__meta-sep">·</text>
      <text v-if="whenText" class="task-card__meta-text">{{ whenText }}</text>
    </view>

    <view
      v-if="scheduleText || mergeQueuedText || preflight || worktreeRemoved || worktreeKept || task.cleanup_state === 'failed'"
      class="task-card__badges"
    >
      <view v-if="scheduleText" class="task-badge task-badge--primary">
        <text class="task-badge__text">{{ scheduleText }}</text>
      </view>
      <view v-if="mergeQueuedText" class="task-badge task-badge--warning">
        <text class="task-badge__text">{{ mergeQueuedText }}</text>
      </view>
      <view v-if="preflight" :class="['task-badge', preflight.tone && `task-badge--${preflight.tone}`]">
        <text class="task-badge__text">{{ preflight.command }}</text>
      </view>
      <view v-if="worktreeRemoved" class="task-badge task-badge--warning">
        <text class="task-badge__text">Worktree 已删除</text>
      </view>
      <view v-if="worktreeKept" class="task-badge">
        <text class="task-badge__text">保留 worktree</text>
      </view>
      <view v-if="task.cleanup_state === 'failed'" class="task-badge task-badge--warning">
        <text class="task-badge__text">清理失败</text>
      </view>
    </view>

    <text v-if="sourceLabel" class="task-card__source">{{ sourceLabel }}</text>

    <view v-if="note" :class="['task-card__note', `task-card__note--${note.tone}`]">
      <text class="task-card__note-text">{{ note.text }}</text>
    </view>

    <view
      v-if="actions.primary || actions.secondaries.length > 0"
      class="task-card__footer"
    >
      <view
        v-if="actions.primary"
        :class="['task-card__primary', isActionPending(actions.primary.id) && 'task-card__primary--loading']"
        @click.stop="emit('action', actions.primary.id)"
      >
        <up-loading-icon
          v-if="isActionPending(actions.primary.id)"
          mode="circle"
          size="14"
          color="#ffffff"
        ></up-loading-icon>
        <up-icon
          v-else
          :name="actions.primary.icon"
          size="14"
          color="#ffffff"
        ></up-icon>
        <text class="task-card__primary-text">{{ actions.primary.label }}</text>
      </view>
      <view class="task-card__spacer"></view>
      <view
        v-for="item in actions.secondaries"
        :key="item.id"
        :class="['task-card__icon-btn', isActionPending(item.id) && 'task-card__icon-btn--loading']"
        @click.stop="emit('action', item.id)"
      >
        <!-- 归档 / 取消排队也是直发命令，作为次动作时同样要给个在转的反馈。 -->
        <up-loading-icon
          v-if="isActionPending(item.id)"
          mode="circle"
          size="14"
          :color="upThemeVar('--up-tips-color', '#909193')"
        ></up-loading-icon>
        <up-icon
          v-else
          :name="item.icon"
          size="16"
          :color="item.danger ? upThemeVar('--up-error', '#fa3534') : upThemeVar('--up-tips-color', '#909193')"
        ></up-icon>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
@import "../index.scss";

.task-card {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  padding: 22rpx 20rpx;
  border-radius: 20rpx;
  background: var(--up-card-bg-color, #ffffff);
  border: 1rpx solid var(--up-border-color, #dadbde);
  box-shadow: 0 4rpx 12rpx rgba(15, 23, 42, 0.04);
  transition: box-shadow 0.2s ease;
}

.task-card:active {
  box-shadow: 0 2rpx 8rpx rgba(15, 23, 42, 0.06);
}

.task-card--archived {
  opacity: 0.6;
}

.task-card__head {
  display: flex;
  align-items: flex-start;
  gap: 14rpx;
}

.task-card__logo {
  width: 44rpx;
  height: 44rpx;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.task-card__logo--real {
  background: transparent;
}

.task-card__logo-img {
  width: 36rpx;
  height: 36rpx;
}

.task-card__logo-text {
  font-size: 20rpx;
  font-weight: 700;
  color: var(--up-tips-color, #909193);
}

.task-card__title {
  flex: 1;
  min-width: 0;
  font-size: 30rpx;
  font-weight: 700;
  line-height: 1.35;
  color: var(--up-main-color, #303133);
  word-break: break-word;
}

.task-card__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8rpx;
}

.task-card__meta-text,
.task-card__meta-sep,
.task-card__meta-branch,
.task-card__meta-add,
.task-card__meta-del {
  font-size: 22rpx;
  line-height: 1.4;
}

.task-card__meta-text {
  max-width: 320rpx;
  color: var(--up-tips-color, #909193);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-card__meta-sep {
  color: var(--up-light-color, #c0c4cc);
}

.task-card__meta-branch {
  max-width: 300rpx;
  font-family: "Courier New", monospace;
  color: var(--up-content-color, #606266);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-card__meta-add {
  color: var(--up-success, #19be6b);
}

.task-card__meta-del {
  color: var(--up-error, #fa3534);
}

.task-card__badges {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10rpx;
}

.task-card__source {
  font-size: 20rpx;
  font-family: "Courier New", monospace;
  color: var(--up-primary, #2979ff);
}

.task-card__note {
  padding: 14rpx 18rpx;
  border-radius: 16rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.task-card__note-text {
  font-size: 22rpx;
  line-height: 1.5;
  color: var(--up-content-color, #606266);
  word-break: break-word;
}

.task-card__note--error {
  background: color-mix(in srgb, var(--up-error, #fa3534) 10%, var(--up-card-bg-color, #ffffff) 90%);
}

.task-card__note--error .task-card__note-text {
  color: var(--up-error, #fa3534);
}

.task-card__note--progress .task-card__note-text {
  color: var(--up-primary, #2979ff);
}

.task-card__footer {
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding-top: 16rpx;
  border-top: 1rpx solid var(--up-border-color, #ebeef5);
}

.task-card__primary {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  padding: 12rpx 24rpx;
  border-radius: 999rpx;
  background: var(--up-primary, #2979ff);
  transition: opacity 0.2s ease, transform 0.1s ease;
}

.task-card__primary--loading {
  opacity: 0.7;
  pointer-events: none;
}

.task-card__primary-text {
  font-size: 24rpx;
  font-weight: 600;
  color: #ffffff;
}

.task-card__spacer {
  flex: 1;
  min-width: 0;
}

.task-card__icon-btn {
  width: 56rpx;
  height: 56rpx;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  transition: opacity 0.2s ease, transform 0.1s ease;
}

.task-card__icon-btn:active {
  opacity: 0.7;
  transform: scale(0.95);
}

.task-card__icon-btn--loading {
  opacity: 0.7;
  pointer-events: none;
}
</style>
