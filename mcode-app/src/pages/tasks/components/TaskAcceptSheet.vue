<script setup lang="ts">
import { computed, getCurrentInstance, ref, watch } from "vue"
import { toErrorMessage } from "@/services/gateway/error"
import {
  completeWorkTask,
  deliverWorkTaskPr,
  getWorkTaskSettingsEffective,
} from "@/services/workTask"
import { isWorktreeGone, mustDeliverToPr, usesMergeRequests } from "../taskAcceptance"
import type { CodegGateway } from "@/services/gateway"
import type { WorkTask } from "@/types/workTask"

/**
 * 另外两种验收方式，共用一个弹层因为它们的形状一样（一句说明 + 至多一个选项 + 确认），
 * 而且都**同步落定**：没有 agent 参与，命令返回时任务已经是 done，所以失败信息属于
 * 弹层本身而不是卡片。
 *
 * - `mode === "complete"`：任务什么都没改（或 worktree 已经没了），无需合并，直接标记完成。
 * - `mode === "deliver"`：把分支推到 forge。issue 来源新建 PR（可填标题、可草稿）；
 *   PR 来源推回它自己的头分支 —— 不新建任何东西，所以那时**没有**标题与草稿字段。
 */
const props = defineProps<{
  show: boolean
  mode: "complete" | "deliver"
  task: WorkTask | null
  gateway: CodegGateway | null
}>()

const emit = defineEmits<{
  (event: "update:show", value: boolean): void
  (event: "done", payload: { mode: "complete" | "deliver"; url: string }): void
}>()

const currentInstance = getCurrentInstance()
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

const deleteWorktree = ref(true)
const prTitle = ref("")
const draft = ref(false)
const submitting = ref(false)
const errorMessage = ref("")

const worktreeGone = computed(() => (props.task ? isWorktreeGone(props.task) : false))
/** worktree 还在才给「删掉它」这个选择；没了的时候连这个选项都该消失。 */
const hasWorktree = computed(
  () => props.task?.worktree_folder_id != null && !worktreeGone.value
)
const pushBack = computed(() => (props.task ? mustDeliverToPr(props.task) : false))
const mr = computed(() => usesMergeRequests(props.task))

const sheetTitle = computed(() => {
  if (props.mode === "complete") return "完成任务"
  if (pushBack.value) return mr.value ? "推回该合并请求" : "推回该 Pull Request"
  return mr.value ? "推送并创建 MR" : "推送并创建 PR"
})

const description = computed(() => {
  if (props.mode === "complete") {
    return worktreeGone.value
      ? "该任务的 worktree 已被删除，无法再合并，将直接标记为已完成。若工作分支上仍有未合并的提交，分支会被保留。"
      : "该任务没有改动任何文件，无需合并，将直接标记为已完成。"
  }
  const meta = props.task?.source_meta
  const repo = meta?.owner_repo || "来源仓库"
  if (pushBack.value) {
    const number = meta?.number ?? ""
    const branch = meta?.head_ref || "头分支"
    return `把这个任务的提交推到 ${repo}#${number} 的 ${branch}。不会新建任何东西 —— 工作直接进入已经存在的那个评审。`
  }
  const base = props.task?.base_branch || "基线分支"
  return `把该任务的分支推送到 ${repo}，并向 ${base} 创建${mr.value ? "合并请求" : " Pull Request"}。正文会自动关联来源 Issue。`
})

const submitLabel = computed(() => {
  if (props.mode === "complete") return "完成"
  return pushBack.value ? "推送" : "推送并创建"
})

watch(
  () => props.show,
  (visible) => {
    if (!visible) return
    submitting.value = false
    errorMessage.value = ""
    draft.value = false
    prTitle.value = props.task?.title || ""
    // 与合并弹层同一个种子：文件夹的 worktree 清理默认值。
    deleteWorktree.value = true
    if (props.mode !== "complete" || !props.gateway || !props.task) return
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
)

function closeSheet() {
  emit("update:show", false)
}

async function submit() {
  if (!props.task || !props.gateway || submitting.value) return
  submitting.value = true
  errorMessage.value = ""
  try {
    if (props.mode === "complete") {
      await completeWorkTask(
        props.gateway,
        props.task.id,
        hasWorktree.value && deleteWorktree.value
      )
      emit("update:show", false)
      emit("done", { mode: "complete", url: "" })
      return
    }
    // 推回时不带标题与草稿标记 —— 它不创建任何东西，服务端也会忽略这两个字段。
    const url = pushBack.value
      ? await deliverWorkTaskPr(props.gateway, props.task.id, null, false)
      : await deliverWorkTaskPr(
          props.gateway,
          props.task.id,
          prTitle.value.trim() || null,
          draft.value
        )
    emit("update:show", false)
    emit("done", { mode: "deliver", url })
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
        <view class="task-accept__title-block">
          <text class="task-sheet__title">{{ sheetTitle }}</text>
          <text class="task-sheet__desc">{{ description }}</text>
        </view>
        <view class="task-sheet__close" @click="closeSheet">
          <up-icon name="close" size="20" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
        </view>
      </view>

      <view v-if="props.mode === 'complete' && hasWorktree" class="task-form-switch">
        <view class="task-form-switch__copy">
          <text class="task-form-switch__title">完成后删除 worktree</text>
        </view>
        <up-switch v-model="deleteWorktree" size="22"></up-switch>
      </view>

      <template v-if="props.mode === 'deliver' && !pushBack">
        <view class="task-form-group">
          <text class="task-form-label">{{ mr ? "合并请求标题" : "PR 标题" }}</text>
          <up-input v-model="prTitle" border="surround" :disabled="submitting"></up-input>
        </view>
        <view class="task-form-switch">
          <view class="task-form-switch__copy">
            <text class="task-form-switch__title">创建为草稿</text>
          </view>
          <up-switch v-model="draft" size="22" :disabled="submitting"></up-switch>
        </view>
      </template>

      <view v-if="errorMessage" class="task-notice task-notice--error">
        <text class="task-notice__text">{{ errorMessage }}</text>
      </view>

      <view class="task-sheet__actions">
        <up-button shape="circle" :disabled="submitting" @click="closeSheet">取消</up-button>
        <up-button
          type="primary"
          shape="circle"
          :loading="submitting"
          @click="submit"
        >{{ submitLabel }}</up-button>
      </view>

      <view class="task-safe-bottom"></view>
    </view>
  </up-popup>
</template>

<style scoped lang="scss">
@import "../index.scss";

.task-accept__title-block {
  flex: 1;
  min-width: 0;
}
</style>
