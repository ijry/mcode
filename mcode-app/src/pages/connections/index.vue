<template>
  <view class="page">
    <view v-if="false" class="hero-banner">
      <image
        class="hero-banner__img"
        src="/static/illustrations/connection-ai-coding-hero.svg"
        mode="widthFix"
      />
    </view>

    <view class="header">
      <view class="add-conn-btn" @click="showAddPopup = true">
        <u-icon name="plus" size="18" color="#2979ff"></u-icon>
        <text class="add-conn-btn__text">新增连接</text>
      </view>
    </view>

    <view v-if="connections.length === 0" class="empty-container">
      <u-empty mode="data" text="暂无连接">
        <template #bottom>
          <u-button type="primary" @click="showAddPopup = true" size="normal">
            立即添加
          </u-button>
        </template>
      </u-empty>
    </view>

    <view v-else class="connection-list">
      <view
        v-for="(conn, index) in connections"
        :key="index"
        class="connection-item"
        @click="activateConnection(conn)"
      >
        <view
          class="connection-icon"
          :style="{ backgroundColor: (isConnectionConnected(conn) ? '#19be6b' : '#909399') + '18' }"
        >
          <u-icon
            :name="conn.mode === 'direct' ? 'wifi' : 'cloud'"
            size="24"
            :color="isConnectionConnected(conn) ? '#19be6b' : '#909399'"
          ></u-icon>
        </view>

        <view class="connection-info">
          <view class="connection-info__title">
            <text class="connection-info__name">{{ conn.name }}</text>
            <view
              :class="['status-dot', isConnectionConnected(conn) && 'status-dot--online']"
            ></view>
          </view>
          <text class="connection-info__desc">
            {{ conn.mode === 'direct' ? '直连模式' : '中继模式' }} · {{ conn.url }}
          </text>
        </view>

        <view class="row-menu-btn" @click.stop="showConnectionMenu(conn, index)">
          <u-icon name="more-dot-fill" color="#c0c4cc" size="18"></u-icon>
        </view>
      </view>
    </view>

    <view v-if="false" class="app-intro-box">
      <text class="app-intro-text">
        本APP是一个远程遥控APP，可以遥控电脑上的CodeX/Claude Code等进行随时随地任务处理，电脑/服务器端需要安装codeg
      </text>
    </view>

    <!-- 连接操作菜单 -->
    <u-action-sheet
      :show="showActionSheet"
      :actions="connectionActions"
      @select="handleActionSelect"
      @close="showActionSheet = false"
    ></u-action-sheet>

    <u-popup v-model:show="showAddPopup" mode="bottom" :round="10">
      <view class="popup-content">
        <view class="popup-header">
          <text class="popup-title">新增连接</text>
          <u-icon name="close" size="24" @click="showAddPopup = false"></u-icon>
        </view>

        <u-subsection
          :list="['手动配置', '扫码连接']"
          :current="subsectionIndex"
          @change="subsectionChange"
          activeColor="#2979ff"
        ></u-subsection>

        <view v-if="subsectionIndex === 0" class="form-container">
          <u-form :model="form" ref="formRef" labelWidth="80">
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

          <view class="form-actions">
            <u-button type="primary" @click="submitConnection" :loading="loading" block>
              保存连接
            </u-button>
          </view>
        </view>

        <view v-else class="scan-container">
          <u-empty mode="coupon" text="扫码功能暂未支持">
            <template #bottom>
              <text class="tip-text">敬请期待</text>
            </template>
          </u-empty>
        </view>
      </view>
    </u-popup>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue"
import { useAuthStore } from "@/stores/auth"
import { createGateway } from "@/services/gateway"
import type { RelaySessionInfo } from "@/services/gateway"

declare const plus: any

const auth = useAuthStore()
const showAddPopup = ref(false)
const subsectionIndex = ref(0)
const loading = ref(false)
const showActionSheet = ref(false)
const currentConnectionIndex = ref(-1)
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

