<template>
  <view class="page">
    <view v-if="loading" class="loading-container">
      <up-loading-page :loading="loading" loading-text="加载中..."></up-loading-page>
    </view>

    <view v-else-if="!conversationId" class="empty-container">
      <up-empty mode="data" text="会话不存在"></up-empty>
    </view>

    <view v-else class="detail-container">
      <view class="toolbar">
        <view class="toolbar-left">
          <view class="runtime-dot" :class="`runtime-dot--${runtimeStatusClass}`"></view>
          <text class="runtime-label">{{ runtimeStatusLabel }}</text>
        </view>
        <view class="toolbar-right">
          <ExpertMenu @select="handleCommandSelect" />
          <view
            class="icon-btn"
            :class="{ 'icon-btn--disabled': loading }"
            @click="refreshConversation"
          >
            <up-loading-icon
              v-if="loading"
              mode="circle"
              size="18"
              color="#606266"
            ></up-loading-icon>
            <up-icon v-else name="reload" size="20" color="#606266"></up-icon>
          </view>
          <view
            v-if="runtimeStatus === 'thinking' || runtimeStatus === 'running_tool'"
            class="icon-btn icon-btn--danger"
            @click="cancelGeneration"
          >
            <up-icon name="close-circle" size="20" color="#fa3534"></up-icon>
          </view>
        </view>
      </view>

      <view v-if="sharedLiveHint" class="shared-live-hint">
        <text class="shared-live-hint__text">{{ sharedLiveHint }}</text>
      </view>

      <view v-if="historyStatusText" class="history-status">
        <up-loading-icon v-if="loadingOlder" mode="circle" size="16" color="#909399"></up-loading-icon>
        <text class="history-status__text">{{ historyStatusText }}</text>
      </view>

      <scroll-view
        class="message-list"
        scroll-y
        :style="messageListStyle"
        :upper-threshold="120"
        :scroll-into-view="scrollIntoView"
        :scroll-top="scrollTop"
        :scroll-with-animation="true"
        @scrolltoupper="handleMessageReachTop"
        @scroll="handleMessageScroll"
      >
        <view class="message-list__content">
          <view v-if="messages.length === 0" class="empty-messages">
            <up-empty mode="message" text="开始新的对话吧"></up-empty>
          </view>

          <view
            v-for="(msg, index) in messages"
            :key="msg.id"
            :id="messageAnchorId(msg.id)"
            class="message-item"
          >
            <MessageBubble
              :message="msg"
              :agent-type="currentAgentType"
              :showRegenerate="index === messages.length - 1 && msg.role === 'assistant'"
              @regenerate="regenerateLastMessage"
            />
          </view>

          <view v-if="stats.totalTokens > 0" class="stats-bar">
            <up-icon name="file-text" size="14" color="#c0c4cc"></up-icon>
            <text class="stats-text">
              {{ stats.inputTokens }} / {{ stats.outputTokens }} / {{ stats.totalTokens }} tokens
            </text>
          </view>

          <view id="message-list-bottom" class="list-bottom"></view>
        </view>
      </scroll-view>

      <view class="input-wrap">
        <view v-if="pendingPermissionCard" class="permission-card">
          <view class="permission-card__header">
            <view class="permission-card__badge"></view>
            <text class="permission-card__title">需要授权</text>
          </view>
          <text class="permission-card__desc">{{ pendingPermissionDescription }}</text>
          <view
            v-if="pendingPermissionCard.options.length > 0"
            class="permission-card__actions"
          >
            <view
              v-for="option in pendingPermissionCard.options"
              :key="option.id"
              class="permission-card__option"
            >
              <button
                class="permission-card__action"
                :class="{
                  'permission-card__action--loading': permissionSubmitting && pendingPermissionSubmittingOptionId === option.id,
                }"
                :disabled="permissionSubmitting"
                @click="respondToPermission(option.id)"
              >
                {{
                  permissionSubmitting && pendingPermissionSubmittingOptionId === option.id
                    ? "提交中..."
                    : option.label
                }}
              </button>
              <text v-if="option.description" class="permission-card__option-desc">
                {{ option.description }}
              </text>
            </view>
          </view>
          <text v-else class="permission-card__empty">当前授权请求没有可用选项</text>
        </view>

        <view v-if="showComposerTools" class="composer-tools">
          <view class="composer-tools__section">
            <text class="composer-tools__title">快捷操作</text>
            <view class="composer-tools__actions">
              <view class="composer-tools__action" @click="toggleAttachmentKinds">
                <text class="composer-tools__action-text">附件上传</text>
              </view>
              <view class="composer-tools__action" @click="openTodoPicker">
                <text class="composer-tools__action-text">从待办选择获取任务</text>
              </view>
            </view>
            <view v-if="showAttachmentKinds" class="composer-tools__subactions">
              <view class="composer-tools__subaction" @click="handleChooseImages">图片</view>
              <view class="composer-tools__subaction" @click="handleChooseFiles">文件</view>
            </view>
          </view>

          <view class="composer-tools__section">
            <text class="composer-tools__title">会话配置</text>
            <view
              :class="['composer-config-row', !hasModelOptions && 'composer-config-row--disabled']"
              @click="toggleConfigRow('model')"
            >
              <text class="composer-config-row__label">模型</text>
              <text class="composer-config-row__value">{{ modelSummary }}</text>
            </view>
            <view
              v-if="expandedConfigKey === 'model' && detailAgentConfig.modes?.available_modes?.length"
              class="config-chip-grid"
            >
              <view
                v-for="mode in detailAgentConfig.modes?.available_modes || []"
                :key="mode.id"
                :class="['config-chip', detailAgentConfig.selectedModeId === mode.id && 'config-chip--active']"
                @click.stop="selectDetailMode(mode.id)"
              >
                <text class="config-chip__title">{{ mode.name }}</text>
              </view>
            </view>
            <view
              v-else-if="expandedConfigKey === 'model' && modelOption"
              class="config-chip-grid"
            >
              <view
                v-for="value in modelOption.kind.options"
                :key="value.value"
                :class="[
                  'config-chip',
                  detailAgentConfig.selectedValues[modelOption.id] === value.value && 'config-chip--active',
                ]"
                @click.stop="selectDetailConfigValue(modelOption.id, value.value)"
              >
                <text class="config-chip__title">{{ value.name }}</text>
              </view>
            </view>

            <view
              :class="['composer-config-row', !reasoningOption && 'composer-config-row--disabled']"
              @click="toggleConfigRow('reasoning')"
            >
              <text class="composer-config-row__label">推理强度</text>
              <text class="composer-config-row__value">{{ reasoningSummary }}</text>
            </view>
            <view
              v-if="expandedConfigKey === 'reasoning' && reasoningOption"
              class="config-chip-grid"
            >
              <view
                v-for="value in reasoningOption.kind.options"
                :key="value.value"
                :class="[
                  'config-chip',
                  detailAgentConfig.selectedValues[reasoningOption.id] === value.value && 'config-chip--active',
                ]"
                @click.stop="selectDetailConfigValue(reasoningOption.id, value.value)"
              >
                <text class="config-chip__title">{{ value.name }}</text>
              </view>
            </view>

            <view
              :class="['composer-config-row', !permissionOption && 'composer-config-row--disabled']"
              @click="toggleConfigRow('permission')"
            >
              <text class="composer-config-row__label">授权类型</text>
              <text class="composer-config-row__value">{{ permissionSummary }}</text>
            </view>
            <view
              v-if="expandedConfigKey === 'permission' && permissionOption"
              class="config-chip-grid"
            >
              <view
                v-for="value in permissionOption.kind.options"
                :key="value.value"
                :class="[
                  'config-chip',
                  detailAgentConfig.selectedValues[permissionOption.id] === value.value && 'config-chip--active',
                ]"
                @click.stop="selectDetailConfigValue(permissionOption.id, value.value)"
              >
                <text class="config-chip__title">{{ value.name }}</text>
              </view>
            </view>
          </view>
        </view>

        <view
          v-if="slashState.visible && filteredSlashCommands.length > 0"
          class="slash-panel"
        >
          <view
            v-for="item in filteredSlashCommands"
            :key="item.key"
            class="slash-item"
            @click="applySlashCommand(item)"
          >
            <view class="slash-item__left">
              <text class="slash-item__key">{{ item.key }}</text>
            </view>
            <text class="slash-item__desc">{{ getSlashCommandDesc(item) }}</text>
          </view>
        </view>

        <view v-if="uploadQueue.length > 0" class="upload-queue">
          <view
            v-for="item in uploadQueue"
            :key="item.id"
            class="upload-queue__item"
          >
            <view class="upload-queue__left">
              <up-icon
                :name="item.kind === 'image' ? 'photo' : 'file-text'"
                size="14"
                color="#7a8191"
              ></up-icon>
              <text class="upload-queue__name u-line-1">{{ item.name }}</text>
            </view>
            <view class="upload-queue__right">
              <text v-if="item.status === 'uploading'" class="upload-queue__status">
                {{ item.progress }}%
              </text>
              <text v-else-if="item.status === 'success'" class="upload-queue__status upload-queue__status--success">
                已上传
              </text>
              <text v-else class="upload-queue__status upload-queue__status--error">
                失败
              </text>
            </view>
          </view>
        </view>

        <view v-if="attachments.length > 0" class="attachments-preview">
          <view v-for="(att, index) in attachments" :key="att.id" class="attachment-item">
            <image
              v-if="att.kind === 'image'"
              :src="att.url"
              mode="aspectFill"
              class="attachment-image"
            />
            <view v-else class="attachment-file">
              <up-icon name="file-text" size="16" color="#5f6470"></up-icon>
              <text class="attachment-file__name u-line-1">{{ att.name }}</text>
            </view>
            <view class="attachment-remove" @click="removeAttachment(index)">
              <up-icon name="close" size="10" color="#ffffff"></up-icon>
            </view>
          </view>
        </view>

        <view
          v-if="draftQueue.length > 0"
          class="queue-bar"
          @click="queueExpanded = !queueExpanded"
        >
          <view class="queue-bar__left">
            <up-icon name="clock" size="14" color="#2979ff"></up-icon>
            <text class="queue-bar__text">待发送 {{ draftQueue.length }}</text>
          </view>
          <up-icon
            :name="queueExpanded ? 'arrow-up' : 'arrow-down'"
            size="12"
            color="#90a1c0"
          ></up-icon>
        </view>

        <view v-if="queueExpanded && draftQueue.length > 0" class="queue-panel">
          <view v-for="item in draftQueue" :key="item.id" class="queue-item">
            <view class="queue-item__body">
              <text class="queue-item__text u-line-2">{{ draftSummary(item) }}</text>
              <view class="queue-item__meta">
                <text :class="['queue-item__status', `queue-item__status--${item.status}`]">
                  {{ queueStatusText(item.status) }}
                </text>
                <text class="queue-item__time">{{ formatQueueTime(item.createdAt) }}</text>
              </view>
            </view>
            <view class="queue-item__actions">
              <view class="queue-op" @click.stop="removeDraft(item.id)">移除</view>
              <view
                v-if="item.status !== 'sending'"
                class="queue-op queue-op--primary"
                @click.stop="sendQueuedDraft(item.id)"
              >
                发送
              </view>
            </view>
          </view>
        </view>

        <view class="input-row">
          <view class="input-action" @click="toggleComposerTools">
            <up-icon :name="showComposerTools ? 'close' : 'plus'" size="18" color="#606266"></up-icon>
          </view>

          <view class="input-box">
            <up-textarea
              class="composer-textarea"
              v-model="inputText"
              placeholder="发送消息，输入 / 调出命令"
              autoHeight
              fixed
              :maxlength="10000"
              border="none"
              height="34rpx"
              :customStyle="{ backgroundColor: 'transparent', background: 'transparent', padding: '0', borderColor: 'transparent' }"
              @linechange="handleComposerLayoutChange"
              @keyboardheightchange="handleComposerLayoutChange"
            ></up-textarea>
          </view>

          <view class="input-action" @click="sendContinueMessage">
            <up-icon name="arrow-right" size="17" color="#606266"></up-icon>
          </view>

          <view
            class="send-btn"
            :class="{ 'send-btn--active': canSend, 'send-btn--loading': sending }"
            @click="sendMessage"
          >
            <up-loading-icon v-if="sending" color="#ffffff" size="20"></up-loading-icon>
            <up-icon v-else name="arrow-up" size="22" color="#ffffff"></up-icon>
          </view>
        </view>
      </view>

      <view
        v-if="showScrollToBottomFab"
        class="scroll-bottom-fab"
        :class="{ 'scroll-bottom-fab--stacked': planTasks.length > 0 }"
        @click="handleScrollToBottomFab"
      >
        <up-icon name="arrow-down" size="18" color="#ffffff"></up-icon>
        <view v-if="hasUnreadBelow" class="scroll-bottom-fab__dot"></view>
      </view>

      <view
        v-if="planTasks.length > 0"
        class="plan-fab"
        @click="showPlanDrawer = true"
      >
        <up-icon name="list" size="18" color="#ffffff"></up-icon>
        <text class="plan-fab__text">计划 {{ completedTaskCount }}/{{ planTasks.length }}</text>
      </view>
    </view>

    <up-popup v-model:show="showPlanDrawer" mode="bottom" :round="20">
      <view class="plan-drawer">
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

    <up-popup v-model:show="showTodoPicker" mode="bottom" :round="20">
      <view class="todo-picker">
        <view class="todo-picker__hd">
          <text class="todo-picker__title">选择待办</text>
        </view>
        <view v-if="availableTodos.length === 0" class="todo-picker__empty">
          <text class="todo-picker__empty-text">暂无未完成待办</text>
        </view>
        <view
          v-for="item in availableTodos"
          :key="item.id"
          class="todo-picker__item"
          @click="selectTodoForComposer(item)"
        >
          <text class="todo-picker__text">{{ item.text }}</text>
        </view>
      </view>
    </up-popup>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from "vue"
