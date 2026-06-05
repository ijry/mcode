<template>
  <view class="page">
    <!-- 添加待办 -->
    <view class="add-bar">
      <view class="add-input-wrap">
        <u-input
          v-model="newTodoText"
          placeholder="输入待办事项..."
          border="none"
          :custom-style="{ fontSize: '30rpx' }"
          @confirm="addTodo"
        ></u-input>
      </view>
      <u-button
        class="add-btn"
        type="primary"
        size="small"
        :disabled="!newTodoText.trim()"
        @click="addTodo"
      >
        添加
      </u-button>
    </view>

    <!-- 待办列表 -->
    <view class="todo-list" v-if="todos.length > 0">
      <view
        v-for="item in todos"
        :key="item.id"
        class="todo-item"
        :class="{ completed: item.completed }"
      >
        <!-- 勾选框 -->
        <view class="todo-checkbox" @click="toggleTodo(item.id)">
          <view class="checkbox-circle" :class="{ checked: item.completed }">
            <u-icon v-if="item.completed" name="checkmark" size="16" color="#fff"></u-icon>
          </view>
        </view>

        <!-- 文字 / 编辑输入框 -->
        <view class="todo-text-wrap" @click="startEdit(item)">
          <text v-if="editingId !== item.id" class="todo-text">{{ item.text }}</text>
          <u-input
            v-else
            v-model="editingText"
            border="none"
            :focus="true"
            :custom-style="{ fontSize: '30rpx' }"
            @blur="finishEdit(item)"
            @confirm="finishEdit(item)"
          ></u-input>
        </view>

        <!-- 操作按钮 -->
        <view class="todo-actions">
          <view class="todo-action-btn" @click="openSendSheet(item)">
            <u-icon name="chat" size="20" color="#2979ff"></u-icon>
          </view>
          <view class="todo-action-btn" @click="deleteTodo(item.id)">
            <u-icon name="close-circle" size="20" color="#c0c4cc"></u-icon>
          </view>
        </view>
      </view>
    </view>

    <!-- 空状态 -->
    <view class="empty-state" v-else>
      <u-icon name="checkbox-mark" size="100" color="#c8ccd0"></u-icon>
      <text class="empty-text">暂无待办事项</text>
      <text class="empty-hint">在上方输入框添加待办</text>
    </view>

    <!-- 发送到新会话底部弹层 -->
    <up-popup v-model:show="showSendDialog" mode="bottom" :round="28">
      <view class="create-sheet">
        <view class="create-sheet__hd">
          <text class="create-sheet__title">发送到新会话</text>
          <view class="create-sheet__close" @click="showSendDialog = false">
            <up-icon name="close" size="20" color="#909399"></up-icon>
          </view>
        </view>

        <!-- 待办内容预览 -->
        <view class="form-group">
          <text class="form-label">待办内容</text>
          <view class="send-preview">
            <text class="send-preview__text">{{ sendingTodo?.text || '' }}</text>
          </view>
        </view>

        <view class="form-group">
          <text class="form-label">连接</text>
          <view class="form-readonly" @click="showConnectionPicker = true">
            <text class="form-readonly__text">{{ selectedConnectionName || '请选择连接' }}</text>
            <up-icon name="arrow-down" size="14" color="#c0c4cc"></up-icon>
          </view>
        </view>

        <view class="form-group">
          <text class="form-label">项目</text>
          <view class="form-readonly" @click="showProjectPicker = true">
            <text class="form-readonly__text">{{ selectedProjectName || '请选择' }}</text>
            <up-icon name="arrow-down" size="14" color="#c0c4cc"></up-icon>
          </view>
        </view>

        <view class="form-group">
          <text class="form-label">模型</text>
          <view class="form-readonly" @click="showAgentPicker = true">
            <text class="form-readonly__text">{{ selectedAgentName }}</text>
            <up-icon name="arrow-down" size="14" color="#c0c4cc"></up-icon>
          </view>
        </view>

        <view class="form-group">
          <text class="form-label">补充说明（可选）</text>
          <up-textarea
            v-model="sendExtraContent"
            placeholder="可以补充更多上下文..."
            autoHeight
            count
            :maxlength="1200"
          ></up-textarea>
        </view>

        <up-button
          type="primary"
          :loading="sending"
          :disabled="!selectedProjectId || !selectedConnectionKey"
          shape="circle"
          @click="confirmSend"
          customStyle="margin-top:16rpx"
        >发送到新会话</up-button>

        <view class="safe-bottom"></view>
      </view>
    </up-popup>

    <!-- 连接 Picker -->
    <up-picker
      :show="showConnectionPicker"
      :columns="connectionColumns"
      @confirm="onConnectionConfirm"
      @cancel="showConnectionPicker = false"
    ></up-picker>

    <!-- 项目 Picker -->
    <up-picker
      :show="showProjectPicker"
      :columns="projectColumns"
      @confirm="onProjectConfirm"
      @cancel="showProjectPicker = false"
    ></up-picker>

    <!-- 智能体 Picker -->
    <up-picker
      :show="showAgentPicker"
      :columns="agentColumns"
      @confirm="onAgentConfirm"
      @cancel="showAgentPicker = false"
    ></up-picker>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue"
