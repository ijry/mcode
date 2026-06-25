<template>
  <view class="page connections-page" :style="[upThemeVars, upThemePageStyle]">
    <view class="connections-shell">
      <view class="connections-topbar">
        <view class="connections-brand">
          <text class="connections-brand__mark">MCode</text>
          <text class="connections-brand__title">随时随地控 AI</text>
          <text class="connections-brand__subtitle">手机远程接入电脑端的 Claude/Codex/Gemini 等AI</text>
        </view>

        <view class="connections-topbar__action" @click="openAddPopup()">
          <u-icon name="plus" size="16" color="#ffffff"></u-icon>
          <text class="connections-topbar__action-text">新增连接</text>
        </view>
      </view>

      <view class="connections-hero" :style="upThemeCardStyle">
        <view class="connections-hero__copy">
          <text class="connections-hero__eyebrow">REMOTE CONTROL</text>
          <text class="connections-hero__title">远程Vibe，回桌位无缝接续</text>
          <text class="connections-hero__desc">手机与电脑双向同步，随时接管你的电脑 AI。</text>

          <view class="connections-hero__chips">
            <text class="connections-hero__chip">远程控制</text>
            <text class="connections-hero__chip connections-hero__chip--ghost">双向同步</text>
            <text class="connections-hero__chip connections-hero__chip--ghost">无缝切换</text>
          </view>
        </view>

        <image
          class="connections-hero__art"
          src="/static/illustrations/connection-ai-coding-hero.svg"
          mode="widthFix"
        />
      </view>

      <view v-if="connections.length === 0" class="connections-empty" :style="upThemeCardStyle">
        <view class="connections-empty__icon">
          <u-icon name="plus" size="28" color="#007aff"></u-icon>
        </view>

        <text class="connections-empty__title">先连接电脑</text>
        <text class="connections-empty__desc">连接后即可随时接管电脑 AI，回工位也能继续。</text>

        <view class="connections-empty__actions">
          <view class="connections-empty__primary" @click="openAddPopup()">
            <text>立即添加</text>
          </view>
          <view class="connections-empty__secondary" @click="openTutorialPopup">
            <text>查看教程</text>
          </view>
        </view>
      </view>

      <view v-else class="connections-stack">
        <view
          v-for="(conn, index) in connections"
          :key="index"
          class="connection-card"
          :class="getConnectionCardClass(conn)"
          :style="upThemeCardStyle"
          @click="activateConnection(conn)"
        >
          <view
            class="connection-card__icon"
            :class="getConnectionIconClass(conn)"
          >
            <u-icon
              :name="conn.routeMode === 'direct' ? 'wifi' : 'cloud'"
              size="24"
              :color="getConnectionIconColor(conn)"
            ></u-icon>
          </view>

          <view class="connection-card__body">
            <view class="connection-card__head">
              <text class="connection-card__name">{{ conn.name }}</text>
              <view
                class="connection-card__status"
                :class="getConnectionStatusClass(conn)"
              >
                <text class="connection-card__status-text">
                  {{ getConnectionBadgeText(conn) }}
                </text>
              </view>
              <view class="connection-card__menu" @click.stop="showConnectionMenu(conn, index)">
                <u-icon name="more-dot-fill" size="18" color="#c7c7cc"></u-icon>
              </view>
            </view>

            <text class="connection-card__meta">
              {{ getConnectionSubtitle(conn) }}
            </text>

            <view v-if="getConnectionCapabilityChips(conn).length" class="connection-card__chips">
              <text
                v-for="chip in getConnectionCapabilityChips(conn)"
                :key="chip"
                class="connection-card__chip"
              >
                {{ chip }}
              </text>
            </view>

            <text
              v-if="getConnectionHealthDetail(conn)"
              class="connection-card__health-detail"
            >
              {{ getConnectionHealthDetail(conn) }}
            </text>

            <view class="connection-card__footer">
              <view class="connection-card__footer-main" @click.stop="activateConnection(conn)">
                <text class="connection-card__footer-link">{{ getConnectionPrimaryActionText(conn) }}</text>
                <u-icon name="arrow-right" size="14" color="#007aff"></u-icon>
              </view>

              <view
                v-if="shouldShowConnectionRetry(conn)"
                class="connection-card__quick-action"
                @click.stop="retryConnection(conn)"
              >
                <text>立即重试</text>
              </view>

              <view
                v-if="shouldShowConnectionHelp(conn)"
                class="connection-card__quick-action connection-card__quick-action--ghost"
                @click.stop="showConnectionTroubleshooting(conn)"
              >
                <text>排查建议</text>
              </view>
            </view>
          </view>
        </view>

        <view class="connections-add-card" :style="upThemeCardStyle" @click="openAddPopup()">
          <view class="connections-add-card__icon">
            <u-icon name="plus" size="24" color="#007aff"></u-icon>
          </view>

          <view class="connections-add-card__body">
            <text class="connections-add-card__title">添加新设备</text>
            <text class="connections-add-card__desc">手机实时接入电脑 AI</text>
          </view>

          <u-icon name="arrow-right" size="14" color="#c7c7cc"></u-icon>
        </view>

        <view class="connections-guide-card" :style="upThemeCardStyle" @click="openTutorialPopup">
          <view class="connections-guide-card__copy">
            <text class="connections-guide-card__eyebrow">SETUP GUIDE</text>
            <text class="connections-guide-card__title">先完成部署</text>
            <text class="connections-guide-card__desc">完成电脑端配置后即可双向同步。</text>
          </view>

          <view class="connections-guide-card__action">
            <text>查看教程</text>
            <u-icon name="arrow-right" size="14" color="#ffffff"></u-icon>
          </view>
        </view>
      </view>
    </view>

    <!-- 连接操作菜单 -->
    <u-action-sheet
      :show="showActionSheet"
      :actions="connectionActions"
      @select="handleActionSelect"
      @close="showActionSheet = false"
    ></u-action-sheet>

    <u-popup v-model:show="showConfigCodePopup" mode="center" :round="24">
      <view class="connections-config-code" :style="upThemeCardStyle">
        <view class="connections-config-code__header">
          <view class="connections-config-code__heading">
            <text class="connections-config-code__title">手表配置码</text>
            <text class="connections-config-code__subtitle">
              在 Wear OS 版中扫码或粘贴配置码即可导入连接。
            </text>
          </view>
          <u-icon name="close" size="22" @click="closeConfigCodePopup"></u-icon>
        </view>

        <view class="connections-config-code__connection">
          <text class="connections-config-code__name">{{ configCodeConnectionName }}</text>
          <text class="connections-config-code__meta">{{ configCodeConnectionMeta }}</text>
        </view>

        <view v-if="configCodeValue" class="connections-config-code__qr">
          <up-qrcode
            cid="mcode-watch-config-qrcode"
            :val="configCodeValue"
            :size="220"
            :quiet-zone="8"
            foreground="#111827"
            background="#ffffff"
          ></up-qrcode>
        </view>

        <view class="connections-config-code__text">
          <text>{{ configCodeValue }}</text>
        </view>

        <view class="connections-config-code__actions">
          <u-button type="primary" block @click="copyConfigCode">复制配置码</u-button>
        </view>
      </view>
    </u-popup>

    <u-popup :show="showAddPopup" mode="bottom" :round="28" @close="closeAddPopup">
      <view class="connections-sheet" :style="upThemeCardStyle">
        <view class="connections-sheet__handle"></view>

        <view class="connections-sheet__header">
          <view class="connections-sheet__heading">
            <text class="connections-sheet__title">{{ popupTitle }}</text>
            <text class="connections-sheet__subtitle">保存后即可远程控制与实时同步。</text>
          </view>
          <u-icon name="close" size="22" @click="closeAddPopup()"></u-icon>
        </view>

        <view class="connections-sheet__tutorial" @click="openTutorialPopup">
          <view class="connections-sheet__tutorial-copy">
            <text class="connections-sheet__tutorial-title">部署教程</text>
            <text class="connections-sheet__tutorial-desc">先完成电脑端配置，再接入手机。</text>
          </view>
          <u-icon name="arrow-right" size="16" color="#007aff"></u-icon>
        </view>

        <view class="connections-sheet__tabs">
          <u-subsection
            :list="['手动配置', '扫码连接']"
            :current="subsectionIndex"
            @change="subsectionChange"
            activeColor="#007aff"
          ></u-subsection>
        </view>

        <view v-if="subsectionIndex === 0" class="connections-sheet__form">
          <u-form :model="form" ref="formRef" labelWidth="84">
            <u-form-item label="连接名称" prop="name" required>
              <u-input v-model="form.name" placeholder="请输入连接名称"></u-input>
            </u-form-item>

            <u-form-item label="连接方式" prop="routeMode" required>
              <u-radio-group :modelValue="form.routeMode" placement="row" @change="handleRouteModeChange">
                <u-radio name="direct" label="直连"></u-radio>
                <u-radio name="gateway" label="中转（网关）"></u-radio>
              </u-radio-group>
            </u-form-item>

            <view v-if="form.routeMode === 'direct'">
              <u-form-item label="目标类型" prop="targetAgent" required>
                <u-subsection
                  :list="directTargetLabels"
                  :current="directTargetIndex"
                  @change="handleDirectTargetChange"
                  activeColor="#007aff"
                ></u-subsection>
              </u-form-item>
              <u-form-item label="服务地址" prop="directBaseUrl" required>
                <u-input
                  v-model="form.directBaseUrl"
                  placeholder="http://127.0.0.1:3089"
                ></u-input>
              </u-form-item>
              <u-form-item label="访问令牌" prop="directToken" required>
                <u-input
                  v-model="form.directToken"
                  type="password"
                  placeholder="请输入访问令牌"
                ></u-input>
              </u-form-item>
            </view>

            <view v-else>
              <u-form-item label="通道服务商" prop="gatewayProvider" required>
                <u-select
                  :options="gatewayProviderOptions"
                  keyName="value"
                  labelName="label"
                  :current="form.gatewayProvider"
                  label="请选择服务商"
                  :showOptionsLabel="true"
                  :border="true"
                  optionsWidth="320rpx"
                  @select="handleGatewayProviderSelect"
                ></u-select>
              </u-form-item>
              <u-form-item v-if="form.gatewayProvider === 'custom'" label="自定义域名" prop="gatewayBaseUrl" required>
                <u-input
                  v-model="form.gatewayBaseUrl"
                  placeholder="https://relay.example.com"
                ></u-input>
              </u-form-item>
              <u-form-item label="配对代码" prop="pairCode" required>
                <u-input v-model="form.pairCode" placeholder="请输入配对代码"></u-input>
              </u-form-item>
              <u-form-item label="配对密钥" prop="pairSecret" required>
                <u-input
                  v-model="form.pairSecret"
                  type="password"
                  placeholder="请输入配对密钥"
                ></u-input>
              </u-form-item>
              <text class="connections-sheet__tip">
                网关入口当前默认连接 MCode Desktop，由 desktop 代理 Codex CLI、Claude CLI 与内网穿透能力。
              </text>
            </view>
          </u-form>

          <view class="connections-sheet__actions">
            <u-button type="primary" @click="submitConnection" :loading="loading" block>
              保存连接
            </u-button>
          </view>
        </view>

        <view v-else class="connections-sheet__scan">
          <view class="connections-sheet__scan-panel">
            <view class="connections-sheet__scan-copy">
              <text class="connections-sheet__scan-title">扫码导入已有连接</text>
              <text class="connections-sheet__scan-desc">
                支持扫描已保存连接的配置码，自动导入直连或网关配置。
              </text>
            </view>

            <u-button type="primary" block :loading="scanImporting" @click="startScanImport">
              扫码导入连接
            </u-button>

            <text class="connections-sheet__tip">
              H5 暂不支持扫码，请使用 App 端。
            </text>
          </view>
        </view>
      </view>
    </u-popup>

    <u-popup v-model:show="showTutorialPopup" mode="center" :round="20">
      <view class="connections-tutorial">
        <view class="connections-tutorial__header">
          <view class="connections-tutorial__heading">
            <text class="connections-tutorial__title">部署教程</text>
            <text class="connections-tutorial__subtitle">3 步打通手机与电脑</text>
          </view>
          <u-icon name="close" size="22" @click="showTutorialPopup = false"></u-icon>
        </view>

        <view class="connections-tutorial__steps">
          <view class="connections-tutorial__step">
            <text class="connections-tutorial__index">1</text>
            <view class="connections-tutorial__body">
              <text class="connections-tutorial__step-title">安装并启动 codeg</text>
              <text class="connections-tutorial__link" @click="openDeploymentGuideLink">
                {{ DEPLOYMENT_GUIDE_URL }}
              </text>
            </view>
          </view>

          <view class="connections-tutorial__step">
            <text class="connections-tutorial__index">2</text>
            <view class="connections-tutorial__body">
              <text class="connections-tutorial__step-title">
                开启 Web 服务，建立双向同步
              </text>
              <text class="connections-tutorial__step-desc">复制地址和 token，手机即可远程控制</text>
            </view>
          </view>

          <view class="connections-tutorial__step">
            <text class="connections-tutorial__index">3</text>
            <view class="connections-tutorial__body">
              <text class="connections-tutorial__step-title">
                回工位后无缝接续
              </text>
              <text class="connections-tutorial__step-desc">需要外网时可配合 ngrok 使用</text>
            </view>
          </view>
        </view>
      </view>
    </u-popup>

    <IosAddToHomePrompt />
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue"
import { onShow } from "@dcloudio/uni-app"
import { createGateway } from "@/services/gateway"
import type { RelaySessionInfo } from "@/services/gateway"
import { buildWebSocketProtocols } from "@/services/gateway/wsProtocol"
import { buildConnectionConfigCode, parseConnectionConfigCodeToConnection } from "./connectionConfigCode"
import {
  encodeConnectionContext,
  readStoredConnections,
  type ConnectionContext,
} from "@/services/connectionContext"
import {
  buildConnectionRecordKey,
  deriveLegacyRouteCompat,
  migrateConnectionRecord,
  normalizeConnectionRecordV2,
  type ConnectionRecordV2,
  type ConnectionGatewayProvider,
  type ConnectionRouteMode,
  type ConnectionTargetAgent,
} from "@/services/connectionSchema"
import {
  getConnectionCapabilityChips,
  getConnectionSubtitle,
} from "./connectionPresentation"
import {
  buildConnectionAgentsRoute,
  buildModelProvidersRoute,
} from "@/services/remoteSettings"
import { openGuardedExternalUrl } from "@/services/externalLinkGuard"