import { onBackPress, onHide, onLoad, onShow, onUnload } from "@dcloudio/uni-app"
import { useAuthStore } from "@/stores/auth"
import { useConversationCacheStore } from "@/stores/conversationCache"
import { useConversationRuntimeStore } from "@/stores/conversationRuntime"
import { acpApi } from "@/api/acp"
import { createGateway } from "@/services/gateway"
import { getDirectToken } from "@/services/gateway/directTokenStore"
import { toErrorMessage } from "@/services/gateway/error"
import { ensureConversationSchema } from "@/services/db/migrations"
import {
  countConversationTurns,
  getConversationSummaryById,
  getOlderTurns,
  getNewestTurns,
  type PersistedTurnPartRow,
  type PersistedTurnWithParts,
} from "@/services/db/repositories/conversationRepository"
import {
  getRuntime,
  saveDraftState,
  type ConversationRuntimeRecord,
} from "@/services/db/repositories/runtimeRepository"
import { connectionSessionManager } from "@/services/conversation/connectionSessionManager"
import { markConversationListDirty } from "@/services/conversation/conversationListRefresh"
import { persistConversationDetailSnapshot } from "@/services/conversation/conversationDetailPersistence"
import { buildRemoteInstanceKey } from "@/services/realtime/instance-key"
import {
  getRegisteredRemoteInstanceDescriptor,
  registerRemoteInstanceDescriptor,
} from "@/services/realtime/remoteInstanceRegistry"
import { usePetStore } from "@/stores/pet"
import {
  buildAgentConfigContextKey,
  createEmptyDetailAgentConfigState,
  createReadyDetailAgentConfigState,
  findModeName,
  findSelectedOptionValueName,
  parseIncompleteTodos,
  persistAgentConfigCache,
  persistAgentConfigSelection,
  projectDetailConfigOptions,
  readFreshAgentConfigCache,
  readPersistedAgentConfigSelection,
  type ComposerConfigKey,
  type ComposerTodoItem,
  type DetailAgentConfigState,
} from "@/services/conversation/composerTools"
import type {
  PromptInputBlock,
  ToolCall,
  ContentPart,
  MessageTurn,
  PermissionRequest,
} from "@/types/acp"
import type { RelaySessionInfo } from "@/services/gateway"
import type { RemoteInstanceDescriptor } from "@/services/realtime/types"
import MessageBubble from "@/components/MessageBubble.vue"
import ExpertMenu from "@/components/ExpertMenu.vue"

interface UploadedAttachment {
  id: string
  url: string
  name: string
  size: number
  type: string
  kind: "image" | "file"
}

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

interface QueuedDraft {
  id: string
  text: string
  attachments: UploadedAttachment[]
  createdAt: number
  status: "pending" | "sending" | "failed"
  error?: string
}

interface ConversationDraftSnapshot {
  composerText: string
  draftQueue: QueuedDraft[]
  attachments: UploadedAttachment[]
  queueExpanded: boolean
}

interface SlashCommandItem {
  key: string
  name: string
  desc: string
  hint?: string
}

interface PickedLocalFile {
  path: string
  name: string
  size: number
  type: string
  kind: "image" | "file"
}

interface StoredConnectionItem {
  mode: "direct" | "relay"
  url: string
  directToken?: string
  relaySession?: {
    accessToken?: string
    refreshToken?: string
    targetId?: string
  }
}

const auth = useAuthStore()
const cacheStore = useConversationCacheStore()
const runtime = useConversationRuntimeStore()
const INITIAL_TURN_BATCH = 50

const loading = ref(false)
const sending = ref(false)
const processingQueue = ref(false)
const sequence = ref(0)
const conversationId = ref<number>(0)
const folderId = ref<number>(0)
const routeConnectionKey = ref("")
const inputText = ref("")
const scrollIntoView = ref("")
const scrollTop = ref(0)
const messageListHeight = ref(0)
const messageListViewportHeight = ref(0)
const hasInitialBottomScroll = ref(false)
const isRestoringScroll = ref(false)
const restoredInitialScroll = ref(false)
const lastMeasuredScrollTop = ref(0)
const anchorMessageId = ref("")
const shouldAutoFollowBottom = ref(true)
const hasUnreadBelow = ref(false)
const loadingOlder = ref(false)
const hasMoreHistory = ref(false)
const oldestLoadedCursor = ref<number | null>(null)
const attachments = ref<UploadedAttachment[]>([])
const uploadQueue = ref<UploadQueueItem[]>([])
const draftQueue = ref<QueuedDraft[]>([])
const queueExpanded = ref(false)
const uploadingCount = ref(0)
const showPlanDrawer = ref(false)
const showComposerTools = ref(false)
const showAttachmentKinds = ref(false)
const showTodoPicker = ref(false)
const expandedConfigKey = ref<ComposerConfigKey>("")
const detailAgentConfig = ref<DetailAgentConfigState>(createEmptyDetailAgentConfigState())
const availableTodos = ref<ComposerTodoItem[]>([])
const currentAgentType = ref("claude_code")
const detailProjectEntries = ref<DetailProjectEntry[]>([])
const hasLoadedOnce = ref(false)
const needsResumeRefresh = ref(false)
const hasRestoredDraftState = ref(false)
const HISTORY_LOADING_MIN_MS = 200
const permissionSubmitting = ref(false)
const pendingPermissionSubmittingOptionId = ref("")
let detailAgentProbeToken = 0

function detailDebugLog(stage: string, payload?: Record<string, unknown>) {
  if (!conversationId.value) return
  console.warn("[conversation-detail-debug]", {
    conversationId: conversationId.value,
    stage,
    ...(payload || {}),
  })
}

const messages = computed(() => {
  if (!conversationId.value) return []
  return runtime.getMessages(conversationId.value)
})

const session = computed(() => {
  if (!conversationId.value) return null
  return runtime.getOrCreateSession(conversationId.value)
})
const managedConversation = computed(() => {
  if (!conversationId.value) return null
  return runtime.getManagedConversation(conversationId.value)
})
const messageListStyle = computed(() => {
  if (messageListViewportHeight.value <= 0) return undefined
  return {
    height: `${messageListViewportHeight.value}px`,
  }
})

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
    if (descriptor?.baseUrl) {
      return buildConnectionKey(descriptor.mode, descriptor.baseUrl)
    }
    if (managed?.instanceKey) return managed.instanceKey
  }
  const base = auth.mode === "direct" ? auth.directBaseUrl : auth.relayUrl
  return base ? buildConnectionKey(auth.mode, base) : resolveDetailInstanceKey()
})

const historyStatusText = computed(() => {
  if (loadingOlder.value) return "历史加载中..."
  if (messages.value.length > 0 && !hasMoreHistory.value) return "没有更多历史了"
  return ""
})

const runtimeStatus = computed<string>(() => String(session.value?.status || "idle"))
const pendingPermissionCard = computed<PermissionRequest | null>(() => session.value?.pendingPermission || null)
const pendingPermissionDescription = computed(() => {
  return pendingPermissionCard.value?.description || "智能体请求继续当前操作"
})
const detailConfigProjection = computed(() =>
  projectDetailConfigOptions(detailAgentConfig.value.configOptions)
)
const modelOption = computed(() => detailConfigProjection.value.modelOption)
const reasoningOption = computed(() => detailConfigProjection.value.reasoningOption)
const permissionOption = computed(() => detailConfigProjection.value.permissionOption)
const hasModelOptions = computed(() =>
  Boolean(detailAgentConfig.value.modes?.available_modes?.length || modelOption.value)
)
const modelSummary = computed(() => {
  if (detailAgentConfig.value.status === "loading") return "加载中"
  return findModeName(detailAgentConfig.value.modes, detailAgentConfig.value.selectedModeId)
    || findSelectedOptionValueName(modelOption.value, detailAgentConfig.value.selectedValues)
    || detailAgentConfig.value.message
    || "远端未提供"
})
const reasoningSummary = computed(() => {
  if (detailAgentConfig.value.status === "loading") return "加载中"
  return findSelectedOptionValueName(reasoningOption.value, detailAgentConfig.value.selectedValues)
    || detailAgentConfig.value.message
    || "远端未提供"
})
const permissionSummary = computed(() => {
  if (detailAgentConfig.value.status === "loading") return "加载中"
  return findSelectedOptionValueName(permissionOption.value, detailAgentConfig.value.selectedValues)
    || detailAgentConfig.value.message
    || "远端未提供"
})
const detailProjectPath = computed(() => {
  const matched = detailProjectEntries.value.find((item) => Number(item?.id || 0) === folderId.value)
  return String(matched?.path || "").trim()
})
const detailAgentConfigContextKey = computed(() => {
  return buildAgentConfigContextKey(
    detailConnectionKey.value,
    currentAgentType.value,
    detailProjectPath.value
  )
})

const stats = computed(() => session.value?.stats || {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  turnCount: 0,
})

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

const canSend = computed(() => Boolean(inputText.value.trim() || attachments.value.length > 0))

const isBusyForSend = computed(
  () =>
    sending.value ||
    runtimeStatus.value === "thinking" ||
    runtimeStatus.value === "running_tool" ||
    runtimeStatus.value === "waiting_permission"
)

const runtimeStatusLabel = computed(() => {
  if (runtimeStatus.value === "thinking") return "思考中"
  if (runtimeStatus.value === "running_tool") return "运行命令中"
  if (runtimeStatus.value === "waiting_permission") return "等待授权"
  if (runtimeStatus.value === "error") return "运行异常"
  if (runtimeStatus.value === "connected") return "已连接"
  if (runtimeStatus.value === "connecting") return "连接中"
  return "空闲"
})

const runtimeStatusClass = computed(() => {
  if (runtimeStatus.value === "thinking" || runtimeStatus.value === "running_tool") return "running"
  if (runtimeStatus.value === "waiting_permission") return "pending"
  if (runtimeStatus.value === "error") return "error"
  if (runtimeStatus.value === "connected") return "online"
  return "idle"
})

const slashCommands = ref<SlashCommandItem[]>([])

const slashState = computed(() => {
  const text = inputText.value || ""
  const match = text.match(/(?:^|\n)\/([a-zA-Z]*)$/)
  if (!match) return { visible: false, keyword: "" }
  return { visible: true, keyword: (match[1] || "").toLowerCase() }
})

const filteredSlashCommands = computed(() => {
  if (!slashState.value.visible) return []
  const kw = slashState.value.keyword
  if (!kw) return slashCommands.value
  return slashCommands.value.filter((item) =>
    item.key.toLowerCase().includes(`/${kw}`) ||
    item.name.toLowerCase().includes(kw) ||
    item.desc.toLowerCase().includes(kw) ||
    String(item.hint || "").toLowerCase().includes(kw)
  )
})

const slashCommandDescMap: Record<string, string> = {
  review: "审查当前改动并找出问题",
  "review-branch": "对比指定分支审查代码改动",
  "review-commit": "审查某次提交引入的改动",
  init: "为 Codex 创建 AGENTS.md 指令文件",
  compact: "压缩当前会话，减少上下文占用",
  undo: "撤销上一轮操作",
  logout: "退出当前 Codex 会话",
}

