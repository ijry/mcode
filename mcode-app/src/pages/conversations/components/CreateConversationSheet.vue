<template>
  <!-- 多个弹层包在一个空 view 里而不是用多根节点：所有子节点要么是 fixed 定位的
       浮层、要么未渲染，所以这层壳不产生布局高度。 -->
  <view class="create-sheet-host">
    <!-- 创建会话底部弹层 -->
    <up-popup :show="show" mode="bottom" :round="28" @close="closeSheet">
      <view class="create-sheet" :style="upThemeCardStyle">
        <view class="create-sheet__hd">
          <text class="create-sheet__title">新建会话</text>
          <view class="create-sheet__close" @click="closeSheet">
            <up-icon name="close" size="20" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
          </view>
        </view>

        <view class="form-group">
          <text class="form-label">连接</text>
          <view class="form-readonly" @click="showConnectionPicker = true">
            <text class="form-readonly__text">{{ selectedConnectionName || '请选择连接' }}</text>
            <up-icon name="arrow-down" size="14" :color="upThemeVar('--up-light-color', '#c0c4cc')"></up-icon>
          </view>
        </view>

        <view class="form-group">
          <text class="form-label">项目</text>
          <view class="form-readonly" @click="showProjectPicker = true">
            <text class="form-readonly__text">{{ selectedProjectName || '请选择' }}</text>
            <up-icon name="arrow-down" size="14" :color="upThemeVar('--up-light-color', '#c0c4cc')"></up-icon>
          </view>
          <text v-if="selectedProjectPath" class="form-helper-text">{{ selectedProjectPath }}</text>
        </view>

        <view class="form-group">
          <text class="form-label">智能体</text>
          <view v-if="loadingCreateAgents" class="config-loading">
            <up-loading-icon size="18" color="#2979ff"></up-loading-icon>
            <text class="config-loading__text">正在读取智能体...</text>
          </view>
          <scroll-view class="agent-scroll" scroll-x show-scrollbar="false" enhanced>
            <view class="agent-grid">
              <view
                v-for="agent in createAgentOptions"
                :key="agent.value"
                :class="[
                  'agent-card',
                  selectedAgentType === agent.value && 'agent-card--active',
                ]"
                @click="selectAgent(agent.value)"
              >
                <view
                  :class="[
                    'agent-card__logo',
                    overviewAgentLogoClass(agent.value),
                    overviewAgentLogoPath(agent.value) && 'agent-card__logo--real',
                  ]"
                >
                  <image
                    v-if="overviewAgentLogoPath(agent.value)"
                    class="agent-card__logo-img"
                    :src="overviewAgentLogoPath(agent.value)"
                    mode="aspectFit"
                  />
                  <text v-else class="agent-card__logo-text">{{ overviewAgentLogoText(agent.value) }}</text>
                </view>
                <text class="agent-card__label">{{ agent.label }}</text>
              </view>
            </view>
          </scroll-view>
          <text
            v-if="createAgentListHelperText"
            class="form-helper-text"
          >{{ createAgentListHelperText }}</text>
        </view>

        <view class="form-group">
          <text class="form-label">智能体配置</text>

          <view v-if="createAgentConfig.status === 'loading'" class="config-loading">
            <up-loading-icon size="18" color="#2979ff"></up-loading-icon>
            <text class="config-loading__text">正在读取可用配置...</text>
          </view>

          <view
            v-else
            class="form-readonly form-readonly--config"
            @click="openCreateConfigDialog"
          >
            <view class="form-readonly__stack">
              <text class="form-readonly__text">{{ createConfigSummary }}</text>
              <text v-if="createAgentConfig.message" class="form-helper-inline">
                {{ createAgentConfig.message }}
              </text>
            </view>
            <up-icon name="arrow-right" size="14" :color="upThemeVar('--up-light-color', '#c0c4cc')"></up-icon>
          </view>
        </view>

        <view class="form-group">
          <text class="form-label">本次任务内容</text>
          <up-textarea
            v-model="newTaskContent"
            placeholder="请输入本次任务内容"
            autoHeight
            count
            :maxlength="1200"
          ></up-textarea>
        </view>

        <up-button
          type="primary"
          :loading="creating"
          :disabled="createSubmitDisabled"
          shape="circle"
          @click="confirmCreate"
          customStyle="margin-top:16rpx"
        >创建会话</up-button>

        <view class="safe-bottom"></view>
      </view>
    </up-popup>
    <!-- 智能体配置弹层。**唯一入口**是上面那行「智能体配置」，读写的全部状态就是
         `createAgentConfig` 一个 ref —— 留在页面会变成一个 ref 被两个组件双向写。 -->
    <up-popup v-model:show="showCreateConfigDialog" mode="bottom" :round="28">
      <view class="create-sheet" :style="upThemeCardStyle">
        <view class="create-sheet__hd">
          <text class="create-sheet__title">智能体配置</text>
          <view class="create-sheet__close" @click="showCreateConfigDialog = false">
            <up-icon name="close" size="20" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
          </view>
        </view>

        <view v-if="createAgentConfig.message" class="config-hint">
          <text class="config-hint__text">{{ createAgentConfig.message }}</text>
        </view>

        <view v-if="showCreateModeOptions" class="config-section">
          <text class="config-section__title">授权类型</text>
          <view class="config-chip-grid">
            <view
              v-for="mode in createAgentConfig.modes?.available_modes || []"
              :key="mode.id"
              :class="[
                'config-chip',
                createAgentConfig.selectedModeId === mode.id && 'config-chip--active',
              ]"
              @click="selectCreateMode(mode.id)"
            >
              <text class="config-chip__title">{{ mode.name }}</text>
            </view>
          </view>
        </view>

        <view
          v-for="option in createAgentConfig.configOptions"
          :key="option.id"
          class="config-section"
        >
          <text class="config-section__title">{{ option.name }}</text>
          <text v-if="option.description" class="config-section__desc">{{ option.description }}</text>
          <view class="config-chip-grid">
            <view
              v-for="value in option.kind.options"
              :key="value.value"
              :class="[
                'config-chip',
                createAgentConfig.selectedValues[option.id] === value.value && 'config-chip--active',
              ]"
              @click="selectCreateConfigValue(option.id, value.value)"
            >
              <text class="config-chip__title">{{ value.name }}</text>
            </view>
          </view>
        </view>

        <view
          v-if="!showCreateModeOptions && createAgentConfig.configOptions.length === 0"
          class="config-hint"
        >
          <text class="config-hint__text">该智能体将使用远端默认配置</text>
        </view>

        <view class="safe-bottom"></view>
      </view>
    </up-popup>
    <!-- 创建进度弹层。由 `creating` 驱动，与它同生共死 —— 所以跟着弹层一起进子组件，
         而不是让页面也持有一份 `creating`（一个 ref 拆给两个组件写）。 -->
    <up-popup
      :show="creating"
      mode="center"
      :round="28"
      :close-on-click-overlay="false"
      :safe-area-inset-bottom="false"
    >
      <view class="create-progress-dialog" :style="upThemeCardStyle">
        <view class="create-progress-dialog__visual" aria-hidden="true">
          <view class="create-progress-dialog__ring"></view>
          <view class="create-progress-dialog__ring create-progress-dialog__ring--delay"></view>
          <view class="create-progress-dialog__core">
            <up-loading-icon mode="circle" size="28" :color="upThemeVar('--up-primary', '#2979ff')"></up-loading-icon>
          </view>
        </view>
        <text class="create-progress-dialog__title">正在创建会话</text>
        <text class="create-progress-dialog__desc">正在连接智能体并初始化会话，请不要关闭页面。</text>
        <view class="create-progress-dialog__stage">
          <view class="create-progress-dialog__stage-dot"></view>
          <text class="create-progress-dialog__stage-text">{{ createProgressText }}</text>
        </view>
      </view>
    </up-popup>

    <!-- 连接 Picker。`up-picker` 是**受控**组件（`:show` + `@cancel`），不是
         `v-model:show`。它与项目 Picker 的唯一入口都在上面的表单行里。 -->
    <up-picker
      :show="showConnectionPicker"
      :columns="connectionColumns"
      @confirm="onConnectionConfirm"
      @cancel="showConnectionPicker = false"
    ></up-picker>

    <!-- 项目 Picker -->
    <up-picker
      :show="showProjectPicker"
      :columns="projectColumns"
      @confirm="onProjectConfirm"
      @cancel="showProjectPicker = false"
    ></up-picker>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, onBeforeUnmount, ref, watch } from "vue"
