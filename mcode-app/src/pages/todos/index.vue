<template>
  <view class="page todo-page" :style="[upThemeVars, upThemePageStyle]">
    <view class="todo-shell">
      <up-sticky class="todo-sticky" :offset-top="0" :custom-nav-height="0" :bg-color="upThemeVar('--up-page-bg-color', '#f5f5f7')" z-index="20">
        <TodoPageHeader
          v-model:activeTab="activeTab"
          v-model:searchKeyword="searchKeyword"
          @create="openCreatePopup"
        />
      </up-sticky>

      <view class="todo-body" v-if="activeTab === 'local'">
        <TodoSectionBlock title="进行中">
          <TodoCardList
            :items="localInProgressTodos"
            mode="in-progress"
            emptyText="暂无进行中的待办"
            @toggle="toggleTodo"
            @edit="startEdit"
            @send="openSendSheet"
            @menu="openTodoMenu"
          />
        </TodoSectionBlock>

        <TodoSectionBlock
          title="已完成"
          actionText="清除全部"
          :disabled="localCompletedTodos.length === 0"
          @action="clearCompletedTodos"
        >
          <TodoCardList
            :items="localCompletedTodos"
            mode="completed"
            emptyText="暂无已完成待办"
            @toggle="toggleTodo"
            @send="openSendSheet"
            @menu="openTodoMenu"
          />
        </TodoSectionBlock>
      </view>

      <view v-else class="todo-body">
        <view v-if="!isLoggedIn" class="todo-empty-card todo-empty-card--actionable" @click="goLogin">
          <text class="todo-empty-card__title">登录后查看云端待办</text>
          <text class="todo-empty-card__desc">云端待办与你的账号、圈子使用同一账号体系。</text>
        </view>

        <template v-else>
          <TodoSectionBlock title="进行中">
            <TodoCardList
              :items="cloudInProgressTodos"
              mode="in-progress"
              :emptyText="cloudLoading ? '加载中...' : '暂无进行中的待办'"
              @toggle="toggleCloudTodo"
              @edit="startCloudEdit"
              @send="openSendSheet"
              @menu="openCloudTodoMenu"
            />
          </TodoSectionBlock>

          <TodoSectionBlock
            title="已完成"
            actionText="清除全部"
            :disabled="cloudCompletedTodos.length === 0"
            @action="clearCloudCompletedTodos"
          >
            <TodoCardList
              :items="cloudCompletedTodos"
              mode="completed"
              :emptyText="cloudLoading ? '加载中...' : '暂无已完成待办'"
              @toggle="toggleCloudTodo"
              @send="openSendSheet"
              @menu="openCloudTodoMenu"
            />
          </TodoSectionBlock>
        </template>
      </view>
    </view>

    <TodoCreatePopup
      v-model:show="showCreatePopup"
      @submit="createTodoFromPopup"
    />
    <TodoCreatePopup
      v-model:show="showEditPopup"
      title="编辑待办"
      submitLabel="保存"
      :initialValue="editingText"
      @submit="finishEdit"
    />

    <!-- 发送到新会话底部弹层 -->
    <up-popup v-model:show="showSendDialog" mode="bottom" :round="28">
      <view class="create-sheet" :style="upThemeCardStyle">
        <view class="create-sheet__hd">
          <text class="create-sheet__title">发送到新会话</text>
          <view class="create-sheet__close" @click="showSendDialog = false">
            <up-icon name="close" size="20" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
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
            <up-icon name="arrow-down" size="14" :color="upThemeVar('--up-light-color', '#c0c4cc')"></up-icon>
          </view>
        </view>

        <view class="form-group">
          <text class="form-label">项目</text>
          <view class="form-readonly" @click="showProjectPicker = true">
            <text class="form-readonly__text">{{ selectedProjectName || '请选择' }}</text>
            <up-icon name="arrow-down" size="14" :color="upThemeVar('--up-light-color', '#c0c4cc')"></up-icon>
          </view>
        </view>

        <view class="form-group">
          <text class="form-label">模型</text>
          <view class="form-readonly" @click="showAgentPicker = true">
            <text class="form-readonly__text">{{ selectedAgentName }}</text>
            <up-icon name="arrow-down" size="14" :color="upThemeVar('--up-light-color', '#c0c4cc')"></up-icon>
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

    <up-action-sheet
      :show="showTodoActionSheet"
      :actions="todoActions"
      @select="handleTodoActionSelect"
      @close="showTodoActionSheet = false"
    ></up-action-sheet>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue"
