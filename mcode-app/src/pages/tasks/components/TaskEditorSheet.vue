<script setup lang="ts">
import { computed, getCurrentInstance, ref, watch } from "vue"
import { toErrorMessage } from "@/services/gateway/error"
import {
  deleteWorkTaskTemplate,
  getWorkTaskSettingsEffective,
  listWorkTaskTemplates,
  saveWorkTaskTemplate,
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
import type { WorkTask, WorkTaskDraft, WorkTaskTemplate } from "@/types/workTask"

/**
 * 新建 / 编辑任务的底部弹层。
 *
 * 一个组件承担两件事（与 `TodoCreatePopup` 同样的取舍）：`task` 为空是新建，
 * 非空是编辑。它们的字段完全一致，拆成两个组件只会让「保存」这条路出现两份实现。
 *
 * 职责边界（照 `CreateConversationSheet` 的接缝切）：
 * - 表单状态、模板列表、agent 覆盖的 dirty 判定归组件；
 * - 真正的 create / update 调用与随后的列表刷新归页面（`@submit` 抛出 draft）。
 *   这条缝必须在这里 —— 提交成功后弹层就关了，收尾逻辑若留在组件里会跑在
 *   已经隐藏的组件上。
 *
 * agent 覆盖的关键行为：**没碰过就不写**。控件展示的是文件夹的生效设置，
 * `agentDirty` 为 false 时 draft 里 `agent_type` 是 null（继续继承）；只有用户
 * 显式改过才作为本任务的覆盖值保存。冻结一份"当时的默认值"会让文件夹改了默认
 * 之后这个任务莫名其妙还在用旧 agent。
 *
 * **智能体选项（授权模式 / 模型 / 推理程度）与 agent 共享同一个 dirty 位**：它们是
 * 一组三件套 —— `mode_id` / `config_values` 的取值只在某个 agent 下有意义（`opus-4.6`
 * 对 Codex 毫无意义），单独覆盖其中一项而让 agent 继续继承，会在文件夹换了默认 agent
 * 之后留下一份跨 agent 的垃圾配置。这也是 PC 端
 * `codeg-plus/src/components/tasks/task-editor-dialog.tsx` 的做法（一个 `agentDirty`
 * 管三样，换 agent 时清空另外两样）。
 */
const props = defineProps<{
  show: boolean
  /** 要编辑的任务；null = 新建。 */
  task: WorkTask | null
  /** 可选的项目列表（页面按当前连接筛好传进来）。 */
  projects: { id: number; name: string; path: string }[]
  /** 新建时预选的项目 id（列表页的项目筛选）。 */
  defaultFolderId: number
  /** 拉取生效设置与模板用的网关；为空时这两件事跳过（表单仍可用）。 */
  gateway: CodegGateway | null
}>()

const emit = defineEmits<{
  (event: "update:show", value: boolean): void
  (event: "submit", draft: WorkTaskDraft): void
}>()

const currentInstance = getCurrentInstance()
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

/**
 * 可选 agent 列表。取 `remoteSettings` 那份**唯一**标签映射，不再本地抄一遍 ——
 * 此前这里的副本把 codex 写成「Codex CLI」而全局那份是「Codex」，同一个 agent 在任务
 * 弹层和别处显示成两个名字（`CreateConversationSheet` 已经踩过并记录了同一个坑）。
 */
const AGENT_OPTIONS = AGENT_DISPLAY_ORDER.map((value) => ({
  label: AGENT_LABELS[value],
  value: value as string,
}))

const title = ref("")
const prompt = ref("")
const folderId = ref(0)
const agentDirty = ref(false)
const agentType = ref("claude_code")
const showProjectPicker = ref(false)
const showAgentPicker = ref(false)
const showAgentConfigSheet = ref(false)
const showTemplatePanel = ref(false)
const templates = ref<WorkTaskTemplate[]>([])
const templateName = ref("")
const templateBusy = ref(false)
const errorMessage = ref("")

/**
 * 智能体选项的探测状态与当前选择（形状与新建会话弹层、会话详情 composer 同源）。
 */
const agentConfig = ref<DetailAgentConfigState>(createEmptyDetailAgentConfigState())
/**
 * 记录里存着的那份选择（本任务的覆盖值，或继承来的文件夹默认值）。探测结果按它投影，
 * 探测失败时它就是要写回去的东西 —— 一次读取失败不该把用户配好的选项清空。
 */
const storedSelection = ref<TaskAgentConfigSelection>({ ...INHERITED_TASK_AGENT_SELECTION })
/** 上次保存时记下的人类可读名字；探测不到时靠它显示「Opus 4.6」而不是一串 id。 */
const storedLabels = ref<Record<string, unknown> | null>(null)
/** 在途探测的序号 —— 切项目/切 agent/关弹层后回来的旧响应据此丢弃。 */
let agentProbeToken = 0

const isEdit = computed(() => props.task != null)
const sheetTitle = computed(() => (isEdit.value ? "编辑任务" : "新建任务"))

const projectColumns = computed(() => [
  props.projects.map((project) => ({
    text: project.name || project.path || `项目 #${project.id}`,
    value: project.id,
  })),
])
// up-picker 的列既可以是纯字符串也可以是 `{text, value}`；这里与项目 Picker 统一用
// 对象形式，`onAgentConfirm` 才能直接读到 value 而不必反查 label。
const agentColumns = computed(() => [
  AGENT_OPTIONS.map((item) => ({ text: item.label, value: item.value })),
])

const selectedProjectName = computed(() => {
  const project = props.projects.find((item) => item.id === folderId.value)
  return project ? project.name || project.path : ""
})
/** 探测要带上项目路径：同一个 agent 在不同目录下可能报出不同的选项集。 */
const selectedProjectPath = computed(
  () => props.projects.find((item) => item.id === folderId.value)?.path || ""
)
const selectedAgentLabel = computed(
  () => AGENT_OPTIONS.find((item) => item.value === agentType.value)?.label || agentType.value
)
const agentConfigSummary = computed(() =>
  taskAgentConfigSummary({
    state: agentConfig.value,
    stored: storedSelection.value,
    fallbackLabels: storedLabels.value,
  })
)
const agentConfigOpenable = computed(
  () => agentConfig.value.status === "failed" || hasTaskAgentConfigChoices(agentConfig.value)
)

const canSubmit = computed(
  () => title.value.trim().length > 0 && prompt.value.trim().length > 0 && folderId.value > 0
)

/**
 * 项目选择在**已经有 worktree**之后必须锁死：任务的 worktree 是从那个项目切出来的，
 * 换项目会让分支与基线指向不同仓库。服务端也会拒绝，这里先把控件关掉，免得用户
 * 白填一遍。
 */
const folderLocked = computed(() => props.task?.worktree_folder_id != null)

watch(
  () => props.show,
  (visible) => {
    if (!visible) {
      // 关闭时推进一格：在途探测回来后会发现 token 变了而放弃写入，否则一次慢请求
      // 会在弹层已经关掉（甚至下次打开成另一个任务）之后覆盖状态。
      agentProbeToken += 1
      showAgentConfigSheet.value = false
      return
    }
    seedForm()
    void loadTemplates()
    void syncEffectiveAgent()
  }
)

// 项目换了、且用户没手动改过 agent 时，重新按新项目的生效设置回填。
watch(folderId, () => {
  if (!props.show) return
  void syncEffectiveAgent()
})

/**
 * 选项探测跟着 (agent, 项目路径) 走。项目也算在内 —— 探测是在那个目录里现拉一个 agent
 * 做的，同一个 agent 在不同项目下可能报出不同的选项集（项目级配置）。
 */
watch(
  () => [props.show, agentType.value, selectedProjectPath.value] as const,
  ([visible]) => {
    if (!visible) return
    void loadAgentConfig()
  }
)

function seedForm() {
  errorMessage.value = ""
  showTemplatePanel.value = false
  templateName.value = ""
  const task = props.task
  if (task) {
    title.value = task.title
    prompt.value = task.config?.display_text || ""
    folderId.value = task.folder_id
    agentDirty.value = task.config?.agent_type != null
    agentType.value = task.config?.agent_type || "claude_code"
    // 任务自己有覆盖值时读它；否则留空等 `syncEffectiveAgent` 用文件夹的生效设置回填。
    storedSelection.value = agentDirty.value
      ? readTaskAgentSelection(task.config)
      : { ...INHERITED_TASK_AGENT_SELECTION }
    storedLabels.value = task.config?.label_snapshot || null
    return
  }
  title.value = ""
  prompt.value = ""
  folderId.value =
    props.defaultFolderId > 0 ? props.defaultFolderId : props.projects[0]?.id || 0
  agentDirty.value = false
  agentType.value = "claude_code"
  storedSelection.value = { ...INHERITED_TASK_AGENT_SELECTION }
  storedLabels.value = null
}

/**
 * 用户没碰过 agent 时，把控件显示成该项目**生效**的默认值。失败静默 ——
 * 拿不到设置只意味着控件显示 claude_code，提交时仍然是 null（继承），
 * 不会因为一次读取失败就把错的 agent 冻进任务里。
 *
 * 三样一起回填：agent 与它的 mode / config 是一组，只回填 agent 会让选项行显示成
 * 「使用远端默认配置」，而实际上文件夹里配了模型。
 */
async function syncEffectiveAgent() {
  if (agentDirty.value || !props.gateway || folderId.value <= 0) return
  try {
    const settings = await getWorkTaskSettingsEffective(props.gateway, folderId.value)
    if (agentDirty.value) return
    agentType.value = settings.default_agent_type || "claude_code"
    storedSelection.value = readTaskAgentSelection(settings)
    storedLabels.value = settings.label_snapshot || null
    // 探测已经落地时把继承来的那份选择投影上去（探测比设置先回来是常态）。
    reprojectStoredSelection()
  } catch (error) {
    console.warn("load effective task settings failed:", error)
  }
}

/**
 * 探测这个 agent 在这个项目下能配什么。
 *
 * 缓存复用 `composerTools` 那套（5 分钟 TTL，与新建会话弹层同源），`scope` 传固定的
 * `"work_task"`：任务的选择存在服务端记录里，不该和会话 composer 的本机记忆串台，
 * 但同一台连接上多个任务探测同一个 agent 时可以共用快照。
 *
 * **依赖里刻意不含 `props.gateway`**：它是个对象，而列表每次刷新都会重建连接桶（因此
 * 换一个新的 gateway 实例）。把它放进 watch 会让一次后台刷新重新投影状态，把用户刚在
 * 弹层里选好的取值冲掉。`selectedProjectPath` 是字符串所以没有这个问题。
 */
async function loadAgentConfig() {
  const gateway = props.gateway
  if (!gateway) {
    agentConfig.value = taskAgentConfigPlaceholderState(
      "idle",
      "连接不可用，保存后将沿用原有选项"
    )
    return
  }
  if (!agentType.value) {
    agentConfig.value = taskAgentConfigPlaceholderState("idle")
    return
  }

  const token = ++agentProbeToken
  const contextKey = buildAgentConfigContextKey(
    gateway.getRemoteInstanceDescriptor().instanceKey,
    agentType.value,
    selectedProjectPath.value,
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
      agentType: agentType.value,
      workingDir: selectedProjectPath.value || null,
    })
    if (token !== agentProbeToken) return
    persistAgentConfigCache(contextKey, snapshot)
    agentConfig.value = taskAgentConfigStateFromSnapshot(snapshot, storedSelection.value)
  } catch (error) {
    if (token !== agentProbeToken) return
    console.warn("probe task agent options failed:", error)
    agentConfig.value = taskAgentConfigPlaceholderState(
      "failed",
      "读取失败，保存后将沿用原有选项"
    )
  }
}

