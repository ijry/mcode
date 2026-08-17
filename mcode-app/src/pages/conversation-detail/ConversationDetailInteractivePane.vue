<template>
  <view
    :class="[
      'detail-interactive-pane',
      detailTheme !== 'default' && `detail-interactive-pane--theme-${detailTheme}`,
      detailTheme === 'matrix' && 'detail-interactive-pane--cyber',
      detailTheme === 'matrix' && active && 'detail-interactive-pane--cyber-active',
      detailTheme === 'matrix' && active && `detail-interactive-pane--${cyberEffectPhase || 'idle'}`,
      detailTheme === 'sweet' && `detail-interactive-pane--sweet-${cyberEffectPhase || 'idle'}`,
    ]"
  >
  <ConversationDetailBody
    :message-list-page-style="messageListPageStyle"
    :message-list-content-style="messageListContentStyle"
    :input-wrap-style="inputWrapStyle"
    :translucent-message-list="translucentMessageList"
    :message-scroll-top="messageScrollTop"
    :message-scroll-into-view="messageScrollIntoView"
    :message-scroll-with-animation="messageScrollWithAnimation"
    :upper-threshold="120"
    :detail-theme="detailTheme"
    :cyber-effect-phase="active ? cyberEffectPhase : 'idle'"
    :cyber-active="Boolean(detailTheme === 'matrix' && active)"
    @message-scroll="handleMessageListScroll"
    @message-scroll-upper="handleMessageListScrollUpper"
  >
    <template #history>
      <view v-if="historyStatusText" class="history-status">
        <up-loading-icon
          v-if="historyStatusBusy"
          mode="circle"
          size="16"
          :color="upThemeVar('--up-tips-color', '#909193')"
        ></up-loading-icon>
        <text class="history-status__text">{{ historyStatusText }}</text>
      </view>
    </template>

    <template #content>
      <view v-if="showWaitingResponseState" class="empty-messages empty-messages--pending">
        <view
          :class="[
            'pending-response-card',
            translucentMessageList && 'pending-response-card--translucent',
          ]"
        >
          <view class="pending-response-card__pulse"></view>
          <view class="pending-response-card__badge">
            <view class="pending-response-card__badge-dot"></view>
            <text class="pending-response-card__badge-text">{{ waitingStateBadgeText }}</text>
          </view>
          <text class="pending-response-card__title">{{ waitingStateTitle }}</text>
          <text class="pending-response-card__desc">{{ waitingStateDescription }}</text>
          <text v-if="waitingStateFootnote" class="pending-response-card__footnote">
            {{ waitingStateFootnote }}
          </text>
        </view>
      </view>

      <view
        v-else-if="contentFallbackPresentation.code === 'loading'"
        class="empty-messages empty-messages--loading"
      >
        <up-loading-icon
          mode="circle"
          size="24"
          :color="upThemeVar('--up-primary', '#2979ff')"
        ></up-loading-icon>
        <text class="empty-messages__loading-text">正在加载会话内容...</text>
      </view>

      <view
        v-else-if="contentFallbackPresentation.code === 'error'"
        class="empty-messages empty-messages--fallback"
      >
        <up-icon
          name="close-circle-fill"
          size="32"
          :color="upThemeVar('--up-error', '#fa3534')"
        ></up-icon>
        <text class="empty-messages__fallback-title">加载会话失败</text>
        <text class="empty-messages__fallback-desc">{{ contentFallbackPresentation.message }}</text>
        <view class="empty-messages__fallback-action" @click="emit('reload')">重新加载</view>
      </view>

      <view
        v-else-if="contentFallbackPresentation.code === 'empty'"
        class="empty-messages"
      >
        <up-empty mode="message" text="这是一个新会话，暂时还没有消息"></up-empty>
      </view>

      <view
        v-for="(item, index) in renderMessageItems"
        :key="item.key"
        :id="messageAnchorId(item.anchorId)"
        class="message-item"
      >
        <MessageBubble
          :message="item.message"
          :agent-type="normalizedAgentType"
          :showRegenerate="index === renderMessageItems.length - 1 && item.message.role === 'assistant'"
          :translucent="translucentMessageList"
          :detail-theme="detailTheme"
          :cyber-effect-phase="active ? (cyberEffectPhase || 'idle') : 'idle'"
          :cyber-active="Boolean(detailTheme === 'matrix' && active)"
          @regenerate="regenerateLastMessage"
        />
      </view>

      <view v-if="stats.totalTokens > 0" class="stats-bar">
        <up-icon name="file-text" size="14" :color="upThemeVar('--up-light-color', '#c0c4cc')"></up-icon>
        <text class="stats-text">
          输入 {{ formatTokenCountK(stats.inputTokens) }} / 输出 {{ formatTokenCountK(stats.outputTokens) }} / 总计 {{ formatTokenCountK(stats.totalTokens) }}
        </text>
      </view>

      <!-- 生成中胶囊暂时隐藏，活动反馈改由输入区上方状态条承接。 -->
      <view
        v-if="false && showBottomGeneratingIndicator"
        :class="[
          'bottom-generating',
          translucentMessageList && 'bottom-generating--translucent',
        ]"
      >
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

      <view :id="bottomAnchorIdValue" class="list-bottom"></view>
    </template>

    <template #status>
      <view class="input-status-row">
        <view class="input-status-row__main">
          <view class="runtime-dot runtime-dot--compact" :class="`runtime-dot--${runtimeStatusClass}`"></view>
          <text class="input-status-row__text">{{ inputStatusText }}</text>
        </view>
        <view
          v-if="planTasks.length > 0"
          class="input-status-row__plan"
          @click.stop="showPlanDrawer = true"
        >
          <up-icon name="list" size="13" :color="upThemeVar('--up-primary', '#2979ff')"></up-icon>
          <text class="input-status-row__plan-text">计划 {{ completedTaskCount }}/{{ planTasks.length }}</text>
        </view>
      </view>
    </template>

    <template #composer>
      <view
        v-if="pendingPermissionCard"
        :class="[
          'permission-card',
          translucentMessageList && 'permission-card--translucent',
        ]"
      >
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

      <view
        v-if="pendingQuestionCard"
        :class="[
          'ask-question-card',
          translucentMessageList && 'ask-question-card--translucent',
        ]"
      >
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
        v-if="showSlashPanel"
        :class="[
          'slash-panel',
          translucentMessageList && 'slash-panel--translucent',
        ]"
      >
        <view class="slash-panel__close" @click.stop="dismissSlashPanel">
          <up-icon name="close" size="13" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
        </view>
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

      <view
        v-if="showMentionPanel"
        :class="[
          'mention-panel',
          translucentMessageList && 'mention-panel--translucent',
        ]"
      >
        <view class="mention-panel__header">
          <view class="mention-panel__title">
            <text class="mention-panel__trigger">@</text>
            <text class="mention-panel__title-text">引用上下文</text>
          </view>
          <text class="mention-panel__hint">{{ mentionPanelHint }}</text>
        </view>

        <view
          v-if="mentionSourceStatus === 'loading'"
          class="mention-panel__state"
        >
          <up-loading-icon
            mode="circle"
            size="15"
            :color="upThemeVar('--up-tips-color', '#909193')"
          ></up-loading-icon>
          <text class="mention-panel__state-text">正在读取项目上下文</text>
        </view>
        <view
          v-else-if="mentionSourceStatus === 'error'"
          class="mention-panel__state mention-panel__state--error"
        >
          <text class="mention-panel__state-text">{{ mentionSourceError || "引用加载失败" }}</text>
        </view>
        <view
          v-else-if="mentionResultCount === 0"
          class="mention-panel__state"
        >
          <text class="mention-panel__state-text">继续输入以过滤文件、会话、提交或智能体</text>
        </view>
        <scroll-view
          v-else
          scroll-y
          class="mention-panel__scroll"
        >
          <view class="mention-panel__body">
            <view
              v-for="group in mentionVisibleGroups"
              :key="group.kind"
              class="mention-group"
            >
              <view class="mention-group__header">
                <text class="mention-group__title">{{ group.label }}</text>
                <text class="mention-group__count">{{ group.items.length }}</text>
              </view>
              <view
                v-for="item in group.items"
                :key="`${group.kind}:${item.id}`"
                class="mention-item"
                @click="insertMentionReference(item)"
              >
                <view :class="['mention-item__badge', `mention-item__badge--${item.kind}`]">
                  <text>{{ mentionKindShortLabel(item.kind) }}</text>
                </view>
                <view class="mention-item__body">
                  <text class="mention-item__label u-line-1">{{ item.label }}</text>
                  <text v-if="item.detail" class="mention-item__detail u-line-1">{{ item.detail }}</text>
                </view>
              </view>
              <text v-if="group.truncated" class="mention-group__more">
                结果较多，继续输入可缩小范围
              </text>
            </view>
          </view>
        </scroll-view>
      </view>

      <view
        v-if="uploadQueue.length > 0"
        :class="[
          'upload-queue',
          translucentMessageList && 'upload-queue--translucent',
        ]"
      >
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

      <view
        v-if="attachments.length > 0"
        :class="[
          'attachments-preview',
          translucentMessageList && 'attachments-preview--translucent',
        ]"
      >
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

      <view class="input-main-row">
        <view
          :class="[
            'tool-toggle-btn',
            translucentMessageList && 'tool-toggle-btn--translucent',
            showInputToolRow && 'tool-toggle-btn--active',
          ]"
          @click="toggleInputToolRow"
        >
          <up-icon
            :name="showInputToolRow ? 'close' : 'plus'"
            size="18"
            :color="showInputToolRow ? upThemeVar('--up-primary', '#2979ff') : upThemeVar('--up-content-color', '#606266')"
          ></up-icon>
        </view>

        <view
          :class="[
            'input-box',
            translucentMessageList && 'input-box--translucent',
          ]"
        >
          <up-textarea
            class="composer-textarea"
            v-model="inputText"
            placeholder="发送消息，输入 / 或 @ 调出工具"
            autoHeight
            fixed
            :cursor="composerCursorProp"
            :maxlength="10000"
            border="none"
            height="34rpx"
            :customStyle="{ backgroundColor: 'transparent', background: 'transparent', padding: '0', borderColor: 'transparent' }"
            @input="handleComposerInput"
            @blur="handleComposerBlur"
            @linechange="handleComposerLayoutChange"
            @keyboardheightchange="handleComposerLayoutChange"
          ></up-textarea>
        </view>

        <view
          :class="[
            'send-btn',
            translucentMessageList && 'send-btn--translucent',
            canSend && 'send-btn--active',
            sending && 'send-btn--loading',
          ]"
          @click="sendMessage"
        >
          <up-loading-icon v-if="sending" color="#ffffff" size="20"></up-loading-icon>
          <up-icon v-else name="arrow-up" size="22" color="#ffffff"></up-icon>
        </view>
      </view>

      <view v-if="showInputToolRow" class="input-tool-row">
        <view class="input-tool-btn" @click="handleChooseImages">
          <view
            :class="[
              'input-tool-btn__icon',
              translucentMessageList && 'input-tool-btn__icon--translucent',
            ]"
          >
            <up-icon name="photo" size="20" :color="upThemeVar('--up-content-color', '#606266')"></up-icon>
          </view>
        </view>

        <view class="input-tool-btn" @click="handleChooseFiles">
          <view
            :class="[
              'input-tool-btn__icon',
              translucentMessageList && 'input-tool-btn__icon--translucent',
            ]"
          >
            <up-icon name="file-text" size="20" :color="upThemeVar('--up-content-color', '#606266')"></up-icon>
          </view>
        </view>

        <view
          :class="['input-tool-btn', composerPanelMode === 'quick_reply' && 'input-tool-btn--active']"
          @click="toggleComposerPanel('quick_reply')"
        >
          <view
            :class="[
              'input-tool-btn__icon',
              translucentMessageList && 'input-tool-btn__icon--translucent',
            ]"
          >
            <up-icon name="share" size="20" :color="upThemeVar('--up-content-color', '#606266')"></up-icon>
          </view>
        </view>

        <view
          :class="['input-tool-btn', composerPanelMode === 'config' && 'input-tool-btn--active']"
          @click="toggleComposerPanel('config')"
        >
          <view
            :class="[
              'input-tool-btn__icon',
              translucentMessageList && 'input-tool-btn__icon--translucent',
            ]"
          >
            <up-icon name="setting" size="20" :color="upThemeVar('--up-content-color', '#606266')"></up-icon>
          </view>
        </view>

        <view
          class="input-tool-btn input-tool-btn--danger"
          :class="{ 'input-tool-btn--disabled': !canStopSession || stoppingSession }"
          @click.stop="confirmStopSession()"
        >
          <view
            :class="[
              'input-tool-btn__icon',
              translucentMessageList && 'input-tool-btn__icon--translucent',
            ]"
          >
            <up-loading-icon
              v-if="stoppingSession"
              mode="circle"
              size="16"
              color="#f56c6c"
            ></up-loading-icon>
            <view v-else class="input-tool-btn__stop-mark"></view>
          </view>
        </view>
      </view>

      <view
        v-if="showComposerPanel"
        :class="[
          'composer-panel',
          translucentMessageList && 'composer-panel--translucent',
        ]"
      >
        <view
          v-if="composerPanelMode === 'quick_reply'"
          class="composer-panel__body composer-panel__body--quick"
        >
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
                  v-for="value in modelOption?.kind.options || []"
                  :key="value.value"
                  :class="[
                    'config-chip',
                    detailAgentConfig.selectedValues[modelOption?.id || ''] === value.value && 'config-chip--active',
                  ]"
                  @click.stop="selectDetailConfigValue(modelOption?.id || '', value.value)"
                >
                  <text class="config-chip__title">{{ value.name }}</text>
                </view>
              </view>
            </view>

            <view class="composer-panel__section">
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
                  v-for="value in reasoningOption?.kind.options || []"
                  :key="value.value"
                  :class="[
                    'config-chip',
                    detailAgentConfig.selectedValues[reasoningOption?.id || ''] === value.value && 'config-chip--active',
                  ]"
                  @click.stop="selectDetailConfigValue(reasoningOption?.id || '', value.value)"
                >
                  <text class="config-chip__title">{{ value.name }}</text>
                </view>
              </view>
            </view>

            <view class="composer-panel__section">
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
                  v-for="value in permissionOption?.kind.options || []"
                  :key="value.value"
                  :class="[
                    'config-chip',
                    detailAgentConfig.selectedValues[permissionOption?.id || ''] === value.value && 'config-chip--active',
                  ]"
                  @click.stop="selectDetailConfigValue(permissionOption?.id || '', value.value)"
                >
                  <text class="config-chip__title">{{ value.name }}</text>
                </view>
              </view>
            </view>
          </view>
        </scroll-view>
      </view>

      <view v-if="showRuntimeRetryFeedback" class="input-feedback input-feedback--floating input-feedback--retry">
        <up-loading-icon mode="circle" size="14" color="#fa8c16"></up-loading-icon>
        <text class="input-feedback__text">{{ runtimeRetryText }}</text>
      </view>

      <view v-if="showRuntimeErrorFeedback" class="input-feedback input-feedback--floating input-feedback--error">
        <up-icon name="close-circle-fill" size="14" color="#fa3534"></up-icon>
        <view class="input-feedback__body">
          <text class="input-feedback__label">发送失败</text>
          <text class="input-feedback__text">{{ runtimeErrorText }}</text>
        </view>
      </view>
    </template>
  </ConversationDetailBody>

    <view
      v-if="showScrollToBottomFab"
      class="scroll-bottom-fab"
      @click="handleScrollToBottomFab"
    >
      <up-icon name="arrow-down" size="18" color="#ffffff"></up-icon>
      <view v-if="hasUnreadBelow" class="scroll-bottom-fab__dot"></view>
    </view>

    <up-popup v-model:show="showPlanDrawer" mode="bottom" :round="20">
      <view class="plan-drawer" :style="cyberPanelStyle">
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
import { computed, getCurrentInstance, nextTick, ref, watch, type StyleValue } from "vue"
import { acpApi } from "@/api/acp"
import MessageBubble from "@/components/MessageBubble.vue"
import { createGateway, type RelaySessionInfo } from "@/services/gateway"
import { getDirectToken } from "@/services/gateway/directTokenStore"
import { getRegisteredRemoteInstanceDescriptor } from "@/services/realtime/remoteInstanceRegistry"
import type { RemoteInstanceDescriptor } from "@/services/realtime/types"
import { useAuthStore } from "@/stores/auth"
import { useConversationRuntimeStore } from "@/stores/conversationRuntime"
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
import { touchHotConversation } from "@/services/conversation/hotConversationCoordinator"
import {
  applyMentionReference,
  buildMentionReferenceGroups,
  resolveMentionTrigger,
  type MentionAgentSource,
  type MentionCommitSource,
  type MentionFileSource,
  type MentionReferenceGroup,
  type MentionReferenceItem,
  type MentionReferenceKind,
  type MentionSessionSource,
  type MentionTriggerState,
} from "@/services/composerReferences"
import {
  countConversationTurns,
  getNewestTurns,
  getOlderTurns,
} from "@/services/db/repositories/conversationRepository"
import { toErrorMessage } from "@/services/gateway/error"
import { getRemoteGitLog } from "@/services/projectGit"
import { getRemoteProjectFileTree, type ProjectFileNode } from "@/services/projectFiles"
import { loadRemoteProjectConversations } from "@/services/projectSessions"
import type { AgentOptionsSnapshot, PendingQuestionState, PermissionRequest, QuestionAnswer } from "@/types/acp"
import ConversationDetailBody from "./ConversationDetailBody.vue"
import type { CyberEffectPhase, DetailThemeId } from "./detailCyberMode"
import { buildRenderMessageItems } from "./detailMessagePresentation"
import {
  firstString,
  getTurnContentParts,
  mapPersistedTurnToMessage,
  normalizeAgentType,
  normalizeList,
  type QueuedDraft,
  type UploadedAttachment,
} from "./detailDataNormalization"
import {
  createComposerDraft,
  createStandaloneDraft,
  hasPromptActuallyStarted as hasPromptStarted,
} from "./detailDraftQueue"
import {
  buildDraftSendPayload,
  buildPromptStartWatchSignature,
  findLatestOptimisticTurnId,
  isQueuedPromptResponse,
  sendPromptWithConnectionRecovery,
  resolveDraftSendFailure,
  resolvePromptStartSnapshotOutcome,
  resolvePromptStartTimeoutFailure,
  resolvePromptStartWatchOutcome,
  type SendAttemptResult,
} from "./detailPromptSend"
import {
  formatTokenCountK,
  isStoppableRuntimeStatus,
} from "./detailRuntimePresentation"
import {
  bottomGeneratingText as resolveBottomGeneratingText,
  buildRuntimeRetryText,
  buildRuntimeStatusClass,
  buildRuntimeStatusLabel,
  waitingStateBadgeText as resolveWaitingStateBadgeText,
  waitingStateDescription as resolveWaitingStateDescription,
  waitingStateFootnote as resolveWaitingStateFootnote,
  waitingStateTitle as resolveWaitingStateTitle,
} from "./detailStatusPresentation"
import {
  buildPlanFilterItems,
  buildPlanTasks,
  taskStatusLabel,
  type PlanTask,
  type PlanTaskFilter,
} from "./detailPlanPresentation"
import {
  detailAgentConfigSelectionPayload,
  detailConfigOptionSummary,
  detailPermissionSummary,
  nextExpandedConfigKey,
  withSelectedDetailConfigValue,
  withSelectedDetailMode,
} from "./detailComposerPresentation"
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
  bottomAnchorId,
  getOldestCursorFromPersistedTurns,
  messageAnchorId as buildMessageAnchorId,
  resolveNearBottomState,
  resolveRenderAnchorId,
  type HistoryPageCursor,
} from "./detailScrollState"
import { resolveDetailContentFallbackPresentation } from "./detailContentFallbackPresentation"
import {
  applySlashCommandText,
  filterSlashCommands,
  resolveSlashState,
  resolveSlashTriggerKey,
  slashCommandDescription,
  type SlashCommandItem,
} from "./detailSlashCommands"

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

