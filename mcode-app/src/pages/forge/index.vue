<template>
  <view class="page forge-page" :style="[upThemeVars, upThemePageStyle]">
    <view class="forge-shell">
      <ForgeListHeader
        :connectionName="connectionName"
        :projectName="projectName"
        :remote="remote"
        :tab="filter.tab"
        :counts="counts"
        :countsScope="countsScope"
        :keyword="filter.keyword"
        :filterActive="filterActive"
        :summary="summary"
        :loading="loading"
        @update:tab="handleTabChange"
        @update:keyword="handleKeywordChange"
        @openScope="openScopeSheet"
        @openRepo="openRepoInBrowser"
        @openFilter="showFilterSheet = true"
        @openNewIssue="openNewIssueSheet"
        @openSettings="openSettingsSheet"
        @refresh="reloadList"
      />

      <!-- 连接本身不支持：forge_* 是 codeg 独占的命令族，别的目标会 404。 -->
      <ProjectUnsupportedState
        v-if="unsupportedText"
        title="仓库面板不可用"
        :text="unsupportedText"
        icon="info-circle"
        actionText="返回"
        @action="goBack"
      />

      <ProjectUnsupportedState
        v-else-if="scopeError"
        title="无法读取项目"
        :text="scopeError"
        icon="info-circle"
        actionText="重试"
        @action="reloadScope"
      />

      <view v-else-if="scopeLoading" class="forge-inline-loading">
        <up-loading-icon
          mode="circle"
          size="28"
          :color="upThemeVar('--up-primary', '#2979ff')"
        ></up-loading-icon>
        <text class="forge-inline-loading__text">正在读取项目...</text>
      </view>

      <!-- 前置状态一：这个项目不是 forge 仓库（没有 origin，或地址不是仓库路径）。 -->
      <ProjectUnsupportedState
        v-else-if="!remote"
        title="这个项目不是 forge 仓库"
        text="没有找到 origin 远端，或者它的地址不是可识别的 GitHub / GitLab 仓库。"
        icon="info-circle"
        actionText="切换项目"
        @action="openScopeSheet"
      />

      <!-- 前置状态二：宿主不支持。不发任何 forge 请求，直接说清楚。 -->
      <ProjectUnsupportedState
        v-else-if="!remote.supported"
        title="暂不支持这个代码托管平台"
        :text="`仓库面板目前只支持 GitHub 与 GitLab，而 ${remote.server_host} 看起来不是其中任何一种。如果它是自建的 GitHub Enterprise 或 GitLab 实例，在桌面端为这个域名添加一个账号即可识别。`"
        icon="info-circle"
        actionText="切换项目"
        @action="openScopeSheet"
      />

      <template v-else>
        <view v-if="loading && rows.length === 0" class="forge-inline-loading">
          <up-loading-icon
            mode="circle"
            size="28"
            :color="upThemeVar('--up-primary', '#2979ff')"
          ></up-loading-icon>
          <text class="forge-inline-loading__text">加载中...</text>
        </view>

        <!-- 首屏失败：整页状态卡。`noAccount` / `unsupportedHost` 带「添加账号」，
             其余给「重试」—— 判据是 `i18n_key` 而不是 message 子串（见 forgeErrors.ts）。 -->
        <ProjectUnsupportedState
          v-else-if="listError && rows.length === 0"
          :title="listErrorTitle"
          :text="listErrorText"
          icon="info-circle"
          :actionText="listErrorAction || '重试'"
          @action="handleListErrorAction"
        />

        <view v-else-if="rows.length === 0" class="forge-empty">
          <up-empty mode="list" :text="emptyText"></up-empty>
        </view>

        <template v-else>
          <view class="forge-list">
            <ForgeIssueRow
              v-for="row in rows"
              :key="rowKey(row)"
              :row="row"
              :now="now"
              :taskLink="taskLinkFor(row)"
              @open="openItem(row)"
              @start="openStartSheet(row)"
              @openTask="openTaskDetail"
            />
          </view>

          <!-- 列表末尾那一行。`capped` 是「forge 还说有下一页但我们不敢翻」——
               与「到底了」是两件事，必须分开说。 -->
          <view class="forge-list-footer">
            <up-loading-icon
              v-if="footerKind === 'loading'"
              mode="circle"
              size="22"
              :color="upThemeVar('--up-primary', '#2979ff')"
            ></up-loading-icon>
            <text
              class="forge-list-footer__text"
              :class="{ 'forge-list-footer__text--warning': footerKind === 'capped' }"
            >{{ footerText }}</text>
          </view>
        </template>

        <!-- 已有数据时失败不遮挡已加载的行，只在列表末尾说明。带恢复动作时给一个
             文字按钮，而不是把整页换成状态卡。 -->
        <view v-if="listError && rows.length > 0" class="forge-notice forge-notice--error">
          <text class="forge-notice__text">{{ listErrorText }}</text>
          <text
            v-if="listErrorAction"
            class="forge-notice__action"
            @click="handleListErrorAction"
          >{{ listErrorAction }}</text>
        </view>
      </template>

      <view class="forge-safe-bottom"></view>
    </view>

    <ForgeScopeSheet
      v-model:show="showScopeSheet"
      :connections="connectionOptions"
      :projects="projectOptions"
      :connectionKey="scope.connectionKey"
      :folderId="scope.folderId"
      :projectsLoading="projectsLoading"
      @selectConnection="handleSelectConnection"
      @selectProject="handleSelectProject"
    />

    <ForgeFilterSheet
      v-model:show="showFilterSheet"
      :state="filter.state"
      :assignedMe="filter.assignedMe"
      :labels="filter.labels"
      :sort="filter.sort"
      :perPage="filter.perPage"
      :labelOptions="labelOptions"
      :labelsTruncated="labelsTruncated"
      :labelsLoading="labelsLoading"
      @update:state="applyFilter('state', $event)"
      @update:assignedMe="applyFilter('assignedMe', $event)"
      @update:labels="applyFilter('labels', $event)"
      @update:sort="applyFilter('sort', $event)"
      @update:perPage="handlePerPageChange"
      @reset="handleResetFilter"
    />

    <ForgeNewIssueSheet
      v-model:show="showNewIssueSheet"
      :labelOptions="labelOptions"
      :submitting="creatingIssue"
      :errorText="createIssueError"
      @submit="submitNewIssue"
    />

    <ForgeStartSheet
      v-model:show="showStartSheet"
      :row="startRow"
      :kind="startKind"
      :settings="panelSettings"
      :submitting="startSubmitting"
      :result="startResult"
      :errorText="startError"
      @submit="submitStart"
      @openExistingTask="openTaskDetail"
    />

    <ForgeSettingsSheet
      v-model:show="showSettingsSheet"
      :store="settingsStore"
      :folderId="scope.folderId"
      :folderName="projectName"
      :saving="savingSettings"
      :errorText="settingsError"
      @save="submitSettings"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, reactive, ref } from "vue"
