<template>
  <view
    class="page"
    :class="pageThemeClasses"
    :style="[upThemeVars, upThemePageStyle, detailThemePageStyle]"
  >
    <view v-if="!conversationId" class="empty-container">
      <up-empty mode="data" text="会话不存在"></up-empty>
    </view>

    <view v-else class="detail-container">
      <view class="detail-atmosphere" aria-hidden="true">
        <image
          v-if="showDetailBackgroundImage"
          class="detail-atmosphere__background-image"
          :src="detailBackgroundImageUrl"
          mode="aspectFill"
          @error="handleDetailBackgroundLoadError"
        />
        <view v-if="showDetailBackgroundImage" class="detail-atmosphere__background-scrim"></view>
        <ConversationDetailCyberRain :enabled="detailTheme === 'matrix'" :phase="cyberEffectPhase" />
        <ConversationDetailSweetBubbles :enabled="detailTheme === 'sweet'" :phase="cyberEffectPhase" />
        <ConversationDetailSummerAtmosphere :enabled="detailTheme === 'summer'" :phase="cyberEffectPhase" />
        <view class="detail-atmosphere__blob detail-atmosphere__blob--primary"></view>
        <view class="detail-atmosphere__blob detail-atmosphere__blob--secondary"></view>
        <view class="detail-atmosphere__blob detail-atmosphere__blob--accent"></view>
      </view>

      <view
        class="detail-statusbar-fill"
        :class="detailTheme !== 'default' && `detail-statusbar-fill--${detailTheme}`"
        :style="detailStatusBarFillStyle"
        aria-hidden="true"
      ></view>

      <up-navbar
        :customClass="detailNavbarCustomClass"
        :style="detailNavbarShellStyle"
        :autoBack="false"
        :fixed="true"
        :placeholder="true"
        :border="false"
        left-icon="arrow-left"
        height="45px"
        :bgColor="navbarBgColor"
        :statusBarBgColor="navbarStatusBarBgColor"
        :leftIconColor="navbarIconColor"
        @leftClick="handleBackNavigation"
      >
        <template #center>
          <view class="detail-navbar">
            <view class="detail-navbar__title-row">
              <image
                v-if="agentLogoPath"
                class="detail-navbar__logo"
                :src="agentLogoPath"
                mode="aspectFit"
              />
              <view v-else class="detail-navbar__logo detail-navbar__logo--fallback">
                <text class="detail-navbar__logo-fallback">{{ conversationTitle.slice(0, 1) }}</text>
              </view>
              <view class="detail-navbar__title-copy">
                <text class="detail-navbar__title u-line-1">{{ conversationTitle }}</text>
                <text class="detail-navbar__subtitle u-line-1">{{ detailProjectPath || currentAgentLabel }}</text>
              </view>
            </view>
          </view>
        </template>
        <template #right>
          <view class="detail-navbar__menu" @click="openDetailMoreMenu">
            <up-icon
              name="more-dot-fill"
              size="18"
              :color="navbarIconColor"
            ></up-icon>
          </view>
        </template>
      </up-navbar>

      <view
        v-if="showDetailMoreMenu"
        class="detail-dropdown-mask"
        :style="detailDropdownMaskStyle"
        @click="closeDetailMoreMenu"
      >
        <view class="detail-dropdown-menu" :style="upThemeCardStyle" @click.stop>
          <view
            v-for="action in detailMoreActions"
            :key="action.name"
            class="detail-dropdown-menu__item"
            @click="handleDetailMoreMenuClick(action.name)"
          >
            <text class="detail-dropdown-menu__label" :style="{ color: action.color }">{{ action.name }}</text>
          </view>
        </view>
      </view>

      <view
        v-if="shouldShowDetailTabsBar"
        :class="[
          'detail-tabs-bar',
          hasDetailBackgroundImage && 'detail-tabs-bar--translucent',
        ]"
        :style="[detailTabsBarThemeStyle, detailTabsBarStyle]"
      >
        <up-tabs
          :current="activeDetailTabIndex"
          :list="detailShellTabs"
          keyName="title"
          :scrollable="true"
          shapeMode="capsule"
          :lineWidth="0"
          :duration="180"
          :activeStyle="detailTabsActiveStyle"
          :inactiveStyle="detailTabsInactiveStyle"
          :itemStyle="detailTabsItemStyle"
          @change="handleDetailTabChange"
        >
          <template #content="{ item, index }">
            <view
              :class="[
                'detail-tab-pill',
                hasDetailBackgroundImage && 'detail-tab-pill--translucent',
                index === activeDetailTabIndex && 'detail-tab-pill--active',
              ]"
            >
              <view class="detail-tab-pill__dot"></view>
              <view class="detail-tab-pill__title">{{ normalizeDetailTabTitleText(item.title) }}</view>
              <view
                v-if="detailShellTabs.length > 1"
                class="detail-tab-pill__close"
                @tap.stop="handleCloseDetailTab(index)"
              >
                <up-icon
                  name="close"
                  size="12"
                  :color="index === activeDetailTabIndex ? '#ffffff' : upThemeVar('--up-tips-color', '#909193')"
                ></up-icon>
              </view>
            </view>
          </template>
        </up-tabs>
      </view>

      <view
        v-if="showDetailShellFallback"
        class="detail-shell__placeholder"
        :style="detailShellViewportStyle"
      >
        <view class="detail-shell__placeholder-card">
          <template v-if="detailContentInitialLoading">
            <up-loading-icon
              mode="circle"
              size="28"
              :color="upThemeVar('--up-primary', '#2979ff')"
            ></up-loading-icon>
            <text class="detail-shell__placeholder-title">正在加载会话内容...</text>
            <text class="detail-shell__placeholder-desc">请稍候，数据准备完成后会自动显示。</text>
          </template>
          <template v-else-if="detailLoadErrorMessage">
            <up-icon
              name="close-circle-fill"
              size="32"
              :color="upThemeVar('--up-error', '#fa3534')"
            ></up-icon>
            <text class="detail-shell__placeholder-title">加载会话失败</text>
            <text class="detail-shell__placeholder-desc">{{ detailLoadErrorMessage }}</text>
            <view class="detail-shell__placeholder-action" @click="reloadDetailContent">重新加载</view>
          </template>
          <template v-else>
            <up-icon
              name="info-circle"
              size="32"
              :color="upThemeVar('--up-tips-color', '#909193')"
            ></up-icon>
            <text class="detail-shell__placeholder-title">暂时无法显示会话内容</text>
            <text class="detail-shell__placeholder-desc">会话页面尚未准备好，请重新加载。</text>
            <view class="detail-shell__placeholder-action" @click="reloadDetailContent">重新加载</view>
          </template>
        </view>
      </view>

      <swiper
        v-else
        class="detail-shell__swiper"
        :style="detailShellViewportStyle"
        :current="detailSwiperCurrent"
        :duration="220"
        @change="handleDetailSwiperChange"
      >
        <swiper-item
          v-for="(tab, index) in detailShellTabs"
          :key="resolveDetailShellTabKey(tab)"
          class="detail-shell__swiper-item"
        >
          <view
            v-if="shouldMountDetailTabPage(index)"
            :class="['detail-shell__page', isActiveDetailTabPage(index) && 'detail-shell__page--active']"
          >


            <ConversationDetailInteractivePane
              v-if="shouldRenderDetailTabPage(index)"
              :conversation-id="tab.conversationId"
              :folder-id="tab.folderId"
              :agent-type="tab.agentType"
              :instance-key="detailConnectionKey"
              :active="isActiveDetailTabPage(index)"
              :message-list-page-style="messageListPageStyle"
              :message-list-content-style="messageListContentStyle"
              :input-wrap-style="detailTheme === 'default' ? upThemeCardStyle : undefined"
              :translucent-message-list="hasDetailBackgroundImage"
              :slash-commands="slashCommands"
              :upload-target="detailUploadTarget"
              :detail-theme="detailTheme"
              :cyber-effect-phase="cyberEffectPhase"
              :initial-loading="isActiveDetailTabPage(index) && detailContentInitialLoading"
              :load-error-message="isActiveDetailTabPage(index) ? detailLoadErrorMessage : ''"
              :on-before-send-prompt="ensurePcTabReadyForPrompt"
              @layout-change="measureMessageListHeight"
              @reload="reloadDetailContent"
            />
          </view>
        </swiper-item>
      </swiper>

      <view
        v-if="showConnectingOperationBlocker"
        class="connecting-operation-blocker"
        :style="connectingOperationBlockerStyle"
        @click.stop
        @touchmove.stop.prevent
      >
        <view class="connecting-operation-blocker__panel" :style="upThemeCardStyle">
          <up-loading-icon
            mode="circle"
            size="30"
            :color="upThemeVar('--up-primary', '#2979ff')"
          ></up-loading-icon>
          <text class="connecting-operation-blocker__title">正在连接智能体...</text>
          <text class="connecting-operation-blocker__desc">
            连接建立后会自动继续，请先不要进行其他操作。
          </text>
        </view>
      </view>

    </view>

    <up-popup v-model:show="showPlanDrawer" mode="bottom" :round="20">
          <view
            :class="['plan-drawer', detailTheme && `plan-drawer--theme-${detailTheme}`]"
            :style="upThemeCardStyle"
          >
        <view class="plan-drawer__hd">
          <text class="plan-drawer__title">计划任务</text>
          <text class="plan-drawer__count">{{ completedTaskCount }}/{{ planTasks.length }}</text>
        </view>

        <view class="plan-filters">
          <view
            v-for="item in planFilterItems"
            :key="item.key"
            :class="['plan-filter', planStatusFilter === item.key && 'plan-filter--active']"
            @click="planStatusFilter = item.key"
          >
            <text>{{ item.label }}</text>
            <text class="plan-filter__count">{{ item.count }}</text>
          </view>
        </view>

        <scroll-view scroll-y class="plan-drawer__list">
          <view v-if="filteredPlanTasks.length === 0" class="plan-empty">
            <up-empty
              mode="list"
              :text="planTasks.length === 0 ? '暂无任务' : '该状态下暂无任务'"
            ></up-empty>
          </view>

          <view
            v-for="task in filteredPlanTasks"
            :key="task.id"
            class="plan-task"
          >
            <view class="plan-task__left">
              <view
                :class="[
                  'plan-task__dot',
                  `plan-task__dot--${task.status}`,
                ]"
              ></view>
            </view>
            <view class="plan-task__main">
              <text class="plan-task__subject">{{ task.subject }}</text>
              <text v-if="task.description" class="plan-task__desc">{{ task.description }}</text>
            </view>
            <view
              :class="[
                'plan-task__badge',
                `plan-task__badge--${task.status}`,
              ]"
            >
              {{ taskStatusLabel(task.status) }}
            </view>
          </view>

          <view class="plan-drawer__safe"></view>
        </scroll-view>
      </view>
    </up-popup>

  </view>
</template>

<script setup lang="ts">
import { ref, computed, getCurrentInstance, nextTick, watch } from "vue"
import { onBackPress, onHide, onLoad, onShow, onUnload } from "@dcloudio/uni-app"
import { useAuthStore } from "@/stores/auth"
import { useConversationCacheStore } from "@/stores/conversationCache"
import { useConversationRuntimeStore } from "@/stores/conversationRuntime"
import { acpApi } from "@/api/acp"
import { createGateway } from "@/services/gateway"
import { getDirectToken } from "@/services/gateway/directTokenStore"
import { toErrorMessage } from "@/services/gateway/error"
import { syncIosStandaloneStatusBar } from "@/services/iosStandaloneStatusBar"
import { ensureConversationSchema } from "@/services/db/migrations"
import {
  getConversationSummaryById,
  getNewestTurns,
  markConversationSummaryDeleted,
  patchConversationSummaryStatus,
  type PersistedTurnWithParts,
} from "@/services/db/repositories/conversationRepository"
import {
  clearRuntime,
  getRuntime,
  saveRuntimeCheckpoint,
  type ConversationRuntimeRecord,
} from "@/services/db/repositories/runtimeRepository"
import { connectionSessionManager } from "@/services/conversation/connectionSessionManager"
import { markConversationListDirty } from "@/services/conversation/conversationListRefresh"
import {
  primarySessionFailure,
  sessionFailureSuggestsRetry,
} from "@/services/conversation/sessionFailureRecords"
import { persistConversationDetailSnapshot } from "@/services/conversation/conversationDetailPersistence"
import {
  readDetailTabMultitaskMode,
  type DetailTabMultitaskMode,
} from "@/services/conversation/detailTabMultitaskPreference"
import {
  closeConversationTab,
  ensureConversationTab,
  ensureConversationTabForPrompt,
  normalizeOpenedTabsList,
} from "@/services/conversation/pcTabSyncService"
import {
  activateMobileDetailTab,
  closeMobileDetailTab,
  ensureMobileDetailTab,
} from "@/services/conversation/mobileDetailTabs"
import {
  applyOpenedTabsSnapshot,
  getOpenedTabsSnapshot,
  replaceOpenedTabsSnapshot,
} from "@/services/conversation/openedTabsRealtimeCache"
import {
  ensureGlobalConversationSync,
  subscribeConversationOverviewInvalidation,
} from "@/services/conversation/globalConversationSync"
import { touchHotConversation } from "@/services/conversation/hotConversationCoordinator"
import {
  hasInFlightConversationDetail,
  hasRenderableRuntimeState,
  hasVolatileRuntimeState,
} from "@/services/conversation/runtimeViewState"
import {
  getRegisteredRemoteInstanceDescriptor,
  registerRemoteInstanceDescriptor,
} from "@/services/realtime/remoteInstanceRegistry"
import { getRemoteProjectFileTree, type ProjectFileNode } from "@/services/projectFiles"
import { getRemoteGitLog } from "@/services/projectGit"
import { loadRemoteProjectConversations } from "@/services/projectSessions"
import {
  decodeConnectionContext,
  findStoredConnectionById as findStoredConnectionContextById,
} from "@/services/connectionContext"
import { getRelayClientId } from "@/services/gateway/relayClientIdentity"
import { usePetStore } from "@/stores/pet"
import {
  buildAgentConfigContextKey,
  createEmptyDetailAgentConfigState,
  projectDetailConfigOptions,
  type DetailAgentConfigState,
} from "@/services/conversation/composerTools"
import type {
  AgentOptionsSnapshot,
  OpenedTabItem,
  RealtimeBridgeHealth,
  PermissionRequest,
  PendingQuestionState,
  QuestionAnswer,
} from "@/types/acp"
import type { RelaySessionInfo } from "@/services/gateway"
import type { RemoteInstanceDescriptor } from "@/services/realtime/types"
import MessageBubble from "@/components/MessageBubble.vue"
import ConversationDetailCyberRain from "./ConversationDetailCyberRain.vue"
import ConversationDetailSweetBubbles from "./ConversationDetailSweetBubbles.vue"
import ConversationDetailSummerAtmosphere from "./ConversationDetailSummerAtmosphere.vue"
import ConversationDetailInteractivePane from "./ConversationDetailInteractivePane.vue"
import {
  buildDetailFallbackTab,
  buildDetailTabsDiagnosticSnapshot,
  buildDetailShellTabs,
  normalizeDetailTabTitleText,
  resolveMountedDetailConversationIds,
  resolveDetailTabChangeIndex,
  resolveDetailTabCloseTarget,
  resolveDetailShellTabKey,
  resolveDetailActiveTabIndex,
  shouldDeferDetailTabSwitch,
  resolveDetailMountedWindowConversationIds,
  type DetailShellTabItem,
} from "./detailTabsPresentation"
import { isDetailDebugEnabled } from "./detailDebugPreference"
import {
  createDetailTabState,
  type DetailTabState,
} from "./detailTabState"
import {
  buildRenderMessageItems,
  type RenderMessageItem,
} from "./detailMessagePresentation"
import {
  DETAIL_CYBER_MODE_STORAGE_KEY,
  DETAIL_THEME_STORAGE_KEY,
  buildDetailThemeMenuActions,
  deriveCyberEffectPhase,
  normalizeDetailThemeStorage,
  shouldShowDetailBackgroundImage,
  type DetailThemeId,
  type CyberEffectPhase,
} from "./detailCyberMode"
import {
  firstString,
  mapPersistedTurnToMessage,
  normalizeTurns,
  normalizeAgentType,
  normalizeList,
} from "./detailDataNormalization"
import {
  DEFAULT_CONVERSATION_HISTORY_PAGE_SIZE,
  buildTailHistoryRequest,
  canKeepPreviousTailWindow,
  mergeTailIntoTurnsWithSeam,
  requireConversationHistoryWindow,
  resolvePreservedTurnsWindow,
  resolveRefreshedTailWindow,
} from "./detailHistoryPaging"
import { readLocalTurnCacheEnabled } from "@/services/conversation/localTurnCachePreference"
import {
  buildQuestionAnswer as buildPendingQuestionAnswer,
  createQuestionSelectionState,
  isQuestionSelectionAnswered,
  questionInputValue,
  splitPermissionDescription,
  type QuestionSelectionState,
} from "./detailInteractionPresentation"
import {
  buildPlanFilterItems,
  buildPlanTasks,
  taskStatusLabel,
  type PlanTask,
  type PlanTaskFilter,
} from "./detailPlanPresentation"
import {
  buildLiveActivitySignature,
  canEditSharedPromptQueue,
  hasSharedPromptQueue,
  isSharedPromptQueueCancelDisabled,
  isSharedPromptQueueClearDisabled,
  isStoppableRuntimeStatus,
  looksLikeNetworkFailure,
  sharedPromptQueueSummary,
  sharedPromptQueueTitle,
} from "./detailRuntimePresentation"
import {
  bottomGeneratingText as resolveBottomGeneratingText,
  buildDetailStatusState,
  buildNetworkReachabilityFeedbackText,
  buildRuntimeRetryText,
  buildRuntimeStatusClass,
  buildRuntimeStatusLabel,
  waitingStateBadgeText as resolveWaitingStateBadgeText,
  waitingStateDescription as resolveWaitingStateDescription,
  waitingStateFootnote as resolveWaitingStateFootnote,
  waitingStateTitle as resolveWaitingStateTitle,
  type DetailStatusState,
} from "./detailStatusPresentation"
import {
  bottomAnchorId,
  messageAnchorId as buildMessageAnchorId,
  resolveRenderAnchorId as resolveRenderAnchorIdValue,
  resolveScrollRestoreAction,
  resolveViewportSyncAction,
} from "./detailScrollState"
import {
  buildMessageListContentStyle,
  buildMessageListPageStyle,
  buildTopOffsetStyle,
  resolveDetailShellViewportHeight,
  resolveBottomComposerHeight,
} from "./detailLayoutPresentation"
import {
  activeModelStatusLabel as resolveActiveModelStatusLabel,
  detailConfigOptionSummary,
  detailPermissionSummary,
} from "./detailComposerPresentation"
import {
  normalizeSlashCommandsFromSnapshot,
  type SlashCommandItem,
} from "./detailSlashCommands"
import {
  buildUploadTarget,
} from "./detailAttachmentUpload"
import {
  buildDescriptorFromStoredConnection,
  findStoredConnectionById as findStoredConnectionInListById,
  findStoredConnectionByKey as findStoredConnectionInList,
  normalizeStoredConnectionLike,
  resolveStoredConnectionTargetAgent,
  type StoredConnectionItem,
} from "./detailConnectionResolution"
import { buildModelProvidersRoute } from "@/services/remoteSettings"

interface UploadQueueItem {
  id: string
  name: string
  size: number
  type: string
  kind: "image" | "file"
  progress: number
  status: "uploading" | "success" | "error"
  error?: string
}

type ComposerPanelMode = "" | "quick_reply" | "config"
interface QuickReplyItem {
  label: string
  value: string
}

interface DetailBackgroundSnapshot {
  url: string
  updatedAt?: number
  clearedAt?: number
}

const auth = useAuthStore()
const cacheStore = useConversationCacheStore()
const runtime = useConversationRuntimeStore()
const currentInstance = getCurrentInstance()
const upThemeVars = computed(() => currentInstance?.proxy?.upThemeVars || {})
const upThemePageStyle = computed(() => currentInstance?.proxy?.upThemePageStyle || {})
const detailThemePageStyle = computed(() => {
  if (detailTheme.value === "matrix") {
    return {
      background: "#000000",
      backgroundColor: "#000000",
      color: "#baffc8",
    }
  }
  if (detailTheme.value === "sweet") {
    return {
      background: "linear-gradient(180deg, #fff6fb 0%, #ffe8f3 52%, #fce7ff 100%)",
      backgroundColor: "#fff6fb",
      color: "#7a284f",
    }
  }
  if (detailTheme.value === "summer") {
    return {
      background: "linear-gradient(180deg, #8de8ff 0%, #55d3ff 36%, #2fb2df 55%, #ffd67f 55%, #efb95a 100%)",
      backgroundColor: "#87e2ff",
      color: "#0b6580",
    }
  }
  return {}
})
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")
const pageThemeClasses = computed(() => [
  detailTheme.value !== "default" && `page--theme-${detailTheme.value}`,
  detailTheme.value === "matrix" && "page--cyber",
  detailTheme.value === "matrix" && `page--cyber-${cyberEffectPhase.value}`,
  detailTheme.value === "sweet" && "page--sweet",
  detailTheme.value === "sweet" && `page--sweet-${cyberEffectPhase.value}`,
  detailTheme.value === "summer" && "page--summer",
  detailTheme.value === "summer" && `page--summer-${cyberEffectPhase.value}`,
].filter(Boolean))

