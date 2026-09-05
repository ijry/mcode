<template>
  <view
    :class="[
      'detail-interactive-pane',
      detailTheme !== 'default' &&
        `detail-interactive-pane--theme-${detailTheme}`,
      detailTheme === 'matrix' && 'detail-interactive-pane--cyber',
      detailTheme === 'matrix' &&
        active &&
        'detail-interactive-pane--cyber-active',
      detailTheme === 'matrix' &&
        active &&
        `detail-interactive-pane--${cyberEffectPhase || 'idle'}`,
      detailTheme === 'sweet' &&
        `detail-interactive-pane--sweet-${cyberEffectPhase || 'idle'}`,
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
      :refresher-enabled="
        Boolean(active && (historyIndicator.canPull || historyRefresherActive))
      "
      :refresher-triggered="historyRefresherTriggered"
      :refresher-threshold="HISTORY_REFRESHER_THRESHOLD"
      :detail-theme="detailTheme"
      :cyber-effect-phase="active ? cyberEffectPhase : 'idle'"
      :cyber-active="Boolean(detailTheme === 'matrix' && active)"
      :runtime-status-class="runtimeStatusClass"
      :runtime-status="runtimeStatus"
      @message-scroll="handleMessageListScroll"
      @message-scroll-upper="handleMessageListScrollUpper"
      @refresher-refresh="handleHistoryRefresherRefresh"
      @refresher-pulling="handleHistoryRefresherPulling"
      @refresher-restore="handleHistoryRefresherSettled"
      @refresher-abort="handleHistoryRefresherSettled"
    >
      <template #history>
        <view
          v-if="historyIndicator.visible"
          :class="[
            'history-status',
            `history-status--${historyIndicator.code}`,
            historyIndicator.retryable && 'history-status--retryable',
          ]"
          @click="handleHistoryIndicatorTap"
        >
          <up-loading-icon
            v-if="historyIndicator.busy"
            mode="circle"
            size="16"
            :color="upThemeVar('--up-tips-color', '#909193')"
          ></up-loading-icon>
          <up-icon
            v-else-if="historyIndicator.retryable"
            name="reload"
            size="13"
            :color="upThemeVar('--up-warning', '#f9ae3d')"
          ></up-icon>
          <text class="history-status__text">{{ historyIndicator.text }}</text>
        </view>
      </template>

      <template #content>
        <view
          v-if="showWaitingResponseState"
          class="empty-messages empty-messages--pending"
        >
          <view
            :class="[
              'pending-response-card',
              translucentMessageList && 'pending-response-card--translucent',
            ]"
          >
            <view class="pending-response-card__pulse"></view>
            <view class="pending-response-card__badge">
              <view class="pending-response-card__badge-dot"></view>
              <text class="pending-response-card__badge-text">{{
                waitingStateBadgeText
              }}</text>
            </view>
            <text class="pending-response-card__title">{{
              waitingStateTitle
            }}</text>
            <text class="pending-response-card__desc">{{
              waitingStateDescription
            }}</text>
            <text
              v-if="waitingStateFootnote"
              class="pending-response-card__footnote"
            >
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
          <text class="empty-messages__fallback-desc">{{
            contentFallbackPresentation.message
          }}</text>
          <view class="empty-messages__fallback-action" @click="emit('reload')"
            >重新加载</view
          >
        </view>

        <view
          v-else-if="contentFallbackPresentation.code === 'empty'"
          class="empty-messages"
        >
          <up-empty
            mode="message"
            text="这是一个新会话，暂时还没有消息"
          ></up-empty>
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
            :showRegenerate="
              index === renderMessageItems.length - 1 &&
              item.message.role === 'assistant'
            "
            :translucent="translucentMessageList"
            :detail-theme="detailTheme"
            :cyber-effect-phase="active ? (cyberEffectPhase || 'idle') : 'idle'"
            :cyber-active="Boolean(detailTheme === 'matrix' && active)"
            :subagent-transcripts="subagentTranscripts"
            @regenerate="regenerateLastMessage"
          />
        </view>

        <view v-if="stats.totalTokens > 0" class="stats-bar">
          <up-icon
            name="file-text"
            size="14"
            :color="upThemeVar('--up-light-color', '#c0c4cc')"
          ></up-icon>
          <text class="stats-text">
            输入 {{ formatTokenCountK(stats.inputTokens) }} / 输出
            {{ formatTokenCountK(stats.outputTokens) }} / 总计
            {{ formatTokenCountK(stats.totalTokens) }}
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
            <text class="bottom-generating__subtitle">{{
              bottomGeneratingText
            }}</text>
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
        <!--
          传输层横幅：断线 / 重连中 / replay 丢帧 / agent 进程没了 / 刚恢复。
          外壳把状态算好传进来（见 `transportBanner` prop）。此前这条链算好了却没有任何
          消费者 —— 手机上完全看不到断线，只能靠「怎么半天没反应」自己猜。
          运行时错误与重试条仍在 composer 那一侧，两处不重叠（`buildTransportBanner` 只放行传输层码）。
        -->
        <view
          v-if="props.transportBanner"
          :class="[
            'transport-banner',
            `transport-banner--${props.transportBanner.severity}`,
          ]"
        >
          <view class="transport-banner__row">
            <up-loading-icon
              v-if="props.transportBanner.loading"
              mode="circle"
              size="14"
              :color="props.transportBanner.iconColor"
            ></up-loading-icon>
            <up-icon
              v-else
              :name="props.transportBanner.icon"
              size="14"
              :color="props.transportBanner.iconColor"
            ></up-icon>
            <text class="transport-banner__text">{{ props.transportBanner.text }}</text>
            <view
              v-if="props.transportBanner.actionKey"
              class="transport-banner__action"
              @click.stop="emit('status-action', props.transportBanner.actionKey)"
            >
              <text class="transport-banner__action-text">{{
                props.transportBanner.actionLabel || "重试"
              }}</text>
            </view>
            <view
              v-if="props.transportBanner.details"
              class="transport-banner__toggle"
              @click.stop="showTransportBannerDetails = !showTransportBannerDetails"
            >
              <text class="transport-banner__toggle-text">{{
                showTransportBannerDetails ? "收起" : "详情"
              }}</text>
            </view>
          </view>
          <!-- stderr 尾巴可能几十行，默认折叠。 -->
          <scroll-view
            v-if="props.transportBanner.details && showTransportBannerDetails"
            scroll-y
            class="transport-banner__details"
          >
            <text class="transport-banner__details-text">{{
              props.transportBanner.details
            }}</text>
          </scroll-view>
        </view>

        <view
          class="input-status-row"
          :class="[
            `input-status-row--${runtimeStatusClass}`,
            runtimeStatus === 'thinking' && 'input-status-row--thinking',
            runtimeStatus === 'running_tool' && 'input-status-row--running-tool',
          ]"
        >
          <view class="input-status-row__main">
            <view
              class="runtime-dot runtime-dot--compact"
              :class="`runtime-dot--${runtimeStatusClass}`"
            ></view>
            <text class="input-status-row__text">{{ inputStatusText }}</text>
            <ConversationDetailRunElapsed
              v-if="showRunElapsed"
              :started-at="runElapsedStartedAt"
              :paused="!active"
            />
          </view>
          <view
            v-if="planTasks.length > 0"
            class="input-status-row__plan"
            @click.stop="showPlanDrawer = true"
          >
            <up-icon
              name="list"
              size="13"
              :color="upThemeVar('--up-primary', '#2979ff')"
            ></up-icon>
            <text class="input-status-row__plan-text"
              >计划 {{ completedTaskCount }}/{{ planTasks.length }}</text
            >
          </view>
          <!--
            后台任务胶囊。与「计划」并列而不是塞进状态文案里：它是可点开的入口，
            而状态文案是一行只读文字。
          -->
          <view
            v-if="backgroundSummary.visible"
            class="input-status-row__background"
            @click.stop="showBackgroundDrawer = true"
          >
            <up-icon
              name="reload"
              size="13"
              :color="upThemeVar('--up-warning', '#f9ae3d')"
            ></up-icon>
            <text class="input-status-row__background-text">{{
              backgroundSummary.chipLabel
            }}</text>
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
            <!--
              「这条之后还排着几条」。服务端一直在 `permission_request.queued` 里带着它，
              此前客户端读到即弃 —— 于是用户批完一条才发现还有下一条，无法预估要点几次。
            -->
            <text
              v-if="permissionQueueDepth > 0"
              class="permission-card__queued"
              >还有 {{ permissionQueueDepth }} 条待授权</text
            >
          </view>
          <view
            v-if="pendingPermissionTextParts.length > 0"
            class="permission-card__desc"
          >
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
              <text class="permission-card__command-text">{{
                pendingPermissionCommandBlock
              }}</text>
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
                  'permission-card__action--loading':
                    permissionSubmitting &&
                    pendingPermissionSubmittingOptionId === option.id,
                }"
                :disabled="permissionSubmitting"
                @click="respondToPermission(option.id)"
              >
                {{
                  permissionSubmitting &&
                  pendingPermissionSubmittingOptionId === option.id
                    ? "提交中..."
                    : option.label
                }}
              </button>
              <text
                v-if="option.description"
                class="permission-card__option-desc"
              >
                {{ option.description }}
              </text>
            </view>
          </view>
          <text v-else class="permission-card__empty"
            >当前授权请求没有可用选项</text
          >
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
              <text class="ask-question-card__subtitle"
                >选择后点击提交，也可以跳过让智能体自行判断</text
              >
            </view>
            <text
              v-if="pendingQuestionCard.questions.length > 1"
              class="ask-question-card__counter"
            >
              {{ questionAnsweredCount }}/{{
                pendingQuestionCard.questions.length
              }}
            </text>
          </view>

          <!--
            多问题分栏。此前是全部问题竖排铺开，四个问题就是一屏放不下的长卡片，
            用户得反复上下滚动才能看清自己漏了哪一题。改成一次只显示一题，
            对齐 codeg-plus 桌面端（单问题不分栏）。
          -->
          <up-tabs
            v-if="questionUsesTabs"
            v-model:current="askQuestionTabIndex"
            :list="questionTabItems"
            keyName="title"
            :scrollable="false"
            lineWidth="24"
            :activeStyle="{
              color: upThemeVar('--up-primary', '#2979ff'),
              fontWeight: '600',
            }"
            :inactiveStyle="{ color: upThemeVar('--up-content-color', '#606266') }"
          ></up-tabs>

          <view
            v-for="question in visibleQuestions"
            :key="question.id"
            class="ask-question-card__question"
          >
            <view class="ask-question-card__question-head">
              <text class="ask-question-card__chip">{{
                question.multi_select ? "多选" : "单选"
              }}</text>
              <!-- 分栏时 header 已经是 tab 标签了，这里再显示一遍是重复。 -->
              <text
                v-if="!questionUsesTabs"
                class="ask-question-card__header-text"
                >{{ question.header }}</text
              >
            </view>
            <text class="ask-question-card__prompt">{{
              question.question
            }}</text>

            <view class="ask-question-card__options">
              <view
                v-for="option in question.options"
                :key="option.label"
                :class="[
                  'ask-question-option',
                  isQuestionOptionSelected(question.id, option.label) &&
                    'ask-question-option--active',
                  questionSubmitting && 'ask-question-option--disabled',
                ]"
                @click="
                  !questionSubmitting &&
                  toggleQuestionOption(question, option.label)
                "
              >
                <view class="ask-question-option__control">
                  <view
                    :class="[
                      question.multi_select
                        ? 'ask-question-option__checkbox'
                        : 'ask-question-option__radio',
                      isQuestionOptionSelected(question.id, option.label) &&
                        'ask-question-option__control--active',
                    ]"
                  >
                    <text
                      v-if="isQuestionOptionSelected(question.id, option.label)"
                      class="ask-question-option__mark"
                      >✓</text
                    >
                  </view>
                </view>
                <view class="ask-question-option__body">
                  <view class="ask-question-option__title-row">
                    <text class="ask-question-option__title">{{
                      questionLabelText(option.label)
                    }}</text>
                    <text
                      v-if="isQuestionRecommended(option.label)"
                      class="ask-question-option__recommended"
                      >推荐</text
                    >
                  </view>
                  <text
                    v-if="option.description"
                    class="ask-question-option__desc"
                    >{{ option.description }}</text
                  >
                </view>
              </view>

              <view
                :class="[
                  'ask-question-option',
                  isQuestionOtherActive(question.id) &&
                    'ask-question-option--active',
                  questionSubmitting && 'ask-question-option--disabled',
                ]"
                @click="!questionSubmitting && toggleQuestionOther(question)"
              >
                <view class="ask-question-option__control">
                  <view
                    :class="[
                      question.multi_select
                        ? 'ask-question-option__checkbox'
                        : 'ask-question-option__radio',
                      isQuestionOtherActive(question.id) &&
                        'ask-question-option__control--active',
                    ]"
                  >
                    <text
                      v-if="isQuestionOtherActive(question.id)"
                      class="ask-question-option__mark"
                      >✓</text
                    >
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
            <!--
              「下一题」只在还有后续 tab 时出现。单选点完会自动跳，所以它主要服务
              多选和「其他」那两种不自动跳的情形 —— 那时用户需要一个明确的前进入口，
              否则只能去点上方的 tab 栏。
            -->
            <button
              v-if="questionUsesTabs && askQuestionTabIndex < questionTabItems.length - 1"
              class="ask-question-card__next"
              :disabled="questionSubmitting"
              @click="askQuestionTabIndex = askQuestionTabIndex + 1"
            >
              下一题
            </button>
            <button
              class="ask-question-card__submit"
              :class="{
                'ask-question-card__submit--disabled':
                  !questionSubmitReady || questionSubmitting,
              }"
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
            <up-icon
              name="close"
              size="13"
              :color="upThemeVar('--up-tips-color', '#909193')"
            ></up-icon>
          </view>
          <scroll-view scroll-y class="slash-panel__scroll">
            <view
              v-for="item in filteredSlashCommands"
              :key="item.key"
              class="slash-item"
              @click="applySlashCommand(item)"
            >
              <view class="slash-item__left">
                <text class="slash-item__key">{{ item.key }}</text>
              </view>
              <text class="slash-item__desc">{{
                getSlashCommandDesc(item)
              }}</text>
            </view>
          </scroll-view>
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
            <text class="mention-panel__state-text">{{
              mentionSourceError || "引用加载失败"
            }}</text>
          </view>
          <view
            v-else-if="mentionResultCount === 0"
            class="mention-panel__state"
          >
            <text class="mention-panel__state-text"
              >继续输入以过滤文件、会话、提交或智能体</text
            >
          </view>
          <template v-else>
            <up-tabs
              :current="activeMentionTabIndex"
              :list="mentionTabItems"
              keyName="title"
              :scrollable="false"
              lineWidth="24"
              :activeStyle="{
                color: upThemeVar('--up-primary', '#2979ff'),
                fontWeight: '600',
              }"
              :inactiveStyle="{ color: upThemeVar('--up-tips-color', '#909193') }"
              @change="handleMentionTabChange"
            ></up-tabs>

            <view
              v-if="!activeMentionGroup || activeMentionGroup.items.length === 0"
              class="mention-panel__state"
            >
              <text class="mention-panel__state-text"
                >这一组没有匹配项，换个关键词或切到其他分组</text
              >
            </view>
            <scroll-view v-else scroll-y class="mention-panel__scroll">
              <view class="mention-panel__body">
                <view
                  v-for="item in activeMentionGroup.items"
                  :key="`${activeMentionGroup.kind}:${item.id}`"
                  class="mention-item"
                  @click="insertMentionReference(item)"
                >
                  <view
                    :class="[
                      'mention-item__badge',
                      `mention-item__badge--${item.kind}`,
                    ]"
                  >
                    <text>{{ mentionKindShortLabel(item.kind) }}</text>
                  </view>
                  <view class="mention-item__body">
                    <text class="mention-item__label u-line-1">{{
                      item.label
                    }}</text>
                    <text
                      v-if="item.detail"
                      class="mention-item__detail u-line-1"
                      >{{ item.detail }}</text
                    >
                  </view>
                </view>
                <text
                  v-if="activeMentionGroup.truncated"
                  class="mention-group__more"
                >
                  结果较多，继续输入可缩小范围
                </text>
              </view>
            </scroll-view>
          </template>
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
              <text
                v-if="item.status === 'uploading'"
                class="upload-queue__status"
              >
                {{ item.progress }}%
              </text>
              <text
                v-else-if="item.status === 'success'"
                class="upload-queue__status upload-queue__status--success"
              >
                已上传
              </text>
              <text
                v-else
                class="upload-queue__status upload-queue__status--error"
              >
                失败
              </text>
            </view>
          </view>
        </view>

        <view
          v-if="showFeedbackNotes"
          :class="[
            'feedback-notes',
            translucentMessageList && 'feedback-notes--translucent',
          ]"
        >
          <view
            v-for="note in feedbackNotes"
            :key="note.id"
            class="feedback-notes__item"
          >
            <view class="feedback-notes__left">
              <up-icon
                :name="note.status === 'delivered' ? 'checkmark' : 'clock'"
                size="14"
                :color="
                  note.status === 'delivered'
                    ? '#19be6b'
                    : upThemeVar('--up-tips-color', '#909193')
                "
              ></up-icon>
              <text class="feedback-notes__text">{{ note.text }}</text>
            </view>
            <text
              :class="[
                'feedback-notes__status',
                note.status === 'delivered' && 'feedback-notes__status--delivered',
              ]"
            >
              {{ feedbackNoteStatusText(note.status) }}
            </text>
          </view>
        </view>

        <view
          v-if="attachments.length > 0"
          :class="[
            'attachments-preview',
            translucentMessageList && 'attachments-preview--translucent',
          ]"
        >
          <view
            v-for="(att, index) in attachments"
            :key="att.id"
            class="attachment-item"
          >
            <image
              v-if="att.kind === 'image'"
              :src="att.url"
              mode="aspectFill"
              class="attachment-image"
            />
            <view v-else class="attachment-file">
              <up-icon
                name="file-text"
                size="16"
                :color="upThemeVar('--up-content-color', '#606266')"
              ></up-icon>
              <text class="attachment-file__name u-line-1">{{ att.name }}</text>
            </view>
            <view class="attachment-remove" @click="removeAttachment(index)">
              <up-icon name="close" size="10" color="#ffffff"></up-icon>
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
          <view
            v-else-if="composerPanelMode === 'feedback'"
            class="composer-panel__body composer-panel__body--feedback"
          >
            <view class="composer-feedback__heading">
              <text class="composer-feedback__title">实时反馈</text>
              <text class="composer-feedback__desc">{{
                realtimeFeedbackDescription
              }}</text>
            </view>
            <up-textarea
              class="composer-feedback__input"
              v-model="realtimeFeedbackText"
              :maxlength="REALTIME_FEEDBACK_MAX_CHARS"
              autoHeight
              count
              placeholder="输入备注或纠偏内容"
              :placeholder-style="'color: ' + upThemeVar('--up-tips-color', '#909193')"
              @input="handleRealtimeFeedbackInput"
              @linechange="handleComposerLayoutChange"
            ></up-textarea>
            <view class="composer-feedback__actions">
              <view
                class="composer-feedback__button composer-feedback__button--cancel"
                @click="closeRealtimeFeedbackPanel"
              >
                <text class="composer-feedback__button-text">取消</text>
              </view>
              <view
                :class="[
                  'composer-feedback__button composer-feedback__button--send',
                  !canSubmitRealtimeFeedback &&
                    'composer-feedback__button--disabled',
                ]"
                @click="submitRealtimeFeedback"
              >
                <up-loading-icon
                  v-if="realtimeFeedbackSubmitting"
                  mode="circle"
                  size="15"
                  color="#ffffff"
                ></up-loading-icon>
                <up-icon
                  v-else
                  name="arrow-up"
                  size="16"
                  color="#ffffff"
                ></up-icon>
                <text class="composer-feedback__button-text">发送</text>
              </view>
            </view>
          </view>
          <view
            v-else-if="composerPanelMode === 'config'"
            class="composer-panel__config-layout"
          >
            <view class="composer-panel__config-nav">
              <view
                v-for="item in composerConfigNavItems"
                :key="item.key"
                :class="[
                  'composer-config-nav-item',
                  activeComposerConfigKey === item.key &&
                    'composer-config-nav-item--active',
                  item.disabled && 'composer-config-nav-item--disabled',
                ]"
                @click="activateComposerConfigItem(item.key)"
              >
                <text class="composer-config-nav-item__label u-line-1">{{
                  item.label
                }}</text>
                <text class="composer-config-nav-item__summary u-line-1">{{
                  item.summary
                }}</text>
              </view>
            </view>
            <scroll-view scroll-y class="composer-panel__config-detail">
              <view
                v-if="!activeComposerConfigItem"
                class="composer-config-empty"
              >
                <text class="composer-config-empty__text">远端未提供可配置项</text>
              </view>
              <view
                v-else-if="showPermissionModeValues"
                class="composer-config-option-list"
              >
                <view
                  v-for="mode in activePermissionModes"
                  :key="mode.id"
                  :class="[
                    'composer-config-option',
                    detailAgentConfig.selectedModeId === mode.id &&
                      'composer-config-option--active',
                  ]"
                  @click.stop="selectDetailMode(mode.id)"
                >
                  <text class="composer-config-option__check">{{
                    detailAgentConfig.selectedModeId === mode.id ? "✓" : ""
                  }}</text>
                  <view class="composer-config-option__body">
                    <text class="composer-config-option__title">{{
                      mode.name
                    }}</text>
                    <text
                      v-if="mode.description"
                      class="composer-config-option__desc"
                    >
                      {{ mode.description }}
                    </text>
                  </view>
                </view>
              </view>
              <view
                v-else-if="activeConfigOption"
                class="composer-config-option-list"
              >
                <view
                  v-for="value in activeConfigValues"
                  :key="value.value"
                  :class="[
                    'composer-config-option',
                    detailAgentConfig.selectedValues[
                      activeConfigOption.id
                    ] === value.value && 'composer-config-option--active',
                  ]"
                  @click.stop="
                    selectDetailConfigValue(activeConfigOption.id, value.value)
                  "
                >
                  <text class="composer-config-option__check">{{
                    detailAgentConfig.selectedValues[activeConfigOption.id] ===
                    value.value
                      ? "✓"
                      : ""
                  }}</text>
                  <view class="composer-config-option__body">
                    <text class="composer-config-option__title">{{
                      value.name
                    }}</text>
                    <text
                      v-if="value.description"
                      class="composer-config-option__desc"
                    >
                      {{ value.description }}
                    </text>
                  </view>
                </view>
              </view>
              <view v-else class="composer-config-empty">
                <text class="composer-config-empty__text">{{
                  activeComposerConfigItem.summary
                }}</text>
              </view>
            </scroll-view>
          </view>
        </view>

        <view
          v-if="showInputToolMenu"
          class="input-tool-menu"
          :class="{
            'input-tool-menu--translucent': translucentMessageList,
          }"
        >
          <view
            class="input-tool-menu__item input-tool-menu__item--primary"
            @click="sendQuickContinue"
          >
            <up-icon
              name="play-right"
              size="18"
              :color="upThemeVar('--up-primary', '#2979ff')"
            ></up-icon>
            <text class="input-tool-menu__label">快捷继续</text>
          </view>
          <up-divider
            :hairline="true"
            :customStyle="{ margin: '6rpx 0' }"
          ></up-divider>
          <view class="input-tool-menu__item" @click="openAttachmentPicker">
            <up-icon
              name="attach"
              size="18"
              :color="upThemeVar('--up-main-color', '#303133')"
            ></up-icon>
            <text class="input-tool-menu__label">附加文件</text>
          </view>
          <view class="input-tool-menu__item" @click="openQuickReplyPanelFromMenu">
            <up-icon
              name="list-dot"
              size="18"
              :color="upThemeVar('--up-main-color', '#303133')"
            ></up-icon>
            <text class="input-tool-menu__label">快捷消息</text>
            <up-icon
              class="input-tool-menu__arrow"
              name="arrow-right"
              size="13"
              :color="upThemeVar('--up-tips-color', '#909193')"
            ></up-icon>
          </view>
          <view
            v-if="showRealtimeFeedbackMenuItem"
            class="input-tool-menu__item"
            :class="{
              'input-tool-menu__item--disabled': realtimeFeedbackMenuDisabled,
            }"
            @click="handleRealtimeFeedbackMenu"
          >
            <up-icon
              name="chat"
              size="18"
              :color="
                realtimeFeedbackMenuDisabled
                  ? upThemeVar('--up-tips-color', '#909193')
                  : upThemeVar('--up-main-color', '#303133')
              "
            ></up-icon>
            <text class="input-tool-menu__label">实时反馈</text>
          </view>
          <view class="input-tool-menu__item" @click="openConfigPanelFromMenu">
            <up-icon
              name="setting"
              size="18"
              :color="upThemeVar('--up-main-color', '#303133')"
            ></up-icon>
            <text class="input-tool-menu__label">设置</text>
            <up-icon
              class="input-tool-menu__arrow"
              name="arrow-right"
              size="13"
              :color="upThemeVar('--up-tips-color', '#909193')"
            ></up-icon>
          </view>
          <view
            class="input-tool-menu__item input-tool-menu__item--danger"
            :class="{
              'input-tool-menu__item--disabled': !canStopSession || stoppingSession,
            }"
            @click.stop="confirmStopSession()"
          >
            <view class="input-tool-menu__stop-mark"></view>
            <text class="input-tool-menu__label">停止当前会话</text>
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
              :color="
                showInputToolRow
                  ? upThemeVar('--up-primary', '#2979ff')
                  : upThemeVar('--up-content-color', '#606266')
              "
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
              :customStyle="{
                backgroundColor: 'transparent',
                background: 'transparent',
                padding: '0',
                borderColor: 'transparent',
              }"
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
              (sending || steeringIntoTurn) && 'send-btn--loading',
            ]"
            @click="sendMessage"
          >
            <up-loading-icon
              v-if="sending || steeringIntoTurn"
              color="#ffffff"
              size="20"
            ></up-loading-icon>
            <up-icon v-else name="arrow-up" size="22" color="#ffffff"></up-icon>
          </view>
        </view>

        <view
          v-if="showRuntimeRetryFeedback"
          class="input-feedback input-feedback--floating input-feedback--retry"
        >
          <up-loading-icon
            mode="circle"
            size="14"
            color="#fa8c16"
          ></up-loading-icon>
          <text class="input-feedback__text">{{ runtimeRetryText }}</text>
        </view>

        <view
          v-if="showRuntimeErrorFeedback"
          class="input-feedback input-feedback--floating input-feedback--error"
        >
          <up-icon name="close-circle-fill" size="14" color="#fa3534"></up-icon>
          <view class="input-feedback__body">
            <text class="input-feedback__label">发送失败</text>
            <text class="input-feedback__text">{{ runtimeErrorText }}</text>
          </view>
          <!-- 关闭入口是必需的：这条横幅不会自动消失（见 store 的 dismissSessionError）。 -->
          <view class="input-feedback__dismiss" @click.stop="dismissRuntimeError">
            <up-icon
              name="close"
              size="12"
              :color="upThemeVar('--up-tips-color', '#909193')"
            ></up-icon>
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
      <view
        :class="['plan-drawer', detailTheme && `plan-drawer--theme-${detailTheme}`]"
        :style="cyberPanelStyle"
      >
        <view class="plan-drawer__hd">
          <text class="plan-drawer__title">计划任务</text>
          <text class="plan-drawer__count"
            >{{ completedTaskCount }}/{{ planTasks.length }}</text
          >
        </view>

        <view class="plan-filters">
          <view
            v-for="item in planFilterItems"
            :key="item.key"
            :class="[
              'plan-filter',
              planStatusFilter === item.key && 'plan-filter--active',
            ]"
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
                :class="['plan-task__dot', `plan-task__dot--${task.status}`]"
              ></view>
            </view>
            <view class="plan-task__main">
              <text class="plan-task__subject">{{ task.subject }}</text>
              <text v-if="task.description" class="plan-task__desc">{{
                task.description
              }}</text>
            </view>
            <view
              :class="['plan-task__badge', `plan-task__badge--${task.status}`]"
            >
              {{ taskStatusLabel(task.status) }}
            </view>
          </view>

          <view class="plan-drawer__safe"></view>
        </scroll-view>
      </view>
    </up-popup>

    <!--
      后台任务抽屉。清单**只列非终态**（结算的任务立即离开，结果归时间线），
      并且要能表达「计数比清单多」——子智能体只上报数量，没有明细。
    -->
    <up-popup v-model:show="showBackgroundDrawer" mode="bottom" :round="20">
      <view
        :class="['plan-drawer', detailTheme && `plan-drawer--theme-${detailTheme}`]"
        :style="cyberPanelStyle"
      >
        <view class="plan-drawer__hd">
          <text class="plan-drawer__title">后台任务</text>
          <text class="plan-drawer__count">{{ backgroundSummary.count }}</text>
        </view>

        <scroll-view scroll-y class="plan-drawer__list">
          <view
            v-for="row in backgroundSummary.rows"
            :key="row.taskId"
            class="bg-task"
          >
            <view class="bg-task__left">
              <view
                :class="['bg-task__dot', `bg-task__dot--${row.stateClass}`]"
              ></view>
            </view>
            <view class="bg-task__main">
              <text class="bg-task__name">{{ row.name }}</text>
              <text class="bg-task__meta"
                >{{ row.typeLabel }} · {{ row.stateLabel
                }}{{ row.metaText ? ` · ${row.metaText}` : "" }}</text
              >
            </view>
            <view
              v-if="row.canStop"
              class="bg-task__stop"
              :class="
                stoppingBackgroundTaskId === row.taskId && 'bg-task__stop--busy'
              "
              @click.stop="stopBackgroundTask(row.taskId)"
            >
              <text class="bg-task__stop-text">{{
                stoppingBackgroundTaskId === row.taskId ? "停止中" : "停止"
              }}</text>
            </view>
          </view>

          <view v-if="backgroundSummary.hint" class="bg-task__hint">
            <text class="bg-task__hint-text">{{ backgroundSummary.hint }}</text>
          </view>

          <view v-if="backgroundSummary.count === 0" class="plan-empty">
            <up-empty mode="list" text="暂无后台任务"></up-empty>
          </view>

          <view class="plan-drawer__safe"></view>
        </scroll-view>
      </view>
    </up-popup>
  </view>
