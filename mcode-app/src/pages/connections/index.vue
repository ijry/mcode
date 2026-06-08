<template>
  <view class="page connections-page" :style="[upThemeVars, upThemePageStyle, { backgroundColor: '#f2f2f7' }]">
    <view class="connections-shell">
      <view class="connections-topbar">
        <view class="connections-brand">
          <text class="connections-brand__mark">MCode</text>
          <text class="connections-brand__title">我的连接</text>
          <text class="connections-brand__subtitle">管理与切换你的远程连接</text>
        </view>

        <view class="connections-topbar__action" @click="openAddPopup()">
          <u-icon name="plus" size="16" color="#ffffff"></u-icon>
          <text class="connections-topbar__action-text">新增连接</text>
        </view>
      </view>

      <view class="connections-hero" :style="upThemeCardStyle">
        <view class="connections-hero__copy">
          <text class="connections-hero__eyebrow">REMOTE CONTROL</text>
          <text class="connections-hero__title">连接状态一眼可见</text>
          <text class="connections-hero__desc">直连与中继统一管理，随时切换当前生效设备。</text>

          <view class="connections-hero__chips">
            <text class="connections-hero__chip">自动监测在线</text>
            <text class="connections-hero__chip connections-hero__chip--ghost">教程指引</text>
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

        <text class="connections-empty__title">还没有连接</text>
        <text class="connections-empty__desc">添加直连或中继设备后，就能在这里快速切换和管理。</text>

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
          :class="{ 'connection-card--online': isConnectionConnected(conn) }"
          :style="upThemeCardStyle"
          @click="activateConnection(conn)"
        >
          <view
            class="connection-card__icon"
            :class="{ 'connection-card__icon--online': isConnectionConnected(conn) }"
          >
            <u-icon
              :name="conn.mode === 'direct' ? 'wifi' : 'cloud'"
              size="24"
              :color="isConnectionConnected(conn) ? '#007aff' : '#8e8e93'"
            ></u-icon>
          </view>

          <view class="connection-card__body">
            <view class="connection-card__head">
              <text class="connection-card__name">{{ conn.name }}</text>
              <view
                class="connection-card__status"
                :class="{ 'connection-card__status--online': isConnectionConnected(conn) }"
              >
                <text class="connection-card__status-text">
                  {{ getConnectionBadgeText(isConnectionConnected(conn)) }}
                </text>
              </view>
              <view class="connection-card__menu" @click.stop="showConnectionMenu(conn, index)">
                <u-icon name="more-dot-fill" size="18" color="#c7c7cc"></u-icon>
              </view>
            </view>

            <text class="connection-card__meta">
              {{ getConnectionSubtitle(conn.mode, conn.url) }}
            </text>

            <view class="connection-card__footer">
              <text class="connection-card__footer-link">管理连接</text>
              <u-icon name="arrow-right" size="14" color="#007aff"></u-icon>
            </view>
          </view>
        </view>

        <view class="connections-add-card" :style="upThemeCardStyle" @click="openAddPopup()">
          <view class="connections-add-card__icon">
            <u-icon name="plus" size="24" color="#007aff"></u-icon>
          </view>

          <view class="connections-add-card__body">
            <text class="connections-add-card__title">添加新设备</text>
            <text class="connections-add-card__desc">新增直连或中继连接</text>
          </view>

          <u-icon name="arrow-right" size="14" color="#c7c7cc"></u-icon>
        </view>

        <view class="connections-guide-card" :style="upThemeCardStyle" @click="openTutorialPopup">
          <view class="connections-guide-card__copy">
            <text class="connections-guide-card__eyebrow">SETUP GUIDE</text>
            <text class="connections-guide-card__title">先完成电脑端部署</text>
            <text class="connections-guide-card__desc">打开 codeg Web 服务后，再回到这里保存连接。</text>
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

    <u-popup :show="showAddPopup" mode="bottom" :round="28" @close="closeAddPopup">
      <view class="connections-sheet" :style="upThemeCardStyle">
        <view class="connections-sheet__handle"></view>

        <view class="connections-sheet__header">
          <view class="connections-sheet__heading">
            <text class="connections-sheet__title">{{ popupTitle }}</text>
            <text class="connections-sheet__subtitle">保存后可直接切换和在线监测</text>
          </view>
          <u-icon name="close" size="22" @click="closeAddPopup()"></u-icon>
        </view>

        <view class="connections-sheet__tutorial" @click="openTutorialPopup">
          <view class="connections-sheet__tutorial-copy">
            <text class="connections-sheet__tutorial-title">部署教程</text>
            <text class="connections-sheet__tutorial-desc">首次使用前请先完成电脑端配置</text>
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

            <u-form-item label="连接模式" prop="mode" required>
              <u-radio-group v-model="form.mode" placement="row">
                <u-radio name="direct" label="直连模式"></u-radio>
                <u-radio name="relay" label="中继模式"></u-radio>
              </u-radio-group>
            </u-form-item>

            <view v-if="form.mode === 'direct'">
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
              <u-form-item label="中继地址" prop="relayUrl" required>
                <u-input
                  v-model="form.relayUrl"
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
            </view>
          </u-form>

          <view class="connections-sheet__actions">
            <u-button type="primary" @click="submitConnection" :loading="loading" block>
              保存连接
            </u-button>
          </view>
        </view>

        <view v-else class="connections-sheet__scan">
          <u-empty mode="coupon" text="扫码功能暂未支持">
            <template #bottom>
              <text class="connections-sheet__tip">敬请期待</text>
            </template>
          </u-empty>
        </view>
      </view>
    </u-popup>

    <u-popup v-model:show="showTutorialPopup" mode="center" :round="20">
      <view class="connections-tutorial">
        <view class="connections-tutorial__header">
          <view class="connections-tutorial__heading">
            <text class="connections-tutorial__title">部署教程</text>
            <text class="connections-tutorial__subtitle">跟着这 3 步完成电脑端配置</text>
          </view>
          <u-icon name="close" size="22" @click="showTutorialPopup = false"></u-icon>
        </view>

        <view class="connections-tutorial__steps">
          <view class="connections-tutorial__step">
            <text class="connections-tutorial__index">1</text>
            <view class="connections-tutorial__body">
              <text class="connections-tutorial__step-title">在自己电脑下载安装 codeg</text>
              <text class="connections-tutorial__link" @click="openDeploymentGuideLink">
                {{ DEPLOYMENT_GUIDE_URL }}
              </text>
            </view>
          </view>

          <view class="connections-tutorial__step">
            <text class="connections-tutorial__index">2</text>
            <view class="connections-tutorial__body">
              <text class="connections-tutorial__step-title">
                打开 codeg，点击右上角齿轮图标，然后点击 web服务 开启
              </text>
              <text class="connections-tutorial__step-desc">拷贝这里的连接地址和访问 token</text>
            </view>
          </view>

          <view class="connections-tutorial__step">
            <text class="connections-tutorial__index">3</text>
            <view class="connections-tutorial__body">
              <text class="connections-tutorial__step-title">
                如果需要外网访问，请使用 ngrok 等内网穿透工具即可
              </text>
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
import { useAuthStore } from "@/stores/auth"
import { createGateway } from "@/services/gateway"
import type { RelaySessionInfo } from "@/services/gateway"
import { buildWebSocketProtocols } from "@/services/gateway/wsProtocol"