const PROMPT_START_TIMEOUT_MS = 4000
const STUCK_PROMPT_TIMEOUT_MS = 3 * 60 * 1000
const ENABLE_STUCK_PROMPT_DETECTION = false
const DEFAULT_DETAIL_TABS_BAR_HEIGHT = 54
const DEFAULT_DETAIL_TOOLBAR_HEIGHT = 0
const DEFAULT_DETAIL_COMPOSER_HEIGHT = 156
const DETAIL_BACKGROUND_STORAGE_PREFIX = "mcode_conversation_detail_background"

const loading = ref(false)
const preparingDetailContentConversationId = ref(0)
const detailLoadError = ref<{ conversationId: number; message: string } | null>(null)
const stoppingSession = ref(false)
const refreshTapCount = ref(0)
const refreshTapTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const sequence = ref(0)
const conversationId = ref<number>(0)
const folderId = ref<number>(0)
const routeConnectionId = ref("")
const routeConnectionKey = ref("")
const routeConnectionContext = ref<StoredConnectionItem | null>(null)
const bridgeHealth = ref<RealtimeBridgeHealth | null>(null)
const bridgeRecoveredAt = ref(0)
const conversationTitle = ref("未命名会话")
const detailBackgroundImageUrl = ref("")
const detailTheme = ref<DetailThemeId>("default")
const lastCyberStreamEndedAt = ref(0)
const pageScrollTop = ref(0)
const messageScrollTop = ref(0)
const messageScrollIntoView = ref("")
const messageScrollWithAnimation = ref(false)
const topChromeHeight = ref(0)
const bottomComposerHeight = ref(0)
const detailViewportHeight = ref(0)
const toolbarHeight = ref(DEFAULT_DETAIL_TOOLBAR_HEIGHT)
const tabsBarHeight = ref(DEFAULT_DETAIL_TABS_BAR_HEIGHT)
const sharedHintHeight = ref(0)
const hasInitialBottomScroll = ref(false)
const isRestoringScroll = ref(false)
const restoredInitialScroll = ref(false)
const lastMeasuredScrollTop = ref(0)
const anchorMessageId = ref("")
const shouldAutoFollowBottom = ref(true)
const hasUnreadBelow = ref(false)
const sharedPromptQueueExpanded = ref(false)
const cancellingSharedQueueItemIds = ref<Set<string>>(new Set())
const reorderingSharedQueueItemIds = ref<Set<string>>(new Set())
const updatingSharedQueuePriorityItemIds = ref<Set<string>>(new Set())
const clearingSharedPromptQueue = ref(false)
const showPlanDrawer = ref(false)
const showDetailMoreMenu = ref(false)
const composerPanelMode = ref<ComposerPanelMode>("")
const toolRowExpanded = ref(false)
const longWaitTick = ref(0)
/**
 * 每个会话最近一次 attach（拿到快照）的时刻。
 *
 * 只用来算 `attachElapsedMs` —— 标出「瞬态状态还没到齐」那几秒。不放进 session：
 * 它是纯 UI 的过渡窗口，与运行时状态无关，落进 store 会被当成需要持久化的东西。
 */
const detailAttachedAtMap = new Map<number, number>()

/**
 * 水合快照，并记下 attach 时刻。
 *
 * **所有 `hydrateLiveSnapshot` 都要走这里**，不要直接调 store —— 漏一处那条路径就没有
 * 「同步中」过渡态，又会退回「冷启动看起来一切正常」。包一层而不是在 5 个调用点各加
 * 一行，是为了让以后新增的调用点自动覆盖。
 */
function hydrateDetailSnapshot(targetConversationId: number, snapshot: unknown) {
  if (!targetConversationId) return
  detailAttachedAtMap.set(targetConversationId, Date.now())
  runtime.hydrateLiveSnapshot(targetConversationId, snapshot)
}
const longWaitStartedAt = ref(0)
// 重连智能体在途标记：防止连点发出多个 connect（每个都会先 invalidate，互相把对方
// 刚建好的连接拆掉）。
const reconnectingDetailAgent = ref(false)
const measuredPageHeight = ref(0)
let detailBridgeHealthUnsubscribe: (() => void) | null = null
let longWaitTimer: ReturnType<typeof setInterval> | null = null
let bridgeRecoveryTimer: ReturnType<typeof setTimeout> | null = null
let cyberSettleTimer: ReturnType<typeof setTimeout> | null = null
const detailAgentConfig = ref<DetailAgentConfigState>(createEmptyDetailAgentConfigState())
const currentAgentType = ref("claude_code")
const detailProjectEntries = ref<DetailProjectEntry[]>([])
const detailTabsVersion = ref(0)
const detailOpenedTabs = ref<OpenedTabItem[]>([])
const detailMobileTabs = ref<OpenedTabItem[]>([])
const detailTabsHydrated = ref(false)
const detailTabMultitaskMode = ref<DetailTabMultitaskMode>("off")
const detailActiveTabIndex = ref(0)
const detailSwiperCurrent = ref(0)
const mountedDetailConversationIds = ref<Set<number>>(new Set())
const detailTabTitleMap = ref<Record<number, string>>({})
const activeDetailTabIndex = detailActiveTabIndex
const hasLoadedOnce = ref(false)
const needsResumeRefresh = ref(false)
const permissionSubmitting = ref(false)
const pendingPermissionSubmittingOptionId = ref("")
const questionSubmitting = ref(false)
const askQuestionSelections = ref<Record<string, QuestionSelectionState>>({})
const forceRemoteTurnReconcileOnLoad = ref(false)
// 正在进行的窗口探测，按会话去重。watcher 与 loadConversation 都会调
// ensureConversationHistoryWindow，没有这个守卫会并发发出多个相同的尾窗请求。
const historyWindowProbeConversationIds = new Set<number>()
let detailAgentProbeToken = 0
let stuckPromptTimer: ReturnType<typeof setTimeout> | null = null
let lastLiveActivitySignature = ""
let stuckPromptShownForSignature = false
let detailOpenedTabsUnsubscribe: (() => void) | null = null
let detailOverviewInvalidationUnsubscribe: (() => void) | null = null
let detailOpenedTabsInstanceKey = ""
let detailOverviewInstanceKey = ""
let detailSwitching = false
let detailLoadSequence = 0
let mentionSourceLoadToken = 0
let pendingDetailTabIndex: number | null = null
let pendingDetailTabOptions: { syncRemote?: boolean } | null = null
const connectingBackgroundConversationIds = new Set<number>()
const detailTabStateMap = new Map<number, DetailTabState>()

function detailDebugLog(stage: string, payload?: Record<string, unknown>) {
  if (!isDetailDebugEnabled()) return
  if (!conversationId.value) return
  console.warn("[conversation-detail-debug]", {
    conversationId: conversationId.value,
    stage,
    ...(payload || {}),
  })
}

function getDetailOpenedTabConversationIds(items: OpenedTabItem[] = []) {
  return Array.from(new Set(
    items
      .map((item) => Number(item.conversation_id || 0))
      .filter((id) => id > 0)
  )).sort((left, right) => left - right)
}

function getDetailTabsDiagnosticSnapshot() {
  return buildDetailTabsDiagnosticSnapshot({
    currentConversationId: conversationId.value,
    tabs: detailShellTabs.value,
    mountedConversationIds: mountedDetailConversationIds.value,
    activeTabIndex: activeDetailTabIndex.value,
  })
}

function detailTabsDebugLog(stage: string, payload?: Record<string, unknown>) {
  // #ifdef H5
  if (!isDetailDebugEnabled()) return
  console.warn("[conversation-detail-tabs-debug]", {
    stage,
    multitaskMode: detailTabMultitaskMode.value,
    tabsHydrated: detailTabsHydrated.value,
    tabsVersion: detailTabsVersion.value,
    subscribedInstanceKey: detailOpenedTabsInstanceKey || null,
    ...getDetailTabsDiagnosticSnapshot(),
    ...(payload || {}),
  })
  // #endif
}

function isCurrentDetailTarget(input: {
  conversationId: number
  folderId?: number
  instanceKey?: string
}) {
  const activeTab = detailShellTabs.value[activeDetailTabIndex.value]
  const activeTabConversationId = Number(activeTab?.conversationId || 0)
  if (
    activeTabConversationId > 0 &&
    activeTabConversationId !== Number(input.conversationId || 0)
  ) {
    return false
  }
  if (Number(conversationId.value || 0) !== Number(input.conversationId || 0)) {
    return false
  }
  if (
    input.folderId != null &&
    Number(folderId.value || 0) !== Number(input.folderId || 0)
  ) {
    return false
  }
  if (input.instanceKey && resolveDetailInstanceKey() !== input.instanceKey) {
    return false
  }
  return true
}

const timelineTurns = computed(() => {
  if (!conversationId.value) return []
  return runtime.getTimelineTurns(conversationId.value)
})

const messages = computed(() => {
  return timelineTurns.value.map((entry) => entry.turn)
})

const renderMessageItems = computed<RenderMessageItem[]>(() =>
  buildRenderMessageItems(messages.value)
)

const session = computed(() => {
  if (!conversationId.value) return null
  return runtime.getOrCreateSession(conversationId.value)
})
const sharedPromptQueue = computed(() => session.value?.sharedPromptQueue || null)
const showSharedPromptQueue = computed(() => hasSharedPromptQueue(sharedPromptQueue.value))
const sharedPromptQueueItems = computed(() => sharedPromptQueue.value?.items || [])
const sharedPromptQueueHeaderText = computed(() => sharedPromptQueueTitle(sharedPromptQueue.value))
const sharedPromptQueueSummaryText = computed(() => sharedPromptQueueSummary(sharedPromptQueue.value))
const localRelayClientId = computed(() => getRelayClientId())
const hasBoundConnection = computed(() => Boolean(firstString(session.value?.connectionId)))
const sharedPromptQueueClearDisabled = computed(() =>
  isSharedPromptQueueClearDisabled(
    sharedPromptQueue.value,
    firstString(session.value?.connectionId),
    clearingSharedPromptQueue.value
  )
)

const managedConversation = computed(() => {
  if (!conversationId.value) return null
  return runtime.getManagedConversation(conversationId.value)
})
const sharedPromptQueueCapabilities = computed(() => managedConversation.value?.connection.capabilities || [])
const sharedPromptQueueControlsEnabled = computed(() =>
  canEditSharedPromptQueue(sharedPromptQueue.value, sharedPromptQueueCapabilities.value)
)
const messageListPageStyle = computed(() => {
  const fallbackTopHeight =
    Math.max(0, Number(effectiveDetailTabsBarHeight.value || 0)) +
    Math.max(0, Number(toolbarHeight.value || DEFAULT_DETAIL_TOOLBAR_HEIGHT))
  return buildMessageListPageStyle({
    viewportHeight: detailViewportHeight.value || getDetailViewportHeight(),
    topChromeHeight: Math.max(topChromeHeight.value, fallbackTopHeight),
    bottomComposerHeight: effectiveBottomComposerHeight.value,
  })
})
const effectiveBottomComposerHeight = computed(() =>
  bottomComposerHeight.value > 0 ? bottomComposerHeight.value : DEFAULT_DETAIL_COMPOSER_HEIGHT
)
const messageListContentStyle = computed(() =>
  buildMessageListContentStyle(effectiveBottomComposerHeight.value)
)
const detailTabsBarThemeStyle = computed(() => {
  if (detailTheme.value === "matrix") {
    return {
      background: "rgba(0, 12, 4, 0.96)",
      backgroundColor: "rgba(0, 12, 4, 0.96)",
      borderColor: "rgba(0, 255, 65, 0.26)",
      boxShadow: "0 0 24rpx rgba(0, 255, 65, 0.14)",
    }
  }
  if (detailTheme.value === "sweet") {
    return {
      background: "rgba(255, 245, 251, 0.74)",
      backgroundColor: "rgba(255, 245, 251, 0.74)",
      borderColor: "rgba(236, 72, 153, 0.18)",
      boxShadow: "0 0 26rpx rgba(244, 114, 182, 0.14)",
      backdropFilter: "blur(10rpx)",
    }
  }
  if (detailTheme.value === "summer") {
    return {
      background: "rgba(232, 250, 255, 0.84)",
      backgroundColor: "rgba(232, 250, 255, 0.84)",
      borderColor: "rgba(10, 153, 186, 0.16)",
      boxShadow: "0 0 26rpx rgba(11, 101, 128, 0.12)",
      backdropFilter: "blur(10rpx)",
    }
  }
  return hasDetailBackgroundImage.value ? {} : upThemeCardStyle.value
})
const detailTabsBarStyle = computed(() => ({
  ...buildTopOffsetStyle(getNavbarHeight()),
  borderRadius: "0",
}))
const detailNavbarCustomClass = computed(() =>
  detailTheme.value === "default"
    ? "detail-navbar-shell"
    : `detail-navbar-shell detail-navbar-shell--${detailTheme.value}`
)
const detailNavbarShellStyle = computed(() => ({
  "--detail-navbar-bg-color": navbarBgColor.value,
  "--detail-navbar-status-bg-color": navbarStatusBarBgColor.value,
}))
const detailStatusBarFillStyle = computed(() => {
  const statusBarHeight = getStatusBarHeight()
  const height = statusBarHeight > 0 ? `${statusBarHeight}px` : "env(safe-area-inset-top)"
  return {
    height,
    minHeight: height,
    background: navbarStatusBarBgColor.value,
    backgroundColor: navbarStatusBarBgColor.value,
  }
})
const detailShellViewportStyle = computed(() => {
  const height = resolveDetailShellViewportHeight({
    windowHeight: getViewportHeight(),
    navbarHeight: getNavbarHeight(),
    hasNavbarPlaceholder: true,
  })
  return {
    height: `${height}px`,
    minHeight: `${height}px`,
  }
})
const detailUploadTarget = computed(() => {
  try {
    return resolveUploadTarget()
  } catch {
    return null
  }
})
const connectingOperationBlockerStyle = computed(() =>
  buildTopOffsetStyle(getNavbarHeight() + effectiveDetailTabsBarHeight.value + toolbarHeight.value)
)
const detailDropdownMaskStyle = computed(() => ({
  top: `${getNavbarHeight()}px`,
}))

const detailConnectionKey = computed(() => {
  if (routeConnectionKey.value) {
    return routeConnectionKey.value
  }
  const currentSession = session.value
  const currentConnectionId = currentSession?.connectionId
  if (currentConnectionId) {
    const managed = connectionSessionManager.getByConnectionId(currentConnectionId)
    const descriptor = managed
      ? getRegisteredRemoteInstanceDescriptor(managed.instanceKey)
      : null
    if (managed && descriptor?.baseUrl) {
      return managed.instanceKey
    }
    if (managed?.instanceKey) return managed.instanceKey
  }
  return resolveDetailInstanceKey()
})
const DETAIL_CONVERSATION_STATUS_ACTIONS = [
  { label: "进行中", status: "in_progress" },
  { label: "待处理", status: "pending_review" },
  { label: "已完成", status: "completed" },
  { label: "已取消", status: "cancelled" },
  { label: "失败", status: "failed" },
] as const

const detailMoreActions = computed(() => [
  { name: "模型供应商", color: "#2979ff" },
  { name: "文件夹管理", color: "#2979ff" },
  { name: "详情页主题", color: "#ec4899" },
  { name: "背景图自定义", color: "#8b5cf6" },
  { name: "重命名", color: "#2979ff" },
  { name: "更改状态", color: "#2979ff" },
  { name: "删除", color: "#fa3534" },
])
const showDetailBackgroundImage = computed(() =>
  shouldShowDetailBackgroundImage({
    detailTheme: detailTheme.value,
    detailBackgroundImageUrl: detailBackgroundImageUrl.value,
  })
)
const hasDetailBackgroundImage = computed(() => showDetailBackgroundImage.value)

const toolbarNoticeItems = computed(() => {
  const items: Array<{ key: string; text: string }> = []
  if (sharedLiveHint.value) {
    items.push({
      key: "shared",
      text: sharedLiveHint.value,
    })
  }
  if (toolbarStatusText.value) {
    items.push({
      key: "status",
      text: toolbarStatusText.value,
    })
  }
  if (items.length === 0) {
    items.push({
      key: "idle",
      text: "空闲",
    })
  }
  return items
})
const inputStatusText = computed(() => toolbarNoticeItems.value[0]?.text || "空闲")

const runtimeStatus = computed<string>(() => {
  const status = String(session.value?.status || "idle")
  if (status === "connected" && !hasBoundConnection.value) return "connecting"
  return status
})
const cyberEffectPhase = computed<CyberEffectPhase>(() =>
  deriveCyberEffectPhase({
    detailTheme: detailTheme.value,
    runtimeStatus: runtimeStatus.value,
    hasLiveMessage: Boolean(
      session.value?.liveMessage && !session.value?.liveMessage?.isPlaceholderThinking
    ),
    lastStreamEndedAt: lastCyberStreamEndedAt.value,
    now: Date.now(),
  })
)
const canStopSession = computed(() => isStoppableRuntimeStatus(runtimeStatus.value))
const liveActivitySignature = computed(() =>
  buildLiveActivitySignature(session.value?.liveMessage?.content || [])
)
watch(
  () => session.value?.liveMessage?.id || "",
  (next, previous) => {
    if (!previous || next) return
    lastCyberStreamEndedAt.value = Date.now()
    if (cyberSettleTimer) clearTimeout(cyberSettleTimer)
    cyberSettleTimer = setTimeout(() => {
      lastCyberStreamEndedAt.value = 0
      cyberSettleTimer = null
    }, 1_300)
  },
  { flush: "sync" }
)
const conversationActivitySignature = computed(() => {
  const latest = renderMessageItems.value[renderMessageItems.value.length - 1]
  return JSON.stringify({
    live: liveActivitySignature.value,
    count: renderMessageItems.value.length,
    latestId: latest?.anchorId || "",
    latestStatus: latest?.message.status || "",
    latestContent: JSON.stringify(latest?.message.content || []),
  })
})
const pendingPermissionCard = computed<PermissionRequest | null>(() => session.value?.pendingPermission || null)
const pendingPermissionDescription = computed(() => {
  return pendingPermissionCard.value?.description || "智能体请求继续当前操作"
})
const pendingPermissionDescriptionParts = computed(() =>
  splitPermissionDescription(pendingPermissionDescription.value)
)
const pendingPermissionTextParts = computed(() => pendingPermissionDescriptionParts.value.textParts)
const pendingPermissionCommandBlock = computed(() => pendingPermissionDescriptionParts.value.commandBlock)
const pendingQuestionCard = computed<PendingQuestionState | null>(() => session.value?.pendingQuestion || null)
const questionAnsweredCount = computed(() => {
  const pending = pendingQuestionCard.value
  if (!pending) return 0
  return pending.questions.filter((question) => isQuestionAnswered(question.id)).length
})
const questionSubmitReady = computed(() => {
  const pending = pendingQuestionCard.value
  return Boolean(pending && pending.questions.length > 0 && questionAnsweredCount.value === pending.questions.length)
})
const detailConfigProjection = computed(() =>
  projectDetailConfigOptions(detailAgentConfig.value.configOptions)
)
const modelOption = computed(() => detailConfigProjection.value.modelOption)
const reasoningOption = computed(() => detailConfigProjection.value.reasoningOption)
const permissionOption = computed(() => detailConfigProjection.value.permissionOption)
const hasModelOptions = computed(() => Boolean(modelOption.value))
const hasPermissionOptions = computed(() =>
  Boolean(detailAgentConfig.value.modes?.available_modes?.length || permissionOption.value)
)
const modelSummary = computed(() =>
  detailConfigOptionSummary({
    status: detailAgentConfig.value.status,
    option: modelOption.value,
    selectedValues: detailAgentConfig.value.selectedValues,
    message: detailAgentConfig.value.message,
  })
)
const reasoningSummary = computed(() =>
  detailConfigOptionSummary({
    status: detailAgentConfig.value.status,
    option: reasoningOption.value,
    selectedValues: detailAgentConfig.value.selectedValues,
    message: detailAgentConfig.value.message,
  })
)
const permissionSummary = computed(() =>
  detailPermissionSummary({
    status: detailAgentConfig.value.status,
    state: detailAgentConfig.value,
    permissionOption: permissionOption.value,
  })
)
const activeModelStatusLabel = computed(() =>
  resolveActiveModelStatusLabel({
    modelSummary: modelSummary.value,
    runtimeStatus: runtimeStatus.value,
  })
)
const detailProjectPath = computed(() => {
  const matched = detailProjectEntries.value.find((item) => Number(item?.id || 0) === folderId.value)
  return String(matched?.path || "").trim()
})
const detailAgentConfigContextKey = computed(() => {
  return buildAgentConfigContextKey(
    detailConnectionKey.value,
    currentAgentType.value,
    detailProjectPath.value,
    conversationId.value || null
  )
})
const stats = computed(() => session.value?.stats || {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  turnCount: 0,
})

