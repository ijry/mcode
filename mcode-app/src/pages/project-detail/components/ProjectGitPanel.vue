<template>
  <view class="project-git-panel">
    <ProjectUnsupportedState
      v-if="gitUnavailableText"
      title="Git 暂不可用"
      :text="gitUnavailableText"
      icon="git-branch"
    />

    <view v-else-if="loading" class="project-git-state" :style="upThemeCardStyle">
      <u-loading-icon
        mode="circle"
        size="26"
        :color="upThemeVar('--up-primary', '#2979ff')"
      ></u-loading-icon>
      <text class="project-git-state__text">正在加载 Git 信息...</text>
    </view>

    <ProjectUnsupportedState
      v-else-if="errorMessage"
      title="加载失败"
      :text="errorMessage"
      icon="warning"
      actionText="重试"
      @action="retryLoadPage"
    />

    <view
      v-else
      class="project-git-content"
      :class="{ 'project-git-content--split': splitMode }"
    >
      <view
        class="project-git-panel__pane project-git-panel__pane--workspace"
        :style="workspacePaneStyle"
      >
        <view class="project-git-workspace" :style="upThemeCardStyle">
          <view class="project-git-workspace__head">
            <text class="project-git-workspace__title">当前工作区状态</text>
            <view class="project-git-workspace__actions">
              <view class="project-git-action" @click="refreshPage">
                <text>刷新</text>
              </view>
              <view class="project-git-action project-git-action--primary" @click="openBranchSheet">
                <text>切分支</text>
              </view>
              <view class="project-git-action" @click="handlePush">
                <text>Push</text>
              </view>
            </view>
          </view>

          <view class="project-git-workspace__stats">
            <view class="project-git-stat">
              <text class="project-git-stat__value">{{ workspaceSummary.modified }}</text>
              <text class="project-git-stat__label">修改</text>
            </view>
            <view class="project-git-stat">
              <text class="project-git-stat__value">{{ workspaceSummary.added }}</text>
              <text class="project-git-stat__label">新增</text>
            </view>
            <view class="project-git-stat">
              <text class="project-git-stat__value">{{ workspaceSummary.deleted }}</text>
              <text class="project-git-stat__label">删除</text>
            </view>
            <view class="project-git-stat">
              <text class="project-git-stat__value">{{ workspaceSummary.untracked }}</text>
              <text class="project-git-stat__label">未跟踪</text>
            </view>
          </view>

          <view v-if="workspaceEntries.length === 0" class="project-git-empty-row">
            <text>当前工作区没有变更。</text>
          </view>

          <view v-else class="project-git-file-list">
            <view
              v-for="entry in workspaceEntries"
              :key="`${entry.status}:${entry.file}`"
              class="project-git-file-row"
              :class="`project-git-file-row--${getStatusPresentation(entry.status).tone}`"
              @click="openWorkspaceDiff(entry)"
            >
              <view class="project-git-file-row__main">
                <view class="project-git-file-row__badge">
                  <u-icon
                    :name="getStatusPresentation(entry.status).icon"
                    size="16"
                    :color="getToneColor(getStatusPresentation(entry.status).tone)"
                  ></u-icon>
                  <text
                    class="project-git-file-row__status"
                    :style="{ color: getToneColor(getStatusPresentation(entry.status).tone) }"
                  >
                    {{ entry.status }}
                  </text>
                </view>
                <view class="project-git-file-row__copy">
                  <text class="project-git-file-row__path">{{ entry.file }}</text>
                  <text class="project-git-file-row__meta">
                    {{ getStatusPresentation(entry.status).label }}
                  </text>
                </view>
              </view>
              <u-icon
                name="arrow-right"
                size="16"
                :color="upThemeVar('--up-tips-color', '#909193')"
              ></u-icon>
            </view>
          </view>
        </view>
      </view>

      <view
        v-if="splitMode"
        class="project-git-panel__drag"
        @mousedown="startSplitDrag"
        @touchstart.stop.prevent="startSplitDrag"
      >
        <view class="project-git-panel__drag-line"></view>
      </view>

      <view
        class="project-git-panel__pane project-git-panel__pane--history"
        :style="historyPaneStyle"
      >
        <view class="project-git-history" :style="upThemeCardStyle">
          <view class="project-git-history__head">
            <text class="project-git-history__title">提交历史</text>
            <text class="project-git-history__subtitle">{{ gitEntries.length }} 条提交</text>
          </view>

          <view v-if="gitEntries.length === 0" class="project-git-empty-row">
            <text>暂无提交记录。</text>
          </view>

          <view v-else class="project-git-commit-list">
            <view
              v-for="entry in gitEntries"
              :key="entry.full_hash"
              class="project-git-commit"
              @click="openCommitDetail(entry)"
            >
              <view class="project-git-commit__head">
                <view class="project-git-commit__copy">
                  <text class="project-git-commit__message">{{ entry.message }}</text>
                  <text class="project-git-commit__meta">
                    {{ entry.author }} · {{ entry.hash }} · {{ formatDateTime(entry.date) }}
                  </text>
                </view>
                <view class="project-git-commit__menu" @click.stop="openCommitActionSheet(entry)">
                  <u-icon
                    name="more-dot-fill"
                    size="18"
                    :color="upThemeVar('--up-tips-color', '#909193')"
                  ></u-icon>
                </view>
              </view>
              <view class="project-git-commit__footer">
                <text class="project-git-commit__footer-text">
                  {{ entry.files.length }} 个文件变更
                </text>
                <u-icon
                  name="arrow-right"
                  size="16"
                  :color="upThemeVar('--up-tips-color', '#909193')"
                ></u-icon>
              </view>
            </view>
          </view>
        </view>
      </view>
    </view>

    <u-action-sheet
      :show="showBranchActionSheet"
      :actions="branchActions"
      @select="handleBranchSelect"
      @close="showBranchActionSheet = false"
    ></u-action-sheet>

    <u-action-sheet
      :show="showCommitActionSheet"
      :actions="commitActions"
      @select="handleCommitActionSelect"
      @close="showCommitActionSheet = false"
    ></u-action-sheet>

    <u-popup
      :show="showCreateBranchPopup"
      mode="center"
      :round="24"
      @close="showCreateBranchPopup = false"
    >
      <view class="project-git-popup" :style="upThemeCardStyle">
        <text class="project-git-popup__title">新建分支</text>
        <u-input v-model="createBranchName" placeholder="请输入分支名"></u-input>
        <view class="project-git-popup__actions">
          <u-button type="primary" block @click="submitCreateBranch">创建</u-button>
        </view>
      </view>
    </u-popup>

    <u-popup :show="showResetPopup" mode="center" :round="24" @close="showResetPopup = false">
      <view class="project-git-popup" :style="upThemeCardStyle">
        <text class="project-git-popup__title">Reset 到该提交</text>
        <u-radio-group :modelValue="resetMode" placement="column" @change="handleResetModeChange">
          <u-radio name="soft" label="soft"></u-radio>
          <u-radio name="mixed" label="mixed"></u-radio>
          <u-radio name="hard" label="hard"></u-radio>
          <u-radio name="keep" label="keep"></u-radio>
        </u-radio-group>
        <view class="project-git-popup__actions">
          <u-button type="primary" block @click="submitReset">确认 Reset</u-button>
        </view>
      </view>
    </u-popup>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, onBeforeUnmount, ref, watch } from "vue"