declare const plus: any

const DEPLOYMENT_GUIDE_URL = "https://github.com/xintaofei/codeg/releases"

const auth = useAuthStore()
const formRef = ref()
const showAddPopup = ref(false)
const showTutorialPopup = ref(false)
const subsectionIndex = ref(0)
const loading = ref(false)
const showActionSheet = ref(false)
const currentConnectionIndex = ref(-1)
const editingConnectionKey = ref("")
const connectedMap = ref<Record<string, boolean>>({})
const onlineMap = ref<Record<string, boolean>>({})
type StatusSocket = Pick<UniApp.SocketTask, "onOpen" | "onClose" | "onError" | "close">
const statusSocketMap = new Map<string, StatusSocket>()
const reconnectTimerMap = new Map<string, ReturnType<typeof setTimeout>>()
const stoppedWatcherKeys = new Set<string>()

interface ConnectionItem {
  name: string
  mode: "direct" | "relay"
  url: string
  active?: boolean
  directToken?: string
  pairCode?: string
  pairSecret?: string
  relaySession?: RelaySessionInfo
}

const form = ref({
  name: "",
  mode: "direct" as "direct" | "relay",
  directBaseUrl: "",
  directToken: "",
  relayUrl: "",
  pairCode: "",
  pairSecret: "",
})