function getViewportHeight() {
  const windowInfo = typeof uni.getWindowInfo === "function" ? uni.getWindowInfo() : uni.getSystemInfoSync?.()
  return Number(windowInfo?.windowHeight || 0)
}

function getDetailViewportHeight() {
  return Math.max(0, getViewportHeight() - getNavbarHeight())
}

function getStatusBarHeight() {
  return Number(
    (typeof uni.getWindowInfo === "function" ? uni.getWindowInfo()?.statusBarHeight : 0)
      || uni.getSystemInfoSync?.()?.statusBarHeight
      || 0
  )
}

function getNavbarHeight() {
  const menuButtonRect = typeof uni.getMenuButtonBoundingClientRect === "function"
    ? uni.getMenuButtonBoundingClientRect()
    : null
  const statusBarHeight = getStatusBarHeight()
  if (menuButtonRect?.height && menuButtonRect?.top) {
    const verticalGap = Math.max(0, menuButtonRect.top - statusBarHeight)
    return statusBarHeight + verticalGap * 2 + menuButtonRect.height
  }
  return statusBarHeight + 44
}

const isViewerMode = computed(() => managedConversation.value?.role === "viewer")
const isSharedLive = computed(() => managedConversation.value?.sharedLive === true)
const canSendSharedLive = computed(() =>
  conversationId.value ? runtime.canSend(conversationId.value) : true
)
const sharedLiveHint = computed(() => {
  if (!isSharedLive.value) return ""
  if (isViewerMode.value && !canSendSharedLive.value) {
    return "当前正在旁观其他端的实时会话"
  }
  return "当前会话正在多端共享"
})
const longWaitElapsedMs = computed(() => {
  void longWaitTick.value
  if (!longWaitStartedAt.value) return 0
  return Math.max(0, Date.now() - longWaitStartedAt.value)
})
/**
 * 距离本会话 attach（拿到快照）多久了。
 *
 * 用来标出「刚接上、瞬态状态还没到齐」那几秒：重试横幅服务端刻意不放进快照，
 * 冷启动进入一个正在 504 重试的会话时前几秒只能显示「思考中」，读起来像一切正常。
 *
 * 复用 `longWaitTick` 驱动重算 —— 那个计时器本来就在跑，不必再起一个。
 */
const attachElapsedMs = computed(() => {
  void longWaitTick.value
  const attachedAt = detailAttachedAtMap.get(Number(conversationId.value || 0))
  if (!attachedAt) return 0
  return Math.max(0, Date.now() - attachedAt)
})
const runtimeErrorText = computed(() => firstString(session.value?.inputErrorMessage) || "")
const runtimeErrorDetails = computed(() => firstString(session.value?.inputErrorDetails) || "")
/**
 * 当前活跃的 AIR 失败记录是否建议 `retry` —— 决定「运行异常」时给不给重连入口。
 *
 * 取适配器自己给的 `actions`（`retry|login|new_session`）而不是猜错误文案：`login`
 * （登录过期）/ `new_session`（会话失效）时给「重新连接」是误导，重连解决不了它们。
 */
const detailFailureSuggestsRetry = computed(() => {
  const record = primarySessionFailure(session.value?.sessionFailures || [])
  return record ? sessionFailureSuggestsRetry(record) : false
})
const runtimeRetryText = computed(() => buildRuntimeRetryText(session.value?.apiRetry))
const networkReachabilityFeedbackText = computed(() =>
  buildNetworkReachabilityFeedbackText({
    bridgeHealth: bridgeHealth.value,
    runtimeRetryText: runtimeRetryText.value,
    runtimeErrorText: runtimeErrorText.value,
    isNetworkFailure: looksLikeNetworkFailure,
  })
)
const showNetworkReachabilityFeedback = computed(() =>
  Boolean(networkReachabilityFeedbackText.value)
)
const showBridgeRecoveredBanner = computed(() => {
  if (!bridgeRecoveredAt.value) return false
  return Date.now() - bridgeRecoveredAt.value < 3000
})
const detailStatusState = computed<DetailStatusState>(() =>
  buildDetailStatusState({
    bridgeHealth: bridgeHealth.value,
    showBridgeRecoveredBanner: showBridgeRecoveredBanner.value,
    runtimeErrorText: runtimeErrorText.value,
    runtimeErrorDetails: runtimeErrorDetails.value,
    runtimeRetryText: runtimeRetryText.value,
    runtimeStatus: runtimeStatus.value,
    attachElapsedMs: attachElapsedMs.value,
    failureSuggestsRetry: detailFailureSuggestsRetry.value,
    longWaitElapsedMs: longWaitElapsedMs.value,
    activeModelStatusLabel: activeModelStatusLabel.value,
    planTaskCount: planTasks.value.length,
    themeColor: upThemeVar,
  })
)
const detailStatusBanner = computed(() =>
  detailStatusState.value.code === "idle" ? null : detailStatusState.value
)
const showRuntimeRetryFeedback = computed(() =>
  Boolean(runtimeRetryText.value) &&
  detailStatusState.value.code !== "api_retry" &&
  !showNetworkReachabilityFeedback.value
)
const showRuntimeErrorFeedback = computed(() =>
  Boolean(runtimeErrorText.value) &&
  !showNetworkReachabilityFeedback.value
)
const hasRenderedMessages = computed(() => renderMessageItems.value.length > 0)
const hasPendingInteraction = computed(() =>
  Boolean(pendingPermissionCard.value || pendingQuestionCard.value)
)
const isActiveWaitingRuntime = computed(() =>
  runtimeStatus.value === "connecting" ||
  runtimeStatus.value === "thinking" ||
  runtimeStatus.value === "running_tool" ||
  runtimeStatus.value === "waiting_permission" ||
  runtimeStatus.value === "waiting_question"
)
const showInitialConversationLoading = computed(() =>
  loading.value && !hasRenderedMessages.value && !isActiveWaitingRuntime.value
)
const showWaitingResponseState = computed(() =>
  !loading.value &&
  !hasRenderedMessages.value &&
  (isActiveWaitingRuntime.value || hasPendingInteraction.value)
)
const showBottomGeneratingIndicator = computed(() =>
  !loading.value &&
  hasRenderedMessages.value &&
  !hasPendingInteraction.value &&
  (runtimeStatus.value === "thinking" || runtimeStatus.value === "running_tool")
)
const bottomGeneratingText = computed(() =>
  resolveBottomGeneratingText(runtimeStatus.value, activeModelStatusLabel.value)
)
const waitingStateBadgeText = computed(() => resolveWaitingStateBadgeText(runtimeStatus.value))
const waitingStateTitle = computed(() => resolveWaitingStateTitle(runtimeStatus.value))
const waitingStateDescription = computed(() =>
  resolveWaitingStateDescription(runtimeStatus.value)
)
const waitingStateFootnote = computed(() =>
  resolveWaitingStateFootnote({
    showWaitingResponseState: showWaitingResponseState.value,
    runtimeStatus: runtimeStatus.value,
    longWaitElapsedMs: longWaitElapsedMs.value,
  })
)

const showConnectingOperationBlocker = computed(() => runtimeStatus.value === "connecting")

const runtimeStatusLabel = computed(() =>
  buildRuntimeStatusLabel({
    detailStatusCode: detailStatusState.value.code,
    runtimeStatus: runtimeStatus.value,
    activeModelStatusLabel: activeModelStatusLabel.value,
  })
)

const toolbarStatusText = computed(() => {
  const bannerText = String(detailStatusBanner.value?.text || "").trim()
  if (bannerText) return bannerText
  return runtimeStatusLabel.value
})

const runtimeStatusClass = computed(() =>
  buildRuntimeStatusClass({
    detailStatusCode: detailStatusState.value.code,
    runtimeStatus: runtimeStatus.value,
  })
)

const showComposerPanel = computed(() => composerPanelMode.value !== "")
const showInputToolRow = computed(() =>
  toolRowExpanded.value || showComposerPanel.value
)
const composerPanelTitle = computed(() => {
  if (composerPanelMode.value === "config") return "模型配置"
  return "快捷发送"
})

const agentLogoPath = computed(() => {
  const key = normalizeAgentType(currentAgentType.value)
  if (key === "claude_code") return "/static/agent-logos/claude-code.svg"
  if (key === "codex") return "/static/agent-logos/codex.svg"
  if (key === "gemini") return "/static/agent-logos/gemini.svg"
  if (key === "cline") return "/static/agent-logos/cline.svg"
  if (key === "open_code") return "/static/agent-logos/open-code.svg"
  if (key === "open_claw") return "/static/agent-logos/open-claw.svg"
  return ""
})

const currentAgentLabel = computed(() => {
  const key = normalizeAgentType(currentAgentType.value)
  if (key === "claude_code") return "@claude_code"
  if (key === "codex") return "@codex"
  if (key === "gemini") return "@gemini"
  if (key === "cline") return "@cline"
  if (key === "open_code") return "@open_code"
  if (key === "open_claw") return "@open_claw"
  return `@${key || "assistant"}`
})

const fallbackDetailTabItem = computed<OpenedTabItem[]>(() => {
  const item = buildDetailFallbackTab({
    conversationId: conversationId.value,
    folderId: folderId.value,
    agentType: currentAgentType.value,
  })
  return item ? [item] : []
})

const detailTabsUsePcSync = computed(() => detailTabMultitaskMode.value === "pc")
const detailTabsUseMobileLocal = computed(() => detailTabMultitaskMode.value === "mobile")
const detailTabsEnabled = computed(() => detailTabMultitaskMode.value !== "off")
const shouldShowDetailTabsBar = computed(() => detailTabsEnabled.value && detailShellTabs.value.length > 0)
const effectiveDetailTabsBarHeight = computed(() =>
  shouldShowDetailTabsBar.value ? tabsBarHeight.value : 0
)
const detailTabSourceItems = computed<OpenedTabItem[]>(() => {
  if (detailTabsUsePcSync.value) {
    return detailTabsHydrated.value ? detailOpenedTabs.value : fallbackDetailTabItem.value
  }
  if (detailTabsUseMobileLocal.value) {
    return detailTabsHydrated.value ? detailMobileTabs.value : fallbackDetailTabItem.value
  }
  return fallbackDetailTabItem.value
})

const detailShellTabs = computed<DetailShellTabItem[]>(() =>
  buildDetailShellTabs({
    openedTabs: detailTabSourceItems.value,
    titleByConversationId: detailTabTitleMap.value,
  })
)
const detailLoadErrorMessage = computed(() => {
  const failure = detailLoadError.value
  if (failure?.conversationId !== Number(conversationId.value || 0)) return ""
  return failure.message
})
const detailContentInitialLoading = computed(() => {
  const targetConversationId = Number(conversationId.value || 0)
  if (!targetConversationId) return false
  return loading.value || preparingDetailContentConversationId.value === targetConversationId
})
const showDetailShellFallback = computed(() => {
  const snapshot = getDetailTabsDiagnosticSnapshot()
  return !snapshot.currentConversationInShell || !snapshot.currentConversationMounted
})

const navbarStatusBarBgColor = computed(() =>
  detailTheme.value === "matrix"
    ? "#000000"
    : detailTheme.value === "sweet"
      ? "#fff1f8"
      : detailTheme.value === "summer"
        ? "#e8faff"
      : upThemeVar("--up-card-bg-color", "#ffffff")
)
const navbarBgColor = computed(() => navbarStatusBarBgColor.value)
const navbarIconColor = computed(() =>
  detailTheme.value === "matrix"
    ? "#8dffb4"
    : detailTheme.value === "sweet"
      ? "#d9468f"
      : detailTheme.value === "summer"
        ? "#0b6580"
      : upThemeVar("--up-content-color", "#303133")
)
const navbarFrontColor = computed(() =>
  detailTheme.value === "matrix" || isDarkReadableBackground(navbarBgColor.value) ? "#ffffff" : "#000000"
)
const detailTabsItemStyle = {
  paddingLeft: "0px",
  paddingRight: "0px",
  height: "72rpx",
  borderRadius: "999px",
}
const detailTabsActiveStyle = computed(() => ({
  color:
    detailTheme.value === "matrix"
      ? "#d8ffe4"
      : detailTheme.value === "sweet"
        ? "#be185d"
        : detailTheme.value === "summer"
          ? "#0f7a92"
        : "#ffffff",
  fontWeight: detailTheme.value === "default" ? 500 : 700,
}))
const detailTabsInactiveStyle = computed(() => ({
  color:
    detailTheme.value === "matrix"
      ? "#73c989"
      : detailTheme.value === "sweet"
        ? "#db2777"
        : detailTheme.value === "summer"
          ? "#0d7493"
        : upThemeVar("--up-content-color", "#606266"),
}))

watch(
  () => [navbarBgColor.value, navbarStatusBarBgColor.value, navbarFrontColor.value] as const,
  () => {
    syncDetailNativeStatusBar()
  },
  { immediate: true }
)

const slashCommands = ref<SlashCommandItem[]>([])

function syncDetailNativeStatusBar() {
  const backgroundColor = navbarBgColor.value || "#ffffff"
  const statusBarBackgroundColor = navbarStatusBarBgColor.value || backgroundColor
  const pageBackgroundColor = detailTheme.value === "matrix"
    ? "#000000"
    : detailTheme.value === "sweet"
      ? "#fff6fb"
      : detailTheme.value === "summer"
        ? "#87e2ff"
      : upThemeVar("--up-page-bg-color", backgroundColor) || backgroundColor
  const frontColor = navbarFrontColor.value === "#ffffff" ? "#ffffff" : "#000000"

  try {
    const result = uni.setNavigationBarColor?.({
      frontColor,
      backgroundColor: statusBarBackgroundColor,
      animation: { duration: 0, timingFunc: "linear" },
    })
    result && typeof (result as Promise<unknown>).catch === "function" && (result as Promise<unknown>).catch(() => {})
  } catch {}

  try {
    const result = (uni as any).setBackgroundColor?.({
      backgroundColor: pageBackgroundColor,
      backgroundColorTop: statusBarBackgroundColor,
      backgroundColorBottom: pageBackgroundColor,
    })
    result && typeof (result as Promise<unknown>).catch === "function" && (result as Promise<unknown>).catch(() => {})
  } catch {}

  syncIosStandaloneStatusBar({
    cyberModeEnabled: detailTheme.value === "matrix",
    statusBarBackgroundColor: statusBarBackgroundColor,
    pageBackgroundColor,
  })

  try {
    const nativeNavigator = (globalThis as any).plus?.navigator
    nativeNavigator?.setStatusBarBackground?.(statusBarBackgroundColor)
    nativeNavigator?.setStatusBarStyle?.(frontColor === "#ffffff" ? "light" : "dark")
  } catch {}
}

function isDarkReadableBackground(color: string) {
  const rgb = parseColorToRgb(color)
  if (!rgb) return false
  const [r, g, b] = rgb.map((value) => {
    const normalized = value / 255
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.42
}

function parseColorToRgb(color: string): [number, number, number] | null {
  const value = String(color || "").trim()
  const hexMatch = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hexMatch) {
    const hex = hexMatch[1].length === 3
      ? hexMatch[1].split("").map((char) => `${char}${char}`).join("")
      : hexMatch[1]
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ]
  }

  const rgbMatch = value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (!rgbMatch) return null
  return [
    Number(rgbMatch[1]),
    Number(rgbMatch[2]),
    Number(rgbMatch[3]),
  ]
}

const planStatusFilter = ref<PlanTaskFilter>("all")

const planTasks = computed<PlanTask[]>(() =>
  buildPlanTasks({
    messages: messages.value,
    liveContent: session.value?.liveMessage?.content || [],
  })
)

const completedTaskCount = computed(
  () => planTasks.value.filter((task) => task.status === "completed").length
)

const filteredPlanTasks = computed(() => {
  if (planStatusFilter.value === "all") return planTasks.value
  return planTasks.value.filter((task) => task.status === planStatusFilter.value)
})

const showScrollToBottomFab = computed(
  () =>
    renderMessageItems.value.length > 0 &&
    !shouldAutoFollowBottom.value &&
    !isRestoringScroll.value
)

const planFilterItems = computed(() => buildPlanFilterItems(planTasks.value))

function ensureDetailLocalTabState(tab: DetailShellTabItem | null | undefined) {
  if (!tab?.conversationId) return null
  const existing = detailTabStateMap.get(tab.conversationId)
  if (existing) {
    existing.tab = tab
    return existing
  }
  const created = createDetailTabState(tab)
  detailTabStateMap.set(tab.conversationId, created)
  return created
}

function pruneDetailLocalTabStates() {
  const activeConversationIds = new Set(
    detailShellTabs.value.map((tab) => Number(tab.conversationId || 0)).filter((id) => id > 0)
  )
  Array.from(detailTabStateMap.keys()).forEach((conversationIdValue) => {
    if (!activeConversationIds.has(conversationIdValue)) {
      detailTabStateMap.delete(conversationIdValue)
    }
  })
  mountedDetailConversationIds.value = resolveMountedDetailConversationIds({
    mountedConversationIds: mountedDetailConversationIds.value,
    tabs: detailShellTabs.value,
  })
}

function mountDetailTabWindow(index: number) {
  mountedDetailConversationIds.value = resolveDetailMountedWindowConversationIds({
    tabs: detailShellTabs.value,
    currentIndex: index,
  })
}

function captureActiveDetailLocalState() {
  const activeTab = detailShellTabs.value[activeDetailTabIndex.value]
  const currentTab = detailShellTabs.value.find((tab) =>
    Number(tab.conversationId || 0) === Number(conversationId.value || 0) &&
    Number(tab.folderId || 0) === Number(folderId.value || 0)
  )
  const stateTab = currentTab || (
    activeTab?.conversationId === conversationId.value && activeTab?.folderId === folderId.value
      ? activeTab
      : null
  )
  if (!stateTab) return
  const state = ensureDetailLocalTabState(stateTab)
  if (!state) return
  // 草稿与 composer UI 状态不在这里 —— 它们归 pane（输入框在那边），草稿另有
  // SQLite 落盘。这里只存详情页自己拥有的：问题作答、滚动位置、抽屉/提交中标记。
  state.askQuestionSelectionsJson = JSON.stringify(askQuestionSelections.value || {})
  state.pageScrollTop = pageScrollTop.value
  state.lastMeasuredScrollTop = lastMeasuredScrollTop.value
  state.anchorMessageId = anchorMessageId.value
  state.shouldAutoFollowBottom = shouldAutoFollowBottom.value
  state.hasUnreadBelow = hasUnreadBelow.value
  state.showPlanDrawer = showPlanDrawer.value
  state.questionSubmitting = questionSubmitting.value
  state.permissionSubmitting = permissionSubmitting.value
}

function restoreDetailLocalState(tab: DetailShellTabItem | null | undefined) {
  const state = ensureDetailLocalTabState(tab)
  if (!state) return
  askQuestionSelections.value = JSON.parse(state.askQuestionSelectionsJson || "{}")
  pageScrollTop.value = Number(state.pageScrollTop || 0)
  lastMeasuredScrollTop.value = Number(state.lastMeasuredScrollTop || 0)
  anchorMessageId.value = state.anchorMessageId || ""
  shouldAutoFollowBottom.value = state.shouldAutoFollowBottom !== false
  hasUnreadBelow.value = Boolean(state.hasUnreadBelow)
  messageScrollWithAnimation.value = false
  messageScrollIntoView.value = ""
  messageScrollTop.value = Number(state.lastMeasuredScrollTop || state.pageScrollTop || 0)
  showPlanDrawer.value = state.showPlanDrawer
}

function findDetailShellTabIndex(conversationIdValue: number) {
  return detailShellTabs.value.findIndex(
    (tab) => Number(tab.conversationId || 0) === Number(conversationIdValue || 0)
  )
}

function markDetailTabMounted(index: number) {
  const safeIndex = Number(index)
  const tab = detailShellTabs.value[safeIndex]
  const conversationIdValue = Number(tab?.conversationId || 0)
  if (!conversationIdValue || mountedDetailConversationIds.value.has(conversationIdValue)) return
  const nextMountedIds = new Set(mountedDetailConversationIds.value)
  nextMountedIds.add(conversationIdValue)
  mountedDetailConversationIds.value = nextMountedIds
}

