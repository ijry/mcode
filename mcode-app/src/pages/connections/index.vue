<template>
  <view class="page connections-page" :style="[upThemeVars, upThemePageStyle]">
    <view class="connections-shell">
      <!-- 状态栏占位：页面用 navigationStyle: custom，系统导航栏已交给本页自绘 -->
      <view class="connections-statusbar" :style="{ height: statusBarHeight + 'px' }"></view>

      <view class="connections-body">
        <!-- 品牌区 -->
        <view class="connections-brand">
          <view class="connections-brand__copy">
            <text class="connections-brand__mark">MCode</text>
            <text class="connections-brand__slogan">随时随地控 AI</text>
          </view>

          <view class="connections-brand__action" @click="openAddPopup()">
            <text class="connections-brand__action-plus">+</text>
            <text class="connections-brand__action-text">新增连接</text>
          </view>
        </view>

        <!-- 我的连接 -->
        <text class="connections-group-title">我的连接 · {{ connections.length }}</text>

        <view v-if="connections.length === 0" class="connections-empty">
          <text class="connections-empty__title">还没有连接</text>
          <text class="connections-empty__desc">添加电脑后即可远程接管 AI，回工位也能继续。</text>
          <view class="connections-empty__actions">
            <view class="connections-empty__primary" @click="openAddPopup()">
              <text>立即添加</text>
            </view>
            <view class="connections-empty__secondary" @click="openTutorialPopup">
              <text>查看教程</text>
            </view>
          </view>
        </view>

        <view v-else class="connections-list">
          <block v-for="(conn, index) in connections" :key="index">
            <view
              class="connections-row"
              :class="getConnectionCardClass(conn)"
              @click="openConnectionDetail(conn)"
            >
              <view class="connections-row__host" :class="getConnectionHostAccentClass(conn)">
                <text class="connections-row__host-text">{{ getConnectionHostShortLabel(conn) }}</text>
              </view>

              <view class="connections-row__copy">
                <text class="connections-row__title">{{ conn.name || getConnectionHost(conn).displayName }}</text>
                <text
                  class="connections-row__subtitle"
                  :class="{ 'connections-row__subtitle--warn': isConnectionWarn(conn) }"
                >{{ getConnectionRowSubtitle(conn) }}</text>
              </view>

              <view class="connections-row__trailing">
                <view class="connections-row__dot" :class="getConnectionDotClass(conn)"></view>
                <view class="connections-row__more" @click.stop="showConnectionMenu(conn, index)">
                  <u-icon name="more-dot-fill" size="16" color="#C7C7CC"></u-icon>
                </view>
              </view>
            </view>

            <view v-if="index < connections.length - 1" class="connections-divider"></view>
          </block>
        </view>

        <!-- 其他 -->
        <text class="connections-group-title">其他</text>

        <view class="connections-list">
          <view class="connections-entry" @click="openAddPopup()">
            <view class="connections-entry__icon connections-entry__icon--primary">
              <text class="connections-entry__icon-text connections-entry__icon-text--primary">+</text>
            </view>
            <view class="connections-entry__copy">
              <text class="connections-entry__title">添加新设备</text>
              <text class="connections-entry__desc">手机实时接入电脑 AI</text>
            </view>
            <u-icon name="arrow-right" size="14" color="#C7C7CC"></u-icon>
          </view>

          <view class="connections-divider"></view>

          <view class="connections-entry" @click="openTutorialPopup">
            <view class="connections-entry__icon">
              <text class="connections-entry__icon-text">?</text>
            </view>
            <view class="connections-entry__copy">
              <text class="connections-entry__title">先完成部署</text>
              <text class="connections-entry__desc">查看部署教程</text>
            </view>
            <u-icon name="arrow-right" size="14" color="#C7C7CC"></u-icon>
          </view>
        </view>
      </view>
    </view>

    <McodeTabBar current="connections" />

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

            <u-form-item label="电脑/主机型号" prop="hostModelId">
              <view class="connections-sheet__host-field" @click="showHostPicker = true">
                <view class="connections-sheet__host-copy">
                  <text class="connections-sheet__host-title">
                    {{ getSelectedHostPresentation().displayName }}
                  </text>
                  <text class="connections-sheet__host-subtitle">
                    {{ getSelectedHostPresentation().kindLabel }}
                  </text>
                </view>
                <u-icon name="arrow-right" size="14" color="#c7c7cc"></u-icon>
              </view>
            </u-form-item>

            <u-form-item label="连接方式" prop="routeMode" required>
              <u-radio-group :modelValue="form.routeMode" placement="row" @change="handleRouteModeChange">
                <u-radio name="direct" label="直连"></u-radio>
                <u-radio name="gateway" label="中转（网关）"></u-radio>
              </u-radio-group>
            </u-form-item>

            <u-form-item v-if="showTargetAgentPicker" label="目标类型" prop="targetAgent" required>
              <u-subsection
                :list="targetAgentLabels"
                :current="targetAgentIndex"
                @change="handleTargetAgentChange"
                activeColor="#007aff"
              ></u-subsection>
            </u-form-item>

            <view v-if="form.routeMode === 'direct'">
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
                {{ pairCodeTip }}
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

    <ConnectionHostPicker
      v-model:show="showHostPicker"
      v-model="form.hostModelId"
    />

    <IosAddToHomePrompt />
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue"
import { onHide, onShow } from "@dcloudio/uni-app"
import { createGateway } from "@/services/gateway"
import type { RelaySessionInfo } from "@/services/gateway"
import { buildWebSocketProtocols } from "@/services/gateway/wsProtocol"
import ConnectionHostPicker from "./components/ConnectionHostPicker.vue"
import McodeTabBar from "@/components/McodeTabBar.vue"
import { buildConnectionConfigCode, parseConnectionConfigCodeToConnection } from "./connectionConfigCode"
import { assertPairTargetAgentMatchesSelection } from "@/services/connectionPairValidation"
import { DEFAULT_CONNECTION_HOST_MODEL_ID } from "@/services/connectionHostCatalog"
import {
  buildConnectionKey,
  readStoredConnections,
  type ConnectionContext,
} from "@/services/connectionContext"
import {
  readConnectedMap,
  replaceConnectedMap,
  pruneConnectedMap,
} from "@/services/connection/connectedMapStore"
import {
  buildConnectionDetailRoute,
  type ConnectionDetailTab,
} from "@/services/connectionDetail"
import { migrateLegacyStoredConnectionsToV2 } from "@/services/connectionMigration"
import {
  normalizeConnectionRecordV2,
  type ConnectionRecordV2,
  type ConnectionGatewayProvider,
  type ConnectionRouteMode,
  type ConnectionTargetAgent,
} from "@/services/connectionSchema"
import {
  getConnectionCapabilityChips,
  getConnectionHostPresentation,
  getConnectionHostShortLabel,
  getConnectionSubtitle,
} from "./connectionPresentation"
import {
  buildConnectionAgentsRoute,
  buildModelProvidersRoute,
} from "@/services/remoteSettings"
import { openGuardedExternalUrl } from "@/services/externalLinkGuard"
import { connectionBaseUrl } from "@/services/connection/connectionLookup"
import { probeWithRetry } from "@/services/connection/reachability"
import {
  getPairCodeTip,
  getTargetAgentIndex,
  getVisibleTargetAgentOptions,
  resolveTargetAgentByIndex,
} from "./connectionTargetAgentOptions"