import { onShow } from "@dcloudio/uni-app"
import { useAuthStore } from "@/stores/auth"
import { createGateway } from "@/services/gateway"
import { toErrorMessage } from "@/services/gateway/error"
import type { RelaySessionInfo } from "@/services/gateway"
import type { ConnectionInfo } from "@/types/acp"

/* ===== 类型 ===== */
interface TodoItem {
  id: string
  text: string
  completed: boolean
  createdAt: number
}

interface ConnectionItem {
  name: string
  mode: "direct" | "relay"
  url: string
  directToken?: string
  pairCode?: string
  pairSecret?: string
  relaySession?: RelaySessionInfo
}

interface Project {
  id: number
  name: string
  path: string
}

interface ConnectionGroup {
  key: string
  name: string
  mode: "direct" | "relay"
  url: string
  projects: Project[]
}

/* ===== 基础待办 ===== */
const STORAGE_KEY = "mcode_todos"
const auth = useAuthStore()

const todos = ref<TodoItem[]>([])
const newTodoText = ref("")
const editingId = ref<string | null>(null)
const editingText = ref("")

/* ===== 发送到新会话 ===== */
const showSendDialog = ref(false)
const sendingTodo = ref<TodoItem | null>(null)
const sendExtraContent = ref("")
const sending = ref(false)

const showConnectionPicker = ref(false)
const showProjectPicker = ref(false)
const showAgentPicker = ref(false)

const connectionGroups = ref<ConnectionGroup[]>([])
const selectedConnectionKey = ref("")
const selectedConnectionName = ref("")
const selectedProjectId = ref<number>(0)
const selectedProjectName = ref("")
const selectedAgentType = ref("claude_code")
const selectedAgentName = ref("Claude Code")

const connectionColumns = computed(() => [
  connectionGroups.value.map((group) => ({
    text: group.name,
    value: group.key,
  })),
])

const selectedConnectionGroup = computed(() =>
  connectionGroups.value.find((group) => group.key === selectedConnectionKey.value)
)

const projectColumns = computed(() => [
  (selectedConnectionGroup.value?.projects || []).map((p) => ({
    text: p.name || p.path || "未命名项目",
    value: p.id,
  })),
])

const agentColumns = ref([
  [
    { text: "Claude Code", value: "claude_code" },
    { text: "Codex CLI",   value: "codex"       },
    { text: "OpenCode",    value: "open_code"   },
    { text: "Gemini CLI",  value: "gemini"      },
    { text: "OpenClaw",    value: "open_claw"   },
    { text: "Cline",       value: "cline"       },
  ],
])

/* ===== 生命周期 ===== */
onMounted(() => {
  loadTodos()
})

onShow(() => {
  loadTodos()
})

/* ===== 待办增删改查 ===== */
function loadTodos() {
  const saved = uni.getStorageSync(STORAGE_KEY)
  if (saved && Array.isArray(saved)) {
    todos.value = saved
  }
}

function saveTodos() {
  uni.setStorageSync(STORAGE_KEY, todos.value)
}

function addTodo() {
  const text = newTodoText.value.trim()
  if (!text) return

  todos.value.unshift({
    id: Date.now().toString(),
    text,
    completed: false,
    createdAt: Date.now(),
  })
  newTodoText.value = ""
  saveTodos()
}

function toggleTodo(id: string) {
  const item = todos.value.find((t) => t.id === id)
  if (item) {
    item.completed = !item.completed
    saveTodos()
  }
}

