<script setup lang="ts">
import { computed, getCurrentInstance, ref } from "vue"
import { onHide, onLoad, onPullDownRefresh, onShow, onUnload } from "@dcloudio/uni-app"
import { acpApi } from "@/api/acp"
import TaskStatusChip from "../tasks/components/TaskStatusChip.vue"
import TaskMergeSheet from "../tasks/components/TaskMergeSheet.vue"
import TaskAcceptSheet from "../tasks/components/TaskAcceptSheet.vue"
import TaskCancelSheet from "../tasks/components/TaskCancelSheet.vue"
import TaskRestartSheet from "../tasks/components/TaskRestartSheet.vue"
import TaskScheduleSheet from "../tasks/components/TaskScheduleSheet.vue"
import TaskFollowUpSheet from "../tasks/components/TaskFollowUpSheet.vue"
import TaskEditorSheet from "../tasks/components/TaskEditorSheet.vue"
import GitDiffViewer from "@/components/GitDiffViewer.vue"
import {
  applyConnectionAuth,
  openConnectionGateway,
} from "@/services/connection/connectionAccess"
import {
  findStoredConnectionById,
  type ConnectionContext,
} from "@/services/connectionContext"
import { toErrorMessage } from "@/services/gateway/error"
import { buildGitDiffView, type GitDiffViewFile } from "@/services/projectGit"
import { loadRemoteProjects, type RemoteProjectRecord } from "@/services/projectSessions"
import {
  archiveWorkTask,
  cleanupWorkTask,
  deleteWorkTask,
  getWorkTask,
  getWorkTaskDiff,
  listWorkTaskChangedFiles,
  listWorkTaskEvents,
  startWorkTask,
  unqueueWorkTaskMerge,
  updateWorkTask,
  WORK_TASK_CHANGED_CHANNEL,
} from "@/services/workTask"
import {
  isTaskCapableConnection,
  parseTaskDetailRouteOptions,
  taskUnsupportedText,
} from "@/services/taskDetail"
import { buildTaskZoneActions, isTaskActionAllowed, type TaskActionId } from "../tasks/taskActions"
import {
  canDeleteTask,
  canEditTask,
  canRetryCleanup,
  deliveredPrUrl,
  isMergeQueued,
  isWorktreeUsable,
  usesMergeRequests,
  worktreeWasRemoved,
} from "../tasks/taskAcceptance"
import { taskStatusLabel } from "../tasks/taskStatus"
import {
  formatClock,
  formatDateTime,
  isVisibleTaskEvent,
  taskDiffStat,
  taskEventDetail,
  taskEventLabel,
  taskEventTargetStatus,
} from "../tasks/taskPresentation"
import { formatScheduleFull } from "../tasks/taskSchedule"
import { taskAgentLabel } from "../tasks/taskAgentConfig"
import type { CodegGateway } from "@/services/gateway"
import type {
  WorkTask,
  WorkTaskChangedFile,
  WorkTaskDraft,
  WorkTaskEvent,
} from "@/types/workTask"

/**
 * 任务详情页。
 *
 * 布局分四段，与 PC 端右侧抽屉同序（同一件事在两端要按同一个顺序读到）：
 * 1. **头部** —— 标题、状态、项目 / 分支 / agent；
 * 2. **动作区** —— 当前状态的推进动作（`buildTaskZoneActions`，与列表卡片共用同一份判定）；
 * 3. **信息与变更** —— 任务描述、结果摘要、git 坐标、变更文件与 diff；
 * 4. **推进记录** —— 只追加的 `work_task_event` 时间线。
 *
 * 底部工具栏放**不推进状态**的那几件事：打开会话、编辑、重试清理、删除。
 *
 * 数据：`work_task_get` + `work_task_events` + `work_task_changed_files`，并订阅
 * `task://changed` 实时刷新。删除成功后 `navigateBack` —— 详情页的主体已经不存在了。
 */

const currentInstance = getCurrentInstance()
const upThemeVars = computed(() => currentInstance?.proxy?.upThemeVars || {})
const upThemePageStyle = computed(() => currentInstance?.proxy?.upThemePageStyle || {})
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

const route = ref({ connectionId: "", taskId: 0 })
const connection = ref<ConnectionContext | null>(null)
const gateway = ref<CodegGateway | null>(null)
const task = ref<WorkTask | null>(null)
const events = ref<WorkTaskEvent[]>([])
const changedFiles = ref<WorkTaskChangedFile[]>([])
const projects = ref<RemoteProjectRecord[]>([])
const loading = ref(false)
const errorMessage = ref("")
const busy = ref(false)

const diffVisible = ref(false)
const diffTitle = ref("")
const diffLoading = ref(false)
const diffError = ref("")
const diffFiles = ref<GitDiffViewFile[]>([])

const showMergeSheet = ref(false)
const showAcceptSheet = ref(false)
const acceptMode = ref<"complete" | "deliver">("complete")
const showCancelSheet = ref(false)
const showRestartSheet = ref(false)
const restartKind = ref<"retry" | "requeue">("retry")
const showScheduleSheet = ref(false)
const showFollowUpSheet = ref(false)
const showEditorSheet = ref(false)
const showDeleteSheet = ref(false)
const deleteWorktree = ref(false)

