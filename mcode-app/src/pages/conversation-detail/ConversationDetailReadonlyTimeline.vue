<template>
  <view class="readonly-pane" :style="messageListPageStyle">
    <scroll-view class="readonly-pane__scroll" scroll-y>
      <view class="readonly-pane__content" :style="messageListContentStyle">
        <view v-if="showWaitingState" class="empty-messages empty-messages--pending">
          <view class="pending-response-card">
            <view class="pending-response-card__pulse"></view>
            <view class="pending-response-card__badge">
              <view class="pending-response-card__badge-dot"></view>
              <text class="pending-response-card__badge-text">{{ waitingStateBadgeText }}</text>
            </view>
            <text class="pending-response-card__title">{{ waitingStateTitle }}</text>
            <text class="pending-response-card__desc">{{ waitingStateDescription }}</text>
          </view>
        </view>

        <view v-else-if="renderMessageItems.length === 0" class="readonly-pane__empty">
          <up-empty mode="message" text="会话暂无消息"></up-empty>
        </view>

        <template v-else>
          <view
            v-for="(item, index) in renderMessageItems"
            :key="item.key"
            class="message-item"
          >
            <MessageBubble
              :message="item.message"
              :agent-type="agentType"
              :showRegenerate="false"
            />
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
          </view>

          <view v-if="stats.totalTokens > 0" class="stats-bar">
            <up-icon name="file-text" size="14" color="#c0c4cc"></up-icon>
            <text class="stats-text">
              输入 {{ formatTokenCountK(stats.inputTokens) }} / 输出 {{ formatTokenCountK(stats.outputTokens) }} / 总计 {{ formatTokenCountK(stats.totalTokens) }}
            </text>
          </view>
        </template>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { computed, type StyleValue } from "vue"
import MessageBubble from "@/components/MessageBubble.vue"
import { useConversationRuntimeStore } from "@/stores/conversationRuntime"
import { buildRenderMessageItems } from "./detailMessagePresentation"
import { formatTokenCountK } from "./detailRuntimePresentation"
import {
  bottomGeneratingText as resolveBottomGeneratingText,
  waitingStateBadgeText as resolveWaitingStateBadgeText,
  waitingStateDescription as resolveWaitingStateDescription,
  waitingStateTitle as resolveWaitingStateTitle,
} from "./detailStatusPresentation"

const props = defineProps<{
  conversationId: number
  agentType?: string
  messageListPageStyle?: StyleValue
  messageListContentStyle?: StyleValue
}>()

const runtime = useConversationRuntimeStore()

const renderMessageItems = computed(() =>
  buildRenderMessageItems(runtime.getMessages(Number(props.conversationId || 0)))
)

const session = computed(() =>
  runtime.getOrCreateSession(Number(props.conversationId || 0))
)

const runtimeStatus = computed(() => String(session.value.status || "idle"))
const hasPendingInteraction = computed(() =>
  Boolean(session.value.pendingPermission || session.value.pendingQuestion)
)
const isWaitingRuntime = computed(() =>
  runtimeStatus.value === "connecting" ||
  runtimeStatus.value === "thinking" ||
  runtimeStatus.value === "running_tool" ||
  runtimeStatus.value === "waiting_permission" ||
  runtimeStatus.value === "waiting_question"
)
const showWaitingState = computed(() =>
  renderMessageItems.value.length === 0 && (isWaitingRuntime.value || hasPendingInteraction.value)
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
const waitingStateDescription = computed(() =>
  resolveWaitingStateDescription(runtimeStatus.value)
)

const stats = computed(() => {
  return session.value.stats || {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    turnCount: 0,
  }
})
</script>

<style scoped lang="scss">
.readonly-pane {
  box-sizing: border-box;
  width: 100%;
}

.readonly-pane__scroll {
  width: 100%;
  height: 100%;
}

.readonly-pane__content {
  min-height: 100%;
  max-width: 920rpx;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  box-sizing: content-box;
}

.readonly-pane__empty {
  min-height: 520rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