/** 存储那份选择变了（生效设置回来了、套了模板）时，重新投影到已有快照上。 */
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

async function loadTemplates() {
  if (!props.gateway) return
  try {
    templates.value = await listWorkTaskTemplates(props.gateway)
  } catch (error) {
    console.warn("load task templates failed:", error)
    templates.value = []
  }
}

function closeSheet() {
  emit("update:show", false)
}

function onProjectConfirm(event: any) {
  const selected = event?.value?.[0]
  if (selected && typeof selected.value === "number") {
    folderId.value = selected.value
  }
  showProjectPicker.value = false
}

function onAgentConfirm(event: any) {
  const selected = event?.value?.[0]
  const option =
    (selected && typeof selected.value === "string"
      ? AGENT_OPTIONS.find((item) => item.value === selected.value)
      : null) ||
    (typeof selected === "string"
      ? AGENT_OPTIONS.find((item) => item.label === selected)
      : null)
  if (option && option.value !== agentType.value) {
    agentType.value = option.value
    // 显式选过就是覆盖 —— 从这一刻起 draft 会带上 agent_type。
    agentDirty.value = true
    // 换 agent 就清空选项：`opus-4.6` 这种取值只在原来那个 agent 下有意义，留着会在
    // 新 agent 上变成一份必被拒绝（或更糟：静默忽略）的配置。新的探测会填上新默认值。
    storedSelection.value = { ...INHERITED_TASK_AGENT_SELECTION }
    storedLabels.value = null
  } else if (option) {
    agentDirty.value = true
  }
  showAgentPicker.value = false
}