</template>

<script setup lang="ts">
import {
  computed,
  getCurrentInstance,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
  type StyleValue,
} from "vue";
import { acpApi } from "@/api/acp";
import MessageBubble from "@/components/MessageBubble.vue";
import { createGateway, type RelaySessionInfo } from "@/services/gateway";
import { getDirectToken } from "@/services/gateway/directTokenStore";
import { getRegisteredRemoteInstanceDescriptor } from "@/services/realtime/remoteInstanceRegistry";
import type { RemoteInstanceDescriptor } from "@/services/realtime/types";
import { useAuthStore } from "@/stores/auth";
import { useConversationRuntimeStore } from "@/stores/conversationRuntime";
import { usePetStore } from "@/stores/pet";
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
} from "@/services/conversation/composerTools";
import {
  rememberConversationSessionConfigValue,
  rememberConversationSessionMode,
} from "@/services/conversation/sessionModeMemory";
import { touchHotConversation } from "@/services/conversation/hotConversationCoordinator";
import {
  applyMentionReference,
  buildMentionReferenceGroups,
  buildMentionTabItems,
  resolveActiveMentionKind,
  resolveMentionTrigger,
  type MentionAgentSource,
  type MentionCommitSource,
  type MentionFileSource,
  type MentionReferenceGroup,
  type MentionReferenceItem,
  type MentionReferenceKind,
  type MentionSessionSource,
  type MentionTriggerState,
} from "@/services/composerReferences";
import { toErrorMessage } from "@/services/gateway/error";
import { getRemoteFeedbackSettings } from "@/services/connectionDetailSettings";
import { getRemoteGitLog } from "@/services/projectGit";
import {
  getRemoteProjectFileTree,
  type ProjectFileNode,
} from "@/services/projectFiles";
import { loadRemoteProjectConversations } from "@/services/projectSessions";
import type {
  AgentOptionsSnapshot,
  ConversationHistoryWindow,
  PendingQuestionState,
  PermissionRequest,
  QuestionAnswer,
  SessionConfigOptionInfo,
  SessionConfigOptionValueInfo,
  SessionModeInfo,
} from "@/types/acp";
import ConversationDetailBody from "./ConversationDetailBody.vue";
import ConversationDetailRunElapsed from "./ConversationDetailRunElapsed.vue";
import type { CyberEffectPhase, DetailThemeId } from "./detailCyberMode";
import { buildRenderMessageItems, findLatestUserMessage } from "./detailMessagePresentation";
import {
  advanceConversationHistoryWindow,
  buildOlderHistoryRequest,
  canApplyOlderHistoryPage,
  hasOlderConversationHistory,
  prependHistoryPageTurns,
  requireConversationTurnsPage,
} from "./detailHistoryPaging";
import { resolveDetailHistoryIndicatorPresentation } from "./detailHistoryIndicatorPresentation";
import {
  firstString,
  getTurnContentParts,
  normalizeAgentType,
  normalizeList,
  normalizeTurns,
  resolveConversationDraftRestoreState,
  sanitizeAttachmentsForPersist,
  type QueuedDraft,
  type UploadedAttachment,
} from "./detailDataNormalization";
import {
  getRuntime,
  saveDraftState,
} from "@/services/db/repositories/runtimeRepository";
import { ensureConversationSchema } from "@/services/db/migrations";
import {
  createComposerDraft,
  createStandaloneDraft,
  hasPromptActuallyStarted as hasPromptStarted,
} from "./detailDraftQueue";
import {
  buildDraftSendPayload,
  buildPromptStartWatchSignature,
  isRealtimeFeedbackMenuDisabled,
  isNoActiveTurnRejection,
  isQueuedPromptResponse,
  isTurnInProgressRejection,
  REALTIME_FEEDBACK_MAX_CHARS,
  resolveFeedbackNoteStatusLabel,
  resolveRealtimeFeedbackChannel,
  resolveRunningSendAction,
  sendPromptWithConnectionRecovery,
  resolveDraftSendFailure,
  resolvePromptStartSnapshotOutcome,
  resolvePromptStartTimeoutFailure,
  resolvePromptStartWatchOutcome,
  type RealtimeFeedbackChannel,
  resolveNoActiveTurnFeedbackFallback,
  type SendAttemptResult,
} from "./detailPromptSend";
import {
  buildTimelineTailSignature,
  formatTokenCountK,
  isAssistantTailSignature,
  isStoppableRuntimeStatus,
} from "./detailRuntimePresentation";
import { buildLiveMessageTurnId } from "@/stores/conversationTimeline";
import {
  bottomGeneratingText as resolveBottomGeneratingText,
  buildRuntimeRetryText,
  buildRuntimeStatusClass,
  buildRuntimeStatusLabel,
  shouldShowRunElapsed,
  waitingStateBadgeText as resolveWaitingStateBadgeText,
  waitingStateDescription as resolveWaitingStateDescription,
  waitingStateFootnote as resolveWaitingStateFootnote,
  waitingStateTitle as resolveWaitingStateTitle,
} from "./detailStatusPresentation";
import type { DetailStatusState } from "./detailStatusPresentation";
import {
  backgroundBusyStatusLabel,
  buildBackgroundSettledText,
  buildBackgroundTaskSummary,
  shouldShowBackgroundBusyStatus,
} from "./detailBackgroundTasks";
import {
  buildPlanFilterItems,
  buildPlanTasks,
  taskStatusLabel,
  type PlanTask,
  type PlanTaskFilter,
} from "./detailPlanPresentation";
import {
  detailAgentConfigSelectionPayload,
  detailConfigOptionSummary,
  detailPermissionSummary,
  nextExpandedConfigKey,
  withSelectedDetailConfigValue,
  withSelectedDetailMode,
} from "./detailComposerPresentation";
import {
  buildQuestionAnswer as buildPendingQuestionAnswer,
  buildQuestionTabItems,
  createQuestionSelectionState,
  isQuestionRecommended,
  isQuestionSelectionAnswered,
  questionInputValue,
  questionLabelText,
  resolveNextQuestionTabIndex,
  splitPermissionDescription,
  type QuestionSelectionState,
} from "./detailInteractionPresentation";
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
} from "./detailAttachmentUpload";
import {
  bottomAnchorId,
  messageAnchorId as buildMessageAnchorId,
  resolveNearBottomState,
  resolveRenderAnchorId,
} from "./detailScrollState";
import { resolveDetailContentFallbackPresentation } from "./detailContentFallbackPresentation";
import {
  applySlashCommandText,
  filterSlashCommands,
  resolveSlashState,
  resolveSlashTriggerKey,
  slashCommandDescription,
  type SlashCommandItem,
} from "./detailSlashCommands";

