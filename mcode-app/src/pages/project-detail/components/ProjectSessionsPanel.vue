<template>
  <view class="project-sessions-panel">
    <ProjectUnsupportedState
      v-if="!resolvedConnection || props.folderId <= 0"
      title="缺少项目信息"
      text="请返回项目列表重新进入。"
      icon="warning"
    />

    <view v-else-if="loading" class="project-sessions-state" :style="upThemeCardStyle">
      <u-loading-icon
        mode="circle"
        size="26"
        :color="upThemeVar('--up-primary', '#2979ff')"
      ></u-loading-icon>
      <text class="project-sessions-state__text">正在加载项目会话...</text>
    </view>

    <ProjectUnsupportedState
      v-else-if="errorMessage"
      title="加载失败"
      :text="errorMessage"
      icon="warning"
      actionText="重试"
      @action="loadPage"
    />

    <ProjectUnsupportedState
      v-else-if="sessions.length === 0"
      title="暂无会话"
      text="当前项目下还没有会话记录。"
      icon="chat"
    />

    <view v-else class="project-sessions-list">
      <view
        v-for="item in sessions"
        :key="item.id"
        class="project-session-card"
        :style="upThemeCardStyle"
        @click="openConversation(item)"
      >
        <view class="project-session-card__main">
          <view class="project-session-card__head">
            <text class="project-session-card__title">{{ item.title }}</text>
            <view class="project-session-card__status" :class="statusClass(item.status)">
              <text class="project-session-card__status-text">{{ statusText(item.status) }}</text>
            </view>
          </view>

          <view class="project-session-card__meta">
            <text>{{ agentLabel(item.agentType) }}</text>
            <text>·</text>
            <text>{{ formatDateTime(item.updatedAt) }}</text>
          </view>
        </view>

        <u-icon
          name="arrow-right"
          size="16"
          :color="upThemeVar('--up-primary', '#2979ff')"
        ></u-icon>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, ref, watch } from "vue"
import ProjectUnsupportedState from "./ProjectUnsupportedState.vue"
import {
  persistResolvedConnection,
  resolveConnectionContext,
  type ConnectionContext,
} from "@/services/connectionContext"
import { ensureConversationTab } from "@/services/conversation/pcTabSyncService"
import {
  loadRemoteProjectConversations,
  type RemoteConversationRecord,
} from "@/services/projectSessions"

const props = defineProps<{
  connection: ConnectionContext | null
  folderId: number
  projectName: string
}>()

const emit = defineEmits<{
  (event: "count-change", count: number): void
}>()

const currentInstance = getCurrentInstance()
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (name: string, fallback: string) =>
  currentInstance?.proxy?.upThemeVar?.(name, fallback) ?? `var(${name}, ${fallback})`

const loading = ref(false)
const errorMessage = ref("")
const sessions = ref<RemoteConversationRecord[]>([])
const resolvedConnection = ref<ConnectionContext | null>(props.connection)

watch(
  () => props.connection,
  (next) => {
    resolvedConnection.value = next
  }
)

watch(
  () => [props.connection?.id || "", props.folderId],
  () => {
    void loadPage()
  },
  { immediate: true }
)

watch(
  () => sessions.value.length,
  (count) => {
    emit("count-change", count)
  },
  { immediate: true }
)

async function loadPage() {
  if (!resolvedConnection.value || props.folderId <= 0) {
    errorMessage.value = "缺少项目或连接信息，请返回重试。"
    sessions.value = []
    return
  }

  loading.value = true
  errorMessage.value = ""
  try {
    const resolved = await resolveConnectionContext(resolvedConnection.value)
    resolvedConnection.value = resolved.connection
    persistResolvedConnection(resolved.connection)
    sessions.value = await loadRemoteProjectConversations(resolved.gateway, props.folderId)
  } catch (error) {
    console.warn("load project sessions failed", error)
    errorMessage.value = toErrorMessage(error)
    sessions.value = []
  } finally {
    loading.value = false
  }
}

async function openConversation(item: RemoteConversationRecord) {
  if (!resolvedConnection.value) return
  const targetFolderId = Number(item.folderId || props.folderId)
  if (targetFolderId > 0 && Number(item.id || 0) > 0) {
    try {
      const resolved = await resolveConnectionContext(resolvedConnection.value)
      resolvedConnection.value = resolved.connection
      persistResolvedConnection(resolved.connection)
      await ensureConversationTab({
        instanceKey: resolved.gateway.getRemoteInstanceDescriptor().instanceKey,
        gateway: resolved.gateway,
        folderId: targetFolderId,
        conversationId: Number(item.id || 0),
        agentType: item.agentType,
        activation: "allow",
        origin: "mcode-mobile-open",
      })
    } catch (error) {
      console.warn("ensure conversation tab before open skipped", error)
    }
  }
  const connectionId = String(resolvedConnection.value.id || "").trim()
  if (!connectionId) {
    uni.showToast({ title: "缺少连接信息，请返回连接页重试。", icon: "none" })
    return
  }
  const encodedConnectionId = encodeURIComponent(connectionId)
  uni.navigateTo({
    url: `/pages/conversation-detail/index?id=${item.id}&folderId=${item.folderId || props.folderId}&connectionId=${encodedConnectionId}`,
  })
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
  return `project-session-card__status--${status || "unknown"}`
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

defineExpose({ reload: loadPage })
</script>

<style scoped lang="scss">
.project-sessions-panel {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.project-sessions-state,
.project-session-card {
  border-radius: 24rpx;
  background: var(--up-card-bg-color, #ffffff);
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.project-sessions-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14rpx;
  padding: 48rpx 32rpx;
  text-align: center;
}

.project-sessions-state__text,
.project-session-card__meta {
  font-size: 24rpx;
  line-height: 1.55;
  color: var(--up-content-color, #606266);
}

.project-sessions-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.project-session-card {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 24rpx;
}

.project-session-card__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.project-session-card__head {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.project-session-card__title {
  flex: 1;
  min-width: 0;
  font-size: 28rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-session-card__meta {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.project-session-card__status {
  flex-shrink: 0;
  padding: 8rpx 14rpx;
  border-radius: 999rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.project-session-card__status-text {
  font-size: 20rpx;
  font-weight: 700;
  color: var(--up-tips-color, #909193);
}

.project-session-card__status--in_progress {
  background: rgba(52, 199, 89, 0.14);
}

.project-session-card__status--in_progress .project-session-card__status-text {
  color: #34c759;
}

.project-session-card__status--pending_review {
  background: rgba(255, 149, 0, 0.14);
}

.project-session-card__status--pending_review .project-session-card__status-text {
  color: #ff9500;
}

.project-session-card__status--failed {
  background: rgba(255, 59, 48, 0.14);
}

.project-session-card__status--failed .project-session-card__status-text {
  color: #ff3b30;
}
</style>