import ProjectUnsupportedState from "./ProjectUnsupportedState.vue"
import {
  persistResolvedConnection,
  resolveConnectionContext,
  type ConnectionContext,
} from "@/services/connectionContext"
import {
  buildProjectGitCommitRoute,
  buildProjectGitDiffRoute,
  buildWorkspaceStatusSummary,
  checkoutRemoteBranch,
  createRemoteBranch,
  formatGitDateTime,
  getGitFileStatusPresentation,
  getGitFileToneColor,
  getRemoteCommitBranches,
  getRemoteGitBranch,
  getRemoteGitBranches,
  getRemoteGitLog,
  getRemoteGitStatus,
  getRemotePushInfo,
  isCurrentBranchHistoryView,
  isNotGitRepositoryError,
  pushRemoteBranch,
  resetRemoteBranch,
  type GitBranchList,
  type GitLogEntry,
  type GitResetMode,
  type GitStatusEntry,
} from "@/services/projectGit"
import { isWorkspaceCapableConnection } from "@/services/projectDetail"
import type { CodegGateway } from "@/services/gateway"
import {
  DEFAULT_PROJECT_GIT_SPLIT_RATIO,
  readProjectGitSplitRatio,
  writeProjectGitSplitRatio,
} from "../projectGitSplitState"

