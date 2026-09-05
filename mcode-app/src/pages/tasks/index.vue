<template>
  <view class="page tasks-page" :style="[upThemeVars, upThemePageStyle]">
    <view class="tasks-shell">
      <up-sticky
        class="tasks-sticky"
        :offset-top="0"
        :custom-nav-height="0"
        :bg-color="upThemeVar('--up-page-bg-color', '#f5f5f7')"
        z-index="20"
      >
        <up-status-bar :bg-color="upThemeVar('--up-page-bg-color', '#f5f5f7')"></up-status-bar>
        <TaskPageHeader
          :activeTab="filter.tab"
          :searchKeyword="filter.keyword"
          :tabs="TASK_TAB_IDS"
          :counts="tabCounts"
          :filterSummary="filterSummary"
          :filterActive="filterActive"
          @update:activeTab="handleTabChange"
          @update:searchKeyword="filter.keyword = $event"
          @create="openCreateSheet"
          @openFilter="showFilterSheet = true"
          @openSettings="openSettingsSheet"
          @openForge="openForgePanel"
        />
      </up-sticky>

      <!-- 没有可用连接：任务全部来自 codeg 服务端，没有连接就什么都做不了。 -->
      <view v-if="connections.length === 0" class="tasks-empty-fullpage">
        <up-empty mode="data" :text="noConnectionText">
          <template #bottom>
            <up-button
              type="primary"
              size="normal"
              customStyle="margin-top:32rpx"
              @click="goToConnections"
            >前往连接</up-button>
          </template>
        </up-empty>
      </view>

      <view v-else class="tasks-body">
        <view v-if="loading && entries.length === 0" class="tasks-inline-loading">
          <up-loading-icon mode="circle" size="28" :color="upThemeVar('--up-primary', '#2979ff')"></up-loading-icon>
          <text class="tasks-inline-loading__text">加载中...</text>
        </view>

        <view v-else-if="errorMessage && entries.length === 0" class="tasks-error-card" :style="upThemeCardStyle">
          <text class="tasks-error-card__title">加载失败</text>
          <text class="tasks-error-card__text">{{ errorMessage }}</text>
          <view class="tasks-error-card__action" @click="reload">
            <text>重试</text>
          </view>
        </view>

        <view v-else-if="visibleEntries.length === 0" class="tasks-empty-fullpage">
          <up-empty mode="list" :text="emptyText"></up-empty>
        </view>

        <view v-else class="tasks-list">
          <TaskCard
            v-for="entry in visibleEntries"
            :key="`${entry.connectionKey}-${entry.task.id}`"
            :entry="entry"
            :now="now"
            :mergeQueueRank="queueRanks.get(entry.task.id)"
            :pendingActions="pendingActions"
            @open="openTaskDetail(entry)"
            @action="handleCardAction(entry, $event)"
          />
        </view>

        <!-- 部分连接读取失败时不遮挡已加载的任务，只在列表末尾说明。 -->
        <view v-if="errorMessage && entries.length > 0" class="tasks-partial-error">
          <text class="tasks-partial-error__text">{{ errorMessage }}</text>
        </view>

        <view class="tasks-safe-bottom"></view>
      </view>
    </view>

    <TaskEditorSheet
      v-model:show="showEditorSheet"
      :task="editorTask"
      :projects="editorProjects"
      :defaultFolderId="editorDefaultFolderId"
      :gateway="editorGateway"
      @submit="submitEditor"
    />

    <TaskMergeSheet
      v-model:show="showMergeSheet"
      :task="mergeTask"
      :folderMerging="mergeFolderMerging"
      :alreadyQueued="mergeAlreadyQueued"
      :gateway="actionGateway"
      @merged="handleMerged"
    />

    <TaskAcceptSheet
      v-model:show="showAcceptSheet"
      :mode="acceptMode"
      :task="acceptTask"
      :gateway="actionGateway"
      @done="handleAccepted"
    />

    <TaskCancelSheet
      v-model:show="showCancelSheet"
      :task="cancelTask"
      :gateway="actionGateway"
      @canceled="refreshAfterAction"
    />

    <TaskRestartSheet
      v-model:show="showRestartSheet"
      :task="restartTask"
      :kind="restartKind"
      :gateway="actionGateway"
      @restarted="refreshAfterAction"
    />

    <TaskScheduleSheet
      v-model:show="showScheduleSheet"
      :task="scheduleTask"
      :gateway="actionGateway"
      @scheduled="refreshAfterAction"
    />

    <TaskFollowUpSheet
      v-model:show="showFollowUpSheet"
      :task="followUpTask"
      :gateway="actionGateway"
      @sent="refreshAfterAction"
    />

    <TaskSettingsSheet
      v-model:show="showSettingsSheet"
      :folderId="settingsFolderId"
      :folderName="settingsFolderName"
      :folderPath="settingsFolderPath"
      :gateway="activeGateway"
      @saved="refreshAfterAction"
    />

    <TaskFilterSheet
      v-model:show="showFilterSheet"
      :connections="filterConnectionOptions"
      :projects="filterProjectOptions"
      :connectionKey="filter.connectionKey"
      :folderId="filter.folderId"
      :showCanceled="filter.showCanceled"
      :showArchived="filter.showArchived"
      @update:connectionKey="filter.connectionKey = $event"
      @update:folderId="filter.folderId = $event"
      @update:showCanceled="filter.showCanceled = $event"
      @update:showArchived="filter.showArchived = $event"
      @reset="resetFilter"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, onMounted, reactive, ref, watch } from "vue"
