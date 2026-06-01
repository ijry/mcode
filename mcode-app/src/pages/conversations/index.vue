<template>
  <view class="page">

    <!-- 无连接 -->
    <view v-if="!hasActiveConnection" class="empty-fullpage">
      <up-empty mode="data" text="请先添加连接">
        <template #bottom>
          <up-button type="primary" @click="goToConnections" size="normal" customStyle="margin-top:32rpx">
            前往添加
          </up-button>
        </template>
      </up-empty>
    </view>

    <view v-else class="main-wrap">

      <!-- 顶部搜索 -->
      <view class="search-bar">
        <up-search
          v-model="searchKeyword"
          placeholder="搜索会话..."
          :show-action="false"
          shape="round"
          @search="() => {}"
          @clear="() => {}"
        ></up-search>
      </view>

      <!-- 空状态 -->
      <view v-if="!loading && projects.length === 0" class="empty-fullpage">
        <up-empty mode="list" text="暂无项目"></up-empty>
      </view>

      <!-- 分类面板 -->
      <up-cate-tab
        v-else
        :tabList="tabList"
        tabKeyName="label"
        mode="tab"
        height="calc(100vh - 120rpx)"
        :current="currentTab"
        @update:current="onTabChange"
      >
        <!-- 左侧 tab 项 -->
        <template #tabItem="slotProps">
          <view v-if="slotProps?.item" class="tab-item">
            <text class="tab-item__name">{{ slotProps.item.label }}</text>
            <view v-if="slotProps.item.count > 0" class="tab-item__badge">{{ slotProps.item.count }}</view>
          </view>
        </template>

        <!-- 右侧顶部：新建按钮 -->
        <template #rightTop="slotProps">
          <view class="right-top-bar">
            <view class="right-top-bar__title">
              {{ getCurrentTabLabel(slotProps?.tabList) }}
            </view>
            <view class="add-btn" @click="createConversation(getCurrentTabProjectId(slotProps?.tabList))">
              <up-icon name="plus" size="18" color="#2979ff"></up-icon>
              <text class="add-btn__label">新建</text>
            </view>
          </view>
        </template>

        <!-- 右侧每个分类的内容 -->
        <template #itemList="slotProps">
          <!-- 无会话 -->
          <view v-if="getConversationList(slotProps?.item).length === 0" class="empty-section">
            <up-empty mode="message" text="暂无会话" iconSize="60"></up-empty>
            <up-button
              type="primary"
              plain
              size="small"
              @click="createConversation(slotProps?.item?.projectId)"
              customStyle="margin-top:24rpx"
            >创建第一个会话</up-button>
          </view>

          <!-- 会话列表 -->
          <view v-else class="conv-list">
            <view
              v-for="conv in getConversationList(slotProps?.item)"
              :key="conv.id"
              class="conv-card"
              @click="openConversation(conv)"
              @longpress="showConversationMenu(conv)"
            >
              <view class="conv-card__icon">
                <up-icon name="chat-fill" size="20" color="#2979ff"></up-icon>
              </view>
              <view class="conv-card__body">
                <text class="conv-card__title u-line-1">{{ conv.title || '未命名会话' }}</text>
                <view class="conv-card__meta">
                  <up-tag
                    :text="formatAgentType(conv.agent_type)"
                    type="info"
                    size="mini"
                    plain
                  ></up-tag>
                  <text class="conv-card__time">{{ formatTime(conv.updated_at) }}</text>
                </view>
              </view>
              <up-icon name="arrow-right" size="14" color="#c0c4cc"></up-icon>
            </view>
          </view>
        </template>
      </up-cate-tab>
    </view>

    <!-- 创建会话底部弹层 -->
    <up-popup v-model:show="showCreateDialog" mode="bottom" :round="20">
      <view class="create-sheet">
        <view class="create-sheet__hd">
          <text class="create-sheet__title">新建会话</text>
          <view class="create-sheet__close" @click="showCreateDialog = false">
            <up-icon name="close" size="20" color="#909399"></up-icon>
          </view>
        </view>

        <view class="form-group">
          <text class="form-label">项目</text>
          <view class="form-readonly" @click="showProjectPicker = true">
            <text class="form-readonly__text">{{ selectedProjectName || '请选择' }}</text>
            <up-icon name="arrow-down" size="14" color="#c0c4cc"></up-icon>
          </view>
        </view>

        <view class="form-group">
          <text class="form-label">智能体</text>
          <view class="form-readonly" @click="showAgentPicker = true">
            <text class="form-readonly__text">{{ selectedAgentName }}</text>
            <up-icon name="arrow-down" size="14" color="#c0c4cc"></up-icon>
          </view>
        </view>

        <view class="form-group">
          <text class="form-label">标题（可选）</text>
          <up-input
            v-model="newConversationTitle"
            placeholder="输入会话标题"
            border="surround"
            shape="circle"
          ></up-input>
        </view>

        <up-button
          type="primary"
          :loading="creating"
          :disabled="!selectedProjectId"
          shape="circle"
          @click="confirmCreate"
          customStyle="margin-top:16rpx"
        >创建会话</up-button>

        <view class="safe-bottom"></view>
      </view>
    </up-popup>

    <!-- 项目 Picker -->
    <up-picker
      :show="showProjectPicker"
      :columns="projectColumns"
      @confirm="onProjectConfirm"
      @cancel="showProjectPicker = false"
    ></up-picker>

    <!-- 智能体 Picker -->
    <up-picker
      :show="showAgentPicker"
      :columns="agentColumns"
      @confirm="onAgentConfirm"
      @cancel="showAgentPicker = false"
    ></up-picker>

    <!-- 会话操作菜单 -->
    <up-action-sheet
      :show="showActionSheet"
      :actions="conversationActions"
      @select="handleActionSelect"
      @close="showActionSheet = false"
    ></up-action-sheet>

    <up-loading-page :loading="loading" loading-text="加载中..."></up-loading-page>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue"
