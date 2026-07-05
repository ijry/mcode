<template>
  <view
    :class="[
      'bubble-wrap',
      `bubble-wrap--${message.role}`,
      detailTheme !== 'default' && `bubble-wrap--theme-${detailTheme}`,
      detailTheme === 'matrix' && 'bubble-wrap--cyber',
      detailTheme === 'matrix' && cyberActive && 'bubble-wrap--cyber-active',
      detailTheme === 'matrix' && `bubble-wrap--cyber-${cyberEffectPhase || 'idle'}`,
      detailTheme === 'sweet' && `bubble-wrap--sweet-${cyberEffectPhase || 'idle'}`,
    ]"
  >
    <!-- 头像 -->
    <view class="bubble-avatar">
      <!-- <up-avatar
        v-if="message.role === 'user'"
        :size="36"
        text="我"
        bgColor="#2979ff"
        color="#fff"
        fontSize="24"
      ></up-avatar> -->
      <!-- <view v-else class="bubble-avatar__logo">
        <image
          v-if="agentLogoPath"
          class="bubble-avatar__logo-img"
          :src="agentLogoPath"
          mode="aspectFit"
        />
        <up-avatar
          v-else
          :size="36"
          text="AI"
          bgColor="#f0f0f0"
          color="#606266"
          fontSize="24"
        ></up-avatar>
      </view> -->
    </view>

    <!-- 气泡内容 -->
    <view class="bubble-body">
      <view
        :class="[
          'bubble',
          `bubble--${message.role}`,
          translucent && `bubble--${message.role}-translucent`,
        ]"
      >
        <!-- 内容渲染 -->
        <view v-for="(part, index) in displayParts" :key="index" class="part-wrap">
          <!-- 文本 -->
          <view v-if="part.type === 'text'" class="part-text">
            <view v-if="shouldRenderCyberDecode(part.text || '', index)" class="part-text__cyber">
              <up-markdown class="part-text__cyber-real" :content="part.text || ''"></up-markdown>
              <text class="part-text__cyber-overlay">{{ renderCyberDecodeText(part.text || '', index) }}</text>
            </view>
            <up-markdown v-else :content="part.text || ''"></up-markdown>
          </view>

          <!-- 思考 -->
          <view
            v-else-if="part.type === 'thinking'"
            :class="['part-thinking', isThinkingCollapsed(index) && 'part-thinking--collapsed', translucent && 'part-thinking--translucent']"
          >
            <view class="thinking-hd" @click="toggleThinkingCollapse(index)">
              <image
                class="thinking-hd__icon"
                src="/static/icons/brain.svg"
                mode="aspectFit"
              />
              <text class="thinking-hd__label">深度思考</text>
              <up-icon
                :name="isThinkingCollapsed(index) ? 'arrow-down' : 'arrow-up'"
                size="13"
                :color="upThemeVar('--up-warning', '#f9ae3d')"
                class="thinking-hd__arrow"
              ></up-icon>
            </view>
            <view v-show="!isThinkingCollapsed(index)" class="thinking-bd">
              <text class="thinking-hd__text">{{ part.thinking }}</text>
            </view>
          </view>

          <!-- Codex /goal 生命周期：优先渲染为目标卡，避免被普通工具组折叠 -->
          <view v-else-if="part.type === 'goal_run'" class="part-tool">
            <GoalToolCallBlock
              :start="part.start"
              :end="part.end"
              :items="part.items"
              :isRunning="part.isRunning"
              :translucent="translucent"
            />
          </view>

          <!-- P48 工具调用：分组调用使用紧凑中性 summary pill -->
          <view v-else-if="part.type === 'tool_call_group'" class="part-tool">
            <ToolCallGroupBlock
              :toolCalls="part.tool_calls || []"
              :translucent="translucent"
            />
          </view>
          <view v-else-if="part.type === 'tool_call'" class="part-tool">
            <ToolCallBlock :toolCall="part.tool_call!" />
          </view>

          <!-- 工具结果 -->
          <view v-else-if="part.type === 'tool_result'" class="part-tool-result">
            <view class="tool-result-hd">
              <up-icon
                :name="part.tool_result?.is_error ? 'close-circle' : 'checkmark-circle'"
                size="15"
                :color="part.tool_result?.is_error ? '#fa3534' : '#19be6b'"
              ></up-icon>
              <text
                :class="[
                  'tool-result-hd__label',
                  part.tool_result?.is_error && 'tool-result-hd__label--error',
                ]"
              >
                {{ part.tool_result?.is_error ? '工具执行失败' : '工具执行结果' }}
              </text>
            </view>
            <text class="tool-result__text">
              {{ part.tool_result?.output || '（无输出）' }}
            </text>
          </view>

          <!-- 图片 -->
          <view v-else-if="part.type === 'image'" class="part-image">
            <image
              :src="part.image?.url"
              mode="widthFix"
              class="msg-image"
              @click="previewImage(part.image?.url)"
            />
          </view>

          <!-- 计划 -->
          <view
            v-else-if="part.type === 'plan'"
            :class="[
              'part-plan',
              translucent && 'part-plan--translucent',
            ]"
          >
            <view class="plan-hd">
              <up-icon name="list" size="15" :color="upThemeVar('--up-primary', '#2979ff')"></up-icon>
              <text class="plan-hd__label">执行计划</text>
            </view>
            <view v-for="(step, idx) in part.plan?.steps" :key="idx" class="plan-step">
              <up-icon
                v-if="step.completed"
                name="checkmark-circle-fill"
                size="15"
                color="#19be6b"
              ></up-icon>
              <view v-else class="plan-step__dot"></view>
              <text :class="['plan-step__text', step.completed && 'plan-step__text--done']">
                {{ step.description }}
              </text>
            </view>
          </view>
        </view>

        <!-- 流式指示器 -->
        <view v-if="message.status === 'streaming'" class="typing-dots">
          <view class="dot"></view>
          <view class="dot"></view>
          <view class="dot"></view>
        </view>

        <!-- 错误 -->
        <view v-if="message.error" class="bubble-error">
          <up-icon name="close-circle" size="15" color="#fa3534"></up-icon>
          <text class="bubble-error__text">{{ message.error }}</text>
        </view>
      </view>

      <!-- 操作栏 -->
      <view :class="['bubble-actions', `bubble-actions--${message.role}`]">
        <view class="action-btn" @click="copyMessage">
          <up-icon name="copy" size="14" :color="upThemeVar('--up-light-color', '#c0c4cc')"></up-icon>
        </view>
        <view
          v-if="message.role === 'assistant' && showRegenerate"
          class="action-btn"
          @click="$emit('regenerate')"
        >
          <up-icon name="reload" size="14" :color="upThemeVar('--up-light-color', '#c0c4cc')"></up-icon>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue"