interface UploadQueueItem {
  id: string;
  name: string;
  size: number;
  type: string;
  kind: "image" | "file";
  progress: number;
  status: "uploading" | "success" | "error";
  error?: string;
}

interface DetailProjectEntry {
  id: number;
  path: string;
}

type ComposerPanelMode = "" | "quick_reply" | "feedback" | "config";
type ComposerConfigPanelKey = Exclude<ComposerConfigKey, "">;

interface ComposerConfigNavItem {
  key: ComposerConfigPanelKey;
  label: string;
  summary: string;
  disabled: boolean;
}

const props = defineProps<{
  conversationId: number;
  folderId: number;
  agentType?: string;
  instanceKey?: string;
  active?: boolean;
  messageListPageStyle?: StyleValue;
  messageListContentStyle?: StyleValue;
  inputWrapStyle?: StyleValue;
  translucentMessageList?: boolean;
  slashCommands?: SlashCommandItem[];
  uploadTarget?: { url: string; header: Record<string, string> } | null;
  detailTheme?: DetailThemeId;
  cyberEffectPhase?: CyberEffectPhase;
  initialLoading?: boolean;
  loadErrorMessage?: string;
  /**
   * 发送前的准备钩子（目前用途：确保 PC 端已经开着这个会话的 opened-tab）。
   *
   * 做成回调 prop 而不是在 pane 里重新实现一遍：它需要 gateway + descriptor +
   * `detailTabMultitaskMode` 偏好三样东西，全都归详情页所有（`getDetailGateway`
   * 依赖 `resolveDetailDescriptor` 那一整套连接解析）。在 pane 里重建等于把连接解析
   * 复制第二份 —— 那正是本轮反复踩的坑。
   *
   * 缺省时（比如别处复用这个 pane）什么都不做，所以它是可选的。
   */
  onBeforeSendPrompt?: () => Promise<void> | void;
  /**
   * 传输层横幅（桥接断开 / 重连中 / replay 丢帧 / agent 进程没了 / 刚恢复）。
   *
   * 由外壳算好传进来，而不是 pane 自己算：判据里的 `bridgeHealth`、
   * `attachElapsedMs`、`longWaitElapsedMs` 全归外壳所有（`index.vue` 的 1Hz 计时器与
   * bridge health 订阅）。pane 只负责渲染 —— 它已经拥有输入区上方那块「瞬态通知」区域，
   * 把横幅画在别处会与运行时错误/重试条互相压。
   */
  transportBanner?: DetailStatusState | null;
}>();

const emit = defineEmits<{
  (event: "layout-change"): void;
  (event: "reload"): void;
  (event: "status-action", actionKey: "reconnect" | "reconnect_agent" | "inspect"): void;
}>();

const auth = useAuthStore();
const runtime = useConversationRuntimeStore();
const currentInstance = getCurrentInstance();
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ??
  (fallbackColor || "");
const upThemeCardStyle = computed(
  () => currentInstance?.proxy?.upThemeCardStyle || {},
);
const cyberPanelStyle = computed(() =>
  props.detailTheme === "matrix"
    ? {
        background: "rgba(0, 12, 4, 0.98)",
        backgroundColor: "rgba(0, 12, 4, 0.98)",
        borderColor: "rgba(0, 255, 65, 0.24)",
        color: "#baffc8",
      }
    : upThemeCardStyle.value,
);

const PROMPT_START_TIMEOUT_MS = 4000;
// scroll-view 的 refresher-threshold 单位是 **px**（不是 rpx）—— uni 内部直接拿它和
// touchmove 的 pageY 差值比较，也直接写进 refresher 容器的 style.height。
// 45px 是 uni 的默认值，这里放宽一点，避免长列表里轻微的边缘回弹误触发整页请求。
const HISTORY_REFRESHER_THRESHOLD = 56;
const quickReplyItems = [
  { label: "yes", value: "yes" },
  { label: "继续", value: "继续" },
  { label: "1", value: "1" },
  { label: "2", value: "2" },
  { label: "A", value: "A" },
  { label: "B", value: "B" },
  { label: "C", value: "C" },
];

const inputText = ref("");
const composerCursor = ref<number | null>(null);
const dismissedSlashTriggerKey = ref("");
const mentionTrigger = ref<MentionTriggerState | null>(null);
const mentionFiles = ref<MentionFileSource[]>([]);
const mentionAgents = ref<MentionAgentSource[]>([]);
const mentionSessions = ref<MentionSessionSource[]>([]);
const mentionCommits = ref<MentionCommitSource[]>([]);
const mentionSourceStatus = ref<"idle" | "loading" | "ready" | "error">("idle");
const mentionSourceError = ref("");
const mentionSourceKey = ref("");
const attachments = ref<UploadedAttachment[]>([]);
const uploadQueue = ref<UploadQueueItem[]>([]);
const uploadingCount = ref(0);
const sending = ref(false);
// 插入当前回合在途：这条链路是「等后端确认后才清输入框」，不单独上锁的话连点两次会
// 把同一段文本注入两遍。
const steeringIntoTurn = ref(false);
const realtimeFeedbackEnabled = ref(false);
const realtimeFeedbackSettingsLoaded = ref(false);
const realtimeFeedbackText = ref("");
const realtimeFeedbackSubmitting = ref(false);
const stoppingSession = ref(false);
const toolRowExpanded = ref(false);
const detailProjectEntries = ref<DetailProjectEntry[]>([]);
const expandedConfigKey = ref<ComposerConfigKey>("");
const detailAgentConfig = ref<DetailAgentConfigState>(
  createEmptyDetailAgentConfigState(),
);
const messageScrollTop = ref(0);
const messageScrollIntoView = ref("");
const messageScrollWithAnimation = ref(false);
const shouldAutoFollowBottom = ref(true);
const hasUnreadBelow = ref(false);
const anchorMessageId = ref("");
const loadingOlder = ref(false);
const initialHistoryLoading = ref(false);
// 上一次「加载更早」的失败原因。原实现只 uni.showToast 一次 —— 吐司消失后界面上
// 再没有任何重试入口，用户只能猜。现在留在指示行里，可点重试。
const historyLoadErrorMessage = ref("");
// 下拉手势的实时距离（px），驱动「继续下拉 / 松手加载」的文案切换。
const historyPullDistance = ref(0);
// 传给 scroll-view 的 refresher-triggered。必须由我们自己置回 false，
// 否则 uni 的刷新态会一直停在 refreshing（它只在这个 prop 变 false 时收回）。
const historyRefresherTriggered = ref(false);
// 一次下拉刷新的生命周期内强制保持 refresher-enabled。见
// handleHistoryRefresherRefresh 里的长注释：uni 在 enabled 为 false 时会**丢弃**
// restore，把刷新态永久卡死。
const historyRefresherActive = ref(false);
const hasMoreHistory = computed(() =>
  hasOlderConversationHistory(session.value.historyWindow),
);
// 窗口坐标是否已建立。与 hasMoreHistory 分开传给指示器：两者都为 false 时语义完全
// 不同（「还不知道」vs「真的翻到底了」），合并成一个布尔就是用户报的
// 「刚打开显示没有更多历史，过一会又能加载」。
const historyWindowKnown = computed(() => session.value.historyWindow != null);
const questionSubmitting = ref(false);
const permissionSubmitting = ref(false);
const pendingPermissionSubmittingOptionId = ref("");
const askQuestionSelections = ref<Record<string, QuestionSelectionState>>({});
// 多问题时当前展示的 tab 下标。`up-tabs` 是下标驱动的（`v-model:current`），
// 所以这里存下标而不是 question id；需要 id 时经 questionTabItems 回查。
const askQuestionTabIndex = ref(0);
const sequence = ref(0);
const showPlanDrawer = ref(false);
const showBackgroundDrawer = ref(false);
const showTransportBannerDetails = ref(false);
/** 正在请求停止的那条任务 id。只锁按钮，不锁整张清单 —— 其它任务仍可停。 */
const stoppingBackgroundTaskId = ref<string>("");
const planStatusFilter = ref<PlanTaskFilter>("all");
let historySyncToken = 0;
let initialHistoryLoadingConversationId = 0;
let initialHistoryLoadingToken = 0;
// 前插更早历史期间挂起 scheduleViewportSync()：列表内容变化会触发下方的
// renderMessageItems watcher，若此时同步视口就会把滚动位置拽走，
// 覆盖掉 loadOlderTurns 随后要恢复的锚点。
let preservingHistoryAnchor = false;
let detailAgentProbeToken = 0;
let detailProjectEntriesToken = 0;
let realtimeFeedbackProbeToken = 0;
let mentionSourceLoadToken = 0;

const normalizedAgentType = computed(() => normalizeAgentType(props.agentType));
const detailProjectPath = computed(() => {
  const matched = detailProjectEntries.value.find(
    (item) => Number(item?.id || 0) === Number(props.folderId || 0),
  );
  return String(matched?.path || "").trim();
});
const detailAgentConfigContextKey = computed(() =>
  buildAgentConfigContextKey(
    firstString(props.instanceKey) || "anonymous",
    normalizedAgentType.value,
    detailProjectPath.value,
    Number(props.conversationId || 0) || null,
  ),
);
const session = computed(() =>
  runtime.getOrCreateSession(Number(props.conversationId || 0)),
);
const messages = computed(() =>
  runtime.getMessages(Number(props.conversationId || 0)),
);
const renderMessageItems = computed(() =>
  buildRenderMessageItems(messages.value),
);
/**
 * 时间线尾项的锚点 id，O(1)。
 *
 * 存在的理由是滚动回调：它需要「贴底时把锚点记成最后一条」，但**不能**去读
 * `renderMessageItems`（流式期间那是脏的，一读就地触发整条投影链重算，而 @scroll
 * 可达 ~60 次/秒）。这里的取值规则与 `buildRenderMessageItems` 的 `anchorId` 一致：
 * 有 live 时尾项就是那条实时轮次，否则是最后一条已落盘轮次。
 */
const timelineTailAnchorId = computed(() => {
  const current = session.value;
  const live = current.liveMessage;
  if (live) {
    return buildLiveMessageTurnId(Number(props.conversationId || 0), live);
  }
  const turns = current.localTurns || [];
  return turns[turns.length - 1]?.id || "";
});
/**
 * 子智能体实时正文，按父 tool_call id 索引。刻意**不落库**，所以只有正在流式的
 * 那一轮拿得到值；历史轮次的胶囊靠 `agent_stats` 展示，不靠这里。
 */
const subagentTranscripts = computed(() =>
  runtime.getSubagentTranscripts(Number(props.conversationId || 0)),
);
const stats = computed(
  () =>
    session.value.stats || {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      turnCount: 0,
    },
);
const runtimeStatus = computed(() => String(session.value.status || "idle"));
const runtimeErrorText = computed(
  () => firstString(session.value.inputErrorMessage) || "",
);
const runtimeRetryText = computed(() =>
  buildRuntimeRetryText(session.value.apiRetry),
);
const showRuntimeRetryFeedback = computed(() =>
  Boolean(runtimeRetryText.value),
);
const showRuntimeErrorFeedback = computed(() =>
  Boolean(runtimeErrorText.value),
);
const pendingPermissionCard = computed<PermissionRequest | null>(
  () => session.value.pendingPermission || null,
);
const pendingQuestionCard = computed<PendingQuestionState | null>(
  () => session.value.pendingQuestion || null,
);
const permissionQueueDepth = computed(() =>
  Math.max(0, Math.trunc(Number(session.value.permissionQueueDepth || 0))),
);
const pendingPermissionDescription = computed(
  () => pendingPermissionCard.value?.description || "智能体请求继续当前操作",
);
const pendingPermissionDescriptionParts = computed(() =>
  splitPermissionDescription(pendingPermissionDescription.value),
);
const pendingPermissionTextParts = computed(
  () => pendingPermissionDescriptionParts.value.textParts,
);
const pendingPermissionCommandBlock = computed(
  () => pendingPermissionDescriptionParts.value.commandBlock,
);
const hasPendingInteraction = computed(() =>
  Boolean(pendingPermissionCard.value || pendingQuestionCard.value),
);
const isActiveWaitingRuntime = computed(
  () =>
    runtimeStatus.value === "connecting" ||
    runtimeStatus.value === "thinking" ||
    runtimeStatus.value === "running_tool" ||
    runtimeStatus.value === "waiting_permission" ||
    runtimeStatus.value === "waiting_question",
);
const showWaitingResponseState = computed(
  () =>
    renderMessageItems.value.length === 0 &&
    (isActiveWaitingRuntime.value || hasPendingInteraction.value),
);
const contentFallbackPresentation = computed(() =>
  resolveDetailContentFallbackPresentation({
    hasRenderedMessages: renderMessageItems.value.length > 0,
    isWaitingForRuntime: showWaitingResponseState.value,
    initialLoading: Boolean(props.initialLoading),
    loadErrorMessage: props.loadErrorMessage,
  }),
);
const showBottomGeneratingIndicator = computed(
  () =>
    renderMessageItems.value.length > 0 &&
    !hasPendingInteraction.value &&
    (runtimeStatus.value === "thinking" ||
      runtimeStatus.value === "running_tool"),
);
const bottomGeneratingText = computed(() =>
  resolveBottomGeneratingText(runtimeStatus.value, ""),
);
const waitingStateBadgeText = computed(() =>
  resolveWaitingStateBadgeText(runtimeStatus.value),
);
const waitingStateTitle = computed(() =>
  resolveWaitingStateTitle(runtimeStatus.value),
);
const waitingStateDescription = computed(() =>
  resolveWaitingStateDescription(runtimeStatus.value),
);
const waitingStateFootnote = computed(() =>
  resolveWaitingStateFootnote({
    showWaitingResponseState: showWaitingResponseState.value,
    runtimeStatus: runtimeStatus.value,
    longWaitElapsedMs: 0,
  }),
);
const planTasks = computed<PlanTask[]>(() =>
  buildPlanTasks({
    messages: messages.value,
    liveContent: session.value.liveMessage?.content || [],
  }),
);
const completedTaskCount = computed(
  () => planTasks.value.filter((task) => task.status === "completed").length,
);
const filteredPlanTasks = computed(() => {
  if (planStatusFilter.value === "all") return planTasks.value;
  return planTasks.value.filter(
    (task) => task.status === planStatusFilter.value,
  );
});
const planFilterItems = computed(() => buildPlanFilterItems(planTasks.value));
const runtimeStatusLabel = computed(() =>
  buildRuntimeStatusLabel({
    detailStatusCode:
      runtimeStatus.value === "idle" ? "idle" : (runtimeStatus.value as any),
    runtimeStatus: runtimeStatus.value,
    activeModelStatusLabel: "",
  }),
);
// 后台任务：AIR 明细表与转录派生的计数在呈现层汇合（覆盖面不同，见 detailBackgroundTasks.ts）。
const backgroundSummary = computed(() =>
  buildBackgroundTaskSummary({
    outstanding: session.value.backgroundOutstanding,
    tasks: session.value.asyncTasks,
  }),
);
const showBackgroundBusyStatus = computed(() =>
  shouldShowBackgroundBusyStatus({
    runtimeStatus: runtimeStatus.value,
    backgroundCount: backgroundSummary.value.count,
  }),
);
// 「轮次已结束但后台还有活」是这一整块的核心信息：状态胶囊必须改口，否则用户看到
// 「已连接 / 空闲」就以为可以合电脑了，而 PC 上的后台 shell 与子智能体还在跑。
const inputStatusText = computed(() =>
  showBackgroundBusyStatus.value
    ? backgroundBusyStatusLabel(backgroundSummary.value.count)
    : runtimeStatusLabel.value || "空闲",
);
const runtimeStatusClass = computed(() =>
  // 后台有活时按 running 上色：胶囊的转圈动效延续，灰色会读作「什么都没在发生」。
  showBackgroundBusyStatus.value
    ? "running"
    : buildRuntimeStatusClass({
        detailStatusCode:
          runtimeStatus.value === "idle" ? "idle" : (runtimeStatus.value as any),
        runtimeStatus: runtimeStatus.value,
      }),
);
/**
 * 本回合起点。**取 `liveMessage.timestamp` 而不是另存一个字段** —— 它已经是这条实时
 * 轮次的时间戳：本端发起时由 `beginPlaceholderThinking` 打上 `Date.now()`，中途接入时
 * 由 `mapSnapshotLiveMessage` 从 attach 快照的 `live_message.started_at` 解析出来
 * （`stores/conversationRuntime.ts`）。与 PC 端 `LiveMessage.startedAt` 是同一个量。
 *
 * 这里不引入新的响应式依赖：pane 的渲染本来就依赖 `liveMessage`（它渲染实时气泡）。
 * 每秒推进的那个计时器关在 `ConversationDetailRunElapsed` 里，见该组件注释。
 */
