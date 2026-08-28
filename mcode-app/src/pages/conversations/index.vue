<template>
  <view class="page conversations-page" :style="[upThemeVars, upThemePageStyle]">
    <!-- 液态玻璃背景光斑 -->
    <view class="liquid-bg" aria-hidden="true">
      <view class="liquid-blob liquid-blob--one"></view>
      <view class="liquid-blob liquid-blob--two"></view>
      <view class="liquid-blob liquid-blob--three"></view>
    </view>
    <view :class="['conversations-shell', showHistoryPanel && 'conversations-shell--history']">
      <ConversationsNavbar
        :history-mode="showHistoryPanel"
        :title="historyGroupTitle"
        :can-create="canCreateInHistory"
        :show-selection-entry="showSelectionEntry"
        :selection-mode="selectionMode"
        @back="handleNavbarLeftClick"
        @create="createConversation()"
        @toggle-selection="toggleSelectionMode"
      />

      <ConversationsSearchBar
        v-model="searchKeyword"
        :hide-completed="hideCompletedConversations"
        @toggle-hide-completed="toggleHideCompletedConversations"
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
            <up-empty mode="list" :text="overviewEmptyText"></up-empty>
          </view>

          <view v-else class="group-list">
            <view
              v-for="group in filteredConnectionGroups"
              :key="group.key"
              class="group-section"
            >
              <view class="group-section__header">
                <view class="group-section__title-row">
                  <text class="group-section__title">{{ group.name }}</text>
                  <view
                    v-if="group.loadError"
                    class="group-section__error"
                    @click.stop="showGroupError(group)"
                  >
                    <up-icon name="warning-fill" size="14" color="#fa3534"></up-icon>
                  </view>
                </view>
                <view
                  v-if="!group.loadError"
                  class="group-section__add"
                  @click.stop="openAddProjectBrowser(group.key)"
                >
                  <up-icon name="plus" size="13" :color="upThemeVar('--up-primary', '#2979ff')"></up-icon>
                  <text class="group-section__add-text">项目</text>
                </view>
              </view>

              <view class="group-section__cards">
                <view
                  v-if="group.cards.length === 0 && group.projects.length === 0 && !group.loadError"
                  class="group-add-empty"
                  :style="upThemeCardStyle"
                  @click="openAddProjectBrowser(group.key)"
                >
                  <view class="group-add-empty__icon">
                    <up-icon name="folder" size="22" :color="upThemeVar('--up-primary', '#2979ff')"></up-icon>
                  </view>
                  <view class="group-add-empty__copy">
                    <text class="group-add-empty__title">添加文件夹</text>
                    <text class="group-add-empty__text">选择这台连接上的目录，作为 MCode 项目使用。</text>
                  </view>
                  <up-icon name="arrow-right" size="13" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
                </view>

                <view v-else-if="group.cards.length === 0" class="group-empty">
                  <text class="group-empty__text">
                    {{ group.loadError || groupEmptyText }}
                  </text>
                </view>

                <view
                  v-for="card in group.cards"
                  :key="`${group.key}-${card.tabId}`"
                  :class="[
                    'live-card',
                    selectionMode && isSelectableOverviewCard(card) && 'live-card--selecting',
                    isConversationSelected(card, group.key) && 'live-card--selected',
                  ]"
                  :style="upThemeCardStyle"
                  @click="handleLiveCardClick(card, group.key)"
                >
                  <view
                    v-if="selectionMode && isSelectableOverviewCard(card)"
                    :class="[
                      'bulk-select-check',
                      isConversationSelected(card, group.key) && 'bulk-select-check--active',
                    ]"
                    @click.stop="toggleConversationSelection(card, group.key)"
                  >
                    <up-icon
                      v-if="isConversationSelected(card, group.key)"
                      name="checkmark"
                      size="14"
                      color="#ffffff"
                    ></up-icon>
                  </view>
                  <view class="live-card__main">
                    <view
                      :class="[
                        'agent-logo',
                        overviewAgentLogoClass(card.agentType),
                        overviewAgentLogoPath(card.agentType) && 'agent-logo--real',
                      ]"
                    >
                      <image
                        v-if="overviewAgentLogoPath(card.agentType)"
                        class="agent-logo__img"
                        :src="overviewAgentLogoPath(card.agentType)"
                        mode="aspectFit"
                      />
                      <text v-else class="agent-logo__text">{{ overviewAgentLogoText(card.agentType) }}</text>
                    </view>

                    <view class="live-card__body">
                      <text class="live-card__project-title u-line-1">{{ card.projectName }}</text>
                      <text class="live-card__session-name u-line-1">{{ card.title || "未命名会话" }}</text>
                    </view>

                    <view class="live-card__side">
                      <view class="live-card__badges">
                        <!-- 列表已改为纯按时间排序，「PC 上开着」只能靠这枚角标表达。 -->
                        <text v-if="card.isOpenTab" class="live-card__tab-flag">标签</text>
                        <view :class="['status-chip', `status-chip--${overviewStatusClass(card.displayStatus)}` ]">
                          <text class="status-chip__text">{{ overviewStatusLabel(card.displayStatus) }}</text>
                        </view>
                      </view>
                      <text class="live-card__stamp">{{ formatTime(card.updatedAt) }}</text>
                    </view>
                  </view>

                  <view v-if="card.livePreviewText" class="live-card__preview-row">
                    <MarqueeText class="live-card__preview" :text="card.livePreviewText" />
                    <view class="live-card__dots">
                      <text class="live-card__dot"></text>
                      <text class="live-card__dot"></text>
                      <text class="live-card__dot"></text>
                    </view>
                  </view>
                </view>

                <view
                  v-if="group.projects.length > 0 || group.cards.length > 0"
                  class="live-card live-card--history"
                  :style="upThemeCardStyle"
                  @click="openHistoryPanel(group)"
                >
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
        @click="openBulkSendDialog"
      >批量发送</up-button>
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
                    overviewAgentLogoClass(agent.value),
                    overviewAgentLogoPath(agent.value) && 'agent-card__logo--real',
                  ]"
                >
                  <image
                    v-if="overviewAgentLogoPath(agent.value)"
                    class="agent-card__logo-img"
                    :src="overviewAgentLogoPath(agent.value)"
                    mode="aspectFit"
                  />
                  <text v-else class="agent-card__logo-text">{{ overviewAgentLogoText(agent.value) }}</text>
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

    <!-- 批量发送弹层 -->
    <up-popup v-model:show="showBulkSendDialog" mode="bottom" :round="28" @close="closeBulkSendDialog">
      <view class="bulk-send-sheet" :style="upThemeCardStyle">
        <view class="create-sheet__hd">
          <text class="create-sheet__title">批量发送</text>
          <view class="create-sheet__close" @click="closeBulkSendDialog">
            <up-icon name="close" size="20" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
          </view>
        </view>

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

        <up-button
          type="primary"
          :loading="bulkSending"
          :disabled="bulkSendSubmitDisabled"
          shape="circle"
          @click="confirmBulkSend"
          customStyle="margin-top:16rpx"
        >确认批量发送</up-button>

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

        <view v-if="showCreateModeOptions" class="config-section">
          <text class="config-section__title">授权类型</text>
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
          v-if="!showCreateModeOptions && createAgentConfig.configOptions.length === 0"
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

    <RemoteDirectoryBrowser
      v-model:show="showDirectoryBrowser"
      :gateway="directoryBrowserGateway"
      title="添加项目文件夹"
      @select="handleRemoteFolderSelected"
    />

  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue"