function startEdit(item: TodoItem) {
  if (item.completed) return
  editingId.value = item.id
  editingText.value = item.text
}

function finishEdit(item: TodoItem) {
  const text = editingText.value.trim()
  if (text && text !== item.text) {
    item.text = text
    saveTodos()
  } else if (!text) {
    todos.value = todos.value.filter((t) => t.id !== item.id)
    saveTodos()
  }
  editingId.value = null
  editingText.value = ""
}

function deleteTodo(id: string) {
  todos.value = todos.value.filter((t) => t.id !== id)
  saveTodos()
}

/* ===== 连接相关工具函数 ===== */
function normalizeList(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === "object" && Array.isArray((raw as any).items)) return (raw as any).items
  if (raw && typeof raw === "object" && Array.isArray((raw as any).data)) return (raw as any).data
  return []
}

function normalizeBaseUrl(url: string): string {
  return String(url || "").trim().replace(/\/+$/, "")
}

function connectionKey(conn: Pick<ConnectionItem, "mode" | "url">): string {
  return `${conn.mode}::${normalizeBaseUrl(conn.url)}`
}

function getConnectedConnections(): ConnectionItem[] {
  const savedConnections = normalizeList(uni.getStorageSync("mcode_connections")) as ConnectionItem[]
  const connectedMap = (uni.getStorageSync("mcode_connected_map") || {}) as Record<string, boolean>
  return savedConnections.filter((conn) => Boolean(connectedMap[connectionKey(conn)]))
}

async function createConnectionGateway(conn: ConnectionItem) {
  if (conn.mode === "direct") {
    if (!conn.directToken) {
      throw new Error(`${conn.name} 缺少直连令牌`)
    }
    const gateway = createGateway({
      mode: "direct",
      directBaseUrl: conn.url,
    })
    await gateway.pair({
      directBaseUrl: conn.url,
      token: conn.directToken,
    })
    return gateway
  }

  if (!conn.relaySession?.accessToken) {
    if (!conn.pairCode || !conn.pairSecret) {
      throw new Error(`${conn.name} 缺少中继配对信息`)
    }
    const pairGateway = createGateway({
      mode: "relay",
      relayUrl: conn.url,
      session: { accessToken: "" },
    })
    const session = await pairGateway.pair({
      relayUrl: conn.url,
      code: conn.pairCode,
      secret: conn.pairSecret,
    })
    if (!session) {
      throw new Error(`${conn.name} 中继会话无效`)
    }
    conn.relaySession = session
  }

  return createGateway({
    mode: "relay",
    relayUrl: conn.url,
    session: conn.relaySession,
  })
}

function syncAuthToConnection(conn: ConnectionItem) {
  if (conn.mode === "direct") {
    const token = conn.directToken || String(uni.getStorageSync("mcode_direct_token") || "")
    if (!token) return
    auth.setDirectMode(conn.url, token)
    return
  }
  if (conn.relaySession?.accessToken) {
    auth.setRelayMode(conn.url, conn.relaySession)
  }
}

function currentAuthConnectionKey(): string {
  const mode = auth.mode
  const url = mode === "direct" ? auth.directBaseUrl : auth.relayUrl
  if (!url) return ""
  return connectionKey({ mode, url })
}

async function loadConnectionGroups() {
  const connected = getConnectedConnections()
  if (connected.length === 0) return

  const groups: ConnectionGroup[] = []
  for (const conn of connected) {
    try {
      const gateway = await createConnectionGateway(conn)
      const foldersRaw = await gateway.call<unknown>("list_open_folder_details")
      const folders = normalizeList(foldersRaw) as Project[]
      groups.push({
        key: connectionKey(conn),
        name: conn.name,
        mode: conn.mode,
        url: conn.url,
        projects: folders,
      })
    } catch (error) {
      console.warn("加载连接组失败:", conn.name, error)
    }
  }
  connectionGroups.value = groups
}