declare const plus: any

const DEPLOYMENT_GUIDE_URL = "https://pan.quark.cn/s/0008015b1d33"
const OFFICIAL_GATEWAY_BASE_URL = normalizeBaseUrl(
  String(import.meta.env.VITE_MCODE_OFFICIAL_GATEWAY_BASE_URL || "")
)
const directTargetOptions = [
  { label: "Codeg", value: "codeg" as ConnectionTargetAgent },
  { label: "OpenCode", value: "opencode" as ConnectionTargetAgent },
  { label: "MCode Desktop", value: "mcode-desktop" as ConnectionTargetAgent },
]
const directTargetLabels = directTargetOptions.map((item) => item.label)
const gatewayProviderOptions = [
  { label: "MCode 官方网关", value: "official" as ConnectionGatewayProvider },
  { label: "自定义", value: "custom" as ConnectionGatewayProvider },
]

const formRef = ref()
const showAddPopup = ref(false)
const showTutorialPopup = ref(false)
const subsectionIndex = ref(0)
const loading = ref(false)
const scanImporting = ref(false)
let scanReturnFallbackTimer: ReturnType<typeof setTimeout> | null = null
const showActionSheet = ref(false)
const showConfigCodePopup = ref(false)
const currentConnectionIndex = ref(-1)
const editingConnectionKey = ref("")
const configCodeValue = ref("")
const configCodeConnectionName = ref("")
const configCodeConnectionMeta = ref("")
const connectedMap = ref<Record<string, boolean>>({})
const onlineMap = ref<Record<string, boolean>>({})
type ConnectionHealthState = "idle" | "online" | "reconnecting" | "error"
interface ConnectionHealth {
  state: ConnectionHealthState
  message?: string
  attempt?: number
  lastFailedAt?: number
  nextRetryAt?: number
}
const connectionHealthMap = ref<Record<string, ConnectionHealth>>({})
type StatusSocket = Pick<UniApp.SocketTask, "onOpen" | "onClose" | "onError" | "close">
const statusSocketMap = new Map<string, StatusSocket>()
const reconnectTimerMap = new Map<string, ReturnType<typeof setTimeout>>()
const stoppedWatcherKeys = new Set<string>()
const NETWORK_FAILURE_HINT = "请检查主机网络可达性、内网穿透地址稳定性，以及电脑端 Web 服务是否开启。"
const CONNECTION_RETRY_DELAY_MS = 3000