import { acpApi } from "@/api/acp"
import { useConversationRuntimeStore } from "@/stores/conversationRuntime"
import {
  formatOverviewAgentLabel,
  overviewAgentLogoClass,
  overviewAgentLogoPath,
  overviewAgentLogoText,
} from "@/pages/conversations/conversationOverviewPresentation"
import {
  applyConnectionAuth,
  findConnectedConnection,
  normalizeGatewayList,
  openConnectionGateway,
} from "@/services/connection/connectionAccess"
import { toErrorMessage } from "@/services/gateway/error"
import {
  buildAgentConfigContextKey,
  createReadyDetailAgentConfigState,
  hasSessionModeOptions,
  persistAgentConfigCache,
  persistAgentConfigSelection,
  persistAgentListCache,
  persistSelectedAgentType,
  readFreshAgentConfigCache,
  readFreshAgentListCache,
  readPersistedAgentConfigSelection,
  readPersistedSelectedAgentType,
  type AgentListOption,
} from "@/services/conversation/composerTools"
import { normalizeAgentType } from "@/services/conversation/agentType"
import { parseConversationId } from "@/services/conversation/conversationIdentity"
import { seedCreatedConversationSummary } from "@/services/conversation/createdConversationSeed"
import { METADATA_ONLY_CONVERSATION_TAIL_TURNS } from "@/services/conversation/conversationHistoryWindowContract"
import { ensureConversationTab } from "@/services/conversation/pcTabSyncService"
import type {
  ConversationOverviewProject,
  ConnectionConversationSnapshot,
} from "@/services/conversation/conversationOverviewSnapshot"
import type { CodegGateway } from "@/services/gateway"
import type {
  AgentOptionsSnapshot,
  AcpAgentInfo,
  ConnectionInfo,
  SessionConfigOptionInfo,
  SessionModeStateInfo,
} from "@/types/acp"