function resetAgentOverride() {
  agentDirty.value = false
  storedSelection.value = { ...INHERITED_TASK_AGENT_SELECTION }
  storedLabels.value = null
  void syncEffectiveAgent()
}

function openAgentConfigSheet() {
  if (agentConfig.value.status === "loading") return
  showAgentConfigSheet.value = true
}

/** 动一下选项也算覆盖本任务 —— 与改 agent 同一个 dirty 位，见组件头部说明。 */
function selectAgentMode(modeId: string) {
  agentConfig.value = withTaskAgentMode(agentConfig.value, modeId)
  agentDirty.value = true
}

function selectAgentConfigValue(payload: { configId: string; valueId: string }) {
  agentConfig.value = withTaskAgentConfigValue(
    agentConfig.value,
    payload.configId,
    payload.valueId
  )
  agentDirty.value = true
}

/**
 * 组装 draft。
 *
 * `prompt_blocks` 只放一个 text 块 —— 手机端 composer 目前不支持 @ 引用与图片附件，
 * 而服务端把 config 当不透明 JSON 存，一个 text 块是最小可用形状。PC 端编辑过的
 * 任务如果带了图片块，在这里会被这一个 text 块**替换掉**，所以编辑弹层的说明里
 * 要提醒（见下方 helper 文案）。
 *
 * 选项部分走 `effectiveTaskAgentSelection`：存的是界面上**正在显示**的那个具体值，
 * 而不是「用户动过的那几个」。理由见 `taskAgentConfig.ts` —— 存空值等于跟随远端默认，
 * 而远端默认将来会变，同一个任务半年后会跑在另一个模型上。
 */
