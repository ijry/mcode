<template>
  <view class="page">
    <!-- 加载状态 -->
    <view v-if="loading" class="loading-container">
      <up-loading-page :loading="loading" loading-text="加载中..."></up-loading-page>
    </view>

    <!-- 会话不存在 -->
    <view v-else-if="!conversationId" class="empty-container">
      <up-empty mode="data" text="会话不存在"></up-empty>
    </view>

    <!-- 主内容 -->
    <view v-else class="detail-container">

      <!-- 顶部工具栏 -->
      <view class="toolbar">
        <AgentSelector v-model="selectedAgent" @change="handleAgentChange" />
        <view class="toolbar-right">
          <ExpertMenu @select="handleCommandSelect" />
          <view class="icon-btn" @click="chooseImage">
            <up-icon name="photo" size="20" color="#606266"></up-icon>
          </view>
          <view
            v-if="runtimeStatus === 'thinking'"
            class="icon-btn icon-btn--danger"
            @click="cancelGeneration"
          >
            <up-icon name="close-circle" size="20" color="#fa3534"></up-icon>
          </view>
        </view>
      </view>

      <!-- 消息列表 -->
      <scroll-view
        class="message-list"
        scroll-y
        :scroll-into-view="scrollIntoView"
        :scroll-with-animation="true"
      >
        <view v-if="messages.length === 0" class="empty-messages">
          <up-empty mode="message" text="开始新的对话吧"></up-empty>
        </view>

        <view
          v-for="(msg, index) in messages"
          :key="msg.id"
          :id="`msg-${index}`"
          class="message-item"
        >
          <MessageBubble
            :message="msg"
            :showRegenerate="index === messages.length - 1 && msg.role === 'assistant'"
            @regenerate="regenerateLastMessage"
          />
        </view>

        <!-- 令牌统计 -->
        <view v-if="stats.totalTokens > 0" class="stats-bar">
          <up-icon name="file-text" size="14" color="#c0c4cc"></up-icon>
          <text class="stats-text">{{ stats.inputTokens }} / {{ stats.outputTokens }} / {{ stats.totalTokens }} tokens</text>
        </view>

        <!-- 底部留白 -->
        <view class="list-bottom"></view>
      </scroll-view>

      <!-- 输入区 -->
      <view class="input-wrap">
        <!-- 附件预览 -->
        <view v-if="attachments.length > 0" class="attachments-preview">
          <view v-for="(att, index) in attachments" :key="index" class="attachment-item">
            <image :src="att.url" mode="aspectFill" class="attachment-image" />
            <view class="attachment-remove" @click="removeAttachment(index)">
              <up-icon name="close" size="10" color="#ffffff"></up-icon>
            </view>
          </view>
        </view>

        <view class="input-row">
          <view class="input-box">
            <up-input
              v-model="inputText"
              type="textarea"
              placeholder="发送消息..."
              :autoHeight="true"
              :maxlength="10000"
              inputAlign="left"
              border="none"
              :customStyle="{ padding: '20rpx 0', fontSize: '28rpx', minHeight: '72rpx' }"
              @confirm="sendMessage"
            ></up-input>
          </view>
          <view
            class="send-btn"
            :class="{ 'send-btn--active': canSend, 'send-btn--loading': sending }"
            @click="sendMessage"
          >
            <up-loading-icon v-if="sending" color="#ffffff" size="20"></up-loading-icon>
            <up-icon v-else name="arrow-up" size="22" color="#ffffff"></up-icon>
          </view>
        </view>
      </view>
    </view>

    <!-- 模型选择器 -->
    <up-picker
      :show="showModelPicker"
      :columns="modelColumns"
      @confirm="onModelConfirm"
      @cancel="showModelPicker = false"
    ></up-picker>

    <!-- 权限选择器 -->
    <up-picker
      :show="showPermissionPicker"
      :columns="permissionColumns"
      @confirm="onPermissionConfirm"
      @cancel="showPermissionPicker = false"
    ></up-picker>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from "vue"