const runElapsedStartedAt = computed(() =>
  Number(session.value.liveMessage?.timestamp || 0),
);
// 已运行时间只跟**当前回合**（`shouldShowRunElapsed` 只认执行/等待四态），与
// `showBackgroundBusyStatus`（轮次已结束、只剩后台任务）互斥，两者不会同时出现。
const showRunElapsed = computed(() =>
  shouldShowRunElapsed(runtimeStatus.value, runElapsedStartedAt.value),
);
const canStopSession = computed(() =>
  isStoppableRuntimeStatus(runtimeStatus.value),
);
const canSendSharedLive = computed(() =>
  runtime.canSend(Number(props.conversationId || 0)),
);
const canSend = computed(() =>
  Boolean(inputText.value.trim() || attachments.value.length > 0),
);
const slashState = computed(() => resolveSlashState(inputText.value || ""));
const slashTriggerKey = computed(() =>
  resolveSlashTriggerKey(inputText.value || ""),
);
const filteredSlashCommands = computed(() =>
  filterSlashCommands(props.slashCommands || [], slashState.value),
);
const showSlashPanel = computed(() =>
  Boolean(
    slashState.value.visible &&
    filteredSlashCommands.value.length > 0 &&
    slashTriggerKey.value &&
    dismissedSlashTriggerKey.value !== slashTriggerKey.value,
  ),
);
const composerCursorProp = computed(() =>
  composerCursor.value == null ? undefined : composerCursor.value,
);
const mentionReferenceGroups = computed<MentionReferenceGroup[]>(() =>
  buildMentionReferenceGroups({
    query: mentionTrigger.value?.query || "",
    projectPath: detailProjectPath.value,
    files: mentionFiles.value,
    agents: mentionAgents.value,
    sessions: mentionSessions.value,
    commits: mentionCommits.value,
  }),
);
const mentionVisibleGroups = computed(() =>
  mentionReferenceGroups.value.filter((group) => group.items.length > 0),
);
const mentionResultCount = computed(() =>
  mentionVisibleGroups.value.reduce(
    (total, group) => total + group.items.length,
    0,
  ),
);
// 用户亲手选的分组 kind。**记 kind 而不是 tab 下标** —— 下标是 up-tabs 的输入，身份是
// kind；混用会在分组内容变化时错位（问题分栏那次踩过，见 askQuestionTabIndex 的注释）。
// null 表示「还没点过」，此时 resolveActiveMentionKind 会帮他落到第一个有内容的组。
const pinnedMentionKind = ref<MentionReferenceKind | null>(null);
const mentionTabItems = computed(() =>
  buildMentionTabItems(mentionReferenceGroups.value),
);
const activeMentionKind = computed(() =>
  resolveActiveMentionKind(mentionReferenceGroups.value, pinnedMentionKind.value, {
    pinned: pinnedMentionKind.value != null,
  }),
);
const activeMentionTabIndex = computed(() =>
  Math.max(
    0,
    mentionTabItems.value.findIndex((item) => item.kind === activeMentionKind.value),
  ),
);
// 分栏后只渲染当前那一组 —— 这是「用 tabs 区分」的实质。
const activeMentionGroup = computed(
  () =>
    mentionReferenceGroups.value.find(
      (group) => group.kind === activeMentionKind.value,
    ) ?? null,
);
function handleMentionTabChange(payload: any) {
  const index = Number(payload?.index ?? payload);
  const item = mentionTabItems.value[index];
  // disabled 项理论上不触发 change，但 up-tabs 各版本行为不完全一致 —— 这里再挡一次，
  // 否则点空组会把用户 pin 到一个永远没内容的 tab 上。
  if (!item || item.disabled) return;
  pinnedMentionKind.value = item.kind;
}
const showMentionPanel = computed(() => Boolean(mentionTrigger.value));
const mentionPanelHint = computed(() => {
  if (mentionSourceStatus.value === "loading") return "正在搜索引用...";
  if (mentionSourceStatus.value === "error")
    return mentionSourceError.value || "引用加载失败";
  if (mentionResultCount.value === 0) return "没有匹配的引用";
  return mentionTrigger.value?.query
    ? `匹配 ${mentionResultCount.value} 项`
    : "选择要引用的上下文";
});
const composerPanelMode = ref<ComposerPanelMode>("");
const showComposerPanel = computed(() => composerPanelMode.value !== "");
const showInputToolRow = computed(
  () => toolRowExpanded.value || showComposerPanel.value,
);
const showInputToolMenu = computed(
  () => toolRowExpanded.value && !showComposerPanel.value,
);
const detailConfigProjection = computed(() =>
  projectDetailConfigOptions(detailAgentConfig.value.configOptions),
);
const modelOption = computed(() => detailConfigProjection.value.modelOption);
const reasoningOption = computed(
  () => detailConfigProjection.value.reasoningOption,
);
const permissionOption = computed(
  () => detailConfigProjection.value.permissionOption,
);
const hasModelOptions = computed(() => Boolean(modelOption.value));
const hasPermissionOptions = computed(() =>
  Boolean(
    detailAgentConfig.value.modes?.available_modes?.length ||
    permissionOption.value,
  ),
);
const modelSummary = computed(() =>
  detailConfigOptionSummary({
    status: detailAgentConfig.value.status,
    option: modelOption.value,
    selectedValues: detailAgentConfig.value.selectedValues,
    message: detailAgentConfig.value.message,
  }),
);
const reasoningSummary = computed(() =>
  detailConfigOptionSummary({
    status: detailAgentConfig.value.status,
    option: reasoningOption.value,
    selectedValues: detailAgentConfig.value.selectedValues,
    message: detailAgentConfig.value.message,
  }),
);
const permissionSummary = computed(() =>
  detailPermissionSummary({
    status: detailAgentConfig.value.status,
    state: detailAgentConfig.value,
    permissionOption: permissionOption.value,
  }),
);
const composerConfigNavItems = computed<ComposerConfigNavItem[]>(() => [
  {
    key: "permission",
    label: "Mode",
    summary: permissionSummary.value,
    disabled: !hasPermissionOptions.value,
  },
  {
    key: "model",
    label: "Model",
    summary: modelSummary.value,
    disabled: !hasModelOptions.value,
  },
  {
    key: "reasoning",
    label: "Reasoning",
    summary: reasoningSummary.value,
    disabled: !reasoningOption.value,
  },
]);
const firstAvailableComposerConfigKey = computed<ComposerConfigKey>(
  () => composerConfigNavItems.value.find((item) => !item.disabled)?.key || "",
);
const activeComposerConfigKey = computed<ComposerConfigKey>(() => {
  if (
    expandedConfigKey.value &&
    composerConfigNavItems.value.some(
      (item) => item.key === expandedConfigKey.value && !item.disabled,
    )
  ) {
    return expandedConfigKey.value;
  }
  return firstAvailableComposerConfigKey.value;
});
const activeComposerConfigItem = computed(
  () =>
    composerConfigNavItems.value.find(
      (item) => item.key === activeComposerConfigKey.value,
    ) || null,
);
const activeConfigOption = computed<SessionConfigOptionInfo | null>(() => {
  if (activeComposerConfigKey.value === "model") return modelOption.value;
  if (activeComposerConfigKey.value === "reasoning") return reasoningOption.value;
  if (activeComposerConfigKey.value === "permission") return permissionOption.value;
  return null;
});
const activeConfigValues = computed<SessionConfigOptionValueInfo[]>(() =>
  activeConfigOption.value?.kind.options || [],
);
const activePermissionModes = computed<SessionModeInfo[]>(
  () => detailAgentConfig.value.modes?.available_modes || [],
);
const showPermissionModeValues = computed(
  () =>
    activeComposerConfigKey.value === "permission" &&
    activePermissionModes.value.length > 0,
);
const isBusyForSend = computed(
  () =>
    sending.value ||
    runtimeStatus.value === "thinking" ||
    runtimeStatus.value === "running_tool" ||
    runtimeStatus.value === "waiting_permission" ||
    runtimeStatus.value === "waiting_question",
);
// Both capabilities come from the current connection snapshot. The backend
// uses the same priority when handling submit_session_feedback.
const nativeSteeringAvailable = computed(() =>
  Boolean(session.value.nativeSteeringAvailable),
);
const feedbackToolAvailable = computed(() =>
  Boolean(session.value.feedbackToolAvailable),
);
const realtimeFeedbackChannel = computed<RealtimeFeedbackChannel>(() =>
  resolveRealtimeFeedbackChannel({
    nativeSteeringAvailable: nativeSteeringAvailable.value,
    feedbackToolAvailable: feedbackToolAvailable.value,
  }),
);
const isClaudeAgentType = computed(
  () => normalizedAgentType.value === "claude_code",
);
const showRealtimeFeedbackMenuItem = computed(
  () =>
    realtimeFeedbackSettingsLoaded.value &&
    realtimeFeedbackEnabled.value,
);
const realtimeFeedbackDescription = computed(() => {
  if (isClaudeAgentType.value) {
    return "Claude 请使用输入框的当前回合插入功能。";
  }
  if (realtimeFeedbackChannel.value === "native") {
    return "备注会立即插入当前回合，智能体马上就能看到。";
  }
  return "智能体会在下次检查时读取，不会打断当前步骤。";
});
const realtimeFeedbackMenuDisabled = computed(() =>
  isRealtimeFeedbackMenuDisabled({
    agentType: normalizedAgentType.value,
    isBusy: isBusyForSend.value,
    feedbackToolAvailable: feedbackToolAvailable.value,
    nativeSteeringAvailable: nativeSteeringAvailable.value,
    hasConnection: Boolean(firstString(session.value.connectionId)),
    submitting: realtimeFeedbackSubmitting.value,
  }),
);
const canSubmitRealtimeFeedback = computed(
  () =>
    realtimeFeedbackEnabled.value &&
    !realtimeFeedbackMenuDisabled.value &&
    Boolean(realtimeFeedbackText.value.trim()),
);
// 见 `RuntimeSession.nativeSteeringAvailable` 的说明。
const feedbackNotes = computed(() => session.value.feedbackNotes || []);
// 只在**运行中**且非空时显示（桌面端同判据）。回合结束后便签仍在 store 里（要等下一轮
// user_message 才清，见那处注释），但那时它已经没有「正在影响这一轮」的含义，挂在
// 输入框上方只会挤占空间。
const showFeedbackNotes = computed(
  () => feedbackNotes.value.length > 0 && isStoppableRuntimeStatus(runtimeStatus.value),
);
const questionAnsweredCount = computed(() => {
  const pending = pendingQuestionCard.value;
  if (!pending) return 0;
  return pending.questions.filter((question) => isQuestionAnswered(question.id))
    .length;
});
const questionSubmitReady = computed(() => {
  const pending = pendingQuestionCard.value;
  return Boolean(
    pending &&
    pending.questions.length > 0 &&
    questionAnsweredCount.value === pending.questions.length,
  );
});
// 单问题**不分栏** —— 与 codeg-plus 桌面端一致。一个问题套一层 tab 只是多一次点击，
// 而且 tab 栏里只有一个标签看起来像出了错。
const questionUsesTabs = computed(
  () => (pendingQuestionCard.value?.questions.length || 0) > 1,
);
const questionTabItems = computed(() =>
  buildQuestionTabItems(pendingQuestionCard.value, askQuestionSelections.value),
);
// 分栏时只渲染当前那一题；不分栏时渲染全部（其实就是唯一那一题）。
// 这正是修掉「垂直堆叠太长」的那一步。
const visibleQuestions = computed(() => {
  const questions = pendingQuestionCard.value?.questions || [];
  if (!questionUsesTabs.value) return questions;
  const current = questions[askQuestionTabIndex.value];
  return current ? [current] : questions.slice(0, 1);
});
const historyIndicator = computed(() =>
  resolveDetailHistoryIndicatorPresentation({
    hasMessages: messages.value.length > 0,
    hasMore: hasMoreHistory.value,
    loadingOlder: loadingOlder.value,
    initialLoading: initialHistoryLoading.value,
    windowKnown: historyWindowKnown.value,
    errorMessage: historyLoadErrorMessage.value,
    pullDistance: historyPullDistance.value,
    pullThreshold: HISTORY_REFRESHER_THRESHOLD,
  }),
)
const showScrollToBottomFab = computed(() =>
  Boolean(
    props.active &&
    renderMessageItems.value.length > 0 &&
    !shouldAutoFollowBottom.value,
  ),
);
const bottomAnchorIdValue = computed(() =>
  bottomAnchorId(props.conversationId),
);

watch(
  () => pendingQuestionCard.value?.question_id || "",
  () => {
    askQuestionSelections.value = createQuestionSelectionState(
      pendingQuestionCard.value,
    );
    // 换了一组问题就回到第一题。不重置的话，上一组停在第 3 个 tab、新组只有 2 个问题时
    // 会渲染出空白（`visibleQuestions` 取不到那个下标）。
    askQuestionTabIndex.value = 0;
  },
  { immediate: true },
);

watch(
  () =>
    buildTimelineTailSignature({
      localTurns: session.value.localTurns || [],
      liveMessage: session.value.liveMessage,
    }),
  (next, previous) => {
    const hasAssistantDelta =
      isAssistantTailSignature(next) && next !== (previous || "");
    if (!shouldAutoFollowBottom.value && hasAssistantDelta) {
      hasUnreadBelow.value = true;
    }
    if (preservingHistoryAnchor) return;
    // 流式期间按 delta 触发，走节流版本：一次 sync 会 emit("layout-change") 把外壳的
    // 6 连选择器测量拉起来，紧跟着列表刚变高去测、测完又改布局输入。
    scheduleViewportSyncThrottled();
  },
);

// 后台任务结算提示。桌面端对每条 `settled[]` 弹一次 OS 通知（`lib/notification.ts`），
// mcode 没有任何通知通道（无推送、无本地通知），所以只能在页内提示 —— 至少在用户正看着
// 这条会话时，「那个跑了 20 分钟的后台任务刚回来了」不会完全无声。
//
// 依赖 `backgroundSettledSeq` 而不是数组内容：同一个 taskId 可以被 `SendMessage` 唤醒后
// 再次结算，按内容判新会漏掉第二次。
watch(
  () => session.value.backgroundSettledSeq || 0,
  (next, previous) => {
    if (!next || next === (previous || 0)) return;
    const entries = session.value.backgroundSettled || [];
    const latest = entries[entries.length - 1];
    const text = buildBackgroundSettledText(latest);
    if (!text) return;
    uni.showToast({ title: text, icon: "none", duration: 2600 });
  },
);

watch(
  () =>
    [
      slashState.value.visible,
      filteredSlashCommands.value.length,
      showSlashPanel.value,
      props.slashCommands?.length || 0,
    ] as const,
  () => {
    scheduleViewportSync();
  },
);

watch(
  () => slashTriggerKey.value,
  (triggerKey) => {
    if (!triggerKey) {
      dismissedSlashTriggerKey.value = "";
    }
  },
  { immediate: true },
);

watch(
  () => [inputText.value, composerCursor.value] as const,
  () => {
    syncMentionTrigger();
  },
);

watch(
  () =>
    [
      firstString(props.instanceKey),
      firstString(session.value.connectionId),
      Number(props.folderId || 0),
      detailProjectPath.value,
    ] as const,
  () => {
    clearMentionSources();
    if (mentionTrigger.value) {
      void ensureMentionSourcesLoaded();
    }
  },
);

watch(
  () =>
    [
      mentionTrigger.value?.query || "",
      mentionSourceStatus.value,
      mentionResultCount.value,
    ] as const,
  () => {
    scheduleViewportSync();
  },
);

watch(
  () => props.active,
  (active) => {
    if (active) {
      scheduleViewportSync();
    }
  },
  { immediate: true },
);

watch(
  () =>
    [
      firstString(props.instanceKey),
      Number(props.conversationId || 0),
      normalizedAgentType.value,
      firstString(session.value.connectionId),
      Boolean(props.active),
    ] as const,
  ([, conversationId, , , active]) => {
    realtimeFeedbackProbeToken += 1;
    realtimeFeedbackEnabled.value = false;
    realtimeFeedbackSettingsLoaded.value = false;
    realtimeFeedbackText.value = "";
    if (composerPanelMode.value === "feedback") {
      composerPanelMode.value = "";
    }
    if (!conversationId || !active) return;
    void loadRealtimeFeedbackState();
  },
  { immediate: true },
);

watch(
  () =>
    [
      firstString(props.instanceKey),
      Number(props.folderId || 0),
      Boolean(props.active),
    ] as const,
  ([, , active]) => {
    if (!active) return;
    void loadDetailProjectEntries();
  },
  { immediate: true },
);

watch(
  () =>
    [
      Number(props.conversationId || 0),
      normalizedAgentType.value,
      firstString(session.value.connectionId),
      detailProjectPath.value,
      Boolean(props.active),
    ] as const,
  ([conversationId, agentType, , , active]) => {
    if (!conversationId || !agentType || !active) return;
    void loadDetailAgentConfig();
  },
  { immediate: true },
);

watch(
  () =>
    [
      Number(props.conversationId || 0),
      Boolean(props.active),
      Boolean(props.initialLoading),
    ] as const,
  ([conversationId, active, loading]) => {
    const token = ++historySyncToken;
    if (!conversationId || !active) {
      resetInitialHistoryLoading(conversationId);
      return;
    }
    if (loading) {
      beginInitialHistoryLoading(conversationId, token);
      return;
    }
    initialHistoryLoadingConversationId = conversationId;
    initialHistoryLoadingToken = token;
    finishInitialHistoryLoading(conversationId, token);
  },
  { immediate: true },
);

