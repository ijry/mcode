<template>
  <view class="page">
    <!-- 加载状态 -->
    <view v-if="loading" class="loading-container">
      <u-loading-page :loading="loading" loading-text="加载中..."></u-loading-page>
    </view>

    <!-- 会话不存在 -->
    <view v-else-if="!conversationId" class="empty-container">
      <u-empty mode="data" text="会话不存在"></u-empty>
    </view>

    <!-- 主内容 -->
    <view v-else class="detail-container">
      <!-- 工具栏 -->
      <view class="toolbar">
        <AgentSelector v-model="selectedAgent" @change="handleAgentChange" />
        <ExpertMenu @select="handleCommandSelect" />
        <u-button size="small" type="warning" plain @click="chooseImage">
          <u-icon name="photo" size="16"></u-icon>
          <text class="btn-text">图片</text>
        </u-button>
        <u-button
          v-if="runtimeStatus === 'thinking'"
          size="small"
          type="error"
          plain
          @click="cancelGeneration"
        >
          <u-icon name="close" size="16"></u-icon>
          <text class="btn-text">取消</text>
        </u-button>
      </view>

      <!-- 消息列表 -->
      <scroll-view
        class="message-list"
        scroll-y
        :scroll-into-view="scrollIntoView"
        :scroll-with-animation="true"
      >
        <view v-if="messages.length === 0" class="empty-messages">
          <u-empty mode="message" text="开始新的对话吧"></u-empty>
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
        <view v-if="stats.totalTokens > 0" class="stats-container">
          <text class="stats-text">
            输入: {{ stats.inputTokens }} | 输出: {{ stats.outputTokens }} | 总计:
            {{ stats.totalTokens }}
          </text>
        </view>
      </scroll-view>

      <!-- 输入框 -->
      <view class="input-container">
        <!-- 附件预览 -->
        <view v-if="attachments.length > 0" class="attachments-preview">
          <view v-for="(att, index) in attachments" :key="index" class="attachment-item">
            <image :src="att.url" mode="aspectFill" class="attachment-image" />
            <view class="attachment-remove" @click="removeAttachment(index)">
              <u-icon name="close" size="12" color="#ffffff"></u-icon>
            </view>
          </view>
        </view>

        <view class="input-row">
          <u-input
            v-model="inputText"
            type="textarea"
            placeholder="输入消息..."
            :autoHeight="true"
            :maxlength="10000"
            class="message-input"
            @confirm="sendMessage"
          ></u-input>
          <u-button
            type="primary"
            size="normal"
            :disabled="!canSend"
            @click="sendMessage"
            :loading="sending"
          >
            发送
          </u-button>
        </view>
      </view>
    </view>

    <!-- 模型选择器 -->
    <u-picker
      :show="showModelPicker"
      :columns="modelColumns"
      @confirm="onModelConfirm"
      @cancel="showModelPicker = false"
    ></u-picker>

    <!-- 权限选择器 -->
    <u-picker
      :show="showPermissionPicker"
      :columns="permissionColumns"
      @confirm="onPermissionConfirm"
      @cancel="showPermissionPicker = false"
    ></u-picker>
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
    // 构建消息块
    const blocks: PromptInputBlock[] = []

    // 添加文本块
    if (content) {
      blocks.push({
        type: "text",
        text: content,
      })
    }

    // 添加图片块
    atts.forEach((att) => {
      blocks.push({
        type: "image",
        source: {
          type: "url",
          url: att.url,
          media_type: att.type,
        },
      })
    })

    // 发送到 ACP
    const conn = session.value?.connectionId
    if (!conn) {
      throw new Error("未连接到代理")
    }

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
          // 上传图片
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
  // 找到最后一条用户消息
  const lastUserMessage = [...messages.value].reverse().find((m) => m.role === "user")
  if (!lastUserMessage) return

  // 取消当前生成
  await cancelGeneration()

  // 重新发送
  const textContent = lastUserMessage.content.find((p) => p.type === "text")
  if (textContent?.text) {
    inputText.value = textContent.text
    await sendMessage()
  }
}

// 辅助函数：将路径转换为 File 对象
async function pathToFile(path: string): Promise<File> {
  // 在 uni-app 中需要特殊处理
  // 这里简化处理，实际需要根据平台调整
  return new File([], path)
}
</script>

<style scoped lang="scss">
.page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #f8f8f8;
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
}

.toolbar {
  display: flex;
  gap: 20rpx;
  padding: 20rpx 30rpx;
  background-color: #ffffff;
  border-bottom: 1rpx solid #e4e7ed;
}

.btn-text {
  margin-left: 8rpx;
}

.message-list {
  flex: 1;
  padding: 20rpx 30rpx;
  overflow-y: auto;
}

.empty-messages {
  padding-top: 200rpx;
}

.message-item {
  margin-bottom: 30rpx;
}

.stats-container {
  padding: 20rpx;
  text-align: center;
}

.stats-text {
  font-size: 22rpx;
  color: #909399;
}

.input-container {
  background-color: #ffffff;
  border-top: 1rpx solid #e4e7ed;
}

.attachments-preview {
  display: flex;
  gap: 16rpx;
  padding: 20rpx 30rpx 0;
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
}

.attachment-remove {
  position: absolute;
  top: -12rpx;
  right: -12rpx;
  width: 40rpx;
  height: 40rpx;
  background-color: #fa3534;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.input-row {
  display: flex;
  gap: 20rpx;
  padding: 20rpx 30rpx;
  align-items: flex-end;
}

.message-input {
  flex: 1;
  min-height: 80rpx;
  max-height: 200rpx;
}
</style>