import { onHide, onPullDownRefresh, onShow, onUnload } from "@dcloudio/uni-app"
import { acpApi } from "@/api/acp"
import TaskPageHeader from "./components/TaskPageHeader.vue"
import TaskCard from "./components/TaskCard.vue"
import TaskEditorSheet from "./components/TaskEditorSheet.vue"
import TaskMergeSheet from "./components/TaskMergeSheet.vue"
import TaskAcceptSheet from "./components/TaskAcceptSheet.vue"
import TaskCancelSheet from "./components/TaskCancelSheet.vue"
import TaskRestartSheet from "./components/TaskRestartSheet.vue"
import TaskScheduleSheet from "./components/TaskScheduleSheet.vue"
import TaskFollowUpSheet from "./components/TaskFollowUpSheet.vue"
import TaskSettingsSheet from "./components/TaskSettingsSheet.vue"
import TaskFilterSheet from "./components/TaskFilterSheet.vue"
import {
  applyConnectionAuth,
  listConnectedConnections,
  openConnectionGateway,
} from "@/services/connection/connectionAccess"
import { buildConnectionKey, type ConnectionContext } from "@/services/connectionContext"
import { toErrorMessage } from "@/services/gateway/error"
import { loadRemoteProjects, type RemoteProjectRecord } from "@/services/projectSessions"
import {
  archiveWorkTask,
  createWorkTask,
  listWorkTasks,
  startWorkTask,
  unqueueWorkTaskMerge,
  updateWorkTask,
  WORK_TASK_CHANGED_CHANNEL,
} from "@/services/workTask"
import { buildTaskDetailRoute, isTaskCapableConnection } from "@/services/taskDetail"
import { buildForgeRoute, isForgeCapableConnection } from "@/services/forge/forgeRoute"
import { readStoredForgeScope } from "@/services/forge/forgeScopePreference"
import {
  readStoredTaskFilter,
  writeStoredTaskFilter,
} from "@/services/taskFilterPreference"
import {
  countTaskEntriesByTab,
  DEFAULT_TASK_LIST_FILTER,
  filterTaskEntries,
  resolveTaskListEmptyText,
  type TaskListEntry,
} from "./taskPresentation"
import { TASK_TAB_IDS, type TaskTabId } from "./taskStatus"
import { isFolderMerging, isMergeQueued, mergeQueueRanks } from "./taskAcceptance"
import { isTaskActionAllowed, type TaskActionId } from "./taskActions"
import type { CodegGateway } from "@/services/gateway"
import type { WorkTask, WorkTaskDraft } from "@/types/workTask"

/**
 * 任务列表页（底部 tab「任务」）。
 *
 * 它对接的是 codeg-plus 的 **work_task** 功能：任务由服务端引擎无头执行，在独立
 * worktree 里跑 agent，人只负责下单与验收。手机端要做的三件事是「看到状态」、
 * 「推进状态」、「进会话看细节」。
 *
 * 数据流：
 * 1. 每条**已连接**且支持任务的连接各自 `work_task_list(null)` 拉全量；
 * 2. 结果打上连接标识摊平成一个列表（`TaskListEntry`）—— 手机上没有看板列，
 *    一个按 `updated_at` 倒序的流是唯一说得通的默认；
 * 3. 每条连接订阅 `task://changed`（载荷只有 id，一律重新拉取）—— 引擎无头运行，
 *    这条广播是打开的列表唯一能知道任务推进了的途径；
 * 4. 每个写操作都是「发出去 → 重新拉取」，不做乐观更新：状态机在服务端，且每次迁移
 *    都是带期望状态的 CAS，客户端猜出来的中间态只会和真相打架。
 *
 * 为什么不用 `api/acp.ts` 那个单例来发任务命令：它默认打到全局 auth store 的网关，
 * 而这一页同时装着多条连接的任务，必须按 entry 显式选网关。事件订阅仍走 acpApi ——
 * 那是 instanceKey 维度的，本来就支持多实例。
 */