watch(
  () => Number(props.conversationId || 0),
  () => {
    // 指示行的这几个 ref 都是**按会话**的状态。切 tab 不重置的话，A 会话的
    // 「加载失败，点击重试」会原样显示在 B 会话头上，点一下还会去拉 B 的历史。
    historyLoadErrorMessage.value = "";
    historyPullDistance.value = 0;
    historyRefresherTriggered.value = false;
    // active 也要跟着清：切会话时 loadOlderTurns 的 finally 会认出自己已经不是当前
    // 请求而提前 return（isCurrentOlderHistoryRequest），留下 active 常真，
    // 于是新会话即便没有更早历史也一直能下拉。
    historyRefresherActive.value = false;
  },
);

function createLocalId(prefix: string): string {
  sequence.value += 1;
  return `${prefix}-${Date.now()}-${sequence.value}`;
}

function messageAnchorId(messageId: string) {
  return buildMessageAnchorId(messageId, props.conversationId);
}

function setProgrammaticAnchor(messageId: string) {
  anchorMessageId.value = messageId;
  messageScrollWithAnimation.value = false;
  messageScrollIntoView.value = messageAnchorId(messageId);
}

function resolveDetailDescriptor(): RemoteInstanceDescriptor {
  const instanceKey = firstString(props.instanceKey);
  if (instanceKey) {
    const registered = getRegisteredRemoteInstanceDescriptor(instanceKey);
    if (registered) return registered;
  }
  return auth.currentRemoteInstance();
}

function resolveAcpRequestOptions() {
  const instanceKey = firstString(
    props.instanceKey,
    session.value.instanceKey,
  );
  return instanceKey ? { instanceKey } : undefined;
}

async function getDetailGateway() {
  const descriptor = resolveDetailDescriptor();
  if (descriptor.mode === "direct") {
    const gateway = createGateway({
      mode: "direct",
      directBaseUrl: descriptor.baseUrl,
    });
    const token = firstString(
      descriptor.authToken,
      getDirectToken(descriptor.baseUrl),
    );
    if (token) {
      await gateway.pair({
        directBaseUrl: descriptor.baseUrl,
        token,
      });
    }
    return gateway;
  }

  const session: RelaySessionInfo = {
    accessToken: descriptor.authToken || "",
    refreshToken: descriptor.refreshToken,
    targetId: descriptor.principal,
  };
  return createGateway({
    mode: "relay",
    relayUrl: descriptor.baseUrl,
    session,
  });
}

async function loadRealtimeFeedbackState() {
  const token = ++realtimeFeedbackProbeToken;
  try {
    const gateway = await getDetailGateway();
    const settings = await getRemoteFeedbackSettings(gateway);
    if (token !== realtimeFeedbackProbeToken) return;
    realtimeFeedbackEnabled.value = settings.enabled;
    realtimeFeedbackSettingsLoaded.value = true;

    const connectionId = firstString(session.value.connectionId);
    if (!settings.enabled || !connectionId) {
      scheduleViewportSync();
      return;
    }

    const snapshot = await acpApi.acpGetSessionSnapshot(
      connectionId,
      resolveAcpRequestOptions(),
    );
    if (token !== realtimeFeedbackProbeToken || !snapshot) return;
    // Feedback capability hydration must not enter the runtime's history
    // backfill path; the detail page owns the authoritative tail refresh.
    runtime.hydrateFeedbackSnapshot(
      Number(props.conversationId || 0),
      snapshot,
      connectionId,
    );
  } catch (error) {
    if (token !== realtimeFeedbackProbeToken) return;
    if (!realtimeFeedbackSettingsLoaded.value) {
      realtimeFeedbackEnabled.value = false;
    }
    console.warn("load realtime feedback state failed", error);
  } finally {
    if (token === realtimeFeedbackProbeToken) {
      scheduleViewportSync();
    }
  }
}

async function loadDetailProjectEntries() {
  if (!Number(props.folderId || 0)) {
    detailProjectEntries.value = [];
    return;
  }

  const token = ++detailProjectEntriesToken;
  try {
    const gateway = await getDetailGateway();
    const foldersRaw = await gateway.call<unknown>("list_open_folder_details");
    if (token !== detailProjectEntriesToken) return;
    detailProjectEntries.value = normalizeList(foldersRaw).map((item: any) => ({
      id: Number(item?.id || 0),
      path: String(item?.path || "").trim(),
    }));
  } catch (error) {
    if (token !== detailProjectEntriesToken) return;
    console.warn("load detail pane project entries failed", error);
    detailProjectEntries.value = [];
  }
}

async function loadDetailAgentConfig() {
  if (!Number(props.conversationId || 0) || !normalizedAgentType.value) {
    detailAgentConfig.value = createEmptyDetailAgentConfigState();
    return;
  }

  const contextKey = detailAgentConfigContextKey.value;
  const persistedSelection =
    readPersistedAgentConfigSelection(contextKey) || undefined;
  const cachedSnapshot = readFreshAgentConfigCache(contextKey);
  if (cachedSnapshot) {
    detailAgentConfig.value = createReadyDetailAgentConfigState(
      cachedSnapshot,
      persistedSelection,
    );
  }

  const token = ++detailAgentProbeToken;
  if (!cachedSnapshot) {
    detailAgentConfig.value = {
      ...createEmptyDetailAgentConfigState(),
      status: "loading",
    };
  }

  try {
    const gateway = await getDetailGateway();
    const snapshot = await gateway.call<AgentOptionsSnapshot>(
      "acp_describe_agent_options",
      {
        agentType: normalizedAgentType.value,
        workingDir: detailProjectPath.value || null,
      },
    );
    if (token !== detailAgentProbeToken) return;
    persistAgentConfigCache(contextKey, snapshot);
    detailAgentConfig.value = createReadyDetailAgentConfigState(
      snapshot,
      persistedSelection || {
        selectedModeId: detailAgentConfig.value.selectedModeId,
        selectedValues: detailAgentConfig.value.selectedValues,
      },
    );
  } catch (error) {
    if (token !== detailAgentProbeToken) return;
    if (cachedSnapshot) return;
    console.warn("load detail pane agent config failed", error);
    detailAgentConfig.value = {
      ...createEmptyDetailAgentConfigState("读取失败，将使用远端默认配置"),
      status: "failed",
    };
  }
}

function persistDetailAgentConfigSelection() {
  persistAgentConfigSelection(
    detailAgentConfigContextKey.value,
    detailAgentConfigSelectionPayload(detailAgentConfig.value),
  );
}

function toggleConfigRow(key: ComposerConfigKey) {
  activateComposerConfigItem(key);
}

/**
 * 停掉一条 AIR 后台任务。
 *
 * 三件事必须分清：
 * - **`false` 是 adapter 的裁决而不是失败** —— 它拒绝停止（服务端因此回 200 + `false`），
 *   提示要说「未能停止」而不是「请重试」；
 * - **成功时不锁按钮**。行的消失由线上那条终态事件决定，那才是真的确认；成功后继续禁用
 *   会让用户在 adapter 静默忽略时无路可走；
 * - 不做本地乐观更新。任务表的唯一权威是服务端的合并结果，本地抢先把状态改成 `stopped`
 *   会与随后到达的真实终态（可能是 `completed`）打架。
 */
async function stopBackgroundTask(taskId: string) {
  if (!taskId || stoppingBackgroundTaskId.value) return;
  const conn = firstString(session.value.connectionId);
  if (!conn) {
    uni.showToast({ title: "连接已断开，无法停止", icon: "none" });
    return;
  }
  stoppingBackgroundTaskId.value = taskId;
  try {
    const stopped = await acpApi.acpStopAsyncTask(conn, taskId);
    uni.showToast({
      title: stopped ? "已请求停止" : "智能体未接受停止请求",
      icon: "none",
    });
  } catch (error) {
    uni.showToast({ title: toErrorMessage(error, "停止失败"), icon: "none" });
  } finally {
    stoppingBackgroundTaskId.value = "";
  }
}

function activateComposerConfigItem(key: ComposerConfigKey) {
  const next = nextExpandedConfigKey({
    currentKey: "",
    targetKey: key,
    availability: {
      hasModelOptions: hasModelOptions.value,
      hasReasoningOption: Boolean(reasoningOption.value),
      hasPermissionOptions: hasPermissionOptions.value,
    },
  });
  if (next) {
    expandedConfigKey.value = next;
  }
  scheduleViewportSync();
}

async function selectDetailMode(modeId: string) {
  if (!modeId) return;
  const conn = firstString(session.value.connectionId);
  if (!conn) {
    detailAgentConfig.value = withSelectedDetailMode(
      detailAgentConfig.value,
      modeId,
    );
    persistDetailAgentConfigSelection();
    rememberSessionMode(modeId);
    return;
  }
  try {
    await acpApi.acpSetMode(conn, modeId);
    detailAgentConfig.value = withSelectedDetailMode(
      detailAgentConfig.value,
      modeId,
    );
    persistDetailAgentConfigSelection();
    rememberSessionMode(modeId);
  } catch (error) {
    uni.showToast({
      title: `模型切换失败: ${toErrorMessage(error)}`,
      icon: "none",
    });
  }
}

/**
 * 除了本机 UI 的持久化，还要把这次显式选择记到会话记忆里 —— 它会在下一次建连时
 * 作为 `preferredModeId` 交回去。
 *
 * 两份存储各管一件事，不能合：`persistDetailAgentConfigSelection()` 存的是**这台设备
 * 上这块界面**该显示什么（键里含项目路径与 instanceKey，只给 UI 用）；这一份是**要发
 * 回远端的意图**，因此只按 `conversationId` + agent 分桶 —— 建连路径拿不到项目路径，
 * 也不认识详情页那套 instanceKey。详见 `services/conversation/sessionModeMemory.ts`。
 */
function rememberSessionMode(modeId: string) {
  rememberConversationSessionMode({
    conversationId: Number(props.conversationId || 0),
    agentType: normalizedAgentType.value,
    modeId,
  });
}

async function selectDetailConfigValue(configId: string, valueId: string) {
  if (!configId || !valueId) return;
  const conn = firstString(session.value.connectionId);
  if (!conn) {
    detailAgentConfig.value = withSelectedDetailConfigValue({
      state: detailAgentConfig.value,
      configId,
      valueId,
    });
    persistDetailAgentConfigSelection();
    rememberSessionConfigValue(configId, valueId);
    return;
  }
  try {
    await acpApi.acpSetConfigOption(conn, configId, valueId);
    detailAgentConfig.value = withSelectedDetailConfigValue({
      state: detailAgentConfig.value,
      configId,
      valueId,
    });
    persistDetailAgentConfigSelection();
    rememberSessionConfigValue(configId, valueId);
  } catch (error) {
    uni.showToast({
      title: `配置切换失败: ${toErrorMessage(error)}`,
      icon: "none",
    });
  }
}

function rememberSessionConfigValue(configId: string, valueId: string) {
  rememberConversationSessionConfigValue({
    conversationId: Number(props.conversationId || 0),
    agentType: normalizedAgentType.value,
    configId,
    valueId,
  });
}

function scrollToBottom(force = false) {
  if (!renderMessageItems.value.length) return;
  if (!force && !shouldAutoFollowBottom.value) return;
  shouldAutoFollowBottom.value = true;
  hasUnreadBelow.value = false;
  anchorMessageId.value = "";
  messageScrollWithAnimation.value = !force;
  messageScrollTop.value = Number.MAX_SAFE_INTEGER;
  const targetId = bottomAnchorIdValue.value;
  if (messageScrollIntoView.value === targetId) {
    messageScrollIntoView.value = "";
    nextTick(() => {
      messageScrollTop.value = Number.MAX_SAFE_INTEGER;
      messageScrollIntoView.value = targetId;
    });
    return;
  }
  messageScrollIntoView.value = targetId;
}

function scheduleViewportSync(forceBottom = false) {
  nextTick(() => {
    emit("layout-change");
    if (forceBottom || shouldAutoFollowBottom.value) {
      scrollToBottom(true);
      return;
    }
    // **非跟随态什么都不做。**
    //
    // 这里原先会把 `:scroll-top` 赋回 `lastMeasuredScrollTop`。那个值由 scroll 事件
    // 持续刷新，所以每次赋值都是一个**新数值** —— scroll-view 必然执行一次程序化滚动，
    // 而这发生在用户惯性滑动的中途，表现为回弹/顿住（「划不动 / 被拽回去」）。
    //
    // 用户已经手动往上翻了，滚动位置就该完全由手指决定；我们要做的只有「别去动它」。
  });
}

const VIEWPORT_SYNC_THROTTLE_MS = 120;
let viewportSyncThrottleTimer: ReturnType<typeof setTimeout> | null = null;

/** 流式路径专用：按 delta 触发时把 sync（含外壳的 6 连选择器测量）降到 ~8 次/秒。 */
function scheduleViewportSyncThrottled() {
  if (viewportSyncThrottleTimer) return;
  viewportSyncThrottleTimer = setTimeout(() => {
    viewportSyncThrottleTimer = null;
    scheduleViewportSync();
  }, VIEWPORT_SYNC_THROTTLE_MS);
}

function clearViewportSyncThrottleTimer() {
  if (!viewportSyncThrottleTimer) return;
  clearTimeout(viewportSyncThrottleTimer);
  viewportSyncThrottleTimer = null;
}

function handleComposerLayoutChange() {
  scheduleViewportSync();
}

function handleComposerInput(event: unknown) {
  const nextValue = resolveComposerInputValue(event);
  if (nextValue != null && nextValue !== inputText.value) {
    inputText.value = nextValue;
  }
  const cursor = resolveComposerInputCursor(event);
  composerCursor.value =
    typeof cursor === "number" && Number.isFinite(cursor)
      ? cursor
      : (nextValue ?? inputText.value).length;
  syncMentionTrigger();
}

function handleComposerBlur(event: unknown) {
  const cursor = resolveComposerInputCursor(event);
  if (typeof cursor === "number" && Number.isFinite(cursor)) {
    composerCursor.value = cursor;
  }
}

function resolveComposerInputValue(event: unknown): string | null {
  if (typeof event === "string") return event;
  const detailValue = (event as { detail?: { value?: unknown } })?.detail
    ?.value;
  if (typeof detailValue === "string") return detailValue;
  const targetValue = (event as { target?: { value?: unknown } })?.target
    ?.value;
  return typeof targetValue === "string" ? targetValue : null;
}

function resolveComposerInputCursor(event: unknown): number | null {
  const detail = (event as { detail?: unknown })?.detail;
  if (typeof detail === "number") return detail;
  const cursor = (detail as { cursor?: unknown } | undefined)?.cursor;
  return typeof cursor === "number" && Number.isFinite(cursor) ? cursor : null;
}

function syncMentionTrigger() {
  mentionTrigger.value = resolveMentionTrigger(
    inputText.value || "",
    composerCursor.value,
  );
  if (mentionTrigger.value) {
    void ensureMentionSourcesLoaded();
  }
}

function closeMentionPanel() {
  mentionTrigger.value = null;
  // 清掉 pin：下一次打开 @ 面板应该重新落到「第一个有内容的组」，而不是上一次停在的
  // 那一组 —— 那一组对新的查询可能完全没有结果。
  pinnedMentionKind.value = null;
}

function clearMentionSources() {
  mentionFiles.value = [];
  mentionAgents.value = [];
  mentionSessions.value = [];
  mentionCommits.value = [];
  mentionSourceStatus.value = "idle";
  mentionSourceError.value = "";
  mentionSourceKey.value = "";
}

function currentMentionSourceKey() {
  return JSON.stringify([
    firstString(props.instanceKey),
    firstString(session.value.connectionId),
    Number(props.folderId || 0),
    detailProjectPath.value,
  ]);
}

async function ensureMentionSourcesLoaded() {
  const key = currentMentionSourceKey();
  if (mentionSourceStatus.value === "ready" && mentionSourceKey.value === key)
    return;
  if (mentionSourceStatus.value === "loading" && mentionSourceKey.value === key)
    return;

  const token = ++mentionSourceLoadToken;
  mentionSourceKey.value = key;
  mentionSourceStatus.value = "loading";
  mentionSourceError.value = "";

  try {
    const gateway = await getDetailGateway();
    const projectPath = detailProjectPath.value;
    const activeFolderId = Number(props.folderId || 0);

    const [files, agents, sessions, commits] = await Promise.all([
      loadMentionFiles(gateway, projectPath),
      loadMentionAgents(gateway),
      loadMentionSessions(gateway, activeFolderId),
      loadMentionCommits(gateway, projectPath),
    ]);

    if (token !== mentionSourceLoadToken) return;
    mentionFiles.value = files;
    mentionAgents.value = agents;
    mentionSessions.value = sessions;
    mentionCommits.value = commits;
    mentionSourceStatus.value = "ready";
  } catch (error) {
    if (token !== mentionSourceLoadToken) return;
    mentionSourceStatus.value = "error";
    mentionSourceError.value = toErrorMessage(error, "引用加载失败");
  }
}

async function loadMentionFiles(
  gateway: Awaited<ReturnType<typeof getDetailGateway>>,
  projectPath: string,
) {
  if (!projectPath) return [];
  try {
    const tree = await getRemoteProjectFileTree(gateway, projectPath, 6);
    return flattenMentionFileTree(tree);
  } catch (error) {
    console.warn("load mention files skipped", error);
    return [];
  }
}

async function loadMentionAgents(
  gateway: Awaited<ReturnType<typeof getDetailGateway>>,
) {
  try {
    const raw = await gateway.call<unknown>("acp_list_agents", {});
    return normalizeList(raw) as MentionAgentSource[];
  } catch (error) {
    console.warn("load mention agents skipped", error);
    return [];
  }
}