const connections = ref<ConnectionItem[]>([])
const popupTitle = computed(() => (editingConnectionKey.value ? "编辑连接" : "新增连接"))

const connectionActions = computed(() => {
  const current = connections.value[currentConnectionIndex.value]
  const isConnected = current ? isConnectionConnected(current) : false
  const isLinked = current ? isConnectionLinked(current) : false
  return [
    { name: "连接", color: "#2979ff", disabled: isConnected },
    { name: "断开连接", color: "#fa8c16", disabled: !isLinked },
    { name: "编辑", color: "#19be6b" },
    { name: "删除", color: "#fa3534" },
  ]
})

function getConnectionSubtitle(mode: ConnectionItem["mode"], url: string) {
  const modeText = mode === "direct" ? "直连模式" : "中继模式"
  return `${modeText} · ${normalizeBaseUrl(url)}`
}

function getConnectionBadgeText(online: boolean) {
  return online ? "在线" : "离线"
}

onMounted(() => {
  connectedMap.value = uni.getStorageSync("mcode_connected_map") || {}
  loadConnections()
})

onUnmounted(() => {
  cleanupOnlineWatchers()
})

function loadConnections() {
  const savedConnections = uni.getStorageSync("mcode_connections") || []

  connections.value = savedConnections.map((conn: ConnectionItem) => ({
    ...conn,
  }))
  pruneConnectedMapByConnections()
  syncOnlineWatchers()
  void refreshOnlineStatus()
}

function subsectionChange(index: number) {
  subsectionIndex.value = index
}

function openTutorialPopup() {
  showTutorialPopup.value = true
}

function openDeploymentGuideLink() {
  try {
    if (isH5WebSocketRuntime()) {
      window.open(DEPLOYMENT_GUIDE_URL, "_blank", "noopener,noreferrer")
      return
    }

    if (typeof plus !== "undefined" && plus?.runtime?.openURL) {
      plus.runtime.openURL(DEPLOYMENT_GUIDE_URL)
      return
    }

    throw new Error("unsupported runtime")
  } catch {
    uni.showToast({
      title: "打开链接失败，请手动访问",
      icon: "none",
      duration: 2500,
    })
  }
}

async function submitConnection() {
  if (!form.value.name) {
    uni.showToast({ title: "请输入连接名称", icon: "none" })
    return
  }

  loading.value = true

  try {
    const previousKey = editingConnectionKey.value
    if (form.value.mode === "direct") {
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

      auth.setDirectMode(form.value.directBaseUrl, form.value.directToken)

      const newConnection: ConnectionItem = {
        name: form.value.name,
        mode: "direct",
        url: form.value.directBaseUrl,
        active: true,
        directToken: form.value.directToken,
      }

      saveConnection(newConnection, previousKey || undefined)
      syncConnectionRuntimeState(previousKey, newConnection)
      uni.showToast({ title: "连接成功", icon: "success" })
    } else {
      if (!form.value.relayUrl || !form.value.pairCode || !form.value.pairSecret) {
        uni.showToast({ title: "请填写完整信息", icon: "none" })
        return
      }

      const gateway = createGateway({
        mode: "relay",
        relayUrl: form.value.relayUrl,
        session: { accessToken: "" },
      })

      const session = await gateway.pair({
        relayUrl: form.value.relayUrl,
        code: form.value.pairCode,
        secret: form.value.pairSecret,
      })

      if (session) {
        auth.setRelayMode(form.value.relayUrl, session)

        const newConnection: ConnectionItem = {
          name: form.value.name,
          mode: "relay",
          url: form.value.relayUrl,
          active: true,
          pairCode: form.value.pairCode,
          pairSecret: form.value.pairSecret,
          relaySession: session,
        }

        saveConnection(newConnection, previousKey || undefined)
        syncConnectionRuntimeState(previousKey, newConnection)
        uni.showToast({ title: "配对成功", icon: "success" })
      }
    }

    closeAddPopup()
    loadConnections()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    uni.showToast({ title: `连接失败: ${message}`, icon: "none", duration: 3000 })
  } finally {
    loading.value = false
  }
}