const props = withDefaults(
  defineProps<{
    connection: ConnectionContext | null
    folderId: number
    projectName: string
    projectPath: string
    splitMode?: boolean
  }>(),
  {
    splitMode: false,
  }
)

const emit = defineEmits<{
  (
    event: "summary-change",
    summary: { branch: string | null; changes: number; commits: number }
  ): void
}>()

const currentInstance = getCurrentInstance()
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (name: string, fallback: string) =>
  currentInstance?.proxy?.upThemeVar?.(name, fallback) ?? `var(${name}, ${fallback})`

const loading = ref(false)
const errorMessage = ref("")
const resolvedConnection = ref<ConnectionContext | null>(props.connection)
const resolvedGateway = ref<CodegGateway | null>(null)
const currentBranch = ref<string | null>(null)
const selectedBranch = ref<string | null>(null)
const workspaceEntries = ref<GitStatusEntry[]>([])
const gitEntries = ref<GitLogEntry[]>([])
const branchList = ref<GitBranchList | null>(null)
const showBranchActionSheet = ref(false)
const showCommitActionSheet = ref(false)
const currentCommitAction = ref<GitLogEntry | null>(null)
const showCreateBranchPopup = ref(false)
const createBranchName = ref("")
const showResetPopup = ref(false)
const resetMode = ref<GitResetMode>("mixed")
const splitRatio = ref(DEFAULT_PROJECT_GIT_SPLIT_RATIO)

let dragContainer: HTMLElement | null = null

const workspaceSummary = computed(() => buildWorkspaceStatusSummary(workspaceEntries.value))

const gitUnavailableText = computed(() => {
  if (!props.projectPath) return "当前项目缺少路径，无法读取 Git 信息。"
  const connection = resolvedConnection.value || props.connection
  if (!isWorkspaceCapableConnection(connection)) {
    return "当前连接暂不支持项目 Git 功能，请使用 codeg-main 连接。"
  }
  return ""
})

const splitConnectionId = computed(() =>
  String(resolvedConnection.value?.id || props.connection?.id || "").trim()
)

const workspacePaneStyle = computed(() => {
  if (!props.splitMode) return {}
  return {
    flexBasis: `${splitRatio.value * 100}%`,
  }
})

const historyPaneStyle = computed(() => {
  if (!props.splitMode) return {}
  return {
    flexBasis: `${(1 - splitRatio.value) * 100}%`,
  }
})

const branchActions = computed(() =>
  [
    ...(branchList.value?.local || []).map((name) => ({ name })),
    ...(branchList.value?.remote || []).map((name) => ({ name })),
  ].filter((entry, index, array) => array.findIndex((item) => item.name === entry.name) === index)
)

const commitActions = computed(() => [
  { name: "新建分支", color: "#2979ff" },
  {
    name: "Reset 到这里",
    color: isCurrentBranchHistoryView(currentBranch.value, selectedBranch.value)
      ? "#fa8c16"
      : "#c7c7cc",
    disabled: !isCurrentBranchHistoryView(currentBranch.value, selectedBranch.value),
  },
])

const gitSummary = computed(() => ({
  branch: currentBranch.value,
  changes: workspaceEntries.value.length,
  commits: gitEntries.value.length,
}))

watch(
  () => props.connection,
  (next) => {
    resolvedConnection.value = next
  }
)

watch(
  () => [props.connection?.id || "", props.folderId, props.projectPath],
  () => {
    void loadPage()
  },
  { immediate: true }
)

watch(
  () => [splitConnectionId.value, props.folderId],
  () => {
    readSplitRatio()
  },
  { immediate: true }
)

watch(
  gitSummary,
  (summary) => {
    emit("summary-change", summary)
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  stopSplitDrag()
})

