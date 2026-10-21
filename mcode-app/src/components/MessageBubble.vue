<template>
  <!--
    system 轮次（上下文压缩摘要等注入的系统上下文）单独渲染成一条可折叠提示，
    默认收起 —— 对齐 codeg-plus 的 CollapsibleSystemMessage
    （message-list-view.tsx 的 group.role === "system" 分支）。
    它不是用户输入也不是 agent 回复，套普通气泡会让内部说明看起来像正文。

    形制与 `tool-group__summary` / `subagent__summary` **共用同一套**：药丸圆角、
    中性底色、无边框、常规字重。它表达的只是「这里发生过一次压缩」，属于背景信息，
    不该比正文更抢眼 —— 早先那版是橙色告警卡（warning 边框 + 橙底 + info 图标 +
    600 字重橙字），在时间线里读起来像出了错。
  -->
  <view
    v-if="isSystemMessage"
    :class="[
      'system-note',
      detailTheme !== 'default' && `system-note--theme-${detailTheme}`,
    ]"
  >
    <view
      :class="[
        'system-note__summary',
        translucent && 'system-note__summary--translucent',
        systemNoteHasBody && 'system-note__summary--tappable',
      ]"
      @click="toggleSystemNote"
    >
      <!-- 没有正文时不挂箭头：挂一个点不开的箭头比不挂更糟（同 SubagentCapsuleBlock）。 -->
      <up-icon
        v-if="systemNoteHasBody"
        :name="systemNoteExpanded ? 'arrow-down' : 'arrow-right'"
        size="12"
        :color="upThemeVar('--up-light-color', '#c0c4cc')"
      ></up-icon>
      <text class="system-note__label">{{ systemNoteLabel }}</text>
    </view>
    <view v-if="systemNoteExpanded && systemNoteHasBody" class="system-note__body">
      <text class="system-note__text">{{ systemNoteText }}</text>
    </view>
  </view>

  <view
    v-else
    :class="[
      'bubble-wrap',
      `bubble-wrap--${message.role}`,
      detailTheme !== 'default' && `bubble-wrap--theme-${detailTheme}`,
      detailTheme === 'matrix' && 'bubble-wrap--cyber',
      detailTheme === 'matrix' && cyberActive && 'bubble-wrap--cyber-active',
      detailTheme === 'matrix' && `bubble-wrap--cyber-${cyberEffectPhase || 'idle'}`,
      detailTheme === 'sweet' && `bubble-wrap--sweet-${cyberEffectPhase || 'idle'}`,
      detailTheme === 'summer' && `bubble-wrap--summer-${cyberEffectPhase || 'idle'}`,
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
              <up-markdown class="part-text__cyber-real" :content="partMarkdownText(part, index)"></up-markdown>
              <text class="part-text__cyber-overlay">{{ renderCyberDecodeText(part.text || '', index) }}</text>
            </view>
            <up-markdown v-else :content="partMarkdownText(part, index)"></up-markdown>
          </view>

          <!-- 思考 -->
          <view
            v-else-if="part.type === 'thinking'"
            :class="[
              'part-thinking',
              isThinkingCollapsed(index) && 'part-thinking--collapsed',
              !isThinkingCollapsed(index) && 'part-thinking--expanded',
              translucent && 'part-thinking--translucent',
            ]"
          >
            <view class="thinking-hd" @click="toggleThinkingCollapse(index)">
              <image
                class="thinking-hd__icon"
                src="/static/icons/brain.svg"
                mode="aspectFit"
              />
              <text class="thinking-hd__label">思考</text>
              <up-icon
                :name="isThinkingCollapsed(index) ? 'arrow-down' : 'arrow-up'"
                size="12"
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
              :subagentTranscripts="subagentTranscripts"
            />
          </view>

          <!--
            原生子智能体：默认折叠的胶囊。必须排在 `tool_call_group` 之前 ——
            分组分支只接 `tool_call_group`，但顺序写反会让后续维护者以为
            子智能体也能落进通用分组。折叠状态是组件内部 `ref`，用 tool_call id
            作 key，避免像 thinking 那样按下标存状态（气泡的 `v-for` 用的是 index，
            列表一变就串位）。
          -->
          <view v-else-if="part.type === 'subagent_call'" class="part-tool">
            <SubagentCapsuleBlock
              :key="part.tool_call.id"
              :toolCall="part.tool_call"
              :transcript="subagentTranscript(part.tool_call.id)"
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
import type { BubbleDisplayPart, MessageTurn } from "@/types/acp"
import {
  buildCyberDecodeText,
  deriveCyberDecodeRevealProgress,
  type CyberEffectPhase,
  type DetailThemeId,
} from "@/pages/conversation-detail/detailCyberMode"
import { buildBubbleDisplayParts } from "@/services/conversation/bubbleDisplayParts"
import { CONTEXT_CONTINUATION_PREFIX } from "@/services/conversation/conversationTurnIdentity"
import GoalToolCallBlock from "./GoalToolCallBlock.vue"
import SubagentCapsuleBlock from "./SubagentCapsuleBlock.vue"
import ToolCallBlock from "./ToolCallBlock.vue"
import ToolCallGroupBlock from "./ToolCallGroupBlock.vue"
import { normalizeAgentType } from "@/services/conversation/agentType"