interface DetailProjectEntry {
  id: number
  path: string
}

type ComposerPanelMode = "" | "quick_reply" | "config"

const props = defineProps<{
  conversationId: number
  folderId: number
  agentType?: string
  instanceKey?: string
  active?: boolean
  messageListPageStyle?: StyleValue
  messageListContentStyle?: StyleValue
  inputWrapStyle?: StyleValue
  translucentMessageList?: boolean
  slashCommands?: SlashCommandItem[]
  uploadTarget?: { url: string; header: Record<string, string> } | null
  detailTheme?: DetailThemeId
  cyberEffectPhase?: CyberEffectPhase
  initialLoading?: boolean
  loadErrorMessage?: string
}>()

const emit = defineEmits<{
  (event: "layout-change"): void
  (event: "reload"): void
}>()

const auth = useAuthStore()
const runtime = useConversationRuntimeStore()
const currentInstance = getCurrentInstance()
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const cyberPanelStyle = computed(() =>
  props.detailTheme === "matrix"
    ? {
        background: "rgba(0, 12, 4, 0.98)",
        backgroundColor: "rgba(0, 12, 4, 0.98)",
        borderColor: "rgba(0, 255, 65, 0.24)",
        color: "#baffc8",
      }
    : upThemeCardStyle.value
)

