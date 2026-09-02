<script setup lang="ts">
import { computed, getCurrentInstance, ref, watch } from "vue"
import { toErrorMessage } from "@/services/gateway/error"
import {
  deleteWorkTaskSettings,
  getWorkTaskSettingsOwn,
  getWorkTaskSettingsEffective,
  setWorkTaskSettings,
} from "@/services/workTask"
import type { CodegGateway } from "@/services/gateway"
import type { WorkTaskFolderSettings } from "@/types/workTask"

/**
 * 任务设置。作用域是**某个项目**，或者全局默认（服务端约定 `folderId === 0` 是全局行）。
 *
 * 「配置来源」那两个 chip 是这个弹层最重要的一件事：一个项目要么**跟随全局**
 * （`work_task_settings_delete`，删掉自己那行），要么**单独配置**
 * （`work_task_settings_set`）。`work_task_settings_get_own` 返回 null 就是
 * 「跟随全局」—— 界面靠这个区分两者，而不是靠一个额外的布尔字段（那个会和真实状态失同步）。
 *
 * PC 端把设置分成常规/合并/Worktree/提示词四个 tab。手机上竖着排一屏滚完，
 * 但**字段与默认值必须完全一致** —— 两端改的是同一行 JSON。
 */
const GLOBAL_SCOPE = 0

const props = defineProps<{
  show: boolean
  /** 作用域项目 id；0 = 全局默认。 */
  folderId: number
  /** 项目名（标题里显示）；全局时为空。 */
  folderName: string
  gateway: CodegGateway | null
}>()

const emit = defineEmits<{
  (event: "update:show", value: boolean): void
  (event: "saved"): void
}>()

const currentInstance = getCurrentInstance()
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

const AGENT_OPTIONS = [
  { label: "跟随文件夹默认", value: "" },
  { label: "Claude Code", value: "claude_code" },
  { label: "Codex CLI", value: "codex" },
  { label: "OpenCode", value: "open_code" },
  { label: "Gemini CLI", value: "gemini" },
  { label: "OpenClaw", value: "open_claw" },
  { label: "Cline", value: "cline" },
]

const STAGE_TABS = [
  { id: "all", label: "全部阶段", hint: "追加到每一次发给 agent 的提示词，包括合并那一轮。" },
  { id: "work", label: "首次执行", hint: "任务首次执行时追加。" },
  { id: "retry", label: "重试", hint: "重试被中断或失败的任务时追加。" },
  { id: "return", label: "继续处理", hint: "对待验收的任务继续处理时追加。" },
  { id: "merge", label: "合并", hint: "agent 把任务合并到基线分支时追加。" },
]

const loading = ref(false)
const saving = ref(false)
const errorMessage = ref("")
/** null = 还没加载完；保存按钮据此禁用，避免把空表单写回去。 */
const draft = ref<WorkTaskFolderSettings | null>(null)
/** `custom` = 该项目有自己的设置行；`global` = 跟随全局。全局作用域下恒为 custom。 */
const source = ref<"global" | "custom">("custom")
const showAgentPicker = ref(false)
const activeStage = ref("all")

const isGlobalScope = computed(() => props.folderId === GLOBAL_SCOPE)
const scopeName = computed(() =>
  isGlobalScope.value ? "全部文件夹（全局默认）" : props.folderName || `项目 #${props.folderId}`
)
const agentColumns = computed(() => [
  AGENT_OPTIONS.map((item) => ({ text: item.label, value: item.value })),
])
const selectedAgentLabel = computed(() => {
  const value = draft.value?.default_agent_type || ""
  return AGENT_OPTIONS.find((item) => item.value === value)?.label || value
})
const activeStageHint = computed(
  () => STAGE_TABS.find((item) => item.id === activeStage.value)?.hint || ""
)
const activeStagePrompt = computed({
  get: () => draft.value?.stage_prompts?.[activeStage.value] || "",
  set: (value: string) => {
    if (!draft.value) return
    const next = { ...(draft.value.stage_prompts || {}) }
    if (value.trim()) next[activeStage.value] = value
    else delete next[activeStage.value]
    draft.value.stage_prompts = next
  },
})
const maxConcurrentText = computed({
  get: () => String(draft.value?.max_concurrent ?? 2),
  set: (value: string) => {
    if (!draft.value) return
    const parsed = Number(String(value).replace(/[^\d]/g, ""))
    draft.value.max_concurrent = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
  },
})

watch(
  () => [props.show, props.folderId],
  () => {
    if (!props.show) return
    void loadSettings()
  },
  { immediate: false }
)