import { onPullDownRefresh } from "@dcloudio/uni-app"
import { useAuthStore } from "@/stores/auth"
import { acpApi } from "@/api/acp"

const auth = useAuthStore()
const loading = ref(false)
const creating = ref(false)
const currentTab = ref(0)
const searchKeyword = ref("")
const showCreateDialog = ref(false)
const showProjectPicker = ref(false)
const showAgentPicker = ref(false)
const showActionSheet = ref(false)
const selectedProjectId = ref<number>(0)
const selectedProjectName = ref("")
const selectedAgentType = ref("claude_code")
const selectedAgentName = ref("Claude Code")
const newConversationTitle = ref("")
const currentConversation = ref<Conversation | null>(null)

interface Project {
  id: number
  name: string
  path: string
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

// up-cate-tab 所需数据结构
const tabList = computed(() => {
  const kw = searchKeyword.value.toLowerCase()
  return projects.value.map((p) => {
    const convs = normalizeList((p as any).conversations).filter(
      (c) => !kw || (c.title || "").toLowerCase().includes(kw)
    )
    return {
      label: p.name || p.path || "未命名项目",
      projectId: p.id,
      count: convs.length,
      conversations: convs,
    }
  })
})

const projectColumns = computed(() => [
  projects.value.map((p) => ({
    text: p.name || p.path || "未命名项目",
    value: p.id,
  })),
])

const agentColumns = ref([
  [
    { text: "Claude Code", value: "claude_code" },
    { text: "Codex CLI",   value: "codex"       },
    { text: "OpenCode",    value: "open_code"   },
    { text: "Gemini CLI",  value: "gemini"      },
    { text: "OpenClaw",    value: "open_claw"   },
    { text: "Cline",       value: "cline"       },
  ],
])

const AGENT_LABELS: Record<string, string> = {
  claude_code: "Claude Code",
  codex:       "Codex CLI",
  open_code:   "OpenCode",
  gemini:      "Gemini CLI",
  open_claw:   "OpenClaw",
  cline:       "Cline",
}

function formatAgentType(t?: string) {
  return t ? (AGENT_LABELS[t] ?? t) : "未知"
}

const conversationActions = [
  { name: "重命名", color: "#2979ff" },
  { name: "删除",   color: "#fa3534" },
]

const hasActiveConnection = computed(() => !!(auth.directBaseUrl || auth.relayUrl))

function onTabChange(idx: number) {
  currentTab.value = idx
}

onMounted(() => {
  if (hasActiveConnection.value) loadData()
})

onPullDownRefresh(() => {
  loadData().finally(() => uni.stopPullDownRefresh())
})

async function loadData() {
  loading.value = true
  try {
    const gateway = auth.gateway()
    const raw = await gateway.call<unknown>("list_all_folder_details")
    const list = normalizeList(raw)

    const withConvs = await Promise.all(
      list.map(async (p: any) => {
        try {
          const rawConvs = await gateway.call<unknown>("list_all_conversations", {
            folderIds: [p.id],
          })
          return { ...p, conversations: normalizeList(rawConvs) }
        } catch {
          return { ...p, conversations: [] }
        }
      })
    )

    projects.value = withConvs
    // 默认展开第一个
    if (withConvs.length > 0) currentTab.value = 0
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    uni.showToast({ title: `加载失败: ${msg}`, icon: "none", duration: 3000 })
  } finally {
    loading.value = false
  }
}

function normalizeList(input: unknown): any[] {
  if (Array.isArray(input)) return input
  if (input && typeof input === "object" && Array.isArray((input as any).data))
    return (input as any).data
  return []
}

function getConversationList(item: any): Conversation[] {
  return normalizeList(item?.conversations) as Conversation[]
}

function getCurrentTabLabel(slotTabList: any): string {
  const list = normalizeList(slotTabList)
  return list[currentTab.value]?.label || ""
}

function getCurrentTabProjectId(slotTabList: any): number | undefined {
  const list = normalizeList(slotTabList)
  const projectId = list[currentTab.value]?.projectId
  return typeof projectId === "number" ? projectId : undefined
}

function goToConnections() {
  uni.switchTab({ url: "/pages/connections/index" })
}

function openConversation(conv: Conversation) {
  uni.navigateTo({
    url: `/pages/conversation-detail/index?id=${conv.id}&folderId=${conv.folder_id}`,
  })
}

function createConversation(projectId?: number) {
  if (projectId) {
    selectedProjectId.value = projectId
    const p = projects.value.find((x) => x.id === projectId)
    selectedProjectName.value = p?.name || p?.path || "未命名项目"
  }
  showCreateDialog.value = true
}

function onProjectConfirm(e: any) {
  const sel = e.value[0]
  selectedProjectId.value = sel.value
  selectedProjectName.value = sel.text
  showProjectPicker.value = false
}

function onAgentConfirm(e: any) {
  const sel = e.value[0]
  selectedAgentType.value = sel.value
  selectedAgentName.value = sel.text
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
    newConversationTitle.value = ""
    selectedAgentType.value = "claude_code"
    selectedAgentName.value = "Claude Code"
    await loadData()
    openConversation({ id: result.id, folder_id: selectedProjectId.value })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    uni.showToast({ title: `创建失败: ${msg}`, icon: "none", duration: 3000 })
  } finally {
    creating.value = false
  }
}

