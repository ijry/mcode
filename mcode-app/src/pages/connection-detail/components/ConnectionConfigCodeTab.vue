<template>
  <view class="connection-config-tab">
    <view v-if="!connection" class="connection-config-empty" :style="upThemeCardStyle">
      <text class="connection-config-empty__title">缺少连接信息</text>
      <text class="connection-config-empty__desc">请返回连接列表重新进入。</text>
    </view>

    <view v-else class="connection-config-card" :style="upThemeCardStyle">
      <view class="connection-config-card__connection">
        <text class="connection-config-card__name">{{ connection.name }}</text>
        <text class="connection-config-card__meta">{{ connectionMeta }}</text>
      </view>

      <view v-if="configCodeValue" class="connection-config-card__qr">
        <up-qrcode
          cid="mcode-connection-detail-config-qrcode"
          :val="configCodeValue"
          :size="220"
          :quiet-zone="8"
          foreground="#111827"
          background="#ffffff"
        ></up-qrcode>
      </view>

      <view v-if="configError" class="connection-config-card__error">
        <text>{{ configError }}</text>
      </view>

      <view v-else class="connection-config-card__text">
        <text>{{ configCodeValue }}</text>
      </view>

      <u-button type="primary" block :disabled="!configCodeValue" @click="copyConfigCode">
        复制配置码
      </u-button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance } from "vue"
import type { ConnectionRecordV2 } from "@/services/connectionSchema"
import { buildConnectionConfigCode } from "@/pages/connections/connectionConfigCode"
import { getConnectionSubtitle } from "@/pages/connections/connectionPresentation"

const props = defineProps<{
  connection: ConnectionRecordV2 | null
}>()

const currentInstance = getCurrentInstance()
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})

const connectionMeta = computed(() => (props.connection ? getConnectionSubtitle(props.connection) : ""))
const configResult = computed(() => {
  if (!props.connection) return { value: "", error: "" }
  try {
    return { value: buildConnectionConfigCode(props.connection), error: "" }
  } catch (error) {
    return {
      value: "",
      error: error instanceof Error && error.message ? error.message : "配置码生成失败",
    }
  }
})
const configCodeValue = computed(() => configResult.value.value)
const configError = computed(() => configResult.value.error)

function copyConfigCode() {
  if (!configCodeValue.value) return
  uni.setClipboardData({
    data: configCodeValue.value,
    success: () => uni.showToast({ title: "已复制配置码", icon: "success" }),
    fail: () => uni.showToast({ title: "复制失败", icon: "none" }),
  })
}
</script>

<style scoped lang="scss">
.connection-config-tab {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.connection-config-card,
.connection-config-empty {
  border-radius: 28rpx;
  background: var(--up-card-bg-color, #ffffff);
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.connection-config-card {
  display: flex;
  flex-direction: column;
  gap: 22rpx;
  padding: 28rpx;
}

.connection-config-card__connection {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  padding: 20rpx;
  border-radius: 24rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.connection-config-card__name {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.connection-config-card__meta,
.connection-config-empty__desc {
  font-size: 24rpx;
  line-height: 1.6;
  color: var(--up-content-color, #606266);
}

.connection-config-card__qr {
  display: flex;
  justify-content: center;
  margin: 0 auto;
  padding: 24rpx;
  border-radius: 28rpx;
  background: #ffffff;
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.connection-config-card__text,
.connection-config-card__error {
  max-height: 220rpx;
  padding: 18rpx;
  border-radius: 20rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  color: var(--up-content-color, #606266);
  font-size: 20rpx;
  line-height: 1.5;
  word-break: break-all;
  overflow: hidden;
}

.connection-config-card__error {
  color: var(--up-error, #fa3534);
}

.connection-config-empty {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  padding: 40rpx 28rpx;
}

.connection-config-empty__title {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}
</style>
