<template>
  <view class="page conversations-page">

    <!-- 无连接 -->
    <view v-if="!hasActiveConnection" class="empty-fullpage">
      <up-empty mode="data" text="请先添加连接">
        <template #bottom>
          <up-button type="primary" @click="goToConnections" size="normal" customStyle="margin-top:32rpx">
            前往添加
          </up-button>
        </template>
      </up-empty>
    </view>

    <view
      v-else
      :class="[
        'main-wrap',
        showHistoryPanel ? 'main-wrap--history' : 'main-wrap--overview',
      ]"
    >

      <!-- 顶部搜索 -->
      <view class="search-bar">
        <view class="search-bar__inner">
          <up-search
            v-model="searchKeyword"
            placeholder="搜索会话..."
            :show-action="false"
            shape="round"
            @search="() => {}"
            @clear="() => {}"
          ></up-search>
          <view class="quick-add-btn" @click="createConversation()">
            <up-icon name="plus" size="16" color="#2979ff"></up-icon>
          </view>
        </view>
      </view>

      <!-- 默认：连接分组会话总览 -->
      <view v-if="!showHistoryPanel" class="group-panel">
        <view v-if="loading && filteredConnectionGroups.length === 0" class="inline-loading">
          <up-loading-icon color="#2979ff" size="28"></up-loading-icon>
          <text class="inline-loading__text">加载中...</text>
        </view>
        <view v-if="!loading && filteredConnectionGroups.length === 0" class="empty-fullpage">
          <up-empty mode="list" text="暂无分组会话"></up-empty>
        </view>

        <view v-else class="group-list">
          <view
            v-for="group in filteredConnectionGroups"
            :key="group.key"
            class="group-section"
          >
            <text class="group-section__title">{{ group.name }}</text>

            <view v-if="group.cards.length === 0" class="group-empty">
              <text class="group-empty__text">暂无打开中的标签会话</text>
            </view>

            <view
              v-for="card in group.cards"
              :key="`${group.key}-${card.tabId}`"
              class="live-card"
              @click="openLiveSession(card, group.key)"
            >
              <view
                :class="[
                  'agent-logo',
                  agentLogoClass(card.agentType),
                  agentLogoPath(card.agentType) && 'agent-logo--real',
                ]"
              >
                <image
                  v-if="agentLogoPath(card.agentType)"
                  class="agent-logo__img"
                  :src="agentLogoPath(card.agentType)"
                  mode="aspectFit"
                />
                <text v-else class="agent-logo__text">{{ agentLogoText(card.agentType) }}</text>
              </view>

              <view class="live-card__body">
                <text class="live-card__project-title u-line-1">{{ card.projectName }}</text>
                <view class="live-card__meta">
                  <text class="live-card__session-name u-line-1">{{ card.title }}</text>
                  <text class="live-card__time">{{ formatTime(card.updatedAt) }}</text>
                </view>
              </view>

              <view class="card-status-corner">
                <view :class="['status-chip', `status-chip--${statusClass(card.status)}`]">
                  <text class="status-chip__text">{{ statusLabel(card.status) }}</text>
                </view>
                <view
                  v-if="statusClass(card.status) === 'running'"
                  class="status-wave"
                ></view>
              </view>
            </view>

            <view class="live-card history-card" @click="openHistoryPanel(group)">
              <view class="conv-card__icon history-card__icon">
                <up-icon name="clock" size="18" color="#2979ff"></up-icon>
              </view>
              <view class="history-entry__left">
                <text class="history-entry__text u-line-1">历史会话</text>
                <text class="history-entry__desc u-line-1">可查看已结束或已完成会话并重新激活</text>
              </view>
              <up-icon name="arrow-right" size="14" color="#c0c4cc"></up-icon>
            </view>
          </view>
        </view>
      </view>

      <!-- 历史模式：展示原 up-cate-tab -->
      <view v-else class="cate-wrap">
        <view class="history-mode-bar">
          <view class="history-mode-back" @click="closeHistoryPanel">
            <up-icon name="arrow-left" size="14" color="#2979ff"></up-icon>
            <text class="history-mode-back__text">返回分组</text>
          </view>
          <text class="history-mode-title u-line-1">{{ historyGroupTitle }}</text>
        </view>

        <view v-if="historyLoading && projects.length === 0" class="inline-loading">
          <up-loading-icon color="#2979ff" size="28"></up-loading-icon>
          <text class="inline-loading__text">加载中...</text>
        </view>
        <view v-if="!historyLoading && projects.length === 0" class="empty-fullpage">
          <up-empty mode="list" text="暂无历史会话"></up-empty>
        </view>

        <view v-else class="cate-wrap__inner">
        <up-cate-tab
          class="cate-tab"
          :tabList="tabList"
          tabKeyName="label"
          mode="tab"
          :height="cateTabHeight"
          :current="currentTab"
          @update:current="onTabChange"
        >
        <!-- 左侧 tab 项 -->
        <template #tabItem="slotProps">
          <view v-if="slotProps?.item" class="tab-item">
            <text class="tab-item__name">{{ slotProps.item.label }}</text>
            <view v-if="slotProps.item.count > 0" class="tab-item__badge">{{ slotProps.item.count }}</view>
          </view>
        </template>

        <!-- 右侧顶部：新建按钮 -->
        <template #rightTop="slotProps">
          <view class="right-top-bar">
            <view class="right-top-bar__title">
              {{ getCurrentTabLabel(slotProps?.tabList) }}
            </view>
            <view
              v-if="canCreateInHistory"
              class="add-btn"
              @click="createConversation(getCurrentTabProjectId(slotProps?.tabList))"
            >
              <up-icon name="plus" size="18" color="#2979ff"></up-icon>
              <text class="add-btn__label">新建</text>
            </view>
            <view v-else class="history-mode-tip">历史模式</view>
          </view>
        </template>

        <!-- 右侧每个分类的内容 -->
        <template #itemList="slotProps">
          <!-- 无会话 -->
          <view v-if="getConversationList(slotProps?.item).length === 0" class="empty-section">
            <up-empty mode="message" text="暂无会话" iconSize="60"></up-empty>
            <up-button
              type="primary"
              plain
              size="small"
              @click="createConversation(slotProps?.item?.projectId)"
              customStyle="margin-top:24rpx"
            >创建第一个会话</up-button>
          </view>

          <!-- 会话列表 -->
          <view v-else class="conv-list">
            <view
              v-for="conv in getConversationList(slotProps?.item)"
              :key="conv.id"
              class="conv-card"
              @click="openConversation(conv, historyGroupKey)"
            >
              <view class="conv-card__icon">
                <up-icon name="chat-fill" size="17" color="#2979ff"></up-icon>
              </view>
              <view class="conv-card__body">
                <text class="conv-card__title u-line-1">{{ conv.title || '未命名会话' }}</text>
                <view class="conv-card__meta">
                  <up-tag
                    :text="formatAgentType(conv.agent_type)"
                    type="info"
                    size="mini"
                    plain
                  ></up-tag>
                  <text class="conv-card__time">{{ formatTime(conv.updated_at) }}</text>
                </view>
              </view>
              <view class="conv-card__actions">
                <view class="conv-card__menu" @click.stop="showConversationMenu(conv)">
                  <up-icon name="more-dot-fill" size="16" color="#909399"></up-icon>
                </view>
                <up-icon name="arrow-right" size="12" color="#c0c4cc"></up-icon>
              </view>
            </view>
          </view>
        </template>
        </up-cate-tab>
        </view>
      </view>
    </view>

    <!-- 创建会话底部弹层 -->
    <up-popup v-model:show="showCreateDialog" mode="bottom" :round="28">
      <view class="create-sheet">
        <view class="create-sheet__hd">
          <text class="create-sheet__title">新建会话</text>
          <view class="create-sheet__close" @click="showCreateDialog = false">
            <up-icon name="close" size="20" color="#909399"></up-icon>
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
          <text class="form-label">标题（可选）</text>
          <up-input
            v-model="newConversationTitle"
            placeholder="输入会话标题"
            border="surround"
            shape="circle"
          ></up-input>
        </view>

        <view class="form-group">
          <text class="form-label">本次任务内容</text>
          <up-textarea
            v-model="newTaskContent"
            placeholder="请输入本次任务内容"
            autoHeight
            count
            :maxlength="1200"
          ></up-textarea>
        </view>

        <up-button
          type="primary"
          :loading="creating"
          :disabled="!selectedProjectId || !selectedConnectionKey"
          shape="circle"
          @click="confirmCreate"
          customStyle="margin-top:16rpx"
        >创建会话</up-button>

        <view class="safe-bottom"></view>
      </view>
    </up-popup>

    <!-- 项目 Picker -->
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

    <!-- 会话操作菜单 -->
    <up-action-sheet
      :show="showActionSheet"
      :actions="conversationActions"
      @select="handleActionSelect"
      @close="showActionSheet = false"
    ></up-action-sheet>

  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, getCurrentInstance } from "vue"
