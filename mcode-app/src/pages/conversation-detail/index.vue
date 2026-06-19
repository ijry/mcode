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
          <up-icon name="alert-circle" size="14" color="#fa8c16"></up-icon>
          <text class="input-feedback__text">{{ networkReachabilityFeedbackText }}</text>
        </view>

        <view v-if="showRuntimeRetryFeedback" class="input-feedback input-feedback--retry">
          <up-loading-icon mode="circle" size="14" color="#fa8c16"></up-loading-icon>
          <text class="input-feedback__text">{{ runtimeRetryText }}</text>
        </view>

        <view v-if="showRuntimeErrorFeedback" class="input-feedback input-feedback--error">
          <up-icon name="close-circle-fill" size="14" color="#fa3534"></up-icon>
          <text class="input-feedback__text">{{ runtimeErrorText }}</text>
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
  type PersistedTurnPartRow,
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
import {
  hasRenderableRuntimeState,
  hasVolatileRuntimeState,
} from "@/services/conversation/runtimeViewState.ts"
import { buildRemoteInstanceKey } from "@/services/realtime/instance-key"
import {
  getRegisteredRemoteInstanceDescriptor,
  registerRemoteInstanceDescriptor,
} from "@/services/realtime/remoteInstanceRegistry"
import { decodeConnectionContext } from "@/services/connectionContext"
import { usePetStore } from "@/stores/pet"
import {
  buildAgentConfigContextKey,
  createEmptyDetailAgentConfigState,
  createReadyDetailAgentConfigState,
  findModeName,
  findSelectedOptionValueName,
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
  PromptInputBlock,
  RealtimeBridgeHealth,
  ToolCall,
  ContentPart,
  MessageTurn,
  PermissionRequest,
  PendingQuestionState,
  QuestionAnswer,
} from "@/types/acp"
import type { RelaySessionInfo } from "@/services/gateway"
import type { RemoteInstanceDescriptor } from "@/services/realtime/types"
import MessageBubble from "@/components/MessageBubble.vue"

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

