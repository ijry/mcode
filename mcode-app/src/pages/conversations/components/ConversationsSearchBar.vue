<template>
  <view class="conversations-searchbar">
    <up-search
      :model-value="modelValue"
      placeholder="搜索会话..."
      :show-action="false"
      shape="round"
      :bgColor="upThemeVar('--up-hover-bg-color', '#e9eaee')"
      borderColor="transparent"
      :color="upThemeVar('--up-main-color', '#1a1b1f')"
      :placeholderColor="upThemeVar('--up-tips-color', '#9ca3af')"
      :searchIconColor="upThemeVar('--up-tips-color', '#8b93a5')"
      :height="40"
      @update:model-value="(value) => emit('update:modelValue', value)"
      @search="() => {}"
      @clear="() => {}"
    ></up-search>
    <view
      :class="[
        'conversations-filter-chip',
        hideCompleted && 'conversations-filter-chip--active',
      ]"
      @click="emit('toggle-hide-completed')"
    >
      <up-icon
        :name="hideCompleted ? 'eye-off' : 'eye'"
        size="14"
        :color="
          hideCompleted
            ? upThemeVar('--up-primary', '#2979ff')
            : upThemeVar('--up-tips-color', '#909193')
        "
      ></up-icon>
      <text class="conversations-filter-chip__text">已完成</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { getCurrentInstance } from "vue"

/**
 * 会话列表顶部的搜索行 + 「已完成」筛选胶囊。
 *
 * 纯受控组件：`searchKeyword` 与 `hideCompletedConversations` 的**真身留在页面**（它们被
 * 卡片派生、历史面板、空态文案等多处读取），这里只做 v-model 转发与开关事件上抛。
 */
defineProps<{
  /** 搜索关键词（v-model）。 */
  modelValue: string
  /** 是否隐藏已完成会话（驱动胶囊高亮与图标）。 */
  hideCompleted: boolean
}>()

const emit = defineEmits<{
  (event: "update:modelValue", value: string): void
  (event: "toggle-hide-completed"): void
}>()

// `upThemeVar` 是 uview-plus 注入到每个组件实例的全局 mixin，模板里可直接用；这里补一个
// 同名局部函数只是为了 <script> 侧也能取（本组件模板已够用，保留以防后续需要）。
const currentInstance = getCurrentInstance()
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")
</script>

<style scoped lang="scss">
.conversations-searchbar {
  margin-top: 16rpx;
  margin-bottom: 28rpx;
  display: flex;
  align-items: center;
  gap: 12rpx;
}

/* 搜索框占满剩余宽度，筛选胶囊按内容收缩 —— 否则 up-search 的默认 100% 宽度会把
   胶囊挤出屏幕。 */
.conversations-searchbar :deep(.u-search) {
  flex: 1;
  min-width: 0;
}

/* 「已完成」筛选胶囊。形制与搜索框同款（半透明 + 毛玻璃 + 全圆角），这样它读起来是
   搜索行的一部分，而不是一个飘在旁边的按钮。 */
.conversations-filter-chip {
  flex-shrink: 0;
  height: 80rpx;
  padding: 0 20rpx;
  display: flex;
  align-items: center;
  gap: 6rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.5);
  border-radius: 999rpx;
  background-color: color-mix(in srgb, var(--up-card-bg-color, #ffffff) 40%, transparent);
  backdrop-filter: blur(25rpx);
  -webkit-backdrop-filter: blur(25rpx);
  box-shadow: 0 4rpx 16rpx rgba(31, 38, 135, 0.05);
}

.conversations-filter-chip--active {
  border-color: color-mix(in srgb, var(--up-primary, #2979ff) 32%, transparent);
  background-color: color-mix(in srgb, var(--up-primary, #2979ff) 12%, var(--up-card-bg-color, #ffffff) 88%);
}

.conversations-filter-chip__text {
  font-size: 22rpx;
  color: var(--up-content-color, #606266);
}

.conversations-filter-chip--active .conversations-filter-chip__text {
  color: var(--up-primary, #2979ff);
}

.conversations-searchbar :deep(.u-search__content) {
  height: 80rpx;
  display: flex;
  align-items: center;
  border: 1rpx solid rgba(255, 255, 255, 0.5) !important;
  border-radius: 999rpx !important;
  background-color: color-mix(in srgb, var(--up-card-bg-color, #ffffff) 40%, transparent) !important;
  backdrop-filter: blur(25rpx);
  -webkit-backdrop-filter: blur(25rpx);
  box-shadow: 0 4rpx 16rpx rgba(31, 38, 135, 0.05) !important;
}

.conversations-searchbar :deep(.u-search__content__input) {
  height: 80rpx;
  font-size: 26rpx;
  color: var(--up-main-color, #303133);
  background-color: transparent !important;
}

.conversations-searchbar :deep(.u-search__content__icon) {
  margin-right: 8rpx;
}
</style>