const props = defineProps<{
  message: MessageTurn
  agentType?: string
  showRegenerate?: boolean
  translucent?: boolean
  detailTheme?: DetailThemeId
  cyberEffectPhase?: CyberEffectPhase
  cyberActive?: boolean
  /**
   * 子智能体实时正文，按父 tool_call id 索引（`conversationRuntime.getSubagentTranscripts()`）。
   * 只有正在流式的那一轮拿得到值，历史轮次没有 —— 它刻意不落库。
   */
  subagentTranscripts?: Record<string, string>
}>()

const emit = defineEmits<{
  regenerate: []
}>()

const displayParts = computed<BubbleDisplayPart[]>(() =>
  buildBubbleDisplayParts({
    parts: props.message.content || [],
    isStreaming: isStreaming.value,
  })
)

function subagentTranscript(toolCallId: string): string {
  // 容器身份现在是稳定的（store 就地改单个 key），所以这次读取只订阅
  // `[toolCallId]` 这一个属性 —— 别的子智能体来 chunk 时本气泡不再重渲染。
  return props.subagentTranscripts?.[toolCallId] || ""
}

// 思考折叠状态
const manuallyCollapsed = ref<Set<number>>(new Set())
const manuallyExpanded = ref<Set<number>>(new Set())
const cyberTick = ref(0)
let cyberTimer: ReturnType<typeof setInterval> | null = null

// system 轮次：注入的系统上下文（最常见的是上下文压缩摘要），默认折叠。
const systemNoteExpanded = ref(false)
const isSystemMessage = computed(() => props.message.role === "system")
const systemNoteText = computed(() =>
  (props.message.content || [])
    .map((part) => {
      if (part.type === "text") return part.text || ""
      if (part.type === "thinking") return part.thinking || ""
      return ""
    })
    .filter(Boolean)
    .join("\n\n")
    .trim()
)
// 压缩摘要在服务端由内容前缀判定（parsers/claude.rs 的 CONTEXT_CONTINUATION_PREFIX），
// 下发时已经改判成 system，这里只用同一个前缀把标签说得更具体一点。
const systemNoteLabel = computed(() =>
  systemNoteText.value.startsWith(CONTEXT_CONTINUATION_PREFIX)
    ? "上下文已压缩（历史摘要）"
    : "系统消息"
)
// 摘要正文可能是空的（只有前缀、或 part 里没有可取的文本），那时退化成一枚纯胶囊。
const systemNoteHasBody = computed(() => systemNoteText.value.length > 0)

function toggleSystemNote() {
  if (!systemNoteHasBody.value) return
  systemNoteExpanded.value = !systemNoteExpanded.value
}

const isStreaming = computed(() => props.message.status === "streaming")

/**
 * 流式期间喂给 `up-markdown` 的正文做节流。
 *
 * `up-markdown` 的 `watch(content)` 每次变化都 `marked()` **全量**重解析，产出的 HTML
 * 再交给 `up-parse` 重新分词成节点树、Vue 再 diff 一遍新树。对一条正在增长的回复
 * 就是 O(n²)：实测 2000 个 delta / 117K 字符累计 606 ms（仅 marked，桌面 V8，
 * 手机再乘 3~8 倍）。
 *
 * 这里把「尾段文本」的更新降到 ~8 次/秒。正文仍然是 markdown（不是退化成纯文本），
 * 代价只是最多晚 120 ms 出现 —— 而重解析次数按节流比例下降。
 *
 * 只作用于**尾段**：前面那些段在本轮里不会再变，`up-markdown` 的 watch 本来就不会
 * 重新触发。
 */
const STREAMING_MARKDOWN_THROTTLE_MS = 120

const streamingTailText = computed<string | null>(() => {
  if (!isStreaming.value) return null
  const parts = displayParts.value
  const tail = parts[parts.length - 1]
  if (!tail || tail.type !== "text") return null
  return tail.text || ""
})

const throttledStreamingTailText = ref("")
let streamingMarkdownTimer: ReturnType<typeof setTimeout> | null = null

function clearStreamingMarkdownTimer() {
  if (!streamingMarkdownTimer) return
  clearTimeout(streamingMarkdownTimer)
  streamingMarkdownTimer = null
}

watch(
  streamingTailText,
  (next) => {
    if (next === null) {
      // 流式结束、或尾段不再是文本：放开节流，让模板落到 `part.text` 的最终值上。
      // 不能让节流吞掉最后一帧。
      clearStreamingMarkdownTimer()
      throttledStreamingTailText.value = ""
      return
    }
    if (!throttledStreamingTailText.value) {
      // 首帧立即出，避免开头空白一个节流周期。
      throttledStreamingTailText.value = next
      return
    }
    if (streamingMarkdownTimer) return
    streamingMarkdownTimer = setTimeout(() => {
      streamingMarkdownTimer = null
      throttledStreamingTailText.value = streamingTailText.value ?? ""
    }, STREAMING_MARKDOWN_THROTTLE_MS)
  },
  { immediate: true }
)

/**
 * 一个 text part 实际交给 `up-markdown` 的内容。尾段在流式期间走节流镜像，其余原样。
 */