type ConnectionItem = ConnectionContext

const form = ref({
  name: "",
  routeMode: "direct" as ConnectionRouteMode,
  targetAgent: "codeg" as ConnectionTargetAgent,
  directBaseUrl: "",
  directToken: "",
  gatewayProvider: "official" as ConnectionGatewayProvider,
  gatewayBaseUrl: OFFICIAL_GATEWAY_BASE_URL,
  pairCode: "",
  pairSecret: "",
})

const connections = ref<ConnectionItem[]>([])
const popupTitle = computed(() => (editingConnectionKey.value ? "编辑连接" : "新增连接"))
const directTargetIndex = computed(() => {
  const index = directTargetOptions.findIndex((item) => item.value === form.value.targetAgent)
  return index >= 0 ? index : 0
})

const connectionActions = computed(() => {
  const current = connections.value[currentConnectionIndex.value]
  const isConnected = current ? isConnectionConnected(current) : false
  const isLinked = current ? isConnectionLinked(current) : false
  return [
    { name: "连接", color: "#2979ff", disabled: isConnected },
    { name: "断开连接", color: "#fa8c16", disabled: !isLinked },
    { name: "智能体管理", color: "#2979ff" },
    { name: "模型供应商", color: "#2979ff" },
    { name: "配置码", color: "#8b5cf6" },
    { name: "编辑", color: "#19be6b" },
    { name: "删除", color: "#fa3534" },
  ]
})

function getConnectionHealth(conn: ConnectionItem): ConnectionHealth {
  const key = connectionKey(conn)
  if (!connectedMap.value[key]) return { state: "idle" }
  if (onlineMap.value[key]) return { state: "online" }
  return connectionHealthMap.value[key] || {
    state: "reconnecting",
    message: NETWORK_FAILURE_HINT,
  }
}

function getConnectionBadgeText(conn: ConnectionItem) {
  const health = getConnectionHealth(conn)
  if (health.state === "online") return "在线"
  if (health.state === "reconnecting") return "重连中"
  if (health.state === "error") return "连接异常"
  return "未连接"
}

function getConnectionHealthDetail(conn: ConnectionItem) {
  const health = getConnectionHealth(conn)
  if (health.state === "online" || health.state === "idle") return ""

  const pieces: string[] = []
  if (health.message) {
    pieces.push(health.message)
  } else {
    pieces.push(NETWORK_FAILURE_HINT)
  }
  if (health.state === "reconnecting") {
    if (health.attempt) pieces.push(`正在第 ${health.attempt} 次重试`)
    if (health.nextRetryAt && health.nextRetryAt > Date.now()) {
      pieces.push(`${Math.ceil((health.nextRetryAt - Date.now()) / 1000)} 秒后自动重试`)
    }
  }
  return pieces.join(" · ")
}

function getConnectionPrimaryActionText(conn: ConnectionItem) {
  const health = getConnectionHealth(conn)
  if (health.state === "online") return "项目列表"
  if (health.state === "idle") return "连接并打开"
  return "尝试打开"
}

function shouldShowConnectionRetry(conn: ConnectionItem) {
  const health = getConnectionHealth(conn)
  return health.state === "reconnecting" || health.state === "error"
}

function shouldShowConnectionHelp(conn: ConnectionItem) {
  return getConnectionHealth(conn).state === "error"
}

function getConnectionCardClass(conn: ConnectionItem) {
  const health = getConnectionHealth(conn)
  return {
    "connection-card--online": health.state === "online",
    "connection-card--reconnecting": health.state === "reconnecting",
    "connection-card--error": health.state === "error",
  }
}

function getConnectionIconClass(conn: ConnectionItem) {
  const health = getConnectionHealth(conn)
  return {
    "connection-card__icon--online": health.state === "online",
    "connection-card__icon--reconnecting": health.state === "reconnecting",
    "connection-card__icon--error": health.state === "error",
  }
}

function getConnectionStatusClass(conn: ConnectionItem) {
  const health = getConnectionHealth(conn)
  return {
    "connection-card__status--online": health.state === "online",
    "connection-card__status--reconnecting": health.state === "reconnecting",
    "connection-card__status--error": health.state === "error",
  }
}

function getConnectionIconColor(conn: ConnectionItem) {
  const health = getConnectionHealth(conn)
  if (health.state === "online") return "#007aff"
  if (health.state === "reconnecting") return "#fa8c16"
  if (health.state === "error") return "#fa3534"
  return "#8e8e93"
}

onMounted(() => {
  connectedMap.value = uni.getStorageSync("mcode_connected_map") || {}
  loadConnections()
})

onUnmounted(() => {
  if (scanReturnFallbackTimer) {
    clearTimeout(scanReturnFallbackTimer)
    scanReturnFallbackTimer = null
  }
  cleanupOnlineWatchers()
})

function loadConnections() {
  connections.value = readStoredConnections()
  pruneConnectedMapByConnections()
  syncOnlineWatchers()
  void refreshOnlineStatus()
}

function subsectionChange(index: number) {
  subsectionIndex.value = index
}

function handleRouteModeChange(value: string) {
  form.value.routeMode = value === "gateway" ? "gateway" : "direct"
  if (form.value.routeMode === "gateway") {
    form.value.targetAgent = "mcode-desktop"
    if (form.value.gatewayProvider === "official") {
      form.value.gatewayBaseUrl = OFFICIAL_GATEWAY_BASE_URL
    }
  }
}

function handleDirectTargetChange(index: number) {
  form.value.targetAgent = directTargetOptions[index]?.value || "codeg"
}

function handleGatewayProviderSelect(item: { value?: ConnectionGatewayProvider }) {
  form.value.gatewayProvider = item.value === "custom" ? "custom" : "official"
  if (form.value.gatewayProvider === "official") {
    form.value.gatewayBaseUrl = OFFICIAL_GATEWAY_BASE_URL
  }
}

function openTutorialPopup() {
  showTutorialPopup.value = true
}

async function openDeploymentGuideLink() {
  const result = await openGuardedExternalUrl(DEPLOYMENT_GUIDE_URL)
  if (result !== "unsupported") return
  uni.showToast({
    title: "打开链接失败，请手动访问",
    icon: "none",
    duration: 2500,
  })
}