import { onPullDownRefresh, onReady, onShow } from "@dcloudio/uni-app"
import { useAuthStore } from "@/stores/auth"
import { acpApi } from "@/api/acp"
import { createGateway } from "@/services/gateway"
import { toErrorMessage } from "@/services/gateway/error"
import { ensureConversationSchema } from "@/services/db/migrations"
import {
  getConversationSummaryById,
  listConversationSummaries,
  upsertConversationSummary,
  type ConversationSummaryRecord,
} from "@/services/db/repositories/conversationRepository"
import type { RelaySessionInfo } from "@/services/gateway"

const auth = useAuthStore()
const loading = ref(false)
const creating = ref(false)
const currentTab = ref(0)
const searchKeyword = ref("")
const showCreateDialog = ref(false)
const showConnectionPicker = ref(false)
const showProjectPicker = ref(false)
const showAgentPicker = ref(false)
const showActionSheet = ref(false)
const selectedConnectionKey = ref("")
const selectedConnectionName = ref("")
const selectedProjectId = ref<number>(0)
const selectedProjectName = ref("")
const selectedAgentType = ref("claude_code")
const selectedAgentName = ref("Claude Code")
const newConversationTitle = ref("")
const newTaskContent = ref("")
const currentConversation = ref<Conversation | null>(null)
const cateTabHeight = ref("calc(100vh - 160rpx)")
const showHistoryPanel = ref(false)
const historyGroupKey = ref("")
const historyGroupTitle = ref("")
const historyLoading = ref(false)
let overviewLoadPromise: Promise<void> | null = null
let lastOverviewLoadedAt = 0
const historyLoadPromiseMap = new Map<string, Promise<void>>()

interface Project {
  id: number
  name: string
  path: string
  conversations?: Conversation[]
}