import { onLoad, onPullDownRefresh, onReachBottom, onShow, onUnload } from "@dcloudio/uni-app"
import ForgeListHeader from "./components/ForgeListHeader.vue"
import ForgeIssueRow from "./components/ForgeIssueRow.vue"
import ForgeScopeSheet from "./components/ForgeScopeSheet.vue"
import ForgeFilterSheet from "./components/ForgeFilterSheet.vue"
import ForgeNewIssueSheet from "./components/ForgeNewIssueSheet.vue"
import ForgeStartSheet from "./components/ForgeStartSheet.vue"
import ForgeSettingsSheet from "./components/ForgeSettingsSheet.vue"
import ProjectUnsupportedState from "@/pages/project-detail/components/ProjectUnsupportedState.vue"
import {
  applyConnectionAuth,
  listConnectedConnections,
  openConnectionGateway,
} from "@/services/connection/connectionAccess"
import {
  buildConnectionKey,
  decodeConnectionContext,
  findStoredConnectionById,
  type ConnectionContext,
} from "@/services/connectionContext"
import { openGuardedExternalUrl } from "@/services/externalLinkGuard"
import { toErrorMessage } from "@/services/gateway/error"
import { loadRemoteProjects, type RemoteProjectRecord } from "@/services/projectSessions"
import {
  fetchForgeRemote,
  fetchForgeTabCount,
  createForgeIssue,
  listForgeIssues,
  listForgeLabels,
} from "@/services/forge/forgeApi"
import {
  buildForgeAccountsRoute,
  buildForgeItemRoute,
  forgeUnsupportedText,
  isForgeCapableConnection,
  parseForgeRouteOptions,
} from "@/services/forge/forgeRoute"
import {
  classifyForgeError,
  forgeErrorAction,
  forgeErrorText,
  forgeErrorTitle,
  forgeErrorWantsAccount,
  forgeErrorWantsRetry,
  type ForgeErrorInfo,
} from "@/services/forge/forgeErrors"
import {
  readStoredForgeScope,
  writeStoredForgeScope,
} from "@/services/forge/forgeScopePreference"
import {
  buildForgeCountFilters,
  buildForgeListQuery,
  DEFAULT_FORGE_FILTER,
  isForgeFilterActive,
  resetForgeFilter,
  resolveForgeEmptyText,
  type ForgeFilterState,
} from "./forgeFilterState"
import {
  appendForgeRows,
  forgeCountsScope,
  forgeListScope,
  forgeRowKey,
  matchesForgeLabelFilter,
  prependForgeRow,
  replaceForgeRow,
  shouldPrependNewIssue,
} from "./forgeListScope"
import {
  canLoadMoreForgeRows,
  EMPTY_FORGE_PAGING,
  forgeListFooterKind,
  forgeListFooterText,
  forgeResultSummary,
  pagingFromList,
} from "./forgeListPaging"
import {
  emptyForgeTabCounts,
  hiddenForgeTab,
  shouldProbeForgeTabCount,
  tabCountFromList,
  tabCountFromProbe,
} from "./forgeTabBadge"
import {
  clearForgeInbox,
  drainForgeRowUpdates,
  putForgeSeed,
} from "@/services/forge/forgeRowInbox"
import {
  createWorkTaskFromForge,
  forgeTaskLinkMap,
  lookupForgeTasks,
} from "@/services/forge/forgeTaskApi"
import { buildForgeSourceKey, forgeItemKindOf } from "./forgeSourceKey"
import {
  effectiveForgeSettings,
  fetchForgeSettings,
  saveForgeSettings,
} from "@/services/forge/forgeSettingsApi"
import { acpApi } from "@/api/acp"
import { WORK_TASK_CHANGED_CHANNEL } from "@/services/workTask"
import { buildTaskDetailRoute } from "@/services/taskDetail"
import type { CodegGateway } from "@/services/gateway"
import type {
  ForgeCreateResult,
  ForgeIssueRow as ForgeIssueRowType,
  ForgeItemKind,
  ForgeLabel,
  ForgePanelSettings,
  ForgeRemote,
  ForgeScenarioId,
  ForgeSettingsStore,
  ForgeTab,
  ForgeTaskLink,
} from "@/types/forge"

/**
 * 仓库面板列表页（从任务页顶部的 GitHub 图标进入）。
 *
 * 它对接 codeg-plus 的 **forge** 功能：GitHub / GitLab 的 Issue 与 PR triage
 * 工作台。作用域是**单连接 + 单项目**（不像任务页那样多连接摊平）—— forge 的
 * 列表天然是「一个文件夹 = 一个仓库」，而且 GitHub 的 search API 只有 30 次/分钟，
 * 摊平会立刻打爆配额。
 *
 * 数据流：
 * 1. `list_open_folder_details` 拿项目列表（只为选作用域用）；
 * 2. `folder_forge_remote` 探测这个项目的 origin 远端 —— **一个项目只探一次**，
 *    服务端要 fork 一个 git 子进程；
 * 3. 探测结果决定三种前置状态，只有通过才发 `forge_list_issues`；
 * 4. 标签词汇表切仓库时拉一次并缓存（仓库级事实，不随筛选变）。
 *
 * ## 配额纪律（这一页最重要的约束，不是可选优化）
 *
 * GitHub 的列表走 `/search/issues`，**30 次/分钟**。所以：
 * - 搜索必须 **500ms 防抖**；
 * - **切 tab 不发任何请求** —— 可见 tab 的计数搭在它自己的列表响应里，不可见 tab
 *   的计数按 `countsScope`（不含 tab）缓存，来回切 tab 作用域不变；
 * - 标签只在切仓库时拉一次；
 * - 分页撞到 `reachable_count` 天花板就停（越过是 422）。
 *
 * ## 为什么 `onShow` **不**无条件重拉（与任务页刻意不同）
 *
 * GitHub 的列表来自 search 索引，它落后一次写入几秒到几分钟。从详情页返回时重拉，
 * 极大概率拿回「刚刚被改掉的那个状态」并把它盖上去 —— 用户看着关闭成功的 issue
 * 又变回 open。所以只在**上一次请求失败**时才在 onShow 重拉（那正是从账号页修完
 * 回来的场景）。
 */