function syncDetailTabSelection(index: number) {
  const safeIndex = Math.min(
    Math.max(0, Number(index || 0)),
    Math.max(0, detailShellTabs.value.length - 1),
  )
  mountDetailTabWindow(safeIndex)
  detailActiveTabIndex.value = safeIndex
  detailSwiperCurrent.value = safeIndex
}

function shouldMountDetailTabPage(index: number) {
  const tab = detailShellTabs.value[Number(index)]
  const conversationIdValue = Number(tab?.conversationId || 0)
  return conversationIdValue > 0 && mountedDetailConversationIds.value.has(conversationIdValue)
}

function isActiveDetailTabPage(index: number) {
  return Number(index) === activeDetailTabIndex.value
}

function shouldRenderDetailTabPage(index: number) {
  return shouldMountDetailTabPage(index)
}

async function ensureMountedDetailTabRuntime(tab: DetailShellTabItem | null | undefined) {
  const targetConversationId = Number(tab?.conversationId || 0)
  if (!targetConversationId || connectingBackgroundConversationIds.has(targetConversationId)) return
  const runtimeSession = runtime.getOrCreateSession(targetConversationId)
  const hasActiveRuntimeConnection =
    runtimeSession.connectionId &&
    (runtimeSession.status === "connected" ||
      runtimeSession.status === "thinking" ||
      runtimeSession.status === "running_tool" ||
      runtimeSession.status === "waiting_permission" ||
      runtimeSession.status === "waiting_question")
  if (hasActiveRuntimeConnection && runtimeSession.localTurns.length > 0) {
    return
  }

  connectingBackgroundConversationIds.add(targetConversationId)
  try {
    const instanceKey = resolveDetailInstanceKey()
    const persistedRuntime = instanceKey
      ? await getRuntime(instanceKey, targetConversationId).catch(() => null)
      : null
    // 缓存开关关闭（默认）时跳过水合：下面那段 `localTurns.length === 0` 的分支
    // 会转而拉远端尾窗，代价是冷启动要等网络（已确认接受的取舍）。
    if (runtimeSession.localTurns.length === 0 && readLocalTurnCacheEnabled()) {
      const localTurns = await getNewestTurns(targetConversationId, DEFAULT_CONVERSATION_HISTORY_PAGE_SIZE).catch(() => [])
      if (localTurns.length > 0) {
        runtimeSession.localTurns = localTurns
          .slice()
          .reverse()
          .map(mapPersistedTurnToMessage)
      }
    }
    const managed = connectionSessionManager.getByConversationId(targetConversationId)
    let agentType = firstString(managed?.connection.agentType, tab?.agentType) || "claude_code"
    let resumeSessionId = firstString(managed?.externalId, managed?.connection.sessionId)
    let remoteDetail: any = null
    if (!resumeSessionId && instanceKey) {
      const summary = await getConversationSummaryById(instanceKey, targetConversationId).catch(() => null)
      agentType = firstString(agentType, summary?.agentType) || "claude_code"
      resumeSessionId = firstString(summary?.externalId)
    }
    if (runtimeSession.localTurns.length === 0) {
      remoteDetail = await fetchRemoteConversationDetailById(targetConversationId).catch(() => null)
      if (remoteDetail) {
        await applyRemoteHistoryWindowDetail({
          instanceKey,
          conversationId: targetConversationId,
          folderId: Number(tab?.folderId || 0),
          detail: remoteDetail,
          runtimeSession,
        })
        const metadata = getRemoteConversationMetadata(remoteDetail, agentType, resumeSessionId)
        agentType = metadata.agentType
        resumeSessionId = metadata.resumeSessionId
        if (metadata.title) {
          detailTabTitleMap.value = {
            ...detailTabTitleMap.value,
            [targetConversationId]: metadata.title,
          }
        }
      }
    }
    if (hasActiveRuntimeConnection) {
      const snapshot = await acpApi
        .acpGetSessionSnapshotByConversation(targetConversationId)
        .catch(() => null)
      if (snapshot) {
        hydrateDetailSnapshot(targetConversationId, snapshot)
      }
      return
    }
    const conn = await runtime.connect(
      targetConversationId,
      normalizeAgentType(agentType),
      undefined,
      resumeSessionId,
      persistedRuntime?.lastAppliedSeq ?? runtimeSession.lastAppliedSeq ?? undefined,
      instanceKey
    )
    const snapshot = await acpApi
      .acpGetSessionSnapshotByConversation(targetConversationId)
      .catch(() => null)
    if (snapshot) {
      hydrateDetailSnapshot(targetConversationId, snapshot)
    } else if (conn?.id) {
      const fallbackSnapshot = await acpApi.acpGetSessionSnapshot(conn.id).catch(() => null)
      if (fallbackSnapshot) {
        hydrateDetailSnapshot(targetConversationId, fallbackSnapshot)
      }
    }
  } catch (error) {
    console.warn("ensure mounted detail tab runtime skipped", error)
  } finally {
    connectingBackgroundConversationIds.delete(targetConversationId)
  }
}

function ensureMountedDetailTabRuntimes() {
  detailShellTabs.value.forEach((tab) => {
    if (!mountedDetailConversationIds.value.has(Number(tab.conversationId || 0))) return
    void ensureMountedDetailTabRuntime(tab)
  })
}

function normalizeOpenedTabsChangedPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return null
  const record = payload as Record<string, unknown>
  return {
    version: Number(record.version || 0),
    origin: firstString(record.origin) || "remote",
    tabs: normalizeOpenedTabsList(record.tabs),
  }
}

function normalizeOpenedTabsResponse(instanceKey: string, raw: unknown) {
  if (Array.isArray(raw)) {
    return {
      instanceKey,
      version: 0,
      items: normalizeOpenedTabsList(raw),
    }
  }
  const record = raw && typeof raw === "object"
    ? (raw as Record<string, unknown>)
    : {}
  return {
    instanceKey,
    version: Number(record.version || 0),
    items: normalizeOpenedTabsList(record.items),
  }
}

function applyDetailOpenedTabsState(input: {
  instanceKey: string
  version: number
  items: OpenedTabItem[]
  origin?: string
  source?: string
}) {
  const normalizedItems = normalizeOpenedTabsList(input.items)
  const previousOpenedConversationIds = getDetailOpenedTabConversationIds(detailOpenedTabs.value)
  const before = getDetailTabsDiagnosticSnapshot()
  const source = input.source || input.origin || "server"
  const incomingConversationIds = getDetailOpenedTabConversationIds(normalizedItems)
  detailTabsDebugLog("opened-tabs:apply", {
    source,
    instanceKey: input.instanceKey,
    incomingVersion: Number(input.version || 0),
    incomingOrigin: input.origin || "server",
    incomingConversationIds,
    previousOpenedConversationIds,
    before,
  })
  replaceOpenedTabsSnapshot(input.instanceKey, input.version, normalizedItems, input.origin || "server")
  detailTabsVersion.value = Number(input.version || 0)
  detailOpenedTabs.value = normalizedItems
  detailTabsHydrated.value = true
  pruneDetailLocalTabStates()
  const after = getDetailTabsDiagnosticSnapshot()
  detailTabsDebugLog("opened-tabs:applied", {
    source,
    instanceKey: input.instanceKey,
    incomingVersion: Number(input.version || 0),
    incomingOrigin: input.origin || "server",
    incomingConversationIds,
    previousOpenedConversationIds,
    before,
    after,
    routedConversationDropped:
      before.currentConversationInShell && !after.currentConversationInShell,
  })
  if (after.currentConversationId > 0 && !after.currentConversationInShell) {
    detailTabsDebugLog("opened-tabs:routed-conversation-pruned", {
      source,
      instanceKey: input.instanceKey,
      incomingVersion: Number(input.version || 0),
      incomingOrigin: input.origin || "server",
      incomingConversationIds,
      previousOpenedConversationIds,
    })
  }
}
function applyDetailMobileTabsState(items: OpenedTabItem[]) {
  detailMobileTabs.value = normalizeOpenedTabsList(items)
  detailTabsVersion.value += 1
  detailTabsHydrated.value = true
  pruneDetailLocalTabStates()
}

function teardownDetailOpenedTabsSubscription() {
  detailOpenedTabsUnsubscribe?.()
  detailOpenedTabsUnsubscribe = null
  detailOpenedTabsInstanceKey = ""
}

function syncDetailTabMultitaskMode() {
  const nextMode = readDetailTabMultitaskMode()
  const changed = nextMode !== detailTabMultitaskMode.value
  detailTabMultitaskMode.value = nextMode
  if (!detailTabsUsePcSync.value) {
    teardownDetailOpenedTabsSubscription()
  }
  return changed
}

function initializeSingleDetailTabShell() {
  teardownDetailOpenedTabsSubscription()
  detailOpenedTabs.value = []
  detailMobileTabs.value = []
  detailTabsHydrated.value = true
  syncDetailTabSelection(0)
  mountDetailTabWindow(0)
}

async function initializeMobileDetailTabsShell(instanceKey: string) {
  teardownDetailOpenedTabsSubscription()
  const items = ensureMobileDetailTab({
    instanceKey,
    folderId: folderId.value,
    conversationId: conversationId.value,
    agentType: currentAgentType.value,
  })
  applyDetailMobileTabsState(items)
  await refreshDetailTabTitles(instanceKey, items)
  reconcileDetailShellFromOpenedTabs({ loadConversation: false })
}
async function refreshDetailTabTitles(
  instanceKey = resolveDetailInstanceKey(),
  items: OpenedTabItem[] = detailOpenedTabs.value
) {
  if (!instanceKey) return
  const conversationIds = Array.from(new Set(
    (Array.isArray(items) ? items : [])
      .map((item) => Number(item.conversation_id || 0))
      .filter((id) => id > 0)
  ))
  if (conversationIds.length === 0) return
  const entries = await Promise.all(
    conversationIds.map(async (conversationIdValue) => {
      const summary = await getConversationSummaryById(instanceKey, conversationIdValue)
      return [conversationIdValue, firstString(summary?.title)] as const
    })
  )
  const nextMap = { ...detailTabTitleMap.value }
  entries.forEach(([conversationIdValue, title]) => {
    if (title) {
      nextMap[conversationIdValue] = title
    }
  })
  detailTabTitleMap.value = nextMap
}

async function syncRemoteActiveDetailTab(tab: DetailShellTabItem) {
  const instanceKey = resolveDetailInstanceKey()
  if (!instanceKey) return
  if (detailTabsUseMobileLocal.value) {
    applyDetailMobileTabsState(activateMobileDetailTab(instanceKey, tab.conversationId))
    return
  }
  if (!detailTabsUsePcSync.value) return
  const gateway = await getDetailGateway()
  const snapshot = await ensureConversationTab({
    instanceKey,
    gateway,
    folderId: tab.folderId,
    conversationId: tab.conversationId,
    agentType: tab.agentType,
    activation: "preserve",
    origin: "mcode-mobile",
  })
  if (snapshot) {
    applyDetailOpenedTabsState({
      instanceKey,
      version: snapshot.version,
      items: snapshot.items,
      origin: "mcode-mobile",
    })
  }
}

function queueDetailTabSwitch(index: number, options: { syncRemote?: boolean } = {}) {
  pendingDetailTabIndex = Number(index)
  pendingDetailTabOptions = { ...options }
}

function shouldRunQueuedDetailTabSwitch(index: number) {
  const tab = detailShellTabs.value[Number(index)]
  if (!tab) return false
  return (
    Number(index) !== activeDetailTabIndex.value ||
    Number(tab.conversationId || 0) !== Number(conversationId.value || 0) ||
    Number(tab.folderId || 0) !== Number(folderId.value || 0)
  )
}

async function switchToDetailTab(
  index: number,
  options: { syncRemote?: boolean } = {}
) {
  const safeIndex = Number(index)
  const tab = detailShellTabs.value[safeIndex]
  if (!tab) return
  captureActiveDetailLocalState()
  syncDetailTabSelection(safeIndex)
  if (shouldDeferDetailTabSwitch({
    targetTab: tab,
    currentConversationId: conversationId.value,
    isSwitching: detailSwitching,
    isLoading: loading.value,
  })) {
    queueDetailTabSwitch(safeIndex, options)
    return
  }
  if (tab.conversationId === conversationId.value && tab.folderId === folderId.value) {
    restoreDetailLocalState(tab)
    if (options.syncRemote !== false) {
      void syncRemoteActiveDetailTab(tab).catch((error) => {
        console.warn("sync remote active detail tab failed", error)
      })
    }
    return
  }
  detailSwitching = true
  try {
    conversationId.value = tab.conversationId
    folderId.value = tab.folderId
    currentAgentType.value = normalizeAgentType(tab.agentType)
    restoreDetailLocalState(tab)
    syncConversationTitle(detailTabTitleMap.value[tab.conversationId] || tab.title)
    await loadDetailProjectEntries()
    await loadConversation()
    if (options.syncRemote !== false) {
      await syncRemoteActiveDetailTab(tab)
    }
  } finally {
    detailSwitching = false
    const queuedIndex = pendingDetailTabIndex
    const queuedOptions = pendingDetailTabOptions || {}
    pendingDetailTabIndex = null
    pendingDetailTabOptions = null
    if (typeof queuedIndex === "number" && shouldRunQueuedDetailTabSwitch(queuedIndex)) {
      void switchToDetailTab(queuedIndex, queuedOptions)
    }
  }
}

function drainPendingDetailTabSwitch(options: { syncRemote?: boolean } = {}) {
  if (detailSwitching || loading.value) return
  const queuedIndex = pendingDetailTabIndex
  if (typeof queuedIndex !== "number") return
  const queuedOptions = pendingDetailTabOptions || options
  pendingDetailTabIndex = null
  pendingDetailTabOptions = null
  if (!shouldRunQueuedDetailTabSwitch(queuedIndex)) {
    syncDetailTabSelection(queuedIndex)
    return
  }
  void switchToDetailTab(queuedIndex, queuedOptions)
}

async function switchToDetailConversation(
  conversationIdValue: number,
  options: { syncRemote?: boolean } = {}
) {
  const index = findDetailShellTabIndex(conversationIdValue)
  if (index < 0) return
  await switchToDetailTab(index, options)
}

function reconcileDetailShellFromOpenedTabs(options: { loadConversation?: boolean } = {}) {
  if (!detailTabsHydrated.value) return
  if (detailShellTabs.value.length === 0) {
    detailTabsDebugLog("opened-tabs:reconcile-empty-shell", {
      loadConversation: options.loadConversation,
    })
    detailTabStateMap.clear()
    handleBackNavigation()
    return
  }
  // 当前已在某个会话时，若它仍存在于新的 tab 列表里，就固定停在当前会话，
  // 只更新选中态，绝不因远端（如桌面端新建会话）推送的 active 标志或列表顺序
  // 变化而自动切换、重载页面。跨设备的 opened-tabs 广播不应把用户正在看的会话
  // 挤走。只有当前会话不在列表中、或本地尚无当前会话时，才走 index 回退选择。
  const currentConversationId = Number(conversationId.value || 0)
  if (currentConversationId > 0) {
    const currentIndex = detailShellTabs.value.findIndex(
      (tab) => Number(tab.conversationId || 0) === currentConversationId
    )
    if (currentIndex >= 0) {
      syncDetailTabSelection(currentIndex)
      return
    }
    // 当前会话已不在新的 tab 列表里（例如桌面端停止/结束回合后把该会话移出它自己
    // 的 opened-tabs，跨设备同步过来）。事件驱动路径（opened-tabs 广播）绝不能因此
    // 自动切换到别的会话并 loadConversation —— 那正是“PC 点停止导致本端详情页意外
    // 刷新、tab 跳回第一个”的根因。此时保持当前视图不动，只有冷启动水合
    // （loadConversation === false，仅选中不重载）才允许走 index 回退选择。
    if (options.loadConversation !== false) {
      detailTabsDebugLog("opened-tabs:reconcile-routed-conversation-missing", {
        loadConversation: options.loadConversation,
      })
      return
    }
  }

  const nextIndex = resolveDetailActiveTabIndex({
    tabs: detailShellTabs.value,
    preferredConversationId: conversationId.value,
    currentIndex: activeDetailTabIndex.value,
  })
  syncDetailTabSelection(nextIndex)
  const nextTab = detailShellTabs.value[nextIndex]
  if (!nextTab) return
  if (options.loadConversation === false) {
    return
  }
  if (nextTab.conversationId !== conversationId.value && !loading.value) {
    void switchToDetailTab(nextIndex, { syncRemote: false })
  }
}

function ensureDetailOpenedTabsSubscription(instanceKey: string) {
  if (!detailTabsUsePcSync.value) return
  if (!instanceKey || detailOpenedTabsInstanceKey === instanceKey) return
  detailOpenedTabsUnsubscribe?.()
  detailOpenedTabsInstanceKey = instanceKey
  detailOpenedTabsUnsubscribe = acpApi.subscribeOpenedTabsChanged((payload) => {
    const snapshot = normalizeOpenedTabsChangedPayload(payload)
    if (!snapshot) {
      detailTabsDebugLog("opened-tabs:event-invalid", {
        instanceKey,
        payloadType: typeof payload,
      })
      return
    }
    detailTabsDebugLog("opened-tabs:event-received", {
      instanceKey,
      incomingVersion: snapshot.version,
      incomingOrigin: snapshot.origin,
      incomingConversationIds: getDetailOpenedTabConversationIds(snapshot.tabs),
    })
    applyOpenedTabsSnapshot(instanceKey, snapshot)
    applyDetailOpenedTabsState({
      instanceKey,
      version: snapshot.version,
      items: snapshot.tabs,
      origin: snapshot.origin,
      source: "opened-tabs-event",
    })
    void refreshDetailTabTitles(instanceKey, snapshot.tabs)
    reconcileDetailShellFromOpenedTabs()
  }, instanceKey)
}

function ensureDetailOverviewInvalidationSubscription(instanceKey: string) {
  if (!instanceKey || detailOverviewInstanceKey === instanceKey) return
  detailOverviewInvalidationUnsubscribe?.()
  detailOverviewInstanceKey = instanceKey
  detailOverviewInvalidationUnsubscribe = subscribeConversationOverviewInvalidation((changedKey) => {
    if (changedKey !== instanceKey) return
    void refreshDetailTabTitles(instanceKey).then(() => {
      const activeTab = detailShellTabs.value[activeDetailTabIndex.value]
      if (activeTab?.conversationId === conversationId.value) {
        syncConversationTitle(detailTabTitleMap.value[conversationId.value] || activeTab.title)
      }
    })
  })
}

async function initializeDetailTabsShell() {
  syncDetailTabMultitaskMode()
  if (!conversationId.value) return
  if (!detailTabsEnabled.value) {
    initializeSingleDetailTabShell()
    return
  }
  const instanceKey = resolveDetailInstanceKey()
  if (!instanceKey) return
  if (detailTabsUseMobileLocal.value) {
    await initializeMobileDetailTabsShell(instanceKey)
    return
  }
  ensureDetailOpenedTabsSubscription(instanceKey)
  ensureDetailOverviewInvalidationSubscription(instanceKey)
  void ensureGlobalConversationSync(instanceKey).catch((error) => {
    console.warn("ensure global conversation sync failed", error)
  })
  const cachedSnapshot = getOpenedTabsSnapshot(instanceKey)
  if (cachedSnapshot) {
    applyDetailOpenedTabsState({
      instanceKey,
      version: cachedSnapshot.version,
      items: cachedSnapshot.items,
      origin: "cache",
      source: "cache-hydration",
    })
    reconcileDetailShellFromOpenedTabs({ loadConversation: false })
    void refreshDetailTabTitles(instanceKey, cachedSnapshot.items)
  }
  try {
    const gateway = await getDetailGateway()
    const tabsRaw = await gateway.call<unknown>("list_opened_tabs")
    const snapshot = normalizeOpenedTabsResponse(instanceKey, tabsRaw)
    detailTabsDebugLog("opened-tabs:remote-hydration-received", {
      instanceKey,
      incomingVersion: snapshot.version,
      incomingConversationIds: getDetailOpenedTabConversationIds(snapshot.items),
    })
    applyDetailOpenedTabsState({
      instanceKey,
      version: snapshot.version,
      items: snapshot.items,
      origin: "server",
      source: "remote-hydration",
    })
    await refreshDetailTabTitles(instanceKey, snapshot.items)
    reconcileDetailShellFromOpenedTabs({ loadConversation: false })
  } catch (error) {
    console.warn("initialize detail tabs shell failed", error)
  }
}

function handleDetailTabChange(payload: unknown) {
  const nextIndex = resolveDetailTabChangeIndex(payload, detailShellTabs.value)
  if (nextIndex < 0) return
  markDetailTabMounted(nextIndex)
  if (nextIndex === activeDetailTabIndex.value) {
    if (detailSwiperCurrent.value !== nextIndex) {
      detailSwiperCurrent.value = nextIndex
    }
    return
  }
  void switchToDetailTab(nextIndex)
}