interface Conversation {
  id: number
  title?: string
  agent_type?: string
  updated_at?: string
  folder_id?: number
  status?: string
  external_id?: string
  externalId?: string
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

interface OpenedTabItem {
  id: number
  folder_id: number
  conversation_id?: number | null
  agent_type?: string
  position?: number
  is_active?: boolean
  is_pinned?: boolean
}

interface LiveSessionCard {
  tabId: number
  conversationId?: number
  folderId: number
  projectName: string
  agentType: string
  title: string
  updatedAt?: string
  status: string
  isActive: boolean
}

interface ConnectionGroup {
  key: string
  name: string
  mode: "direct" | "relay"
  url: string
  projects: Project[]
  cards: LiveSessionCard[]
}

const projects = ref<Project[]>([])
const connectionGroups = ref<ConnectionGroup[]>([])

// up-cate-tab 所需数据结构
const tabList = computed(() => {
  const kw = searchKeyword.value.toLowerCase()
  return projects.value.map((p) => {
    const convs = normalizeList((p as any).conversations).filter(
      (c) => !kw || (c.title || "").toLowerCase().includes(kw)
    )
    return {
      label: p.name || p.path || "未命名项目",
      projectId: p.id,
      count: convs.length,
      conversations: convs,
    }
  })
})

const filteredConnectionGroups = computed(() => {
  const kw = searchKeyword.value.trim().toLowerCase()
  if (!kw) return connectionGroups.value
  return connectionGroups.value
    .map((group) => ({
      ...group,
      cards: group.cards.filter((card) =>
        [
          card.title || "",
          card.projectName || "",
          formatAgentType(card.agentType),
        ]
          .join(" ")
          .toLowerCase()
          .includes(kw)
      ),
    }))
    .filter(
      (group) =>
        group.cards.length > 0 ||
        group.name.toLowerCase().includes(kw) ||
        group.url.toLowerCase().includes(kw)
    )
})

const selectedConnectionGroup = computed(() =>
  connectionGroups.value.find((group) => group.key === selectedConnectionKey.value)
)

const canCreateInHistory = computed(() => {
  if (!showHistoryPanel.value || !historyGroupKey.value) return false
  return historyGroupKey.value === currentAuthConnectionKey()
})

const connectionColumns = computed(() => [
  connectionGroups.value.map((group) => ({
    text: group.name,
    value: group.key,
  })),
])

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

const AGENT_LABELS: Record<string, string> = {
  claude_code: "Claude Code",
  codex:       "Codex CLI",
  open_code:   "OpenCode",
  gemini:      "Gemini CLI",
  open_claw:   "OpenClaw",
  cline:       "Cline",
}

function formatAgentType(t?: string) {
  return t ? (AGENT_LABELS[t] ?? t) : "未知"
}

const conversationActions = [
  { name: "重命名", color: "#2979ff" },
  { name: "删除",   color: "#fa3534" },
]

const hasActiveConnection = computed(() => {
  if (connectionGroups.value.length > 0) return true
  if (loading.value) return true
  return getConnectedConnections().length > 0
})

function onTabChange(idx: number) {
  currentTab.value = idx
}

onMounted(() => {
  syncCateTabHeight()
})

onPullDownRefresh(() => {
  if (showHistoryPanel.value) {
    uni.stopPullDownRefresh()
    return
  }

  loadOverviewData({ force: true }).finally(() => {
    uni.stopPullDownRefresh()
    syncCateTabHeight()
  })
})

onReady(() => {
  syncCateTabHeight()
})

onShow(() => {
  void loadOverviewData({ force: true })
  syncCateTabHeight()
})

async function loadOverviewData(options?: { force?: boolean }) {
  const force = options?.force === true
  if (overviewLoadPromise) {
    return await overviewLoadPromise
  }
  if (
    !force &&
    connectionGroups.value.length > 0 &&
    Date.now() - lastOverviewLoadedAt < 15000
  ) {
    return
  }

  overviewLoadPromise = loadOverviewDataInternal()
  try {
    await overviewLoadPromise
  } finally {
    overviewLoadPromise = null
  }
}

async function loadOverviewDataInternal() {
  loading.value = true
  try {
    const connected = getConnectedConnections()
    const groups = await Promise.all(connected.map((conn) => loadConnectionGroup(conn)))
    connectionGroups.value = groups.filter((group) => !!group)
    if (connectionGroups.value.length === 0) {
      showHistoryPanel.value = false
      projects.value = []
      return
    }

    if (showHistoryPanel.value && historyGroupKey.value) {
      const current = connectionGroups.value.find((group) => group.key === historyGroupKey.value)
      if (current) {
        projects.value = current.projects
        if (current.projects.length > 0) currentTab.value = 0
        void ensureHistoryProjectsLoaded(current)
      } else {
        showHistoryPanel.value = false
        historyGroupKey.value = ""
        historyGroupTitle.value = ""
        projects.value = []
      }
    } else {
      projects.value = []
    }
    lastOverviewLoadedAt = Date.now()
  } catch (error) {
    const msg = toErrorMessage(error)
    uni.showToast({ title: `加载失败: ${msg}`, icon: "none", duration: 3000 })
  } finally {
    loading.value = false
  }
}

function getConnectedConnections(): ConnectionItem[] {
  const savedConnections = normalizeList(uni.getStorageSync("mcode_connections")) as ConnectionItem[]
  const connectedMap = (uni.getStorageSync("mcode_connected_map") || {}) as Record<string, boolean>
  return savedConnections.filter((conn) => Boolean(connectedMap[connectionKey(conn)]))
}

function currentAuthConnectionKey(): string {
  const mode = auth.mode
  const url = mode === "direct" ? auth.directBaseUrl : auth.relayUrl
  if (!url) return ""
  return connectionKey({ mode, url })
}

async function loadConnectionGroup(conn: ConnectionItem): Promise<ConnectionGroup> {
  const gateway = await createConnectionGateway(conn)
  const descriptor = gateway.getRemoteInstanceDescriptor()
  const foldersRaw = await gateway.call<unknown>("list_all_folder_details")
  const folders = normalizeList(foldersRaw) as Project[]
  const tabsRaw = await gateway.call<unknown>("list_opened_tabs")
  const tabs = normalizeList(tabsRaw) as OpenedTabItem[]
  const localConversations = await loadLocalConversationSummariesForTabs(
    descriptor.instanceKey,
    tabs
  )
  return buildConnectionGroup(conn, folders, tabs, localConversations)
}

function buildConnectionGroup(
  conn: ConnectionItem,
  folders: Project[],
  tabs: OpenedTabItem[],
  conversations: Conversation[]
): ConnectionGroup {
  const folderMap = new Map<number, Project>()
  folders.forEach((folder) => {
    folderMap.set(folder.id, folder)
  })

  const convMap = new Map<number, Conversation>()
  conversations.forEach((conv) => {
    convMap.set(conv.id, conv)
  })

  const cards = tabs
    .map((tab) => {
      const conversation = tab.conversation_id ? convMap.get(tab.conversation_id) : undefined
      const project = folderMap.get(tab.folder_id)
      return {
        tabId: tab.id,
        conversationId: tab.conversation_id || undefined,
        folderId: tab.folder_id,
        projectName: project?.name || project?.path || "未命名项目",
        agentType: normalizeAgentType(tab.agent_type || conversation?.agent_type),
        title: conversation?.title || `标签会话 #${tab.id}`,
        updatedAt: conversation?.updated_at,
        status: normalizeConversationStatus(conversation?.status),
        isActive: Boolean(tab.is_active),
      } satisfies LiveSessionCard
    })
    .sort((a, b) => {
      const aActive = a.isActive ? 1 : 0
      const bActive = b.isActive ? 1 : 0
      if (aActive !== bActive) return bActive - aActive
      return Number(a.tabId) - Number(b.tabId)
    })

  const projectsWithConversations = folders.map((folder) => ({
    ...folder,
    conversations: conversations.filter((conv) => conv.folder_id === folder.id),
  }))

  return {
    key: connectionKey(conn),
    name: conn.name,
    mode: conn.mode,
    url: conn.url,
    projects: projectsWithConversations,
    cards,
  }
}

async function fetchRemoteConversations(
  gateway: Awaited<ReturnType<typeof createConnectionGateway>>,
  folders: Project[]
): Promise<Conversation[]> {
  if (folders.length === 0) return []
  const conversationsRaw = await gateway.call<unknown>("list_all_conversations", {
    folderIds: folders.map((folder) => folder.id),
  })
  return normalizeList(conversationsRaw) as Conversation[]
}

async function loadLocalConversationSummaries(
  instanceKey: string,
  folders: Project[]
): Promise<Conversation[] | null> {
  try {
    await ensureConversationSchema()
    const rows = await Promise.all(
      folders.map((folder) => listConversationSummaries(instanceKey, folder.id))
    )
    return rows
      .flat()
      .map(mapSummaryRecordToConversation)
  } catch (error) {
    console.warn("load local conversation summaries skipped:", error)
    return null
  }
}

async function loadLocalConversationSummariesForTabs(
  instanceKey: string,
  tabs: OpenedTabItem[]
): Promise<Conversation[]> {
  try {
    await ensureConversationSchema()
    const conversationIds = Array.from(
      new Set(
        tabs
          .map((tab) => Number(tab.conversation_id || 0))
          .filter((conversationId) => conversationId > 0)
      )
    )
    if (conversationIds.length === 0) return []

    const rows = await Promise.all(
      conversationIds.map((conversationId) => getConversationSummaryById(instanceKey, conversationId))
    )
    return rows
      .filter((row): row is ConversationSummaryRecord => Boolean(row))
      .map(mapSummaryRecordToConversation)
  } catch (error) {
    console.warn("load local tab conversation summaries skipped:", error)
    return []
  }
}

async function persistConversationSummaries(
  instanceKey: string,
  conversations: Conversation[]
) {
  try {
    await ensureConversationSchema()
    await Promise.all(
      conversations.map((conversation) =>
        upsertConversationSummary(mapConversationToSummaryRecord(instanceKey, conversation))
      )
    )
  } catch (error) {
    console.warn("persist conversation summaries skipped:", error)
  }
}

function replaceConnectionGroup(nextGroup: ConnectionGroup) {
  const index = connectionGroups.value.findIndex((group) => group.key === nextGroup.key)
  if (index < 0) return
  const nextGroups = [...connectionGroups.value]
  nextGroups.splice(index, 1, nextGroup)
  connectionGroups.value = nextGroups
  if (showHistoryPanel.value && historyGroupKey.value === nextGroup.key) {
    projects.value = nextGroup.projects
  }
}

function applyHistoryProjects(
  groupKey: string,
  folders: Project[],
  conversations: Conversation[]
) {
  const nextProjects = folders.map((folder) => ({
    ...folder,
    conversations: conversations.filter((conv) => conv.folder_id === folder.id),
  }))
  const current = connectionGroups.value.find((group) => group.key === groupKey)
  if (!current) return

  replaceConnectionGroup({
    ...current,
    projects: nextProjects,
  })
}

function mapSummaryRecordToConversation(record: ConversationSummaryRecord): Conversation {
  return {
    id: record.id,
    title: record.title,
    agent_type: normalizeAgentType(record.agentType),
    updated_at: formatTimestamp(record.updatedAt || record.lastMessageAt),
    folder_id: record.folderId,
    status: normalizeConversationStatus(record.status),
  }
}

function mapConversationToSummaryRecord(
  instanceKey: string,
  conversation: Conversation
): ConversationSummaryRecord {
  const timestamp = parseTimestamp(conversation.updated_at)
  return {
    id: conversation.id,
    instanceKey,
    folderId: Number(conversation.folder_id || 0),
    title: conversation.title || "未命名会话",
    agentType: normalizeAgentType(conversation.agent_type),
    externalId: firstString(conversation.external_id, conversation.externalId) || null,
    connectionId: null,
    status: normalizeConversationStatus(conversation.status),
    lastTurnId: null,
    lastMessageAt: timestamp,
    unreadCount: 0,
    isPinned: false,
    deletedAt: null,
    updatedAt: timestamp,
  }
}

function parseTimestamp(value?: string | number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  const time = value ? new Date(value).getTime() : Date.now()
  return Number.isFinite(time) ? time : Date.now()
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  }
  return ""
}