function buildDraft(): WorkTaskDraft {
  const displayText = prompt.value.trim()
  if (!agentDirty.value) {
    return {
      folder_id: folderId.value,
      title: title.value.trim(),
      config: {
        prompt_blocks: [{ type: "text", text: displayText }],
        display_text: displayText,
        agent_type: null,
        mode_id: null,
        config_values: {},
      },
    }
  }
  const selection = effectiveTaskAgentSelection(agentConfig.value, storedSelection.value)
  return {
    folder_id: folderId.value,
    title: title.value.trim(),
    config: {
      prompt_blocks: [{ type: "text", text: displayText }],
      display_text: displayText,
      agent_type: agentType.value,
      mode_id: selection.mode_id,
      config_values: selection.config_values,
      label_snapshot: taskAgentLabelSnapshot({
        agentType: agentType.value,
        state: agentConfig.value,
        selection,
      }),
    },
  }
}

function submit() {
  if (!canSubmit.value) {
    errorMessage.value = !title.value.trim()
      ? "请输入标题"
      : !prompt.value.trim()
        ? "请输入任务描述"
        : "请选择项目"
    return
  }
  errorMessage.value = ""
  emit("submit", buildDraft())
}

function applyTemplate(template: WorkTaskTemplate) {
  title.value = template.title || template.name
  prompt.value = template.config?.display_text || ""
  const templateAgent = template.config?.agent_type
  if (templateAgent) {
    agentType.value = templateAgent
    agentDirty.value = true
    // 模板存的是三件套，一起套用 —— 只套 agent 会让模板里的模型选择静默丢掉。
    storedSelection.value = readTaskAgentSelection(template.config)
    storedLabels.value = template.config?.label_snapshot || null
    reprojectStoredSelection()
  } else {
    resetAgentOverride()
  }
  showTemplatePanel.value = false
}