let disposeTaskChanged: (() => void) | null = null
let refreshTimer: ReturnType<typeof setTimeout> | null = null
/** 单调递增的请求序号 —— 过期响应据此丢弃（见 `loadTask`）。 */
let loadSeq = 0

/* ===== 派生 ===== */

const zoneActions = computed(() => (task.value ? buildTaskZoneActions(task.value) : []))
const editable = computed(() => (task.value ? canEditTask(task.value) : false))
const deletable = computed(() => (task.value ? canDeleteTask(task.value) : false))
const cleanupRetryable = computed(() => (task.value ? canRetryCleanup(task.value) : false))
const worktreeUsable = computed(() => (task.value ? isWorktreeUsable(task.value) : false))
const hasWorktree = computed(() => task.value?.worktree_folder_id != null)
const stat = computed(() => (task.value ? taskDiffStat(task.value) : null))
const deliveredPr = computed(() => (task.value ? deliveredPrUrl(task.value) : null))
const prLabel = computed(() =>
  usesMergeRequests(task.value) ? "合并请求" : "Pull Request"
)
const worktreeRemoved = computed(() =>
  task.value ? worktreeWasRemoved(task.value) : false
)
const visibleEvents = computed(() => events.value.filter(isVisibleTaskEvent))
const projectName = computed(() => {
  const folderId = task.value?.folder_id
  if (!folderId) return ""
  const project = projects.value.find((item) => item.id === folderId)
  return project?.name || project?.path || ""
})
const promptText = computed(() => task.value?.config?.display_text?.trim() || "")
const unsupportedText = computed(() => taskUnsupportedText(connection.value))

/**
 * 头部那一行的 agent 文案。原先直接显示 `task.agent_type`（用户看到 `claude_code`
 * 这种原始 id），现在优先读保存时记下的 `label_snapshot` —— 它带着**这一轮实际用的
 * 模型**（「Claude Code · Opus 4.6」），而且在 agent 后来被卸载、或选项集换了版本之后
 * 依然说得出人话。与 PC 端 `task-detail-sheet.tsx` 的 `agentLabel` 同一套优先级。
 */
const agentMetaText = computed(() => {
  const current = task.value
  if (!current) return ""
  const snapshot = current.config?.label_snapshot as Record<string, unknown> | null | undefined
  const agentLabel =
    pickLabel(snapshot?.agent_label) ||
    taskAgentLabel(current.agent_type || current.config?.agent_type)
  if (!agentLabel) return ""
  const configLabels = snapshot?.config_labels as Record<string, unknown> | null | undefined
  const modelLabel = pickLabel(configLabels?.model)
  return modelLabel ? `${agentLabel} · ${modelLabel}` : agentLabel
})

function pickLabel(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : ""
}

/**
 * 详情页只握着自己这一行，看不到兄弟任务，所以**判断不出**同项目是否正有合并在跑。
 * 这里恒为 false：合并按钮会说「合并」而不是「加入合并队列」，而
 * `work_task_merge` 的返回值会说出真相（被排队时返回 true，`handleMerged` 据此提示）。
 * 服务端在项目锁下重查，所以这个乐观措辞不会导致错误的操作，只是措辞。
 */
const mergeFolderMerging = false
const mergeAlreadyQueued = computed(() =>
  task.value ? isMergeQueued(task.value) : false
)

const editorProjects = computed(() =>
  projects.value.map((project) => ({
    id: project.id,
    name: project.name || project.path || `项目 #${project.id}`,
    path: project.path,
  }))
)

const editorDefaultFolderId = computed(() => task.value?.folder_id || 0)

/* ===== 生命周期 ===== */

onLoad((options) => {
  route.value = parseTaskDetailRouteOptions(options as Record<string, unknown>)
  connection.value = findStoredConnectionById(route.value.connectionId)
  void reload()
})

onShow(() => {
  // 从会话详情页返回时任务可能已经推进（用户在会话里回答了权限请求）。
  if (gateway.value) {
    // onHide 把订阅拆了，回来要接回去（内部有幂等守卫）。
    ensureTaskChangedSubscription(gateway.value)
  }
  if (gateway.value && route.value.taskId > 0) void loadTask()
})

onPullDownRefresh(() => {
  void reload().finally(() => uni.stopPullDownRefresh())
})

/**
 * 切走本页就停表停订阅。
 *
 * 一次 `scheduleRefresh()` 是三连请求（`getWorkTask` + `listWorkTaskEvents` +
 * `listWorkTaskChangedFiles`）。原先只在 `onUnload` 清理，于是切到别的页面之后，主机
 * 每推一次 `task://changed` 仍然会打出这三个请求，而结果没人看。
 */
onHide(() => {
  teardownTaskDetailSubscription()
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
})

onUnload(() => {
  teardownTaskDetailSubscription()
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
})

function teardownTaskDetailSubscription() {
  if (!disposeTaskChanged) return
  try {
    disposeTaskChanged()
  } catch (error) {
    console.warn("dispose task detail subscription failed:", error)
  }
  disposeTaskChanged = null
}

/* ===== 加载 ===== */