function getSlashCommandDesc(item: SlashCommandItem) {
  const commandName = String(item.name || item.key || "").replace(/^\//, "").trim()
  return slashCommandDescMap[commandName] || item.desc || item.hint || ""
}

type PlanTaskStatus = "pending" | "in_progress" | "completed" | "failed"
interface PlanTask {
  id: string
  subject: string
  description?: string
  status: PlanTaskStatus
  order: number
}
type PlanTaskFilter = "all" | PlanTaskStatus
const planStatusFilter = ref<PlanTaskFilter>("all")

const planTasks = computed<PlanTask[]>(() => {
  const taskMap = new Map<string, PlanTask>()
  let order = 0

  const nextOrder = () => {
    order += 1
    return order
  }

  for (const msg of messages.value) {
    getTurnContentParts(msg).forEach((part, partIndex) => {
      if (part.type === "plan" && part.plan) {
        mergeTaskFromPlanPart(taskMap, part.plan, nextOrder, `${msg.id}-${partIndex}`)
        return
      }
      if (part.type === "tool_call" && part.tool_call) {
        mergeTaskFromToolCall(taskMap, part.tool_call, nextOrder)
      }
    })
  }

  if (taskMap.size === 0) {
    ;(session.value?.liveMessage?.content || []).forEach((part, partIndex) => {
      if (part.type === "plan" && part.plan) {
        mergeTaskFromPlanPart(taskMap, part.plan, nextOrder, `live-${partIndex}`)
      }
    })
  }

  return Array.from(taskMap.values()).sort((a, b) => a.order - b.order)
})

const completedTaskCount = computed(
  () => planTasks.value.filter((task) => task.status === "completed").length
)

const filteredPlanTasks = computed(() => {
  if (planStatusFilter.value === "all") return planTasks.value
  return planTasks.value.filter((task) => task.status === planStatusFilter.value)
})

const showScrollToBottomFab = computed(
  () =>
    messages.value.length > 0 &&
    !shouldAutoFollowBottom.value &&
    !isRestoringScroll.value
)

const planFilterItems = computed<
  Array<{ key: PlanTaskFilter; label: string; count: number }>
>(() => [
  { key: "all", label: "全部", count: planTasks.value.length },
  { key: "in_progress", label: "进行中", count: countByStatus("in_progress") },
  { key: "pending", label: "待处理", count: countByStatus("pending") },
  { key: "completed", label: "已完成", count: countByStatus("completed") },
  { key: "failed", label: "失败", count: countByStatus("failed") },
])

onLoad((options: any) => {
  conversationId.value = Number(options.id || 0)
  folderId.value = Number(options.folderId || 0)
  needsResumeRefresh.value = false
  const connectionKey = typeof options.connectionKey === "string"
    ? decodeURIComponent(options.connectionKey)
    : ""
  routeConnectionKey.value = connectionKey
  if (connectionKey) {
    syncAuthByConnectionKey(connectionKey)
  }
  if (conversationId.value) {
    void loadDetailProjectEntries()
    loadConversation()
  }
  hasLoadedOnce.value = true
})

onShow(() => {
  if (!hasLoadedOnce.value || !conversationId.value || loading.value) return
  if (!needsResumeRefresh.value) return
  needsResumeRefresh.value = false
  if (routeConnectionKey.value) {
    syncAuthByConnectionKey(routeConnectionKey.value)
  }
  void loadDetailProjectEntries()
  loadConversation()
})

onHide(() => {
  persistDetailRuntimeState()
  needsResumeRefresh.value = true
  if (conversationId.value) {
    markConversationListDirty()
  }
})

onUnload(() => {
  persistDetailRuntimeState()
  if (conversationId.value) {
    markConversationListDirty()
    runtime.clearSession(conversationId.value)
  }
})

onBackPress(() => {
  uni.switchTab({
    url: "/pages/conversations/index",
  })
  return true
})

watch(
  () => messages.value.map((msg) => ({
    id: msg.id,
    role: msg.role,
    status: msg.status,
    content: JSON.stringify(msg.content || []),
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
    if (!isBusyForSend.value) {
      void processDraftQueue()
    }
  }
)

watch(
  () => historyStatusText.value,
  () => {
    if (!hasInitialBottomScroll.value) return
    scheduleViewportSync()
  }
)

watch(
  () => [currentAgentType.value, session.value?.connectionId] as const,
  ([agentType, connectionId]) => {
    if (!conversationId.value || !agentType || !connectionId) return
    void loadDetailAgentConfig()
    void applyPendingComposerConfig()
  }
)

watch(
  () => [
    attachments.value.length,
    uploadQueue.value.length,
    draftQueue.value.length,
    queueExpanded.value,
    slashState.value.visible,
    filteredSlashCommands.value.length,
    showComposerTools.value,
    showAttachmentKinds.value,
    showTodoPicker.value,
    expandedConfigKey.value,
  ],
  () => {
    if (!hasInitialBottomScroll.value) return
    scheduleViewportSync()
  }
)

watch(
  () => [
    inputText.value,
    queueExpanded.value,
    JSON.stringify(attachments.value),
    JSON.stringify(draftQueue.value),
  ] as const,
  () => {
    if (!hasRestoredDraftState.value) return
    persistConversationDraftSnapshot()
  }
)

async function loadConversation() {
  if (routeConnectionKey.value) {
    syncAuthByConnectionKey(routeConnectionKey.value)
  }
  loading.value = true
  scrollIntoView.value = ""
  isRestoringScroll.value = false
  restoredInitialScroll.value = false
  hasRestoredDraftState.value = false
  const cachedViewState = cacheStore.restore(conversationId.value)
  let persistedRuntime: ConversationRuntimeRecord | null = null
  let initialLoadFinished = false
  const finishInitialLoad = (
    cachedViewState: ReturnType<typeof cacheStore.restore>,
    persistedRuntime: ConversationRuntimeRecord | null
  ) => {
    if (initialLoadFinished) return
    initialLoadFinished = true
    loading.value = false
    nextTick(() => {
      measureMessageListHeight()
      restoreScrollState(cachedViewState, persistedRuntime)
      hasInitialBottomScroll.value = true
    })
  }
  try {
    const runtimeSession = runtime.getOrCreateSession(conversationId.value)
    const instanceKey = resolveDetailInstanceKey()
    const initialTurnLimit = resolveInitialTurnLimit(
      cachedViewState,
      runtimeSession.localTurns.length
    )
    const managed = connectionSessionManager.getByConversationId(conversationId.value)
    const hasHotRuntime = hasActiveRuntimeState(runtimeSession)

    let localSummary: Awaited<ReturnType<typeof getConversationSummaryById>> | null = null
    let localTurns: PersistedTurnWithParts[] = []
    try {
      await ensureConversationSchema()
      localSummary = await getConversationSummaryById(instanceKey, conversationId.value)
      syncConversationTitle(localSummary?.title)
      persistedRuntime = await getRuntime(conversationId.value)
      if (!hasHotRuntime) {
        localTurns = await getNewestTurns(conversationId.value, initialTurnLimit)
      }
    } catch (error) {
      console.warn("local conversation hydrate skipped", error)
    }

    restoreDraftState(cachedViewState, persistedRuntime)

    let agentType =
      firstString(managed?.connection.agentType, localSummary?.agentType) || "claude_code"
    let resumeSessionId =
      firstString(managed?.externalId, managed?.connection.sessionId, localSummary?.externalId)
    let remoteDetail: any = null
    currentAgentType.value = normalizeAgentType(agentType)

    const hydrateRemoteMetadata = async () => {
      if (managed || resumeSessionId || remoteDetail) return
      try {
        const gateway = await getDetailGateway()
        remoteDetail = await gateway.call<any>("get_folder_conversation", {
          conversationId: conversationId.value,
        })
        const summary = (remoteDetail?.summary && typeof remoteDetail.summary === "object")
          ? remoteDetail.summary
          : {}
        agentType =
          firstString(remoteDetail?.agentType, remoteDetail?.agent_type, summary?.agent_type) ||
          agentType
        resumeSessionId =
          firstString(remoteDetail?.sessionId, remoteDetail?.session_id, summary?.external_id) ||
          resumeSessionId
        currentAgentType.value = normalizeAgentType(agentType)
        syncConversationTitle(firstString(summary?.title, remoteDetail?.title))
        await persistConversationDetailSnapshot({
          instanceKey,
          conversationId: conversationId.value,
          detail: remoteDetail,
          fallbackFolderId: folderId.value,
          persistTurns: false,
        })
      } catch (error) {
        console.warn("remote conversation metadata hydrate skipped", error)
      }
    }

    if (hasHotRuntime) {
      oldestLoadedCursor.value = cachedViewState?.oldestLoadedSeq ?? oldestLoadedCursor.value
      hasMoreHistory.value = cachedViewState?.hasMoreHistory ?? hasMoreHistory.value
      finishInitialLoad(cachedViewState, persistedRuntime)
    } else if (localTurns.length > 0) {
      const totalLocalTurnCount = await countConversationTurns(conversationId.value)
      runtimeSession.localTurns = localTurns
        .slice()
        .reverse()
        .map(mapPersistedTurnToMessage)
      oldestLoadedCursor.value = getOldestCursorFromPersistedTurns(localTurns)
      hasMoreHistory.value = totalLocalTurnCount > localTurns.length
      finishInitialLoad(cachedViewState, persistedRuntime)
    } else {
      await hydrateRemoteMetadata()
      const gateway = await getDetailGateway()
      const result = remoteDetail || await gateway.call<any>("get_folder_conversation", {
        conversationId: conversationId.value,
      })
      const summary = (result?.summary && typeof result.summary === "object")
        ? result.summary
        : {}
      syncConversationTitle(firstString(summary?.title, result?.title))
      agentType = firstString(result?.agentType, result?.agent_type, summary?.agent_type) || "claude_code"
      resumeSessionId = firstString(result?.sessionId, result?.session_id, summary?.external_id)
      currentAgentType.value = normalizeAgentType(agentType)
      try {
        detailDebugLog("initial-remote-detail", summarizeDetailTurns(result))
        await persistConversationDetailSnapshot({
          instanceKey,
          conversationId: conversationId.value,
          detail: result,
          fallbackFolderId: folderId.value,
        })
      } catch (error) {
        detailDebugLog("initial-persist-failed", { message: toErrorMessage(error) })
        console.warn("persist remote conversation detail skipped", error)
      }

      await refreshSessionTurnsFromDb(runtimeSession, cachedViewState, initialTurnLimit)
      finishInitialLoad(cachedViewState, persistedRuntime)
    }

    if (localTurns.length === 0 && !hasHotRuntime) {
      await hydrateRemoteMetadata()
    }
    const conn = await runtime.connect(
      conversationId.value,
      agentType,
      undefined,
      resumeSessionId,
      persistedRuntime?.lastAppliedSeq ?? runtimeSession.lastAppliedSeq ?? undefined,
      instanceKey
    )

    let snapshot: any = null
    let snapshotFromConversation = false
    try {
      snapshot = await acpApi.acpGetSessionSnapshotByConversation(conversationId.value)
      snapshotFromConversation = Boolean(snapshot)
    } catch (error) {
      console.warn("acp_get_session_snapshot_by_conversation failed", error)
    }
    if (!snapshot && conn.id) {
      try {
        snapshot = await acpApi.acpGetSessionSnapshot(conn.id)
      } catch (error) {
        console.warn("acp_get_session_snapshot failed", error)
      }
    }
    if (snapshot) {
      const snapshotSessionId = firstString(snapshot.external_id, snapshot.externalId)
      const trustSnapshotMetadata =
        Boolean(snapshotFromConversation) ||
        Boolean(resumeSessionId) ||
        Boolean(managed?.externalId)
      if (snapshotSessionId && trustSnapshotMetadata) {
        try {
          await persistConversationDetailSnapshot({
            instanceKey,
            conversationId: conversationId.value,
            detail: {
              session_id: snapshotSessionId,
              agent_type: agentType,
              summary: {
                external_id: snapshotSessionId,
                agent_type: agentType,
              },
            },
            fallbackFolderId: folderId.value,
            fallbackConnectionId: conn.id,
            persistTurns: false,
          })
        } catch (error) {
          console.warn("persist live snapshot metadata skipped", error)
        }
      }
      runtime.hydrateLiveSnapshot(conversationId.value, snapshot)
    }
    await loadDetailAgentConfig()
    const availableCommands = Array.isArray(snapshot?.available_commands)
      ? snapshot.available_commands
      : Array.isArray(snapshot?.availableCommands)
        ? snapshot.availableCommands
        : []
    slashCommands.value = availableCommands
      .filter((item: any) => item && typeof item === "object" && firstString(item.name))
      .map((item: any) => ({
        key: `/${firstString(item.name) || ""}`,
        name: firstString(item.name) || "",
        desc: firstString(item.description) || "",
        hint: firstString(item.input_hint),
      }))

  } catch (error) {
    const message = toErrorMessage(error)
    uni.showToast({ title: `加载失败: ${message}`, icon: "none", duration: 3000 })
  } finally {
    finishInitialLoad(cachedViewState, persistedRuntime)
  }
}

function syncConversationTitle(title?: string | null) {
  uni.setNavigationBarTitle({
    title: firstString(title) || "未命名会话",
  })
}

function refreshConversation() {
  if (!conversationId.value || loading.value) return
  loadConversation()
    .then(() => {
      uni.showToast({ title: "会话已刷新", icon: "none" })
    })
    .catch(() => {})
}

function hasActiveRuntimeState(runtimeSession: ReturnType<typeof runtime.getOrCreateSession>) {
  return Boolean(
    runtimeSession.connectionId ||
    runtimeSession.liveMessage ||
    runtimeSession.optimisticTurns.length > 0
  )
}

async function refreshSessionTurnsFromDb(
  runtimeSession: ReturnType<typeof runtime.getOrCreateSession>,
  cachedViewState: ReturnType<typeof cacheStore.restore>,
  limit = resolveInitialTurnLimit(cachedViewState)
) {
  const refreshedTurns = await getNewestTurns(conversationId.value, limit)
  const totalTurnCount = await countConversationTurns(conversationId.value)
  detailDebugLog("db-refresh", {
    limit,
    count: refreshedTurns.length,
    totalCount: totalTurnCount,
    newestTurnId: refreshedTurns[0]?.id ?? null,
    oldestTurnId: refreshedTurns[refreshedTurns.length - 1]?.id ?? null,
    newestSeq: refreshedTurns[0]?.seq ?? null,
    oldestSeq: refreshedTurns[refreshedTurns.length - 1]?.seq ?? null,
  })
  if (refreshedTurns.length === 0) {
    runtimeSession.localTurns = []
    oldestLoadedCursor.value = null
    hasMoreHistory.value = false
    return
  }

  runtimeSession.localTurns = refreshedTurns
    .slice()
    .reverse()
    .map(mapPersistedTurnToMessage)
  oldestLoadedCursor.value = getOldestCursorFromPersistedTurns(refreshedTurns)
  hasMoreHistory.value = totalTurnCount > refreshedTurns.length
}

function resolveInitialTurnLimit(
  cachedViewState: ReturnType<typeof cacheStore.restore>,
  currentLoadedCount = 0
) {
  const cachedCount = Number(cachedViewState?.loadedTurnCount || 0)
  const liveCount = Number(currentLoadedCount || 0)
  return Math.max(
    INITIAL_TURN_BATCH,
    Number.isFinite(cachedCount) ? cachedCount : 0,
    Number.isFinite(liveCount) ? liveCount : 0
  )
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

function restoreDraftState(
  cachedViewState: ReturnType<typeof cacheStore.restore>,
  persistedRuntime: ConversationRuntimeRecord | null
) {
  const localSnapshot = readConversationDraftSnapshot()
  const sourceComposer =
    cachedViewState?.composerText
    ?? localSnapshot?.composerText
    ?? persistedRuntime?.composerText
    ?? ""
  const sourceDraftQueue =
    cachedViewState?.draftQueue
    ?? localSnapshot?.draftQueue
    ?? safeParseArray(persistedRuntime?.draftQueueJson)
  const sourceAttachments =
    cachedViewState?.attachments
    ?? localSnapshot?.attachments
    ?? safeParseArray(persistedRuntime?.attachmentsJson)
  const restoredDraftQueue = normalizeDraftQueue(sourceDraftQueue)
  const restoredAttachments = normalizeAttachments(sourceAttachments)

  inputText.value = typeof sourceComposer === "string" ? sourceComposer : ""
  draftQueue.value = restoredDraftQueue
  attachments.value = restoredAttachments
  queueExpanded.value =
    typeof cachedViewState?.queueExpanded === "boolean"
      ? cachedViewState.queueExpanded
      : typeof localSnapshot?.queueExpanded === "boolean"
        ? localSnapshot.queueExpanded
      : restoredDraftQueue.length > 0
  hasRestoredDraftState.value = true
}

function safeParseArray(value?: string | null) {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function normalizeList(input: unknown): any[] {
  return Array.isArray(input) ? input : []
}

interface DetailProjectEntry {
  id: number
  path?: string
}

function buildConversationDraftSnapshotStorageKey() {
  if (!conversationId.value) return ""
  const instanceKey = resolveDetailInstanceKey() || "anonymous"
  return `mcode_conversation_draft_snapshot:${instanceKey}:${conversationId.value}`
}

function readConversationDraftSnapshot(): ConversationDraftSnapshot | null {
  const key = buildConversationDraftSnapshotStorageKey()
  if (!key) return null
  try {
    const raw = uni.getStorageSync(key)
    if (!raw) return null
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw
    if (!parsed || typeof parsed !== "object") return null
    return {
      composerText: typeof parsed.composerText === "string" ? parsed.composerText : "",
      draftQueue: normalizeDraftQueue((parsed as Record<string, unknown>).draftQueue),
      attachments: normalizeAttachments((parsed as Record<string, unknown>).attachments),
      queueExpanded: Boolean(parsed.queueExpanded),
    }
  } catch (error) {
    console.warn("restore conversation draft snapshot skipped", error)
    return null
  }
}

function persistConversationDraftSnapshot() {
  const key = buildConversationDraftSnapshotStorageKey()
  if (!key) return
  if (shouldClearConversationDraftSnapshot()) {
    uni.removeStorageSync(key)
    return
  }
  const snapshot: ConversationDraftSnapshot = {
    composerText: inputText.value,
    draftQueue: cloneDraftQueue(draftQueue.value),
    attachments: cloneAttachments(attachments.value),
    queueExpanded: queueExpanded.value,
  }
  try {
    uni.setStorageSync(key, JSON.stringify(snapshot))
  } catch (error) {
    console.warn("persist conversation draft snapshot skipped", error)
  }
}

function shouldClearConversationDraftSnapshot() {
  return inputText.value.length === 0 && attachments.value.length === 0 && draftQueue.value.length === 0
}

function normalizeAttachments(source: unknown): UploadedAttachment[] {
  if (!Array.isArray(source)) return []
  return source
    .map((item, index) => normalizeAttachment(item, index))
    .filter(Boolean) as UploadedAttachment[]
}

function normalizeAttachment(source: unknown, index: number): UploadedAttachment | null {
  if (!source || typeof source !== "object") return null
  const record = source as Record<string, unknown>
  const kind = record.kind === "image" ? "image" : record.kind === "file" ? "file" : null
  const url = typeof record.url === "string" ? record.url : ""
  if (!kind || !url) return null
  return {
    id: typeof record.id === "string" && record.id ? record.id : createLocalId(`att-restored-${index}`),
    url,
    name: typeof record.name === "string" ? record.name : "",
    size: Number(record.size || 0),
    type: typeof record.type === "string" ? record.type : "application/octet-stream",
    kind,
  }
}

function normalizeDraftQueue(source: unknown): QueuedDraft[] {
  if (!Array.isArray(source)) return []
  return source
    .map((item, index) => normalizeDraft(item, index))
    .filter(Boolean) as QueuedDraft[]
}

function normalizeDraft(source: unknown, index: number): QueuedDraft | null {
  if (!source || typeof source !== "object") return null
  const record = source as Record<string, unknown>
  const rawStatus = record.status === "failed" ? "failed" : record.status === "sending" ? "sending" : "pending"
  const status: QueuedDraft["status"] = rawStatus === "sending" ? "pending" : rawStatus
  return {
    id: typeof record.id === "string" && record.id ? record.id : createLocalId(`draft-restored-${index}`),
    text: typeof record.text === "string" ? record.text : "",
    attachments: normalizeAttachments(record.attachments),
    createdAt: Number(record.createdAt || Date.now()),
    status,
    error: status === "failed" && typeof record.error === "string" ? record.error : undefined,
  }
}

function cloneAttachments(source: UploadedAttachment[]) {
  return source.map((item) => ({ ...item }))
}

function cloneDraftQueue(source: QueuedDraft[]) {
  return source.map((item) => ({
    ...item,
    attachments: cloneAttachments(item.attachments),
  }))
}

function persistDetailRuntimeState() {
  if (!conversationId.value) return
  persistConversationDraftSnapshot()
  cacheStore.persistViewState({
    conversationId: conversationId.value,
    loadedTurnCount: messages.value.length,
    oldestLoadedSeq: oldestLoadedCursor.value ?? undefined,
    hasMoreHistory: hasMoreHistory.value,
    scrollAnchor: scrollIntoView.value || undefined,
    scrollTop: lastMeasuredScrollTop.value || scrollTop.value || 0,
    nearBottom: shouldAutoFollowBottom.value,
    anchorMessageId: anchorMessageId.value || undefined,
    composerText: inputText.value,
    draftQueue: cloneDraftQueue(draftQueue.value),
    attachments: cloneAttachments(attachments.value),
    queueExpanded: queueExpanded.value,
  })
  const currentSession = session.value
  void saveDraftState({
    conversationId: conversationId.value,
    instanceKey: resolveDetailInstanceKey(),
    connectionId: currentSession?.connectionId ?? null,
    composerText: inputText.value,
    draftQueueJson: JSON.stringify(draftQueue.value),
    attachmentsJson: JSON.stringify(attachments.value),
    scrollAnchor: scrollIntoView.value || null,
    liveMessageJson: currentSession?.liveMessage ? JSON.stringify(currentSession.liveMessage) : null,
    optimisticJson: JSON.stringify(currentSession?.optimisticTurns || []),
    lastAppliedSeq: currentSession?.lastAppliedSeq ?? null,
    isActive: Boolean(currentSession?.connectionId),
  }).catch((error) => {
    console.warn("persist detail runtime skipped", error)
  })
}

function mapPersistedTurnToMessage(turn: PersistedTurnWithParts): MessageTurn {
  return {
    id: turn.id,
    role: turn.role as MessageTurn["role"],
    timestamp: turn.createdAt,
    status: (turn.status as MessageTurn["status"] | undefined) || "completed",
    content: turn.parts
      .slice()
      .sort((a, b) => a.partIndex - b.partIndex)
      .map(mapPersistedPartToContent)
      .filter(Boolean) as ContentPart[],
  }
}

function mapPersistedPartToContent(part: PersistedTurnPartRow): ContentPart | null {
  try {
    const payload = JSON.parse(part.payloadJson || "{}") as Record<string, any>
    if (part.type === "text") {
      return {
        type: "text",
        text: String(payload.text || payload.value || ""),
      }
    }
    if (part.type === "thinking") {
      return {
        type: "thinking",
        thinking: String(payload.thinking || payload.text || payload.value || ""),
      }
    }
    if (part.type === "tool_call") {
      return {
        type: "tool_call",
        tool_call: payload.tool_call || payload,
      }
    }
    if (part.type === "image") {
      return {
        type: "image",
        image: payload.image || payload,
      }
    }
    if (part.type === "plan") {
      return {
        type: "plan",
        plan: payload.plan || payload,
      }
    }
  } catch (error) {
    console.warn("failed to parse local part payload", error)
  }
  return null
}

function getOldestCursorFromPersistedTurns(turns: PersistedTurnWithParts[]) {
  if (turns.length === 0) return null
  const tail = turns[turns.length - 1]
  return Number(tail.seq ?? tail.createdAt ?? 0) || null
}

function measureMessageListHeight() {
  const query = uni.createSelectorQuery()
  query
    .select(".message-list")
    .boundingClientRect()
    .exec((rects: any[]) => {
      const listRect = rects?.[0]
      const height = Math.max(0, Number(listRect?.height || 0))
      if (height > 0) {
        messageListViewportHeight.value = height
        messageListHeight.value = height
        detailDebugLog("message-list-height", {
          height,
        })
      }
    })
}

function handleMessageScroll(event: any) {
  const scrollTopValue = Number(event?.detail?.scrollTop || 0)
  const scrollHeight = Number(event?.detail?.scrollHeight || 0)
  const viewportHeight = Number(messageListHeight.value || 0)
  lastMeasuredScrollTop.value = scrollTopValue
  scrollTop.value = scrollTopValue
  if (!scrollHeight || !viewportHeight) return
  const distanceToBottom = Math.max(0, scrollHeight - (scrollTopValue + viewportHeight))
  shouldAutoFollowBottom.value = distanceToBottom <= 72
  if (shouldAutoFollowBottom.value) {
    hasUnreadBelow.value = false
  }
  if (shouldAutoFollowBottom.value) {
    const tail = messages.value[messages.value.length - 1]
    anchorMessageId.value = tail?.id || ""
  }
  if (scrollTopValue <= 120) {
    detailDebugLog("scroll-near-top", {
      scrollTop: scrollTopValue,
      scrollHeight,
      viewportHeight,
      hasMoreHistory: hasMoreHistory.value,
      oldestLoadedCursor: oldestLoadedCursor.value,
      loadingOlder: loadingOlder.value,
    })
    void loadOlderTurns()
  }
}

function handleMessageReachTop() {
  detailDebugLog("scrolltoupper", {
    hasMoreHistory: hasMoreHistory.value,
    oldestLoadedCursor: oldestLoadedCursor.value,
    loadingOlder: loadingOlder.value,
  })
  void loadOlderTurns()
}

async function loadOlderTurns() {
  if (loadingOlder.value || !hasMoreHistory.value || oldestLoadedCursor.value == null) return
  const startedAt = Date.now()
  loadingOlder.value = true
  try {
    const older = await getOlderTurns(conversationId.value, oldestLoadedCursor.value, 20)
    if (older.length === 0) {
      hasMoreHistory.value = false
      return
    }
    const runtimeSession = runtime.getOrCreateSession(conversationId.value)
    const firstVisibleMessageId = messages.value[0]?.id || anchorMessageId.value || ""
    runtimeSession.localTurns = [
      ...older.slice().reverse().map(mapPersistedTurnToMessage),
      ...runtimeSession.localTurns,
    ]
    oldestLoadedCursor.value = getOldestCursorFromPersistedTurns(older)
    hasMoreHistory.value = older.length >= 20
    if (firstVisibleMessageId) {
      nextTick(() => {
        setProgrammaticAnchor(firstVisibleMessageId)
      })
    }
  } catch (error) {
    console.warn("load older turns skipped", error)
    hasMoreHistory.value = false
  } finally {
    const elapsed = Date.now() - startedAt
    if (elapsed < HISTORY_LOADING_MIN_MS) {
      await new Promise((resolve) => setTimeout(resolve, HISTORY_LOADING_MIN_MS - elapsed))
    }
    loadingOlder.value = false
  }
}

function scrollToBottom(force = false) {
  if (!messages.value.length) return
  if (!force && !shouldAutoFollowBottom.value) return
  shouldAutoFollowBottom.value = true
  hasUnreadBelow.value = false
  anchorMessageId.value = ""
  const targetId = getBottomAnchorId()
  scrollIntoView.value = ""
  scrollTop.value += 100000
  nextTick(() => {
    scrollIntoView.value = targetId
  })
}

function messageAnchorId(messageId: string) {
  return `msg-${String(messageId).replace(/[^a-zA-Z0-9_-]/g, "_")}`
}

function getBottomAnchorId() {
  return "message-list-bottom"
}

function setProgrammaticAnchor(messageId: string) {
  anchorMessageId.value = messageId
  scrollIntoView.value = ""
  nextTick(() => {
    scrollIntoView.value = messageAnchorId(messageId)
  })
}

function restoreScrollState(
  cachedViewState: ReturnType<typeof cacheStore.restore>,
  persistedRuntime: ConversationRuntimeRecord | null
) {
  const cachedNearBottom = cachedViewState?.nearBottom
  const cachedScrollTop = cachedViewState?.scrollTop
  const cachedAnchorMessageId = cachedViewState?.anchorMessageId
  const persistedAnchor = persistedRuntime?.scrollAnchor || ""

  if (!cachedViewState && !persistedAnchor) {
    scrollToBottom(true)
    restoredInitialScroll.value = true
    return
  }

  if (cachedNearBottom) {
    scrollToBottom(true)
    restoredInitialScroll.value = true
    return
  }

  isRestoringScroll.value = true
  shouldAutoFollowBottom.value = false

  if (typeof cachedScrollTop === "number" && cachedScrollTop > 0) {
    scrollIntoView.value = ""
    scrollTop.value = cachedScrollTop
    lastMeasuredScrollTop.value = cachedScrollTop
  } else if (cachedAnchorMessageId) {
    scrollIntoView.value = ""
    scrollIntoView.value = messageAnchorId(cachedAnchorMessageId)
  } else if (persistedAnchor) {
    scrollIntoView.value = ""
    scrollIntoView.value = persistedAnchor
  } else {
    scrollToBottom(true)
  }

  nextTick(() => {
    restoredInitialScroll.value = true
    isRestoringScroll.value = false
  })
}

function scheduleViewportSync(forceBottom = false) {
  nextTick(() => {
    measureMessageListHeight()
    if (isRestoringScroll.value) return
    if (forceBottom || shouldAutoFollowBottom.value) {
      scrollToBottom(true)
      return
    }
    scrollTop.value = lastMeasuredScrollTop.value
  })
}

function handleComposerLayoutChange() {
  if (!hasInitialBottomScroll.value) return
  scheduleViewportSync()
}

function handleScrollToBottomFab() {
  shouldAutoFollowBottom.value = true
  hasUnreadBelow.value = false
  anchorMessageId.value = ""
  scrollToBottom(true)
}

function handleCommandSelect(command: any) {
  inputText.value = `${command.prompt}\n\n`
  uni.showToast({ title: `已插入: ${command.name}`, icon: "success" })
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

async function loadDetailAgentConfig() {
  if (!conversationId.value || !currentAgentType.value) {
    detailAgentConfig.value = createEmptyDetailAgentConfigState()
    return
  }

  const contextKey = detailAgentConfigContextKey.value
  const persistedSelection = readPersistedAgentConfigSelection(contextKey) || undefined
  const cachedSnapshot = readFreshAgentConfigCache(contextKey)
  if (cachedSnapshot) {
    detailAgentConfig.value = createReadyDetailAgentConfigState(cachedSnapshot, persistedSelection)
  }

  const token = ++detailAgentProbeToken
  if (!cachedSnapshot) {
    detailAgentConfig.value = {
      ...createEmptyDetailAgentConfigState(),
      status: "loading",
    }
  }

  try {
    const snapshot = await acpApi.acpDescribeAgentOptions(currentAgentType.value, detailProjectPath.value || null)
    if (token !== detailAgentProbeToken) return
    persistAgentConfigCache(contextKey, snapshot)
    detailAgentConfig.value = createReadyDetailAgentConfigState(snapshot, persistedSelection || {
      selectedModeId: detailAgentConfig.value.selectedModeId,
      selectedValues: detailAgentConfig.value.selectedValues,
    })
  } catch (error) {
    if (token !== detailAgentProbeToken) return
    if (cachedSnapshot) return
    detailAgentConfig.value = {
      ...createEmptyDetailAgentConfigState("读取失败，将使用远端默认配置"),
      status: "failed",
    }
  }
}

function toggleConfigRow(key: ComposerConfigKey) {
  if (key === "model" && !hasModelOptions.value) return
  if (key === "reasoning" && !reasoningOption.value) return
  if (key === "permission" && !permissionOption.value) return
  expandedConfigKey.value = expandedConfigKey.value === key ? "" : key
}

async function selectDetailMode(modeId: string) {
  if (!modeId) return
  const conn = session.value?.connectionId
  if (!conn) {
    detailAgentConfig.value.selectedModeId = modeId
    persistAgentConfigSelection(detailAgentConfigContextKey.value, {
      selectedModeId: detailAgentConfig.value.selectedModeId,
      selectedValues: detailAgentConfig.value.selectedValues,
    })
    return
  }
  try {
    await acpApi.acpSetMode(conn, modeId)
    detailAgentConfig.value.selectedModeId = modeId
    persistAgentConfigSelection(detailAgentConfigContextKey.value, {
      selectedModeId: detailAgentConfig.value.selectedModeId,
      selectedValues: detailAgentConfig.value.selectedValues,
    })
  } catch (error) {
    uni.showToast({ title: `模型切换失败: ${toErrorMessage(error)}`, icon: "none" })
  }
}

async function selectDetailConfigValue(configId: string, valueId: string) {
  if (!configId || !valueId) return
  const conn = session.value?.connectionId
  if (!conn) {
    detailAgentConfig.value.selectedValues = {
      ...detailAgentConfig.value.selectedValues,
      [configId]: valueId,
    }
    persistAgentConfigSelection(detailAgentConfigContextKey.value, {
      selectedModeId: detailAgentConfig.value.selectedModeId,
      selectedValues: detailAgentConfig.value.selectedValues,
    })
    return
  }
  try {
    await acpApi.acpSetConfigOption(conn, configId, valueId)
    detailAgentConfig.value.selectedValues = {
      ...detailAgentConfig.value.selectedValues,
      [configId]: valueId,
    }
    persistAgentConfigSelection(detailAgentConfigContextKey.value, {
      selectedModeId: detailAgentConfig.value.selectedModeId,
      selectedValues: detailAgentConfig.value.selectedValues,
    })
  } catch (error) {
    uni.showToast({ title: `配置切换失败: ${toErrorMessage(error)}`, icon: "none" })
  }
}

async function applyPendingComposerConfig() {
  const conn = session.value?.connectionId
  if (!conn) return

  if (detailAgentConfig.value.selectedModeId) {
    await acpApi.acpSetMode(conn, detailAgentConfig.value.selectedModeId).catch(() => {})
  }

  for (const option of detailAgentConfig.value.configOptions) {
    const selectedValueId = detailAgentConfig.value.selectedValues[option.id]
    if (!selectedValueId) continue
    await acpApi.acpSetConfigOption(conn, option.id, selectedValueId).catch(() => {})
  }
}

function toggleComposerTools() {
  showComposerTools.value = !showComposerTools.value
  if (!showComposerTools.value) {
    expandedConfigKey.value = ""
    showAttachmentKinds.value = false
  }
}

function closeComposerTools() {
  showComposerTools.value = false
  showAttachmentKinds.value = false
  expandedConfigKey.value = ""
}

function toggleAttachmentKinds() {
  showAttachmentKinds.value = !showAttachmentKinds.value
}

function loadAvailableTodos() {
  const raw = uni.getStorageSync("mcode_todos")
  availableTodos.value = parseIncompleteTodos(raw)
}

function openTodoPicker() {
  loadAvailableTodos()
  showTodoPicker.value = true
}

function selectTodoForComposer(item: ComposerTodoItem) {
  inputText.value = inputText.value.trim()
    ? `${inputText.value}\n${item.text}`
    : item.text
  showTodoPicker.value = false
  closeComposerTools()
}

async function sendMessage() {
  if (!canSend.value) return
  if (!canSendSharedLive.value) {
    showSharedLiveBlockedToast()
    return
  }
  if (uploadingCount.value > 0) {
    uni.showToast({ title: "文件上传中，请稍后发送", icon: "none" })
    return
  }

  const draft = createDraftFromComposer()
  if (!draft) return

  if (isBusyForSend.value) {
    draftQueue.value.push(draft)
    queueExpanded.value = true
    uni.showToast({ title: "已加入待发送队列", icon: "none" })
    return
  }

  const ok = await sendDraft(draft)
  if (!ok) {
    draft.status = "failed"
    draftQueue.value.unshift(draft)
    queueExpanded.value = true
  } else {
    void processDraftQueue()
  }
}

async function sendContinueMessage() {
  if (!canSendSharedLive.value) {
    showSharedLiveBlockedToast()
    return
  }
  if (uploadingCount.value > 0) {
    uni.showToast({ title: "文件上传中，请稍后发送", icon: "none" })
    return
  }
  inputText.value = "继续"
  attachments.value = []
  await sendMessage()
}

function createDraftFromComposer(): QueuedDraft | null {
  const text = inputText.value.trim()
  const atts = attachments.value.map((att) => ({ ...att }))
  if (!text && atts.length === 0) return null

  inputText.value = ""
  attachments.value = []

  return {
    id: createLocalId("draft"),
    text: resolveSlashPreset(text),
    attachments: atts,
    createdAt: Date.now(),
    status: "pending",
  }
}

async function sendDraft(draft: QueuedDraft): Promise<boolean> {
  if (!canSendSharedLive.value) {
    showSharedLiveBlockedToast()
    return false
  }
  sending.value = true
  draft.status = "sending"
  draft.error = undefined
  shouldAutoFollowBottom.value = true
  anchorMessageId.value = ""

  try {
    const imageAtts = draft.attachments.filter((item) => item.kind === "image")
    const fileAtts = draft.attachments.filter((item) => item.kind === "file")
    runtime.addOptimisticUserMessage(
      conversationId.value,
      buildOptimisticText(draft.text, fileAtts),
      imageAtts
    )
    scheduleViewportSync(true)

    const blocks: PromptInputBlock[] = []
    if (draft.text) {
      blocks.push({ type: "text", text: draft.text })
    }

    draft.attachments.forEach((att) => {
      if (att.kind === "image") {
        blocks.push({
          type: "image",
          source: { type: "url", url: att.url, media_type: att.type },
        })
        return
      }
      blocks.push({
        type: "resource",
        resource: {
          type: "file",
          uri: att.url,
          name: att.name,
          size: att.size,
        },
      })
    })

    const conn = session.value?.connectionId
    if (!conn) throw new Error("未连接到代理")
    if (isViewerMode.value) {
      const liveInfo = await acpApi
        .acpFindConnectionForConversation(conversationId.value)
        .catch(() => null)
      if (liveInfo?.connection_id && liveInfo.connection_id !== conn) {
        throw new Error("该会话已被其他端重新接管，请等待当前轮结束后再发送")
      }
    }
    await acpApi.acpPrompt(conn, blocks, folderId.value, conversationId.value)
    runtime.beginPlaceholderThinking(conversationId.value)
    usePetStore().addExp('user', 5)
    return true
  } catch (error) {
    runtime.clearLiveMessage(conversationId.value)
    const message = toErrorMessage(error)
    draft.status = "failed"
    draft.error = message
    uni.showToast({ title: `发送失败: ${message}`, icon: "none", duration: 3000 })
    return false
  } finally {
    sending.value = false
  }
}

async function processDraftQueue() {
  if (
    processingQueue.value ||
    isBusyForSend.value ||
    uploadingCount.value > 0 ||
    !canSendSharedLive.value
  ) return
  if (draftQueue.value.length === 0) return
  processingQueue.value = true
  try {
    while (
      draftQueue.value.length > 0 &&
      !isBusyForSend.value &&
      uploadingCount.value === 0 &&
      canSendSharedLive.value
    ) {
      const item = draftQueue.value[0]
      const ok = await sendDraft(item)
      if (ok) {
        draftQueue.value.shift()
      } else {
        item.status = "failed"
        break
      }
    }
  } finally {
    processingQueue.value = false
  }
}

async function sendQueuedDraft(id: string) {
  const index = draftQueue.value.findIndex((item) => item.id === id)
  if (index < 0) return
  if (!canSendSharedLive.value) {
    showSharedLiveBlockedToast()
    return
  }
  if (isBusyForSend.value || uploadingCount.value > 0) {
    uni.showToast({ title: "当前正在处理，请稍后", icon: "none" })
    return
  }
  const target = draftQueue.value[index]
  const ok = await sendDraft(target)
  if (ok) {
    draftQueue.value.splice(index, 1)
    void processDraftQueue()
  }
}

function removeDraft(id: string) {
  const index = draftQueue.value.findIndex((item) => item.id === id)
  if (index >= 0) {
    draftQueue.value.splice(index, 1)
  }
}

function showSharedLiveBlockedToast() {
  uni.showToast({
    title: "该会话正在其他端处理中，当前仅可旁观，待本轮结束后可发送",
    icon: "none",
    duration: 3000,
  })
}

function applySlashCommand(item: SlashCommandItem) {
  const source = inputText.value || ""
  if (/(?:^|\n)\/([a-zA-Z]*)$/.test(source)) {
    inputText.value = source.replace(/(?:^|\n)\/([a-zA-Z]*)$/, (all) =>
      all.startsWith("\n") ? `\n${item.key} ` : `${item.key} `
    )
  } else {
    inputText.value = `${source}${source ? "\n" : ""}${item.key} `
  }
}

function insertSlash() {
  if (!inputText.value.endsWith("/")) {
    inputText.value = `${inputText.value}${inputText.value ? "\n" : ""}/`
  }
}

function resolveSlashPreset(text: string): string {
  return text
}

function chooseImages() {
  uni.chooseImage({
    count: 9,
    sizeType: ["compressed"],
    sourceType: ["album", "camera"],
    success: async (res) => {
      const tempFiles = Array.isArray(res.tempFiles) ? res.tempFiles : []
      const tempPaths = Array.isArray(res.tempFilePaths) ? res.tempFilePaths : []
      const files = tempPaths.map((path: string, index: number) => {
        const file = tempFiles[index] as { path?: string; size?: number; type?: string; name?: string } | undefined
        return {
          path,
          name: file?.name || path.split("/").pop() || `image-${index + 1}.jpg`,
          size: Number(file?.size || 0),
          type: file?.type || "image/jpeg",
          kind: "image",
        } satisfies PickedLocalFile
      })
      await uploadPickedFiles(files)
    },
  })
}

function chooseFiles() {
  const chooser = (uni as any).chooseMessageFile || (uni as any).chooseFile
  if (typeof chooser !== "function") {
    uni.showToast({ title: "当前平台不支持文件选择", icon: "none" })
    return
  }

  chooser({
    count: 9,
    type: "file",
    extension: [],
    success: async (res: any) => {
      const tempFiles = Array.isArray(res?.tempFiles) ? res.tempFiles : []
      const files = tempFiles
        .map((file: any, index: number) => {
          const path = firstString(file?.path, file?.tempFilePath)
          if (!path) return null
          const name = firstString(file?.name) || path.split("/").pop() || `file-${index + 1}`
          return {
            path,
            name,
            size: Number(file?.size || 0),
            type: firstString(file?.type) || "application/octet-stream",
            kind: "file",
          } satisfies PickedLocalFile
        })
        .filter(Boolean) as PickedLocalFile[]

      if (files.length === 0) {
        uni.showToast({ title: "未选择可用文件", icon: "none" })
        return
      }

      await uploadPickedFiles(files)
    },
    fail: () => {},
  })
}

function handleChooseImages() {
  showAttachmentKinds.value = false
  closeComposerTools()
  chooseImages()
}

function handleChooseFiles() {
  showAttachmentKinds.value = false
  closeComposerTools()
  chooseFiles()
}

async function uploadPickedFiles(files: PickedLocalFile[]) {
  for (const file of files) {
    const queueItem: UploadQueueItem = {
      id: createLocalId("upload"),
      name: file.name,
      size: file.size,
      type: file.type,
      kind: file.kind,
      progress: 0,
      status: "uploading",
    }

    uploadQueue.value.unshift(queueItem)
    uploadingCount.value += 1

    try {
      const uploaded = await uploadSingleFile(file, queueItem.id)
      attachments.value.push(uploaded)
      queueItem.status = "success"
      queueItem.progress = 100
    } catch (error) {
      queueItem.status = "error"
      queueItem.error = toErrorMessage(error)
      uni.showToast({ title: `${file.name} 上传失败`, icon: "none" })
    } finally {
      uploadingCount.value = Math.max(0, uploadingCount.value - 1)
    }
  }
}

async function uploadSingleFile(file: PickedLocalFile, queueId: string): Promise<UploadedAttachment> {
  const target = resolveUploadTarget()
  const connectionId = session.value?.connectionId || ""
  const uploadResult = await new Promise<{ path?: string; url?: string; name?: string; size?: number }>((resolve, reject) => {
    const task = uni.uploadFile({
      url: target.url,
      filePath: file.path,
      name: "file",
      header: target.header,
      formData: {
        sessionId: connectionId,
      },
      success: (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`上传失败(${res.statusCode})`))
          return
        }
        try {
          const parsed = typeof res.data === "string" ? JSON.parse(res.data) : res.data
          resolve(parsed || {})
        } catch {
          reject(new Error("上传返回解析失败"))
        }
      },
      fail: (err) => {
        reject(new Error(err?.errMsg || "上传失败"))
      },
    })
    task.onProgressUpdate((event) => {
      const item = uploadQueue.value.find((queue) => queue.id === queueId)
      if (item) item.progress = Number(event.progress || 0)
    })
  })

  const url = firstString(uploadResult.url, uploadResult.path)
  if (!url) {
    throw new Error("上传结果缺少 URL")
  }

  return {
    id: createLocalId("att"),
    url,
    name: firstString(uploadResult.name) || file.name,
    size: Number(uploadResult.size || file.size || 0),
    type: file.type,
    kind: file.kind,
  }
}

function resolveUploadTarget(): { url: string; header: Record<string, string> } {
  const descriptor = resolveDetailDescriptor()
  const base = String(descriptor.baseUrl || "").replace(/\/$/, "")
  if (!base) {
    throw new Error("连接地址为空")
  }

  const header: Record<string, string> = {}
  if (descriptor.mode === "direct") {
    const token = firstString(descriptor.authToken, getDirectToken(descriptor.baseUrl))
    if (token) header.authorization = `Bearer ${token}`
    return { url: `${base}/api/upload_attachment`, header }
  }

  const relayToken = firstString(descriptor.authToken, auth.relaySession?.accessToken)
  if (relayToken) {
    header.authorization = `Bearer ${relayToken}`
  }
  return { url: `${base}/v1/proxy/upload_attachment`, header }
}

function syncAuthByConnectionKey(connKey: string) {
  const matched = findStoredConnectionByKey(connKey)
  if (!matched) return

  if (matched.mode === "direct") {
    const token = matched.directToken || getDirectToken(matched.url)
    if (token) auth.setDirectMode(matched.url, token)
    return
  }

  const accessToken = matched.relaySession?.accessToken
  if (accessToken) {
    auth.setRelayMode(matched.url, {
      accessToken,
      refreshToken: matched.relaySession?.refreshToken,
      targetId: matched.relaySession?.targetId,
    })
  }
}

function buildConnectionKey(mode: "direct" | "relay", url: string): string {
  return `${mode}::${String(url || "").trim().replace(/\/+$/, "")}`
}

function findStoredConnectionByKey(connKey: string) {
  const saved = (Array.isArray(uni.getStorageSync("mcode_connections"))
    ? uni.getStorageSync("mcode_connections")
    : []) as StoredConnectionItem[]
  return saved.find((item) => buildConnectionKey(item.mode, item.url) === connKey) || null
}

function resolveDetailDescriptor(): RemoteInstanceDescriptor {
  const managed = managedConversation.value
  if (managed?.instanceKey) {
    const registered = getRegisteredRemoteInstanceDescriptor(managed.instanceKey)
    if (registered) {
      return registered
    }
  }

  const stored = findStoredConnectionByKey(routeConnectionKey.value || detailConnectionKey.value)
  const fromStored = stored ? buildDescriptorFromStoredConnection(stored) : null
  if (fromStored) {
    registerRemoteInstanceDescriptor(fromStored)
    return fromStored
  }

  return auth.currentRemoteInstance()
}

function resolveDetailInstanceKey() {
  return resolveDetailDescriptor().instanceKey || "anonymous"
}

function buildDescriptorFromStoredConnection(
  conn: StoredConnectionItem
): RemoteInstanceDescriptor | null {
  const baseUrl = String(conn.url || "").trim().replace(/\/+$/, "")
  if (!baseUrl) return null

  if (conn.mode === "direct") {
    const token = firstString(conn.directToken, getDirectToken(conn.url))
    const principal = token ? `direct:${token.slice(0, 16)}` : "direct:anonymous"
    return {
      instanceKey: buildRemoteInstanceKey({
        mode: "direct",
        baseUrl,
        principal,
      }),
      mode: "direct",
      baseUrl,
      principal,
      authToken: token || undefined,
    }
  }

  const accessToken = firstString(conn.relaySession?.accessToken)
  const refreshToken = firstString(conn.relaySession?.refreshToken) || undefined
  const targetId = firstString(conn.relaySession?.targetId)
  const principal = targetId || refreshToken || accessToken || "relay:anonymous"
  return {
    instanceKey: buildRemoteInstanceKey({
      mode: "relay",
      baseUrl,
      principal,
    }),
    mode: "relay",
    baseUrl,
    principal,
    authToken: accessToken || undefined,
    refreshToken,
  }
}

async function getDetailGateway() {
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
  return createGateway({
    mode: "relay",
    relayUrl: descriptor.baseUrl,
    session,
  })
}

function removeAttachment(index: number) {
  attachments.value.splice(index, 1)
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

async function regenerateLastMessage() {
  const lastUserMessage = [...messages.value].reverse().find((item) => item.role === "user")
  if (!lastUserMessage) return

  await cancelGeneration()
  const textContent = getTurnContentParts(lastUserMessage).find((part) => part.type === "text")
  if (textContent?.text) {
    inputText.value = textContent.text
    await sendMessage()
  }
}

function draftSummary(item: QueuedDraft): string {
  const text = item.text.trim()
  if (text) {
    if (item.attachments.length > 0) {
      return `${text}（${item.attachments.length} 个附件）`
    }
    return text
  }
  return `附件消息（${item.attachments.length} 个）`
}

function queueStatusText(status: QueuedDraft["status"]): string {
  if (status === "sending") return "发送中"
  if (status === "failed") return "失败"
  return "待发送"
}

function formatQueueTime(ts: number): string {
  const date = new Date(ts)
  const hh = String(date.getHours()).padStart(2, "0")
  const mm = String(date.getMinutes()).padStart(2, "0")
  return `${hh}:${mm}`
}

function buildOptimisticText(text: string, files: UploadedAttachment[]): string {
  if (files.length === 0) return text
  const filesLine = files.map((item) => item.name).join("、")
  const prefix = text.trim()
  if (!prefix) return `已附文件：${filesLine}`
  return `${prefix}\n\n已附文件：${filesLine}`
}

function createLocalId(prefix: string): string {
  sequence.value += 1
  return `${prefix}-${Date.now()}-${sequence.value}`
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

function mergeTaskFromToolCall(
  taskMap: Map<string, PlanTask>,
  toolCall: ToolCall,
  nextOrder: () => number
) {
  const name = normalizeToolName(toolCall.name)
  if (!name.includes("task") && !name.includes("todo")) return

  const input = (toolCall.input || {}) as Record<string, any>

  if (name === "tasklist" || name === "task_list") {
    const outputObj = toObject(toolCall.output)
    const taskList =
      (outputObj?.tasks as any[]) ||
      (outputObj?.todos as any[]) ||
      (outputObj?.list as any[]) ||
      []

    taskList.forEach((item, index) => {
      if (!item || typeof item !== "object") return
      const id = firstString(item.taskId, item.task_id, item.id) || `tasklist-${index}`
      upsertTask(taskMap, id, nextOrder, {
        subject:
          firstString(item.subject, item.title, item.content, item.description) ||
          `任务 ${index + 1}`,
        description: firstString(item.description, item.activeForm),
        status: normalizeTaskStatus(item.status),
      })
    })
    return
  }

  if (name === "todowrite" && Array.isArray(input.todos)) {
    input.todos.forEach((item: Record<string, any>, index: number) => {
      if (!item || typeof item !== "object") return
      const id = firstString(item.id, item.taskId) || `todo-${index}`
      upsertTask(taskMap, id, nextOrder, {
        subject:
          firstString(item.content, item.subject, item.title, item.description) ||
          `任务 ${index + 1}`,
        description: firstString(item.activeForm),
        status: normalizeTaskStatus(item.status),
      })
    })
    return
  }

  if (name === "taskcreate" || name === "task_create") {
    const outputObj = toObject(toolCall.output)
    const id =
      firstString(input.taskId, input.task_id, outputObj?.taskId, outputObj?.task_id, outputObj?.id) ||
      `task-create-${toolCall.id}`
    upsertTask(taskMap, id, nextOrder, {
      subject:
        firstString(input.subject, input.title, input.content, input.description) ||
        "新任务",
      description: firstString(input.description, input.activeForm),
      status: normalizeTaskStatus(input.status || outputObj?.status),
    })
    return
  }

  if (name === "taskupdate" || name === "task_update") {
    const id =
      firstString(input.taskId, input.task_id, input.id) || `task-update-${toolCall.id}`
    upsertTask(taskMap, id, nextOrder, {
      subject: firstString(input.subject),
      description: firstString(input.description, input.activeForm),
      status: normalizeTaskStatus(input.status),
    })
  }
}

function mergeTaskFromPlanPart(
  taskMap: Map<string, PlanTask>,
  plan: ContentPart["plan"],
  nextOrder: () => number,
  keyPrefix: string
) {
  const steps = Array.isArray(plan?.steps) ? plan.steps : []
  steps.forEach((step, index) => {
    const subject = firstString(step?.description) || `任务 ${index + 1}`
    const normalizedKey = normalizePlanStepKey(subject)
    const id = normalizedKey ? `plan-${normalizedKey}` : `plan-${keyPrefix}-${index}`
    upsertTask(taskMap, id, nextOrder, {
      subject,
      status: step?.completed ? "completed" : "pending",
    })
  })
}

function upsertTask(
  taskMap: Map<string, PlanTask>,
  id: string,
  nextOrder: () => number,
  patch: Partial<Omit<PlanTask, "id" | "order">>
) {
  const existing = taskMap.get(id)
  if (!existing) {
    taskMap.set(id, {
      id,
      subject: patch.subject || "任务",
      description: patch.description,
      status: patch.status || "pending",
      order: nextOrder(),
    })
    return
  }

  if (patch.subject) existing.subject = patch.subject
  if (patch.description) existing.description = patch.description
  if (patch.status) existing.status = patch.status
}

function normalizeToolName(name?: string): string {
  return String(name || "").trim().toLowerCase().replace(/[\s_-]/g, "")
}

function normalizePlanStepKey(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

function normalizeTaskStatus(value: unknown): PlanTaskStatus {
  const status = String(value || "").trim().toLowerCase()
  if (
    status === "in_progress" ||
    status === "inprogress" ||
    status === "running" ||
    status === "active" ||
    status === "processing"
  ) {
    return "in_progress"
  }
  if (
    status === "completed" ||
    status === "done" ||
    status === "success" ||
    status === "finished"
  ) {
    return "completed"
  }
  if (
    status === "failed" ||
    status === "error" ||
    status === "cancelled" ||
    status === "canceled"
  ) {
    return "failed"
  }
  return "pending"
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return undefined
}

function toObject(raw: unknown): Record<string, any> | null {
  if (!raw) return null
  if (typeof raw === "object") return raw as Record<string, any>
  if (typeof raw !== "string") return null

  const text = raw.trim()
  if (!text) return null

  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === "object") return parsed as Record<string, any>
    return null
  } catch {
    return null
  }
}

function taskStatusLabel(status: PlanTaskStatus): string {
  if (status === "in_progress") return "进行中"
  if (status === "completed") return "已完成"
  if (status === "failed") return "失败"
  return "待处理"
}

function countByStatus(status: PlanTaskStatus): number {
  return planTasks.value.filter((task) => task.status === status).length
}

function normalizeTurns(rawTurns: unknown): MessageTurn[] {
  if (!Array.isArray(rawTurns)) return []
  return rawTurns.map((raw, index) => normalizeTurn(raw, index)).filter(Boolean) as MessageTurn[]
}

function normalizeTurn(raw: any, index: number): MessageTurn | null {
  if (!raw || typeof raw !== "object") return null
  const rawRole = String(raw.role || "").toLowerCase()
  const role = rawRole === "user" ? "user" : "assistant"
  const content = normalizeContentParts(raw.content, raw.blocks)
  const id = firstString(raw.id) || `turn-${index}-${Date.now()}`
  const timestamp =
    typeof raw.timestamp === "number"
      ? raw.timestamp
      : typeof raw.timestamp === "string"
        ? Date.parse(raw.timestamp) || Date.now()
      : typeof raw.created_at === "number"
        ? raw.created_at
        : Date.now()

  return {
    id,
    role,
    content,
    timestamp,
    status: raw.status,
    error: firstString(raw.error),
  }
}

function normalizeContentParts(rawContent: unknown, rawBlocks?: unknown): ContentPart[] {
  if (Array.isArray(rawBlocks) && rawBlocks.length > 0) {
    const parts = normalizeBlocks(rawBlocks)
    if (parts.length > 0) return parts
  }

  if (Array.isArray(rawContent)) {
    const hasCodegToolBlocks = rawContent.some((part: any) => {
      const type = firstString(part?.type)
      return type === "tool_use" || type === "tool_result"
    })
    if (hasCodegToolBlocks) {
      const parts = normalizeBlocks(rawContent)
      if (parts.length > 0) return parts
    }
    return rawContent
      .map((part) => normalizeContentPart(part))
      .filter(Boolean) as ContentPart[]
  }

  const text = firstString(rawContent)
  if (text) return [{ type: "text", text }]
  return []
}

function normalizeContentPart(raw: any): ContentPart | null {
  if (!raw || typeof raw !== "object") {
    const text = firstString(raw)
    return text ? { type: "text", text } : null
  }

  const type = firstString(raw.type)
  if (type === "text") return { type: "text", text: firstString(raw.text) || "" }
  if (type === "thinking") return { type: "thinking", thinking: firstString(raw.thinking) || "" }
  if (type === "tool_call" && raw.tool_call && typeof raw.tool_call === "object") {
    return {
      type: "tool_call",
      tool_call: {
        id: firstString(raw.tool_call.id) || `tool-${Date.now()}`,
        name: firstString(raw.tool_call.name) || "unknown",
        input: (raw.tool_call.input && typeof raw.tool_call.input === "object")
          ? raw.tool_call.input
          : {},
        status: raw.tool_call.status,
        output: firstString(raw.tool_call.output),
        error: firstString(raw.tool_call.error),
      },
    }
  }
  if (type === "image" && raw.image && typeof raw.image === "object") {
    return {
      type: "image",
      image: {
        url: firstString(raw.image.url) || "",
        alt: firstString(raw.image.alt),
      },
    }
  }
  if (type === "plan" && raw.plan && typeof raw.plan === "object") {
    const steps = Array.isArray(raw.plan.steps) ? raw.plan.steps : []
    return {
      type: "plan",
      plan: {
        steps: steps
          .map((step: any) => ({
            description: firstString(step?.description, step?.title, step?.content) || "",
            completed: Boolean(step?.completed),
          }))
          .filter((step: any) => step.description),
        status: raw.plan.status,
      },
    }
  }

  const text = firstString(raw.text, raw.content, raw.description)
  return text ? { type: "text", text } : null
}

function getTurnContentParts(turn: any): ContentPart[] {
  if (turn?.content && Array.isArray(turn.content)) return turn.content as ContentPart[]
  return normalizeContentParts(turn?.content, turn?.blocks)
}

function normalizeAgentType(raw?: string): string {
  const value = String(raw || "").trim().toLowerCase().replace(/[\s-]/g, "_")
  if (!value) return "claude_code"
  if (value === "claudecode") return "claude_code"
  if (value === "codex_cli") return "codex"
  if (value === "gemini_cli" || value === "google_gemini" || value === "gemini_code") return "gemini"
  if (value === "cline_cli") return "cline"
  if (value === "opencode") return "open_code"
  if (value === "open_code_cli") return "open_code"
  if (value === "openclaw") return "open_claw"
  if (value === "open_claw_cli") return "open_claw"
  return value
}

function normalizeBlocks(rawBlocks: unknown[]): ContentPart[] {
  const parts: ContentPart[] = []
  const consumedResultIndexes = new Set<number>()

  for (let index = 0; index < rawBlocks.length; index++) {
    if (consumedResultIndexes.has(index)) continue
    const block = rawBlocks[index] as any
    if (!block || typeof block !== "object") continue
    const type = firstString(block.type)
    if (type === "text") {
      parts.push({ type: "text", text: firstString(block.text) || "" })
      continue
    }
    if (type === "thinking") {
      parts.push({ type: "thinking", thinking: firstString(block.text) || "" })
      continue
    }
    if (type === "image") {
      const uri = firstString(block.uri)
      const data = firstString(block.data)
      const mime = firstString(block.mime_type) || "image/png"
      parts.push({
        type: "image",
        image: {
          url: uri || (data ? `data:${mime};base64,${data}` : ""),
          alt: "image",
          },
        })
        continue
      }
    if (type === "tool_use") {
      const toolUseId = firstString(block.tool_use_id)
      const inputPreview = firstString(block.input_preview)
      const nextBlock = rawBlocks[index + 1] as any
      const canPairByPosition =
        !toolUseId &&
        nextBlock &&
        typeof nextBlock === "object" &&
        firstString(nextBlock.type) === "tool_result" &&
        !firstString(nextBlock.tool_use_id)
      const matchedResult =
        toolUseId
          ? rawBlocks.find((candidate: any) =>
              candidate &&
              typeof candidate === "object" &&
              firstString(candidate.type) === "tool_result" &&
              firstString(candidate.tool_use_id) === toolUseId
            )
          : canPairByPosition
            ? nextBlock
            : null

      if (canPairByPosition) {
        consumedResultIndexes.add(index + 1)
      }

      const output = matchedResult ? firstString(matchedResult.output_preview) || "" : undefined
      const isError = Boolean(matchedResult?.is_error)
      parts.push({
        type: "tool_call",
        tool_call: {
          id: toolUseId || `tool-${index}-${Date.now()}`,
          name: firstString(block.tool_name) || "tool",
          input: toObject(inputPreview) || {},
          output,
          status: matchedResult ? (isError ? "error" : "completed") : "running",
          error: isError ? output : undefined,
        },
      })
      continue
    }
    if (type === "tool_result") {
      const toolUseId = firstString(block.tool_use_id)
      const output = firstString(block.output_preview) || ""
      if (toolUseId) {
        const matched = [...parts].reverse().find(
          (part) => part.type === "tool_call" && part.tool_call?.id === toolUseId
        )
        if (matched?.tool_call) {
          matched.tool_call.output = output
          matched.tool_call.status = block.is_error ? "error" : "completed"
          if (block.is_error) matched.tool_call.error = output
          continue
        }
      }
        parts.push({
          type: "tool_call",
          tool_call: {
            id: toolUseId || `tool-${index}-${Date.now()}`,
            name: "tool_result",
            input: {},
            output,
            status: block.is_error ? "error" : "completed",
            error: block.is_error ? output : undefined,
          },
        })
      }
  }

  return parts
}
</script>

<style scoped lang="scss">
.page {
  height: 100vh;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #f2f3f5;
  overflow: hidden;
}

.loading-container,
.empty-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.detail-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.toolbar {
  position: relative;
  z-index: 5;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 24rpx;
  background-color: #ffffff;
  border-bottom: 1rpx solid #f0f0f0;
  box-sizing: border-box;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.runtime-dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background-color: #c0c4cc;

  &--online {
    background-color: #19be6b;
  }

  &--running {
    background-color: #2979ff;
    animation: pulse 1.2s infinite;
  }

  &--pending {
    background-color: #faad14;
  }

  &--error {
    background-color: #fa3534;
  }
}

@keyframes pulse {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.2); opacity: 0.6; }
  100% { transform: scale(1); opacity: 1; }
}

.runtime-label {
  font-size: 24rpx;
  color: #6b7280;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.icon-btn {
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16rpx;
  background-color: #f5f6f8;

  &:active {
    background-color: #e8e8e8;
  }

  &--disabled {
    opacity: 0.6;
  }

  &--danger {
    background-color: #fff1f0;
  }
}

.message-list {
  flex: 1;
  min-height: 0;
  padding: 0;
  box-sizing: border-box;
}

.message-list__content {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.message-item {
  margin-top: 5px;
  margin-bottom: 5px;
}

.empty-messages {
  padding-top: 48rpx;
}

.history-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  flex-shrink: 0;
  padding: 12rpx 24rpx;
  background-color: #f2f3f5;
}

.history-status__text {
  font-size: 22rpx;
  color: #909399;
}

.stats-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  padding: 16rpx;
}

.stats-text {
  font-size: 22rpx;
  color: #c0c4cc;
}

.list-bottom {
  height: calc(24rpx + env(safe-area-inset-bottom));
}

.input-wrap {
  position: relative;
  flex-shrink: 0;
  z-index: 30;
  background-color: #ffffff;
  border-top: 1rpx solid #f0f0f0;
  padding: 14rpx 16rpx;
  padding-bottom: calc(14rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

.permission-card {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  margin-bottom: 16rpx;
  padding: 22rpx 24rpx;
  border-radius: 22rpx;
  background: linear-gradient(180deg, #fffaf0 0%, #ffffff 100%);
  border: 1rpx solid rgba(250, 173, 20, 0.28);
  box-shadow: 0 10rpx 28rpx rgba(250, 173, 20, 0.08);
}

.permission-card__header {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.permission-card__badge {
  width: 16rpx;
  height: 16rpx;
  border-radius: 999rpx;
  background-color: #faad14;
  box-shadow: 0 0 0 6rpx rgba(250, 173, 20, 0.14);
}

.permission-card__title {
  font-size: 26rpx;
  font-weight: 600;
  color: #7c4a03;
}

.permission-card__desc {
  font-size: 24rpx;
  line-height: 1.6;
  color: #5c5f66;
}

.permission-card__actions {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.permission-card__option {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.permission-card__action {
  width: 100%;
  min-height: 72rpx;
  padding: 0 24rpx;
  border: none;
  border-radius: 18rpx;
  background: #fff7e6;
  color: #8a5200;
  font-size: 24rpx;
  font-weight: 600;
  line-height: 72rpx;
  text-align: center;
  box-sizing: border-box;
}

.permission-card__action::after {
  border: none;
}

.permission-card__action[disabled] {
  opacity: 0.72;
}

.permission-card__action--loading {
  background: #ffe7ba;
}

.permission-card__option-desc {
  font-size: 22rpx;
  line-height: 1.5;
  color: #8c8c8c;
}

.permission-card__empty {
  font-size: 22rpx;
  color: #8c8c8c;
}

.slash-panel {
  margin-bottom: 12rpx;
  border: 1rpx solid #e9edf3;
  border-radius: 16rpx;
  background-color: #fbfcff;
  overflow: hidden;
}

.composer-tools {
  margin-bottom: 12rpx;
  padding: 22rpx 20rpx;
  border-radius: 20rpx;
  background: #ffffff;
  border: 1rpx solid #eef1f6;
  box-shadow: 0 10rpx 28rpx rgba(15, 23, 42, 0.05);
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.composer-tools__section {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.composer-tools__title {
  font-size: 22rpx;
  font-weight: 600;
  color: #5f6470;
}

.composer-tools__actions,
.composer-tools__subactions {
  display: flex;
  gap: 12rpx;
  flex-wrap: wrap;
}

.composer-tools__action,
.composer-tools__subaction {
  min-width: 160rpx;
  padding: 16rpx 18rpx;
  border-radius: 16rpx;
  background: #f6f8fc;
  border: 1rpx solid #e8edf5;
  color: #303133;
  font-size: 23rpx;
  line-height: 1.4;
  box-sizing: border-box;
}

.composer-tools__action-text {
  font-size: 23rpx;
  color: #303133;
}

.composer-config-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  padding: 16rpx 18rpx;
  border-radius: 16rpx;
  background: #f8f9fc;
  border: 1rpx solid #eef2f7;
}

.composer-config-row--disabled {
  opacity: 0.72;
}

.composer-config-row__label {
  font-size: 23rpx;
  color: #303133;
}

.composer-config-row__value {
  font-size: 22rpx;
  color: #909399;
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

.slash-item {
  padding: 16rpx 18rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  border-bottom: 1rpx solid #edf1f7;

  &:last-child {
    border-bottom: none;
  }
}

.slash-item__left {
  flex-shrink: 0;
  min-width: 0;
  display: flex;
  align-items: center;
}

.slash-item__key {
  font-size: 21rpx;
  color: #2979ff;
  font-family: "Courier New", monospace;
}

.slash-item__desc {
  font-size: 21rpx;
  color: #9298a6;
  flex: 1;
  min-width: 0;
  text-align: right;
}

.upload-queue {
  margin-bottom: 10rpx;
  padding: 10rpx 14rpx;
  border-radius: 14rpx;
  background: #f7f9fc;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.upload-queue__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10rpx;
}

.upload-queue__left {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.upload-queue__name {
  font-size: 22rpx;
  color: #5f6470;
}

.upload-queue__status {
  font-size: 21rpx;
  color: #909399;

  &--success {
    color: #19be6b;
  }

  &--error {
    color: #fa3534;
  }
}

.attachments-preview {
  display: flex;
  gap: 12rpx;
  padding-bottom: 12rpx;
  overflow-x: auto;
}

.attachment-item {
  position: relative;
  flex-shrink: 0;
}

.attachment-image {
  width: 112rpx;
  height: 112rpx;
  border-radius: 12rpx;
  object-fit: cover;
}

.attachment-file {
  width: 184rpx;
  height: 112rpx;
  border-radius: 12rpx;
  background: #f4f6fa;
  border: 1rpx solid #e7ebf2;
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 0 12rpx;
  box-sizing: border-box;
}

.attachment-file__name {
  font-size: 22rpx;
  color: #4a4f5a;
  flex: 1;
  min-width: 0;
}

.attachment-remove {
  position: absolute;
  top: -8rpx;
  right: -8rpx;
  width: 34rpx;
  height: 34rpx;
  background-color: rgba(0, 0, 0, 0.58);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.queue-bar {
  margin-bottom: 10rpx;
  padding: 10rpx 14rpx;
  border-radius: 14rpx;
  background: #f3f7ff;
  border: 1rpx solid #dde8ff;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.queue-bar__left {
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.queue-bar__text {
  font-size: 23rpx;
  color: #2979ff;
}

.queue-panel {
  margin-bottom: 12rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.queue-item {
  padding: 12rpx;
  border-radius: 14rpx;
  background: #f8f9fc;
  border: 1rpx solid #edf1f6;
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
}

.queue-item__body {
  flex: 1;
  min-width: 0;
}

.queue-item__text {
  display: block;
  font-size: 23rpx;
  color: #373c47;
  line-height: 1.4;
}

.queue-item__meta {
  margin-top: 6rpx;
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.queue-item__status {
  font-size: 20rpx;

  &--pending { color: #8a919f; }
  &--sending { color: #2979ff; }
  &--failed { color: #fa3534; }
}

.queue-item__time {
  font-size: 20rpx;
  color: #b4bbc7;
}

.queue-item__actions {
  display: flex;
  align-items: center;
  gap: 8rpx;
  flex-shrink: 0;
}

.queue-op {
  font-size: 20rpx;
  color: #8a919f;
  padding: 6rpx 10rpx;
  border-radius: 999rpx;
  background-color: #edf0f5;

  &--primary {
    color: #2979ff;
    background-color: #e8f0ff;
  }
}

.input-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.input-action {
  width: 64rpx;
  height: 64rpx;
  border-radius: 16rpx;
  background-color: #f3f5f8;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.input-box {
  flex: 1;
  background-color: #f5f6f8;
  border-radius: 24rpx;
  padding: 10rpx 20rpx;
  min-height: 64rpx;
  display: flex;
  align-items: center;
}

.composer-textarea {
  width: 100%;
  background: transparent;

  :deep(.u-textarea) {
    padding: 0;
    background: transparent;
    border: none !important;
  }

  :deep(.u-textarea--no-radius) {
    background: transparent !important;
  }

  :deep(.u-textarea__field),
  :deep(.uni-textarea-textarea),
  :deep(textarea) {
    min-height: 34rpx;
    max-height: 200rpx;
    line-height: 34rpx;
    font-size: 28rpx;
    background: transparent !important;
    overflow-y: auto;
  }

  :deep(.uni-textarea-wrapper) {
    background: transparent !important;
  }
}

.send-btn {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background-color: #d0d0d0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  &--active {
    background-color: #2979ff;
  }

  &--loading {
    background-color: #2979ff;
  }
}

.scroll-bottom-fab {
  position: fixed;
  right: 24rpx;
  bottom: calc(136rpx + env(safe-area-inset-bottom));
  z-index: 30;
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #2979ff, #5f7bff);
  box-shadow: 0 10rpx 24rpx rgba(41, 121, 255, 0.24);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: visible;

  &--stacked {
    bottom: calc(224rpx + env(safe-area-inset-bottom));
  }
}

.scroll-bottom-fab__dot {
  position: absolute;
  top: 10rpx;
  right: 8rpx;
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  background-color: #fa3534;
  border: 2rpx solid #ffffff;
  box-sizing: border-box;
}

.plan-fab {
  position: fixed;
  right: 24rpx;
  bottom: calc(136rpx + env(safe-area-inset-bottom));
  z-index: 30;
  height: 72rpx;
  padding: 0 22rpx;
  border-radius: 36rpx;
  background: linear-gradient(135deg, #5f7bff, #6b8bff);
  box-shadow: 0 10rpx 24rpx rgba(41, 121, 255, 0.28);
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.plan-fab__text {
  font-size: 24rpx;
  color: #ffffff;
  font-weight: 500;
}

.plan-drawer {
  background-color: #ffffff;
  height: min(68vh, calc(100vh - 160rpx));
  max-height: min(68vh, calc(100vh - 160rpx));
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
  padding-top: 20rpx;
}

.plan-drawer__hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 30rpx 30rpx 18rpx;
  border-bottom: 1rpx solid #f3f4f6;
  box-sizing: border-box;
  flex-shrink: 0;
}

.plan-drawer__title {
  font-size: 32rpx;
  color: #1d1d1f;
  font-weight: 600;
}

.plan-drawer__count {
  font-size: 24rpx;
  color: #86909c;
}

.plan-filters {
  display: flex;
  gap: 10rpx;
  padding: 16rpx 30rpx 14rpx;
  overflow-x: auto;
  box-sizing: border-box;
  flex-shrink: 0;
  white-space: nowrap;
  width: 100%;
}

.plan-filter {
  flex-shrink: 0;
  font-size: 22rpx;
  color: #6b7280;
  background-color: #f1f3f5;
  border-radius: 999rpx;
  padding: 10rpx 14rpx;
  line-height: 1;
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.plan-filter--active {
  color: #1e56d9;
  background-color: #e8f0ff;
}

.plan-filter__count {
  font-size: 20rpx;
  padding: 4rpx 8rpx;
  border-radius: 999rpx;
  background-color: rgba(0, 0, 0, 0.06);
}

.plan-filter--active .plan-filter__count {
  background-color: rgba(30, 86, 217, 0.18);
}

.plan-drawer__list {
  flex: 1;
  min-height: 0;
  width: 100%;
  padding: 18rpx 30rpx 0;
  box-sizing: border-box;
  overflow: hidden;
}

.plan-empty {
  padding: 24rpx 0 10rpx;
}

.plan-task {
  display: flex;
  align-items: flex-start;
  gap: 14rpx;
  padding: 20rpx 16rpx;
  background: #f7f8fa;
  border-radius: 16rpx;
  margin-bottom: 12rpx;
  width: 100%;
  box-sizing: border-box;
}

.plan-task__left {
  padding-top: 8rpx;
  flex-shrink: 0;
}

.plan-task__dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background-color: #c0c4cc;

  &--pending { background-color: #c0c4cc; }
  &--in_progress { background-color: #2979ff; }
  &--completed { background-color: #19be6b; }
  &--failed { background-color: #fa3534; }
}

.plan-task__main {
  flex: 1;
  min-width: 0;
}

.plan-task__subject {
  display: block;
  font-size: 28rpx;
  color: #1f2329;
  line-height: 1.45;
  word-break: break-word;
}

.plan-task__desc {
  display: block;
  margin-top: 8rpx;
  font-size: 23rpx;
  color: #8a919f;
  line-height: 1.4;
  word-break: break-word;
}

.plan-task__badge {
  flex-shrink: 0;
  font-size: 21rpx;
  padding: 6rpx 12rpx;
  border-radius: 999rpx;
  line-height: 1;
  margin-top: 3rpx;
  margin-left: 8rpx;
  white-space: nowrap;

  &--pending {
    color: #6b7280;
    background-color: #edf0f3;
  }
  &--in_progress {
    color: #1e56d9;
    background-color: #e8f0ff;
  }
  &--completed {
    color: #0f8a4c;
    background-color: #e8f8ef;
  }
  &--failed {
    color: #cf1322;
    background-color: #fff1f0;
  }
}

.plan-drawer__safe {
  height: calc(24rpx + env(safe-area-inset-bottom));
}

.todo-picker {
  padding: 24rpx 24rpx calc(24rpx + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.todo-picker__hd {
  display: flex;
  align-items: center;
  justify-content: center;
}

.todo-picker__title {
  font-size: 28rpx;
  font-weight: 600;
  color: #1f2329;
}

.todo-picker__empty {
  padding: 24rpx 0;
  text-align: center;
}

.todo-picker__empty-text {
  font-size: 24rpx;
  color: #a0a7b4;
}

.todo-picker__item {
  padding: 20rpx 18rpx;
  border-radius: 18rpx;
  background: #f7f9fc;
  border: 1rpx solid #ebeff5;
}

.todo-picker__text {
  font-size: 24rpx;
  line-height: 1.5;
  color: #303133;
}
</style>
