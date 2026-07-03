<template>
  <view class="connection-info-tab">
    <view v-if="!connection" class="connection-info-empty" :style="upThemeCardStyle">
      <text class="connection-info-empty__title">缺少连接信息</text>
      <text class="connection-info-empty__desc">请返回连接列表重新进入。</text>
    </view>

    <view v-else class="connection-info-card" :style="upThemeCardStyle">
      <view v-for="row in rows" :key="row.label" class="connection-info-row">
        <text class="connection-info-row__label">{{ row.label }}</text>
        <text class="connection-info-row__value">{{ row.value }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance } from "vue"
import type { ConnectionRecordV2 } from "@/services/connectionSchema"
import { buildConnectionInfoRows } from "../connectionDetailPresentation"

const props = defineProps<{
  connection: ConnectionRecordV2 | null
}>()

const currentInstance = getCurrentInstance()
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const rows = computed(() => (props.connection ? buildConnectionInfoRows(props.connection) : []))
</script>

<style scoped lang="scss">
.connection-info-tab {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.connection-info-card,
.connection-info-empty {
  border-radius: 28rpx;
  background: var(--up-card-bg-color, #ffffff);
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.connection-info-card {
  overflow: hidden;
}

.connection-info-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24rpx;
  padding: 24rpx 26rpx;
  border-bottom: 1rpx solid var(--up-border-color, #dadbde);
}

.connection-info-row:last-child {
  border-bottom: none;
}

.connection-info-row__label {
  flex-shrink: 0;
  font-size: 24rpx;
  color: var(--up-tips-color, #909193);
}

.connection-info-row__value {
  min-width: 0;
  font-size: 24rpx;
  line-height: 1.55;
  color: var(--up-main-color, #303133);
  text-align: right;
  word-break: break-all;
}

.connection-info-empty {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  padding: 40rpx 28rpx;
}

.connection-info-empty__title {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.connection-info-empty__desc {
  font-size: 24rpx;
  color: var(--up-content-color, #606266);
}
</style>
