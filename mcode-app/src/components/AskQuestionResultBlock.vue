<template>
  <view class="ask-question-result">
    <view class="ask-question-result__summary" @click="toggleExpanded">
      <view class="ask-question-result__icon">
        <up-icon name="question-circle" size="14" :color="upThemeVar('--up-primary', '#2979ff')"></up-icon>
      </view>
      <view class="ask-question-result__main">
        <text class="ask-question-result__title">提问</text>
        <text class="ask-question-result__subtitle">{{ summaryText }}</text>
      </view>
      <up-icon
        :name="expanded ? 'arrow-up' : 'arrow-down'"
        size="12"
        :color="upThemeVar('--up-light-color', '#c0c4cc')"
      ></up-icon>
    </view>

    <view v-if="expanded" class="ask-question-result__body">
      <view v-if="errorText" class="ask-question-result__state ask-question-result__state--error">
        <text>{{ errorText }}</text>
      </view>

      <view v-else-if="isAwaiting" class="ask-question-result__state">
        <text>等待用户选择</text>
      </view>

      <view v-else-if="outcome?.declined" class="ask-question-result__state">
        <text>用户已跳过，智能体将自行判断。</text>
      </view>

      <view v-else-if="answerRows.length > 0" class="ask-question-result__answers">
        <view v-for="(row, index) in answerRows" :key="index" class="ask-question-answer">
          <text v-if="row.header" class="ask-question-answer__header">{{ row.header }}</text>
          <text v-if="row.question" class="ask-question-answer__question">{{ row.question }}</text>

          <view v-if="row.selected.length > 0 || row.other.length > 0" class="ask-question-answer__chips">
            <view v-for="label in row.selected" :key="`selected-${label}`" class="ask-question-answer-chip">
              <text class="ask-question-answer-chip__text">{{ splitLabel(label).text }}</text>
              <text v-if="splitLabel(label).recommended" class="ask-question-answer-chip__badge">推荐</text>
            </view>
            <view v-for="label in row.other" :key="`other-${label}`" class="ask-question-answer-chip ask-question-answer-chip--other">
              <text class="ask-question-answer-chip__text">{{ label }}</text>
            </view>
          </view>

          <text v-else class="ask-question-answer__empty">未选择</text>
        </view>
      </view>

      <view v-else class="ask-question-result__state">
        <text>未记录选择结果</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import type { ToolCall } from "@/types/acp"
import {
  matchSelections,
  parseAskQuestionInput,
  parseAskQuestionOutcome,
  splitRecommended,
} from "@/services/conversation/askQuestionResult"

const KEY_SEP = String.fromCharCode(31)

const props = defineProps<{
  toolCall: ToolCall
}>()

const expanded = ref(false)

const questions = computed(() => parseAskQuestionInput(props.toolCall.input))
const outcome = computed(() => parseAskQuestionOutcome(props.toolCall.output))
const errorText = computed(() => props.toolCall.error?.trim() || "")

const isAwaiting = computed(() => {
  return !errorText.value && !outcome.value && props.toolCall.status === "running"
})

const answerRows = computed(() => {
  const rawAnswers = outcome.value?.answers || []
  const rows = rawAnswers.map((answer) => {
    const question = findQuestion(answer.header, answer.question)
    const matched = matchSelections(
      answer.selected,
      question?.options.map((option) => option.label) || []
    )

    return {
      header: answer.header || question?.header || "",
      question: answer.question || question?.question || "",
      selected: matched.selected,
      other: matched.other,
    }
  })

  if (rows.length > 0) return rows

  return questions.value.map((question) => ({
    header: question.header,
    question: question.question,
    selected: [] as string[],
    other: [] as string[],
  }))
})

const summaryText = computed(() => {
  if (errorText.value) return "提问失败"
  if (isAwaiting.value) return "等待用户选择"
  if (outcome.value?.declined) return "用户已跳过"

  const selected = answerRows.value.flatMap((row) => [...row.selected, ...row.other])
  if (selected.length > 0) return selected.join("，")
  return "已回答"
})