function formatTimestamp(value: number): string {
  return new Date(value).toISOString()
}

function normalizeList(input: unknown): any[] {
  if (Array.isArray(input)) return input
  if (input && typeof input === "object" && Array.isArray((input as any).data))
    return (input as any).data
  return []
}

function normalizeBaseUrl(url: string): string {
  return String(url || "").trim().replace(/\/+$/, "")
}

function connectionKey(conn: Pick<ConnectionItem, "mode" | "url">): string {
  return `${conn.mode}::${normalizeBaseUrl(conn.url)}`
}

function normalizeAgentType(value?: string): string {
  const raw = String(value || "").trim().toLowerCase().replace(/[\s-]/g, "_")
  if (!raw) return "claude_code"
  if (raw === "claudecode") return "claude_code"
  if (raw === "codex_cli") return "codex"
  if (raw === "gemini_cli" || raw === "google_gemini" || raw === "gemini_code") return "gemini"
  if (raw === "cline_cli") return "cline"
  if (raw === "opencode") return "open_code"
  if (raw === "open_code_cli") return "open_code"
  if (raw === "openclaw") return "open_claw"
  if (raw === "open_claw_cli") return "open_claw"
  return raw
}

function normalizeConversationStatus(value?: string): string {
  const raw = String(value || "").trim().toLowerCase()
  if (!raw) return "unknown"
  if (raw === "inprogress") return "in_progress"
  if (raw === "pendingreview") return "pending_review"
  return raw
}