async function loadPage(stopPullDown = false) {
  if (gitUnavailableText.value) {
    clearGitData()
    if (stopPullDown) uni.stopPullDownRefresh()
    return
  }

  if (!resolvedConnection.value || !props.projectPath) {
    errorMessage.value = "缺少项目或连接信息，请返回重试。"
    if (stopPullDown) uni.stopPullDownRefresh()
    return
  }

  loading.value = true
  errorMessage.value = ""
  try {
    const resolved = await resolveConnectionContext(resolvedConnection.value)
    resolvedConnection.value = resolved.connection
    resolvedGateway.value = resolved.gateway
    persistResolvedConnection(resolved.connection)

    if (!isWorkspaceCapableConnection(resolved.connection)) {
      errorMessage.value = "当前连接暂不支持项目 Git 功能，请使用 codeg-main 连接。"
      clearGitData()
      return
    }

    const [branch, statusEntries, branches, logResult] = await Promise.all([
      getRemoteGitBranch(resolved.gateway, props.projectPath),
      getRemoteGitStatus(resolved.gateway, props.projectPath),
      getRemoteGitBranches(resolved.gateway, props.projectPath),
      getRemoteGitLog(resolved.gateway, props.projectPath, selectedBranch.value),
    ])

    currentBranch.value = branch
    if (!selectedBranch.value) {
      selectedBranch.value = branch
    }
    workspaceEntries.value = statusEntries
    branchList.value = branches
    gitEntries.value = logResult.entries
  } catch (error) {
    console.warn("load project git failed", error)
    errorMessage.value = toErrorMessage(error)
    if (isNotGitRepositoryError(error)) {
      errorMessage.value = "当前项目不是 Git 仓库"
    }
    clearGitData()
  } finally {
    loading.value = false
    if (stopPullDown) uni.stopPullDownRefresh()
  }
}

function clearGitData() {
  workspaceEntries.value = []
  gitEntries.value = []
  branchList.value = null
}

function refreshPage() {
  void loadPage()
}

function retryLoadPage() {
  void loadPage()
}

function openBranchSheet() {
  showBranchActionSheet.value = true
}

async function handleBranchSelect(action: { name: string }) {
  if (!resolvedGateway.value || !props.projectPath) return
  selectedBranch.value = action.name
  showBranchActionSheet.value = false
  await checkoutRemoteBranch(resolvedGateway.value, props.projectPath, action.name)
  await loadPage()
}

async function handlePush() {
  if (!resolvedGateway.value || !props.projectPath) return
  const info = await getRemotePushInfo(resolvedGateway.value, props.projectPath)
  const remoteName = info.tracking_remote || info.remotes[0]?.name || null
  await pushRemoteBranch(resolvedGateway.value, props.projectPath, remoteName, props.folderId || null)
  await loadPage()
}

async function preloadCommitBranches(entry: GitLogEntry) {
  if (!resolvedGateway.value || !props.projectPath) return
  await getRemoteCommitBranches(resolvedGateway.value, props.projectPath, entry.full_hash)
}

function openCommitActionSheet(entry: GitLogEntry) {
  currentCommitAction.value = entry
  void preloadCommitBranches(entry)
  showCommitActionSheet.value = true
}

function openCommitDetail(entry: GitLogEntry) {
  if (!resolvedConnection.value) return
  uni.navigateTo({
    url: buildProjectGitCommitRoute({
      connectionId: String(resolvedConnection.value.id || ""),
      folderId: props.folderId,
      projectName: props.projectName,
      projectPath: props.projectPath,
      commit: entry,
    }),
  })
}

function openWorkspaceDiff(entry: GitStatusEntry) {
  if (!resolvedConnection.value) return
  uni.navigateTo({
    url: buildProjectGitDiffRoute({
      connectionId: String(resolvedConnection.value.id || ""),
      folderId: props.folderId,
      projectName: props.projectName,
      projectPath: props.projectPath,
      filePath: entry.file,
      fileStatus: entry.status,
      mode: "workspace",
      branch: selectedBranch.value || currentBranch.value,
    }),
  })
}

