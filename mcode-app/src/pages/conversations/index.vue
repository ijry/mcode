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
            <view class="group-section__header">
              <text class="group-section__title">{{ group.name }}</text>
              <view
                v-if="group.loadError"
                class="group-section__error"
                @click.stop="showGroupError(group)"
              >
                <up-icon name="warning-fill" size="14" color="#fa3534"></up-icon>
              </view>
            </view>

            <view v-if="group.cards.length === 0" class="group-empty">
              <text class="group-empty__text">
                {{ group.loadError ? "该连接加载失败" : "暂无打开中的标签会话" }}
              </text>
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
                <view :class="['status-chip', `status-chip--${statusClass(card.displayStatus)}`]">
                  <text class="status-chip__text">{{ statusLabel(card.displayStatus) }}</text>
                </view>
                <view
                  v-if="statusClass(card.displayStatus) === 'running'"
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
          <text v-if="selectedProjectPath" class="form-helper-text">{{ selectedProjectPath }}</text>
        </view>

        <view class="form-group">
          <text class="form-label">智能体</text>
          <view v-if="loadingCreateAgents" class="config-loading">
            <up-loading-icon size="18" color="#2979ff"></up-loading-icon>
            <text class="config-loading__text">正在读取智能体...</text>
          </view>
          <scroll-view class="agent-scroll" scroll-x show-scrollbar="false" enhanced>
            <view class="agent-grid">
              <view
                v-for="agent in createAgentOptions"
                :key="agent.value"
                :class="[
                  'agent-card',
                  selectedAgentType === agent.value && 'agent-card--active',
                ]"
                @click="selectAgent(agent.value)"
              >
                <view
                  :class="[
                    'agent-card__logo',
                    agentLogoClass(agent.value),
                    agentLogoPath(agent.value) && 'agent-card__logo--real',
                  ]"
                >
                  <image
                    v-if="agentLogoPath(agent.value)"
                    class="agent-card__logo-img"
                    :src="agentLogoPath(agent.value)"
                    mode="aspectFit"
                  />
                  <text v-else class="agent-card__logo-text">{{ agentLogoText(agent.value) }}</text>
                </view>
                <text class="agent-card__label">{{ agent.label }}</text>
              </view>
            </view>
          </scroll-view>
          <text
            v-if="!loadingCreateAgents && createAgentOptions.length === 0"
            class="form-helper-text"
          >未读取到可用智能体</text>
        </view>

        <view class="form-group">
          <text class="form-label">智能体配置</text>

          <view v-if="createAgentConfig.status === 'loading'" class="config-loading">
            <up-loading-icon size="18" color="#2979ff"></up-loading-icon>
            <text class="config-loading__text">正在读取可用配置...</text>
          </view>

          <view
            v-else
            class="form-readonly form-readonly--config"
            @click="openCreateConfigDialog"
          >
            <view class="form-readonly__stack">
              <text class="form-readonly__text">{{ createConfigSummary }}</text>
              <text v-if="createAgentConfig.message" class="form-helper-inline">
                {{ createAgentConfig.message }}
              </text>
            </view>
            <up-icon name="arrow-right" size="14" color="#c0c4cc"></up-icon>
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

    <up-popup v-model:show="showCreateConfigDialog" mode="bottom" :round="28">
      <view class="create-sheet">
        <view class="create-sheet__hd">
          <text class="create-sheet__title">智能体配置</text>
          <view class="create-sheet__close" @click="showCreateConfigDialog = false">
            <up-icon name="close" size="20" color="#909399"></up-icon>
          </view>
        </view>

        <view v-if="createAgentConfig.message" class="config-hint">
          <text class="config-hint__text">{{ createAgentConfig.message }}</text>
        </view>

        <view v-if="showStandaloneCreateMode" class="config-section">
          <text class="config-section__title">模式</text>
          <view class="config-chip-grid">
            <view
              v-for="mode in createAgentConfig.modes?.available_modes || []"
              :key="mode.id"
              :class="[
                'config-chip',
                createAgentConfig.selectedModeId === mode.id && 'config-chip--active',
              ]"
              @click="selectCreateMode(mode.id)"
            >
              <text class="config-chip__title">{{ mode.name }}</text>
            </view>
          </view>
        </view>

        <view
          v-for="option in createAgentConfig.configOptions"
          :key="option.id"
          class="config-section"
        >
          <text class="config-section__title">{{ option.name }}</text>
          <text v-if="option.description" class="config-section__desc">{{ option.description }}</text>
          <view class="config-chip-grid">
            <view
              v-for="value in option.kind.options"
              :key="value.value"
              :class="[
                'config-chip',
                createAgentConfig.selectedValues[option.id] === value.value && 'config-chip--active',
              ]"
              @click="selectCreateConfigValue(option.id, value.value)"
            >
              <text class="config-chip__title">{{ value.name }}</text>
            </view>
          </view>
        </view>

        <view
          v-if="!showStandaloneCreateMode && createAgentConfig.configOptions.length === 0"
          class="config-hint"
        >
          <text class="config-hint__text">该智能体将使用远端默认配置</text>
        </view>

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
import { ref, computed, onMounted, nextTick, getCurrentInstance, watch } from "vue"
import { onPullDownRefresh, onReady, onShow, onUnload } from "@dcloudio/uni-app"
import { useAuthStore } from "@/stores/auth"
import { useConversationRuntimeStore } from "@/stores/conversationRuntime"
import { acpApi } from "@/api/acp"
import { createGateway } from "@/services/gateway"
import { toErrorMessage } from "@/services/gateway/error"
import { ensureConversationSchema } from "@/services/db/migrations"
import {
  consumeConversationListDirty,
  markConversationListDirty,
} from "@/services/conversation/conversationListRefresh"
import {
  ensureGlobalConversationSync,
  subscribeConversationOverviewInvalidation,
} from "@/services/conversation/globalConversationSync"
import {
  buildConnectionConversationSnapshot,
  mapConversationSummaryRecordToConversation,
  mapConversationToSummaryRecord,
  type ConnectionConversationSnapshot,
  type ConversationOverviewConversation,
  type ConversationOverviewProject,
  type ConversationOverviewOpenedTab,
} from "@/services/conversation/conversationOverviewSnapshot"
import { normalizeConversationSummaryStatus } from "@/services/conversation/conversationSummaryStatus"
import {
  listConversationSummaries,
  upsertConversationSummary,
} from "@/services/db/repositories/conversationRepository"
import type { RelaySessionInfo } from "@/services/gateway"
import type {
  AgentOptionsSnapshot,
  AcpAgentInfo,
  ConnectionInfo,
  SessionConfigOptionInfo,
  SessionModeStateInfo,
} from "@/types/acp"