function statusLabel(status: string): string {
  if (status === "in_progress") return "远程运行中"
  if (status === "completed") return "已完成"
  if (status === "cancelled" || status === "canceled") return "已停止"
  if (status === "pending_review") return "待处理"
  if (status === "error" || status === "failed") return "异常"
  return "空闲"
}

function statusClass(status: string): string {
  if (status === "in_progress") return "running"
  if (status === "completed") return "completed"
  if (status === "cancelled" || status === "canceled") return "stopped"
  if (status === "error" || status === "failed") return "error"
  return "idle"
}

function agentLogoText(agentType: string): string {
  const key = normalizeAgentType(agentType)
  if (key === "claude_code") return "CC"
  if (key === "codex") return "CX"
  if (key === "open_code") return "OC"
  if (key === "gemini") return "GM"
  if (key === "open_claw") return "CL"
  if (key === "cline") return "CN"
  return "AI"
}

function agentLogoClass(agentType: string): string {
  return `agent-logo--${normalizeAgentType(agentType).replace(/[^a-z0-9_]/g, "")}`
}

function agentLogoPath(agentType: string): string {
  const key = normalizeAgentType(agentType)
  if (key === "claude_code") return "/static/agent-logos/claude-code.svg"
  if (key === "codex") return "/static/agent-logos/codex.svg"
  if (key === "gemini") return "/static/agent-logos/gemini.svg"
  if (key === "cline") return "/static/agent-logos/cline.svg"
  if (key === "open_code") return "/static/agent-logos/open-code.svg"
  if (key === "open_claw") return "/static/agent-logos/open-claw.svg"
  return ""
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
    persistConnectionSession(conn)
  }

  return createGateway({
    mode: "relay",
    relayUrl: conn.url,
    session: conn.relaySession,
  })
}

function persistConnectionSession(conn: ConnectionItem) {
  const savedConnections = normalizeList(uni.getStorageSync("mcode_connections")) as ConnectionItem[]
  const idx = savedConnections.findIndex(
    (item) => item.mode === conn.mode && normalizeBaseUrl(item.url) === normalizeBaseUrl(conn.url)
  )
  if (idx >= 0) {
    savedConnections[idx] = { ...savedConnections[idx], relaySession: conn.relaySession }
    uni.setStorageSync("mcode_connections", savedConnections)
  }
}

