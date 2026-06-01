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

      <!-- 计划任务入口（移动端） -->
      <view
        v-if="planTasks.length > 0"
        class="plan-fab"
        @click="showPlanDrawer = true"
      >
        <up-icon name="list" size="18" color="#ffffff"></up-icon>
        <text class="plan-fab__text">计划 {{ inProgressTaskCount }}/{{ planTasks.length }}</text>
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

    <!-- 计划任务抽屉 -->
    <up-popup v-model:show="showPlanDrawer" mode="bottom" :round="20">
      <view class="plan-drawer">
        <view class="plan-drawer__hd">
          <text class="plan-drawer__title">计划任务</text>
          <text class="plan-drawer__count">{{ inProgressTaskCount }}/{{ planTasks.length }}</text>
        </view>

        <view class="plan-filters">
          <view
            v-for="item in planFilterItems"
            :key="item.key"
            :class="['plan-filter', planStatusFilter === item.key && 'plan-filter--active']"
            @click="planStatusFilter = item.key"
          >
            <text>{{ item.label }}</text>
            <text class="plan-filter__count">{{ item.count }}</text>
          </view>
        </view>

        <scroll-view scroll-y class="plan-drawer__list">
          <view v-if="filteredPlanTasks.length === 0" class="plan-empty">
            <up-empty
              mode="list"
              :text="planTasks.length === 0 ? '暂无任务' : '该状态下暂无任务'"
            ></up-empty>
          </view>

          <view
            v-for="task in filteredPlanTasks"
            :key="task.id"
            class="plan-task"
          >
            <view class="plan-task__left">
              <view
                :class="[
                  'plan-task__dot',
                  `plan-task__dot--${task.status}`,
                ]"
              ></view>
            </view>
            <view class="plan-task__main">
              <text class="plan-task__subject">{{ task.subject }}</text>
              <text v-if="task.description" class="plan-task__desc">{{ task.description }}</text>
            </view>
            <view
              :class="[
                'plan-task__badge',
                `plan-task__badge--${task.status}`,
              ]"
            >
              {{ taskStatusLabel(task.status) }}
            </view>
          </view>

          <view class="plan-drawer__safe"></view>
        </scroll-view>
      </view>
    </up-popup>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from "vue"
import { onLoad, onUnload } from "@dcloudio/uni-app"
import { useAuthStore } from "@/stores/auth"
import { useConversationRuntimeStore } from "@/stores/conversationRuntime"
import { acpApi } from "@/api/acp"
import type { PromptInputBlock, ToolCall, ContentPart, MessageTurn } from "@/types/acp"
import MessageBubble from "@/components/MessageBubble.vue"
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
const showModelPicker = ref(false)
const showPermissionPicker = ref(false)
const showPlanDrawer = ref(false)
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

type PlanTaskStatus = "pending" | "in_progress" | "completed" | "failed"
interface PlanTask {
  id: string
  subject: string
  description?: string
  status: PlanTaskStatus
  order: number
}
type PlanTaskFilter = "all" | PlanTaskStatus
const planStatusFilter = ref<PlanTaskFilter>("all")

const planTasks = computed<PlanTask[]>(() => {
  const taskMap = new Map<string, PlanTask>()
  let order = 0

  const nextOrder = () => {
    order += 1
    return order
  }

  for (const msg of messages.value) {
    for (const part of getTurnContentParts(msg)) {
      if (part.type !== "tool_call" || !part.tool_call) continue
      mergeTaskFromToolCall(taskMap, part.tool_call, nextOrder)
    }
  }

  return Array.from(taskMap.values()).sort((a, b) => a.order - b.order)
})

const inProgressTaskCount = computed(
  () => planTasks.value.filter((task) => task.status === "in_progress").length
)

const filteredPlanTasks = computed(() => {
  if (planStatusFilter.value === "all") return planTasks.value
  return planTasks.value.filter((task) => task.status === planStatusFilter.value)
})

const planFilterItems = computed<
  Array<{ key: PlanTaskFilter; label: string; count: number }>
