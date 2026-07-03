<template>
  <view class="page project-detail-page" :style="[upThemeVars, upThemePageStyle]">
    <up-status-bar :bg-color="upThemeVar('--up-page-bg-color', '#f3f4f6')"></up-status-bar>
    <view class="project-detail-shell">
      <view class="project-detail-header" :style="upThemeCardStyle">
        <view class="project-detail-header__top">
          <view class="project-detail-header__back" @click="goBack">
            <up-icon
              name="arrow-left"
              size="18"
              :color="upThemeVar('--up-main-color', '#303133')"
            ></up-icon>
          </view>
          <view class="project-detail-header__copy">
            <text class="project-detail-header__eyebrow">PROJECT</text>
            <text class="project-detail-header__title">
              {{ project.projectName || "项目详情" }}
            </text>
            <text class="project-detail-header__path">
              {{ project.projectPath || "未提供项目路径" }}
            </text>
          </view>
        </view>
        <view class="project-detail-header__meta">
          <text>{{ connectionName || "当前连接" }}</text>
          <text>·</text>
          <text>{{ folderIdText }}</text>
          <text v-if="gitSummary.branch">· {{ gitSummary.branch }}</text>
        </view>
      </view>

      <view class="project-detail-tabs" :style="upThemeCardStyle">
        <u-subsection
          :list="tabLabels"
          :current="activeTabIndex"
          :activeColor="upThemeVar('--up-primary', '#2979ff')"
          @change="handleTabChange"
        ></u-subsection>
      </view>

      <ProjectUnsupportedState
        v-if="pageError"
        title="加载失败"
        :text="pageError"
        icon="warning"
        actionText="重试"
        @action="loadConnection"
      />

      <template v-else>
        <ProjectFilesPanel
          v-if="activeTab === 'files'"
          :gateway="resolvedGateway"
          :projectPath="project.projectPath"
          :unsupportedText="workspaceUnsupported"
        />
        <ProjectGitPanel
          v-else-if="activeTab === 'git'"
          :connection="connection"
          :folderId="project.folderId"
          :projectName="project.projectName"
          :projectPath="project.projectPath"
          :splitMode="true"
          @summary-change="gitSummary = $event"
        />
        <ProjectSessionsPanel
          v-else-if="activeTab === 'sessions'"
          :connection="connection"
          :folderId="project.folderId"
          :projectName="project.projectName"
          @count-change="sessionCount = $event"
        />
        <ProjectTerminalPanel
          v-else-if="activeTab === 'terminal'"
          :gateway="resolvedGateway"
          :projectPath="project.projectPath"
          :unsupportedText="workspaceUnsupported"
        />
        <ProjectTodosPanel
          v-else
          :connectionId="project.connectionId"
          :folderId="project.folderId"
          :projectName="project.projectName"
        />
      </template>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, ref } from "vue"
import { onLoad } from "@dcloudio/uni-app"
import ProjectFilesPanel from "./components/ProjectFilesPanel.vue"
import ProjectGitPanel from "./components/ProjectGitPanel.vue"
import ProjectSessionsPanel from "./components/ProjectSessionsPanel.vue"
import ProjectTerminalPanel from "./components/ProjectTerminalPanel.vue"
import ProjectTodosPanel from "./components/ProjectTodosPanel.vue"
import ProjectUnsupportedState from "./components/ProjectUnsupportedState.vue"
import type { CodegGateway } from "@/services/gateway"
import {
  findStoredConnectionById,
  persistResolvedConnection,
  resolveConnectionContext,
  type ConnectionContext,
} from "@/services/connectionContext"
import {
  isWorkspaceCapableConnection,
  parseProjectDetailRouteOptions,
  workspaceUnsupportedText,
  type ProjectDetailRouteContext,
} from "@/services/projectDetail"

type ProjectDetailTab = "files" | "git" | "sessions" | "terminal" | "todos"

const currentInstance = getCurrentInstance()
const upThemeVars = computed(() => currentInstance?.proxy?.upThemeVars || {})
const upThemePageStyle = computed(() => currentInstance?.proxy?.upThemePageStyle || {})
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (name: string, fallback: string) =>
  currentInstance?.proxy?.upThemeVar?.(name, fallback) ?? `var(${name}, ${fallback})`

