<template>
  <view class="page page--with-tabbar conversations-page" :style="[upThemeVars, upThemePageStyle]">
    <view class="conversations-shell">
      <ConversationsNavbar
        :connection-name="activeConnectionName"
        :search-active="searchVisible"
        @filter="openViewFilterSheet"
        @connection="openConnectionPicker"
        @search="toggleSearchBar"
      />

      <!--
        搜索条默认收起。设计稿（M08）把搜索收成顶栏右侧的一枚 32×32 图标，
        常驻的输入框会让「列表本身」成为次要内容；点开才占位。
      -->
      <ConversationsSearchBar
        v-if="searchVisible"
        v-model="searchKeyword"
        :can-create="canCreateConversation"
        @create="createConversation()"
      />

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

      <view class="main-wrap main-wrap--overview">
        <!-- 按文件夹分组的会话总览（M08 名称前缀 Logo 版） -->
        <view class="conv-panel">
          <view v-if="loading && folderGroups.length === 0" class="inline-loading">
            <up-loading-icon color="#2979ff" size="28"></up-loading-icon>
            <text class="inline-loading__text">加载中...</text>
          </view>

          <view v-else-if="folderGroups.length === 0" class="empty-fullpage">
            <up-empty mode="list" :text="overviewEmptyText"></up-empty>
          </view>

          <view v-else class="conv-scroll">
            <view class="conv-content" :class="{ 'conv-content--selecting': selectionMode }">
              <!--
                连接加载失败时的提示。原先每条连接的分组头右侧挂一枚感叹号图标，
                现在分组是文件夹、不再对应连接，所以改成内容区顶部的一条横幅 ——
                错误属于「这条连接没取到数据」，不该混进文件夹层级里。
              -->
              <view
                v-if="activeConnectionLoadError"
                class="conv-error-banner"
                @click="showActiveConnectionError"
              >
                <up-icon name="warning-fill" size="14" color="#fa3534"></up-icon>
                <text class="conv-error-banner__text">{{ activeConnectionLoadError }}</text>
              </view>

              <ConversationFolderSection
                v-for="folder in folderGroups"
                :key="folder.key"
                :name="folder.name"
                :folder-id="folder.folderId"
                :connection-key="folder.connectionKey"
                :cards="folder.cards"
                :list-style="listStyle"
                :selection-mode="selectionMode"
                :selected-keys="selectedConversationKeys"
                @open="handleFolderCardOpen(folder, $event)"
                @toggle-select="handleFolderCardToggleSelect(folder, $event)"
                @menu="handleRowMenu(folder, $event)"
                @create="createConversationInFolder(folder)"
              />

              <view class="safe-bottom"></view>
            </view>
          </view>
        </view>
      </view>
    </view>

    <view v-if="selectionMode" class="bulk-action-bar" :style="upThemeCardStyle">
      <view class="bulk-action-bar__summary">
        <text class="bulk-action-bar__title">已选择 {{ selectedBulkCount }} 个会话</text>
        <text class="bulk-action-bar__hint">将向所有勾选会话发送同一条内容</text>
      </view>
      <up-button
        type="primary"
        size="small"
        shape="circle"
        :disabled="selectedBulkCount === 0"
        customStyle="flex:0 0 auto;width:auto;min-width:88px;padding:0 18px"
        @click="openBulkSendDialog"
      >批量发送</up-button>
    </view>

    <!-- 新建会话弹层。自带智能体配置弹层、创建进度弹层、连接/项目两个 Picker ——
         它们的唯一入口都在它内部，状态也完全同源。页面只给三样东西：连接分组（列表
         数据源，页面拥有）、默认连接键、默认文件夹（文件夹头的「＋」才给），
         然后等 `@created` 拿回三个字段做刷新与跳转。 -->
    <CreateConversationSheet
      v-model:show="showCreateDialog"
      :connection-groups="connectionGroups"
      :default-connection-key="createSheetDefaultConnectionKey"
      :default-folder-id="createSheetDefaultFolderId"
      @created="handleConversationCreated"
    />

    <!-- 批量发送弹层。外壳用共享的 `.create-sheet`（滚动/高度上限都在那一份里），
         内容同样收进 `__body`：输入框 autoHeight + 1200 字上限，长文本一样会把弹层
         撑出屏幕。 -->
    <up-popup v-model:show="showBulkSendDialog" mode="bottom" :round="28" @close="closeBulkSendDialog">
      <view class="create-sheet" :style="upThemeCardStyle">
        <view class="create-sheet__hd">
          <text class="create-sheet__title">批量发送</text>
          <view class="create-sheet__close" @click="closeBulkSendDialog">
            <up-icon name="close" size="20" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
          </view>
        </view>

        <view class="create-sheet__body" @touchmove.stop>
          <view class="bulk-send-warning">
            <up-icon name="info-circle" size="18" :color="upThemeVar('--up-primary', '#2979ff')"></up-icon>
            <text class="bulk-send-warning__text">本次将会一键将内容发送给所有勾选的会话</text>
          </view>

          <view class="bulk-send-targets">
            <text class="bulk-send-targets__title">目标会话 {{ selectedBulkCount }} 个</text>
            <text class="bulk-send-targets__hint u-line-2">{{ selectedBulkSummary }}</text>
          </view>

          <view class="form-group">
            <text class="form-label">快捷输入</text>
            <view class="bulk-quick-row">
              <view class="bulk-quick-chip" @click="applyBulkQuickText(BULK_SEND_QUICK_TEXT)">
                <text class="bulk-quick-chip__text">{{ BULK_SEND_QUICK_TEXT }}</text>
              </view>
            </view>
          </view>

          <view class="form-group">
            <text class="form-label">发送内容</text>
            <up-textarea
              v-model="bulkSendText"
              placeholder="请输入要发送给所有勾选会话的内容"
              autoHeight
              count
              :maxlength="1200"
            ></up-textarea>
          </view>
        </view>

        <up-button
          type="primary"
          :loading="bulkSending"
          :disabled="bulkSendSubmitDisabled"
          shape="circle"
          @click="confirmBulkSend"
          customStyle="margin-top:16rpx;flex-shrink:0"
        >确认批量发送</up-button>

        <view class="safe-bottom"></view>
      </view>
    </up-popup>

    <!--
      会话行长按菜单。条目由 `buildConversationRowActions` 按会话状态现算：
      置顶 / 归档各自只出现当前该出现的那一半，正在进行的会话没有删除项。
      目标会话与所属连接一起存，因为改名、置顶、归档都要按连接取网关。
    -->
    <up-action-sheet
      :show="rowActionSheetVisible"
      :actions="rowActionList"
      :title="rowActionSheetTitle"
      @select="handleRowActionSelect"
      @close="closeRowActionSheet"
    ></up-action-sheet>

  </view>

    <McodeTabBar current="conversations" />
</template>

<script setup lang="ts">
import { ref, computed, getCurrentInstance, onMounted, watch } from "vue"
import { onHide, onPullDownRefresh, onShow, onUnload } from "@dcloudio/uni-app"
import { useAuthStore } from "@/stores/auth"
import { useConversationRuntimeStore } from "@/stores/conversationRuntime"
import { acpApi } from "@/api/acp"
import MarqueeText from "@/components/MarqueeText.vue"
import McodeTabBar from "@/components/McodeTabBar.vue"
import ConversationsSearchBar from "@/pages/conversations/components/ConversationsSearchBar.vue"
import ConversationsNavbar from "@/pages/conversations/components/ConversationsNavbar.vue"
import ConversationFolderSection from "@/pages/conversations/components/ConversationFolderSection.vue"
import {
  CONVERSATION_LIST_STYLE_STORAGE_KEY,
  buildConversationFolderGroups,
  buildConversationListStyleActions,
  normalizeConversationListStyle,
  resolveConversationListStyleLabel,
  type ConversationListStyleId,
} from "@/pages/conversations/conversationListPresentation"
import {
  CONVERSATION_ARCHIVED_STATUS,
  CONVERSATION_PIN_COMMAND,
  CONVERSATION_UNARCHIVED_STATUS,
  buildConversationRowActions,
  canDeleteConversation,
  resolveArchiveSuccessToast,
  resolveRowActionSheetTitle,
  resolveSelectedRowAction,
} from "@/pages/conversations/conversationRowActions"
import CreateConversationSheet from "@/pages/conversations/components/CreateConversationSheet.vue"
import {
  buildBulkSelectionItem,
  buildBulkSelectionKey,
  buildConversationStatusModeActions,
  buildOverviewDisplayModel,
  formatOverviewAgentLabel,
  formatOverviewRelativeTime,
  isSelectableOverviewCard,
  overviewAgentLogoClass,
  overviewAgentLogoPath,
  overviewAgentLogoText,
  overviewStatusClass,
  overviewStatusLabel,
  resolveGroupEmptyText,
  resolveOverviewEmptyText,
  type BulkSelectionItem,
  type ConversationStatusMode,
  type OverviewCandidateCard,
} from "@/pages/conversations/conversationOverviewPresentation"
import { selectConversationLivePreviewIds } from "@/pages/conversations/conversationLivePreview"
import { connectionBaseUrl } from "@/services/connection/connectionLookup"
import {
  applyConnectionAuth,
  findConnectedConnection,
  normalizeGatewayList,
  openConnectionGateway,
} from "@/services/connection/connectionAccess"
import { toErrorMessage } from "@/services/gateway/error"
import {
  getConversationOverviewConnections,
  hasConversationOverviewConnections,
} from "./overviewState"
import {
  buildConnectionKey,
  readStoredConnections,
  resolveConnectionContext,
  type ConnectionContext,
} from "@/services/connectionContext"
import {
  filterConnectedConnections,
  isConnectionConnected,
  pruneConnectedMap,
} from "@/services/connection/connectedMapStore"
import { ensureConversationSchema } from "@/services/db/migrations"
import {
  consumeConversationListDirty,
  markConversationListDirty,
  shouldRefetchAfterBridgeRecovered,
} from "@/services/conversation/conversationListRefresh"
import {
  readConversationListLiveStreamEnabled,
} from "@/services/conversation/conversationListLiveStreamPreference"
import {
  readConversationStatusMode,
  writeConversationStatusMode,
} from "@/services/conversation/conversationStatusModePreference"
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
import { refreshConversationTabBadge } from "@/services/conversation/conversationTabBadgeService"
import {
  getAwaitingReply,
  getAwaitingReplyStoreVersion,
  ingestPetSessionsPayload,
} from "@/services/conversation/awaitingReplyStore"
import { syncIosStandaloneStatusBar } from "@/services/iosStandaloneStatusBar"
import { isDarkThemeMode } from "@/services/theme"
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
  markMissingConversationSummariesDeleted,
  upsertConversationSummary,
  upsertConversationSummaries,
} from "@/services/db/repositories/conversationRepository"
import { getRegisteredRemoteInstanceDescriptor } from "@/services/realtime/remoteInstanceRegistry"
import type { CodegGateway } from "@/services/gateway"
import { normalizeAgentType } from "@/services/conversation/agentType"
import type { RealtimeBridgeHealth } from "@/types/acp"