const auth = useAuthStore()
const runtime = useConversationRuntimeStore()
const loading = ref(false)
const creating = ref(false)
const currentTab = ref(0)
const searchKeyword = ref("")
const showCreateDialog = ref(false)
const showCreateConfigDialog = ref(false)
const showConnectionPicker = ref(false)
const showProjectPicker = ref(false)
const showActionSheet = ref(false)
const selectedConnectionKey = ref("")
const selectedConnectionName = ref("")
const selectedProjectId = ref<number>(0)
const selectedProjectName = ref("")
const selectedAgentType = ref("claude_code")
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
const overviewRefreshPromiseMap = new Map<string, Promise<void>>()
const loadingCreateAgents = ref(false)
let createAgentProbeToken = 0
let createAgentListToken = 0
let disposeOverviewInvalidation: (() => void) | null = null

interface CreateAgentOption {
  label: string
  value: string
  description?: string
}

interface CreateAgentConfigState {
  status: "idle" | "loading" | "ready" | "failed"
  modes: SessionModeStateInfo | null
  configOptions: SessionConfigOptionInfo[]
  selectedModeId: string | null
  selectedValues: Record<string, string>
  message: string
}

interface CachedCreateAgentListEntry {
  updatedAt: number
  options: CreateAgentOption[]
}

interface CachedCreateAgentConfigEntry {
  updatedAt: number
  snapshot: AgentOptionsSnapshot
}

interface StoredCreateAgentSelectionEntry {
  updatedAt: number
  agentType: string
}

interface StoredCreateAgentConfigSelectionEntry {
  updatedAt: number
  selectedModeId: string | null
  selectedValues: Record<string, string>
}

const createAgentOptions = ref<CreateAgentOption[]>([])
const createAgentConfig = ref<CreateAgentConfigState>({
  status: "idle",
  modes: null,
  configOptions: [],
  selectedModeId: null,
  selectedValues: {},
  message: "",
})
const CREATE_AGENT_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const CREATE_AGENT_LIST_CACHE_STORAGE_KEY = "mcode_create_agent_list_cache_v1"
const CREATE_AGENT_CONFIG_CACHE_STORAGE_KEY = "mcode_create_agent_config_cache_v1"
const CREATE_AGENT_SELECTION_STORAGE_KEY = "mcode_create_agent_selection_v1"
const CREATE_AGENT_CONFIG_SELECTION_STORAGE_KEY = "mcode_create_agent_config_selection_v1"

type Project = ConversationOverviewProject
type Conversation = ConversationOverviewConversation

interface ConnectionItem {
  name: string
  mode: "direct" | "relay"
  url: string
  directToken?: string
  pairCode?: string
  pairSecret?: string
  relaySession?: RelaySessionInfo
}

type OpenedTabItem = ConversationOverviewOpenedTab

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

interface DisplayLiveSessionCard extends LiveSessionCard {
  displayStatus: string
}

interface DisplayConnectionGroup extends ConnectionGroup {
  cards: DisplayLiveSessionCard[]
}