const currentInstance = getCurrentInstance()
const upThemeVars = computed(() => currentInstance?.proxy?.upThemeVars || {})
const upThemePageStyle = computed(() => currentInstance?.proxy?.upThemePageStyle || {})
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

interface ConnectionBucket {
  key: string
  name: string
  connection: ConnectionContext
  gateway: CodegGateway | null
  instanceKey: string
  projects: RemoteProjectRecord[]
}

const stored = readStoredTaskFilter()
const filter = reactive({
  tab: stored.tab as TaskTabId,
  keyword: "",
  connectionKey: stored.connectionKey,
  folderId: stored.folderId,
  showCanceled: stored.showCanceled,
  showArchived: stored.showArchived,
})

const connections = ref<ConnectionBucket[]>([])
const entries = ref<TaskListEntry[]>([])
const loading = ref(false)
const errorMessage = ref("")
/** 共享的渲染时刻，让同一屏所有相对时间口径一致。 */
const now = ref(Date.now())

const showEditorSheet = ref(false)
const showMergeSheet = ref(false)
const showAcceptSheet = ref(false)
const showCancelSheet = ref(false)
const showRestartSheet = ref(false)
const showScheduleSheet = ref(false)
const showFollowUpSheet = ref(false)
const showSettingsSheet = ref(false)
const showFilterSheet = ref(false)

const editorTask = ref<WorkTask | null>(null)
/**
 * 编辑器作用在**哪条连接**上。
 *
 * 不能靠 `filter.connectionKey` 顶替：那样点一下别的连接上的任务的「编辑」，整个列表
 * 会跟着收窄到那条连接 —— 用户只想改一个标题，却发现别的机器的任务全不见了。
 * 空串 = 用当前筛选那条（新建时的情形）。
 */
const editorConnectionKey = ref("")
const mergeTask = ref<WorkTask | null>(null)
const acceptTask = ref<WorkTask | null>(null)
const acceptMode = ref<"complete" | "deliver">("complete")
const cancelTask = ref<WorkTask | null>(null)
const restartTask = ref<WorkTask | null>(null)
const restartKind = ref<"retry" | "requeue">("retry")
const scheduleTask = ref<WorkTask | null>(null)
const followUpTask = ref<WorkTask | null>(null)
/**
 * 当前动作作用在哪条连接上。弹层只拿到 task 与 gateway 两样东西，所以打开弹层时
 * 必须**同时**把网关定下来 —— 任务 id 只在它自己的连接里唯一。
 */
const actionGateway = ref<CodegGateway | null>(null)
const settingsFolderId = ref(0)
const settingsFolderName = ref("")
/** 设置弹层探测智能体选项时用的 `workingDir`；全局作用域为空。 */
const settingsFolderPath = ref("")

const disposeTaskChanged = new Map<string, () => void>()
let refreshTimer: ReturnType<typeof setTimeout> | null = null
let nowTimer: ReturnType<typeof setInterval> | null = null
let loadPromise: Promise<void> | null = null
/** 有请求在飞时又被调用过 —— 飞完要补跑一趟（见 `loadTasks`）。 */
let loadDirty = false
/** 正在执行的动作 —— 用于显示加载状态，格式为 `${taskId}:${actionId}`。 */
const pendingActions = ref<Set<string>>(new Set())

/* ===== 派生 ===== */

const visibleEntries = computed(() => filterTaskEntries(entries.value, filter))
const tabCounts = computed(() => countTaskEntriesByTab(entries.value, filter))
const queueRanks = computed(() => mergeQueueRanks(entries.value.map((entry) => entry.task)))
const emptyText = computed(() =>
  resolveTaskListEmptyText(filter, entries.value.length > 0)
)
const filterActive = computed(
  () =>
    filter.showCanceled !== DEFAULT_TASK_LIST_FILTER.showCanceled ||
    filter.showArchived !== DEFAULT_TASK_LIST_FILTER.showArchived ||
    Boolean(filter.connectionKey) ||
    filter.folderId > 0
)

const activeBucket = computed(() => {
  if (filter.connectionKey) {
    return connections.value.find((item) => item.key === filter.connectionKey) || null
  }
  // 没选连接时用第一条：新建任务与设置总得落在某台机器上，而单连接是绝大多数情形。
  return connections.value[0] || null
})
const activeGateway = computed(() => activeBucket.value?.gateway || null)

