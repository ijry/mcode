<template>
  <view class="project-folder-list" :class="{ 'project-folder-list--embedded': embedded }">
    <view v-if="!embedded" class="project-header" :style="upThemeCardStyle">
      <view class="project-header__copy">
        <text class="project-header__eyebrow">PROJECTS</text>
        <text class="project-header__title">{{ connectionName || "项目列表" }}</text>
        <text class="project-header__desc">
          查看当前连接下的项目，以及每个项目的全部会话数和正在进行中的会话数。
        </text>
      </view>
      <view class="project-header__actions">
        <view class="project-header__add" @click="openAddProjectBrowser">
          <up-icon name="plus" size="14" :color="upThemeVar('--up-primary', '#2979ff')"></up-icon>
          <text class="project-header__add-text">添加项目</text>
        </view>
        <view class="project-header__badge">
          <text class="project-header__badge-text">{{ projectItems.length }} 个项目</text>
        </view>
      </view>
    </view>

    <view v-else class="project-toolbar" :style="upThemeCardStyle">
      <view class="project-toolbar__main">
        <text class="project-toolbar__title">文件夹</text>
        <text class="project-toolbar__desc">{{ projectItems.length }} 个项目</text>
      </view>
      <view class="project-toolbar__add" @click="openAddProjectBrowser">
        <up-icon name="plus" size="14" :color="upThemeVar('--up-primary', '#2979ff')"></up-icon>
        <text class="project-toolbar__add-text">添加</text>
      </view>
    </view>

    <view v-if="loading" class="project-state" :style="upThemeCardStyle">
      <u-loading-icon mode="circle" size="26" color="#2979ff"></u-loading-icon>
      <text class="project-state__text">正在加载项目列表...</text>
    </view>

    <view v-else-if="errorMessage" class="project-state project-state--error" :style="upThemeCardStyle">
      <text class="project-state__title">加载失败</text>
      <text class="project-state__text">{{ errorMessage }}</text>
      <view class="project-state__action" @click="retryLoadPage">
        <text>重试</text>
      </view>
    </view>

    <view
      v-else-if="projectItems.length === 0"
      class="project-state project-state--add"
      :style="upThemeCardStyle"
      @click="openAddProjectBrowser"
    >
      <view class="project-state__folder">
        <up-icon name="folder" size="26" :color="upThemeVar('--up-primary', '#2979ff')"></up-icon>
      </view>
      <text class="project-state__title">添加文件夹</text>
      <text class="project-state__text">当前连接还没有项目。选择远端目录后即可创建会话。</text>
      <view class="project-state__action">
        <text>选择文件夹</text>
      </view>
    </view>

    <view v-else class="project-list">
      <view
        v-for="item in projectItems"
        :key="item.id"
        class="project-card"
        :style="upThemeCardStyle"
      >
        <view class="project-card__tap" @click="openProjectSessions(item)">
          <view class="project-card__main">
            <text class="project-card__title">{{ item.name }}</text>
            <text class="project-card__path">{{ item.path || "未提供项目路径" }}</text>
          </view>

          <view class="project-card__stats">
            <view class="project-card__stat">
              <text class="project-card__stat-value">{{ item.totalSessions }}</text>
              <text class="project-card__stat-label">会话</text>
            </view>
            <view class="project-card__stat project-card__stat--active">
              <text class="project-card__stat-value">{{ item.activeSessions }}</text>
              <text class="project-card__stat-label">进行中</text>
            </view>
            <u-icon name="arrow-right" size="16" color="#2979ff"></u-icon>
          </view>
        </view>

        <view class="project-card__menu" @click.stop="openProjectActionSheet(item)">
          <u-icon name="more-dot-fill" size="18" color="#c7c7cc"></u-icon>
        </view>
      </view>
    </view>

    <u-action-sheet
      :show="showProjectActionSheet"
      :actions="projectActions"
      @select="handleProjectActionSelect"
      @close="showProjectActionSheet = false"
    ></u-action-sheet>

    <RemoteDirectoryBrowser
      v-model:show="showDirectoryBrowser"
      :gateway="directoryBrowserGateway"
      title="添加项目文件夹"
      @select="handleRemoteFolderSelected"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, ref, watch } from "vue"