const tabs = [
  { key: "files", label: "文件" },
  { key: "git", label: "Git" },
  { key: "sessions", label: "会话" },
  { key: "terminal", label: "终端" },
  { key: "todos", label: "待办" },
] as const

const activeTab = ref<ProjectDetailTab>("files")
const project = ref<ProjectDetailRouteContext>({
  connectionId: "",
  folderId: 0,
  projectName: "",
  projectPath: "",
})
const connection = ref<ConnectionContext | null>(null)
const resolvedGateway = ref<CodegGateway | null>(null)
const pageError = ref("")
const sessionCount = ref(0)
const gitSummary = ref({ branch: null as string | null, changes: 0, commits: 0 })

const connectionName = computed(() => connection.value?.name || "")
const tabLabels = computed(() => tabs.map((tab) => tab.label))
const activeTabIndex = computed(() => {
  const index = tabs.findIndex((tab) => tab.key === activeTab.value)
  return index >= 0 ? index : 0
})
const folderIdText = computed(() =>
  project.value.folderId > 0 ? `项目 #${project.value.folderId}` : "未知项目"
)
const workspaceUnsupported = computed(() => {
  if (!project.value.projectPath) return "当前项目缺少路径，无法使用项目文件、Git 和终端功能。"
  return workspaceUnsupportedText(connection.value)
})

onLoad((options) => {
  project.value = parseProjectDetailRouteOptions(options as Record<string, unknown>)
  connection.value = findStoredConnectionById(project.value.connectionId)
  void loadConnection()
})

async function loadConnection() {
  pageError.value = ""
  if (!project.value.connectionId || project.value.folderId <= 0) {
    pageError.value = "缺少项目或连接信息，请返回项目列表重试。"
    return
  }
  if (!connection.value) {
    pageError.value = "缺少连接信息，请返回连接页重试。"
    return
  }
  try {
    const resolved = await resolveConnectionContext(connection.value)
    connection.value = resolved.connection
    resolvedGateway.value = resolved.gateway
    persistResolvedConnection(resolved.connection)
    if (!isWorkspaceCapableConnection(resolved.connection) && activeTab.value !== "todos") {
      activeTab.value = "sessions"
    }
  } catch (error) {
    pageError.value = toErrorMessage(error)
  }
}

function goBack() {
  uni.navigateBack({ delta: 1 })
}

function handleTabChange(index: number) {
  const nextTab = tabs[index]?.key
  if (nextTab) {
    activeTab.value = nextTab
  }
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  if (typeof error === "string" && error.trim()) return error.trim()
  return "加载项目详情失败"
}
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
}

.project-detail-page {
  background: var(--up-page-bg-color, var(--up-bg-color, #f3f4f6));
}

.project-detail-shell {
  padding: 20rpx 24rpx 40rpx;
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.project-detail-header,
.project-detail-tabs {
  border-radius: 24rpx;
  background: var(--up-card-bg-color, #ffffff);
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.project-detail-header {
  padding: 24rpx;
}

.project-detail-header__top {
  display: flex;
  align-items: flex-start;
  gap: 18rpx;
}

.project-detail-header__back {
  width: 60rpx;
  height: 60rpx;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.project-detail-header__copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.project-detail-header__eyebrow {
  font-size: 20rpx;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--up-primary, #2979ff);
}

.project-detail-header__title {
  font-size: 34rpx;
  font-weight: 700;
  line-height: 1.2;
  color: var(--up-main-color, #303133);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-detail-header__path,
.project-detail-header__meta {
  font-size: 24rpx;
  line-height: 1.5;
  color: var(--up-content-color, #606266);
}

.project-detail-header__path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-detail-header__meta {
  display: flex;
  align-items: center;
  gap: 10rpx;
  margin-top: 16rpx;
  flex-wrap: wrap;
}

.project-detail-tabs {
  padding: 10rpx;
}

@media (max-width: 360px) {
  .project-detail-shell {
    padding-left: 16rpx;
    padding-right: 16rpx;
  }

  .project-detail-tabs {
    padding: 8rpx;
  }
}
</style>
