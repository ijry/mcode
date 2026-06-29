<template>
  <view class="page" :style="[upThemeVars, upThemePageStyle]">
    <view v-if="!conversationId" class="empty-container">
      <up-empty mode="data" text="会话不存在"></up-empty>
    </view>

    <view v-else class="detail-container">
      <up-navbar
        :autoBack="false"
        :fixed="true"
        :placeholder="true"
        :border="true"
        left-icon="arrow-left"
        height="45px"
        :bgColor="upThemeVar('--up-card-bg-color', '#ffffff')"
        :leftIconColor="upThemeVar('--up-content-color', '#303133')"
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
              <text class="detail-navbar__title u-line-1">{{ conversationTitle }}</text>
            </view>
          </view>
        </template>
      </up-navbar>

      <view class="detail-toolbar" :style="[upThemeCardStyle, detailToolbarStyle]">
        <view class="detail-toolbar__status">
          <view class="runtime-dot" :class="`runtime-dot--${runtimeStatusClass}`"></view>
          <view class="detail-toolbar__status-copy">
            <swiper
              class="detail-toolbar__status-swiper"
              vertical
              circular
              autoplay
              :interval="2800"
              :duration="280"
              :disable-touch="toolbarNoticeItems.length <= 1"
            >
              <swiper-item
                v-for="item in toolbarNoticeItems"
                :key="item.key"
                class="detail-toolbar__status-swiper-item"
              >
                <text class="detail-toolbar__status-text">{{ item.text }}</text>
              </swiper-item>
            </swiper>
          </view>
        </view>
        <view class="detail-toolbar__actions">
          <view
            v-if="planTasks.length > 0"
            class="detail-toolbar__action detail-toolbar__action--plan"
            @click.stop="showPlanDrawer = true"
          >
            <up-icon name="list" size="16" :color="upThemeVar('--up-primary', '#2979ff')"></up-icon>
            <text class="detail-toolbar__action-text detail-toolbar__action-text--plan">
              计划 {{ completedTaskCount }}/{{ planTasks.length }}
            </text>
          </view>
          <view
            class="detail-toolbar__icon-action"
            :class="{ 'detail-toolbar__icon-action--disabled': loading }"
            @click.stop="refreshConversation"
          >
            <up-loading-icon
              v-if="loading"
              mode="circle"
              size="16"
              :color="upThemeVar('--up-content-color', '#606266')"
            ></up-loading-icon>
            <up-icon
              v-else
              name="reload"
              size="18"
              :color="upThemeVar('--up-content-color', '#606266')"
            ></up-icon>
          </view>
          <view
            class="detail-toolbar__icon-action detail-toolbar__icon-action--danger"
            :class="{ 'detail-toolbar__icon-action--disabled': !canStopSession || stoppingSession }"
            @click.stop="confirmStopSession()"
          >
            <up-loading-icon
              v-if="stoppingSession"
              mode="circle"
              size="16"
              color="#f56c6c"
            ></up-loading-icon>
            <view v-else class="detail-toolbar__stop-mark"></view>
          </view>
        </view>
      </view>

      <view
        v-if="historyStatusText"
        :style="historyStatusStyle"
        :class="['history-status', planTasks.length > 0 && 'history-status--with-plan']"
      >
        <up-loading-icon v-if="loadingOlder" mode="circle" size="16" :color="upThemeVar('--up-tips-color', '#909193')"></up-loading-icon>
        <text class="history-status__text">{{ historyStatusText }}</text>
      </view>

      <view
        class="message-list"
        :style="messageListPageStyle"
      >
        <view class="message-list__content">
          <view v-if="showInitialConversationLoading" class="empty-messages empty-messages--loading">
            <up-loading-icon
              mode="circle"
              size="24"
              :color="upThemeVar('--up-primary', '#2979ff')"
            ></up-loading-icon>
            <text class="empty-messages__loading-text">加载会话中...</text>
          </view>

          <view v-else-if="showWaitingResponseState" class="empty-messages empty-messages--pending">
            <view class="pending-response-card">
              <view class="pending-response-card__pulse"></view>
              <view class="pending-response-card__badge">
                <view class="pending-response-card__badge-dot"></view>
                <text class="pending-response-card__badge-text">{{ waitingStateBadgeText }}</text>
              </view>
              <text class="pending-response-card__title">{{ waitingStateTitle }}</text>
              <text class="pending-response-card__desc">{{ waitingStateDescription }}</text>
              <view class="pending-response-card__bubble">
                <view class="pending-response-card__bubble-line pending-response-card__bubble-line--strong"></view>
                <view class="pending-response-card__bubble-line"></view>
                <view class="pending-response-card__bubble-line pending-response-card__bubble-line--short"></view>
                <view class="pending-response-card__typing">
                  <view class="pending-response-card__typing-dot"></view>
                  <view class="pending-response-card__typing-dot"></view>
                  <view class="pending-response-card__typing-dot"></view>
                </view>
              </view>
              <text v-if="waitingStateFootnote" class="pending-response-card__footnote">
                {{ waitingStateFootnote }}
              </text>
            </view>
          </view>

          <view v-else-if="renderMessageItems.length === 0" class="empty-messages">
            <up-empty mode="message" text="开始新的对话吧"></up-empty>
          </view>

          <view
            v-for="(item, index) in renderMessageItems"
            :key="item.key"
            :id="messageAnchorId(item.anchorId)"
            class="message-item"
          >
            <MessageBubble
              :message="item.message"
              :agent-type="currentAgentType"
              :showRegenerate="index === renderMessageItems.length - 1 && item.message.role === 'assistant'"
              @regenerate="regenerateLastMessage"
            />
          </view>

          <view v-if="stats.totalTokens > 0" class="stats-bar">
            <up-icon name="file-text" size="14" :color="upThemeVar('--up-light-color', '#c0c4cc')"></up-icon>
            <text class="stats-text">
              输入 {{ formatTokenCountK(stats.inputTokens) }} / 输出 {{ formatTokenCountK(stats.outputTokens) }} / 总计 {{ formatTokenCountK(stats.totalTokens) }}
            </text>
          </view>

          <view v-if="showBottomGeneratingIndicator" class="bottom-generating">
            <view class="bottom-generating__orb">
              <view class="bottom-generating__ring"></view>
              <view class="bottom-generating__dot"></view>
            </view>
            <view class="bottom-generating__copy">
              <text class="bottom-generating__title">生成中</text>
              <text class="bottom-generating__subtitle">{{ bottomGeneratingText }}</text>
            </view>
            <view class="bottom-generating__typing" aria-hidden="true">
              <view class="bottom-generating__typing-dot"></view>
              <view class="bottom-generating__typing-dot"></view>
              <view class="bottom-generating__typing-dot"></view>
            </view>
          </view>

          <view id="message-list-bottom" class="list-bottom"></view>
        </view>
      </view>

    <view class="input-wrap" :style="upThemeCardStyle">
        <view v-if="pendingPermissionCard" class="permission-card">
          <view class="permission-card__header">
            <view class="permission-card__badge"></view>
            <text class="permission-card__title">需要授权</text>
          </view>
          <view v-if="pendingPermissionTextParts.length > 0" class="permission-card__desc">
            <text
              v-for="(part, index) in pendingPermissionTextParts"
              :key="`permission-text-${index}`"
              class="permission-card__desc-line"
            >
              {{ part }}
            </text>
          </view>
          <scroll-view
            v-if="pendingPermissionCommandBlock"
            scroll-x
            class="permission-card__command-scroll"
          >
            <view class="permission-card__command">
              <text class="permission-card__command-text">{{ pendingPermissionCommandBlock }}</text>
            </view>
          </scroll-view>
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

        <view v-if="pendingQuestionCard" class="ask-question-card">
          <view class="ask-question-card__header">
            <view class="ask-question-card__badge">?</view>
            <view class="ask-question-card__heading">
              <text class="ask-question-card__title">智能体需要你的选择</text>
              <text class="ask-question-card__subtitle">选择后点击提交，也可以跳过让智能体自行判断</text>
            </view>
            <text
              v-if="pendingQuestionCard.questions.length > 1"
              class="ask-question-card__counter"
            >
              {{ questionAnsweredCount }}/{{ pendingQuestionCard.questions.length }}
            </text>
          </view>

          <view
            v-for="question in pendingQuestionCard.questions"
            :key="question.id"
            class="ask-question-card__question"
          >
            <view class="ask-question-card__question-head">
              <text class="ask-question-card__chip">{{ question.multi_select ? "多选" : "单选" }}</text>
              <text class="ask-question-card__header-text">{{ question.header }}</text>
            </view>
            <text class="ask-question-card__prompt">{{ question.question }}</text>

            <view class="ask-question-card__options">
              <view
                v-for="option in question.options"
                :key="option.label"
                :class="[
                  'ask-question-option',
                  isQuestionOptionSelected(question.id, option.label) && 'ask-question-option--active',
                  questionSubmitting && 'ask-question-option--disabled',
                ]"
                @click="!questionSubmitting && toggleQuestionOption(question, option.label)"
              >
                <view class="ask-question-option__control">
                  <view
                    :class="[
                      question.multi_select ? 'ask-question-option__checkbox' : 'ask-question-option__radio',
                      isQuestionOptionSelected(question.id, option.label) && 'ask-question-option__control--active',
                    ]"
                  >
                    <text v-if="isQuestionOptionSelected(question.id, option.label)" class="ask-question-option__mark">✓</text>
                  </view>
                </view>
                <view class="ask-question-option__body">
                  <view class="ask-question-option__title-row">
                    <text class="ask-question-option__title">{{ questionLabelText(option.label) }}</text>
                    <text v-if="isQuestionRecommended(option.label)" class="ask-question-option__recommended">推荐</text>
                  </view>
                  <text v-if="option.description" class="ask-question-option__desc">{{ option.description }}</text>
                </view>
              </view>

              <view
                :class="[
                  'ask-question-option',
                  isQuestionOtherActive(question.id) && 'ask-question-option--active',
                  questionSubmitting && 'ask-question-option--disabled',
                ]"
                @click="!questionSubmitting && toggleQuestionOther(question)"
              >
                <view class="ask-question-option__control">
                  <view
                    :class="[
                      question.multi_select ? 'ask-question-option__checkbox' : 'ask-question-option__radio',
                      isQuestionOtherActive(question.id) && 'ask-question-option__control--active',
                    ]"
                  >
                    <text v-if="isQuestionOtherActive(question.id)" class="ask-question-option__mark">✓</text>
                  </view>
                </view>
                <view class="ask-question-option__body">
                  <text class="ask-question-option__title">其他</text>
                </view>
              </view>

              <input
                v-if="isQuestionOtherActive(question.id)"
                class="ask-question-card__other-input"
                :value="questionSelection(question.id).otherText"
                :disabled="questionSubmitting"
                placeholder="输入其他答案"
                @input="setQuestionOtherText(question.id, $event)"
              />
            </view>
          </view>

          <view class="ask-question-card__footer">
            <button
              class="ask-question-card__skip"
              :disabled="questionSubmitting"
              @click="answerAskQuestion(true)"
            >
              跳过
            </button>
            <button
              class="ask-question-card__submit"
              :class="{ 'ask-question-card__submit--disabled': !questionSubmitReady || questionSubmitting }"
              :disabled="!questionSubmitReady || questionSubmitting"
              @click="answerAskQuestion(false)"
            >
              {{ questionSubmitting ? "提交中..." : "提交" }}
            </button>
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
                :color="upThemeVar('--up-tips-color', '#909193')"
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
              <up-icon name="file-text" size="16" :color="upThemeVar('--up-content-color', '#606266')"></up-icon>
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
            :color="upThemeVar('--up-light-color', '#c0c4cc')"
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

        <view
          v-if="showSharedPromptQueue"
          class="shared-queue-bar"
          @click="sharedPromptQueueExpanded = !sharedPromptQueueExpanded"
        >
          <view class="shared-queue-bar__left">
            <up-icon name="order" size="14" :color="upThemeVar('--up-primary', '#2979ff')"></up-icon>
            <view class="shared-queue-bar__copy">
              <text class="shared-queue-bar__title">{{ sharedPromptQueueHeaderText }}</text>
              <text class="shared-queue-bar__summary u-line-1">{{ sharedPromptQueueSummaryText }}</text>
            </view>
          </view>
          <up-icon
            :name="sharedPromptQueueExpanded ? 'arrow-up' : 'arrow-down'"
            size="12"
            :color="upThemeVar('--up-light-color', '#c0c4cc')"
          ></up-icon>
        </view>

        <view v-if="sharedPromptQueueExpanded && showSharedPromptQueue" class="shared-queue-panel">
          <view class="shared-queue-panel__header">
            <text class="shared-queue-panel__hint">等待 Desktop 当前任务完成后执行</text>
            <view
              class="shared-queue-clear"
              :class="{ 'shared-queue-clear--disabled': sharedPromptQueueClearDisabled }"
              @click.stop="clearSharedPromptQueue"
            >
              {{ clearingSharedPromptQueue ? "清空中" : "清空" }}
            </view>
          </view>
          <view
            v-for="(item, index) in sharedPromptQueueItems"
            :key="item.queueItemId || index"
            class="shared-queue-item"
          >
            <view class="shared-queue-item__position">
              {{ sharedPromptQueuePositionLabel(item, index) }}
            </view>
            <view class="shared-queue-item__body">
              <text class="shared-queue-item__text u-line-2">
                {{ sharedPromptQueueItemPreview(item) }}
              </text>
              <view class="shared-queue-item__meta">
                <text>{{ sharedPromptQueueItemSource(item, localRelayClientId) }}</text>
                <text v-if="item.createdAtMs">{{ formatQueueTime(item.createdAtMs) }}</text>
                <text class="shared-queue-item__priority">{{ sharedPromptQueuePriorityLabel(item) }}</text>
              </view>
            </view>
            <view v-if="session?.connectionId && item.queueItemId && sharedPromptQueueControlsEnabled" class="shared-queue-item__controls">
              <view
                class="shared-queue-op shared-queue-op--compact"
                :class="{ 'shared-queue-op--disabled': (item.queuePosition ?? 1) <= 1 || reorderingSharedQueueItemIds.has(item.queueItemId) }"
                @click.stop="reorderSharedPromptQueueItem(item.queueItemId, item.sessionId, 'move_up')"
              >
                上移
              </view>
              <view
                class="shared-queue-op shared-queue-op--compact"
                :class="{ 'shared-queue-op--disabled': (item.queuePosition ?? 1) >= sharedPromptQueueItems.length || reorderingSharedQueueItemIds.has(item.queueItemId) }"
                @click.stop="reorderSharedPromptQueueItem(item.queueItemId, item.sessionId, 'move_down')"
              >
                下移
              </view>
              <view
                class="shared-queue-op shared-queue-op--compact"
                :class="{ 'shared-queue-op--disabled': updatingSharedQueuePriorityItemIds.has(item.queueItemId) || item.priorityTier === 'high' }"
                @click.stop="updateSharedPromptQueuePriority(item.queueItemId, item.sessionId, 'high')"
              >
                高
              </view>
              <view
                class="shared-queue-op shared-queue-op--compact"
                :class="{ 'shared-queue-op--disabled': updatingSharedQueuePriorityItemIds.has(item.queueItemId) || item.priorityTier === 'normal' }"
                @click.stop="updateSharedPromptQueuePriority(item.queueItemId, item.sessionId, 'normal')"
              >
                中
              </view>
              <view
                class="shared-queue-op shared-queue-op--compact"
                :class="{ 'shared-queue-op--disabled': updatingSharedQueuePriorityItemIds.has(item.queueItemId) || item.priorityTier === 'low' }"
                @click.stop="updateSharedPromptQueuePriority(item.queueItemId, item.sessionId, 'low')"
              >
                低
              </view>
            </view>
            <view
              v-if="session?.connectionId && item.queueItemId"
              class="shared-queue-op"
              :class="{ 'shared-queue-op--disabled': isSharedPromptQueueCancelDisabled(item.queueItemId, cancellingSharedQueueItemIds) }"
              @click.stop="cancelSharedPromptQueueItem(item.queueItemId, item.sessionId)"
            >
              {{ isSharedPromptQueueCancelDisabled(item.queueItemId, cancellingSharedQueueItemIds) ? "取消中" : "取消" }}
            </view>
          </view>
        </view>

        <view class="input-main-row">
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

          <view
            class="send-btn"
            :class="{ 'send-btn--active': canSend, 'send-btn--loading': sending }"
            @click="sendMessage"
          >
            <up-loading-icon v-if="sending" color="#ffffff" size="20"></up-loading-icon>
            <up-icon v-else name="arrow-up" size="22" color="#ffffff"></up-icon>
          </view>
        </view>

        <view class="input-tool-row">
          <view class="input-tool-btn" @click="handleChooseImages">
            <view class="input-tool-btn__icon">
              <image class="input-tool-btn__glyph" src="/static/icons/composer-image.svg" mode="aspectFit"></image>
            </view>
          </view>

          <view class="input-tool-btn" @click="handleChooseFiles">
            <view class="input-tool-btn__icon">
              <image class="input-tool-btn__glyph" src="/static/icons/composer-file.svg" mode="aspectFit"></image>
            </view>
          </view>

          <view
            :class="['input-tool-btn', composerPanelMode === 'quick_reply' && 'input-tool-btn--active']"
            @click="toggleComposerPanel('quick_reply')"
          >
            <view class="input-tool-btn__icon">
              <image class="input-tool-btn__glyph" src="/static/icons/composer-quick.svg" mode="aspectFit"></image>
            </view>
          </view>

          <view
            :class="['input-tool-btn', composerPanelMode === 'config' && 'input-tool-btn--active']"
            @click="toggleComposerPanel('config')"
          >
            <view class="input-tool-btn__icon">
              <image class="input-tool-btn__glyph" src="/static/icons/composer-config.svg" mode="aspectFit"></image>
            </view>
          </view>

        </view>

        <view v-if="showComposerPanel" class="composer-panel" :style="upThemeCardStyle">
          <view v-if="composerPanelMode === 'quick_reply'" class="composer-panel__body composer-panel__body--quick">
            <view
              v-for="item in quickReplyItems"
              :key="item.value"
              class="composer-quick-chip"
              @click="sendQuickReply(item.value)"
            >
              <text class="composer-quick-chip__text">{{ item.label }}</text>
            </view>
          </view>

          <scroll-view v-else scroll-y class="composer-panel__scroll">
            <view class="composer-panel__scroll-content">
              <view class="composer-panel__section">
                <text class="composer-panel__section-title">模型配置</text>
                <view
                  :class="['composer-config-row', !modelOption && 'composer-config-row--disabled']"
                  @click="toggleConfigRow('model')"
                >
                  <text class="composer-config-row__label">模型</text>
                  <text class="composer-config-row__value">{{ modelSummary }}</text>
                </view>
                <view
                  v-if="expandedConfigKey === 'model' && modelOption"
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
                  :class="['composer-config-row', !hasPermissionOptions && 'composer-config-row--disabled']"
                  @click="toggleConfigRow('permission')"
                >
                  <text class="composer-config-row__label">授权类型</text>
                  <text class="composer-config-row__value">{{ permissionSummary }}</text>
                </view>
                <view
                  v-if="expandedConfigKey === 'permission' && detailAgentConfig.modes?.available_modes?.length"
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
                  v-else-if="expandedConfigKey === 'permission' && permissionOption"
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
          </scroll-view>
        </view>

        <view v-if="showNetworkReachabilityFeedback" class="input-feedback input-feedback--network">
          <up-icon name="error-circle" size="14" color="#fa8c16"></up-icon>
          <text class="input-feedback__text">{{ networkReachabilityFeedbackText }}</text>
        </view>

        <view v-if="showRuntimeRetryFeedback" class="input-feedback input-feedback--retry">
          <up-loading-icon mode="circle" size="14" color="#fa8c16"></up-loading-icon>
          <text class="input-feedback__text">{{ runtimeRetryText }}</text>
        </view>

        <view v-if="showRuntimeErrorFeedback" class="input-feedback input-feedback--error">
          <up-icon name="close-circle-fill" size="14" color="#fa3534"></up-icon>
          <view class="input-feedback__body">
            <text class="input-feedback__label">发送失败</text>
            <text class="input-feedback__text">{{ runtimeErrorText }}</text>
          </view>
        </view>
      </view>

      <view
        v-if="showScrollToBottomFab"
        class="scroll-bottom-fab"
        @click="handleScrollToBottomFab"
      >
        <up-icon name="arrow-down" size="18" color="#ffffff"></up-icon>
        <view v-if="hasUnreadBelow" class="scroll-bottom-fab__dot"></view>
      </view>

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
      <view class="plan-drawer" :style="upThemeCardStyle">
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
import { onBackPress, onHide, onLoad, onPageScroll, onShow, onUnload } from "@dcloudio/uni-app"
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
  type PersistedTurnWithParts,
} from "@/services/db/repositories/conversationRepository"
import {
  clearRuntime,
  getRuntime,
  saveDraftState,
  type ConversationRuntimeRecord,
} from "@/services/db/repositories/runtimeRepository"
import { connectionSessionManager } from "@/services/conversation/connectionSessionManager"
import { markConversationListDirty } from "@/services/conversation/conversationListRefresh"
import { persistConversationDetailSnapshot } from "@/services/conversation/conversationDetailPersistence"
import { ensureConversationTabForPrompt } from "@/services/conversation/pcTabSyncService"
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
import { decodeConnectionContext } from "@/services/connectionContext"
import { getRelayClientId } from "@/services/gateway/relayClientIdentity"
import { usePetStore } from "@/stores/pet"
import {
  buildAgentConfigContextKey,
  createEmptyDetailAgentConfigState,
  createReadyDetailAgentConfigState,
  persistAgentConfigCache,
  persistAgentConfigSelection,
  projectDetailConfigOptions,
  readFreshAgentConfigCache,
  readPersistedAgentConfigSelection,
  type ComposerConfigKey,
  type DetailAgentConfigState,
} from "@/services/conversation/composerTools"
import type {
  AgentOptionsSnapshot,
  RealtimeBridgeHealth,
  PermissionRequest,
  PendingQuestionState,
  QuestionAnswer,
} from "@/types/acp"
import type { RelaySessionInfo } from "@/services/gateway"
import type { RemoteInstanceDescriptor } from "@/services/realtime/types"
import MessageBubble from "@/components/MessageBubble.vue"
import {
  buildRenderMessageItems,
  type RenderMessageItem,
} from "./detailMessagePresentation"
import {
  buildConversationDraftSnapshot,
  firstString,
  getTurnContentParts,
  isConversationDraftSnapshotEmpty,
  mapPersistedTurnToMessage,
  normalizeAgentType,
  normalizeConversationDraftSnapshot,
  normalizeList,
  resolveConversationDraftRestoreState,
  safeParseArray,
  type ConversationDraftSnapshot,
  type QueuedDraft,
  type UploadedAttachment,
} from "./detailDataNormalization"
import {
  buildQuestionAnswer as buildPendingQuestionAnswer,
  createQuestionSelectionState,
  isQuestionRecommended,
  isQuestionSelectionAnswered,
  questionInputValue,
  questionLabelText,
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
  draftSummary,
  formatQueueTime,
  formatTokenCountK,
  hasSharedPromptQueue,
  isSharedPromptQueueCancelDisabled,
  isSharedPromptQueueClearDisabled,
  isStoppableRuntimeStatus,
  looksLikeNetworkFailure,
  queueStatusText,
  sharedPromptQueueItemPreview,
  sharedPromptQueueItemSource,
  sharedPromptQueuePriorityLabel,
  sharedPromptQueuePositionLabel,
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
  getOldestCursorFromPersistedTurns,
  messageAnchorId as buildMessageAnchorId,
  resolveInitialTurnLimit as resolveInitialTurnLimitValue,
  resolveRenderAnchorId as resolveRenderAnchorIdValue,
  resolveScrollRestoreAction,
  resolveViewportSyncAction,
  restoreHistoryCursorFromCache as restoreHistoryCursorValueFromCache,
  type HistoryPageCursor,
} from "./detailScrollState"
import {
  buildHistoryStatusStyle,
  buildMessageListPageStyle,
  buildTopOffsetStyle,
} from "./detailLayoutPresentation"
import {
  activeModelStatusLabel as resolveActiveModelStatusLabel,
  detailAgentConfigSelectionPayload,
  detailConfigOptionSummary,
  detailPermissionSummary,
  nextExpandedConfigKey,
  pendingComposerConfigActions,
  withSelectedDetailConfigValue,
  withSelectedDetailMode,
} from "./detailComposerPresentation"
import {
  applySlashCommandText,
  filterSlashCommands,
  insertSlashText,
  normalizeSlashCommandsFromSnapshot,
  resolveSlashState,
  slashCommandDescription,
  type SlashCommandItem,
} from "./detailSlashCommands"
import {
  appendQueuedDraft,
  canContinueDraftQueue,
  canProcessDraftQueue,
  createComposerDraft,
  createStandaloneDraft as createStandaloneQueuedDraft,
  finalizeQueuedDraftAttempt,
  findQueuedDraftById,
  hasPromptActuallyStarted as hasPromptStarted,
  prependFailedQueuedDraft,
  removeQueuedDraftById,
} from "./detailDraftQueue"
import {
  buildDraftSendPayload,
  buildPromptStartWatchSignature,
  findLatestOptimisticTurnId,
  isQueuedPromptResponse,
  resolvePromptStartSnapshotOutcome,
  resolvePromptStartTimeoutFailure,
  resolvePromptStartWatchOutcome,
  resolveDraftSendFailure,
  type SendAttemptResult,
} from "./detailPromptSend"
import {
  buildUploadTarget,
  buildUploadedAttachment,
  estimateBase64DecodedBytes,
  isPromptImageTooLarge,
  normalizePickedImages,
  normalizePickedMessageFiles,
  parseImageDataUrl,
  promptImageLimitText,
  PROMPT_IMAGE_MAX_BYTES,
  type PickedLocalFile,
} from "./detailAttachmentUpload"
import {
  buildConnectionKey,
  buildDescriptorFromStoredConnection,
  findStoredConnectionByKey as findStoredConnectionInList,
  normalizeStoredConnectionLike,
  type StoredConnectionItem,
} from "./detailConnectionResolution"

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