const currentInstance = getCurrentInstance()
const upThemeVars = computed(() => currentInstance?.proxy?.upThemeVars || {})
const upThemePageStyle = computed(() => currentInstance?.proxy?.upThemePageStyle || {})
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

/** 搜索防抖窗口。GitHub search 是 30 次/分钟，逐字符发请求两句话就打爆。 */
const SEARCH_DEBOUNCE_MS = 500

const stored = readStoredForgeScope()
const scope = reactive({
  connectionKey: "",
  connectionId: "",
  folderId: stored.folderId,
})
const filter = reactive<ForgeFilterState>({
  ...DEFAULT_FORGE_FILTER,
  tab: stored.tab,
  perPage: stored.perPage,
})

const connections = ref<ConnectionContext[]>([])
const connection = ref<ConnectionContext | null>(null)
const gateway = ref<CodegGateway | null>(null)
const projects = ref<RemoteProjectRecord[]>([])
const remote = ref<ForgeRemote | null>(null)
const rows = ref<ForgeIssueRowType[]>([])
const paging = ref({ ...EMPTY_FORGE_PAGING })
const counts = ref(emptyForgeTabCounts())
const labelOptions = ref<ForgeLabel[]>([])
const labelsTruncated = ref(false)
/** `source_key` → 那条反查行。芯片按行的候选 key 查这张表。 */
const taskLinks = ref(new Map<string, ForgeTaskLink>())
/** 全部作用域的面板设置。设置弹层要用它区分「有自己的设置」与「跟随全局」。 */
const settingsStore = ref<ForgeSettingsStore | null>(null)

const scopeLoading = ref(false)
const projectsLoading = ref(false)
const labelsLoading = ref(false)
const loading = ref(false)
const loadingMore = ref(false)
/** 作用域本身读不出来（连不上、项目列表失败）—— 与列表失败分开，两者的恢复动作不同。 */
const scopeError = ref("")
const listError = ref("")
/** 列表失败的**结构化**分类（来自 `i18n_key`），决定状态卡的文案与那颗按钮去哪。 */
const listErrorInfo = ref<ForgeErrorInfo | null>(null)
/**
 * 已经为哪些文件夹静默纠正过一次 `wrongForge`。
 *
 * 后端返回那个 key 时**已经把这个 host 的 forge 归类改正了**，所以正确的恢复是
 * 重试一次而不是把错误摊给用户（那是把自家的记账问题当成用户的问题）。只重试一次
 * —— 后端不会对同一个 host 报两次，第二次一定是别的问题。
 */
const correctedFolders = new Set<number>()
const showScopeSheet = ref(false)
const showFilterSheet = ref(false)
const showNewIssueSheet = ref(false)
const creatingIssue = ref(false)
const createIssueError = ref("")

const showStartSheet = ref(false)
const startRow = ref<ForgeIssueRowType | null>(null)
const startSubmitting = ref(false)
const startResult = ref<ForgeCreateResult | null>(null)
const startError = ref("")

const showSettingsSheet = ref(false)
const savingSettings = ref(false)
const settingsError = ref("")

const now = ref(Date.now())

/**
 * 三条独立的单调代际。
 *
 * **不能共用一个** —— 列表、计数探测与（M6 的）任务反查由不同触发源驱动，共用会
 * 让它们互相取消：一次筛选变化触发的列表请求会作废一次刚发出的计数探测，于是徽章
 * 永远停在旧值上。
 */
let listSeq = 0
let countSeq = 0
/**
 * 任务反查的**独立**代际。
 *
 * 不能和列表共用：两条线由不同触发源驱动（列表由筛选变化，反查由 `task://changed`
 * 事件），共用会互相取消。而反查的答复是**整体替换** map，慢的那个赢会让已存在的
 * link 消失 —— 于是行上的芯片变回「处理」按钮，一个正在跑的任务被重复触发。
 */
let linkSeq = 0
let searchTimer: ReturnType<typeof setTimeout> | null = null
let nowTimer: ReturnType<typeof setInterval> | null = null
/** `task://changed` 的订阅句柄，按 instanceKey 去重。 */
const disposeTaskChanged = new Map<string, () => void>()
let linkRefreshTimer: ReturnType<typeof setTimeout> | null = null

/* ===== 派生 ===== */

const unsupportedText = computed(() => {
  if (!connection.value) return ""
  return forgeUnsupportedText(connection.value)
})

const connectionName = computed(() => connection.value?.name || "")
const projectName = computed(() => {
  const project = projects.value.find((item) => item.id === scope.folderId)
  if (project) return project.name || project.path || `项目 #${project.id}`
  return scope.folderId > 0 ? `项目 #${scope.folderId}` : ""
})

const connectionOptions = computed(() =>
  connections.value
    .map((item) => ({ key: buildConnectionKey(item), name: item.name }))
    .filter((item) => Boolean(item.key))
)
const projectOptions = computed(() =>
  projects.value.map((project) => ({
    id: project.id,
    name: project.name || project.path || `项目 #${project.id}`,
    path: project.path,
  }))
)

