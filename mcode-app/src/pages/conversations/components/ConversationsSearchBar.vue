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
      :height="32"
      @update:model-value="(value) => emit('update:modelValue', value)"
      @search="() => {}"
      @clear="() => {}"
    ></up-search>
    <!-- 新建会话。从顶栏右侧移到这里，与搜索框同高同族（圆形玻璃按钮）。
         选择模式下隐藏：那时底部是批量操作条，新建会打断选择流程。 -->
    <view
      v-if="canCreate"
      class="conversations-create-button"
      @click="emit('create')"
    >
      <up-icon name="plus" size="18" :color="upThemeVar('--up-primary', '#2f7cf6')"></up-icon>
    </view>
  </view>
</template>

<script setup lang="ts">
import { getCurrentInstance } from "vue"

/**
 * 会话列表顶部的搜索行 + 「新建会话」圆钮。
 *
 * 纯受控组件：`searchKeyword` 的**真身留在页面**（它被卡片派生、历史面板、空态文案等多处
 * 读取），这里只做 v-model 转发与新建事件上抛。「已完成」筛选与「选择」已挪进顶栏左侧的
 * 下拉菜单（ConversationsNavbar.vue）。
 */
defineProps<{
  /** 搜索关键词（v-model）。 */
  modelValue: string
  /** 是否显示新建按钮（选择模式下由页面关掉）。 */
  canCreate: boolean
}>()

const emit = defineEmits<{
  (event: "update:modelValue", value: string): void
  (event: "create"): void
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

/* 搜索框占满剩余宽度，新建圆钮按内容收缩 —— 否则 up-search 的默认 100% 宽度会把
   按钮挤出屏幕。 */
.conversations-searchbar :deep(.u-search) {
  flex: 1;
  min-width: 0;
}

/* 新建圆钮。与搜索框同高（64rpx）、同款玻璃质感，读起来是搜索行的一部分。
   三处 64rpx（本块 + __content + __content__input）必须与 up-search 的 :height="32"（px）
   保持一致，否则圆钮和输入框会错高。 */
.conversations-create-button {
  flex-shrink: 0;
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1rpx solid rgba(255, 255, 255, 0.5);
  border-radius: 999rpx;
  background-color: color-mix(in srgb, var(--up-card-bg-color, #ffffff) 40%, transparent);
  backdrop-filter: blur(25rpx);
  -webkit-backdrop-filter: blur(25rpx);
  box-shadow: 0 4rpx 16rpx rgba(31, 38, 135, 0.05);
  transition: transform 0.2s ease;
}

.conversations-create-button:active {
  transform: scale(0.9);
}

.conversations-searchbar :deep(.u-search__content) {
  height: 64rpx;
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
  height: 64rpx;
  font-size: 26rpx;
  color: var(--up-main-color, #303133);
  background-color: transparent !important;
}

.conversations-searchbar :deep(.u-search__content__icon) {
  margin-right: 8rpx;
}
</style>