const auth = useAuthStore()
const runtime = useConversationRuntimeStore()
const currentInstance = getCurrentInstance()
// upThemeVar 是 uview 用 Options API mixin 注入的方法，只有模板作用域能直接调；
// <script setup> 里必须经 proxy 取，否则 ReferenceError（computed 里会静默失败）。
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")
const loading = ref(false)
/** 输入框绑定的即时值 —— 打字必须跟手，所以它不能被防抖。 */
const searchKeyword = ref("")
/**
 * 参与过滤的关键词，防抖后的镜像。
 *
 * `searchKeyword` 直接喂给 `overviewDisplayModel` 时，每敲一个字都要把所有可见卡重新
 * 展开一遍（每张卡两次对象展开 + 每组三趟排序）。同页的 forge（500ms）、circles（220ms）
 * 都有防抖，这里是唯一的例外。
 */
const appliedSearchKeyword = ref("")
const SEARCH_KEYWORD_DEBOUNCE_MS = 220
let searchKeywordDebounceTimer: ReturnType<typeof setTimeout> | null = null

function clearSearchKeywordDebounceTimer() {
  if (!searchKeywordDebounceTimer) return
  clearTimeout(searchKeywordDebounceTimer)
  searchKeywordDebounceTimer = null
}

watch(searchKeyword, (next) => {
  clearSearchKeywordDebounceTimer()
  // 清空是「取消搜索」，要立刻生效 —— 让用户等 220ms 才看到完整列表回来很别扭。
  if (!next) {
    appliedSearchKeyword.value = ""
    return
  }
  searchKeywordDebounceTimer = setTimeout(() => {
    searchKeywordDebounceTimer = null
    appliedSearchKeyword.value = searchKeyword.value
  }, SEARCH_KEYWORD_DEBOUNCE_MS)
})
const showCreateDialog = ref(false)
/**
 * 长按菜单的目标：卡片 + 所属连接，两者必须一起存。
 *
 * 卡片自己不带连接键（那归文件夹分组所有），而改名、置顶、归档都要按连接取网关 ——
 * 只存卡片的话，写操作就得回头去猜它属于哪条连接。
 */
const rowActionTarget = ref<{
  card: DisplayLiveSessionCard
  connectionKey: string
} | null>(null)
const rowActionSheetVisible = ref(false)

/**
 * 菜单条目按目标会话的当前状态现算。
 *
 * 状态优先取 `displayStatus`（它是 `status` 叠上实时会话后的结果），取不到才退回
 * `status`：用原始 status 判断「是否正在进行」会把一个正在跑、但库里还写着 completed
 * 的会话判成可删。
 */
const rowActionList = computed(() =>
  buildConversationRowActions({
    status: rowActionTarget.value?.card?.displayStatus || rowActionTarget.value?.card?.status,
    isPinned: rowActionTarget.value?.card?.isPinned === true,
  })
)
const rowActionSheetTitle = computed(() =>
  resolveRowActionSheetTitle(rowActionTarget.value?.card?.title)
)
let overviewLoadPromise: Promise<void> | null = null
let lastOverviewLoadedAt = 0
const overviewRefreshPromiseMap = new Map<string, Promise<void>>()
let overviewConnectionPreparePromise: Promise<void> | null = null
const connectionFolderSnapshotMap = new Map<string, Project[]>()
const connectionTabSnapshotMap = new Map<string, OpenedTabItem[]>()
const instanceConnectionKeyMap = new Map<string, string>()
const connectionInstanceKeyMap = new Map<string, string>()
let disposeOverviewInvalidation: (() => void) | null = null
const disposeOpenedTabsChangedMap = new Map<string, () => void>()
const disposeActiveSessionsChangedMap = new Map<string, () => void>()
const disposeBridgeHealthMap = new Map<string, () => void>()
const disposeBulkChangedMap = new Map<string, () => void>()
// 上一次看到的桥接状态，按实例记。用来区分「首连」与「重连」——
// health 里的 reconnectAttempt 在发出前已被归零，指望不上。
const lastBridgeStateMap = new Map<string, RealtimeBridgeHealth["state"]>()
const activeSessionsRefreshTimerMap = new Map<string, ReturnType<typeof setTimeout>>()
const ACTIVE_SESSIONS_REFRESH_DEBOUNCE_MS = 400
const livePreviewEnabled = ref(false)
// 左上角「视图」面板里的状态筛选模式（全部 / 进行中 / 已置顶 / 已归档，默认全部，
// 见 conversationStatusModePreference）。在 onShow 里从存储读取，与 livePreviewEnabled 同一套路。
const statusMode = ref<ConversationStatusMode>("all")
const livePreviewPageVisible = ref(false)
const livePreviewOwnedConversationIds = new Set<number>()
const livePreviewTransferredConversationIds = new Set<number>()
const livePreviewConnectPromiseMap = new Map<number, Promise<void>>()
let livePreviewReconcileTimer: ReturnType<typeof setTimeout> | null = null

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
  activityAt: number
  status: string
  isActive: boolean
  /** 置顶。快照里写死的字段，分组排序与长按菜单都读它。 */
  isPinned: boolean
  isOpenTab: boolean
}

interface DisplayLiveSessionCard extends LiveSessionCard {
  displayStatus: string
  livePreviewText: string
}

interface DisplayConnectionGroup extends ConnectionGroup {
  cards: DisplayLiveSessionCard[]
}

interface ConnectionGroup extends ConnectionConversationSnapshot {
  cards: LiveSessionCard[]
}

const connectionGroups = ref<ConnectionGroup[]>([])
const selectionMode = ref(false)
/**
 * 会话列表的展示形态（M08 三种画板）。
 *
 * 只影响「一行里 Logo 放哪儿 / 分隔线要不要缩进」，不改数据结构 —— 所以它是页面级
 * 的纯展示偏好，落盘在 `mcode_conversations_list_style_v1`。
 */
const listStyle = ref<ConversationListStyleId>("logo-prefix")
/** 搜索条是否展开。设计稿把搜索收成顶栏右侧一枚图标，默认不占位。 */
const searchVisible = ref(false)
/**
 * 当前查看的连接。
 *
 * 空串表示「还没选过」，一律回落到第一条连接（`activeConnectionGroup`）——
 * 不能把空串当成「全部连接」：设计稿的中间胶囊永远显示一条具体的连接名，
 * 且分组语义是文件夹，多连接混在一起时同名文件夹会撞在一起。
 */
const activeConnectionKey = ref("")
const selectedConversationMap = ref<Record<string, BulkSelectionItem>>({})
const showBulkSendDialog = ref(false)
const bulkSendText = ref("")
const bulkSending = ref(false)
const BULK_SEND_QUICK_TEXT = "继续"

/**
 * `awaitingReplyStore` 的版本号镜像 —— 存储是纯模块（Map），Vue 追不到它的内部改动，
 * 靠这个 ref 把「有变化」搬进响应式系统。见 `overviewDisplayModel` 里的说明。
 *
 * 页面 onShow 时也要同步一次：列表页没挂载的那段时间里，常驻的
 * `conversationTabBadgeService` 一直在 ingest，存储早就往前走了。
 */
const awaitingReplyVersion = ref(getAwaitingReplyStoreVersion())

/**
 * 会话列表的**唯一**可见派生。
 *
 * 渲染结构与订阅/选择集从**同一次计算**里出来（`buildOverviewDisplayModel` 的两个字段），
 * 所以结构上不可能像收口前那样分叉 —— 那时它们是两条独立派生，任何判据改动都必须同时改
 * 两处，漏改候选那条会让看不见的卡仍被订阅、仍能被「全选」勾中。
 */
const overviewDisplayModel = computed(() => {
  // 建立对待回复存储的响应式依赖。那个存储是个纯模块（Map，非 reactive），Vue 追不到它的
  // 内部改动，所以它每次 ingest 会把版本号 +1，这里读一下版本号就能在推送到达时重算。
  // 直接把 Map 做成 reactive 不行：Vue 3 对 Map 只在整体替换时触发依赖，改 key 不触发。
  void awaitingReplyVersion.value

  return buildOverviewDisplayModel({
    groups: connectionGroups.value,
    // 回调而不是直接传 Map：让纯模块与 Vue 响应式解耦（模块因此能在 jest 里裸测）。
    resolveRuntimeSession: (conversationId) => runtime.sessions.get(conversationId),
    // 必须带 instanceKey —— 会话号在不同连接上会重复。
    resolveAwaitingStatus: (instanceKey, conversationId) =>
      getAwaitingReply(instanceKey, conversationId)?.kind,
    instanceKeyByGroupKey: Object.fromEntries(connectionInstanceKeyMap),
    keyword: appliedSearchKeyword.value,
    statusMode: statusMode.value,
    livePreviewEnabled: livePreviewEnabled.value,
  })
})

