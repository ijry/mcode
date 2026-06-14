<template>
  <view class="page sessions-page" :style="[upThemeVars, upThemePageStyle]">
    <view class="sessions-shell">
      <view class="sessions-header" :style="upThemeCardStyle">
        <view class="sessions-header__copy">
          <text class="sessions-header__eyebrow">SESSIONS</text>
          <text class="sessions-header__title">{{ projectName || "项目会话" }}</text>
          <text class="sessions-header__desc">
            {{ connectionName || "当前连接" }} 下该项目的全部会话列表。
          </text>
        </view>
        <view class="sessions-header__badge">
          <text class="sessions-header__badge-text">{{ sessions.length }} 条会话</text>
        </view>
      </view>

      <view v-if="loading" class="sessions-state" :style="upThemeCardStyle">
        <u-loading-icon mode="circle" size="26" color="#2979ff"></u-loading-icon>
        <text class="sessions-state__text">正在加载项目会话...</text>
      </view>

      <view v-else-if="errorMessage" class="sessions-state sessions-state--error" :style="upThemeCardStyle">
        <text class="sessions-state__title">加载失败</text>
        <text class="sessions-state__text">{{ errorMessage }}</text>
        <view class="sessions-state__action" @click="retryLoadPage">
          <text>重试</text>
        </view>
      </view>

      <view v-else-if="sessions.length === 0" class="sessions-state" :style="upThemeCardStyle">
        <text class="sessions-state__title">暂无会话</text>
        <text class="sessions-state__text">当前项目下还没有会话记录。</text>
      </view>

      <view v-else class="sessions-list">
        <view
          v-for="item in sessions"
          :key="item.id"
          class="session-card"
          :style="upThemeCardStyle"
          @click="openConversation(item)"
        >
          <view class="session-card__main">
            <view class="session-card__head">
              <text class="session-card__title">{{ item.title }}</text>
              <view class="session-card__status" :class="statusClass(item.status)">
                <text class="session-card__status-text">{{ statusText(item.status) }}</text>
              </view>
            </view>

            <view class="session-card__meta">
              <text>{{ agentLabel(item.agentType) }}</text>
              <text>·</text>
              <text>{{ formatDateTime(item.updatedAt) }}</text>
            </view>
          </view>

          <u-icon name="arrow-right" size="16" color="#2979ff"></u-icon>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, ref } from "vue"
import { onLoad, onPullDownRefresh } from "@dcloudio/uni-app"
import {
  decodeConnectionContext,
  encodeConnectionContext,
  persistResolvedConnection,
  resolveConnectionContext,
  type ConnectionContext,
} from "@/services/connectionContext"
import {
  loadRemoteProjectConversations,
  type RemoteConversationRecord,
} from "@/services/projectSessions"

const currentInstance = getCurrentInstance()
const upThemeVars = computed(() => currentInstance?.proxy?.upThemeVars || {})
const upThemePageStyle = computed(() => currentInstance?.proxy?.upThemePageStyle || {})
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})

const loading = ref(false)
const errorMessage = ref("")
const connection = ref<ConnectionContext | null>(null)
const connectionName = computed(() => connection.value?.name || "")
const projectName = ref("")
const folderId = ref(0)
const sessions = ref<RemoteConversationRecord[]>([])

onLoad((options) => {
  connection.value = decodeConnectionContext(options?.connection as string)
  folderId.value = Number(options?.folderId || 0)
  projectName.value = decodeURIComponent(String(options?.projectName || "").trim())
  void loadPage()
})

onPullDownRefresh(() => {
  void loadPage(true)
})

async function loadPage(stopPullDown = false) {
  if (!connection.value || folderId.value <= 0) {
    errorMessage.value = "缺少项目或连接信息，请返回重试。"
    if (stopPullDown) uni.stopPullDownRefresh()
    return
  }

  loading.value = true
  errorMessage.value = ""
  try {
    const resolved = await resolveConnectionContext(connection.value)
    connection.value = resolved.connection
    persistResolvedConnection(resolved.connection)
    sessions.value = await loadRemoteProjectConversations(resolved.gateway, folderId.value)
  } catch (error) {
    console.warn("load project sessions failed", error)
    errorMessage.value = toErrorMessage(error)
    sessions.value = []
  } finally {
    loading.value = false
    if (stopPullDown) uni.stopPullDownRefresh()
  }
}

