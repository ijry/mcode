<template>
  <view class="page project-page" :style="[upThemeVars, upThemePageStyle]">
    <view class="project-shell">
      <view class="project-header" :style="upThemeCardStyle">
        <view class="project-header__copy">
          <text class="project-header__eyebrow">PROJECTS</text>
          <text class="project-header__title">{{ connectionName || "项目列表" }}</text>
          <text class="project-header__desc">
            查看当前连接下的项目，以及每个项目的全部会话数和正在进行中的会话数。
          </text>
        </view>
        <view class="project-header__badge">
          <text class="project-header__badge-text">{{ projectItems.length }} 个项目</text>
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

      <view v-else-if="projectItems.length === 0" class="project-state" :style="upThemeCardStyle">
        <text class="project-state__title">暂无项目</text>
        <text class="project-state__text">当前连接还没有可打开的项目。</text>
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
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, ref } from "vue"
import { onLoad, onPullDownRefresh } from "@dcloudio/uni-app"
import {
  decodeConnectionContext,
  findStoredConnectionById,
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

const currentInstance = getCurrentInstance()
const upThemeVars = computed(() => currentInstance?.proxy?.upThemeVars || {})
const upThemePageStyle = computed(() => currentInstance?.proxy?.upThemePageStyle || {})
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})

const loading = ref(false)
const errorMessage = ref("")
const projectItems = ref<ProjectListItem[]>([])
const connection = ref<ConnectionContext | null>(null)
const showProjectActionSheet = ref(false)
const currentProjectAction = ref<ProjectListItem | null>(null)

const connectionName = computed(() => connection.value?.name || "项目列表")
const projectActions = computed(() => [{ name: "Git 管理", color: "#2979ff" }])

onLoad((options) => {
  connection.value =
    findStoredConnectionById(String(options?.connectionId || "")) ||
    decodeConnectionContext(options?.connection as string)
  void loadPage()
})

onPullDownRefresh(() => {
  void loadPage(true)
})

async function loadPage(stopPullDown = false) {
  if (!connection.value) {
    errorMessage.value = "缺少连接信息，请返回连接页重试。"
    if (stopPullDown) uni.stopPullDownRefresh()
    return
  }

  loading.value = true
  errorMessage.value = ""
  try {
    const resolved = await resolveConnectionContext(connection.value)
    connection.value = resolved.connection
    persistResolvedConnection(resolved.connection)
    const projects = await loadRemoteProjects(resolved.gateway)
    projectItems.value = await buildProjectListItems(resolved.instanceKey, projects)
  } catch (error) {
    console.warn("load projects failed", error)
    errorMessage.value = toErrorMessage(error)
    projectItems.value = []
  } finally {
    loading.value = false
    if (stopPullDown) uni.stopPullDownRefresh()
  }
}

function openProjectSessions(item: ProjectListItem) {
  if (!connection.value) return
  const title = encodeURIComponent(item.name)
  uni.navigateTo({
    url: `/pages/sessions/index?connectionId=${encodeURIComponent(connection.value.id)}&folderId=${item.id}&projectName=${title}`,
  })
}

function openProjectActionSheet(item: ProjectListItem) {
  currentProjectAction.value = item
  showProjectActionSheet.value = true
}

function handleProjectActionSelect() {
  const item = currentProjectAction.value
  showProjectActionSheet.value = false
  if (!item || !connection.value) return
  uni.navigateTo({
    url: buildProjectGitRoute({
      connectionId: connection.value.id,
      folderId: item.id,
      projectName: item.name,
      projectPath: item.path,
    }),
  })
}

function retryLoadPage() {
  void loadPage()
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  return "读取项目列表失败"
}
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
}

.project-page {
  background: var(--up-page-bg-color, var(--up-bg-color, #f3f4f6));
}

.project-shell {
  padding: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.project-header,
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

.project-header__badge-text {
  font-size: 22rpx;
  font-weight: 600;
  color: var(--up-primary, #2979ff);
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
</style>
