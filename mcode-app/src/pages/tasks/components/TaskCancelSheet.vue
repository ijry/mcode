<script setup lang="ts">
import { computed, getCurrentInstance, ref, watch } from "vue"
import { toErrorMessage } from "@/services/gateway/error"
import { cancelWorkTask } from "@/services/workTask"
import type { CodegGateway } from "@/services/gateway"
import type { WorkTask } from "@/types/workTask"

/**
 * 停止任务，并留个记录。
 *
 * 取消几乎总有一个界面推断不出来的理由 —— 方向不对、需求变了、点错了 —— 而那正是
 * 几周后要重新排队的人想读到的东西。理由落在推进记录的 `canceled` 条目上，它是给
 * 人看的备注，**不会**进入后续运行的提示词（重新排队自己带备注）。
 *
 * 理由刻意可选：一次没有解释的停止仍然是正当的停止，所以确认按钮从不等这个输入框。
 * 待验收任务的「放弃」走的是同一个后端迁移、同一个弹层。
 */
const props = defineProps<{
  show: boolean
  task: WorkTask | null
  gateway: CodegGateway | null
}>()

const emit = defineEmits<{
  (event: "update:show", value: boolean): void
  (event: "canceled"): void
}>()

const currentInstance = getCurrentInstance()
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

const reason = ref("")
const submitting = ref(false)
const errorMessage = ref("")

const isAbandon = computed(() => props.task?.status === "review")
const sheetTitle = computed(() => (isAbandon.value ? "放弃该任务？" : "取消任务？"))
const description = computed(() =>
  isAbandon.value
    ? "任务将变为已取消，验收结果不会落地。worktree 会保留，之后可以重新排队。"
    : "任务将变为已取消。worktree 会保留，之后可以重新排队。"
)

watch(
  () => props.show,
  (visible) => {
    if (!visible) return
    // 每次打开都给一个干净的框 —— 一个理由属于这一次取消，不属于下一次。
    reason.value = ""
    submitting.value = false
    errorMessage.value = ""
  }
)

function closeSheet() {
  emit("update:show", false)
}

async function submit() {
  if (!props.task || !props.gateway || submitting.value) return
  submitting.value = true
  errorMessage.value = ""
  try {
    await cancelWorkTask(props.gateway, props.task.id, reason.value.trim() || null)
    emit("update:show", false)
    emit("canceled")
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
        <view class="task-cancel__title-block">
          <text class="task-sheet__title">{{ sheetTitle }}</text>
          <text class="task-sheet__desc">{{ description }}</text>
        </view>
        <view class="task-sheet__close" @click="closeSheet">
          <up-icon name="close" size="20" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
        </view>
      </view>

      <view class="task-form-group">
        <text class="task-form-label">取消原因（可选）</text>
        <up-textarea
          v-model="reason"
          placeholder="例如：方向不对，我重写一下任务描述"
          autoHeight
          :maxlength="500"
        ></up-textarea>
      </view>

      <view v-if="errorMessage" class="task-notice task-notice--error">
        <text class="task-notice__text">{{ errorMessage }}</text>
      </view>

      <view class="task-sheet__actions">
        <up-button shape="circle" :disabled="submitting" @click="closeSheet">先不取消</up-button>
        <up-button
          type="error"
          shape="circle"
          :loading="submitting"
          @click="submit"
        >{{ isAbandon ? "放弃任务" : "取消任务" }}</up-button>
      </view>

      <view class="task-safe-bottom"></view>
    </view>
  </up-popup>
</template>

<style scoped lang="scss">
@import "../index.scss";

.task-cancel__title-block {
  flex: 1;
  min-width: 0;
}
</style>