interface SendAttemptResult {
  started: boolean
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

type DetailBannerTone = "info" | "warning" | "error"
type DetailStatusCode =
  | "bridge_recovered"
  | "bridge_reconnecting"
  | "bridge_error"
  | "runtime_error"
  | "api_retry"
  | "waiting_permission"
  | "waiting_question"
  | "connecting"
  | "long_wait"
  | "thinking"
  | "running_tool"
  | "idle"

interface DetailStatusState {
  code: DetailStatusCode
  severity: DetailBannerTone
  text: string
  icon: string
  iconColor: string
  loading: boolean
  actionKey?: "reconnect" | "inspect"
  actionLabel?: string
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
  pairCode?: string
  pairSecret?: string
  relaySession?: {
    accessToken?: string
    refreshToken?: string
    targetId?: string
  }
}

type ComposerPanelMode = "" | "quick_reply" | "config"
interface QuickReplyItem {
  label: string
  value: string
}


interface QuestionSelectionState {
  selected: string[]
  otherActive: boolean
  otherText: string
}

interface HistoryPageCursor {
  sortKey: number
  id: string
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

const messages = computed(() => {
  if (!conversationId.value) return []
  return runtime.getMessages(conversationId.value)
})

interface RenderMessageItem {
  key: string
  anchorId: string
  sourceIds: string[]
  message: MessageTurn
}

const renderMessageItems = computed<RenderMessageItem[]>(() => {
  if (messages.value.length === 0) return []

  const result: RenderMessageItem[] = []
  let assistantBuffer: MessageTurn[] = []

  const pushBufferedAssistantMessages = () => {
    if (assistantBuffer.length === 0) return

    if (assistantBuffer.length === 1) {
      const single = assistantBuffer[0]
      result.push({
        key: single.id,
        anchorId: single.id,
        sourceIds: [single.id],
        message: single,
      })
      assistantBuffer = []
      return
    }

    const first = assistantBuffer[0]
    const last = assistantBuffer[assistantBuffer.length - 1]
    result.push({
      key: `merged-${first.id}-${last.id}`,
      anchorId: last.id,
      sourceIds: assistantBuffer.map((item) => item.id),
      message: {
        ...last,
        id: last.id,
        content: assistantBuffer.flatMap((item) => cloneRenderContentParts(item.content || [])),
        timestamp: last.timestamp,
      },
    })
    assistantBuffer = []
  }

  for (const message of messages.value) {
    if (message.role === "assistant") {
      assistantBuffer.push(message)
      continue
    }

    pushBufferedAssistantMessages()
    result.push({
      key: message.id,
      anchorId: message.id,
      sourceIds: [message.id],
      message,
    })
  }

  pushBufferedAssistantMessages()
  return result
})

const session = computed(() => {
  if (!conversationId.value) return null
  return runtime.getOrCreateSession(conversationId.value)
})
const hasBoundConnection = computed(() => Boolean(firstString(session.value?.connectionId)))

function cloneRenderContentParts(parts: ContentPart[]): ContentPart[] {
  return JSON.parse(JSON.stringify(parts || [])) as ContentPart[]
}

const managedConversation = computed(() => {
  if (!conversationId.value) return null
  return runtime.getManagedConversation(conversationId.value)
})
const messageListPageStyle = computed(() => {
  const minHeight = Math.max(0, viewportHeight.value - topChromeHeight.value - bottomComposerHeight.value)
  if (topChromeHeight.value <= 0 && bottomComposerHeight.value <= 0 && minHeight <= 0) return undefined
  return {
    paddingTop: `${topChromeHeight.value}px`,
    paddingBottom: `${bottomComposerHeight.value}px`,
    minHeight: `${minHeight}px`,
  }
})
const detailToolbarStyle = computed(() => ({
  top: `${getNavbarHeight()}px`,
}))
const connectingOperationBlockerStyle = computed(() => ({
  top: `${getNavbarHeight()}px`,
}))
const historyStatusStyle = computed(() => ({
  top: `${getNavbarHeight() + toolbarHeight.value}px`,
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
const modelSummary = computed(() => {
  if (detailAgentConfig.value.status === "loading") return "加载中"
  return findSelectedOptionValueName(modelOption.value, detailAgentConfig.value.selectedValues)
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
  return findModeName(detailAgentConfig.value.modes, detailAgentConfig.value.selectedModeId)
    || findSelectedOptionValueName(permissionOption.value, detailAgentConfig.value.selectedValues)
    || detailAgentConfig.value.message
    || "远端未提供"
})
const activeModelStatusLabel = computed(() => {
  const modelName = String(modelSummary.value || "").trim()
  if (!modelName || modelName === "加载中" || modelName === "远端未提供") {
    return ""
  }
  if (runtimeStatus.value === "thinking") return `${modelName} 思考中`
  if (runtimeStatus.value === "running_tool") return `${modelName} 执行命令中`
  return modelName
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

function formatTokenCountK(value: number) {
  const normalized = Number(value || 0)
  if (!Number.isFinite(normalized) || normalized <= 0) return "0"
  if (normalized < 1000) return "<1K"
  const kiloValue = normalized / 1000
  if (kiloValue >= 100) return `${Math.round(kiloValue)}K`
  if (kiloValue >= 10) return `${kiloValue.toFixed(1).replace(/\.0$/, "")}K`
  return `${kiloValue.toFixed(2).replace(/\.?0+$/, "")}K`
}

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
const runtimeRetryText = computed(() => {
  const retry = session.value?.apiRetry
  if (!retry) return ""

  const pieces: string[] = []
  if (retry.error) pieces.push(retry.error)
  if (typeof retry.errorStatus === "number") pieces.push(`HTTP ${Math.trunc(retry.errorStatus)}`)
  if (typeof retry.attempt === "number" && typeof retry.maxRetries === "number") {
    pieces.push(`正在重试 ${Math.trunc(retry.attempt)}/${Math.trunc(retry.maxRetries)}`)
  } else if (typeof retry.attempt === "number") {
    pieces.push(`正在重试（第 ${Math.trunc(retry.attempt)} 次）`)
  } else {
    pieces.push("正在重试")
  }
  if (typeof retry.retryDelayMs === "number") {
    pieces.push(`${(retry.retryDelayMs / 1000).toFixed(1)}s 后继续`)
  }
  return pieces.filter(Boolean).join(" · ")
})
const networkReachabilityFeedbackText = computed(() => {
  const health = bridgeHealth.value
  if (health?.state === "reconnecting") {
    const retryText = health.nextRetryDelayMs && health.nextRetryDelayMs > 0
      ? `，${(health.nextRetryDelayMs / 1000).toFixed(1)}s 后自动重试`
      : ""
    return `实时连接已断开，正在恢复${retryText}。请检查主机网络可达性和内网穿透连接稳定性。`
  }
  if (health?.state === "error") {
    return "实时连接异常。请检查主机网络可达性、内网穿透地址是否仍在线，以及电脑端 Web 服务是否开启。"
  }

  const retryText = runtimeRetryText.value
  if (retryText && looksLikeNetworkFailure(retryText)) {
    return `${retryText}。请检查主机网络可达性和连接稳定性。`
  }

  const errorText = runtimeErrorText.value
  if (errorText && looksLikeNetworkFailure(errorText)) {
    return `${errorText}。请检查主机网络可达性、内网穿透地址稳定性，以及电脑端 Web 服务状态。`
  }

  return ""
})
const showNetworkReachabilityFeedback = computed(() =>
  Boolean(networkReachabilityFeedbackText.value)
)
const showBridgeRecoveredBanner = computed(() => {
  if (!bridgeRecoveredAt.value) return false
  return Date.now() - bridgeRecoveredAt.value < 3000
})
const detailStatusState = computed<DetailStatusState>(() => {
  const health = bridgeHealth.value
  if (showBridgeRecoveredBanner.value) {
    return {
      code: "bridge_recovered",
      severity: "info",
      text: "实时连接已恢复",
      icon: "checkmark-circle-fill",
      iconColor: upThemeVar("--up-success", "#19be6b"),
      loading: false,
    }
  }
  if (health?.state === "reconnecting") {
    const retrySuffix = health.nextRetryDelayMs && health.nextRetryDelayMs > 0
      ? `，${(health.nextRetryDelayMs / 1000).toFixed(1)}s 后重试`
      : ""
    return {
      code: "bridge_reconnecting",
      severity: "error",
      text: `实时连接已断开，正在重连第 ${Math.max(1, health.reconnectAttempt)} 次${retrySuffix}`,
      icon: "reload",
      iconColor: upThemeVar("--up-error", "#fa3534"),
      loading: true,
      actionKey: "reconnect",
      actionLabel: "立即重试",
    }
  }
  if (health?.state === "error") {
    return {
      code: "bridge_error",
      severity: "error",
      text: "实时连接异常，正在尝试恢复",
      icon: "close-circle-fill",
      iconColor: upThemeVar("--up-error", "#fa3534"),
      loading: false,
      actionKey: "reconnect",
      actionLabel: "立即重试",
    }
  }
  if (runtimeErrorText.value) {
    return {
      code: "runtime_error",
      severity: "error",
      text: runtimeErrorText.value,
      icon: "close-circle-fill",
      iconColor: upThemeVar("--up-error", "#fa3534"),
      loading: false,
    }
  }
  if (runtimeRetryText.value) {
    return {
      code: "api_retry",
      severity: "warning",
      text: runtimeRetryText.value,
      icon: "reload",
      iconColor: upThemeVar("--up-warning", "#f9ae3d"),
      loading: true,
    }
  }
  if (runtimeStatus.value === "waiting_permission") {
    return {
      code: "waiting_permission",
      severity: "warning",
      text: "智能体正在等待你的授权",
      icon: "alert-circle",
      iconColor: upThemeVar("--up-warning", "#f9ae3d"),
      loading: false,
    }
  }
  if (runtimeStatus.value === "waiting_question") {
    return {
      code: "waiting_question",
      severity: "warning",
      text: "智能体正在等待你的选择",
      icon: "question-circle",
      iconColor: upThemeVar("--up-warning", "#f9ae3d"),
      loading: false,
    }
  }
  if (runtimeStatus.value === "connecting") {
    return {
      code: "connecting",
      severity: "info",
      text: "正在连接智能体...",
      icon: "reload",
      iconColor: upThemeVar("--up-primary", "#2979ff"),
      loading: true,
    }
  }
  if (
    (runtimeStatus.value === "thinking" || runtimeStatus.value === "running_tool")
    && longWaitElapsedMs.value >= 20_000
  ) {
    return {
      code: "long_wait",
      severity: "info",
      text: "远端仍在处理，请保持页面打开",
      icon: "clock",
      iconColor: upThemeVar("--up-primary", "#2979ff"),
      loading: false,
      actionKey: "inspect",
      actionLabel: planTasks.value.length > 0 ? "查看计划" : "查看最近一步",
    }
  }
  if (runtimeStatus.value === "thinking") {
    return {
      code: "thinking",
      severity: "info",
      text: activeModelStatusLabel.value || "思考中",
      icon: "reload",
      iconColor: upThemeVar("--up-primary", "#2979ff"),
      loading: true,
    }
  }
  if (runtimeStatus.value === "running_tool") {
    return {
      code: "running_tool",
      severity: "info",
      text: activeModelStatusLabel.value || "执行命令中",
      icon: "reload",
      iconColor: upThemeVar("--up-primary", "#2979ff"),
      loading: true,
    }
  }
  return {
    code: "idle",
    severity: "info",
    text: "",
    icon: "info-circle",
    iconColor: upThemeVar("--up-primary", "#2979ff"),
    loading: false,
  }
})
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
  detailStatusState.value.code !== "runtime_error" &&
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
const waitingStateBadgeText = computed(() => {
  if (runtimeStatus.value === "waiting_permission") return "等待授权"
  if (runtimeStatus.value === "waiting_question") return "等待选择"
  if (runtimeStatus.value === "running_tool") return "执行中"
  if (runtimeStatus.value === "thinking") return "思考中"
  if (runtimeStatus.value === "connecting") return "连接中"
  return "处理中"
})
const waitingStateTitle = computed(() => {
  if (runtimeStatus.value === "waiting_permission") return "智能体需要你确认下一步"
  if (runtimeStatus.value === "waiting_question") return "智能体需要你补一个选择"
  if (runtimeStatus.value === "running_tool") return "任务已发出，正在执行操作"
  if (runtimeStatus.value === "thinking") return "任务已发出，正在整理回复"
  if (runtimeStatus.value === "connecting") return "正在唤起智能体会话"
  return "正在等待智能体返回"
})
const waitingStateDescription = computed(() => {
  if (runtimeStatus.value === "waiting_permission") {
    return "完成授权后会继续返回结果，这不是故障。"
  }
  if (runtimeStatus.value === "waiting_question") {
    return "完成当前选择后，智能体会继续处理并返回消息。"
  }
  if (runtimeStatus.value === "running_tool") {
    return "智能体已经开始执行，首条消息可能会在操作完成后出现。"
  }
  if (runtimeStatus.value === "thinking") {
    return "首条回复生成前，这里会先保留一个占位气泡。"
  }
  if (runtimeStatus.value === "connecting") {
    return "连接建立后会继续生成首条回复，请保持页面打开。"
  }
  return "消息已经在路上，页面会在首条回复生成后自动补全。"
})
const waitingStateFootnote = computed(() => {
  if (!showWaitingResponseState.value) return ""
  if (runtimeStatus.value === "waiting_permission" || runtimeStatus.value === "waiting_question") {
    return ""
  }
  if (longWaitElapsedMs.value >= 20_000) {
    return "首次响应可能需要一点时间，请先不要离开当前页面。"
  }
  if (longWaitElapsedMs.value >= 8_000) {
    return "远端仍在处理中。"
  }
  return ""
})

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

const runtimeStatusLabel = computed(() => {
  if (detailStatusState.value.code === "bridge_reconnecting") return "重连中"
  if (detailStatusState.value.code === "bridge_error") return "连接异常"
  if (runtimeStatus.value === "thinking" || runtimeStatus.value === "running_tool") {
    return activeModelStatusLabel.value || (runtimeStatus.value === "thinking" ? "思考中" : "执行命令中")
  }
  if (runtimeStatus.value === "waiting_permission") return "等待授权"
  if (runtimeStatus.value === "waiting_question") return "等待选择"
  if (runtimeStatus.value === "error") return "运行异常"
  if (runtimeStatus.value === "connected") return "已连接"
  if (runtimeStatus.value === "connecting") return "连接中"
  return "空闲"
})

const toolbarStatusText = computed(() => {
  const bannerText = String(detailStatusBanner.value?.text || "").trim()
  if (bannerText) return bannerText
  return runtimeStatusLabel.value
})

const runtimeStatusClass = computed(() => {
  if (detailStatusState.value.code === "bridge_reconnecting") return "error"
  if (detailStatusState.value.code === "bridge_error") return "error"
  if (runtimeStatus.value === "thinking" || runtimeStatus.value === "running_tool") return "running"
  if (runtimeStatus.value === "waiting_permission" || runtimeStatus.value === "waiting_question") return "pending"
  if (runtimeStatus.value === "error") return "error"
  if (runtimeStatus.value === "connected") return "online"
  return "idle"
})

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
    renderMessageItems.value.length > 0 &&
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
  routeConnectionContext.value = normalizeStoredConnectionLike(decodeConnectionContext(connectionKey))
  if (routeConnectionContext.value) {
    syncAuthByStoredConnection(routeConnectionContext.value)
  } else if (connectionKey) {
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
  forceRemoteTurnReconcileOnLoad.value = true
  syncDetailBridgeHealth()
  syncLongWaitState()
  if (routeConnectionContext.value) {
    syncAuthByStoredConnection(routeConnectionContext.value)
  } else if (routeConnectionKey.value) {
    syncAuthByConnectionKey(routeConnectionKey.value)
  }
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

async function loadConversation() {
  if (routeConnectionContext.value) {
    syncAuthByStoredConnection(routeConnectionContext.value)
  } else if (routeConnectionKey.value) {
    syncAuthByConnectionKey(routeConnectionKey.value)
  }
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

    let localSummary: Awaited<ReturnType<typeof getConversationSummaryById>> | null = null
    let localTurns: PersistedTurnWithParts[] = []
    try {
      await ensureConversationSchema()
      localSummary = await getConversationSummaryById(instanceKey, conversationId.value)
      syncConversationTitle(localSummary?.title)
      persistedRuntime = await getRuntime(instanceKey, conversationId.value)
      if (!hasHotRuntime) {
        localTurns = await getNewestTurns(
          conversationId.value,
          Math.min(initialTurnLimit, INITIAL_TURN_BATCH)
        )
      }
    } catch (error) {
      console.warn("local conversation hydrate skipped", error)
    }

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
      if (managed || resumeSessionId || remoteDetail) return
      try {
        const gateway = await getDetailGateway({ refreshAuth: true })
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
      const gateway = await getDetailGateway({ refreshAuth: true })
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
    persistDetailRuntimeState()

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
      persistDetailRuntimeState()
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

function isStoppableRuntimeStatus(status: string) {
  return (
    status === "thinking" ||
    status === "running_tool" ||
    status === "waiting_permission" ||
    status === "waiting_question"
  )
}

function buildLiveActivitySignature(parts: ContentPart[]): string {
  return JSON.stringify((parts || []).map((part) => {
    if (part.type === "text") return ["text", part.text || ""]
    if (part.type === "thinking") return ["thinking", part.thinking || ""]
    if (part.type === "tool_call") {
      const toolCall = part.tool_call
      return [
        "tool_call",
        toolCall?.id || "",
        toolCall?.name || "",
        toolCall?.status || "",
        JSON.stringify(toolCall?.input || {}),
        toolCall?.output || "",
        toolCall?.error || "",
      ]
    }
    if (part.type === "tool_result") {
      const toolResult = part.tool_result
      return [
        "tool_result",
        toolResult?.tool_call_id || "",
        toolResult?.output || "",
        toolResult?.is_error ? "1" : "0",
      ]
    }
    if (part.type === "plan") return ["plan", JSON.stringify(part.plan || {})]
    return [part.type]
  }))
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
    detailDebugLog("local-hydrate-remote-reconcile", summarizeDetailTurns(result))
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
    oldestLoadedSeq: oldestLoadedCursor.value?.sortKey ?? undefined,
    hasMoreHistory: hasMoreHistory.value,
    scrollAnchor: anchorMessageId.value || undefined,
    scrollTop: lastMeasuredScrollTop.value || pageScrollTop.value || 0,
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
    scrollAnchor: anchorMessageId.value || null,
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
  const sortKey = Number(tail.sortKey ?? tail.seq ?? tail.createdAt ?? 0)
  if (!sortKey || !tail.id) return null
  return { sortKey, id: tail.id }
}

function restoreHistoryCursorFromCache(
  cachedViewState: ReturnType<typeof cacheStore.restore>
): HistoryPageCursor | null {
  const sortKey = Number(cachedViewState?.oldestLoadedSeq ?? 0)
  if (!sortKey) return null
  const firstMessageId = messages.value[0]?.id || ""
  if (!firstMessageId) return null
  return { sortKey, id: firstMessageId }
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
  return `msg-${String(messageId).replace(/[^a-zA-Z0-9_-]/g, "_")}`
}

function resolveRenderAnchorId(messageId: string) {
  const normalized = String(messageId || "").trim()
  if (!normalized) return ""
  const matched = renderMessageItems.value.find((item) => item.sourceIds.includes(normalized))
  return matched?.anchorId || normalized
}

function getBottomAnchorId() {
  return "message-list-bottom"
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
    lastMeasuredScrollTop.value = cachedScrollTop
    nextTick(() => {
      uni.pageScrollTo({
        scrollTop: cachedScrollTop,
        duration: 0,
      })
    })
  } else if (cachedAnchorMessageId) {
    setProgrammaticAnchor(resolveRenderAnchorId(cachedAnchorMessageId))
  } else if (persistedAnchor) {
    setProgrammaticAnchor(resolveRenderAnchorId(persistedAnchor))
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
    if (lastMeasuredScrollTop.value > 0) {
      uni.pageScrollTo({
        scrollTop: lastMeasuredScrollTop.value,
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
  if (key === "model" && !hasModelOptions.value) return
  if (key === "reasoning" && !reasoningOption.value) return
  if (key === "permission" && !hasPermissionOptions.value) return
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
  const normalized = resolveSlashPreset(String(text || "").trim())
  if (!normalized) return null
  return {
    id: createLocalId("draft"),
    text: normalized,
    attachments: [],
    createdAt: Date.now(),
    status: "pending",
  }
}

async function submitPreparedDraft(draft: QueuedDraft) {
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
    detailDebugLog("resume-remote-reconcile", summarizeDetailTurns(result))
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
    const conn = await ensureConversationReadyForSend()
    if (!conn) throw new Error("未连接到代理")

    const imageAtts = draft.attachments.filter((item) => item.kind === "image")
    const fileAtts = draft.attachments.filter((item) => item.kind === "file")
    const optimisticTurnId = runtime.addOptimisticUserMessage(
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
    if (isViewerMode.value) {
      const liveInfo = await acpApi
        .acpFindConnectionForConversation(conversationId.value)
        .catch(() => null)
      if (liveInfo?.connection_id && liveInfo.connection_id !== conn) {
        throw new Error("该会话已被其他端重新接管，请等待当前轮结束后再发送")
      }
    }
    await acpApi.acpPrompt(conn, blocks, folderId.value, conversationId.value)
    const started = await waitForPromptStart(draft)
    if (!started.started) {
      runtime.removeOptimisticUserMessage(conversationId.value, optimisticTurnId)
      runtime.clearLiveMessage(conversationId.value)
      draft.status = "failed"
      draft.error = started.error || "请求已发出，但智能体未开始处理"
      runtime.setSessionError(conversationId.value, draft.error)
      uni.showToast({ title: `发送失败: ${draft.error}`, icon: "none", duration: 3000 })
      return false
    }
    runtime.setSessionError(conversationId.value, null)
    runtime.beginPlaceholderThinking(conversationId.value)
    usePetStore().addExp('user', 5)
    return true
  } catch (error) {
    const optimisticTurns = session.value?.optimisticTurns || []
    const latestOptimisticTurn = optimisticTurns[optimisticTurns.length - 1]
    if (latestOptimisticTurn?.id) {
      runtime.removeOptimisticUserMessage(conversationId.value, latestOptimisticTurn.id)
    }
    runtime.clearLiveMessage(conversationId.value)
    const message = toErrorMessage(error)
    draft.status = "failed"
    draft.error = message
    runtime.setSessionError(conversationId.value, message)
    uni.showToast({ title: `发送失败: ${message}`, icon: "none", duration: 3000 })
    return false
  } finally {
    sending.value = false
  }
}

function hasPromptActuallyStarted() {
  const currentSession = session.value
  if (!currentSession) return false
  if (currentSession.liveMessage && currentSession.liveMessage.content.length > 0) return true
  return (
    currentSession.status === "thinking" ||
    currentSession.status === "running_tool" ||
    currentSession.status === "waiting_permission" ||
    currentSession.status === "waiting_question"
  )
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
      () => {
        const currentSession = session.value
        return [
          currentSession?.status || "",
          currentSession?.liveMessage ? JSON.stringify(currentSession.liveMessage.content || []) : "",
        ] as const
      },
      () => {
        if (hasPromptActuallyStarted()) {
          finish({ started: true })
          return
        }
        if (draft.status === "failed") {
          finish({ started: false, error: draft.error || "发送失败" })
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
          if (startedBySnapshot || hasPromptActuallyStarted()) {
            finish({ started: true })
            return
          }
          finish({
            started: false,
            error: "请求已入队，但会话没有进入运行状态",
          })
        })
        .catch(() => {
          finish({
            started: false,
            error: "请求已入队，但会话没有进入运行状态",
          })
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
    return hasPromptActuallyStarted()
  } catch {
    return false
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
  closeComposerPanel()
  chooseImages()
}

function handleChooseFiles() {
  closeComposerPanel()
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

function buildConnectionKey(mode: "direct" | "relay", url: string): string {
  return `${mode}::${String(url || "").trim().replace(/\/+$/, "")}`
}

function findStoredConnectionByKey(connKey: string) {
  const saved = (Array.isArray(uni.getStorageSync("mcode_connections"))
    ? uni.getStorageSync("mcode_connections")
    : []) as StoredConnectionItem[]
  return saved.find((item) => buildConnectionKey(item.mode, item.url) === connKey) || null
}

function normalizeStoredConnectionLike(input: any): StoredConnectionItem | null {
  if (!input || typeof input !== "object") return null
  const mode = input.mode === "relay" ? "relay" : input.mode === "direct" ? "direct" : null
  const url = String(input.url || "").trim()
  if (!mode || !url) return null

  return {
    mode,
    url,
    directToken: firstString(input.directToken) || undefined,
    pairCode: firstString(input.pairCode) || undefined,
    pairSecret: firstString(input.pairSecret) || undefined,
    relaySession: input.relaySession && typeof input.relaySession === "object"
      ? {
          accessToken: firstString(input.relaySession.accessToken) || undefined,
          refreshToken: firstString(input.relaySession.refreshToken) || undefined,
          targetId: firstString(input.relaySession.targetId) || undefined,
        }
      : undefined,
  }
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

function resetQuestionSelections() {
  const pending = pendingQuestionCard.value
  const next: Record<string, QuestionSelectionState> = {}
  for (const question of pending?.questions || []) {
    next[question.id] = {
      selected: [],
      otherActive: false,
      otherText: "",
    }
  }
  askQuestionSelections.value = next
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
  const selection = questionSelection(questionId)
  return (
    selection.selected.length > 0 ||
    (selection.otherActive && Boolean(selection.otherText.trim()))
  )
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
  const value =
    typeof event === "string"
      ? event
      : firstString((event as any)?.detail?.value, (event as any)?.target?.value) || ""
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

function questionLabelText(label: string) {
  return String(label || "").replace(/\s*\(recommended\)\s*$/i, "").trim() || label
}

function isQuestionRecommended(label: string) {
  return /\s*\(recommended\)\s*$/i.test(String(label || "")) && Boolean(questionLabelText(label))
}

function buildQuestionAnswer(declined: boolean): QuestionAnswer {
  if (declined) {
    return { answers: [], declined: true }
  }
  const pending = pendingQuestionCard.value
  return {
    declined: false,
    answers: (pending?.questions || []).map((question) => {
      const selection = questionSelection(question.id)
      const labels = [...selection.selected]
      const otherText = selection.otherText.trim()
      if (selection.otherActive && otherText) {
        labels.push(otherText)
      }
      return {
        questionId: question.id,
        labels,
      }
    }),
  }
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

function looksLikeNetworkFailure(message: string) {
  const text = message.toLowerCase()
  return [
    "network",
    "timeout",
    "timed out",
    "connect",
    "connection",
    "socket",
    "websocket",
    "fetch",
    "request",
    "econn",
    "unreachable",
    "refused",
    "断开",
    "连接",
    "超时",
    "网络",
    "不可达",
    "重试",
  ].some((keyword) => text.includes(keyword))
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

function splitPermissionDescription(description: string): {
  textParts: string[]
  commandBlock: string
} {
  const text = String(description || "").trim()
  if (!text) {
    return {
      textParts: ["智能体请求继续当前操作"],
      commandBlock: "",
    }
  }

  const normalized = text.replace(/\r\n/g, "\n")
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)

  const commandLines: string[] = []
  const textParts: string[] = []
  let collectingCommand = false

  lines.forEach((line) => {
    if (looksLikePermissionCommandLine(line)) {
      collectingCommand = true
      commandLines.push(stripPermissionCommandPrefix(line))
      return
    }

    if (collectingCommand && looksLikeCommandContinuation(line)) {
      commandLines.push(line)
      return
    }

    collectingCommand = false
    textParts.push(line)
  })

  if (commandLines.length === 0) {
    return {
      textParts: [normalized],
      commandBlock: "",
    }
  }

  return {
    textParts,
    commandBlock: commandLines.join("\n"),
  }
}

function looksLikePermissionCommandLine(line: string): boolean {
  if (!line) return false
  if (/^(command|cmd|命令|执行命令)\s*[:：]/i.test(line)) return true
  if (line.length >= 72 && /[\\/]/.test(line)) return true
  if (line.length >= 96 && /--?[a-z0-9]/i.test(line)) return true
  return false
}

function looksLikeCommandContinuation(line: string): boolean {
  if (!line) return false
  if (/^(>|\\$|#)/.test(line)) return true
  if (/^(--?[a-z0-9]|\/|\.\.?[\\/])/.test(line)) return true
  if (line.length >= 48 && /[=\\/]/.test(line)) return true
  return false
}

function stripPermissionCommandPrefix(line: string): string {
  return line.replace(/^(command|cmd|命令|执行命令)\s*[:：]\s*/i, "")
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
  min-height: 100%;
  padding: 0 !important;
  display: flex;
  flex-direction: column;
  background-color: var(--up-page-bg-color, var(--up-bg-color, #f3f4f6));
  overflow: visible;
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

.detail-navbar {
  width: 100%;
  max-width: calc(100vw - 220rpx);
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  box-sizing: border-box;
}

.detail-navbar__title-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
  width: 100%;
  min-width: 0;
}

.detail-navbar__logo {
  width: 34rpx;
  height: 34rpx;
  flex-shrink: 0;
}

.detail-navbar__logo--fallback {
  border-radius: 999rpx;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 12%, var(--up-card-bg-color, #ffffff) 88%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.detail-navbar__logo-fallback {
  font-size: 18rpx;
  font-weight: 700;
  color: var(--up-primary, #2979ff);
}

.detail-navbar__title {
  min-width: 0;
  flex: 1;
  font-size: 28rpx;
  line-height: 1.35;
  font-weight: 600;
  color: var(--up-main-color, #303133);
}

.detail-toolbar {
  position: fixed;
  left: 0;
  right: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  flex-shrink: 0;
  padding: 14rpx 24rpx;
  border-top: 1rpx solid var(--up-border-color, #dadbde);
  border-bottom: 1rpx solid var(--up-border-color, #dadbde);
  background: var(--up-card-bg-color, #ffffff);
  box-sizing: border-box;
}

.detail-toolbar__status {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8rpx;
  min-width: 0;
  overflow: hidden;
}

.detail-toolbar__status-copy {
  display: flex;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.detail-toolbar__status-swiper {
  width: 100%;
  height: 34rpx;
}

.detail-toolbar__status-swiper-item {
  display: flex;
  align-items: center;
}

.detail-toolbar__status-text {
  display: block;
  min-width: 0;
  flex: 1;
  font-size: 22rpx;
  line-height: 1.3;
  color: var(--up-tips-color, #909193);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.detail-toolbar__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12rpx;
  flex-shrink: 0;
}

.detail-toolbar__action {
  display: flex;
  align-items: center;
  gap: 8rpx;
  flex-shrink: 0;
  min-height: 56rpx;
  padding: 0 18rpx;
  border-radius: 999rpx;
  background: color-mix(in srgb, var(--up-page-bg-color, var(--up-bg-color, #f5f6f8)) 72%, var(--up-card-bg-color, #ffffff) 28%);
  box-sizing: border-box;
}

.detail-toolbar__action--plan {
  max-width: 360rpx;
  border: 1rpx solid color-mix(in srgb, var(--up-primary, #2979ff) 18%, var(--up-border-color, #dadbde) 82%);
  background: color-mix(in srgb, var(--up-primary, #2979ff) 8%, var(--up-card-bg-color, #ffffff) 92%);
}

.detail-toolbar__action--disabled {
  opacity: 0.6;
}

.detail-toolbar__action-text {
  font-size: 22rpx;
  color: var(--up-content-color, #606266);
}

.detail-toolbar__action-text--plan {
  min-width: 0;
  color: var(--up-primary, #2979ff);
}

.detail-toolbar__icon-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56rpx;
  height: 56rpx;
  flex-shrink: 0;
  border-radius: 999rpx;
  background: color-mix(in srgb, var(--up-page-bg-color, var(--up-bg-color, #f5f6f8)) 72%, var(--up-card-bg-color, #ffffff) 28%);
  box-sizing: border-box;
}

.detail-toolbar__icon-action--danger {
  background: color-mix(in srgb, #f56c6c 10%, var(--up-card-bg-color, #ffffff) 90%);
}

.detail-toolbar__icon-action--disabled {
  opacity: 0.6;
}

.detail-toolbar__stop-mark {
  width: 18rpx;
  height: 18rpx;
  border-radius: 4rpx;
  background: #f56c6c;
}

.runtime-dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  background-color: var(--up-border-color, #dadbde);
  box-shadow: 0 0 0 3rpx color-mix(in srgb, var(--up-card-bg-color, #ffffff) 55%, transparent);

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

.message-list {
  box-sizing: border-box;
  padding-left: 0;
  padding-right: 0;
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

.empty-messages--loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  min-height: 220rpx;
}

.empty-messages__loading-text {
  font-size: 24rpx;
  color: var(--up-content-color, #606266);
}

.empty-messages--pending {
  min-height: 260rpx;
}

.pending-response-card {
  position: relative;
  width: 100%;
  padding: 34rpx 30rpx;
  border-radius: 28rpx;
  overflow: hidden;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--up-primary, #2979ff) 8%, var(--up-card-bg-color, #ffffff) 92%) 0%,
      var(--up-card-bg-color, #ffffff) 100%
    );
  border: 1rpx solid color-mix(in srgb, var(--up-primary, #2979ff) 20%, var(--up-border-color, #dadbde) 80%);
  box-shadow: 0 18rpx 40rpx rgba(41, 121, 255, 0.08);
  box-sizing: border-box;
}

.pending-response-card__pulse {
  position: absolute;
  top: -120rpx;
  right: -60rpx;
  width: 280rpx;
  height: 280rpx;
  border-radius: 50%;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 12%, transparent 88%);
  filter: blur(10rpx);
  opacity: 0.75;
}

.pending-response-card__badge {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 10rpx;
  padding: 10rpx 16rpx;
  border-radius: 999rpx;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 12%, var(--up-card-bg-color, #ffffff) 88%);
}

.pending-response-card__badge-dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: var(--up-primary, #2979ff);
  animation: pendingPulse 1.4s ease-in-out infinite;
}

.pending-response-card__badge-text {
  font-size: 21rpx;
  font-weight: 600;
  color: var(--up-primary, #2979ff);
}

.pending-response-card__title {
  position: relative;
  z-index: 1;
  display: block;
  margin-top: 20rpx;
  font-size: 32rpx;
  line-height: 1.35;
  color: var(--up-main-color, #303133);
  font-weight: 650;
}

.pending-response-card__desc {
  position: relative;
  z-index: 1;
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: var(--up-content-color, #606266);
}

.pending-response-card__bubble {
  position: relative;
  z-index: 1;
  margin-top: 26rpx;
  padding: 26rpx 24rpx 22rpx;
  border-radius: 24rpx 24rpx 24rpx 10rpx;
  background: var(--up-card-bg-color, #ffffff);
  border: 1rpx solid color-mix(in srgb, var(--up-primary, #2979ff) 14%, var(--up-border-color, #dadbde) 86%);
  box-shadow: 0 10rpx 26rpx rgba(15, 23, 42, 0.04);
}

.pending-response-card__bubble-line {
  height: 16rpx;
  margin-top: 14rpx;
  border-radius: 999rpx;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--up-page-bg-color, #f5f6f8) 82%, var(--up-card-bg-color, #ffffff) 18%) 0%,
    color-mix(in srgb, var(--up-primary, #2979ff) 10%, var(--up-card-bg-color, #ffffff) 90%) 50%,
    color-mix(in srgb, var(--up-page-bg-color, #f5f6f8) 82%, var(--up-card-bg-color, #ffffff) 18%) 100%
  );
  background-size: 200% 100%;
  animation: pendingShimmer 1.8s linear infinite;
}

.pending-response-card__bubble-line--strong {
  width: 76%;
  margin-top: 0;
}

.pending-response-card__bubble-line--short {
  width: 48%;
}

.pending-response-card__typing {
  display: inline-flex;
  align-items: center;
  gap: 10rpx;
  margin-top: 22rpx;
  padding: 12rpx 18rpx;
  border-radius: 999rpx;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 8%, var(--up-card-bg-color, #ffffff) 92%);
}

.pending-response-card__typing-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: var(--up-primary, #2979ff);
  opacity: 0.35;
  animation: pendingTyping 1.1s ease-in-out infinite;
}

.pending-response-card__typing-dot:nth-child(2) {
  animation-delay: 0.16s;
}

.pending-response-card__typing-dot:nth-child(3) {
  animation-delay: 0.32s;
}

.pending-response-card__footnote {
  position: relative;
  z-index: 1;
  display: block;
  margin-top: 18rpx;
  font-size: 22rpx;
  line-height: 1.5;
  color: var(--up-tips-color, #909193);
}

@keyframes pendingTyping {
  0%, 80%, 100% {
    transform: translateY(0);
    opacity: 0.35;
  }
  40% {
    transform: translateY(-6rpx);
    opacity: 1;
  }
}

@keyframes pendingShimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

@keyframes pendingPulse {
  0%, 100% {
    transform: scale(1);
    opacity: 0.7;
  }
  50% {
    transform: scale(1.18);
    opacity: 1;
  }
}

.history-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  flex-shrink: 0;
  padding: 12rpx 24rpx;
  background-color: var(--up-page-bg-color, var(--up-bg-color, #f3f4f6));
  position: fixed;
  left: 0;
  right: 0;
  z-index: 18;
}

.history-status--with-plan {
  padding-right: 220rpx;
}

.history-status__text {
  font-size: 22rpx;
  color: var(--up-tips-color, #909193);
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
  color: var(--up-tips-color, #909193);
}

.list-bottom {
  height: calc(24rpx + env(safe-area-inset-bottom));
}

.input-wrap {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  background-color: var(--up-card-bg-color, #ffffff);
  border-top: 1rpx solid var(--up-border-color, #dadbde);
  padding: 14rpx 14rpx;
  padding-bottom: calc(14rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

.permission-card {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  width: 100%;
  min-width: 0;
  margin-bottom: 16rpx;
  padding: 22rpx 24rpx;
  border-radius: 22rpx;
  background: linear-gradient(180deg, color-mix(in srgb, var(--up-warning, #f9ae3d) 12%, var(--up-card-bg-color, #ffffff) 88%) 0%, var(--up-card-bg-color, #ffffff) 100%);
  border: 1rpx solid color-mix(in srgb, var(--up-warning, #f9ae3d) 28%, transparent);
  box-shadow: 0 10rpx 28rpx rgba(250, 173, 20, 0.08);
  overflow: hidden;
  box-sizing: border-box;
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
  color: color-mix(in srgb, var(--up-warning, #f9ae3d) 62%, var(--up-main-color, #303133) 38%);
}

.permission-card__desc {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  width: 100%;
  min-width: 0;
  font-size: 24rpx;
  line-height: 1.6;
  color: var(--up-content-color, #606266);
}

.permission-card__desc-line {
  display: block;
  width: 100%;
  word-break: break-all;
}

.permission-card__command-scroll {
  width: 100%;
  max-width: 100%;
  border-radius: 16rpx;
  overflow: hidden;
  background: color-mix(in srgb, var(--up-main-color, #303133) 5%, var(--up-card-bg-color, #ffffff) 95%);
}

.permission-card__command {
  min-width: 100%;
  padding: 18rpx 20rpx;
  box-sizing: border-box;
}

.permission-card__command-text {
  display: block;
  font-size: 22rpx;
  line-height: 1.45;
  font-family: "Courier New", monospace;
  white-space: pre;
  color: var(--up-main-color, #303133);
}

.permission-card__actions {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  min-width: 0;
}

.permission-card__option {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  width: 100%;
  min-width: 0;
}

.permission-card__action {
  width: 100%;
  min-height: 72rpx;
  padding: 16rpx 24rpx;
  border: none;
  border-radius: 18rpx;
  background: color-mix(in srgb, var(--up-warning, #f9ae3d) 16%, var(--up-card-bg-color, #ffffff) 84%);
  color: color-mix(in srgb, var(--up-warning, #f9ae3d) 64%, var(--up-main-color, #303133) 36%);
  font-size: 24rpx;
  font-weight: 600;
  line-height: 1.4;
  text-align: center;
  box-sizing: border-box;
  white-space: normal;
  word-break: break-all;
}

.permission-card__action::after {
  border: none;
}

.permission-card__action[disabled] {
  opacity: 0.72;
}

.permission-card__action--loading {
  background: color-mix(in srgb, var(--up-warning, #f9ae3d) 28%, var(--up-card-bg-color, #ffffff) 72%);
}

.permission-card__option-desc {
  display: block;
  width: 100%;
  font-size: 22rpx;
  line-height: 1.5;
  color: var(--up-tips-color, #909193);
  word-break: break-all;
}

.permission-card__empty {
  font-size: 22rpx;
  color: var(--up-tips-color, #909193);
  word-break: break-all;
}

.ask-question-card {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
  width: 100%;
  min-width: 0;
  margin-bottom: 16rpx;
  padding: 22rpx 24rpx;
  border-radius: 24rpx;
  background: linear-gradient(180deg, color-mix(in srgb, var(--up-primary, #2979ff) 10%, var(--up-card-bg-color, #ffffff) 90%) 0%, var(--up-card-bg-color, #ffffff) 100%);
  border: 1rpx solid color-mix(in srgb, var(--up-primary, #2979ff) 24%, transparent);
  box-shadow: 0 12rpx 30rpx rgba(41, 121, 255, 0.08);
  box-sizing: border-box;
}

.ask-question-card__header {
  display: flex;
  align-items: flex-start;
  gap: 14rpx;
  min-width: 0;
}

.ask-question-card__badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42rpx;
  height: 42rpx;
  flex-shrink: 0;
  border-radius: 16rpx;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 16%, var(--up-card-bg-color, #ffffff) 84%);
  color: var(--up-primary, #2979ff);
  font-size: 26rpx;
  font-weight: 700;
}

.ask-question-card__heading {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 4rpx;
}

.ask-question-card__title {
  font-size: 27rpx;
  font-weight: 650;
  color: var(--up-main-color, #303133);
}

.ask-question-card__subtitle {
  font-size: 22rpx;
  line-height: 1.45;
  color: var(--up-tips-color, #909193);
}

.ask-question-card__counter {
  flex-shrink: 0;
  font-size: 22rpx;
  color: var(--up-tips-color, #909193);
}

.ask-question-card__question {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  min-width: 0;
}

.ask-question-card__question + .ask-question-card__question {
  padding-top: 16rpx;
  border-top: 1rpx solid var(--up-border-color, #dadbde);
}

.ask-question-card__question-head {
  display: flex;
  align-items: center;
  gap: 10rpx;
  min-width: 0;
}

.ask-question-card__chip {
  flex-shrink: 0;
  padding: 4rpx 10rpx;
  border-radius: 999rpx;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 12%, var(--up-card-bg-color, #ffffff) 88%);
  color: var(--up-primary, #2979ff);
  font-size: 20rpx;
  font-weight: 600;
}

.ask-question-card__header-text {
  min-width: 0;
  font-size: 22rpx;
  color: var(--up-tips-color, #909193);
}

.ask-question-card__prompt {
  font-size: 25rpx;
  line-height: 1.55;
  color: var(--up-main-color, #303133);
  word-break: break-word;
}

.ask-question-card__options {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.ask-question-option {
  display: flex;
  align-items: flex-start;
  gap: 14rpx;
  padding: 18rpx;
  border-radius: 18rpx;
  border: 1rpx solid var(--up-border-color, #dadbde);
  background: var(--up-card-bg-color, #ffffff);
  box-sizing: border-box;
}

.ask-question-option--active {
  border-color: color-mix(in srgb, var(--up-primary, #2979ff) 62%, var(--up-border-color, #dadbde) 38%);
  background: color-mix(in srgb, var(--up-primary, #2979ff) 9%, var(--up-card-bg-color, #ffffff) 91%);
}

.ask-question-option--disabled {
  opacity: 0.72;
}

.ask-question-option__control {
  padding-top: 4rpx;
  flex-shrink: 0;
}

.ask-question-option__radio,
.ask-question-option__checkbox {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30rpx;
  height: 30rpx;
  border: 2rpx solid var(--up-border-color, #dadbde);
  background: var(--up-card-bg-color, #ffffff);
  box-sizing: border-box;
}

.ask-question-option__radio {
  border-radius: 999rpx;
}

.ask-question-option__checkbox {
  border-radius: 8rpx;
}

.ask-question-option__control--active {
  border-color: var(--up-primary, #2979ff);
  background: var(--up-primary, #2979ff);
}

.ask-question-option__mark {
  font-size: 19rpx;
  line-height: 1;
  color: #ffffff;
}

.ask-question-option__body {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 5rpx;
}

.ask-question-option__title-row {
  display: flex;
  align-items: center;
  gap: 8rpx;
  min-width: 0;
}

.ask-question-option__title {
  min-width: 0;
  font-size: 24rpx;
  font-weight: 600;
  color: var(--up-main-color, #303133);
  word-break: break-word;
}

.ask-question-option__recommended {
  flex-shrink: 0;
  padding: 2rpx 8rpx;
  border-radius: 999rpx;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 14%, var(--up-card-bg-color, #ffffff) 86%);
  color: var(--up-primary, #2979ff);
  font-size: 18rpx;
  font-weight: 600;
}

.ask-question-option__desc {
  font-size: 22rpx;
  line-height: 1.45;
  color: var(--up-tips-color, #909193);
  word-break: break-word;
}

.ask-question-card__other-input {
  height: 70rpx;
  padding: 0 18rpx;
  border-radius: 16rpx;
  border: 1rpx solid var(--up-border-color, #dadbde);
  background: var(--up-card-bg-color, #ffffff);
  color: var(--up-main-color, #303133);
  font-size: 24rpx;
  box-sizing: border-box;
}

.ask-question-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.ask-question-card__skip,
.ask-question-card__submit {
  min-width: 132rpx;
  height: 66rpx;
  margin: 0;
  padding: 0 24rpx;
  border: none;
  border-radius: 999rpx;
  font-size: 24rpx;
  font-weight: 600;
  line-height: 66rpx;
}

.ask-question-card__skip::after,
.ask-question-card__submit::after {
  border: none;
}

.ask-question-card__skip {
  background: transparent;
  color: var(--up-content-color, #606266);
}

.ask-question-card__submit {
  margin-left: auto;
  background: var(--up-primary, #2979ff);
  color: #ffffff;
}

.ask-question-card__submit--disabled,
.ask-question-card__submit[disabled],
.ask-question-card__skip[disabled] {
  opacity: 0.58;
}

.input-feedback {
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-top: 10rpx;
  padding: 12rpx 4rpx 0;
  min-width: 0;
}

.input-feedback--retry {
  color: #fa8c16;
}

.input-feedback--network {
  align-items: flex-start;
  margin-top: 12rpx;
  padding: 14rpx 16rpx;
  border-radius: 18rpx;
  background: color-mix(in srgb, var(--up-warning, #f9ae3d) 12%, var(--up-card-bg-color, #ffffff) 88%);
  border: 1rpx solid color-mix(in srgb, var(--up-warning, #f9ae3d) 28%, var(--up-border-color, #dadbde) 72%);
  color: var(--up-content-color, #606266);
}

.input-feedback--error {
  color: var(--up-error, #fa3534);
}

.input-feedback__text {
  display: flex;
  min-width: 0;
  font-size: 22rpx;
  line-height: 1.5;
  word-break: break-all;
  flex: 1;
}

.slash-panel {
  margin-bottom: 12rpx;
  border: 1rpx solid var(--up-border-color, #dadbde);
  border-radius: 16rpx;
  background-color: var(--up-card-bg-color, #ffffff);
  overflow: hidden;
}

.composer-config-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  padding: 16rpx 18rpx;
  border-radius: 16rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.composer-config-row--disabled {
  opacity: 0.72;
}

.composer-config-row__label {
  font-size: 23rpx;
  color: var(--up-main-color, #303133);
}

.composer-config-row__value {
  font-size: 22rpx;
  color: var(--up-tips-color, #909193);
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

.slash-item {
  padding: 16rpx 18rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  border-bottom: 1rpx solid var(--up-border-color, #dadbde);

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
  color: var(--up-primary, #2979ff);
  font-family: "Courier New", monospace;
}

.slash-item__desc {
  font-size: 21rpx;
  color: var(--up-tips-color, #909193);
  flex: 1;
  min-width: 0;
  text-align: right;
}

.upload-queue {
  margin-bottom: 10rpx;
  padding: 10rpx 14rpx;
  border-radius: 14rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
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
  color: var(--up-content-color, #606266);
}

.upload-queue__status {
  font-size: 21rpx;
  color: var(--up-tips-color, #909193);

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
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  border: 1rpx solid var(--up-border-color, #dadbde);
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 0 12rpx;
  box-sizing: border-box;
}

.attachment-file__name {
  font-size: 22rpx;
  color: var(--up-content-color, #606266);
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
  background: color-mix(in srgb, var(--up-primary, #2979ff) 8%, var(--up-card-bg-color, #ffffff) 92%);
  border: 1rpx solid color-mix(in srgb, var(--up-primary, #2979ff) 22%, var(--up-card-bg-color, #ffffff) 78%);
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
  color: var(--up-primary, #2979ff);
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
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  border: 1rpx solid var(--up-border-color, #dadbde);
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
  color: var(--up-main-color, #303133);
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

  &--pending { color: var(--up-tips-color, #909193); }
  &--sending { color: #2979ff; }
  &--failed { color: #fa3534; }
}

.queue-item__time {
  font-size: 20rpx;
  color: var(--up-tips-color, #909193);
}

.queue-item__actions {
  display: flex;
  align-items: center;
  gap: 8rpx;
  flex-shrink: 0;
}

.queue-op {
  font-size: 20rpx;
  color: var(--up-tips-color, #909193);
  padding: 6rpx 10rpx;
  border-radius: 999rpx;
  background-color: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));

  &--primary {
    color: var(--up-primary, #2979ff);
    background-color: color-mix(in srgb, var(--up-primary, #2979ff) 10%, var(--up-card-bg-color, #ffffff) 90%);
  }
}

.input-main-row {
  display: flex;
  align-items: flex-end;
  gap: 12rpx;
}

.input-box {
  flex: 1;
  background-color: color-mix(in srgb, var(--up-page-bg-color, var(--up-bg-color, #f5f6f8)) 72%, var(--up-card-bg-color, #ffffff) 28%);
  border-radius: 24rpx;
  padding: 14rpx 20rpx;
  min-height: 72rpx;
  display: flex;
  align-items: center;
  box-sizing: border-box;
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
    max-height: 220rpx;
    line-height: 36rpx;
    font-size: 27rpx;
    background: transparent !important;
    overflow-y: auto;
  }

  :deep(.uni-textarea-wrapper) {
    background: transparent !important;
  }
}

.send-btn {
  width: 68rpx;
  height: 68rpx;
  border-radius: 50%;
  background-color: var(--up-border-color, #dadbde);
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

.input-tool-row {
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-top: 10rpx;
}

.input-tool-btn {
  flex: 1;
  min-width: 0;
  height: 64rpx;
  padding: 0;
  border-radius: 20rpx;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;

  &--active {
    background: transparent;
  }

  &--disabled {
    opacity: 0.6;
    pointer-events: none;
  }

}

.input-tool-btn__icon {
  width: 56rpx;
  height: 56rpx;
  border-radius: 18rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--up-page-bg-color, var(--up-bg-color, #f5f6f8)) 72%, var(--up-card-bg-color, #ffffff) 28%);
  transition: background-color 0.2s ease, transform 0.2s ease;
}

.input-tool-btn__glyph {
  width: 32rpx;
  height: 32rpx;
  display: block;
}

.input-tool-btn--active .input-tool-btn__icon {
  background: color-mix(in srgb, var(--up-primary, #2979ff) 12%, var(--up-card-bg-color, #ffffff) 88%);
  transform: translateY(-1rpx);
}

.composer-panel {
  margin-top: 12rpx;
  height: 280rpx;
  border-radius: 20rpx;
  background: var(--up-card-bg-color, #ffffff);
  box-shadow: none;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

.composer-panel__body {
  flex: 1;
  min-height: 0;
}

.composer-panel__body--quick {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 12rpx;
  padding: 24rpx 20rpx 20rpx;
  box-sizing: border-box;
}

.composer-quick-chip {
  min-width: 96rpx;
  padding: 16rpx 20rpx;
  border-radius: 18rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  border: 1rpx solid var(--up-border-color, #dadbde);
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.composer-quick-chip__text {
  font-size: 24rpx;
  line-height: 1;
  color: var(--up-main-color, #303133);
}

.composer-panel__scroll {
  flex: 1;
  min-height: 0;
  width: 100%;
}

.composer-panel__scroll-content {
  padding: 24rpx 20rpx 20rpx;
  box-sizing: border-box;
}

.composer-panel__section {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.composer-panel__section-title {
  font-size: 22rpx;
  font-weight: 600;
  color: var(--up-content-color, #606266);
}

.scroll-bottom-fab {
  position: fixed;
  right: 24rpx;
  bottom: 150px;
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

.connecting-operation-blocker {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40rpx;
  background: color-mix(in srgb, var(--up-page-bg-color, var(--up-bg-color, #f3f4f6)) 72%, transparent);
  backdrop-filter: blur(8rpx);
  box-sizing: border-box;
}

.connecting-operation-blocker__panel {
  width: min(560rpx, calc(100vw - 80rpx));
  padding: 42rpx 36rpx;
  border-radius: 24rpx;
  border: 1rpx solid color-mix(in srgb, var(--up-primary, #2979ff) 18%, var(--up-border-color, #dadbde) 82%);
  background: var(--up-card-bg-color, #ffffff);
  box-shadow: 0 22rpx 56rpx rgba(0, 0, 0, 0.12);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
  text-align: center;
  box-sizing: border-box;
}

.connecting-operation-blocker__title {
  font-size: 30rpx;
  line-height: 1.35;
  font-weight: 600;
  color: var(--up-main-color, #303133);
}

.connecting-operation-blocker__desc {
  font-size: 24rpx;
  line-height: 1.55;
  color: var(--up-content-color, #606266);
}

.plan-fab {
  position: fixed;
  right: 12rpx;
  top: 60px;
  z-index: 32;
  min-height: 64rpx;
  max-width: calc(100vw - 48rpx);
  padding: 14rpx 20rpx;
  border-radius: 32rpx;
  background: linear-gradient(135deg, #5f7bff, #6b8bff);
  box-shadow: 0 10rpx 24rpx rgba(41, 121, 255, 0.28);
  display: flex;
  align-items: center;
  gap: 10rpx;
  box-sizing: border-box;
}

.plan-fab__text {
  font-size: 22rpx;
  color: #ffffff;
  font-weight: 500;
  white-space: nowrap;
}

.plan-drawer {
  background-color: var(--up-card-bg-color, #ffffff);
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
  border-bottom: 1rpx solid var(--up-border-color, #dadbde);
  box-sizing: border-box;
  flex-shrink: 0;
}

.plan-drawer__title {
  font-size: 32rpx;
  color: var(--up-main-color, #303133);
  font-weight: 600;
}

.plan-drawer__count {
  font-size: 24rpx;
  color: var(--up-tips-color, #909193);
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
  color: var(--up-content-color, #606266);
  background-color: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  border-radius: 999rpx;
  padding: 10rpx 14rpx;
  line-height: 1;
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.plan-filter--active {
  color: var(--up-primary, #2979ff);
  background-color: color-mix(in srgb, var(--up-primary, #2979ff) 10%, var(--up-card-bg-color, #ffffff) 90%);
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
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
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
  background-color: var(--up-border-color, #dadbde);

  &--pending { background-color: var(--up-border-color, #dadbde); }
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
  color: var(--up-main-color, #303133);
  line-height: 1.45;
  word-break: break-word;
}

.plan-task__desc {
  display: block;
  margin-top: 8rpx;
  font-size: 23rpx;
  color: var(--up-tips-color, #909193);
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
    color: var(--up-content-color, #606266);
    background-color: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  }
  &--in_progress {
    color: var(--up-primary, #2979ff);
    background-color: color-mix(in srgb, var(--up-primary, #2979ff) 10%, var(--up-card-bg-color, #ffffff) 90%);
  }
  &--completed {
    color: var(--up-success, #19be6b);
    background-color: color-mix(in srgb, var(--up-success, #19be6b) 12%, var(--up-card-bg-color, #ffffff) 88%);
  }
  &--failed {
    color: var(--up-error, #fa3534);
    background-color: color-mix(in srgb, var(--up-error, #fa3534) 12%, var(--up-card-bg-color, #ffffff) 88%);
  }
}

.plan-drawer__safe {
  height: calc(24rpx + env(safe-area-inset-bottom));
}

</style>
