<template>
  <view class="page connection-detail-page" :style="[upThemeVars, upThemePageStyle]">
    <view class="connection-detail-shell">
      <view class="connection-detail-header" :style="upThemeCardStyle">
        <view class="connection-detail-header__main">
          <text class="connection-detail-header__eyebrow">CONNECTION</text>
          <text class="connection-detail-header__title">{{ connectionTitle }}</text>
          <text class="connection-detail-header__meta">{{ connectionMeta }}</text>
          <text class="connection-detail-header__endpoint">{{ connectionEndpoint }}</text>
        </view>
        <view class="connection-detail-header__side">
          <view class="connection-detail-header__status">
            <text class="connection-detail-header__status-text">{{ connectionStatus }}</text>
          </view>
          <view v-if="capabilityChips.length" class="connection-detail-header__chips">
            <text
              v-for="chip in capabilityChips"
              :key="chip"
              class="connection-detail-header__chip"
            >
              {{ chip }}
            </text>
          </view>
        </view>
      </view>

      <view class="connection-detail-tabs" :style="upThemeCardStyle">
        <view
          v-for="tab in tabs"
          :key="tab.key"
          class="connection-detail-tabs__item"
          :class="{ 'connection-detail-tabs__item--active': activeTab === tab.key }"
          @click="setActiveTab(tab.key)"
        >
          <text>{{ tab.label }}</text>
        </view>
      </view>

      <view v-if="!connection" class="connection-detail-empty" :style="upThemeCardStyle">
        <text class="connection-detail-empty__title">未找到连接</text>
        <text class="connection-detail-empty__desc">请返回连接列表重新选择。</text>
      </view>

      <ProjectFolderList
        v-else-if="activeTab === 'folders'"
        :connection="connection"
        embedded
        @resolved="handleResolvedConnection"
      />
      <ConnectionSettingsTab
        v-else-if="activeTab === 'settings'"
        :connection="connection"
      />
      <ConnectionInfoTab
        v-else-if="activeTab === 'info'"
        :connection="connection"
      />
      <ConnectionConfigCodeTab
        v-else
        :connection="connection"
      />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, ref } from "vue"
import { onLoad } from "@dcloudio/uni-app"
import ProjectFolderList from "@/components/projects/ProjectFolderList.vue"
import ConnectionSettingsTab from "./components/ConnectionSettingsTab.vue"
import ConnectionInfoTab from "./components/ConnectionInfoTab.vue"
import ConnectionConfigCodeTab from "./components/ConnectionConfigCodeTab.vue"
import {
  getConnectionCapabilityChips,
  getConnectionSubtitle,
} from "@/pages/connections/connectionPresentation"
import {
  decodeConnectionContext,
  findStoredConnectionById,
  type ConnectionContext,
} from "@/services/connectionContext"
import {
  getConnectionEndpointLabel,
  normalizeConnectionDetailTab,
  type ConnectionDetailTab,
} from "@/services/connectionDetail"

const currentInstance = getCurrentInstance()
const upThemeVars = computed(() => currentInstance?.proxy?.upThemeVars || {})
const upThemePageStyle = computed(() => currentInstance?.proxy?.upThemePageStyle || {})
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})

const connection = ref<ConnectionContext | null>(null)
const activeTab = ref<ConnectionDetailTab>("folders")
const tabs = [
  { key: "folders", label: "文件夹" },
  { key: "settings", label: "设置" },
  { key: "info", label: "连接信息" },
  { key: "config", label: "配置码" },
] as const

const connectionTitle = computed(() => connection.value?.name || "连接详情")
const connectionMeta = computed(() =>
  connection.value ? getConnectionSubtitle(connection.value) : "未加载连接"
)
const connectionEndpoint = computed(() =>
  connection.value ? getConnectionEndpointLabel(connection.value) || "未配置地址" : "未找到连接"
)
const connectionStatus = computed(() => {
  if (!connection.value) return "未连接"
  const profile = connection.value.targetProfile || connection.value.gatewaySession
  return profile?.protocolVersion ? `协议 ${profile.protocolVersion}` : "本地保存"
})
const capabilityChips = computed(() => (connection.value ? getConnectionCapabilityChips(connection.value) : []))

onLoad((options) => {
  activeTab.value = normalizeConnectionDetailTab(options?.tab)
  connection.value =
    findStoredConnectionById(String(options?.connectionId || "")) ||
    decodeConnectionContext(options?.connection as string)
})

function setActiveTab(tab: ConnectionDetailTab) {
  activeTab.value = tab
}

function handleResolvedConnection(next: ConnectionContext) {
  connection.value = next
}
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
}

.connection-detail-page {
  background: var(--up-page-bg-color, var(--up-bg-color, #f3f4f6));
}

.connection-detail-shell {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
  padding: 24rpx 24rpx 40rpx;
}

.connection-detail-header,
.connection-detail-tabs,
.connection-detail-empty {
  border-radius: 30rpx;
  background: var(--up-card-bg-color, #ffffff);
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.connection-detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24rpx;
  padding: 30rpx;
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--up-primary, #2979ff) 12%, var(--up-card-bg-color, #ffffff) 88%),
      var(--up-card-bg-color, #ffffff)
    );
}

.connection-detail-header__main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.connection-detail-header__eyebrow {
  font-size: 20rpx;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--up-primary, #2979ff);
}

.connection-detail-header__title {
  font-size: 36rpx;
  line-height: 1.2;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.connection-detail-header__meta,
.connection-detail-header__endpoint,
.connection-detail-empty__desc {
  font-size: 24rpx;
  line-height: 1.55;
  color: var(--up-content-color, #606266);
  word-break: break-all;
}

.connection-detail-header__side {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12rpx;
}

.connection-detail-header__status {
  padding: 10rpx 16rpx;
  border-radius: 999rpx;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 12%, var(--up-card-bg-color, #ffffff) 88%);
}

.connection-detail-header__status-text {
  font-size: 22rpx;
  font-weight: 700;
  color: var(--up-primary, #2979ff);
}

.connection-detail-header__chips {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8rpx;
  max-width: 300rpx;
}

.connection-detail-header__chip {
  padding: 8rpx 12rpx;
  border-radius: 999rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  color: var(--up-content-color, #606266);
  font-size: 20rpx;
  font-weight: 600;
}

.connection-detail-tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8rpx;
  padding: 8rpx;
}

.connection-detail-tabs__item {
  min-height: 68rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 22rpx;
  color: var(--up-content-color, #606266);
  font-size: 24rpx;
  font-weight: 600;
}

.connection-detail-tabs__item--active {
  background: var(--up-primary, #2979ff);
  color: #ffffff;
}

.connection-detail-empty {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  padding: 44rpx 30rpx;
}

.connection-detail-empty__title {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

@media (max-width: 420px) {
  .connection-detail-header {
    flex-direction: column;
  }

  .connection-detail-header__side {
    align-items: flex-start;
  }

  .connection-detail-tabs {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