const filterSummary = computed(() => {
  const bucket = activeBucket.value
  if (connections.value.length === 0) return "未连接"
  const connectionName = filter.connectionKey
    ? bucket?.name || "未知连接"
    : connections.value.length > 1
      ? "全部连接"
      : bucket?.name || ""
  if (filter.folderId > 0) {
    const project = bucket?.projects.find((item) => item.id === filter.folderId)
    return [connectionName, project?.name || `项目 #${filter.folderId}`]
      .filter(Boolean)
      .join(" · ")
  }
  return connectionName
})

const filterConnectionOptions = computed(() =>
  connections.value.map((item) => ({ key: item.key, name: item.name }))
)
const filterProjectOptions = computed(() =>
  (activeBucket.value?.projects || []).map((project) => ({
    id: project.id,
    name: project.name || project.path || `项目 #${project.id}`,
  }))
)

/**
 * 编辑器实际使用的连接：编辑时是任务自己那条，新建时是当前筛选那条。
 * 任务 id 只在它自己的连接里唯一，发错服务端会更新到一个同 id 的无关任务上。
 */
const editorBucket = computed(() => {
  if (editorConnectionKey.value) {
    return (
      connections.value.find((item) => item.key === editorConnectionKey.value) || null
    )
  }
  return activeBucket.value
})
const editorGateway = computed(() => editorBucket.value?.gateway || null)

const editorProjects = computed(() =>
  (editorBucket.value?.projects || []).map((project) => ({
    id: project.id,
    name: project.name || project.path || `项目 #${project.id}`,
    path: project.path,
  }))
)
const editorDefaultFolderId = computed(() => filter.folderId)

const mergeFolderMerging = computed(() => {
  const task = mergeTask.value
  if (!task) return false
  return isFolderMerging(
    entries.value.map((entry) => entry.task),
    task.folder_id
  )
})
const mergeAlreadyQueued = computed(() => {
  const task = mergeTask.value
  if (!task) return false
  // 队列状态读**实时**那一行：弹层开着时另一个合并开始了，「合并」要变成「排队」。
  const live = findLiveTask(task.id)
  return live ? isMergeQueued(live) : isMergeQueued(task)
})

/**
 * 存储里存在任何连接吗（无论是否支持任务）。用来区分「一台都没连」与「连的都不是
 * codeg」—— 两种空状态该说的话不一样。
 */
const hasAnyStoredConnection = ref(false)

const noConnectionText = computed(() =>
  hasAnyStoredConnection.value
    ? "当前连接不支持任务功能，请使用 codeg 连接"
    : "请先添加连接"
)

/* ===== 生命周期 ===== */

onMounted(() => {
  void reload()
  nowTimer = setInterval(() => {
    now.value = Date.now()
  }, 60_000)
})

onShow(() => {
  // 从详情页返回、或从别处切回来时重新拉一次：详情页里的操作会改状态，而
  // `task://changed` 在本页被 onHide 拆掉过（tabBar 页切换不卸载，但订阅可能
  // 因为断线重连而错过事件）。
  if (!nowTimer) {
    nowTimer = setInterval(() => {
      now.value = Date.now()
    }, 60_000)
  }
  // **必须走 `reload()`**：`onHide` 把订阅拆了，而只有 `prepareConnections()` 会重新
  // `ensureTaskChangedSubscription`。单独 `loadTasks()` 只刷数据、不会把订阅接回来。
  void reload()
})

/**
 * 切走本页就停表停订阅。
 *
 * 本页是 tabBar 页，`onUnload` 实践中几乎不触发 —— 只靠它清理的话，切到别的 tab 之后
 * 主机每推一次 `task://changed`，这里仍然会打出一整轮**全量**列表请求
 * （每条已连接 bucket 一次 `listWorkTasks(gateway, null)`），而结果没人看。
 * 60s 的 `nowTimer` 同理：它只驱动时间文案，隐藏时每分钟让整列表重渲染一次纯属浪费。
 */
onHide(() => {
  teardownSubscriptions()
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
  if (nowTimer) {
    clearInterval(nowTimer)
    nowTimer = null
  }
})

onPullDownRefresh(() => {
  void reload().finally(() => {
    uni.stopPullDownRefresh()
  })
})

onUnload(() => {
  teardownSubscriptions()
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
  if (nowTimer) {
    clearInterval(nowTimer)
    nowTimer = null
  }
})

watch(
  () => [filter.tab, filter.connectionKey, filter.folderId, filter.showCanceled, filter.showArchived],
  () => {
    writeStoredTaskFilter({
      tab: filter.tab,
      connectionKey: filter.connectionKey,
      folderId: filter.folderId,
      showCanceled: filter.showCanceled,
      showArchived: filter.showArchived,
    })
  }
)

/* ===== 加载 ===== */