declare const plus: any

const DEPLOYMENT_GUIDE_URL = "https://pan.quark.cn/s/0008015b1d33"
const HOST_FALLBACK_IMAGE = "/static/connection-hosts/other-computer.svg"
const OFFICIAL_GATEWAY_BASE_URL = normalizeBaseUrl(
  String(import.meta.env.VITE_MCODE_OFFICIAL_GATEWAY_BASE_URL || "https://mcode-relay.lingyun.net")
)
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
const showHostPicker = ref(false)
const currentConnectionIndex = ref(-1)
const editingConnectionKey = ref("")
const configCodeValue = ref("")
const configCodeConnectionName = ref("")
const configCodeConnectionMeta = ref("")
const hostImageErrorMap = ref<Record<string, boolean>>({})
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
/** 单次探测超时：3s 在移动网络 + 冷启动网关下经常不够，第二次点确认才成功多半就是这个。 */
const CONNECTION_PROBE_TIMEOUT_MS = 8000

type ConnectionItem = ConnectionContext

/**
 * 状态栏高度。页面改成 `navigationStyle: custom` 后系统不再给导航栏留位，
 * 品牌区会顶上刘海 —— 必须自己撑出这 44~62px。
 */
const statusBarHeight = (() => {
  try {
    const info = uni.getWindowInfo?.() || uni.getSystemInfoSync?.()
    const value = Number(info?.statusBarHeight)
    return Number.isFinite(value) && value > 0 ? value : 44
  } catch {
    return 44
  }
})()

