<template>
  <view class="page">
    <view v-if="loading" class="loading-container">
      <u-loading-page :loading="loading" loading-text="加载中..."></u-loading-page>
    </view>

    <view v-else-if="!conversation" class="empty-container">
      <u-empty mode="data" text="会话不存在"></u-empty>
    </view>

    <view v-else class="detail-container">
      <!-- 会话工具栏 -->
      <view class="toolbar">
        <u-button size="small" type="primary" plain @click="showModelPicker = true">
          <u-icon name="setting" size="16"></u-icon>
          <text class="btn-text">模型</text>
        </u-button>
        <u-button size="small" type="success" plain @click="showPermissionPicker = true">
          <u-icon name="lock" size="16"></u-icon>
          <text class="btn-text">权限</text>
        </u-button>
        <u-button size="small" type="warning" plain @click="chooseImage">
          <u-icon name="photo" size="16"></u-icon>
          <text class="btn-text">图片</text>
        </u-button>
      </view>

      <!-- 消息列表 -->
      <scroll-view class="message-list" scroll-y :scroll-into-view="scrollIntoView">
        <view v-if="messages.length === 0" class="empty-messages">
          <u-empty mode="message" text="暂无消息"></u-empty>
        </view>

        <view v-for="(msg, index) in messages" :key="index" :id="`msg-${index}`" class="message-item">
          <view v-if="msg.role === 'user'" class="message-user">
            <view class="message-content user-content">
              <text class="message-text">{{ msg.content }}</text>
            </view>
            <view class="message-avatar">
              <u-avatar size="40" :text="'我'"></u-avatar>
            </view>
          </view>

          <view v-else class="message-assistant">
            <view class="message-avatar">
              <u-avatar size="40" :text="'AI'"></u-avatar>
            </view>
            <view class="message-content assistant-content">
              <text class="message-text">{{ msg.content }}</text>
            </view>
          </view>
        </view>
      </scroll-view>

      <!-- 输入框 -->
      <view class="input-container">
        <u-input
          v-model="inputText"
          type="textarea"
          placeholder="输入消息..."
          :autoHeight="true"
          :maxlength="2000"
          class="message-input"
        ></u-input>
        <u-button
          type="primary"
          size="normal"
          :disabled="!inputText.trim()"
          @click="sendMessage"
          :loading="sending"
        >
          发送
        </u-button>
      </view>
    </view>

    <!-- 模型选择器 -->
    <u-picker
      v-model:show="showModelPicker"
      :columns="modelColumns"
      @confirm="onModelConfirm"
      @cancel="showModelPicker = false"
    ></u-picker>

    <!-- 权限选择器 -->
    <u-picker
      v-model:show="showPermissionPicker"
      :columns="permissionColumns"
      @confirm="onPermissionConfirm"
      @cancel="showPermissionPicker = false"
    ></u-picker>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from "vue"
import { onLoad } from "@dcloudio/uni-app"
import { useAuthStore } from "@/stores/auth"

const auth = useAuthStore()
const loading = ref(false)
const sending = ref(false)
const conversation = ref<any>(null)
const messages = ref<any[]>([])
const inputText = ref("")
const scrollIntoView = ref("")
const showModelPicker = ref(false)
const showPermissionPicker = ref(false)

const conversationId = ref<number>(0)
const folderId = ref<number>(0)

const modelColumns = ref([
  [
    { text: "Claude Sonnet 4", value: "claude-sonnet-4" },
    { text: "Claude Opus 4", value: "claude-opus-4" },
    { text: "Claude Haiku 4", value: "claude-haiku-4" },
    { text: "GPT-4", value: "gpt-4" },
    { text: "GPT-3.5", value: "gpt-3.5-turbo" },
  ],
])

const permissionColumns = ref([
  [
    { text: "自动批准", value: "auto" },
    { text: "手动批准", value: "manual" },
    { text: "拒绝所有", value: "deny" },
  ],
])

onLoad((options: any) => {
  conversationId.value = Number(options.id || 0)
  folderId.value = Number(options.folderId || 0)
  if (conversationId.value) {
    loadConversation()
  }
})

async function loadConversation() {
  loading.value = true
  try {
    const gateway = auth.gateway()
    const result = await gateway.call<any>("get_folder_conversation", {
      conversationId: conversationId.value,
    })

    conversation.value = result
    messages.value = result.messages || []

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

async function sendMessage() {
  if (!inputText.value.trim()) return

  const userMessage = {
    role: "user",
    content: inputText.value.trim(),
  }

  messages.value.push(userMessage)
  inputText.value = ""

  // 滚动到底部
  nextTick(() => {
    scrollIntoView.value = `msg-${messages.value.length - 1}`
  })

  sending.value = true

  try {
    // TODO: 实现发送消息到 ACP 的逻辑
    // 这里需要调用 acp_prompt 等接口

    // 模拟 AI 回复
    setTimeout(() => {
      messages.value.push({
        role: "assistant",
        content: "这是一个模拟回复，实际功能需要连接到 ACP 服务。",
      })

      nextTick(() => {
        scrollIntoView.value = `msg-${messages.value.length - 1}`
      })

      sending.value = false
    }, 1000)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    uni.showToast({ title: `发送失败: ${message}`, icon: "none", duration: 3000 })
    sending.value = false
  }
}

function chooseImage() {
  uni.chooseImage({
    count: 1,
    sizeType: ["compressed"],
    sourceType: ["album", "camera"],
    success: (res) => {
      const tempFilePath = res.tempFilePaths[0]
      // TODO: 实现图片上传逻辑
      uni.showToast({ title: "图片上传功能开发中", icon: "none" })
    },
  })
}

function onModelConfirm(e: any) {
  const selected = e.value[0]
  uni.showToast({ title: `已选择: ${selected.text}`, icon: "none" })
  showModelPicker.value = false
}

function onPermissionConfirm(e: any) {
  const selected = e.value[0]
  uni.showToast({ title: `权限设置: ${selected.text}`, icon: "none" })
  showPermissionPicker.value = false
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

.message-user,
.message-assistant {
  display: flex;
  gap: 20rpx;
}

.message-user {
  flex-direction: row-reverse;
}

.message-avatar {
  flex-shrink: 0;
}

.message-content {
  max-width: 70%;
  padding: 20rpx 24rpx;
  border-radius: 16rpx;
  word-wrap: break-word;
}

.user-content {
  background-color: #2979ff;
  color: #ffffff;
}

.assistant-content {
  background-color: #ffffff;
  color: #303133;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.05);
}

.message-text {
  font-size: 28rpx;
  line-height: 1.6;
}

.input-container {
  display: flex;
  gap: 20rpx;
  padding: 20rpx 30rpx;
  background-color: #ffffff;
  border-top: 1rpx solid #e4e7ed;
  align-items: flex-end;
}

.message-input {
  flex: 1;
  min-height: 80rpx;
  max-height: 200rpx;
}
</style>