import RemoteDirectoryBrowser from "@/components/remote/RemoteDirectoryBrowser.vue"
import {
  persistResolvedConnection,
  resolveConnectionContext,
  type ConnectionContext,
} from "@/services/connectionContext"
import {
  buildProjectListItems,
  loadRemoteProjects,
  type ProjectListItem,
} from "@/services/projectSessions"
import { buildProjectGitRoute } from "@/services/projectGit"
import { buildProjectDetailRoute } from "@/services/projectDetail"
import type { CodegGateway } from "@/services/gateway"
import { openRemoteFolder } from "@/services/remoteDirectoryBrowser"

const props = defineProps<{
  connection: ConnectionContext | null
  embedded?: boolean
}>()

const emit = defineEmits<{
  (event: "resolved", connection: ConnectionContext): void
}>()

const currentInstance = getCurrentInstance()
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

const loading = ref(false)
const errorMessage = ref("")
const projectItems = ref<ProjectListItem[]>([])
const connectionRef = ref<ConnectionContext | null>(props.connection)
const showProjectActionSheet = ref(false)
const showDirectoryBrowser = ref(false)
const directoryBrowserGateway = ref<CodegGateway | null>(null)
const addingProject = ref(false)
const currentProjectAction = ref<ProjectListItem | null>(null)

const embedded = computed(() => Boolean(props.embedded))
const connectionName = computed(() => connectionRef.value?.name || "项目列表")
const projectActions = computed(() => [{ name: "Git 管理", color: "#2979ff" }])
let loadedConnectionKey = ""

watch(
  () => props.connection,
  (next) => {
    const nextKey = connectionIdentityKey(next)
    if (nextKey && nextKey === loadedConnectionKey) {
      connectionRef.value = next
      return
    }
    connectionRef.value = next
    loadedConnectionKey = nextKey
    void loadPage()
  },
  { immediate: true }
)

defineExpose({
  refresh: () => loadPage(),
})

async function loadPage() {
  if (!connectionRef.value) {
    errorMessage.value = "缺少连接信息，请返回连接页重试。"
    projectItems.value = []
    return
  }

  loading.value = true
  errorMessage.value = ""
  try {
    const resolved = await resolveConnectionContext(connectionRef.value)
    connectionRef.value = resolved.connection
    persistResolvedConnection(resolved.connection)
    emit("resolved", resolved.connection)
    const projects = await loadRemoteProjects(resolved.gateway)
    projectItems.value = await buildProjectListItems(resolved.instanceKey, projects)
  } catch (error) {
    console.warn("load projects failed", error)
    errorMessage.value = toErrorMessage(error)
    projectItems.value = []
  } finally {
    loading.value = false
  }
}

function openProjectSessions(item: ProjectListItem) {
  const connectionId = getCurrentConnectionId()
  if (!connectionId) return
  uni.navigateTo({
    url: buildProjectDetailRoute({
      connectionId,
      folderId: item.id,
      projectName: item.name,
      projectPath: item.path,
    }),
  })
}

function openProjectActionSheet(item: ProjectListItem) {
  currentProjectAction.value = item
  showProjectActionSheet.value = true
}

function handleProjectActionSelect() {
  const item = currentProjectAction.value
  showProjectActionSheet.value = false
  const connectionId = getCurrentConnectionId()
  if (!item || !connectionId) return
  uni.navigateTo({
    url: buildProjectGitRoute({
      connectionId,
      folderId: item.id,
      projectName: item.name,
      projectPath: item.path,
    }),
  })
}

function retryLoadPage() {
  void loadPage()
}

function getCurrentConnectionId() {
  const connectionId = String(connectionRef.value?.id || "").trim()
  if (!connectionId) {
    uni.showToast({ title: "缺少连接信息，请返回连接页重试。", icon: "none" })
  }
  return connectionId
}

async function openAddProjectBrowser() {
  if (!connectionRef.value) {
    errorMessage.value = "缺少连接信息，请返回连接页重试。"
    return
  }
  try {
    const resolved = await resolveConnectionContext(connectionRef.value)
    connectionRef.value = resolved.connection
    persistResolvedConnection(resolved.connection)
    emit("resolved", resolved.connection)
    directoryBrowserGateway.value = resolved.gateway
    showDirectoryBrowser.value = true
  } catch (error) {
    uni.showToast({ title: toErrorMessage(error), icon: "none", duration: 3000 })
  }
}