import { onShow } from "@dcloudio/uni-app"
import TodoCardList from "./components/TodoCardList.vue"
import TodoCreatePopup from "./components/TodoCreatePopup.vue"
import TodoPageHeader from "./components/TodoPageHeader.vue"
import TodoSectionBlock from "./components/TodoSectionBlock.vue"
import { useAuthStore } from "@/stores/auth"
import { useAccountStore } from "@/stores/account"
import { createGateway } from "@/services/gateway"
import { getDirectToken } from "@/services/gateway/directTokenStore"
import { toErrorMessage } from "@/services/gateway/error"
import type { RelaySessionInfo } from "@/services/gateway"
import type { ConnectionInfo } from "@/types/acp"
import { usePetStore } from "@/stores/pet"
import { XycloudApiError } from "@/services/xycloudAuth"
import {
  CLOUD_TODO_STATUS_DONE,
  CLOUD_TODO_STATUS_PENDING,
  createCloudTodo,
  deleteCloudTodo,
  fetchCloudTodos,
  updateCloudTodo,
  type CloudTodoItem,
} from "@/services/cloudTodo"
import {
  applyTodoEdit,
  createTodoItem,
  getVisibleTodoSections,
  hideCompletedTodos,
  normalizeStoredTodos,
  toggleTodoCompletion,
  type TodoItem,
  type TodoTab,
} from "./todoState"

/* ===== 类型 ===== */
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
const account = useAccountStore()

const todos = ref<TodoItem[]>([])
const activeTab = ref<TodoTab>("local")
const searchKeyword = ref("")
const editingId = ref<string | null>(null)
const editingText = ref("")
const showCreatePopup = ref(false)
const showEditPopup = ref(false)

/* ===== 云端待办 ===== */
const cloudTodos = ref<CloudTodoItem[]>([])
const cloudLoading = ref(false)
const cloudLoaded = ref(false)
const editingCloudId = ref<string | null>(null)
const currentTodoIsCloud = ref(false)
const isLoggedIn = computed(() => account.isLoggedIn)

/* ===== 发送到新会话 ===== */
const showSendDialog = ref(false)
const sendingTodo = ref<TodoItem | null>(null)
const sendExtraContent = ref("")
const sending = ref(false)
const showTodoActionSheet = ref(false)
const currentTodo = ref<TodoItem | null>(null)

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
const todoActions = [
  { name: "复制", color: "#2979ff" },
  { name: "删除", color: "#fa3534" },
]

const selectedConnectionGroup = computed(() =>
  connectionGroups.value.find((group) => group.key === selectedConnectionKey.value)
)
const localSections = computed(() =>
  getVisibleTodoSections(todos.value, searchKeyword.value)
)
const localInProgressTodos = computed(() => localSections.value.inProgress)
const localCompletedTodos = computed(() => localSections.value.completed)

/* 云端待办映射为通用 TodoItem 后复用同一套区块/卡片组件 */
function cloudToTodoItem(item: CloudTodoItem): TodoItem {
  return {
    id: item.id,
    text: item.title,
    completed: item.completed,
    createdAt: item.createTime * 1000,
    completedAt: item.doneTime ? item.doneTime * 1000 : null,
    hidden: false,
    hiddenAt: null,
  }
}

const cloudSections = computed(() =>
  getVisibleTodoSections(cloudTodos.value.map(cloudToTodoItem), searchKeyword.value)
)
const cloudInProgressTodos = computed(() => cloudSections.value.inProgress)
const cloudCompletedTodos = computed(() => cloudSections.value.completed)

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
  if (activeTab.value === "cloud" && isLoggedIn.value) {
    void loadCloudTodos()
  }
})

watch(activeTab, (tab) => {
  if (tab === "cloud" && isLoggedIn.value && !cloudLoaded.value) {
    void loadCloudTodos()
  }
})

/* ===== 待办增删改查 ===== */
function loadTodos() {
  try {
    todos.value = normalizeStoredTodos(uni.getStorageSync(STORAGE_KEY))
  } catch (error) {
    console.warn("load todos failed:", error)
    todos.value = []
  }
}

function saveTodos() {
  try {
    uni.setStorageSync(STORAGE_KEY, todos.value)
  } catch (error) {
    console.warn("save todos failed:", error)
    uni.showToast({ title: "保存失败", icon: "none" })
  }
}

function openCreatePopup() {
  if (activeTab.value === "cloud" && !isLoggedIn.value) {
    goLogin()
    return
  }
  showCreatePopup.value = true
}

async function createTodoFromPopup(text: string) {
  if (activeTab.value === "cloud") {
    await createCloudTodoFromPopup(text)
    return
  }
  todos.value.unshift(createTodoItem(text, Date.now()))
  saveTodos()
}