function saveConnection(conn: ConnectionItem, originalKey?: string) {
  const savedConnections = uni.getStorageSync("mcode_connections") || []

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
  }

  setConnectionConnected(conn, true)
  persistConnectedMap()
  syncOnlineWatchers()
  void refreshOnlineStatus()
}

function handleActionSelect(e: any) {
  const action = resolveActionName(e)
  const conn = connections.value[currentConnectionIndex.value]

  if (!conn || !action) return

  if (action === "连接") {
    if (isCurrentConnection(conn) && isConnectionConnected(conn)) {
      uni.showToast({ title: "当前已连接", icon: "none" })
      showActionSheet.value = false
      return
    }
    switchConnection(conn)
  } else if (action === "断开连接") {
    disconnectConnection(conn)
  } else if (action === "编辑") {
    editConnection(conn, currentConnectionIndex.value)
  } else if (action === "删除") {
    deleteConnection(currentConnectionIndex.value)
  }

  showActionSheet.value = false
}

async function activateConnection(conn: ConnectionItem) {
  if (isCurrentConnection(conn)) return

  uni.showModal({
    title: "切换连接",
    content: `确定切换到 ${conn.name} 吗？`,
    success: (res) => {
      if (res.confirm) {
        switchConnection(conn)
      }
    },
  })
}

async function switchConnection(conn: ConnectionItem) {
  try {
    if (conn.mode === "direct") {
      if (!conn.directToken) {
        uni.showToast({ title: "连接信息不完整", icon: "none" })
        return
      }

      const gateway = createGateway({
        mode: "direct",
        directBaseUrl: conn.url,
      })

      await gateway.pair({
        directBaseUrl: conn.url,
        token: conn.directToken,
      })

      auth.setDirectMode(conn.url, conn.directToken)
    } else {
      if (!conn.pairCode || !conn.pairSecret) {
        uni.showToast({ title: "连接信息不完整", icon: "none" })
        return
      }

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

      if (session) {
        conn.relaySession = session
        saveConnection(conn)
        auth.setRelayMode(conn.url, session)
      }
    }

    setConnectionConnected(conn, true)
    persistConnectedMap()
    syncOnlineWatchers()
    void refreshOnlineStatus()
    uni.showToast({ title: "连接成功", icon: "success" })
    loadConnections()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    uni.showToast({ title: `连接失败: ${message}`, icon: "none", duration: 3000 })
  }
}

function disconnectConnection(conn: ConnectionItem) {
  const key = connectionKey(conn)
  setConnectionConnected(conn, false)
  persistConnectedMap()
  stopOnlineWatcher(key)
  const nextOnline = { ...onlineMap.value }
  delete nextOnline[key]
  onlineMap.value = nextOnline
  if (isCurrentConnection(conn)) {
    auth.clearAuth()
  }
  uni.showToast({ title: "已断开连接", icon: "success" })
  loadConnections()
}

function editConnection(conn: ConnectionItem, index: number) {
  editingConnectionKey.value = connectionKey(conn)
  form.value.name = conn.name
  form.value.mode = conn.mode

  if (conn.mode === "direct") {
    form.value.directBaseUrl = conn.url
    form.value.directToken = conn.directToken || ""
  } else {
    form.value.relayUrl = conn.url
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
        const savedConnections = uni.getStorageSync("mcode_connections") || []
        savedConnections.splice(index, 1)
        uni.setStorageSync("mcode_connections", savedConnections)
        setConnectionConnected(conn, false)
        persistConnectedMap()
        stopOnlineWatcher(connectionKey(conn))
        const nextOnline = { ...onlineMap.value }
        delete nextOnline[connectionKey(conn)]
        onlineMap.value = nextOnline

        // 删除当前连接时仅移除记录，不在此处强制改写当前认证状态

        uni.showToast({ title: "删除成功", icon: "success" })
        loadConnections()
      }
    },
  })
}

function resetForm() {
  editingConnectionKey.value = ""
  form.value = {
    name: "",
    mode: "direct",
    directBaseUrl: "",
    directToken: "",
    relayUrl: "",
    pairCode: "",
    pairSecret: "",
  }
}