/** 重新解析连接 + 拉任务。连接列表会被别的页面改，所以每次都重读存储。 */
async function reload() {
  await prepareConnections()
  await loadTasks()
}

async function prepareConnections() {
  const savedConnections = listConnectedConnections()
  hasAnyStoredConnection.value = savedConnections.length > 0
  const capable = savedConnections.filter((connection) => isTaskCapableConnection(connection))
  const buckets: ConnectionBucket[] = []
  for (const connection of capable) {
    const key = buildConnectionKey(connection)
    if (!key) continue
    const previous = connections.value.find((item) => item.key === key)
    try {
      const gateway = await openConnectionGateway(connection)
      const instanceKey = gateway.getRemoteInstanceDescriptor().instanceKey
      // 项目列表只是给筛选与新建用的辅助数据，失败不该拖垮任务列表。
      let projects = previous?.projects || []
      try {
        projects = await loadRemoteProjects(gateway)
      } catch (error) {
        console.warn("load task projects failed:", connection.name, error)
      }
      buckets.push({
        key,
        name: connection.name,
        connection,
        gateway,
        instanceKey,
        projects,
      })
      ensureTaskChangedSubscription(instanceKey)
    } catch (error) {
      console.warn("resolve task connection failed:", connection.name, error)
      // 连不上的连接仍然保留在列表里（带上一次的项目缓存），这样它下面已加载的任务
      // 不会因为一次瞬时失败就消失。
      buckets.push({
        key,
        name: connection.name,
        connection,
        gateway: previous?.gateway || null,
        instanceKey: previous?.instanceKey || "",
        projects: previous?.projects || [],
      })
    }
  }
  connections.value = buckets
  pruneFilterScope()
}

/**
 * 筛选自愈：选中的连接 / 项目已经不在了就退回「全部」。
 *
 * 用**派生式清理**而不是等用户发现空列表 —— 否则顶部摘要写着某个项目名，
 * 下面却一条都没有，而用户无从知道该点哪里。
 */
function pruneFilterScope() {
  if (filter.connectionKey && !connections.value.some((item) => item.key === filter.connectionKey)) {
    filter.connectionKey = ""
    filter.folderId = 0
    return
  }
  if (filter.folderId > 0) {
    const bucket = activeBucket.value
    if (bucket && !bucket.projects.some((project) => project.id === filter.folderId)) {
      // 项目列表可能只是这次没读到（网关瞬时失败），有缓存时不要误清 ——
      // 只有确实拿到过一份非空列表且里面没有它，才认为它没了。
      if (bucket.projects.length > 0) filter.folderId = 0
    }
  }
}

/**
 * 拉全部连接的任务。
 *
 * 同一时刻只跑一次，但**重复调用不能直接复用在飞的那个 promise**：
 * `runAction` 在 finally 里 `await loadTasks()`，如果 300ms 事件防抖刚好在这次写操作
 * 之前起跑，那个 promise 是**写之前**发出的请求 —— 复用它等于让调用方拿到一份看不到
 * 自己刚做的改动的列表。所以在飞时只记一个"脏"标记，飞完再补跑一趟，返回的 promise
 * 一直等到那趟结束。
 */
function loadTasks(): Promise<void> {
  if (loadPromise) {
    loadDirty = true
    return loadPromise
  }
  loadPromise = runLoadChain().finally(() => {
    loadPromise = null
  })
  return loadPromise
}

/** 跑到没有新的请求进来为止。循环而不是递归，避免长时间事件流叠出深栈。 */
async function runLoadChain() {
  do {
    loadDirty = false
    await runLoadTasks()
  } while (loadDirty)
}

async function runLoadTasks() {
  const buckets = connections.value.filter((item) => item.gateway)
  if (buckets.length === 0) {
    entries.value = []
    loading.value = false
    return
  }
  loading.value = true
  const failures: string[] = []
  const collected: TaskListEntry[] = []
  await Promise.all(
    buckets.map(async (bucket) => {
      if (!bucket.gateway) return
      try {
        const tasks = await listWorkTasks(bucket.gateway, null)
        const projectNames = new Map(
          bucket.projects.map((project) => [
            project.id,
            project.name || project.path || `项目 #${project.id}`,
          ])
        )
        tasks.forEach((task) => {
          collected.push({
            task,
            connectionKey: bucket.key,
            connectionName: bucket.name,
            folderName: projectNames.get(task.folder_id) || "",
          })
        })
      } catch (error) {
        failures.push(`${bucket.name}: ${toErrorMessage(error)}`)
      }
    })
  )
  entries.value = collected
  errorMessage.value = failures.join("；")
  loading.value = false
}