function showConversationMenu(conv: Conversation) {
  currentConversation.value = conv
  showActionSheet.value = true
}

async function handleActionSelect(e: any) {
  if (!currentConversation.value) return
  if (e.name === "删除") {
    uni.showModal({
      title: "确认删除",
      content: "确定要删除这个会话吗？此操作不可恢复。",
      success: async (res) => {
        if (res.confirm) {
          try {
            await acpApi.deleteConversation(currentConversation.value!.id)
            uni.showToast({ title: "删除成功", icon: "success" })
            await loadData()
          } catch (err) {
            uni.showToast({ title: "删除失败", icon: "none" })
          }
        }
      },
    })
  } else if (e.name === "重命名") {
    uni.showModal({
      title: "重命名会话",
      editable: true,
      placeholderText: currentConversation.value.title || "未命名会话",
      success: async (res) => {
        if (res.confirm && res.content) {
          try {
            const gateway = auth.gateway()
            await gateway.call("update_conversation", {
              conversationId: currentConversation.value!.id,
              title: res.content,
            })
            uni.showToast({ title: "重命名成功", icon: "success" })
            await loadData()
          } catch {
            uni.showToast({ title: "重命名失败", icon: "none" })
          }
        }
      },
    })
  }
  showActionSheet.value = false
}