function handleDetailSwiperChange(event: any) {
  const nextIndex = Number(event?.detail?.current ?? -1)
  if (nextIndex < 0) return
  markDetailTabMounted(nextIndex)
  if (nextIndex === activeDetailTabIndex.value) {
    if (detailSwiperCurrent.value !== nextIndex) {
      detailSwiperCurrent.value = nextIndex
    }
    return
  }
  void switchToDetailTab(nextIndex)
}

async function handleCloseDetailTab(index: number) {
  const safeIndex = Number(index)
  const tab = detailShellTabs.value[safeIndex]
  if (!tab) return
  const isClosingActiveTab = safeIndex === activeDetailTabIndex.value
  const targetIndex = isClosingActiveTab
    ? resolveDetailTabCloseTarget(
      activeDetailTabIndex.value,
      safeIndex,
      detailShellTabs.value.length,
    )
    : -1
  const targetConversationId = isClosingActiveTab && targetIndex >= 0
    ? Number(detailShellTabs.value[targetIndex]?.conversationId || 0)
    : 0
  const instanceKey = resolveDetailInstanceKey()
  if (!instanceKey) return
  if (detailTabsUseMobileLocal.value) {
    const items = closeMobileDetailTab(instanceKey, tab.conversationId)
    applyDetailMobileTabsState(items)
    await refreshDetailTabTitles(instanceKey, items)
    if (targetConversationId > 0) {
      await switchToDetailConversation(targetConversationId)
      return
    }
    if (!isClosingActiveTab) {
      reconcileDetailShellFromOpenedTabs({ loadConversation: false })
      return
    }
    handleBackNavigation()
    return
  }
  if (!detailTabsUsePcSync.value) return
  try {
    const gateway = await getDetailGateway()
    const snapshot = await closeConversationTab({
      instanceKey,
      gateway,
      conversationId: tab.conversationId,
      origin: "mcode-mobile",
    })
    if (snapshot) {
      applyDetailOpenedTabsState({
        instanceKey,
        version: snapshot.version,
        items: snapshot.items,
        origin: "mcode-mobile",
      })
      await refreshDetailTabTitles(instanceKey, snapshot.items)
    }
    if (targetConversationId > 0) {
      await switchToDetailConversation(targetConversationId)
      return
    }
    if (!isClosingActiveTab) {
      reconcileDetailShellFromOpenedTabs({ loadConversation: false })
      return
    }
    handleBackNavigation()
  } catch (error) {
    uni.showToast({
      title: toErrorMessage(error, "关闭会话失败"),
      icon: "none",
    })
  }
}

onLoad((options: any) => {
  conversationId.value = Number(options.id || 0)
  folderId.value = Number(options.folderId || 0)
  needsResumeRefresh.value = false
  restoreCyberModePreference()
  const connectionId = typeof options.connectionId === "string"
    ? decodeURIComponent(options.connectionId)
    : ""
  const connectionKey = typeof options.connectionKey === "string"
    ? decodeURIComponent(options.connectionKey)
    : ""
  routeConnectionId.value = connectionId
  routeConnectionKey.value = connectionKey
  routeConnectionContext.value =
    findStoredConnectionById(connectionId) ||
    normalizeStoredConnectionLike(decodeConnectionContext(connectionKey))
  syncRouteAuthContext()
  applyDetailBackgroundFromStorage(conversationId.value)
  if (conversationId.value) {
    reloadDetailContent()
  }
  hasLoadedOnce.value = true
})

onShow(() => {
  restoreCyberModePreference()
  const tabModeChanged = syncDetailTabMultitaskMode()
  if (tabModeChanged && conversationId.value) {
    void initializeDetailTabsShell()
  }
  syncDetailNativeStatusBar()
  if (!hasLoadedOnce.value || !conversationId.value || loading.value) return
  if (!needsResumeRefresh.value) return
  needsResumeRefresh.value = false
  forceRemoteTurnReconcileOnLoad.value = true
  void initializeDetailTabsShell()
  syncDetailBridgeHealth()
  syncLongWaitState()
  syncRouteAuthContext()
  void loadDetailProjectEntries()
  void loadConversation().then(() => {
    resumeStuckPromptDetection()
  })
})

onHide(() => {
  teardownDetailBridgeHealth()
  clearLongWaitTimer()
  clearBridgeRecoveryTimer()
  clearCyberSettleTimer()
  clearStuckPromptTimer()
  captureActiveDetailLocalState()
  persistDetailRuntimeState()
  needsResumeRefresh.value = true
  if (conversationId.value) {
    markConversationListDirty()
  }
})

onUnload(() => {
  teardownDetailBridgeHealth()
  clearLongWaitTimer()
  clearBridgeRecoveryTimer()
  clearCyberSettleTimer()
  clearStuckPromptTimer()
  detailOpenedTabsUnsubscribe?.()
  detailOverviewInvalidationUnsubscribe?.()
  detailOpenedTabsUnsubscribe = null
  detailOverviewInvalidationUnsubscribe = null
  detailOpenedTabsInstanceKey = ""
  detailOverviewInstanceKey = ""
  persistDetailRuntimeState()
  if (conversationId.value) {
    markConversationListDirty()
    runtime.clearSession(conversationId.value)
  }
  currentInstance?.proxy?.upApplyNativeThemeUI?.()
})

function handleBackNavigation() {
  uni.switchTab({
    url: "/pages/conversations/index",
  })
}

function openDetailMoreMenu() {
  showDetailMoreMenu.value = true
}

function closeDetailMoreMenu() {
  showDetailMoreMenu.value = false
}

function handleDetailMoreMenuClick(action: string) {
  if (action === "模型供应商") {
    openDetailModelProvidersPage()
  } else if (action === "文件夹管理") {
    openDetailProjectsPage()
  } else if (action === "详情页主题") {
    openDetailThemePicker()
  } else if (action === "背景图自定义") {
    openDetailBackgroundPicker()
  } else if (action === "重命名") {
    renameCurrentDetailConversation()
  } else if (action === "更改状态") {
    openCurrentDetailConversationStatusPicker()
  } else if (action === "删除") {
    confirmDeleteCurrentDetailConversation()
  }
  closeDetailMoreMenu()
}

function openDetailModelProvidersPage() {
  const connectionId = resolveDetailConnectionRecordId()
  if (!connectionId) {
    uni.showToast({ title: "缺少连接信息，无法打开模型供应商", icon: "none" })
    return
  }
  uni.navigateTo({
    url: buildModelProvidersRoute({
      connectionId,
    }),
  })
}

function openDetailProjectsPage() {
  const connectionId = resolveDetailConnectionRecordId()
  if (!connectionId) {
    uni.showToast({ title: "缺少连接信息，无法打开项目列表", icon: "none" })
    return
  }
  uni.navigateTo({
    url: `/pages/projects/index?connectionId=${encodeURIComponent(connectionId)}`,
  })
}

function openDetailBackgroundPicker() {
  const actionItems = detailBackgroundImageUrl.value
    ? ["选择背景图", "清除背景图"]
    : ["选择背景图"]
  uni.showActionSheet({
    itemList: actionItems,
    success: (result) => {
      if (result.tapIndex === 0) {
        chooseConversationDetailBackgroundImage()
        return
      }
      if (result.tapIndex === 1) {
        clearConversationDetailBackgroundImage(true)
      }
    },
  })
}

function openDetailThemePicker() {
  const actions = buildDetailThemeMenuActions(detailTheme.value)
  uni.showActionSheet({
    itemList: actions.map((item) => item.name),
    success: (result) => {
      const target = actions[result.tapIndex]
      if (!target || target.id === detailTheme.value) return
      persistDetailThemePreference(target.id)
      uni.showToast({
        title: `${target.name.replace(" · 当前", "")}已启用`,
        icon: "none",
      })
    },
  })
}

function renameCurrentDetailConversation() {
  const targetConversationId = Number(conversationId.value || 0)
  if (!targetConversationId) return
  const previousTitle = conversationTitle.value || "未命名会话"
  uni.showModal({
    title: "重命名会话",
    editable: true,
    placeholderText: previousTitle,
    success: (result) => {
      if (!result.confirm) return
      const nextTitle = String(result.content || "").trim()
      if (!nextTitle || nextTitle === previousTitle) return
      void updateCurrentDetailConversationTitle(targetConversationId, nextTitle)
    },
  })
}

async function updateCurrentDetailConversationTitle(targetConversationId: number, title: string) {
  try {
    const gateway = await getDetailGateway()
    await gateway.call("update_conversation_title", {
      conversationId: targetConversationId,
      title,
    })
    if (Number(conversationId.value || 0) === targetConversationId) {
      syncConversationTitle(title)
    } else {
      detailTabTitleMap.value = {
        ...detailTabTitleMap.value,
        [targetConversationId]: title,
      }
    }
    markConversationListDirty()
    uni.showToast({ title: "重命名成功", icon: "success" })
  } catch (error) {
    uni.showToast({
      title: toErrorMessage(error, "重命名失败"),
      icon: "none",
    })
  }
}

function openCurrentDetailConversationStatusPicker() {
  const targetConversationId = Number(conversationId.value || 0)
  if (!targetConversationId) return
  uni.showActionSheet({
    itemList: DETAIL_CONVERSATION_STATUS_ACTIONS.map((item) => item.label),
    success: (result) => {
      const option = DETAIL_CONVERSATION_STATUS_ACTIONS[Number(result.tapIndex)]
      if (!option) return
      void updateCurrentDetailConversationStatus(targetConversationId, option.status, option.label)
    },
  })
}

async function updateCurrentDetailConversationStatus(
  targetConversationId: number,
  status: string,
  label: string
) {
  try {
    const gateway = await getDetailGateway()
    await gateway.call("update_conversation_status", {
      conversationId: targetConversationId,
      status,
    })
    const instanceKey = resolveDetailInstanceKey()
    if (instanceKey) {
      void patchConversationSummaryStatus({
        instanceKey,
        conversationId: targetConversationId,
        status,
      }).catch((error) => {
        console.warn("patch detail conversation status skipped", error)
      })
    }
    markConversationListDirty()
    uni.showToast({ title: `已标记为${label}`, icon: "success" })
  } catch (error) {
    uni.showToast({
      title: toErrorMessage(error, "状态更新失败"),
      icon: "none",
    })
  }
}

function confirmDeleteCurrentDetailConversation() {
  const tab = detailShellTabs.value[activeDetailTabIndex.value]
  const targetConversationId = Number(tab?.conversationId || conversationId.value || 0)
  if (!targetConversationId) return
  const title = detailTabTitleMap.value[targetConversationId] || conversationTitle.value || "当前会话"
  uni.showModal({
    title: "确认删除",
    content: `确定要删除「${title}」吗？此操作不可恢复。`,
    confirmText: "删除",
    confirmColor: "#fa3534",
    success: (result) => {
      if (!result.confirm) return
      void deleteCurrentDetailConversation(targetConversationId)
    },
  })
}

async function deleteCurrentDetailConversation(targetConversationId: number) {
  const instanceKey = resolveDetailInstanceKey()
  if (!instanceKey) return
  const closingIndex = findDetailShellTabIndex(targetConversationId)
  const safeClosingIndex = closingIndex >= 0 ? closingIndex : activeDetailTabIndex.value
  const targetIndex = resolveDetailTabCloseTarget(
    activeDetailTabIndex.value,
    safeClosingIndex,
    detailShellTabs.value.length,
  )
  const targetTab = targetIndex >= 0 ? detailShellTabs.value[targetIndex] : null
  try {
    const gateway = await getDetailGateway()
    await gateway.call("delete_conversation", {
      conversationId: targetConversationId,
    })
    await markConversationSummaryDeleted({
      instanceKey,
      conversationId: targetConversationId,
    }).catch((error) => {
      console.warn("mark detail conversation deleted skipped", error)
    })
    runtime.clearSession(targetConversationId)
    detailTabStateMap.delete(targetConversationId)
    detailAttachedAtMap.delete(targetConversationId)
    const snapshot = await closeConversationTab({
      instanceKey,
      gateway,
      conversationId: targetConversationId,
      origin: "mcode-mobile",
    })
    if (snapshot) {
      applyDetailOpenedTabsState({
        instanceKey,
        version: snapshot.version,
        items: snapshot.items,
        origin: "mcode-mobile",
      })
      await refreshDetailTabTitles(instanceKey, snapshot.items)
    }
    markConversationListDirty()
    uni.showToast({ title: "删除成功", icon: "success" })
    if (targetTab?.conversationId) {
      await switchToDetailConversation(targetTab.conversationId, { syncRemote: false })
      return
    }
    handleBackNavigation()
  } catch (error) {
    uni.showToast({
      title: toErrorMessage(error, "删除失败"),
      icon: "none",
    })
  }
}

function syncDetailBridgeHealth() {
  teardownDetailBridgeHealth()
  const instanceKey = resolveDetailInstanceKey()
  if (!instanceKey) {
    bridgeHealth.value = null
    return
  }
  bridgeHealth.value = acpApi.getRealtimeBridgeHealth(instanceKey)
  detailBridgeHealthUnsubscribe = acpApi.subscribeRealtimeBridgeHealth((health) => {
    const previousState = bridgeHealth.value?.state
    bridgeHealth.value = health
    if (
      health.state === "connected" &&
      previousState &&
      previousState !== "connected" &&
      previousState !== "idle"
    ) {
      markBridgeRecovered()
    }
  }, instanceKey)
}

function teardownDetailBridgeHealth() {
  detailBridgeHealthUnsubscribe?.()
  detailBridgeHealthUnsubscribe = null
}

function syncLongWaitState() {
  const shouldTrack =
    runtimeStatus.value === "thinking" ||
    runtimeStatus.value === "running_tool" ||
    runtimeStatus.value === "connecting"
  if (!shouldTrack) {
    longWaitStartedAt.value = 0
    clearLongWaitTimer()
    return
  }
  if (!longWaitStartedAt.value) {
    longWaitStartedAt.value = Date.now()
  }
  if (longWaitTimer) return
  longWaitTimer = setInterval(() => {
    longWaitTick.value = Date.now()
  }, 1000)
}

function clearLongWaitTimer() {
  if (!longWaitTimer) return
  clearInterval(longWaitTimer)
  longWaitTimer = null
}

function markBridgeRecovered() {
  bridgeRecoveredAt.value = Date.now()
  clearBridgeRecoveryTimer()
  bridgeRecoveryTimer = setTimeout(() => {
    bridgeRecoveredAt.value = 0
    bridgeRecoveryTimer = null
  }, 3000)
}

function clearBridgeRecoveryTimer() {
  if (!bridgeRecoveryTimer) return
  clearTimeout(bridgeRecoveryTimer)
  bridgeRecoveryTimer = null
}

function clearCyberSettleTimer() {
  if (!cyberSettleTimer) return
  clearTimeout(cyberSettleTimer)
  cyberSettleTimer = null
}

function handleDetailStatusAction(actionKey?: "reconnect" | "reconnect_agent" | "inspect") {
  if (!actionKey) return
  if (actionKey === "reconnect") {
    const instanceKey = resolveDetailInstanceKey()
    if (!instanceKey) return
    void acpApi.reconnectRealtimeBridge(instanceKey).catch((error) => {
      uni.showToast({
        title: toErrorMessage(error, "重连失败"),
        icon: "none",
        duration: 2500,
      })
    })
    return
  }
  if (actionKey === "reconnect_agent") {
    void reconnectDetailAgent()
    return
  }
  if (actionKey === "inspect") {
    if (planTasks.value.length > 0) {
      showPlanDrawer.value = true
      return
    }
    handleScrollToBottomFab()
  }
}

/**
 * 重新拉起 ACP agent 连接。
 *
 * 与 `acpApi.reconnectRealtimeBridge`（重连手机↔主机的 WebSocket）是**两件不同的事**：
 * agent 进程死了的时候传输通道好得很，重连它没有任何用。这里要做的是让那条已死的
 * ACP 连接失效、再重新建立。
 *
 * `runtime.connect` 会复用已有 connectionId（`conversationRuntime.ts` 里
 * `existingManaged?.connectionId` 那个分支），所以**必须先 `invalidateConnection`** ——
 * 否则它会原样返回那条死连接，界面看起来点了没反应。
 */
async function reconnectDetailAgent() {
  const targetConversationId = Number(conversationId.value || 0)
  if (!targetConversationId) return
  if (reconnectingDetailAgent.value) return

  reconnectingDetailAgent.value = true
  try {
    runtime.invalidateConnection(targetConversationId)
    await runtime.connect(
      targetConversationId,
      normalizeAgentType(currentAgentType.value),
      undefined,
      firstString(session.value?.resumeSessionId) || undefined,
      undefined,
      resolveDetailInstanceKey()
    )
    // 重连后立刻取一次快照：状态、pending 卡片、AIR 失败表都要重新对齐 ——
    // 新连接不会重播断连前的事件。
    const snapshot = await acpApi
      .acpGetSessionSnapshotByConversation(targetConversationId)
      .catch(() => null)
    if (snapshot) {
      hydrateDetailSnapshot(targetConversationId, snapshot)
    }
  } catch (error) {
    uni.showToast({
      title: toErrorMessage(error, "重新连接智能体失败"),
      icon: "none",
      duration: 2500,
    })
  } finally {
    reconnectingDetailAgent.value = false
  }
}

onBackPress(() => {
  handleBackNavigation()
  return true
})

watch(
  () => renderMessageItems.value.map((item) => ({
    id: item.anchorId,
    role: item.message.role,
    status: item.message.status,
    content: JSON.stringify(item.message.content || []),
  })),
  (nextMessages, prevMessages) => {
    if (loading.value || !hasInitialBottomScroll.value || isRestoringScroll.value) return
    const latest = nextMessages[nextMessages.length - 1]
    const previousLatest = prevMessages?.[prevMessages.length - 1]
    const hasAssistantDelta =
      latest?.role === "assistant" &&
      (!!latest?.content && latest.content !== previousLatest?.content || latest?.id !== previousLatest?.id)

    if (!shouldAutoFollowBottom.value && hasAssistantDelta) {
      hasUnreadBelow.value = true
    }
    scheduleViewportSync()
  }
)

watch(
  () => runtimeStatus.value,
  () => {
    syncLongWaitState()
  }
)

watch(
  () => detailConnectionKey.value,
  (_, prev) => {
    void initializeDetailTabsShell()
    if (prev !== undefined) {
      syncDetailBridgeHealth()
    } else {
      nextTick(() => syncDetailBridgeHealth())
    }
  },
  { immediate: true }
)

watch(
  () => detailShellTabs.value.map((tab) => Number(tab.conversationId || 0)).join(","),
  () => {
    if (detailShellTabs.value.length === 0) return
    // 优先固定在当前会话所在的 tab；只有当前会话不在列表里（或本地尚无当前会话）
    // 时才走 index 回退。这样远端（如 PC 停止后把会话移出其 opened-tabs）导致的
    // 列表顺序/成员变化不会把选中态挤到别的 tab。
    const currentConversationId = Number(conversationId.value || 0)
    const currentIndex =
      currentConversationId > 0
        ? detailShellTabs.value.findIndex(
            (tab) => Number(tab.conversationId || 0) === currentConversationId
          )
        : -1
    if (currentConversationId > 0 && currentIndex < 0) {
      // 当前会话已不在列表中：保持现有选中态不动，不因远端变化跳 tab。
      detailTabsDebugLog("opened-tabs:watch-routed-conversation-missing")
      ensureMountedDetailTabRuntimes()
      return
    }
    const safeIndex =
      currentIndex >= 0
        ? currentIndex
        : resolveDetailActiveTabIndex({
            tabs: detailShellTabs.value,
            preferredConversationId: conversationId.value,
            currentIndex: activeDetailTabIndex.value,
          })
    syncDetailTabSelection(safeIndex)
    ensureMountedDetailTabRuntimes()
  },
  { immediate: true }
)

watch(
  () => Array.from(mountedDetailConversationIds.value).sort((left, right) => left - right).join(","),
  () => {
    ensureMountedDetailTabRuntimes()
  },
)

watch(
  () => pendingQuestionCard.value?.question_id || "",
  () => {
    resetQuestionSelections()
    if (!hasInitialBottomScroll.value) return
    scheduleViewportSync()
  }
)

watch(
  () => conversationId.value,
  (nextConversationId, prevConversationId) => {
    if (Number(nextConversationId || 0) === Number(prevConversationId || 0)) return
    applyDetailBackgroundFromStorage(nextConversationId)
  }
)

watch(
  () => [runtimeStatus.value, conversationActivitySignature.value, session.value?.connectionId || ""] as const,
  ([status, signature], prev) => {
    if (prev) {
      handleLiveActivityChange(status, signature)
    } else {
      nextTick(() => handleLiveActivityChange(status, signature))
    }
  },
  { immediate: true }
)