const filteredConnectionGroups = computed(() => overviewDisplayModel.value.groups)

/**
 * 当前查看的那条连接。
 *
 * 回落到第一条是刻意的：连接全删光、或用户点的那条刚好被删时，列表不能空着 ——
 * 空列表只会被读成「没有会话」，而实际上只是选择器指错了对象。
 */
const activeConnectionGroup = computed<any | null>(() => {
  const groups = filteredConnectionGroups.value as any[]
  if (groups.length === 0) return null
  return groups.find((group) => group.key === activeConnectionKey.value) || groups[0] || null
})

const activeConnectionName = computed(() => String(activeConnectionGroup.value?.name || ""))
const activeConnectionLoadError = computed(() =>
  String(activeConnectionGroup.value?.loadError || "")
)

/**
 * 把「按连接分组」重排成「按文件夹分组」（M08 的分组头是文件夹名 + 文件夹图标）。
 *
 * 只跑当前连接 —— 设计稿的列表永远只呈现一条连接的会话，中间胶囊负责切换；
 * 多连接并排渲染会让同名文件夹（`otools` 在两条机器上都有）撞在一起，分组头无法区分。
 */
const folderGroups = computed(() => {
  const group = activeConnectionGroup.value
  if (!group) return []
  return buildConversationFolderGroups([group])
})

/** 批量选择集的 key 列表，传给行组件判断勾选态。 */
const selectedConversationKeys = computed(() => Object.keys(selectedConversationMap.value))

const groupEmptyText = computed(() => resolveGroupEmptyText(statusMode.value))
const overviewEmptyText = computed(() =>
  resolveOverviewEmptyText(appliedSearchKeyword.value, statusMode.value)
)

const showSelectionEntry = computed(() =>
  filteredConnectionGroups.value.some((group) =>
    group.cards.some((card) => isSelectableOverviewCard(card))
  )
)

const selectedBulkItems = computed<BulkSelectionItem[]>(() =>
  Object.values(selectedConversationMap.value)
)

const selectedBulkCount = computed(() => selectedBulkItems.value.length)

const selectedBulkSummary = computed(() => {
  const names = selectedBulkItems.value
    .slice(0, 3)
    .map((item) => item.title || `会话 #${item.conversationId}`)
  const extra = selectedBulkCount.value - names.length
  return extra > 0 ? `${names.join("、")} 等 ${selectedBulkCount.value} 个会话` : names.join("、")
})

const bulkSendSubmitDisabled = computed(() =>
  bulkSending.value ||
  selectedBulkCount.value === 0 ||
  bulkSendText.value.trim().length === 0
)

/**
 * 打开新建弹层时用哪条连接、哪个文件夹作默认。
 *
 * 都是 ref 而不是 computed：默认值由**打开入口**决定 —— 顶栏的「＋」是「新建，
 * 连接和文件夹都待选」，文件夹头的「＋」是「在这个文件夹里新建」（见
 * `createConversationInFolder`）。页面不再持有一个「当前在哪个面板」的状态，
 * 列表只有一种形态。
 */
const createSheetDefaultConnectionKey = ref("")
const createSheetDefaultFolderId = ref(0)

/**
 * 搜索行右侧的「＋」是否可见。
 *
 * 选择模式下藏掉：那时底部是批量操作条，新建会打断选择流程（这条规则从原顶栏的
 * `v-if="!selectionMode"` 继承而来）。
 */
const canCreateConversation = computed(() => !selectionMode.value)

watch(
  () => livePreviewEnabled.value,
  () => {
    scheduleLivePreviewReconcile()
  }
)

watch(
  () => buildLivePreviewCandidateSignature(),
  () => {
    scheduleLivePreviewReconcile()
  }
)

watch(
  () => buildLivePreviewRuntimeSignature(),
  () => {
    scheduleLivePreviewReconcile()
  }
)

watch(
  () => buildSelectableLiveCardSignature(),
  () => {
    const available = new Set(getSelectableLiveCardKeys())
    const next: Record<string, BulkSelectionItem> = {}
    for (const item of selectedBulkItems.value) {
      if (available.has(item.key)) {
        next[item.key] = item
      }
    }
    selectedConversationMap.value = next
    if (!showSelectionEntry.value) {
      exitSelectionMode()
    }
  }
)

const hasActiveConnection = computed(() => {
  if (hasConversationOverviewConnections()) return true
  if (loading.value) return true
  return false
})

onMounted(() => {
  loadConversationLivePreviewPreference()
  loadStatusModePreference()
  restoreListStylePreference()
  scheduleLivePreviewReconcile()
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
  clearSearchKeywordDebounceTimer()
  disposeOpenedTabsChangedMap.forEach((dispose) => dispose())
  disposeOpenedTabsChangedMap.clear()
  disposeActiveSessionsChangedMap.forEach((dispose) => dispose())
  disposeActiveSessionsChangedMap.clear()
  disposeBridgeHealthMap.forEach((dispose) => dispose())
  disposeBridgeHealthMap.clear()
  disposeBulkChangedMap.forEach((dispose) => dispose())
  disposeBulkChangedMap.clear()
  lastBridgeStateMap.clear()
  activeSessionsRefreshTimerMap.forEach((timer) => clearTimeout(timer))
  activeSessionsRefreshTimerMap.clear()
  if (livePreviewReconcileTimer) {
    clearTimeout(livePreviewReconcileTimer)
    livePreviewReconcileTimer = null
  }
  releaseAllLivePreviewOwnedSessions()
  livePreviewConnectPromiseMap.clear()
  livePreviewTransferredConversationIds.clear()
  // 这里曾经调 `stopCreateProgressTimer()` —— 那个名字在本文件里没有定义也没有 import
  // （它是 `CreateConversationSheet.vue` 的 `<script setup>` 私有函数），所以这一句是
  // onUnload 最后一句的 ReferenceError。清理已改为在持有 timer 的子组件里
  // （`CreateConversationSheet` 的 `onBeforeUnmount`）做。
})

onHide(() => {
  livePreviewPageVisible.value = false
  activeSessionsRefreshTimerMap.forEach((timer) => clearTimeout(timer))
  activeSessionsRefreshTimerMap.clear()
  releaseAllLivePreviewOwnedSessions()
})

onPullDownRefresh(() => {
  loadOverviewDataAfterConnectionPrepare({ force: true }).finally(() => {
    void refreshConversationTabBadge()
    uni.stopPullDownRefresh()
  })
})

onShow(() => {
  livePreviewPageVisible.value = true
  livePreviewTransferredConversationIds.clear()
  loadConversationLivePreviewPreference()
  loadStatusModePreference()
  restoreListStylePreference()
  syncConversationListNativeStatusBar()
  // 追上页面未挂载期间常驻服务 ingest 的待回复状态，否则第一屏的 chip 要等下一次推送才出现。
  awaitingReplyVersion.value = getAwaitingReplyStoreVersion()
  const shouldForceRefresh = consumeConversationListDirty()
  void loadOverviewDataAfterConnectionPrepare(
    shouldForceRefresh ? { force: true } : undefined
  ).finally(() => {
    scheduleLivePreviewReconcile()
  })
  void refreshConversationTabBadge().finally(() => {
    // 那次刷新会顺带 ingest 一遍最新载荷（每个实例都拉了 `pet_list_active_sessions`），
    // 所以拉完再同步一次版本号，冷启动第一屏就能带上 chip。
    awaitingReplyVersion.value = getAwaitingReplyStoreVersion()
  })
})

function loadConversationLivePreviewPreference() {
  livePreviewEnabled.value = readConversationListLiveStreamEnabled()
}

/**
 * 页面底色。**必须与 `<style>` 里 `.conversations-page` 的 `background` 是同一个值** ——
 * iOS standalone 下系统玻璃带采样到的、Android app-plus 状态栏区域透出的、橡皮筋回弹
 * 露出的 `body`，都是这个色。差一个色号就会在顶部出现一条接缝。
 *
 * 旧版这里还兼着「navbar 玻璃底色」的职责（navbar 玻璃取它的 78%），那套随 fixed
 * 玻璃 navbar 一起删了 —— 现在顶上那条带子是 iOS 系统画的，页面只提供底色。
 */
const PAGE_SURFACE_LIGHT = "#f2f2f7"
const PAGE_SURFACE_DARK = "#000000"

/**
 * 顶部状态栏色带同步。两条线，行为不同：
 *
 * - **iOS standalone（PWA 加到主屏）**：meta 走 `black`（service 的 "system" 档）——
 *   webview 从状态栏下方开始，顶上那条带子交还 iOS：iOS 26/27 在页面顶部画自己的
 *   Liquid Glass 滚动边缘带（实测约 75pt），采样滚到它下面的内容。连接列表
 *   （pages/connections/index.vue）走 index.html 默认 black、从不调本 service，
 *   状态栏与内容区因此是一整片；本页顶栏是 fixed 但全透明（见 ConversationsNavbar），
 *   WebKit 取不到颜色、系统带照画，所以这里也回到 black，与连接列表同一条系统带。
 *   调这个 service 是为了把 theme-color /
 *   html/body 背景同步成页面底色（Android app-plus immersed 与橡皮筋回弹吃这个色），
 *   并把 meta 从详情页的 translucent 档写回来（SPA 的 meta 是文档级的，不写就停留）。
 *   曾经整站强制 black-translucent 让 fixed 玻璃 navbar 自画状态栏段：系统带照画、
 *   手工玻璃与系统材质对不上，用户三次反馈「两块割裂」—— 解法是不画。
 * - **Android app-plus**：manifest 是 immersed 状态栏，webview 画得到状态栏底下，
 *   滚到顶部时那一条由页面底色承接，所以底色必须涂准。
 *
 * 底色必须给 6 位实色 —— service 的 normalizeHexColor 会把 `var()`/`rgba()` 判非法后回退成黑色。
 *
 * 底色取**页面底色**（与下面 `.conversations-page` 的 `background` 同一个值）：系统玻璃带
 * 采样到的、橡皮筋回弹露出的正是它。涂卡片色（白）会在灰底上留一条接缝。
 *
 * 两个参数给同一个值是刻意的：色带、theme-color、`html`/`body` 背景在这一页都应该是页面底色。
 * `body` 背景平时被 `.conversations-page` 的底色盖住，只在橡皮筋回弹时露出。
 */
