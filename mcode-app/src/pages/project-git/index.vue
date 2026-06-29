<template>
  <view class="page project-git-page" :style="[upThemeVars, upThemePageStyle]">
    <view class="project-git-shell">
      <view class="project-git-header" :style="upThemeCardStyle">
        <view class="project-git-header__copy">
          <text class="project-git-header__eyebrow">PROJECT GIT</text>
          <text class="project-git-header__title">{{ projectName || "Git 管理" }}</text>
          <text class="project-git-header__desc">
            {{ connectionName || "当前连接" }} · {{ currentBranch || "未知分支" }}
          </text>
          <text class="project-git-header__path">{{ projectPath || "未提供项目路径" }}</text>
        </view>
      </view>

      <view v-if="loading" class="project-git-state" :style="upThemeCardStyle">
        <u-loading-icon mode="circle" size="26" color="#2979ff"></u-loading-icon>
        <text class="project-git-state__text">正在加载 Git 信息...</text>
      </view>

      <view
        v-else-if="errorMessage"
        class="project-git-state project-git-state--error"
        :style="upThemeCardStyle"
      >
        <text class="project-git-state__title">加载失败</text>
        <text class="project-git-state__text">{{ errorMessage }}</text>
        <view class="project-git-state__action" @click="retryLoadPage">
          <text>重试</text>
        </view>
      </view>

      <view v-else class="project-git-content">
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
              <u-icon name="arrow-right" size="16" color="#c0c4cc"></u-icon>
            </view>
          </view>
        </view>

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
                <view
                  class="project-git-commit__menu"
                  @click.stop="openCommitActionSheet(entry)"
                >
                  <u-icon name="more-dot-fill" size="18" color="#c7c7cc"></u-icon>
                </view>
              </view>
              <view class="project-git-commit__footer">
                <text class="project-git-commit__footer-text">
                  {{ entry.files.length }} 个文件变更
                </text>
                <u-icon name="arrow-right" size="16" color="#c0c4cc"></u-icon>
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

    <u-popup
      :show="showResetPopup"
      mode="center"
      :round="24"
      @close="showResetPopup = false"
    >
      <view class="project-git-popup" :style="upThemeCardStyle">
        <text class="project-git-popup__title">Reset 到该提交</text>
        <u-radio-group
          :modelValue="resetMode"
          placement="column"
          @change="handleResetModeChange"
        >
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
import { computed, getCurrentInstance, ref } from "vue"
import { onLoad, onPullDownRefresh } from "@dcloudio/uni-app"
import type { CodegGateway } from "@/services/gateway"
import {
  decodeConnectionContext,
  findStoredConnectionById,
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
  isNotGitRepositoryError,
  isCurrentBranchHistoryView,
  pushRemoteBranch,
  resetRemoteBranch,
  type GitBranchList,
  type GitLogEntry,
  type GitResetMode,
  type GitStatusEntry,
} from "@/services/projectGit"

const currentInstance = getCurrentInstance()
const upThemeVars = computed(() => currentInstance?.proxy?.upThemeVars || {})
const upThemePageStyle = computed(() => currentInstance?.proxy?.upThemePageStyle || {})
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})

const loading = ref(false)
const errorMessage = ref("")
const connection = ref<ConnectionContext | null>(null)
const resolvedGateway = ref<CodegGateway | null>(null)
const connectionName = computed(() => connection.value?.name || "")
const folderId = ref(0)
const projectName = ref("")
const projectPath = ref("")
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

const workspaceSummary = computed(() =>
  buildWorkspaceStatusSummary(workspaceEntries.value)
)

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

onLoad((options) => {
  connection.value =
    findStoredConnectionById(String(options?.connectionId || "")) ||
    decodeConnectionContext(options?.connection as string)
  folderId.value = Number(options?.folderId || 0)
  projectName.value = decodeURIComponent(String(options?.projectName || "").trim())
  projectPath.value = decodeURIComponent(String(options?.projectPath || "").trim())
  void loadPage()
})

onPullDownRefresh(() => {
  void loadPage(true)
})