const listScope = computed(() => forgeListScope(scope.connectionKey, scope.folderId, filter))
const countsScope = computed(() => forgeCountsScope(scope.connectionKey, scope.folderId, filter))
const filterActive = computed(() => isForgeFilterActive(filter))
const emptyText = computed(() => resolveForgeEmptyText(filter))
const summary = computed(() => forgeResultSummary(paging.value, rows.value.length))
const footerKind = computed(() => forgeListFooterKind(paging.value, loadingMore.value))
const footerText = computed(() => forgeListFooterText(footerKind.value))

const startKind = computed<ForgeItemKind>(() =>
  startRow.value ? forgeItemKindOf(startRow.value) : "issue"
)

/**
 * 对当前项目**生效**的设置：它自己那份整份替换，否则全局行。
 *
 * 「处理」弹层用它决定预选哪个场景与回写开关的初始状态 —— 绝不逐字段混合
 * （见 `forgeSettingsApi` 的文件头）。
 */
const panelSettings = computed(() =>
  effectiveForgeSettings(settingsStore.value, scope.folderId)
)

const listErrorTitle = computed(() =>
  listErrorInfo.value ? forgeErrorTitle(listErrorInfo.value) : "加载失败"
)
const listErrorText = computed(() =>
  listErrorInfo.value ? forgeErrorText(listErrorInfo.value) : listError.value
)
const listErrorAction = computed(() =>
  listErrorInfo.value ? forgeErrorAction(listErrorInfo.value.kind) : null
)

/* ===== 生命周期 ===== */

onLoad((options) => {
  const route = parseForgeRouteOptions(options)
  scope.connectionId = route.connectionId
  if (route.folderId > 0) scope.folderId = route.folderId
  const resolved =
    findStoredConnectionById(route.connectionId) || decodeConnectionContext(route.connection)
  connection.value = resolved
  scope.connectionKey = resolved ? buildConnectionKey(resolved) : ""
  void reloadScope()
  nowTimer = setInterval(() => {
    now.value = Date.now()
  }, 60_000)
})

onShow(() => {
  now.value = Date.now()
  // 先排空写回信箱：详情页里关掉的那一行要在这里生效。
  applyPendingWrites()
  // 芯片可能在别处变过（在任务页取消了任务、订阅因断线错过事件）。这一条走本地
  // 数据库，不花 forge 配额，所以无条件刷是安全的 —— 与列表重拉不同。
  void refreshTaskLinks()
  // 只在失败态重拉列表 —— 成功态重拉会把用户刚看着成功的写操作抹掉（见文件头）。
  if (!scopeError.value && !listError.value) return
  if (scopeError.value) {
    void reloadScope()
    return
  }
  void reloadList()
})

onPullDownRefresh(() => {
  // 下拉是用户**明确**要求最新数据，此时覆盖本地状态是他要的。
  void reloadList().finally(() => {
    uni.stopPullDownRefresh()
  })
})

onReachBottom(() => {
  void loadMore()
})

onUnload(() => {
  if (searchTimer) {
    clearTimeout(searchTimer)
    searchTimer = null
  }
  if (nowTimer) {
    clearInterval(nowTimer)
    nowTimer = null
  }
  if (linkRefreshTimer) {
    clearTimeout(linkRefreshTimer)
    linkRefreshTimer = null
  }
  teardownTaskSubscriptions()
})

/* ===== 作用域 ===== */

/** 重新解析连接 → 项目 → 远端探测 → 标签 + 列表。切连接与首屏都走这条。 */
async function reloadScope() {
  connections.value = listConnectedConnections().filter(isForgeCapableConnection)
  if (!connection.value) {
    connection.value = pickInitialConnection()
    scope.connectionKey = connection.value ? buildConnectionKey(connection.value) : ""
  }
  const target = connection.value
  if (!target) {
    scopeError.value = "没有可用的 codeg 连接，请先在连接页添加。"
    return
  }
  if (!isForgeCapableConnection(target)) return

  scopeLoading.value = true
  scopeError.value = ""
  clearListError()
  try {
    const resolvedGateway = await openConnectionGateway(target)
    gateway.value = resolvedGateway
    // openConnectionGateway 会就地改写 connection（补 id / baseUrl），
    // 所以连接键要在这之后重算，否则存下来的是旧键。
    scope.connectionKey = buildConnectionKey(target)
    scope.connectionId = String(target.id || "").trim()
    // 任务推进的广播。**只用来刷芯片**，不重拉列表（见 refreshTaskLinks 的注释）。
    ensureTaskChangedSubscription(resolvedGateway)
    // 面板设置是**连接级**的（一个 blob 装着全局行加每个文件夹的覆盖），所以在这里读
    // 一次而不是每次切项目都读。
    void loadSettings(resolvedGateway)

    projectsLoading.value = true
    try {
      projects.value = await loadRemoteProjects(resolvedGateway)
    } finally {
      projectsLoading.value = false
    }

    if (projects.value.length === 0) {
      resetRepositoryState()
      scopeError.value = "这条连接下还没有项目，请先在桌面端打开一个 Git 仓库文件夹。"
      return
    }

    // 定 folderId：路由/存储给的那个仍然存在就用它，否则退到第一个项目。
    if (!projects.value.some((item) => item.id === scope.folderId)) {
      scope.folderId = projects.value[0].id
    }
    persistScope()
    await probeRemote()
  } catch (error) {
    scopeError.value = toErrorMessage(error)
  } finally {
    scopeLoading.value = false
  }
}

/**
 * 初始连接三级回退：存储的那条（仍在列表里）→ 路由带来的 → 第一条。
 *
 * 存储优先于第一条，因为用户上次看的那个仓库比「列表里恰好排第一的机器」更可能
 * 是他现在要看的。
 */
function pickInitialConnection(): ConnectionContext | null {
  if (stored.connectionId) {
    const match = connections.value.find(
      (item) => String(item.id || "").trim() === stored.connectionId
    )
    if (match) return match
  }
  return connections.value[0] || null
}

/**
 * 探测当前项目的 forge 远端，然后拉标签与第一页。
 *
 * 服务端要 fork 一个 `git remote get-url origin`，所以只在**切项目**时调用 ——
 * 不要放进下拉刷新或事件回调里。
 */