function formatTime(time?: string): string {
  if (!time) return ""
  try {
    const date = new Date(time)
    const diff = Date.now() - date.getTime()
    const min = Math.floor(diff / 60000)
    if (min < 1)  return "刚刚"
    if (min < 60) return `${min}分钟前`
    const h = Math.floor(min / 60)
    if (h < 24)   return `${h}小时前`
    const d = Math.floor(h / 24)
    if (d === 1)  return "昨天"
    if (d < 7)    return `${d}天前`
    return date.toLocaleDateString("zh-CN")
  } catch {
    return ""
  }
}
</script>

<style scoped lang="scss">
.page {
  height: 100vh;
  background-color: #f2f3f5;
  display: flex;
  flex-direction: column;
}

.main-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ===== 搜索栏 ===== */
.search-bar {
  padding: 16rpx 24rpx;
  background-color: #ffffff;
  border-bottom: 1rpx solid #f0f0f0;
  flex-shrink: 0;
}

/* ===== 空状态 ===== */
.empty-fullpage {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-bottom: 100rpx;
}

/* ===== 左侧 Tab 项 ===== */
.tab-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6rpx;
  width: 100%;
  padding: 8rpx 12rpx;
  box-sizing: border-box;
  overflow: hidden;
}

.tab-item__name {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: normal;
  word-break: break-all;
  line-height: 1.35;
  font-size: 24rpx;
  color: inherit;
}

.tab-item__badge {
  font-size: 20rpx;
  color: #2979ff;
  background-color: #e8f0fe;
  border-radius: 20rpx;
  padding: 2rpx 12rpx;
  line-height: 1.4;
}

/* ===== 右侧顶部栏 ===== */
.right-top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 24rpx 16rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.right-top-bar__title {
  font-size: 30rpx;
  font-weight: 600;
  color: #1d1d1f;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.add-btn {
  display: flex;
  align-items: center;
  gap: 6rpx;
  padding: 10rpx 20rpx;
  background-color: #e8f0fe;
  border-radius: 20rpx;
  flex-shrink: 0;

  &:active { background-color: #d0e2fd; }
}

.add-btn__label {
  font-size: 26rpx;
  color: #2979ff;
  font-weight: 500;
}

/* ===== 会话列表 ===== */
.conv-list {
  padding: 16rpx 20rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.conv-card {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 20rpx 16rpx;
  background-color: #ffffff;
  border-radius: 16rpx;
  box-shadow: 0 1rpx 8rpx rgba(0, 0, 0, 0.04);
  transition: transform 0.15s;

  &:active { transform: scale(0.985); }
}

.conv-card__icon {
  width: 64rpx;
  height: 64rpx;
  background-color: #e8f0fe;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.conv-card__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.conv-card__title {
  font-size: 28rpx;
  font-weight: 500;
  color: #1d1d1f;
}

.conv-card__meta {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.conv-card__time {
  font-size: 22rpx;
  color: #c0c4cc;
}

/* ===== 空会话 ===== */
.empty-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60rpx 0;
}

/* ===== 创建弹层 ===== */
.create-sheet {
  padding: 36rpx 32rpx 0;
  background-color: #ffffff;
}

.create-sheet__hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 32rpx;
}

.create-sheet__title {
  font-size: 34rpx;
  font-weight: 600;
  color: #1d1d1f;
}

.create-sheet__close {
  width: 56rpx;
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f5f5f5;
  border-radius: 50%;
}

.form-group {
  margin-bottom: 28rpx;
}

.form-label {
  display: block;
  font-size: 26rpx;
  color: #86909c;
  margin-bottom: 12rpx;
}

.form-readonly {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 24rpx;
  background-color: #f5f6f8;
  border-radius: 50rpx;
}

.form-readonly__text {
  font-size: 28rpx;
  color: #303133;
}

.safe-bottom {
  height: calc(32rpx + env(safe-area-inset-bottom));
}

:deep(.u-cate-tab__view) {
  width: 220rpx !important;
}

:deep(.u-cate-tab__item) {
  height: 120rpx;
  align-items: flex-start;
  justify-content: center;
}
</style>