function partMarkdownText(part: BubbleDisplayPart, index: number): string {
  if (
    isStreaming.value &&
    index === displayParts.value.length - 1 &&
    part.type === "text" &&
    throttledStreamingTailText.value
  ) {
    return throttledStreamingTailText.value
  }
  return (part as { text?: string }).text || ""
}

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
const cyberRevealProgress = computed(() =>
  deriveCyberDecodeRevealProgress({
    phase: props.cyberEffectPhase || "idle",
    tick: cyberTick.value,
  })
)
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
  clearStreamingMarkdownTimer()
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
  /* 用户气泡最大宽度按设计稿：272/393 ≈ 69% 视口，且留出左对齐余量 */
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8rpx;

  .bubble-wrap--user & {
    align-items: flex-end;
  }
}

/* 用户气泡自身限宽，AI 正文占满整行（设计稿里 AI 那几段文字顶到左右内距） */
.bubble-wrap--user .bubble-body {
  max-width: 78%;
}

/* ===== 气泡 ===== */
/*
 * 形制对齐设计稿 M09「新配色」：
 * - 用户消息：中性灰气泡靠右，右下角收一个小圆角（18/18/4/18）
 * - AI 消息：**没有气泡**，正文直接铺在页面上
 *
 * AI 侧去掉底色是有意的：连续多条 AI 回复堆叠时，一层层白卡片会把「同一轮对话」
 * 切成一格格独立块，读起来像列表而不像对话。设计稿里 AI 正文与用户气泡靠「右对齐
 * vs 左对齐」就足以区分角色，不需要额外容器。
 *
 * 主题（cyber / sweet / summer）仍各自覆盖 `.bubble` 的底色与边框，
 * 它们的形制不走这套 —— 见下方 `.bubble-wrap--cyber` 等分组。
 */