import type { ContentPart, GoalDisplayPart, MessageTurn, ToolCall } from "@/types/acp"
import {
  buildCyberDecodeText,
  type CyberEffectPhase,
  type DetailThemeId,
} from "@/pages/conversation-detail/detailCyberMode"
import { buildGoalDisplayParts } from "@/services/conversation/goalToolCall"
import GoalToolCallBlock from "./GoalToolCallBlock.vue"
import ToolCallBlock from "./ToolCallBlock.vue"
import ToolCallGroupBlock from "./ToolCallGroupBlock.vue"

const props = defineProps<{
  message: MessageTurn
  agentType?: string
  showRegenerate?: boolean
  translucent?: boolean
  detailTheme?: DetailThemeId
  cyberEffectPhase?: CyberEffectPhase
  cyberActive?: boolean
}>()

const emit = defineEmits<{
  regenerate: []
}>()

type DisplayPart = GoalDisplayPart | {
  type: "tool_call_group"
  tool_calls?: ToolCall[]
}

const displayParts = computed<DisplayPart[]>(() => {
  const grouped: DisplayPart[] = []
  let pendingToolCalls: ToolCall[] = []

  const flushPendingToolCalls = () => {
    if (pendingToolCalls.length === 0) return
    grouped.push({
      type: "tool_call_group",
      tool_calls: pendingToolCalls,
    })
    pendingToolCalls = []
  }

  const goalDisplayParts = buildGoalDisplayParts(props.message.content || [], isStreaming.value)
  for (const part of goalDisplayParts) {
    if (part.type === "tool_call" && part.tool_call) {
      pendingToolCalls.push(part.tool_call)
      continue
    }

    flushPendingToolCalls()
    grouped.push(part as DisplayPart)
  }

  flushPendingToolCalls()
  return grouped
})

// 思考折叠状态
const manuallyCollapsed = ref<Set<number>>(new Set())
const manuallyExpanded = ref<Set<number>>(new Set())
const cyberTick = ref(0)
let cyberTimer: ReturnType<typeof setInterval> | null = null