/**
 * 新建会话弹层。**自带**智能体配置弹层、创建进度弹层、连接/项目两个 Picker ——
 * 它们的唯一入口都在这个弹层里，状态也完全同源。
 *
 * 与既有两个子组件（Navbar / SearchBar）不同，这个**不是纯受控**：整条创建链路的状态
 * （选中的连接/项目/智能体、配置快照、任务内容、去重指纹）都归它自己。页面只提供两样
 * 东西：`connectionGroups`（列表数据源，页面拥有）和 `show` 的双向绑定。
 *
 * 边界的判据是「谁拥有数据源」：
 * - 创建做到**拿到 conversationId** 为止，然后 `@created` 把三个字段交出去；
 * - 刷新列表、跳详情页归页面（它持有 `loadOverviewData` 与路由）。
 *
 * 这条接缝在拆分前就切好了（页面侧 `handleConversationCreated` 的注释）：`confirmCreate`
 * 中段就把弹层关了，收尾若不分两段，用 `v-if` 控制显示时会跑在**已卸载**的组件上。
 */
const props = defineProps<{
  /** 弹层是否显示。 */
  show: boolean
  /**
   * 连接分组（含各自的项目列表）。**页面拥有**它 —— 它是概览列表的数据源，由多条
   * 远端加载路径写入。这里只读，用来渲染两个 Picker 的列与解析项目路径。
   */
  connectionGroups: ConnectionConversationSnapshot[]
  /**
   * 打开时的默认连接键。历史面板里新建时是那个分组的键，概览里是上次选中或第一条。
   * 由页面算好传入 —— 判断依赖 `showHistoryPanel` / `historyGroupKey`，都归页面。
   */
  defaultConnectionKey?: string
}>()

const emit = defineEmits<{
  (event: "update:show", value: boolean): void
  (event: "created", payload: {
    conversationId: number
    folderId: number
    connectionKey: string
  }): void
}>()

const runtime = useConversationRuntimeStore()

const currentInstance = getCurrentInstance()
/**
 * `upThemeVar` / `upThemeCardStyle` 是 uview-plus 用 Options API mixin 注入到**每个组件
 * 实例**的，只有模板作用域直接可见 —— 在 `<script setup>` 里裸调会抛 ReferenceError。
 * 所以每个组件各自从 `getCurrentInstance()` 取，**不通过 props 传**（传下来会在主题切换时
 * 失去响应）。与 RemoteDirectoryBrowser 同一写法。
 */
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

type Project = ConversationOverviewProject

interface CreateAgentConfigState {
  status: "idle" | "loading" | "ready" | "failed"
  modes: SessionModeStateInfo | null
  configOptions: SessionConfigOptionInfo[]
  selectedModeId: string | null
  selectedValues: Record<string, string>
  message: string
}

const creating = ref(false)
const showCreateConfigDialog = ref(false)
const showConnectionPicker = ref(false)
const showProjectPicker = ref(false)
const selectedConnectionKey = ref("")
const selectedConnectionName = ref("")
const selectedProjectId = ref<number>(0)
const selectedProjectName = ref("")
const selectedAgentType = ref("claude_code")
const newTaskContent = ref("")
const loadingCreateAgents = ref(false)
const createAgentListError = ref("")
const createProgressStageIndex = ref(0)
const createAgentOptions = ref<AgentListOption[]>([])
const createAgentConfig = ref<CreateAgentConfigState>({
  status: "idle",
  modes: null,
  configOptions: [],
  selectedModeId: null,
  selectedValues: {},
  message: "",
})

let createAgentProbeToken = 0
let createAgentListToken = 0
let createProgressTimer: ReturnType<typeof setInterval> | null = null

/**
 * 一次创建请求的身份，用来在重试时**不重复发 prompt**。
 *
 * 指纹变了就是另一次请求（用户改了连接/项目/智能体/任务内容），此时旧的 id 作废。
 */
let activeCreateRequestId = ""
let activeCreateRequestFingerprint = ""
let activeCreateConversationId = 0
let activeCreatePromptAttempted = false

const CREATE_PROGRESS_STAGES = [
  "准备连接信息",
  "拉起智能体会话",
  "应用会话配置",
  "写入会话记录",
  "打开新会话",
]

const selectedConnectionGroup = computed(() =>
  props.connectionGroups.find((group) => group.key === selectedConnectionKey.value)
)

const selectedProjectPath = computed(() => {
  const project = selectedConnectionGroup.value?.projects.find(
    (item) => item.id === selectedProjectId.value
  )
  return project?.path || ""
})

const connectionColumns = computed(() => [
  props.connectionGroups.map((group) => ({
    text: group.name,
    value: group.key,
  })),
])

const projectColumns = computed(() => [
  (selectedConnectionGroup.value?.projects || []).map((p) => ({
    text: p.name || p.path || "未命名项目",
    value: p.id,
  })),
])

const showCreateModeOptions = computed(() => hasSessionModeOptions(createAgentConfig.value.modes))

const createConfigSummary = computed(() => {
  if (createAgentConfig.value.status === "loading") return "正在读取可用配置..."
  const parts: string[] = []

  if (showCreateModeOptions.value && createAgentConfig.value.modes) {
    const activeMode = createAgentConfig.value.modes.available_modes.find(
      (item) => item.id === createAgentConfig.value.selectedModeId
    )
    if (activeMode?.name) {
      parts.push(activeMode.name)
    }
  }

  for (const option of createAgentConfig.value.configOptions) {
    const selectedValue = option.kind.options.find(
      (item) => item.value === createAgentConfig.value.selectedValues[option.id]
    )
    if (selectedValue?.name) {
      parts.push(selectedValue.name)
    }
  }

  if (parts.length === 0) {
    return createAgentConfig.value.message || "使用远端默认配置"
  }
  return parts.join(" · ")
})