async function submitConnection() {
  if (!form.value.name) {
    uni.showToast({ title: "请输入连接名称", icon: "none" })
    return
  }

  loading.value = true

  try {
    const previousKey = editingConnectionKey.value
    if (form.value.routeMode === "direct") {
      if (!form.value.directBaseUrl || !form.value.directToken) {
        uni.showToast({ title: "请填写完整信息", icon: "none" })
        return
      }

      const gateway = createGateway({
        mode: "direct",
        directBaseUrl: form.value.directBaseUrl,
      })

      await gateway.pair({
        directBaseUrl: form.value.directBaseUrl,
        token: form.value.directToken,
      })

      const newConnection = buildConnectionItem({
        version: 2,
        name: form.value.name,
        targetAgent: form.value.targetAgent,
        routeMode: "direct",
        directBaseUrl: normalizeBaseUrl(form.value.directBaseUrl),
        directToken: form.value.directToken,
      })

      await assertConnectionReachable(newConnection)
      saveConnection(newConnection, previousKey || undefined)
      syncConnectionRuntimeState(previousKey, newConnection)
      uni.showToast({ title: "连接成功", icon: "success" })
    } else {
      const gatewayBaseUrl = getFormGatewayBaseUrl()
      if (!gatewayBaseUrl) {
        uni.showToast({
          title: form.value.gatewayProvider === "official" ? "官方网关地址未配置" : "请填写自定义域名",
          icon: "none",
        })
        return
      }
      if (!form.value.pairCode || !form.value.pairSecret) {
        uni.showToast({ title: "请填写完整信息", icon: "none" })
        return
      }

      const gateway = createGateway({
        mode: "relay",
        relayUrl: gatewayBaseUrl,
        session: { accessToken: "" },
      })

      const session = await gateway.pair({
        relayUrl: gatewayBaseUrl,
        code: form.value.pairCode,
        secret: form.value.pairSecret,
      })

      if (!session) {
        throw new Error("配对失败：未获取到网关会话")
      }

      const newConnection = buildConnectionItem({
        version: 2,
        name: form.value.name,
        targetAgent: "mcode-desktop",
        routeMode: "gateway",
        gatewayProvider: form.value.gatewayProvider,
        gatewayBaseUrl,
        pairCode: form.value.pairCode,
        pairSecret: form.value.pairSecret,
        gatewaySession: session,
      })

      await assertConnectionReachable(newConnection)
      saveConnection(newConnection, previousKey || undefined)
      syncConnectionRuntimeState(previousKey, newConnection)
      uni.showToast({ title: "配对成功", icon: "success" })
    }

    closeAddPopup()
    loadConnections()
  } catch (error) {
    uni.showToast({ title: formatConnectionFailureToast(error), icon: "none", duration: 4500 })
  } finally {
    loading.value = false
  }
}

function saveConnection(conn: ConnectionItem, originalKey?: string) {
  const savedConnections = readStoredConnections()

  const existingIndex = originalKey
    ? savedConnections.findIndex((c: ConnectionItem) => connectionKey(c) === originalKey)
    : savedConnections.findIndex((c: ConnectionItem) => connectionKey(c) === connectionKey(conn))

  if (existingIndex >= 0) {
    savedConnections[existingIndex] = conn
  } else {
    savedConnections.push(conn)
  }

  uni.setStorageSync("mcode_connections", savedConnections)
}

function showConnectionMenu(conn: ConnectionItem, index: number) {
  currentConnectionIndex.value = index
  showActionSheet.value = true
}

function openAddPopup() {
  resetForm()
  subsectionIndex.value = 0
  showAddPopup.value = true
}

function closeAddPopup() {
  showAddPopup.value = false
  resetForm()
}

function syncConnectionRuntimeState(previousKey: string, conn: ConnectionItem) {
  const nextKey = connectionKey(conn)
  const wasConnected = previousKey ? Boolean(connectedMap.value[previousKey]) : false

  if (previousKey && previousKey !== nextKey) {
    const nextConnected = { ...connectedMap.value }
    delete nextConnected[previousKey]
    if (wasConnected) {
      nextConnected[nextKey] = true
    }
    connectedMap.value = nextConnected

    stopOnlineWatcher(previousKey)
    clearReconnectTimer(previousKey)

    const nextOnline = { ...onlineMap.value }
    delete nextOnline[previousKey]
    onlineMap.value = nextOnline
    clearConnectionRuntimeHealth(previousKey)
  }

  setConnectionConnected(conn, true)
  clearConnectionHealth(nextKey)
  persistConnectedMap()
  syncOnlineWatchers()
  void refreshOnlineStatus()
}

function handleActionSelect(e: any) {
  const action = resolveActionName(e)
  const conn = connections.value[currentConnectionIndex.value]

  if (!conn || !action) return

  if (action === "连接") {
    if (isConnectionConnected(conn)) {
      uni.showToast({ title: "该连接已在线", icon: "none" })
      showActionSheet.value = false
      return
    }
    connectConnection(conn)
  } else if (action === "断开连接") {
    disconnectConnection(conn)
  } else if (action === "智能体管理") {
    openConnectionAgents(conn)
  } else if (action === "模型供应商") {
    openModelProviders(conn)
  } else if (action === "配置码") {
    openConfigCodePopup(conn)
  } else if (action === "编辑") {
    editConnection(conn, currentConnectionIndex.value)
  } else if (action === "删除") {
    deleteConnection(currentConnectionIndex.value)
  }

  showActionSheet.value = false
}

function openConfigCodePopup(conn: ConnectionItem) {
  try {
    const code = buildConnectionConfigCode(conn)
    configCodeValue.value = code
    configCodeConnectionName.value = conn.name
    configCodeConnectionMeta.value = getConnectionSubtitle(conn)
    showConfigCodePopup.value = true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    uni.showToast({
      title: message || "配置码生成失败",
      icon: "none",
      duration: 2500,
    })
  }
}

function closeConfigCodePopup() {
  showConfigCodePopup.value = false
  configCodeValue.value = ""
  configCodeConnectionName.value = ""
  configCodeConnectionMeta.value = ""
}

function copyConfigCode() {
  if (!configCodeValue.value) return
  uni.setClipboardData({
    data: configCodeValue.value,
    success: () => {
      uni.showToast({ title: "已复制配置码", icon: "success" })
    },
    fail: () => {
      uni.showToast({ title: "复制失败", icon: "none" })
    },
  })
}

function openConnectionAgents(conn: ConnectionItem) {
  uni.navigateTo({
    url: buildConnectionAgentsRoute({
      encodedConnection: encodeConnectionForRoute(conn),
    }),
  })
}

function openModelProviders(conn: ConnectionItem) {
  uni.navigateTo({
    url: buildModelProvidersRoute({
      encodedConnection: encodeConnectionForRoute(conn),
    }),
  })
}

function encodeConnectionForRoute(conn: ConnectionItem) {
  return encodeConnectionContext(conn)
}

async function activateConnection(conn: ConnectionItem) {
  if (!isConnectionLinked(conn)) {
    const connected = await connectConnection(conn)
    if (!connected) return
  } else if (!isConnectionConnected(conn)) {
    promptUnstableConnection(conn)
    return
  }
  openProjectList(conn)
}

function openProjectList(conn: ConnectionItem) {
  const encodedConnection = encodeConnectionContext(conn)
  uni.navigateTo({
    url: `/pages/projects/index?connection=${encodedConnection}`,
  })
}

async function connectConnection(conn: ConnectionItem): Promise<boolean> {
  const key = connectionKey(conn)
  setConnectionHealth(key, {
    state: "reconnecting",
    message: "正在尝试连接主机。",
    attempt: 1,
  })
  try {
    if (conn.mode === "direct") {
      if (!conn.directToken) {
        uni.showToast({ title: "连接信息不完整", icon: "none" })
        markConnectionFailure(key, "连接信息不完整", "error")
        return false
      }

      const gateway = createGateway({
        mode: "direct",
        directBaseUrl: conn.url,
      })

      await gateway.pair({
        directBaseUrl: conn.url,
        token: conn.directToken,
      })
      await assertConnectionReachable(conn)

    } else {
      const session = await ensureRelaySession(conn)
      if (!session?.accessToken) {
        uni.showToast({ title: "连接信息不完整", icon: "none" })
        markConnectionFailure(key, "连接信息不完整", "error")
        return false
      }
      await assertConnectionReachable(conn)
    }

    setConnectionConnected(conn, true)
    markConnectionOnline(key)
    persistConnectedMap()
    syncOnlineWatchers()
    void refreshOnlineStatus()
    uni.showToast({ title: "连接成功", icon: "success" })
    loadConnections()
    return true
  } catch (error) {
    markConnectionFailure(key, error, "error")
    uni.showToast({ title: formatConnectionFailureToast(error), icon: "none", duration: 4500 })
    return false
  }
}

async function retryConnection(conn: ConnectionItem) {
  stopOnlineWatcher(connectionKey(conn))
  await connectConnection(conn)
}

function promptUnstableConnection(conn: ConnectionItem) {
  const detail = getConnectionHealthDetail(conn) || NETWORK_FAILURE_HINT
  uni.showModal({
    title: "连接暂不可用",
    content: `${detail}\n\n如果你正在使用内网穿透，请确认公网地址仍可访问且连接稳定。`,
    confirmText: "立即重试",
    cancelText: "继续打开",
    success: (res) => {
      if (res.confirm) {
        void retryConnection(conn)
        return
      }
      if (res.cancel) {
        openProjectList(conn)
      }
    },
  })
}