/**
 * 事件驱动的重新拉取，带 300ms 合并窗口：一次状态迁移会连着发好几条
 * （status_changed + diff_stat + agent_progress 各一次），逐条拉会打出一串重复请求。
 */
function scheduleRefresh() {
  if (refreshTimer) return
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    void loadTasks()
  }, 300)
}

function ensureTaskChangedSubscription(instanceKey: string) {
  if (!instanceKey || disposeTaskChanged.has(instanceKey)) return
  const unsubscribe = acpApi.subscribeGlobalEvent(
    WORK_TASK_CHANGED_CHANNEL,
    () => {
      scheduleRefresh()
    },
    instanceKey
  )
  disposeTaskChanged.set(instanceKey, unsubscribe)
}

function teardownSubscriptions() {
  disposeTaskChanged.forEach((dispose) => {
    try {
      dispose()
    } catch (error) {
      console.warn("dispose task subscription failed:", error)
    }
  })
  disposeTaskChanged.clear()
}

/* ===== 交互 ===== */

function handleTabChange(tab: TaskTabId) {
  filter.tab = tab
}

function resetFilter() {
  filter.connectionKey = ""
  filter.folderId = 0
  filter.showCanceled = DEFAULT_TASK_LIST_FILTER.showCanceled
  filter.showArchived = DEFAULT_TASK_LIST_FILTER.showArchived
}

function goToConnections() {
  uni.switchTab({ url: "/pages/connections/index" })
}

function findLiveTask(taskId: number): WorkTask | null {
  return entries.value.find((entry) => entry.task.id === taskId)?.task || null
}

function bucketFor(entry: TaskListEntry): ConnectionBucket | null {
  return connections.value.find((item) => item.key === entry.connectionKey) || null
}

/**
 * 打开详情页。
 *
 * 先把全局 auth 切到这条连接上：详情页自己也会按 `connectionId` 解析，但
 * 切过去能让详情页首屏就用对的网关，避免一次多余的失败请求。与会话列表的
 * `openConversation` 同一套路。
 */
function openTaskDetail(entry: TaskListEntry) {
  const bucket = bucketFor(entry)
  if (!bucket) return
  applyConnectionAuth(bucket.connection)
  const connectionId = String(bucket.connection.id || "").trim()
  if (!connectionId) {
    uni.showToast({ title: "缺少连接信息，请返回连接页重试", icon: "none" })
    return
  }
  uni.navigateTo({
    url: buildTaskDetailRoute({ connectionId, taskId: entry.task.id }),
  })
}

/**
 * 直接打开该任务的会话详情页。
 *
 * 这是「支持点击直接打开会话详情页」那条需求：任务跑起来之后有一个真实的 codeg 会话，
 * 它和会话列表里的会话是同一个东西，所以复用同一个详情页路由（`?id=&folderId=&connectionId=`），
 * 而不是另做一个只读回放。
 */
function openTaskConversation(entry: TaskListEntry) {
  const task = entry.task
  if (task.conversation_id == null) {
    uni.showToast({ title: "该任务还没有会话", icon: "none" })
    return
  }
  const bucket = bucketFor(entry)
  if (!bucket) return
  applyConnectionAuth(bucket.connection)
  const connectionId = String(bucket.connection.id || "").trim()
  const encodedConnectionId = connectionId ? encodeURIComponent(connectionId) : ""
  // worktree 文件夹优先：任务的会话跑在 worktree 里，用项目 folder_id 会让详情页
  // 定位到错误的目录上下文。
  const folderId = task.worktree_folder_id || task.folder_id || 0
  uni.navigateTo({
    url: `/pages/conversation-detail/index?id=${task.conversation_id}&folderId=${folderId}${
      encodedConnectionId ? `&connectionId=${encodedConnectionId}` : ""
    }`,
  })
}

function openCreateSheet() {
  if (!activeGateway.value) {
    uni.showToast({ title: "请先选择一条可用连接", icon: "none" })
    return
  }
  // 新建落在当前筛选那条连接上。
  editorConnectionKey.value = ""
  if (editorProjects.value.length === 0) {
    uni.showToast({ title: "该连接下还没有项目，请先在会话页添加", icon: "none" })
    return
  }
  editorTask.value = null
  showEditorSheet.value = true
}

function openSettingsSheet() {
  if (!activeGateway.value) {
    uni.showToast({ title: "请先选择一条可用连接", icon: "none" })
    return
  }
  // 选了项目就配那个项目，否则配全局（服务端约定 folderId 0 是全局行）。
  settingsFolderId.value = filter.folderId
  settingsFolderName.value =
    filterProjectOptions.value.find((item) => item.id === filter.folderId)?.name || ""
  // 项目路径来自 `loadRemoteProjects`（`filterProjectOptions` 只带名字），选项探测要它。
  settingsFolderPath.value =
    (activeBucket.value?.projects || []).find((item) => item.id === filter.folderId)?.path || ""
  showSettingsSheet.value = true
}