function syncConversationListNativeStatusBar() {
  const darkStatusBarBand = isDarkThemeMode()
  const pageSurfaceColor = darkStatusBarBand ? PAGE_SURFACE_DARK : PAGE_SURFACE_LIGHT
  const frontColor = darkStatusBarBand ? "#ffffff" : "#000000"

  try {
    const result = uni.setNavigationBarColor?.({
      frontColor,
      backgroundColor: pageSurfaceColor,
      animation: { duration: 0, timingFunc: "linear" },
    })
    result && typeof (result as Promise<unknown>).catch === "function" && (result as Promise<unknown>).catch(() => {})
  } catch {}

  syncIosStandaloneStatusBar({
    darkStatusBarBand,
    statusBarBackgroundColor: pageSurfaceColor,
    pageBackgroundColor: pageSurfaceColor,
    // 显式钉在 "system" 档（meta=black）：顶上那条带子交给 iOS 自己画（iOS 26/27 的
    // Liquid Glass 滚动边缘带，采样滚动内容），与连接列表同一条系统带。详情页走的是
    // 另一档（"webview"），别照搬过来 —— 本页顶栏 fixed 但全透明，没有底色给系统填。
    iosStatusBarPainter: "system",
  })

  try {
    const nativeNavigator = (globalThis as any).plus?.navigator
    nativeNavigator?.setStatusBarStyle?.(darkStatusBarBand ? "light" : "dark")
  } catch {}
}

function loadStatusModePreference() {
  statusMode.value = readConversationStatusMode()
}

function applyStatusMode(mode: ConversationStatusMode) {
  statusMode.value = writeConversationStatusMode(mode)
  // 可见卡集合变了 → 实时预览订阅要按新集合重新对账。不调这一步，
  // 刚被筛进/筛出视野的会话不会正确订阅或退订实时流（预览文案会一直空着或一直残留）。
  scheduleLivePreviewReconcile()
}

/**
 * 顶栏右侧搜索按钮：展开/收起搜索条。
 *
 * 收起时顺手清掉关键词 —— 不然「关掉搜索但列表还被过滤着」会让用户找不到自己的会话，
 * 而搜索框已经不在屏幕上，没有任何线索说明为什么少了东西。
 */
function toggleSearchBar() {
  const next = !searchVisible.value
  searchVisible.value = next
  if (!next) {
    searchKeyword.value = ""
  }
}

/**
 * 左上角「视图」按钮：一个面板管三件事 —— 状态筛选模式、列表展示形态、是否进入选择。
 *
 * 合并成一张面板而不是多个入口，是因为它们都是「你看到的列表长什么样」这一层的开关；
 * 拆开会让顶栏需要多个按钮，与设计稿「左上角一个筛选」直接冲突。
 *
 * 状态模式（全部 / 进行中 / 已置顶 / 已归档）放在最前：它改变的是「哪些会话存在」，
 * 比「Logo 放哪儿」这种纯排版开关更常切。当前模式在文案上标「· 当前」，让面板自身
 * 兼任状态指示（顶栏那个图标是纯入口，不显示当前选了哪个）。
 */
function openViewFilterSheet() {
  const actions: { label: string; run: () => void }[] = []

  // 一、状态筛选模式。
  for (const mode of buildConversationStatusModeActions(statusMode.value)) {
    actions.push({
      label: mode.label,
      run: () => applyStatusMode(mode.id),
    })
  }

  // 二、列表展示形态（Logo 放哪儿）。
  for (const item of buildConversationListStyleActions(listStyle.value)) {
    actions.push({
      label: item.label,
      run: () => applyListStyle(item.id),
    })
  }

  // 三、选择入口。已经在选择模式里就无条件保留退出项，否则筛选把卡全藏掉后没有出口。
  if (showSelectionEntry.value || selectionMode.value) {
    actions.push({
      label: selectionMode.value ? "退出选择" : "选择会话",
      run: toggleSelectionMode,
    })
  }

  uni.showActionSheet({
    itemList: actions.map((item) => item.label),
    success: (result) => {
      actions[result.tapIndex]?.run()
    },
  })
}

function applyListStyle(style: ConversationListStyleId) {
  listStyle.value = style
  try {
    uni.setStorageSync(CONVERSATION_LIST_STYLE_STORAGE_KEY, JSON.stringify({ style }))
  } catch (error) {
    console.warn("persist conversation list style skipped", error)
  }
  uni.showToast({
    title: `列表：${resolveConversationListStyleLabel(style)}`,
    icon: "none",
  })
}

function restoreListStylePreference() {
  try {
    listStyle.value = normalizeConversationListStyle(
      uni.getStorageSync(CONVERSATION_LIST_STYLE_STORAGE_KEY)
    )
  } catch (error) {
    console.warn("restore conversation list style skipped", error)
    listStyle.value = "logo-prefix"
  }
}

/**
 * 中间连接胶囊：切当前查看的连接。
 *
 * 只有一条连接时不开面板，直接提示 —— 弹一个只有一项的面板比什么都不做更让人困惑。
 */
function openConnectionPicker() {
  const groups = connectionGroups.value
  if (groups.length === 0) {
    uni.showToast({ title: "还没有可用的连接", icon: "none" })
    return
  }
  if (groups.length === 1) {
    uni.showToast({ title: `当前连接：${groups[0].name}`, icon: "none" })
    return
  }

  uni.showActionSheet({
    itemList: groups.map((group) =>
      group.key === activeConnectionGroup.value?.key ? `${group.name} · 当前` : group.name
    ),
    success: (result) => {
      const target = groups[result.tapIndex]
      if (!target || target.key === activeConnectionGroup.value?.key) return
      activeConnectionKey.value = target.key
      // 换连接 = 换一整份会话集合，选择集必须清掉：会话号在不同连接上会重复，
      // 留着旧选择会出现「勾着的会话根本不在当前列表里」。
      clearConversationSelection()
    },
  })
}

function showActiveConnectionError() {
  const group = activeConnectionGroup.value
  if (group) showGroupError(group as ConnectionGroup)
}

/** 行点击/勾选：连接上下文由分组带下来，行组件不必知道连接。 */
function handleFolderCardOpen(folder: { connectionKey: string }, card: LiveSessionCard) {
  handleLiveCardClick(card, folder.connectionKey)
}

function handleFolderCardToggleSelect(folder: { connectionKey: string }, card: LiveSessionCard) {
  toggleConversationSelection(card, folder.connectionKey)
}

/* ── 会话行长按菜单 ────────────────────────────────────────────────── */

function handleRowMenu(folder: { connectionKey: string }, card: DisplayLiveSessionCard) {
  // 选择模式下长按不弹菜单：那时手指在勾选，弹层会直接打断批量操作。
  if (selectionMode.value) return
  // 没有会话号的卡（还没建会话的空标签）没有任何可操作对象。
  if (Number(card?.conversationId || 0) <= 0) return
  rowActionTarget.value = { card, connectionKey: folder.connectionKey }
  rowActionSheetVisible.value = true
}

function closeRowActionSheet() {
  rowActionSheetVisible.value = false
}

function handleRowActionSelect(event: any) {
  const target = rowActionTarget.value
  // 按 index 取回；某些端只给 name，所以用 name 兜底。
  const action = resolveSelectedRowAction(rowActionList.value, event)
  rowActionSheetVisible.value = false
  if (!target || !action) return

  switch (action.id) {
    case "rename":
      requestRenameRowConversation(target)
      break
    case "pin":
    case "unpin":
      void toggleRowConversationPinned(target, action.id === "pin")
      break
    case "archive":
    case "unarchive":
      void toggleRowConversationArchived(target, action.id === "archive")
      break
    case "delete":
      requestDeleteRowConversation(target)
      break
  }
}

/**
 * 取目标会话所在连接的网关。
 *
 * 三个写操作都要它，失败文案也一致（连接断了 / 已删），所以收在一处。
 */
async function resolveRowGateway(connectionKey: string) {
  const conn = findConnectedConnection(connectionKey)
  if (!conn) {
    uni.showToast({ title: "连接不存在或已断开", icon: "none" })
    return null
  }
  try {
    return await openConnectionGateway(conn)
  } catch (error) {
    uni.showToast({ title: toErrorMessage(error), icon: "none", duration: 3000 })
    return null
  }
}

/** 写操作落地后统一刷新：标脏 + 重载，让列表立刻反映新状态。 */
async function refreshAfterRowAction() {
  markConversationListDirty()
  await loadData()
}

function requestRenameRowConversation(target: {
  card: DisplayLiveSessionCard
  connectionKey: string
}) {
  const previousTitle = String(target.card.title || "未命名会话")
  uni.showModal({
    title: "改名",
    editable: true,
    placeholderText: previousTitle,
    success: (result) => {
      if (!result.confirm) return
      const nextTitle = String(result.content || "").trim()
      if (!nextTitle || nextTitle === previousTitle) return
      void renameRowConversation(target, nextTitle)
    },
  })
}

async function renameRowConversation(
  target: { card: DisplayLiveSessionCard; connectionKey: string },
  title: string
) {
  const gateway = await resolveRowGateway(target.connectionKey)
  if (!gateway) return
  try {
    await gateway.call("update_conversation_title", {
      conversationId: Number(target.card.conversationId || 0),
      title,
    })
    uni.showToast({ title: "已改名", icon: "success" })
    await refreshAfterRowAction()
  } catch (error) {
    uni.showToast({ title: toErrorMessage(error, "改名失败"), icon: "none", duration: 3000 })
  }
}

