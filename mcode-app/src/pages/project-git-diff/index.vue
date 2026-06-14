<template>
  <view class="page project-git-diff-page" :style="[upThemeVars, upThemePageStyle]">
    <view class="project-git-diff-shell">
      <view class="project-git-diff-header" :style="upThemeCardStyle">
        <text class="project-git-diff-header__eyebrow">
          {{ diffMode === "commit" ? "COMMIT DIFF" : "WORKSPACE DIFF" }}
        </text>
        <text class="project-git-diff-header__path">{{ filePath || "未知文件" }}</text>
        <text class="project-git-diff-header__meta">
          {{ fileStatus || "--" }}
          <text v-if="diffMode === 'commit' && commitHash"> · {{ shortCommitHash }}</text>
          <text v-else-if="branch"> · {{ branch }}</text>
        </text>
        <text v-if="commitMessage" class="project-git-diff-header__message">{{ commitMessage }}</text>
      </view>

      <view v-if="loading" class="project-git-diff-state" :style="upThemeCardStyle">
        <u-loading-icon mode="circle" size="26" color="#2979ff"></u-loading-icon>
        <text class="project-git-diff-state__text">正在加载 Diff...</text>
      </view>

      <view
        v-else-if="errorMessage"
        class="project-git-diff-state project-git-diff-state--error"
        :style="upThemeCardStyle"
      >
        <text class="project-git-diff-state__title">加载失败</text>
        <text class="project-git-diff-state__text">{{ errorMessage }}</text>
        <view class="project-git-diff-state__action" @click="loadDiff">
          <text>重试</text>
        </view>
      </view>

      <view v-else class="project-git-diff-content" :style="upThemeCardStyle">
        <view class="project-git-diff-content__head">
          <text class="project-git-diff-content__title">Diff 内容</text>
          <view class="project-git-diff-state__action" @click="copyDiff">
            <text>复制</text>
          </view>
        </view>
        <scroll-view scroll-x class="project-git-diff-scroll">
          <view class="project-git-diff-code">
            <text class="project-git-diff-code__text">{{ diffContent || "没有可展示的 Diff 内容。" }}</text>
          </view>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, ref } from "vue"
import { onLoad } from "@dcloudio/uni-app"
import type { CodegGateway } from "@/services/gateway"
import {
  decodeConnectionContext,
  persistResolvedConnection,
  resolveConnectionContext,
  type ConnectionContext,
} from "@/services/connectionContext"
import {
  getRemoteCommitDiff,
  getRemoteWorkspaceDiff,
  type ProjectGitDiffMode,
} from "@/services/projectGit"

const currentInstance = getCurrentInstance()
const upThemeVars = computed(() => currentInstance?.proxy?.upThemeVars || {})
const upThemePageStyle = computed(() => currentInstance?.proxy?.upThemePageStyle || {})
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})

const loading = ref(false)
const errorMessage = ref("")
const connection = ref<ConnectionContext | null>(null)
const resolvedGateway = ref<CodegGateway | null>(null)
const diffMode = ref<ProjectGitDiffMode>("workspace")
const projectPath = ref("")
const filePath = ref("")
const fileStatus = ref("")
const branch = ref("")
const commitHash = ref("")
const commitMessage = ref("")
const diffContent = ref("")

const shortCommitHash = computed(() => commitHash.value.slice(0, 7))

onLoad((options) => {
  connection.value = decodeConnectionContext(options?.connection as string)
  diffMode.value =
    String(options?.mode || "workspace") === "commit" ? "commit" : "workspace"
  projectPath.value = decodeURIComponent(String(options?.projectPath || "").trim())
  filePath.value = decodeURIComponent(String(options?.filePath || "").trim())
  fileStatus.value = decodeURIComponent(String(options?.fileStatus || "").trim())
  branch.value = decodeURIComponent(String(options?.branch || "").trim())
  commitHash.value = decodeURIComponent(String(options?.commitHash || "").trim())
  commitMessage.value = decodeURIComponent(String(options?.commitMessage || "").trim())
  void loadDiff()
})

async function loadDiff() {
  if (!connection.value || !projectPath.value || !filePath.value) {
    errorMessage.value = "缺少 Diff 所需的项目或文件信息。"
    return
  }

  loading.value = true
  errorMessage.value = ""
  try {
    const resolved = await resolveConnectionContext(connection.value)
    connection.value = resolved.connection
    resolvedGateway.value = resolved.gateway
    persistResolvedConnection(resolved.connection)

    diffContent.value =
      diffMode.value === "commit"
        ? await getRemoteCommitDiff(
            resolved.gateway,
            projectPath.value,
            commitHash.value,
            filePath.value
          )
        : await getRemoteWorkspaceDiff(resolved.gateway, projectPath.value, filePath.value)
  } catch (error) {
    console.warn("load project git diff failed", error)
    errorMessage.value = toErrorMessage(error)
    diffContent.value = ""
  } finally {
    loading.value = false
  }
}

function copyDiff() {
  uni.setClipboardData({
    data: diffContent.value,
    success: () => {
      uni.showToast({ title: "已复制", icon: "success" })
    },
    fail: () => {
      uni.showToast({ title: "复制失败", icon: "none" })
    },
  })
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  return "读取 Diff 失败"
}
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
}

.project-git-diff-page {
  background: var(--up-page-bg-color, var(--up-bg-color, #f3f4f6));
}

.project-git-diff-shell {
  padding: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.project-git-diff-header,
.project-git-diff-state,
.project-git-diff-content {
  padding: 28rpx;
  border-radius: 30rpx;
  background: var(--up-card-bg-color, #ffffff);
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.project-git-diff-header {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.project-git-diff-header__eyebrow {
  font-size: 20rpx;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--up-primary, #2979ff);
}

.project-git-diff-header__path,
.project-git-diff-content__title,
.project-git-diff-state__title {
  font-size: 34rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
  word-break: break-all;
}

.project-git-diff-header__meta,
.project-git-diff-header__message,
.project-git-diff-state__text {
  font-size: 24rpx;
  line-height: 1.55;
  color: var(--up-content-color, #606266);
}

.project-git-diff-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14rpx;
  text-align: center;
}

.project-git-diff-state--error {
  align-items: stretch;
}

.project-git-diff-state__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 14rpx 24rpx;
  border-radius: 999rpx;
  background: var(--up-primary, #2979ff);
  color: #ffffff;
  font-size: 22rpx;
  font-weight: 600;
}

.project-git-diff-content__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.project-git-diff-scroll {
  margin-top: 20rpx;
  border-radius: 24rpx;
  overflow: hidden;
}

.project-git-diff-code {
  min-width: 100%;
  padding: 24rpx;
  border-radius: 24rpx;
  background: #101318;
}

.project-git-diff-code__text {
  font-size: 22rpx;
  line-height: 1.6;
  font-family: "Courier New", monospace;
  color: #d7dde8;
  white-space: pre;
}
</style>