async function probeRemote() {
  const activeGateway = gateway.value
  if (!activeGateway || scope.folderId <= 0) return
  remote.value = await fetchForgeRemote(activeGateway, scope.folderId)
  if (!remote.value || !remote.value.supported) {
    // 不发列表请求：前一种没有仓库坐标，后一种发过去只会得到一个原始 API 报错。
    resetRepositoryState()
    return
  }
  // 标签与列表并发：标签失败不该拖垮列表（筛选面板少一组选项，比整页空白好）。
  void loadLabels()
  await reloadList()
}

/** 换仓库时要清的全套状态。漏一个就有一类 bug（见各行注释）。 */
function resetRepositoryState() {
  rows.value = []
  paging.value = { ...EMPTY_FORGE_PAGING }
  // 两个 tab 的计数都要清：countsScope 含 folderId，旧数字已经不描述任何东西。
  counts.value = emptyForgeTabCounts()
  // 标签是**每个仓库自己的词汇表** —— 留着旧的会让筛选面板列出新仓库不存在的标签。
  labelOptions.value = []
  labelsTruncated.value = false
  // 已选的标签同理：旧选择在新仓库里会筛出一个空列表，而用户无从知道为什么。
  filter.labels = []
  // 任务反查也要清：source key 含 owner_repo，旧的 link 全都不匹配新仓库的行。
  taskLinks.value = new Map()
  clearListError()
  // 开着的弹层也要关：新建 issue 的弹层开着时切项目会把 issue 开到另一个仓库去。
  showFilterSheet.value = false
  showNewIssueSheet.value = false
  createIssueError.value = ""
  showStartSheet.value = false
  startRow.value = null
  startResult.value = null
  startError.value = ""
  // 设置弹层同理：它编辑的是「当前项目」那个作用域，切项目后再保存会写到错的项目上。
  showSettingsSheet.value = false
  settingsError.value = ""
  // 信箱也要丢：那些写回已经过时（中间可能有别人改过），留着会盖掉一次刚成功的刷新。
  if (scope.connectionKey && scope.folderId > 0) {
    clearForgeInbox(scope.connectionKey, scope.folderId)
  }
}

function persistScope() {
  writeStoredForgeScope({
    connectionId: scope.connectionId,
    folderId: scope.folderId,
    tab: filter.tab,
    perPage: filter.perPage,
  })
}

/* ===== 列表 ===== */

/** 拉第一页，并按需补上不可见 tab 的计数。 */
async function reloadList() {
  const activeGateway = gateway.value
  if (!activeGateway || !remote.value?.supported || scope.folderId <= 0) return
  const seq = ++listSeq
  const scopeKey = countsScope.value
  loading.value = true
  loadingMore.value = false
  clearListError()
  try {
    const list = await listForgeIssues(
      activeGateway,
      scope.folderId,
      buildForgeListQuery(filter, 1)
    )
    if (seq !== listSeq) return
    rows.value = list.rows
    paging.value = pagingFromList(list)
    // 可见 tab 的计数**搭在这个响应里**，不额外花一次请求。
    counts.value = {
      ...counts.value,
      [filter.tab]: tabCountFromList(list, scopeKey),
    }
  } catch (error) {
    if (seq !== listSeq) return
    if (await handleWrongForge(error)) return
    setListError(error)
  } finally {
    if (seq === listSeq) loading.value = false
  }
  void ensureHiddenTabCount()
  // 新的一批行要新的一批芯片。走本地数据库，不花 forge 配额。
  void refreshTaskLinks()
}

/**
 * 追加下一页。
 *
 * 三个前置条件都在 `canLoadMoreForgeRows` 里：forge 说还有、没撞天花板、没有请求
 * 在飞。天花板那一条不能省 —— GitHub 在越过 1000 条时 `has_next` 仍是 true，
 * 照着翻下去就是一次 422。
 */
async function loadMore() {
  const activeGateway = gateway.value
  if (!activeGateway || !remote.value?.supported) return
  if (!canLoadMoreForgeRows(paging.value, loading.value || loadingMore.value)) return

  const seq = ++listSeq
  const nextPage = paging.value.page + 1
  loadingMore.value = true
  try {
    const list = await listForgeIssues(
      activeGateway,
      scope.folderId,
      buildForgeListQuery(filter, nextPage)
    )
    if (seq !== listSeq) return
    // 按身份去重追加：forge 可能在两次请求之间插入新行，把上一页的末条挤下来。
    rows.value = appendForgeRows(rows.value, list.rows)
    paging.value = pagingFromList(list)
  } catch (error) {
    if (seq !== listSeq) return
    setListError(error)
  } finally {
    if (seq === listSeq) loadingMore.value = false
  }
  void refreshTaskLinks()
}

/* ===== 任务芯片 ===== */

/** 一行对应的反查行。找不到 = 还没有人处理过它。 */
function taskLinkFor(row: ForgeIssueRowType): ForgeTaskLink | null {
  const key = sourceKeyFor(row)
  return key ? taskLinks.value.get(key) || null : null
}

/**
 * 一行的 source key。
 *
 * **provider 只用 `folder_forge_remote` 返回的那个** —— 客户端从不自己猜（那等于替
 * 用户选一份凭据），而从 host 看到 `github.com` 就填 `github` 在自建实例上必错。
 */
function sourceKeyFor(row: ForgeIssueRowType): string {
  const current = remote.value
  if (!current) return ""
  return buildForgeSourceKey({
    provider: current.provider,
    serverHost: current.server_host,
    ownerRepo: current.owner_repo,
    kind: forgeItemKindOf(row),
    number: row.number,
  })
}

/**
 * 重新反查可见行的任务。
 *
 * 走**本地数据库**（`work_task_lookup_by_source`），不花 forge 配额 —— 这就是为什么
 * `task://changed` 的回调可以只做这一件事。
 *
 * 失败静默：芯片没了比一条用户点不动的错误好，而列表本身是好的。
 */
