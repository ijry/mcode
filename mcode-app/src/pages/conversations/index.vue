<template>
  <view class="page">
    <view v-if="!hasActiveConnection" class="empty-container">
      <u-empty mode="data" text="请先添加连接">
        <template #bottom>
          <u-button type="primary" @click="goToConnections" size="normal">
            前往添加
          </u-button>
        </template>
      </u-empty>
    </view>

    <view v-else-if="projects.length === 0" class="empty-container">
      <u-empty mode="list" text="暂无项目" :show="!loading"></u-empty>
    </view>

    <view v-else class="conversation-list">
      <u-collapse v-model="activeNames" accordion>
        <u-collapse-item
          v-for="project in projects"
          :key="project.id"
          :name="String(project.id)"
          :title="project.name || project.path || '未命名项目'"
        >
          <view v-if="project.conversations && project.conversations.length > 0">
            <view
              v-for="conv in project.conversations"
              :key="conv.id"
              class="conversation-item"
              @click="openConversation(conv)"
            >
              <view class="conversation-header">
                <view class="conversation-title">
                  <u-icon name="chat" size="18" color="#2979ff"></u-icon>
                  <text class="title-text">{{ conv.title || "未命名会话" }}</text>
                </view>
                <u-icon name="arrow-right" color="#c0c4cc" size="16"></u-icon>
              </view>
              <view class="conversation-meta">
                <u-tag
                  :text="conv.agent_type || 'unknown'"
                  type="info"
                  size="mini"
                  plain
                ></u-tag>
                <text class="time-text">{{ formatTime(conv.updated_at) }}</text>
              </view>
            </view>
          </view>
          <view v-else class="empty-conversations">
            <text class="empty-text">暂无会话</text>
          </view>
        </u-collapse-item>
      </u-collapse>
    </view>

    <u-loading-page :loading="loading" loading-text="加载中..."></u-loading-page>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue"
import { onPullDownRefresh } from "@dcloudio/uni-app"
import { useAuthStore } from "@/stores/auth"
import { useSessionStore } from "@/stores/session"

const auth = useAuthStore()
const session = useSessionStore()
const loading = ref(false)
const activeNames = ref<string[]>([])

interface Project {
  id: number
  name?: string
  path?: string
  conversations?: Conversation[]
}

interface Conversation {
  id: number
  title?: string
  agent_type?: string
  updated_at?: string
  folder_id?: number
}

const projects = ref<Project[]>([])

const hasActiveConnection = computed(() => {
  return !!(auth.directBaseUrl || auth.relayUrl)
})

onMounted(() => {
  if (hasActiveConnection.value) {
    loadData()
  }
})

onPullDownRefresh(() => {
  loadData().finally(() => {
    uni.stopPullDownRefresh()
  })
})

async function loadData() {
  loading.value = true
  try {
    const gateway = auth.gateway()

    // 加载项目列表
    const projectsResult = await gateway.call<unknown>("list_folders")
    const projectsList = normalizeProjectResponse(projectsResult)

    // 为每个项目加载会话
    const projectsWithConversations = await Promise.all(
      projectsList.map(async (project: any) => {
        try {
          const conversations = await gateway.call<unknown[]>("list_all_conversations", {
            folderIds: [project.id],
          })
          return {
            ...project,
            conversations: conversations || [],
          }
        } catch (error) {
          console.error(`Failed to load conversations for project ${project.id}:`, error)
          return {
            ...project,
            conversations: [],
          }
        }
      })
    )

    projects.value = projectsWithConversations
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    uni.showToast({ title: `加载失败: ${message}`, icon: "none", duration: 3000 })
  } finally {
    loading.value = false
  }
}

function normalizeProjectResponse(input: unknown): any[] {
  if (Array.isArray(input)) {
    return input
  }
  if (input && typeof input === "object" && "data" in input && Array.isArray((input as any).data)) {
    return (input as any).data
  }
  return []
}

function goToConnections() {
  uni.switchTab({
    url: "/pages/connections/index",
  })
}

function openConversation(conv: Conversation) {
  uni.navigateTo({
    url: `/pages/conversation-detail/index?id=${conv.id}&folderId=${conv.folder_id}`,
  })
}

function formatTime(time?: string): string {
  if (!time) return ""
  try {
    const date = new Date(time)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days === 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60))
      if (hours === 0) {
        const minutes = Math.floor(diff / (1000 * 60))
        return minutes === 0 ? "刚刚" : `${minutes}分钟前`
      }
      return `${hours}小时前`
    } else if (days === 1) {
      return "昨天"
    } else if (days < 7) {
      return `${days}天前`
    } else {
      return date.toLocaleDateString("zh-CN")
    }
  } catch {
    return ""
  }
}
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  background-color: #f8f8f8;
}

.empty-container {
  padding-top: 200rpx;
}

.conversation-list {
  padding: 20rpx 0;
}

.conversation-item {
  padding: 30rpx;
  margin: 0 30rpx 20rpx;
  background-color: #ffffff;
  border-radius: 16rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.05);
}

.conversation-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}

.conversation-title {
  display: flex;
  align-items: center;
  gap: 12rpx;
  flex: 1;
}

.title-text {
  font-size: 30rpx;
  font-weight: 500;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-meta {
  display: flex;
  align-items: center;
  gap: 20rpx;
}

.time-text {
  font-size: 24rpx;
  color: #909399;
}

.empty-conversations {
  padding: 40rpx;
  text-align: center;
}

.empty-text {
  font-size: 28rpx;
  color: #909399;
}
</style>