// composer 高度变化引起的视口同步现在由 pane 自己处理（它 emit `layout-change`）。
// 这里只留仍归详情页所有的那几项 —— pending 卡片与问题作答会改变 pane 上方的高度。
watch(
  () => [
    pendingPermissionCard.value?.id || "",
    pendingQuestionCard.value?.question_id || "",
    JSON.stringify(askQuestionSelections.value),
  ],
  () => {
    if (!hasInitialBottomScroll.value) return
    scheduleViewportSync()
  }
)

function syncRouteAuthContext() {
  if (routeConnectionContext.value) {
    syncAuthByStoredConnection(routeConnectionContext.value)
    return
  }
  if (routeConnectionKey.value) {
    syncAuthByConnectionKey(routeConnectionKey.value)
  }
}

async function hydrateLocalConversationState(input: {
  instanceKey: string
  conversationId: number
  hasHotRuntime: boolean
}) {
  let localSummary: Awaited<ReturnType<typeof getConversationSummaryById>> | null = null
  let persistedRuntime: ConversationRuntimeRecord | null = null
  let localTurns: PersistedTurnWithParts[] = []
  try {
    await ensureConversationSchema()
    localSummary = await getConversationSummaryById(input.instanceKey, input.conversationId)
    if (isCurrentDetailTarget(input)) {
      syncConversationTitle(localSummary?.title)
    } else if (localSummary?.title) {
      detailTabTitleMap.value = {
        ...detailTabTitleMap.value,
        [input.conversationId]: localSummary.title,
      }
    }
    persistedRuntime = await getRuntime(input.instanceKey, input.conversationId)
    // `readLocalTurnCacheEnabled()` 关闭（默认）时不读轮次 —— 摘要与 runtime
    // （标题、草稿、断点）照旧读，那两张表不受这个开关约束。
    if (!input.hasHotRuntime && readLocalTurnCacheEnabled()) {
      localTurns = await getNewestTurns(
        input.conversationId,
        DEFAULT_CONVERSATION_HISTORY_PAGE_SIZE
      )
    }
  } catch (error) {
    console.warn("local conversation hydrate skipped", error)
  }
  return {
    localSummary,
    persistedRuntime,
    localTurns,
  }
}

function getRemoteConversationSummary(detail: any): Record<string, any> {
  return detail?.summary && typeof detail.summary === "object" ? detail.summary : {}
}

function getRemoteConversationMetadata(
  detail: any,
  fallbackAgentType?: string,
  fallbackSessionId?: string
) {
  const summary = getRemoteConversationSummary(detail)
  return {
    agentType:
      firstString(detail?.agentType, detail?.agent_type, summary?.agent_type) ||
      fallbackAgentType ||
      "claude_code",
    resumeSessionId:
      firstString(detail?.sessionId, detail?.session_id, summary?.external_id) ||
      fallbackSessionId,
    title: firstString(summary?.title, detail?.title),
  }
}

async function fetchRemoteConversationDetail(targetConversationId = conversationId.value) {
  const gateway = await getDetailGateway({ refreshAuth: true })
  return await gateway.call<any>(
    "get_folder_conversation",
    buildTailHistoryRequest(targetConversationId)
  )
}

async function fetchRemoteConversationDetailById(targetConversationId: number) {
  const gateway = await getDetailGateway({ refreshAuth: true })
  return await gateway.call<any>(
    "get_folder_conversation",
    buildTailHistoryRequest(targetConversationId)
  )
}

async function applyRemoteHistoryWindowDetail(input: {
  instanceKey: string
  conversationId: number
  folderId: number
  detail: any
  runtimeSession: ReturnType<typeof runtime.getOrCreateSession>
}) {
  const historyWindow = requireConversationHistoryWindow(input.detail)
  applyRemoteDetailStats(input.detail, input.conversationId)

  const preserveRuntimeTurns =
    hasInFlightConversationDetail(input.detail) ||
    hasVolatileRuntimeState(input.runtimeSession) ||
    Boolean(input.runtimeSession.inFlightUserTurnId)

  if (preserveRuntimeTurns) {
    // 轮次不动，窗口坐标也不能动 —— 两者必须成对。旧窗口仍精确描述 localTurns[0]，
    // 换成尾窗那一组会把「翻了多远」打回一页，「加载更早」随后会连着几次拉回内存里
    // 已有的轮次（全被去重掉），看起来就像按钮失灵。只允许刷新 turns_total。
    runtime.setConversationHistoryWindow(
      input.conversationId,
      resolvePreservedTurnsWindow(input.runtimeSession.historyWindow, historyWindow)
    )
  } else {
    // 已翻页出来的前缀要尽量保住：远端只回 30 条尾窗，整体赋值会把用户翻到的 200 条
    // 静默砍回一页。但「保住前缀」和「沿用旧窗口坐标」必须是同一个决定 ——
    // 窗口浅而时间线深会让下一次「加载更早」把已有轮次搬到列表头部，时间线错乱且
    // 那个空洞不可恢复（没有请求能填上前缀结尾到尾窗起点之间那段）。
    const remoteTail = normalizeTurns(input.detail?.turns)
    const merged = mergeTailIntoTurnsWithSeam(input.runtimeSession.localTurns, remoteTail)
    const keepPrefix = canKeepPreviousTailWindow(
      input.runtimeSession.historyWindow,
      historyWindow,
      merged.seamIndex
    )
    // 接缝证明不了连续性时宁可丢掉前缀：用户往上滑还能重新翻回来，而错位的时间线
    // 不报错也修不回来。
    input.runtimeSession.localTurns = keepPrefix ? merged.turns : remoteTail
    runtime.setConversationHistoryWindow(
      input.conversationId,
      resolveRefreshedTailWindow(
        input.runtimeSession.historyWindow,
        historyWindow,
        merged.seamIndex
      )
    )
  }

  try {
    await persistConversationDetailSnapshot({
      instanceKey: input.instanceKey,
      conversationId: input.conversationId,
      detail: input.detail,
      fallbackFolderId: input.folderId,
      persistTurns: !preserveRuntimeTurns,
    })
  } catch (error) {
    detailDebugLog("history-window-persist-failed", {
      conversationId: input.conversationId,
      message: toErrorMessage(error),
    })
    console.warn("persist remote history window skipped", error)
  }

  return historyWindow
}

/**
 * 确保 `session.historyWindow` 存在 —— 不存在就拉一次尾窗把它建起来。
 *
 * 为什么需要这个：`historyWindow` 是「能否往上翻页」的**唯一**依据
 * （`hasOlderConversationHistory` 只看 `turns_offset > 0`），但建立它的路径只有
 * `applyRemoteHistoryWindowDetail`，而 `loadConversation` 三条分支里只有冷启动那条
 * 会 await 它。列表页的实时预览会**预连接**会话（`conversations/index.vue` 的
 * `runLivePreviewAttach` → `runtime.connect`），realtime 事件把 `localTurns` 填出内容，
 * 于是 `hasRenderableRuntimeState` 为真、走热运行时分支；而该分支只在
 * `shouldForceRemoteTurnReconcile` 时才对账（首次进入恒为 false）。
 * 结果：**时间线有内容、窗口是 null，「加载更早」永远不动，指示器还显示
 * 「没有更多历史了」**。这就是用户报的「无法下拉加载分页的历史消息」。
 *
 * 而且这是个**自锁**：没窗口 → `loadOlderTurns` 在入口就返回 → 永远建不起窗口。
 * 所以必须由详情页主动探测，不能等翻页手势。
 *
 * 关键约束：**这条路径绝不能覆盖 `localTurns`。** 走到这里意味着内存里可能正有
 * 流式内容/待回答卡片，整体赋值会把它们抹掉。所以只取窗口三元组，轮次交给
 * `applyRemoteHistoryWindowDetail` 自己的保留逻辑处理。
 */
async function ensureConversationHistoryWindow(input: {
  conversationId: number
  folderId: number
  instanceKey: string
  runtimeSession: ReturnType<typeof runtime.getOrCreateSession>
}) {
  if (!input.conversationId) return
  if (input.runtimeSession.historyWindow) return
  // 轮次被保留期间建不出窗口：窗口的语义是「localTurns[0] 的全局下标」，而流式中
  // 我们不知道 localTurns[0] 落在哪 —— 硬记一个尾窗坐标会造成不可恢复的错位
  // （见 resolvePreservedTurnsWindow 的注释）。等流式结束后由 watcher 再探测。
  if (hasVolatileRuntimeState(input.runtimeSession)) return
  if (historyWindowProbeConversationIds.has(input.conversationId)) return

  historyWindowProbeConversationIds.add(input.conversationId)
  try {
    const detail = await fetchRemoteConversationDetail(input.conversationId)
    // 期间可能已经切走 / 被别的路径建好了窗口，别覆盖后者的结果。
    const session = runtime.getOrCreateSession(input.conversationId)
    if (session !== input.runtimeSession || session.historyWindow) return
    await applyRemoteHistoryWindowDetail({
      instanceKey: input.instanceKey,
      conversationId: input.conversationId,
      folderId: input.folderId,
      detail,
      runtimeSession: input.runtimeSession,
    })
    detailDebugLog("history-window-probe", summarizeDetailTurns(detail))
  } catch (error) {
    // 探测失败不影响已渲染的内容，下一次 loadConversation / 下拉刷新会再试。
    detailDebugLog("history-window-probe-failed", {
      conversationId: input.conversationId,
      message: toErrorMessage(error),
    })
    console.warn("ensure conversation history window skipped", error)
  } finally {
    historyWindowProbeConversationIds.delete(input.conversationId)
  }
}

/**
 * 窗口探测的自愈 watcher：流式结束 / in-flight 用户轮次落地后补一次探测。
 *
 * 覆盖三个「窗口停留在 null」的洞：
 * 1. 热运行时分支进来时正在流式 —— `ensureConversationHistoryWindow` 当场因
 *    `hasVolatileRuntimeState` 返回，要等这里补。
 * 2. `reconcileRemoteTurnsAfterLocalHydrate` 因 `inFlightUserTurnId` 早退
 *    （`hasRenderableRuntimeState` 不看这个字段、`hasVolatileRuntimeState` 看，
 *    两个谓词的字段集不一致造成的缝隙），原先没有任何补救路径。
 * 3. 上一次探测网络失败。
 *
 * 只管当前激活的会话：窗口只在用户看得见的那个 tab 里才有意义，
 * 后台 tab 等它自己被激活时再探测。
 */
watch(
  () => {
    const targetConversationId = Number(conversationId.value || 0)
    const runtimeSession = targetConversationId
      ? runtime.sessions.get(targetConversationId)
      : null
    return [
      targetConversationId,
      Boolean(runtimeSession?.historyWindow),
      hasVolatileRuntimeState(runtimeSession),
      Number(runtimeSession?.localTurns?.length || 0) > 0,
    ] as const
  },
  ([targetConversationId, hasWindow, volatile, hasTurns]) => {
    if (!targetConversationId || hasWindow || volatile || !hasTurns) return
    if (loading.value) return
    const runtimeSession = runtime.getOrCreateSession(targetConversationId)
    void ensureConversationHistoryWindow({
      conversationId: targetConversationId,
      folderId: Number(folderId.value || 0),
      instanceKey: resolveDetailInstanceKey(),
      runtimeSession,
    })
  }
)

async function hydrateRemoteConversationMetadata(input: {
  managed: ReturnType<typeof connectionSessionManager.getByConversationId>
  instanceKey: string
  conversationId: number
  folderId: number
  agentType: string
  resumeSessionId?: string
  remoteDetail: any
}) {
  if (input.managed || input.resumeSessionId || input.remoteDetail) return input
  try {
    const remoteDetail = await fetchRemoteConversationDetail(input.conversationId)
    applyRemoteDetailStats(remoteDetail, input.conversationId)
    const metadata = getRemoteConversationMetadata(
      remoteDetail,
      input.agentType,
      input.resumeSessionId
    )
    if (isCurrentDetailTarget(input)) {
      currentAgentType.value = normalizeAgentType(metadata.agentType)
      syncConversationTitle(metadata.title)
    } else if (metadata.title) {
      detailTabTitleMap.value = {
        ...detailTabTitleMap.value,
        [input.conversationId]: metadata.title,
      }
    }
    await persistConversationDetailSnapshot({
      instanceKey: input.instanceKey,
      conversationId: input.conversationId,
      detail: remoteDetail,
      fallbackFolderId: input.folderId,
      persistTurns: false,
    })
    return {
      ...input,
      remoteDetail,
      agentType: metadata.agentType,
      resumeSessionId: metadata.resumeSessionId,
    }
  } catch (error) {
    console.warn("remote conversation metadata hydrate skipped", error)
    return input
  }
}

async function loadLiveConversationSnapshot(targetConversationId: number, connectionId?: string) {
  let snapshot: any = null
  let snapshotFromConversation = false
  try {
    snapshot = await acpApi.acpGetSessionSnapshotByConversation(targetConversationId)
    snapshotFromConversation = Boolean(snapshot)
  } catch (error) {
    console.warn("acp_get_session_snapshot_by_conversation failed", error)
  }
  if (!snapshot && connectionId) {
    try {
      snapshot = await acpApi.acpGetSessionSnapshot(connectionId)
    } catch (error) {
      console.warn("acp_get_session_snapshot failed", error)
    }
  }
  return {
    snapshot,
    snapshotFromConversation,
  }
}

async function persistLiveSnapshotMetadata(input: {
  instanceKey: string
  conversationId: number
  folderId: number
  snapshot: any
  snapshotFromConversation: boolean
  resumeSessionId?: string
  managedExternalId?: string | null
  agentType: string
  connectionId?: string
}) {
  const snapshotSessionId = firstString(input.snapshot.external_id, input.snapshot.externalId)
  const trustSnapshotMetadata =
    Boolean(input.snapshotFromConversation) ||
    Boolean(input.resumeSessionId) ||
    Boolean(input.managedExternalId)
  if (!snapshotSessionId || !trustSnapshotMetadata) return
  try {
    await persistConversationDetailSnapshot({
      instanceKey: input.instanceKey,
      conversationId: input.conversationId,
      detail: {
        session_id: snapshotSessionId,
        agent_type: input.agentType,
        summary: {
          external_id: snapshotSessionId,
          agent_type: input.agentType,
        },
      },
      fallbackFolderId: input.folderId,
      fallbackConnectionId: input.connectionId,
      persistTurns: false,
    })
  } catch (error) {
    console.warn("persist live snapshot metadata skipped", error)
  }
}

function hydrateSlashCommandsFromSnapshot(snapshot: any) {
  slashCommands.value = normalizeSlashCommandsFromSnapshot(snapshot)
}

async function loadConversation() {
  syncRouteAuthContext()
  const targetConversationId = Number(conversationId.value || 0)
  const targetFolderId = Number(folderId.value || 0)
  if (!targetConversationId) return
  if (preparingDetailContentConversationId.value === targetConversationId) {
    preparingDetailContentConversationId.value = 0
  }
  detailLoadError.value = null
  const loadToken = ++detailLoadSequence
  const instanceKey = resolveDetailInstanceKey()
  const isActiveLoad = () =>
    loadToken === detailLoadSequence &&
    isCurrentDetailTarget({
      conversationId: targetConversationId,
      folderId: targetFolderId,
      instanceKey,
    })
  loading.value = true
  isRestoringScroll.value = false
  restoredInitialScroll.value = false
  const cachedViewState = cacheStore.restore(targetConversationId)
  let persistedRuntime: ConversationRuntimeRecord | null = null
  let initialLoadFinished = false
  const finishInitialLoad = (
    cachedViewState: ReturnType<typeof cacheStore.restore>,
    persistedRuntime: ConversationRuntimeRecord | null
  ) => {
    if (initialLoadFinished) return
    initialLoadFinished = true
    if (loadToken === detailLoadSequence) {
      loading.value = false
    }
    if (!isActiveLoad()) return
    nextTick(() => {
      if (!isActiveLoad()) return
      measureMessageListHeight()
      restoreScrollState(cachedViewState, persistedRuntime)
      hasInitialBottomScroll.value = true
    })
  }
  try {
    const runtimeSession = runtime.getOrCreateSession(targetConversationId)
    const managed = connectionSessionManager.getByConversationId(targetConversationId)
    const hasHotRuntime = hasRenderableRuntimeState(runtimeSession)

    const localState = await hydrateLocalConversationState({
      instanceKey,
      conversationId: targetConversationId,
      hasHotRuntime,
    })
    const localSummary = localState.localSummary
    persistedRuntime = localState.persistedRuntime
    const localTurns = localState.localTurns

    const shouldForceRemoteTurnReconcile =
      forceRemoteTurnReconcileOnLoad.value ||
      shouldReconcileTurnsFromPersistedRuntime(persistedRuntime)

    let agentType =
      firstString(managed?.connection.agentType, localSummary?.agentType) || "claude_code"
    let resumeSessionId =
      firstString(managed?.externalId, managed?.connection.sessionId, localSummary?.externalId)
    let remoteDetail: any = null
    if (isActiveLoad()) {
      currentAgentType.value = normalizeAgentType(agentType)
    }

    const hydrateRemoteMetadata = async () => {
      const hydrated = await hydrateRemoteConversationMetadata({
        managed,
        instanceKey,
        conversationId: targetConversationId,
        folderId: targetFolderId,
        agentType,
        resumeSessionId,
        remoteDetail,
      })
      agentType = hydrated.agentType
      resumeSessionId = hydrated.resumeSessionId
      remoteDetail = hydrated.remoteDetail
    }

    if (hasHotRuntime) {
      finishInitialLoad(cachedViewState, persistedRuntime)
      if (shouldForceRemoteTurnReconcile) {
        void reconcileRemoteTurnsAfterResume({
          conversationId: targetConversationId,
          folderId: targetFolderId,
          instanceKey,
          runtimeSession,
        })
      } else {
        // 热运行时分支不做对账，于是**没有任何代码**会建立 historyWindow ——
        // 列表页实时预览预热过的会话正是走这里进来的。补一次窗口探测，
        // 否则「加载更早」永远不动（详见 ensureConversationHistoryWindow）。
        void ensureConversationHistoryWindow({
          conversationId: targetConversationId,
          folderId: targetFolderId,
          instanceKey,
          runtimeSession,
        })
      }
    } else if (localTurns.length > 0) {
      runtimeSession.localTurns = localTurns
        .slice()
        .reverse()
        .map(mapPersistedTurnToMessage)
      finishInitialLoad(cachedViewState, persistedRuntime)
      void reconcileRemoteTurnsAfterLocalHydrate({
        conversationId: targetConversationId,
        folderId: targetFolderId,
        instanceKey,
        runtimeSession,
      })
    } else {
      await hydrateRemoteMetadata()
      const result = remoteDetail || await fetchRemoteConversationDetail(targetConversationId)
      await applyRemoteHistoryWindowDetail({
        instanceKey,
        conversationId: targetConversationId,
        folderId: targetFolderId,
        detail: result,
        runtimeSession,
      })
      const metadata = getRemoteConversationMetadata(result)
      if (isActiveLoad()) {
        syncConversationTitle(metadata.title)
      } else if (metadata.title) {
        detailTabTitleMap.value = {
          ...detailTabTitleMap.value,
          [targetConversationId]: metadata.title,
        }
      }
      agentType = metadata.agentType
      resumeSessionId = metadata.resumeSessionId
      if (isActiveLoad()) {
        currentAgentType.value = normalizeAgentType(agentType)
      }
      finishInitialLoad(cachedViewState, persistedRuntime)
    }

    if (localTurns.length === 0 && !hasHotRuntime) {
      await hydrateRemoteMetadata()
    }
    const conn = await runtime.connect(
      targetConversationId,
      agentType,
      undefined,
      resumeSessionId,
      persistedRuntime?.lastAppliedSeq ?? runtimeSession.lastAppliedSeq ?? undefined,
      instanceKey
    )
    if (isActiveLoad()) {
      persistDetailRuntimeState()
    }

    const { snapshot, snapshotFromConversation } = await loadLiveConversationSnapshot(targetConversationId, conn.id)
    if (snapshot) {
      await persistLiveSnapshotMetadata({
        instanceKey,
        conversationId: targetConversationId,
        folderId: targetFolderId,
        snapshot,
        snapshotFromConversation,
        resumeSessionId,
        managedExternalId: managed?.externalId,
        agentType,
        connectionId: conn.id,
      })
      hydrateDetailSnapshot(targetConversationId, snapshot)
      if (isActiveLoad()) {
        persistDetailRuntimeState()
      }
    }
    if (isActiveLoad()) {
      // agent 配置面板（模型/推理强度/权限）现在整套在 pane 里，这里只保留 `/` 命令表 ——
      // 它通过 `:slash-commands` 传给 pane，仍归详情页所有。
      hydrateSlashCommandsFromSnapshot(snapshot)
    }

  } catch (error) {
    if (isActiveLoad()) {
      const message = toErrorMessage(error, "加载会话失败，请重新加载")
      detailLoadError.value = {
        conversationId: targetConversationId,
        message,
      }
      uni.showToast({ title: `加载失败: ${message}`, icon: "none", duration: 3000 })
    }
  } finally {
    if (loadToken === detailLoadSequence) {
      forceRemoteTurnReconcileOnLoad.value = false
    }
    finishInitialLoad(cachedViewState, persistedRuntime)
    if (loadToken === detailLoadSequence) {
      drainPendingDetailTabSwitch({ syncRemote: false })
    }
  }
}