const selectedCreateAgentAvailable = computed(() =>
  createAgentOptions.value.some((item) => item.value === selectedAgentType.value)
)

const createSubmitDisabled = computed(
  () =>
    creating.value ||
    loadingCreateAgents.value ||
    !selectedProjectId.value ||
    !selectedConnectionKey.value ||
    !selectedAgentType.value ||
    !selectedCreateAgentAvailable.value ||
    Boolean(createAgentListError.value)
)

const createAgentListHelperText = computed(() => {
  if (createAgentListError.value) return createAgentListError.value
  if (!loadingCreateAgents.value && createAgentOptions.value.length === 0) {
    return "未读取到可用智能体，请检查远端智能体设置后重试"
  }
  return ""
})

const createProgressText = computed(() => {
  return CREATE_PROGRESS_STAGES[createProgressStageIndex.value] || CREATE_PROGRESS_STAGES[0]
})

/**
 * 弹层打开/关闭，以及连接切换时的智能体列表加载。
 *
 * 关闭时把两个 token 都推进一格：在途的列表/配置请求回来后会发现 token 变了而放弃写入 ——
 * 否则一次慢请求会在弹层已经关掉（甚至下次打开成别的连接）之后覆盖状态。
 *
 * **打开时初始化状态也在这里**，而不是让页面调一个 `open()` 方法：那样页面就要持有
 * 弹层内部状态的写入权，接缝会重新长回去。
 */
watch(
  () => [props.show, selectedConnectionKey.value] as const,
  ([open], previous) => {
    if (!open) {
      createAgentProbeToken += 1
      createAgentListToken += 1
      showCreateConfigDialog.value = false
      resetCreateAgentConfig("")
      clearPendingCreateRequest()
      return
    }
    // 刚打开（上一次是关着的）：按页面给的默认连接初始化整套状态。
    if (!previous?.[0]) {
      initializeSheetState()
    }
    void loadCreateAgents()
  }
)

watch(
  () =>
    [
      props.show,
      selectedConnectionKey.value,
      selectedAgentType.value,
      selectedProjectPath.value,
    ] as const,
  ([open]) => {
    if (!open) return
    void loadCreateAgentConfig()
  }
)

watch(creating, (active) => {
  if (active) {
    startCreateProgressTimer()
  } else {
    stopCreateProgressTimer()
  }
})

// `watch(creating)` 是唯一的停表路径，所以「creating 期间组件被销毁」会漏掉那个
// 1.8s interval。页面侧本想兜底，但 `conversations/index.vue` 的 onUnload 里写的是
// 一个**本文件私有、未导出**的名字（运行时 ReferenceError），等于没有兜底。
// 兜底就该放在持有 timer 的这一侧。
onBeforeUnmount(() => {
  stopCreateProgressTimer()
})

function closeSheet() {
  emit("update:show", false)
}

/**
 * 弹层打开时的状态初始化。
 *
 * 智能体列表先用缓存填 —— 远端拉取要等网络，空列表期间「创建会话」按钮是禁用的，
 * 用户会以为坏了。
 */
function initializeSheetState() {
  clearPendingCreateRequest()
  applySelectedConnection(props.defaultConnectionKey || props.connectionGroups[0]?.key || "")
  selectedProjectId.value = 0
  selectedProjectName.value = ""
  newTaskContent.value = ""
  resetCreateAgentConfig("")
  const cachedOptions = readFreshAgentListCache(selectedConnectionKey.value)
  createAgentOptions.value = cachedOptions && cachedOptions.length > 0 ? cachedOptions : []
  createAgentListError.value = ""
  if (!createAgentOptions.value.some((item) => item.value === selectedAgentType.value)) {
    selectedAgentType.value = createAgentOptions.value[0]?.value || "claude_code"
  }
}

/**
 * 重置弹层自己的状态。创建成功后调 —— 与 `initializeSheetState` 的区别是它**不碰连接与
 * 项目的选择**：那两样留着，用户连续新建时不必重选。
 */
function resetCreateSheetState() {
  clearPendingCreateRequest()
  newTaskContent.value = ""
  resetCreateAgentConfig("")
  selectedAgentType.value = "claude_code"
  createAgentOptions.value = []
  createAgentListError.value = ""
}

function resetCreateAgentConfig(message = "") {
  createAgentConfig.value = {
    status: "idle",
    modes: null,
    configOptions: [],
    selectedModeId: null,
    selectedValues: {},
    message,
  }
}

function clearPendingCreateRequest() {
  activeCreateRequestId = ""
  activeCreateRequestFingerprint = ""
  activeCreateConversationId = 0
  activeCreatePromptAttempted = false
}

function startCreateProgressTimer() {
  stopCreateProgressTimer()
  createProgressStageIndex.value = 0
  createProgressTimer = setInterval(() => {
    createProgressStageIndex.value =
      (createProgressStageIndex.value + 1) % CREATE_PROGRESS_STAGES.length
  }, 1800)
}

function stopCreateProgressTimer() {
  if (createProgressTimer) {
    clearInterval(createProgressTimer)
    createProgressTimer = null
  }
  createProgressStageIndex.value = 0
}