function openConversation(item: RemoteConversationRecord) {
  if (!connection.value) return
  const encodedConnection = encodeConnectionContext(connection.value)
  uni.navigateTo({
    url: `/pages/conversation-detail/index?id=${item.id}&folderId=${item.folderId || folderId.value}&connectionKey=${encodedConnection}`,
  })
}

function retryLoadPage() {
  void loadPage()
}

function statusText(status: string) {
  if (status === "in_progress") return "进行中"
  if (status === "pending_review") return "待确认"
  if (status === "completed") return "已完成"
  if (status === "failed") return "失败"
  if (status === "cancelled") return "已取消"
  return "未知"
}

function statusClass(status: string) {
  return `session-card__status--${status || "unknown"}`
}

function agentLabel(agentType: string) {
  const key = String(agentType || "").trim().toLowerCase()
  if (key === "claude_code") return "Claude Code"
  if (key === "codex") return "Codex"
  if (key === "gemini") return "Gemini"
  if (key === "cline") return "Cline"
  if (key === "open_code") return "OpenCode"
  if (key === "open_claw") return "OpenClaw"
  return key || "AI"
}

function formatDateTime(value: string) {
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return "刚刚"
  const date = new Date(timestamp)
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  const hours = `${date.getHours()}`.padStart(2, "0")
  const minutes = `${date.getMinutes()}`.padStart(2, "0")
  return `${month}-${day} ${hours}:${minutes}`
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  return "读取项目会话失败"
}
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
}

.sessions-page {
  background: var(--up-page-bg-color, var(--up-bg-color, #f3f4f6));
}

.sessions-shell {
  padding: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.sessions-header,
.sessions-state,
.session-card {
  border-radius: 30rpx;
  background: var(--up-card-bg-color, #ffffff);
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.sessions-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20rpx;
  padding: 30rpx;
}

.sessions-header__copy {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  min-width: 0;
}

.sessions-header__eyebrow {
  font-size: 20rpx;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--up-primary, #2979ff);
}

.sessions-header__title {
  font-size: 36rpx;
  line-height: 1.2;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.sessions-header__desc,
.sessions-state__text,
.session-card__meta {
  font-size: 24rpx;
  line-height: 1.55;
  color: var(--up-content-color, #606266);
}

.sessions-header__badge {
  flex-shrink: 0;
  padding: 14rpx 18rpx;
  border-radius: 999rpx;
  background: rgba(41, 121, 255, 0.12);
}

.sessions-header__badge-text {
  font-size: 22rpx;
  font-weight: 600;
  color: var(--up-primary, #2979ff);
}

.sessions-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14rpx;
  padding: 56rpx 32rpx;
  text-align: center;
}

.sessions-state--error {
  align-items: stretch;
}

.sessions-state__title {
  font-size: 30rpx;
  line-height: 1.3;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.sessions-state__action {
  align-self: center;
  margin-top: 8rpx;
  padding: 16rpx 30rpx;
  border-radius: 999rpx;
  background: var(--up-primary, #2979ff);
  color: #ffffff;
  font-size: 24rpx;
  font-weight: 600;
}

.sessions-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.session-card {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 24rpx;
}

.session-card__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.session-card__head {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.session-card__title {
  flex: 1;
  min-width: 0;
  font-size: 28rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-card__meta {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.session-card__status {
  flex-shrink: 0;
  padding: 8rpx 14rpx;
  border-radius: 999rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.session-card__status-text {
  font-size: 20rpx;
  font-weight: 700;
  color: var(--up-tips-color, #909193);
}

.session-card__status--in_progress {
  background: rgba(52, 199, 89, 0.14);
}

.session-card__status--in_progress .session-card__status-text {
  color: #34c759;
}

.session-card__status--pending_review {
  background: rgba(255, 149, 0, 0.14);
}

.session-card__status--pending_review .session-card__status-text {
  color: #ff9500;
}

.session-card__status--failed {
  background: rgba(255, 59, 48, 0.14);
}

.session-card__status--failed .session-card__status-text {
  color: #ff3b30;
}
</style>