async function reload() {
  errorMessage.value = ""
  if (!route.value.connectionId || route.value.taskId <= 0) {
    errorMessage.value = "缺少任务或连接信息，请返回任务列表重试。"
    return
  }
  if (!connection.value) {
    errorMessage.value = "缺少连接信息，请返回连接页重试。"
    return
  }
  if (!isTaskCapableConnection(connection.value)) {
    errorMessage.value = unsupportedText.value
    return
  }
  loading.value = true
  try {
    const resolved = await openConnectionGateway(connection.value)
    gateway.value = resolved
    applyConnectionAuth(connection.value)
    ensureTaskChangedSubscription(resolved)
    // 项目名只是显示用，失败不影响主体。
    void loadProjects(resolved)
    await loadTask()
  } catch (error) {
    errorMessage.value = toErrorMessage(error)
  } finally {
    loading.value = false
  }
}

async function loadProjects(target: CodegGateway) {
  try {
    projects.value = await loadRemoteProjects(target)
  } catch (error) {
    console.warn("load task detail projects failed:", error)
  }
}

/**
 * 拉任务主体 + 推进记录 + 变更文件。
 *
 * 带**过期响应丢弃**：`onShow`、事件防抖、每个动作的 finally 三条路都会调它，
 * 三个请求可以同时在飞，而它们的返回顺序不保证。没有这个守卫时，一个先发出、
 * 后返回的旧响应会把新状态盖回去 —— 用户会看到刚点的操作"没生效"。
 */
async function loadTask() {
  const target = gateway.value
  if (!target || route.value.taskId <= 0) return
  const seq = ++loadSeq
  try {
    const detail = await getWorkTask(target, route.value.taskId)
    if (seq !== loadSeq) return
    if (!detail) {
      errorMessage.value = "任务不存在或已被删除。"
      task.value = null
      return
    }
    task.value = detail
    errorMessage.value = ""
    await Promise.all([loadEvents(target, seq), loadChangedFiles(target, detail, seq)])
  } catch (error) {
    if (seq !== loadSeq) return
    errorMessage.value = toErrorMessage(error)
  }
}

async function loadEvents(target: CodegGateway, seq: number) {
  try {
    const list = await listWorkTaskEvents(target, route.value.taskId)
    if (seq !== loadSeq) return
    events.value = list
  } catch (error) {
    console.warn("load task events failed:", error)
    if (seq !== loadSeq) return
    events.value = []
  }
}

async function loadChangedFiles(target: CodegGateway, current: WorkTask, seq: number) {
  // worktree 不可用时连请求都不要发 —— 服务端只能报错，而这不是错误状态。
  if (!isWorktreeUsable(current)) {
    changedFiles.value = []
    return
  }
  try {
    const files = await listWorkTaskChangedFiles(target, current.id)
    if (seq !== loadSeq) return
    changedFiles.value = files
  } catch (error) {
    console.warn("load task changed files failed:", error)
    if (seq !== loadSeq) return
    changedFiles.value = []
  }
}

/** 事件驱动刷新，300ms 合并窗口 —— 一次迁移会连发好几条事件。 */
function scheduleRefresh() {
  if (refreshTimer) return
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    void loadTask()
  }, 300)
}

function ensureTaskChangedSubscription(target: CodegGateway) {
  if (disposeTaskChanged) return
  const instanceKey = target.getRemoteInstanceDescriptor().instanceKey
  if (!instanceKey) return
  disposeTaskChanged = acpApi.subscribeGlobalEvent(
    WORK_TASK_CHANGED_CHANNEL,
    () => scheduleRefresh(),
    instanceKey
  )
}

/* ===== 动作 ===== */

async function runAction(fn: (target: CodegGateway) => Promise<unknown>) {
  const target = gateway.value
  if (!target || busy.value) return
  busy.value = true
  try {
    await fn(target)
  } catch (error) {
    uni.showToast({ title: toErrorMessage(error), icon: "none", duration: 3000 })
  } finally {
    busy.value = false
    await loadTask()
  }
}

function refreshAfterAction() {
  void loadTask()
}

/**
 * 动作区的**唯一**落点。每次先对着当前行再校验一遍：详情页开着的时候引擎可能已经
 * 把任务推走了（`task://changed` 会刷新，但用户的手指可能更快）。
 */
function handleZoneAction(id: TaskActionId) {
  const current = task.value
  if (!current) return
  if (!isTaskActionAllowed(current, id)) {
    uni.showToast({ title: "任务状态已变化，已刷新", icon: "none" })
    void loadTask()
    return
  }
  switch (id) {
    case "start":
      uni.showModal({
        title: "开始任务",
        content: `确定开始任务「${current.title}」吗？Agent 将在后台开始处理。`,
        confirmText: "开始",
        cancelText: "取消",
        success: (res) => {
          if (!res.confirm) return
          void runAction((target) => startWorkTask(target, current.id))
        },
      })
      return
    case "schedule":
      showScheduleSheet.value = true
      return
    case "cancel":
    case "abandon":
      showCancelSheet.value = true
      return
    case "retry":
      restartKind.value = "retry"
      showRestartSheet.value = true
      return
    case "requeue":
      restartKind.value = "requeue"
      showRestartSheet.value = true
      return
    case "merge":
    case "editQueuedMerge":
      showMergeSheet.value = true
      return
    case "unqueueMerge":
      uni.showModal({
        title: "取消排队",
        content: "确定取消该任务的合并排队吗？",
        confirmText: "确定",
        cancelText: "取消",
        success: (res) => {
          if (!res.confirm) return
          void runAction((target) => unqueueWorkTaskMerge(target, current.id))
        },
      })
      return
    case "complete":
      acceptMode.value = "complete"
      showAcceptSheet.value = true
      return
    case "deliverPr":
      acceptMode.value = "deliver"
      showAcceptSheet.value = true
      return
    case "followUp":
      showFollowUpSheet.value = true
      return
    case "archive":
      void runAction((target) => archiveWorkTask(target, current.id, true))
      return
    case "unarchive":
      void runAction((target) => archiveWorkTask(target, current.id, false))
      return
    default:
      return
  }
}

