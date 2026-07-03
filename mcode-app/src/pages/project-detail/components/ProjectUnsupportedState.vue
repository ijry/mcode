<template>
  <view class="project-tab-state" :style="upThemeCardStyle">
    <view class="project-tab-state__icon">
      <up-icon
        :name="icon || 'info-circle'"
        size="22"
        :color="upThemeVar('--up-primary', '#2979ff')"
      ></up-icon>
    </view>
    <text class="project-tab-state__title">{{ title }}</text>
    <text class="project-tab-state__text">{{ text }}</text>
    <view v-if="actionText" class="project-tab-state__action" @click="emit('action')">
      <text>{{ actionText }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance } from "vue"

defineProps<{
  title: string
  text: string
  icon?: string
  actionText?: string
}>()

const emit = defineEmits<{
  (event: "action"): void
}>()

const currentInstance = getCurrentInstance()
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (name: string, fallback: string) =>
  currentInstance?.proxy?.upThemeVar?.(name, fallback) ?? `var(${name}, ${fallback})`
</script>

<style scoped lang="scss">
.project-tab-state {
  padding: 48rpx 32rpx;
  border-radius: 24rpx;
  border: 1rpx solid var(--up-border-color, #dadbde);
  background: var(--up-card-bg-color, #ffffff);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14rpx;
  text-align: center;
}

.project-tab-state__icon {
  width: 72rpx;
  height: 72rpx;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 10%, var(--up-card-bg-color, #ffffff) 90%);
}

.project-tab-state__title {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.project-tab-state__text {
  font-size: 24rpx;
  line-height: 1.5;
  color: var(--up-content-color, #606266);
}

.project-tab-state__action {
  margin-top: 8rpx;
  padding: 14rpx 28rpx;
  border-radius: 999rpx;
  background: var(--up-primary, #2979ff);
  color: #ffffff;
  font-size: 24rpx;
  font-weight: 700;
}
</style>