async function loadMentionSessions(
  gateway: Awaited<ReturnType<typeof getDetailGateway>>,
  activeFolderId: number,
) {
  if (!activeFolderId) return [];
  try {
    const sessions = await loadRemoteProjectConversations(
      gateway,
      activeFolderId,
    );
    return sessions.map((item) => ({
      id: item.id,
      title: item.title,
      agentType: item.agentType,
      status: item.status,
    }));
  } catch (error) {
    console.warn("load mention sessions skipped", error);
    return [];
  }
}

async function loadMentionCommits(
  gateway: Awaited<ReturnType<typeof getDetailGateway>>,
  projectPath: string,
) {
  if (!projectPath) return [];
  try {
    const result = await getRemoteGitLog(gateway, projectPath);
    return result.entries as MentionCommitSource[];
  } catch (error) {
    console.warn("load mention commits skipped", error);
    return [];
  }
}

function flattenMentionFileTree(nodes: ProjectFileNode[]): MentionFileSource[] {
  const items: MentionFileSource[] = [];
  const walk = (node: ProjectFileNode) => {
    items.push({
      name: node.name,
      path: node.path,
      kind: node.kind === "directory" ? "directory" : "file",
    });
    node.children.forEach(walk);
  };
  nodes.forEach(walk);
  return items;
}

function insertMentionReference(item: MentionReferenceItem) {
  const trigger =
    mentionTrigger.value ||
    resolveMentionTrigger(inputText.value || "", composerCursor.value);
  if (!trigger) return;
  const result = applyMentionReference(inputText.value || "", trigger, item);
  inputText.value = result.text;
  composerCursor.value = result.cursor;
  closeMentionPanel();
  nextTick(() => {
    composerCursor.value = result.cursor;
    handleComposerLayoutChange();
  });
}

function mentionKindShortLabel(kind: MentionReferenceKind) {
  if (kind === "agent") return "AI";
  if (kind === "file") return "F";
  if (kind === "session") return "S";
  return "G";
}

function resolveMessageListViewportHeight() {
  const style = props.messageListPageStyle as
    { height?: string | number } | undefined;
  const rawHeight = style?.height;
  const height =
    typeof rawHeight === "number"
      ? rawHeight
      : Number.parseFloat(String(rawHeight || "0"));
  return Number.isFinite(height) ? Math.max(0, height) : 0;
}

function handleMessageListScroll(event: any) {
  const scrollTopValue = Math.max(0, Number(event?.detail?.scrollTop || 0));
  const scrollHeight = Math.max(0, Number(event?.detail?.scrollHeight || 0));
  const deltaY = Number(event?.detail?.deltaY || 0);
  const currentViewportHeight = Math.max(0, Number(event?.detail?.height || 0));
  // 这里原先还写两个 ref（`pageScrollTop` / `lastMeasuredScrollTop`）。它们在本组件里
  // **没有任何读取方** —— 滚动断点的持久化归外壳 `index.vue` 所有 —— 等于每个滚动事件
  // 白搭两次响应式写入，已删除。
  const nearBottomState = resolveNearBottomState({
    scrollTop: scrollTopValue,
    scrollHeight,
    viewportHeight: currentViewportHeight,
    fallbackViewportHeight: resolveMessageListViewportHeight(),
  });
  if (nearBottomState.canMeasure) {
    shouldAutoFollowBottom.value = nearBottomState.nearBottom;
    if (shouldAutoFollowBottom.value) {
      hasUnreadBelow.value = false;
      // **不要在滚动回调里读 `renderMessageItems`。** 流式期间那个 computed 是脏的，
      // 这一读就地触发「时间线重建 + 渲染项投影」的完整重算 —— 而 @scroll 在
      // scroll-view 上可达 ~60 次/秒。手指在滑、agent 在输出，两边交替把 computed
      // 弄脏，于是每一帧都可能重算一次整条链，这正是「滑动不跟手」。
      // `timelineTailAnchorId` 是 O(1) 的，从 store 的廉价字段直接算。
      anchorMessageId.value = timelineTailAnchorId.value;
    }
  }
  // uni-app 的 scroll-view 里 deltaY = lastScrollTop - scrollTop，**向上滑是正值**
  // （uni 自己的 scrolltoupper 判定用的就是 `lastScrollTop - scrollTop > 0`）。
  // 这里原先写的是 `deltaY < 0`，语义恰好反了 —— 只在「已经贴顶还继续往下滑」时
  // 才触发，连续上滑加载因此从未生效，只剩 @scrolltoupper 的边沿触发在干活。
  if (deltaY > 0 && scrollTopValue <= 120) {
    void loadOlderTurns();
  }
}

function handleMessageListScrollUpper() {
  void loadOlderTurns();
}

/**
 * 下拉手势的实时距离。只更新文案，**不触发请求** —— 触发由 `refresherrefresh` 负责
 * （uni 只在松手且距离过阈值时才发它，见 `__handleTouchEnd`）。
 */
function handleHistoryRefresherPulling(event: any) {
  const dy = Number(event?.detail?.dy ?? event?.detail?.deltaY ?? 0);
  historyPullDistance.value = Number.isFinite(dy) ? Math.max(0, dy) : 0;
}

/**
 * 手势结束（松手回弹 / 中途取消）。距离必须归零，否则指示行会永远停在
 * 「松手加载更早消息」上 —— `refresherpulling` 不会再发一次 dy=0。
 */
function handleHistoryRefresherSettled() {
  historyPullDistance.value = 0;
}

async function handleHistoryRefresherRefresh() {
  // 这两个 ref 的置位/复位顺序是**有讲究的**，别合并、别调换：
  //
  // uni 的 `_setRefreshState` 第一行就是 `if (!props.refresherEnabled) return`
  // （uni-h5.es.js:14481）。而 `refresher-enabled` 绑的是 `historyIndicator.canPull`，
  // 它会随 `hasMoreHistory` 变化 —— 这次加载恰好翻到底时就会变 false，而且
  // `loadOlderTurns` 内部有 `await nextTick()`，等它返回时这个 prop **早已**刷成
  // false 了。此时再置 `triggered = false`，uni 的 restore 会被上面那行直接吞掉：
  // `refreshState` 永远停在 "refreshing"、`beforeRefreshing` 永远为 true。之后一旦
  // 因为任何原因重新有历史可翻（切会话、resetConversationHistoryToLatest），
  // Refresher 会带着 refreshing 态挂回来 —— 顶部凭空多出一条阈值高度的空白，且
  // `__handleTouchMove` 走 `beforeRefreshing` 分支不再发 `refresherpulling`、
  // `__handleTouchEnd` 也不再发 `refresherrefresh`：下拉彻底失效且不可恢复。
  //
  // 所以用 `historyRefresherActive` 把 enabled 强行按住，直到 restore 被真正处理完。
  historyRefresherActive.value = true;
  historyRefresherTriggered.value = true;
  try {
    await loadOlderTurns();
  } finally {
    historyPullDistance.value = 0;
    // 先只收 triggered。此刻 enabled 仍为 true（被 active 按着），restore 能进得去。
    historyRefresherTriggered.value = false;
    await nextTick();
    // restore 已落地，再放开 enabled，Refresher 卸载时状态是干净的。
    historyRefresherActive.value = false;
  }
}

/**
 * 点击指示行。只有 `error` 状态可点 —— 其余状态点击必须无副作用，否则
 * 「没有更多历史了」被点一下就发一个注定失败的请求。
 */
function handleHistoryIndicatorTap() {
  if (!historyIndicator.value.retryable) return;
  void loadOlderTurns();
}

function handleScrollToBottomFab() {
  shouldAutoFollowBottom.value = true;
  hasUnreadBelow.value = false;
  anchorMessageId.value = "";
  scrollToBottom(true);
}

function beginInitialHistoryLoading(conversationId: number, token: number) {
  if (!conversationId) return;
  initialHistoryLoadingConversationId = conversationId;
  initialHistoryLoadingToken = token;
  initialHistoryLoading.value = true;
}

function finishInitialHistoryLoading(conversationId: number, token: number) {
  if (
    Number(props.conversationId || 0) !== conversationId ||
    initialHistoryLoadingConversationId !== conversationId ||
    initialHistoryLoadingToken !== token
  ) {
    return;
  }
  initialHistoryLoading.value = false;
}

function resetInitialHistoryLoading(conversationId: number) {
  initialHistoryLoadingConversationId = conversationId;
  initialHistoryLoadingToken = 0;
  initialHistoryLoading.value = false;
}

function isSameHistoryWindow(
  first: ConversationHistoryWindow | null | undefined,
  second: ConversationHistoryWindow | null | undefined,
) {
  if (first === second) return true;
  if (!first || !second) return false;
  return (
    first.turns_offset === second.turns_offset &&
    first.turns_total === second.turns_total &&
    first.assistant_turns_before_offset ===
      second.assistant_turns_before_offset &&
    first.prefix_hash === second.prefix_hash &&
    first.uncovered_prefix_max_ts === second.uncovered_prefix_max_ts
  );
}

/**
 * 一次「加载更早」请求飞回来时，判断它是否仍然可以安全前插。
 *
 * **只校验前插真正依赖的东西**，一共三样：
 *
 * 1. 还在同一个会话、同一个 runtime session、且这个 tab 仍是激活的；
 * 2. 窗口坐标一个字没变（`isSameHistoryWindow`）—— 前插位置与
 *    `canApplyOlderHistoryPage` 的接缝断言全都建立在它上面；
 * 3. 就这些。
 *
 * ## 为什么**不**校验流式状态
 *
 * 早先这里还有 `!hasVolatileHistoryRuntimeState(currentSession)` 与一个把
 * `liveMessage.content` 整个塞进去的 `historyRuntimeFingerprint`。那让「流式期间发出的
 * 请求」**必然**在返回时被判废（每个 delta 都会改指纹），于是入口处只能顺势也早退 ——
 * 结果就是回复进行中完全无法往上翻历史。用户说得对：那不该是限制。
 *
 * 前插不关心尾部：`prependHistoryPageTurns` 只做「接到最前面 + 按身份去重」
 * （`conversationTurnIdentity.ts`），流式期间尾部增长多少条都不影响它。真正会让前插
 * 出错的只有窗口坐标变化，而窗口坐标由 `setConversationHistoryWindow` 独家维护，
 * 流式事件不碰它。
 *
 * 会话切换 / 窗口被重新锚定（`resetConversationHistoryToLatest`）仍然会让请求判废 ——
 * 那两种情况下第 1、2 条会失败，正是它们该拦的。
 */
function isCurrentOlderHistoryRequest(input: {
  conversationId: number;
  runtimeSession: ReturnType<typeof runtime.getOrCreateSession>;
  historyWindow: ConversationHistoryWindow;
}) {
  const currentSession = runtime.getOrCreateSession(input.conversationId);
  return (
    Boolean(props.active) &&
    Number(props.conversationId || 0) === input.conversationId &&
    currentSession === input.runtimeSession &&
    isSameHistoryWindow(currentSession.historyWindow, input.historyWindow)
  );
}

function requestLatestHistoryWindow(conversationId: number) {
  // 走到这里意味着 canApplyOlderHistoryPage 断言失败：服务端回的
  // prefix_hash_before_index 与我们记的 prefix_hash 不符 —— 内存前缀**已被证明**是
  // 陈旧的（历史被压缩重写）。所以要连轮次一起丢掉重新锚定，只清窗口是不够的：
  // 重载路径的 applyRemoteHistoryWindowDetail 现在会用 mergeTailIntoTurnsWithSeam
  // 保住前缀，陈旧轮次会被原样留在列表顶部，和刷新出来的新轮次并排显示。
  runtime.resetConversationHistoryToLatest(conversationId);
  uni.showToast({
    title: "会话历史已更新，正在刷新最新消息",
    icon: "none",
  });
  emit("reload");
}

async function loadOlderTurns() {
  if (loadingOlder.value) return;
  const targetConversationId = Number(props.conversationId || 0);
  if (!targetConversationId || !props.active) return;

  const runtimeSession = runtime.getOrCreateSession(targetConversationId);
  const historyWindow = runtimeSession.historyWindow;
  // 唯一的前置条件是「窗口坐标说得出还有更早的历史」。
  // **流式中同样允许翻页** —— 回复正在生成时想往上看历史是完全正常的需求，
  // 而前插不依赖尾部状态（见 `isCurrentOlderHistoryRequest` 的说明）。
  if (!hasOlderConversationHistory(historyWindow)) return;

  const capturedWindow = { ...historyWindow };
  const firstVisibleMessageId = resolveRenderAnchorId({
    messageId: messages.value[0]?.id || anchorMessageId.value || "",
    items: renderMessageItems.value,
  });

  loadingOlder.value = true;
  // 重试时先清掉上一次的错误，否则请求还在飞、指示行却仍写着「点击重试」。
  historyLoadErrorMessage.value = "";
  try {
    const gateway = await getDetailGateway();
    const rawPage = await gateway.call<unknown>(
      "get_folder_conversation_turns",
      buildOlderHistoryRequest(
        targetConversationId,
        capturedWindow.turns_offset,
      ),
    );
    const page = requireConversationTurnsPage(rawPage);

    if (
      !isCurrentOlderHistoryRequest({
        conversationId: targetConversationId,
        runtimeSession,
        historyWindow: capturedWindow,
      })
    ) {
      return;
    }

    if (!canApplyOlderHistoryPage(capturedWindow, page)) {
      requestLatestHistoryWindow(targetConversationId);
      return;
    }

    const olderTurns = normalizeTurns(page.turns);
    if (olderTurns.length !== page.turns.length) {
      throw new Error("会话历史页数据无效，请重新加载");
    }

    preservingHistoryAnchor = true;
    try {
      runtimeSession.localTurns = prependHistoryPageTurns(
        runtimeSession.localTurns,
        olderTurns,
      );
      runtime.setConversationHistoryWindow(
        targetConversationId,
        advanceConversationHistoryWindow(capturedWindow, page),
      );

      await nextTick();
      if (
        firstVisibleMessageId &&
        Boolean(props.active) &&
        Number(props.conversationId || 0) === targetConversationId &&
        runtime.getOrCreateSession(targetConversationId) === runtimeSession
      ) {
        setProgrammaticAnchor(firstVisibleMessageId);
      }
    } finally {
      preservingHistoryAnchor = false;
    }
  } catch (error) {
    const isCurrentSession =
      Number(props.conversationId || 0) === targetConversationId &&
      runtime.getOrCreateSession(targetConversationId) === runtimeSession;
    if (isCurrentSession) {
      // 吐司给即时反馈，指示行留常驻重试入口 —— 只有吐司的话它一消失就没退路了。
      const message = toErrorMessage(error, "加载更早消息失败");
      historyLoadErrorMessage.value = message;
      uni.showToast({
        title: message,
        icon: "none",
      });
    }
    console.warn("load older conversation history skipped", error);
  } finally {
    loadingOlder.value = false;
  }
}

function toggleInputToolRow() {
  if (showComposerPanel.value) {
    composerPanelMode.value = "";
    expandedConfigKey.value = "";
    toolRowExpanded.value = false;
    scheduleViewportSync();
    return;
  }
  toolRowExpanded.value = !toolRowExpanded.value;
  if (toolRowExpanded.value && !realtimeFeedbackSettingsLoaded.value) {
    void loadRealtimeFeedbackState();
  }
  if (!toolRowExpanded.value) {
    composerPanelMode.value = "";
    expandedConfigKey.value = "";
  }
  scheduleViewportSync();
}

function openQuickReplyPanelFromMenu() {
  openComposerPanelFromMenu("quick_reply");
}

function openConfigPanelFromMenu() {
  openComposerPanelFromMenu("config");
}

function openComposerPanelFromMenu(mode: Exclude<ComposerPanelMode, "">) {
  toolRowExpanded.value = false;
  composerPanelMode.value = mode;
  if (mode === "config") {
    expandedConfigKey.value = activeComposerConfigKey.value;
  } else {
    expandedConfigKey.value = "";
  }
  scheduleViewportSync();
}

function toggleComposerPanel(mode: ComposerPanelMode) {
  toolRowExpanded.value = true;
  const nextMode = composerPanelMode.value === mode ? "" : mode;
  composerPanelMode.value = nextMode;
  if (!composerPanelMode.value) {
    toolRowExpanded.value = false;
  }
  if (nextMode === "config") {
    expandedConfigKey.value = activeComposerConfigKey.value;
  } else {
    expandedConfigKey.value = "";
  }
  scheduleViewportSync();
}

async function sendQuickContinue() {
  await sendQuickReply("继续");
}

function openAttachmentPicker() {
  toolRowExpanded.value = false;
  scheduleViewportSync();
  uni.showActionSheet({
    itemList: ["选择图片", "选择文件"],
    success: (result) => {
      if (Number(result.tapIndex) === 0) {
        handleChooseImages();
        return;
      }
      if (Number(result.tapIndex) === 1) {
        handleChooseFiles();
      }
    },
  });
}

function handleRealtimeFeedbackMenu() {
  if (realtimeFeedbackMenuDisabled.value) return;
  realtimeFeedbackText.value = "";
  openComposerPanelFromMenu("feedback");
}

function feedbackNoteStatusText(status: "pending" | "delivered") {
  return resolveFeedbackNoteStatusLabel(status);
}

function handleRealtimeFeedbackInput(event: unknown) {
  const value = resolveComposerInputValue(event);
  if (value != null) {
    realtimeFeedbackText.value = value;
  }
  scheduleViewportSync();
}

function isCurrentFeedbackConnection(
  conversationId: number,
  connectionId: string,
) {
  return (
    Number(props.conversationId || 0) === conversationId &&
    firstString(session.value.connectionId) === connectionId
  );
}