const auth = useAuthStore()
const cacheStore = useConversationCacheStore()
const runtime = useConversationRuntimeStore()
const currentInstance = getCurrentInstance()
const upThemeVars = computed(() => currentInstance?.proxy?.upThemeVars || {})
const upThemePageStyle = computed(() => currentInstance?.proxy?.upThemePageStyle || {})
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

const INITIAL_TURN_BATCH = 20
const INITIAL_TURN_EXPAND_BATCH = 30
const INITIAL_TURN_MAX_BATCH = 200
const INITIAL_USER_TURN_TARGET = 8
const PROMPT_START_TIMEOUT_MS = 4000
const STUCK_PROMPT_TIMEOUT_MS = 3 * 60 * 1000
const quickReplyItems: QuickReplyItem[] = [
  { label: "yes", value: "yes" },
  { label: "继续", value: "继续" },
  { label: "1", value: "1" },
  { label: "2", value: "2" },
  { label: "A", value: "A" },
  { label: "B", value: "B" },
  { label: "C", value: "C" },
]

const loading = ref(false)
const sending = ref(false)
const stoppingSession = ref(false)
const processingQueue = ref(false)
const refreshTapCount = ref(0)
const refreshTapTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const sequence = ref(0)
const conversationId = ref<number>(0)
const folderId = ref<number>(0)
const routeConnectionKey = ref("")
const routeConnectionContext = ref<StoredConnectionItem | null>(null)
const bridgeHealth = ref<RealtimeBridgeHealth | null>(null)
const bridgeRecoveredAt = ref(0)
const conversationTitle = ref("未命名会话")
const inputText = ref("")
const pageScrollTop = ref(0)
const topChromeHeight = ref(0)
const bottomComposerHeight = ref(0)
const viewportHeight = ref(0)
const toolbarHeight = ref(0)
const sharedHintHeight = ref(0)
const hasInitialBottomScroll = ref(false)
const isRestoringScroll = ref(false)
const restoredInitialScroll = ref(false)
const lastMeasuredScrollTop = ref(0)
const anchorMessageId = ref("")
const shouldAutoFollowBottom = ref(true)
const hasUnreadBelow = ref(false)
const loadingOlder = ref(false)
const hasMoreHistory = ref(false)
const oldestLoadedCursor = ref<HistoryPageCursor | null>(null)
const attachments = ref<UploadedAttachment[]>([])
const uploadQueue = ref<UploadQueueItem[]>([])
const draftQueue = ref<QueuedDraft[]>([])
const queueExpanded = ref(false)
const sharedPromptQueueExpanded = ref(false)
const cancellingSharedQueueItemIds = ref<Set<string>>(new Set())
const reorderingSharedQueueItemIds = ref<Set<string>>(new Set())
const updatingSharedQueuePriorityItemIds = ref<Set<string>>(new Set())
const clearingSharedPromptQueue = ref(false)
const uploadingCount = ref(0)
const showPlanDrawer = ref(false)
const composerPanelMode = ref<ComposerPanelMode>("")
const longWaitTick = ref(0)
const longWaitStartedAt = ref(0)
const measuredPageHeight = ref(0)
let detailBridgeHealthUnsubscribe: (() => void) | null = null
let longWaitTimer: ReturnType<typeof setInterval> | null = null
let bridgeRecoveryTimer: ReturnType<typeof setTimeout> | null = null
const expandedConfigKey = ref<ComposerConfigKey>("")
const detailAgentConfig = ref<DetailAgentConfigState>(createEmptyDetailAgentConfigState())
const currentAgentType = ref("claude_code")
const detailProjectEntries = ref<DetailProjectEntry[]>([])
const hasLoadedOnce = ref(false)
const needsResumeRefresh = ref(false)
const hasRestoredDraftState = ref(false)
const HISTORY_LOADING_MIN_MS = 480
const permissionSubmitting = ref(false)
const pendingPermissionSubmittingOptionId = ref("")
const questionSubmitting = ref(false)
const askQuestionSelections = ref<Record<string, QuestionSelectionState>>({})
const cachedOldestLoadedSortKey = ref<number | null>(null)
const forceRemoteTurnReconcileOnLoad = ref(false)
let detailAgentProbeToken = 0
let stuckPromptTimer: ReturnType<typeof setTimeout> | null = null
let lastLiveActivitySignature = ""
let stuckPromptShownForSignature = false

