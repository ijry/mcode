<script setup lang="ts">
import { computed, getCurrentInstance, ref, watch } from "vue"
import { toErrorMessage } from "@/services/gateway/error"
import { returnWorkTask } from "@/services/workTask"
import {
  canSubmitFollowUp,
  DEFAULT_FOLLOW_UP_INTENT,
  followUpScenario,
  FOLLOW_UP_SCENARIOS,
} from "../taskFollowUp"
import type { CodegGateway } from "@/services/gateway"
import type { WorkTask, WorkTaskFollowUpIntent } from "@/types/workTask"

/**
 * 对待验收任务「继续处理」。
 *
 * 一个中性的输入框 + 四个意图 chip。意图决定服务端拿什么措辞包裹用户文本 ——
 * 同一句话在「改这里」「继续做」「解释一下」「再自查一遍」下要的行为完全不同
 * （见 `taskFollowUp.ts` 的说明）。
 *
 * 只有「自查验证」允许空文本提交：那本身就是一条完整指令，做成一键正是它的价值。
 */
const props = defineProps<{
  show: boolean
  task: WorkTask | null
  gateway: CodegGateway | null
}>()

const emit = defineEmits<{
  (event: "update:show", value: boolean): void
  (event: "sent"): void
}>()

const currentInstance = getCurrentInstance()
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

const intent = ref<WorkTaskFollowUpIntent>(DEFAULT_FOLLOW_UP_INTENT)
const feedback = ref("")
const submitting = ref(false)
const errorMessage = ref("")

const scenario = computed(() => followUpScenario(intent.value))
const canSubmit = computed(
  () => !submitting.value && canSubmitFollowUp(intent.value, feedback.value)
)

watch(
  () => props.show,
  (visible) => {
    if (!visible) return
    intent.value = DEFAULT_FOLLOW_UP_INTENT
    feedback.value = ""
    submitting.value = false
    errorMessage.value = ""
  }
)

function closeSheet() {
  emit("update:show", false)
}

async function submit() {
  if (!props.task || !props.gateway || !canSubmit.value) return
  submitting.value = true
  errorMessage.value = ""
  try {
    await returnWorkTask(
      props.gateway,
      props.task.id,
      feedback.value.trim(),
      intent.value,
      []
    )
    emit("update:show", false)
    emit("sent")
  } catch (error) {
    errorMessage.value = toErrorMessage(error)
    submitting.value = false
  }
}
</script>

<template>
  <up-popup :show="props.show" mode="bottom" :round="28" @close="closeSheet">
    <view class="task-sheet" :style="upThemeCardStyle">
      <view class="task-sheet__hd">
        <view class="task-followup__title-block">
          <text class="task-sheet__title">继续处理</text>
          <text class="task-sheet__desc">会在任务原有会话里继续，不会新建会话。</text>
        </view>
        <view class="task-sheet__close" @click="closeSheet">
          <up-icon name="close" size="20" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
        </view>
      </view>

      <view class="task-form-group">
        <text class="task-form-label">意图</text>
        <view class="task-chip-row">
          <view
            v-for="option in FOLLOW_UP_SCENARIOS"
            :key="option.intent"
            :class="['task-chip', intent === option.intent && 'task-chip--active']"
            @click="intent = option.intent"
          >
            <up-icon
              :name="option.icon"
              size="14"
              :color="intent === option.intent ? upThemeVar('--up-primary', '#2979ff') : upThemeVar('--up-tips-color', '#909193')"
            ></up-icon>
            <text class="task-chip__text">{{ option.label }}</text>
          </view>
        </view>
      </view>

      <view class="task-form-group">
        <text class="task-form-label">内容{{ scenario.allowsEmpty ? "（可选）" : "" }}</text>
        <up-textarea
          v-model="feedback"
          :placeholder="scenario.placeholder"
          autoHeight
          count
          :maxlength="4000"
        ></up-textarea>
      </view>

      <view v-if="errorMessage" class="task-notice task-notice--error">
        <text class="task-notice__text">{{ errorMessage }}</text>
      </view>

      <view class="task-sheet__actions">
        <up-button shape="circle" :disabled="submitting" @click="closeSheet">取消</up-button>
        <up-button
          type="primary"
          shape="circle"
          :loading="submitting"
          :disabled="!canSubmit"
          @click="submit"
        >发送</up-button>
      </view>

      <view class="task-safe-bottom"></view>
    </view>
  </up-popup>
</template>

<style scoped lang="scss">
@import "../index.scss";

.task-followup__title-block {
  flex: 1;
  min-width: 0;
}
</style>