const form = ref({
  name: "",
  routeMode: "direct" as ConnectionRouteMode,
  targetAgent: "codeg" as ConnectionTargetAgent,
  hostModelId: DEFAULT_CONNECTION_HOST_MODEL_ID,
  directBaseUrl: "",
  directToken: "",
  gatewayProvider: "official" as ConnectionGatewayProvider,
  gatewayBaseUrl: OFFICIAL_GATEWAY_BASE_URL,
  pairCode: "",
  pairSecret: "",
})

const connections = ref<ConnectionItem[]>([])
const popupTitle = computed(() => (editingConnectionKey.value ? "编辑连接" : "新增连接"))
const targetAgentLabels = computed(() =>
  getVisibleTargetAgentOptions(form.value.targetAgent).map((item) => item.label)
)
const showTargetAgentPicker = computed(() => targetAgentLabels.value.length > 1)
const targetAgentIndex = computed(() => getTargetAgentIndex(form.value.targetAgent))
const pairCodeTip = computed(() => getPairCodeTip(form.value.targetAgent))

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

function getSelectedHostPresentation() {
  return getConnectionHostPresentation({ hostModelId: form.value.hostModelId })
}

function getConnectionHost(conn: ConnectionItem) {
  return getConnectionHostPresentation({ hostModelId: conn.hostModelId })
}

function getConnectionHostImage(conn: ConnectionItem) {
  const key = getConnectionHostImageKey(conn)
  if (hostImageErrorMap.value[key]) return HOST_FALLBACK_IMAGE
  return getConnectionHost(conn).image || HOST_FALLBACK_IMAGE
}

function handleConnectionHostImageError(conn: ConnectionItem) {
  const key = getConnectionHostImageKey(conn)
  hostImageErrorMap.value = {
    ...hostImageErrorMap.value,
    [key]: true,
  }
}

