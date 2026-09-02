<script setup lang="ts">
import { computed, getCurrentInstance, ref, watch } from "vue"
import { toErrorMessage } from "@/services/gateway/error"
import {
  deleteWorkTaskSettings,
  getWorkTaskSettingsOwn,
  getWorkTaskSettingsEffective,
  setWorkTaskSettings,
} from "@/services/workTask"
import TaskAgentConfigSheet from "./TaskAgentConfigSheet.vue"
import {
  buildAgentConfigContextKey,
  createEmptyDetailAgentConfigState,
  persistAgentConfigCache,
  readFreshAgentConfigCache,
  type DetailAgentConfigState,
} from "@/services/conversation/composerTools"
import {
  effectiveTaskAgentSelection,
  hasTaskAgentConfigChoices,
  INHERITED_TASK_AGENT_SELECTION,
  readTaskAgentSelection,
  taskAgentConfigPlaceholderState,
  taskAgentConfigStateFromSnapshot,
  taskAgentConfigSummary,
  taskAgentLabelSnapshot,
  withTaskAgentConfigValue,
  withTaskAgentMode,
  type TaskAgentConfigSelection,
} from "../taskAgentConfig"
import { AGENT_DISPLAY_ORDER, AGENT_LABELS } from "@/services/remoteSettings"
import type { CodegGateway } from "@/services/gateway"
import type { AgentOptionsSnapshot } from "@/types/acp"
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
  /**
   * 项目在远端的绝对路径，探测智能体选项时作为 `workingDir` 传过去（同一个 agent
   * 在不同目录下可能报出不同选项集）。全局作用域下为空 —— 那时探的是无目录上下文
   * 的默认选项集，与引擎在任意项目里启动前读到的那份一致。
   */
  folderPath?: string
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

/**
 * 默认 agent 的可选项。空串是「跟随文件夹默认」（`default_agent_type: null`），后面
 * 的标签取 `remoteSettings` 那份唯一映射，不本地抄一遍。
 */
const AGENT_OPTIONS = [
  { label: "跟随文件夹默认", value: "" },
  ...AGENT_DISPLAY_ORDER.map((value) => ({ label: AGENT_LABELS[value], value: value as string })),
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
const showAgentConfigSheet = ref(false)
const activeStage = ref("all")

/** 智能体选项的探测状态与当前选择（与编辑弹层同一套模块）。 */
const agentConfig = ref<DetailAgentConfigState>(createEmptyDetailAgentConfigState())
/** 设置行里存着的那份选择；探测失败时保存写回的就是它。 */
const storedSelection = ref<TaskAgentConfigSelection>({ ...INHERITED_TASK_AGENT_SELECTION })
let agentProbeToken = 0

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
const agentConfigSummary = computed(() =>
  taskAgentConfigSummary({
    state: agentConfig.value,
    stored: storedSelection.value,
    fallbackLabels: draft.value?.label_snapshot || null,
  })
)
const agentConfigOpenable = computed(
  () => agentConfig.value.status === "failed" || hasTaskAgentConfigChoices(agentConfig.value)
)
/**
 * 「跟随全局」时不探测、也不显示选项行：那一份配置属于全局那一行，在这里画出来会让
 * 用户以为改的是这个项目的（而保存走的是 delete，改动全部丢弃）。
 */
const editing = computed(() => isGlobalScope.value || source.value === "custom")
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
    if (!props.show) {
      // 在途探测作废，见编辑弹层同一处注释。
      agentProbeToken += 1
      showAgentConfigSheet.value = false
      return
    }
    void loadSettings()
  },
  { immediate: false }
)

/**
 * 探测跟着 (默认 agent, 作用域) 走，并且**只在真正编辑那一份时**发起 —— 「跟随全局」
 * 状态下探测出来的选项没有落点，白拉一个 CLI 进程。
 */
watch(
  () => [props.show, editing.value, draft.value?.default_agent_type || "", props.folderPath || ""] as const,
  ([visible, isEditing]) => {
    if (!visible || !isEditing) return
    void loadAgentConfig()
  }
)

async function loadSettings() {
  if (!props.gateway) {
    errorMessage.value = "缺少连接，无法读取任务设置。"
    return
  }
  loading.value = true
  errorMessage.value = ""
  activeStage.value = "all"
  agentConfig.value = taskAgentConfigPlaceholderState("idle")
  try {
    if (isGlobalScope.value) {
      // 全局行没有「跟随」这个概念 —— 它就是被跟随的那一份。
      source.value = "custom"
      draft.value = await getWorkTaskSettingsEffective(props.gateway, GLOBAL_SCOPE)
      storedSelection.value = readTaskAgentSelection(draft.value)
      reprojectStoredSelection()
      return
    }
    const own = await getWorkTaskSettingsOwn(props.gateway, props.folderId)
    source.value = own ? "custom" : "global"
    // 跟随全局时也要显示**生效**值，否则表单是一片默认值，用户看不到自己实际在用什么。
    draft.value = own || (await getWorkTaskSettingsEffective(props.gateway, props.folderId))
    storedSelection.value = readTaskAgentSelection(draft.value)
    reprojectStoredSelection()
  } catch (error) {
    errorMessage.value = toErrorMessage(error)
    draft.value = null
  } finally {
    loading.value = false
  }
}

/**
 * 设置行读回来之后，把它的那份选择重新投影到已有快照上。
 *
 * 需要这一步是因为**探测可能先于设置落地**：第二次打开同一个文件夹时，`default_agent_type`
 * 没变（上一次的 draft 还在），探测 watch 于是只被 `show` 触发一次，用的是上一次那份
 * `storedSelection`。不重投影的话，界面显示的是上次打开时的选择，而不是服务端这一行的
 * 真实值。与编辑弹层的同名函数同一个理由。
 */