async function refreshTaskLinks() {
  const activeGateway = gateway.value
  if (!activeGateway || !remote.value) return
  const keys = rows.value.map(sourceKeyFor).filter(Boolean)
  if (keys.length === 0) {
    taskLinks.value = new Map()
    return
  }
  const seq = ++linkSeq
  try {
    const links = await lookupForgeTasks(activeGateway, keys)
    // 慢的那个赢会让已存在的 link 消失（答复是整体替换 map）—— 于是芯片变回「处理」
    // 按钮，一个正在跑的任务被重复触发。
    if (seq !== linkSeq) return
    taskLinks.value = forgeTaskLinkMap(links)
  } catch (error) {
    console.warn("forge task lookup failed:", error)
  }
}

/**
 * 订阅任务变更广播。
 *
 * **回调只刷芯片，绝不重拉列表。** 两个理由：
 * 1. 重拉会把详情页刚写回的状态盖回旧值（GitHub 的列表来自 search 索引，落后写入
 *    几秒到几分钟）—— 而这里会让那个问题**自动发生**（任务每推进一步就抹一次）；
 * 2. 一个任务从 running 到 done 会发好几条事件，每条都重拉就是把 30 次/分钟的 GitHub
 *    search 配额烧在一个用户没有要求的刷新上。
 */
function ensureTaskChangedSubscription(activeGateway: CodegGateway) {
  const instanceKey = activeGateway.getRemoteInstanceDescriptor().instanceKey
  if (!instanceKey || disposeTaskChanged.has(instanceKey)) return
  const unsubscribe = acpApi.subscribeGlobalEvent(
    WORK_TASK_CHANGED_CHANNEL,
    () => {
      scheduleTaskLinkRefresh()
    },
    instanceKey
  )
  disposeTaskChanged.set(instanceKey, unsubscribe)
}

/**
 * 300ms 合并窗口。
 *
 * 一次状态迁移会连着发好几条事件（status_changed + diff_stat + agent_progress），
 * 逐条反查会打出一串重复请求 —— 与任务页的 `scheduleRefresh` 同一个理由与同一个窗口。
 */
function scheduleTaskLinkRefresh() {
  if (linkRefreshTimer) return
  linkRefreshTimer = setTimeout(() => {
    linkRefreshTimer = null
    void refreshTaskLinks()
  }, 300)
}

function teardownTaskSubscriptions() {
  disposeTaskChanged.forEach((dispose) => {
    try {
      dispose()
    } catch (error) {
      console.warn("dispose forge task subscription failed:", error)
    }
  })
  disposeTaskChanged.clear()
}

/* ===== 写回 ===== */

/**
 * 排空信箱并把详情页交回的**权威行**原地替换进列表。
 *
 * 这是「从详情页返回时不重拉列表」的另一半 —— GitHub 的列表来自 search 索引，落后
 * 写入几秒到几分钟，重拉会把刚改完的状态盖回旧值。所以详情页交出它从写操作响应里
 * 拿到的那一行，这里只做替换。
 *
 * 找不到对应行时**不追加**（`replaceForgeRow` 的语义）：一个已经被关掉的 issue 不该
 * 继续挂在「进行中」的列表里。
 */
function applyPendingWrites() {
  if (!scope.connectionKey || scope.folderId <= 0) return
  const updates = drainForgeRowUpdates(scope.connectionKey, scope.folderId)
  if (updates.length === 0) return
  let next = rows.value
  updates.forEach((updated) => {
    next = replaceForgeRow(next, updated)
  })
  rows.value = next
}

/* ===== 新建 issue ===== */

function openNewIssueSheet() {
  if (!remote.value?.supported) {
    uni.showToast({ title: "当前项目不可用", icon: "none" })
    return
  }
  createIssueError.value = ""
  showNewIssueSheet.value = true
}

/**
 * 创建 issue，然后决定它该不该出现在当前列表里。
 *
 * 只有在「tab 是 issues」「排序把最新的放在前面」「筛选不会把它排除」时才乐观插入
 * （`shouldPrependNewIssue` + `matchesForgeLabelFilter`）。否则不插 —— 用户按 `oldest`
 * 排序时把新 issue 放在第一行，一刷新就消失了，那比不插更糟。
 *
 * **不重拉列表**：GitHub 的 search 索引落后写入数秒，刚创建的 issue 大概率不在结果里，
 * 于是「创建成功」之后列表看起来什么都没发生。
 */
async function submitNewIssue(payload: { title: string; body: string | null; labels: string[] }) {
  const activeGateway = gateway.value
  if (!activeGateway) return
  creatingIssue.value = true
  createIssueError.value = ""
  try {
    const created = await createForgeIssue(activeGateway, scope.folderId, {
      title: payload.title,
      body: payload.body,
      labels: payload.labels,
      accountId: null,
    })
    if (!created) {
      createIssueError.value = "服务端没有返回创建结果，请到浏览器确认是否已创建。"
      return
    }
    if (shouldPrependNewIssue(filter) && matchesForgeLabelFilter(created, filter)) {
      rows.value = prependForgeRow(rows.value, created)
    }
    showNewIssueSheet.value = false
    uni.showToast({ title: "已创建", icon: "success" })
    // 直接进详情：刚开的 issue 通常还要补一句描述或者立刻处理成任务。
    openItem(created)
  } catch (error) {
    createIssueError.value = classifyForgeError(error).message
  } finally {
    creatingIssue.value = false
  }
}

/* ===== 处理成任务 ===== */

function openStartSheet(row: ForgeIssueRowType) {
  if (!remote.value?.supported) {
    uni.showToast({ title: "当前项目不可用", icon: "none" })
    return
  }
  startRow.value = row
  // 上一次的答案属于上一个工作项 —— 留着会让弹层一打开就显示「已有进行中的任务」。
  startResult.value = null
  startError.value = ""
  showStartSheet.value = true
}

/**
 * 创建任务。
 *
 * 客户端只送**坐标 + 展示快照 + 场景名**；URL、api_base、账号身份、source key、
 * 提示词全部由服务端派生（见 `commands/forge.rs` 的信任边界）。
 *
 * 三种 outcome 都是**答案**：`created` 关掉弹层并刷芯片，另两种留在弹层里让用户决定。
 */