function showConnectionTroubleshooting(conn: ConnectionItem) {
  const host = normalizeBaseUrl(conn.url)
  uni.showModal({
    title: "连接排查建议",
    content:
      `当前地址：${host}\n\n` +
      "1. 确认电脑端 Web 服务仍在运行。\n" +
      "2. 手机网络可以访问该地址；内网穿透地址没有休眠、过期或切换。\n" +
      "3. 访问 token 未改动，防火墙或代理没有拦截 WebSocket。",
    confirmText: "立即重试",
    cancelText: "知道了",
    success: (res) => {
      if (res.confirm) {
        void retryConnection(conn)
      }
    },
  })
}

function disconnectConnection(conn: ConnectionItem) {
  const key = connectionKey(conn)
  setConnectionConnected(conn, false)
  persistConnectedMap()
  stopOnlineWatcher(key)
  const nextOnline = { ...onlineMap.value }
  delete nextOnline[key]
  onlineMap.value = nextOnline
  clearConnectionRuntimeHealth(key)
  uni.showToast({ title: "已断开连接", icon: "success" })
  loadConnections()
}

function editConnection(conn: ConnectionItem, index: number) {
  editingConnectionKey.value = connectionKey(conn)
  form.value.name = conn.name
  form.value.routeMode = conn.routeMode
  form.value.targetAgent = conn.targetAgent

  if (conn.routeMode === "direct") {
    form.value.directBaseUrl = conn.directBaseUrl || conn.url
    form.value.directToken = conn.directToken || ""
  } else {
    form.value.gatewayProvider = conn.gatewayProvider || "official"
    form.value.gatewayBaseUrl = conn.gatewayBaseUrl || conn.url || OFFICIAL_GATEWAY_BASE_URL
    form.value.pairCode = conn.pairCode || ""
    form.value.pairSecret = conn.pairSecret || ""
  }

  showAddPopup.value = true
}

function deleteConnection(index: number) {
  const conn = connections.value[index]

  uni.showModal({
    title: "确认删除",
    content: `确定要删除连接 ${conn.name} 吗？`,
    success: (res) => {
      if (res.confirm) {
        const deletedKey = connectionKey(conn)
        const savedConnections = readStoredConnections().filter(
          (item) => connectionKey(item) !== deletedKey
        )
        uni.setStorageSync("mcode_connections", savedConnections)
        setConnectionConnected(conn, false)
        persistConnectedMap()
        stopOnlineWatcher(deletedKey)
        const nextOnline = { ...onlineMap.value }
        delete nextOnline[deletedKey]
        onlineMap.value = nextOnline
        clearConnectionRuntimeHealth(deletedKey)

        // 删除连接只清理本地记录与在线状态，不影响其它已建立连接

        uni.showToast({ title: "删除成功", icon: "success" })
        loadConnections()
      }
    },
  })
}

function resetForm() {
  editingConnectionKey.value = ""
  subsectionIndex.value = 0
  form.value = {
    name: "",
    routeMode: "direct",
    targetAgent: "codeg",
    directBaseUrl: "",
    directToken: "",
    gatewayProvider: "official",
    gatewayBaseUrl: OFFICIAL_GATEWAY_BASE_URL,
    pairCode: "",
    pairSecret: "",
  }
}

function canUseScanner() {
  // #ifdef APP-PLUS
  return true
  // #endif
  return false
}

function startScanImport() {
  if (scanImporting.value) return
  if (!canUseScanner()) {
    uni.showToast({ title: "当前平台暂不支持扫码", icon: "none" })
    return
  }

  // #ifdef APP-PLUS
  scanImporting.value = true
  let scanFinished = false
  const finishScanImport = () => {
    if (scanFinished) return
    scanFinished = true
    scanImporting.value = false
  }

  try {
    uni.scanCode({
      scanType: ["qrCode"],
      autoZoom: true,
      success: (res) => {
        try {
          const imported = parseConnectionConfigCodeToConnection(res.result || "")
          const nextConnection = buildConnectionItem(imported)
          saveConnection(nextConnection)
          loadConnections()
          closeAddPopup()
          uni.showToast({ title: "连接已导入", icon: "success" })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          uni.showToast({
            title: message || "配置码无效",
            icon: "none",
            duration: 2500,
          })
        } finally {
          finishScanImport()
        }
      },
      fail: (error) => {
        try {
          const errCode = Number(error?.errCode || 0)
          if (errCode === 10001) return
          uni.showToast({
            title: error?.errMsg || "扫码失败",
            icon: "none",
            duration: 2500,
          })
        } finally {
          finishScanImport()
        }
      },
      complete: () => {
        finishScanImport()
      },
    })
  } catch (error) {
    finishScanImport()
    const message = error instanceof Error ? error.message : String(error)
    uni.showToast({
      title: message || "扫码启动失败",
      icon: "none",
      duration: 2500,
    })
  }
  // #endif
}

onShow(() => {
  if (!scanImporting.value) return
  if (scanReturnFallbackTimer) {
    clearTimeout(scanReturnFallbackTimer)
  }
  scanReturnFallbackTimer = setTimeout(() => {
    if (scanImporting.value) {
      scanImporting.value = false
    }
    scanReturnFallbackTimer = null
  }, 500)
})

function normalizeBaseUrl(url: string): string {
  return String(url || "").trim().replace(/\/+$/, "")
}

function getFormGatewayBaseUrl(): string {
  return normalizeBaseUrl(
    form.value.gatewayProvider === "custom"
      ? form.value.gatewayBaseUrl
      : OFFICIAL_GATEWAY_BASE_URL
  )
}

function buildConnectionItem(input: ConnectionRecordV2 | Record<string, unknown>): ConnectionItem {
  const raw = input as Record<string, unknown>
  const record =
    normalizeConnectionRecordV2({
      version: 2,
      ...raw,
      gatewaySession: raw.gatewaySession ?? raw.relaySession,
    }) || migrateConnectionRecord(raw)

  if (!record) {
    throw new Error("连接信息无效")
  }

  return {
    ...record,
    ...deriveLegacyRouteCompat(record),
  }
}

function connectionKey(conn: ConnectionItem): string {
  return buildConnectionRecordKey(conn)
}

function isConnectionConnected(conn: ConnectionItem): boolean {
  const key = connectionKey(conn)
  return Boolean(connectedMap.value[key] && onlineMap.value[key])
}

function isConnectionLinked(conn: ConnectionItem): boolean {
  return Boolean(connectedMap.value[connectionKey(conn)])
}

function setConnectionConnected(conn: ConnectionItem, connected: boolean) {
  const key = connectionKey(conn)
  const next = { ...connectedMap.value }
  if (connected) {
    next[key] = true
  } else {
    delete next[key]
  }
  connectedMap.value = next
}

function setConnectionHealth(key: string, health: ConnectionHealth) {
  connectionHealthMap.value = {
    ...connectionHealthMap.value,
    [key]: health,
  }
}

function clearConnectionHealth(key: string) {
  if (!connectionHealthMap.value[key]) return
  const next = { ...connectionHealthMap.value }
  delete next[key]
  connectionHealthMap.value = next
}

function clearConnectionRuntimeHealth(key: string) {
  clearConnectionHealth(key)
  clearReconnectTimer(key)
}

function markConnectionOnline(key: string) {
  setOnlineStatus(key, true)
  clearConnectionRuntimeHealth(key)
}

function markConnectionFailure(
  key: string,
  error: unknown,
  state: Exclude<ConnectionHealthState, "idle" | "online">,
  attempt?: number,
  nextRetryAt?: number
) {
  setOnlineStatus(key, false)
  setConnectionHealth(key, {
    state,
    message: buildConnectionFailureMessage(error),
    attempt,
    lastFailedAt: Date.now(),
    nextRetryAt,
  })
}

function buildConnectionFailureMessage(error: unknown) {
  const raw = extractErrorMessage(error)
  if (!raw || raw === "error" || raw === "close") return NETWORK_FAILURE_HINT
  return `${raw}。${NETWORK_FAILURE_HINT}`
}