function isPendingFeedbackResult(item: unknown) {
  return (
    item &&
    typeof item === "object" &&
    String((item as Record<string, unknown>).status || "")
      .trim()
      .toLowerCase() === "pending"
  );
}

function snapshotExplicitlyDisablesNativeSteering(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== "object") return false;
  const record = snapshot as Record<string, unknown>;
  return (
    record.native_steering_available === false ||
    record.nativeSteeringAvailable === false
  );
}

/**
 * Reconcile the backend's channel choice after a submit. Native steering can
 * downgrade at runtime when an adapter reports `startedNewTurn`; a pending
 * response exposes that immediately, while a delivered response needs one
 * authoritative snapshot read to discover the downgrade.
 */
function reconcileRealtimeFeedbackSubmission(
  conversationId: number,
  connectionId: string,
  requestedChannel: RealtimeFeedbackChannel,
  item: unknown,
): RealtimeFeedbackChannel | null {
  if (!isCurrentFeedbackConnection(conversationId, connectionId)) return null;
  if (requestedChannel !== "native") return requestedChannel;

  if (isPendingFeedbackResult(item)) {
    const downgraded = runtime.markNativeSteeringUnavailable(
      conversationId,
      connectionId,
    );
    if (downgraded) {
      uni.showToast({
        title: "当前连接已切换为等待读取模式",
        icon: "none",
        duration: 2800,
      });
    }
    return "pull";
  }

  // A delivered result is also returned by the adapter's detached-turn
  // downgrade path. Verify it asynchronously so the successful note remains
  // responsive while future submissions use the pull channel.
  void (async () => {
    try {
      const snapshot = await acpApi.acpGetSessionSnapshot(
        connectionId,
        resolveAcpRequestOptions(),
      );
      if (!isCurrentFeedbackConnection(conversationId, connectionId)) return;
      const accepted = runtime.hydrateFeedbackSnapshot(
        conversationId,
        snapshot,
        connectionId,
      );
      if (
        accepted &&
        snapshotExplicitlyDisablesNativeSteering(snapshot)
      ) {
        runtime.markNativeSteeringUnavailable(conversationId, connectionId);
      }
    } catch {
      // The submit already succeeded. A failed verification should not turn a
      // delivered note into a user-visible error; the next live snapshot can
      // still converge the capability.
    }
  })();
  return "native";
}

function closeRealtimeFeedbackPanel() {
  if (realtimeFeedbackSubmitting.value) return;
  realtimeFeedbackText.value = "";
  composerPanelMode.value = "";
  scheduleViewportSync();
}

async function submitRealtimeFeedback() {
  const text = realtimeFeedbackText.value.trim();
  if (!text || realtimeFeedbackSubmitting.value) return;
  if (!canSubmitRealtimeFeedback.value) {
    uni.showToast({
      title: isBusyForSend.value
        ? "当前会话暂不支持实时反馈"
        : "当前没有正在运行的回合",
      icon: "none",
      duration: 2500,
    });
    return;
  }

  const targetConversationId = Number(props.conversationId || 0);
  const connectionId = firstString(session.value.connectionId);
  const requestedChannel = realtimeFeedbackChannel.value;
  if (!targetConversationId || !connectionId || !requestedChannel) return;

  realtimeFeedbackSubmitting.value = true;
  try {
    const item = await acpApi.acpSubmitSessionFeedback(
      connectionId,
      text,
      resolveAcpRequestOptions(),
    );
    if (!isCurrentFeedbackConnection(targetConversationId, connectionId)) return;
    runtime.recordFeedbackNote(targetConversationId, item);
    const deliveredChannel = reconcileRealtimeFeedbackSubmission(
      targetConversationId,
      connectionId,
      requestedChannel,
      item,
    );
    if (
      deliveredChannel &&
      isCurrentFeedbackConnection(targetConversationId, connectionId)
    ) {
      realtimeFeedbackText.value = "";
      composerPanelMode.value = "";
      uni.showToast({
        title:
          deliveredChannel === "native"
            ? "实时反馈已插入本轮"
            : "实时反馈已发送，等待读取",
        icon: "none",
      });
    }
  } catch (error) {
    const message = toErrorMessage(error);
    if (isNoActiveTurnRejection(error)) {
      const fallback = resolveNoActiveTurnFeedbackFallback({
        hasComposerContent: Boolean(
          inputText.value.trim() || attachments.value.length > 0,
        ),
      });
      if (fallback === "composer") {
        inputText.value = text;
        composerCursor.value = null;
        realtimeFeedbackText.value = "";
        composerPanelMode.value = "";
        toolRowExpanded.value = false;
      }
      uni.showToast({
        title:
          fallback === "composer"
            ? "本轮已结束，反馈内容已移回输入框"
            : "本轮已结束，反馈草稿已保留",
        icon: "none",
        duration: 2500,
      });
      return;
    }
    uni.showToast({
      title: `反馈发送失败: ${message}`,
      icon: "none",
      duration: 3000,
    });
  } finally {
    realtimeFeedbackSubmitting.value = false;
    scheduleViewportSync();
  }
}

function getSlashCommandDesc(item: SlashCommandItem) {
  return slashCommandDescription(item);
}

function dismissSlashPanel() {
  if (!slashTriggerKey.value) return;
  dismissedSlashTriggerKey.value = slashTriggerKey.value;
  scheduleViewportSync();
}

function applySlashCommand(item: SlashCommandItem) {
  dismissedSlashTriggerKey.value = "";
  inputText.value = applySlashCommandText(inputText.value || "", item);
  scheduleViewportSync();
}

/**
 * 草稿按会话落库。
 *
 * **这条链路此前整段缺失。** SQLite 那张 `conversation_runtime` 表早就有
 * `composer_text` / `attachments_json` 两列、主键就是 `(instance_key, conversation_id)`，
 * `saveDraftState` 也早就是 read-modify-write（只覆盖草稿三列、不冲掉 live/seq）——
 * 但唯一的接线在 `index.vue` 上，而那个组件的输入框在抽离本 pane 时就没了。于是整套
 * 基础设施在往一个永远为空的 ref 上写。这个 pane 原本**连生命周期钩子都没有**。
 *
 * 切 tab 不是隐藏而是**销毁**：`mountedDetailConversationIds` 每次切换都重置为 ±1 滑动
 * 窗口（`detailTabsPresentation.ts` 的 `resolveDetailMountedWindowConversationIds`），
 * 从 tab0 跳到 tab3 时 tab0 的 pane 连组件带 ref 一起蒸发。所以落盘时机必须包含
 * `onUnmounted`，只靠防抖 watch 会丢掉最后一次输入。
 */
const DRAFT_PERSIST_DEBOUNCE_MS = 800;
let draftPersistTimer: ReturnType<typeof setTimeout> | null = null;
// 恢复完成前不落盘：否则 mount 那一刻的空值会把上一次存的草稿覆盖掉。
const draftRestored = ref(false);

function resolvePaneInstanceKey() {
  return firstString(props.instanceKey) || "anonymous";
}

function clearDraftPersistTimer() {
  if (draftPersistTimer) {
    clearTimeout(draftPersistTimer);
    draftPersistTimer = null;
  }
}

async function persistPaneDraft() {
  const conversationId = Number(props.conversationId || 0);
  if (!conversationId || !draftRestored.value) return;
  try {
    // 建表必须自己保证：pane 可能是**第一个**碰 SQLite 的组件（详情页的
    // `hydrateLocalConversationState` 只在有本地缓存那条路上跑）。少这一句就会在
    // 干净安装上直接 `no such table: conversation_runtime` —— 这是实测撞出来的。
    // `ensureConversationSchema` 自带 promise 去重，重复调用没有代价。
    await ensureConversationSchema();
    await saveDraftState({
      conversationId,
      instanceKey: resolvePaneInstanceKey(),
      connectionId: firstString(session.value.connectionId) || null,
      composerText: inputText.value,
      // pane 没有本地待发送队列（那套仍留在 index.vue 的死代码里），存空数组占位 ——
      // `saveDraftState` 会原样覆盖这一列，写 "[]" 而不是留旧值才是诚实的。
      draftQueueJson: "[]",
      // **必须过 sanitize**：base64 `data` 不能落库，见 sanitizeAttachmentsForPersist。
      attachmentsJson: JSON.stringify(
        sanitizeAttachmentsForPersist(attachments.value),
      ),
    });
  } catch (error) {
    // 落盘失败不该影响输入 —— 用户正在打字，弹 toast 只会打断他。
    console.warn("persist pane draft skipped", error);
  }
}

function scheduleDraftPersist() {
  clearDraftPersistTimer();
  draftPersistTimer = setTimeout(() => {
    draftPersistTimer = null;
    void persistPaneDraft();
  }, DRAFT_PERSIST_DEBOUNCE_MS);
}

async function restorePaneDraft() {
  const conversationId = Number(props.conversationId || 0);
  if (!conversationId) {
    draftRestored.value = true;
    return;
  }
  try {
    await ensureConversationSchema();
    const persistedRuntime = await getRuntime(
      resolvePaneInstanceKey(),
      conversationId,
    );
    // 输入框已经有内容就不覆盖：恢复是异步的，用户可能在它返回前就开始打字了。
    if (!inputText.value && !attachments.value.length) {
      const restored = resolveConversationDraftRestoreState({
        persistedRuntime,
        createId: createLocalId,
      });
      inputText.value = restored.composerText;
      attachments.value = restored.attachments;
    }
  } catch (error) {
    console.warn("restore pane draft skipped", error);
  } finally {
    // 无论成败都要放开落盘闸门，否则一次读失败会让这条会话再也存不进草稿。
    draftRestored.value = true;
  }
}

watch(
  () => [inputText.value, JSON.stringify(attachments.value)],
  () => {
    if (!draftRestored.value) return;
    scheduleDraftPersist();
  },
);

onMounted(() => {
  void restorePaneDraft();
});

onUnmounted(() => {
  // In-flight settings/snapshot responses must not hydrate a session after
  // this pane has been destroyed or its tab has been replaced.
  realtimeFeedbackProbeToken += 1;
  clearViewportSyncThrottleTimer();
  // 切 tab / 退出详情页都会销毁本组件（见上方说明）。防抖里还压着的那次必须**同步
  // 立即**落盘 —— 等它自己触发的话组件已经没了。
  clearDraftPersistTimer();
  void persistPaneDraft();
});

function createDraftFromComposer(): QueuedDraft | null {
  const draft = createComposerDraft({
    text: inputText.value,
    attachments: attachments.value,
    createId: createLocalId,
  });
  if (!draft) return null;
  inputText.value = "";
  composerCursor.value = null;
  closeMentionPanel();
  attachments.value = [];
  return draft;
}

async function sendQuickReply(text: string) {
  if (!canSendSharedLive.value) {
    showSharedLiveBlockedToast();
    return;
  }
  // 快捷回复也过同一道门：它同样调 sendDraft，没有拦截就同样会撞上服务端并发闸。
  if (interceptRunningSend({ text, hasAttachments: false })) return;
  const draft = createStandaloneDraft({
    text,
    createId: createLocalId,
  });
  if (!draft) return;
  toolRowExpanded.value = false;
  composerPanelMode.value = "";
  expandedConfigKey.value = "";
  await sendDraft(draft);
}

async function sendMessage() {
  if (!canSend.value) return;
  if (!canSendSharedLive.value) {
    showSharedLiveBlockedToast();
    return;
  }
  if (uploadingCount.value > 0) {
    uni.showToast({ title: "文件上传中，请稍后发送", icon: "none" });
    return;
  }
  // **必须在 createDraftFromComposer 之前**：那个函数会把 inputText / attachments
  // 清空，放在它之后拦截等于把用户刚打的字吞掉。
  if (
    interceptRunningSend({
      text: inputText.value,
      hasAttachments: attachments.value.length > 0,
    })
  ) {
    return;
  }
  const draft = createDraftFromComposer();
  if (!draft) return;
  await sendDraft(draft);
}

/**
 * 运行中点发送时的分流。返回 true 表示「已经处理掉了，调用方不要再发」。
 *
 * 这道门此前在从 index.vue 抽离到本组件时整块丢了（`isBusyForSend` 有定义、零引用），
 * 于是第二条 prompt 真的打到 `/acp_prompt`，被服务端并发闸拒掉并提示
 * `turn already in progress`。
 */
function interceptRunningSend(input: { text: string; hasAttachments: boolean }) {
  const action = resolveRunningSendAction({
    isBusy: isBusyForSend.value,
    nativeSteeringAvailable: nativeSteeringAvailable.value,
    hasAttachments: input.hasAttachments,
  });
  if (action === "send") return false;

  if (action === "steer_sheet") {
    openSteerActionSheet(input.text);
    return true;
  }

  // blocked：草稿原样留在输入框里，用户可以等回合结束后直接点发送。
  uni.showToast({
    title: "当前回合进行中，请等待结束后再发送",
    icon: "none",
    duration: 2500,
  });
  return true;
}

/**
 * 「插入当前回合 / 取消」底部面板。
 *
 * 用原生 `uni.showActionSheet` 而不是 `up-action-sheet`：详情页现有的三处底部菜单
 * （背景图、主题、会话状态）都用它，且它自带取消项，不必手写「取消」这一栏。
 */
function openSteerActionSheet(rawText: string) {
  const text = String(rawText || "").trim();
  if (!text) return;
  uni.showActionSheet({
    itemList: ["插入当前回合"],
    success: (result) => {
      if (Number(result.tapIndex) !== 0) return;
      void steerIntoCurrentTurn(text);
    },
  });
}

/**
 * 把文本注入正在运行的回合。
 *
 * 三条失败语义各不相同，不能合成一个 catch：
 * - `no active turn`：点按钮那几百毫秒里回合结束了。文本**没有**被消费，所以保留草稿
 *   并提示可以直接发送 —— 替用户自动发出去是越权（他可能已经改主意）。
 * - 其它失败：同样保留草稿，报错原文。
 * - 成功：清空输入框。**只在成功后清**，这是与 sendMessage 相反的顺序，因为这里是
 *   异步确认而非即时发送。
 */
async function steerIntoCurrentTurn(text: string) {
  if (steeringIntoTurn.value) return;
  const connectionId = firstString(session.value.connectionId);
  const targetConversationId = Number(props.conversationId || 0);
  if (!connectionId) {
    uni.showToast({ title: "未连接到代理", icon: "none" });
    return;
  }
  steeringIntoTurn.value = true;
  try {
    const item = await acpApi.acpSubmitSessionFeedback(
      connectionId,
      text,
      resolveAcpRequestOptions(),
    );
    if (!isCurrentFeedbackConnection(targetConversationId, connectionId)) return;
    // 乐观回显：接口返回的就是那条便签。随后到达的 `feedback_submitted` 广播按 id
    // 幂等，所以这里先 append 不会变成两条 —— 而不 append 的话，在广播回来之前
    // （relay 链路上是几百毫秒）界面上没有任何插入成功的痕迹。
    runtime.recordFeedbackNote(targetConversationId, item);
    const deliveredChannel = reconcileRealtimeFeedbackSubmission(
      targetConversationId,
      connectionId,
      "native",
      item,
    );
    inputText.value = "";
    composerCursor.value = null;
    closeMentionPanel();
    uni.showToast({
      title:
        deliveredChannel === "pull"
          ? "已发送反馈，等待读取"
          : "已插入当前回合",
      icon: "none",
    });
  } catch (error) {
    const message = toErrorMessage(error);
    if (isNoActiveTurnRejection(error)) {
      uni.showToast({
        title: "当前回合已结束，可直接发送",
        icon: "none",
        duration: 2500,
      });
      return;
    }
    uni.showToast({
      title: `插入失败: ${message}`,
      icon: "none",
      duration: 3000,
    });
  } finally {
    steeringIntoTurn.value = false;
  }
}

async function prepareDraftForSend(draft: QueuedDraft): Promise<QueuedDraft> {
  const preparedAttachments: UploadedAttachment[] = [];
  let totalImageBytes = 0;
  for (const att of draft.attachments) {
    if (att.kind !== "image") {
      preparedAttachments.push({ ...att });
      continue;
    }

    const parsedInline = parseImageDataUrl(att.data || att.url);
    let data = att.data || parsedInline?.data || "";
    const mimeType = parsedInline?.mimeType || att.type || "image/png";
    if (!data) {
      const sourcePath = firstString(att.localPath, att.url);
      if (!sourcePath || /^https?:\/\//i.test(sourcePath)) {
        throw new Error(
          `图片 ${att.name || ""} 本地缓存已失效，请重新选择图片`.trim(),
        );
      }
      data = await readLocalImageBase64(sourcePath);
    }

    const decodedBytes = estimateBase64DecodedBytes(data);
    if (decodedBytes > PROMPT_IMAGE_MAX_BYTES) {
      throw new Error(
        `图片 ${att.name || ""} 超过 ${promptImageLimitText()}，请压缩后重新选择`.trim(),
      );
    }
    totalImageBytes += decodedBytes;
    if (totalImageBytes > PROMPT_IMAGE_MAX_BYTES) {
      throw new Error(
        `图片总大小超过 ${promptImageLimitText()}，请减少图片数量或压缩后重试`,
      );
    }

    preparedAttachments.push({
      ...att,
      type: mimeType,
      data,
    });
  }

  return {
    ...draft,
    attachments: preparedAttachments,
  };
}

async function readLocalImageBase64(filePath: string): Promise<string> {
  const fs = (uni as any).getFileSystemManager?.();
  if (!fs || typeof fs.readFile !== "function") {
    throw new Error("当前平台不支持读取图片数据，请重新选择图片");
  }
  return await new Promise<string>((resolve, reject) => {
    fs.readFile({
      filePath,
      encoding: "base64",
      success: (res: { data?: unknown }) => {
        const data = typeof res.data === "string" ? res.data : "";
        if (data) {
          resolve(data);
          return;
        }
        reject(new Error("图片读取结果为空，请重新选择图片"));
      },
      fail: (err: { errMsg?: string }) => {
        reject(new Error(err?.errMsg || "图片读取失败，请重新选择图片"));
      },
    });
  });
}