function handleCommitActionSelect(action: { name: string }) {
  showCommitActionSheet.value = false
  if (action.name === "新建分支") {
    createBranchName.value = ""
    showCreateBranchPopup.value = true
    return
  }
  if (
    action.name === "Reset 到这里" &&
    isCurrentBranchHistoryView(currentBranch.value, selectedBranch.value)
  ) {
    resetMode.value = "mixed"
    showResetPopup.value = true
  }
}

async function submitCreateBranch() {
  if (
    !resolvedGateway.value ||
    !props.projectPath ||
    !currentCommitAction.value ||
    !createBranchName.value.trim()
  ) {
    return
  }

  await createRemoteBranch(
    resolvedGateway.value,
    props.projectPath,
    createBranchName.value.trim(),
    currentCommitAction.value.full_hash
  )
  showCreateBranchPopup.value = false
  await loadPage()
}

function handleResetModeChange(value: string) {
  resetMode.value = value as GitResetMode
}

async function submitReset() {
  if (!resolvedGateway.value || !props.projectPath || !currentCommitAction.value) return

  await resetRemoteBranch(
    resolvedGateway.value,
    props.projectPath,
    currentCommitAction.value.full_hash,
    resetMode.value
  )
  showResetPopup.value = false
  await loadPage()
}

function readSplitRatio() {
  if (!splitConnectionId.value || props.folderId <= 0) return
  splitRatio.value = readProjectGitSplitRatio(uni, splitConnectionId.value, props.folderId)
}

function persistSplitRatio() {
  if (!splitConnectionId.value || props.folderId <= 0) return
  writeProjectGitSplitRatio(uni, splitConnectionId.value, props.folderId, splitRatio.value)
}

function startSplitDrag(event: MouseEvent | TouchEvent) {
  if (!props.splitMode || typeof document === "undefined") return
  const target = event.currentTarget as HTMLElement | null
  dragContainer = target?.parentElement || null
  if (!dragContainer) return

  event.preventDefault()
  document.addEventListener("mousemove", moveSplitDrag)
  document.addEventListener("mouseup", stopSplitDrag)
  document.addEventListener("touchmove", moveSplitDrag, { passive: false })
  document.addEventListener("touchend", stopSplitDrag)
  document.addEventListener("touchcancel", stopSplitDrag)
  moveSplitDrag(event)
}

function moveSplitDrag(event: MouseEvent | TouchEvent) {
  if (!dragContainer) return
  event.preventDefault()
  const rect = dragContainer.getBoundingClientRect()
  if (rect.height <= 0) return
  const nextRatio = (getPointerClientY(event) - rect.top) / rect.height
  splitRatio.value = Math.min(0.75, Math.max(0.3, nextRatio))
}

function stopSplitDrag() {
  if (typeof document !== "undefined") {
    document.removeEventListener("mousemove", moveSplitDrag)
    document.removeEventListener("mouseup", stopSplitDrag)
    document.removeEventListener("touchmove", moveSplitDrag)
    document.removeEventListener("touchend", stopSplitDrag)
    document.removeEventListener("touchcancel", stopSplitDrag)
  }
  if (dragContainer) {
    persistSplitRatio()
  }
  dragContainer = null
}

function getPointerClientY(event: MouseEvent | TouchEvent) {
  if ("touches" in event && event.touches.length > 0) {
    return event.touches[0]?.clientY ?? 0
  }
  if ("changedTouches" in event && event.changedTouches.length > 0) {
    return event.changedTouches[0]?.clientY ?? 0
  }
  return (event as MouseEvent).clientY
}

function formatDateTime(value: string) {
  return formatGitDateTime(value)
}

function getStatusPresentation(status: string) {
  return getGitFileStatusPresentation(status)
}

function getToneColor(tone: "success" | "error" | "warning" | "info") {
  return getGitFileToneColor(tone)
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  return "读取 Git 信息失败"
}

defineExpose({ reload: loadPage })
</script>