function reprojectStoredSelection() {
  if (agentConfig.value.status !== "ready") return
  agentConfig.value = taskAgentConfigStateFromSnapshot(
    {
      modes: agentConfig.value.modes,
      config_options: agentConfig.value.configOptions,
    },
    storedSelection.value
  )
}

/** 见编辑弹层 `loadAgentConfig` 的注释 —— 同一套缓存键与丢弃规则。 */
async function loadAgentConfig() {
  const gateway = props.gateway
  const agentType = draft.value?.default_agent_type || ""
  if (!gateway || !agentType) {
    // 「跟随文件夹默认」时探不出东西来：真正要跑的 agent 由每个项目自己的默认值决定。
    agentConfig.value = taskAgentConfigPlaceholderState(
      "idle",
      "选择一个具体 agent 后可配置它的选项"
    )
    return
  }

  const token = ++agentProbeToken
  const contextKey = buildAgentConfigContextKey(
    gateway.getRemoteInstanceDescriptor().instanceKey,
    agentType,
    props.folderPath || "",
    "work_task"
  )
  const cached = readFreshAgentConfigCache(contextKey)
  if (cached) {
    agentConfig.value = taskAgentConfigStateFromSnapshot(cached, storedSelection.value)
    return
  }

  agentConfig.value = taskAgentConfigPlaceholderState("loading")
  try {
    const snapshot = await gateway.call<AgentOptionsSnapshot>("acp_describe_agent_options", {
      agentType,
      workingDir: props.folderPath || null,
    })
    if (token !== agentProbeToken) return
    persistAgentConfigCache(contextKey, snapshot)
    agentConfig.value = taskAgentConfigStateFromSnapshot(snapshot, storedSelection.value)
  } catch (error) {
    if (token !== agentProbeToken) return
    console.warn("probe task settings agent options failed:", error)
    agentConfig.value = taskAgentConfigPlaceholderState(
      "failed",
      "读取失败，保存后将沿用原有选项"
    )
  }
}

function closeSheet() {
  emit("update:show", false)
}

function onAgentConfirm(event: any) {
  const selected = event?.value?.[0]
  if (draft.value && selected && typeof selected.value === "string") {
    const next = selected.value || null
    if (next !== draft.value.default_agent_type) {
      draft.value.default_agent_type = next
      // 换 agent 就清空选项，理由同编辑弹层：取值只在原来那个 agent 下有意义。
      storedSelection.value = { ...INHERITED_TASK_AGENT_SELECTION }
      draft.value.mode_id = null
      draft.value.config_values = {}
      draft.value.label_snapshot = null
    }
  }
  showAgentPicker.value = false
}

function openAgentConfigSheet() {
  if (agentConfig.value.status === "loading") return
  showAgentConfigSheet.value = true
}

function selectAgentMode(modeId: string) {
  agentConfig.value = withTaskAgentMode(agentConfig.value, modeId)
}

function selectAgentConfigValue(payload: { configId: string; valueId: string }) {
  agentConfig.value = withTaskAgentConfigValue(
    agentConfig.value,
    payload.configId,
    payload.valueId
  )
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
      const agentType = draft.value.default_agent_type || ""
      // 存界面上正在显示的那份具体值（见 `taskAgentConfig.effectiveTaskAgentSelection`）。
      // 没定具体 agent 时选项无从解释，一并留空。
      const selection = agentType
        ? effectiveTaskAgentSelection(agentConfig.value, storedSelection.value)
        : { ...INHERITED_TASK_AGENT_SELECTION }
      await setWorkTaskSettings(props.gateway, props.folderId, {
        ...draft.value,
        mode_id: selection.mode_id,
        config_values: selection.config_values,
        label_snapshot: agentType
          ? taskAgentLabelSnapshot({
              agentType,
              state: agentConfig.value,
              selection,
            })
          : null,
      })
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

            <!-- 智能体选项（授权模式 / 模型 / 推理程度）。跟随全局时不画：那份配置
                 属于全局那一行，在这里改会在保存（走 delete）时全部丢弃。 -->
            <view v-if="editing" class="task-form-group">
              <text class="task-form-label">智能体选项</text>
              <view v-if="agentConfig.status === 'loading'" class="task-settings__config-loading">
                <up-loading-icon size="18" :color="upThemeVar('--up-primary', '#2979ff')"></up-loading-icon>
                <text class="task-form-helper">正在读取可用配置...</text>
              </view>
              <view
                v-else
                class="task-form-readonly"
                @click="agentConfigOpenable && openAgentConfigSheet()"
              >
                <text class="task-form-readonly__text">{{ agentConfigSummary }}</text>
                <up-icon
                  v-if="agentConfigOpenable"
                  name="arrow-right"
                  size="14"
                  :color="upThemeVar('--up-light-color', '#c0c4cc')"
                ></up-icon>
              </view>
              <text class="task-form-helper">
                {{
                  agentConfig.status === "failed"
                    ? "读取失败，保存后将沿用原有选项。"
                    : "新任务默认使用这些选项，每个任务仍可单独覆盖。"
                }}
              </text>
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

    <!-- 兄弟节点而不是嵌套，理由同编辑弹层。 -->
    <TaskAgentConfigSheet
      v-model:show="showAgentConfigSheet"
      :state="agentConfig"
      :hint="`${scopeName} 中新任务的默认选项。`"
      @selectMode="selectAgentMode"
      @selectConfigValue="selectAgentConfigValue"
      @reload="loadAgentConfig"
    />
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

.task-settings__config-loading {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 20rpx 24rpx;
  border-radius: 20rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.task-settings__config-loading .task-form-helper {
  margin-top: 0;
}
</style>