async function toggleRowConversationPinned(
  target: { card: DisplayLiveSessionCard; connectionKey: string },
  pinned: boolean
) {
  const gateway = await resolveRowGateway(target.connectionKey)
  if (!gateway) return
  try {
    await gateway.call(CONVERSATION_PIN_COMMAND, {
      conversationId: Number(target.card.conversationId || 0),
      pinned,
    })
    uni.showToast({ title: pinned ? "已置顶" : "已取消置顶", icon: "success" })
    await refreshAfterRowAction()
  } catch (error) {
    uni.showToast({
      title: toErrorMessage(error, pinned ? "置顶失败" : "取消置顶失败"),
      icon: "none",
      duration: 3000,
    })
  }
}

async function toggleRowConversationArchived(
  target: { card: DisplayLiveSessionCard; connectionKey: string },
  archived: boolean
) {
  const gateway = await resolveRowGateway(target.connectionKey)
  if (!gateway) return
  try {
    await gateway.call("update_conversation_status", {
      conversationId: Number(target.card.conversationId || 0),
      status: archived ? CONVERSATION_ARCHIVED_STATUS : CONVERSATION_UNARCHIVED_STATUS,
    })
    if (archived) {
      // 归档写的是 completed。当前若是「进行中」模式（排除 completed），归档后这条会话会
      // 立刻从列表消失；只弹「已归档」跟被删掉没区别，必须说清去「已归档」视图找回。
      // 其它模式（全部/已置顶/已归档）下它仍在列表里，多说这句反而是噪音。
      uni.showToast({
        title: resolveArchiveSuccessToast(statusMode.value),
        icon: "none",
        duration: 2500,
      })
    } else {
      uni.showToast({ title: "已取消归档", icon: "success" })
    }
    await refreshAfterRowAction()
  } catch (error) {
    uni.showToast({
      title: toErrorMessage(error, archived ? "归档失败" : "取消归档失败"),
      icon: "none",
      duration: 3000,
    })
  }
}

function requestDeleteRowConversation(target: {
  card: DisplayLiveSessionCard
  connectionKey: string
}) {
  // 二次守卫：菜单是按**弹开那一刻**的状态算的，弹出之后会话可能已经开始跑。
  if (!canDeleteConversation(target.card.displayStatus || target.card.status)) {
    uni.showToast({ title: "会话正在进行，无法删除", icon: "none" })
    return
  }
  uni.showModal({
    title: "删除会话",
    content: `确定删除「${String(target.card.title || "未命名会话")}」吗？此操作不可恢复。`,
    confirmColor: "#fa3534",
    success: (result) => {
      if (!result.confirm) return
      void deleteRowConversation(target)
    },
  })
}

async function deleteRowConversation(target: {
  card: DisplayLiveSessionCard
  connectionKey: string
}) {
  try {
    await acpApi.deleteConversation(Number(target.card.conversationId || 0))
    uni.showToast({ title: "已删除", icon: "success" })
    await refreshAfterRowAction()
  } catch (error) {
    uni.showToast({ title: toErrorMessage(error, "删除失败"), icon: "none", duration: 3000 })
  }
}

function scheduleLivePreviewReconcile() {
  if (livePreviewReconcileTimer) {
    clearTimeout(livePreviewReconcileTimer)
  }
  livePreviewReconcileTimer = setTimeout(() => {
    livePreviewReconcileTimer = null
    void reconcileLivePreviewSubscriptions()
  }, 160)
}

function getLivePreviewCandidates() {
  return getDisplayCandidateCards()
}

async function reconcileLivePreviewSubscriptions() {
  if (!livePreviewPageVisible.value || !livePreviewEnabled.value) {
    releaseAllLivePreviewOwnedSessions()
    return
  }

  const candidates = getLivePreviewCandidates()
  const selectedIds = selectConversationLivePreviewIds({ cards: candidates })
  const selectedIdSet = new Set(selectedIds)

  for (const conversationId of Array.from(livePreviewOwnedConversationIds)) {
    if (!selectedIdSet.has(conversationId)) {
      releaseLivePreviewOwnedSession(conversationId)
    }
  }

  await Promise.all(
    selectedIds.map(async (conversationId) => {
      const candidate = candidates.find((item) => item.conversationId === conversationId)
      if (candidate) {
        await ensureLivePreviewSubscription(candidate)
      }
    })
  )
}

async function ensureLivePreviewSubscription(
  candidate: ReturnType<typeof getLivePreviewCandidates>[number]
) {
  const conversationId = Number(candidate.conversationId || 0)
  if (!conversationId || !candidate.instanceKey) return
  if (runtime.getManagedConversation(conversationId)?.connectionId) return
  if (livePreviewConnectPromiseMap.has(conversationId)) {
    return await livePreviewConnectPromiseMap.get(conversationId)
  }

  const task = (async () => {
    try {
      await runtime.connect(
        conversationId,
        normalizeAgentType(candidate.agentType),
        undefined,
        undefined,
        runtime.sessions.get(conversationId)?.lastAppliedSeq ?? undefined,
        candidate.instanceKey
      )
      if (livePreviewTransferredConversationIds.has(conversationId)) {
        return
      }
      if (isLivePreviewCandidateStillSelected(conversationId)) {
        livePreviewOwnedConversationIds.add(conversationId)
      } else {
        runtime.releasePreviewSession(conversationId)
      }
    } catch (error) {
      console.warn("[conversation-list-live-preview] attach skipped", {
        conversationId,
        instanceKey: candidate.instanceKey,
        error,
      })
    }
  })().finally(() => {
    livePreviewConnectPromiseMap.delete(conversationId)
  })

  livePreviewConnectPromiseMap.set(conversationId, task)
  await task
}

function isLivePreviewCandidateStillSelected(conversationId: number) {
  if (!livePreviewPageVisible.value || !livePreviewEnabled.value) return false
  return selectConversationLivePreviewIds({ cards: getLivePreviewCandidates() })
    .includes(conversationId)
}

function transferLivePreviewOwnership(conversationId?: number) {
  const normalizedConversationId = Number(conversationId || 0)
  if (!normalizedConversationId) return
  livePreviewTransferredConversationIds.add(normalizedConversationId)
  livePreviewOwnedConversationIds.delete(normalizedConversationId)
}

function releaseLivePreviewOwnedSession(conversationId: number) {
  livePreviewOwnedConversationIds.delete(conversationId)
  runtime.releasePreviewSession(conversationId)
}

function releaseAllLivePreviewOwnedSessions() {
  for (const conversationId of Array.from(livePreviewOwnedConversationIds)) {
    releaseLivePreviewOwnedSession(conversationId)
  }
}

function buildLivePreviewRuntimeSignature() {
  return Array.from(runtime.sessions.entries())
    .map(([conversationId, session]) => [
      conversationId,
      session.status,
      session.connectionId || "",
      session.pendingPermission ? "permission" : "",
      session.pendingQuestion ? "question" : "",
    ].join(":"))
    .join("|")
}

/**
 * 喂实时预览订阅与批量选择集的展平候选集。
 *
 * 与 `filteredConnectionGroups` 读的是**同一次计算**的另一个字段 —— 见
 * `overviewDisplayModel` 的说明。它此前是一条独立派生，与渲染那条各算一遍。
 */
function getDisplayCandidateCards(): OverviewCandidateCard<LiveSessionCard>[] {
  return overviewDisplayModel.value.candidates
}

function buildLivePreviewCandidateSignature() {
  return getDisplayCandidateCards()
    .map((card) => `${card.groupKey}:${card.conversationId || 0}:${card.displayStatus}`)
    .join("|")
}

function getSelectableLiveCardKeys() {
  return getDisplayCandidateCards()
    .filter((card) => isSelectableOverviewCard(card))
    .map((card) => buildBulkSelectionKey(card.groupKey, Number(card.conversationId || 0)))
}

function buildSelectableLiveCardSignature() {
  return getSelectableLiveCardKeys().join("|")
}

async function loadOverviewDataAfterConnectionPrepare(options?: { force?: boolean }) {
  await prepareOverviewLinkedConnections()
  return await loadOverviewData(options)
}

async function prepareOverviewLinkedConnections() {
  if (overviewConnectionPreparePromise) {
    return await overviewConnectionPreparePromise
  }

  overviewConnectionPreparePromise = prepareOverviewLinkedConnectionsInternal()
  try {
    await overviewConnectionPreparePromise
  } finally {
    overviewConnectionPreparePromise = null
  }
}