function createConversationRequestFingerprint() {
  const selectedValues = Object.entries(createAgentConfig.value.selectedValues)
    .sort(([left], [right]) => left.localeCompare(right))
  return JSON.stringify({
    connectionKey: selectedConnectionKey.value,
    projectId: selectedProjectId.value,
    agentType: selectedAgentType.value,
    taskContent: newTaskContent.value.trim(),
    modeId: createAgentConfig.value.selectedModeId || "",
    selectedValues,
  })
}

function resolveCreateRequestId() {
  const fingerprint = createConversationRequestFingerprint()
  if (!activeCreateRequestId || activeCreateRequestFingerprint !== fingerprint) {
    activeCreateRequestId = `mcode-create-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 10)}`
    activeCreateRequestFingerprint = fingerprint
  }
  return activeCreateRequestId
}

function currentCreateAgentConfigContextKey(): string {
  if (!selectedConnectionKey.value || !selectedAgentType.value) return ""
  return buildAgentConfigContextKey(
    selectedConnectionKey.value,
    selectedAgentType.value,
    selectedProjectPath.value
  )
}

function persistCurrentCreateAgentConfigSelection() {
  const contextKey = currentCreateAgentConfigContextKey()
  if (!contextKey) return
  persistAgentConfigSelection(contextKey, {
    selectedModeId: createAgentConfig.value.selectedModeId,
    selectedValues: createAgentConfig.value.selectedValues,
  })
}

function applyCreateAgentSnapshot(snapshot: AgentOptionsSnapshot, contextKey: string) {
  const persistedSelection = readPersistedAgentConfigSelection(contextKey)
  createAgentConfig.value = createReadyDetailAgentConfigState(
    snapshot,
    persistedSelection || undefined
  )
}

function applySelectedConnection(connectionKeyValue: string) {
  if (!connectionKeyValue) {
    selectedConnectionKey.value = ""
    selectedConnectionName.value = ""
    selectedProjectId.value = 0
    selectedProjectName.value = ""
    createAgentOptions.value = []
    createAgentListError.value = ""
    selectedAgentType.value = "claude_code"
    return
  }
  const group = props.connectionGroups.find((item) => item.key === connectionKeyValue)
  if (!group) return
  selectedConnectionKey.value = group.key
  selectedConnectionName.value = group.name
  selectedProjectId.value = 0
  selectedProjectName.value = ""
  const cachedOptions = readFreshAgentListCache(group.key)
  if (cachedOptions && cachedOptions.length > 0) {
    createAgentOptions.value = cachedOptions
    createAgentListError.value = ""
  } else {
    createAgentOptions.value = []
    createAgentListError.value = ""
  }
  const persistedAgentType = readPersistedSelectedAgentType(group.key)
  selectedAgentType.value = persistedAgentType || "claude_code"
}

function normalizeCreateAgentOptions(raw: unknown): AgentListOption[] {
  const list = normalizeGatewayList(raw) as AcpAgentInfo[]
  return list
    .filter((item) => item && item.enabled !== false && item.available !== false)
    .map((item) => {
      const value = normalizeAgentType(item.agent_type)
      return {
        value,
        // 标签取站内唯一那份映射（`remoteSettings.AGENT_LABELS`，经
        // `formatOverviewAgentLabel` 暴露）。页面此前有本地副本，把 codex 写成
        // 「Codex CLI」而全局那份是「Codex」—— 同一个 agent 在新建弹层和别处显示成
        // 两个名字。远端给了 `name` 时仍优先用它。
        label: String(item.name || formatOverviewAgentLabel(value)),
        description: item.description ? String(item.description) : "",
        sortOrder: typeof item.sort_order === "number" ? item.sort_order : Number.MAX_SAFE_INTEGER,
      }
    })
    .filter((item) => Boolean(item.value))
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
      return a.label.localeCompare(b.label)
    })
    .map(({ sortOrder: _sortOrder, ...item }) => item)
}

async function loadCreateAgents() {
  if (!props.show || !selectedConnectionKey.value) return
  const targetConn = findConnectedConnection(selectedConnectionKey.value)
  if (!targetConn) {
    createAgentOptions.value = []
    createAgentListError.value = "连接不可用，无法读取智能体"
    return
  }

  const token = ++createAgentListToken
  loadingCreateAgents.value = true
  createAgentListError.value = ""
  try {
    const cachedOptions = readFreshAgentListCache(selectedConnectionKey.value)
    if (cachedOptions && cachedOptions.length > 0) {
      if (token !== createAgentListToken) return
      createAgentOptions.value = cachedOptions
      if (!cachedOptions.some((item) => item.value === selectedAgentType.value)) {
        const fallback = cachedOptions[0]
        if (fallback) {
          selectedAgentType.value = fallback.value
          persistSelectedAgentType(selectedConnectionKey.value, fallback.value)
        }
      }
      return
    }

    const gateway = await openConnectionGateway(targetConn)
    const remoteAgents = await gateway.call<unknown>("acp_list_agents", {})
    if (token !== createAgentListToken) return
    const nextOptions = normalizeCreateAgentOptions(remoteAgents)
    createAgentOptions.value = nextOptions
    persistAgentListCache(selectedConnectionKey.value, nextOptions)
    if (!nextOptions.some((item) => item.value === selectedAgentType.value)) {
      const fallback = nextOptions[0]
      if (fallback) {
        selectedAgentType.value = fallback.value
        persistSelectedAgentType(selectedConnectionKey.value, fallback.value)
      }
    }
  } catch (error) {
    if (token !== createAgentListToken) return
    console.warn("load create agents failed:", error)
    createAgentOptions.value = []
    createAgentListError.value = `读取智能体失败：${toErrorMessage(error)}`
  } finally {
    if (token === createAgentListToken) {
      loadingCreateAgents.value = false
    }
  }
}