interface ConnectionGroup extends ConnectionConversationSnapshot {
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

const filteredConnectionGroups = computed<DisplayConnectionGroup[]>(() => {
  const kw = searchKeyword.value.trim().toLowerCase()
  const groups = connectionGroups.value.map((group) => ({
    ...group,
    cards: group.cards.map((card) => ({
      ...card,
      displayStatus: resolveOverviewCardStatus(card),
    })),
  }))
  if (!kw) return groups
  return groups
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

const selectedProjectPath = computed(() => {
  const project = selectedConnectionGroup.value?.projects.find(
    (item) => item.id === selectedProjectId.value
  )
  return project?.path || ""
})

const canCreateInHistory = computed(() => {
  if (!showHistoryPanel.value || !historyGroupKey.value) return false
  return historyGroupKey.value === currentAuthConnectionKey()
})

watch(
  () => [showCreateDialog.value, selectedConnectionKey.value] as const,
  ([open]) => {
    if (!open) {
      createAgentProbeToken += 1
      createAgentListToken += 1
      showCreateConfigDialog.value = false
      resetCreateAgentConfig("")
      return
    }
    void loadCreateAgents()
  }
)

watch(
  () =>
    [
      showCreateDialog.value,
      selectedConnectionKey.value,
      selectedAgentType.value,
      selectedProjectPath.value,
    ] as const,
  ([open]) => {
    if (!open) return
    void loadCreateAgentConfig()
  }
)

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

const hasCreateConfigOptions = computed(() => createAgentConfig.value.configOptions.length > 0)

const showStandaloneCreateMode = computed(() => {
  const modes = createAgentConfig.value.modes
  if (!modes || !Array.isArray(modes.available_modes) || modes.available_modes.length === 0) {
    return false
  }
  return !hasCreateConfigOptions.value
})

const createConfigSummary = computed(() => {
  if (createAgentConfig.value.status === "loading") return "正在读取可用配置..."
  const parts: string[] = []

  if (showStandaloneCreateMode.value && createAgentConfig.value.modes) {
    const activeMode = createAgentConfig.value.modes.available_modes.find(
      (item) => item.id === createAgentConfig.value.selectedModeId
    )
    if (activeMode?.name) {
      parts.push(activeMode.name)
    }
  }

  for (const option of createAgentConfig.value.configOptions) {
    const selectedValue = option.kind.options.find(
      (item) => item.value === createAgentConfig.value.selectedValues[option.id]
    )
    if (selectedValue?.name) {
      parts.push(selectedValue.name)
    }
  }

  if (parts.length === 0) {
    return createAgentConfig.value.message || "使用远端默认配置"
  }
  return parts.join(" · ")
})

const DEFAULT_CREATE_AGENT_OPTIONS: CreateAgentOption[] = [
  { label: "Claude Code", value: "claude_code" },
  { label: "Codex CLI", value: "codex" },
  { label: "OpenCode", value: "open_code" },
  { label: "Gemini CLI", value: "gemini" },
  { label: "OpenClaw", value: "open_claw" },
  { label: "Cline", value: "cline" },
]

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

function resetCreateAgentConfig(message = "") {
  createAgentConfig.value = {
    status: "idle",
    modes: null,
    configOptions: [],
    selectedModeId: null,
    selectedValues: {},
    message,
  }
}

function normalizeStorageRecord<T>(raw: unknown): Record<string, T> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {}
  }
  return raw as Record<string, T>
}

function normalizeSelectionValues(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {}
  }
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const normalizedKey = String(key || "").trim()
    const normalizedValue = typeof value === "string" ? value.trim() : ""
    if (normalizedKey && normalizedValue) {
      next[normalizedKey] = normalizedValue
    }
  }
  return next
}

function normalizeProjectPath(path?: string): string {
  return String(path || "").trim()
}

function isFreshCache(updatedAt: number, ttlMs = CREATE_AGENT_CACHE_TTL_MS): boolean {
  return Number.isFinite(updatedAt) && updatedAt > 0 && Date.now() - updatedAt < ttlMs
}

function buildCreateAgentConfigContextKey(
  connectionKeyValue: string,
  agentType: string,
  projectPath?: string
): string {
  return JSON.stringify([
    String(connectionKeyValue || "").trim(),
    normalizeAgentType(agentType),
    normalizeProjectPath(projectPath),
  ])
}

function currentCreateAgentConfigContextKey(): string {
  if (!selectedConnectionKey.value || !selectedAgentType.value) return ""
  return buildCreateAgentConfigContextKey(
    selectedConnectionKey.value,
    selectedAgentType.value,
    selectedProjectPath.value
  )
}

function readCreateAgentListCacheMap() {
  return normalizeStorageRecord<CachedCreateAgentListEntry>(
    uni.getStorageSync(CREATE_AGENT_LIST_CACHE_STORAGE_KEY)
  )
}

function writeCreateAgentListCacheMap(next: Record<string, CachedCreateAgentListEntry>) {
  uni.setStorageSync(CREATE_AGENT_LIST_CACHE_STORAGE_KEY, next)
}

function readCreateAgentConfigCacheMap() {
  return normalizeStorageRecord<CachedCreateAgentConfigEntry>(
    uni.getStorageSync(CREATE_AGENT_CONFIG_CACHE_STORAGE_KEY)
  )
}

function writeCreateAgentConfigCacheMap(next: Record<string, CachedCreateAgentConfigEntry>) {
  uni.setStorageSync(CREATE_AGENT_CONFIG_CACHE_STORAGE_KEY, next)
}

function readCreateAgentSelectionMap() {
  return normalizeStorageRecord<StoredCreateAgentSelectionEntry>(
    uni.getStorageSync(CREATE_AGENT_SELECTION_STORAGE_KEY)
  )
}

function writeCreateAgentSelectionMap(next: Record<string, StoredCreateAgentSelectionEntry>) {
  uni.setStorageSync(CREATE_AGENT_SELECTION_STORAGE_KEY, next)
}

function readCreateAgentConfigSelectionMap() {
  return normalizeStorageRecord<StoredCreateAgentConfigSelectionEntry>(
    uni.getStorageSync(CREATE_AGENT_CONFIG_SELECTION_STORAGE_KEY)
  )
}

function writeCreateAgentConfigSelectionMap(
  next: Record<string, StoredCreateAgentConfigSelectionEntry>
) {
  uni.setStorageSync(CREATE_AGENT_CONFIG_SELECTION_STORAGE_KEY, next)
}

function readFreshCreateAgentListCache(connectionKeyValue: string): CreateAgentOption[] | null {
  if (!connectionKeyValue) return null
  const cacheMap = readCreateAgentListCacheMap()
  const hit = cacheMap[connectionKeyValue]
  if (!hit) return null
  if (!isFreshCache(Number(hit.updatedAt || 0))) {
    delete cacheMap[connectionKeyValue]
    writeCreateAgentListCacheMap(cacheMap)
    return null
  }
  return Array.isArray(hit.options) ? hit.options : null
}

function persistCreateAgentListCache(connectionKeyValue: string, options: CreateAgentOption[]) {
  if (!connectionKeyValue) return
  const cacheMap = readCreateAgentListCacheMap()
  cacheMap[connectionKeyValue] = {
    updatedAt: Date.now(),
    options,
  }
  writeCreateAgentListCacheMap(cacheMap)
}