function handleMerged(queued: boolean) {
  if (queued) {
    uni.showToast({ title: "已加入合并队列", icon: "none", duration: 2500 })
  }
  void loadTask()
}

function handleAccepted(payload: { mode: "complete" | "deliver"; url: string }) {
  if (payload.mode === "deliver" && payload.url) {
    uni.setClipboardData({
      data: payload.url,
      success: () => uni.showToast({ title: "已创建并复制链接", icon: "success" }),
      fail: () => uni.showToast({ title: "已创建", icon: "success" }),
    })
  } else {
    uni.showToast({ title: "已完成", icon: "success" })
  }
  void loadTask()
}

async function submitEditor(draft: WorkTaskDraft) {
  const target = gateway.value
  const current = task.value
  if (!target || !current) return
  try {
    await updateWorkTask(target, current.id, draft)
    showEditorSheet.value = false
    uni.showToast({ title: "已保存", icon: "success" })
    await loadTask()
  } catch (error) {
    uni.showToast({ title: toErrorMessage(error), icon: "none", duration: 3000 })
  }
}

function openDeleteSheet() {
  deleteWorktree.value = false
  showDeleteSheet.value = true
}

async function confirmDelete() {
  const target = gateway.value
  const current = task.value
  if (!target || !current || busy.value) return
  busy.value = true
  try {
    await deleteWorkTask(target, current.id, hasWorktree.value && deleteWorktree.value)
    showDeleteSheet.value = false
    uni.showToast({ title: "已删除", icon: "success" })
    // 主体已经不存在了，留在这一页只会显示一个空壳。
    setTimeout(() => uni.navigateBack({ delta: 1 }), 300)
  } catch (error) {
    uni.showToast({ title: toErrorMessage(error), icon: "none", duration: 3000 })
    busy.value = false
  }
}

function retryCleanup() {
  const current = task.value
  if (!current) return
  // 清理会删掉 worktree 目录与工作分支 —— 不可撤销，所以必须先问一句。
  uni.showModal({
    title: "重试清理",
    content: "将删除该任务的 worktree 目录与工作分支，且不可恢复。确定继续吗？",
    confirmText: "清理",
    cancelText: "取消",
    success: (res) => {
      if (!res.confirm) return
      void runAction((target) => cleanupWorkTask(target, current.id))
    },
  })
}

/**
 * 打开这个任务的会话详情页。
 *
 * 任务跑起来后有一个真实的 codeg 会话，与会话列表里的会话是同一个东西 ——
 * 所以复用同一个详情页路由，而不是做一个只读回放。`folderId` 用 **worktree 文件夹**：
 * 会话就跑在那里，用项目 folder_id 会让详情页拿到错误的目录上下文。
 */
function openConversation() {
  const current = task.value
  if (!current || current.conversation_id == null) {
    uni.showToast({ title: "该任务还没有会话", icon: "none" })
    return
  }
  const connectionId = String(connection.value?.id || "").trim()
  const encoded = connectionId ? encodeURIComponent(connectionId) : ""
  const folderId = current.worktree_folder_id || current.folder_id || 0
  uni.navigateTo({
    url: `/pages/conversation-detail/index?id=${current.conversation_id}&folderId=${folderId}${
      encoded ? `&connectionId=${encoded}` : ""
    }`,
  })
}

async function openDiff(file: string | null) {
  const target = gateway.value
  const current = task.value
  if (!target || !current) return
  diffVisible.value = true
  diffTitle.value = file || "全部变更"
  diffLoading.value = true
  diffError.value = ""
  diffFiles.value = []
  try {
    const text = await getWorkTaskDiff(target, current.id, file)
    diffFiles.value = buildGitDiffView(text)
  } catch (error) {
    diffError.value = toErrorMessage(error)
  } finally {
    diffLoading.value = false
  }
}

function closeDiff() {
  diffVisible.value = false
  diffFiles.value = []
}

function copyText(value: string, successText = "已复制") {
  if (!value) return
  uni.setClipboardData({
    data: value,
    success: () => uni.showToast({ title: successText, icon: "success" }),
    fail: () => uni.showToast({ title: "复制失败", icon: "none" }),
  })
}

function goBack() {
  uni.navigateBack({ delta: 1 })
}
</script>