async function handleRemoteFolderSelected(path: string) {
  if (!directoryBrowserGateway.value || addingProject.value) return
  addingProject.value = true
  try {
    await openRemoteFolder(directoryBrowserGateway.value, path)
    showDirectoryBrowser.value = false
    await loadPage()
    uni.showToast({ title: "已添加项目", icon: "success" })
  } catch (error) {
    uni.showToast({ title: toErrorMessage(error), icon: "none", duration: 3000 })
  } finally {
    addingProject.value = false
  }
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  return "读取项目列表失败"
}

function connectionIdentityKey(connection: ConnectionContext | null) {
  if (!connection) return ""
  return [
    connection.id || "",
    connection.targetAgent || "",
    connection.routeMode || "",
    connection.routeMode === "direct"
      ? connection.directBaseUrl || ""
      : connection.gatewayBaseUrl || connection.gatewayProvider || "",
  ].join("::")
}
</script>

<style scoped lang="scss">
.project-folder-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.project-header,
.project-toolbar,
.project-card,
.project-state {
  border-radius: 30rpx;
  background: var(--up-card-bg-color, #ffffff);
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.project-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20rpx;
  padding: 30rpx;
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--up-primary, #2979ff) 13%, var(--up-card-bg-color, #ffffff) 87%),
      var(--up-card-bg-color, #ffffff)
    );
}

.project-header__copy {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  min-width: 0;
}

.project-header__eyebrow {
  font-size: 20rpx;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--up-primary, #2979ff);
}

.project-header__title {
  font-size: 36rpx;
  line-height: 1.2;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.project-header__desc,
.project-toolbar__desc,
.project-card__path,
.project-state__text,
.project-card__stat-label {
  font-size: 24rpx;
  line-height: 1.55;
  color: var(--up-content-color, #606266);
}

.project-header__badge {
  flex-shrink: 0;
  padding: 14rpx 18rpx;
  border-radius: 999rpx;
  background: rgba(41, 121, 255, 0.12);
}

.project-header__actions {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12rpx;
}

.project-header__add,
.project-toolbar__add {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 14rpx 18rpx;
  border-radius: 999rpx;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 10%, var(--up-card-bg-color, #ffffff) 90%);
}

.project-header__add-text,
.project-toolbar__add-text {
  font-size: 22rpx;
  font-weight: 700;
  color: var(--up-primary, #2979ff);
}

.project-header__badge-text {
  font-size: 22rpx;
  font-weight: 600;
  color: var(--up-primary, #2979ff);
}

.project-toolbar {
  padding: 22rpx 24rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.project-toolbar__main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.project-toolbar__title {
  font-size: 30rpx;
  line-height: 1.3;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.project-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.project-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 26rpx 24rpx;
}

.project-card__tap {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}

.project-card__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.project-card__title,
.project-state__title {
  font-size: 30rpx;
  line-height: 1.3;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.project-card__path {
  word-break: break-all;
}

.project-card__stats {
  display: flex;
  align-items: center;
  gap: 18rpx;
  flex-shrink: 0;
}

.project-card__menu {
  width: 56rpx;
  height: 56rpx;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.project-card__stat {
  min-width: 88rpx;
  padding: 14rpx 16rpx;
  border-radius: 22rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  text-align: center;
}

.project-card__stat--active {
  background: rgba(52, 199, 89, 0.12);
}

.project-card__stat-value {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.project-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14rpx;
  padding: 56rpx 32rpx;
  text-align: center;
}

.project-state--error {
  align-items: stretch;
}

.project-state--add {
  cursor: pointer;
}

.project-state__folder {
  width: 82rpx;
  height: 82rpx;
  border-radius: 26rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 10%, var(--up-card-bg-color, #ffffff) 90%);
}

.project-state__action {
  align-self: center;
  margin-top: 8rpx;
  padding: 16rpx 30rpx;
  border-radius: 999rpx;
  background: var(--up-primary, #2979ff);
  color: #ffffff;
  font-size: 24rpx;
  font-weight: 600;
}

@media (max-width: 420px) {
  .project-card__tap,
  .project-header {
    align-items: stretch;
    flex-direction: column;
  }

  .project-card__stats {
    justify-content: flex-end;
  }

  .project-header__actions {
    align-items: flex-start;
  }
}
</style>