function getConnectionHostImageKey(conn: ConnectionItem) {
  return `${connectionKey(conn)}:${getConnectionHost(conn).id}`
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

function getConnectionStatusClass(conn: ConnectionItem) {
  const health = getConnectionHealth(conn)
  return {
    "connection-card__status--online": health.state === "online",
    "connection-card__status--reconnecting": health.state === "reconnecting",
    "connection-card__status--error": health.state === "error",
  }
}

/**
 * 设计稿的 38×38 主机徽标底色按「机器类型」分色，而不是按连接状态分色：
 * 同一台电脑在线/离线会变，但「这是一台笔记本还是云服务器」不会 —— 颜色用来帮人
 * 在列表里**定位**，状态交给右侧 8px 的状态点。
 *
 * 这三档取的是设计稿里出现的三台示例机（MacBook Air / ECS / XPS）的实际色值。
 */
function getConnectionHostAccentClass(conn: ConnectionItem) {
  const kind = getConnectionHost(conn).kind
  if (kind === "cloud-server") return "connections-row__host--cloud"
  if (kind === "laptop" || kind === "desktop" || kind === "mini-pc") {
    return "connections-row__host--device"
  }
  return "connections-row__host--other"
}

/** 8px 状态点：在线绿、重连中橙、异常红、未连接灰。 */
function getConnectionDotClass(conn: ConnectionItem) {
  const state = getConnectionHealth(conn).state
  return {
    "connections-row__dot--online": state === "online",
    "connections-row__dot--reconnecting": state === "reconnecting",
    "connections-row__dot--error": state === "error",
  }
}

/** 副标题要在异常时变色（设计稿重连中是 #CC6B00 橙）。 */
function isConnectionWarn(conn: ConnectionItem) {
  const state = getConnectionHealth(conn).state
  return state === "reconnecting" || state === "error"
}

/**
 * 行副标题 = 主机类型 · 地址。
 *
 * 设计稿示例是「我的 MacBook · relay.mcode.app」，但存储里没有「我的 MacBook」这个自由文本
 * 字段（连接名在上一行已经显示了）。这里用「主机类型 · 端点」—— 端点才是用户在列表里真正
 * 靠它区分两台同类机器的信息。异常时整行替换为原因，因为那时「连不上」比「连的是谁」更急。
 */
function getConnectionRowSubtitle(conn: ConnectionItem) {
  const health = getConnectionHealth(conn)
  if (health.state === "reconnecting") {
    return health.message ? `网络波动，正在重连…` : "正在重连…"
  }
  if (health.state === "error") {
    return health.message || "连接异常"
  }
  const hostLabel = getConnectionHost(conn).kindLabel
  const endpoint = connectionBaseUrl(conn)
  return [hostLabel, endpoint].filter(Boolean).join(" · ")
}

onMounted(() => {
  migrateLegacyStoredConnectionsToV2()
  connectedMap.value = readConnectedMap()
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
    if (form.value.gatewayProvider === "official") {
      form.value.gatewayBaseUrl = OFFICIAL_GATEWAY_BASE_URL
    }
  }
}

function handleTargetAgentChange(index: number) {
  form.value.targetAgent = resolveTargetAgentByIndex(index, form.value.targetAgent)
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
        hostModelId: form.value.hostModelId,
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
      assertPairTargetAgentMatchesSelection(session, form.value.targetAgent)

      const newConnection = buildConnectionItem({
        version: 2,
        name: form.value.name,
        targetAgent: form.value.targetAgent,
        routeMode: "gateway",
        gatewayProvider: form.value.gatewayProvider,
        gatewayBaseUrl,
        pairCode: form.value.pairCode,
        pairSecret: form.value.pairSecret,
        gatewaySession: session,
        hostModelId: form.value.hostModelId,
      })

      // 配对码是一次性的：pair 已经成功就必须落盘，否则探测失败会把这张码白白烧掉，
      // 用户再点一次确认只会拿到 401。探测结果只决定卡片状态与提示文案。
      const reachability = await probeConnectionReachabilityWithRetry(newConnection)
      saveConnection(newConnection, previousKey || undefined)
      syncConnectionRuntimeState(previousKey, newConnection)
      if (reachability.online) {
        uni.showToast({ title: "配对成功", icon: "success" })
      } else {
        markConnectionFailure(
          connectionKey(newConnection),
          reachability.error || NETWORK_FAILURE_HINT,
          "error"
        )
        uni.showToast({
          title: `配对已完成，但主机暂时不可达：${reachability.error || NETWORK_FAILURE_HINT}`,
          icon: "none",
          duration: 4500,
        })
      }
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
    openConnectionDetail(conn, { tab: "config" })
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

function openConnectionDetail(
  conn: ConnectionItem,
  options: { tab?: ConnectionDetailTab } = {}
) {
  const connectionId = String(conn.id || "").trim()
  if (!connectionId) {
    uni.showToast({ title: "缺少连接信息，请重新保存连接。", icon: "none" })
    return
  }
  uni.navigateTo({
    url: buildConnectionDetailRoute({
      connectionId,
      tab: options.tab || "folders",
    }),
  })
}

function openConnectionAgents(conn: ConnectionItem) {
  uni.navigateTo({
    url: buildConnectionAgentsRoute({
      connectionId: conn.id,
    }),
  })
}

function openModelProviders(conn: ConnectionItem) {
  uni.navigateTo({
    url: buildModelProvidersRoute({
      connectionId: conn.id,
    }),
  })
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
  uni.navigateTo({
    url: `/pages/projects/index?connectionId=${encodeURIComponent(conn.id)}`,
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
    if (conn.routeMode === "direct") {
      if (!conn.directToken) {
        uni.showToast({ title: "连接信息不完整", icon: "none" })
        markConnectionFailure(key, "连接信息不完整", "error")
        return false
      }

      const gateway = createGateway({
        mode: "direct",
        directBaseUrl: connectionBaseUrl(conn),
      })

      await gateway.pair({
        directBaseUrl: connectionBaseUrl(conn),
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
  const host = connectionBaseUrl(conn)
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
  form.value.hostModelId = conn.hostModelId || DEFAULT_CONNECTION_HOST_MODEL_ID

  if (conn.routeMode === "direct") {
    form.value.directBaseUrl = conn.directBaseUrl || ""
    form.value.directToken = conn.directToken || ""
  } else {
    form.value.gatewayProvider = conn.gatewayProvider || "official"
    form.value.gatewayBaseUrl = conn.gatewayBaseUrl || OFFICIAL_GATEWAY_BASE_URL
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
    hostModelId: DEFAULT_CONNECTION_HOST_MODEL_ID,
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
  // 切回本页时把在线探测重新拉起来 —— `onHide` 会把 socket 与 3s 重连链全停掉。
  // 本页是 tabBar 第 0 项，`onUnmounted` 实践中只有 reLaunch/退出才触发，所以只靠它
  // 兜底等于「主机不在线时每条连接每 3 秒一次 WS 握手，持续整个应用生命周期」。
  syncOnlineWatchers()
  void refreshOnlineStatus()

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

onHide(() => {
  if (scanReturnFallbackTimer) {
    clearTimeout(scanReturnFallbackTimer)
    scanReturnFallbackTimer = null
  }
  cleanupOnlineWatchers()
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
  const record = normalizeConnectionRecordV2({
    version: 2,
    ...(input as Record<string, unknown>),
  })

  if (!record) {
    throw new Error("连接信息无效")
  }

  return record
}

/**
 * 连接在各个 map 里的键。
 *
 * 必须和 `services/connection/connectedMapStore` 用同一个函数 —— 那里用的是
 * `buildConnectionKey`（先归一化再取键）。本页原先用 `buildConnectionRecordKey`
 * （直接读原始字段），两者对良构 v2 记录等价，但记录无法通过归一化时会分叉
 * （targetAgent 大小写 / version 不是 2 / 缺 directBaseUrl），
 * 于是本页写进 `mcode_connected_map` 的键，其它页面永远匹配不上。
 *
 * `connections.value` 来自 `readStoredConnections()`（已归一化），所以这里换成
 * `buildConnectionKey` 对本页的行为无影响，只是把跨页的键统一了。
 */
function connectionKey(conn: ConnectionItem): string {
  return buildConnectionKey(conn)
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

/**
 * 探测可达性，失败时在短窗口内重试。
 *
 * relay 的 `online` 只反映桌面端 WebSocket 当下是否注册（无心跳宽限），配对刚完成的
 * 一两秒里探到 offline 属于正常抖动，单次判定会把它误报成「电脑端目标未在线」。
 */
async function assertConnectionReachable(conn: ConnectionItem) {
  const result = await probeConnectionReachabilityWithRetry(conn)
  if (!result.online) {
    throw new Error(result.error || NETWORK_FAILURE_HINT)
  }
}

function probeConnectionReachabilityWithRetry(conn: ConnectionItem) {
  return probeWithRetry(() => probeConnectionOnline(conn))
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
  // 剪枝交给 connectedMapStore（它与置位共用 buildConnectionKey），
  // 再把结果同步回本页的响应式副本。
  connectedMap.value = pruneConnectedMap(connections.value)
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
  const baseUrl = connectionBaseUrl(conn)
  if (conn.routeMode === "direct") {
    const token = conn.directToken || ""
    const url = `${baseUrl.replace(/^http/, "ws")}/ws/events`
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
  const url = `${baseUrl.replace(/^http/, "ws")}/v1/events`
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
  if (conn.routeMode === "direct") {
    return probeDirectOnline(conn)
  }
  return probeRelayOnline(conn)
}

async function probeDirectOnline(conn: ConnectionItem): Promise<ProbeConnectionResult> {
  try {
    const token = conn.directToken || ""
    const res = await uni.request({
      url: `${connectionBaseUrl(conn)}/api/health`,
      method: "POST",
      data: {},
      header: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      timeout: CONNECTION_PROBE_TIMEOUT_MS,
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
      url: `${connectionBaseUrl(conn)}/v1/targets`,
      method: "GET",
      header: {
        authorization: `Bearer ${session.accessToken}`,
      },
      timeout: CONNECTION_PROBE_TIMEOUT_MS,
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
  if (conn.routeMode !== "gateway") return null
  if (conn.gatewaySession?.accessToken) return conn.gatewaySession
  if (!conn.pairCode || !conn.pairSecret) return null
  const gatewayBaseUrl = connectionBaseUrl(conn)

  const gateway = createGateway({
    mode: "relay",
    relayUrl: gatewayBaseUrl,
    session: { accessToken: "" },
  })
  const session = await gateway.pair({
    relayUrl: gatewayBaseUrl,
    code: conn.pairCode,
    secret: conn.pairSecret,
  })
  if (!session) return null

  conn.gatewaySession = session
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
  // 走 connectedMapStore，保证与其它页面读写的是同一份、同一套键。
  replaceConnectedMap(connectedMap.value)
}
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
}

/*
 * 页面底色。设计稿浅色是 #F2F2F7 的中性纸面，深色是纯黑 —— 不用 uview 的
 * `--up-page-bg-color`（`#f3f4f6` / `#1f1f1f`），因为设计稿的深色比它更黑一档，
 * 卡片（#1C1C1E）才能从背景里「浮起来」。浅色两值几乎一致，这里统一取设计稿值。
 */
.connections-page {
  padding: 0;
  background: #f2f2f7;
}

[data-up-theme='dark'] .connections-page {
  background: #000000;
}

.connections-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  /* 底栏是 fixed 的：内容区底部要留出「12 + 62 + 安全区(底内距由安全区提供)」再加安全区，
     否则最后一行「先完成部署」会被胶囊压住。 */
  padding-bottom: calc(74px + env(safe-area-inset-bottom));
}

.connections-statusbar {
  flex-shrink: 0;
}

/*
 * 内容区几何（设计稿「内容区」节点）：左右 16、上 8、下 16，块间距 12。
 * 用 px 而非 rpx：设计稿是 393 宽基准，px 才能保证在 320~430 各档机型上
 * 圆角、行高、图标尺寸的视觉比例一致（rpx 会整体缩放，小屏上会把 12px 压到 10px 以下）。
 */
.connections-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 8px 16px 16px;
}

/* ---------- 品牌区 ---------- */

.connections-brand {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.connections-brand__copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.connections-brand__mark {
  font-size: 24px;
  line-height: 1.15;
  font-weight: 700;
  color: #3c3c43;
}

.connections-brand__slogan {
  font-size: 12px;
  line-height: 1.3;
  color: #8e8e93;
}

/* 新增连接胶囊：radius 20、padding 8/12、gap 4 */
.connections-brand__action {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  padding: 8px 12px;
  border-radius: 20px;
  background: #007aff;
}

.connections-brand__action-plus {
  font-size: 16px;
  line-height: 1;
  font-weight: 700;
  color: #ffffff;
}

.connections-brand__action-text {
  font-size: 13px;
  line-height: 1;
  font-weight: 500;
  color: #ffffff;
}

/* ---------- 分组标题 ---------- */

.connections-group-title {
  font-size: 13px;
  line-height: 1.3;
  color: #8e8e93;
}

/* ---------- 分组卡片 ---------- */

.connections-list {
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.06);
  overflow: hidden;
}

.connections-divider {
  height: 1px;
  background: #e5e5ea;
}

/*
 * 连接行：padding 12/14、gap 12。行内三块依次是 38 徽标 / 文字组 / 状态点+更多。
 * 高度由内容撑开（12 + 38 + 12 = 62），不要写死 —— 主机名换行时行高要跟着长。
 */
.connections-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
}

.connections-row:active,
.connections-entry:active {
  background: rgba(0, 0, 0, 0.03);
}

.connections-row__host {
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
}

/*
 * 徽标分色按机器类型（详见 `getConnectionHostAccentClass` 的注释）：
 * 云服务器靛紫、本机设备蓝、其他灰 —— 与设计稿三台示例机一致。
 */
.connections-row__host--device {
  background: #007aff;
}

.connections-row__host--cloud {
  background: #5856d6;
}

.connections-row__host--other {
  background: #8e8e93;
}

.connections-row__host-text {
  font-size: 14px;
  line-height: 1;
  font-weight: 700;
  color: #ffffff;
}

.connections-row__copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.connections-row__title {
  font-size: 15px;
  line-height: 1.25;
  font-weight: 600;
  color: #3c3c43;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.connections-row__subtitle {
  font-size: 12px;
  line-height: 1.3;
  color: #8e8e93;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 重连中/异常时副标题转橙，这是设计稿里唯一的「行内告警」表达。 */
.connections-row__subtitle--warn {
  color: #cc6b00;
}

.connections-row__trailing {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.connections-row__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #8e8e93;
}

.connections-row__dot--online {
  background: #34c759;
}

.connections-row__dot--reconnecting {
  background: #ff9500;
}

.connections-row__dot--error {
  background: #ff3b30;
}

/*
 * 设计稿把整行的操作入口收成了「只有一行字」，但现有功能（断开/编辑/删除/配置码…）
 * 不能丢，所以压成一枚 3 点按钮放在状态点右边 —— 比长按更显性，代价是多一个元素。
 * 点击区做成 24×24 但视觉只有 16，避免 12px 的行间距里点到隔壁。
 */
.connections-row__more {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin-right: -4px;
}

/* ---------- 其他入口 ---------- */

.connections-entry {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
}

.connections-entry__icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.05);
}

.connections-entry__icon--primary {
  background: rgba(0, 122, 255, 0.12);
}

.connections-entry__icon-text {
  font-size: 17px;
  line-height: 1;
  font-weight: 700;
  color: #8e8e93;
}

.connections-entry__icon-text--primary {
  color: #007aff;
}

.connections-entry__copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.connections-entry__title {
  font-size: 15px;
  line-height: 1.25;
  font-weight: 600;
  color: #3c3c43;
}

.connections-entry__desc {
  font-size: 12px;
  line-height: 1.3;
  color: #8e8e93;
}

/* ---------- 空态 ---------- */

.connections-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 24px;
  border-radius: 16px;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.06);
  text-align: center;
}

.connections-empty__title {
  font-size: 15px;
  font-weight: 600;
  color: #3c3c43;
}

.connections-empty__desc {
  font-size: 12px;
  line-height: 1.5;
  color: #8e8e93;
}

.connections-empty__actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.connections-empty__primary,
.connections-empty__secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
}

.connections-empty__primary {
  background: #007aff;
  color: #ffffff;
}

.connections-empty__secondary {
  background: rgba(0, 122, 255, 0.12);
  color: #007aff;
}

/* ---------- 深色 ---------- */

/*
 * 深色值全部取设计稿深色板：卡片 #1C1C1E、主文字白、副文字 #9999A1、
 * 分隔线 8% 白、描边同样 8% 白。判据是 `[data-up-theme='dark']`（uview 写入），
 * 不是 `prefers-color-scheme` —— 用户在 app 内手动选深色时系统偏好仍是 light。
 */
[data-up-theme='dark'] {
  .connections-brand__mark,
  .connections-row__title,
  .connections-entry__title,
  .connections-empty__title {
    color: #ffffff;
  }

  .connections-brand__slogan,
  .connections-group-title,
  .connections-row__subtitle,
  .connections-entry__desc,
  .connections-empty__desc {
    color: #9999a1;
  }

  .connections-brand__action,
  .connections-empty__primary {
    background: #0a84ff;
  }

  .connections-row__host--device {
    background: #0a84ff;
  }

  .connections-row__host--cloud {
    background: #7d7af2;
  }

  .connections-row__host--other {
    background: #8c8c94;
  }

  .connections-list,
  .connections-empty {
    background: #1c1c1e;
    border-color: rgba(255, 255, 255, 0.08);
  }

  .connections-divider {
    background: rgba(255, 255, 255, 0.08);
  }

  .connections-row:active,
  .connections-entry:active {
    background: rgba(255, 255, 255, 0.05);
  }

  .connections-row__subtitle--warn {
    color: #ff9e0a;
  }

  .connections-entry__icon {
    background: rgba(255, 255, 255, 0.08);
  }

  .connections-entry__icon--primary {
    background: rgba(10, 132, 255, 0.22);
  }

  .connections-entry__icon-text {
    color: #9999a1;
  }

  .connections-entry__icon-text--primary {
    color: #0a84ff;
  }

  .connections-empty__secondary {
    background: rgba(10, 132, 255, 0.18);
    color: #0a84ff;
  }
}

/* ---------- 弹层（添加/编辑、教程、配置码）：样式沿用改造前的版本 ---------- */

.connections-config-code,
.connections-sheet,
.connections-tutorial {
  border-radius: 32rpx;
  box-shadow: 0 10rpx 26rpx rgba(15, 23, 42, 0.08);
}





.connections-sheet__subtitle,
.connections-sheet__tutorial-desc,
.connections-tutorial__subtitle,
.connections-tutorial__step-desc {
  font-size: 24rpx;
  line-height: 1.6;
  color: var(--up-content-color, #606266);
}








.connections-sheet__title,
.connections-tutorial__title {
  font-size: 34rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}








































.connections-sheet__heading,
.connections-tutorial__heading {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  min-width: 0;
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

.connections-sheet__host-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  width: 100%;
  padding: 18rpx 20rpx;
  border-radius: 22rpx;
  border: 1rpx solid var(--up-border-color, #dadbde);
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.connections-sheet__host-copy {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  min-width: 0;
}

.connections-sheet__host-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 26rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.connections-sheet__host-subtitle {
  font-size: 22rpx;
  color: var(--up-tips-color, #909193);
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