async function saveTemplate() {
  if (!props.gateway) return
  const name = templateName.value.trim()
  if (!name) {
    errorMessage.value = "请输入模板名称"
    return
  }
  if (!prompt.value.trim()) {
    errorMessage.value = "请输入任务描述"
    return
  }
  templateBusy.value = true
  try {
    const draft = buildDraft()
    await saveWorkTaskTemplate(props.gateway, {
      name,
      title: draft.title || name,
      config: draft.config,
    })
    templateName.value = ""
    await loadTemplates()
    uni.showToast({ title: "已保存模板", icon: "success" })
  } catch (error) {
    errorMessage.value = toErrorMessage(error)
  } finally {
    templateBusy.value = false
  }
}

async function removeTemplate(template: WorkTaskTemplate) {
  if (!props.gateway) return
  templateBusy.value = true
  try {
    await deleteWorkTaskTemplate(props.gateway, template.id)
    await loadTemplates()
  } catch (error) {
    errorMessage.value = toErrorMessage(error)
  } finally {
    templateBusy.value = false
  }
}
</script>

<template>
  <view class="task-editor-host">
    <up-popup :show="props.show" mode="bottom" :round="28" @close="closeSheet">
      <view class="task-sheet" :style="upThemeCardStyle">
        <view class="task-sheet__hd">
          <view class="task-editor__title-block">
            <text class="task-sheet__title">{{ sheetTitle }}</text>
            <text v-if="isEdit" class="task-sheet__desc">
              保存后本任务描述会被替换为下面的文本（PC 端添加的图片引用会丢失）。
            </text>
          </view>
          <view class="task-sheet__close" @click="closeSheet">
            <up-icon name="close" size="20" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
          </view>
        </view>

        <scroll-view class="task-sheet__scroll" scroll-y enhanced>
          <view class="task-form-group">
            <text class="task-form-label">标题</text>
            <up-input v-model="title" placeholder="要做什么？" border="surround"></up-input>
          </view>

          <view class="task-form-group">
            <text class="task-form-label">任务描述</text>
            <up-textarea
              v-model="prompt"
              placeholder="向 agent 描述任务，越具体越好"
              autoHeight
              count
              :maxlength="4000"
            ></up-textarea>
          </view>

          <view class="task-form-group">
            <text class="task-form-label">项目</text>
            <view
              class="task-form-readonly"
              @click="!folderLocked && (showProjectPicker = true)"
            >
              <text class="task-form-readonly__text">{{ selectedProjectName || "请选择项目" }}</text>
              <up-icon
                v-if="!folderLocked"
                name="arrow-down"
                size="14"
                :color="upThemeVar('--up-light-color', '#c0c4cc')"
              ></up-icon>
              <up-icon
                v-else
                name="lock"
                size="14"
                :color="upThemeVar('--up-light-color', '#c0c4cc')"
              ></up-icon>
            </view>
            <text v-if="folderLocked" class="task-form-helper">
              该任务已创建 worktree，项目不可更改。
            </text>
          </view>

          <view class="task-form-group">
            <text class="task-form-label">Agent</text>
            <view class="task-form-readonly" @click="showAgentPicker = true">
              <text class="task-form-readonly__text">{{ selectedAgentLabel }}</text>
              <up-icon name="arrow-down" size="14" :color="upThemeVar('--up-light-color', '#c0c4cc')"></up-icon>
            </view>
            <text v-if="!agentDirty" class="task-form-helper">
              继承自任务设置，修改后仅对本任务生效
            </text>
            <view v-else class="task-editor__reset" @click="resetAgentOverride">
              <text class="task-editor__reset-text">恢复继承</text>
            </view>
          </view>

          <!-- 智能体选项（授权模式 / 模型 / 推理程度）。与 agent 同一个 dirty 位：
               这些取值只在某个 agent 下有意义，见 script 顶部说明。 -->
          <view class="task-form-group">
            <text class="task-form-label">智能体选项</text>
            <view v-if="agentConfig.status === 'loading'" class="task-editor__config-loading">
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
            <text v-if="agentConfig.status === 'failed'" class="task-form-helper">
              读取失败，保存后将沿用原有选项。
            </text>
          </view>

          <view class="task-form-group">
            <view class="task-editor__template-head" @click="showTemplatePanel = !showTemplatePanel">
              <text class="task-form-label">模板</text>
              <up-icon
                :name="showTemplatePanel ? 'arrow-up' : 'arrow-down'"
                size="14"
                :color="upThemeVar('--up-tips-color', '#909193')"
              ></up-icon>
            </view>

            <template v-if="showTemplatePanel">
              <view v-if="templates.length === 0" class="task-editor__template-empty">
                <text class="task-form-helper">还没有模板。</text>
              </view>
              <view v-else class="task-editor__template-list">
                <view
                  v-for="template in templates"
                  :key="template.id"
                  class="task-editor__template-row"
                >
                  <view class="task-editor__template-copy" @click="applyTemplate(template)">
                    <text class="task-editor__template-name">{{ template.name }}</text>
                    <text class="task-editor__template-title">{{ template.title }}</text>
                  </view>
                  <view class="task-editor__template-delete" @click.stop="removeTemplate(template)">
                    <up-icon name="trash" size="16" :color="upThemeVar('--up-error', '#fa3534')"></up-icon>
                  </view>
                </view>
              </view>

              <view class="task-editor__template-save">
                <up-input
                  v-model="templateName"
                  placeholder="模板名称（同名会覆盖）"
                  border="surround"
                ></up-input>
                <up-button
                  type="primary"
                  plain
                  size="small"
                  shape="circle"
                  :loading="templateBusy"
                  @click="saveTemplate"
                >存为模板</up-button>
              </view>
            </template>
          </view>

          <view v-if="errorMessage" class="task-notice task-notice--error">
            <text class="task-notice__text">{{ errorMessage }}</text>
          </view>
        </scroll-view>

        <up-button
          type="primary"
          shape="circle"
          :disabled="!canSubmit"
          customStyle="margin-top:16rpx"
          @click="submit"
        >{{ isEdit ? "保存" : "创建任务" }}</up-button>

        <view class="task-safe-bottom"></view>
      </view>
    </up-popup>

    <up-picker
      :show="showProjectPicker"
      :columns="projectColumns"
      @confirm="onProjectConfirm"
      @cancel="showProjectPicker = false"
    ></up-picker>

    <up-picker
      :show="showAgentPicker"
      :columns="agentColumns"
      @confirm="onAgentConfirm"
      @cancel="showAgentPicker = false"
    ></up-picker>

    <!-- 选项弹层是**兄弟节点**而不是嵌在上面那个 popup 里：uview-plus 的 popup 各自
         fixed 定位，嵌套时内层会被外层的 transform 上下文困住（新建会话弹层的二级
         配置弹层同样是平铺的）。 -->
    <TaskAgentConfigSheet
      v-model:show="showAgentConfigSheet"
      :state="agentConfig"
      hint="仅对本任务生效。"
      @selectMode="selectAgentMode"
      @selectConfigValue="selectAgentConfigValue"
      @reload="loadAgentConfig"
    />
  </view>
</template>

<style scoped lang="scss">
@import "../index.scss";

.task-editor__title-block {
  flex: 1;
  min-width: 0;
}

.task-editor__reset {
  margin-top: 12rpx;
  align-self: flex-start;
  padding: 8rpx 20rpx;
  border-radius: 999rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  display: inline-flex;
}

.task-editor__reset-text {
  font-size: 22rpx;
  color: var(--up-primary, #2979ff);
}

.task-editor__config-loading {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 20rpx 24rpx;
  border-radius: 20rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.task-editor__config-loading .task-form-helper {
  margin-top: 0;
}

.task-editor__template-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.task-editor__template-empty {
  padding: 8rpx 0;
}

.task-editor__template-list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  margin-bottom: 16rpx;
}

.task-editor__template-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 16rpx 20rpx;
  border-radius: 18rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.task-editor__template-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.task-editor__template-name {
  font-size: 26rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.task-editor__template-title {
  font-size: 22rpx;
  color: var(--up-tips-color, #909193);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-editor__template-delete {
  width: 52rpx;
  height: 52rpx;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.task-editor__template-save {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.task-editor__template-save > :first-child {
  flex: 1;
  min-width: 0;
}
</style>