function detailDebugLog(stage: string, payload?: Record<string, unknown>) {
  if (!conversationId.value) return
  console.warn("[conversation-detail-debug]", {
    conversationId: conversationId.value,
    stage,
    ...(payload || {}),
  })
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
  return buildMessageListPageStyle({
    viewportHeight: viewportHeight.value,
    topChromeHeight: topChromeHeight.value,
    bottomComposerHeight: bottomComposerHeight.value,
  })
})
const detailToolbarStyle = computed(() => buildTopOffsetStyle(getNavbarHeight()))
const connectingOperationBlockerStyle = computed(() => buildTopOffsetStyle(getNavbarHeight()))
const historyStatusStyle = computed(() =>
  buildHistoryStatusStyle({
    navbarHeight: getNavbarHeight(),
    toolbarHeight: toolbarHeight.value,
  })
)

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

const runtimeStatus = computed<string>(() => {
  const status = String(session.value?.status || "idle")
  if (status === "connected" && !hasBoundConnection.value) return "connecting"
  return status
})
const canStopSession = computed(() => isStoppableRuntimeStatus(runtimeStatus.value))
const liveActivitySignature = computed(() =>
  buildLiveActivitySignature(session.value?.liveMessage?.content || [])
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
    detailProjectPath.value
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

function getNavbarHeight() {
  const menuButtonRect = typeof uni.getMenuButtonBoundingClientRect === "function"
    ? uni.getMenuButtonBoundingClientRect()
    : null
  const statusBarHeight = Number(
    (typeof uni.getWindowInfo === "function" ? uni.getWindowInfo()?.statusBarHeight : 0)
      || uni.getSystemInfoSync?.()?.statusBarHeight
      || 0
  )
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
const runtimeErrorText = computed(() => firstString(session.value?.inputErrorMessage) || "")
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
    runtimeRetryText: runtimeRetryText.value,
    runtimeStatus: runtimeStatus.value,
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

const canSend = computed(() => Boolean(inputText.value.trim() || attachments.value.length > 0))

const isBusyForSend = computed(
  () =>
    sending.value ||
    runtimeStatus.value === "thinking" ||
    runtimeStatus.value === "running_tool" ||
    runtimeStatus.value === "waiting_permission" ||
    runtimeStatus.value === "waiting_question"
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

const slashCommands = ref<SlashCommandItem[]>([])

const slashState = computed(() => resolveSlashState(inputText.value || ""))
const filteredSlashCommands = computed(() =>
  filterSlashCommands(slashCommands.value, slashState.value)
)

function getSlashCommandDesc(item: SlashCommandItem) {
  return slashCommandDescription(item)
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

onLoad((options: any) => {
  conversationId.value = Number(options.id || 0)
  folderId.value = Number(options.folderId || 0)
  needsResumeRefresh.value = false
  const connectionKey = typeof options.connectionKey === "string"
    ? decodeURIComponent(options.connectionKey)
    : ""
  routeConnectionKey.value = connectionKey
  routeConnectionContext.value = normalizeStoredConnectionLike(decodeConnectionContext(connectionKey))
  syncRouteAuthContext()
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
  forceRemoteTurnReconcileOnLoad.value = true
  syncDetailBridgeHealth()
  syncLongWaitState()
  syncRouteAuthContext()
  void loadDetailProjectEntries()
  void loadConversation().then(() => {
    resumeStuckPromptDetection()
  })
})

onPageScroll((event) => {
  const scrollTopValue = Math.max(0, Number(event?.scrollTop || 0))
  pageScrollTop.value = scrollTopValue
  lastMeasuredScrollTop.value = scrollTopValue
  const currentViewportHeight = viewportHeight.value || getViewportHeight()
  const pageHeight = measuredPageHeight.value
  if (currentViewportHeight > 0 && pageHeight > 0) {
    const distanceToBottom = Math.max(0, pageHeight - (scrollTopValue + currentViewportHeight))
    shouldAutoFollowBottom.value = distanceToBottom <= 72
    if (shouldAutoFollowBottom.value) {
      hasUnreadBelow.value = false
      const tail = renderMessageItems.value[renderMessageItems.value.length - 1]
      anchorMessageId.value = tail?.anchorId || ""
    }
  }
  if (scrollTopValue <= 120) {
    void loadOlderTurns()
  }
})

onHide(() => {
  teardownDetailBridgeHealth()
  clearLongWaitTimer()
  clearBridgeRecoveryTimer()
  clearStuckPromptTimer()
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
  clearStuckPromptTimer()
  persistDetailRuntimeState()
  if (conversationId.value) {
    markConversationListDirty()
    runtime.clearSession(conversationId.value)
  }
})

function handleBackNavigation() {
  uni.switchTab({
    url: "/pages/conversations/index",
  })
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

function handleDetailStatusAction(actionKey?: "reconnect" | "inspect") {
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
  if (actionKey === "inspect") {
    if (planTasks.value.length > 0) {
      showPlanDrawer.value = true
      return
    }
    handleScrollToBottomFab()
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
    if (!isBusyForSend.value) {
      void processDraftQueue()
    }
    syncLongWaitState()
  }
)

watch(
  () => detailConnectionKey.value,
  () => {
    syncDetailBridgeHealth()
  },
  { immediate: true }
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
  () => [runtimeStatus.value, conversationActivitySignature.value, session.value?.connectionId || ""] as const,
  ([status, signature]) => {
    handleLiveActivityChange(status, signature)
  },
  { immediate: true }
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
    pendingPermissionCard.value?.id || "",
    pendingQuestionCard.value?.question_id || "",
    JSON.stringify(askQuestionSelections.value),
    slashState.value.visible,
    filteredSlashCommands.value.length,
    composerPanelMode.value,
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
  initialTurnLimit: number
  hasHotRuntime: boolean
}) {
  let localSummary: Awaited<ReturnType<typeof getConversationSummaryById>> | null = null
  let persistedRuntime: ConversationRuntimeRecord | null = null
  let localTurns: PersistedTurnWithParts[] = []
  try {
    await ensureConversationSchema()
    localSummary = await getConversationSummaryById(input.instanceKey, conversationId.value)
    syncConversationTitle(localSummary?.title)
    persistedRuntime = await getRuntime(input.instanceKey, conversationId.value)
    if (!input.hasHotRuntime) {
      localTurns = await getNewestTurns(
        conversationId.value,
        Math.min(input.initialTurnLimit, INITIAL_TURN_BATCH)
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

async function fetchRemoteConversationDetail() {
  const gateway = await getDetailGateway({ refreshAuth: true })
  return await gateway.call<any>("get_folder_conversation", {
    conversationId: conversationId.value,
  })
}

async function hydrateRemoteConversationMetadata(input: {
  managed: ReturnType<typeof connectionSessionManager.getByConversationId>
  instanceKey: string
  agentType: string
  resumeSessionId?: string
  remoteDetail: any
}) {
  if (input.managed || input.resumeSessionId || input.remoteDetail) return input
  try {
    const remoteDetail = await fetchRemoteConversationDetail()
    applyRemoteDetailStats(remoteDetail)
    const metadata = getRemoteConversationMetadata(
      remoteDetail,
      input.agentType,
      input.resumeSessionId
    )
    currentAgentType.value = normalizeAgentType(metadata.agentType)
    syncConversationTitle(metadata.title)
    await persistConversationDetailSnapshot({
      instanceKey: input.instanceKey,
      conversationId: conversationId.value,
      detail: remoteDetail,
      fallbackFolderId: folderId.value,
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

async function persistInitialRemoteDetail(input: {
  instanceKey: string
  detail: any
}) {
  try {
    detailDebugLog("initial-remote-detail", summarizeDetailTurns(input.detail))
    await persistConversationDetailSnapshot({
      instanceKey: input.instanceKey,
      conversationId: conversationId.value,
      detail: input.detail,
      fallbackFolderId: folderId.value,
    })
  } catch (error) {
    detailDebugLog("initial-persist-failed", { message: toErrorMessage(error) })
    console.warn("persist remote conversation detail skipped", error)
  }
}

async function loadLiveConversationSnapshot(connectionId?: string) {
  let snapshot: any = null
  let snapshotFromConversation = false
  try {
    snapshot = await acpApi.acpGetSessionSnapshotByConversation(conversationId.value)
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
      conversationId: conversationId.value,
      detail: {
        session_id: snapshotSessionId,
        agent_type: input.agentType,
        summary: {
          external_id: snapshotSessionId,
          agent_type: input.agentType,
        },
      },
      fallbackFolderId: folderId.value,
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
  loading.value = true
  isRestoringScroll.value = false
  restoredInitialScroll.value = false
  hasRestoredDraftState.value = false
  const cachedViewState = cacheStore.restore(conversationId.value)
  cachedOldestLoadedSortKey.value = Number(cachedViewState?.oldestLoadedSeq || 0) || null
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
    const hasHotRuntime = hasRenderableRuntimeState(runtimeSession)

    const localState = await hydrateLocalConversationState({
      instanceKey,
      initialTurnLimit,
      hasHotRuntime,
    })
    const localSummary = localState.localSummary
    persistedRuntime = localState.persistedRuntime
    const localTurns = localState.localTurns

    const shouldForceRemoteTurnReconcile =
      forceRemoteTurnReconcileOnLoad.value ||
      shouldReconcileTurnsFromPersistedRuntime(persistedRuntime)

    restoreDraftState(cachedViewState, persistedRuntime)

    let agentType =
      firstString(managed?.connection.agentType, localSummary?.agentType) || "claude_code"
    let resumeSessionId =
      firstString(managed?.externalId, managed?.connection.sessionId, localSummary?.externalId)
    let remoteDetail: any = null
    currentAgentType.value = normalizeAgentType(agentType)

    const hydrateRemoteMetadata = async () => {
      const hydrated = await hydrateRemoteConversationMetadata({
        managed,
        instanceKey,
        agentType,
        resumeSessionId,
        remoteDetail,
      })
      agentType = hydrated.agentType
      resumeSessionId = hydrated.resumeSessionId
      remoteDetail = hydrated.remoteDetail
    }

    if (hasHotRuntime) {
      oldestLoadedCursor.value =
        restoreHistoryCursorFromCache(cachedViewState) ?? oldestLoadedCursor.value
      hasMoreHistory.value = cachedViewState?.hasMoreHistory ?? hasMoreHistory.value
      finishInitialLoad(cachedViewState, persistedRuntime)
      if (shouldForceRemoteTurnReconcile) {
        void reconcileRemoteTurnsAfterResume(runtimeSession, cachedViewState, initialTurnLimit)
      }
    } else if (localTurns.length > 0) {
      const totalLocalTurnCount = await countConversationTurns(conversationId.value)
      runtimeSession.localTurns = localTurns
        .slice()
        .reverse()
        .map(mapPersistedTurnToMessage)
      oldestLoadedCursor.value = getOldestCursorFromPersistedTurns(localTurns)
      hasMoreHistory.value = totalLocalTurnCount > localTurns.length
      finishInitialLoad(cachedViewState, persistedRuntime)
      void reconcileRemoteTurnsAfterLocalHydrate(runtimeSession, cachedViewState, initialTurnLimit)
    } else {
      await hydrateRemoteMetadata()
      const result = remoteDetail || await fetchRemoteConversationDetail()
      applyRemoteDetailStats(result)
      const metadata = getRemoteConversationMetadata(result)
      syncConversationTitle(metadata.title)
      agentType = metadata.agentType
      resumeSessionId = metadata.resumeSessionId
      currentAgentType.value = normalizeAgentType(agentType)
      await persistInitialRemoteDetail({ instanceKey, detail: result })

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
    persistDetailRuntimeState()

    const { snapshot, snapshotFromConversation } = await loadLiveConversationSnapshot(conn.id)
    if (snapshot) {
      await persistLiveSnapshotMetadata({
        instanceKey,
        snapshot,
        snapshotFromConversation,
        resumeSessionId,
        managedExternalId: managed?.externalId,
        agentType,
        connectionId: conn.id,
      })
      runtime.hydrateLiveSnapshot(conversationId.value, snapshot)
      persistDetailRuntimeState()
    }
    await loadDetailAgentConfig()
    hydrateSlashCommandsFromSnapshot(snapshot)

  } catch (error) {
    const message = toErrorMessage(error)
    uni.showToast({ title: `加载失败: ${message}`, icon: "none", duration: 3000 })
  } finally {
    forceRemoteTurnReconcileOnLoad.value = false
    finishInitialLoad(cachedViewState, persistedRuntime)
  }
}

function syncConversationTitle(title?: string | null) {
  conversationTitle.value = firstString(title) || "未命名会话"
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

async function refreshSessionTurnsFromDb(
  runtimeSession: ReturnType<typeof runtime.getOrCreateSession>,
  cachedViewState: ReturnType<typeof cacheStore.restore>,
  limit = resolveInitialTurnLimit(cachedViewState)
) {
  const refreshedTurns = await getNewestTurnsWithUserCoverage(conversationId.value, limit)
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

async function reconcileRemoteTurnsAfterLocalHydrate(
  runtimeSession: ReturnType<typeof runtime.getOrCreateSession>,
  cachedViewState: ReturnType<typeof cacheStore.restore>,
  limit: number
) {
  if (!conversationId.value) return
  if (hasVolatileRuntimeState(runtimeSession)) return

  try {
    const gateway = await getDetailGateway()
    const result = await gateway.call<any>("get_folder_conversation", {
      conversationId: conversationId.value,
    })
    applyRemoteDetailStats(result)
    detailDebugLog("local-hydrate-remote-reconcile", summarizeDetailTurns(result))
    if (hasInFlightConversationDetail(result) || hasVolatileRuntimeState(runtimeSession)) {
      await persistConversationDetailSnapshot({
        instanceKey: resolveDetailInstanceKey(),
        conversationId: conversationId.value,
        detail: result,
        fallbackFolderId: folderId.value,
        persistTurns: false,
      })
      return
    }
    await persistConversationDetailSnapshot({
      instanceKey: resolveDetailInstanceKey(),
      conversationId: conversationId.value,
      detail: result,
      fallbackFolderId: folderId.value,
    })
    await refreshSessionTurnsFromDb(runtimeSession, cachedViewState, limit)
  } catch (error) {
    detailDebugLog("local-hydrate-remote-reconcile-failed", {
      message: toErrorMessage(error),
    })
    console.warn("reconcile remote turns after local hydrate skipped", error)
  }
}

async function getNewestTurnsWithUserCoverage(
  targetConversationId: number,
  limit: number
) {
  let turns = await getNewestTurns(targetConversationId, limit)
  if (turns.length === 0) return turns

  const userTurnCount = (items: PersistedTurnWithParts[]) =>
    items.filter((item) => String(item.role || "") === "user").length

  let oldestCursor = getOldestCursorFromPersistedTurns(turns)
  while (
    oldestCursor != null &&
    turns.length < INITIAL_TURN_MAX_BATCH &&
    userTurnCount(turns) < INITIAL_USER_TURN_TARGET
  ) {
    const remaining = INITIAL_TURN_MAX_BATCH - turns.length
    const batchSize = Math.min(INITIAL_TURN_EXPAND_BATCH, remaining)
    const older = await getOlderTurns(targetConversationId, oldestCursor, batchSize)
    if (older.length === 0) break
    turns = [...turns, ...older]
    oldestCursor = getOldestCursorFromPersistedTurns(turns)
    if (older.length < batchSize) break
  }

  return turns
}

function resolveInitialTurnLimit(
  cachedViewState: ReturnType<typeof cacheStore.restore>,
  currentLoadedCount = 0
) {
  return resolveInitialTurnLimitValue({
    cachedLoadedTurnCount: cachedViewState?.loadedTurnCount,
    currentLoadedCount,
    minimumBatch: INITIAL_TURN_BATCH,
  })
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

function applyRemoteDetailStats(detail: any) {
  if (!conversationId.value) return
  runtime.applyConversationDetailStats(conversationId.value, detail)
}

function shouldReconcileTurnsFromPersistedRuntime(
  persistedRuntime: ConversationRuntimeRecord | null
) {
  if (!persistedRuntime) return false
  if (!persistedRuntime.isActive) return false
  if (persistedRuntime.liveMessageJson) return true

  const optimisticTurns = safeParseArray(persistedRuntime.optimisticJson)
  if (optimisticTurns.length > 0) return true

  return typeof persistedRuntime.lastAppliedSeq === "number" && persistedRuntime.lastAppliedSeq > 0
}

function restoreDraftState(
  cachedViewState: ReturnType<typeof cacheStore.restore>,
  persistedRuntime: ConversationRuntimeRecord | null
) {
  const localSnapshot = readConversationDraftSnapshot()
  const restored = resolveConversationDraftRestoreState({
    cachedViewState,
    localSnapshot,
    persistedRuntime,
    createId: createLocalId,
  })
  inputText.value = restored.composerText
  draftQueue.value = restored.draftQueue
  attachments.value = restored.attachments
  queueExpanded.value = restored.queueExpanded
  hasRestoredDraftState.value = true
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
    return normalizeConversationDraftSnapshot(parsed, createLocalId)
  } catch (error) {
    console.warn("restore conversation draft snapshot skipped", error)
    return null
  }
}

function persistConversationDraftSnapshot() {
  const key = buildConversationDraftSnapshotStorageKey()
  if (!key) return
  const snapshot = buildConversationDraftSnapshot({
    composerText: inputText.value,
    draftQueue: draftQueue.value,
    attachments: attachments.value,
    queueExpanded: queueExpanded.value,
  })
  if (isConversationDraftSnapshotEmpty(snapshot)) {
    uni.removeStorageSync(key)
    return
  }
  try {
    uni.setStorageSync(key, JSON.stringify(snapshot))
  } catch (error) {
    console.warn("persist conversation draft snapshot skipped", error)
  }
}

function persistDetailRuntimeState() {
  if (!conversationId.value) return
  persistConversationDraftSnapshot()
  const draftSnapshot = buildConversationDraftSnapshot({
    composerText: inputText.value,
    draftQueue: draftQueue.value,
    attachments: attachments.value,
    queueExpanded: queueExpanded.value,
  })
  cacheStore.persistViewState({
    conversationId: conversationId.value,
    loadedTurnCount: messages.value.length,
    oldestLoadedSeq: oldestLoadedCursor.value?.sortKey ?? undefined,
    hasMoreHistory: hasMoreHistory.value,
    scrollAnchor: anchorMessageId.value || undefined,
    scrollTop: lastMeasuredScrollTop.value || pageScrollTop.value || 0,
    nearBottom: shouldAutoFollowBottom.value,
    anchorMessageId: anchorMessageId.value || undefined,
    composerText: draftSnapshot.composerText,
    draftQueue: draftSnapshot.draftQueue,
    attachments: draftSnapshot.attachments,
    queueExpanded: draftSnapshot.queueExpanded,
  })
  const currentSession = session.value
  void saveDraftState({
    conversationId: conversationId.value,
    instanceKey: resolveDetailInstanceKey(),
    connectionId: currentSession?.connectionId ?? null,
    composerText: inputText.value,
    draftQueueJson: JSON.stringify(draftQueue.value),
    attachmentsJson: JSON.stringify(attachments.value),
    scrollAnchor: anchorMessageId.value || null,
    liveMessageJson: currentSession?.liveMessage ? JSON.stringify(currentSession.liveMessage) : null,
    optimisticJson: JSON.stringify(currentSession?.optimisticTurns || []),
    lastAppliedSeq: currentSession?.lastAppliedSeq ?? null,
    isActive: Boolean(currentSession?.connectionId),
  }).catch((error) => {
    console.warn("persist detail runtime skipped", error)
  })
}

function restoreHistoryCursorFromCache(
  cachedViewState: ReturnType<typeof cacheStore.restore>
): HistoryPageCursor | null {
  return restoreHistoryCursorValueFromCache({
    oldestLoadedSeq: cachedViewState?.oldestLoadedSeq,
    firstMessageId: messages.value[0]?.id,
  })
}

function ensureHistoryCursorFromLoadedMessages() {
  if (oldestLoadedCursor.value) return
  const sortKey = cachedOldestLoadedSortKey.value
  const firstMessageId = messages.value[0]?.id || ""
  if (!sortKey || !firstMessageId) return
  oldestLoadedCursor.value = { sortKey, id: firstMessageId }
}

function measureMessageListHeight() {
  const windowHeight = getViewportHeight()
  viewportHeight.value = windowHeight
  const navbarHeight = getNavbarHeight()
  const query = uni.createSelectorQuery().in(getCurrentInstance()?.proxy)
  query
    .select(".detail-toolbar")
    .boundingClientRect()
    .select(".shared-live-hint")
    .boundingClientRect()
    .select(".history-status")
    .boundingClientRect()
    .select(".input-wrap")
    .boundingClientRect()
    .select(".message-list__content")
    .boundingClientRect()
    .exec((rects: any[]) => {
      const toolbarRect = rects?.[0]
      const sharedHintRect = rects?.[1]
      const historyStatusRect = rects?.[2]
      const inputWrapRect = rects?.[3]
      const contentRect = rects?.[4]
      const topHeight =
        navbarHeight +
        Math.max(0, Number(toolbarRect?.height || 0)) +
        Math.max(0, Number(sharedHintRect?.height || 0)) +
        Math.max(0, Number(historyStatusRect?.height || 0))
      const bottomHeight = Math.max(0, Number(inputWrapRect?.height || 0))
      if (topHeight > 0) {
        topChromeHeight.value = topHeight
      }
      toolbarHeight.value = Math.max(0, Number(toolbarRect?.height || 0))
      sharedHintHeight.value = 0
      if (bottomHeight > 0) {
        bottomComposerHeight.value = bottomHeight
      }
      const contentHeight = Math.max(0, Number(contentRect?.height || 0))
      const availableHeight = Math.max(0, windowHeight - topHeight - bottomHeight)
      measuredPageHeight.value = Math.max(windowHeight, topHeight + bottomHeight + Math.max(contentHeight, availableHeight))
      if (availableHeight > 0) {
        detailDebugLog("message-list-height", {
          windowHeight,
          navbarHeight,
          topHeight,
          bottomHeight,
          contentHeight,
          availableHeight,
        })
      }
    })
}

async function loadOlderTurns() {
  ensureHistoryCursorFromLoadedMessages()
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
    const firstVisibleMessageId = resolveRenderAnchorId(messages.value[0]?.id || anchorMessageId.value || "")
    runtimeSession.localTurns = [
      ...older.slice().reverse().map(mapPersistedTurnToMessage),
      ...runtimeSession.localTurns,
    ]
    oldestLoadedCursor.value = getOldestCursorFromPersistedTurns(older)
    const totalTurnCount = await countConversationTurns(conversationId.value)
    hasMoreHistory.value = totalTurnCount > runtimeSession.localTurns.length
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
  if (!renderMessageItems.value.length) return
  if (!force && !shouldAutoFollowBottom.value) return
  shouldAutoFollowBottom.value = true
  hasUnreadBelow.value = false
  anchorMessageId.value = ""
  nextTick(() => {
    const query = uni.createSelectorQuery().in(getCurrentInstance()?.proxy)
    query.select("#message-list-bottom").boundingClientRect()
    query.exec((rects: any[]) => {
      const rect = rects?.[0]
      const top = Number(rect?.top || 0)
      if (!Number.isFinite(top)) return
      uni.pageScrollTo({
        scrollTop: Math.max(0, pageScrollTop.value + top - (viewportHeight.value || getViewportHeight()) + bottomComposerHeight.value + 16),
        duration: force ? 0 : 200,
      })
    })
  })
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
  nextTick(() => {
    const query = uni.createSelectorQuery().in(getCurrentInstance()?.proxy)
    query.select(`#${messageAnchorId(messageId)}`).boundingClientRect()
    query.exec((rects: any[]) => {
      const rect = rects?.[0]
      const top = Number(rect?.top || 0)
      if (!Number.isFinite(top)) return
      uni.pageScrollTo({
        scrollTop: Math.max(0, pageScrollTop.value + top - topChromeHeight.value),
        duration: 0,
      })
    })
  })
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
      uni.pageScrollTo({
        scrollTop: action.scrollTop,
        duration: 0,
      })
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
      uni.pageScrollTo({
        scrollTop: action.scrollTop,
        duration: 0,
      })
    }
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
    const gateway = await getDetailGateway()
    const snapshot = await gateway.call<AgentOptionsSnapshot>("acp_describe_agent_options", {
      agentType: currentAgentType.value,
      workingDir: detailProjectPath.value || null,
    })
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
  expandedConfigKey.value = nextExpandedConfigKey({
    currentKey: expandedConfigKey.value,
    targetKey: key,
    availability: {
      hasModelOptions: hasModelOptions.value,
      hasReasoningOption: Boolean(reasoningOption.value),
      hasPermissionOptions: hasPermissionOptions.value,
    },
  })
}

async function selectDetailMode(modeId: string) {
  if (!modeId) return
  const conn = session.value?.connectionId
  if (!conn) {
    detailAgentConfig.value = withSelectedDetailMode(detailAgentConfig.value, modeId)
    persistAgentConfigSelection(
      detailAgentConfigContextKey.value,
      detailAgentConfigSelectionPayload(detailAgentConfig.value)
    )
    return
  }
  try {
    await acpApi.acpSetMode(conn, modeId)
    detailAgentConfig.value = withSelectedDetailMode(detailAgentConfig.value, modeId)
    persistAgentConfigSelection(
      detailAgentConfigContextKey.value,
      detailAgentConfigSelectionPayload(detailAgentConfig.value)
    )
  } catch (error) {
    uni.showToast({ title: `模型切换失败: ${toErrorMessage(error)}`, icon: "none" })
  }
}

async function selectDetailConfigValue(configId: string, valueId: string) {
  if (!configId || !valueId) return
  const conn = session.value?.connectionId
  if (!conn) {
    detailAgentConfig.value = withSelectedDetailConfigValue({
      state: detailAgentConfig.value,
      configId,
      valueId,
    })
    persistAgentConfigSelection(
      detailAgentConfigContextKey.value,
      detailAgentConfigSelectionPayload(detailAgentConfig.value)
    )
    return
  }
  try {
    await acpApi.acpSetConfigOption(conn, configId, valueId)
    detailAgentConfig.value = withSelectedDetailConfigValue({
      state: detailAgentConfig.value,
      configId,
      valueId,
    })
    persistAgentConfigSelection(
      detailAgentConfigContextKey.value,
      detailAgentConfigSelectionPayload(detailAgentConfig.value)
    )
  } catch (error) {
    uni.showToast({ title: `配置切换失败: ${toErrorMessage(error)}`, icon: "none" })
  }
}

async function applyPendingComposerConfig() {
  const conn = session.value?.connectionId
  if (!conn) return

  const pending = pendingComposerConfigActions(detailAgentConfig.value)
  if (pending.modeId) {
    await acpApi.acpSetMode(conn, pending.modeId).catch(() => {})
  }

  for (const item of pending.configValues) {
    await acpApi.acpSetConfigOption(conn, item.configId, item.valueId).catch(() => {})
  }
}

function toggleComposerPanel(mode: ComposerPanelMode) {
  composerPanelMode.value = composerPanelMode.value === mode ? "" : mode
  if (!composerPanelMode.value) {
    expandedConfigKey.value = ""
  }
}

function closeComposerPanel() {
  composerPanelMode.value = ""
  expandedConfigKey.value = ""
}

function createStandaloneDraft(text: string): QueuedDraft | null {
  return createStandaloneQueuedDraft({
    text,
    createId: createLocalId,
  })
}

async function submitPreparedDraft(draft: QueuedDraft) {
  if (isBusyForSend.value) {
    draftQueue.value = appendQueuedDraft(draftQueue.value, draft)
    queueExpanded.value = true
    uni.showToast({ title: "已加入待发送队列", icon: "none" })
    return
  }

  const ok = await sendDraft(draft)
  if (!ok) {
    draftQueue.value = prependFailedQueuedDraft(draftQueue.value, draft)
    queueExpanded.value = true
  } else {
    void processDraftQueue()
  }
}

async function reconcileRemoteTurnsAfterResume(
  runtimeSession: ReturnType<typeof runtime.getOrCreateSession>,
  cachedViewState: ReturnType<typeof cacheStore.restore>,
  limit: number
) {
  if (!conversationId.value) return

  try {
    const gateway = await getDetailGateway({ refreshAuth: true })
    const result = await gateway.call<any>("get_folder_conversation", {
      conversationId: conversationId.value,
    })
    applyRemoteDetailStats(result)
    detailDebugLog("resume-remote-reconcile", summarizeDetailTurns(result))
    if (hasInFlightConversationDetail(result) || hasVolatileRuntimeState(runtimeSession)) {
      await persistConversationDetailSnapshot({
        instanceKey: resolveDetailInstanceKey(),
        conversationId: conversationId.value,
        detail: result,
        fallbackFolderId: folderId.value,
        persistTurns: false,
      })
      return
    }
    await persistConversationDetailSnapshot({
      instanceKey: resolveDetailInstanceKey(),
      conversationId: conversationId.value,
      detail: result,
      fallbackFolderId: folderId.value,
    })
    await refreshSessionTurnsFromDb(runtimeSession, cachedViewState, limit)
  } catch (error) {
    detailDebugLog("resume-remote-reconcile-failed", {
      message: toErrorMessage(error),
    })
    console.warn("reconcile remote turns after resume skipped", error)
  }
}

async function ensureConversationReadyForSend() {
  const connectionId = firstString(session.value?.connectionId)
  if (connectionId) return connectionId
  if (!conversationId.value) {
    throw new Error("未连接到代理")
  }

  const recovered = await runtime.connect(
    conversationId.value,
    currentAgentType.value || "claude_code",
    undefined,
    undefined,
    session.value?.lastAppliedSeq ?? undefined,
    resolveDetailInstanceKey()
  )
  persistDetailRuntimeState()
  return firstString(recovered?.id, session.value?.connectionId) || ""
}

async function ensurePcTabReadyForPrompt() {
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

async function sendQuickReply(text: string) {
  if (!canSendSharedLive.value) {
    showSharedLiveBlockedToast()
    return
  }
  const draft = createStandaloneDraft(text)
  if (!draft) return
  closeComposerPanel()
  await submitPreparedDraft(draft)
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
  await submitPreparedDraft(draft)
}

function createDraftFromComposer(): QueuedDraft | null {
  const draft = createComposerDraft({
    text: inputText.value,
    attachments: attachments.value,
    createId: createLocalId,
  })
  if (!draft) return null
  inputText.value = ""
  attachments.value = []
  return draft
}

async function prepareDraftForSend(draft: QueuedDraft): Promise<QueuedDraft> {
  const preparedAttachments: UploadedAttachment[] = []
  let totalImageBytes = 0
  for (const att of draft.attachments) {
    if (att.kind !== "image") {
      preparedAttachments.push({ ...att })
      continue
    }

    const parsedInline = parseImageDataUrl(att.data || att.url)
    let data = att.data || parsedInline?.data || ""
    const mimeType = parsedInline?.mimeType || att.type || "image/png"
    if (!data) {
      const sourcePath = firstString(att.localPath, att.url)
      if (!sourcePath || /^https?:\/\//i.test(sourcePath)) {
        throw new Error(`图片 ${att.name || ""} 本地缓存已失效，请重新选择图片`.trim())
      }
      data = await readLocalImageBase64(sourcePath)
    }

    const decodedBytes = estimateBase64DecodedBytes(data)
    if (decodedBytes > PROMPT_IMAGE_MAX_BYTES) {
      throw new Error(`图片 ${att.name || ""} 超过 ${promptImageLimitText()}，请压缩后重新选择`.trim())
    }
    totalImageBytes += decodedBytes
    if (totalImageBytes > PROMPT_IMAGE_MAX_BYTES) {
      throw new Error(`图片总大小超过 ${promptImageLimitText()}，请减少图片数量或压缩后重试`)
    }

    preparedAttachments.push({
      ...att,
      type: mimeType,
      data,
    })
  }

  return {
    ...draft,
    attachments: preparedAttachments,
  }
}

function stripTransientAttachmentData(att: UploadedAttachment): UploadedAttachment {
  const { data, ...rest } = att
  return rest
}

async function readLocalImageBase64(filePath: string): Promise<string> {
  const fs = (uni as any).getFileSystemManager?.()
  if (!fs || typeof fs.readFile !== "function") {
    throw new Error("当前平台不支持读取图片数据，请重新选择图片")
  }
  return await new Promise<string>((resolve, reject) => {
    fs.readFile({
      filePath,
      encoding: "base64",
      success: (res: { data?: unknown }) => {
        const data = typeof res.data === "string" ? res.data : ""
        if (data) {
          resolve(data)
          return
        }
        reject(new Error("图片读取结果为空，请重新选择图片"))
      },
      fail: (err: { errMsg?: string }) => {
        reject(new Error(err?.errMsg || "图片读取失败，请重新选择图片"))
      },
    })
  })
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
    touchHotConversation(conversationId.value)
    await ensurePcTabReadyForPrompt()
    const conn = await ensureConversationReadyForSend()
    if (!conn) throw new Error("未连接到代理")

    const preparedDraft = await prepareDraftForSend(draft)
    const { imageAttachments, optimisticText, blocks } = buildDraftSendPayload(preparedDraft)
    const optimisticTurnId = runtime.addOptimisticUserMessage(
      conversationId.value,
      optimisticText,
      imageAttachments.map(stripTransientAttachmentData)
    )
    scheduleViewportSync(true)
    if (isViewerMode.value) {
      const liveInfo = await acpApi
        .acpFindConnectionForConversation(conversationId.value)
        .catch(() => null)
      if (liveInfo?.connection_id && liveInfo.connection_id !== conn) {
        throw new Error("该会话已被其他端重新接管，请等待当前轮结束后再发送")
      }
    }
    const promptResponse = await acpApi.acpPrompt(conn, blocks, folderId.value, conversationId.value)
    if (isQueuedPromptResponse(promptResponse)) {
      runtime.removeOptimisticUserMessage(conversationId.value, optimisticTurnId)
      runtime.clearLiveMessage(conversationId.value)
      runtime.handleEvent({
        connectionId: conn,
        type: "turn_queued",
        data: promptResponse,
      } as any)
      usePetStore().addExp('user', 5)
      return true
    }
    const started = await waitForPromptStart(draft)
    if (!started.started) {
      runtime.removeOptimisticUserMessage(conversationId.value, optimisticTurnId)
      runtime.clearLiveMessage(conversationId.value)
      const failure = resolveDraftSendFailure({
        startedResult: started,
        fallbackMessage: "请求已发出，但智能体未开始处理",
      })
      draft.status = failure.status
      draft.error = failure.error
      runtime.setSessionError(conversationId.value, failure.error)
      uni.showToast({ title: failure.toastTitle, icon: "none", duration: 3000 })
      return false
    }
    runtime.setSessionError(conversationId.value, null)
    runtime.beginPlaceholderThinking(conversationId.value)
    usePetStore().addExp('user', 5)
    return true
  } catch (error) {
    const latestOptimisticTurnId = findLatestOptimisticTurnId(session.value?.optimisticTurns || [])
    if (latestOptimisticTurnId) {
      runtime.removeOptimisticUserMessage(conversationId.value, latestOptimisticTurnId)
    }
    runtime.clearLiveMessage(conversationId.value)
    const message = toErrorMessage(error)
    const failure = resolveDraftSendFailure({ errorMessage: message })
    draft.status = failure.status
    draft.error = failure.error
    runtime.setSessionError(conversationId.value, failure.error)
    uni.showToast({ title: failure.toastTitle, icon: "none", duration: 3000 })
    return false
  } finally {
    sending.value = false
  }
}

function hasPromptActuallyStarted() {
  const currentSession = session.value
  if (!currentSession) return false
  return hasPromptStarted({
    status: currentSession.status,
    liveContentLength: currentSession.liveMessage?.content.length || 0,
  })
}

async function waitForPromptStart(draft: QueuedDraft): Promise<SendAttemptResult> {
  if (hasPromptActuallyStarted()) {
    return { started: true }
  }

  return await new Promise<SendAttemptResult>((resolve) => {
    let settled = false
    let stopWatch: (() => void) | null = null
    let timer: ReturnType<typeof setTimeout> | null = null

    const finish = (result: SendAttemptResult) => {
      if (settled) return
      settled = true
      stopWatch?.()
      if (timer) clearTimeout(timer)
      resolve(result)
    }

    stopWatch = watch(
      () => buildPromptStartWatchSignature(session.value),
      () => {
        const outcome = resolvePromptStartWatchOutcome({
          hasStarted: hasPromptActuallyStarted(),
          draftStatus: draft.status,
          draftError: draft.error,
          fallbackMessage: "发送失败",
        })
        if (outcome) {
          finish(outcome)
        }
      },
      { flush: "sync" }
    )

    timer = setTimeout(() => {
      if (hasPromptActuallyStarted()) {
        finish({ started: true })
        return
      }
      void confirmPromptStartFromSnapshot()
        .then((startedBySnapshot) => {
          finish(resolvePromptStartSnapshotOutcome({
            startedBySnapshot,
            hasStartedAfterSnapshot: hasPromptActuallyStarted(),
            timeoutMessage: "请求已入队，但会话没有进入运行状态",
          }))
        })
        .catch(() => {
          finish(resolvePromptStartTimeoutFailure("请求已入队，但会话没有进入运行状态"))
        })
    }, PROMPT_START_TIMEOUT_MS)
  })
}

async function confirmPromptStartFromSnapshot() {
  if (!conversationId.value) return false
  try {
    const snapshot = await acpApi.acpGetSessionSnapshotByConversation(conversationId.value)
    if (!snapshot || typeof snapshot !== "object") return false
    runtime.hydrateLiveSnapshot(conversationId.value, snapshot)
    touchHotConversation(conversationId.value)
    return hasPromptActuallyStarted()
  } catch {
    return false
  }
}

async function processDraftQueue() {
  if (!canProcessDraftQueue({
    processingQueue: processingQueue.value,
    isBusyForSend: isBusyForSend.value,
    uploadingCount: uploadingCount.value,
    canSendSharedLive: canSendSharedLive.value,
    draftQueueLength: draftQueue.value.length,
  })) return
  processingQueue.value = true
  try {
    while (canContinueDraftQueue({
      isBusyForSend: isBusyForSend.value,
      uploadingCount: uploadingCount.value,
      canSendSharedLive: canSendSharedLive.value,
      draftQueueLength: draftQueue.value.length,
    })) {
      const item = draftQueue.value[0]
      const ok = await sendDraft(item)
      draftQueue.value = finalizeQueuedDraftAttempt(draftQueue.value, item.id, ok)
      if (!ok) {
        break
      }
    }
  } finally {
    processingQueue.value = false
  }
}

async function sendQueuedDraft(id: string) {
  const target = findQueuedDraftById(draftQueue.value, id)
  if (!target) return
  if (!canSendSharedLive.value) {
    showSharedLiveBlockedToast()
    return
  }
  if (isBusyForSend.value || uploadingCount.value > 0) {
    uni.showToast({ title: "当前正在处理，请稍后", icon: "none" })
    return
  }
  const ok = await sendDraft(target)
  if (ok) {
    draftQueue.value = removeQueuedDraftById(draftQueue.value, id)
    void processDraftQueue()
  }
}

function removeDraft(id: string) {
  draftQueue.value = removeQueuedDraftById(draftQueue.value, id)
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

function applySlashCommand(item: SlashCommandItem) {
  inputText.value = applySlashCommandText(inputText.value || "", item)
}

function insertSlash() {
  inputText.value = insertSlashText(inputText.value)
}

function chooseImages() {
  uni.chooseImage({
    count: 9,
    sizeType: ["compressed"],
    sourceType: ["album", "camera"],
    success: async (res) => {
      const files = normalizePickedImages({
        tempFilePaths: res.tempFilePaths,
        tempFiles: res.tempFiles,
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
      const files = normalizePickedMessageFiles(res?.tempFiles)

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
  closeComposerPanel()
  chooseImages()
}

function handleChooseFiles() {
  closeComposerPanel()
  chooseFiles()
}

async function uploadPickedFiles(files: PickedLocalFile[]) {
  for (const file of files) {
    if (file.kind === "image" && isPromptImageTooLarge({ size: file.size })) {
      uni.showToast({
        title: `${file.name} 超过 ${promptImageLimitText()}，请压缩后重新选择`,
        icon: "none",
        duration: 3000,
      })
      continue
    }

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

  return buildUploadedAttachment({
    uploadResult,
    file,
    createId: createLocalId,
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

function findStoredConnectionByKey(connKey: string) {
  const saved = uni.getStorageSync("mcode_connections")
  return findStoredConnectionInList(Array.isArray(saved) ? saved : [], connKey)
}

function resolveDetailDescriptor(): RemoteInstanceDescriptor {
  const managed = managedConversation.value
  if (managed?.instanceKey) {
    const registered = getRegisteredRemoteInstanceDescriptor(managed.instanceKey)
    if (registered) {
      return registered
    }
  }

  const stored =
    routeConnectionContext.value ||
    findStoredConnectionByKey(routeConnectionKey.value || detailConnectionKey.value)
  const fromStored = stored
    ? buildDescriptorFromStoredConnection(stored, getDirectToken(stored.url))
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
  const connKey = buildConnectionKey("relay", descriptor.baseUrl)
  const saved = (Array.isArray(uni.getStorageSync("mcode_connections"))
    ? uni.getStorageSync("mcode_connections")
    : []) as StoredConnectionItem[]
  const index = saved.findIndex((item) => buildConnectionKey(item.mode, item.url) === connKey)
  if (index < 0) return
  saved[index] = {
    ...saved[index],
    relaySession: {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      targetId: session.targetId,
    },
  }
  uni.setStorageSync("mcode_connections", saved)
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