function normalizeBaseUrl(url: string): string {
  return String(url || "").trim().replace(/\/+$/, "")
}

function connectionKey(conn: Pick<ConnectionItem, "mode" | "url">): string {
  return `${conn.mode}::${normalizeBaseUrl(conn.url)}`
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
    return
  }

  const connectedConnections = connections.value.filter((conn) =>
    Boolean(connectedMap.value[connectionKey(conn)])
  )
  if (!connectedConnections.length) {
    onlineMap.value = {}
    return
  }

  const results = await Promise.all(
    connectedConnections.map(async (conn) => ({
      key: connectionKey(conn),
      online: await probeConnectionOnline(conn),
    }))
  )

  const next: Record<string, boolean> = {}
  results.forEach((item) => {
    if (item.online) {
      next[item.key] = true
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
    const socketTask = await createStatusSocket(conn)
    stoppedWatcherKeys.delete(key)
    statusSocketMap.set(key, socketTask)
    let disconnected = false
    const handleDisconnect = () => {
      if (disconnected) return
      disconnected = true
      statusSocketMap.delete(key)
      setOnlineStatus(key, false)
      if (stoppedWatcherKeys.has(key)) {
        stoppedWatcherKeys.delete(key)
        return
      }
      scheduleReconnect(key)
    }
    socketTask.onOpen(() => {
      setOnlineStatus(key, true)
      clearReconnectTimer(key)
    })
    socketTask.onClose(handleDisconnect)
    socketTask.onError(handleDisconnect)
  } catch {
    setOnlineStatus(key, false)
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

  const timer = setTimeout(() => {
    reconnectTimerMap.delete(key)
    if (!connectedMap.value[key]) return
    const conn = connections.value.find((item) => connectionKey(item) === key)
    if (!conn) return
    void startOnlineWatcher(conn)
  }, 3000)
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

async function probeConnectionOnline(conn: ConnectionItem): Promise<boolean> {
  if (conn.mode === "direct") {
    return probeDirectOnline(conn)
  }
  return probeRelayOnline(conn)
}

async function probeDirectOnline(conn: ConnectionItem): Promise<boolean> {
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
    return Number(res.statusCode) >= 200 && Number(res.statusCode) < 400
  } catch {
    return false
  }
}

async function probeRelayOnline(conn: ConnectionItem): Promise<boolean> {
  try {
    const session = await ensureRelaySession(conn)
    if (!session?.accessToken) return false

    const response = await uni.request({
      url: `${normalizeBaseUrl(conn.url)}/v1/targets`,
      method: "GET",
      header: {
        authorization: `Bearer ${session.accessToken}`,
      },
      timeout: 3000,
    })

    if (Number(response.statusCode) !== 200) return false

    const data = response.data as
      | {
          currentTargetId?: string
          targets?: Array<{ targetId?: string; online?: boolean }>
        }
      | undefined
    const currentTargetId = data?.currentTargetId
    const target = (data?.targets || []).find((item) => item.targetId === currentTargetId)
    return Boolean(target?.online)
  } catch {
    return false
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

function isCurrentConnection(conn: ConnectionItem): boolean {
  const currentMode = auth.mode
  const currentUrl = currentMode === "direct" ? auth.directBaseUrl : auth.relayUrl
  return conn.mode === currentMode && normalizeBaseUrl(conn.url) === normalizeBaseUrl(currentUrl)
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
  color: #007aff;
}

.connections-brand__title {
  font-size: 42rpx;
  line-height: 1.2;
  font-weight: 700;
  color: #1d1d1f;
}

.connections-brand__subtitle {
  font-size: 26rpx;
  line-height: 1.5;
  color: #8e8e93;
}

.connections-topbar__action {
  display: inline-flex;
  align-items: center;
  gap: 10rpx;
  padding: 18rpx 24rpx;
  border-radius: 999rpx;
  background: linear-gradient(135deg, #0a84ff, #0066cc);
  box-shadow: 0 20rpx 40rpx rgba(0, 122, 255, 0.22);
}

.connections-topbar__action-text {
  font-size: 24rpx;
  font-weight: 600;
  color: #ffffff;
}

.connections-hero,
.connections-empty,
.connection-card,
.connections-add-card,
.connections-guide-card,
.connections-sheet,
.connections-tutorial {
  border-radius: 32rpx;
  box-shadow: 0 18rpx 48rpx rgba(60, 64, 67, 0.08);
}

.connections-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  padding: 30rpx;
  margin-bottom: 24rpx;
  overflow: hidden;
  background: linear-gradient(135deg, rgba(0, 122, 255, 0.14), rgba(255, 255, 255, 0.92));
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
  color: #007aff;
}

.connections-hero__title {
  font-size: 36rpx;
  line-height: 1.25;
  font-weight: 700;
  color: #1d1d1f;
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
  color: #6e6e73;
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
  background: rgba(0, 122, 255, 0.12);
  color: #007aff;
}

.connections-hero__chip--ghost {
  background: rgba(255, 255, 255, 0.86);
  color: #1d1d1f;
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
  background: #ffffff;
}

.connections-empty__icon {
  width: 104rpx;
  height: 104rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(0, 122, 255, 0.1);
}

.connections-empty__title,
.connections-sheet__title,
.connections-guide-card__title,
.connections-tutorial__title {
  font-size: 34rpx;
  font-weight: 700;
  color: #1d1d1f;
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
  background: #007aff;
  color: #ffffff;
}

.connections-empty__secondary {
  background: rgba(0, 122, 255, 0.1);
  color: #007aff;
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
  background: #ffffff;
}

.connection-card--online {
  box-shadow: 0 22rpx 50rpx rgba(0, 122, 255, 0.1);
}

.connection-card__icon {
  width: 88rpx;
  height: 88rpx;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 26rpx;
  background: rgba(142, 142, 147, 0.1);
}

.connection-card__icon--online {
  background: rgba(0, 122, 255, 0.12);
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
  color: #1d1d1f;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.connection-card__status {
  display: inline-flex;
  align-items: center;
  padding: 8rpx 14rpx;
  border-radius: 999rpx;
  background: rgba(142, 142, 147, 0.12);
}

.connection-card__status--online {
  background: rgba(52, 199, 89, 0.14);
}

.connection-card__status-text {
  font-size: 20rpx;
  font-weight: 700;
  color: #8e8e93;
}

.connection-card__status--online .connection-card__status-text {
  color: #34c759;
}

.connection-card__menu {
  width: 48rpx;
  height: 48rpx;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(142, 142, 147, 0.08);
}

.connection-card__meta {
  font-size: 24rpx;
  line-height: 1.5;
  color: #6e6e73;
  word-break: break-all;
}

.connection-card__footer {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  margin-top: 4rpx;
}

.connection-card__footer-link {
  font-size: 22rpx;
  font-weight: 600;
  color: #007aff;
}

.connections-add-card,
.connections-guide-card {
  display: flex;
  align-items: center;
  gap: 18rpx;
  margin-top: 18rpx;
  padding: 24rpx;
  background: #ffffff;
}

.connections-add-card__icon {
  width: 72rpx;
  height: 72rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 22rpx;
  background: rgba(0, 122, 255, 0.1);
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
  color: #1d1d1f;
}

.connections-guide-card {
  align-items: flex-start;
  justify-content: space-between;
  background: linear-gradient(135deg, #0a84ff, #0066cc);
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

.connections-sheet {
  padding: 18rpx 24rpx 28rpx;
  background: #ffffff;
}

.connections-sheet__handle {
  width: 88rpx;
  height: 8rpx;
  margin: 0 auto 18rpx;
  border-radius: 999rpx;
  background: #d1d1d6;
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
  background: rgba(0, 122, 255, 0.08);
}

.connections-sheet__tutorial-title {
  font-size: 26rpx;
  font-weight: 600;
  color: #007aff;
}

.connections-sheet__tutorial-desc,
.connections-sheet__tip,
.connections-tutorial__link {
  font-size: 22rpx;
  color: #6e6e73;
}

.connections-sheet__tabs {
  margin-bottom: 18rpx;
}

.connections-sheet__form,
.connections-sheet__scan {
  padding-bottom: 8rpx;
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
  background: #ffffff;
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
  background: #f2f2f7;
}

.connections-tutorial__index {
  width: 52rpx;
  height: 52rpx;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #007aff;
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
  color: #1d1d1f;
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
}
</style>