function toggleTodo(id: string) {
  const before = todos.value.find((item) => item.id === id)
  const wasIncomplete = Boolean(before && !before.completed)
  todos.value = toggleTodoCompletion(todos.value, id, Date.now())
  saveTodos()
  if (wasIncomplete) {
    const petStore = usePetStore()
    petStore.addExp("user", 15)
    petStore.recordStat("totalTodosCompleted")
  }
}

function clearCompletedTodos() {
  if (activeTab.value === "cloud") {
    uni.showToast({ title: "云端待办即将上线", icon: "none" })
    return
  }
  uni.showModal({
    title: "清除已完成",
    content: "这些待办会被标记隐藏，之后不再显示。",
    success: (res) => {
      if (!res.confirm) return
      const visibleCompletedIds = localCompletedTodos.value.map((item) => item.id)
      todos.value = hideCompletedTodos(todos.value, visibleCompletedIds, Date.now())
      saveTodos()
    },
  })
}

function startEdit(item: TodoItem) {
  if (item.completed) return
  editingId.value = item.id
  editingText.value = item.text
  showEditPopup.value = true
}

function finishEdit(value: string) {
  if (editingCloudId.value) {
    void finishCloudEdit(value)
    return
  }
  if (!editingId.value) return
  editingText.value = value
  todos.value = applyTodoEdit(todos.value, editingId.value, editingText.value)
  saveTodos()
  editingId.value = null
  editingText.value = ""
  showEditPopup.value = false
}

function deleteTodo(id: string) {
  todos.value = todos.value.filter((t) => t.id !== id)
  saveTodos()
}

function openTodoMenu(item: TodoItem) {
  currentTodo.value = item
  currentTodoIsCloud.value = false
  showTodoActionSheet.value = true
}

function resolveTodoActionName(e: any): string {
  if (typeof e === "string") return e
  if (e && typeof e.name === "string") return e.name
  if (e && typeof e.index === "number") {
    return todoActions[e.index]?.name || ""
  }
  return ""
}

function copyTodoText(text: string) {
  uni.setClipboardData({
    data: text,
    success: () => {
      uni.showToast({ title: "已复制", icon: "success" })
    },
    fail: () => {
      uni.showToast({ title: "复制失败", icon: "none" })
    },
  })
}

function confirmDeleteTodo(item: TodoItem) {
  uni.showModal({
    title: "确认删除",
    content: "确定要删除这个待办吗？此操作不可恢复。",
    success: (res) => {
      if (!res.confirm) return
      if (currentTodoIsCloud.value) {
        void deleteCloudTodoById(item.id)
        return
      }
      deleteTodo(item.id)
      uni.showToast({ title: "删除成功", icon: "success" })
    },
  })
}

function handleTodoActionSelect(e: any) {
  const item = currentTodo.value
  const action = resolveTodoActionName(e)
  showTodoActionSheet.value = false
  if (!item || !action) return
  if (action === "复制") {
    copyTodoText(item.text)
    return
  }
  if (action === "删除") {
    confirmDeleteTodo(item)
  }
}

/* ===== 云端待办：与账号、圈子同域名（resolveXycloudBaseUrl），同账号 token ===== */
function goLogin() {
  uni.navigateTo({ url: "/pages/auth/login" })
}

function handleCloudError(error: unknown, fallback: string) {
  if (error instanceof XycloudApiError) {
    uni.showToast({ title: "登录已失效，请重新登录", icon: "none" })
    account.logout()
    goLogin()
    return
  }
  uni.showToast({ title: toErrorMessage(error) || fallback, icon: "none" })
}

async function loadCloudTodos() {
  if (!isLoggedIn.value) return
  cloudLoading.value = true
  try {
    cloudTodos.value = await fetchCloudTodos()
    cloudLoaded.value = true
  } catch (error) {
    handleCloudError(error, "加载云端待办失败")
  } finally {
    cloudLoading.value = false
  }
}

async function createCloudTodoFromPopup(text: string) {
  const title = text.trim()
  if (!title) return
  try {
    await createCloudTodo({ title })
    await loadCloudTodos()
  } catch (error) {
    handleCloudError(error, "创建云端待办失败")
  }
}

async function toggleCloudTodo(id: string) {
  const target = cloudTodos.value.find((item) => item.id === id)
  if (!target) return
  const nextStatus = target.completed ? CLOUD_TODO_STATUS_PENDING : CLOUD_TODO_STATUS_DONE
  // 乐观更新
  target.completed = !target.completed
  target.status = nextStatus
  try {
    await updateCloudTodo({ id, status: nextStatus })
    if (nextStatus === CLOUD_TODO_STATUS_DONE) {
      const petStore = usePetStore()
      petStore.addExp("user", 15)
      petStore.recordStat("totalTodosCompleted")
    }
  } catch (error) {
    target.completed = !target.completed
    target.status = target.completed ? CLOUD_TODO_STATUS_DONE : CLOUD_TODO_STATUS_PENDING
    handleCloudError(error, "更新云端待办失败")
  }
}