<template>
  <view class="page task-detail-page" :style="[upThemeVars, upThemePageStyle]">
    <up-status-bar :bg-color="upThemeVar('--up-page-bg-color', '#f3f4f6')"></up-status-bar>

    <view class="task-detail-shell">
      <view class="task-detail-header" :style="upThemeCardStyle">
        <view class="task-detail-header__top">
          <view class="task-detail-header__back" @click="goBack">
            <up-icon name="arrow-left" size="18" :color="upThemeVar('--up-main-color', '#303133')"></up-icon>
          </view>
          <view class="task-detail-header__copy">
            <text class="task-detail-header__eyebrow">WORK TASK</text>
            <text class="task-detail-header__title">{{ task?.title || "任务详情" }}</text>
          </view>
          <TaskStatusChip v-if="task" :task="task" />
        </view>
        <view v-if="task" class="task-detail-header__meta">
          <text v-if="projectName" class="task-detail-header__meta-text">{{ projectName }}</text>
          <text v-if="projectName && agentMetaText" class="task-detail-header__meta-sep">·</text>
          <text v-if="agentMetaText" class="task-detail-header__meta-text">{{ agentMetaText }}</text>
          <text v-if="task.work_branch" class="task-detail-header__meta-sep">·</text>
          <text v-if="task.work_branch" class="task-detail-header__meta-branch">{{ task.work_branch }}</text>
        </view>
      </view>

      <view v-if="loading && !task" class="task-detail-state" :style="upThemeCardStyle">
        <up-loading-icon mode="circle" size="26" :color="upThemeVar('--up-primary', '#2979ff')"></up-loading-icon>
        <text class="task-detail-state__text">正在加载任务...</text>
      </view>

      <view
        v-else-if="errorMessage && !task"
        class="task-detail-state task-detail-state--error"
        :style="upThemeCardStyle"
      >
        <text class="task-detail-state__title">加载失败</text>
        <text class="task-detail-state__text">{{ errorMessage }}</text>
        <view class="task-detail-state__action" @click="reload">
          <text>重试</text>
        </view>
      </view>

      <template v-else-if="task">
        <!-- 失败原因优先于一切：它是唯一需要立刻做点什么的东西。 -->
        <view v-if="task.last_error" class="task-notice task-notice--error" :style="upThemeCardStyle">
          <text class="task-notice__text">{{ task.last_error }}</text>
        </view>

        <!-- 动作区 -->
        <view v-if="zoneActions.length > 0" class="task-detail-zone" :style="upThemeCardStyle">
          <view v-if="mergeAlreadyQueued" class="task-notice task-notice--warning">
            <text class="task-notice__text">
              正在等待该项目当前的合并完成，轮到时会自动开始。
            </text>
          </view>

          <view v-if="task.preflight && task.status === 'review'" class="task-detail-preflight">
            <text
              :class="[
                'task-detail-preflight__text',
                task.preflight.status === 'passed' && 'task-detail-preflight__text--pass',
                task.preflight.status === 'failed' && 'task-detail-preflight__text--fail',
              ]"
            >
              预检 {{ task.preflight.command }}
              {{
                task.preflight.status === "passed"
                  ? "通过"
                  : task.preflight.status === "failed"
                    ? "未通过"
                    : "运行中…"
              }}
            </text>
            <text
              v-if="task.preflight.status === 'failed' && task.preflight.output_tail"
              class="task-detail-preflight__output"
            >{{ task.preflight.output_tail }}</text>
          </view>

          <view class="task-detail-zone__actions">
            <view
              v-for="action in zoneActions"
              :key="action.id"
              :class="[
                'task-detail-action',
                action.primary && 'task-detail-action--primary',
                action.danger && 'task-detail-action--danger',
              ]"
              @click="handleZoneAction(action.id)"
            >
              <up-icon
                :name="action.icon"
                size="15"
                :color="
                  action.primary
                    ? '#ffffff'
                    : action.danger
                      ? upThemeVar('--up-error', '#fa3534')
                      : upThemeVar('--up-content-color', '#606266')
                "
              ></up-icon>
              <text class="task-detail-action__text">{{ action.label }}</text>
            </view>
          </view>
        </view>

        <!-- 任务描述 -->
        <view v-if="promptText" class="task-detail-card" :style="upThemeCardStyle">
          <view class="task-detail-card__head">
            <text class="task-detail-card__title">任务描述</text>
            <view class="task-detail-card__action" @click="copyText(promptText)">
              <text class="task-detail-card__action-text">复制</text>
            </view>
          </view>
          <text class="task-detail-card__body">{{ promptText }}</text>
        </view>

        <!-- 结果摘要 -->
        <view v-if="task.result_summary" class="task-detail-card" :style="upThemeCardStyle">
          <view class="task-detail-card__head">
            <text class="task-detail-card__title">结果</text>
          </view>
          <text class="task-detail-card__body">{{ task.result_summary }}</text>
        </view>

        <!-- 详情信息 -->
        <view class="task-detail-card" :style="upThemeCardStyle">
          <view class="task-detail-card__head">
            <text class="task-detail-card__title">详情</text>
          </view>
          <view class="task-detail-info">
            <view v-if="task.work_branch" class="task-detail-info__row">
              <text class="task-detail-info__label">分支</text>
              <text class="task-detail-info__value">
                {{ task.work_branch }}{{ task.base_branch ? ` ← ${task.base_branch}` : "" }}
              </text>
            </view>
            <view v-if="task.merge_commit" class="task-detail-info__row">
              <text class="task-detail-info__label">合并提交</text>
              <text class="task-detail-info__value">{{ task.merge_commit.slice(0, 8) }}</text>
            </view>
            <view v-if="deliveredPr" class="task-detail-info__row" @click="copyText(deliveredPr, '已复制链接')">
              <text class="task-detail-info__label">{{ prLabel }}</text>
              <text class="task-detail-info__value task-detail-info__value--link">{{ deliveredPr }}</text>
            </view>
            <view v-if="stat" class="task-detail-info__row">
              <text class="task-detail-info__label">变更</text>
              <text class="task-detail-info__value">
                {{ task.files_changed }} 个文件 +{{ stat.additions }} -{{ stat.deletions }}
              </text>
            </view>
            <view v-if="task.status === 'todo' && task.scheduled_at" class="task-detail-info__row">
              <text class="task-detail-info__label">计划开始</text>
              <text class="task-detail-info__value">{{ formatScheduleFull(task.scheduled_at) }}</text>
            </view>
            <view v-if="worktreeRemoved" class="task-detail-info__row">
              <text class="task-detail-info__label">Worktree</text>
              <text class="task-detail-info__value">已删除</text>
            </view>
            <view class="task-detail-info__row">
              <text class="task-detail-info__label">创建时间</text>
              <text class="task-detail-info__value">{{ formatDateTime(task.created_at) }}</text>
            </view>
            <view v-if="task.started_at" class="task-detail-info__row">
              <text class="task-detail-info__label">开始时间</text>
              <text class="task-detail-info__value">{{ formatDateTime(task.started_at) }}</text>
            </view>
            <view v-if="task.finished_at" class="task-detail-info__row">
              <text class="task-detail-info__label">完成时间</text>
              <text class="task-detail-info__value">{{ formatDateTime(task.finished_at) }}</text>
            </view>
          </view>
        </view>

        <!-- 变更文件 -->
        <view v-if="worktreeUsable" class="task-detail-card" :style="upThemeCardStyle">
          <view class="task-detail-card__head">
            <text class="task-detail-card__title">
              变更文件<text v-if="changedFiles.length > 0" class="task-detail-card__count">{{ changedFiles.length }}</text>
            </text>
            <view v-if="changedFiles.length > 0" class="task-detail-card__action" @click="openDiff(null)">
              <text class="task-detail-card__action-text">查看全部差异</text>
            </view>
          </view>
          <text v-if="changedFiles.length === 0" class="task-detail-card__hint">相对基准还没有变更</text>
          <view v-else class="task-detail-files">
            <view
              v-for="file in changedFiles"
              :key="file.file"
              class="task-detail-file"
              @click="openDiff(file.file)"
            >
              <text class="task-detail-file__path">{{ file.file }}</text>
              <text class="task-detail-file__add">+{{ file.additions }}</text>
              <text class="task-detail-file__del">-{{ file.deletions }}</text>
            </view>
          </view>
        </view>

        <!-- 推进记录 -->
        <view class="task-detail-card" :style="upThemeCardStyle">
          <view class="task-detail-card__head">
            <text class="task-detail-card__title">推进记录</text>
          </view>
          <text v-if="visibleEvents.length === 0" class="task-detail-card__hint">暂无活动</text>
          <view v-else class="task-detail-timeline">
            <view
              v-for="event in visibleEvents"
              :key="event.id"
              :class="[
                'task-detail-event',
                taskEventTargetStatus(event) && 'task-detail-event--header',
              ]"
            >
              <view class="task-detail-event__line">
                <text class="task-detail-event__label">
                  {{
                    taskEventTargetStatus(event)
                      ? taskStatusLabel({ status: taskEventTargetStatus(event), failure_reason: null })
                      : taskEventLabel(event)
                  }}
                </text>
                <text class="task-detail-event__time">{{ formatClock(event.created_at) }}</text>
              </view>
              <text v-if="taskEventDetail(event)" class="task-detail-event__detail">
                {{ taskEventDetail(event) }}
              </text>
            </view>
          </view>
        </view>

        <!-- 底部工具栏：不推进状态的那几件事 -->
        <view class="task-detail-footer" :style="upThemeCardStyle">
          <view
            v-if="task.conversation_id != null"
            class="task-detail-footer__item"
            @click="openConversation"
          >
            <up-icon name="chat" size="16" :color="upThemeVar('--up-primary', '#2979ff')"></up-icon>
            <text class="task-detail-footer__text">打开会话</text>
          </view>
          <view v-if="editable" class="task-detail-footer__item" @click="showEditorSheet = true">
            <up-icon name="edit-pen" size="16" :color="upThemeVar('--up-content-color', '#606266')"></up-icon>
            <text class="task-detail-footer__text">编辑</text>
          </view>
          <view
            v-if="cleanupRetryable"
            class="task-detail-footer__item"
            @click="retryCleanup"
          >
            <up-icon name="trash" size="16" :color="upThemeVar('--up-warning', '#ff9900')"></up-icon>
            <text class="task-detail-footer__text">重试清理</text>
          </view>
          <view class="task-detail-footer__spacer"></view>
          <view
            v-if="deletable"
            class="task-detail-footer__item task-detail-footer__item--danger"
            @click="openDeleteSheet"
          >
            <up-icon name="trash" size="16" :color="upThemeVar('--up-error', '#fa3534')"></up-icon>
            <text class="task-detail-footer__text">删除</text>
          </view>
        </view>
      </template>

      <view class="task-detail-safe-bottom"></view>
    </view>

    <!-- diff 弹层 -->
    <up-popup :show="diffVisible" mode="bottom" :round="28" @close="closeDiff">
      <view class="task-sheet" :style="upThemeCardStyle">
        <view class="task-sheet__hd">
          <text class="task-sheet__title">{{ diffTitle }}</text>
          <view class="task-sheet__close" @click="closeDiff">
            <up-icon name="close" size="20" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
          </view>
        </view>
        <view v-if="diffLoading" class="task-detail-state">
          <up-loading-icon mode="circle" size="26" :color="upThemeVar('--up-primary', '#2979ff')"></up-loading-icon>
          <text class="task-detail-state__text">正在加载差异...</text>
        </view>
        <view v-else-if="diffError" class="task-notice task-notice--error">
          <text class="task-notice__text">{{ diffError }}</text>
        </view>
        <scroll-view v-else class="task-sheet__scroll" scroll-y enhanced>
          <GitDiffViewer :files="diffFiles" />
        </scroll-view>
        <view class="task-safe-bottom"></view>
      </view>
    </up-popup>

    <!-- 删除确认 -->
    <up-popup :show="showDeleteSheet" mode="bottom" :round="28" @close="showDeleteSheet = false">
      <view class="task-sheet" :style="upThemeCardStyle">
        <view class="task-sheet__hd">
          <view class="task-detail-delete__copy">
            <text class="task-sheet__title">删除任务？</text>
            <text class="task-sheet__desc">
              「{{ task?.title }}」将从列表移除。进行中的运行会先被取消。
            </text>
          </view>
          <view class="task-sheet__close" @click="showDeleteSheet = false">
            <up-icon name="close" size="20" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
          </view>
        </view>

        <view v-if="hasWorktree" class="task-form-switch">
          <view class="task-form-switch__copy">
            <text class="task-form-switch__title">同时删除其 worktree</text>
          </view>
          <up-switch v-model="deleteWorktree" size="22"></up-switch>
        </view>

        <view class="task-sheet__actions">
          <up-button shape="circle" :disabled="busy" @click="showDeleteSheet = false">取消</up-button>
          <up-button type="error" shape="circle" :loading="busy" @click="confirmDelete">删除</up-button>
        </view>

        <view class="task-safe-bottom"></view>
      </view>
    </up-popup>

    <TaskMergeSheet
      v-model:show="showMergeSheet"
      :task="task"
      :folderMerging="mergeFolderMerging"
      :alreadyQueued="mergeAlreadyQueued"
      :gateway="gateway"
      @merged="handleMerged"
    />

    <TaskAcceptSheet
      v-model:show="showAcceptSheet"
      :mode="acceptMode"
      :task="task"
      :gateway="gateway"
      @done="handleAccepted"
    />

    <TaskCancelSheet
      v-model:show="showCancelSheet"
      :task="task"
      :gateway="gateway"
      @canceled="refreshAfterAction"
    />

    <TaskRestartSheet
      v-model:show="showRestartSheet"
      :task="task"
      :kind="restartKind"
      :gateway="gateway"
      @restarted="refreshAfterAction"
    />

    <TaskScheduleSheet
      v-model:show="showScheduleSheet"
      :task="task"
      :gateway="gateway"
      @scheduled="refreshAfterAction"
    />

    <TaskFollowUpSheet
      v-model:show="showFollowUpSheet"
      :task="task"
      :gateway="gateway"
      @sent="refreshAfterAction"
    />

    <TaskEditorSheet
      v-model:show="showEditorSheet"
      :task="task"
      :projects="editorProjects"
      :defaultFolderId="editorDefaultFolderId"
      :gateway="gateway"
      @submit="submitEditor"
    />
  </view>