const PROMPT_START_TIMEOUT_MS = 4000
const HISTORY_LOADING_MIN_MS = 480
const quickReplyItems = [
  { label: "yes", value: "yes" },
  { label: "继续", value: "继续" },
  { label: "1", value: "1" },
  { label: "2", value: "2" },
  { label: "A", value: "A" },
  { label: "B", value: "B" },
  { label: "C", value: "C" },
]

const inputText = ref("")
const composerCursor = ref<number | null>(null)
const dismissedSlashTriggerKey = ref("")
const mentionTrigger = ref<MentionTriggerState | null>(null)
const mentionFiles = ref<MentionFileSource[]>([])
const mentionAgents = ref<MentionAgentSource[]>([])
const mentionSessions = ref<MentionSessionSource[]>([])
const mentionCommits = ref<MentionCommitSource[]>([])
const mentionSourceStatus = ref<"idle" | "loading" | "ready" | "error">("idle")
const mentionSourceError = ref("")
const mentionSourceKey = ref("")
const attachments = ref<UploadedAttachment[]>([])
const uploadQueue = ref<UploadQueueItem[]>([])
const uploadingCount = ref(0)
const sending = ref(false)
const stoppingSession = ref(false)
const toolRowExpanded = ref(false)
const detailProjectEntries = ref<DetailProjectEntry[]>([])
const expandedConfigKey = ref<ComposerConfigKey>("")
const detailAgentConfig = ref<DetailAgentConfigState>(createEmptyDetailAgentConfigState())
const messageScrollTop = ref(0)
const messageScrollIntoView = ref("")
const messageScrollWithAnimation = ref(false)
const shouldAutoFollowBottom = ref(true)
const hasUnreadBelow = ref(false)
const pageScrollTop = ref(0)
const lastMeasuredScrollTop = ref(0)
const anchorMessageId = ref("")
const loadingOlder = ref(false)
const initialHistoryLoading = ref(false)
const hasMoreHistory = ref(false)
const oldestLoadedCursor = ref<HistoryPageCursor | null>(null)
const questionSubmitting = ref(false)
const permissionSubmitting = ref(false)
const pendingPermissionSubmittingOptionId = ref("")
const askQuestionSelections = ref<Record<string, QuestionSelectionState>>({})
const sequence = ref(0)
const showPlanDrawer = ref(false)
const planStatusFilter = ref<PlanTaskFilter>("all")
let syncedHistoryConversationId = 0
let syncedHistoryLocalTurnCount = -1
let historySyncToken = 0
let initialHistoryLoadingConversationId = 0
let initialHistoryLoadingToken = 0
let initialHistoryResolvedConversationId = 0
let preservingHistoryAnchor = false
let detailAgentProbeToken = 0
let detailProjectEntriesToken = 0
let mentionSourceLoadToken = 0