import { onLoad, onUnload } from "@dcloudio/uni-app"
import { useAuthStore } from "@/stores/auth"
import { useConversationRuntimeStore } from "@/stores/conversationRuntime"
import { acpApi } from "@/api/acp"
import type { PromptInputBlock } from "@/types/acp"
import MessageBubble from "@/components/MessageBubble.vue"
import AgentSelector from "@/components/AgentSelector.vue"
import ExpertMenu from "@/components/ExpertMenu.vue"

const auth = useAuthStore()
const runtime = useConversationRuntimeStore()

const loading = ref(false)
const sending = ref(false)
const conversationId = ref<number>(0)
const folderId = ref<number>(0)
const inputText = ref("")
const scrollIntoView = ref("")
const attachments = ref<any[]>([])
const selectedAgent = ref("general")
const showModelPicker = ref(false)
const showPermissionPicker = ref(false)
const modelColumns = ref<any[]>([])
const permissionColumns = ref<any[]>([])

// 计算属性
const messages = computed(() => {
  if (!conversationId.value) return []
  return runtime.getMessages(conversationId.value)
})

const session = computed(() => {
  if (!conversationId.value) return null
  return runtime.getOrCreateSession(conversationId.value)
})

const runtimeStatus = computed(() => session.value?.status || "idle")

const stats = computed(() => session.value?.stats || { inputTokens: 0, outputTokens: 0, totalTokens: 0, turnCount: 0 })

const canSend = computed(() => {
  return (inputText.value.trim() || attachments.value.length > 0) && !sending.value
})

// 页面加载
onLoad((options: any) => {
  conversationId.value = Number(options.id || 0)
  folderId.value = Number(options.folderId || 0)
  if (conversationId.value) {
    loadConversation()
  }
})

// 页面卸载
onUnload(() => {
  if (conversationId.value && session.value?.connectionId) {
    runtime.disconnect(conversationId.value)
  }
})

// 监听消息变化，自动滚动到底部
watch(
  () => messages.value.length,
  () => {
    nextTick(() => {
      if (messages.value.length > 0) {
        scrollIntoView.value = `msg-${messages.value.length - 1}`
      }
    })
  }
)

