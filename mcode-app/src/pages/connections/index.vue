<template>
  <view class="page">
    <view class="header">
      <u-button type="primary" @click="showAddPopup = true" icon="plus" size="large">
        新增连接
      </u-button>
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
        @longpress="showConnectionMenu(conn, index)"
      >
        <view class="connection-info">
          <view class="connection-name">
            <u-icon
              :name="conn.mode === 'direct' ? 'wifi' : 'cloud'"
              size="20"
              :color="conn.active ? '#2979ff' : '#909399'"
            ></u-icon>
            <text class="name-text">{{ conn.name }}</text>
            <u-tag v-if="conn.active" text="当前" type="primary" size="mini"></u-tag>
          </view>
          <view class="connection-url">{{ conn.url }}</view>
          <view class="connection-mode">
            <u-tag
              :text="conn.mode === 'direct' ? '直连模式' : '中继模式'"
              type="info"
              size="mini"
              plain
            ></u-tag>
          </view>
        </view>
        <u-icon name="more-dot-fill" color="#c0c4cc" size="18"></u-icon>
      </view>
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
                <u-radio label="direct" name="直连模式"></u-radio>
                <u-radio label="relay" name="中继模式"></u-radio>
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
import { ref, computed, onMounted } from "vue"
import { useAuthStore } from "@/stores/auth"
import { createGateway } from "@/services/gateway"

const auth = useAuthStore()
const showAddPopup = ref(false)
const subsectionIndex = ref(0)
const loading = ref(false)
const showActionSheet = ref(false)
const currentConnectionIndex = ref(-1)

interface ConnectionItem {
  name: string
  mode: "direct" | "relay"
  url: string
  active: boolean
  directToken?: string
  pairCode?: string
  pairSecret?: string
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
  const actions = []

  if (!current?.active) {
    actions.push({ name: "切换", color: "#2979ff" })
  }

  actions.push(
    { name: "编辑", color: "#19be6b" },
    { name: "删除", color: "#fa3534" }
  )

  return actions
})

onMounted(() => {
  loadConnections()
})

function loadConnections() {
  const savedConnections = uni.getStorageSync("mcode_connections") || []
  const currentMode = auth.mode
  const currentUrl = currentMode === "direct" ? auth.directBaseUrl : auth.relayUrl

  connections.value = savedConnections.map((conn: ConnectionItem) => ({
    ...conn,
    active: conn.mode === currentMode && conn.url === currentUrl,
  }))
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
        }

        saveConnection(newConnection)
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

  // 将所有连接设为非激活
  savedConnections.forEach((c: ConnectionItem) => {
    c.active = false
  })

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
  const action = e.name
  const conn = connections.value[currentConnectionIndex.value]

  if (!conn) return

  if (action === "切换") {
    switchConnection(conn)
  } else if (action === "编辑") {
    editConnection(conn, currentConnectionIndex.value)
  } else if (action === "删除") {
    deleteConnection(currentConnectionIndex.value)
  }

  showActionSheet.value = false
}

async function activateConnection(conn: ConnectionItem) {
  if (conn.active) return

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
        auth.setRelayMode(conn.url, session)
      }
    }

    // 更新激活状态
    const savedConnections = uni.getStorageSync("mcode_connections") || []
    savedConnections.forEach((c: ConnectionItem) => {
      c.active = c.mode === conn.mode && c.url === conn.url
    })
    uni.setStorageSync("mcode_connections", savedConnections)

    uni.showToast({ title: "切换成功", icon: "success" })
    loadConnections()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    uni.showToast({ title: `切换失败: ${message}`, icon: "none", duration: 3000 })
  }
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

        // 如果删除的是当前激活的连接，清除认证信息
        if (conn.active) {
          auth.clearAuth()
        }

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
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  background-color: #f8f8f8;
}

.header {
  padding: 20rpx 30rpx;
  background-color: #ffffff;
  border-bottom: 1rpx solid #e4e7ed;
}

.empty-container {
  padding-top: 200rpx;
}

.connection-list {
  padding: 20rpx 0;
}

.connection-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 30rpx;
  margin: 20rpx 30rpx;
  background-color: #ffffff;
  border-radius: 16rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.05);
}

.connection-info {
  flex: 1;
}

.connection-name {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 12rpx;
}

.name-text {
  font-size: 32rpx;
  font-weight: 500;
  color: #303133;
}

.connection-url {
  font-size: 26rpx;
  color: #909399;
  margin-left: 32rpx;
  margin-bottom: 8rpx;
}

.connection-mode {
  margin-left: 32rpx;
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