const normalizedAgentType = computed(() => normalizeAgentType(props.agentType))
const detailProjectPath = computed(() => {
  const matched = detailProjectEntries.value.find((item) => Number(item?.id || 0) === Number(props.folderId || 0))
  return String(matched?.path || "").trim()
})
const detailAgentConfigContextKey = computed(() =>
  buildAgentConfigContextKey(
    firstString(props.instanceKey) || "anonymous",
    normalizedAgentType.value,
    detailProjectPath.value,
    Number(props.conversationId || 0) || null
  )
)
const session = computed(() => runtime.getOrCreateSession(Number(props.conversationId || 0)))
const messages = computed(() => runtime.getMessages(Number(props.conversationId || 0)))
const renderMessageItems = computed(() => buildRenderMessageItems(messages.value))
const stats = computed(() => session.value.stats || {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  turnCount: 0,
})
const runtimeStatus = computed(() => String(session.value.status || "idle"))
const runtimeErrorText = computed(() => firstString(session.value.inputErrorMessage) || "")
const runtimeRetryText = computed(() => buildRuntimeRetryText(session.value.apiRetry))
const showRuntimeRetryFeedback = computed(() => Boolean(runtimeRetryText.value))
const showRuntimeErrorFeedback = computed(() => Boolean(runtimeErrorText.value))
const pendingPermissionCard = computed<PermissionRequest | null>(() => session.value.pendingPermission || null)
const pendingQuestionCard = computed<PendingQuestionState | null>(() => session.value.pendingQuestion || null)
const pendingPermissionDescription = computed(() =>
  pendingPermissionCard.value?.description || "智能体请求继续当前操作"
)
const pendingPermissionDescriptionParts = computed(() =>
  splitPermissionDescription(pendingPermissionDescription.value)
)
const pendingPermissionTextParts = computed(() => pendingPermissionDescriptionParts.value.textParts)
const pendingPermissionCommandBlock = computed(() => pendingPermissionDescriptionParts.value.commandBlock)
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
const showWaitingResponseState = computed(() =>
  renderMessageItems.value.length === 0 &&
  (isActiveWaitingRuntime.value || hasPendingInteraction.value)
)
const contentFallbackPresentation = computed(() =>
  resolveDetailContentFallbackPresentation({
    hasRenderedMessages: renderMessageItems.value.length > 0,
    isWaitingForRuntime: showWaitingResponseState.value,
    initialLoading: Boolean(props.initialLoading),
    loadErrorMessage: props.loadErrorMessage,
  })
)
const showBottomGeneratingIndicator = computed(() =>
  renderMessageItems.value.length > 0 &&
  !hasPendingInteraction.value &&
  (runtimeStatus.value === "thinking" || runtimeStatus.value === "running_tool")
)
const bottomGeneratingText = computed(() =>
  resolveBottomGeneratingText(runtimeStatus.value, "")
)
const waitingStateBadgeText = computed(() => resolveWaitingStateBadgeText(runtimeStatus.value))
const waitingStateTitle = computed(() => resolveWaitingStateTitle(runtimeStatus.value))
const waitingStateDescription = computed(() => resolveWaitingStateDescription(runtimeStatus.value))
const waitingStateFootnote = computed(() =>
  resolveWaitingStateFootnote({
    showWaitingResponseState: showWaitingResponseState.value,
    runtimeStatus: runtimeStatus.value,
    longWaitElapsedMs: 0,
  })
)
const planTasks = computed<PlanTask[]>(() =>
  buildPlanTasks({
    messages: messages.value,
    liveContent: session.value.liveMessage?.content || [],
  })
)
const completedTaskCount = computed(() =>
  planTasks.value.filter((task) => task.status === "completed").length
)
const filteredPlanTasks = computed(() => {
  if (planStatusFilter.value === "all") return planTasks.value
  return planTasks.value.filter((task) => task.status === planStatusFilter.value)
})
const planFilterItems = computed(() => buildPlanFilterItems(planTasks.value))
const runtimeStatusLabel = computed(() =>
  buildRuntimeStatusLabel({
    detailStatusCode: runtimeStatus.value === "idle" ? "idle" : (runtimeStatus.value as any),
    runtimeStatus: runtimeStatus.value,
    activeModelStatusLabel: "",
  })
)
const inputStatusText = computed(() => runtimeStatusLabel.value || "空闲")
const runtimeStatusClass = computed(() =>
  buildRuntimeStatusClass({
    detailStatusCode: runtimeStatus.value === "idle" ? "idle" : (runtimeStatus.value as any),
    runtimeStatus: runtimeStatus.value,
  })
)
const canStopSession = computed(() => isStoppableRuntimeStatus(runtimeStatus.value))
const canSendSharedLive = computed(() => runtime.canSend(Number(props.conversationId || 0)))
const canSend = computed(() => Boolean(inputText.value.trim() || attachments.value.length > 0))
const slashState = computed(() => resolveSlashState(inputText.value || ""))
const slashTriggerKey = computed(() => resolveSlashTriggerKey(inputText.value || ""))
const filteredSlashCommands = computed(() =>
  filterSlashCommands(props.slashCommands || [], slashState.value)
)
const showSlashPanel = computed(() =>
  Boolean(
    slashState.value.visible &&
    filteredSlashCommands.value.length > 0 &&
    slashTriggerKey.value &&
    dismissedSlashTriggerKey.value !== slashTriggerKey.value
  )
)
const composerCursorProp = computed(() =>
  composerCursor.value == null ? undefined : composerCursor.value
)
const mentionReferenceGroups = computed<MentionReferenceGroup[]>(() =>
  buildMentionReferenceGroups({
    query: mentionTrigger.value?.query || "",
    projectPath: detailProjectPath.value,
    files: mentionFiles.value,
    agents: mentionAgents.value,
    sessions: mentionSessions.value,
    commits: mentionCommits.value,
  })
)
const mentionVisibleGroups = computed(() =>
  mentionReferenceGroups.value.filter((group) => group.items.length > 0)
)
const mentionResultCount = computed(() =>
  mentionVisibleGroups.value.reduce((total, group) => total + group.items.length, 0)
)
const showMentionPanel = computed(() => Boolean(mentionTrigger.value))
const mentionPanelHint = computed(() => {
  if (mentionSourceStatus.value === "loading") return "正在搜索引用..."
  if (mentionSourceStatus.value === "error") return mentionSourceError.value || "引用加载失败"
  if (mentionResultCount.value === 0) return "没有匹配的引用"
  return mentionTrigger.value?.query ? `匹配 ${mentionResultCount.value} 项` : "选择要引用的上下文"
})
const composerPanelMode = ref<ComposerPanelMode>("")
const showComposerPanel = computed(() => composerPanelMode.value !== "")
const showInputToolRow = computed(() => toolRowExpanded.value || showComposerPanel.value)
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
const isBusyForSend = computed(() =>
  sending.value ||
  runtimeStatus.value === "thinking" ||
  runtimeStatus.value === "running_tool" ||
  runtimeStatus.value === "waiting_permission" ||
  runtimeStatus.value === "waiting_question"
)
const questionAnsweredCount = computed(() => {
  const pending = pendingQuestionCard.value
  if (!pending) return 0
  return pending.questions.filter((question) => isQuestionAnswered(question.id)).length
})
const questionSubmitReady = computed(() => {
  const pending = pendingQuestionCard.value
  return Boolean(pending && pending.questions.length > 0 && questionAnsweredCount.value === pending.questions.length)
})
const historyStatusBusy = computed(() => loadingOlder.value || initialHistoryLoading.value)
const historyStatusText = computed(() => {
  if (loadingOlder.value) return "历史加载中..."
  if (messages.value.length > 0 && initialHistoryLoading.value) return "初始历史加载中..."
  if (messages.value.length > 0 && hasMoreHistory.value) return "上滑加载更早消息"
  if (messages.value.length > 0 && !hasMoreHistory.value) return "没有更多历史了"
  return ""
})
const showScrollToBottomFab = computed(() =>
  Boolean(props.active && renderMessageItems.value.length > 0 && !shouldAutoFollowBottom.value)
)
const bottomAnchorIdValue = computed(() => bottomAnchorId(props.conversationId))

