<template>
  <view class="page">
    <view class="section col">
      <view class="title">远程目标</view>
      <view v-for="item in targets.targets" :key="item.id" class="section">
        <view class="row" style="justify-content: space-between;">
          <text>{{ item.name }}</text>
          <text class="muted">{{ item.mode }}</text>
        </view>
        <view class="row">
          <button class="btn" @click="activate(item.id)">Use</button>
        </view>
      </view>
      <view v-if="targets.targets.length === 0" class="muted">暂无远程目标。</view>
    </view>

    <view class="section col">
      <view class="row" style="justify-content: space-between;">
        <view class="title">本机服务</view>
        <button class="btn" size="mini" @click="loadDesktopServices">刷新</button>
      </view>
      <view v-if="serviceLoading" class="muted">正在读取 Desktop 服务...</view>
      <view v-else-if="serviceError" class="error">{{ serviceError }}</view>
      <view v-else-if="serviceEntries.length === 0" class="muted">
        暂无可用的 MCode Desktop 本机服务。
      </view>
      <view v-for="service in serviceEntries" :key="`${service.protocol}:${service.port}`" class="service-card">
        <view class="row" style="justify-content: space-between;">
          <text class="service-name">{{ service.name }}</text>
          <text class="muted">{{ service.protocol.toUpperCase() }}</text>
        </view>
        <text class="muted">{{ service.bind }}</text>
        <text v-if="!service.enabled" class="error">{{ service.reason || "服务不可用" }}</text>
        <view class="row" v-if="service.protocol === 'http'">
          <button class="btn" :disabled="!service.enabled" @click="openHttpService(service.url)">
            打开
          </button>
        </view>
        <text v-else class="muted">TCP 服务已发现，通用 TCP 客户端入口将在后续版本提供。</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue"
import { useTargetsStore } from "@/stores/targets"
import { createGateway } from "@/services/gateway"
import { readStoredConnections, resolveConnectionContext } from "@/services/connectionContext"
import type { ConnectionContext } from "@/services/connectionContext"
import { buildDesktopServiceEntries, type DesktopDiscoveredServiceEntry } from "@/agents/mcode-desktop/serviceDiscovery"

const targets = useTargetsStore()
const serviceEntries = ref<DesktopDiscoveredServiceEntry[]>([])
const serviceLoading = ref(false)
const serviceError = ref("")

function activate(targetId: string) {
  targets.setActiveTarget(targetId)
}

async function loadDesktopServices() {
  serviceLoading.value = true
  serviceError.value = ""
  try {
    const connection = findDesktopGatewayConnection()
    if (!connection) {
      serviceEntries.value = []
      serviceError.value = "请先添加并配对 MCode Desktop 网关连接。"
      return
    }
    const resolved = await resolveConnectionContext(connection)
    const gateway = createGateway({
      mode: "relay",
      relayUrl: resolved.connection.gatewayBaseUrl,
      session: resolved.connection.gatewaySession,
    })
    const services = gateway.listTargetServices ? await gateway.listTargetServices() : []
    serviceEntries.value = buildDesktopServiceEntries(resolved.connection, services)
  } catch (error) {
    serviceEntries.value = []
    serviceError.value = error instanceof Error ? error.message : String(error)
  } finally {
    serviceLoading.value = false
  }
}

function findDesktopGatewayConnection(): ConnectionContext | null {
  return (
    readStoredConnections().find(
      (connection) =>
        connection.targetAgent === "mcode-desktop" &&
        connection.routeMode === "gateway" &&
        Boolean(connection.gatewaySession?.accessToken)
    ) || null
  )
}

function openHttpService(url: string) {
  if (!url) return
  // #ifdef H5
  window.open(url, "_blank", "noopener,noreferrer")
  // #endif
  // #ifndef H5
  uni.setClipboardData({
    data: url,
    success: () => uni.showToast({ title: "已复制访问地址", icon: "none" }),
  })
  // #endif
}

onMounted(() => {
  void loadDesktopServices()
})
</script>

<style scoped>
.service-card {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  padding: 20rpx;
  border: 1rpx solid var(--up-border-color, #e5e7eb);
  border-radius: 20rpx;
  background: var(--up-card-bg-color, #fff);
}

.service-name {
  color: var(--up-main-color, #303133);
  font-weight: 600;
}

.error {
  color: #d93025;
  font-size: 24rpx;
}
</style>