function toggleExpanded() {
  expanded.value = !expanded.value
}

function splitLabel(label: string) {
  return splitRecommended(label)
}

function findQuestion(header: string, question: string) {
  const bySignature = new Map(
    questions.value.map((item) => [`${item.header}${KEY_SEP}${item.question}`, item])
  )
  return bySignature.get(`${header}${KEY_SEP}${question}`)
}
</script>

<style scoped lang="scss">
.ask-question-result {
  border-radius: 14rpx;
  border: 1rpx solid color-mix(in srgb, var(--up-primary, #2979ff) 30%, var(--up-border-color, #dadbde) 70%);
  background-color: var(--up-card-bg-color, #ffffff);
  overflow: hidden;
}

.ask-question-result__summary {
  min-height: 52rpx;
  padding: 10rpx 16rpx;
  display: flex;
  align-items: center;
  gap: 12rpx;
  box-sizing: border-box;

  &:active {
    background-color: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  }
}

.ask-question-result__icon {
  width: 40rpx;
  height: 40rpx;
  border-radius: 12rpx;
  background-color: color-mix(in srgb, var(--up-primary, #2979ff) 12%, var(--up-card-bg-color, #ffffff) 88%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.ask-question-result__main {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.ask-question-result__title {
  flex-shrink: 0;
  font-size: 23rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.ask-question-result__subtitle {
  min-width: 0;
  flex: 1;
  font-size: 22rpx;
  color: var(--up-content-color, #606266);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ask-question-result__body {
  padding: 0 16rpx 16rpx;
}

.ask-question-result__state {
  padding: 14rpx 16rpx;
  border-radius: 12rpx;
  background-color: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  font-size: 23rpx;
  line-height: 1.45;
  color: var(--up-content-color, #606266);
  white-space: pre-wrap;
  word-break: break-word;
}

.ask-question-result__state--error {
  color: var(--up-error, #fa3534);
  background-color: color-mix(in srgb, var(--up-error, #fa3534) 10%, var(--up-card-bg-color, #ffffff) 90%);
}

.ask-question-result__answers {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.ask-question-answer {
  padding: 14rpx 16rpx;
  border-radius: 12rpx;
  background-color: color-mix(in srgb, var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6)) 76%, var(--up-card-bg-color, #ffffff) 24%);
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.ask-question-answer__header {
  font-size: 21rpx;
  color: var(--up-tips-color, #909193);
}

.ask-question-answer__question {
  font-size: 24rpx;
  font-weight: 600;
  line-height: 1.35;
  color: var(--up-main-color, #303133);
}

.ask-question-answer__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
}

.ask-question-answer-chip {
  max-width: 100%;
  min-height: 42rpx;
  padding: 0 14rpx;
  border-radius: 999rpx;
  background-color: var(--up-primary, #2979ff);
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  box-sizing: border-box;
}

.ask-question-answer-chip--other {
  background-color: color-mix(in srgb, var(--up-primary, #2979ff) 14%, var(--up-card-bg-color, #ffffff) 86%);
  border: 1rpx solid color-mix(in srgb, var(--up-primary, #2979ff) 36%, var(--up-border-color, #dadbde) 64%);

  .ask-question-answer-chip__text {
    color: var(--up-primary, #2979ff);
  }
}

.ask-question-answer-chip__text {
  min-width: 0;
  font-size: 22rpx;
  line-height: 1.2;
  color: #ffffff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ask-question-answer-chip__badge {
  padding: 1rpx 6rpx;
  border-radius: 999rpx;
  background-color: rgba(255, 255, 255, 0.22);
  font-size: 18rpx;
  line-height: 1.2;
  color: #ffffff;
}

.ask-question-answer__empty {
  font-size: 22rpx;
  color: var(--up-tips-color, #909193);
}
</style>