async function loadCreateAgentConfig() {
  if (!props.show || !selectedConnectionKey.value || !selectedAgentType.value) {
    resetCreateAgentConfig("")
    return
  }

  const targetConn = findConnectedConnection(selectedConnectionKey.value)
  if (!targetConn) {
    resetCreateAgentConfig("连接不可用，将使用远端默认配置")
    return
  }

  const token = ++createAgentProbeToken
  const contextKey = buildAgentConfigContextKey(
    selectedConnectionKey.value,
    selectedAgentType.value,
    selectedProjectPath.value
  )
  const cachedSnapshot = readFreshAgentConfigCache(contextKey)
  if (cachedSnapshot) {
    applyCreateAgentSnapshot(cachedSnapshot, contextKey)
    return
  }

  createAgentConfig.value = {
    status: "loading",
    modes: null,
    configOptions: [],
    selectedModeId: null,
    selectedValues: {},
    message: "",
  }

  try {
    const gateway = await openConnectionGateway(targetConn)
    const snapshot = await gateway.call<AgentOptionsSnapshot>("acp_describe_agent_options", {
      agentType: selectedAgentType.value,
      workingDir: selectedProjectPath.value || null,
    })
    if (token !== createAgentProbeToken) return
    persistAgentConfigCache(contextKey, snapshot)
    applyCreateAgentSnapshot(snapshot, contextKey)
  } catch (error) {
    if (token !== createAgentProbeToken) return
    resetCreateAgentConfig("读取失败，将使用远端默认配置")
    createAgentConfig.value.status = "failed"
  }
}

function selectCreateMode(modeId: string) {
  createAgentConfig.value.selectedModeId = modeId
  persistCurrentCreateAgentConfigSelection()
}

function selectCreateConfigValue(configId: string, valueId: string) {
  createAgentConfig.value = {
    ...createAgentConfig.value,
    selectedValues: {
      ...createAgentConfig.value.selectedValues,
      [configId]: valueId,
    },
  }
  persistCurrentCreateAgentConfigSelection()
}

function openCreateConfigDialog() {
  if (createAgentConfig.value.status === "loading") return
  showCreateConfigDialog.value = true
}

function selectAgent(agentType: string) {
  selectedAgentType.value = normalizeAgentType(agentType)
  persistSelectedAgentType(selectedConnectionKey.value, selectedAgentType.value)
}

function onConnectionConfirm(e: any) {
  const sel = e.value[0]
  applySelectedConnection(String(sel.value || ""))
  showConnectionPicker.value = false
}

function onProjectConfirm(e: any) {
  const sel = e.value[0]
  selectedProjectId.value = sel.value
  selectedProjectName.value = sel.text
  showProjectPicker.value = false
}

async function applyCreateAgentConfig(
  gateway: CodegGateway,
  connectionId: string,
  configOptions: SessionConfigOptionInfo[],
  selectedValues: Record<string, string>
) {
  for (const option of configOptions) {
    const selectedValueId = selectedValues[option.id]
    if (!selectedValueId) continue
    await gateway.call("acp_set_config_option", {
      connectionId,
      configId: option.id,
      valueId: selectedValueId,
    })
  }
}

function resolveConnectedSessionId(connection: ConnectionInfo | null | undefined) {
  if (!connection || typeof connection !== "object") return ""
  return String(connection.sessionId || "").trim()
}

/**
 * 这次重试该不该跳过 prompt。
 *
 * 场景：第一次 `acp_prompt` 发出后网络断了，用户重试。会话已经建好、prompt 也已经落到
 * 远端，再发一次就是**重复的用户消息**。两道探测各自都可能失败（离线重试时尤其），所以
 * 都只是「探测到就跳过」，探测不到就继续 —— 宁可重复一次也不要漏掉真正的首发。
 */
async function shouldSkipCreatePromptReplay(
  gateway: CodegGateway,
  conversationId: number,
  agentType: string
) {
  if (!activeCreateRequestId) return false
  if (activeCreateConversationId !== conversationId) return false
  if (!activeCreatePromptAttempted) return false

  try {
    // 只判「有没有轮次」，1 条窗口下 `length > 0` 语义完全不变。
    const detail = await gateway.call<any>("get_folder_conversation", {
      conversationId,
      tailTurns: METADATA_ONLY_CONVERSATION_TAIL_TURNS,
    })
    if (Array.isArray(detail?.turns) && detail.turns.length > 0) {
      return true
    }
  } catch (error) {
    console.warn("create prompt replay detail probe skipped:", error)
  }

  try {
    const instanceKey = gateway.getRemoteInstanceDescriptor().instanceKey
    const existingConnection = await acpApi.acpFindConnectionForConversation(
      conversationId,
      agentType,
      undefined,
      instanceKey ? { instanceKey } : undefined
    )
    if (existingConnection?.connection_id) {
      return true
    }
  } catch (error) {
    console.warn("create prompt replay connection probe skipped:", error)
  }

  return false
}