async function submitStart(payload: {
  scenario: ForgeScenarioId
  instruction: string | null
  writeback: boolean
  force: boolean
}) {
  const activeGateway = gateway.value
  const current = remote.value
  const row = startRow.value
  if (!activeGateway || !current || !row) return
  startSubmitting.value = true
  startError.value = ""
  try {
    const result = await createWorkTaskFromForge(activeGateway, {
      folder_id: scope.folderId,
      source: {
        kind: forgeItemKindOf(row),
        // provider 送**远端给的那个**并由服务端与它自己的推导对账 —— 不一致说明面板
        // 在看过期的账号设置，那值得说出来而不是静默铸造一份对不上的溯源。
        provider: current.provider,
        server_host: current.server_host,
        account_id: null,
        owner_repo: current.owner_repo,
        number: row.number,
      },
      snapshot: {
        title: row.title,
        body: row.body,
        labels: row.labels.map((label) => label.name),
        author: row.author,
      },
      scenario: payload.scenario,
      instruction: payload.instruction,
      // 总是显式送 —— 服务端把缺失读作「静默」而不是弹层的默认值。
      writeback: payload.writeback,
      agent_type: null,
      force: payload.force,
    })
    if (!result) {
      startError.value = "服务端返回了一个无法识别的结果，请到桌面端确认任务是否已创建。"
      return
    }
    startResult.value = result
    if (result.outcome === "created") {
      showStartSheet.value = false
      startRow.value = null
      uni.showToast({ title: "已创建任务", icon: "success" })
      // 立刻反查一次让芯片亮起来 —— 不等 `task://changed`（那条事件可能因为断线错过）。
      void refreshTaskLinks()
    }
    // duplicate / folder_mismatch 留在弹层里，由它自己变形（见组件注释）。
  } catch (error) {
    startError.value = classifyForgeError(error).message
  } finally {
    startSubmitting.value = false
  }
}

/** 点芯片或「查看已有任务」进任务详情页。 */
function openTaskDetail(taskId: number) {
  const target = connection.value
  const connectionId = String(target?.id || "").trim()
  if (!connectionId) {
    uni.showToast({ title: "缺少连接信息，请返回连接页重试", icon: "none" })
    return
  }
  uni.navigateTo({ url: buildTaskDetailRoute({ connectionId, taskId }) })
}

/* ===== 面板设置 ===== */

/**
 * 读全部作用域的设置。
 *
 * 连接级（一个 blob 装着全局行加每个文件夹的覆盖），所以切项目不用重读。失败静默 ——
 * 弹层会退化成内置默认，而列表本身不依赖它。
 */
async function loadSettings(activeGateway: CodegGateway) {
  try {
    settingsStore.value = await fetchForgeSettings(activeGateway)
  } catch (error) {
    console.warn("forge settings failed:", error)
  }
}

function openSettingsSheet() {
  settingsError.value = ""
  showSettingsSheet.value = true
}

/**
 * 保存一个作用域。
 *
 * `settings: null` 是「删掉这个项目自己那行让它回去跟随全局」—— 弹层的「跟随全局」
 * 就是这么保存的。`0 → null` 的作用域转换在 service 层做（见那边的文件头）。
 */
async function submitSettings(payload: {
  folderId: number
  settings: ForgePanelSettings | null
}) {
  const activeGateway = gateway.value
  if (!activeGateway) return
  savingSettings.value = true
  settingsError.value = ""
  try {
    // 服务端返回存储后的全部作用域（已 trim、已丢掉空提示词）—— 用它整份替换本地那份，
    // 而不是把本地草稿当成真相。
    settingsStore.value = await saveForgeSettings(
      activeGateway,
      payload.folderId,
      payload.settings
    )
    showSettingsSheet.value = false
    uni.showToast({ title: "已保存", icon: "success" })
  } catch (error) {
    settingsError.value = classifyForgeError(error).message
  } finally {
    savingSettings.value = false
  }
}

/* ===== 错误 ===== */

function clearListError() {
  listError.value = ""
  listErrorInfo.value = null
}

/** 记下失败，并按 `i18n_key` 分类 —— 那决定状态卡说什么、按钮去哪。 */
function setListError(error: unknown) {
  const info = classifyForgeError(error)
  listErrorInfo.value = info
  listError.value = info.message
}

/**
 * `wrongForge` 的静默恢复。
 *
 * 后端返回这个 key 时已经把 host 的 forge 归类改正了，所以正确的反应是**重探 + 重拉**
 * 而不是报错。每个文件夹只做一次（`correctedFolders`）—— 后端不会对同一个 host 报
 * 两次，第二次一定是别的问题，那时就该把错误摊出来。
 *
 * 返回 true = 已经接手（调用方不要再写错误态）。
 */
async function handleWrongForge(error: unknown): Promise<boolean> {
  const info = classifyForgeError(error)
  if (!forgeErrorWantsRetry(info.kind)) return false
  if (correctedFolders.has(scope.folderId)) return false
  correctedFolders.add(scope.folderId)
  // 重探而不只是重拉：归类变了意味着 `folder_forge_remote` 的 provider 也变了，
  // 而 source key 与后续每个请求都依赖它。
  await probeRemote()
  return true
}

/** 状态卡/提示条上那颗按钮。有账号出路就去账号页，否则就是重试。 */
function handleListErrorAction() {
  const info = listErrorInfo.value
  if (info && forgeErrorWantsAccount(info.kind)) {
    goToAccounts(info.host, info.provider)
    return
  }
  void reloadList()
}

/**
 * 去账号页，把主机与 provider 带上。
 *
 * host 优先用错误里的（那是服务端说的「哪个 host 缺账号」），退回远端探测结果。
 * provider 只能从这两处来 —— 客户端从不自己猜（那等于替用户选一份凭据）。
 */
function goToAccounts(host: string, provider: string) {
  const target = connection.value
  const connectionId = String(target?.id || "").trim()
  if (!connectionId) {
    uni.showToast({ title: "缺少连接信息，请返回连接页重试", icon: "none" })
    return
  }
  const serverHost = host || remote.value?.server_host || ""
  const providerId =
    provider === "GitLab" || provider === "gitlab"
      ? "gitlab"
      : provider === "GitHub" || provider === "github"
        ? "github"
        : remote.value?.provider || null
  uni.navigateTo({
    url: buildForgeAccountsRoute({ connectionId, serverHost, provider: providerId }),
  })
}