function applySelectedConnection(connectionKeyValue: string) {
  if (!connectionKeyValue) {
    selectedConnectionKey.value = ""
    selectedConnectionName.value = ""
    selectedProjectId.value = 0
    selectedProjectName.value = ""
    return
  }
  const group = connectionGroups.value.find((item) => item.key === connectionKeyValue)
  if (!group) return
  selectedConnectionKey.value = group.key
  selectedConnectionName.value = group.name
  selectedProjectId.value = 0
  selectedProjectName.value = ""
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

function parseConversationId(input: unknown): number {
  if (typeof input === "number" && Number.isFinite(input)) return input
  if (input && typeof input === "object") {
    const maybeId = (input as any).id ?? (input as any).conversationId
    if (typeof maybeId === "number" && Number.isFinite(maybeId)) return maybeId
  }
  return 0
}

function loadData() {
  return loadOverviewData({ force: true })
}

function syncCateTabHeight() {
  nextTick(() => {
    const instance = getCurrentInstance()
    const proxy = instance?.proxy
    if (!proxy) return
    const query = uni.createSelectorQuery().in(proxy)
    query.select(".search-bar").boundingClientRect((rect: any) => {
      const windowHeight = Number(uni.getSystemInfoSync().windowHeight || 0)
      const searchHeight = Number(rect?.height || 0)
      const nextHeight = Math.max(windowHeight - searchHeight, 260)
      cateTabHeight.value = `${nextHeight}px`
    })
    query.exec()
  })
}

function getConversationList(item: any): Conversation[] {
  return normalizeList(item?.conversations) as Conversation[]
}

function getCurrentTabLabel(slotTabList: any): string {
  const list = normalizeList(slotTabList)
  return list[currentTab.value]?.label || ""
}

function getCurrentTabProjectId(slotTabList: any): number | undefined {
  const list = normalizeList(slotTabList)
  const projectId = list[currentTab.value]?.projectId
  return typeof projectId === "number" ? projectId : undefined
}

function goToConnections() {
  uni.switchTab({ url: "/pages/connections/index" })
}

function openHistoryPanel(group: ConnectionGroup) {
  historyGroupKey.value = group.key
  historyGroupTitle.value = group.name
  projects.value = group.projects
  currentTab.value = 0
  showHistoryPanel.value = true
  syncCateTabHeight()
  void ensureHistoryProjectsLoaded(group)
}

function closeHistoryPanel() {
  showHistoryPanel.value = false
  historyGroupKey.value = ""
  historyGroupTitle.value = ""
  projects.value = []
}

async function ensureHistoryProjectsLoaded(group: ConnectionGroup) {
  if (group.projects.some((project) => Array.isArray(project.conversations))) {
    return
  }

  const key = group.key
  if (historyLoadPromiseMap.has(key)) {
    await historyLoadPromiseMap.get(key)
    return
  }

  const task = (async () => {
    historyLoading.value = true
    try {
      const conn = getConnectedConnections().find((item) => connectionKey(item) === key)
      if (!conn) return

      const gateway = await createConnectionGateway(conn)
      const descriptor = gateway.getRemoteInstanceDescriptor()
      const folders = group.projects.map((project) => ({
        id: project.id,
        name: project.name,
        path: project.path,
      }))

      const localConversations = await loadLocalConversationSummaries(descriptor.instanceKey, folders)
      if (localConversations) {
        applyHistoryProjects(key, folders, localConversations)
      }

      const remoteConversations = await fetchRemoteConversations(gateway, folders)
      await persistConversationSummaries(descriptor.instanceKey, remoteConversations)
      applyHistoryProjects(key, folders, remoteConversations)
    } catch (error) {
      console.warn("load history projects skipped:", error)
    } finally {
      historyLoading.value = false
      historyLoadPromiseMap.delete(key)
    }
  })()

  historyLoadPromiseMap.set(key, task)
  await task
}

function openLiveSession(card: LiveSessionCard, groupKey?: string) {
  if (!card.conversationId) {
    uni.showToast({ title: "该标签暂无会话记录", icon: "none" })
    return
  }
  openConversation({
    id: card.conversationId,
    folder_id: card.folderId,
    agent_type: card.agentType,
    title: card.title,
    status: card.status,
    updated_at: card.updatedAt,
  }, groupKey)
}

function syncAuthToConnectionKey(connKey?: string) {
  if (!connKey) return
  const conn = getConnectedConnections().find((item) => connectionKey(item) === connKey)
  if (conn) {
    syncAuthToConnection(conn)
  }
}

function openConversation(conv: Conversation, connKey?: string) {
  syncAuthToConnectionKey(connKey)
  const encodedConnKey = connKey ? encodeURIComponent(connKey) : ""
  uni.navigateTo({
    url: `/pages/conversation-detail/index?id=${conv.id}&folderId=${conv.folder_id || 0}${encodedConnKey ? `&connectionKey=${encodedConnKey}` : ""}`,
  })
}

function createConversation(projectId?: number) {
  const defaultConnectionKey = showHistoryPanel.value
    ? historyGroupKey.value
    : currentAuthConnectionKey() || connectionGroups.value[0]?.key || ""
  applySelectedConnection(defaultConnectionKey)

  if (projectId) {
    const list = selectedConnectionGroup.value?.projects || []
    const p = list.find((x) => x.id === projectId)
    if (p) {
      selectedProjectId.value = p.id
      selectedProjectName.value = p.name || p.path || "未命名项目"
    }
  } else {
    selectedProjectId.value = 0
    selectedProjectName.value = ""
  }

  newConversationTitle.value = ""
  newTaskContent.value = ""
  selectedAgentType.value = "claude_code"
  selectedAgentName.value = "Claude Code"
  showCreateDialog.value = true
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

async function confirmCreate() {
  if (!selectedConnectionKey.value) {
    uni.showToast({ title: "请选择连接", icon: "none" })
    return
  }

  if (!selectedProjectId.value) {
    uni.showToast({ title: "请选择项目", icon: "none" })
    return
  }

  creating.value = true
  try {
    const targetConn = getConnectedConnections().find(
      (item) => connectionKey(item) === selectedConnectionKey.value
    )
    if (!targetConn) {
      throw new Error("连接不存在或已断开")
    }
    const gateway = await createConnectionGateway(targetConn)
    syncAuthToConnection(targetConn)

    const createResult = await gateway.call<any>("create_conversation", {
      folderId: selectedProjectId.value,
      agentType: selectedAgentType.value,
      title: newConversationTitle.value || undefined,
    })
    const newConversationId = parseConversationId(createResult)
    if (!newConversationId) {
      throw new Error("创建会话失败：返回数据异常")
    }

    const taskContent = newTaskContent.value.trim()
    if (taskContent) {
      const connectionId = await gateway.call<string>("acp_connect", {
        agentType: selectedAgentType.value,
      })
      await gateway.call("acp_prompt", {
        connectionId,
        blocks: [{ type: "text", text: taskContent }],
        folderId: selectedProjectId.value,
        conversationId: newConversationId,
      })
    }

    uni.showToast({ title: "创建成功", icon: "success" })
    showCreateDialog.value = false
    newConversationTitle.value = ""
    newTaskContent.value = ""
    selectedAgentType.value = "claude_code"
    selectedAgentName.value = "Claude Code"
    await loadOverviewData({ force: true })
    openConversation({ id: newConversationId, folder_id: selectedProjectId.value })
  } catch (error) {
    const msg = toErrorMessage(error)
    uni.showToast({ title: `创建失败: ${msg}`, icon: "none", duration: 3000 })
  } finally {
    creating.value = false
  }
}

function showConversationMenu(conv: Conversation) {
  currentConversation.value = conv
  showActionSheet.value = true
}

async function handleActionSelect(e: any) {
  if (!currentConversation.value) return
  if (e.name === "删除") {
    uni.showModal({
      title: "确认删除",
      content: "确定要删除这个会话吗？此操作不可恢复。",
      success: async (res) => {
        if (res.confirm) {
          try {
            await acpApi.deleteConversation(currentConversation.value!.id)
            uni.showToast({ title: "删除成功", icon: "success" })
            await loadData()
          } catch (err) {
            uni.showToast({ title: "删除失败", icon: "none" })
          }
        }
      },
    })
  } else if (e.name === "重命名") {
    uni.showModal({
      title: "重命名会话",
      editable: true,
      placeholderText: currentConversation.value.title || "未命名会话",
      success: async (res) => {
        if (res.confirm && res.content) {
          try {
            const gateway = auth.gateway()
            await gateway.call("update_conversation", {
              conversationId: currentConversation.value!.id,
              title: res.content,
            })
            uni.showToast({ title: "重命名成功", icon: "success" })
            await loadData()
          } catch {
            uni.showToast({ title: "重命名失败", icon: "none" })
          }
        }
      },
    })
  }
  showActionSheet.value = false
}

function formatTime(time?: string): string {
  if (!time) return ""
  try {
    const date = new Date(time)
    const diff = Date.now() - date.getTime()
    const min = Math.floor(diff / 60000)
    if (min < 1)  return "刚刚"
    if (min < 60) return `${min}分钟前`
    const h = Math.floor(min / 60)
    if (h < 24)   return `${h}小时前`
    const d = Math.floor(h / 24)
    if (d === 1)  return "昨天"
    if (d < 7)    return `${d}天前`
    return date.toLocaleDateString("zh-CN")
  } catch {
    return ""
  }
}
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  padding: 0 !important;
  background-color: #f2f3f5;
  display: flex;
  flex-direction: column;
}

.main-wrap {
  width: 100%;
}

.main-wrap--overview {
  display: block;
}

.main-wrap--history {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.cate-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.cate-wrap__inner {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.cate-tab {
  height: 100%;
}

.group-panel {
  display: block;
  min-height: 0;
}

.group-list {
  padding: 16rpx 20rpx calc(40rpx + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 36rpx;
}

.group-section__title {
  display: block;
  margin-bottom: 10rpx;
  padding-left: 4rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: #1d1d1f;
}

.group-empty {
  padding: 18rpx 4rpx 10rpx;
}

.group-empty__text {
  font-size: 24rpx;
  color: #a0a3ad;
}

.live-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14rpx;
  padding: 16rpx;
  border-radius: 22rpx;
  background-color: #ffffff;
  border: 1rpx solid #ebeef5;
  box-shadow: none;
  margin-bottom: 22rpx;
}

.agent-logo {
  width: 58rpx;
  height: 58rpx;
  border-radius: 18rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background-color: #eef1f5;
  border: 1rpx solid #e3e8ef;
}

.agent-logo__text {
  font-size: 18rpx;
  font-weight: 700;
  color: #5f6470;
}

.agent-logo__img {
  width: 58rpx;
  height: 58rpx;
  display: block;
}

.agent-logo--real {
  background-color: #eef1f5 !important;
  border: 1rpx solid #e3e8ef;
}

.agent-logo--claude_code,
.agent-logo--codex,
.agent-logo--open_code,
.agent-logo--gemini,
.agent-logo--open_claw,
.agent-logo--cline {
  background-color: #eef1f5;
  border: 1rpx solid #e3e8ef;
}

.live-card__body {
  flex: 1;
  min-width: 0;
}

.live-card__project-title {
  font-size: 27rpx;
  font-weight: 600;
  color: #1d1d1f;
}

.live-card__meta {
  margin-top: 8rpx;
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.live-card__session-name {
  flex: 1;
  min-width: 0;
  font-size: 22rpx;
  color: #5f6470;
}

.live-card__time {
  font-size: 21rpx;
  color: #a7adb8;
  flex-shrink: 0;
}

.card-status-corner {
  position: absolute;
  right: 12rpx;
  top: 10rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-chip {
  position: relative;
  z-index: 2;
  padding: 2rpx 10rpx;
  border-radius: 999rpx;
  background-color: #eceff4;
}

.status-chip__text {
  font-size: 18rpx;
  color: #7b7f88;
}

.status-chip--running {
  background-color: #e8fff1;
}
.status-chip--running .status-chip__text {
  color: #19be6b;
}
.status-chip--completed {
  background-color: #eef5ff;
}
.status-chip--completed .status-chip__text {
  color: #2979ff;
}
.status-chip--stopped .status-chip__text {
  color: #909399;
}
.status-chip--error {
  background-color: #fff1f0;
}
.status-chip--error .status-chip__text {
  color: #f56c6c;
}

.status-wave {
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 999rpx;
  background-color: rgba(25, 190, 107, 0.24);
  z-index: 1;
  animation: statusPulse 1.4s ease-out infinite;
}

@keyframes statusPulse {
  0% {
    transform: scale(1);
    opacity: 0.7;
  }
  70% {
    transform: scale(1.55);
    opacity: 0;
  }
  100% {
    transform: scale(1.55);
    opacity: 0;
  }
}

.history-card {
  margin-top: 4rpx;
}

.history-entry__left {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 4rpx;
}

.history-entry__text {
  font-size: 26rpx;
  color: #1d1d1f;
}

.history-entry__desc {
  font-size: 22rpx;
  color: #909399;
  line-height: 1.4;
}

.history-card__icon {
  width: 58rpx;
  height: 58rpx;
  border-radius: 18rpx;
}

.inline-loading {
  min-height: 320rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
}

.inline-loading__text {
  font-size: 24rpx;
  color: #909399;
}

.history-mode-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  padding: 12rpx 12rpx;
  border-bottom: 1rpx solid #ebeef5;
  background-color: #ffffff;
}

.history-mode-back {
  display: flex;
  align-items: center;
  gap: 6rpx;
  flex-shrink: 0;
}

.history-mode-back__text {
  font-size: 24rpx;
  color: #2979ff;
}

.history-mode-title {
  flex: 1;
  min-width: 0;
  text-align: right;
  font-size: 24rpx;
  color: #606266;
}

/* ===== 搜索栏 ===== */
.search-bar {
  padding: 16rpx 12rpx;
  background-color: #ffffff;
  border-bottom: 1rpx solid #f0f0f0;
  flex-shrink: 0;
}

.search-bar__inner {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.quick-add-btn {
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  border: 1rpx solid #dbe7ff;
  background-color: #eef4ff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* ===== 空状态 ===== */
.empty-fullpage {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-bottom: 100rpx;
}

/* ===== 左侧 Tab 项 ===== */
.tab-item {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8rpx;
  width: 100%;
  padding: 0 12rpx;
  box-sizing: border-box;
  overflow: hidden;
}

.tab-item__name {
  flex: 1;
  min-width: 0;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.3;
  font-size: 24rpx;
  color: inherit;
}

.tab-item__badge {
  flex-shrink: 0;
  font-size: 20rpx;
  color: #2979ff;
  background-color: #e8f0fe;
  border-radius: 20rpx;
  padding: 2rpx 10rpx;
  line-height: 1.2;
}

/* ===== 右侧顶部栏 ===== */
.right-top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 12rpx 16rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.right-top-bar__title {
  font-size: 30rpx;
  font-weight: 600;
  color: #1d1d1f;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.add-btn {
  display: flex;
  align-items: center;
  gap: 4rpx;
  padding: 6rpx 12rpx;
  background-color: #e8f0fe;
  border-radius: 24rpx;
  flex-shrink: 0;
  max-width: 112rpx;
  min-width: 0;
  overflow: hidden;

  &:active { background-color: #d0e2fd; }
}

.add-btn__label {
  font-size: 20rpx;
  color: #2979ff;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-mode-tip {
  font-size: 22rpx;
  color: #a0a3ad;
}

/* ===== 会话列表 ===== */
.conv-list {
  padding: 10rpx 16rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.conv-card {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 14rpx 12rpx;
  background-color: #ffffff;
  border-radius: 18rpx;
  box-shadow: 0 1rpx 8rpx rgba(0, 0, 0, 0.04);
  transition: transform 0.15s;

  &:active { transform: scale(0.985); }
}

.conv-card__icon {
  width: 52rpx;
  height: 52rpx;
  background-color: #e8f0fe;
  border-radius: 14rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.conv-card__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.conv-card__title {
  font-size: 24rpx;
  font-weight: 500;
  color: #1d1d1f;
  line-height: 1.3;
}

.conv-card__meta {
  display: flex;
  align-items: center;
  gap: 10rpx;
  min-height: 30rpx;
}

.conv-card__meta :deep(.u-tag) {
  transform: scale(0.92);
  transform-origin: left center;
  line-height: 16px !important;
  min-height: 16px !important;
}

.conv-card__time {
  font-size: 20rpx;
  color: #c0c4cc;
  line-height: 1.2;
}

.conv-card__actions {
  display: flex;
  align-items: center;
  gap: 8rpx;
  flex-shrink: 0;
}

.conv-card__menu {
  width: 44rpx;
  height: 44rpx;
  border-radius: 12rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ===== 空会话 ===== */
.empty-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60rpx 0;
}

/* ===== 创建弹层 ===== */
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

.safe-bottom {
  height: calc(32rpx + env(safe-area-inset-bottom));
}

:deep(.u-cate-tab__view) {
  width: 180rpx !important;
  min-width: 180rpx;
  max-width: 180rpx;
}

:deep(.u-cate-tab__item) {
  min-height: 120rpx;
  height: auto;
  align-items: flex-start;
  justify-content: center;
}

:deep(.u-cate-tab__right-box) {
  min-width: 0;
}

:deep(.u-cate-tab__page-item) {
  margin-bottom: 0;
  border: none;
  padding: 0;
  border-radius: 0;
  background: transparent;
}

:deep(.u-cate-tab__page-item:last-child) {
  min-height: 0;
}
</style>