async function loadPage(stopPullDown = false) {
  if (!connection.value || !projectPath.value) {
    errorMessage.value = "缺少项目或连接信息，请返回重试。"
    if (stopPullDown) uni.stopPullDownRefresh()
    return
  }

  loading.value = true
  errorMessage.value = ""
  try {
    const resolved = await resolveConnectionContext(connection.value)
    connection.value = resolved.connection
    resolvedGateway.value = resolved.gateway
    persistResolvedConnection(resolved.connection)

    const [branch, statusEntries, branches, logResult] = await Promise.all([
      getRemoteGitBranch(resolved.gateway, projectPath.value),
      getRemoteGitStatus(resolved.gateway, projectPath.value),
      getRemoteGitBranches(resolved.gateway, projectPath.value),
      getRemoteGitLog(resolved.gateway, projectPath.value, selectedBranch.value),
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
    workspaceEntries.value = []
    gitEntries.value = []
    branchList.value = null
  } finally {
    loading.value = false
    if (stopPullDown) uni.stopPullDownRefresh()
  }
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
  if (!resolvedGateway.value || !projectPath.value) return
  selectedBranch.value = action.name
  showBranchActionSheet.value = false
  await checkoutRemoteBranch(resolvedGateway.value, projectPath.value, action.name)
  await loadPage()
}

async function handlePush() {
  if (!resolvedGateway.value || !projectPath.value) return
  const info = await getRemotePushInfo(resolvedGateway.value, projectPath.value)
  const remoteName = info.tracking_remote || info.remotes[0]?.name || null
  await pushRemoteBranch(
    resolvedGateway.value,
    projectPath.value,
    remoteName,
    folderId.value || null
  )
  await loadPage()
}

async function preloadCommitBranches(entry: GitLogEntry) {
  if (!resolvedGateway.value || !projectPath.value) return
  await getRemoteCommitBranches(
    resolvedGateway.value,
    projectPath.value,
    entry.full_hash
  )
}

function openCommitActionSheet(entry: GitLogEntry) {
  currentCommitAction.value = entry
  void preloadCommitBranches(entry)
  showCommitActionSheet.value = true
}

function openCommitDetail(entry: GitLogEntry) {
  if (!connection.value) return
  uni.navigateTo({
    url: buildProjectGitCommitRoute({
      connectionId: connection.value.id,
      folderId: folderId.value,
      projectName: projectName.value,
      projectPath: projectPath.value,
      commit: entry,
    }),
  })
}

function openWorkspaceDiff(entry: GitStatusEntry) {
  if (!connection.value) return
  uni.navigateTo({
    url: buildProjectGitDiffRoute({
      connectionId: connection.value.id,
      folderId: folderId.value,
      projectName: projectName.value,
      projectPath: projectPath.value,
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
    !projectPath.value ||
    !currentCommitAction.value ||
    !createBranchName.value.trim()
  ) {
    return
  }

  await createRemoteBranch(
    resolvedGateway.value,
    projectPath.value,
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
  if (!resolvedGateway.value || !projectPath.value || !currentCommitAction.value) return

  await resetRemoteBranch(
    resolvedGateway.value,
    projectPath.value,
    currentCommitAction.value.full_hash,
    resetMode.value
  )
  showResetPopup.value = false
  await loadPage()
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
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
}

.project-git-page {
  background: var(--up-page-bg-color, var(--up-bg-color, #f3f4f6));
}

.project-git-shell {
  padding: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.project-git-header,
.project-git-state,
.project-git-workspace,
.project-git-history {
  border-radius: 30rpx;
  background: var(--up-card-bg-color, #ffffff);
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.project-git-header,
.project-git-workspace,
.project-git-history,
.project-git-state {
  padding: 28rpx;
}

.project-git-header__copy {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.project-git-header__eyebrow {
  font-size: 20rpx;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--up-primary, #2979ff);
}

.project-git-header__title,
.project-git-state__title,
.project-git-workspace__title,
.project-git-history__title {
  font-size: 34rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.project-git-header__desc,
.project-git-header__path,
.project-git-state__text,
.project-git-history__subtitle,
.project-git-commit__meta {
  font-size: 24rpx;
  line-height: 1.55;
  color: var(--up-content-color, #606266);
}

.project-git-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14rpx;
  text-align: center;
}

.project-git-state--error {
  align-items: stretch;
}

.project-git-state__action,
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

.project-git-action--primary,
.project-git-state__action {
  background: var(--up-primary, #2979ff);
  color: #ffffff;
}

.project-git-content {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.project-git-workspace__head,
.project-git-history__head,
.project-git-commit__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
}

.project-git-workspace__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 12rpx;
}

.project-git-workspace__stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12rpx;
  margin-top: 20rpx;
}

.project-git-stat {
  padding: 16rpx;
  border-radius: 20rpx;
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
  border-radius: 20rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.project-git-file-row--success {
  background: color-mix(in srgb, var(--up-success, #19be6b) 10%, #ffffff 90%);
}

.project-git-file-row--error {
  background: color-mix(in srgb, var(--up-error, #fa3534) 10%, #ffffff 90%);
}

.project-git-file-row--warning {
  background: color-mix(in srgb, var(--up-warning, #f9ae3d) 12%, #ffffff 88%);
}

.project-git-file-row--info {
  background: color-mix(in srgb, var(--up-primary, #2979ff) 10%, #ffffff 90%);
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
  border-radius: 20rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  font-size: 24rpx;
  color: var(--up-content-color, #606266);
}

.project-git-commit {
  padding: 20rpx;
  border-radius: 24rpx;
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
  border-radius: 28rpx;
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
