<template>
  <view class="connection-settings-tab">
    <view class="connection-settings-card" :style="upThemeCardStyle">
      <text class="connection-settings-card__title">设置</text>
      <text class="connection-settings-card__desc">
        连接级设置将在此处对接桌面端 codeg-main 功能。
      </text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance } from "vue"
import type { ConnectionContext } from "@/services/connectionContext"

defineProps<{
  connection: ConnectionContext | null
}>()

const currentInstance = getCurrentInstance()
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
</script>

<style scoped lang="scss">
.connection-settings-tab {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.connection-settings-card {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  padding: 30rpx;
  border-radius: 28rpx;
  background: var(--up-card-bg-color, #ffffff);
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.connection-settings-card__title {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.connection-settings-card__desc {
  font-size: 24rpx;
  line-height: 1.6;
  color: var(--up-content-color, #606266);
}
</style>