/**
 * 打开仓库面板（顶部的 GitHub 图标）。
 *
 * 作用域三级回退：上次看的那条连接（仍然在列表里）→ 当前筛选那条 → 第一条。
 * 存储优先于当前筛选，因为「上次看的仓库」比「任务列表当前筛到哪台机器」更可能
 * 是他现在想看的 —— 这两件事只是恰好共用一个连接列表。
 *
 * 跳转前 `applyConnectionAuth`，让新页首屏就用对网关（与 `openTaskDetail` 同一套路）。
 */
function openForgePanel() {
  const capable = connections.value.filter((item) => isForgeCapableConnection(item.connection))
  if (capable.length === 0) {
    uni.showToast({ title: "请先添加一条 codeg 连接", icon: "none" })
    return
  }
  const stored = readStoredForgeScope()
  const bucket =
    (stored.connectionId
      ? capable.find((item) => String(item.connection.id || "").trim() === stored.connectionId)
      : null) ||
    capable.find((item) => item.key === activeBucket.value?.key) ||
    capable[0]
  const connectionId = String(bucket.connection.id || "").trim()
  if (!connectionId) {
    uni.showToast({ title: "缺少连接信息，请返回连接页重试", icon: "none" })
    return
  }
  applyConnectionAuth(bucket.connection)
  uni.navigateTo({
    url: buildForgeRoute({
      connectionId,
      // folderId 交给面板自己定：任务页的项目筛选（可能为 0 = 全部）与「看哪个
      // 仓库」不是同一个问题，硬塞进去会让面板打开在一个用户没选过的仓库上。
      folderId: 0,
    }),
  })
}

async function submitEditor(draft: WorkTaskDraft) {
  const gateway = editorGateway.value
  if (!gateway) return
  const editing = editorTask.value
  try {
    if (editing) {
      await updateWorkTask(gateway, editing.id, draft)
    } else {
      await createWorkTask(gateway, draft)
    }
    showEditorSheet.value = false
    editorTask.value = null
    editorConnectionKey.value = ""
    uni.showToast({ title: editing ? "已保存" : "已创建", icon: "success" })
    await loadTasks()
  } catch (error) {
    uni.showToast({ title: toErrorMessage(error), icon: "none", duration: 3000 })
  }
}

/** 派发成功后统一重新拉取；失败提示统一走这里，避免每个动作各写一遍 try/catch。 */
async function runAction(
  entry: TaskListEntry,
  fn: (gateway: CodegGateway) => Promise<unknown>,
  actionId?: TaskActionId
) {
  const bucket = bucketFor(entry)
  if (!bucket?.gateway) {
    uni.showToast({ title: "连接不可用，请下拉刷新", icon: "none" })
    return
  }

  const pendingKey = actionId ? `${entry.task.id}:${actionId}` : ""
  if (pendingKey) {
    pendingActions.value.add(pendingKey)
  }

  try {
    await fn(bucket.gateway)
  } catch (error) {
    uni.showToast({ title: toErrorMessage(error), icon: "none", duration: 3000 })
  } finally {
    if (pendingKey) {
      pendingActions.value.delete(pendingKey)
    }
    await loadTasks()
  }
}

function refreshAfterAction() {
  void loadTasks()
}

function handleMerged(queued: boolean) {
  if (queued) {
    uni.showToast({
      title: "已加入合并队列",
      icon: "none",
      duration: 2500,
    })
  }
  void loadTasks()
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
  void loadTasks()
}

/**
 * 卡片动作的**唯一**落点。
 *
 * 每个动作先用 `isTaskActionAllowed` 对着**实时**那一行再校验一次：卡片可能已经过期
 * （引擎在用户点击的瞬间领走了这个任务），服务端的 CAS 也会拒绝，但那会以一条错误
 * toast 的形式砸到用户脸上 —— 而这次点击本身是合理的。
 *
 * 二次确认只加在**直接发命令**的动作上（开始、取消排队）：它们点下去就生效，而卡片
 * 上的按钮挨得很近，误触的代价是让 agent 白跑一趟或把一次已经排好的合并踢出队列。
 * 打开弹层的动作（合并、取消、重试、验收……）已经自带一次确认，再套一层是多余的；
 * 归档 / 取消归档也不问 —— 它们互为逆操作，撤销的成本就是再点一次。
 */
