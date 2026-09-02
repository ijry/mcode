<script setup lang="ts">
import { computed, getCurrentInstance, ref, watch } from "vue"
import { toErrorMessage } from "@/services/gateway/error"
import { getWorkTaskSettingsEffective, mergeWorkTask } from "@/services/workTask"
import type { CodegGateway } from "@/services/gateway"
import type { WorkTask } from "@/types/workTask"

/**
 * 验收一个待验收任务：合并。
 *
 * 合并本身由 agent 在任务自己的会话里完成（冲突在同一轮里解决），所以表单只剩两个
 * 选择：让 agent 自己写提交信息（默认），还是自己填一条；以及落地后是否删掉 worktree。
 *
 * 提交只等**派发**成功；结果通过 `task://changed` 事件到达（合并中 → 已完成，
 * 或退回待验收并在卡片上留下可读的错误）。
 *
 * 一个项目一次只落地一个任务，所以在别的合并进行中提交会被**排队** —— 弹层提前
 * 说明，按钮也换成「加入合并队列」。**拒绝信息显示在弹层内部**而不是 toast：
 * 模态背后弹出的 toast 是用户唯一读不到的消息，而「什么都没发生」正是那种读法。
 */
const props = defineProps<{
  show: boolean
  /** 打开时**捕获**的那一行。故意不跟随刷新 —— 否则任何一次列表刷新都会把
   *  用户半写的提交信息冲掉。 */
  task: WorkTask | null
  /** 同项目是否正有合并在跑（页面算，卡片看不到兄弟节点）。 */
  folderMerging: boolean
  /** 本任务是否已经在队列里：提交等于更新它的选项并保留原有名次。 */
  alreadyQueued: boolean
  gateway: CodegGateway | null
}>()

const emit = defineEmits<{
  (event: "update:show", value: boolean): void
  /** 派发成功。`queued` 为 true 表示被排队而不是立即开始。 */
  (event: "merged", queued: boolean): void
}>()

const currentInstance = getCurrentInstance()
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

const autoMessage = ref(true)
const message = ref("")
const deleteWorktree = ref(true)
const submitting = ref(false)
const errorMessage = ref("")

const willQueue = computed(() => props.folderMerging || props.alreadyQueued)
const sheetTitle = computed(() => (props.alreadyQueued ? "排队中的合并" : "合并任务"))
const submitLabel = computed(() => (willQueue.value ? "加入合并队列" : "合并"))
const description = computed(() => {
  const branch = props.task?.work_branch || "?"
  const base = props.task?.base_branch || "?"
  return `将 ${branch} 合并到 ${base}。worktree 中未提交的变更会先自动提交。`
})
const canSubmit = computed(
  () => !submitting.value && (autoMessage.value || message.value.trim().length > 0)
)

watch(
  () => props.show,
  (visible) => {
    if (!visible) return
    seedForm()
  }
)

/**
 * 每次打开都重新播种：已经排队的任务打开时回填它**挂起的那次合并**的选项 ——
 * 只为改一件事而重开，不能把当初排队时填的提交信息和 worktree 选择静默丢掉。
 */
function seedForm() {
  submitting.value = false
  errorMessage.value = ""
  const queued = props.task?.merge_queued || null
  autoMessage.value = queued ? queued.message == null : true
  message.value = queued?.message || props.task?.title || ""
  if (queued) {
    deleteWorktree.value = queued.delete_worktree
    return
  }
  // 没有挂起的合并就用文件夹的生效默认值。读取失败退回 true（与服务端内置默认一致）。
  deleteWorktree.value = true
  if (!props.gateway || !props.task) return
  const folderId = props.task.folder_id
  void getWorkTaskSettingsEffective(props.gateway, folderId)
    .then((settings) => {
      if (!props.show) return
      deleteWorktree.value = settings.delete_worktree_default
    })
    .catch(() => {
      if (!props.show) return
      deleteWorktree.value = true
    })
}

function closeSheet() {
  emit("update:show", false)
}

async function submit() {
  if (!props.task || !props.gateway || !canSubmit.value) return
  submitting.value = true
  errorMessage.value = ""
  try {
    const queued = await mergeWorkTask(
      props.gateway,
      props.task.id,
      autoMessage.value ? null : message.value.trim(),
      deleteWorktree.value
    )
    emit("update:show", false)
    emit("merged", queued)
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
        <view class="task-merge__title-block">
          <text class="task-sheet__title">{{ sheetTitle }}</text>
          <text class="task-sheet__desc">{{ description }}</text>
        </view>
        <view class="task-sheet__close" @click="closeSheet">
          <up-icon name="close" size="20" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
        </view>
      </view>

      <view v-if="willQueue" class="task-notice task-notice--warning">
        <text class="task-notice__text">
          {{
            props.alreadyQueued
              ? "该任务已在合并队列中。提交将更新它的合并选项，并保留原有的排队位置。"
              : "该项目正在合并另一个任务。此任务会加入队列，等前一个完成后自动开始。"
          }}
        </text>
      </view>

      <view class="task-form-switch">
        <view class="task-form-switch__copy">
          <text class="task-form-switch__title">让 agent 自动生成提交信息</text>
          <text class="task-form-switch__desc">关闭后可以自己填一条提交信息。</text>
        </view>
        <up-switch v-model="autoMessage" size="22"></up-switch>
      </view>

      <view v-if="!autoMessage" class="task-form-group">
        <text class="task-form-label">提交信息</text>
        <up-textarea
          v-model="message"
          placeholder="例如 feat: add login validation"
          autoHeight
          :maxlength="500"
        ></up-textarea>
      </view>

      <view class="task-form-switch">
        <view class="task-form-switch__copy">
          <text class="task-form-switch__title">合并后删除 worktree</text>
          <text class="task-form-switch__desc">落地成功后清理任务的工作目录与分支。</text>
        </view>
        <up-switch v-model="deleteWorktree" size="22"></up-switch>
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
        >{{ submitLabel }}</up-button>
      </view>

      <view class="task-safe-bottom"></view>
    </view>
  </up-popup>
</template>

<style scoped lang="scss">
@import "../index.scss";

.task-merge__title-block {
  flex: 1;
  min-width: 0;
}
</style>