import { onHide, onPullDownRefresh, onShow, onUnload } from "@dcloudio/uni-app"
import { useAuthStore } from "@/stores/auth"
import { useConversationRuntimeStore } from "@/stores/conversationRuntime"
import { acpApi } from "@/api/acp"
import RemoteDirectoryBrowser from "@/components/remote/RemoteDirectoryBrowser.vue"
import MarqueeText from "@/components/MarqueeText.vue"
import ConversationsSearchBar from "@/pages/conversations/components/ConversationsSearchBar.vue"
import ConversationsNavbar from "@/pages/conversations/components/ConversationsNavbar.vue"
import {
  buildBulkSelectionItem,
  buildBulkSelectionKey,
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
  type OverviewCandidateCard,
} from "@/pages/conversations/conversationOverviewPresentation"
import { selectConversationLivePreviewIds } from "@/pages/conversations/conversationLivePreview"
import { getDirectToken } from "@/services/gateway/directTokenStore"
import {
  buildConnectionAuthMode,
  connectionBaseUrl,
  findConnectedConnectionByKey as lookupConnectedConnectionByKey,
} from "@/services/connection/connectionLookup"
import { toErrorMessage } from "@/services/gateway/error"
import { openRemoteFolder } from "@/services/remoteDirectoryBrowser"
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
  buildAgentConfigContextKey,
  createReadyDetailAgentConfigState,
  hasSessionModeOptions,
  persistAgentConfigCache,
  persistAgentConfigSelection,
  persistAgentListCache,
  persistSelectedAgentType,
  readFreshAgentConfigCache,
  readFreshAgentListCache,
  readPersistedAgentConfigSelection,
  readPersistedSelectedAgentType,
  type AgentListOption,
} from "@/services/conversation/composerTools"
import {
  consumeConversationListDirty,
  markConversationListDirty,
  shouldRefetchAfterBridgeRecovered,
} from "@/services/conversation/conversationListRefresh"
import {
  readConversationListLiveStreamEnabled,
} from "@/services/conversation/conversationListLiveStreamPreference"
import {
  readHideCompletedConversations,
  writeHideCompletedConversations,
} from "@/services/conversation/hideCompletedConversationsPreference"
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
import { METADATA_ONLY_CONVERSATION_TAIL_TURNS } from "@/services/conversation/conversationHistoryWindowContract"
import {
  listConversationSummaries,
  markMissingConversationSummariesDeleted,
  upsertConversationSummary,
  upsertConversationSummaries,
} from "@/services/db/repositories/conversationRepository"
import { getRegisteredRemoteInstanceDescriptor } from "@/services/realtime/remoteInstanceRegistry"
import type { CodegGateway } from "@/services/gateway"
import { normalizeAgentType } from "@/services/conversation/agentType"
import { parseConversationId } from "@/services/conversation/conversationIdentity"
import type {
  AgentOptionsSnapshot,
  AcpAgentInfo,
  ConnectionInfo,
  RealtimeBridgeHealth,
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
const showDirectoryBrowser = ref(false)
const directoryBrowserGateway = ref<CodegGateway | null>(null)
const directoryBrowserConnectionKey = ref("")
const addingProject = ref(false)
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
let overviewConnectionPreparePromise: Promise<void> | null = null
const connectionFolderSnapshotMap = new Map<string, Project[]>()
const connectionTabSnapshotMap = new Map<string, OpenedTabItem[]>()
const instanceConnectionKeyMap = new Map<string, string>()
const connectionInstanceKeyMap = new Map<string, string>()
const loadingCreateAgents = ref(false)
const createAgentListError = ref("")
let createAgentProbeToken = 0
let createAgentListToken = 0
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
let activeCreateRequestId = ""
let activeCreateRequestFingerprint = ""
let activeCreateConversationId = 0
let activeCreatePromptAttempted = false
let createProgressTimer: ReturnType<typeof setInterval> | null = null
const livePreviewEnabled = ref(false)
// 「隐藏已完成会话」开关（默认开，见 hideCompletedConversationsPreference）。
// 在 onShow 里从存储读取，与 livePreviewEnabled 同一套路。
const hideCompletedConversations = ref(true)
const livePreviewPageVisible = ref(false)
const livePreviewOwnedConversationIds = new Set<number>()
const livePreviewTransferredConversationIds = new Set<number>()
const livePreviewConnectPromiseMap = new Map<number, Promise<void>>()
let livePreviewReconcileTimer: ReturnType<typeof setTimeout> | null = null

interface CreateAgentConfigState {
  status: "idle" | "loading" | "ready" | "failed"
  modes: SessionModeStateInfo | null
  configOptions: SessionConfigOptionInfo[]
  selectedModeId: string | null
  selectedValues: Record<string, string>
  message: string
}

const createAgentOptions = ref<AgentListOption[]>([])
const createAgentConfig = ref<CreateAgentConfigState>({
  status: "idle",
  modes: null,
  configOptions: [],
  selectedModeId: null,
  selectedValues: {},
  message: "",
})
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
  activityAt: number
  status: string
  isActive: boolean
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

const projects = ref<Project[]>([])
const connectionGroups = ref<ConnectionGroup[]>([])
const selectionMode = ref(false)
const selectedConversationMap = ref<Record<string, BulkSelectionItem>>({})
const showBulkSendDialog = ref(false)
const bulkSendText = ref("")
const bulkSending = ref(false)
const BULK_SEND_QUICK_TEXT = "继续"


/**
 * 会话列表的**唯一**可见派生。
 *
 * 渲染结构与订阅/选择集从**同一次计算**里出来（`buildOverviewDisplayModel` 的两个字段），
 * 所以结构上不可能像收口前那样分叉 —— 那时它们是两条独立派生，任何判据改动都必须同时改
 * 两处，漏改候选那条会让看不见的卡仍被订阅、仍能被「全选」勾中。
 */
const overviewDisplayModel = computed(() =>
  buildOverviewDisplayModel({
    groups: connectionGroups.value,
    // 回调而不是直接传 Map：让纯模块与 Vue 响应式解耦（模块因此能在 jest 里裸测）。
    resolveRuntimeSession: (conversationId) => runtime.sessions.get(conversationId),
    instanceKeyByGroupKey: Object.fromEntries(connectionInstanceKeyMap),
    keyword: searchKeyword.value,
    hideCompleted: hideCompletedConversations.value,
    livePreviewEnabled: livePreviewEnabled.value,
  })
)

const filteredConnectionGroups = computed(() => overviewDisplayModel.value.groups)

const groupEmptyText = computed(() => resolveGroupEmptyText(hideCompletedConversations.value))
const overviewEmptyText = computed(() =>
  resolveOverviewEmptyText(searchKeyword.value, hideCompletedConversations.value)
)

const showSelectionEntry = computed(() => {
  if (showHistoryPanel.value) return false
  return filteredConnectionGroups.value.some((group) =>
    group.cards.some((card) => isSelectableOverviewCard(card))
  )
})

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

const showCreateModeOptions = computed(() => hasSessionModeOptions(createAgentConfig.value.modes))

const createConfigSummary = computed(() => {
  if (createAgentConfig.value.status === "loading") return "正在读取可用配置..."
  const parts: string[] = []

  if (showCreateModeOptions.value && createAgentConfig.value.modes) {
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

function currentCreateAgentConfigContextKey(): string {
  if (!selectedConnectionKey.value || !selectedAgentType.value) return ""
  return buildAgentConfigContextKey(
    selectedConnectionKey.value,
    selectedAgentType.value,
    selectedProjectPath.value
  )
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

function normalizeCreateAgentOptions(raw: unknown): AgentListOption[] {
  const list = normalizeList(raw) as AcpAgentInfo[]
  return list
    .filter((item) => item && item.enabled !== false && item.available !== false)
    .map((item) => {
      const value = normalizeAgentType(item.agent_type)
      return {
        value,
        // 标签取站内唯一那份映射（`remoteSettings.AGENT_LABELS`，经
        // `formatOverviewAgentLabel` 暴露）。页面此前有本地副本，把 codex 写成
        // 「Codex CLI」而全局那份是「Codex」—— 同一个 agent 在新建弹层和别处显示成
        // 两个名字。远端给了 `name` 时仍优先用它。
        label: String(item.name || formatOverviewAgentLabel(value)),
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
    const cachedOptions = readFreshAgentListCache(selectedConnectionKey.value)
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
    persistAgentListCache(selectedConnectionKey.value, nextOptions)
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
  loadConversationLivePreviewPreference()
  loadHideCompletedPreference()
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
  stopCreateProgressTimer()
})

onHide(() => {
  livePreviewPageVisible.value = false
  activeSessionsRefreshTimerMap.forEach((timer) => clearTimeout(timer))
  activeSessionsRefreshTimerMap.clear()
  releaseAllLivePreviewOwnedSessions()
})

onPullDownRefresh(() => {
  if (showHistoryPanel.value) {
    uni.stopPullDownRefresh()
    return
  }

  loadOverviewDataAfterConnectionPrepare({ force: true }).finally(() => {
    void refreshConversationTabBadge()
    uni.stopPullDownRefresh()
  })
})

onShow(() => {
  livePreviewPageVisible.value = true
  livePreviewTransferredConversationIds.clear()
  loadConversationLivePreviewPreference()
  loadHideCompletedPreference()
  const shouldForceRefresh = consumeConversationListDirty()
  void loadOverviewDataAfterConnectionPrepare(
    shouldForceRefresh ? { force: true } : undefined
  ).finally(() => {
    scheduleLivePreviewReconcile()
  })
  void refreshConversationTabBadge()
})

function loadConversationLivePreviewPreference() {
  livePreviewEnabled.value = readConversationListLiveStreamEnabled()
}

function loadHideCompletedPreference() {
  hideCompletedConversations.value = readHideCompletedConversations()
}

function toggleHideCompletedConversations() {
  hideCompletedConversations.value = writeHideCompletedConversations(
    !hideCompletedConversations.value
  )
  // 隐藏状态变了 → 可见卡集合变了 → 实时预览订阅要按新集合重新对账。不调这一步，
  // 刚被取消隐藏的会话不会自动开始订阅实时流（它的预览文案会一直空着）。
  scheduleLivePreviewReconcile()
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
      showHistoryPanel.value = false
      projects.value = []
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
  return filterConnectedConnections(savedConnections)
}

async function loadConnectionGroup(conn: ConnectionItem): Promise<ConnectionGroup> {
  const gateway = await createConnectionGateway(conn)
  const descriptor = gateway.getRemoteInstanceDescriptor()
  void ensureGlobalConversationSync(descriptor.instanceKey).catch((error) => {
    console.warn("ensure global conversation sync skipped:", error)
  })
  ensureOpenedTabsSubscription(descriptor.instanceKey)
  ensureActiveSessionsSubscription(descriptor.instanceKey)
  ensureBridgeRecoverySubscription(descriptor.instanceKey)
  ensureBulkChangedSubscription(descriptor.instanceKey)
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
  tabs: OpenedTabItem[],
  options?: { reconcile?: boolean }
): Promise<ConnectionGroup> {
  const gateway = await createConnectionGateway(conn)
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
  const gateway = await createConnectionGateway(conn)
  const descriptor = gateway.getRemoteInstanceDescriptor()
  void ensureGlobalConversationSync(descriptor.instanceKey).catch((error) => {
    console.warn("ensure global conversation sync skipped:", error)
  })
  ensureOpenedTabsSubscription(descriptor.instanceKey)
  ensureActiveSessionsSubscription(descriptor.instanceKey)
  ensureBridgeRecoverySubscription(descriptor.instanceKey)
  ensureBulkChangedSubscription(descriptor.instanceKey)
  const foldersRaw = await gateway.call<unknown>("list_open_folder_details")
  const folders = normalizeList(foldersRaw) as Project[]
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
  const conn = findConnectedConnectionByKey(mappedConnKey)
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
  const conn = findConnectedConnectionByKey(mappedConnKey)
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
  const conn = findConnectedConnectionByKey(mappedConnKey)
  if (!conn) return

  const connKey = connectionKey(conn)
  const folders = connectionFolderSnapshotMap.get(connKey)
  const tabs = connectionTabSnapshotMap.get(connKey)
  if (!folders || !tabs) return

  try {
    const gateway = await createConnectionGateway(conn)
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
  const unsubscribe = acpApi.subscribeGlobalEvent("pet://sessions", () => {
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
    // 只读 summary / title / folderId / agentType / status，完全不看轮次内容
    // （lastTurnId 在新建会话时硬编码为 null），所以取最小窗口。
    const detail = await input.gateway.call<any>("get_folder_conversation", {
      conversationId: input.conversationId,
      tailTurns: METADATA_ONLY_CONVERSATION_TAIL_TURNS,
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

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  }
  return ""
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
  return lookupConnectedConnectionByKey(key, getConnectedConnections, connectionKey)
}

function normalizeConversationStatus(value?: string): string {
  return normalizeConversationSummaryStatus(value)
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
  const cachedOptions = readFreshAgentListCache(group.key)
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

/**
 * 把全局 auth 切到这条连接上。
 *
 * 「切到哪个模式」的判断在 `services/connection/connectionLookup` 里（可裸测）；这里只负责
 * 写 store。返回 null 时**什么都不做** —— 缺凭据却切了 baseUrl，会让后续请求全部 401，
 * 而原来那套可用凭据已经被覆盖。
 */
function syncAuthToConnection(conn: ConnectionItem) {
  const authMode = buildConnectionAuthMode(conn, getDirectToken)
  if (!authMode) return
  if (authMode.mode === "direct") {
    auth.setDirectMode(authMode.baseUrl, authMode.token)
    return
  }
  auth.setRelayMode(authMode.baseUrl, authMode.session)
}

function loadData() {
  return loadOverviewDataAfterConnectionPrepare({ force: true })
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
  return formatHistoryConversationMeta(conversation, formatOverviewAgentLabel, formatTime)
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

function openHistoryPanel(group: ConnectionGroup) {
  exitSelectionMode()
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

/**
 * `up-navbar` 的 `.u-navbar__content__left` 是个固定尺寸的点击区，`leftIcon` 为空时它依然
 * 存在且可点（见 uview-plus `u-navbar.vue` 模板）。概览模式下没有返回目标，少了这道守卫，
 * 点左上角空白会静默清掉一遍历史状态。
 */
function handleNavbarLeftClick() {
  if (!showHistoryPanel.value) return
  closeHistoryPanel()
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
  const conn = connKey ? findConnectedConnectionByKey(connKey) : undefined
  if (conn) {
    syncAuthToConnection(conn)
  }
  const targetFolderId = Number(conv.folder_id || 0)
  if (conn && targetFolderId > 0 && Number(conv.id || 0) > 0) {
    try {
      const gateway = await createConnectionGateway(conn)
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
  const cachedOptions = readFreshAgentListCache(selectedConnectionKey.value)
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

async function openAddProjectBrowser(groupKey: string) {
  if (addingProject.value) return
  const conn = findConnectedConnectionByKey(groupKey)
  if (!conn) {
    uni.showToast({ title: "连接不存在或已断开", icon: "none" })
    return
  }
  try {
    const gateway = await createConnectionGateway(conn)
    directoryBrowserGateway.value = gateway
    directoryBrowserConnectionKey.value = groupKey
    showDirectoryBrowser.value = true
  } catch (error) {
    uni.showToast({ title: toErrorMessage(error), icon: "none", duration: 3000 })
  }
}

async function handleRemoteFolderSelected(path: string) {
  const gateway = directoryBrowserGateway.value
  const groupKey = directoryBrowserConnectionKey.value
  if (!gateway || !groupKey || addingProject.value) {
    return
  }
  addingProject.value = true
  try {
    await openRemoteFolder(gateway, path)
    showDirectoryBrowser.value = false
    const conn = findConnectedConnectionByKey(groupKey)
    const current = connectionGroups.value.find(
      (group) => group.key === groupKey
    )
    if (conn && current) {
      await refreshConnectionGroupFromRemote(conn, current)
    } else {
      await loadOverviewData({ force: true })
    }
    uni.showToast({ title: "已添加项目", icon: "success" })
  } catch (error) {
    uni.showToast({ title: toErrorMessage(error), icon: "none", duration: 3000 })
  } finally {
    addingProject.value = false
    if (!showDirectoryBrowser.value) {
      directoryBrowserConnectionKey.value = ""
      directoryBrowserGateway.value = null
    }
  }
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
  conversationId: number,
  agentType: string
) {
  if (!activeCreateRequestId) return false
  if (activeCreateConversationId !== conversationId) return false
  if (!activeCreatePromptAttempted) return false

  try {
    // 只判「有没有轮次」，1 条窗口下 `length > 0` 语义完全不变。
    const detail = await gateway.call<any>("get_folder_conversation", {
      conversationId,
      tailTurns: METADATA_ONLY_CONVERSATION_TAIL_TURNS,
    })
    if (Array.isArray(detail?.turns) && detail.turns.length > 0) {
      return true
    }
  } catch (error) {
    console.warn("create prompt replay detail probe skipped:", error)
  }

  try {
    const instanceKey = gateway.getRemoteInstanceDescriptor().instanceKey
    const existingConnection = await acpApi.acpFindConnectionForConversation(
      conversationId,
      agentType,
      undefined,
      instanceKey ? { instanceKey } : undefined
    )
    if (existingConnection?.connection_id) {
      return true
    }
  } catch (error) {
    console.warn("create prompt replay connection probe skipped:", error)
  }

  return false
}

/**
 * 重置新建弹层自己的状态。**归弹层所有** —— 抽成子组件后这段跟着走。
 */
function resetCreateSheetState() {
  clearPendingCreateRequest()
  newConversationTitle.value = ""
  newTaskContent.value = ""
  resetCreateAgentConfig("")
  selectedAgentType.value = "claude_code"
  createAgentOptions.value = []
  createAgentListError.value = ""
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
        newConversationId,
        agentType
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
    // 收尾分两段，这是抽 CreateConversationSheet 子组件的接缝：
    //   ① 弹层自己的状态重置 —— 搬进子组件后归它所有；
    //   ② 页面级的刷新与导航 —— 永远归页面（它持有列表数据源与路由）。
    // 不分开的话，子组件用 v-if 控制显示时这段会跑在**已卸载**的组件上：弹层在上面
    // 第 42 行就关了，这里还在写它的 ref。
    resetCreateSheetState()
    await handleConversationCreated({
      conversationId: newConversationId,
      folderId: selectedProjectId.value,
      connectionKey: selectedConnectionKey.value,
    })
  } catch (error) {
    const msg = toErrorMessage(error)
    uni.showToast({ title: `创建失败: ${msg}`, icon: "none", duration: 3000 })
  } finally {
    creating.value = false
  }
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
  const conn = findConnectedConnectionByKey(item.connectionKey)
  if (!conn) {
    throw new Error("连接不存在或已断开")
  }

  const gateway = await createConnectionGateway(conn)
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
  return formatOverviewRelativeTime(time)
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

.main-wrap {
  width: 100%;
  flex: 1;
  min-height: 0;
}

.main-wrap--overview {
  display: block;
}

/* 历史模式下必须给 shell 一个**确定高度**（而不仅是 min-height 这个下界），
   否则内部 `flex: 1` 无从解析，会一路退化成内容高度 —— scroll-view 长到几千 px、
   自身滚动失效、列表钻到 tabbar 底下。

   用 `position: fixed` + 四边定位表达「从 navbar 底下铺到可视区底部」，而不是 `100vh`
   减一串数字：顶部层数将来再变也不会失准 —— 写死的 390rpx 当初就是这么估错的。

   bottom 取 0 而不是 --window-bottom：H5 下 fixed 的包含块本就是**已扣掉 tabbar 的**
   可视区，再减一次会在列表和 tabbar 之间留出一条 50px 空带（并把总高顶到 894 > 844
   导致整页多滚 50px）。 */
.conversations-shell--history {
  position: fixed;
  top: calc(var(--window-top, 0px) + 44px);
  bottom: 0;
  left: 0;
  right: 0;
  min-height: 0;
  /* fixed 脱离了原来的文档流，shell 的 padding-bottom 不再有意义；
     左右内边距要保留，否则卡片贴到屏幕边缘。 */
  padding: 0 32rpx;
  overflow: hidden;
}

/* 历史模式要让内层 scroll-view 自己滚，就必须有一个**确定高度**的祖先。
   这里只做 flex 收缩，真正的高度上界由 .conversations-shell--history 给。
   不用写死的 390rpx —— 那个数会随顶部层数变化而失准，这也正是它当初估错的原因。 */
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
  justify-content: space-between;
  gap: 12rpx;
  margin-bottom: 12rpx;
  padding: 0 8rpx;
}

.group-section__title-row {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8rpx;
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

.group-section__add {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6rpx;
  padding: 8rpx 12rpx;
  border-radius: 999rpx;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 9%, var(--up-card-bg-color, #ffffff) 91%);
}

.group-section__add-text {
  font-size: 22rpx;
  font-weight: 700;
  color: var(--up-primary, #2979ff);
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

.group-add-empty {
  display: flex;
  align-items: center;
  gap: 18rpx;
  padding: 24rpx 22rpx;
  border-radius: 32rpx;
  background: color-mix(in srgb, var(--up-card-bg-color, #ffffff) 45%, transparent) !important;
  border: 1rpx solid rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(30rpx);
  -webkit-backdrop-filter: blur(30rpx);
}

.group-add-empty__icon {
  width: 62rpx;
  height: 62rpx;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 10%, var(--up-card-bg-color, #ffffff) 90%);
}

.group-add-empty__copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.group-add-empty__title {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.group-add-empty__text {
  font-size: 23rpx;
  line-height: 1.4;
  color: var(--up-content-color, #606266);
}

.live-card {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
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

.live-card__main {
  display: flex;
  align-items: flex-start;
  gap: 18rpx;
  width: 100%;
}

.live-card--history {
  flex-direction: row;
  align-items: flex-start;
  gap: 18rpx;
}

.live-card:active {
  transform: scale(0.98);
}

.live-card--selecting {
  padding-left: 86rpx;
}

.live-card--selected {
  border-color: color-mix(in srgb, var(--up-primary, #2979ff) 58%, var(--up-border-color, #dadbde) 42%);
  box-shadow: 0 10rpx 36rpx color-mix(in srgb, var(--up-primary, #2979ff) 16%, transparent) !important;
}

.bulk-select-check {
  position: absolute;
  left: 24rpx;
  top: 50%;
  width: 42rpx;
  height: 42rpx;
  border-radius: 999rpx;
  transform: translateY(-50%);
  border: 2rpx solid var(--up-border-color, #dadbde);
  background: var(--up-card-bg-color, #ffffff);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
}

.bulk-select-check--active {
  border-color: var(--up-primary, #2979ff);
  background: var(--up-primary, #2979ff);
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
  font-size: 30rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
  line-height: 1.25;
}

.live-card__session-name {
  display: block;
  margin-top: 8rpx;
  font-size: 25rpx;
  color: color-mix(in srgb, var(--up-content-color, #606266) 80%, transparent);
  line-height: 1.3;
}

.live-card__preview-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
  width: 100%;
  box-sizing: border-box;
  padding: 10rpx 16rpx;
  border-radius: 16rpx;
  background: color-mix(in srgb, var(--up-primary, #2f7cf6) 8%, transparent);
}

.live-card__preview {
  flex: 1;
  min-width: 0;
  font-size: 20rpx;
  font-weight: 600;
  line-height: 1.35;
  color: var(--up-primary, #2f7cf6);
}

.live-card__dots {
  display: flex;
  align-items: center;
  gap: 6rpx;
  flex-shrink: 0;
}

.live-card__dot {
  width: 8rpx;
  height: 8rpx;
  border-radius: 999rpx;
  background: var(--up-primary, #2f7cf6);
  opacity: 0.35;
  animation: livePreviewDot 1.2s ease-in-out infinite;
}

.live-card__dot:nth-child(2) {
  animation-delay: 0.2s;
}

.live-card__dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes livePreviewDot {
  0%,
  60%,
  100% {
    opacity: 0.35;
    transform: scale(1);
  }
  30% {
    opacity: 1;
    transform: scale(1.35);
  }
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

.live-card__badges {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8rpx;
}

.live-card__tab-flag {
  flex-shrink: 0;
  padding: 4rpx 10rpx;
  border-radius: 999rpx;
  font-size: 18rpx;
  line-height: 1.2;
  color: var(--up-primary, #2979ff);
  background-color: color-mix(in srgb, var(--up-primary, #2979ff) 12%, transparent);
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

/* 高度交给 flex 链算（.conversations-shell → .main-wrap--history → .history-list）。
   这里曾写死 calc(100vh - 390rpx)，那是按「大标题 + 搜索框 + 模式栏」三层顶部估的预算；
   navbar 改造删掉了其中两层，继续写死会让列表底部空出约 190rpx。 */
.history-scroll {
  flex: 1;
  min-height: 0;
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
.bulk-action-bar {
  position: fixed;
  left: 24rpx;
  right: 24rpx;
  bottom: calc(24rpx + env(safe-area-inset-bottom));
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
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.bulk-action-bar__title {
  font-size: 26rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.bulk-action-bar__hint {
  font-size: 22rpx;
  color: var(--up-tips-color, #909193);
}

.bulk-send-sheet {
  padding: 36rpx 20rpx 0;
  background-color: var(--up-card-bg-color, #ffffff);
  border-radius: 28rpx 28rpx 0 0;
}

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
