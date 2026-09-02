<script setup lang="ts">
import { computed, getCurrentInstance, ref, watch } from "vue"
import { toErrorMessage } from "@/services/gateway/error"
import {
  deleteWorkTaskTemplate,
  getWorkTaskSettingsEffective,
  listWorkTaskTemplates,
  saveWorkTaskTemplate,
} from "@/services/workTask"
import type { CodegGateway } from "@/services/gateway"
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

const AGENT_OPTIONS = [
  { label: "Claude Code", value: "claude_code" },
  { label: "Codex CLI", value: "codex" },
  { label: "OpenCode", value: "open_code" },
  { label: "Gemini CLI", value: "gemini" },
  { label: "OpenClaw", value: "open_claw" },
  { label: "Cline", value: "cline" },
]

const title = ref("")
const prompt = ref("")
const folderId = ref(0)
const agentDirty = ref(false)
const agentType = ref("claude_code")
const showProjectPicker = ref(false)
const showAgentPicker = ref(false)
const showTemplatePanel = ref(false)
const templates = ref<WorkTaskTemplate[]>([])
const templateName = ref("")
const templateBusy = ref(false)
const errorMessage = ref("")

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
const selectedAgentLabel = computed(
  () => AGENT_OPTIONS.find((item) => item.value === agentType.value)?.label || agentType.value
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
    if (!visible) return
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
    return
  }
  title.value = ""
  prompt.value = ""
  folderId.value =
    props.defaultFolderId > 0 ? props.defaultFolderId : props.projects[0]?.id || 0
  agentDirty.value = false
  agentType.value = "claude_code"
}

/**
 * 用户没碰过 agent 时，把控件显示成该项目**生效**的默认值。失败静默 ——
 * 拿不到设置只意味着控件显示 claude_code，提交时仍然是 null（继承），
 * 不会因为一次读取失败就把错的 agent 冻进任务里。
 */
async function syncEffectiveAgent() {
  if (agentDirty.value || !props.gateway || folderId.value <= 0) return
  try {
    const settings = await getWorkTaskSettingsEffective(props.gateway, folderId.value)
    if (agentDirty.value) return
    agentType.value = settings.default_agent_type || "claude_code"
  } catch (error) {
    console.warn("load effective task settings failed:", error)
  }
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
  if (option) {
    agentType.value = option.value
    // 显式选过就是覆盖 —— 从这一刻起 draft 会带上 agent_type。
    agentDirty.value = true
  }
  showAgentPicker.value = false
}

function resetAgentOverride() {
  agentDirty.value = false
  void syncEffectiveAgent()
}

/**
 * 组装 draft。
 *
 * `prompt_blocks` 只放一个 text 块 —— 手机端 composer 目前不支持 @ 引用与图片附件，
 * 而服务端把 config 当不透明 JSON 存，一个 text 块是最小可用形状。PC 端编辑过的
 * 任务如果带了图片块，在这里会被这一个 text 块**替换掉**，所以编辑弹层的说明里
 * 要提醒（见下方 helper 文案）。
 */
function buildDraft(): WorkTaskDraft {
  const displayText = prompt.value.trim()
  return {
    folder_id: folderId.value,
    title: title.value.trim(),
    config: {
      prompt_blocks: [{ type: "text", text: displayText }],
      display_text: displayText,
      agent_type: agentDirty.value ? agentType.value : null,
      mode_id: null,
      config_values: {},
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
