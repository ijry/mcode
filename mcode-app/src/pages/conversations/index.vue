<template>
  <view class="page conversations-page" :style="[upThemeVars, upThemePageStyle]">
    <!-- 液态玻璃背景光斑 -->
    <view class="liquid-bg" aria-hidden="true">
      <view class="liquid-blob liquid-blob--one"></view>
      <view class="liquid-blob liquid-blob--two"></view>
      <view class="liquid-blob liquid-blob--three"></view>
    </view>
    <view class="conversations-shell">
      <up-sticky class="conversations-sticky" :offset-top="0" :custom-nav-height="0" bg-color="transparent" z-index="20">
        <view class="conversations-header">
          <text class="conversations-header__title">会话</text>
          <view class="conversations-header__action" @click="createConversation()">
            <up-icon name="plus" size="20" :color="upThemeVar('--up-primary', '#2f7cf6')"></up-icon>
          </view>
        </view>

        <view class="conversations-searchbar">
          <up-search
            v-model="searchKeyword"
            placeholder="搜索会话..."
            :show-action="false"
            shape="round"
            :bgColor="upThemeVar('--up-hover-bg-color', '#e9eaee')"
            borderColor="transparent"
            :color="upThemeVar('--up-main-color', '#1a1b1f')"
            :placeholderColor="upThemeVar('--up-tips-color', '#9ca3af')"
            :searchIconColor="upThemeVar('--up-tips-color', '#8b93a5')"
            :height="44"
            @search="() => {}"
            @clear="() => {}"
          ></up-search>
        </view>
      </up-sticky>

      <!-- 无连接 -->
      <view v-if="!hasActiveConnection" class="empty-fullpage conversations-empty-fullpage">
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

              <view class="group-section__cards">
                <view v-if="group.cards.length === 0" class="group-empty">
                  <text class="group-empty__text">
                    {{ group.loadError || "暂无打开中的标签会话" }}
                  </text>
                </view>

                <view
                  v-for="card in group.cards"
                  :key="`${group.key}-${card.tabId}`"
                  class="live-card"
                  :style="upThemeCardStyle"
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
                    <text class="live-card__session-name u-line-1">{{ card.title || "未命名会话" }}</text>
                  </view>

                  <view class="live-card__side">
                    <view :class="['status-chip', `status-chip--${statusClass(card.displayStatus)}` ]">
                      <text class="status-chip__text">{{ statusLabel(card.displayStatus) }}</text>
                    </view>
                    <text class="live-card__stamp">{{ formatTime(card.updatedAt) }}</text>
                  </view>
                </view>

                <view class="live-card live-card--history" :style="upThemeCardStyle" @click="openHistoryPanel(group)">
                  <view class="agent-logo agent-logo--history">
                    <up-icon name="clock" size="18" color="#2f7cf6"></up-icon>
                  </view>
                  <view class="live-card__body">
                    <text class="live-card__project-title u-line-1">历史会话</text>
                    <text class="live-card__session-name u-line-1">查看已结束或已完成会话</text>
                  </view>
                  <view class="live-card__side live-card__side--history">
                    <view class="status-chip status-chip--history">
                      <text class="status-chip__text">查看</text>
                    </view>
                    <up-icon name="arrow-right" size="12" color="#c0c4cc"></up-icon>
                  </view>
                </view>
              </view>
            </view>
          </view>
        </view>

        <!-- 历史模式：项目分组列表 -->
        <view v-else class="history-list">
          <view class="history-mode-bar" :style="upThemeCardStyle">
            <view class="history-mode-back" @click="closeHistoryPanel">
              <up-icon name="arrow-left" size="14" color="#2979ff"></up-icon>
              <text class="history-mode-back__text">返回分组</text>
            </view>
            <text class="history-mode-title u-line-1">{{ historyGroupTitle }}</text>
            <view
              v-if="canCreateInHistory"
              class="history-mode-create"
              @click="createConversation()"
            >
              <up-icon name="plus" size="14" color="#2979ff"></up-icon>
              <text class="history-mode-create__text">新建</text>
            </view>
          </view>

          <view v-if="historyLoading && historyProjectSections.length === 0" class="inline-loading">
            <up-loading-icon color="#2979ff" size="28"></up-loading-icon>
            <text class="inline-loading__text">加载中...</text>
          </view>
          <view v-else-if="historyProjectSections.length === 0" class="empty-fullpage">
            <up-empty mode="list" text="暂无历史会话"></up-empty>
          </view>

          <scroll-view v-else class="history-scroll" scroll-y enhanced>
            <up-collapse
              class="history-collapse"
              :value="activeHistoryProjectId"
              accordion
              :border="false"
              @open="handleHistoryCollapseOpen"
              @close="handleHistoryCollapseClose"
            >
              <up-collapse-item
                v-for="section in historyProjectSections"
                :key="section.projectId"
                class="history-collapse-item"
                :name="section.projectId"
                :border="false"
              >
                <template #title>
                  <view class="history-section__header">
                    <view class="history-section__text">
                      <text class="history-section__title u-line-1">{{ section.title }}</text>
                      <text v-if="section.path" class="history-section__path u-line-1">{{ section.path }}</text>
                    </view>
                    <text class="history-section__count">{{ section.count }}</text>
                  </view>
                </template>

                <view class="conv-list conv-list--history">
                  <view
                    v-for="conv in section.conversations"
                    :key="conv.id"
                    class="conv-card conv-card--history"
                    :style="upThemeCardStyle"
                    @click="openConversation(conv, historyGroupKey)"
                  >
                    <view class="conv-card__icon">
                      <up-icon name="chat-fill" size="17" color="#2979ff"></up-icon>
                    </view>
                    <view class="conv-card__body">
                      <text class="conv-card__title u-line-1">{{ conv.title || "未命名会话" }}</text>
                      <text class="conv-card__subtitle u-line-1">{{ getHistoryConversationMeta(conv) }}</text>
                    </view>
                    <view class="conv-card__actions">
                      <view class="conv-card__menu" @click.stop="showConversationMenu(conv)">
                        <up-icon name="more-dot-fill" size="16" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
                      </view>
                      <up-icon name="arrow-right" size="12" :color="upThemeVar('--up-light-color', '#c0c4cc')"></up-icon>
                    </view>
                  </view>
                </view>
              </up-collapse-item>
            </up-collapse>
            <view class="safe-bottom"></view>
          </scroll-view>
        </view>
      </view>
    </view>

    <!-- 创建会话底部弹层 -->
    <up-popup v-model:show="showCreateDialog" mode="bottom" :round="28">
      <view class="create-sheet" :style="upThemeCardStyle">
        <view class="create-sheet__hd">
          <text class="create-sheet__title">新建会话</text>
          <view class="create-sheet__close" @click="showCreateDialog = false">
            <up-icon name="close" size="20" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
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
            v-if="createAgentListHelperText"
            class="form-helper-text"
          >{{ createAgentListHelperText }}</text>
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
            <up-icon name="arrow-right" size="14" :color="upThemeVar('--up-light-color', '#c0c4cc')"></up-icon>
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
          :disabled="createSubmitDisabled"
          shape="circle"
          @click="confirmCreate"
          customStyle="margin-top:16rpx"
        >创建会话</up-button>

        <view class="safe-bottom"></view>
      </view>
    </up-popup>

    <up-popup v-model:show="showCreateConfigDialog" mode="bottom" :round="28">
      <view class="create-sheet" :style="upThemeCardStyle">
        <view class="create-sheet__hd">
          <text class="create-sheet__title">智能体配置</text>
          <view class="create-sheet__close" @click="showCreateConfigDialog = false">
            <up-icon name="close" size="20" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
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

    <up-popup
      :show="creating"
      mode="center"
      :round="28"
      :close-on-click-overlay="false"
      :safe-area-inset-bottom="false"
    >
      <view class="create-progress-dialog" :style="upThemeCardStyle">
        <view class="create-progress-dialog__visual" aria-hidden="true">
          <view class="create-progress-dialog__ring"></view>
          <view class="create-progress-dialog__ring create-progress-dialog__ring--delay"></view>
          <view class="create-progress-dialog__core">
            <up-loading-icon mode="circle" size="28" :color="upThemeVar('--up-primary', '#2979ff')"></up-loading-icon>
          </view>
        </view>
        <text class="create-progress-dialog__title">正在创建会话</text>
        <text class="create-progress-dialog__desc">正在连接智能体并初始化会话，请不要关闭页面。</text>
        <view class="create-progress-dialog__stage">
          <view class="create-progress-dialog__stage-dot"></view>
          <text class="create-progress-dialog__stage-text">{{ createProgressText }}</text>
        </view>
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
import { ref, computed, onMounted, watch } from "vue"
import { onPullDownRefresh, onShow, onUnload } from "@dcloudio/uni-app"
import { useAuthStore } from "@/stores/auth"
import { useConversationRuntimeStore } from "@/stores/conversationRuntime"
import { acpApi } from "@/api/acp"
import { getDirectToken } from "@/services/gateway/directTokenStore"
import { toErrorMessage } from "@/services/gateway/error"
import {
  getConversationOverviewConnections,
  hasConversationOverviewConnections,
} from "./overviewState"
import {
  buildConnectionKey,
  buildLegacyRouteKey,
  connectionKeyMatches,
  encodeConnectionContext,
  isConnectionMarkedConnected,
  readStoredConnections,
  resolveConnectionContext,
  type ConnectionContext,
} from "@/services/connectionContext"
import { ensureConversationSchema } from "@/services/db/migrations"
import {
  buildAgentConfigContextKey,
  createReadyDetailAgentConfigState,
  persistAgentConfigCache,
  persistAgentConfigSelection,
  readFreshAgentConfigCache,
  readPersistedAgentConfigSelection,
} from "@/services/conversation/composerTools"
import {
  consumeConversationListDirty,
  markConversationListDirty,
} from "@/services/conversation/conversationListRefresh"
import {
  ensureGlobalConversationSync,
  subscribeConversationOverviewInvalidation,
} from "@/services/conversation/globalConversationSync"
import {
  applyOpenedTabsSnapshot,
  getOpenedTabsSnapshot,
  replaceOpenedTabsSnapshot,
} from "@/services/conversation/openedTabsRealtimeCache"
import {
  ensureConversationTab,
  normalizeOpenedTabsList,
} from "@/services/conversation/pcTabSyncService"
import {
  buildConnectionConversationSnapshot,
  mapConversationSummaryRecordToConversation,
  mapConversationToSummaryRecord,
  type ConnectionConversationSnapshot,
  type ConversationOverviewConversation,
  type ConversationOverviewProject,
  type ConversationOverviewOpenedTab,
} from "@/services/conversation/conversationOverviewSnapshot"
import {
  buildHistoryProjectSections,
  formatHistoryConversationMeta,
} from "@/pages/conversations/historyPresentation"
import { normalizeConversationSummaryStatus } from "@/services/conversation/conversationSummaryStatus"
import {
  listConversationSummaries,
  upsertConversationSummary,
  upsertConversationSummaries,
} from "@/services/db/repositories/conversationRepository"
import { getRegisteredRemoteInstanceDescriptor } from "@/services/realtime/remoteInstanceRegistry"
import type { CodegGateway } from "@/services/gateway"
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
const showHistoryPanel = ref(false)
const historyGroupKey = ref("")
const historyGroupTitle = ref("")
const historyLoading = ref(false)
const activeHistoryProjectId = ref<string | number>("")
const createProgressStageIndex = ref(0)
let overviewLoadPromise: Promise<void> | null = null
let lastOverviewLoadedAt = 0
const historyLoadPromiseMap = new Map<string, Promise<void>>()
const overviewRefreshPromiseMap = new Map<string, Promise<void>>()
const connectionFolderSnapshotMap = new Map<string, Project[]>()
const connectionTabSnapshotMap = new Map<string, OpenedTabItem[]>()
const instanceConnectionKeyMap = new Map<string, string>()
const loadingCreateAgents = ref(false)
const createAgentListError = ref("")
let createAgentProbeToken = 0
let createAgentListToken = 0
let disposeOverviewInvalidation: (() => void) | null = null
const disposeOpenedTabsChangedMap = new Map<string, () => void>()
let activeCreateRequestId = ""
let activeCreateRequestFingerprint = ""
let activeCreateConversationId = 0
let activeCreatePromptAttempted = false
let createProgressTimer: ReturnType<typeof setInterval> | null = null

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