function readFreshCreateAgentConfigCache(contextKey: string): AgentOptionsSnapshot | null {
  if (!contextKey) return null
  const cacheMap = readCreateAgentConfigCacheMap()
  const hit = cacheMap[contextKey]
  if (!hit) return null
  if (!isFreshCache(Number(hit.updatedAt || 0))) {
    delete cacheMap[contextKey]
    writeCreateAgentConfigCacheMap(cacheMap)
    return null
  }
  return hit.snapshot && typeof hit.snapshot === "object" ? hit.snapshot : null
}

function persistCreateAgentConfigCache(contextKey: string, snapshot: AgentOptionsSnapshot) {
  if (!contextKey) return
  const cacheMap = readCreateAgentConfigCacheMap()
  cacheMap[contextKey] = {
    updatedAt: Date.now(),
    snapshot,
  }
  writeCreateAgentConfigCacheMap(cacheMap)
}

function readPersistedSelectedAgentType(connectionKeyValue: string): string {
  if (!connectionKeyValue) return ""
  const selectionMap = readCreateAgentSelectionMap()
  const hit = selectionMap[connectionKeyValue]
  return hit?.agentType ? normalizeAgentType(hit.agentType) : ""
}

function persistSelectedAgentType(connectionKeyValue: string, agentType: string) {
  if (!connectionKeyValue || !agentType) return
  const selectionMap = readCreateAgentSelectionMap()
  selectionMap[connectionKeyValue] = {
    updatedAt: Date.now(),
    agentType: normalizeAgentType(agentType),
  }
  writeCreateAgentSelectionMap(selectionMap)
}

function readPersistedCreateAgentConfigSelection(
  contextKey: string
): StoredCreateAgentConfigSelectionEntry | null {
  if (!contextKey) return null
  const selectionMap = readCreateAgentConfigSelectionMap()
  const hit = selectionMap[contextKey]
  if (!hit || typeof hit !== "object") return null
  return {
    updatedAt: Number(hit.updatedAt || 0),
    selectedModeId:
      typeof hit.selectedModeId === "string" && hit.selectedModeId.trim()
        ? hit.selectedModeId.trim()
        : null,
    selectedValues: normalizeSelectionValues(hit.selectedValues),
  }
}

function persistCreateAgentConfigSelection(
  contextKey: string,
  input: { selectedModeId: string | null; selectedValues: Record<string, string> }
) {
  if (!contextKey) return
  const selectionMap = readCreateAgentConfigSelectionMap()
  selectionMap[contextKey] = {
    updatedAt: Date.now(),
    selectedModeId:
      typeof input.selectedModeId === "string" && input.selectedModeId.trim()
        ? input.selectedModeId.trim()
        : null,
    selectedValues: normalizeSelectionValues(input.selectedValues),
  }
  writeCreateAgentConfigSelectionMap(selectionMap)
}

function persistCurrentCreateAgentConfigSelection() {
  const contextKey = currentCreateAgentConfigContextKey()
  if (!contextKey) return
  persistCreateAgentConfigSelection(contextKey, {
    selectedModeId: createAgentConfig.value.selectedModeId,
    selectedValues: createAgentConfig.value.selectedValues,
  })
}

function buildDefaultSelectedValues(options: SessionConfigOptionInfo[]) {
  const selected: Record<string, string> = {}
  for (const option of options) {
    const current = typeof option.kind?.current_value === "string" && option.kind.current_value
      ? option.kind.current_value
      : option.kind?.options?.[0]?.value
    if (current) selected[option.id] = current
  }
  return selected
}

function resolveSelectedModeId(
  modes: SessionModeStateInfo | null,
  persistedModeId?: string | null
): string | null {
  if (!modes || !Array.isArray(modes.available_modes) || modes.available_modes.length === 0) {
    return null
  }
  if (
    persistedModeId &&
    modes.available_modes.some((mode) => String(mode.id || "").trim() === persistedModeId)
  ) {
    return persistedModeId
  }
  if (
    typeof modes.current_mode_id === "string" &&
    modes.available_modes.some((mode) => String(mode.id || "").trim() === modes.current_mode_id)
  ) {
    return modes.current_mode_id
  }
  const fallback = modes.available_modes[0]
  return fallback ? String(fallback.id || "").trim() || null : null
}

function projectSelectedValues(
  options: SessionConfigOptionInfo[],
  persistedSelectedValues?: Record<string, string>
): Record<string, string> {
  const selected = buildDefaultSelectedValues(options)
  if (!persistedSelectedValues) return selected
  for (const option of options) {
    const persistedValue = persistedSelectedValues[option.id]
    if (!persistedValue) continue
    if (option.kind.options.some((item) => item.value === persistedValue)) {
      selected[option.id] = persistedValue
    }
  }
  return selected
}

function applyCreateAgentSnapshot(snapshot: AgentOptionsSnapshot, contextKey: string) {
  const configOptions = Array.isArray(snapshot?.config_options) ? snapshot.config_options : []
  const modes = snapshot?.modes ?? null
  const persistedSelection = readPersistedCreateAgentConfigSelection(contextKey)

  createAgentConfig.value = {
    status: "ready",
    modes,
    configOptions,
    selectedModeId: resolveSelectedModeId(modes, persistedSelection?.selectedModeId),
    selectedValues: projectSelectedValues(configOptions, persistedSelection?.selectedValues),
    message:
      !modes && configOptions.length === 0
        ? "该智能体将使用远端默认配置"
        : "",
  }
}