.bubble {
  border-radius: 20rpx;
  word-break: break-word;

  &--user {
    padding: 10px 14px;
    background-color: var(--bubble-user-bg, #e9e9ee);
    border-radius: 18px 18px 4px 18px;
    color: var(--bubble-user-text, #3c3c43);
  }

  &--user-translucent {
    background-color: color-mix(in srgb, var(--bubble-user-bg, #e9e9ee) 78%, transparent 22%);
    border: 1rpx solid rgba(0, 0, 0, 0.05);
    backdrop-filter: blur(0.1rem);
    box-shadow: 0 10rpx 24rpx rgba(15, 23, 42, 0.04);
  }

  /* AI 气泡：透明容器。保留结构（padding 归零）以便主题覆盖时仍能落笔。 */
  &--assistant {
    padding: 0;
    background-color: transparent;
    border-radius: 0;
    box-shadow: none;
  }

  &--assistant-translucent {
    background-color: transparent;
    border: 0;
    box-shadow: none;
    backdrop-filter: none;
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
  /* AI 气泡去容器后，多段内容（正文 / 工具行）之间的间距要自己给足 */
  &:not(:last-child) { margin-bottom: 12rpx; }
}

.part-text {
  min-width: 0;
  max-width: 100%;
  font-size: 14px;
  /* 设计稿正文 14px / 行高 20px */
  line-height: 20px;
  color: var(--up-main-color, #303133);

  :deep(.up-markdown) {
    padding: 0 !important;
    font-size: 14px !important;
    line-height: 20px !important;
    color: inherit !important;
  }

  :deep(.up-markdown p) {
    margin: 0 !important;
    line-height: 20px !important;
    font-size: 14px !important;
  }

  :deep(.up-markdown text) {
    line-height: 20px !important;
    font-size: 14px !important;
    color: inherit !important;
  }

  :deep(.up-markdown rich-text) {
    color: inherit !important;
    font-size: 14px !important;
    line-height: 20px !important;
  }

  :deep(.up-markdown ._a) {
    color: inherit !important;
  }

  :deep(.up-markdown) {
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
  }

  /*
   * `._root` 不能是滚动容器。
   *
   * 原先这里（以及 u-parse 自己的 `._root`）带 `overflow-x: auto` +
   * `-webkit-overflow-scrolling: touch`，于是纵向 scroll-view 里**每条消息**
   * （多 text part 时更多）各自成为一个动量滚动容器：iOS WKWebView 下每个都是一个
   * 独立合成层，还会和外层纵向滚动抢手势 —— 手指稍微斜一点就被内层横向滚动捕获，
   * 列表不动。230 条消息就是几百个嵌套滚动容器。
   *
   * 横向滚动下移到真正需要的 `.up-markdown-code` 与 `table` 上（见下面两条）；
   * 长 URL 这类不可断词的内容改为强制换行，而不是溢出。
   */
  :deep(.up-markdown ._root) {
    color: inherit !important;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    -webkit-overflow-scrolling: auto;
    overflow-wrap: anywhere;
  }

  /*
   * 表格自己当滚动容器，宽度必须**受父级约束**。
   *
   * 上一版写的是 `width: max-content` + `min-width: 100%`：列宽确实可读了，但
   * `max-content` 让表格元素本身撑到内容宽度（实测 401px / 容器 360px），它自己
   * 没有可滚动溢出（`scrollWidth === clientWidth`），超出的部分被祖先
   * `.up-markdown / ._root` 的 `overflow: hidden` 直接裁掉 —— 屏幕上就是
   * 「右侧被遮挡、还划不动」。
   *
   * 改成 `width: 100%` + `overflow-x: auto`：
   * - 内容窄 → 铺满整行，单元格靠 `min-width: 4em` 保住可读列宽，文字在格内换行；
   * - 列多到 4em 下限加起来超出容器 → 匿名表盒变宽、超出部分由这层壳横向滚动
   *   （7 列实测 scrollWidth 456 > clientWidth 360）；
   * - 长哈希这类不可断词 → 由 `word-break: break-word` 换行，不再顶出屏幕。
   *
   * 不能用「把 thead/tbody 各自变成 `display: table` + `max-content`」那种写法换
   * 滚动：实测表头与表体是两个独立表盒，列宽各算各的（表头全 72px、表体
   * 65/114/65…），表头会和数据错位。
   */
  :deep(table),
  :deep(._table) {
    display: block;
    width: 100%;
    max-width: 100%;
    margin: 12rpx 0;
    border-collapse: collapse;
    background: var(--up-card-bg-color, #ffffff);
    color: var(--up-main-color, #303133);
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    box-sizing: border-box;
  }

  :deep(thead),
  :deep(._thead) {
    background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  }

  :deep(tbody),
  :deep(._tbody) {
    background: transparent;
  }

  :deep(tr),
  :deep(._tr) {
    border-bottom: 1rpx solid var(--up-border-color, #dadbde);
  }

  :deep(th),
  :deep(td),
  :deep(._th),
  :deep(._td) {
    padding: 8rpx 12rpx;
    border: 1rpx solid var(--up-border-color, #dadbde);
    color: inherit;
    text-align: left;
    vertical-align: top;
    /*
     * 单元格用 `break-word` 而不是 `break-all`：前者只在「整词放不下」时才断，
     * 后者允许在任意字符间断行 —— 中文短表头（子模块 / 记录 / 卡点）被挤时
     * 就会变成一列一个字。`break-word` 配合上面的 max-content 列宽，
     * 既能让长哈希换行，又不会把短词拆碎。
     */
    word-break: break-word;
    /* 表格比正文降一档：13px / 行高 19px。表格里的内容本来就是「索引式」的
       短词（哈希、路径、状态），跟正文同字号会显得拥挤。 */
    font-size: 13px;
    line-height: 19px;
    /* 单元格给一个温和的下限，避免只有一两个字的表头把列压成细条。
       取 4em 而不是更大：列数多时（5 列以上）过大的下限会把整张表推出屏幕，
       而那些场景本来靠 max-content + 横向滚动就够了。 */
    min-width: 4em;
  }

  /* 列表 / 引用同样吃浏览器的默认外边距（ul 上下各 1em ≈ 16px、缩进 40px），
     在窄屏消息流里比正文段落（margin 0）松得多，读起来一段紧一段散。
     统一收到与行高同量级，缩进也按移动端收窄。 */
  :deep(ul), :deep(ol),
  :deep(._ul), :deep(._ol) {
    margin: 6rpx 0 !important;
    padding-left: 36rpx !important;
  }

  :deep(li), :deep(._li) {
    margin: 4rpx 0;
    /* 列表项内可能换行，行高给足 21px（14px 字的 1.5）避免折行上下贴住 */
    line-height: 21px !important;
  }

  :deep(blockquote), :deep(._blockquote) {
    margin: 10rpx 0 !important;
    padding: 6rpx 0 6rpx 16rpx;
    border-left: 3rpx solid var(--up-border-color, #dadbde);
    color: var(--up-content-color, #606266);
    line-height: 21px;
  }

  :deep(th),
  :deep(._th) {
    font-weight: 600;
    color: var(--up-main-color, #303133);
  }

  /*
   * 标题必须显式给定字号与行高。
   *
   * 这里原先**一条标题规则都没有**，于是 markdown 的 `##` 落到浏览器默认值：
   * h2 = 1.5em ≈ 21px。而外层 `.up-markdown` 带 `line-height: 20px !important`，
   * 行高会继承下去 —— 21px 的字挤在 20px 的行高里，上下两行直接咬在一起。
   *
   * 现在按正文 14px 的 1.2~1.4 倍重新标定：h1 17px / h2 16px / h3 15px，
   * 行高各自给足（h2 用 22px > 16px 字号）。行高必须带 `!important`，
   * 否则会被父级那条 20px 的继承规则盖掉。
   *
   * 段前间距也一起收：浏览器默认 h2 上下各 0.83em ≈ 17px，在窄屏消息流里
   * 会凭空多出一大块空白，比正文段落间距（0）突兀得多。
   */
  :deep(h1), :deep(h2), :deep(h3), :deep(h4), :deep(h5), :deep(h6),
  :deep(._h1), :deep(._h2), :deep(._h3), :deep(._h4), :deep(._h5), :deep(._h6) {
    margin: 14rpx 0 8rpx !important;
    font-weight: 600;
    color: var(--up-main-color, #303133);
  }

  :deep(h1), :deep(._h1) {
    font-size: 17px !important;
    line-height: 24px !important;
  }

  :deep(h2), :deep(._h2) {
    font-size: 16px !important;
    line-height: 22px !important;
  }

  :deep(h3), :deep(._h3) {
    font-size: 15px !important;
    line-height: 21px !important;
  }

  :deep(h4), :deep(h5), :deep(h6),
  :deep(._h4), :deep(._h5), :deep(._h6) {
    font-size: 14px !important;
    line-height: 20px !important;
  }

  /* 首尾标题不该在气泡上下各撑出一段空白 */
  :deep(h1):first-child, :deep(h2):first-child, :deep(h3):first-child,
  :deep(._h1):first-child, :deep(._h2):first-child, :deep(._h3):first-child {
    margin-top: 0 !important;
  }

  :deep(tbody tr:nth-child(even)),
  :deep(._tbody ._tr:nth-child(even)) {
    background: color-mix(in srgb, var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6)) 55%, transparent 45%);
  }

  /* 代码块自己承担横向滚动。原先是 `width: max-content` + `overflow: visible`，
     靠父级 `._root` 滚动 —— 那正是上面要去掉的东西。改成自己是滚动容器后，
     动量滚动层的数量从「每条消息一个」降到「每个代码块一个」。 */
  :deep(.up-markdown-code) {
    width: auto;
    min-width: 0;
    max-width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    white-space: pre;
    word-break: normal;
    overflow-wrap: normal;
    box-sizing: border-box;
  }

  // 用户消息文本颜色（中性灰气泡内用深色正文）
  .bubble--user & {
    color: var(--bubble-user-text, #3c3c43);
    :deep(*) { color: var(--bubble-user-text, #3c3c43) !important; }
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
.bubble-wrap--cyber :deep(.ask-question-answer),
.bubble-wrap--cyber :deep(.subagent__summary),
.bubble-wrap--cyber :deep(.subagent__body),
.bubble-wrap--cyber :deep(.subagent__error) {
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
.bubble-wrap--cyber :deep(.ask-question-answer__empty),
.bubble-wrap--cyber :deep(.subagent__title),
.bubble-wrap--cyber :deep(.subagent__status),
.bubble-wrap--cyber :deep(.subagent__duration),
.bubble-wrap--cyber :deep(.subagent__label),
.bubble-wrap--cyber :deep(.subagent__prompt),
.bubble-wrap--cyber :deep(.subagent__transcript),
.bubble-wrap--cyber :deep(.subagent__tool-name),
.bubble-wrap--cyber :deep(.subagent__tool-preview),
.bubble-wrap--cyber :deep(.subagent__truncated),
.bubble-wrap--cyber :deep(.subagent__meta) {
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

.bubble-wrap--cyber :deep(table),
.bubble-wrap--cyber :deep(._table) {
  background: rgba(0, 13, 4, 0.68) !important;
  color: var(--message-cyber-text) !important;
}

.bubble-wrap--cyber :deep(thead),
.bubble-wrap--cyber :deep(._thead) {
  background: rgba(0, 255, 65, 0.1) !important;
}

.bubble-wrap--cyber :deep(tbody),
.bubble-wrap--cyber :deep(._tbody) {
  background: transparent !important;
}

.bubble-wrap--cyber :deep(tr),
.bubble-wrap--cyber :deep(._tr),
.bubble-wrap--cyber :deep(th),
.bubble-wrap--cyber :deep(td),
.bubble-wrap--cyber :deep(._th),
.bubble-wrap--cyber :deep(._td) {
  border-color: rgba(0, 255, 65, 0.26) !important;
  color: var(--message-cyber-text) !important;
}

.bubble-wrap--cyber :deep(th),
.bubble-wrap--cyber :deep(._th) {
  background: rgba(0, 255, 65, 0.12) !important;
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
  /* 原 #f472b6 在近白气泡上峰值对比度只有 2.59，动画谷值 1.53，实测几乎看不见。 */
  background-color: #db2777;
  box-shadow: 0 0 12rpx rgba(219, 39, 119, 0.54);
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
.bubble-wrap--theme-sweet :deep(.ask-question-answer),
.bubble-wrap--theme-sweet :deep(.subagent__summary),
.bubble-wrap--theme-sweet :deep(.subagent__body),
.bubble-wrap--theme-sweet :deep(.subagent__error) {
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
.bubble-wrap--theme-sweet :deep(.code-text),
.bubble-wrap--theme-sweet :deep(.subagent__title),
.bubble-wrap--theme-sweet :deep(.subagent__status),
.bubble-wrap--theme-sweet :deep(.subagent__duration),
.bubble-wrap--theme-sweet :deep(.subagent__label),
.bubble-wrap--theme-sweet :deep(.subagent__prompt),
.bubble-wrap--theme-sweet :deep(.subagent__transcript),
.bubble-wrap--theme-sweet :deep(.subagent__tool-name),
.bubble-wrap--theme-sweet :deep(.subagent__tool-preview),
.bubble-wrap--theme-sweet :deep(.subagent__truncated),
.bubble-wrap--theme-sweet :deep(.subagent__meta) {
  color: var(--message-sweet-text) !important;
}

.bubble-wrap--theme-sweet :deep(table),
.bubble-wrap--theme-sweet :deep(._table) {
  background: rgba(255, 248, 252, 0.64) !important;
  color: var(--message-sweet-text) !important;
}

.bubble-wrap--theme-sweet :deep(thead),
.bubble-wrap--theme-sweet :deep(._thead) {
  background: rgba(236, 72, 153, 0.1) !important;
}

.bubble-wrap--theme-sweet :deep(tbody),
.bubble-wrap--theme-sweet :deep(._tbody) {
  background: transparent !important;
}

.bubble-wrap--theme-sweet :deep(tr),
.bubble-wrap--theme-sweet :deep(._tr),
.bubble-wrap--theme-sweet :deep(th),
.bubble-wrap--theme-sweet :deep(td),
.bubble-wrap--theme-sweet :deep(._th),
.bubble-wrap--theme-sweet :deep(._td) {
  border-color: rgba(236, 72, 153, 0.2) !important;
  color: var(--message-sweet-text) !important;
}

.bubble-wrap--theme-sweet :deep(th),
.bubble-wrap--theme-sweet :deep(._th) {
  background: rgba(236, 72, 153, 0.1) !important;
}

.bubble-wrap--theme-summer {
  --message-summer-text: rgba(8, 85, 109, 0.9);
  --message-summer-border: rgba(14, 136, 165, 0.2);
  --message-summer-subtle: rgba(11, 122, 146, 0.82);
}

.bubble-wrap--theme-summer .bubble {
  position: relative;
  overflow: hidden;
  border-radius: 28rpx;
  border: 1rpx solid var(--message-summer-border) !important;
  background:
    radial-gradient(circle at 24% 18%, rgba(255, 255, 255, 0.88), transparent 32%),
    linear-gradient(135deg, rgba(202, 244, 255, 0.34), rgba(255, 255, 255, 0.22)),
    rgba(239, 252, 255, 0.38) !important;
  color: var(--message-summer-text) !important;
  box-shadow:
    inset 0 0 20rpx rgba(255, 255, 255, 0.24),
    0 16rpx 30rpx rgba(11, 101, 128, 0.1) !important;
  backdrop-filter: blur(14rpx);
}

.bubble-wrap--theme-summer .bubble--user {
  background:
    radial-gradient(circle at 28% 20%, rgba(255, 255, 255, 0.88), transparent 30%),
    linear-gradient(135deg, rgba(255, 222, 191, 0.44), rgba(255, 149, 169, 0.2)),
    rgba(255, 247, 232, 0.42) !important;
  border-color: rgba(244, 63, 94, 0.16) !important;
}

.bubble-wrap--theme-summer .part-text {
  color: var(--message-summer-text);

  :deep(*) {
    color: var(--message-summer-text) !important;
  }
}

.bubble-wrap--theme-summer .part-thinking,
.bubble-wrap--theme-summer .part-tool-result,
.bubble-wrap--theme-summer .part-plan {
  background: rgba(237, 250, 255, 0.28);
  border-color: rgba(14, 136, 165, 0.14);
  color: rgba(8, 85, 109, 0.86);
  box-shadow: inset 0 0 16rpx rgba(255, 255, 255, 0.18);
}

.bubble-wrap--theme-summer .thinking-hd__label,
.bubble-wrap--theme-summer .thinking-hd__text,
.bubble-wrap--theme-summer .tool-result__text,
.bubble-wrap--theme-summer .tool-result-hd__label,
.bubble-wrap--theme-summer .plan-hd__label,
.bubble-wrap--theme-summer .plan-step__text {
  color: rgba(8, 85, 109, 0.86);
}

.bubble-wrap--theme-summer .dot {
  /* 同 sweet：#fb7185 在浅暖气泡上峰值 2.62，压不住背景。 */
  background-color: #e11d48;
  box-shadow: 0 0 12rpx rgba(225, 29, 72, 0.42);
}

.bubble-wrap--theme-summer .action-btn {
  background: rgba(255, 255, 255, 0.24);
  border: 1rpx solid rgba(14, 136, 165, 0.12);
}

.bubble-wrap--theme-summer :deep(.tool-group__summary),
.bubble-wrap--theme-summer :deep(.tool-block),
.bubble-wrap--theme-summer :deep(.goal-card),
.bubble-wrap--theme-summer :deep(.goal-card__body),
.bubble-wrap--theme-summer :deep(.ask-question-result),
.bubble-wrap--theme-summer :deep(.ask-question-result__state),
.bubble-wrap--theme-summer :deep(.ask-question-answer),
.bubble-wrap--theme-summer :deep(.subagent__summary),
.bubble-wrap--theme-summer :deep(.subagent__body),
.bubble-wrap--theme-summer :deep(.subagent__error) {
  background:
    radial-gradient(circle at 20% 16%, rgba(255, 255, 255, 0.76), transparent 28%),
    linear-gradient(135deg, rgba(210, 244, 255, 0.28), rgba(255, 255, 255, 0.18)),
    rgba(236, 251, 255, 0.34) !important;
  border-color: rgba(14, 136, 165, 0.14) !important;
  color: var(--message-summer-text) !important;
  box-shadow: inset 0 0 18rpx rgba(255, 255, 255, 0.16) !important;
}

.bubble-wrap--theme-summer :deep(.tool-group__label),
.bubble-wrap--theme-summer :deep(.tool-name),
.bubble-wrap--theme-summer :deep(.section-label),
.bubble-wrap--theme-summer :deep(.goal-card__title),
.bubble-wrap--theme-summer :deep(.goal-card__chip),
.bubble-wrap--theme-summer :deep(.goal-card__label),
.bubble-wrap--theme-summer :deep(.goal-card__objective),
.bubble-wrap--theme-summer :deep(.goal-card__thinking),
.bubble-wrap--theme-summer :deep(.goal-card__result),
.bubble-wrap--theme-summer :deep(.goal-card__plan),
.bubble-wrap--theme-summer :deep(.goal-card__meta),
.bubble-wrap--theme-summer :deep(.goal-card__markdown),
.bubble-wrap--theme-summer :deep(.ask-question-result__title),
.bubble-wrap--theme-summer :deep(.ask-question-result__subtitle),
.bubble-wrap--theme-summer :deep(.ask-question-answer__header),
.bubble-wrap--theme-summer :deep(.ask-question-answer__question),
.bubble-wrap--theme-summer :deep(.ask-question-answer__empty),
.bubble-wrap--theme-summer :deep(.code-text),
.bubble-wrap--theme-summer :deep(.subagent__title),
.bubble-wrap--theme-summer :deep(.subagent__status),
.bubble-wrap--theme-summer :deep(.subagent__duration),
.bubble-wrap--theme-summer :deep(.subagent__label),
.bubble-wrap--theme-summer :deep(.subagent__prompt),
.bubble-wrap--theme-summer :deep(.subagent__transcript),
.bubble-wrap--theme-summer :deep(.subagent__tool-name),
.bubble-wrap--theme-summer :deep(.subagent__tool-preview),
.bubble-wrap--theme-summer :deep(.subagent__truncated),
.bubble-wrap--theme-summer :deep(.subagent__meta) {
  color: var(--message-summer-text) !important;
}

.bubble-wrap--theme-summer :deep(table),
.bubble-wrap--theme-summer :deep(._table) {
  background: rgba(239, 252, 255, 0.64) !important;
  color: var(--message-summer-text) !important;
}

.bubble-wrap--theme-summer :deep(thead),
.bubble-wrap--theme-summer :deep(._thead) {
  background: rgba(14, 136, 165, 0.1) !important;
}

.bubble-wrap--theme-summer :deep(tbody),
.bubble-wrap--theme-summer :deep(._tbody) {
  background: transparent !important;
}

.bubble-wrap--theme-summer :deep(tr),
.bubble-wrap--theme-summer :deep(._tr),
.bubble-wrap--theme-summer :deep(th),
.bubble-wrap--theme-summer :deep(td),
.bubble-wrap--theme-summer :deep(._th),
.bubble-wrap--theme-summer :deep(._td) {
  border-color: rgba(14, 136, 165, 0.2) !important;
  color: var(--message-summer-text) !important;
}

.bubble-wrap--theme-summer :deep(th),
.bubble-wrap--theme-summer :deep(._th) {
  background: rgba(14, 136, 165, 0.1) !important;
}

@keyframes cyberTextGlitch {
  0%, 100% { opacity: 0.92; transform: translateX(0); }
  50% { opacity: 0.74; transform: translateX(2rpx); }
}

/* ===== 思考块 ===== */
/*
 * 思考块**没有背景、没有边框、没有内距**。
 *
 * 它和工具行、系统消息同属「时间线上的弱提示」，不是正文卡片。加了底色和
 * 16rpx/20rpx 内距之后有两处坏处：
 * 1. 文字左沿比正文（padding 0）右移了 10px，同一条消息里几段内容左边界参差；
 * 2. 额外的上下内距让折叠态那一行在消息流里显得又高又松，和工具行不成节奏。
 *
 * 所以内距归零、底色透明，只用 22rpx 的弱色文字 + 图标表达「这是思考」。
 * 展开态也**不再切卡片**（原先切 12rpx 圆角 + 16rpx 内距），只靠下方正文的
 * 左缩进区分层级 —— 否则一展开就跳一下间距。
 */
.part-thinking {
  display: flex;
  flex-direction: column;
  align-self: flex-start;
  width: fit-content;
  max-width: 100%;
  box-sizing: border-box;
  padding: 0;
  background: none;
  border: none;
  border-radius: 0;
  transition: none;
}

/*
 * 折叠态 / 展开态都不再是药丸或卡片，只是普通的一行 + 可选正文。
 *
 * 原先折叠态要对齐 `tool-group__summary` 的药丸度量（min-height 48rpx + 10/18 内距），
 * 那是在有底色时的约束；现在没有底色，48rpx 的 min-height 反而会让这一行
 * 比工具行更高、更空。所以两个状态都退回内容高度。
 */
.part-thinking--collapsed {
  min-height: 0;
  padding: 0;
  width: fit-content;
  border-radius: 0;
  border: none;
  justify-content: center;
}

.part-thinking--expanded {
  width: 100%;
  box-sizing: border-box;
  border-radius: 0;
  padding: 0;
}

.part-thinking--translucent {
  background: none;
  border: none;
}

/* `--translucent` 排在 `--collapsed` 之后且同为单类选择器，会把边框重新加回来。 */
.part-thinking--collapsed.part-thinking--translucent {
  border: none;
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
  cursor: pointer;
  user-select: none;
}

.part-thinking--collapsed .thinking-hd {
  margin-bottom: 0;
}

.thinking-hd__icon {
  /* 24rpx 图标 + 上下各 10rpx 内距正好落在 48rpx 药丸里；30rpx 会把药丸顶高。 */
  width: 24rpx;
  height: 24rpx;
  flex-shrink: 0;
}

.thinking-hd__arrow {
  margin-left: auto;
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.thinking-bd {
  overflow: hidden;
  /* 无底色后 10rpx 的间距看起来比有卡片时更空，收到 6rpx 与标题行贴紧 */
  margin-top: 6rpx;
  /* 正文左缩进对齐标题文字的起始位置（图标 24rpx + gap 10rpx），形成层级 */
  padding-left: 34rpx;
  transition: max-height 0.25s ease;
}

.thinking-hd__label {
  font-size: 22rpx;
  line-height: 1.2;
  font-weight: 600;
  color: var(--up-warning, #f9ae3d);
}

.thinking-hd__text {
  font-size: 24rpx;
  color: var(--up-tips-color, #909193);
  line-height: 1.6;
}

/* =====
   系统消息（上下文压缩摘要等注入上下文），默认折叠。

   形制与 `tool-group__summary` / `subagent__summary` 逐条对齐：药丸圆角 999rpx、
   中性 `--up-hover-bg-color` 底、**无边框**、22rpx 常规字重、箭头 12rpx +
   `--up-light-color`。这三处是同一类「可展开的中性摘要控件」，不该各长一个样。
   ===== */
.system-note {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10rpx;
  margin: 12rpx 0;
  width: 100%;
}

.system-note__summary {
  min-height: 48rpx;
  padding: 10rpx 18rpx;
  border-radius: 999rpx;
  background: color-mix(in srgb, var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6)) 60%, var(--up-card-bg-color, #ffffff) 40%);
  display: flex;
  align-items: center;
  align-self: flex-start;
  max-width: 100%;
  gap: 10rpx;
  box-sizing: border-box;
}

.system-note__summary--translucent {
  background: color-mix(in srgb, var(--up-card-bg-color, #ffffff) 36%, transparent 64%);
}

.system-note__summary--tappable:active {
  opacity: 0.72;
}

.system-note__label {
  font-size: 22rpx;
  line-height: 1.2;
  color: var(--up-content-color, #606266);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.system-note__body {
  width: 100%;
  padding: 16rpx;
  border-radius: 18rpx;
  background: color-mix(in srgb, var(--up-card-bg-color, #ffffff) 82%, transparent 18%);
  border: 1rpx solid color-mix(in srgb, var(--up-border-color, #dadbde) 62%, transparent 38%);
  box-sizing: border-box;
}

.system-note__text {
  display: block;
  font-size: 24rpx;
  color: var(--up-tips-color, #909193);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

/*
  主题覆盖挂在 `.system-note--theme-*` 上，**不能**复用下面那三份
  `.bubble-wrap--cyber :deep(...)` 列表 —— `.system-note` 是 `.bubble-wrap` 的
  `v-else` 兄弟节点，主题类挂在 `.bubble-wrap` 上时选择器根本落不到它身上。
  往那些列表里加 `system-note__*` 会写出一条永不命中的死规则。

  只改配色、不改形制：圆角/内距/字号继续由上面那份基础规则统一，与
  `tool-group__summary` 保持同一套。
*/
.system-note--theme-matrix .system-note__summary {
  background:
    linear-gradient(135deg, rgba(0, 255, 65, 0.08), transparent 44%),
    rgba(0, 20, 7, 0.54);
}

.system-note--theme-matrix .system-note__label {
  color: rgba(186, 255, 200, 0.88);
}

.system-note--theme-matrix .system-note__body {
  background: rgba(0, 13, 4, 0.56);
  border-color: rgba(0, 255, 65, 0.26);
}

.system-note--theme-matrix .system-note__text {
  color: rgba(186, 255, 200, 0.72);
}

.system-note--theme-sweet .system-note__summary {
  background:
    linear-gradient(135deg, rgba(255, 221, 239, 0.34), rgba(255, 255, 255, 0.24)),
    rgba(255, 248, 252, 0.42);
}

.system-note--theme-sweet .system-note__label {
  color: rgba(122, 40, 79, 0.86);
}

.system-note--theme-sweet .system-note__body {
  background: rgba(255, 248, 252, 0.42);
  border-color: rgba(236, 72, 153, 0.16);
}

.system-note--theme-sweet .system-note__text {
  color: rgba(122, 40, 79, 0.7);
}

.system-note--theme-summer .system-note__summary {
  background:
    linear-gradient(135deg, rgba(210, 244, 255, 0.28), rgba(255, 255, 255, 0.18)),
    rgba(236, 251, 255, 0.34);
}

.system-note--theme-summer .system-note__label {
  color: rgba(8, 85, 109, 0.9);
}

.system-note--theme-summer .system-note__body {
  background: rgba(239, 252, 255, 0.38);
  border-color: rgba(14, 136, 165, 0.2);
}

.system-note--theme-summer .system-note__text {
  color: rgba(8, 85, 109, 0.74);
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
  align-items: center;
  gap: 8rpx;
  padding-top: 8rpx;
  /* 点原本紧贴气泡下沿（.bubble 只有 4px 6px 内距），视觉上像被裁掉半个。 */
  padding-bottom: 16rpx;
  /* 正文左沿 = .bubble 的 6px + .up-markdown 自带的 2px；点没有那层内距，补 4rpx(=2px)。 */
  padding-left: 4rpx;
}

.dot {
  width: 12rpx;
  height: 12rpx;
  /*
   * 走灰色系而不是强调色蓝：三个点是「还在生成」的弱提示，不该抢主色的注意力。
   * 灰阶里 --up-border-color / --up-tips-color 都太淡（实测白气泡上峰值对比度
   * 3.15 以下，动画谷值掉到 1.58），--up-content-color 峰值 6.11、谷值 1.98，
   * 比原先的蓝（3.98 / 1.80）反而更清楚。
   */
  background-color: var(--up-content-color, #606266);
  border-radius: 50%;
  animation: blink 1.2s infinite ease-in-out;

  &:nth-child(1) { animation-delay: 0s; }
  &:nth-child(2) { animation-delay: 0.2s; }
  &:nth-child(3) { animation-delay: 0.4s; }
}

@keyframes blink {
  0%, 80%, 100% { opacity: 0.45; transform: scale(0.8); }
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
