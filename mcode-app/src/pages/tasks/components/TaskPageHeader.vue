<script setup lang="ts">
import { computed, getCurrentInstance } from "vue"
import type { TaskTabId } from "../taskStatus"
import { taskTabLabel } from "../taskStatus"

/**
 * 任务列表页顶部。大标题 + 工具按钮 + 搜索 + 状态 tabs。
 *
 * 完全受控：自己不持有任何状态，值全部由页面通过 props 给，变更 emit 回去。
 * 与 `TodoPageHeader` 同一形状 —— 页面拥有状态，组件只画。
 *
 * tabs 用 `up-tabs`，它是**下标驱动**的（`:current`），所以这里在 tab id 与下标之间
 * 转一次。tab 上的数字用 uview 自带的 badge（`list[i].badge`），且**只有**「等你处理」
 * 会挂 —— 每个 tab 都带数字会让顶部变成一排噪音，而这一个才是要催人去看的。
 */
const props = defineProps<{
  activeTab: TaskTabId
  searchKeyword: string
  tabs: TaskTabId[]
  /** tab id → 数量。 */
  counts: Record<TaskTabId, number>
  /** 当前筛选摘要（「全部连接」/ 连接名 · 项目名），显示在标题下。 */
  filterSummary: string
  /** 是否有生效的可见性筛选 —— 给筛选按钮加个点。 */
  filterActive: boolean
}>()

const emit = defineEmits<{
  (event: "update:activeTab", value: TaskTabId): void
  (event: "update:searchKeyword", value: string): void
  (event: "create"): void
  (event: "openFilter"): void
  (event: "openSettings"): void
  (event: "openForge"): void
}>()

const currentInstance = getCurrentInstance()
// upThemeVar 是 uview-plus 用 Options API mixin 注入的方法，只有模板作用域能直接调；
// `<script setup>` 里必须经 proxy 取，否则 ReferenceError（computed 里会静默失败）。
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

const tabList = computed(() =>
  props.tabs.map((tab) => ({
    id: tab,
    title: taskTabLabel(tab),
    badge:
      tab === "attention" && props.counts.attention > 0
        ? { value: props.counts.attention, bgColor: upThemeVar("--up-warning", "#ff9900") }
        : null,
  }))
)

const currentIndex = computed(() => {
  const index = props.tabs.indexOf(props.activeTab)
  return index >= 0 ? index : 0
})

function handleTabChange(item: any) {
  // up-tabs 各版本回调形状不一致：有的给 `{index}`，有的直接给 item，也见过给纯下标。
  // 三种都认，与 `todos/index.vue` 的 `resolveTodoActionName` 是同一类兼容处理。
  const index =
    typeof item === "number"
      ? item
      : typeof item?.index === "number"
        ? item.index
        : props.tabs.findIndex((tab) => tab === item?.id)
  const next = props.tabs[index]
  if (next && next !== props.activeTab) {
    emit("update:activeTab", next)
  }
}
</script>

<template>
  <view class="task-header">
    <view class="task-header__top">
      <view class="task-header__copy">
        <text class="task-header__eyebrow">WORK TASKS</text>
        <text class="task-header__title">任务</text>
        <text class="task-header__summary">{{ props.filterSummary }}</text>
      </view>
      <view class="task-header__tools">
        <!-- 仓库面板入口。放在工具组最左边，与「设置 / 筛选」这两个作用于**本页**的
             按钮隔开语义上不同的一件事：它是去另一个功能。
             `github-circle-fill` 是 uview 内置图标集里唯一的 GitHub 图标（实心圆），
             与旁边两个线性图标不完全同族，但零新增文件且颜色跟随主题。 -->
        <view class="task-header__tool" @click="emit('openForge')">
          <up-icon
            name="github-circle-fill"
            size="18"
            :color="upThemeVar('--up-content-color', '#606266')"
          ></up-icon>
        </view>
        <view class="task-header__tool" @click="emit('openSettings')">
          <up-icon name="setting" size="17" :color="upThemeVar('--up-content-color', '#606266')"></up-icon>
        </view>
        <view class="task-header__tool" @click="emit('openFilter')">
          <up-icon name="list" size="17" :color="upThemeVar('--up-content-color', '#606266')"></up-icon>
          <view v-if="props.filterActive" class="task-header__tool-dot"></view>
        </view>
        <view class="task-header__action" @click="emit('create')">
          <up-icon name="plus" size="16" color="#ffffff"></up-icon>
        </view>
      </view>
    </view>

    <view class="task-header__search">
      <up-search
        :modelValue="props.searchKeyword"
        placeholder="搜索任务标题、描述或分支"
        :show-action="false"
        shape="round"
        :bgColor="upThemeVar('--up-hover-bg-color', '#e9eaee')"
        borderColor="transparent"
        :color="upThemeVar('--up-main-color', '#1a1b1f')"
        :placeholderColor="upThemeVar('--up-tips-color', '#9ca3af')"
        :searchIconColor="upThemeVar('--up-tips-color', '#8b93a5')"
        :height="44"
        @update:modelValue="emit('update:searchKeyword', $event)"
      ></up-search>
    </view>

    <view class="task-header__tabs">
      <up-tabs
        :current="currentIndex"
        :list="tabList"
        keyName="title"
        :scrollable="false"
        :lineColor="upThemeVar('--up-primary', '#2979ff')"
        :activeStyle="{ color: upThemeVar('--up-main-color', '#303133'), fontWeight: '700' }"
        :inactiveStyle="{ color: upThemeVar('--up-content-color', '#606266') }"
        @change="handleTabChange"
      ></up-tabs>
    </view>
  </view>
</template>

<style scoped lang="scss">
.task-header {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  margin-bottom: 24rpx;
}

.task-header__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20rpx;
}

.task-header__copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.task-header__eyebrow {
  font-size: 20rpx;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--up-primary, #2979ff);
}

.task-header__title {
  font-size: 56rpx;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.04em;
  color: var(--up-main-color, #303133);
}

.task-header__summary {
  font-size: 22rpx;
  color: var(--up-tips-color, #909193);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-header__tools {
  display: flex;
  align-items: center;
  gap: 12rpx;
  flex-shrink: 0;
}

.task-header__tool {
  position: relative;
  width: 58rpx;
  height: 58rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.task-header__tool-dot {
  position: absolute;
  top: 10rpx;
  right: 10rpx;
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: var(--up-primary, #2979ff);
}

.task-header__action {
  width: 58rpx;
  height: 58rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx;
  background: linear-gradient(180deg, #2f7cf6 0%, #1f6ae5 100%);
  box-shadow: 0 12rpx 24rpx rgba(47, 124, 246, 0.22);
  flex-shrink: 0;
}

.task-header__search :deep(.u-search__content) {
  border: none !important;
  border-radius: 24rpx !important;
  background-color: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6)) !important;
  box-shadow: none !important;
}

.task-header__search :deep(.u-search__content__input) {
  font-size: 26rpx;
  color: var(--up-main-color, #303133);
}

.task-header__tabs {
  border-radius: 22rpx;
  background: var(--up-card-bg-color, #ffffff);
  border: 1rpx solid var(--up-border-color, #dadbde);
  overflow: hidden;
}
</style>