<style scoped lang="scss">
.project-git-panel {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.project-git-state,
.project-git-workspace,
.project-git-history {
  border-radius: 24rpx;
  background: var(--up-card-bg-color, #ffffff);
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.project-git-workspace,
.project-git-history,
.project-git-state {
  padding: 28rpx;
}

.project-git-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14rpx;
  text-align: center;
}

.project-git-workspace,
.project-git-history {
  width: 100%;
  box-sizing: border-box;
}

.project-git-state__text,
.project-git-history__subtitle,
.project-git-commit__meta {
  font-size: 24rpx;
  line-height: 1.55;
  color: var(--up-content-color, #606266);
}

.project-git-content {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.project-git-content--split {
  height: calc(100vh - 430rpx);
  min-height: 720rpx;
  gap: 0;
  overflow: hidden;
}

.project-git-content--split .project-git-panel__pane {
  min-height: 0;
  overflow: hidden;
  display: flex;
}

.project-git-content--split .project-git-workspace,
.project-git-content--split .project-git-history {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.project-git-panel__drag {
  height: 32rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: row-resize;
  flex-shrink: 0;
}

.project-git-panel__drag-line {
  width: 96rpx;
  height: 6rpx;
  border-radius: 999rpx;
  background: var(--up-border-color, #dadbde);
}

.project-git-workspace__head,
.project-git-history__head,
.project-git-commit__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
}

.project-git-workspace__title,
.project-git-history__title {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.project-git-workspace__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 12rpx;
}

.project-git-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 14rpx 24rpx;
  border-radius: 999rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  color: var(--up-main-color, #303133);
  font-size: 22rpx;
  font-weight: 600;
}

.project-git-action--primary {
  background: var(--up-primary, #2979ff);
  color: #ffffff;
}

.project-git-workspace__stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12rpx;
  margin-top: 20rpx;
}

.project-git-stat {
  padding: 16rpx;
  border-radius: 16rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  text-align: center;
}

.project-git-stat__value {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.project-git-stat__label {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: var(--up-tips-color, #909193);
}

.project-git-file-list,
.project-git-commit-list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  margin-top: 20rpx;
}

.project-git-file-row,
.project-git-commit__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14rpx;
  padding: 16rpx 18rpx;
  border-radius: 16rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.project-git-file-row--success {
  background: color-mix(
    in srgb,
    var(--up-success, #19be6b) 10%,
    var(--up-card-bg-color, #ffffff) 90%
  );
}

.project-git-file-row--error {
  background: color-mix(
    in srgb,
    var(--up-error, #fa3534) 10%,
    var(--up-card-bg-color, #ffffff) 90%
  );
}

.project-git-file-row--warning {
  background: color-mix(
    in srgb,
    var(--up-warning, #f9ae3d) 12%,
    var(--up-card-bg-color, #ffffff) 88%
  );
}

.project-git-file-row--info {
  background: color-mix(
    in srgb,
    var(--up-primary, #2979ff) 10%,
    var(--up-card-bg-color, #ffffff) 90%
  );
}

.project-git-file-row__main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 14rpx;
}

.project-git-file-row__badge {
  width: 96rpx;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.project-git-file-row__status {
  font-size: 22rpx;
  font-weight: 700;
}

.project-git-file-row__copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.project-git-file-row__path,
.project-git-commit__message {
  flex: 1;
  min-width: 0;
  font-size: 24rpx;
  color: var(--up-main-color, #303133);
  word-break: break-all;
}

.project-git-file-row__meta {
  font-size: 22rpx;
  color: var(--up-content-color, #606266);
}

.project-git-empty-row {
  margin-top: 20rpx;
  padding: 18rpx;
  border-radius: 16rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  font-size: 24rpx;
  color: var(--up-content-color, #606266);
}

.project-git-commit {
  padding: 20rpx;
  border-radius: 18rpx;
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.project-git-commit__copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.project-git-commit__menu {
  width: 48rpx;
  height: 48rpx;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.project-git-commit__footer {
  margin-top: 18rpx;
}

.project-git-commit__footer-text {
  font-size: 22rpx;
  color: var(--up-content-color, #606266);
}

.project-git-popup {
  width: 640rpx;
  max-width: calc(100vw - 48rpx);
  padding: 28rpx;
  border-radius: 24rpx;
}

.project-git-popup__title {
  display: block;
  margin-bottom: 18rpx;
  font-size: 30rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.project-git-popup__actions {
  margin-top: 20rpx;
}
</style>