async function confirmCreate() {
  if (creating.value) return

  creating.value = true
  if (!selectedConnectionKey.value) {
    uni.showToast({ title: "请选择连接", icon: "none" })
    creating.value = false
    return
  }

  if (!selectedProjectId.value) {
    uni.showToast({ title: "请选择项目", icon: "none" })
    creating.value = false
    return
  }

  const agentType = selectedAgentType.value
  if (loadingCreateAgents.value) {
    uni.showToast({ title: "正在读取智能体，请稍后", icon: "none" })
    creating.value = false
    return
  }

  if (createAgentListError.value) {
    uni.showToast({ title: createAgentListError.value, icon: "none", duration: 3000 })
    creating.value = false
    return
  }

  if (!agentType || !createAgentOptions.value.some((item) => item.value === agentType)) {
    uni.showToast({ title: "请选择可用智能体", icon: "none" })
    creating.value = false
    return
  }

  try {
    const preferredModeId = createAgentConfig.value.selectedModeId || undefined
    const preferredConfigValues = { ...createAgentConfig.value.selectedValues }
    const configOptions = [...createAgentConfig.value.configOptions]
    persistSelectedAgentType(selectedConnectionKey.value, agentType)
    persistCurrentCreateAgentConfigSelection()
    closeSheet()
    showCreateConfigDialog.value = false
    const targetConn = findConnectedConnection(selectedConnectionKey.value)
    if (!targetConn) {
      throw new Error("连接不存在或已断开")
    }
    const gateway = await openConnectionGateway(targetConn)
    applyConnectionAuth(targetConn)
    const foldersRaw = await gateway.call<unknown>("list_open_folder_details")
    const selectedProject = normalizeGatewayList(foldersRaw).find(
      (project) => Number((project as Project | null | undefined)?.id || 0) === selectedProjectId.value
    ) as Project | undefined
    if (!selectedProject) {
      throw new Error("项目不存在或列表已过期，请刷新后重试")
    }

    const connectionInfo = await gateway.call<ConnectionInfo>("acp_connect", {
      agentType,
      workingDir: selectedProject.path || undefined,
      preferredModeId,
      preferredConfigValues,
    })
    const connectionId = typeof connectionInfo === "string"
      ? connectionInfo
      : String(connectionInfo?.id || "").trim()
    if (!connectionId) {
      throw new Error("智能体连接失败：返回数据异常")
    }

    await applyCreateAgentConfig(gateway, connectionId, configOptions, preferredConfigValues)

    resolveCreateRequestId()
    const createResult = await gateway.call<any>("create_conversation", {
      folderId: selectedProjectId.value,
      agentType,
    })
    const newConversationId = parseConversationId(createResult)
    if (!newConversationId) {
      throw new Error("创建会话失败：返回数据异常")
    }

    const taskContent = newTaskContent.value.trim()
    await seedCreatedConversationSummary({
      gateway,
      instanceKey: gateway.getRemoteInstanceDescriptor().instanceKey,
      conversationId: newConversationId,
      folderId: selectedProjectId.value,
      // 标题字段已从弹层移除（远端会按首条消息自动命名）。空串让 seed 落
      // `会话 #<id>` 占位，等远端回填。
      title: "",
      agentType,
      hasTaskContent: Boolean(taskContent),
    })

    if (taskContent) {
      const skipPromptReplay = await shouldSkipCreatePromptReplay(
        gateway,
        newConversationId,
        agentType
      )
      if (!skipPromptReplay) {
        activeCreateConversationId = newConversationId
        activeCreatePromptAttempted = true
        await gateway.call("acp_prompt", {
          connectionId,
          blocks: [{ type: "text", text: taskContent }],
          folderId: selectedProjectId.value,
          conversationId: newConversationId,
        })
      }
    }

    runtime.bindCreatedConversationRuntime({
      conversationId: newConversationId,
      folderId: selectedProjectId.value,
      agentType,
      connectionId,
      instanceKey: gateway.getRemoteInstanceDescriptor().instanceKey,
      sessionId: resolveConnectedSessionId(connectionInfo),
    })

    await ensureConversationTab({
      instanceKey: gateway.getRemoteInstanceDescriptor().instanceKey,
      gateway,
      folderId: selectedProjectId.value,
      conversationId: newConversationId,
      agentType,
      activation: "preserve",
      origin: "mcode-mobile-create",
    }).catch((error) => {
      console.warn("ensure conversation tab after create skipped:", error)
    })

    await gateway.call("open_folder_by_id", {
      folderId: selectedProjectId.value,
    }).catch((error) => {
      console.warn("open folder by id skipped:", error)
    })

    uni.showToast({ title: "创建成功", icon: "success" })
    closeSheet()
    // 收尾分两段：
    //   ① 弹层自己的状态重置 —— 归这里；
    //   ② 页面级的刷新与导航 —— 交给 `@created`（页面持有列表数据源与路由）。
    // 顺序不能反：`v-if` 控制显示时，页面在收到 `created` 后可能立即卸载本组件，
    // 之后再写 ref 就是写一个不存在的实例。
    resetCreateSheetState()
    emit("created", {
      conversationId: newConversationId,
      folderId: selectedProjectId.value,
      connectionKey: selectedConnectionKey.value,
    })
  } catch (error) {
    const msg = toErrorMessage(error)
    uni.showToast({ title: `创建失败: ${msg}`, icon: "none", duration: 3000 })
  } finally {
    creating.value = false
  }
}







</script>

<style scoped lang="scss">
/* 与页面共用的规则（弹层外壳/头部、表单行、agent logo 修饰符、安全区占位）。
 * scoped 样式不跨组件边界，所以页面与本组件各自 @import 同一份 —— 详见该文件头部说明。 */