const isStreaming = computed(() => props.message.status === "streaming")
const isCyberStreamingPhase = computed(() => {
  const phase = props.cyberEffectPhase || "idle"
  return phase === "streaming" || phase === "settle"
})
const showCyberDecodeOverlay = computed(() =>
  Boolean(
    props.detailTheme === "matrix" &&
    props.cyberActive &&
    isCyberStreamingPhase.value &&
    props.message.role === "assistant" &&
    props.message.status === "streaming"
  )
)
const cyberRevealProgress = computed(() => {
  const phase = props.cyberEffectPhase || "idle"
  const base = phase === "streaming" ? 0.18 : 0.12
  const step = phase === "streaming" ? 0.06 : 0.04
  return Math.min(0.92, base + cyberTick.value * step)
})
const textSignature = computed(() =>
  (props.message.content || [])
    .filter((part) => part.type === "text")
    .map((part) => part.text || "")
    .join("\n")
)
const latestCyberTextPartIndex = computed(() => {
  for (let index = displayParts.value.length - 1; index >= 0; index -= 1) {
    const part = displayParts.value[index]
    if (part.type === "text" && String(part.text || "").trim()) {
      return index
    }
  }
  return -1
})

// 判断某个 thinking part 是否已经"思考结束"：后面还有其他内容 part
function isThinkingDone(index: number): boolean {
  const parts = displayParts.value
  return index < parts.length - 1
}

function isThinkingCollapsed(index: number): boolean {
  if (manuallyCollapsed.value.has(index)) return true
  if (manuallyExpanded.value.has(index)) return false
  // 流式中：最后一个 part 还在思考 → 展开；否则（已有后续内容）→ 折叠
  if (isStreaming.value) {
    return isThinkingDone(index)
  }
  // 非流式（含历史消息）：默认折叠
  return true
}

function toggleThinkingCollapse(index: number) {
  const collapsed = isThinkingCollapsed(index)
  if (collapsed) {
    // 当前折叠 → 展开
    const nextCollapsed = new Set(manuallyCollapsed.value)
    nextCollapsed.delete(index)
    manuallyCollapsed.value = nextCollapsed
    const nextExpanded = new Set(manuallyExpanded.value)
    nextExpanded.add(index)
    manuallyExpanded.value = nextExpanded
  } else {
    // 当前展开 → 折叠
    const nextCollapsed = new Set(manuallyCollapsed.value)
    nextCollapsed.add(index)
    manuallyCollapsed.value = nextCollapsed
    const nextExpanded = new Set(manuallyExpanded.value)
    nextExpanded.delete(index)
    manuallyExpanded.value = nextExpanded
  }
}

// 流式结束 → 重置手动状态，全部折叠
watch(isStreaming, (streaming, prevStreaming) => {
  if (prevStreaming && !streaming) {
    manuallyCollapsed.value = new Set()
    manuallyExpanded.value = new Set()
  }
})

watch(
  showCyberDecodeOverlay,
  (active) => {
    if (cyberTimer) {
      clearInterval(cyberTimer)
      cyberTimer = null
    }
    if (!active) {
      cyberTick.value = 0
      return
    }
    cyberTimer = setInterval(() => {
      cyberTick.value += 1
    }, 90)
  },
  { immediate: true }
)

watch(
  textSignature,
  () => {
    if (showCyberDecodeOverlay.value) {
      cyberTick.value = 0
    }
  },
  { flush: "sync" }
)

onBeforeUnmount(() => {
  if (cyberTimer) {
    clearInterval(cyberTimer)
    cyberTimer = null
  }
})

const agentLogoPath = computed(() => {
  const key = normalizeAgentType(props.agentType)
  if (key === "claude_code") return "/static/agent-logos/claude-code.svg"
  if (key === "codex") return "/static/agent-logos/codex.svg"
  if (key === "gemini") return "/static/agent-logos/gemini.svg"
  if (key === "cline") return "/static/agent-logos/cline.svg"
  if (key === "open_code") return "/static/agent-logos/open-code.svg"
  if (key === "open_claw") return "/static/agent-logos/open-claw.svg"
  return ""
})

function copyMessage() {
  const text = props.message.content
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("\n")

  uni.setClipboardData({
    data: text,
    success: () => uni.showToast({ title: "已复制", icon: "success" }),
  })
}

function previewImage(url?: string) {
  if (!url) return
  uni.previewImage({ urls: [url], current: url })
}

