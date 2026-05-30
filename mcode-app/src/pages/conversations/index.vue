<template>
  <view class="page">
    <!-- 搜索栏 -->
    <view v-if="hasActiveConnection" class="search-bar">
      <u-search
        v-model="searchKeyword"
        placeholder="搜索会话..."
        :show-action="false"
        @search="handleSearch"
        @clear="handleSearch"
      ></u-search>
    </view>

    <view v-if="!hasActiveConnection" class="empty-container">
      <u-empty mode="data" text="请先添加连接">
        <template #bottom>
          <u-button type="primary" @click="goToConnections" size="normal">
            前往添加
          </u-button>
        </template>
      </u-empty>
    </view>

    <view v-else-if="filteredProjects.length === 0" class="empty-container">
      <u-empty
        mode="list"
        :text="searchKeyword ? '未找到匹配的会话' : '暂无项目'"
        :show="!loading"
      ></u-empty>
    </view>

    <view v-else class="conversation-list">
      <u-collapse v-model="activeNames" accordion>
        <u-collapse-item
          v-for="project in filteredProjects"
          :key="project.id"
          :name="String(project.id)"
          :title="project.name || project.path || '未命名项目'"
        >
          <template #right>
            <u-button
              size="mini"
              type="primary"
              plain
              @click.stop="createConversation(project.id)"
            >
              <u-icon name="plus" size="14"></u-icon>
            </u-button>
          </template>

          <view v-if="project.conversations && project.conversations.length > 0">
            <view
              v-for="conv in project.conversations"
              :key="conv.id"
              class="conversation-item"
              @click="openConversation(conv)"
              @longpress="showConversationMenu(conv)"
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
            <u-button
              size="small"
              type="primary"
              plain
              @click="createConversation(project.id)"
            >
              创建会话
            </u-button>
          </view>
        </u-collapse-item>
      </u-collapse>
    </view>

    <!-- 浮动创建按钮 -->
    <view v-if="hasActiveConnection && projects.length > 0" class="fab-button">
      <u-button
        type="primary"
        shape="circle"
        size="large"
        @click="showCreateDialog = true"
      >
        <u-icon name="plus" size="24" color="#ffffff"></u-icon>
      </u-button>
    </view>

    <!-- 创建会话对话框 -->
    <u-popup v-model:show="showCreateDialog" mode="center" :round="10">
      <view class="create-dialog">
        <view class="dialog-title">创建新会话</view>

        <view class="form-item">
          <text class="form-label">选择项目</text>
          <u-picker
            :show="showProjectPicker"
            :columns="projectColumns"
            @confirm="onProjectConfirm"
            @cancel="showProjectPicker = false"
          ></u-picker>
          <u-input
            v-model="selectedProjectName"
            placeholder="请选择项目"
            readonly
            @click="showProjectPicker = true"
          ></u-input>
        </view>

        <view class="form-item">
          <text class="form-label">选择智能体</text>
          <u-picker
            :show="showAgentPicker"
            :columns="agentColumns"
            @confirm="onAgentConfirm"
            @cancel="showAgentPicker = false"
          ></u-picker>
          <u-input
            v-model="selectedAgentName"
            placeholder="请选择智能体"
            readonly
            @click="showAgentPicker = true"
          ></u-input>
        </view>

        <view class="form-item">
          <text class="form-label">会话标题（可选）</text>
          <u-input v-model="newConversationTitle" placeholder="输入会话标题"></u-input>
        </view>

        <view class="dialog-actions">
          <u-button @click="showCreateDialog = false">取消</u-button>
          <u-button type="primary" @click="confirmCreate" :loading="creating">
            创建
          </u-button>
        </view>
      </view>
    </u-popup>

    <!-- 会话操作菜单 -->
    <u-action-sheet
      :show="showActionSheet"
      :actions="conversationActions"
      @select="handleActionSelect"
      @close="showActionSheet = false"
    ></u-action-sheet>

    <u-loading-page :loading="loading" loading-text="加载中..."></u-loading-page>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue"
import { onPullDownRefresh } from "@dcloudio/uni-app"
import { useAuthStore } from "@/stores/auth"
import { useSessionStore } from "@/stores/session"
import { acpApi } from "@/api/acp"

const auth = useAuthStore()
const session = useSessionStore()
const loading = ref(false)
const creating = ref(false)
const activeNames = ref<string[]>([])
const searchKeyword = ref("")
const showCreateDialog = ref(false)
const showProjectPicker = ref(false)
const showAgentPicker = ref(false)
const showActionSheet = ref(false)
const selectedProjectId = ref<number>(0)
const selectedProjectName = ref("")
const selectedAgentType = ref("general")
const selectedAgentName = ref("通用助手")
const newConversationTitle = ref("")
const currentConversation = ref<Conversation | null>(null)

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

const projectColumns = computed(() => [
  projects.value.map((p) => ({
    text: p.name || p.path || "未命名项目",
    value: p.id,
  })),
])

const agentColumns = ref([
  [
    { text: "通用助手", value: "general" },
    { text: "代码助手", value: "code" },
    { text: "写作助手", value: "writing" },
    { text: "分析助手", value: "analysis" },
  ],
])