@import "../index.scss";

/* 弹层壳本身不产生布局：所有子节点要么是 fixed 浮层、要么未渲染。 */
.create-sheet-host {
  display: contents;
}

.form-readonly {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 24rpx;
  background-color: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  border-radius: 56rpx;
}

.form-readonly__text {
  font-size: 28rpx;
  color: var(--up-main-color, #303133);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.form-readonly--config {
  gap: 12rpx;
}

.form-readonly__stack {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.form-helper-inline {
  font-size: 22rpx;
  color: var(--up-tips-color, #909193);
  line-height: 1.4;
}

.form-helper-text {
  display: block;
  margin-top: 12rpx;
  padding: 0 8rpx;
  font-size: 22rpx;
  line-height: 1.4;
  color: var(--up-tips-color, #909193);
  word-break: break-all;
}

.agent-scroll {
  width: 100%;
  white-space: nowrap;
}

.agent-grid {
  display: flex;
  align-items: stretch;
  gap: 16rpx;
  padding-right: 8rpx;
}

.agent-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  width: 180rpx;
  min-width: 180rpx;
  flex-shrink: 0;
  padding: 20rpx 12rpx 18rpx;
  border-radius: 24rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  border: 2rpx solid transparent;
  transition: all 0.18s ease;
}

.agent-card--active {
  background: color-mix(in srgb, var(--up-primary, #2979ff) 10%, var(--up-card-bg-color, #ffffff) 90%);
  border-color: var(--up-primary, #2979ff);
  box-shadow: 0 8rpx 24rpx rgba(41, 121, 255, 0.12);
}

.agent-card__logo {
  width: 76rpx;
  height: 76rpx;
  border-radius: 22rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.agent-card__logo--real {
  background: var(--up-card-bg-color, #ffffff);
}

.agent-card__logo-img {
  width: 48rpx;
  height: 48rpx;
}

.agent-card__logo-text {
  font-size: 24rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.agent-card__label {
  font-size: 22rpx;
  line-height: 1.3;
  text-align: center;
  color: var(--up-main-color, #303133);
}

.config-loading {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 12rpx 4rpx;
}

.config-loading__text,
.config-hint__text,
.config-section__desc {
  font-size: 24rpx;
  color: var(--up-content-color, #606266);
}

.config-hint {
  padding: 8rpx 4rpx;
}

.config-section {
  margin-top: 20rpx;
}

.config-section__title {
  display: block;
  margin-bottom: 12rpx;
  font-size: 24rpx;
  color: var(--up-content-color, #606266);
}

.config-section__desc {
  display: block;
  margin-bottom: 12rpx;
  line-height: 1.4;
}

.config-chip-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.config-chip {
  padding: 14rpx 20rpx;
  border-radius: 999rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  border: 2rpx solid transparent;
}

.config-chip--active {
  background: color-mix(in srgb, var(--up-primary, #2979ff) 10%, var(--up-card-bg-color, #ffffff) 90%);
  border-color: var(--up-primary, #2979ff);
}

.config-chip__title {
  font-size: 24rpx;
  color: var(--up-main-color, #303133);
}

.create-progress-dialog {
  width: 560rpx;
  max-width: 82vw;
  padding: 44rpx 36rpx 36rpx;
  border-radius: 28rpx;
  background: var(--up-card-bg-color, #ffffff);
  border: 1rpx solid var(--up-border-color, #dadbde);
  box-shadow: 0 24rpx 80rpx rgba(15, 23, 42, 0.18);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.create-progress-dialog__visual {
  position: relative;
  width: 136rpx;
  height: 136rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 28rpx;
}

.create-progress-dialog__ring {
  position: absolute;
  inset: 12rpx;
  border-radius: 50%;
  border: 3rpx solid var(--up-primary, #2979ff);
  opacity: 0.26;
  animation: createProgressPulse 1.8s ease-out infinite;
}

.create-progress-dialog__ring--delay {
  animation-delay: 0.55s;
}

.create-progress-dialog__core {
  width: 84rpx;
  height: 84rpx;
  border-radius: 50%;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 10%, var(--up-card-bg-color, #ffffff) 90%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 0 0 1rpx color-mix(in srgb, var(--up-primary, #2979ff) 24%, transparent 76%);
}

.create-progress-dialog__title {
  font-size: 32rpx;
  line-height: 1.35;
  font-weight: 700;
  color: var(--up-main-color, #303133);
  text-align: center;
}

.create-progress-dialog__desc {
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: var(--up-content-color, #606266);
  text-align: center;
}

.create-progress-dialog__stage {
  margin-top: 28rpx;
  min-height: 56rpx;
  padding: 0 22rpx;
  border-radius: 999rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
}

.create-progress-dialog__stage-dot {
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
  background: var(--up-primary, #2979ff);
  animation: createProgressDot 1.2s ease-in-out infinite;
}

.create-progress-dialog__stage-text {
  font-size: 22rpx;
  line-height: 1.3;
  color: var(--up-content-color, #606266);
}

@keyframes createProgressPulse {
  0% {
    transform: scale(0.72);
    opacity: 0.28;
  }
  80% {
    transform: scale(1.25);
    opacity: 0;
  }
  100% {
    transform: scale(1.25);
    opacity: 0;
  }
}

@keyframes createProgressDot {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(0.86);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