async function loadSettings() {
  if (!props.gateway) {
    errorMessage.value = "缺少连接，无法读取任务设置。"
    return
  }
  loading.value = true
  errorMessage.value = ""
  activeStage.value = "all"
  try {
    if (isGlobalScope.value) {
      // 全局行没有「跟随」这个概念 —— 它就是被跟随的那一份。
      source.value = "custom"
      draft.value = await getWorkTaskSettingsEffective(props.gateway, GLOBAL_SCOPE)
      return
    }
    const own = await getWorkTaskSettingsOwn(props.gateway, props.folderId)
    source.value = own ? "custom" : "global"
    // 跟随全局时也要显示**生效**值，否则表单是一片默认值，用户看不到自己实际在用什么。
    draft.value = own || (await getWorkTaskSettingsEffective(props.gateway, props.folderId))
  } catch (error) {
    errorMessage.value = toErrorMessage(error)
    draft.value = null
  } finally {
    loading.value = false
  }
}

function closeSheet() {
  emit("update:show", false)
}

function onAgentConfirm(event: any) {
  const selected = event?.value?.[0]
  if (draft.value && selected && typeof selected.value === "string") {
    draft.value.default_agent_type = selected.value || null
  }
  showAgentPicker.value = false
}

async function save() {
  if (!props.gateway || !draft.value || saving.value) return
  saving.value = true
  errorMessage.value = ""
  try {
    // 选了「使用全局默认」就是删掉这个项目自己的行，而不是写一份等于全局的副本 ——
    // 后者会在全局改动后静默停止跟随。
    if (!isGlobalScope.value && source.value === "global") {
      await deleteWorkTaskSettings(props.gateway, props.folderId)
    } else {
      await setWorkTaskSettings(props.gateway, props.folderId, draft.value)
    }
    uni.showToast({ title: "已保存", icon: "success" })
    emit("update:show", false)
    emit("saved")
  } catch (error) {
    errorMessage.value = toErrorMessage(error)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <view class="task-settings-host">
    <up-popup :show="props.show" mode="bottom" :round="28" @close="closeSheet">
      <view class="task-sheet" :style="upThemeCardStyle">
        <view class="task-sheet__hd">
          <view class="task-settings__title-block">
            <text class="task-sheet__title">任务设置</text>
            <text class="task-sheet__desc">{{ scopeName }} 中任务的默认配置。</text>
          </view>
          <view class="task-sheet__close" @click="closeSheet">
            <up-icon name="close" size="20" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
          </view>
        </view>

        <view v-if="loading" class="task-settings__state">
          <up-loading-icon mode="circle" size="26" :color="upThemeVar('--up-primary', '#2979ff')"></up-loading-icon>
          <text class="task-form-helper">正在读取任务设置...</text>
        </view>

        <template v-else-if="draft">
          <scroll-view class="task-sheet__scroll" scroll-y enhanced>
            <view v-if="!isGlobalScope" class="task-form-group">
              <text class="task-form-label">配置来源</text>
              <view class="task-chip-row">
                <view
                  :class="['task-chip', source === 'global' && 'task-chip--active']"
                  @click="source = 'global'"
                >
                  <text class="task-chip__text">使用全局默认</text>
                </view>
                <view
                  :class="['task-chip', source === 'custom' && 'task-chip--active']"
                  @click="source = 'custom'"
                >
                  <text class="task-chip__text">单独配置</text>
                </view>
              </view>
              <text class="task-form-helper">
                {{
                  source === "global"
                    ? "跟随全局任务设置，全局改动会自动生效。"
                    : "为此项目保存独立设置，不再跟随全局默认。"
                }}
              </text>
            </view>

            <view class="task-form-group">
              <text class="task-form-label">默认 Agent</text>
              <view class="task-form-readonly" @click="showAgentPicker = true">
                <text class="task-form-readonly__text">{{ selectedAgentLabel }}</text>
                <up-icon name="arrow-down" size="14" :color="upThemeVar('--up-light-color', '#c0c4cc')"></up-icon>
              </view>
            </view>

            <view class="task-form-group">
              <text class="task-form-label">最大并发任务数</text>
              <up-input v-model="maxConcurrentText" type="number" border="surround"></up-input>
              <text class="task-form-helper">0 表示不限制。</text>
            </view>

            <view class="task-form-switch">
              <view class="task-form-switch__copy">
                <text class="task-form-switch__title">自动处理</text>
                <text class="task-form-switch__desc">待办任务自动开始处理，受并发上限约束。</text>
              </view>
              <up-switch v-model="draft.auto_process" size="22"></up-switch>
            </view>

            <view class="task-form-group">
              <text class="task-form-label">默认合并策略</text>
              <view class="task-chip-row">
                <view
                  :class="['task-chip', draft.merge_strategy === 'squash' && 'task-chip--active']"
                  @click="draft.merge_strategy = 'squash'"
                >
                  <text class="task-chip__text">合并为一条提交</text>
                </view>
                <view
                  :class="['task-chip', draft.merge_strategy === 'merge' && 'task-chip--active']"
                  @click="draft.merge_strategy = 'merge'"
                >
                  <text class="task-chip__text">保留完整提交历史</text>
                </view>
              </view>
            </view>

            <view class="task-form-switch">
              <view class="task-form-switch__copy">
                <text class="task-form-switch__title">自动合并</text>
                <text class="task-form-switch__desc">
                  任务进入待验收且有可合并改动时自动落地：提交信息由 agent 生成，是否删除
                  worktree 沿用下方默认。预检未通过或合并失败的任务会留下等你处理。
                </text>
              </view>
              <up-switch v-model="draft.auto_merge" size="22"></up-switch>
            </view>

            <view class="task-form-switch">
              <view class="task-form-switch__copy">
                <text class="task-form-switch__title">合并后删除 worktree</text>
                <text class="task-form-switch__desc">合并弹层里默认勾选，仍可临时改。</text>
              </view>
              <up-switch v-model="draft.delete_worktree_default" size="22"></up-switch>
            </view>

            <view class="task-form-group">
              <text class="task-form-label">Worktree 位置</text>
              <up-input
                :modelValue="draft.worktree_root || ''"
                placeholder="~/codeg-worktrees"
                border="surround"
                @update:modelValue="draft.worktree_root = $event || null"
              ></up-input>
              <text class="task-form-helper">
                新任务的 worktree 创建在该目录下，每个任务一个。留空则创建在项目文件夹的同级目录。
              </text>
            </view>

            <view class="task-form-group">
              <text class="task-form-label">预检命令</text>
              <up-input
                :modelValue="draft.preflight_command || ''"
                placeholder="pnpm test"
                border="surround"
                @update:modelValue="draft.preflight_command = $event || null"
              ></up-input>
              <text class="task-form-helper">任务进入待验收时在 worktree 中运行。</text>
            </view>

            <view class="task-form-group">
              <text class="task-form-label">Worktree 初始化命令</text>
              <up-input
                :modelValue="draft.init_command || ''"
                placeholder="pnpm install"
                border="surround"
                @update:modelValue="draft.init_command = $event || null"
              ></up-input>
              <text class="task-form-helper">新建 worktree 后、会话开始前执行。</text>
            </view>

            <view class="task-form-group">
              <text class="task-form-label">阶段提示词</text>
              <text class="task-form-helper">
                每个阶段都已内置固定提示词；这里填的内容作为补充说明追加到末尾，不会替换它们。
              </text>
              <view class="task-chip-row task-settings__stages">
                <view
                  v-for="stage in STAGE_TABS"
                  :key="stage.id"
                  :class="['task-chip', activeStage === stage.id && 'task-chip--active']"
                  @click="activeStage = stage.id"
                >
                  <text class="task-chip__text">{{ stage.label }}</text>
                </view>
              </view>
              <up-textarea
                v-model="activeStagePrompt"
                placeholder="例如：遵循 AGENTS.md 里的项目约定；始终用中文回复"
                autoHeight
                :maxlength="2000"
              ></up-textarea>
              <text class="task-form-helper">{{ activeStageHint }}</text>
            </view>

            <view v-if="errorMessage" class="task-notice task-notice--error">
              <text class="task-notice__text">{{ errorMessage }}</text>
            </view>
          </scroll-view>

          <up-button
            type="primary"
            shape="circle"
            :loading="saving"
            customStyle="margin-top:16rpx"
            @click="save"
          >保存</up-button>
        </template>

        <view v-else class="task-notice task-notice--error">
          <text class="task-notice__text">{{ errorMessage || "读取任务设置失败" }}</text>
        </view>

        <view class="task-safe-bottom"></view>
      </view>
    </up-popup>

    <up-picker
      :show="showAgentPicker"
      :columns="agentColumns"
      @confirm="onAgentConfirm"
      @cancel="showAgentPicker = false"
    ></up-picker>
  </view>
</template>

<style scoped lang="scss">
@import "../index.scss";

.task-settings__title-block {
  flex: 1;
  min-width: 0;
}

.task-settings__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14rpx;
  padding: 60rpx 0;
}

.task-settings__stages {
  margin: 14rpx 0;
}
</style>