>(() => [
  { key: "all", label: "全部", count: planTasks.value.length },
  { key: "in_progress", label: "进行中", count: countByStatus("in_progress") },
  { key: "pending", label: "待处理", count: countByStatus("pending") },
  { key: "completed", label: "已完成", count: countByStatus("completed") },
  { key: "failed", label: "失败", count: countByStatus("failed") },
])

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
    session.localTurns = normalizeTurns(result.turns)

    // 连接到 ACP
    await runtime.connect(
      conversationId.value,
      result.agentType || "claude_code",
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
          const connectionId = session.value?.connectionId || undefined
          const result = await acpApi.uploadAttachment(file, connectionId)
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

  const textContent = getTurnContentParts(lastUserMessage).find((p) => p.type === "text")
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

function mergeTaskFromToolCall(
  taskMap: Map<string, PlanTask>,
  toolCall: ToolCall,
  nextOrder: () => number
) {
  const name = normalizeToolName(toolCall.name)
  if (!name.includes("task") && !name.includes("todo")) return

  const input = (toolCall.input || {}) as Record<string, any>

  if (name === "tasklist" || name === "task_list") {
    const outputObj = toObject(toolCall.output)
    const taskList =
      (outputObj?.tasks as any[]) ||
      (outputObj?.todos as any[]) ||
      (outputObj?.list as any[]) ||
      []

    taskList.forEach((item, index) => {
      if (!item || typeof item !== "object") return
      const id = firstString(item.taskId, item.task_id, item.id) || `tasklist-${index}`
      upsertTask(taskMap, id, nextOrder, {
        subject:
          firstString(item.subject, item.title, item.content, item.description) ||
          `任务 ${index + 1}`,
        description: firstString(item.description, item.activeForm),
        status: normalizeTaskStatus(item.status),
      })
    })
    return
  }

  if (name === "todowrite" && Array.isArray(input.todos)) {
    input.todos.forEach((item: Record<string, any>, index: number) => {
      if (!item || typeof item !== "object") return
      const id = firstString(item.id, item.taskId) || `todo-${index}`
      upsertTask(taskMap, id, nextOrder, {
        subject:
          firstString(item.content, item.subject, item.title, item.description) ||
          `任务 ${index + 1}`,
        description: firstString(item.activeForm),
        status: normalizeTaskStatus(item.status),
      })
    })
    return
  }

  if (name === "taskcreate" || name === "task_create") {
    const outputObj = toObject(toolCall.output)
    const id =
      firstString(input.taskId, input.task_id, outputObj?.taskId, outputObj?.task_id, outputObj?.id) ||
      `task-create-${toolCall.id}`
    upsertTask(taskMap, id, nextOrder, {
      subject:
        firstString(input.subject, input.title, input.content, input.description) ||
        "新任务",
      description: firstString(input.description, input.activeForm),
      status: normalizeTaskStatus(input.status || outputObj?.status),
    })
    return
  }

  if (name === "taskupdate" || name === "task_update") {
    const id =
      firstString(input.taskId, input.task_id, input.id) || `task-update-${toolCall.id}`
    upsertTask(taskMap, id, nextOrder, {
      subject: firstString(input.subject),
      description: firstString(input.description, input.activeForm),
      status: normalizeTaskStatus(input.status),
    })
  }
}

function upsertTask(
  taskMap: Map<string, PlanTask>,
  id: string,
  nextOrder: () => number,
  patch: Partial<Omit<PlanTask, "id" | "order">>
) {
  const existing = taskMap.get(id)
  if (!existing) {
    taskMap.set(id, {
      id,
      subject: patch.subject || "任务",
      description: patch.description,
      status: patch.status || "pending",
      order: nextOrder(),
    })
    return
  }

  if (patch.subject) existing.subject = patch.subject
  if (patch.description) existing.description = patch.description
  if (patch.status) existing.status = patch.status
}

function normalizeToolName(name?: string): string {
  return String(name || "").trim().toLowerCase().replace(/[\s_-]/g, "")
}

function normalizeTaskStatus(value: unknown): PlanTaskStatus {
  const status = String(value || "").trim().toLowerCase()
  if (
    status === "in_progress" ||
    status === "inprogress" ||
    status === "running" ||
    status === "active" ||
    status === "processing"
  ) {
    return "in_progress"
  }
  if (
    status === "completed" ||
    status === "done" ||
    status === "success" ||
    status === "finished"
  ) {
    return "completed"
  }
  if (
    status === "failed" ||
    status === "error" ||
    status === "cancelled" ||
    status === "canceled"
  ) {
    return "failed"
  }
  return "pending"
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return undefined
}

function toObject(raw: unknown): Record<string, any> | null {
  if (!raw) return null
  if (typeof raw === "object") return raw as Record<string, any>
  if (typeof raw !== "string") return null

  const text = raw.trim()
  if (!text) return null

  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === "object") return parsed as Record<string, any>
    return null
  } catch {
    return null
  }
}