async function prepareOverviewLinkedConnectionsInternal() {
  const savedConnections = readStoredConnections()
  if (!savedConnections.length) return

  // 先剪掉已删连接留下的陈旧条目，再按标记挑出要预连的连接。
  // 两步都走 connectedMapStore，与置位共用同一个 key 函数。
  pruneConnectedMap(savedConnections)
  const linkedConnections = filterConnectedConnections(savedConnections)
  if (!linkedConnections.length) return

  const results = await Promise.allSettled(
    linkedConnections.map(async (conn) => {
      const resolved = await resolveConnectionContext(conn)
      const resolvedConnection = resolved.connection as ConnectionItem
      const resolvedKey = connectionKey(resolvedConnection)
      const descriptor = resolved.gateway.getRemoteInstanceDescriptor()
      if (descriptor.instanceKey && resolvedKey) {
        instanceConnectionKeyMap.set(descriptor.instanceKey, resolvedKey)
        connectionInstanceKeyMap.set(resolvedKey, descriptor.instanceKey)
      }
    })
  )
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      const failedConnection = linkedConnections[index]
      console.warn("[conversations] prepare linked connection skipped", {
        connection: failedConnection?.name,
        key: failedConnection ? connectionKey(failedConnection) : "",
        error: result.reason,
      })
    }
  })
}

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
      connectionInstanceKeyMap.clear()
      livePreviewTransferredConversationIds.clear()
      // 角标归 `conversationTabBadgeService` 管，这里只是通知它重算一次
      // （它自己会发现已无连接并清零）。
      void refreshConversationTabBadge()
      return
    }
    const groups = await Promise.all(
      savedConnections.map(async (conn) => {
        if (!isConnectionConnected(conn)) {
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
    lastOverviewLoadedAt = Date.now()
  } finally {
    loading.value = false
  }
}

async function loadConnectionGroup(conn: ConnectionItem): Promise<ConnectionGroup> {
  const gateway = await openConnectionGateway(conn)
  const descriptor = gateway.getRemoteInstanceDescriptor()
  void ensureGlobalConversationSync(descriptor.instanceKey).catch((error) => {
    console.warn("ensure global conversation sync skipped:", error)
  })
  ensureOpenedTabsSubscription(descriptor.instanceKey)
  ensureActiveSessionsSubscription(descriptor.instanceKey)
  ensureBridgeRecoverySubscription(descriptor.instanceKey)
  ensureBulkChangedSubscription(descriptor.instanceKey)
  const foldersRaw = await gateway.call<unknown>("list_open_folder_details")
  const folders = normalizeGatewayList(foldersRaw) as Project[]
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
    targetAgent: conn.targetAgent,
    routeMode: conn.routeMode,
    baseUrl: connectionBaseUrl(conn),
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
  return normalizeGatewayList(conversationsRaw) as Conversation[]
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
  tabs: OpenedTabItem[],
  options?: { reconcile?: boolean }
): Promise<ConnectionGroup> {
  const gateway = await openConnectionGateway(conn)
  const descriptor = gateway.getRemoteInstanceDescriptor()
  const remoteConversations = await fetchRemoteConversations(gateway, folders)
  await persistConversationSummaries(descriptor.instanceKey, remoteConversations, {
    // 对账范围严格等于本次请求过的 folder：`fetchRemoteConversations` 就是拿
    // `folders.map(f => f.id)` 当 `folderIds` 的，响应只对它们权威。
    reconcileFolderIds: options?.reconcile
      ? folders.map((folder) => Number(folder.id)).filter((id) => Number.isFinite(id) && id > 0)
      : undefined,
  })
  return buildConnectionGroupSnapshot({
    conn,
    folders,
    tabs,
    conversations: remoteConversations,
  })
}

async function refreshConnectionGroupFromRemote(
  conn: ConnectionItem,
  current: ConnectionGroup,
  options?: { reconcile?: boolean }
) {
  const gateway = await openConnectionGateway(conn)
  const descriptor = gateway.getRemoteInstanceDescriptor()
  void ensureGlobalConversationSync(descriptor.instanceKey).catch((error) => {
    console.warn("ensure global conversation sync skipped:", error)
  })
  ensureOpenedTabsSubscription(descriptor.instanceKey)
  ensureActiveSessionsSubscription(descriptor.instanceKey)
  ensureBridgeRecoverySubscription(descriptor.instanceKey)
  ensureBulkChangedSubscription(descriptor.instanceKey)
  const foldersRaw = await gateway.call<unknown>("list_open_folder_details")
  const folders = normalizeGatewayList(foldersRaw) as Project[]
  const tabsRaw = await gateway.call<unknown>("list_opened_tabs")
  const tabsSnapshot = normalizeOpenedTabsResponse(descriptor.instanceKey, tabsRaw)
  const tabs = tabsSnapshot.items
  rememberConnectionRemoteState(connectionKey(conn), descriptor.instanceKey, folders, tabs)
  const nextGroup = await loadRemoteConnectionSnapshot(conn, folders, tabs, {
    reconcile: options?.reconcile,
  })
  replaceConnectionGroup(nextGroup)
}

/**
 * 重连 / 批量变更后的**权威重取**：一次把 folder、标签、会话全部拉回来，并对账掉远端
 * 已经不存在的本地摘要。
 *
 * 走 `refreshConnectionGroupFromRemote` 而不是 `refreshOverviewFromRemoteByInstance`，
 * 原因有三：后者在页面不可见时直接早退、缓存缺失时静默 bail，而且它复用**缓存的**
 * folders/tabs —— 而 `folder://changed` 客户端从未订阅，断线期间 PC 上新开/关闭的
 * folder 只有重拉 `list_open_folder_details` 才能发现。
 *
 * 也刻意不走 `loadOverviewData({ force: true })`：那个入口的 `overviewLoadPromise`
 * 是 promise 共享而非队列，force 撞上正在飞的非强制加载时会被静默吞掉。
 */
async function refreshConnectionGroupAuthoritative(instanceKey: string, reason: string) {
  if (!instanceKey) return

  const mappedConnKey = instanceConnectionKeyMap.get(instanceKey) || ""
  if (!mappedConnKey) return
  const conn = findConnectedConnection(mappedConnKey)
  if (!conn) return
  const current = connectionGroups.value.find(
    (group) => connectionKey(group.connection) === mappedConnKey
  )
  if (!current) return

  try {
    await refreshConnectionGroupFromRemote(conn, current, { reconcile: true })
  } catch (error) {
    console.warn("authoritative conversation refresh skipped:", { instanceKey, reason, error })
  }
}

async function refreshConnectionGroupFromLocalCache(instanceKey: string) {
  const descriptor = getRegisteredRemoteInstanceDescriptor(instanceKey)
  if (!descriptor) {
    await loadOverviewData({ force: true })
    return
  }

  const mappedConnKey = instanceConnectionKeyMap.get(instanceKey) || ""
  if (!mappedConnKey) {
    await loadOverviewData({ force: true })
    return
  }
  const conn = findConnectedConnection(mappedConnKey)
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

function scheduleActiveSessionsOverviewRefresh(instanceKey: string) {
  if (!instanceKey) return
  if (!livePreviewPageVisible.value) return
  const existing = activeSessionsRefreshTimerMap.get(instanceKey)
  if (existing) {
    clearTimeout(existing)
  }
  const timer = setTimeout(() => {
    activeSessionsRefreshTimerMap.delete(instanceKey)
    void refreshOverviewFromRemoteByInstance(instanceKey)
  }, ACTIVE_SESSIONS_REFRESH_DEBOUNCE_MS)
  activeSessionsRefreshTimerMap.set(instanceKey, timer)
}

async function refreshOverviewFromRemoteByInstance(instanceKey: string) {
  if (!livePreviewPageVisible.value) return
  if (!getRegisteredRemoteInstanceDescriptor(instanceKey)) return

  const mappedConnKey = instanceConnectionKeyMap.get(instanceKey) || ""
  if (!mappedConnKey) return
  const conn = findConnectedConnection(mappedConnKey)
  if (!conn) return

  const connKey = connectionKey(conn)
  const folders = connectionFolderSnapshotMap.get(connKey)
  const tabs = connectionTabSnapshotMap.get(connKey)
  if (!folders || !tabs) return

  try {
    const gateway = await openConnectionGateway(conn)
    await scheduleOverviewConversationRefresh({
      conn,
      gateway,
      instanceKey,
      folders,
      tabs,
    })
  } catch (error) {
    console.warn("refresh overview from pet://sessions skipped:", error)
  }
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
  conversations: Conversation[],
  options?: { reconcileFolderIds?: number[] }
) {
  try {
    await ensureConversationSchema()
    await upsertConversationSummaries(
      conversations.map((conversation) =>
        mapConversationToSummaryRecord(instanceKey, conversation)
      )
    )
    await reconcileMissingConversationSummaries(
      instanceKey,
      conversations,
      options?.reconcileFolderIds
    )
  } catch (error) {
    console.warn("persist conversation summaries skipped:", error)
  }
}

/**
 * 把远端**没有返回**的会话在本地打墓碑。只有「权威重取」路径会传
 * `reconcileFolderIds` —— 实时推送路径绝不能传。
 *
 * 单条 `conversation://changed` 事件不携带「该 folder 的全集」，拿它对账等于按一条
 * 消息删掉整个 folder。所以这里只认调用方显式给出的 folder 列表，且那个列表必须正是
 * 本次 `list_all_conversations` 请求过的 `folderIds`（响应只对这些 folder 权威）。
 */
async function reconcileMissingConversationSummaries(
  instanceKey: string,
  conversations: Conversation[],
  reconcileFolderIds?: number[]
) {
  if (!Array.isArray(reconcileFolderIds) || reconcileFolderIds.length === 0) return

  for (const rawFolderId of reconcileFolderIds) {
    const folderId = Number(rawFolderId)
    if (!Number.isFinite(folderId) || folderId <= 0) continue

    const presentIds = conversations
      .filter((conversation) => Number(conversation.folder_id) === folderId)
      .map((conversation) => Number(conversation.id))
      .filter((id) => Number.isFinite(id) && id > 0)

    try {
      const removed = await markMissingConversationSummariesDeleted({
        instanceKey,
        folderId,
        presentIds,
      })
      if (removed > 0) {
        console.info("[conversation-list] reconciled stale summaries", {
          instanceKey,
          folderId,
          removed,
        })
      }
    } catch (error) {
      console.warn("reconcile conversation summaries skipped:", error)
    }
  }
}

function buildConnectionGroupSnapshot(input: {
  conn: ConnectionItem
  folders: Project[]
  tabs: OpenedTabItem[]
  conversations: Conversation[]
}): ConnectionGroup {
  const snapshot = buildConnectionConversationSnapshot({
    connectionKey: connectionKey(input.conn),
    connectionName: input.conn.name,
    targetAgent: input.conn.targetAgent,
    routeMode: input.conn.routeMode,
    baseUrl: connectionBaseUrl(input.conn),
    folders: input.folders,
    tabs: input.tabs,
    conversations: input.conversations,
  })
  // `cards` 直接透传 snapshot 的顺序（纯按活跃时间降序，见
  // `buildConnectionConversationSnapshot`）。这里曾经写成
  // `[...openTabCards, ...recentActiveCards]`，把标签整体钉在前面 —— 于是几天前的
  // 标签压在 5 分钟前的会话上面，看着像没排序。`conversationLivePreviewLayout.spec`
  // 用 `cards: snapshot.cards` 这个字面量把它钉死。
  return {
    ...snapshot,
    cards: snapshot.cards,
  }
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
  if (key && instanceKey) {
    connectionInstanceKeyMap.set(key, instanceKey)
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

/**
 * 页面侧只关心「有会话在跑 → 顺带刷新列表」。
 *
 * **角标不再由这里维护** —— 它归 `conversationTabBadgeService`（由 App.vue 启动）。
 * 原先角标的订阅活在本页生命周期里，而 App 冷启动落在「连接」页，本页可能整个会话期间
 * 都没挂载过，角标于是从来不显示；`onUnload` 又会把订阅拆掉。角标恰恰是给「不在本页时」
 * 看的东西，生命周期不能绑在本页上。
 */
function ensureActiveSessionsSubscription(instanceKey: string) {
  if (!instanceKey || disposeActiveSessionsChangedMap.has(instanceKey)) return
  const unsubscribe = acpApi.subscribeGlobalEvent("pet://sessions", (payload) => {
    // 待回复 chip 走**立即**路径：ingest + 版本号 +1，`overviewDisplayModel` 当场重算。
    // 不能等下面那个 debounce —— 那条是「重新拉一遍会话列表」，秒级延迟对刷新标题/活跃时间
    // 无所谓，但「智能体在等你回话」晚一秒出现就是一秒的空等。
    //
    // 这里与 `conversationTabBadgeService` 的 ingest 重复调用是无害的：同一份载荷归一化出
    // 同一个 Map，幂等。两处都留是因为它们的生命周期不同 —— 服务那份保证列表页没挂载时也是
    // 热的，页面这份保证页面在时不依赖服务的调度时机。
    ingestPetSessionsPayload(instanceKey, payload)
    awaitingReplyVersion.value = getAwaitingReplyStoreVersion()

    if (livePreviewPageVisible.value) {
      scheduleActiveSessionsOverviewRefresh(instanceKey)
    }
  }, instanceKey)
  disposeActiveSessionsChangedMap.set(instanceKey, unsubscribe)
}

/**
 * 重连后重新获取：断线期间服务端**不入队**事件（无订阅者时直接丢弃），且
 * `/ws/events` 的帧上没有 event id，所以丢掉的 `conversation://changed` 无从补发。
 * 唯一可靠的补救是「重连成功时重新拉一次权威数据」。
 *
 * 判据在 `shouldRefetchAfterBridgeRecovered` 里（纯模块、可测），它挡掉首连：
 * `subscribeRealtimeBridgeHealth` 订阅瞬间会推一个合成 `idle`，紧随其后的 `connected`
 * 是首连而非重连。`reconnectAttempt` 在这里没用 —— 它在发 health 之前就被归零了。
 */
function ensureBridgeRecoverySubscription(instanceKey: string) {
  if (!instanceKey || disposeBridgeHealthMap.has(instanceKey)) return
  const unsubscribe = acpApi.subscribeRealtimeBridgeHealth((health) => {
    const previousState = lastBridgeStateMap.get(instanceKey) || null
    lastBridgeStateMap.set(instanceKey, health.state)
    if (shouldRefetchAfterBridgeRecovered({ previousState, nextState: health.state })) {
      void refreshConnectionGroupAuthoritative(instanceKey, "bridge_recovered")
    }
  }, instanceKey)
  disposeBridgeHealthMap.set(instanceKey, unsubscribe)
}

/**
 * 批量导入完成后的一次性提醒。服务端刻意为它开了独立通道而非
 * `conversation://changed` 的第四种 kind，注释里写明契约就是「clients respond with a
 * single full refetch」—— payload 只有 `{ imported, updated, folder_ids }`，不含会话内容。
 * 所以这里只用它触发权威重取，不解析 payload。
 */
function ensureBulkChangedSubscription(instanceKey: string) {
  if (!instanceKey || disposeBulkChangedMap.has(instanceKey)) return
  const unsubscribe = acpApi.subscribeGlobalEvent(
    "conversations://bulk-changed",
    () => {
      void refreshConnectionGroupAuthoritative(instanceKey, "bulk_changed")
    },
    instanceKey
  )
  disposeBulkChangedMap.set(instanceKey, unsubscribe)
}

function replaceConnectionGroup(nextGroup: ConnectionGroup) {
  const index = connectionGroups.value.findIndex((group) => group.key === nextGroup.key)
  if (index < 0) return
  const nextGroups = [...connectionGroups.value]
  nextGroups.splice(index, 1, nextGroup)
  connectionGroups.value = nextGroups
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  }
  return ""
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

function normalizeConversationStatus(value?: string): string {
  return normalizeConversationSummaryStatus(value)
}

/**
 * 把全局 auth 切到这条连接上。薄封装保留是为了让页面里的调用点读起来仍是本地动作 ——
 * 真正的实现（含「缺凭据时什么都不做」那道守卫）在 `connectionAccess`。
 */
function syncAuthToConnection(conn: ConnectionItem) {
  applyConnectionAuth(conn)
}

function loadData() {
  return loadOverviewDataAfterConnectionPrepare({ force: true })
}

function goToConnections() {
  uni.switchTab({ url: "/pages/connections/index" })
}

function isConversationSelected(
  card: LiveSessionCard,
  connectionKeyValue: string
): boolean {
  const conversationId = Number(card.conversationId || 0)
  if (!connectionKeyValue || conversationId <= 0) return false
  return Boolean(selectedConversationMap.value[
    buildBulkSelectionKey(connectionKeyValue, conversationId)
  ])
}

function toggleConversationSelection(card: LiveSessionCard, connectionKeyValue: string) {
  const item = buildBulkSelectionItem(card, connectionKeyValue)
  if (!item) return
  const next = { ...selectedConversationMap.value }
  if (next[item.key]) {
    delete next[item.key]
  } else {
    next[item.key] = item
  }
  selectedConversationMap.value = next
}

function clearConversationSelection() {
  selectedConversationMap.value = {}
}

function toggleSelectionMode() {
  selectionMode.value = !selectionMode.value
  if (!selectionMode.value) {
    clearConversationSelection()
  }
}

function exitSelectionMode() {
  selectionMode.value = false
  clearConversationSelection()
}

function openBulkSendDialog() {
  if (selectedBulkCount.value === 0) {
    uni.showToast({ title: "请先勾选会话", icon: "none" })
    return
  }
  bulkSendText.value = ""
  showBulkSendDialog.value = true
}

function closeBulkSendDialog() {
  if (bulkSending.value) return
  showBulkSendDialog.value = false
}

function applyBulkQuickText(text: string) {
  bulkSendText.value = text
}

function handleLiveCardClick(card: LiveSessionCard, groupKey: string) {
  if (selectionMode.value) {
    toggleConversationSelection(card, groupKey)
    return
  }
  openLiveSession(card, groupKey)
}

function openLiveSession(card: LiveSessionCard, groupKey?: string) {
  if (!card.conversationId) {
    uni.showToast({ title: "该标签暂无会话记录", icon: "none" })
    return
  }
  transferLivePreviewOwnership(card.conversationId)
  openConversation({
    id: card.conversationId,
    folder_id: card.folderId,
    agent_type: card.agentType,
    title: card.title,
    status: card.status,
    updated_at: card.updatedAt,
  }, groupKey)
}

async function openConversation(conv: Conversation, connKey?: string) {
  const conn = connKey ? findConnectedConnection(connKey) : undefined
  if (conn) {
    syncAuthToConnection(conn)
  }
  const targetFolderId = Number(conv.folder_id || 0)
  if (conn && targetFolderId > 0 && Number(conv.id || 0) > 0) {
    try {
      const gateway = await openConnectionGateway(conn)
      await ensureConversationTab({
        instanceKey: gateway.getRemoteInstanceDescriptor().instanceKey,
        gateway,
        folderId: targetFolderId,
        conversationId: Number(conv.id || 0),
        agentType: conv.agent_type,
        activation: "allow",
        origin: "mcode-mobile-open",
      })
    } catch (error) {
      console.warn("ensure conversation tab before open skipped:", error)
    }
  }
  const encodedConnectionId = conn?.id ? encodeURIComponent(conn.id) : ""
  uni.navigateTo({
    url: `/pages/conversation-detail/index?id=${conv.id}&folderId=${conv.folder_id || 0}${encodedConnectionId ? `&connectionId=${encodedConnectionId}` : ""}`,
  })
}

/**
 * 打开新建会话弹层。**只负责打开** —— 弹层内部的初始化（按默认连接选项目、填缓存的
 * 智能体列表）由子组件在 `show` 变 true 时自己做。页面留着这个函数是因为顶栏的
 * `@create` 事件要有落点，而 `showCreateDialog` 的所有权在页面（v-model 的那一半）。
 *
 * 不预选文件夹：顶栏的「＋」是「新建一个会话，建在哪儿待定」。
 */
function createConversation() {
  createSheetDefaultConnectionKey.value = ""
  createSheetDefaultFolderId.value = 0
  showCreateDialog.value = true
}

/**
 * 文件夹头的「＋」：**在这个文件夹里**新建会话。
 *
 * 预选连接 + 文件夹，用户打开弹层后只剩「填写任务内容 → 创建」一步 —— 他刚点开的
 * 那个文件夹就是目的地，没必要再让他去项目 Picker 里重新找一遍。
 *
 * `folderId = 0`（「未归类」）时不预选：那是服务端没有归属的会话，弹层里让用户自己
 * 挑一个项目，比硬塞一个错的项目好。
 */
function createConversationInFolder(folder: { connectionKey: string; folderId: number }) {
  createSheetDefaultConnectionKey.value = folder.connectionKey
  createSheetDefaultFolderId.value = folder.folderId > 0 ? folder.folderId : 0
  showCreateDialog.value = true
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

/**
 * 会话创建成功后的页面级收尾：刷新列表、更新角标、跳详情页。
 *
 * **永远归页面**，不能搬进弹层 —— 它依赖 `loadOverviewData`（列表数据源）与
 * `openConversation`（路由 + PC 标签预热）。子组件只负责把创建做到「拿到
 * conversationId」为止，然后把这三个字段交出来。
 */
async function handleConversationCreated(payload: {
  conversationId: number
  folderId: number
  connectionKey: string
}) {
  markConversationListDirty()
  await loadOverviewData({ force: true })
  await refreshConversationTabBadge()
  openConversation(
    { id: payload.conversationId, folder_id: payload.folderId },
    payload.connectionKey
  )
}

async function confirmBulkSend() {
  if (bulkSendSubmitDisabled.value) return
  const text = bulkSendText.value.trim()
  const items = [...selectedBulkItems.value]
  if (!text || items.length === 0) return

  bulkSending.value = true
  let successCount = 0
  let failureCount = 0

  try {
    for (const item of items) {
      try {
        await sendBulkSelectionItem(item, text)
        successCount += 1
      } catch (error) {
        failureCount += 1
        console.warn("[conversation-list-bulk-send] item failed", {
          conversationId: item.conversationId,
          connectionKey: item.connectionKey,
          error,
        })
      }
    }

    if (successCount > 0) {
      showBulkSendDialog.value = false
      exitSelectionMode()
      markConversationListDirty()
      await loadOverviewData({ force: true })
      await refreshConversationTabBadge()
    }

    const title = failureCount > 0
      ? `已发送 ${successCount} 个，失败 ${failureCount} 个`
      : `已发送 ${successCount} 个会话`
    uni.showToast({
      title,
      icon: successCount > 0 ? "success" : "none",
      duration: 3000,
    })
  } finally {
    bulkSending.value = false
  }
}

async function sendBulkSelectionItem(item: BulkSelectionItem, text: string) {
  const conn = findConnectedConnection(item.connectionKey)
  if (!conn) {
    throw new Error("连接不存在或已断开")
  }

  const gateway = await openConnectionGateway(conn)
  syncAuthToConnection(conn)
  const instanceKey = gateway.getRemoteInstanceDescriptor().instanceKey

  await ensureConversationTab({
    instanceKey,
    gateway,
    folderId: item.folderId,
    conversationId: item.conversationId,
    agentType: item.agentType,
    activation: "preserve",
    origin: "mcode-mobile-bulk-send",
  })

  const connectionId = await ensureBulkSendConnection(item, instanceKey)
  if (!connectionId) {
    throw new Error("未连接到代理")
  }

  await gateway.call("acp_prompt", {
    connectionId,
    blocks: [{ type: "text", text }],
    folderId: item.folderId,
    conversationId: item.conversationId,
  })
}

async function ensureBulkSendConnection(
  item: BulkSelectionItem,
  instanceKey: string
): Promise<string> {
  const managedConnectionId =
    runtime.getManagedConversation(item.conversationId)?.connectionId ||
    runtime.sessions.get(item.conversationId)?.connectionId ||
    ""
  if (managedConnectionId) return managedConnectionId

  const recovered = await runtime.connect(
    item.conversationId,
    normalizeAgentType(item.agentType),
    undefined,
    undefined,
    runtime.sessions.get(item.conversationId)?.lastAppliedSeq ?? undefined,
    instanceKey
  )
  return firstString(
    recovered?.id,
    runtime.getManagedConversation(item.conversationId)?.connectionId,
    runtime.sessions.get(item.conversationId)?.connectionId
  )
}

function formatTime(time?: string): string {
  return formatOverviewRelativeTime(time)
}
</script>

<style scoped lang="scss">

/*
 * 悬浮胶囊底栏（`McodeTabBar`）是 `position: fixed`，原生 tabBar 已被隐藏 ——
 * 所以页面必须自己留出「12 + 62 + 安全区(底内距由安全区提供)」再加安全区，否则最后一段内容被胶囊压住。
 *
 * 用显式 class 而不是 `.page:has(.mc-tabbar)`：`:has()` 要 iOS 15.4+，
 * 而这个 app 的 iOS 最低版本比它低，老机器上会整条规则失效（不是降级，是完全没有留白）。
 */
.page.page--with-tabbar {
  padding-bottom: calc(74px + env(safe-area-inset-bottom)) !important;
}

/* 与子组件共用的规则（弹层外壳/头部、表单行、agent logo 修饰符、安全区占位）。
 * scoped 样式不跨组件边界，所以子组件也 `@import` 同一份 —— 详见该文件头部说明。 */
@import "./index.scss";

.page {
  min-height: 100vh;
  padding: 0 !important;
}

.conversations-page {
  position: relative;
  /*
   * 灰底白卡：与连接列表同构（浅 #F2F2F7 中性纸面 + 白色圆角卡片浮起）。
   *
   * 这两个色值与 `<script>` 里的 `PAGE_SURFACE_LIGHT` / `PAGE_SURFACE_DARK` 是同一对
   * （顶部状态栏色带要用它们），改一处必须改另一处 —— `conversationsStatusBar.spec.ts`
   * 会比对两处，防止只改一半又长出接缝。
   *
   * 旧版是近乎纯白的 `--up-page-bg-color`，文件夹分组又是直接压在底色上的裸列表，
   * 白卡与底色几乎没有层次、看着发空。统一取连接列表的设计稿值：浅色用中性灰、深色
   * 用纯黑，白色卡片（`ConversationFolderSection` 的 `.conv-group__card`）才能浮起来。
   */
  background: #f2f2f7;
}

[data-up-theme='dark'] .conversations-page {
  /* 深色下比 --up-page-bg-color 更黑一档，卡片（深色表面）才沉得下去。 */
  background: #000000;
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

.main-wrap {
  width: 100%;
  flex: 1;
  min-height: 0;
}

.main-wrap--overview {
  display: block;
}

/* ── 会话总览（M08）─────────────────────────────────────────────────────
 *
 * 设计稿的结构：内容容器 `padding: 4px 16px 0`、分组之间 `gap: 22px`；
 * 每个文件夹分组内部「头 → 列表」之间 `gap: 8px`；列表整体再左缩进 12px。
 * 这三层内距是**不同层级**的，不能合并 —— 合并后分组之间的呼吸感会一起消失。
 */
.conv-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.conv-scroll {
  width: 100%;
}

.conv-content {
  display: flex;
  flex-direction: column;
  gap: 22px;
  /* 左右 16px 由 `.conversations-shell` 的 `padding: 0 32rpx` 提供（32rpx ≈ 16px @393），
     这里只补上内距 —— 两层都加就会变成 32px。 */
  padding: 4px 0 0;
  box-sizing: border-box;
}

/*
 * 选择模式：批量条浮在底栏之上，最后几条会话会被它压住。
 * 补一段与批量条等高的尾部余量，滚到底时最后一行仍能完整露出来。
 */
.conv-content--selecting {
  padding-bottom: 84px;
}

/* 连接加载失败横幅。原先是分组头右侧的小感叹号，分组改成文件夹后它没有归属了。 */
.conv-error-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--up-error, #fa3534) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--up-error, #fa3534) 18%, transparent);
}

.conv-error-banner__text {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  line-height: 16px;
  color: var(--up-error, #fa3534);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

/* ===== 创建弹层 ===== */
.bulk-action-bar {
  position: fixed;
  left: 24rpx;
  right: 24rpx;
  /*
   * 悬浮胶囊底栏（`McodeTabBar`，高 62px + 上内距 12 / 下内距 8）是 fixed 且 z-index 20。
   * 批量条原先 `bottom: 24rpx` —— 正好骑在底栏上，两枚胶囊叠成一团，看起来就是「乱了」。
   * 抬到胶囊之上（90px = 留白 82 + 两枚胶囊之间留 8 的缝），选择时才两层都读得清。
   */
  bottom: calc(82px + env(safe-area-inset-bottom));
  z-index: 30;
  padding: 18rpx 18rpx;
  border-radius: 28rpx;
  background: var(--up-card-bg-color, #ffffff) !important;
  border: 1rpx solid var(--up-border-color, #dadbde);
  box-shadow: 0 18rpx 52rpx rgba(15, 23, 42, 0.16) !important;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
}

.bulk-action-bar__summary {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.bulk-action-bar__title {
  font-size: 26rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
  /* 数字涨到三位数时也别把按钮挤成一条线 —— 摘要自己先截断。 */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bulk-action-bar__hint {
  font-size: 22rpx;
  color: var(--up-tips-color, #909193);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 批量发送弹层的专属内容（外壳/头部/表单行/安全区全部来自共享样式表的
   `.create-sheet`，那份由页面与 `CreateConversationSheet` 双方 @import）。 */
.bulk-send-warning {
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
  padding: 18rpx 20rpx;
  border-radius: 22rpx;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 9%, var(--up-card-bg-color, #ffffff) 91%);
  border: 1rpx solid color-mix(in srgb, var(--up-primary, #2979ff) 20%, var(--up-border-color, #dadbde) 80%);
  margin-bottom: 24rpx;
}

.bulk-send-warning__text {
  flex: 1;
  min-width: 0;
  font-size: 24rpx;
  line-height: 1.45;
  color: var(--up-main-color, #303133);
}

.bulk-send-targets {
  margin-bottom: 24rpx;
  padding: 0 4rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.bulk-send-targets__title {
  font-size: 26rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.bulk-send-targets__hint {
  font-size: 22rpx;
  line-height: 1.4;
  color: var(--up-content-color, #606266);
}

.bulk-quick-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.bulk-quick-chip {
  min-height: 52rpx;
  padding: 0 24rpx;
  border-radius: 999rpx;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 10%, var(--up-card-bg-color, #ffffff) 90%);
  border: 1rpx solid color-mix(in srgb, var(--up-primary, #2979ff) 26%, var(--up-border-color, #dadbde) 74%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.bulk-quick-chip__text {
  font-size: 24rpx;
  font-weight: 700;
  color: var(--up-primary, #2979ff);
}


</style>
