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
        <view class="title">MCode Desktop</view>
        <button class="btn" size="mini" @click="loadDesktopServices">刷新</button>
      </view>
      <view v-if="readinessSummary" :class="['readiness-card', `readiness-card--${readinessSummary.level}`]">
        <view class="row" style="justify-content: space-between;">
          <text class="readiness-title">{{ readinessSummary.title }}</text>
          <text class="readiness-level">{{ readinessSummary.level.toUpperCase() }}</text>
        </view>
        <text class="muted">{{ readinessSummary.description }}</text>
        <view class="readiness-grid">
          <view class="readiness-stat">
            <text class="muted">Desktop</text>
            <text>{{ readinessSummary.displayName || "未识别" }}</text>
          </view>
          <view class="readiness-stat">
            <text class="muted">Target</text>
            <text>{{ readinessSummary.targetId || "-" }}</text>
          </view>
          <view class="readiness-stat">
            <text class="muted">服务</text>
            <text>{{ readinessSummary.serviceCounts.enabled }}/{{ readinessSummary.serviceCounts.total }}</text>
          </view>
          <view class="readiness-stat">
            <text class="muted">协议</text>
            <text>{{ readinessSummary.protocolVersion || "-" }}</text>
          </view>
        </view>
        <view class="chip-row">
          <text
            v-for="capability in readinessSummary.capabilities"
            :key="capability.id"
            :class="['capability-chip', capability.available ? 'capability-chip--on' : 'capability-chip--off']"
          >
            {{ capability.label }}
          </text>
        </view>
        <view v-if="readinessSummary.diagnostics.length > 0" class="diagnostics">
          <text
            v-for="diagnostic in readinessSummary.diagnostics"
            :key="diagnostic.code"
            :class="['diagnostic', `diagnostic--${diagnostic.level}`]"
          >
            {{ diagnostic.message }}
          </text>
        </view>
        <view class="row">
          <button class="btn" size="mini" @click="openConnectionsPage">
            {{ desktopConnection ? "管理连接" : "添加 Desktop 连接" }}
          </button>
          <button class="btn" size="mini" @click="copyDesktopDiagnostics">复制诊断</button>
        </view>
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
import {
  buildDesktopReadinessDiagnosticText,
  buildDesktopReadinessSummary,
  type DesktopReadinessSummary,
} from "@/agents/mcode-desktop/readiness"

const targets = useTargetsStore()
const serviceEntries = ref<DesktopDiscoveredServiceEntry[]>([])
const serviceLoading = ref(false)
const serviceError = ref("")
const desktopConnection = ref<ConnectionContext | null>(null)
const readinessSummary = ref<DesktopReadinessSummary | null>(null)

function activate(targetId: string) {
  targets.setActiveTarget(targetId)
}

async function loadDesktopServices() {
  serviceLoading.value = true
  serviceError.value = ""
  try {
    const connection = findDesktopGatewayConnection()
    desktopConnection.value = connection
    if (!connection) {
      serviceEntries.value = []
      readinessSummary.value = buildDesktopReadinessSummary(null, [])
      serviceError.value = "请先添加并配对 MCode Desktop 网关连接。"
      return
    }
    if (!connection.gatewaySession?.accessToken) {
      serviceEntries.value = []
      readinessSummary.value = buildDesktopReadinessSummary(connection, [])
      serviceError.value = "MCode Desktop 网关连接尚未完成配对。"
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
    desktopConnection.value = resolved.connection
    readinessSummary.value = buildDesktopReadinessSummary(resolved.connection, serviceEntries.value)
  } catch (error) {
    serviceEntries.value = []
    readinessSummary.value = buildDesktopReadinessSummary(desktopConnection.value, [])
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
        connection.routeMode === "gateway"
    ) || null
  )
}

function openConnectionsPage() {
  uni.switchTab({ url: "/pages/connections/index" })
}

function copyDesktopDiagnostics() {
  const summary = readinessSummary.value || buildDesktopReadinessSummary(desktopConnection.value, serviceEntries.value)
  uni.setClipboardData({
    data: buildDesktopReadinessDiagnosticText(summary),
    success: () => uni.showToast({ title: "已复制诊断信息", icon: "none" }),
  })
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

.readiness-card {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  padding: 24rpx;
  border: 1rpx solid var(--up-border-color, #e5e7eb);
  border-radius: 24rpx;
  background: var(--up-card-bg-color, #fff);
}

.readiness-card--ready {
  border-color: #16a34a;
}

.readiness-card--warning {
  border-color: #f59e0b;
}

.readiness-card--error {
  border-color: #d93025;
}

.readiness-title {
  color: var(--up-main-color, #303133);
  font-weight: 700;
}

.readiness-level {
  color: var(--up-tips-color, #909399);
  font-size: 22rpx;
  letter-spacing: 0.08em;
}

.readiness-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12rpx;
}

.readiness-stat {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  padding: 16rpx;
  border-radius: 16rpx;
  background: var(--up-page-bg-color, #f5f7fa);
  color: var(--up-main-color, #303133);
}

.chip-row,
.diagnostics {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
}

.capability-chip,
.diagnostic {
  padding: 8rpx 12rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
}

.capability-chip--on {
  color: #166534;
  background: #dcfce7;
}

.capability-chip--off {
  color: var(--up-tips-color, #909399);
  background: var(--up-page-bg-color, #f5f7fa);
}

.diagnostic--warning {
  color: #92400e;
  background: #fef3c7;
}

.diagnostic--error {
  color: #991b1b;
  background: #fee2e2;
}

.diagnostic--ok {
  color: #166534;
  background: #dcfce7;
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