watch(
  () => pendingQuestionCard.value?.question_id || "",
  () => {
    askQuestionSelections.value = createQuestionSelectionState(pendingQuestionCard.value)
  },
  { immediate: true }
)

watch(
  () => renderMessageItems.value.map((item) => ({
    id: item.anchorId,
    role: item.message.role,
    status: item.message.status,
    content: JSON.stringify(item.message.content || []),
  })),
  (nextMessages, prevMessages) => {
    const latest = nextMessages[nextMessages.length - 1]
    const previousLatest = prevMessages?.[prevMessages.length - 1]
    const hasAssistantDelta =
      latest?.role === "assistant" &&
      (!!latest?.content && latest.content !== previousLatest?.content || latest?.id !== previousLatest?.id)
    if (!shouldAutoFollowBottom.value && hasAssistantDelta) {
      hasUnreadBelow.value = true
    }
    if (preservingHistoryAnchor) return
    scheduleViewportSync()
  }
)

watch(
  () => [
    slashState.value.visible,
    filteredSlashCommands.value.length,
    showSlashPanel.value,
    props.slashCommands?.length || 0,
  ] as const,
  () => {
    scheduleViewportSync()
  }
)

watch(
  () => slashTriggerKey.value,
  (triggerKey) => {
    if (!triggerKey) {
      dismissedSlashTriggerKey.value = ""
    }
  },
  { immediate: true }
)

watch(
  () => [inputText.value, composerCursor.value] as const,
  () => {
    syncMentionTrigger()
  }
)

watch(
  () => [
    firstString(props.instanceKey),
    firstString(session.value.connectionId),
    Number(props.folderId || 0),
    detailProjectPath.value,
  ] as const,
  () => {
    clearMentionSources()
    if (mentionTrigger.value) {
      void ensureMentionSourcesLoaded()
    }
  }
)

watch(
  () => [
    mentionTrigger.value?.query || "",
    mentionSourceStatus.value,
    mentionResultCount.value,
  ] as const,
  () => {
    scheduleViewportSync()
  }
)

watch(
  () => props.active,
  (active) => {
    if (active) {
      scheduleViewportSync()
    }
  },
  { immediate: true }
)

watch(
  () => [firstString(props.instanceKey), Number(props.folderId || 0), Boolean(props.active)] as const,
  ([, , active]) => {
    if (!active) return
    void loadDetailProjectEntries()
  },
  { immediate: true }
)

watch(
  () => [
    Number(props.conversationId || 0),
    normalizedAgentType.value,
    firstString(session.value.connectionId),
    detailProjectPath.value,
    Boolean(props.active),
  ] as const,
  ([conversationId, agentType, , , active]) => {
    if (!conversationId || !agentType || !active) return
    void loadDetailAgentConfig()
  },
  { immediate: true }
)

watch(
  () => Number(props.conversationId || 0),
  (conversationId) => {
    resetInitialHistoryLoading(conversationId)
  },
  { immediate: true }
)

watch(
  () => [
    Number(props.conversationId || 0),
    Boolean(props.active),
    session.value.localTurns.length,
  ] as const,
  ([conversationId, active]) => {
    if (!conversationId || !active) return
    void ensureHistoryCursorFromLoadedMessages()
  },
  { immediate: true }
)

function createLocalId(prefix: string): string {
  sequence.value += 1
  return `${prefix}-${Date.now()}-${sequence.value}`
}

function messageAnchorId(messageId: string) {
  return buildMessageAnchorId(messageId, props.conversationId)
}

function setProgrammaticAnchor(messageId: string) {
  anchorMessageId.value = messageId
  messageScrollWithAnimation.value = false
  messageScrollIntoView.value = messageAnchorId(messageId)
}

