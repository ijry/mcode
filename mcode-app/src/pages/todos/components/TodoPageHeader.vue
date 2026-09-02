<script setup lang="ts">
import { computed, getCurrentInstance } from "vue"
import type { TodoTab } from "../todoState"

const props = defineProps<{
  activeTab: TodoTab
  searchKeyword: string
}>()

const emit = defineEmits<{
  (e: "update:activeTab", value: TodoTab): void
  (e: "update:searchKeyword", value: string): void
  (e: "create"): void
}>()

const currentInstance = getCurrentInstance()
const upThemeVarFromProxy = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

/**
 * 是否需要自己画一个返回箭头。
 *
 * 「待办」原先是 tabBar 页（tabBar 页不需要返回，也没有返回可用），它被「任务」取代
 * 之后只能通过 `navigateTo` 进来 —— 而本页是 `navigationStyle: "custom"`，没有原生导航栏
 * 提供返回。判据用页面栈深度而不是加一个路由参数：只要栈里不止一页，就一定是被
 * navigateTo 推进来的，这样两种入口都不用改调用方。
 */
const canGoBack = computed(() => {
  try {
    return (getCurrentPages()?.length || 1) > 1
  } catch {
    return false
  }
})

function goBack() {
  uni.navigateBack({ delta: 1 })
}
</script>

<template>
  <view class="todo-header">
    <view class="todo-header__top">
      <view v-if="canGoBack" class="todo-header__back" @click="goBack">
        <up-icon name="arrow-left" size="18" :color="upThemeVarFromProxy('--up-main-color', '#303133')"></up-icon>
      </view>
      <text class="todo-header__title">待办</text>
      <view class="todo-header__action" @click="emit('create')">
        <up-icon name="plus" size="16" color="#ffffff"></up-icon>
      </view>
    </view>

    <view class="todo-header__search">
      <up-search
        :modelValue="props.searchKeyword"
        placeholder="搜索"
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

    <view class="todo-header__segmented">
      <view
        :class="['todo-header__segment', props.activeTab === 'local' && 'todo-header__segment--active']"
        @click="emit('update:activeTab', 'local')"
      >
        <text class="todo-header__segment-text">本地</text>
      </view>
      <view
        :class="['todo-header__segment', props.activeTab === 'cloud' && 'todo-header__segment--active']"
        @click="emit('update:activeTab', 'cloud')"
      >
        <text class="todo-header__segment-text">云端</text>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.todo-header {
  display: flex;
  flex-direction: column;
  gap: 22rpx;
  margin-bottom: 28rpx;
}

.todo-header__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}

.todo-header__back {
  width: 58rpx;
  height: 58rpx;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.todo-header__title {
  flex: 1;
  min-width: 0;
  font-size: 60rpx;
  font-weight: 700;
  line-height: 1.08;
  letter-spacing: -0.04em;
  color: var(--up-main-color, #303133);
}

.todo-header__action {
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

.todo-header__search :deep(.u-search__content) {
  border: none !important;
  border-radius: 24rpx !important;
  background-color: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6)) !important;
  box-shadow: none !important;
}

.todo-header__search :deep(.u-search__content__input) {
  font-size: 26rpx;
  color: var(--up-main-color, #303133);
}

.todo-header__search :deep(.u-search__content__icon) {
  margin-right: 8rpx;
}

.todo-header__segmented {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 8rpx;
  border-radius: 999rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.todo-header__segment {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 52rpx;
  border-radius: 999rpx;
  transition: all 0.18s ease;
}

.todo-header__segment--active {
  background: var(--up-card-bg-color, #ffffff);
  box-shadow: 0 10rpx 26rpx rgba(15, 23, 42, 0.08);
}

.todo-header__segment-text {
  font-size: 24rpx;
  font-weight: 600;
  color: var(--up-content-color, #606266);
}

.todo-header__segment--active .todo-header__segment-text {
  color: var(--up-main-color, #303133);
}
</style>