function startCloudEdit(item: TodoItem) {
  if (item.completed) return
  editingCloudId.value = item.id
  editingText.value = item.text
  showEditPopup.value = true
}

async function finishCloudEdit(value: string) {
  const id = editingCloudId.value
  showEditPopup.value = false
  editingCloudId.value = null
  editingText.value = ""
  const title = value.trim()
  if (!id) return
  if (!title) {
    await deleteCloudTodoById(id)
    return
  }
  try {
    await updateCloudTodo({ id, title })
    await loadCloudTodos()
  } catch (error) {
    handleCloudError(error, "更新云端待办失败")
  }
}

function openCloudTodoMenu(item: TodoItem) {
  currentTodo.value = item
  currentTodoIsCloud.value = true
  showTodoActionSheet.value = true
}

async function deleteCloudTodoById(id: string) {
  try {
    await deleteCloudTodo(id)
    cloudTodos.value = cloudTodos.value.filter((item) => item.id !== id)
    uni.showToast({ title: "删除成功", icon: "success" })
  } catch (error) {
    handleCloudError(error, "删除云端待办失败")
  }
}

function clearCloudCompletedTodos() {
  const completedIds = cloudCompletedTodos.value.map((item) => item.id)
  if (completedIds.length === 0) return
  uni.showModal({
    title: "清除已完成",
    content: `确定删除 ${completedIds.length} 条已完成的云端待办吗？此操作不可恢复。`,
    success: async (res) => {
      if (!res.confirm) return
      try {
        for (const id of completedIds) {
          await deleteCloudTodo(id)
        }
        cloudTodos.value = cloudTodos.value.filter((item) => !completedIds.includes(item.id))
        uni.showToast({ title: "已清除", icon: "success" })
      } catch (error) {
        handleCloudError(error, "清除云端待办失败")
        await loadCloudTodos()
      }
    },
  })
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
    const token = conn.directToken || getDirectToken(conn.url)
    if (!token) return
    auth.setDirectMode(conn.url, token)
    return
  }
  if (conn.relaySession?.accessToken) {
    auth.setRelayMode(conn.url, conn.relaySession)
  }
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

  if (connectionGroups.value.length > 0) {
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
  padding: 0 !important;
}

.todo-page {
  background: var(--up-page-bg-color, var(--up-bg-color, #f3f4f6));
}

.todo-shell {
  min-height: 100vh;
  padding: 0 24rpx 40rpx;
}

.todo-sticky {
  position: relative;
  z-index: 20;
}

.todo-sticky :deep(.u-sticky__content) {
  padding-top: 28rpx;
  background: var(--up-page-bg-color, var(--up-bg-color, #f3f4f6));
}

.todo-body {
  display: flex;
  flex-direction: column;
  gap: 28rpx;
  padding-bottom: calc(36rpx + env(safe-area-inset-bottom));
}

/* ===== 发送弹层 ===== */
.create-sheet {
  padding: 36rpx 20rpx 0;
  background-color: var(--up-card-bg-color, #ffffff);
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
  color: var(--up-main-color, #303133);
}

.create-sheet__close {
  width: 56rpx;
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  border-radius: 50%;
}

.form-group {
  margin-bottom: 28rpx;
}

.form-label {
  display: block;
  font-size: 26rpx;
  color: var(--up-tips-color, #909193);
  margin-bottom: 12rpx;
}

.form-readonly {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 24rpx;
  background-color: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  border-radius: 56rpx;
}

.form-readonly__text {
  font-size: 28rpx;
  color: var(--up-main-color, #303133);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.send-preview {
  padding: 20rpx 24rpx;
  background-color: color-mix(in srgb, var(--up-primary, #2979ff) 8%, var(--up-card-bg-color, #ffffff) 92%);
  border-radius: 16rpx;
  border: 1rpx solid color-mix(in srgb, var(--up-primary, #2979ff) 22%, var(--up-card-bg-color, #ffffff) 78%);
}

.send-preview__text {
  font-size: 28rpx;
  color: var(--up-primary, #2979ff);
  line-height: 1.5;
  word-break: break-all;
}

.safe-bottom {
  height: calc(32rpx + env(safe-area-inset-bottom));
}
</style>
