<script setup lang="ts">
import { computed, getCurrentInstance, ref, watch } from "vue"
import { toErrorMessage } from "@/services/gateway/error"
import { requeueWorkTask, retryWorkTask } from "@/services/workTask"
import { restartNotePlaceholder } from "../taskFollowUp"
import {
  duplicateActiveSource,
  duplicateActiveSourceLabel,
  type DuplicateActiveSource,
} from "../taskRestartGuard"
import type { CodegGateway } from "@/services/gateway"
import type { WorkTask } from "@/types/workTask"

/**
 * 重启一个任务：失败 → 重试（failed → queued），已取消 → 重新排队（canceled → todo）。
 *
 * 备注可选 —— 空备注就等于「原样再跑一次」。它会随下一轮提示词发给 agent，因为这两种
 * 停止通常都停在一个用户知道、agent 不知道的理由上。
 *
 * **forge 复活守卫**是这里唯一需要特殊处理的拒绝：如果同一个工作项上已经有另一个活着的
 * 任务，服务端会拒绝**每一次**重启。它显示在弹层内部（不是 toast），并把按钮换成
 * 「仍然重启」，因为它是唯一一个有出路的拒绝 —— 用户确认后带 `allowDuplicateSource`
 * 再发一次。
 */
const props = defineProps<{
  show: boolean
  task: WorkTask | null
  kind: "retry" | "requeue"
  gateway: CodegGateway | null
}>()

const emit = defineEmits<{
  (event: "update:show", value: boolean): void
  (event: "restarted"): void
}>()

const currentInstance = getCurrentInstance()
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

const note = ref("")
const submitting = ref(false)
const errorMessage = ref("")
const duplicate = ref<DuplicateActiveSource | null>(null)

const sheetTitle = computed(() => (props.kind === "retry" ? "重试任务" : "重新排队"))
const placeholder = computed(() => restartNotePlaceholder(props.kind))
const submitLabel = computed(() =>
  duplicate.value ? "仍然重启" : props.kind === "retry" ? "重试" : "重新排队"
)
const duplicateText = computed(() => {
  if (!duplicate.value) return ""
  const label = duplicateActiveSourceLabel(duplicate.value)
  return `${label} 已经在处理同一个工作项 —— 再启动这一张会让同一个工作项上同时活着两个任务。`
})

watch(
  () => props.show,
  (visible) => {
    if (!visible) return
    note.value = ""
    submitting.value = false
    errorMessage.value = ""
    duplicate.value = null
  }
)

function closeSheet() {
  emit("update:show", false)
}

/**
 * 提交。`allowDuplicateSource` **必须显式传** —— 直接把这个函数挂到 `@click` 上会让
 * 事件对象成为第一个参数，而任何事件对象都是 truthy，等于每次重启都豁免守卫。
 * 模板里因此写成 `@click="submit(duplicate != null)"`。
 */
async function submit(allowDuplicateSource: boolean) {
  if (!props.task || !props.gateway || submitting.value) return
  submitting.value = true
  errorMessage.value = ""
  const taskId = props.task.id
  const noteText = note.value.trim() || null
  try {
    if (props.kind === "retry") {
      await retryWorkTask(props.gateway, taskId, noteText, [], allowDuplicateSource)
    } else {
      await requeueWorkTask(props.gateway, taskId, noteText, [], allowDuplicateSource)
    }
    duplicate.value = null
    emit("update:show", false)
    emit("restarted")
  } catch (error) {
    // 只有复活守卫留在弹层里（它有出路）；其它失败也显示在这里，因为模态背后的
    // toast 读不到 —— 但它们没有「仍然重启」这条路。
    const parsed = duplicateActiveSource(error)
    if (parsed) {
      duplicate.value = parsed
    } else {
      errorMessage.value = toErrorMessage(error)
    }
    submitting.value = false
  }
}
</script>

<template>
  <up-popup :show="props.show" mode="bottom" :round="28" @close="closeSheet">
    <view class="task-sheet" :style="upThemeCardStyle">
      <view class="task-sheet__hd">
        <view class="task-restart__title-block">
          <text class="task-sheet__title">{{ sheetTitle }}</text>
          <text class="task-sheet__desc">
            可以补充一段说明（可选），它会随下一轮的提示词一起发给 agent。
          </text>
        </view>
        <view class="task-sheet__close" @click="closeSheet">
          <up-icon name="close" size="20" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
        </view>
      </view>

      <view class="task-form-group">
        <text class="task-form-label">补充说明（可选）</text>
        <up-textarea
          v-model="note"
          :placeholder="placeholder"
          autoHeight
          :maxlength="2000"
        ></up-textarea>
      </view>

      <view v-if="duplicate" class="task-notice task-notice--warning">
        <text class="task-notice__text">{{ duplicateText }}</text>
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
          @click="submit(duplicate != null)"
        >{{ submitLabel }}</up-button>
      </view>

      <view class="task-safe-bottom"></view>
    </view>
  </up-popup>
</template>

<style scoped lang="scss">
@import "../index.scss";

.task-restart__title-block {
  flex: 1;
  min-width: 0;
}
</style>