function handleCardAction(entry: TaskListEntry, id: TaskActionId) {
  const live = findLiveTask(entry.task.id) || entry.task
  const bucket = bucketFor(entry)
  if (!isTaskActionAllowed(live, id)) {
    uni.showToast({ title: "任务状态已变化，请下拉刷新", icon: "none" })
    void loadTasks()
    return
  }
  actionGateway.value = bucket?.gateway || null
  switch (id) {
    case "start":
      uni.showModal({
        title: "开始任务",
        content: `确定开始任务「${live.title}」吗？Agent 将在后台开始处理。`,
        confirmText: "开始",
        cancelText: "取消",
        success: (res) => {
          if (!res.confirm) return
          void runAction(entry, (gateway) => startWorkTask(gateway, live.id), "start")
        },
      })
      return
    case "schedule":
      scheduleTask.value = live
      showScheduleSheet.value = true
      return
    case "cancel":
    case "abandon":
      cancelTask.value = live
      showCancelSheet.value = true
      return
    case "retry":
      restartTask.value = live
      restartKind.value = "retry"
      showRestartSheet.value = true
      return
    case "requeue":
      restartTask.value = live
      restartKind.value = "requeue"
      showRestartSheet.value = true
      return
    case "merge":
    case "editQueuedMerge":
      mergeTask.value = live
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
          void runAction(entry, (gateway) => unqueueWorkTaskMerge(gateway, live.id), "unqueueMerge")
        },
      })
      return
    case "complete":
      acceptTask.value = live
      acceptMode.value = "complete"
      showAcceptSheet.value = true
      return
    case "deliverPr":
      acceptTask.value = live
      acceptMode.value = "deliver"
      showAcceptSheet.value = true
      return
    case "followUp":
      followUpTask.value = live
      showFollowUpSheet.value = true
      return
    case "archive":
      void runAction(entry, (gateway) => archiveWorkTask(gateway, live.id, true), "archive")
      return
    case "unarchive":
      void runAction(entry, (gateway) => archiveWorkTask(gateway, live.id, false), "unarchive")
      return
    case "edit":
      // 编辑必须落在**任务自己的**连接上，而不是当前筛选那条 —— 否则 draft 会发到
      // 错误的服务端，更新到一个同 id 的无关任务上。这里只记编辑器的作用域，
      // **不动 `filter.connectionKey`**：改一个标题不该让别的机器的任务从列表消失。
      editorConnectionKey.value = entry.connectionKey
      editorTask.value = live
      showEditorSheet.value = true
      return
    case "viewSession":
      openTaskConversation(entry)
      return
    default:
      return
  }
}
</script>

<style scoped lang="scss">
@import "./index.scss";

.page {
  min-height: 100vh;
  padding: 0 !important;
}

.tasks-page {
  background: var(--up-page-bg-color, var(--up-bg-color, #f3f4f6));
}

.tasks-shell {
  min-height: 100vh;
  padding: 0 24rpx 40rpx;
}

.tasks-sticky {
  position: relative;
  z-index: 20;
}

.tasks-sticky :deep(.u-sticky__content) {
  padding-top: 24rpx;
  background: var(--up-page-bg-color, var(--up-bg-color, #f3f4f6));
}

.tasks-body {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.tasks-list {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.tasks-empty-fullpage {
  padding: 80rpx 0;
}

.tasks-inline-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14rpx;
  padding: 80rpx 0;
}

.tasks-inline-loading__text {
  font-size: 24rpx;
  color: var(--up-content-color, #606266);
}

.tasks-error-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14rpx;
  padding: 48rpx 32rpx;
  border-radius: 24rpx;
  background: var(--up-card-bg-color, #ffffff);
  border: 1rpx solid var(--up-border-color, #dadbde);
  text-align: center;
}

.tasks-error-card__title {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.tasks-error-card__text {
  font-size: 24rpx;
  line-height: 1.5;
  color: var(--up-content-color, #606266);
  word-break: break-word;
}

.tasks-error-card__action {
  margin-top: 8rpx;
  padding: 14rpx 32rpx;
  border-radius: 999rpx;
  background: var(--up-primary, #2979ff);
  color: #ffffff;
  font-size: 24rpx;
  font-weight: 700;
}

.tasks-partial-error {
  padding: 16rpx 20rpx;
  border-radius: 18rpx;
  background: color-mix(in srgb, var(--up-error, #fa3534) 8%, var(--up-card-bg-color, #ffffff) 92%);
}

.tasks-partial-error__text {
  font-size: 22rpx;
  line-height: 1.5;
  color: var(--up-error, #fa3534);
  word-break: break-word;
}

.tasks-safe-bottom {
  height: calc(36rpx + env(safe-area-inset-bottom));
}
</style>