function normalizeCreateAgentOptions(raw: unknown): CreateAgentOption[] {
  const list = normalizeList(raw) as AcpAgentInfo[]
  const normalized = list
    .filter((item) => item && item.enabled !== false && item.available !== false)
    .map((item) => {
      const value = normalizeAgentType(item.agent_type)
      return {
        value,
        label: String(item.name || AGENT_LABELS[value] || value),
        description: item.description ? String(item.description) : "",
        sortOrder: typeof item.sort_order === "number" ? item.sort_order : Number.MAX_SAFE_INTEGER,
      }
    })
    .filter((item) => Boolean(item.value))
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
      return a.label.localeCompare(b.label)
    })
    .map(({ sortOrder: _sortOrder, ...item }) => item)

  return normalized.length > 0 ? normalized : DEFAULT_CREATE_AGENT_OPTIONS
}

async function loadCreateAgents() {
  if (!showCreateDialog.value || !selectedConnectionKey.value) return
  const targetConn = getConnectedConnections().find(
    (item) => connectionKey(item) === selectedConnectionKey.value
  )
  if (!targetConn) {
    createAgentOptions.value = DEFAULT_CREATE_AGENT_OPTIONS
    return
  }

  const token = ++createAgentListToken
  loadingCreateAgents.value = true
  try {
    const cachedOptions = readFreshCreateAgentListCache(selectedConnectionKey.value)
    if (cachedOptions && cachedOptions.length > 0) {
      if (token !== createAgentListToken) return
      createAgentOptions.value = cachedOptions
      if (!cachedOptions.some((item) => item.value === selectedAgentType.value)) {
        const fallback = cachedOptions[0]
        if (fallback) {
          selectedAgentType.value = fallback.value
          persistSelectedAgentType(selectedConnectionKey.value, fallback.value)
        }
      }
      return
    }

    const gateway = await createConnectionGateway(targetConn)
    const remoteAgents = await gateway.call<unknown>("acp_list_agents", {})
    if (token !== createAgentListToken) return
    const nextOptions = normalizeCreateAgentOptions(remoteAgents)
    createAgentOptions.value = nextOptions
    persistCreateAgentListCache(selectedConnectionKey.value, nextOptions)
    if (!nextOptions.some((item) => item.value === selectedAgentType.value)) {
      const fallback = nextOptions[0]
      if (fallback) {
        selectedAgentType.value = fallback.value
        persistSelectedAgentType(selectedConnectionKey.value, fallback.value)
      }
    }
  } catch (error) {
    if (token !== createAgentListToken) return
    console.warn("load create agents failed:", error)
    createAgentOptions.value = DEFAULT_CREATE_AGENT_OPTIONS
  } finally {
    if (token === createAgentListToken) {
      loadingCreateAgents.value = false
    }
  }
}

async function loadCreateAgentConfig() {
  if (!showCreateDialog.value || !selectedConnectionKey.value || !selectedAgentType.value) {
    resetCreateAgentConfig("")
    return
  }

  const targetConn = getConnectedConnections().find(
    (item) => connectionKey(item) === selectedConnectionKey.value
  )
  if (!targetConn) {
    resetCreateAgentConfig("连接不可用，将使用远端默认配置")
    return
  }

  const token = ++createAgentProbeToken
  const contextKey = buildCreateAgentConfigContextKey(
    selectedConnectionKey.value,
    selectedAgentType.value,
    selectedProjectPath.value
  )
  const cachedSnapshot = readFreshCreateAgentConfigCache(contextKey)
  if (cachedSnapshot) {
    applyCreateAgentSnapshot(cachedSnapshot, contextKey)
    return
  }

  createAgentConfig.value = {
    status: "loading",
    modes: null,
    configOptions: [],
    selectedModeId: null,
    selectedValues: {},
    message: "",
  }

  try {
    const gateway = await createConnectionGateway(targetConn)
    const snapshot = await gateway.call<AgentOptionsSnapshot>("acp_describe_agent_options", {
      agentType: selectedAgentType.value,
      workingDir: selectedProjectPath.value || null,
    })
    if (token !== createAgentProbeToken) return
    persistCreateAgentConfigCache(contextKey, snapshot)
    applyCreateAgentSnapshot(snapshot, contextKey)
  } catch (error) {
    if (token !== createAgentProbeToken) return
    resetCreateAgentConfig("读取失败，将使用远端默认配置")
    createAgentConfig.value.status = "failed"
  }
}

function selectCreateMode(modeId: string) {
  createAgentConfig.value.selectedModeId = modeId
  persistCurrentCreateAgentConfigSelection()
}

function selectCreateConfigValue(configId: string, valueId: string) {
  createAgentConfig.value = {
    ...createAgentConfig.value,
    selectedValues: {
      ...createAgentConfig.value.selectedValues,
      [configId]: valueId,
    },
  }
  persistCurrentCreateAgentConfigSelection()
}

function openCreateConfigDialog() {
  if (createAgentConfig.value.status === "loading") return
  showCreateConfigDialog.value = true
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
  if (!disposeOverviewInvalidation) {
    disposeOverviewInvalidation = subscribeConversationOverviewInvalidation(() => {
      markConversationListDirty()
      void loadOverviewData({ force: true })
    })
  }
  syncCateTabHeight()
})