/* ===== 发送到新会话 ===== */
async function openSendSheet(item: TodoItem) {
  sendingTodo.value = item
  sendExtraContent.value = ""

  // 重置选择
  selectedConnectionKey.value = ""
  selectedConnectionName.value = ""
  selectedProjectId.value = 0
  selectedProjectName.value = ""
  selectedAgentType.value = "claude_code"
  selectedAgentName.value = "Claude Code"

  showSendDialog.value = true

  // 加载连接组
  if (connectionGroups.value.length === 0) {
    try {
      await loadConnectionGroups()
    } catch (error) {
      console.warn("加载连接失败:", error)
    }
  }

  // 自动选中当前认证的连接
  const currentKey = currentAuthConnectionKey()
  if (currentKey && connectionGroups.value.find((g) => g.key === currentKey)) {
    applySelectedConnection(currentKey)
  } else if (connectionGroups.value.length > 0) {
    applySelectedConnection(connectionGroups.value[0].key)
  }
}

function applySelectedConnection(key: string) {
  const group = connectionGroups.value.find((g) => g.key === key)
  if (!group) return
  selectedConnectionKey.value = group.key
  selectedConnectionName.value = group.name
  selectedProjectId.value = 0
  selectedProjectName.value = ""
}

function onConnectionConfirm(e: any) {
  const sel = e.value[0]
  applySelectedConnection(String(sel.value || ""))
  showConnectionPicker.value = false
}

function onProjectConfirm(e: any) {
  const sel = e.value[0]
  selectedProjectId.value = sel.value
  selectedProjectName.value = sel.text
  showProjectPicker.value = false
}

function onAgentConfirm(e: any) {
  const sel = e.value[0]
  selectedAgentType.value = sel.value
  selectedAgentName.value = sel.text
  showAgentPicker.value = false
}

function parseConversationId(input: unknown): number {
  if (typeof input === "number" && Number.isFinite(input)) return input
  if (typeof input === "string") {
    const parsed = Number(input)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  if (input && typeof input === "object") {
    const maybeId = (input as any).id ?? (input as any).conversationId
    if (typeof maybeId === "number" && Number.isFinite(maybeId)) return maybeId
    if (typeof maybeId === "string") {
      const parsed = Number(maybeId)
      if (Number.isFinite(parsed) && parsed > 0) return parsed
    }
  }
  return 0
}

function resolveConnectedSessionId(connection: ConnectionInfo | null | undefined) {
  if (!connection || typeof connection !== "object") return ""
  return String(connection.sessionId || "").trim()
}

async function confirmSend() {
  if (!sendingTodo.value) return
  if (!selectedConnectionKey.value) {
    uni.showToast({ title: "请选择连接", icon: "none" })
    return
  }
  if (!selectedProjectId.value) {
    uni.showToast({ title: "请选择项目", icon: "none" })
    return
  }

  sending.value = true
  try {
    const targetConn = getConnectedConnections().find(
      (item) => connectionKey(item) === selectedConnectionKey.value
    )
    if (!targetConn) {
      throw new Error("连接不存在或已断开")
    }
    const gateway = await createConnectionGateway(targetConn)
    syncAuthToConnection(targetConn)
    const selectedProject = selectedConnectionGroup.value?.projects.find(
      (project) => Number(project.id || 0) === selectedProjectId.value
    )
    if (!selectedProject) {
      throw new Error("项目不存在或列表已过期，请重新选择")
    }

    // 组装发送内容
    const extra = sendExtraContent.value.trim()
    const taskContent = extra
      ? `${sendingTodo.value.text}\n\n${extra}`
      : sendingTodo.value.text

    // 创建会话
    const createResult = await gateway.call<any>("create_conversation", {
      folderId: selectedProjectId.value,
      agentType: selectedAgentType.value,
      title: sendingTodo.value.text.slice(0, 50),
    })
    const newConversationId = parseConversationId(createResult)
    if (!newConversationId) {
      throw new Error("创建会话失败：返回数据异常")
    }

    // 连接并发送第一条消息
    const connectionInfo = await gateway.call<ConnectionInfo>("acp_connect", {
      agentType: selectedAgentType.value,
      workingDir: selectedProject.path || undefined,
    })
    const acpConnectionId = typeof connectionInfo === "string"
      ? connectionInfo
      : String(connectionInfo?.id || "").trim()
    if (!acpConnectionId) {
      throw new Error("智能体连接失败：返回数据异常")
    }
    await gateway.call("acp_prompt", {
      connectionId: acpConnectionId,
      blocks: [{ type: "text", text: taskContent }],
      folderId: selectedProjectId.value,
      conversationId: newConversationId,
    })

    const sessionId = resolveConnectedSessionId(connectionInfo)
    if (!sessionId) {
      console.warn("todo send conversation missing sessionId after acp_connect", {
        conversationId: newConversationId,
        connectionId: acpConnectionId,
      })
    }

    // 标记待办已完成
    const item = todos.value.find((t) => t.id === sendingTodo.value!.id)
    if (item) {
      item.completed = true
      saveTodos()
    }

    uni.showToast({ title: "已发送到新会话", icon: "success" })
    showSendDialog.value = false

    // 跳转到新会话
    const connKey = selectedConnectionKey.value
    const encodedConnKey = connKey ? encodeURIComponent(connKey) : ""
    uni.navigateTo({
      url: `/pages/conversation-detail/index?id=${newConversationId}&folderId=${selectedProjectId.value}${encodedConnKey ? `&connectionKey=${encodedConnKey}` : ""}`,
    })
  } catch (error) {
    const msg = toErrorMessage(error)
    uni.showToast({ title: `发送失败: ${msg}`, icon: "none", duration: 3000 })
  } finally {
    sending.value = false
  }
}
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  background-color: #f8f8f8;
  padding-bottom: calc(40rpx + env(safe-area-inset-bottom));
}