function formatConnectionFailureToast(error: unknown) {
  const message = buildConnectionFailureMessage(error)
  return `连接失败：${message}`
}

async function assertConnectionReachable(conn: ConnectionItem) {
  const result = await probeConnectionOnline(conn)
  if (!result.online) {
    throw new Error(result.error || NETWORK_FAILURE_HINT)
  }
}

function extractErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  if (typeof error === "string" && error.trim()) return error.trim()
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>
    const candidates = [record.errMsg, record.message, record.detail, record.error]
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim()
    }
  }
  return ""
}

function resolveActionName(e: any): string {
  if (typeof e === "string") return e
  if (e && typeof e.name === "string") return e.name
  if (e && typeof e.index === "number") {
    return connectionActions.value[e.index]?.name || ""
  }
  return ""
}

function pruneConnectedMapByConnections() {
  const validKeys = new Set(connections.value.map((conn) => connectionKey(conn)))
  const next: Record<string, boolean> = {}
  Object.entries(connectedMap.value || {}).forEach(([key, value]) => {
    if (validKeys.has(key) && Boolean(value)) {
      next[key] = true
    }
  })
  connectedMap.value = next
  persistConnectedMap()
}

async function refreshOnlineStatus() {
  if (!connections.value.length) {
    onlineMap.value = {}
    connectionHealthMap.value = {}
    return
  }

  const connectedConnections = connections.value.filter((conn) =>
    Boolean(connectedMap.value[connectionKey(conn)])
  )
  if (!connectedConnections.length) {
    onlineMap.value = {}
    connectionHealthMap.value = {}
    return
  }

  const results = await Promise.all(
    connectedConnections.map(async (conn) => ({
      key: connectionKey(conn),
      result: await probeConnectionOnline(conn),
    }))
  )

  const next: Record<string, boolean> = {}
  results.forEach((item) => {
    if (item.result.online) {
      next[item.key] = true
      clearConnectionHealth(item.key)
    } else {
      markConnectionFailure(item.key, item.result.error || NETWORK_FAILURE_HINT, "error")
    }
  })
  onlineMap.value = next
}

function syncOnlineWatchers() {
  const linkedConnections = connections.value.filter((conn) =>
    Boolean(connectedMap.value[connectionKey(conn)])
  )
  const linkedKeys = new Set(linkedConnections.map((conn) => connectionKey(conn)))

  Array.from(statusSocketMap.keys()).forEach((key) => {
    if (!linkedKeys.has(key)) {
      stopOnlineWatcher(key)
    }
  })
  Array.from(reconnectTimerMap.keys()).forEach((key) => {
    if (!linkedKeys.has(key)) {
      clearReconnectTimer(key)
    }
  })

  linkedConnections.forEach((conn) => {
    const key = connectionKey(conn)
    if (!statusSocketMap.has(key) && !reconnectTimerMap.has(key)) {
      void startOnlineWatcher(conn)
    }
  })
}

function cleanupOnlineWatchers() {
  Array.from(statusSocketMap.keys()).forEach((key) => stopOnlineWatcher(key))
  Array.from(reconnectTimerMap.keys()).forEach((key) => clearReconnectTimer(key))
}

async function startOnlineWatcher(conn: ConnectionItem) {
  const key = connectionKey(conn)
  if (!connectedMap.value[key]) return

  try {
    const existingSocket = statusSocketMap.get(key)
    if (existingSocket) {
      stoppedWatcherKeys.add(key)
      try {
        existingSocket.close({ code: 1000, reason: "replace_watcher" })
      } catch {}
      statusSocketMap.delete(key)
    }

    const socketTask = await createStatusSocket(conn)
    stoppedWatcherKeys.delete(key)
    statusSocketMap.set(key, socketTask)
    let disconnected = false
    const handleDisconnect = () => {
      if (disconnected) return
      disconnected = true
      if (statusSocketMap.get(key) === socketTask) {
        statusSocketMap.delete(key)
      } else if (statusSocketMap.has(key)) {
        return
      }
      if (stoppedWatcherKeys.has(key)) {
        stoppedWatcherKeys.delete(key)
        return
      }
      markConnectionFailure(key, "实时连接已断开", "reconnecting")
      scheduleReconnect(key)
    }
    socketTask.onOpen(() => {
      markConnectionOnline(key)
    })
    socketTask.onClose(handleDisconnect)
    socketTask.onError(handleDisconnect)
  } catch (error) {
    markConnectionFailure(key, error, "reconnecting")
    scheduleReconnect(key)
  }
}

function stopOnlineWatcher(key: string) {
  clearReconnectTimer(key)
  const socketTask = statusSocketMap.get(key)
  if (socketTask) {
    stoppedWatcherKeys.add(key)
    try {
      socketTask.close({ code: 1000, reason: "manual_disconnect" })
    } catch {}
    statusSocketMap.delete(key)
  } else {
    stoppedWatcherKeys.delete(key)
  }
}

function scheduleReconnect(key: string) {
  if (!connectedMap.value[key]) return
  if (reconnectTimerMap.has(key)) return

  const current = connectionHealthMap.value[key]
  const attempt = Math.max(1, Number(current?.attempt || 0) + 1)
  const nextRetryAt = Date.now() + CONNECTION_RETRY_DELAY_MS
  setConnectionHealth(key, {
    state: "reconnecting",
    message: current?.message || NETWORK_FAILURE_HINT,
    attempt,
    lastFailedAt: current?.lastFailedAt || Date.now(),
    nextRetryAt,
  })

  const timer = setTimeout(() => {
    reconnectTimerMap.delete(key)
    if (!connectedMap.value[key]) return
    const conn = connections.value.find((item) => connectionKey(item) === key)
    if (!conn) return
    void startOnlineWatcher(conn)
  }, CONNECTION_RETRY_DELAY_MS)
  reconnectTimerMap.set(key, timer)
}

function clearReconnectTimer(key: string) {
  const timer = reconnectTimerMap.get(key)
  if (timer) {
    clearTimeout(timer)
    reconnectTimerMap.delete(key)
  }
}

function setOnlineStatus(key: string, online: boolean) {
  const next = { ...onlineMap.value }
  if (online) {
    next[key] = true
  } else {
    delete next[key]
  }
  onlineMap.value = next
  if (online) {
    clearConnectionHealth(key)
  }
}

async function createStatusSocket(conn: ConnectionItem): Promise<StatusSocket> {
  if (conn.mode === "direct") {
    const token = conn.directToken || ""
    const url = `${normalizeBaseUrl(conn.url).replace(/^http/, "ws")}/ws/events`
    if (isH5WebSocketRuntime()) {
      return createH5StatusSocket(url, token)
    }
    return uni.connectSocket({
      url,
      protocols: buildWebSocketProtocols(token),
      complete: () => {},
    }) as StatusSocket
  }

  const session = await ensureRelaySession(conn)
  if (!session?.accessToken) {
    throw new Error("missing relay session")
  }
  const url = `${normalizeBaseUrl(conn.url).replace(/^http/, "ws")}/v1/events`
  if (isH5WebSocketRuntime()) {
    return createH5StatusSocket(url, session.accessToken)
  }
  return uni.connectSocket({
    url,
    header: {
      authorization: `Bearer ${session.accessToken}`,
    },
    complete: () => {},
  }) as StatusSocket
}

interface ProbeConnectionResult {
  online: boolean
  error?: string
}

async function probeConnectionOnline(conn: ConnectionItem): Promise<ProbeConnectionResult> {
  if (conn.mode === "direct") {
    return probeDirectOnline(conn)
  }
  return probeRelayOnline(conn)
}

async function probeDirectOnline(conn: ConnectionItem): Promise<ProbeConnectionResult> {
  try {
    const token = conn.directToken || ""
    const res = await uni.request({
      url: `${normalizeBaseUrl(conn.url)}/api/health`,
      method: "POST",
      data: {},
      header: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      timeout: 3000,
    })
    const online = Number(res.statusCode) >= 200 && Number(res.statusCode) < 400
    return online
      ? { online: true }
      : { online: false, error: `健康检查返回 HTTP ${Number(res.statusCode) || 0}` }
  } catch (error) {
    return { online: false, error: extractErrorMessage(error) }
  }
}