function resolveDetailDescriptor(): RemoteInstanceDescriptor {
  const instanceKey = firstString(props.instanceKey)
  if (instanceKey) {
    const registered = getRegisteredRemoteInstanceDescriptor(instanceKey)
    if (registered) return registered
  }
  return auth.currentRemoteInstance()
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

async function loadDetailProjectEntries() {
  if (!Number(props.folderId || 0)) {
    detailProjectEntries.value = []
    return
  }

  const token = ++detailProjectEntriesToken
  try {
    const gateway = await getDetailGateway()
    const foldersRaw = await gateway.call<unknown>("list_open_folder_details")
    if (token !== detailProjectEntriesToken) return
    detailProjectEntries.value = normalizeList(foldersRaw).map((item: any) => ({
      id: Number(item?.id || 0),
      path: String(item?.path || "").trim(),
    }))
  } catch (error) {
    if (token !== detailProjectEntriesToken) return
    console.warn("load detail pane project entries failed", error)
    detailProjectEntries.value = []
  }
}

async function loadDetailAgentConfig() {
  if (!Number(props.conversationId || 0) || !normalizedAgentType.value) {
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
      agentType: normalizedAgentType.value,
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
    console.warn("load detail pane agent config failed", error)
    detailAgentConfig.value = {
      ...createEmptyDetailAgentConfigState("读取失败，将使用远端默认配置"),
      status: "failed",
    }
  }
}

function persistDetailAgentConfigSelection() {
  persistAgentConfigSelection(
    detailAgentConfigContextKey.value,
    detailAgentConfigSelectionPayload(detailAgentConfig.value)
  )
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
  scheduleViewportSync()
}

async function selectDetailMode(modeId: string) {
  if (!modeId) return
  const conn = firstString(session.value.connectionId)
  if (!conn) {
    detailAgentConfig.value = withSelectedDetailMode(detailAgentConfig.value, modeId)
    persistDetailAgentConfigSelection()
    return
  }
  try {
    await acpApi.acpSetMode(conn, modeId)
    detailAgentConfig.value = withSelectedDetailMode(detailAgentConfig.value, modeId)
    persistDetailAgentConfigSelection()
  } catch (error) {
    uni.showToast({ title: `模型切换失败: ${toErrorMessage(error)}`, icon: "none" })
  }
}

async function selectDetailConfigValue(configId: string, valueId: string) {
  if (!configId || !valueId) return
  const conn = firstString(session.value.connectionId)
  if (!conn) {
    detailAgentConfig.value = withSelectedDetailConfigValue({
      state: detailAgentConfig.value,
      configId,
      valueId,
    })
    persistDetailAgentConfigSelection()
    return
  }
  try {
    await acpApi.acpSetConfigOption(conn, configId, valueId)
    detailAgentConfig.value = withSelectedDetailConfigValue({
      state: detailAgentConfig.value,
      configId,
      valueId,
    })
    persistDetailAgentConfigSelection()
  } catch (error) {
    uni.showToast({ title: `配置切换失败: ${toErrorMessage(error)}`, icon: "none" })
  }
}

function scrollToBottom(force = false) {
  if (!renderMessageItems.value.length) return
  if (!force && !shouldAutoFollowBottom.value) return
  shouldAutoFollowBottom.value = true
  hasUnreadBelow.value = false
  anchorMessageId.value = ""
  messageScrollWithAnimation.value = !force
  messageScrollTop.value = Number.MAX_SAFE_INTEGER
  const targetId = bottomAnchorIdValue.value
  if (messageScrollIntoView.value === targetId) {
    messageScrollIntoView.value = ""
    nextTick(() => {
      messageScrollTop.value = Number.MAX_SAFE_INTEGER
      messageScrollIntoView.value = targetId
    })
    return
  }
  messageScrollIntoView.value = targetId
}

function scheduleViewportSync(forceBottom = false) {
  nextTick(() => {
    emit("layout-change")
    if (forceBottom || shouldAutoFollowBottom.value) {
      scrollToBottom(true)
      return
    }
    messageScrollWithAnimation.value = false
    messageScrollIntoView.value = ""
    messageScrollTop.value = lastMeasuredScrollTop.value
  })
}

function handleComposerLayoutChange() {
  scheduleViewportSync()
}

function handleComposerInput(event: unknown) {
  const nextValue = resolveComposerInputValue(event)
  if (nextValue != null && nextValue !== inputText.value) {
    inputText.value = nextValue
  }
  const cursor = resolveComposerInputCursor(event)
  composerCursor.value = typeof cursor === "number" && Number.isFinite(cursor)
    ? cursor
    : (nextValue ?? inputText.value).length
  syncMentionTrigger()
}

function handleComposerBlur(event: unknown) {
  const cursor = resolveComposerInputCursor(event)
  if (typeof cursor === "number" && Number.isFinite(cursor)) {
    composerCursor.value = cursor
  }
}

function resolveComposerInputValue(event: unknown): string | null {
  if (typeof event === "string") return event
  const detailValue = (event as { detail?: { value?: unknown } })?.detail?.value
  if (typeof detailValue === "string") return detailValue
  const targetValue = (event as { target?: { value?: unknown } })?.target?.value
  return typeof targetValue === "string" ? targetValue : null
}

function resolveComposerInputCursor(event: unknown): number | null {
  const detail = (event as { detail?: unknown })?.detail
  if (typeof detail === "number") return detail
  const cursor = (detail as { cursor?: unknown } | undefined)?.cursor
  return typeof cursor === "number" && Number.isFinite(cursor) ? cursor : null
}

function syncMentionTrigger() {
  mentionTrigger.value = resolveMentionTrigger(inputText.value || "", composerCursor.value)
  if (mentionTrigger.value) {
    void ensureMentionSourcesLoaded()
  }
}

function closeMentionPanel() {
  mentionTrigger.value = null
}

function clearMentionSources() {
  mentionFiles.value = []
  mentionAgents.value = []
  mentionSessions.value = []
  mentionCommits.value = []
  mentionSourceStatus.value = "idle"
  mentionSourceError.value = ""
  mentionSourceKey.value = ""
}

function currentMentionSourceKey() {
  return JSON.stringify([
    firstString(props.instanceKey),
    firstString(session.value.connectionId),
    Number(props.folderId || 0),
    detailProjectPath.value,
  ])
}

async function ensureMentionSourcesLoaded() {
  const key = currentMentionSourceKey()
  if (mentionSourceStatus.value === "ready" && mentionSourceKey.value === key) return
  if (mentionSourceStatus.value === "loading" && mentionSourceKey.value === key) return

  const token = ++mentionSourceLoadToken
  mentionSourceKey.value = key
  mentionSourceStatus.value = "loading"
  mentionSourceError.value = ""

  try {
    const gateway = await getDetailGateway()
    const projectPath = detailProjectPath.value
    const activeFolderId = Number(props.folderId || 0)

    const [files, agents, sessions, commits] = await Promise.all([
      loadMentionFiles(gateway, projectPath),
      loadMentionAgents(gateway),
      loadMentionSessions(gateway, activeFolderId),
      loadMentionCommits(gateway, projectPath),
    ])

    if (token !== mentionSourceLoadToken) return
    mentionFiles.value = files
    mentionAgents.value = agents
    mentionSessions.value = sessions
    mentionCommits.value = commits
    mentionSourceStatus.value = "ready"
  } catch (error) {
    if (token !== mentionSourceLoadToken) return
    mentionSourceStatus.value = "error"
    mentionSourceError.value = toErrorMessage(error, "引用加载失败")
  }
}

async function loadMentionFiles(gateway: Awaited<ReturnType<typeof getDetailGateway>>, projectPath: string) {
  if (!projectPath) return []
  try {
    const tree = await getRemoteProjectFileTree(gateway, projectPath, 6)
    return flattenMentionFileTree(tree)
  } catch (error) {
    console.warn("load mention files skipped", error)
    return []
  }
}

async function loadMentionAgents(gateway: Awaited<ReturnType<typeof getDetailGateway>>) {
  try {
    const raw = await gateway.call<unknown>("acp_list_agents", {})
    return normalizeList(raw) as MentionAgentSource[]
  } catch (error) {
    console.warn("load mention agents skipped", error)
    return []
  }
}

async function loadMentionSessions(gateway: Awaited<ReturnType<typeof getDetailGateway>>, activeFolderId: number) {
  if (!activeFolderId) return []
  try {
    const sessions = await loadRemoteProjectConversations(gateway, activeFolderId)
    return sessions.map((item) => ({
      id: item.id,
      title: item.title,
      agentType: item.agentType,
      status: item.status,
    }))
  } catch (error) {
    console.warn("load mention sessions skipped", error)
    return []
  }
}

async function loadMentionCommits(gateway: Awaited<ReturnType<typeof getDetailGateway>>, projectPath: string) {
  if (!projectPath) return []
  try {
    const result = await getRemoteGitLog(gateway, projectPath)
    return result.entries as MentionCommitSource[]
  } catch (error) {
    console.warn("load mention commits skipped", error)
    return []
  }
}

function flattenMentionFileTree(nodes: ProjectFileNode[]): MentionFileSource[] {
  const items: MentionFileSource[] = []
  const walk = (node: ProjectFileNode) => {
    items.push({
      name: node.name,
      path: node.path,
      kind: node.kind === "directory" ? "directory" : "file",
    })
    node.children.forEach(walk)
  }
  nodes.forEach(walk)
  return items
}

function insertMentionReference(item: MentionReferenceItem) {
  const trigger = mentionTrigger.value || resolveMentionTrigger(inputText.value || "", composerCursor.value)
  if (!trigger) return
  const result = applyMentionReference(inputText.value || "", trigger, item)
  inputText.value = result.text
  composerCursor.value = result.cursor
  closeMentionPanel()
  nextTick(() => {
    composerCursor.value = result.cursor
    handleComposerLayoutChange()
  })
}

function mentionKindShortLabel(kind: MentionReferenceKind) {
  if (kind === "agent") return "AI"
  if (kind === "file") return "F"
  if (kind === "session") return "S"
  return "G"
}

function resolveMessageListViewportHeight() {
  const style = props.messageListPageStyle as { height?: string | number } | undefined
  const rawHeight = style?.height
  const height = typeof rawHeight === "number"
    ? rawHeight
    : Number.parseFloat(String(rawHeight || "0"))
  return Number.isFinite(height) ? Math.max(0, height) : 0
}

function handleMessageListScroll(event: any) {
  const scrollTopValue = Math.max(0, Number(event?.detail?.scrollTop || 0))
  const scrollHeight = Math.max(0, Number(event?.detail?.scrollHeight || 0))
  const deltaY = Number(event?.detail?.deltaY || 0)
  const currentViewportHeight = Math.max(0, Number(event?.detail?.height || 0))
  pageScrollTop.value = scrollTopValue
  lastMeasuredScrollTop.value = scrollTopValue
  const nearBottomState = resolveNearBottomState({
    scrollTop: scrollTopValue,
    scrollHeight,
    viewportHeight: currentViewportHeight,
    fallbackViewportHeight: resolveMessageListViewportHeight(),
  })
  if (nearBottomState.canMeasure) {
    shouldAutoFollowBottom.value = nearBottomState.nearBottom
    if (shouldAutoFollowBottom.value) {
      hasUnreadBelow.value = false
      const tail = renderMessageItems.value[renderMessageItems.value.length - 1]
      anchorMessageId.value = tail?.anchorId || ""
    }
  }
  if (deltaY < 0 && scrollTopValue <= 120) {
    void loadOlderTurns()
  }
}

function handleMessageListScrollUpper() {
  void loadOlderTurns()
}

function handleScrollToBottomFab() {
  shouldAutoFollowBottom.value = true
  hasUnreadBelow.value = false
  anchorMessageId.value = ""
  scrollToBottom(true)
}

function beginInitialHistoryLoading(conversationId: number, token: number) {
  if (!conversationId || initialHistoryResolvedConversationId === conversationId) return
  initialHistoryLoadingConversationId = conversationId
  initialHistoryLoadingToken = token
  initialHistoryLoading.value = true
}

function finishInitialHistoryLoading(conversationId: number, token: number) {
  if (
    Number(props.conversationId || 0) !== conversationId ||
    initialHistoryLoadingConversationId !== conversationId ||
    initialHistoryLoadingToken !== token
  ) {
    return
  }

  initialHistoryResolvedConversationId = conversationId
  initialHistoryLoading.value = false
}

function resetInitialHistoryLoading(conversationId: number) {
  initialHistoryLoadingConversationId = conversationId
  initialHistoryLoadingToken = 0
  initialHistoryResolvedConversationId = 0
  initialHistoryLoading.value = false
}

async function ensureHistoryCursorFromLoadedMessages(force = false) {
  const targetConversationId = Number(props.conversationId || 0)
  const loadedTurnCount = session.value.localTurns.length
  if (!targetConversationId || loadedTurnCount <= 0) {
    oldestLoadedCursor.value = null
    hasMoreHistory.value = false
    syncedHistoryConversationId = targetConversationId
    syncedHistoryLocalTurnCount = loadedTurnCount
    resetInitialHistoryLoading(targetConversationId)
    return
  }

  if (
    !force &&
    syncedHistoryConversationId === targetConversationId &&
    syncedHistoryLocalTurnCount === loadedTurnCount
  ) {
    return
  }

  const token = ++historySyncToken
  beginInitialHistoryLoading(targetConversationId, token)
  try {
    const [totalTurnCount, newestTurns] = await Promise.all([
      countConversationTurns(targetConversationId),
      getNewestTurns(targetConversationId, loadedTurnCount),
    ])
    if (token !== historySyncToken || Number(props.conversationId || 0) !== targetConversationId) return

    oldestLoadedCursor.value = getOldestCursorFromPersistedTurns(newestTurns)
    hasMoreHistory.value = totalTurnCount > newestTurns.length
    syncedHistoryConversationId = targetConversationId
    syncedHistoryLocalTurnCount = loadedTurnCount
  } catch (error) {
    console.warn("sync history cursor skipped", error)
    if (token === historySyncToken && Number(props.conversationId || 0) === targetConversationId) {
      oldestLoadedCursor.value = null
      hasMoreHistory.value = false
    }
  } finally {
    finishInitialHistoryLoading(targetConversationId, token)
  }
}

async function loadOlderTurns() {
  if (loadingOlder.value) return
  const targetConversationId = Number(props.conversationId || 0)
  if (!targetConversationId) return
  loadingOlder.value = true
  const startedAt = Date.now()
  try {
    await ensureHistoryCursorFromLoadedMessages()
    if (!hasMoreHistory.value || oldestLoadedCursor.value == null) return

    const older = await getOlderTurns(targetConversationId, oldestLoadedCursor.value, 20)
    if (older.length === 0) {
      hasMoreHistory.value = false
      return
    }

    const runtimeSession = runtime.getOrCreateSession(targetConversationId)
    const firstVisibleMessageId = resolveRenderAnchorId({
      messageId: messages.value[0]?.id || anchorMessageId.value || "",
      items: renderMessageItems.value,
    })

    preservingHistoryAnchor = true
    runtimeSession.localTurns = [
      ...older.slice().reverse().map(mapPersistedTurnToMessage),
      ...runtimeSession.localTurns,
    ]
    oldestLoadedCursor.value = getOldestCursorFromPersistedTurns(older)

    if (firstVisibleMessageId) {
      nextTick(() => {
        setProgrammaticAnchor(firstVisibleMessageId)
        preservingHistoryAnchor = false
      })
    } else {
      preservingHistoryAnchor = false
    }

    const totalTurnCount = await countConversationTurns(targetConversationId)
    hasMoreHistory.value = totalTurnCount > runtimeSession.localTurns.length
    syncedHistoryConversationId = targetConversationId
    syncedHistoryLocalTurnCount = runtimeSession.localTurns.length
  } catch (error) {
    console.warn("load older turns skipped", error)
    hasMoreHistory.value = false
    preservingHistoryAnchor = false
  } finally {
    const elapsed = Date.now() - startedAt
    if (elapsed < HISTORY_LOADING_MIN_MS) {
      await new Promise((resolve) => setTimeout(resolve, HISTORY_LOADING_MIN_MS - elapsed))
    }
    loadingOlder.value = false
  }
}

function toggleInputToolRow() {
  toolRowExpanded.value = !toolRowExpanded.value
  if (!toolRowExpanded.value) {
    composerPanelMode.value = ""
    expandedConfigKey.value = ""
  }
  scheduleViewportSync()
}

function toggleComposerPanel(mode: ComposerPanelMode) {
  toolRowExpanded.value = true
  const nextMode = composerPanelMode.value === mode ? "" : mode
  composerPanelMode.value = nextMode
  if (!composerPanelMode.value) {
    toolRowExpanded.value = false
  }
  if (nextMode !== "config") {
    expandedConfigKey.value = ""
  }
  scheduleViewportSync()
}

function getSlashCommandDesc(item: SlashCommandItem) {
  return slashCommandDescription(item)
}

function dismissSlashPanel() {
  if (!slashTriggerKey.value) return
  dismissedSlashTriggerKey.value = slashTriggerKey.value
  scheduleViewportSync()
}

function applySlashCommand(item: SlashCommandItem) {
  dismissedSlashTriggerKey.value = ""
  inputText.value = applySlashCommandText(inputText.value || "", item)
  scheduleViewportSync()
}

function createDraftFromComposer(): QueuedDraft | null {
  const draft = createComposerDraft({
    text: inputText.value,
    attachments: attachments.value,
    createId: createLocalId,
  })
  if (!draft) return null
  inputText.value = ""
  composerCursor.value = null
  closeMentionPanel()
  attachments.value = []
  return draft
}

async function sendQuickReply(text: string) {
  if (!canSendSharedLive.value) {
    showSharedLiveBlockedToast()
    return
  }
  const draft = createStandaloneDraft({
    text,
    createId: createLocalId,
  })
  if (!draft) return
  toolRowExpanded.value = false
  composerPanelMode.value = ""
  expandedConfigKey.value = ""
  await sendDraft(draft)
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
  await sendDraft(draft)
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

async function ensureConversationReadyForSend(resumeSessionId?: string) {
  const existingConnectionId = firstString(session.value.connectionId)
  if (existingConnectionId) return existingConnectionId
  const recovered = await runtime.connect(
    Number(props.conversationId || 0),
    normalizedAgentType.value || "claude_code",
    undefined,
    resumeSessionId,
    session.value.lastAppliedSeq ?? undefined,
    firstString(props.instanceKey) || undefined
  )
  return firstString(recovered?.id, session.value.connectionId) || ""
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
    touchHotConversation(Number(props.conversationId || 0))
    const conn = await ensureConversationReadyForSend()
    if (!conn) throw new Error("未连接到代理")

    const preparedDraft = await prepareDraftForSend(draft)
    const payload = buildDraftSendPayload(preparedDraft)
    const optimisticTurnId = runtime.addOptimisticUserMessage(
      Number(props.conversationId || 0),
      payload.optimisticText,
      payload.imageAttachments.map(stripTransientAttachmentData)
    )
    scheduleViewportSync(true)

    const { connectionId: promptConnectionId, response: promptResponse } =
      await sendPromptWithConnectionRecovery({
        connectionId: conn,
        send: (connectionId) => acpApi.acpPrompt(
          connectionId,
          payload.blocks,
          Number(props.folderId || 0),
          Number(props.conversationId || 0)
        ),
        reconnect: async (staleConnectionId) => {
          const managed = runtime.getManagedConversation(Number(props.conversationId || 0))
          const resumeSessionId = firstString(
            managed?.externalId,
            managed?.connection.sessionId
          )
          runtime.invalidateConnection(Number(props.conversationId || 0), staleConnectionId)
          return await ensureConversationReadyForSend(resumeSessionId || undefined)
        },
      })
    if (isQueuedPromptResponse(promptResponse)) {
      runtime.removeOptimisticUserMessage(Number(props.conversationId || 0), optimisticTurnId)
      runtime.clearLiveMessage(Number(props.conversationId || 0))
      runtime.handleEventForConversation(Number(props.conversationId || 0), {
        connectionId: promptConnectionId,
        type: "turn_queued",
        data: promptResponse,
      } as any)
      usePetStore().addExp("user", 5)
      return true
    }

    const started = await waitForPromptStart(draft)
    if (!started.started) {
      runtime.removeOptimisticUserMessage(Number(props.conversationId || 0), optimisticTurnId)
      runtime.clearLiveMessage(Number(props.conversationId || 0))
      const failure = resolveDraftSendFailure({
        startedResult: started,
        fallbackMessage: "请求已发出，但智能体未开始处理",
      })
      draft.status = failure.status
      draft.error = failure.error
      runtime.setSessionError(Number(props.conversationId || 0), failure.error)
      uni.showToast({ title: failure.toastTitle, icon: "none", duration: 3000 })
      return false
    }

    runtime.setSessionError(Number(props.conversationId || 0), null)
    runtime.beginPlaceholderThinking(Number(props.conversationId || 0))
    usePetStore().addExp("user", 5)
    return true
  } catch (error) {
    const latestOptimisticTurnId = findLatestOptimisticTurnId(session.value.optimisticTurns || [])
    if (latestOptimisticTurnId) {
      runtime.removeOptimisticUserMessage(Number(props.conversationId || 0), latestOptimisticTurnId)
    }
    runtime.clearLiveMessage(Number(props.conversationId || 0))
    const message = toErrorMessage(error)
    const failure = resolveDraftSendFailure({ errorMessage: message })
    draft.status = failure.status
    draft.error = failure.error
    runtime.setSessionError(Number(props.conversationId || 0), failure.error)
    uni.showToast({ title: failure.toastTitle, icon: "none", duration: 3000 })
    return false
  } finally {
    sending.value = false
  }
}

function hasPromptActuallyStarted() {
  return hasPromptStarted({
    status: session.value.status,
    liveContentLength: session.value.liveMessage?.content.length || 0,
  })
}

async function waitForPromptStart(draft: QueuedDraft): Promise<SendAttemptResult> {
  if (hasPromptActuallyStarted()) return { started: true }

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
        if (outcome) finish(outcome)
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
  try {
    const snapshot = await acpApi.acpGetSessionSnapshotByConversation(Number(props.conversationId || 0))
    if (!snapshot || typeof snapshot !== "object") return false
    runtime.hydrateLiveSnapshot(Number(props.conversationId || 0), snapshot)
    touchHotConversation(Number(props.conversationId || 0))
    return hasPromptActuallyStarted()
  } catch {
    return false
  }
}

function confirmStopSession() {
  if (!canStopSession.value || stoppingSession.value) return
  uni.showModal({
    title: "停止当前会话？",
    content: "当前回复会被中断，停止后仍可继续发送消息。",
    confirmText: "停止会话",
    cancelText: "继续等待",
    success: (result) => {
      if (!result.confirm) return
      void stopCurrentSession()
    },
  })
}

function handleChooseImages() {
  chooseImages()
}

function handleChooseFiles() {
  chooseFiles()
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
      scheduleViewportSync()
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
  const target = props.uploadTarget
  if (!target?.url) {
    throw new Error("附件上传地址不可用")
  }
  const connectionId = firstString(session.value.connectionId) || ""
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

function removeAttachment(index: number) {
  attachments.value.splice(index, 1)
  scheduleViewportSync()
}

async function stopCurrentSession() {
  const conn = firstString(session.value.connectionId)
  if (stoppingSession.value) return
  if (!conn) {
    uni.showToast({ title: "当前会话连接不可用，无法停止", icon: "none" })
    return
  }

  stoppingSession.value = true
  try {
    await acpApi.acpCancel(conn)
    uni.showToast({ title: "已停止", icon: "success" })
  } catch (error) {
    uni.showToast({
      title: toErrorMessage(error, "停止失败"),
      icon: "none",
    })
  } finally {
    stoppingSession.value = false
  }
}

async function regenerateLastMessage() {
  const lastUserMessage = [...messages.value].reverse().find((item) => item.role === "user")
  if (!lastUserMessage) return
  const textContent = getTurnContentParts(lastUserMessage).find((part) => part.type === "text")
  if (textContent?.text) {
    inputText.value = textContent.text
    await sendMessage()
  }
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
  const conn = firstString(session.value.connectionId)
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
    runtime.clearPendingQuestion(Number(props.conversationId || 0), pending.question_id)
    usePetStore().addExp("user", declined ? 2 : 8)
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
  const conn = firstString(session.value.connectionId)
  if (!pending?.id || !conn) {
    uni.showToast({ title: "授权请求信息不完整", icon: "none" })
    return
  }

  permissionSubmitting.value = true
  pendingPermissionSubmittingOptionId.value = optionId
  try {
    await acpApi.acpRespondPermission(conn, pending.id, optionId)
    runtime.clearPendingPermission(Number(props.conversationId || 0), pending.id)
    usePetStore().addExp("user", 8)
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

function showSharedLiveBlockedToast() {
  uni.showToast({
    title: "该会话正在其他端处理中，当前仅可旁观，待本轮结束后可发送",
    icon: "none",
    duration: 3000,
  })
}
</script>

<style scoped lang="scss">
@import "./index.scss";

.detail-interactive-pane {
  position: relative;
  height: 100%;
  min-height: 100%;
  overflow: hidden;
}

.detail-interactive-pane--cyber:not(.detail-interactive-pane--cyber-active) :deep(*) {
  animation: none !important;
  transition: none !important;
}

.input-tool-btn--text {
  min-width: 58rpx;
  padding: 0 14rpx;
}

.input-tool-btn__label {
  font-size: 24rpx;
  color: var(--up-content-color, #606266);
  font-weight: 600;
}
</style>