function taskStatusLabel(status: PlanTaskStatus): string {
  if (status === "in_progress") return "进行中"
  if (status === "completed") return "已完成"
  if (status === "failed") return "失败"
  return "待处理"
}

function countByStatus(status: PlanTaskStatus): number {
  return planTasks.value.filter((task) => task.status === status).length
}

function normalizeTurns(rawTurns: unknown): MessageTurn[] {
  if (!Array.isArray(rawTurns)) return []
  return rawTurns.map((raw, index) => normalizeTurn(raw, index)).filter(Boolean) as MessageTurn[]
}

function normalizeTurn(raw: any, index: number): MessageTurn | null {
  if (!raw || typeof raw !== "object") return null
  const role = raw.role === "user" ? "user" : "assistant"
  const content = normalizeContentParts(raw.content)
  const id = firstString(raw.id) || `turn-${index}-${Date.now()}`
  const timestamp =
    typeof raw.timestamp === "number"
      ? raw.timestamp
      : typeof raw.created_at === "number"
        ? raw.created_at
        : Date.now()

  return {
    id,
    role,
    content,
    timestamp,
    status: raw.status,
    error: firstString(raw.error),
  }
}

function normalizeContentParts(rawContent: unknown): ContentPart[] {
  if (Array.isArray(rawContent)) {
    return rawContent
      .map((part) => normalizeContentPart(part))
      .filter(Boolean) as ContentPart[]
  }

  const text = firstString(rawContent)
  if (text) return [{ type: "text", text }]
  return []
}

function normalizeContentPart(raw: any): ContentPart | null {
  if (!raw || typeof raw !== "object") {
    const text = firstString(raw)
    return text ? { type: "text", text } : null
  }

  const type = firstString(raw.type)
  if (type === "text") return { type: "text", text: firstString(raw.text) || "" }
  if (type === "thinking") return { type: "thinking", thinking: firstString(raw.thinking) || "" }
  if (type === "tool_call" && raw.tool_call && typeof raw.tool_call === "object") {
    return {
      type: "tool_call",
      tool_call: {
        id: firstString(raw.tool_call.id) || `tool-${Date.now()}`,
        name: firstString(raw.tool_call.name) || "unknown",
        input: (raw.tool_call.input && typeof raw.tool_call.input === "object")
          ? raw.tool_call.input
          : {},
        status: raw.tool_call.status,
        output: firstString(raw.tool_call.output),
        error: firstString(raw.tool_call.error),
      },
    }
  }
  if (type === "image" && raw.image && typeof raw.image === "object") {
    return {
      type: "image",
      image: {
        url: firstString(raw.image.url) || "",
        alt: firstString(raw.image.alt),
      },
    }
  }
  if (type === "plan" && raw.plan && typeof raw.plan === "object") {
    const steps = Array.isArray(raw.plan.steps) ? raw.plan.steps : []
    return {
      type: "plan",
      plan: {
        steps: steps
          .map((step: any) => ({
            description: firstString(step?.description, step?.title, step?.content) || "",
            completed: Boolean(step?.completed),
          }))
          .filter((step: any) => step.description),
        status: raw.plan.status,
      },
    }
  }

  const text = firstString(raw.text, raw.content, raw.description)
  return text ? { type: "text", text } : null
}