.add-bar {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 20rpx 24rpx;
  background-color: #fff;
  border-bottom: 1rpx solid #f0f0f0;
}

.add-input-wrap {
  flex: 1;
  min-width: 0;
  background-color: #f5f6f8;
  border-radius: 16rpx;
  padding: 8rpx 20rpx;
}

.add-btn {
  width: auto !important;
  flex-shrink: 0;
}

.todo-list {
  margin: 20rpx 8rpx;
  background-color: #fff;
  border-radius: 26rpx;
  overflow: hidden;
}

.todo-item {
  display: flex;
  align-items: center;
  padding: 28rpx 24rpx;
  border-bottom: 1rpx solid #f5f5f5;
  gap: 20rpx;

  &:last-child {
    border-bottom: none;
  }
}

.todo-checkbox {
  flex-shrink: 0;
}

.checkbox-circle {
  width: 44rpx;
  height: 44rpx;
  border-radius: 50%;
  border: 3rpx solid #dcdfe6;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;

  &.checked {
    background-color: #2979ff;
    border-color: #2979ff;
  }
}

.todo-text-wrap {
  flex: 1;
  min-width: 0;
}

.todo-text {
  font-size: 30rpx;
  color: #303133;
  line-height: 1.5;
}

.completed .todo-text {
  color: #c0c4cc;
  text-decoration: line-through;
}

.todo-actions {
  display: flex;
  align-items: center;
  gap: 8rpx;
  flex-shrink: 0;
}

.todo-action-btn {
  width: 52rpx;
  height: 52rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;

  &:active {
    background-color: #f5f6f8;
  }
}

.todo-delete {
  flex-shrink: 0;
  padding: 8rpx;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-top: 200rpx;
  gap: 16rpx;
}

.empty-text {
  font-size: 30rpx;
  color: #909399;
  margin-top: 20rpx;
}

.empty-hint {
  font-size: 26rpx;
  color: #c0c4cc;
}

/* ===== 发送弹层 ===== */
.create-sheet {
  padding: 36rpx 20rpx 0;
  background-color: #ffffff;
  border-radius: 28rpx 28rpx 0 0;
}

.create-sheet__hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 32rpx;
}

.create-sheet__title {
  font-size: 34rpx;
  font-weight: 600;
  color: #1d1d1f;
}

.create-sheet__close {
  width: 56rpx;
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f5f5f5;
  border-radius: 50%;
}

.form-group {
  margin-bottom: 28rpx;
}

.form-label {
  display: block;
  font-size: 26rpx;
  color: #86909c;
  margin-bottom: 12rpx;
}

.form-readonly {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 24rpx;
  background-color: #f5f6f8;
  border-radius: 56rpx;
}

.form-readonly__text {
  font-size: 28rpx;
  color: #303133;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.send-preview {
  padding: 20rpx 24rpx;
  background-color: #f0f6ff;
  border-radius: 16rpx;
  border: 1rpx solid #d4e4ff;
}

.send-preview__text {
  font-size: 28rpx;
  color: #2979ff;
  line-height: 1.5;
  word-break: break-all;
}

.safe-bottom {
  height: calc(32rpx + env(safe-area-inset-bottom));
}
</style>