async function ensureConversationReadyForSend(resumeSessionId?: string) {
  const existingConnectionId = firstString(session.value.connectionId);
  if (existingConnectionId) return existingConnectionId;
  const recovered = await runtime.connect(
    Number(props.conversationId || 0),
    normalizedAgentType.value || "claude_code",
    undefined,
    resumeSessionId,
    session.value.lastAppliedSeq ?? undefined,
    firstString(props.instanceKey) || undefined,
  );
  return firstString(recovered?.id, session.value.connectionId) || "";
}

async function sendDraft(draft: QueuedDraft): Promise<boolean> {
  if (!canSendSharedLive.value) {
    showSharedLiveBlockedToast();
    return false;
  }

  sending.value = true;
  draft.status = "sending";
  draft.error = undefined;
  shouldAutoFollowBottom.value = true;
  anchorMessageId.value = "";

  try {
    touchHotConversation(Number(props.conversationId || 0));
    // 发送前的准备（PC 端 opened-tab 就绪）。**这一步在抽离本组件时丢过一次** ——
    // `ensurePcTabReadyForPrompt` 留在了详情页那条已经没有输入框的发送链路上，于是
    // 手机端发消息不再帮 PC 打开对应标签。失败不阻断发送：它是体验优化，不是前置条件。
    await props.onBeforeSendPrompt?.();
    const conn = await ensureConversationReadyForSend();
    if (!conn) throw new Error("未连接到代理");

    const preparedDraft = await prepareDraftForSend(draft);
    const payload = buildDraftSendPayload(preparedDraft);
    scheduleViewportSync(true);

    const { connectionId: promptConnectionId, response: promptResponse } =
      await sendPromptWithConnectionRecovery({
        connectionId: conn,
        send: (connectionId) =>
          acpApi.acpPrompt(
            connectionId,
            payload.blocks,
            Number(props.folderId || 0),
            Number(props.conversationId || 0),
          ),
        reconnect: async (staleConnectionId) => {
          const managed = runtime.getManagedConversation(
            Number(props.conversationId || 0),
          );
          const resumeSessionId = firstString(
            managed?.externalId,
            managed?.connection.sessionId,
          );
          runtime.invalidateConnection(
            Number(props.conversationId || 0),
            staleConnectionId,
          );
          return await ensureConversationReadyForSend(resumeSessionId || undefined);
        },
      });
    if (isQueuedPromptResponse(promptResponse)) {
      runtime.clearLiveMessage(Number(props.conversationId || 0));
      runtime.handleEventForConversation(Number(props.conversationId || 0), {
        connectionId: promptConnectionId,
        type: "turn_queued",
        data: promptResponse,
      } as any);
      usePetStore().addExp("user", 5);
      return true;
    }

    const started = await waitForPromptStart(draft);
    if (!started.started) {
      runtime.clearLiveMessage(Number(props.conversationId || 0));
      const failure = resolveDraftSendFailure({
        startedResult: started,
        fallbackMessage: "请求已发出，但智能体未开始处理",
      });
      draft.status = failure.status;
      draft.error = failure.error;
      runtime.setSessionError(Number(props.conversationId || 0), failure.error);
      uni.showToast({
        title: failure.toastTitle,
        icon: "none",
        duration: 3000,
      });
      return false;
    }

    runtime.setSessionError(Number(props.conversationId || 0), null);
    runtime.beginPlaceholderThinking(Number(props.conversationId || 0));
    usePetStore().addExp("user", 5);
    return true;
  } catch (error) {
    runtime.clearLiveMessage(Number(props.conversationId || 0));
    const message = toErrorMessage(error);
    // 兜底：本地判定为空闲、服务端却在跑。runtimeStatus 靠推送事件驱动，断线期间会
    // 滞后，所以这个窗口一直存在（两个后端的拒绝码不同，见 isTurnInProgressRejection）。
    // 草稿已经被 createDraftFromComposer 从输入框里取走了，这里必须还回去 ——
    // 否则用户刚打的字直接蒸发。
    if (isTurnInProgressRejection(error)) {
      restoreDraftToComposer(draft);
      uni.showToast({
        title: "当前回合进行中，请等待结束后再发送",
        icon: "none",
        duration: 2500,
      });
      return false;
    }
    const failure = resolveDraftSendFailure({ errorMessage: message });
    draft.status = failure.status;
    draft.error = failure.error;
    runtime.setSessionError(Number(props.conversationId || 0), failure.error);
    uni.showToast({ title: failure.toastTitle, icon: "none", duration: 3000 });
    return false;
  } finally {
    sending.value = false;
  }
}

/**
 * 把一份未能发出的草稿还回输入框。
 *
 * 只在输入框仍是空的时候覆盖：拒绝到达前用户可能已经开始打下一条，那份新内容比这份
 * 失败的草稿更该留着。附件同理，用合并而不是替换。
 */
/**
 * 关掉「发送失败」横幅。
 *
 * 那条横幅此前无法消除：`setSessionError(id, null)` 只在发送成功后被调，而
 * `clearStaleTurnError` 对「没有轮次归属」的错误一律跳过 —— catch 里写入时若
 * `liveMessage` 已被清空就正是这种情况。于是一次额度不足留下的报错会一直挂着。
 */
function dismissRuntimeError() {
  runtime.dismissSessionError(Number(props.conversationId || 0));
}

function restoreDraftToComposer(draft: QueuedDraft) {
  if (!inputText.value.trim()) {
    inputText.value = draft.text || "";
    composerCursor.value = null;
  }
  if (draft.attachments.length > 0 && attachments.value.length === 0) {
    attachments.value = draft.attachments.map((att) => ({ ...att }));
  }
}

function hasPromptActuallyStarted() {
  return hasPromptStarted({
    status: session.value.status,
    liveContentLength: session.value.liveMessage?.content.length || 0,
  });
}

async function waitForPromptStart(
  draft: QueuedDraft,
): Promise<SendAttemptResult> {
  if (hasPromptActuallyStarted()) return { started: true };

  return await new Promise<SendAttemptResult>((resolve) => {
    let settled = false;
    let stopWatch: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (result: SendAttemptResult) => {
      if (settled) return;
      settled = true;
      stopWatch?.();
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    stopWatch = watch(
      () => buildPromptStartWatchSignature(session.value),
      () => {
        const outcome = resolvePromptStartWatchOutcome({
          hasStarted: hasPromptActuallyStarted(),
          draftStatus: draft.status,
          draftError: draft.error,
          fallbackMessage: "发送失败",
        });
        if (outcome) finish(outcome);
      },
      { flush: "sync" },
    );

    timer = setTimeout(() => {
      if (hasPromptActuallyStarted()) {
        finish({ started: true });
        return;
      }
      void confirmPromptStartFromSnapshot()
        .then((startedBySnapshot) => {
          finish(
            resolvePromptStartSnapshotOutcome({
              startedBySnapshot,
              hasStartedAfterSnapshot: hasPromptActuallyStarted(),
              timeoutMessage: "请求已入队，但会话没有进入运行状态",
            }),
          );
        })
        .catch(() => {
          finish(
            resolvePromptStartTimeoutFailure(
              "请求已入队，但会话没有进入运行状态",
            ),
          );
        });
    }, PROMPT_START_TIMEOUT_MS);
  });
}

async function confirmPromptStartFromSnapshot() {
  try {
    const snapshot = await acpApi.acpGetSessionSnapshotByConversation(
      Number(props.conversationId || 0),
    );
    if (!snapshot || typeof snapshot !== "object") return false;
    runtime.hydrateLiveSnapshot(Number(props.conversationId || 0), snapshot);
    touchHotConversation(Number(props.conversationId || 0));
    return hasPromptActuallyStarted();
  } catch {
    return false;
  }
}

function confirmStopSession() {
  if (!canStopSession.value || stoppingSession.value) return;
  uni.showModal({
    title: "停止当前会话？",
    content: "当前回复会被中断，停止后仍可继续发送消息。",
    confirmText: "停止会话",
    cancelText: "继续等待",
    success: (result) => {
      if (!result.confirm) return;
      void stopCurrentSession();
    },
  });
}

function handleChooseImages() {
  chooseImages();
}

function handleChooseFiles() {
  chooseFiles();
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
      });
      await uploadPickedFiles(files);
    },
  });
}

function chooseFiles() {
  const chooser = (uni as any).chooseMessageFile || (uni as any).chooseFile;
  if (typeof chooser !== "function") {
    uni.showToast({ title: "当前平台不支持文件选择", icon: "none" });
    return;
  }

  chooser({
    count: 9,
    type: "file",
    extension: [],
    success: async (res: any) => {
      const files = normalizePickedMessageFiles(res?.tempFiles);
      if (files.length === 0) {
        uni.showToast({ title: "未选择可用文件", icon: "none" });
        return;
      }
      await uploadPickedFiles(files);
    },
    fail: () => {},
  });
}

async function uploadPickedFiles(files: PickedLocalFile[]) {
  for (const file of files) {
    if (file.kind === "image" && isPromptImageTooLarge({ size: file.size })) {
      uni.showToast({
        title: `${file.name} 超过 ${promptImageLimitText()}，请压缩后重新选择`,
        icon: "none",
        duration: 3000,
      });
      continue;
    }

    const queueItem: UploadQueueItem = {
      id: createLocalId("upload"),
      name: file.name,
      size: file.size,
      type: file.type,
      kind: file.kind,
      progress: 0,
      status: "uploading",
    };

    uploadQueue.value.unshift(queueItem);
    uploadingCount.value += 1;

    try {
      const uploaded = await uploadSingleFile(file, queueItem.id);
      attachments.value.push(uploaded);
      queueItem.status = "success";
      queueItem.progress = 100;
      scheduleViewportSync();
    } catch (error) {
      queueItem.status = "error";
      queueItem.error = toErrorMessage(error);
      uni.showToast({ title: `${file.name} 上传失败`, icon: "none" });
    } finally {
      uploadingCount.value = Math.max(0, uploadingCount.value - 1);
    }
  }
}

async function uploadSingleFile(
  file: PickedLocalFile,
  queueId: string,
): Promise<UploadedAttachment> {
  const target = props.uploadTarget;
  if (!target?.url) {
    throw new Error("附件上传地址不可用");
  }
  const connectionId = firstString(session.value.connectionId) || "";
  const uploadResult = await new Promise<{
    path?: string;
    url?: string;
    name?: string;
    size?: number;
  }>((resolve, reject) => {
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
          reject(new Error(`上传失败(${res.statusCode})`));
          return;
        }
        try {
          const parsed =
            typeof res.data === "string" ? JSON.parse(res.data) : res.data;
          resolve(parsed || {});
        } catch {
          reject(new Error("上传返回解析失败"));
        }
      },
      fail: (err) => {
        reject(new Error(err?.errMsg || "上传失败"));
      },
    });
    task.onProgressUpdate((event) => {
      const item = uploadQueue.value.find((queue) => queue.id === queueId);
      if (item) item.progress = Number(event.progress || 0);
    });
  });

  return buildUploadedAttachment({
    uploadResult,
    file,
    createId: createLocalId,
  });
}

function removeAttachment(index: number) {
  attachments.value.splice(index, 1);
  scheduleViewportSync();
}

async function stopCurrentSession() {
  const conn = firstString(session.value.connectionId);
  if (stoppingSession.value) return;
  if (!conn) {
    uni.showToast({ title: "当前会话连接不可用，无法停止", icon: "none" });
    return;
  }

  stoppingSession.value = true;
  try {
    await acpApi.acpCancel(conn);
    uni.showToast({ title: "已停止", icon: "success" });
  } catch (error) {
    uni.showToast({
      title: toErrorMessage(error, "停止失败"),
      icon: "none",
    });
  } finally {
    stoppingSession.value = false;
  }
}

async function regenerateLastMessage() {
  const lastUserMessage = findLatestUserMessage(messages.value);
  if (!lastUserMessage) return;
  const textContent = getTurnContentParts(lastUserMessage).find(
    (part) => part.type === "text",
  );
  if (textContent?.text) {
    inputText.value = textContent.text;
    await sendMessage();
  }
}

function questionSelection(questionId: string): QuestionSelectionState {
  const current = askQuestionSelections.value[questionId];
  if (current) return current;
  const next = {
    selected: [],
    otherActive: false,
    otherText: "",
  };
  askQuestionSelections.value = {
    ...askQuestionSelections.value,
    [questionId]: next,
  };
  return next;
}

function isQuestionOptionSelected(questionId: string, label: string) {
  return questionSelection(questionId).selected.includes(label);
}

function isQuestionOtherActive(questionId: string) {
  return questionSelection(questionId).otherActive;
}

function isQuestionAnswered(questionId: string) {
  return isQuestionSelectionAnswered(questionSelection(questionId));
}

function toggleQuestionOption(
  question: PendingQuestionState["questions"][number],
  label: string,
) {
  const current = questionSelection(question.id);
  const selected = current.selected.includes(label);
  const nextSelected = question.multi_select
    ? selected
      ? current.selected.filter((item) => item !== label)
      : [...current.selected, label]
    : selected
      ? []
      : [label];
  askQuestionSelections.value = {
    ...askQuestionSelections.value,
    [question.id]: {
      ...current,
      selected: nextSelected,
      otherActive: question.multi_select ? current.otherActive : false,
    },
  };

  // 单选选中后自动跳下一题 —— 这是让多个 tab 读起来像向导而不是作业的关键。
  // 取消选中（nextSelected 为空）时不跳：那是在改主意，跳走等于把他推离刚要重选的那题。
  if (nextSelected.length > 0) {
    maybeAdvanceQuestionTab(question, false);
  }
}

/**
 * 作答后按需前进到下一个 tab。判据在纯模块 `resolveNextQuestionTabIndex` 里
 * （多选不跳、切「其他」不跳、末题不跳），这里只负责套上「当前是否分栏」这一层。
 */
function maybeAdvanceQuestionTab(
  question: PendingQuestionState["questions"][number],
  isOtherToggle: boolean,
) {
  if (!questionUsesTabs.value) return;
  const nextIndex = resolveNextQuestionTabIndex({
    questionCount: questionTabItems.value.length,
    currentIndex: askQuestionTabIndex.value,
    multiSelect: question.multi_select,
    isOtherToggle,
  });
  if (nextIndex == null) return;
  askQuestionTabIndex.value = nextIndex;
}

function toggleQuestionOther(
  question: PendingQuestionState["questions"][number],
) {
  const current = questionSelection(question.id);
  const nextActive = !current.otherActive;
  askQuestionSelections.value = {
    ...askQuestionSelections.value,
    [question.id]: {
      ...current,
      selected: question.multi_select ? current.selected : [],
      otherActive: nextActive,
    },
  };
}

function setQuestionOtherText(questionId: string, event: unknown) {
  const value = questionInputValue(event);
  const current = questionSelection(questionId);
  askQuestionSelections.value = {
    ...askQuestionSelections.value,
    [questionId]: {
      ...current,
      otherActive: true,
      otherText: value,
    },
  };
}

function buildQuestionAnswer(declined: boolean): QuestionAnswer {
  return buildPendingQuestionAnswer(
    pendingQuestionCard.value,
    askQuestionSelections.value,
    declined,
  );
}

async function answerAskQuestion(declined: boolean) {
  if (questionSubmitting.value) return;
  const pending = pendingQuestionCard.value;
  const conn = firstString(session.value.connectionId);
  if (!pending?.question_id || !conn) {
    uni.showToast({ title: "问题请求信息不完整", icon: "none" });
    return;
  }
  if (!declined && !questionSubmitReady.value) {
    uni.showToast({ title: "请先完成所有问题", icon: "none" });
    return;
  }

  questionSubmitting.value = true;
  try {
    await acpApi.acpAnswerQuestion(
      conn,
      pending.question_id,
      buildQuestionAnswer(declined),
    );
    runtime.clearPendingQuestion(
      Number(props.conversationId || 0),
      pending.question_id,
    );
    usePetStore().addExp("user", declined ? 2 : 8);
    uni.showToast({
      title: declined ? "已跳过选择" : "已提交选择",
      icon: "success",
    });
  } catch (error) {
    uni.showToast({
      title: toErrorMessage(error, "提交选择失败"),
      icon: "none",
    });
  } finally {
    questionSubmitting.value = false;
  }
}

async function respondToPermission(optionId: string) {
  if (permissionSubmitting.value) return;
  const pending = pendingPermissionCard.value;
  const conn = firstString(session.value.connectionId);
  if (!pending?.id || !conn) {
    uni.showToast({ title: "授权请求信息不完整", icon: "none" });
    return;
  }

  permissionSubmitting.value = true;
  pendingPermissionSubmittingOptionId.value = optionId;
  try {
    await acpApi.acpRespondPermission(conn, pending.id, optionId);
    runtime.clearPendingPermission(
      Number(props.conversationId || 0),
      pending.id,
    );
    usePetStore().addExp("user", 8);
    uni.showToast({ title: "已提交授权", icon: "success" });
  } catch (error) {
    uni.showToast({
      title: toErrorMessage(error, "授权失败"),
      icon: "none",
    });
  } finally {
    permissionSubmitting.value = false;
    pendingPermissionSubmittingOptionId.value = "";
  }
}

function showSharedLiveBlockedToast() {
  uni.showToast({
    title: "该会话正在其他端处理中，当前仅可旁观，待本轮结束后可发送",
    icon: "none",
    duration: 3000,
  });
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

.detail-interactive-pane--cyber:not(.detail-interactive-pane--cyber-active)
  :deep(*) {
  animation: none !important;
  transition: none !important;
}

</style>