function reloadDetailContent() {
  const targetConversationId = Number(conversationId.value || 0)
  if (!targetConversationId || loading.value) return
  preparingDetailContentConversationId.value = targetConversationId
  void initializeDetailTabsShell().finally(() => {
    void loadDetailProjectEntries()
    void loadConversation()
  })
}

function syncConversationTitle(title?: string | null) {
  conversationTitle.value = firstString(title) || "未命名会话"
  if (conversationId.value) {
    detailTabTitleMap.value = {
      ...detailTabTitleMap.value,
      [conversationId.value]: conversationTitle.value,
    }
  }
  uni.setNavigationBarTitle({
    title: conversationTitle.value,
  })
}

function refreshConversation() {
  if (!conversationId.value || loading.value) return
  if (registerRefreshTap()) return
  loadConversation()
    .then(() => {
      uni.showToast({ title: "会话已刷新", icon: "none" })
    })
    .catch(() => {})
}

function registerRefreshTap() {
  if (refreshTapTimer.value) {
    clearTimeout(refreshTapTimer.value)
  }
  refreshTapCount.value += 1
  if (refreshTapCount.value >= 3) {
    refreshTapCount.value = 0
    refreshTapTimer.value = null
    promptHardRefreshConversation()
    return true
  }
  refreshTapTimer.value = setTimeout(() => {
    refreshTapCount.value = 0
    refreshTapTimer.value = null
  }, 800)
  return false
}

function promptHardRefreshConversation() {
  uni.showModal({
    title: "彻底刷新当前会话？",
    content: "这会清除当前会话的本地缓存并重新加载，通常可以修复会话显示不全等意外情况。",
    confirmText: "清除并刷新",
    cancelText: "取消",
    success: (result) => {
      if (!result.confirm) return
      void hardRefreshConversation()
    },
  })
}

async function hardRefreshConversation() {
  const currentConversationId = conversationId.value
  if (!currentConversationId || loading.value) return
  const currentInstanceKey = detailConnectionKey.value
  try {
    cacheStore.clear(currentConversationId)
    runtime.clearSession(currentConversationId)
    if (currentInstanceKey) {
      await clearRuntime(currentInstanceKey, currentConversationId)
    }
    await loadConversation()
    uni.showToast({
      title: "已清除当前会话缓存并刷新",
      icon: "none",
      duration: 2600,
    })
  } catch (error) {
    uni.showToast({
      title: toErrorMessage(error, "彻底刷新失败"),
      icon: "none",
      duration: 2600,
    })
  }
}

function confirmStopSession(options: { refreshAfterStop?: boolean } = {}) {
  if (!canStopSession.value || stoppingSession.value) return
  uni.showModal({
    title: "停止当前会话？",
    content: "当前回复会被中断，停止后仍可继续发送消息。",
    confirmText: "停止会话",
    cancelText: "继续等待",
    success: (result) => {
      if (!result.confirm) return
      void stopCurrentSession(options)
    },
  })
}

async function stopCurrentSession(options: { refreshAfterStop?: boolean } = {}) {
  const conn = session.value?.connectionId
  if (stoppingSession.value) return
  if (!conn) {
    uni.showToast({ title: "当前会话连接不可用，无法停止", icon: "none" })
    return
  }

  stoppingSession.value = true
  clearStuckPromptTimer()
  try {
    await acpApi.acpCancel(conn)
    uni.showToast({ title: "已停止", icon: "success" })
    if (options.refreshAfterStop) {
      await loadConversation()
    }
  } catch (error) {
    uni.showToast({
      title: toErrorMessage(error, "停止失败"),
      icon: "none",
    })
  } finally {
    stoppingSession.value = false
  }
}

function handleLiveActivityChange(status: string, signature: string) {
  if (!ENABLE_STUCK_PROMPT_DETECTION) {
    clearStuckPromptTimer()
    lastLiveActivitySignature = ""
    stuckPromptShownForSignature = false
    return
  }
  if (!isStoppableRuntimeStatus(status) || !session.value?.connectionId) {
    clearStuckPromptTimer()
    lastLiveActivitySignature = ""
    stuckPromptShownForSignature = false
    return
  }

  if (signature !== lastLiveActivitySignature) {
    lastLiveActivitySignature = signature
    stuckPromptShownForSignature = false
  }

  scheduleStuckPromptTimer()
}

function scheduleStuckPromptTimer() {
  clearStuckPromptTimer()
  if (stuckPromptShownForSignature || !canStopSession.value) return

  stuckPromptTimer = setTimeout(() => {
    stuckPromptTimer = null
    if (stuckPromptShownForSignature || !canStopSession.value) return
    stuckPromptShownForSignature = true
    showStuckSessionPrompt()
  }, STUCK_PROMPT_TIMEOUT_MS)
}

function clearStuckPromptTimer() {
  if (!stuckPromptTimer) return
  clearTimeout(stuckPromptTimer)
  stuckPromptTimer = null
}

function showStuckSessionPrompt() {
  uni.showModal({
    title: "会话可能卡住了",
    content: "当前会话较长时间没有新输出，可能暂时卡住。是否停止当前回复并刷新会话后重试？",
    confirmText: "停止并刷新",
    cancelText: "继续等待",
    success: (result) => {
      if (result.confirm) {
        void stopCurrentSession({ refreshAfterStop: true })
      }
    },
  })
}

function resumeStuckPromptDetection() {
  handleLiveActivityChange(runtimeStatus.value, conversationActivitySignature.value)
}

async function reconcileRemoteTurnsAfterLocalHydrate(input: {
  conversationId: number
  folderId: number
  instanceKey: string
  runtimeSession: ReturnType<typeof runtime.getOrCreateSession>
}) {
  if (!input.conversationId) return
  if (hasVolatileRuntimeState(input.runtimeSession)) return

  try {
    const result = await fetchRemoteConversationDetail(input.conversationId)
    await applyRemoteHistoryWindowDetail({
      instanceKey: input.instanceKey,
      conversationId: input.conversationId,
      folderId: input.folderId,
      detail: result,
      runtimeSession: input.runtimeSession,
    })
    detailDebugLog("local-hydrate-remote-reconcile", summarizeDetailTurns(result))
  } catch (error) {
    detailDebugLog("local-hydrate-remote-reconcile-failed", {
      message: toErrorMessage(error),
    })
    console.warn("reconcile remote turns after local hydrate skipped", error)
  }
}

function summarizeDetailTurns(detail: any) {
  const turns = Array.isArray(detail?.turns) ? detail.turns : []
  const newest = turns[turns.length - 1]
  const oldest = turns[0]
  return {
    remoteTurnCount: turns.length,
    newestRemoteTurnId: firstString(newest?.id) || null,
    newestRemoteTurnTs: firstString(newest?.timestamp) || null,
    oldestRemoteTurnId: firstString(oldest?.id) || null,
    oldestRemoteTurnTs: firstString(oldest?.timestamp) || null,
  }
}

function applyRemoteDetailStats(detail: any, targetConversationId = conversationId.value) {
  const normalizedConversationId = Number(targetConversationId || 0)
  if (!normalizedConversationId) return
  runtime.applyConversationDetailStats(normalizedConversationId, detail)
}

function shouldReconcileTurnsFromPersistedRuntime(
  persistedRuntime: ConversationRuntimeRecord | null
) {
  if (!persistedRuntime) return false
  if (!persistedRuntime.isActive) return false
  if (persistedRuntime.liveMessageJson) return true

  return typeof persistedRuntime.lastAppliedSeq === "number" && persistedRuntime.lastAppliedSeq > 0
}

interface DetailProjectEntry {
  id: number
  path?: string
}

/**
 * 落盘详情页拥有的那部分状态：**滚动位置**（内存缓存）与**断点**（SQLite）。
 *
 * 草稿不在这里 —— 它归持有输入框的 `ConversationDetailInteractivePane.vue`，走它自己的
 * 防抖 watch + `saveDraftState`。这个组件此前也在写草稿，写的是抽离后留下的空 ref，
 * 于是每次 onHide / onUnload 都把 pane 刚落的草稿擦成空串。
 */
function persistDetailRuntimeState() {
  if (!conversationId.value) return
  cacheStore.persistViewState({
    conversationId: conversationId.value,
    scrollAnchor: anchorMessageId.value || undefined,
    scrollTop: lastMeasuredScrollTop.value || pageScrollTop.value || 0,
    nearBottom: shouldAutoFollowBottom.value,
    anchorMessageId: anchorMessageId.value || undefined,
  })
  const currentSession = session.value
  // **只写断点，不碰草稿。** 草稿归持有输入框的 `ConversationDetailInteractivePane.vue`。
  // 这里曾经用 `saveDraftState` 写断点，顺带把详情页手里那份抽离后残留的空 composer
  // 状态一起写进去，于是每次 onHide / onUnload 都把 pane 刚落的草稿擦成空串。
  // `saveRuntimeCheckpoint` 的签名里没有草稿三列，从类型上排除了这种写法。
  void saveRuntimeCheckpoint({
    conversationId: conversationId.value,
    instanceKey: resolveDetailInstanceKey(),
    connectionId: currentSession?.connectionId ?? null,
    liveMessageJson: currentSession?.liveMessage ? JSON.stringify(currentSession.liveMessage) : null,
    lastAppliedSeq: currentSession?.lastAppliedSeq ?? null,
    isActive: Boolean(currentSession?.connectionId),
  }).catch((error) => {
    console.warn("persist detail runtime skipped", error)
  })
}

function restoreCyberModePreference() {
  try {
    const storedTheme = normalizeDetailThemeStorage(
      uni.getStorageSync(DETAIL_THEME_STORAGE_KEY)
    )
    if (storedTheme !== "default") {
      detailTheme.value = storedTheme
      return
    }

    const migratedTheme = normalizeDetailThemeStorage(
      uni.getStorageSync(DETAIL_CYBER_MODE_STORAGE_KEY)
    )
    detailTheme.value = migratedTheme
    if (migratedTheme !== "default") {
      uni.setStorageSync(DETAIL_THEME_STORAGE_KEY, JSON.stringify({ theme: migratedTheme }))
    }
  } catch (error) {
    console.warn("restore cyber mode preference skipped", error)
    detailTheme.value = "default"
  }
}

function persistDetailThemePreference(theme: DetailThemeId) {
  detailTheme.value = theme
  try {
    uni.setStorageSync(DETAIL_THEME_STORAGE_KEY, JSON.stringify({ theme }))
    uni.setStorageSync(DETAIL_CYBER_MODE_STORAGE_KEY, JSON.stringify({ enabled: theme === "matrix" }))
  } catch (error) {
    console.warn("persist cyber mode preference skipped", error)
  }
}

function buildDetailBackgroundStorageKey() {
  const instanceKey = resolveDetailInstanceKey() || "anonymous"
  return `${DETAIL_BACKGROUND_STORAGE_PREFIX}:${instanceKey}:shared`
}

function buildLegacyDetailBackgroundStorageKey(targetConversationId = conversationId.value) {
  const normalizedConversationId = Number(targetConversationId || 0)
  if (!normalizedConversationId) return ""
  const instanceKey = resolveDetailInstanceKey() || "anonymous"
  return `${DETAIL_BACKGROUND_STORAGE_PREFIX}:${instanceKey}:${normalizedConversationId}`
}

function parseDetailBackgroundSnapshot(raw: unknown): DetailBackgroundSnapshot | null {
  if (!raw) return null
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw
  const url = firstString((parsed as any)?.url) || ""
  return {
    url,
    updatedAt: typeof (parsed as any)?.updatedAt === "number" ? (parsed as any).updatedAt : undefined,
    clearedAt: typeof (parsed as any)?.clearedAt === "number" ? (parsed as any).clearedAt : undefined,
  }
}

function readStoredDetailBackgroundSnapshot(key: string): DetailBackgroundSnapshot | null {
  if (!key) return null
  try {
    const raw = uni.getStorageSync(key)
    return parseDetailBackgroundSnapshot(raw)
  } catch (error) {
    console.warn("read detail background snapshot skipped", error)
    return null
  }
}

function readDetailBackgroundSnapshot(targetConversationId = conversationId.value): DetailBackgroundSnapshot | null {
  const sharedKey = buildDetailBackgroundStorageKey()
  const sharedSnapshot = readStoredDetailBackgroundSnapshot(sharedKey)
  if (sharedSnapshot) return sharedSnapshot

  const legacySnapshot = readStoredDetailBackgroundSnapshot(
    buildLegacyDetailBackgroundStorageKey(targetConversationId)
  )
  if (legacySnapshot?.url) {
    persistDetailBackgroundSnapshot(legacySnapshot.url)
    return legacySnapshot
  }
  return null
}

function applyDetailBackgroundFromStorage(targetConversationId = conversationId.value) {
  const snapshot = readDetailBackgroundSnapshot(targetConversationId)
  detailBackgroundImageUrl.value = snapshot?.url || ""
}

function persistDetailBackgroundSnapshot(url: string) {
  const key = buildDetailBackgroundStorageKey()
  if (!key) return
  try {
    uni.setStorageSync(key, JSON.stringify({
      url,
      ...(url ? { updatedAt: Date.now() } : { clearedAt: Date.now() }),
    }))
  } catch (error) {
    console.warn("persist detail background snapshot skipped", error)
  }
}

function removeLegacyDetailBackgroundSnapshots() {
  const conversationIds = new Set<number>([
    Number(conversationId.value || 0),
    ...detailShellTabs.value.map((tab) => Number(tab.conversationId || 0)),
  ])
  for (const legacyConversationId of conversationIds) {
    if (!legacyConversationId) continue
    const key = buildLegacyDetailBackgroundStorageKey(legacyConversationId)
    if (!key) continue
    try {
      uni.removeStorageSync(key)
    } catch (error) {
      console.warn("remove legacy detail background snapshot skipped", error)
    }
  }
}

async function chooseConversationDetailBackgroundImage() {
  uni.chooseImage({
    count: 1,
    sizeType: ["compressed"],
    sourceType: ["album", "camera"],
    success: async (res) => {
      const picked = Array.isArray(res.tempFilePaths) ? String(res.tempFilePaths[0] || "").trim() : ""
      if (!picked) {
        uni.showToast({ title: "未选择可用图片", icon: "none" })
        return
      }
      try {
        const url = await persistConversationDetailBackgroundFile(picked)
        detailBackgroundImageUrl.value = url
        persistDetailBackgroundSnapshot(url)
        uni.showToast({ title: "背景图已更新", icon: "success" })
      } catch (error) {
        uni.showToast({
          title: toErrorMessage(error, "背景图保存失败"),
          icon: "none",
          duration: 3000,
        })
      }
    },
  })
}

async function persistConversationDetailBackgroundFile(tempFilePath: string) {
  const normalizedPath = String(tempFilePath || "").trim()
  if (!normalizedPath) {
    throw new Error("背景图路径无效")
  }
  const savedPath = await saveLocalFileIfPossible(normalizedPath)
  const previousUrl = detailBackgroundImageUrl.value
  if (savedPath && previousUrl && savedPath !== previousUrl) {
    void removeSavedFileIfPossible(previousUrl)
  }
  return savedPath || normalizedPath
}

async function saveLocalFileIfPossible(tempFilePath: string): Promise<string> {
  if (typeof uni.saveFile !== "function") {
    return tempFilePath
  }
  try {
    return await new Promise<string>((resolve, reject) => {
      uni.saveFile({
        tempFilePath,
        success: (res) => {
          const savedFilePath = firstString((res as any)?.savedFilePath, (res as any)?.tempFilePath)
          if (savedFilePath) {
            resolve(savedFilePath)
            return
          }
          reject(new Error("背景图保存结果为空"))
        },
        fail: (error) => {
          reject(error)
        },
      })
    })
  } catch (error) {
    console.warn("save detail background file skipped", error)
    return tempFilePath
  }
}