onUnload(() => {
  disposeOverviewInvalidation?.()
  disposeOverviewInvalidation = null
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
  const shouldForceRefresh = consumeConversationListDirty()
  void loadOverviewData(shouldForceRefresh ? { force: true } : undefined)
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
    const groups = await Promise.all(
      connected.map(async (conn) => {
        try {
          return await loadConnectionGroup(conn)
        } catch (error) {
          const message = toErrorMessage(error)
          console.warn("[conversations] load connection group failed", {
            connection: conn.name,
            key: connectionKey(conn),
            message,
          })
          return buildConnectionErrorGroup(conn, message)
        }
      })
    )
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
  await ensureGlobalConversationSync(descriptor.instanceKey).catch((error) => {
    console.warn("ensure global conversation sync skipped:", error)
  })
  const foldersRaw = await gateway.call<unknown>("list_open_folder_details")
  const folders = normalizeList(foldersRaw) as Project[]
  const tabsRaw = await gateway.call<unknown>("list_opened_tabs")
  const tabs = normalizeList(tabsRaw) as OpenedTabItem[]
  const localConversations = (await loadLocalConversationSummaries(
    descriptor.instanceKey,
    folders
  )) || []

  if (localConversations.length > 0) {
    const initialGroup = buildConnectionGroupSnapshot({
      conn,
      folders,
      tabs,
      conversations: localConversations,
    })
    void scheduleOverviewConversationRefresh({
      conn,
      gateway,
      instanceKey: descriptor.instanceKey,
      folders,
      tabs,
    })
    return initialGroup
  }

  const remoteConversations = await fetchRemoteConversations(gateway, folders)
  await persistConversationSummaries(descriptor.instanceKey, remoteConversations)
  return buildConnectionGroupSnapshot({
    conn,
    folders,
    tabs,
    conversations: remoteConversations,
  })
}

function buildConnectionErrorGroup(
  conn: ConnectionItem,
  message: string
): ConnectionGroup {
  return {
    key: connectionKey(conn),
    name: conn.name,
    mode: conn.mode,
    url: conn.url,
    projects: [],
    openTabCards: [],
    recentActiveCards: [],
    cards: [],
    loadError: message,
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
      .map(mapConversationSummaryRecordToConversation)
  } catch (error) {
    console.warn("load local conversation summaries skipped:", error)
    return null
  }
}

async function loadRemoteConnectionSnapshot(
  conn: ConnectionItem,
  folders: Project[],
  tabs: OpenedTabItem[]
): Promise<ConnectionGroup> {
  const gateway = await createConnectionGateway(conn)
  const descriptor = gateway.getRemoteInstanceDescriptor()
  const remoteConversations = await fetchRemoteConversations(gateway, folders)
  await persistConversationSummaries(descriptor.instanceKey, remoteConversations)
  return buildConnectionGroupSnapshot({
    conn,
    folders,
    tabs,
    conversations: remoteConversations,
  })
}

async function refreshConnectionGroupFromRemote(conn: ConnectionItem, current: ConnectionGroup) {
  const gateway = await createConnectionGateway(conn)
  const descriptor = gateway.getRemoteInstanceDescriptor()
  await ensureGlobalConversationSync(descriptor.instanceKey).catch((error) => {
    console.warn("ensure global conversation sync skipped:", error)
  })
  const foldersRaw = await gateway.call<unknown>("list_open_folder_details")
  const folders = normalizeList(foldersRaw) as Project[]
  const tabsRaw = await gateway.call<unknown>("list_opened_tabs")
  const tabs = normalizeList(tabsRaw) as OpenedTabItem[]
  const nextGroup = await loadRemoteConnectionSnapshot(conn, folders, tabs)
  replaceConnectionGroup(nextGroup)
}

async function scheduleOverviewConversationRefresh(input: {
  conn: ConnectionItem
  gateway: Awaited<ReturnType<typeof createConnectionGateway>>
  instanceKey: string
  folders: Project[]
  tabs: OpenedTabItem[]
}) {
  const key = connectionKey(input.conn)
  if (overviewRefreshPromiseMap.has(key)) {
    return await overviewRefreshPromiseMap.get(key)
  }

  const task = (async () => {
    try {
      const remoteConversations = await fetchRemoteConversations(input.gateway, input.folders)
      await persistConversationSummaries(input.instanceKey, remoteConversations)
      replaceConnectionGroup(
        buildConnectionGroupSnapshot({
          conn: input.conn,
          folders: input.folders,
          tabs: input.tabs,
          conversations: remoteConversations,
        })
      )
    } catch (error) {
      console.warn("refresh connection group conversations skipped:", error)
    } finally {
      overviewRefreshPromiseMap.delete(key)
    }
  })()

  overviewRefreshPromiseMap.set(key, task)
  await task
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

function toConnectionGroup(snapshot: ConnectionConversationSnapshot): ConnectionGroup {
  return {
    ...snapshot,
    cards: [...snapshot.openTabCards, ...snapshot.recentActiveCards],
  }
}

function buildConnectionGroupSnapshot(input: {
  conn: ConnectionItem
  folders: Project[]
  tabs: OpenedTabItem[]
  conversations: Conversation[]
}) {
  return toConnectionGroup(
    buildConnectionConversationSnapshot({
      connectionKey: connectionKey(input.conn),
      connectionName: input.conn.name,
      mode: input.conn.mode,
      url: input.conn.url,
      folders: input.folders,
      tabs: input.tabs,
      conversations: input.conversations,
    })
  )
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

async function seedCreatedConversationSummary(input: {
  gateway: Awaited<ReturnType<typeof createConnectionGateway>>
  instanceKey: string
  conversationId: number
  folderId: number
  title: string
  agentType: string
  hasTaskContent: boolean
}) {
  const now = Date.now()

  await upsertConversationSummary({
    id: input.conversationId,
    instanceKey: input.instanceKey,
    folderId: input.folderId,
    title: input.title.trim() || `会话 #${input.conversationId}`,
    agentType: normalizeAgentType(input.agentType),
    externalId: null,
    connectionId: null,
    status: normalizeConversationStatus(input.hasTaskContent ? "in_progress" : "unknown"),
    lastTurnId: null,
    lastMessageAt: now,
    unreadCount: 0,
    isPinned: false,
    deletedAt: null,
    updatedAt: now,
  })

  try {
    const detail = await input.gateway.call<any>("get_folder_conversation", {
      conversationId: input.conversationId,
    })
    const summary =
      detail?.summary && typeof detail.summary === "object"
        ? detail.summary
        : {}
    const title = firstString(detail?.title, summary?.title, input.title)
    await upsertConversationSummary({
      id: input.conversationId,
      instanceKey: input.instanceKey,
      folderId: Number(detail?.folder_id || detail?.folderId || summary?.folder_id || input.folderId),
      title: title || `会话 #${input.conversationId}`,
      agentType: normalizeAgentType(
        firstString(detail?.agent_type, detail?.agentType, summary?.agent_type, input.agentType)
      ),
      externalId: firstString(detail?.session_id, detail?.sessionId, summary?.external_id) || null,
      connectionId: null,
      status: normalizeConversationStatus(
        firstString(detail?.status, summary?.status, input.hasTaskContent ? "in_progress" : "unknown")
      ),
      lastTurnId: null,
      lastMessageAt: now,
      unreadCount: 0,
      isPinned: false,
      deletedAt: null,
      updatedAt: now,
    })
  } catch (error) {
    console.warn("seed created conversation detail skipped:", error)
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
  return normalizeConversationSummaryStatus(value)
}

function mapRuntimeStatusToOverviewStatus(status?: string | null): string | null {
  const normalized = String(status || "").trim().toLowerCase()
  if (!normalized) return null
  if (
    normalized === "waiting_permission" ||
    normalized === "thinking" ||
    normalized === "running_tool" ||
    normalized === "connecting" ||
    normalized === "connected"
  ) {
    return "in_progress"
  }
  if (normalized === "error") {
    return "failed"
  }
  if (normalized === "idle") {
    return null
  }
  return null
}

function resolveOverviewCardStatus(card: LiveSessionCard): string {
  const conversationId = Number(card.conversationId || 0)
  if (conversationId <= 0) {
    return card.status
  }

  const runtimeSession = runtime.sessions.get(conversationId)
  if (!runtimeSession) {
    return card.status
  }

  return mapRuntimeStatusToOverviewStatus(runtimeSession.status) || card.status
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
    createAgentOptions.value = DEFAULT_CREATE_AGENT_OPTIONS
    selectedAgentType.value = "claude_code"
    return
  }
  const group = connectionGroups.value.find((item) => item.key === connectionKeyValue)
  if (!group) return
  selectedConnectionKey.value = group.key
  selectedConnectionName.value = group.name
  selectedProjectId.value = 0
  selectedProjectName.value = ""
  const cachedOptions = readFreshCreateAgentListCache(group.key)
  if (cachedOptions && cachedOptions.length > 0) {
    createAgentOptions.value = cachedOptions
  } else {
    createAgentOptions.value = DEFAULT_CREATE_AGENT_OPTIONS
  }
  const persistedAgentType = readPersistedSelectedAgentType(group.key)
  selectedAgentType.value = persistedAgentType || "claude_code"
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
  if (group.loadError) return

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
      await refreshConnectionGroupFromRemote(conn, group)
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
  resetCreateAgentConfig("")
  const cachedOptions = readFreshCreateAgentListCache(selectedConnectionKey.value)
  createAgentOptions.value = cachedOptions && cachedOptions.length > 0
    ? cachedOptions
    : DEFAULT_CREATE_AGENT_OPTIONS
  if (!createAgentOptions.value.some((item) => item.value === selectedAgentType.value)) {
    selectedAgentType.value = createAgentOptions.value[0]?.value || "claude_code"
  }
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

function showGroupError(group: ConnectionGroup) {
  if (!group.loadError) return
  uni.showModal({
    title: `${group.name} 连接异常`,
    content: group.loadError,
    showCancel: false,
    confirmText: "知道了",
  })
}

function selectAgent(agentType: string) {
  selectedAgentType.value = normalizeAgentType(agentType)
  persistSelectedAgentType(selectedConnectionKey.value, selectedAgentType.value)
}

async function applyCreateAgentConfig(
  gateway: Awaited<ReturnType<typeof createConnectionGateway>>,
  connectionId: string
) {
  for (const option of createAgentConfig.value.configOptions) {
    const selectedValueId = createAgentConfig.value.selectedValues[option.id]
    if (!selectedValueId) continue
    await gateway.call("acp_set_config_option", {
      connectionId,
      configId: option.id,
      valueId: selectedValueId,
    })
  }
}

function resolveConnectedSessionId(connection: ConnectionInfo | null | undefined) {
  if (!connection || typeof connection !== "object") return ""
  return String(connection.sessionId || "").trim()
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
    persistSelectedAgentType(selectedConnectionKey.value, selectedAgentType.value)
    persistCurrentCreateAgentConfigSelection()
    const targetConn = getConnectedConnections().find(
      (item) => connectionKey(item) === selectedConnectionKey.value
    )
    if (!targetConn) {
      throw new Error("连接不存在或已断开")
    }
    const gateway = await createConnectionGateway(targetConn)
    syncAuthToConnection(targetConn)
    const foldersRaw = await gateway.call<unknown>("list_open_folder_details")
    const selectedProject = normalizeList(foldersRaw).find(
      (project) => Number((project as Project | null | undefined)?.id || 0) === selectedProjectId.value
    ) as Project | undefined
    if (!selectedProject) {
      throw new Error("项目不存在或列表已过期，请刷新后重试")
    }

    const connectionInfo = await gateway.call<ConnectionInfo>("acp_connect", {
      agentType: selectedAgentType.value,
      workingDir: selectedProject.path || undefined,
      preferredModeId: createAgentConfig.value.selectedModeId || undefined,
    })
    const connectionId = typeof connectionInfo === "string"
      ? connectionInfo
      : String(connectionInfo?.id || "").trim()
    if (!connectionId) {
      throw new Error("智能体连接失败：返回数据异常")
    }

    await applyCreateAgentConfig(gateway, connectionId)

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
    await seedCreatedConversationSummary({
      gateway,
      instanceKey: gateway.getRemoteInstanceDescriptor().instanceKey,
      conversationId: newConversationId,
      folderId: selectedProjectId.value,
      title: newConversationTitle.value,
      agentType: selectedAgentType.value,
      hasTaskContent: Boolean(taskContent),
    })

    if (taskContent) {
      await gateway.call("acp_prompt", {
        connectionId,
        blocks: [{ type: "text", text: taskContent }],
        folderId: selectedProjectId.value,
        conversationId: newConversationId,
      })
    }

    runtime.bindCreatedConversationRuntime({
      conversationId: newConversationId,
      folderId: selectedProjectId.value,
      agentType: selectedAgentType.value,
      connectionId,
      sessionId: resolveConnectedSessionId(connectionInfo),
    })

    let sidebarRefreshTriggered = false
    await gateway.call("open_folder_by_id", {
      folderId: selectedProjectId.value,
    }).catch((error) => {
      console.warn("open folder by id skipped:", error)
    })
    if (selectedProject.path) {
      await gateway.call("open_folder_in_workspace", {
        path: selectedProject.path,
      }).then(() => {
        sidebarRefreshTriggered = true
      }).catch((error) => {
        console.warn("open folder in workspace skipped:", error)
      })
    }

    uni.showToast({ title: "创建成功", icon: "success" })
    showCreateDialog.value = false
    newConversationTitle.value = ""
    newTaskContent.value = ""
    resetCreateAgentConfig("")
    selectedAgentType.value = "claude_code"
    createAgentOptions.value = DEFAULT_CREATE_AGENT_OPTIONS
    markConversationListDirty()
    if (!sidebarRefreshTriggered) {
      uni.showToast({
        title: "会话已创建，codeg 刷新可能延迟",
        icon: "none",
        duration: 2500,
      })
    }
    await loadOverviewData({ force: true })
    openConversation(
      { id: newConversationId, folder_id: selectedProjectId.value },
      selectedConnectionKey.value
    )
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
            markConversationListDirty()
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
            await gateway.call("update_conversation_title", {
              conversationId: currentConversation.value!.id,
              title: res.content,
            })
            uni.showToast({ title: "重命名成功", icon: "success" })
            markConversationListDirty()
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

.group-section__header {
  display: flex;
  align-items: center;
  gap: 10rpx;
  margin-bottom: 10rpx;
  padding-left: 4rpx;
}

.group-section__title {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: #1d1d1f;
  flex: 0 1 auto;
}

.group-section__error {
  width: 34rpx;
  height: 34rpx;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx;
  background: rgba(250, 53, 52, 0.1);
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

.form-readonly--config {
  gap: 12rpx;
}

.form-readonly__stack {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.form-helper-inline {
  font-size: 22rpx;
  color: #a0a7b4;
  line-height: 1.4;
}

.form-helper-text {
  display: block;
  margin-top: 12rpx;
  padding: 0 8rpx;
  font-size: 22rpx;
  line-height: 1.4;
  color: #a0a7b4;
  word-break: break-all;
}

.agent-scroll {
  width: 100%;
  white-space: nowrap;
}

.agent-grid {
  display: flex;
  align-items: stretch;
  gap: 16rpx;
  padding-right: 8rpx;
}

.agent-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  width: 180rpx;
  min-width: 180rpx;
  flex-shrink: 0;
  padding: 20rpx 12rpx 18rpx;
  border-radius: 24rpx;
  background: #f7f8fa;
  border: 2rpx solid transparent;
  transition: all 0.18s ease;
}

.agent-card--active {
  background: #eef4ff;
  border-color: #2979ff;
  box-shadow: 0 8rpx 24rpx rgba(41, 121, 255, 0.12);
}

.agent-card__logo {
  width: 76rpx;
  height: 76rpx;
  border-radius: 22rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.agent-card__logo--real {
  background: #ffffff;
}

.agent-card__logo-img {
  width: 48rpx;
  height: 48rpx;
}

.agent-card__logo-text {
  font-size: 24rpx;
  font-weight: 700;
  color: #1d1d1f;
}

.agent-card__label {
  font-size: 22rpx;
  line-height: 1.3;
  text-align: center;
  color: #303133;
}

.config-loading {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 12rpx 4rpx;
}

.config-loading__text,
.config-hint__text,
.config-section__desc {
  font-size: 24rpx;
  color: #7a8191;
}

.config-hint {
  padding: 8rpx 4rpx;
}

.config-section {
  margin-top: 20rpx;
}

.config-section__title {
  display: block;
  margin-bottom: 12rpx;
  font-size: 24rpx;
  color: #5f6470;
}

.config-section__desc {
  display: block;
  margin-bottom: 12rpx;
  line-height: 1.4;
}

.config-chip-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.config-chip {
  padding: 14rpx 20rpx;
  border-radius: 999rpx;
  background: #f5f6f8;
  border: 2rpx solid transparent;
}

.config-chip--active {
  background: #eef4ff;
  border-color: #2979ff;
}

.config-chip__title {
  font-size: 24rpx;
  color: #303133;
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