// 加载会话
async function loadConversation() {
  loading.value = true
  try {
    const gateway = auth.gateway()
    const result = await gateway.call<any>("get_folder_conversation", {
      conversationId: conversationId.value,
    })

    // 加载历史消息到运行时
    const session = runtime.getOrCreateSession(conversationId.value)
    session.localTurns = result.turns || []

    // 连接到 ACP
    await runtime.connect(
      conversationId.value,
      result.agentType || selectedAgent.value,
      undefined,
      result.sessionId
    )

    // 滚动到底部
    nextTick(() => {
      if (messages.value.length > 0) {
        scrollIntoView.value = `msg-${messages.value.length - 1}`
      }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    uni.showToast({ title: `加载失败: ${message}`, icon: "none", duration: 3000 })
  } finally {
    loading.value = false
  }
}

// 智能体切换
async function handleAgentChange(agent: any) {
  try {
    const conn = session.value?.connectionId
    if (conn) {
      await acpApi.acpSetMode(conn, agent.type)
      uni.showToast({ title: `已切换到: ${agent.name}`, icon: "success" })
    }
  } catch (error) {
    uni.showToast({ title: "切换失败", icon: "none" })
  }
}

// 专家命令选择
function handleCommandSelect(command: any) {
  inputText.value = command.prompt + "\n\n"
  uni.showToast({ title: `已插入: ${command.name}`, icon: "success" })
}

// 发送消息
async function sendMessage() {
  if (!canSend.value) return

  const content = inputText.value.trim()
  const atts = [...attachments.value]

  // 清空输入
  inputText.value = ""
  attachments.value = []

  // 添加乐观更新的用户消息
  runtime.addOptimisticUserMessage(conversationId.value, content, atts)

  sending.value = true

  try {
    const blocks: PromptInputBlock[] = []

    if (content) {
      blocks.push({ type: "text", text: content })
    }

    atts.forEach((att) => {
      blocks.push({
        type: "image",
        source: { type: "url", url: att.url, media_type: att.type },
      })
    })

    const conn = session.value?.connectionId
    if (!conn) throw new Error("未连接到代理")

    await acpApi.acpPrompt(conn, blocks, folderId.value, conversationId.value)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    uni.showToast({ title: `发送失败: ${message}`, icon: "none", duration: 3000 })
  } finally {
    sending.value = false
  }
}

// 选择图片
function chooseImage() {
  uni.chooseImage({
    count: 9,
    sizeType: ["compressed"],
    sourceType: ["album", "camera"],
    success: async (res) => {
      for (const path of res.tempFilePaths) {
        try {
          const file = await pathToFile(path)
          const result = await acpApi.uploadAttachment(file, session.value?.connectionId)
          attachments.value.push({
            url: result.url || result.path,
            name: result.name,
            size: result.size,
            type: "image/jpeg",
          })
        } catch (error) {
          uni.showToast({ title: "上传失败", icon: "none" })
        }
      }
    },
  })
}

// 移除附件
function removeAttachment(index: number) {
  attachments.value.splice(index, 1)
}

// 取消生成
async function cancelGeneration() {
  try {
    const conn = session.value?.connectionId
    if (conn) {
      await acpApi.acpCancel(conn)
      uni.showToast({ title: "已取消", icon: "success" })
    }
  } catch (error) {
    uni.showToast({ title: "取消失败", icon: "none" })
  }
}

// 重新生成
async function regenerateLastMessage() {
  const lastUserMessage = [...messages.value].reverse().find((m) => m.role === "user")
  if (!lastUserMessage) return

  await cancelGeneration()

  const textContent = lastUserMessage.content.find((p) => p.type === "text")
  if (textContent?.text) {
    inputText.value = textContent.text
    await sendMessage()
  }
}

// 辅助函数
function onModelConfirm() {}
function onPermissionConfirm() {}

async function pathToFile(path: string): Promise<File> {
  return new File([], path)
}
</script>

<style scoped lang="scss">
/* ===== 页面容器 ===== */
.page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #f2f3f5;
}

.loading-container,
.empty-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.detail-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

/* ===== 工具栏 ===== */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 30rpx;
  background-color: #ffffff;
  border-bottom: 1rpx solid #f0f0f0;
  gap: 20rpx;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.icon-btn {
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16rpx;
  background-color: #f5f6f8;
  transition: background-color 0.15s;

  &:active {
    background-color: #e8e8e8;
  }

  &--danger {
    background-color: #fff1f0;
    &:active {
      background-color: #ffe0de;
    }
  }
}

/* ===== 消息列表 ===== */
.message-list {
  flex: 1;
  padding: 24rpx 24rpx 0;
}

.message-item {
  margin-bottom: 32rpx;
}

.empty-messages {
  padding-top: 160rpx;
}

.stats-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  padding: 16rpx;
}

.stats-text {
  font-size: 22rpx;
  color: #c0c4cc;
}

.list-bottom {
  height: 24rpx;
}

/* ===== 输入区 ===== */
.input-wrap {
  background-color: #ffffff;
  border-top: 1rpx solid #f0f0f0;
  padding: 16rpx 24rpx;
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
}

.attachments-preview {
  display: flex;
  gap: 16rpx;
  padding-bottom: 16rpx;
  overflow-x: auto;
}

.attachment-item {
  position: relative;
  flex-shrink: 0;
}

.attachment-image {
  width: 120rpx;
  height: 120rpx;
  border-radius: 12rpx;
  object-fit: cover;
}

.attachment-remove {
  position: absolute;
  top: -10rpx;
  right: -10rpx;
  width: 36rpx;
  height: 36rpx;
  background-color: rgba(0, 0, 0, 0.5);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.input-row {
  display: flex;
  align-items: flex-end;
  gap: 16rpx;
}

.input-box {
  flex: 1;
  background-color: #f5f6f8;
  border-radius: 24rpx;
  padding: 0 24rpx;
  min-height: 72rpx;
  display: flex;
  align-items: center;
}

.send-btn {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background-color: #d0d0d0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background-color 0.2s, transform 0.15s;

  &--active {
    background-color: #2979ff;
  }

  &--loading {
    background-color: #2979ff;
  }

  &:active {
    transform: scale(0.92);
  }
}
</style>