interface StoredCreateAgentSelectionEntry {
  updatedAt: number
  agentType: string
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
const CREATE_AGENT_SELECTION_STORAGE_KEY = "mcode_create_agent_selection_v1"
const CREATE_PROGRESS_STAGES = [
  "准备连接信息",
  "拉起智能体会话",
  "应用会话配置",
  "写入会话记录",
  "打开新会话",
]

type Project = ConversationOverviewProject
type Conversation = ConversationOverviewConversation
type ConnectionItem = ConnectionContext

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
  return true
})

const historyProjectSections = computed(() =>
  buildHistoryProjectSections(projects.value, searchKeyword.value)
)
watch(
  historyProjectSections,
  (sections) => {
    if (sections.length === 0) {
      activeHistoryProjectId.value = ""
      return
    }
    const hasActiveProject = sections.some(
      (section) => section.projectId === activeHistoryProjectId.value
    )
    if (!hasActiveProject) {
      activeHistoryProjectId.value = sections[0].projectId
    }
  },
  { immediate: true }
)

watch(
  () => [showCreateDialog.value, selectedConnectionKey.value] as const,
  ([open]) => {
    if (!open) {
      createAgentProbeToken += 1
      createAgentListToken += 1
      showCreateConfigDialog.value = false
      resetCreateAgentConfig("")
      clearPendingCreateRequest()
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

const selectedCreateAgentAvailable = computed(() =>
  createAgentOptions.value.some((item) => item.value === selectedAgentType.value)
)

const createSubmitDisabled = computed(
  () =>
    creating.value ||
    loadingCreateAgents.value ||
    !selectedProjectId.value ||
    !selectedConnectionKey.value ||
    !selectedAgentType.value ||
    !selectedCreateAgentAvailable.value ||
    Boolean(createAgentListError.value)
)

const createAgentListHelperText = computed(() => {
  if (createAgentListError.value) return createAgentListError.value
  if (!loadingCreateAgents.value && createAgentOptions.value.length === 0) {
    return "未读取到可用智能体，请检查远端智能体设置后重试"
  }
  return ""
})

const createProgressText = computed(() => {
  return CREATE_PROGRESS_STAGES[createProgressStageIndex.value] || CREATE_PROGRESS_STAGES[0]
})

watch(creating, (active) => {
  if (active) {
    startCreateProgressTimer()
  } else {
    stopCreateProgressTimer()
  }
})

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

function clearPendingCreateRequest() {
  activeCreateRequestId = ""
  activeCreateRequestFingerprint = ""
  activeCreateConversationId = 0
  activeCreatePromptAttempted = false
}

function startCreateProgressTimer() {
  stopCreateProgressTimer()
  createProgressStageIndex.value = 0
  createProgressTimer = setInterval(() => {
    createProgressStageIndex.value =
      (createProgressStageIndex.value + 1) % CREATE_PROGRESS_STAGES.length
  }, 1800)
}

function stopCreateProgressTimer() {
  if (createProgressTimer) {
    clearInterval(createProgressTimer)
    createProgressTimer = null
  }
  createProgressStageIndex.value = 0
}

function createConversationRequestFingerprint() {
  const selectedValues = Object.entries(createAgentConfig.value.selectedValues)
    .sort(([left], [right]) => left.localeCompare(right))
  return JSON.stringify({
    connectionKey: selectedConnectionKey.value,
    projectId: selectedProjectId.value,
    agentType: selectedAgentType.value,
    title: newConversationTitle.value.trim(),
    taskContent: newTaskContent.value.trim(),
    modeId: createAgentConfig.value.selectedModeId || "",
    selectedValues,
  })
}

function resolveCreateRequestId() {
  const fingerprint = createConversationRequestFingerprint()
  if (!activeCreateRequestId || activeCreateRequestFingerprint !== fingerprint) {
    activeCreateRequestId = `mcode-create-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 10)}`
    activeCreateRequestFingerprint = fingerprint
  }
  return activeCreateRequestId
}

function normalizeStorageRecord<T>(raw: unknown): Record<string, T> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {}
  }
  return raw as Record<string, T>
}

function isFreshCache(updatedAt: number, ttlMs = CREATE_AGENT_CACHE_TTL_MS): boolean {
  return Number.isFinite(updatedAt) && updatedAt > 0 && Date.now() - updatedAt < ttlMs
}

function currentCreateAgentConfigContextKey(): string {
  if (!selectedConnectionKey.value || !selectedAgentType.value) return ""
  return buildAgentConfigContextKey(
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

function readCreateAgentSelectionMap() {
  return normalizeStorageRecord<StoredCreateAgentSelectionEntry>(
    uni.getStorageSync(CREATE_AGENT_SELECTION_STORAGE_KEY)
  )
}

function writeCreateAgentSelectionMap(next: Record<string, StoredCreateAgentSelectionEntry>) {
  uni.setStorageSync(CREATE_AGENT_SELECTION_STORAGE_KEY, next)
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

function persistCurrentCreateAgentConfigSelection() {
  const contextKey = currentCreateAgentConfigContextKey()
  if (!contextKey) return
  persistAgentConfigSelection(contextKey, {
    selectedModeId: createAgentConfig.value.selectedModeId,
    selectedValues: createAgentConfig.value.selectedValues,
  })
}

function applyCreateAgentSnapshot(snapshot: AgentOptionsSnapshot, contextKey: string) {
  const persistedSelection = readPersistedAgentConfigSelection(contextKey)
  createAgentConfig.value = createReadyDetailAgentConfigState(
    snapshot,
    persistedSelection || undefined
  )
}

function normalizeCreateAgentOptions(raw: unknown): CreateAgentOption[] {
  const list = normalizeList(raw) as AcpAgentInfo[]
  return list
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
}

async function loadCreateAgents() {
  if (!showCreateDialog.value || !selectedConnectionKey.value) return
  const targetConn = findConnectedConnectionByKey(selectedConnectionKey.value)
  if (!targetConn) {
    createAgentOptions.value = []
    createAgentListError.value = "连接不可用，无法读取智能体"
    return
  }

  const token = ++createAgentListToken
  loadingCreateAgents.value = true
  createAgentListError.value = ""
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
    createAgentOptions.value = []
    createAgentListError.value = `读取智能体失败：${toErrorMessage(error)}`
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

  const targetConn = findConnectedConnectionByKey(selectedConnectionKey.value)
  if (!targetConn) {
    resetCreateAgentConfig("连接不可用，将使用远端默认配置")
    return
  }

  const token = ++createAgentProbeToken
  const contextKey = buildAgentConfigContextKey(
    selectedConnectionKey.value,
    selectedAgentType.value,
    selectedProjectPath.value
  )
  const cachedSnapshot = readFreshAgentConfigCache(contextKey)
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
    persistAgentConfigCache(contextKey, snapshot)
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
  if (hasConversationOverviewConnections()) return true
  if (loading.value) return true
  return false
})

onMounted(() => {
  if (!disposeOverviewInvalidation) {
    disposeOverviewInvalidation = subscribeConversationOverviewInvalidation((instanceKey) => {
      markConversationListDirty()
      void refreshConnectionGroupFromLocalCache(instanceKey)
    })
  }
})

onUnload(() => {
  disposeOverviewInvalidation?.()
  disposeOverviewInvalidation = null
  disposeOpenedTabsChangedMap.forEach((dispose) => dispose())
  disposeOpenedTabsChangedMap.clear()
  stopCreateProgressTimer()
})

onPullDownRefresh(() => {
  if (showHistoryPanel.value) {
    uni.stopPullDownRefresh()
    return
  }

  loadOverviewData({ force: true }).finally(() => {
    uni.stopPullDownRefresh()
  })
})

onShow(() => {
  const shouldForceRefresh = consumeConversationListDirty()
  void loadOverviewData(shouldForceRefresh ? { force: true } : undefined)
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
    const savedConnections = getConversationOverviewConnections()
    if (!savedConnections.length) {
      connectionGroups.value = []
      showHistoryPanel.value = false
      projects.value = []
      return
    }
    const connectedMap = (uni.getStorageSync("mcode_connected_map") || {}) as Record<string, boolean>
    const groups = await Promise.all(
      savedConnections.map(async (conn) => {
        if (!isConnectionMarkedConnected(conn, connectedMap)) {
          return buildConnectionErrorGroup(conn, "连接离线")
        }
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
  const savedConnections = readStoredConnections()
  const connectedMap = (uni.getStorageSync("mcode_connected_map") || {}) as Record<string, boolean>
  return savedConnections.filter((conn) => isConnectionMarkedConnected(conn, connectedMap))
}

async function loadConnectionGroup(conn: ConnectionItem): Promise<ConnectionGroup> {
  const gateway = await createConnectionGateway(conn)
  const descriptor = gateway.getRemoteInstanceDescriptor()
  void ensureGlobalConversationSync(descriptor.instanceKey).catch((error) => {
    console.warn("ensure global conversation sync skipped:", error)
  })
  ensureOpenedTabsSubscription(descriptor.instanceKey)
  const foldersRaw = await gateway.call<unknown>("list_open_folder_details")
  const folders = normalizeList(foldersRaw) as Project[]
  const tabsRaw = await gateway.call<unknown>("list_opened_tabs")
  const tabsSnapshot = normalizeOpenedTabsResponse(descriptor.instanceKey, tabsRaw)
  const tabs = tabsSnapshot.items
  rememberConnectionRemoteState(connectionKey(conn), descriptor.instanceKey, folders, tabs)
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

  void scheduleOverviewConversationRefresh({
    conn,
    gateway,
    instanceKey: descriptor.instanceKey,
    folders,
    tabs,
  })
  return buildConnectionGroupSnapshot({
    conn,
    folders,
    tabs,
    conversations: [],
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
  gateway: CodegGateway,
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
  void ensureGlobalConversationSync(descriptor.instanceKey).catch((error) => {
    console.warn("ensure global conversation sync skipped:", error)
  })
  ensureOpenedTabsSubscription(descriptor.instanceKey)
  const foldersRaw = await gateway.call<unknown>("list_open_folder_details")
  const folders = normalizeList(foldersRaw) as Project[]
  const tabsRaw = await gateway.call<unknown>("list_opened_tabs")
  const tabsSnapshot = normalizeOpenedTabsResponse(descriptor.instanceKey, tabsRaw)
  const tabs = tabsSnapshot.items
  rememberConnectionRemoteState(connectionKey(conn), descriptor.instanceKey, folders, tabs)
  const nextGroup = await loadRemoteConnectionSnapshot(conn, folders, tabs)
  replaceConnectionGroup(nextGroup)
}

async function refreshConnectionGroupFromLocalCache(instanceKey: string) {
  const descriptor = getRegisteredRemoteInstanceDescriptor(instanceKey)
  if (!descriptor) {
    await loadOverviewData({ force: true })
    return
  }

  const mappedConnKey = instanceConnectionKeyMap.get(instanceKey) || ""
  const legacyConnKey = buildLegacyRouteKey(descriptor.mode, descriptor.baseUrl)
  const conn = findConnectedConnectionByKey(mappedConnKey || legacyConnKey)
  if (!conn) return

  const connKey = connectionKey(conn)
  const folders = connectionFolderSnapshotMap.get(connKey)
  const tabs = connectionTabSnapshotMap.get(connKey)
  if (!folders || !tabs) {
    await loadOverviewData({ force: true })
    return
  }

  const localConversations = (await loadLocalConversationSummaries(instanceKey, folders)) || []
  replaceConnectionGroup(
    buildConnectionGroupSnapshot({
      conn,
      folders,
      tabs,
      conversations: localConversations,
    })
  )
}

async function scheduleOverviewConversationRefresh(input: {
  conn: ConnectionItem
  gateway: CodegGateway
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
    await upsertConversationSummaries(
      conversations.map((conversation) =>
        mapConversationToSummaryRecord(instanceKey, conversation)
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

function rememberConnectionRemoteState(
  key: string,
  instanceKey: string,
  folders: Project[],
  tabs: OpenedTabItem[]
) {
  if (instanceKey) {
    instanceConnectionKeyMap.set(instanceKey, key)
  }
  connectionFolderSnapshotMap.set(key, folders)
  connectionTabSnapshotMap.set(key, tabs)
}

function ensureOpenedTabsSubscription(instanceKey: string) {
  if (!instanceKey || disposeOpenedTabsChangedMap.has(instanceKey)) return
  const unsubscribe = acpApi.subscribeOpenedTabsChanged((payload) => {
    const snapshot = normalizeOpenedTabsChangedPayload(instanceKey, payload)
    if (!snapshot) return
    applyOpenedTabsSnapshot(instanceKey, snapshot)
    void refreshConnectionGroupFromLocalCache(instanceKey)
  }, instanceKey)
  disposeOpenedTabsChangedMap.set(instanceKey, unsubscribe)
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
  gateway: CodegGateway
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

function normalizeOpenedTabsResponse(instanceKey: string, raw: unknown) {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null
  if (record && Array.isArray(record.items)) {
    const version = Number(record.version || 0)
    const items = normalizeOpenedTabsList(record.items)
    replaceOpenedTabsSnapshot(instanceKey, version, items, "server")
    return {
      version,
      items,
    }
  }
  const items = normalizeOpenedTabsList(raw)
  replaceOpenedTabsSnapshot(instanceKey, 0, items, "server")
  return {
    version: 0,
    items,
  }
}

function normalizeOpenedTabsChangedPayload(instanceKey: string, payload: unknown) {
  if (!payload || typeof payload !== "object") return null
  const record = payload as Record<string, unknown>
  return {
    version: Number(record.version || 0),
    origin: firstString(record.origin) || "remote",
    tabs: normalizeOpenedTabsList(record.tabs),
  }
}

function connectionKey(conn: ConnectionItem): string {
  return buildConnectionKey(conn)
}

function findConnectedConnectionByKey(key: string): ConnectionItem | undefined {
  return getConnectedConnections().find((item) => connectionKeyMatches(item, key))
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

async function createConnectionGateway(conn: ConnectionItem): Promise<CodegGateway> {
  const resolved = await resolveConnectionContext(conn)
  Object.assign(conn, resolved.connection)
  return resolved.gateway
}

function applySelectedConnection(connectionKeyValue: string) {
  if (!connectionKeyValue) {
    selectedConnectionKey.value = ""
    selectedConnectionName.value = ""
    selectedProjectId.value = 0
    selectedProjectName.value = ""
    createAgentOptions.value = []
    createAgentListError.value = ""
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
    createAgentListError.value = ""
  } else {
    createAgentOptions.value = []
    createAgentListError.value = ""
  }
  const persistedAgentType = readPersistedSelectedAgentType(group.key)
  selectedAgentType.value = persistedAgentType || "claude_code"
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


function handleHistoryCollapseOpen(name: string | number) {
  activeHistoryProjectId.value = name
}

function handleHistoryCollapseClose(name: string | number) {
  if (activeHistoryProjectId.value === name) {
    activeHistoryProjectId.value = ""
  }
}
function getHistoryConversationMeta(conversation: Conversation): string {
  return formatHistoryConversationMeta(conversation, formatAgentType, formatTime)
}
function goToConnections() {
  uni.switchTab({ url: "/pages/connections/index" })
}

function openHistoryPanel(group: ConnectionGroup) {
  historyGroupKey.value = group.key
  historyGroupTitle.value = group.name
  projects.value = group.projects
  showHistoryPanel.value = true
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
      const conn = findConnectedConnectionByKey(key)
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
  const conn = findConnectedConnectionByKey(connKey)
  if (conn) {
    syncAuthToConnection(conn)
  }
}

function openConversation(conv: Conversation, connKey?: string) {
  const conn = connKey ? findConnectedConnectionByKey(connKey) : undefined
  if (conn) {
    syncAuthToConnection(conn)
  } else {
    syncAuthToConnectionKey(connKey)
  }
  const encodedConnKey = conn ? encodeConnectionContext(conn) : connKey ? encodeURIComponent(connKey) : ""
  uni.navigateTo({
    url: `/pages/conversation-detail/index?id=${conv.id}&folderId=${conv.folder_id || 0}${encodedConnKey ? `&connectionKey=${encodedConnKey}` : ""}`,
  })
}

function createConversation(projectId?: number) {
  clearPendingCreateRequest()
  const defaultConnectionKey = showHistoryPanel.value
    ? historyGroupKey.value
    : selectedConnectionKey.value || connectionGroups.value[0]?.key || ""
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
    : []
  createAgentListError.value = ""
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
  gateway: CodegGateway,
  connectionId: string,
  configOptions: SessionConfigOptionInfo[],
  selectedValues: Record<string, string>
) {
  for (const option of configOptions) {
    const selectedValueId = selectedValues[option.id]
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

async function shouldSkipCreatePromptReplay(
  gateway: CodegGateway,
  conversationId: number
) {
  if (!activeCreateRequestId) return false
  if (activeCreateConversationId !== conversationId) return false
  if (!activeCreatePromptAttempted) return false

  try {
    const detail = await gateway.call<any>("get_folder_conversation", {
      conversationId,
    })
    if (Array.isArray(detail?.turns) && detail.turns.length > 0) {
      return true
    }
  } catch (error) {
    console.warn("create prompt replay detail probe skipped:", error)
  }

  try {
    const existingConnection = await acpApi.acpFindConnectionForConversation(conversationId)
    if (existingConnection?.connection_id) {
      return true
    }
  } catch (error) {
    console.warn("create prompt replay connection probe skipped:", error)
  }

  return false
}

async function confirmCreate() {
  if (creating.value) return

  creating.value = true
  if (!selectedConnectionKey.value) {
    uni.showToast({ title: "请选择连接", icon: "none" })
    creating.value = false
    return
  }

  if (!selectedProjectId.value) {
    uni.showToast({ title: "请选择项目", icon: "none" })
    creating.value = false
    return
  }

  const agentType = selectedAgentType.value
  if (loadingCreateAgents.value) {
    uni.showToast({ title: "正在读取智能体，请稍后", icon: "none" })
    creating.value = false
    return
  }

  if (createAgentListError.value) {
    uni.showToast({ title: createAgentListError.value, icon: "none", duration: 3000 })
    creating.value = false
    return
  }

  if (!agentType || !createAgentOptions.value.some((item) => item.value === agentType)) {
    uni.showToast({ title: "请选择可用智能体", icon: "none" })
    creating.value = false
    return
  }

  try {
    const preferredModeId = createAgentConfig.value.selectedModeId || undefined
    const preferredConfigValues = { ...createAgentConfig.value.selectedValues }
    const configOptions = [...createAgentConfig.value.configOptions]
    persistSelectedAgentType(selectedConnectionKey.value, agentType)
    persistCurrentCreateAgentConfigSelection()
    showCreateDialog.value = false
    showCreateConfigDialog.value = false
    const targetConn = findConnectedConnectionByKey(selectedConnectionKey.value)
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
      agentType,
      workingDir: selectedProject.path || undefined,
      preferredModeId,
      preferredConfigValues,
    })
    const connectionId = typeof connectionInfo === "string"
      ? connectionInfo
      : String(connectionInfo?.id || "").trim()
    if (!connectionId) {
      throw new Error("智能体连接失败：返回数据异常")
    }

    await applyCreateAgentConfig(gateway, connectionId, configOptions, preferredConfigValues)

    resolveCreateRequestId()
    const createResult = await gateway.call<any>("create_conversation", {
      folderId: selectedProjectId.value,
      agentType,
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
      agentType,
      hasTaskContent: Boolean(taskContent),
    })

    if (taskContent) {
      const skipPromptReplay = await shouldSkipCreatePromptReplay(
        gateway,
        newConversationId
      )
      if (!skipPromptReplay) {
        activeCreateConversationId = newConversationId
        activeCreatePromptAttempted = true
        await gateway.call("acp_prompt", {
          connectionId,
          blocks: [{ type: "text", text: taskContent }],
          folderId: selectedProjectId.value,
          conversationId: newConversationId,
        })
      }
    }

    runtime.bindCreatedConversationRuntime({
      conversationId: newConversationId,
      folderId: selectedProjectId.value,
      agentType,
      connectionId,
      instanceKey: gateway.getRemoteInstanceDescriptor().instanceKey,
      sessionId: resolveConnectedSessionId(connectionInfo),
    })

    await ensureConversationTab({
      instanceKey: gateway.getRemoteInstanceDescriptor().instanceKey,
      gateway,
      folderId: selectedProjectId.value,
      conversationId: newConversationId,
      agentType,
      activation: "preserve",
      origin: "mcode-mobile-create",
    }).catch((error) => {
      console.warn("ensure conversation tab after create skipped:", error)
    })

    await gateway.call("open_folder_by_id", {
      folderId: selectedProjectId.value,
    }).catch((error) => {
      console.warn("open folder by id skipped:", error)
    })

    uni.showToast({ title: "创建成功", icon: "success" })
    showCreateDialog.value = false
    clearPendingCreateRequest()
    newConversationTitle.value = ""
    newTaskContent.value = ""
    resetCreateAgentConfig("")
    selectedAgentType.value = "claude_code"
    createAgentOptions.value = []
    createAgentListError.value = ""
    markConversationListDirty()
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
}

.conversations-page {
  position: relative;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--up-primary, #2f7cf6) 7%, var(--up-page-bg-color, #f0f2f5) 93%) 0%,
      var(--up-page-bg-color, #f0f2f5) 48%,
      var(--up-page-bg-color, #f0f2f5) 100%
    );
}

/* ===== 液态玻璃背景 ===== */
.liquid-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}

.liquid-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(80rpx);
  opacity: 0.5;
}

.liquid-blob--one {
  width: 460rpx;
  height: 460rpx;
  top: -80rpx;
  right: -90rpx;
  background: color-mix(in srgb, var(--up-primary, #2f7cf6) 32%, transparent);
  animation: liquidFloat 20s ease-in-out infinite alternate;
}

.liquid-blob--two {
  width: 540rpx;
  height: 540rpx;
  bottom: 120rpx;
  left: -160rpx;
  background: rgba(167, 139, 250, 0.22);
  animation: liquidFloat 15s ease-in-out infinite alternate-reverse;
}

.liquid-blob--three {
  width: 380rpx;
  height: 380rpx;
  top: 42%;
  right: 40rpx;
  background: rgba(96, 165, 250, 0.2);
  animation: liquidFloat 25s ease-in-out infinite alternate;
}

@keyframes liquidFloat {
  from {
    transform: translate(0, 0) scale(1);
  }
  to {
    transform: translate(60rpx, 80rpx) scale(1.2);
  }
}

.conversations-shell {
  position: relative;
  z-index: 1;
  min-height: 100vh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 0 32rpx 40rpx;
}

.conversations-sticky {
  position: relative;
  z-index: 20;
}

.conversations-sticky :deep(.u-sticky__content) {
  padding-top: 40rpx;
  background: transparent;
}

.conversations-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18rpx;
}

.conversations-header__title {
  font-size: 68rpx;
  font-weight: 800;
  line-height: 1.08;
  letter-spacing: -0.04em;
  color: var(--up-main-color, #191c1e);
}

.conversations-header__action {
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.5);
  background: color-mix(in srgb, var(--up-card-bg-color, #ffffff) 50%, transparent);
  backdrop-filter: blur(25rpx);
  -webkit-backdrop-filter: blur(25rpx);
  box-shadow: 0 6rpx 18rpx rgba(47, 124, 246, 0.08);
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.conversations-header__action:active {
  transform: scale(0.9);
}

.conversations-searchbar {
  margin-bottom: 28rpx;
}

.conversations-searchbar :deep(.u-search__content) {
  border: 1rpx solid rgba(255, 255, 255, 0.5) !important;
  border-radius: 28rpx !important;
  background-color: color-mix(in srgb, var(--up-card-bg-color, #ffffff) 40%, transparent) !important;
  backdrop-filter: blur(25rpx);
  -webkit-backdrop-filter: blur(25rpx);
  box-shadow: 0 4rpx 16rpx rgba(31, 38, 135, 0.05) !important;
}

.conversations-searchbar :deep(.u-search__content__input) {
  font-size: 26rpx;
  color: var(--up-main-color, #303133);
}

.conversations-searchbar :deep(.u-search__content__icon) {
  margin-right: 8rpx;
}

.main-wrap {
  width: 100%;
  flex: 1;
  min-height: 0;
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
.group-panel {
  display: block;
  min-height: 0;
}

.group-list {
  padding: 0 0 calc(36rpx + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 28rpx;
}

.group-section__header {
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-bottom: 12rpx;
  padding: 0 8rpx;
}

.group-section__title {
  display: block;
  font-size: 24rpx;
  font-weight: 600;
  color: color-mix(in srgb, var(--up-tips-color, #909193) 60%, transparent);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  flex: 0 1 auto;
}

.group-section__error {
  width: 32rpx;
  height: 32rpx;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx;
  background: color-mix(in srgb, var(--up-error, #fa3534) 10%, var(--up-card-bg-color, #ffffff) 90%);
}

.group-section__cards {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.group-empty {
  padding: 8rpx 10rpx 6rpx;
}

.group-empty__text {
  font-size: 22rpx;
  color: var(--up-tips-color, #909193);
}

.live-card {
  display: flex;
  align-items: flex-start;
  gap: 18rpx;
  padding: 24rpx 22rpx;
  border-radius: 32rpx;
  background: color-mix(in srgb, var(--up-card-bg-color, #ffffff) 45%, transparent) !important;
  backdrop-filter: blur(30rpx);
  -webkit-backdrop-filter: blur(30rpx);
  border: 1rpx solid rgba(255, 255, 255, 0.6);
  box-shadow: 0 8rpx 32rpx rgba(31, 38, 135, 0.07) !important;
  overflow: hidden;
  transition: transform 0.15s ease;
}

.live-card:active {
  transform: scale(0.98);
}

.agent-logo {
  width: 96rpx;
  height: 96rpx;
  border-radius: 28rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--up-primary, #2f7cf6) 10%, transparent);
  border: 1rpx solid color-mix(in srgb, var(--up-primary, #2f7cf6) 8%, transparent);
}

.agent-logo__text {
  font-size: 18rpx;
  font-weight: 700;
  color: var(--up-primary, #2979ff);
}

.agent-logo__img {
  width: 56rpx;
  height: 56rpx;
  display: block;
}

.agent-logo--real {
  background: var(--up-card-bg-color, #ffffff) !important;
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.agent-logo--claude_code,
.agent-logo--codex,
.agent-logo--open_code,
.agent-logo--gemini,
.agent-logo--open_claw,
.agent-logo--cline {
  background: var(--up-card-bg-color, #ffffff);
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.agent-logo--history {
  background: color-mix(in srgb, var(--up-primary, #2979ff) 12%, var(--up-card-bg-color, #ffffff) 88%);
}

.live-card__body {
  flex: 1;
  min-width: 0;
}

.live-card__project-title {
  display: block;
  font-size: 34rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
  line-height: 1.25;
}

.live-card__session-name {
  display: block;
  margin-top: 8rpx;
  font-size: 28rpx;
  color: color-mix(in srgb, var(--up-content-color, #606266) 80%, transparent);
  line-height: 1.3;
}

.live-card__side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: flex-start;
  gap: 10rpx;
  flex-shrink: 0;
  padding-left: 8rpx;
}

.live-card__side--history {
  gap: 12rpx;
}

.live-card__stamp {
  font-size: 20rpx;
  color: var(--up-tips-color, #909193);
  line-height: 1.2;
}

.status-chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34rpx;
  padding: 6rpx 14rpx;
  border-radius: 999rpx;
  background-color: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  overflow: visible;
}

.status-chip__text {
  position: relative;
  z-index: 1;
  display: block;
  font-size: 18rpx;
  line-height: 1;
  font-weight: 600;
  text-align: center;
  color: var(--up-tips-color, #909193);
}

.status-chip--running {
  background-color: rgba(52, 199, 89, 0.16);
}

.status-chip--running::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: rgba(52, 199, 89, 0.18);
  animation: runningPulse 1.5s ease-out infinite;
}

.status-chip--running .status-chip__text {
  color: #21a453;
}

.status-chip--completed {
  background-color: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.status-chip--completed .status-chip__text {
  color: var(--up-content-color, #606266);
}

.status-chip--stopped {
  background-color: rgba(255, 95, 86, 0.14);
}

.status-chip--stopped .status-chip__text {
  color: #ff5f56;
}

.status-chip--error {
  background-color: rgba(255, 95, 86, 0.14);
}

.status-chip--error .status-chip__text {
  color: #ff5f56;
}

.status-chip--history {
  background-color: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.status-chip--history .status-chip__text {
  color: var(--up-content-color, #606266);
}

@keyframes runningPulse {
  0% {
    transform: scale(1);
    opacity: 0.75;
  }
  70% {
    transform: scale(1.42);
    opacity: 0;
  }
  100% {
    transform: scale(1.42);
    opacity: 0;
  }
}

.live-card--history {
  background: var(--up-card-bg-color, #ffffff) !important;
}

.inline-loading {
  min-height: 220rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
}

.inline-loading__text {
  font-size: 24rpx;
  color: var(--up-tips-color, #909193);
}

.history-list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.history-scroll {
  flex: 1;
  min-height: 0;
  height: calc(100vh - 390rpx - env(safe-area-inset-bottom));
  max-height: calc(100vh - 390rpx - env(safe-area-inset-bottom));
}

.history-collapse {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
  padding-top: 20rpx;
}

.history-collapse-item {
  overflow: hidden;
  border-radius: 22rpx;
  background: var(--up-card-bg-color, #ffffff);
  border: 1rpx solid var(--up-border-color, #dadbde);
  box-shadow: 0 10rpx 26rpx rgba(15, 23, 42, 0.08);
}

.history-collapse-item :deep(.u-cell) {
  background: transparent !important;
  box-shadow: none;
}

.history-collapse-item :deep(.u-cell__body) {
  align-items: center;
}

.history-collapse-item :deep(.u-collapse-item__content__text) {
  margin: 0;
  padding: 24rpx 16rpx 16rpx !important;
  background: transparent;
}

.history-mode-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  padding: 14rpx 16rpx;
  border-radius: 22rpx;
  background: var(--up-card-bg-color, #ffffff) !important;
  border: 1rpx solid var(--up-border-color, #dadbde);
  box-shadow: 0 10rpx 26rpx rgba(15, 23, 42, 0.08) !important;
  flex-shrink: 0;
}

.history-mode-back {
  display: flex;
  align-items: center;
  gap: 6rpx;
  flex-shrink: 0;
}

.history-mode-back__text {
  font-size: 24rpx;
  color: var(--up-primary, #2979ff);
}

.history-mode-title {
  flex: 1;
  min-width: 0;
  text-align: center;
  font-size: 24rpx;
  font-weight: 600;
  color: var(--up-main-color, #303133);
}

.history-mode-create {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4rpx;
  min-width: 92rpx;
  min-height: 44rpx;
  padding: 0 14rpx;
  border-radius: 999rpx;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 12%, var(--up-card-bg-color, #ffffff) 88%);
  flex-shrink: 0;
}

.history-mode-create__text {
  display: block;
  font-size: 22rpx;
  line-height: 1;
  font-weight: 600;
  color: var(--up-primary, #2979ff);
}

.history-section__header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.history-section__text {
  flex: 1;
  min-width: 0;
}

.history-section__title {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.history-section__count {
  min-width: 34rpx;
  height: 30rpx;
  padding: 0 10rpx;
  border-radius: 999rpx;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 12%, var(--up-card-bg-color, #ffffff) 88%);
  font-size: 18rpx;
  line-height: 30rpx;
  text-align: center;
  color: var(--up-primary, #2979ff);
}

.history-section__path {
  display: block;
  margin-top: 6rpx;
  font-size: 20rpx;
  color: var(--up-tips-color, #909193);
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

.conversations-empty-fullpage {
  min-height: 52vh;
}

/* ===== 会话列表 ===== */
.conv-list {
  padding: 8rpx 12rpx;
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.conv-list--history {
  gap: 12rpx;
  padding: 0;
}

.conv-card {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 14rpx 12rpx;
  background-color: var(--up-card-bg-color, #ffffff);
  border: 1rpx solid var(--up-border-color, #dadbde);
  border-radius: 18rpx;
  box-shadow: none;
  transition: transform 0.15s;

  &:active { transform: scale(0.985); }
}

.conv-card--history {
  gap: 18rpx;
  padding: 18rpx 16rpx;
  border-radius: 22rpx;
  background: var(--up-card-bg-color, #ffffff) !important;
  box-shadow: none !important;
}

.conv-card__icon {
  width: 52rpx;
  height: 52rpx;
  background-color: color-mix(in srgb, var(--up-primary, #2979ff) 10%, var(--up-card-bg-color, #ffffff) 90%);
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
  color: var(--up-main-color, #303133);
  line-height: 1.3;
}

.conv-card__subtitle {
  display: block;
  margin-top: 4rpx;
  font-size: 22rpx;
  color: var(--up-content-color, #606266);
  line-height: 1.3;
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


/* ===== 创建弹层 ===== */
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
  color: var(--up-tips-color, #909193);
  line-height: 1.4;
}

.form-helper-text {
  display: block;
  margin-top: 12rpx;
  padding: 0 8rpx;
  font-size: 22rpx;
  line-height: 1.4;
  color: var(--up-tips-color, #909193);
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
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  border: 2rpx solid transparent;
  transition: all 0.18s ease;
}

.agent-card--active {
  background: color-mix(in srgb, var(--up-primary, #2979ff) 10%, var(--up-card-bg-color, #ffffff) 90%);
  border-color: var(--up-primary, #2979ff);
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
  background: var(--up-card-bg-color, #ffffff);
}

.agent-card__logo-img {
  width: 48rpx;
  height: 48rpx;
}

.agent-card__logo-text {
  font-size: 24rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.agent-card__label {
  font-size: 22rpx;
  line-height: 1.3;
  text-align: center;
  color: var(--up-main-color, #303133);
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
  color: var(--up-content-color, #606266);
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
  color: var(--up-content-color, #606266);
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
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  border: 2rpx solid transparent;
}

.config-chip--active {
  background: color-mix(in srgb, var(--up-primary, #2979ff) 10%, var(--up-card-bg-color, #ffffff) 90%);
  border-color: var(--up-primary, #2979ff);
}

.config-chip__title {
  font-size: 24rpx;
  color: var(--up-main-color, #303133);
}

.create-progress-dialog {
  width: 560rpx;
  max-width: 82vw;
  padding: 44rpx 36rpx 36rpx;
  border-radius: 28rpx;
  background: var(--up-card-bg-color, #ffffff);
  border: 1rpx solid var(--up-border-color, #dadbde);
  box-shadow: 0 24rpx 80rpx rgba(15, 23, 42, 0.18);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.create-progress-dialog__visual {
  position: relative;
  width: 136rpx;
  height: 136rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 28rpx;
}

.create-progress-dialog__ring {
  position: absolute;
  inset: 12rpx;
  border-radius: 50%;
  border: 3rpx solid var(--up-primary, #2979ff);
  opacity: 0.26;
  animation: createProgressPulse 1.8s ease-out infinite;
}

.create-progress-dialog__ring--delay {
  animation-delay: 0.55s;
}

.create-progress-dialog__core {
  width: 84rpx;
  height: 84rpx;
  border-radius: 50%;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 10%, var(--up-card-bg-color, #ffffff) 90%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 0 0 1rpx color-mix(in srgb, var(--up-primary, #2979ff) 24%, transparent 76%);
}

.create-progress-dialog__title {
  font-size: 32rpx;
  line-height: 1.35;
  font-weight: 700;
  color: var(--up-main-color, #303133);
  text-align: center;
}

.create-progress-dialog__desc {
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: var(--up-content-color, #606266);
  text-align: center;
}

.create-progress-dialog__stage {
  margin-top: 28rpx;
  min-height: 56rpx;
  padding: 0 22rpx;
  border-radius: 999rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
}

.create-progress-dialog__stage-dot {
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
  background: var(--up-primary, #2979ff);
  animation: createProgressDot 1.2s ease-in-out infinite;
}

.create-progress-dialog__stage-text {
  font-size: 22rpx;
  line-height: 1.3;
  color: var(--up-content-color, #606266);
}

@keyframes createProgressPulse {
  0% {
    transform: scale(0.72);
    opacity: 0.28;
  }
  80% {
    transform: scale(1.25);
    opacity: 0;
  }
  100% {
    transform: scale(1.25);
    opacity: 0;
  }
}

@keyframes createProgressDot {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(0.86);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}

.safe-bottom {
  height: calc(32rpx + env(safe-area-inset-bottom));
}

</style>