async function probeRelayOnline(conn: ConnectionItem): Promise<ProbeConnectionResult> {
  try {
    const session = await ensureRelaySession(conn)
    if (!session?.accessToken) return { online: false, error: "网关会话不可用" }

    const response = await uni.request({
      url: `${normalizeBaseUrl(conn.url)}/v1/targets`,
      method: "GET",
      header: {
        authorization: `Bearer ${session.accessToken}`,
      },
      timeout: 3000,
    })

    if (Number(response.statusCode) !== 200) {
      return { online: false, error: `网关状态返回 HTTP ${Number(response.statusCode) || 0}` }
    }

    const data = response.data as
      | {
          currentTargetId?: string
          targets?: Array<{ targetId?: string; online?: boolean }>
        }
      | undefined
    const currentTargetId = data?.currentTargetId
    const target = (data?.targets || []).find((item) => item.targetId === currentTargetId)
    return target?.online
      ? { online: true }
      : { online: false, error: "电脑端目标未在线" }
  } catch (error) {
    return { online: false, error: extractErrorMessage(error) }
  }
}

async function ensureRelaySession(conn: ConnectionItem): Promise<RelaySessionInfo | null> {
  if (conn.mode !== "relay") return null
  if (conn.relaySession?.accessToken) return conn.relaySession
  if (!conn.pairCode || !conn.pairSecret) return null

  const gateway = createGateway({
    mode: "relay",
    relayUrl: conn.url,
    session: { accessToken: "" },
  })
  const session = await gateway.pair({
    relayUrl: conn.url,
    code: conn.pairCode,
    secret: conn.pairSecret,
  })
  if (!session) return null

  conn.relaySession = session
  saveConnection(conn)
  return session
}

function isH5WebSocketRuntime() {
  // #ifdef H5
  return true
  // #endif
  return false
}

function createH5StatusSocket(url: string, token: string): StatusSocket {
  const socket = new WebSocket(url, buildWebSocketProtocols(token))
  return {
    onOpen(callback) {
      socket.addEventListener("open", () => {
        callback({ header: {} } as UniApp.OnSocketOpenCallbackResult)
      })
    },
    onClose(callback) {
      socket.addEventListener("close", () => {
        callback({ errMsg: "close" })
      })
    },
    onError(callback) {
      socket.addEventListener("error", () => {
        callback({ errMsg: "error" })
      })
    },
    close(options?: { code?: number; reason?: string }) {
      socket.close(options?.code, options?.reason)
    },
  }
}

function persistConnectedMap() {
  uni.setStorageSync("mcode_connected_map", connectedMap.value)
}
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
}