/**
 * 不可见 tab 的计数。
 *
 * **只在缓存的那个数字已经不描述当前筛选时才发**（`shouldProbeForgeTabCount`）。
 * `countsScope` 不含 tab，所以来回切 tab 一次探测都不会发；改筛选才会。
 *
 * 失败**静默**：一个徽章没有数字远好过一条用户点不动的错误提示，而列表本身
 * 已经加载成功了。
 */
async function ensureHiddenTabCount() {
  const activeGateway = gateway.value
  if (!activeGateway || !remote.value?.supported) return
  const scopeKey = countsScope.value
  if (!shouldProbeForgeTabCount(counts.value, filter.tab, scopeKey)) return
  const target = hiddenForgeTab(filter.tab)
  const seq = ++countSeq
  try {
    const value = await fetchForgeTabCount(
      activeGateway,
      scope.folderId,
      target,
      buildForgeCountFilters(filter)
    )
    if (seq !== countSeq) return
    counts.value = { ...counts.value, [target]: tabCountFromProbe(value, scopeKey) }
  } catch (error) {
    console.warn("forge tab count failed:", error)
  }
}

/** 标签词汇表。切仓库时一次，失败静默（筛选面板少一组选项而已）。 */
async function loadLabels() {
  const activeGateway = gateway.value
  if (!activeGateway || !remote.value?.supported) return
  labelsLoading.value = true
  try {
    const list = await listForgeLabels(activeGateway, scope.folderId)
    labelOptions.value = list.labels
    labelsTruncated.value = list.truncated
  } catch (error) {
    console.warn("forge labels failed:", error)
  } finally {
    labelsLoading.value = false
  }
}

/* ===== 交互 ===== */

function rowKey(row: ForgeIssueRowType) {
  return forgeRowKey(row)
}

/**
 * 切 tab。
 *
 * **只重拉列表，不碰计数** —— `countsScope` 不含 tab，所以两个数字都还有效，
 * 而新 tab 的列表响应会顺手刷新它自己那一个。这就是「切 tab 不产生额外请求」的
 * 全部实现（列表本身那一次是必须的，那是用户要看的内容）。
 */
function handleTabChange(tab: ForgeTab) {
  if (tab === filter.tab) return
  filter.tab = tab
  persistScope()
  void reloadList()
}

/**
 * 搜索输入。
 *
 * 500ms 防抖是**配额纪律**而不是体感优化：GitHub search 30 次/分钟，逐字符发请求
 * 两句话就打爆，之后所有请求都是 403。
 */
function handleKeywordChange(value: string) {
  filter.keyword = value
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchTimer = null
    void reloadList()
  }, SEARCH_DEBOUNCE_MS)
}

/** 改一个筛选字段 → 重拉。计数会在 `reloadList` 末尾按新作用域自动补。 */
function applyFilter<K extends keyof ForgeFilterState>(key: K, value: ForgeFilterState[K]) {
  if (filter[key] === value) return
  filter[key] = value
  void reloadList()
}

function handlePerPageChange(value: number) {
  if (filter.perPage === value) return
  filter.perPage = value
  persistScope()
  void reloadList()
}

function handleResetFilter() {
  const next = resetForgeFilter(filter)
  Object.assign(filter, next)
  void reloadList()
}

function openScopeSheet() {
  showScopeSheet.value = true
}

async function handleSelectConnection(key: string) {
  const target = connections.value.find((item) => buildConnectionKey(item) === key)
  if (!target) return
  connection.value = target
  scope.connectionKey = key
  // 切连接 = 换一台机器，folder_id 是按连接的，必须清掉让 reloadScope 重新定。
  scope.folderId = 0
  remote.value = null
  resetRepositoryState()
  applyConnectionAuth(target)
  await reloadScope()
}

async function handleSelectProject(folderId: number) {
  if (folderId === scope.folderId) return
  scope.folderId = folderId
  remote.value = null
  resetRepositoryState()
  persistScope()
  await probeRemote()
}

function goBack() {
  uni.navigateBack()
}

async function openRepoInBrowser() {
  const url = repoWebUrl()
  if (!url) return
  await openGuardedExternalUrl(url)
}

/**
 * 仓库的网页地址。
 *
 * HTTPS 远端去掉 `.git` 直接用；SSH 远端（`git@host:owner/repo.git`）没有可用的
 * scheme，回落到 `https://host/owner/repo`。与桌面端 `repoWebUrl()` 同一套规则。
 */
function repoWebUrl(): string {
  const current = remote.value
  if (!current) return ""
  const raw = current.remote_url
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\.git$/i, "")
  return `https://${current.server_host}/${current.owner_repo}`
}

/**
 * 打开一个条目的详情页。
 *
 * 先把这一行放进信箱当 seed：详情页首屏不用等请求，而且 issue body 上限 16000 字符，
 * 塞进 URL 会超长且各端行为不一致。
 */
function openItem(row: ForgeIssueRowType) {
  const target = connection.value
  const connectionId = String(target?.id || "").trim()
  if (!connectionId) {
    uni.showToast({ title: "缺少连接信息，请返回连接页重试", icon: "none" })
    return
  }
  putForgeSeed(scope.connectionKey, scope.folderId, row)
  uni.navigateTo({
    url: buildForgeItemRoute({
      connectionId,
      folderId: scope.folderId,
      kind: row.is_pr ? "pr" : "issue",
      number: row.number,
    }),
  })
}
</script>

<style scoped lang="scss">
@import "./index.scss";

.page {
  min-height: 100vh;
}

.forge-page {
  background: var(--up-page-bg-color, var(--up-bg-color, #f3f4f6));
}

.forge-shell {
  padding: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.forge-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.forge-list-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  padding: 24rpx 0 8rpx;
}

.forge-list-footer__text {
  font-size: 22rpx;
  color: var(--up-tips-color, #909193);
  text-align: center;
}

.forge-list-footer__text--warning {
  color: var(--up-warning, #ff9900);
}

.forge-safe-bottom {
  height: calc(36rpx + env(safe-area-inset-bottom));
}
</style>
