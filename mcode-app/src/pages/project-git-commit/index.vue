<template>
  <view class="page project-git-commit-page" :style="[upThemeVars, upThemePageStyle]">
    <view class="project-git-commit-shell">
      <view class="project-git-commit-card" :style="upThemeCardStyle">
        <text class="project-git-commit-card__eyebrow">COMMIT DETAIL</text>
        <text class="project-git-commit-card__message">{{ commitEntry?.message || "未知提交" }}</text>
        <text class="project-git-commit-card__meta">
          {{ commitEntry?.author || "未知作者" }} · {{ commitEntry?.hash || "--" }} ·
          {{ formatDateTime(commitEntry?.date || "") }}
        </text>
        <text class="project-git-commit-card__path">{{ projectPath || "未提供项目路径" }}</text>
      </view>

      <view
        v-if="!commitEntry"
        class="project-git-commit-state project-git-commit-state--error"
        :style="upThemeCardStyle"
      >
        <text class="project-git-commit-state__title">提交信息无效</text>
        <text class="project-git-commit-state__text">当前页面缺少提交详情，无法显示文件列表。</text>
      </view>

      <view v-else class="project-git-commit-files" :style="upThemeCardStyle">
        <view class="project-git-commit-files__head">
          <text class="project-git-commit-files__title">提交文件</text>
          <text class="project-git-commit-files__subtitle">{{ commitEntry.files.length }} 个文件</text>
        </view>

        <view v-if="commitEntry.files.length === 0" class="project-git-commit-empty-row">
          <text>该提交没有可展示的文件变更。</text>
        </view>

        <view v-else class="project-git-commit-file-list">
          <view
            v-for="file in commitEntry.files"
            :key="`${commitEntry.full_hash}:${file.path}`"
            class="project-git-commit-file-row"
            :class="`project-git-commit-file-row--${getStatusPresentation(file.status).tone}`"
            @click="openCommitDiff(file)"
          >
            <view class="project-git-commit-file-row__main">
              <view class="project-git-commit-file-row__badge">
                <u-icon
                  :name="getStatusPresentation(file.status).icon"
                  size="16"
                  :color="getToneColor(getStatusPresentation(file.status).tone)"
                ></u-icon>
                <text
                  class="project-git-commit-file-row__status"
                  :style="{ color: getToneColor(getStatusPresentation(file.status).tone) }"
                >
                  {{ file.status }}
                </text>
              </view>
              <view class="project-git-commit-file-row__copy">
                <text class="project-git-commit-file-row__path">{{ file.path }}</text>
                <text class="project-git-commit-file-row__meta">
                  {{ getStatusPresentation(file.status).label }} · +{{ file.additions }} / -{{ file.deletions }}
                </text>
              </view>
            </view>
            <u-icon name="arrow-right" size="16" color="#c0c4cc"></u-icon>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, ref } from "vue"
import { onLoad } from "@dcloudio/uni-app"
import {
  decodeConnectionContext,
  findStoredConnectionById,
  type ConnectionContext,
} from "@/services/connectionContext"
import {
  buildProjectGitDiffRoute,
  formatGitDateTime,
  getGitFileStatusPresentation,
  getGitFileToneColor,
  parseProjectGitCommitRoute,
  type GitLogEntry,
  type GitLogFileChange,
} from "@/services/projectGit"

const currentInstance = getCurrentInstance()
const upThemeVars = computed(() => currentInstance?.proxy?.upThemeVars || {})
const upThemePageStyle = computed(() => currentInstance?.proxy?.upThemePageStyle || {})
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})

const connection = ref<ConnectionContext | null>(null)
const folderId = ref(0)
const projectName = ref("")
const projectPath = ref("")
const commitEntry = ref<GitLogEntry | null>(null)

onLoad((options) => {
  connection.value =
    findStoredConnectionById(String(options?.connectionId || "")) ||
    decodeConnectionContext(options?.connection as string)
  folderId.value = Number(options?.folderId || 0)
  projectName.value = decodeURIComponent(String(options?.projectName || "").trim())
  projectPath.value = decodeURIComponent(String(options?.projectPath || "").trim())
  commitEntry.value = parseProjectGitCommitRoute(options?.commit)
})

function openCommitDiff(file: GitLogFileChange) {
  if (!connection.value || !commitEntry.value) return
  uni.navigateTo({
    url: buildProjectGitDiffRoute({
      connectionId: connection.value.id,
      folderId: folderId.value,
      projectName: projectName.value,
      projectPath: projectPath.value,
      filePath: file.path,
      fileStatus: file.status,
      mode: "commit",
      commitHash: commitEntry.value.full_hash,
      commitMessage: commitEntry.value.message,
    }),
  })
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
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
}

.project-git-commit-page {
  background: var(--up-page-bg-color, var(--up-bg-color, #f3f4f6));
}

.project-git-commit-shell {
  padding: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.project-git-commit-card,
.project-git-commit-files,
.project-git-commit-state {
  padding: 28rpx;
  border-radius: 30rpx;
  background: var(--up-card-bg-color, #ffffff);
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.project-git-commit-card {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.project-git-commit-card__eyebrow {
  font-size: 20rpx;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--up-primary, #2979ff);
}

.project-git-commit-card__message,
.project-git-commit-files__title,
.project-git-commit-state__title {
  font-size: 34rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.project-git-commit-card__meta,
.project-git-commit-card__path,
.project-git-commit-files__subtitle,
.project-git-commit-state__text,
.project-git-commit-file-row__meta {
  font-size: 24rpx;
  line-height: 1.55;
  color: var(--up-content-color, #606266);
}

.project-git-commit-files__head,
.project-git-commit-file-row,
.project-git-commit-file-row__main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.project-git-commit-file-list {
  margin-top: 20rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.project-git-commit-file-row {
  padding: 18rpx;
  border-radius: 22rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.project-git-commit-file-row--success {
  background: color-mix(in srgb, var(--up-success, #19be6b) 10%, #ffffff 90%);
}

.project-git-commit-file-row--error {
  background: color-mix(in srgb, var(--up-error, #fa3534) 10%, #ffffff 90%);
}

.project-git-commit-file-row--warning {
  background: color-mix(in srgb, var(--up-warning, #f9ae3d) 12%, #ffffff 88%);
}

.project-git-commit-file-row--info {
  background: color-mix(in srgb, var(--up-primary, #2979ff) 10%, #ffffff 90%);
}

.project-git-commit-file-row__main {
  flex: 1;
  min-width: 0;
  justify-content: flex-start;
}

.project-git-commit-file-row__badge {
  width: 96rpx;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.project-git-commit-file-row__status {
  font-size: 22rpx;
  font-weight: 700;
}

.project-git-commit-file-row__copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.project-git-commit-file-row__path {
  font-size: 24rpx;
  color: var(--up-main-color, #303133);
  word-break: break-all;
}

.project-git-commit-empty-row {
  margin-top: 20rpx;
  padding: 18rpx;
  border-radius: 20rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  font-size: 24rpx;
  color: var(--up-content-color, #606266);
}

.project-git-commit-state--error {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
</style>