</template>

<style scoped lang="scss">
@import "../tasks/index.scss";

.page {
  min-height: 100vh;
}

.task-detail-page {
  background: var(--up-page-bg-color, var(--up-bg-color, #f3f4f6));
}

.task-detail-shell {
  padding: 20rpx 24rpx 40rpx;
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.task-detail-header,
.task-detail-zone,
.task-detail-card,
.task-detail-state,
.task-detail-footer {
  border-radius: 24rpx;
  background: var(--up-card-bg-color, #ffffff);
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.task-detail-header {
  padding: 24rpx;
}

.task-detail-header__top {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
}

.task-detail-header__back {
  width: 60rpx;
  height: 60rpx;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.task-detail-header__copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.task-detail-header__eyebrow {
  font-size: 20rpx;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--up-primary, #2979ff);
}

.task-detail-header__title {
  font-size: 34rpx;
  font-weight: 700;
  line-height: 1.3;
  color: var(--up-main-color, #303133);
  word-break: break-word;
}

.task-detail-header__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10rpx;
  margin-top: 16rpx;
}

.task-detail-header__meta-text,
.task-detail-header__meta-sep,
.task-detail-header__meta-branch {
  font-size: 22rpx;
  color: var(--up-content-color, #606266);
}

.task-detail-header__meta-sep {
  color: var(--up-light-color, #c0c4cc);
}

.task-detail-header__meta-branch {
  font-family: "Courier New", monospace;
}

.task-detail-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14rpx;
  padding: 48rpx 32rpx;
  text-align: center;
}

.task-detail-state__title {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.task-detail-state__text {
  font-size: 24rpx;
  line-height: 1.5;
  color: var(--up-content-color, #606266);
  word-break: break-word;
}

.task-detail-state__action {
  margin-top: 8rpx;
  padding: 14rpx 32rpx;
  border-radius: 999rpx;
  background: var(--up-primary, #2979ff);
  color: #ffffff;
  font-size: 24rpx;
  font-weight: 700;
}

.task-detail-zone {
  padding: 22rpx 20rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.task-detail-zone__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12rpx;
}

.task-detail-action {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  padding: 14rpx 26rpx;
  border-radius: 999rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.task-detail-action__text {
  font-size: 24rpx;
  font-weight: 700;
  color: var(--up-content-color, #606266);
}

.task-detail-action--primary {
  background: var(--up-primary, #2979ff);
}

.task-detail-action--primary .task-detail-action__text {
  color: #ffffff;
}

.task-detail-action--danger .task-detail-action__text {
  color: var(--up-error, #fa3534);
}

.task-detail-action--primary.task-detail-action--danger {
  background: var(--up-error, #fa3534);
}

.task-detail-action--primary.task-detail-action--danger .task-detail-action__text {
  color: #ffffff;
}

.task-detail-preflight {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.task-detail-preflight__text {
  font-size: 24rpx;
  color: var(--up-content-color, #606266);
}

.task-detail-preflight__text--pass {
  color: var(--up-success, #19be6b);
}

.task-detail-preflight__text--fail {
  color: var(--up-error, #fa3534);
}

.task-detail-preflight__output {
  padding: 14rpx 16rpx;
  border-radius: 14rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  font-family: "Courier New", monospace;
  font-size: 20rpx;
  line-height: 1.5;
  color: var(--up-content-color, #606266);
  word-break: break-all;
}

.task-detail-card {
  padding: 22rpx 20rpx;
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.task-detail-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.task-detail-card__title {
  font-size: 26rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.task-detail-card__count {
  margin-left: 10rpx;
  font-size: 22rpx;
  font-weight: 600;
  color: var(--up-tips-color, #909193);
}

.task-detail-card__action {
  padding: 8rpx 20rpx;
  border-radius: 999rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.task-detail-card__action-text {
  font-size: 22rpx;
  color: var(--up-primary, #2979ff);
}

.task-detail-card__body {
  font-size: 26rpx;
  line-height: 1.6;
  color: var(--up-content-color, #606266);
  word-break: break-word;
  white-space: pre-wrap;
}

.task-detail-card__hint {
  font-size: 22rpx;
  color: var(--up-tips-color, #909193);
}

.task-detail-info {
  display: flex;
  flex-direction: column;
}

.task-detail-info__row {
  display: flex;
  align-items: flex-start;
  gap: 20rpx;
  padding: 14rpx 0;
  border-bottom: 1rpx solid var(--up-border-color, #ebeef5);
}

.task-detail-info__row:last-child {
  border-bottom: none;
}

.task-detail-info__label {
  width: 150rpx;
  flex-shrink: 0;
  font-size: 22rpx;
  color: var(--up-tips-color, #909193);
}

.task-detail-info__value {
  flex: 1;
  min-width: 0;
  font-size: 24rpx;
  line-height: 1.5;
  color: var(--up-main-color, #303133);
  word-break: break-all;
}

.task-detail-info__value--link {
  color: var(--up-primary, #2979ff);
}

.task-detail-files {
  display: flex;
  flex-direction: column;
  gap: 2rpx;
}

.task-detail-file {
  display: flex;
  align-items: center;
  gap: 14rpx;
  padding: 14rpx 16rpx;
  border-radius: 14rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.task-detail-file__path {
  flex: 1;
  min-width: 0;
  font-family: "Courier New", monospace;
  font-size: 22rpx;
  color: var(--up-main-color, #303133);
  word-break: break-all;
}

.task-detail-file__add {
  flex-shrink: 0;
  font-size: 20rpx;
  font-family: "Courier New", monospace;
  color: var(--up-success, #19be6b);
}

.task-detail-file__del {
  flex-shrink: 0;
  font-size: 20rpx;
  font-family: "Courier New", monospace;
  color: var(--up-error, #fa3534);
}

.task-detail-timeline {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.task-detail-event {
  padding: 10rpx 0;
}

.task-detail-event--header {
  padding-top: 18rpx;
}

.task-detail-event__line {
  display: flex;
  align-items: baseline;
  gap: 16rpx;
}

.task-detail-event__label {
  flex: 1;
  min-width: 0;
  font-size: 24rpx;
  color: var(--up-content-color, #606266);
  word-break: break-word;
}

.task-detail-event--header .task-detail-event__label {
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.task-detail-event__time {
  flex-shrink: 0;
  font-size: 20rpx;
  color: var(--up-tips-color, #909193);
}

.task-detail-event__detail {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  line-height: 1.5;
  color: var(--up-tips-color, #909193);
  word-break: break-word;
}

.task-detail-footer {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 18rpx 20rpx;
}

.task-detail-footer__item {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  padding: 12rpx 22rpx;
  border-radius: 999rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.task-detail-footer__text {
  font-size: 22rpx;
  font-weight: 600;
  color: var(--up-content-color, #606266);
}

.task-detail-footer__item--danger .task-detail-footer__text {
  color: var(--up-error, #fa3534);
}

.task-detail-footer__spacer {
  flex: 1;
  min-width: 0;
}

.task-detail-delete__copy {
  flex: 1;
  min-width: 0;
}

.task-detail-safe-bottom {
  height: calc(36rpx + env(safe-area-inset-bottom));
}
</style>