.connections-page {
  padding: 0;
  background: var(--up-page-bg-color, var(--up-bg-color, #f3f4f6));
}

.connections-shell {
  padding: 24rpx 24rpx 40rpx;
}

.connections-topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24rpx;
  padding: 18rpx 10rpx 20rpx;
}

.connections-brand {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.connections-brand__mark {
  font-size: 22rpx;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--up-primary, #2979ff);
}

.connections-brand__title {
  font-size: 42rpx;
  line-height: 1.2;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.connections-brand__subtitle {
  font-size: 26rpx;
  line-height: 1.5;
  color: var(--up-tips-color, #909193);
}

.connections-topbar__action {
  display: inline-flex;
  align-items: center;
  gap: 10rpx;
  margin-top: 20px !important;
  padding: 18rpx 24rpx;
  border-radius: 999rpx;
  background: linear-gradient(135deg, #0a84ff, #0066cc);
  box-shadow: 0 20rpx 40rpx rgba(0, 122, 255, 0.22);
  flex-shrink: 0;
  white-space: nowrap;
}

.connections-topbar__action-text {
  font-size: 24rpx;
  font-weight: 600;
  color: #ffffff;
  white-space: nowrap;
  flex-shrink: 0;
}

.connections-hero,
.connections-empty,
.connection-card,
.connections-add-card,
.connections-guide-card,
.connections-config-code,
.connections-sheet,
.connections-tutorial {
  border-radius: 32rpx;
  box-shadow: 0 10rpx 26rpx rgba(15, 23, 42, 0.08);
}

.connections-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  padding: 30rpx;
  margin-bottom: 24rpx;
  overflow: hidden;
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--up-primary, #2979ff) 14%, var(--up-card-bg-color, #ffffff) 86%),
      var(--up-card-bg-color, #ffffff)
    );
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.connections-hero__copy {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.connections-hero__eyebrow,
.connections-guide-card__eyebrow {
  font-size: 20rpx;
  font-weight: 700;
  letter-spacing: 0.2em;
  color: var(--up-primary, #2979ff);
}

.connections-hero__title {
  font-size: 36rpx;
  line-height: 1.25;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.connections-hero__desc,
.connections-empty__desc,
.connections-guide-card__desc,
.connections-add-card__desc,
.connections-sheet__subtitle,
.connections-sheet__tutorial-desc,
.connections-tutorial__subtitle,
.connections-tutorial__step-desc {
  font-size: 24rpx;
  line-height: 1.6;
  color: var(--up-content-color, #606266);
}

.connections-hero__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.connections-hero__chip,
.connections-hero__chip--ghost {
  padding: 10rpx 18rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 600;
}

.connections-hero__chip {
  background: color-mix(in srgb, var(--up-primary, #2979ff) 12%, var(--up-card-bg-color, #ffffff) 88%);
  color: var(--up-primary, #2979ff);
}

.connections-hero__chip--ghost {
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  color: var(--up-main-color, #303133);
}

.connections-hero__art {
  width: 220rpx;
  flex-shrink: 0;
  opacity: 0.95;
}

.connections-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
  min-height: 520rpx;
  padding: 48rpx 32rpx;
  text-align: center;
  background: var(--up-card-bg-color, #ffffff);
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.connections-empty__icon {
  width: 104rpx;
  height: 104rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 12%, var(--up-card-bg-color, #ffffff) 88%);
}

.connections-empty__title,
.connections-sheet__title,
.connections-guide-card__title,
.connections-tutorial__title {
  font-size: 34rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.connections-empty__actions {
  display: flex;
  gap: 16rpx;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 8rpx;
}

.connections-empty__primary,
.connections-empty__secondary,
.connections-guide-card__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  padding: 18rpx 28rpx;
  border-radius: 999rpx;
  font-size: 24rpx;
  font-weight: 600;
}

.connections-empty__primary {
  background: var(--up-primary, #2979ff);
  color: #ffffff;
}

.connections-empty__secondary {
  background: color-mix(in srgb, var(--up-primary, #2979ff) 12%, var(--up-card-bg-color, #ffffff) 88%);
  color: var(--up-primary, #2979ff);
}

.connections-stack {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.connection-card {
  display: flex;
  align-items: flex-start;
  gap: 20rpx;
  padding: 24rpx;
  background: var(--up-card-bg-color, #ffffff);
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.connection-card--online {
  box-shadow: 0 22rpx 50rpx rgba(0, 122, 255, 0.1);
}

.connection-card--reconnecting {
  border-color: color-mix(in srgb, var(--up-warning, #f9ae3d) 38%, var(--up-border-color, #dadbde) 62%);
}

.connection-card--error {
  border-color: color-mix(in srgb, var(--up-error, #fa3534) 34%, var(--up-border-color, #dadbde) 66%);
  box-shadow: 0 18rpx 42rpx rgba(250, 53, 52, 0.08);
}

.connection-card__icon {
  width: 88rpx;
  height: 88rpx;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 26rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.connection-card__icon--online {
  background: color-mix(in srgb, var(--up-primary, #2979ff) 12%, var(--up-card-bg-color, #ffffff) 88%);
}

.connection-card__icon--reconnecting {
  background: color-mix(in srgb, var(--up-warning, #f9ae3d) 16%, var(--up-card-bg-color, #ffffff) 84%);
}

.connection-card__icon--error {
  background: color-mix(in srgb, var(--up-error, #fa3534) 12%, var(--up-card-bg-color, #ffffff) 88%);
}

.connection-card__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  min-width: 0;
}

.connection-card__head {
  display: flex;
  align-items: center;
  gap: 12rpx;
  min-width: 0;
}

.connection-card__name {
  flex: 1;
  font-size: 30rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.connection-card__status {
  display: inline-flex;
  align-items: center;
  padding: 8rpx 14rpx;
  border-radius: 999rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.connection-card__status--online {
  background: rgba(52, 199, 89, 0.14);
}

.connection-card__status--reconnecting {
  background: color-mix(in srgb, var(--up-warning, #f9ae3d) 18%, var(--up-card-bg-color, #ffffff) 82%);
}

.connection-card__status--error {
  background: color-mix(in srgb, var(--up-error, #fa3534) 14%, var(--up-card-bg-color, #ffffff) 86%);
}

.connection-card__status-text {
  font-size: 20rpx;
  font-weight: 700;
  color: var(--up-tips-color, #909193);
}

.connection-card__status--online .connection-card__status-text {
  color: #34c759;
}

.connection-card__status--reconnecting .connection-card__status-text {
  color: var(--up-warning, #f9ae3d);
}

.connection-card__status--error .connection-card__status-text {
  color: var(--up-error, #fa3534);
}

.connection-card__menu {
  width: 48rpx;
  height: 48rpx;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.connection-card__meta {
  font-size: 24rpx;
  line-height: 1.5;
  color: var(--up-content-color, #606266);
  word-break: break-all;
}

.connection-card__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
}

.connection-card__chip {
  padding: 8rpx 14rpx;
  border-radius: 999rpx;
  border: 1rpx solid color-mix(in srgb, var(--up-primary, #2979ff) 24%, var(--up-border-color, #dadbde) 76%);
  background: color-mix(in srgb, var(--up-primary, #2979ff) 10%, var(--up-card-bg-color, #ffffff) 90%);
  color: var(--up-primary, #2979ff);
  font-size: 20rpx;
  font-weight: 600;
}

.connection-card__health-detail {
  padding: 16rpx 18rpx;
  border-radius: 20rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  color: var(--up-content-color, #606266);
  font-size: 22rpx;
  line-height: 1.5;
}

.connection-card__footer {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 4rpx;
}

.connection-card__footer-main,
.connection-card__quick-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
}

.connection-card__footer-link {
  font-size: 22rpx;
  font-weight: 600;
  color: var(--up-primary, #2979ff);
}

.connection-card__quick-action {
  padding: 10rpx 18rpx;
  border-radius: 999rpx;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 12%, var(--up-card-bg-color, #ffffff) 88%);
  color: var(--up-primary, #2979ff);
  font-size: 22rpx;
  font-weight: 600;
}

.connection-card__quick-action--ghost {
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  color: var(--up-content-color, #606266);
}

.connections-add-card,
.connections-guide-card {
  display: flex;
  align-items: center;
  gap: 18rpx;
  margin-top: 18rpx;
  padding: 24rpx;
  background: var(--up-card-bg-color, #ffffff);
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.connections-add-card__icon {
  width: 72rpx;
  height: 72rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 22rpx;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 12%, var(--up-card-bg-color, #ffffff) 88%);
  flex-shrink: 0;
}

.connections-add-card__body,
.connections-guide-card__copy,
.connections-sheet__heading,
.connections-tutorial__heading {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  min-width: 0;
}

.connections-add-card__title {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.connections-guide-card {
  align-items: flex-start;
  justify-content: space-between;
  background: linear-gradient(135deg, #0a84ff, #0066cc);
  border: none;
}

.connections-guide-card__eyebrow,
.connections-guide-card__title,
.connections-guide-card__desc {
  color: #ffffff;
}

.connections-guide-card__desc {
  opacity: 0.88;
}

.connections-guide-card__action {
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.16);
  color: #ffffff;
}

.connections-config-code {
  width: 660rpx;
  max-width: calc(100vw - 48rpx);
  padding: 28rpx;
  background: var(--up-card-bg-color, #ffffff);
}

.connections-config-code__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18rpx;
  margin-bottom: 22rpx;
}

.connections-config-code__heading {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  min-width: 0;
}

.connections-config-code__title {
  font-size: 34rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.connections-config-code__subtitle,
.connections-config-code__meta {
  font-size: 24rpx;
  line-height: 1.6;
  color: var(--up-content-color, #606266);
}

.connections-config-code__connection {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  margin-bottom: 22rpx;
  padding: 20rpx;
  border-radius: 24rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.connections-config-code__name {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.connections-config-code__qr {
  display: flex;
  justify-content: center;
  margin: 20rpx auto 24rpx;
  padding: 24rpx;
  border-radius: 28rpx;
  background: #ffffff;
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.connections-config-code__text {
  max-height: 180rpx;
  padding: 18rpx;
  border-radius: 20rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  color: var(--up-content-color, #606266);
  font-size: 20rpx;
  line-height: 1.5;
  word-break: break-all;
  overflow: hidden;
}

.connections-config-code__actions {
  margin-top: 22rpx;
}

.connections-sheet {
  padding: 18rpx 24rpx 28rpx;
  background: var(--up-card-bg-color, #ffffff);
}

.connections-sheet__handle {
  width: 88rpx;
  height: 8rpx;
  margin: 0 auto 18rpx;
  border-radius: 999rpx;
  background: var(--up-border-color, #dadbde);
}

.connections-sheet__header,
.connections-tutorial__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 18rpx;
}

.connections-sheet__subtitle {
  margin-top: 4rpx;
}

.connections-sheet__tutorial {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 18rpx;
  padding: 20rpx 18rpx;
  border-radius: 24rpx;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 12%, var(--up-card-bg-color, #ffffff) 88%);
}

.connections-sheet__tutorial-title {
  font-size: 26rpx;
  font-weight: 600;
  color: var(--up-primary, #2979ff);
}

.connections-sheet__tutorial-desc,
.connections-sheet__tip,
.connections-tutorial__link {
  font-size: 22rpx;
  color: var(--up-content-color, #606266);
}

.connections-sheet__tabs {
  margin-bottom: 18rpx;
}

.connections-sheet__form,
.connections-sheet__scan {
  padding-bottom: 8rpx;
}

.connections-sheet__scan-panel {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  padding: 24rpx;
  border-radius: 24rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.connections-sheet__scan-copy {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.connections-sheet__scan-title {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.connections-sheet__scan-desc {
  font-size: 24rpx;
  line-height: 1.6;
  color: var(--up-content-color, #606266);
}

.connections-sheet__actions {
  margin-top: 24rpx;
}

.connections-sheet__tip {
  margin-top: 12rpx;
}

.connections-tutorial {
  width: 640rpx;
  max-width: calc(100vw - 48rpx);
  padding: 26rpx;
  background: var(--up-card-bg-color, #ffffff);
}

.connections-tutorial__steps {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.connections-tutorial__step {
  display: flex;
  gap: 16rpx;
  padding: 20rpx;
  border-radius: 24rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.connections-tutorial__index {
  width: 52rpx;
  height: 52rpx;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--up-primary, #2979ff);
  color: #ffffff;
  font-size: 24rpx;
  font-weight: 700;
}

.connections-tutorial__body {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  min-width: 0;
}

.connections-tutorial__step-title {
  font-size: 26rpx;
  line-height: 1.5;
  font-weight: 600;
  color: var(--up-main-color, #303133);
}

.connections-tutorial__link {
  word-break: break-all;
}

@media (max-width: 750rpx) {
  .connections-shell {
    padding: 16rpx 16rpx 32rpx;
  }

  .connections-topbar {
    padding: 10rpx 4rpx 16rpx;
  }

  .connections-brand__title {
    font-size: 38rpx;
  }

  .connections-hero {
    align-items: flex-start;
    padding: 24rpx;
  }

  .connections-hero__art {
    width: 180rpx;
    opacity: 0.88;
  }

  .connection-card,
  .connections-add-card,
  .connections-guide-card {
    padding: 20rpx;
  }

  .connections-tutorial {
    width: 100%;
    padding: 22rpx;
  }

  .connections-config-code {
    width: 100%;
    padding: 24rpx;
  }
}
</style>