const conversationActions = ref([
  { name: "重命名", color: "#2979ff" },
  { name: "删除", color: "#fa3534" },
])

const hasActiveConnection = computed(() => {
  return !!(auth.directBaseUrl || auth.relayUrl)
})

const filteredProjects = computed(() => {
  if (!searchKeyword.value) return projects.value

  return projects.value
    .map((project) => ({
      ...project,
      conversations: project.conversations?.filter((conv) =>
        conv.title?.toLowerCase().includes(searchKeyword.value.toLowerCase())
      ),
    }))
    .filter((project) => project.conversations && project.conversations.length > 0)
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

function handleSearch() {
  // 搜索逻辑已在 computed 中实现
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

function createConversation(projectId: number) {
  selectedProjectId.value = projectId
  const project = projects.value.find((p) => p.id === projectId)
  selectedProjectName.value = project?.name || project?.path || "未命名项目"
  showCreateDialog.value = true
}

function onProjectConfirm(e: any) {
  const selected = e.value[0]
  selectedProjectId.value = selected.value
  selectedProjectName.value = selected.text
  showProjectPicker.value = false
}

function onAgentConfirm(e: any) {
  const selected = e.value[0]
  selectedAgentType.value = selected.value
  selectedAgentName.value = selected.text
  showAgentPicker.value = false
}

async function confirmCreate() {
  if (!selectedProjectId.value) {
    uni.showToast({ title: "请选择项目", icon: "none" })
    return
  }

  creating.value = true
  try {
    const result = await acpApi.createConversation(
      selectedProjectId.value,
      selectedAgentType.value,
      newConversationTitle.value || undefined
    )

    uni.showToast({ title: "创建成功", icon: "success" })
    showCreateDialog.value = false

    // 重置表单
    newConversationTitle.value = ""
    selectedAgentType.value = "general"
    selectedAgentName.value = "通用助手"

    // 刷新列表
    await loadData()

    // 打开新创建的会话
    openConversation({
      id: result.id,
      folder_id: selectedProjectId.value,
      title: result.title,
      agent_type: result.agentType,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    uni.showToast({ title: `创建失败: ${message}`, icon: "none", duration: 3000 })
  } finally {
    creating.value = false
  }
}

function showConversationMenu(conv: Conversation) {
  currentConversation.value = conv
  showActionSheet.value = true
}

async function handleActionSelect(e: any) {
  const action = e.name
  if (!currentConversation.value) return

  if (action === "删除") {
    uni.showModal({
      title: "确认删除",
      content: "确定要删除这个会话吗？此操作不可恢复。",
      success: async (res) => {
        if (res.confirm) {
          await deleteConversation(currentConversation.value!.id)
        }
      },
    })
  } else if (action === "重命名") {
    uni.showModal({
      title: "重命名会话",
      editable: true,
      placeholderText: currentConversation.value.title || "未命名会话",
      success: async (res) => {
        if (res.confirm && res.content) {
          await renameConversation(currentConversation.value!.id, res.content)
        }
      },
    })
  }

  showActionSheet.value = false
}

async function deleteConversation(conversationId: number) {
  try {
    await acpApi.deleteConversation(conversationId)
    uni.showToast({ title: "删除成功", icon: "success" })
    await loadData()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    uni.showToast({ title: `删除失败: ${message}`, icon: "none", duration: 3000 })
  }
}

async function renameConversation(conversationId: number, newTitle: string) {
  try {
    const gateway = auth.gateway()
    await gateway.call("update_conversation", {
      conversationId,
      title: newTitle,
    })
    uni.showToast({ title: "重命名成功", icon: "success" })
    await loadData()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    uni.showToast({ title: `重命名失败: ${message}`, icon: "none", duration: 3000 })
  }
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

.search-bar {
  padding: 20rpx 30rpx;
  background-color: #ffffff;
  border-bottom: 1rpx solid #e4e7ed;
}

.empty-container {
  padding-top: 200rpx;
}

.conversation-list {
  padding: 20rpx 0 120rpx;
}

.conversation-item {
  padding: 30rpx;
  margin: 0 30rpx 20rpx;
  background-color: #ffffff;
  border-radius: 16rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.05);
  transition: transform 0.2s;

  &:active {
    transform: scale(0.98);
  }
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
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20rpx;
}

.empty-text {
  font-size: 28rpx;
  color: #909399;
}

.fab-button {
  position: fixed;
  right: 60rpx;
  bottom: 120rpx;
  z-index: 999;
  box-shadow: 0 4rpx 20rpx rgba(41, 121, 255, 0.4);
  border-radius: 50%;
}

.create-dialog {
  width: 600rpx;
  padding: 40rpx;
  background-color: #ffffff;
  border-radius: 20rpx;
}

.dialog-title {
  font-size: 36rpx;
  font-weight: 600;
  color: #303133;
  margin-bottom: 40rpx;
  text-align: center;
}

.form-item {
  margin-bottom: 30rpx;
}

.form-label {
  display: block;
  font-size: 28rpx;
  color: #606266;
  margin-bottom: 16rpx;
}

.dialog-actions {
  display: flex;
  gap: 20rpx;
  margin-top: 40rpx;

  button {
    flex: 1;
  }
}
</style>