async function submitConnection() {
  if (!form.value.name) {
    uni.showToast({ title: "请输入连接名称", icon: "none" })
    return
  }

  loading.value = true

  try {
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

      saveConnection(newConnection)
      setConnectionConnected(newConnection, true)
      persistConnectedMap()
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

        saveConnection(newConnection)
        setConnectionConnected(newConnection, true)
        persistConnectedMap()
        uni.showToast({ title: "配对成功", icon: "success" })
      }
    }

    showAddPopup.value = false
    resetForm()
    loadConnections()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    uni.showToast({ title: `连接失败: ${message}`, icon: "none", duration: 3000 })
  } finally {
    loading.value = false
  }
}

function saveConnection(conn: ConnectionItem) {
  const savedConnections = uni.getStorageSync("mcode_connections") || []

  const existingIndex = savedConnections.findIndex(
    (c: ConnectionItem) => c.mode === conn.mode && c.url === conn.url
  )

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
      protocols: ["codeg-events", encodeTokenProtocol(token)],
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

function encodeTokenProtocol(token: string) {
  const utf8 = new TextEncoder().encode(String(token || "").trim())
  let binary = ""
  utf8.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return `codeg-token.${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")}`
}

function createH5StatusSocket(url: string, token: string): StatusSocket {
  const socket = new WebSocket(url, ["codeg-events", encodeTokenProtocol(token)])
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
  background-color: #ffffff;
}

.hero-banner {
  padding: 20rpx 24rpx 10rpx;
  background-color: #ffffff;
}

.hero-banner__img {
  width: 100%;
  display: block;
  border-radius: 18rpx;
}

.header {
  padding: 10rpx 24rpx 20rpx;
  background-color: #ffffff;
  border-bottom: 1rpx solid #e4e7ed;
}

.add-conn-btn {
  height: 76rpx;
  border: 2rpx dashed #8fb8ff;
  border-radius: 14rpx;
  background-color: #f8fbff;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;

  &:active {
    background-color: #edf4ff;
    border-color: #7aa9ff;
  }
}

.add-conn-btn__text {
  font-size: 28rpx;
  color: #2979ff;
  font-weight: 500;
}

.empty-container {
  padding-top: 200rpx;
}

.connection-list {
  padding: 20rpx 24rpx;
}

.app-intro-box {
  margin: 420rpx 108rpx 44rpx;
  padding: 18rpx 20rpx;
  border: 2rpx dashed #f3f5f8;
  border-radius: 14rpx;
  background-color: #fefefe;
}

.app-intro-text {
  font-size: 24rpx;
  line-height: 1.7;
  color: #b0b7c3;
}

.connection-item {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 20rpx 16rpx;
  background-color: #f8f9fa;
  border-radius: 16rpx;
  margin-bottom: 10rpx;
  transition: background-color 0.15s;

  &:active { background-color: #f0f0f0; }
}

.connection-icon {
  width: 76rpx;
  height: 76rpx;
  border-radius: 18rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.connection-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.connection-info__name {
  font-size: 30rpx;
  font-weight: 500;
  color: #1d1d1f;
}

.connection-info__title {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.connection-info__desc {
  font-size: 24rpx;
  color: #86909c;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background-color: #c0c4cc;
  flex-shrink: 0;
}

.status-dot--online {
  background-color: #19be6b;
}

.connection-item:last-child {
  margin-bottom: 8rpx;
}

.row-menu-btn {
  width: 44rpx;
  height: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12rpx;
}

.popup-content {
  padding: 40rpx 30rpx;
  background-color: #ffffff;
  border-radius: 20rpx 20rpx 0 0;
  max-height: 80vh;
}

.popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 30rpx;
}

.popup-title {
  font-size: 36rpx;
  font-weight: 600;
  color: #303133;
}

.form-container {
  margin-top: 40rpx;
}

.form-actions {
  margin-top: 60rpx;
  padding-bottom: 20rpx;
}

.scan-container {
  padding: 100rpx 0;
}

.tip-text {
  font-size: 28rpx;
  color: #909399;
}
</style>