function shouldRenderCyberDecode(text: string, index: number) {
  if (!showCyberDecodeOverlay.value) return false
  const isLatestCyberTextPart = index === latestCyberTextPartIndex.value
  if (!isLatestCyberTextPart) return false
  const normalized = String(text || "")
  if (!normalized.trim()) return false
  return !/```|^\s*#|^\s*[-*]\s|^\s*\d+\.\s|\|.+\|/m.test(normalized)
}

function renderCyberDecodeText(text: string, index: number) {
  return buildCyberDecodeText({
    text,
    progress: cyberRevealProgress.value,
    tick: cyberTick.value + index * 11,
  })
}

function normalizeAgentType(raw?: string) {
  const value = String(raw || "").trim().toLowerCase().replace(/[\s-]/g, "_")
  if (!value) return "claude_code"
  if (value === "claudecode") return "claude_code"
  if (value === "codex_cli") return "codex"
  if (value === "gemini_cli" || value === "google_gemini" || value === "gemini_code") return "gemini"
  if (value === "cline_cli") return "cline"
  if (value === "opencode") return "open_code"
  if (value === "open_code_cli") return "open_code"
  if (value === "openclaw") return "open_claw"
  if (value === "open_claw_cli") return "open_claw"
  return value
}
</script>

<style scoped lang="scss">
/* ===== 行容器 ===== */
.bubble-wrap {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
  animation: fadeUp 0.25s ease;

  &--user {
    flex-direction: row-reverse;
  }
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(16rpx); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ===== 头像 ===== */
.bubble-avatar {
  flex-shrink: 0;
  margin-top: 4rpx;
}

.bubble-avatar__logo {
  width: 72rpx;
  height: 72rpx;
  border-radius: 18rpx;
  background-color: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.bubble-avatar__logo-img {
  width: 48rpx;
  height: 48rpx;
  display: block;
}

/* ===== 主体 ===== */
.bubble-body {
  flex: 1;
  max-width: 620rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;

  .bubble-wrap--user & {
    align-items: flex-end;
  }
}

/* ===== 气泡 ===== */
.bubble {
  padding: 4px 6px;
  border-radius: 20rpx;
  word-break: break-word;

  &--user {
    background-color: var(--up-primary, #2979ff);
    border-top-right-radius: 6rpx;
    color: #ffffff;
  }

  &--user-translucent {
    background-color: color-mix(in srgb, var(--up-primary, #2979ff) 54%, transparent 46%);
    border: 1rpx solid color-mix(in srgb, var(--up-primary, #2979ff) 24%, transparent 76%);
    backdrop-filter: blur(0.1rem);
    box-shadow: 0 10rpx 24rpx rgba(41, 121, 255, 0.08);
  }

  &--assistant {
    background-color: var(--up-card-bg-color, #ffffff);
    border-top-left-radius: 6rpx;
    box-shadow: none;
  }

  &--assistant-translucent {
    background-color: color-mix(in srgb, var(--up-card-bg-color, #ffffff) 30%, transparent 70%);
    border: 1rpx solid color-mix(in srgb, var(--up-border-color, #dadbde) 28%, transparent 72%);
    backdrop-filter: blur(10rpx);
    box-shadow: 0 10rpx 24rpx rgba(15, 23, 42, 0.045);
  }
}

.bubble-wrap--cyber {
  --message-cyber-text: rgba(186, 255, 200, 0.88);
  --message-cyber-border: rgba(0, 255, 65, 0.36);
  --message-cyber-panel: rgba(0, 13, 4, 0.56);
  font-family: "Courier New", monospace;
}

.bubble-wrap--cyber .bubble-body {
  max-width: 680rpx;
}

.bubble-wrap--cyber .bubble {
  position: relative;
  overflow: hidden;
  border-radius: 10rpx;
  border: 1rpx solid var(--message-cyber-border) !important;
  background:
    linear-gradient(90deg, rgba(0, 255, 65, 0.045) 1rpx, transparent 1rpx),
    linear-gradient(180deg, rgba(0, 255, 65, 0.035) 1rpx, transparent 1rpx),
    radial-gradient(circle at 18% 0, rgba(134, 255, 168, 0.16), transparent 36%),
    var(--message-cyber-panel) !important;
  background-size: 42rpx 42rpx, 42rpx 42rpx, auto, auto;
  color: var(--message-cyber-text) !important;
  box-shadow:
    inset 0 0 30rpx rgba(0, 255, 65, 0.1),
    0 0 0 1rpx rgba(0, 255, 65, 0.12),
    0 0 24rpx rgba(0, 255, 65, 0.16),
    0 16rpx 34rpx rgba(0, 0, 0, 0.26) !important;
}

.bubble-wrap--cyber .bubble::before {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 2rpx;
  background: linear-gradient(90deg, transparent, rgba(0, 255, 65, 0.92), transparent);
  opacity: 0.62;
}

.bubble-wrap--cyber .bubble::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    repeating-linear-gradient(
      180deg,
      rgba(186, 255, 200, 0.055) 0,
      rgba(186, 255, 200, 0.055) 1rpx,
      transparent 1rpx,
      transparent 8rpx
    ),
    linear-gradient(115deg, transparent 0, rgba(0, 255, 65, 0.08) 46%, transparent 68%);
  opacity: 0.58;
}

.bubble-wrap--cyber .bubble--assistant {
  background:
    linear-gradient(90deg, rgba(0, 255, 65, 0.045) 1rpx, transparent 1rpx),
    linear-gradient(180deg, rgba(0, 255, 65, 0.035) 1rpx, transparent 1rpx),
    linear-gradient(135deg, rgba(0, 255, 65, 0.12), transparent 38%),
    rgba(0, 13, 4, 0.56) !important;
  background-size: 42rpx 42rpx, 42rpx 42rpx, auto, auto;
  border-top-left-radius: 4rpx;
}

.bubble-wrap--cyber .bubble--user {
  background:
    linear-gradient(90deg, rgba(150, 255, 174, 0.06) 1rpx, transparent 1rpx),
    linear-gradient(180deg, rgba(150, 255, 174, 0.045) 1rpx, transparent 1rpx),
    linear-gradient(135deg, rgba(124, 255, 158, 0.22), transparent 44%),
    rgba(0, 58, 18, 0.6) !important;
  background-size: 42rpx 42rpx, 42rpx 42rpx, auto, auto;
  border-color: rgba(137, 255, 168, 0.42) !important;
  border-top-right-radius: 4rpx;
}

.bubble-wrap--cyber .bubble--assistant-translucent,
.bubble-wrap--cyber .bubble--user-translucent {
  backdrop-filter: blur(3rpx);
}

.bubble-wrap--cyber:not(.bubble-wrap--cyber-active),
.bubble-wrap--cyber:not(.bubble-wrap--cyber-active) * {
  animation: none !important;
}

.bubble-wrap--cyber .part-wrap,
.bubble-wrap--cyber .typing-dots,
.bubble-wrap--cyber .bubble-error {
  position: relative;
  z-index: 1;
}

/* ===== 内容区块 ===== */
.part-wrap {
  &:not(:last-child) { margin-bottom: 16rpx; }
}

.part-text {
  font-size: 13px;
  line-height: 1.2;
  color: var(--up-main-color, #303133);

  :deep(.up-markdown) {
    padding: 1px 2px !important;
    font-size: 13px !important;
    line-height: 1.2 !important;
    color: inherit !important;
  }

  :deep(.up-markdown p) {
    margin: 1px 0 !important;
    line-height: 1.2 !important;
    font-size: 13px !important;
  }

  :deep(.up-markdown text) {
    line-height: 1.2 !important;
    font-size: 13px !important;
    color: inherit !important;
  }

  :deep(.up-markdown ._root) {
    color: inherit !important;
  }

  :deep(.up-markdown rich-text) {
    color: inherit !important;
    font-size: 13px !important;
    line-height: 1.2 !important;
  }

  :deep(.up-markdown ._a) {
    color: inherit !important;
  }

  // 用户消息文本颜色（up-markdown 在 user 气泡内需白色）
  .bubble--user & {
    color: #ffffff;
    :deep(*) { color: #ffffff !important; }
  }
}

.part-text__cyber {
  position: relative;
  min-height: 1em;
}

.part-text__cyber-real {
  opacity: 0;
  visibility: hidden;
  filter: none;
}

.part-text__cyber-overlay {
  position: absolute;
  inset: 0;
  display: block;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  line-height: 1.2;
  font-family: "Courier New", monospace;
  color: rgba(141, 255, 180, 0.92);
  text-shadow: 0 0 12rpx rgba(0, 255, 65, 0.58), 0 0 28rpx rgba(0, 255, 65, 0.18);
  pointer-events: none;
  animation: cyberTextGlitch 0.18s steps(2) infinite;
}

.bubble-wrap--cyber .part-text {
  color: var(--message-cyber-text);

  :deep(*) {
    color: var(--message-cyber-text) !important;
  }

  :deep(code),
  :deep(pre) {
    background: rgba(0, 32, 12, 0.42) !important;
    border-color: rgba(0, 255, 65, 0.18) !important;
    color: rgba(216, 255, 228, 0.9) !important;
  }
}

.bubble-wrap--cyber .part-text__cyber {
  padding: 8rpx 10rpx;
  border-radius: 8rpx;
  background: rgba(0, 28, 10, 0.14);
  border-left: 2rpx solid rgba(0, 255, 65, 0.64);
  box-shadow: inset 0 0 18rpx rgba(0, 255, 65, 0.08);
}

.bubble-wrap--cyber .part-text__cyber-real {
  opacity: 0;
}

.bubble-wrap--cyber .part-text__cyber-overlay {
  inset: 8rpx 10rpx;
}

.bubble-wrap--cyber .part-thinking {
  background: rgba(24, 17, 0, 0.24);
  border-color: rgba(255, 186, 73, 0.26);
  color: rgba(255, 228, 168, 0.9);
  backdrop-filter: blur(2rpx);
  box-shadow: inset 0 0 18rpx rgba(255, 173, 51, 0.06);
}

.bubble-wrap--cyber .part-tool-result,
.bubble-wrap--cyber .part-plan {
  background: rgba(24, 17, 0, 0.38);
  border-color: rgba(255, 186, 73, 0.34);
  color: rgba(255, 228, 168, 0.9);
}

.bubble-wrap--cyber .thinking-hd__label,
.bubble-wrap--cyber .thinking-hd__text,
.bubble-wrap--cyber .tool-result__text,
.bubble-wrap--cyber .tool-result-hd__label,
.bubble-wrap--cyber .plan-hd__label,
.bubble-wrap--cyber .plan-step__text {
  color: rgba(255, 228, 168, 0.9);
}

.bubble-wrap--cyber .dot {
  background-color: #00ff41;
  box-shadow: 0 0 12rpx rgba(0, 255, 65, 0.74);
}

.bubble-wrap--cyber .action-btn {
  background: rgba(0, 22, 8, 0.52);
  border: 1rpx solid rgba(0, 255, 65, 0.18);
}

.bubble-wrap--cyber :deep(.tool-group__summary),
.bubble-wrap--cyber :deep(.tool-block),
.bubble-wrap--cyber :deep(.goal-card),
.bubble-wrap--cyber :deep(.goal-card__body),
.bubble-wrap--cyber :deep(.ask-question-result),
.bubble-wrap--cyber :deep(.ask-question-result__state),
.bubble-wrap--cyber :deep(.ask-question-answer) {
  background:
    linear-gradient(135deg, rgba(0, 255, 65, 0.08), transparent 44%),
    rgba(0, 20, 7, 0.54) !important;
  border-color: rgba(0, 255, 65, 0.26) !important;
  color: var(--message-cyber-text) !important;
  box-shadow: inset 0 0 20rpx rgba(0, 255, 65, 0.07) !important;
}

.bubble-wrap--cyber :deep(.tool-group__label),
.bubble-wrap--cyber :deep(.tool-name),
.bubble-wrap--cyber :deep(.section-label),
.bubble-wrap--cyber :deep(.goal-card__title),
.bubble-wrap--cyber :deep(.goal-card__chip),
.bubble-wrap--cyber :deep(.goal-card__label),
.bubble-wrap--cyber :deep(.goal-card__objective),
.bubble-wrap--cyber :deep(.goal-card__thinking),
.bubble-wrap--cyber :deep(.goal-card__result),
.bubble-wrap--cyber :deep(.goal-card__plan),
.bubble-wrap--cyber :deep(.goal-card__meta),
.bubble-wrap--cyber :deep(.goal-card__markdown),
.bubble-wrap--cyber :deep(.ask-question-result__title),
.bubble-wrap--cyber :deep(.ask-question-result__subtitle),
.bubble-wrap--cyber :deep(.ask-question-answer__header),
.bubble-wrap--cyber :deep(.ask-question-answer__question),
.bubble-wrap--cyber :deep(.ask-question-answer__empty) {
  color: var(--message-cyber-text) !important;
  text-shadow: 0 0 10rpx rgba(0, 255, 65, 0.24);
}

.bubble-wrap--cyber :deep(.code-block) {
  background: rgba(0, 8, 3, 0.62) !important;
  border-color: rgba(0, 255, 65, 0.2) !important;
}

.bubble-wrap--cyber :deep(.code-text) {
  color: rgba(216, 255, 228, 0.9) !important;
}

.bubble-wrap--theme-sweet {
  --message-sweet-text: rgba(122, 40, 79, 0.86);
  --message-sweet-border: rgba(236, 72, 153, 0.16);
}

.bubble-wrap--theme-sweet .bubble {
  position: relative;
  overflow: hidden;
  border-radius: 28rpx;
  border: 1rpx solid var(--message-sweet-border) !important;
  background:
    radial-gradient(circle at 24% 18%, rgba(255, 255, 255, 0.88), transparent 30%),
    linear-gradient(135deg, rgba(255, 221, 239, 0.34), rgba(255, 255, 255, 0.24)),
    rgba(255, 248, 252, 0.42) !important;
  color: var(--message-sweet-text) !important;
  box-shadow:
    inset 0 0 20rpx rgba(255, 255, 255, 0.26),
    0 16rpx 30rpx rgba(244, 114, 182, 0.08) !important;
  backdrop-filter: blur(14rpx);
}

.bubble-wrap--theme-sweet .bubble--user {
  background:
    radial-gradient(circle at 28% 20%, rgba(255, 255, 255, 0.9), transparent 34%),
    linear-gradient(135deg, rgba(255, 194, 227, 0.5), rgba(253, 233, 244, 0.38)),
    rgba(255, 236, 245, 0.46) !important;
  border-color: rgba(236, 72, 153, 0.18) !important;
}

.bubble-wrap--theme-sweet .part-text {
  color: var(--message-sweet-text);

  :deep(*) {
    color: var(--message-sweet-text) !important;
  }
}

.bubble-wrap--theme-sweet .part-thinking,
.bubble-wrap--theme-sweet .part-tool-result,
.bubble-wrap--theme-sweet .part-plan {
  background: rgba(255, 240, 248, 0.34);
  border-color: rgba(236, 72, 153, 0.14);
  color: rgba(145, 52, 97, 0.84);
  box-shadow: inset 0 0 16rpx rgba(255, 255, 255, 0.2);
}

.bubble-wrap--theme-sweet .thinking-hd__label,
.bubble-wrap--theme-sweet .thinking-hd__text,
.bubble-wrap--theme-sweet .tool-result__text,
.bubble-wrap--theme-sweet .tool-result-hd__label,
.bubble-wrap--theme-sweet .plan-hd__label,
.bubble-wrap--theme-sweet .plan-step__text {
  color: rgba(145, 52, 97, 0.84);
}

.bubble-wrap--theme-sweet .dot {
  background-color: #f472b6;
  box-shadow: 0 0 12rpx rgba(244, 114, 182, 0.54);
}

.bubble-wrap--theme-sweet .action-btn {
  background: rgba(255, 255, 255, 0.3);
  border: 1rpx solid rgba(236, 72, 153, 0.12);
}

.bubble-wrap--theme-sweet :deep(.tool-group__summary),
.bubble-wrap--theme-sweet :deep(.tool-block),
.bubble-wrap--theme-sweet :deep(.goal-card),
.bubble-wrap--theme-sweet :deep(.goal-card__body),
.bubble-wrap--theme-sweet :deep(.ask-question-result),
.bubble-wrap--theme-sweet :deep(.ask-question-result__state),
.bubble-wrap--theme-sweet :deep(.ask-question-answer) {
  background:
    radial-gradient(circle at 20% 16%, rgba(255, 255, 255, 0.78), transparent 28%),
    linear-gradient(135deg, rgba(255, 221, 239, 0.28), rgba(255, 255, 255, 0.2)),
    rgba(255, 247, 251, 0.42) !important;
  border-color: rgba(236, 72, 153, 0.14) !important;
  color: var(--message-sweet-text) !important;
  box-shadow: inset 0 0 18rpx rgba(255, 255, 255, 0.18) !important;
}

.bubble-wrap--theme-sweet :deep(.tool-group__label),
.bubble-wrap--theme-sweet :deep(.tool-name),
.bubble-wrap--theme-sweet :deep(.section-label),
.bubble-wrap--theme-sweet :deep(.goal-card__title),
.bubble-wrap--theme-sweet :deep(.goal-card__chip),
.bubble-wrap--theme-sweet :deep(.goal-card__label),
.bubble-wrap--theme-sweet :deep(.goal-card__objective),
.bubble-wrap--theme-sweet :deep(.goal-card__thinking),
.bubble-wrap--theme-sweet :deep(.goal-card__result),
.bubble-wrap--theme-sweet :deep(.goal-card__plan),
.bubble-wrap--theme-sweet :deep(.goal-card__meta),
.bubble-wrap--theme-sweet :deep(.goal-card__markdown),
.bubble-wrap--theme-sweet :deep(.ask-question-result__title),
.bubble-wrap--theme-sweet :deep(.ask-question-result__subtitle),
.bubble-wrap--theme-sweet :deep(.ask-question-answer__header),
.bubble-wrap--theme-sweet :deep(.ask-question-answer__question),
.bubble-wrap--theme-sweet :deep(.ask-question-answer__empty),
.bubble-wrap--theme-sweet :deep(.code-text) {
  color: var(--message-sweet-text) !important;
}

@keyframes cyberTextGlitch {
  0%, 100% { opacity: 0.92; transform: translateX(0); }
  50% { opacity: 0.74; transform: translateX(2rpx); }
}

/* ===== 思考块 ===== */
.part-thinking {
  padding: 16rpx 20rpx;
  background-color: color-mix(in srgb, var(--up-warning, #f9ae3d) 12%, var(--up-card-bg-color, #ffffff) 88%);
  border-radius: 12rpx;
  border-left: 4rpx solid var(--up-warning, #f9ae3d);
  transition: all 0.2s ease;
}

.part-thinking--collapsed {
  padding-bottom: 16rpx;
}

.part-thinking--translucent {
  background: color-mix(in srgb, var(--up-warning, #f9ae3d) 10%, transparent 90%);
  border: 1rpx solid color-mix(in srgb, var(--up-warning, #f9ae3d) 20%, transparent 80%);
  border-left: 4rpx solid var(--up-warning, #f9ae3d);
}

.part-tool-result {
  padding: 16rpx 20rpx;
  background-color: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  border-radius: 12rpx;
  border-left: 4rpx solid var(--up-success, #19be6b);
}

.tool-result-hd {
  display: flex;
  align-items: center;
  gap: 10rpx;
  margin-bottom: 12rpx;
}

.tool-result-hd__label {
  font-size: 24rpx;
  font-weight: 600;
  color: var(--up-success, #19be6b);
}

.tool-result-hd__label--error {
  color: var(--up-error, #fa3534);
}

.tool-result__text {
  font-size: 24rpx;
  color: var(--up-content-color, #606266);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.thinking-hd {
  display: flex;
  align-items: center;
  gap: 10rpx;
  margin-bottom: 12rpx;
  cursor: pointer;
  user-select: none;
}

.part-thinking--collapsed .thinking-hd {
  margin-bottom: 0;
}

.thinking-hd__icon {
  width: 30rpx;
  height: 30rpx;
  flex-shrink: 0;
}

.thinking-hd__arrow {
  margin-left: auto;
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.thinking-bd {
  overflow: hidden;
  transition: max-height 0.25s ease;
}

.thinking-hd__label {
  font-size: 24rpx;
  font-weight: 600;
  color: var(--up-warning, #f9ae3d);
}

.thinking-hd__text {
  font-size: 24rpx;
  color: var(--up-tips-color, #909193);
  line-height: 1.6;
}

/* ===== 计划块 ===== */
.part-plan {
  padding: 16rpx 20rpx;
  background-color: color-mix(in srgb, var(--up-primary, #2979ff) 10%, var(--up-card-bg-color, #ffffff) 90%);
  border-radius: 12rpx;
  border-left: 4rpx solid var(--up-primary, #2979ff);
}

.part-plan--translucent {
  background: color-mix(in srgb, var(--up-primary, #2979ff) 8%, transparent 92%);
  border: 1rpx solid color-mix(in srgb, var(--up-primary, #2979ff) 18%, transparent 82%);
  border-left: 4rpx solid var(--up-primary, #2979ff);
}

.plan-hd {
  display: flex;
  align-items: center;
  gap: 10rpx;
  margin-bottom: 16rpx;
}

.plan-hd__label {
  font-size: 24rpx;
  font-weight: 600;
  color: var(--up-primary, #2979ff);
}

.plan-step {
  display: flex;
  align-items: flex-start;
  gap: 10rpx;
  margin-bottom: 10rpx;

  &:last-child { margin-bottom: 0; }
}

.plan-step__dot {
  width: 24rpx;
  height: 24rpx;
  margin-top: 4rpx;
  border-radius: 50%;
  border: 2rpx solid var(--up-border-color, #dadbde);
  box-sizing: border-box;
  flex-shrink: 0;
}

.plan-step__text {
  flex: 1;
  font-size: 24rpx;
  color: var(--up-content-color, #606266);
  line-height: 1.5;

  &--done {
    color: var(--up-tips-color, #909193);
    text-decoration: line-through;
  }
}

/* ===== 图片 ===== */
.part-image {
  width: 520rpx;
  max-width: 100%;
  margin: 8rpx 0;
  overflow: hidden;
}

.msg-image {
  display: block;
  width: 100%;
  max-width: 100%;
  border-radius: 12rpx;
}

/* ===== 流式动画 ===== */
.typing-dots {
  display: flex;
  gap: 8rpx;
  padding-top: 8rpx;
}

.dot {
  width: 10rpx;
  height: 10rpx;
  background-color: var(--up-border-color, #dadbde);
  border-radius: 50%;
  animation: blink 1.2s infinite ease-in-out;

  &:nth-child(1) { animation-delay: 0s; }
  &:nth-child(2) { animation-delay: 0.2s; }
  &:nth-child(3) { animation-delay: 0.4s; }
}

@keyframes blink {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
  40%            { opacity: 1;   transform: scale(1); }
}

/* ===== 错误 ===== */
.bubble-error {
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-top: 12rpx;
  padding: 12rpx 16rpx;
  background-color: color-mix(in srgb, var(--up-error, #fa3534) 12%, var(--up-card-bg-color, #ffffff) 88%);
  border-radius: 8rpx;
}

.bubble-error__text {
  font-size: 24rpx;
  color: var(--up-error, #fa3534);
}

/* ===== 操作栏 ===== */
.bubble-actions {
  display: none;
  gap: 12rpx;
  opacity: 0;
  transition: opacity 0.2s;

  .bubble-wrap:hover & { opacity: 1; }

  &--user { justify-content: flex-end; }
}

.action-btn {
  width: 48rpx;
  height: 48rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10rpx;
  background-color: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  transition: background-color 0.15s;

  &:active { background-color: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6)); }
}
</style>