function getTurnContentParts(turn: any): ContentPart[] {
  if (turn?.content && Array.isArray(turn.content)) return turn.content as ContentPart[]
  return normalizeContentParts(turn?.content)
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
  justify-content: flex-end;
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

/* ===== 计划任务入口（悬浮） ===== */
.plan-fab {
  position: fixed;
  right: 24rpx;
  bottom: calc(136rpx + env(safe-area-inset-bottom));
  z-index: 30;
  height: 72rpx;
  padding: 0 22rpx;
  border-radius: 36rpx;
  background: linear-gradient(135deg, #5f7bff, #6b8bff);
  box-shadow: 0 10rpx 24rpx rgba(41, 121, 255, 0.28);
  display: flex;
  align-items: center;
  gap: 10rpx;

  &:active {
    transform: scale(0.97);
  }
}

.plan-fab__text {
  font-size: 24rpx;
  color: #ffffff;
  font-weight: 500;
}

/* ===== 计划任务抽屉 ===== */
.plan-drawer {
  background-color: #ffffff;
  max-height: 68vh;
  display: flex;
  flex-direction: column;
}

.plan-drawer__hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 30rpx 30rpx 18rpx;
  border-bottom: 1rpx solid #f3f4f6;
}

.plan-drawer__title {
  font-size: 32rpx;
  color: #1d1d1f;
  font-weight: 600;
}

.plan-drawer__count {
  font-size: 24rpx;
  color: #86909c;
}

.plan-filters {
  display: flex;
  gap: 10rpx;
  padding: 4rpx 24rpx 12rpx;
  overflow-x: auto;
}

.plan-filter {
  flex-shrink: 0;
  font-size: 22rpx;
  color: #6b7280;
  background-color: #f1f3f5;
  border-radius: 999rpx;
  padding: 10rpx 14rpx;
  line-height: 1;
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.plan-filter--active {
  color: #1e56d9;
  background-color: #e8f0ff;
}

.plan-filter__count {
  font-size: 20rpx;
  padding: 4rpx 8rpx;
  border-radius: 999rpx;
  background-color: rgba(0, 0, 0, 0.06);
}

.plan-filter--active .plan-filter__count {
  background-color: rgba(30, 86, 217, 0.18);
}

.plan-drawer__list {
  flex: 1;
  padding: 18rpx 24rpx 0;
}

.plan-empty {
  padding: 24rpx 0 10rpx;
}

.plan-task {
  display: flex;
  align-items: flex-start;
  gap: 14rpx;
  padding: 20rpx 16rpx;
  background: #f7f8fa;
  border-radius: 16rpx;
  margin-bottom: 12rpx;
}

.plan-task__left {
  padding-top: 8rpx;
}

.plan-task__dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background-color: #c0c4cc;

  &--pending {
    background-color: #c0c4cc;
  }
  &--in_progress {
    background-color: #2979ff;
  }
  &--completed {
    background-color: #19be6b;
  }
  &--failed {
    background-color: #fa3534;
  }
}

.plan-task__main {
  flex: 1;
  min-width: 0;
}

.plan-task__subject {
  display: block;
  font-size: 28rpx;
  color: #1f2329;
  line-height: 1.45;
}

.plan-task__desc {
  display: block;
  margin-top: 8rpx;
  font-size: 23rpx;
  color: #8a919f;
  line-height: 1.4;
}

.plan-task__badge {
  flex-shrink: 0;
  font-size: 21rpx;
  padding: 6rpx 12rpx;
  border-radius: 999rpx;
  line-height: 1;
  margin-top: 3rpx;

  &--pending {
    color: #6b7280;
    background-color: #edf0f3;
  }
  &--in_progress {
    color: #1e56d9;
    background-color: #e8f0ff;
  }
  &--completed {
    color: #0f8a4c;
    background-color: #e8f8ef;
  }
  &--failed {
    color: #cf1322;
    background-color: #fff1f0;
  }
}

.plan-drawer__safe {
  height: calc(24rpx + env(safe-area-inset-bottom));
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