async function removeSavedFileIfPossible(filePath: string) {
  const normalizedPath = String(filePath || "").trim()
  if (!normalizedPath || typeof uni.removeSavedFile !== "function") return
  if (/^https?:\/\//i.test(normalizedPath)) return
  try {
    await new Promise<void>((resolve) => {
      uni.removeSavedFile({
        filePath: normalizedPath,
        complete: () => resolve(),
      })
    })
  } catch {}
}

function clearConversationDetailBackgroundImage(showToast = false) {
  const previousUrl = detailBackgroundImageUrl.value
  detailBackgroundImageUrl.value = ""
  persistDetailBackgroundSnapshot("")
  removeLegacyDetailBackgroundSnapshots()
  if (previousUrl) {
    void removeSavedFileIfPossible(previousUrl)
  }
  if (showToast) {
    uni.showToast({ title: "背景图已清除", icon: "success" })
  }
}

function handleDetailBackgroundLoadError() {
  if (!detailBackgroundImageUrl.value) return
  clearConversationDetailBackgroundImage(false)
  uni.showToast({
    title: "背景图已失效，已自动清除",
    icon: "none",
    duration: 2500,
  })
}

function measureMessageListHeight() {
  const instance = currentInstance?.proxy
  if (!instance) return
  const currentDetailViewportHeight = getDetailViewportHeight()
  detailViewportHeight.value = currentDetailViewportHeight
  const fallbackTabsHeight = Math.max(0, Number(effectiveDetailTabsBarHeight.value || 0))
  const fallbackToolbarHeight = Math.max(0, Number(toolbarHeight.value || 0))
  const fallbackTopHeight = fallbackTabsHeight + fallbackToolbarHeight
  const query = uni.createSelectorQuery().in(instance)
  query
    .select(".detail-tabs-bar")
    .boundingClientRect()
    .select(".detail-shell__page--active .input-status-row")
    .boundingClientRect()
    .select(".detail-shell__page--active .composer-stack")
    .boundingClientRect()
    .select(".detail-shell__page--active .input-main-row")
    .boundingClientRect()
    .select(".detail-shell__page--active .input-tool-row")
    .boundingClientRect()
    .select(".detail-shell__page--active .message-list__content")
    .boundingClientRect()
    .exec((rects: any[]) => {
      const tabsRect = rects?.[0]
      const inputStatusRect = rects?.[1]
      const composerStackRect = rects?.[2]
      const inputMainRect = rects?.[3]
      const inputToolRect = rects?.[4]
      const contentRect = rects?.[5]
      const measuredTabsHeight = Math.max(0, Number(tabsRect?.height || 0))
      const measuredToolbarHeight = 0
      const measuredInputStatusHeight = Math.max(0, Number(inputStatusRect?.height || 0))
      const measuredComposerStackHeight = Math.max(0, Number(composerStackRect?.height || 0))
      const measuredComposerStackBottom = Math.max(0, Number(composerStackRect?.bottom || 0))
      const measuredComposerBottomOffset =
        measuredComposerStackHeight > 0 && measuredComposerStackBottom > 0
          ? Math.max(0, getViewportHeight() - measuredComposerStackBottom)
          : undefined
      const measuredInputMainHeight = Math.max(0, Number(inputMainRect?.height || 0))
      const measuredInputToolHeight = Math.max(0, Number(inputToolRect?.height || 0))
      const topHeight = measuredTabsHeight + measuredToolbarHeight
      const bottomHeight = resolveBottomComposerHeight({
        composerStackHeight: measuredComposerStackHeight,
        inputStatusHeight: measuredInputStatusHeight,
        inputMainHeight: measuredInputMainHeight,
        inputToolHeight: measuredInputToolHeight,
        bottomOffset: measuredComposerBottomOffset,
      })
      if (measuredTabsHeight > 0) {
        tabsBarHeight.value = measuredTabsHeight
      }
      toolbarHeight.value = 0
      if (topHeight > 0) {
        topChromeHeight.value = topHeight
      } else if (fallbackTopHeight > 0) {
        topChromeHeight.value = fallbackTopHeight
      }
      sharedHintHeight.value = 0
      if (bottomHeight > 0) {
        bottomComposerHeight.value = bottomHeight
      }
      const contentHeight = Math.max(0, Number(contentRect?.height || 0))
      const effectiveTopHeight = topHeight > 0 ? topHeight : fallbackTopHeight
      const effectiveBottomHeight = bottomHeight > 0 ? bottomHeight : bottomComposerHeight.value
      const availableHeight = Math.max(0, currentDetailViewportHeight - effectiveTopHeight - effectiveBottomHeight)
      measuredPageHeight.value = Math.max(
        currentDetailViewportHeight,
        effectiveTopHeight + effectiveBottomHeight + Math.max(contentHeight, availableHeight)
      )
      if (availableHeight > 0) {
        detailDebugLog("message-list-height", {
          detailViewportHeight: currentDetailViewportHeight,
          topHeight: effectiveTopHeight,
          bottomHeight: effectiveBottomHeight,
          contentHeight,
          availableHeight,
          measuredTabsHeight,
          measuredToolbarHeight,
          measuredInputStatusHeight,
          measuredComposerStackHeight,
          measuredComposerBottomOffset,
          measuredInputMainHeight,
          measuredInputToolHeight,
          activeDetailTabIndex: activeDetailTabIndex.value,
          detailSwiperCurrent: detailSwiperCurrent.value,
          mountedDetailConversationIds: Array.from(mountedDetailConversationIds.value),
        })
      }
    })
}

function scrollToBottom(force = false) {
  if (!renderMessageItems.value.length) return
  if (!force && !shouldAutoFollowBottom.value) return
  shouldAutoFollowBottom.value = true
  hasUnreadBelow.value = false
  anchorMessageId.value = ""
  messageScrollWithAnimation.value = !force
  messageScrollTop.value = Number.MAX_SAFE_INTEGER
  messageScrollIntoView.value = getBottomAnchorId()
}

function messageAnchorId(messageId: string) {
  return buildMessageAnchorId(messageId)
}

function resolveRenderAnchorId(messageId: string) {
  return resolveRenderAnchorIdValue({
    messageId,
    items: renderMessageItems.value,
  })
}

function getBottomAnchorId() {
  return bottomAnchorId()
}

function setProgrammaticAnchor(messageId: string) {
  anchorMessageId.value = messageId
  messageScrollWithAnimation.value = false
  messageScrollIntoView.value = messageAnchorId(messageId)
}

function restoreScrollState(
  cachedViewState: ReturnType<typeof cacheStore.restore>,
  persistedRuntime: ConversationRuntimeRecord | null
) {
  const action = resolveScrollRestoreAction({
    hasCachedViewState: Boolean(cachedViewState),
    cachedNearBottom: cachedViewState?.nearBottom,
    cachedScrollTop: cachedViewState?.scrollTop,
    cachedAnchorMessageId: cachedViewState?.anchorMessageId,
    persistedAnchor: persistedRuntime?.scrollAnchor,
  })
  if (action.type === "bottom") {
    scrollToBottom(true)
    restoredInitialScroll.value = true
    return
  }

  isRestoringScroll.value = true
  shouldAutoFollowBottom.value = false

  if (action.type === "scrollTop") {
    lastMeasuredScrollTop.value = action.scrollTop
    nextTick(() => {
      messageScrollWithAnimation.value = false
      messageScrollIntoView.value = ""
      messageScrollTop.value = action.scrollTop
    })
  } else if (action.type === "anchor") {
    setProgrammaticAnchor(resolveRenderAnchorId(action.anchorMessageId))
  }

  nextTick(() => {
    restoredInitialScroll.value = true
    isRestoringScroll.value = false
  })
}

function scheduleViewportSync(forceBottom = false) {
  nextTick(() => {
    measureMessageListHeight()
    const action = resolveViewportSyncAction({
      forceBottom,
      shouldAutoFollowBottom: shouldAutoFollowBottom.value,
      isRestoringScroll: isRestoringScroll.value,
      lastMeasuredScrollTop: lastMeasuredScrollTop.value,
    })
    if (action.type === "bottom") {
      scrollToBottom(true)
      return
    }
    if (action.type === "scrollTop") {
      messageScrollWithAnimation.value = false
      messageScrollIntoView.value = ""
      messageScrollTop.value = action.scrollTop
    }
  })
}

function closeMentionPanel() {
}

function handleScrollToBottomFab() {
  shouldAutoFollowBottom.value = true
  hasUnreadBelow.value = false
  anchorMessageId.value = ""
  scrollToBottom(true)
}

async function loadDetailProjectEntries() {
  if (!folderId.value) {
    detailProjectEntries.value = []
    return
  }
  try {
    const gateway = await getDetailGateway()
    const foldersRaw = await gateway.call<unknown>("list_open_folder_details")
    detailProjectEntries.value = normalizeList(foldersRaw).map((item: any) => ({
      id: Number(item?.id || 0),
      path: String(item?.path || "").trim(),
    }))
  } catch (error) {
    console.warn("load detail project entries failed", error)
    detailProjectEntries.value = []
  }
}

async function reconcileRemoteTurnsAfterResume(input: {
  conversationId: number
  folderId: number
  instanceKey: string
  runtimeSession: ReturnType<typeof runtime.getOrCreateSession>
}) {
  if (!input.conversationId) return

  try {
    const result = await fetchRemoteConversationDetail(input.conversationId)
    await applyRemoteHistoryWindowDetail({
      instanceKey: input.instanceKey,
      conversationId: input.conversationId,
      folderId: input.folderId,
      detail: result,
      runtimeSession: input.runtimeSession,
    })
    detailDebugLog("resume-remote-reconcile", summarizeDetailTurns(result))
  } catch (error) {
    detailDebugLog("resume-remote-reconcile-failed", {
      message: toErrorMessage(error),
    })
    console.warn("reconcile remote turns after resume skipped", error)
  }
}

/**
 * 发送前确保 PC 端开着这个会话的 opened-tab。
 *
 * **通过 `:on-before-send-prompt` 传给 pane 调用** —— 输入框在那边，这里只提供能力。
 * 它依赖 `getDetailGateway`（进而依赖 `resolveDetailDescriptor` 那一整套连接解析）与
 * `detailTabMultitaskMode` 偏好，两者都归详情页所有，所以留在这里比搬到 pane 更合理。
 *
 * 抽离 pane 时这个调用曾经丢过：它留在了详情页那条已经没有输入框的 `sendDraft` 上，
 * 于是手机端发消息不再帮 PC 打开对应标签，而且没有任何报错。
 */
async function ensurePcTabReadyForPrompt() {
  if (!detailTabsUsePcSync.value) return
  if (!conversationId.value || !folderId.value) return
  try {
    const gateway = await getDetailGateway({ refreshAuth: true })
    const descriptor = gateway.getRemoteInstanceDescriptor()
    await ensureConversationTabForPrompt({
      instanceKey: descriptor.instanceKey,
      gateway,
      folderId: folderId.value,
      conversationId: conversationId.value,
      agentType: currentAgentType.value || "claude_code",
      activation: "preserve",
      origin: "mcode-mobile-prompt",
    })
  } catch (error) {
    console.warn("ensure pc tab before prompt skipped:", error)
  }
}

function setSharedQueueItemCancelling(queueItemId: string, cancelling: boolean) {
  const normalized = String(queueItemId || "").trim()
  if (!normalized) return
  const next = new Set(cancellingSharedQueueItemIds.value)
  if (cancelling) {
    next.add(normalized)
  } else {
    next.delete(normalized)
  }
  cancellingSharedQueueItemIds.value = next
}

function setSharedQueueItemReordering(queueItemId: string, reordering: boolean) {
  const normalized = String(queueItemId || "").trim()
  if (!normalized) return
  const next = new Set(reorderingSharedQueueItemIds.value)
  if (reordering) {
    next.add(normalized)
  } else {
    next.delete(normalized)
  }
  reorderingSharedQueueItemIds.value = next
}

function setSharedQueueItemPriorityUpdating(queueItemId: string, updating: boolean) {
  const normalized = String(queueItemId || "").trim()
  if (!normalized) return
  const next = new Set(updatingSharedQueuePriorityItemIds.value)
  if (updating) {
    next.add(normalized)
  } else {
    next.delete(normalized)
  }
  updatingSharedQueuePriorityItemIds.value = next
}

async function cancelSharedPromptQueueItem(queueItemId?: string | null, sessionId?: string | null) {
  const normalizedQueueItemId = String(queueItemId || "").trim()
  const connectionId = firstString(session.value?.connectionId)
  if (!connectionId || !normalizedQueueItemId) return
  if (isSharedPromptQueueCancelDisabled(
    normalizedQueueItemId,
    cancellingSharedQueueItemIds.value
  )) return

  setSharedQueueItemCancelling(normalizedQueueItemId, true)
  try {
    await acpApi.acpCancelQueuedPrompt(
      connectionId,
      normalizedQueueItemId,
      firstString(sessionId) || connectionId
    )
  } catch (error) {
    uni.showToast({
      title: "取消队列任务失败，请稍后重试",
      icon: "none",
      duration: 3000,
    })
  } finally {
    setSharedQueueItemCancelling(normalizedQueueItemId, false)
  }
}

async function reorderSharedPromptQueueItem(
  queueItemId?: string | null,
  sessionId?: string | null,
  action: "move_up" | "move_down" | "move_top" | "move_bottom" = "move_up"
) {
  const normalizedQueueItemId = String(queueItemId || "").trim()
  const connectionId = firstString(session.value?.connectionId)
  if (!connectionId || !normalizedQueueItemId || !sharedPromptQueueControlsEnabled.value) return
  if (reorderingSharedQueueItemIds.value.has(normalizedQueueItemId)) return

  setSharedQueueItemReordering(normalizedQueueItemId, true)
  try {
    await acpApi.acpReorderQueuedPrompt(
      connectionId,
      normalizedQueueItemId,
      action,
      firstString(sessionId) || connectionId
    )
  } catch (error) {
    uni.showToast({
      title: "调整队列顺序失败，请稍后重试",
      icon: "none",
      duration: 3000,
    })
  } finally {
    setSharedQueueItemReordering(normalizedQueueItemId, false)
  }
}

async function updateSharedPromptQueuePriority(
  queueItemId?: string | null,
  sessionId?: string | null,
  priorityTier: "low" | "normal" | "high" = "normal"
) {
  const normalizedQueueItemId = String(queueItemId || "").trim()
  const connectionId = firstString(session.value?.connectionId)
  if (!connectionId || !normalizedQueueItemId || !sharedPromptQueueControlsEnabled.value) return
  if (updatingSharedQueuePriorityItemIds.value.has(normalizedQueueItemId)) return

  setSharedQueueItemPriorityUpdating(normalizedQueueItemId, true)
  try {
    await acpApi.acpSetQueuedPromptPriority(
      connectionId,
      normalizedQueueItemId,
      priorityTier,
      firstString(sessionId) || connectionId
    )
  } catch (error) {
    uni.showToast({
      title: "更新队列优先级失败，请稍后重试",
      icon: "none",
      duration: 3000,
    })
  } finally {
    setSharedQueueItemPriorityUpdating(normalizedQueueItemId, false)
  }
}

async function clearSharedPromptQueue() {
  const connectionId = firstString(session.value?.connectionId)
  if (sharedPromptQueueClearDisabled.value || !connectionId) return
  clearingSharedPromptQueue.value = true
  try {
    await acpApi.acpCancelAllQueuedPrompts(connectionId, connectionId)
  } catch (error) {
    uni.showToast({
      title: "清空队列失败，请稍后重试",
      icon: "none",
      duration: 3000,
    })
  } finally {
    clearingSharedPromptQueue.value = false
  }
}

function showSharedLiveBlockedToast() {
  uni.showToast({
    title: "该会话正在其他端处理中，当前仅可旁观，待本轮结束后可发送",
    icon: "none",
    duration: 3000,
  })
}

function resolveUploadTarget(): { url: string; header: Record<string, string> } {
  const descriptor = resolveDetailDescriptor()
  return buildUploadTarget({
    descriptor,
    directToken: getDirectToken(descriptor.baseUrl),
    relayToken: auth.relaySession?.accessToken,
  })
}

function syncAuthByConnectionKey(connKey: string) {
  const matched = findStoredConnectionByKey(connKey)
  if (!matched) return

  syncAuthByStoredConnection(matched)
}

function syncAuthByStoredConnection(matched: StoredConnectionItem) {
  if (!matched) return

  if (matched.routeMode === "direct") {
    const baseUrl = matched.directBaseUrl || ""
    const token = matched.directToken || getDirectToken(baseUrl)
    if (baseUrl && token) auth.setDirectMode(baseUrl, token)
    return
  }

  const accessToken = matched.gatewaySession?.accessToken
  const baseUrl = matched.gatewayBaseUrl || ""
  if (baseUrl && accessToken) {
    auth.setRelayMode(baseUrl, {
      accessToken,
      refreshToken: matched.gatewaySession?.refreshToken,
      targetId: matched.gatewaySession?.targetId,
    })
  }
}

function findStoredConnectionByKey(connKey: string) {
  const saved = uni.getStorageSync("mcode_connections")
  return findStoredConnectionInList(Array.isArray(saved) ? saved : [], connKey)
}

function findStoredConnectionById(connectionId: string) {
  const fromContextStore = normalizeStoredConnectionLike(
    findStoredConnectionContextById(connectionId)
  )
  if (fromContextStore) return fromContextStore

  const saved = uni.getStorageSync("mcode_connections")
  return findStoredConnectionInListById(Array.isArray(saved) ? saved : [], connectionId)
}

function resolveDetailStoredConnection(): StoredConnectionItem | null {
  return routeConnectionContext.value ||
    findStoredConnectionById(routeConnectionId.value) ||
    findStoredConnectionByKey(routeConnectionKey.value)
}

function resolveDetailConnectionRecordId() {
  const stored = resolveDetailStoredConnection()
  return firstString(stored?.id, routeConnectionId.value)
}

function resolveDetailTargetAgent() {
  return resolveStoredConnectionTargetAgent(
    resolveDetailStoredConnection() || { gatewaySession: auth.relaySession || undefined }
  )
}

function resolveDetailDescriptor(): RemoteInstanceDescriptor {
  const managed = managedConversation.value
  if (managed?.instanceKey) {
    const registered = getRegisteredRemoteInstanceDescriptor(managed.instanceKey)
    if (registered) {
      return registered
    }
  }

  const stored = resolveDetailStoredConnection()
  const fromStored = stored
    ? buildDescriptorFromStoredConnection(
        stored,
        getDirectToken(stored.routeMode === "direct" ? stored.directBaseUrl || "" : "")
      )
    : null
  if (fromStored) {
    registerRemoteInstanceDescriptor(fromStored)
    return fromStored
  }

  return auth.currentRemoteInstance()
}

function resolveDetailInstanceKey() {
  return resolveDetailDescriptor().instanceKey || "anonymous"
}

async function getDetailGateway(options: { refreshAuth?: boolean } = {}) {
  const descriptor = resolveDetailDescriptor()
  if (descriptor.mode === "direct") {
    const gateway = createGateway({
      mode: "direct",
      directBaseUrl: descriptor.baseUrl,
    })
    const token = firstString(descriptor.authToken, getDirectToken(descriptor.baseUrl))
    if (token) {
      await gateway.pair({
        directBaseUrl: descriptor.baseUrl,
        token,
      })
    }
    return gateway
  }

  const session: RelaySessionInfo = {
    accessToken: descriptor.authToken || "",
    refreshToken: descriptor.refreshToken,
    targetId: descriptor.principal,
  }
  const gateway = createGateway({
    mode: "relay",
    relayUrl: descriptor.baseUrl,
    session,
  })
  if (options.refreshAuth && session.refreshToken) {
    try {
      await gateway.refreshAuth()
      auth.setRelayMode(descriptor.baseUrl, session)
      persistRelaySessionForDescriptor(descriptor, session)
    } catch (error) {
      console.warn("relay auth refresh skipped", error)
    }
  }
  return gateway
}

function persistRelaySessionForDescriptor(
  descriptor: RemoteInstanceDescriptor,
  session: RelaySessionInfo
) {
  const saved = (Array.isArray(uni.getStorageSync("mcode_connections"))
    ? uni.getStorageSync("mcode_connections")
    : []) as StoredConnectionItem[]
  const index = saved.findIndex((item) =>
    item.routeMode === "gateway" &&
    normalizeStoredBaseUrl(item.gatewayBaseUrl) === normalizeStoredBaseUrl(descriptor.baseUrl)
  )
  if (index < 0) return
  saved[index] = {
    ...saved[index],
    gatewaySession: {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      targetId: session.targetId,
    },
  }
  uni.setStorageSync("mcode_connections", saved)
}

function normalizeStoredBaseUrl(value?: string) {
  return String(value || "").trim().replace(/\/+$/, "")
}

async function cancelGeneration() {
  try {
    const conn = session.value?.connectionId
    if (conn) {
      await acpApi.acpCancel(conn)
      uni.showToast({ title: "已取消", icon: "success" })
    }
  } catch {
    uni.showToast({ title: "取消失败", icon: "none" })
  }
}

function createLocalId(prefix: string): string {
  sequence.value += 1
  return `${prefix}-${Date.now()}-${sequence.value}`
}

function resetQuestionSelections() {
  askQuestionSelections.value = createQuestionSelectionState(pendingQuestionCard.value)
}

function questionSelection(questionId: string): QuestionSelectionState {
  const current = askQuestionSelections.value[questionId]
  if (current) return current
  const next = {
    selected: [],
    otherActive: false,
    otherText: "",
  }
  askQuestionSelections.value = {
    ...askQuestionSelections.value,
    [questionId]: next,
  }
  return next
}

function isQuestionOptionSelected(questionId: string, label: string) {
  return questionSelection(questionId).selected.includes(label)
}

function isQuestionOtherActive(questionId: string) {
  return questionSelection(questionId).otherActive
}

function isQuestionAnswered(questionId: string) {
  return isQuestionSelectionAnswered(questionSelection(questionId))
}

function toggleQuestionOption(question: PendingQuestionState["questions"][number], label: string) {
  const current = questionSelection(question.id)
  const selected = current.selected.includes(label)
  const nextSelected = question.multi_select
    ? selected
      ? current.selected.filter((item) => item !== label)
      : [...current.selected, label]
    : selected
      ? []
      : [label]
  askQuestionSelections.value = {
    ...askQuestionSelections.value,
    [question.id]: {
      ...current,
      selected: nextSelected,
      otherActive: question.multi_select ? current.otherActive : false,
    },
  }
}

function toggleQuestionOther(question: PendingQuestionState["questions"][number]) {
  const current = questionSelection(question.id)
  const nextActive = !current.otherActive
  askQuestionSelections.value = {
    ...askQuestionSelections.value,
    [question.id]: {
      ...current,
      selected: question.multi_select ? current.selected : [],
      otherActive: nextActive,
    },
  }
}

function setQuestionOtherText(questionId: string, event: unknown) {
  const value = questionInputValue(event)
  const current = questionSelection(questionId)
  askQuestionSelections.value = {
    ...askQuestionSelections.value,
    [questionId]: {
      ...current,
      otherActive: true,
      otherText: value,
    },
  }
}

function buildQuestionAnswer(declined: boolean): QuestionAnswer {
  return buildPendingQuestionAnswer(
    pendingQuestionCard.value,
    askQuestionSelections.value,
    declined
  )
}

async function answerAskQuestion(declined: boolean) {
  if (questionSubmitting.value) return
  const pending = pendingQuestionCard.value
  const conn = session.value?.connectionId
  if (!pending?.question_id || !conn) {
    uni.showToast({ title: "问题请求信息不完整", icon: "none" })
    return
  }
  if (!declined && !questionSubmitReady.value) {
    uni.showToast({ title: "请先完成所有问题", icon: "none" })
    return
  }

  questionSubmitting.value = true
  try {
    await acpApi.acpAnswerQuestion(conn, pending.question_id, buildQuestionAnswer(declined))
    runtime.clearPendingQuestion(conversationId.value, pending.question_id)
    usePetStore().addExp('user', declined ? 2 : 8)
    uni.showToast({ title: declined ? "已跳过选择" : "已提交选择", icon: "success" })
  } catch (error) {
    uni.showToast({
      title: toErrorMessage(error, "提交选择失败"),
      icon: "none",
    })
  } finally {
    questionSubmitting.value = false
  }
}

async function respondToPermission(optionId: string) {
  if (permissionSubmitting.value) return
  const pending = pendingPermissionCard.value
  const conn = session.value?.connectionId
  if (!pending?.id || !conn) {
    uni.showToast({ title: "授权请求信息不完整", icon: "none" })
    return
  }

  permissionSubmitting.value = true
  pendingPermissionSubmittingOptionId.value = optionId
  try {
    await acpApi.acpRespondPermission(conn, pending.id, optionId)
    runtime.clearPendingPermission(conversationId.value, pending.id)
    usePetStore().addExp('user', 8)
    uni.showToast({ title: "已提交授权", icon: "success" })
  } catch (error) {
    uni.showToast({
      title: toErrorMessage(error, "授权失败"),
      icon: "none",
    })
  } finally {
    permissionSubmitting.value = false
    pendingPermissionSubmittingOptionId.value = ""
  }
}

</script>

<style scoped lang="scss">
@import "./index.scss";
</style>
