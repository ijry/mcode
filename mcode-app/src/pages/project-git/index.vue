<template>
  <view class="page project-git-page" :style="[upThemeVars, upThemePageStyle]">
    <view class="project-git-shell">
      <view class="project-git-header" :style="upThemeCardStyle">
        <view class="project-git-header__copy">
          <text class="project-git-header__eyebrow">PROJECT GIT</text>
          <text class="project-git-header__title">{{ projectName || "Git 管理" }}</text>
          <text class="project-git-header__desc">
            {{ connectionName || "当前连接" }} · {{ gitSummary.branch || "未知分支" }}
          </text>
          <text class="project-git-header__path">{{ projectPath || "未提供项目路径" }}</text>
        </view>
      </view>

      <ProjectGitPanel
        ref="gitPanelRef"
        :connection="connection"
        :folderId="folderId"
        :projectName="projectName"
        :projectPath="projectPath"
        :splitMode="false"
        @summary-change="gitSummary = $event"
      />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, ref } from "vue"
import { onLoad, onPullDownRefresh } from "@dcloudio/uni-app"
import ProjectGitPanel from "@/pages/project-detail/components/ProjectGitPanel.vue"
import {
  decodeConnectionContext,
  findStoredConnectionById,
  type ConnectionContext,
} from "@/services/connectionContext"

type ProjectGitPanelExpose = {
  reload: () => Promise<void> | void
}

const currentInstance = getCurrentInstance()
const upThemeVars = computed(() => currentInstance?.proxy?.upThemeVars || {})
const upThemePageStyle = computed(() => currentInstance?.proxy?.upThemePageStyle || {})
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})

const connection = ref<ConnectionContext | null>(null)
const connectionName = computed(() => connection.value?.name || "")
const folderId = ref(0)
const projectName = ref("")
const projectPath = ref("")
const gitSummary = ref({ branch: null as string | null, changes: 0, commits: 0 })
const gitPanelRef = ref<ProjectGitPanelExpose | null>(null)

onLoad((options) => {
  connection.value =
    findStoredConnectionById(String(options?.connectionId || "")) ||
    decodeConnectionContext(options?.connection as string)
  folderId.value = Number(options?.folderId || 0)
  projectName.value = decodeURIComponent(String(options?.projectName || "").trim())
  projectPath.value = decodeURIComponent(String(options?.projectPath || "").trim())
})

onPullDownRefresh(async () => {
  await Promise.resolve(gitPanelRef.value?.reload())
  uni.stopPullDownRefresh()
})
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

.project-git-header {
  padding: 28rpx;
  border-radius: 24rpx;
  background: var(--up-card-bg-color, #ffffff);
  border: 1rpx solid var(--up-border-color, #dadbde);
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

.project-git-header__title {
  font-size: 34rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.project-git-header__desc,
.project-git-header__path {
  font-size: 24rpx;
  line-height: 1.55;
  color: var(--up-content-color, #606266);
}
</style>
