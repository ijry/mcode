<template>
  <view
    :class="[
      'conv-row',
      `conv-row--${layout.showLeadingLogo ? 'leading-logo' : 'plain'}`,
      selectionMode && selectable && 'conv-row--selecting',
      selected && 'conv-row--selected',
    ]"
    @click="handleClick"
    @longpress="handleLongPress"
  >
    <!-- 批量选择：只在选择模式且有可选中身份时出现，避免「点了个不能选的会话」。 -->
    <view
      v-if="selectionMode && selectable"
      :class="['conv-row__check', selected && 'conv-row__check--active']"
      @click.stop="emit('toggle-select')"
    >
      <up-icon v-if="selected" name="checkmark" size="13" color="#ffffff"></up-icon>
    </view>

    <!--
      行首 Logo（仅「Logo 版」）。
      22×22 与设计稿节点 9:1549 一致；圆角给 7 让它在两行文字左侧不至于像一枚生硬的方块。
    -->
    <view v-if="layout.showLeadingLogo" :class="['conv-row__logo', logoClass, hasLogoAsset && 'conv-row__logo--real']">
      <image v-if="hasLogoAsset" class="conv-row__logo-img" :src="logoPath" mode="aspectFit" />
      <text v-else class="conv-row__logo-text">{{ logoText }}</text>
    </view>

    <view class="conv-row__info">
      <text class="conv-row__title">{{ title }}</text>

      <view class="conv-row__meta">
        <!-- 名称前缀 Logo（仅「名称前缀 Logo 版」）：14×14，与智能体名同基线。 -->
        <view
          v-if="layout.showInlineLogo"
          :class="['conv-row__inline-logo', logoClass, hasLogoAsset && 'conv-row__inline-logo--real']"
        >
          <image v-if="hasLogoAsset" class="conv-row__inline-logo-img" :src="logoPath" mode="aspectFit" />
          <text v-else class="conv-row__inline-logo-text">{{ logoText }}</text>
        </view>

        <text class="conv-row__agent">{{ agentLabel }}</text>
        <text
          v-if="statusText"
          :class="['conv-row__status', `conv-row__status--${statusTone}`]"
          >· {{ statusText }}</text
        >
        <text class="conv-row__time">{{ timeText }}</text>
      </view>

      <!--
        流式中的实时预览。
        设计稿是静态快照，没有这一行；但去掉它等于把「这个会话正在吐什么」这个唯一
        的实时信号藏起来 —— 只在真的有 `livePreviewText` 时渲染，静态列表与设计稿一致。
      -->
      <view v-if="previewText" class="conv-row__preview">
        <MarqueeText class="conv-row__preview-text" :text="previewText" />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue"
import MarqueeText from "@/components/MarqueeText.vue"
import {
  formatOverviewAgentLabel,
  overviewAgentLogoClass,
  overviewAgentLogoPath,
  overviewAgentLogoText,
} from "../conversationOverviewPresentation"
import {
  resolveConversationListRowLayout,
  resolveRowStatusText,
  resolveRowStatusTone,
  resolveRowTimeText,
  resolveRowTitle,
  type ConversationListStyleId,
} from "../conversationListPresentation"

/**
 * 会话列表里的一行。
 *
 * 三种展示形态的差别**只在 Logo 位置与分隔线缩进**，文字层级完全一致：
 * 标题 15px/21（最多两行）+ 元信息行 12px（智能体 · 状态 + 右对齐时间）。
 * 形态差异由 `resolveConversationListRowLayout` 统一裁决，这里不判断样式 id。
 */
const props = defineProps<{
  title?: string
  agentType?: string
  displayStatus?: string
  /** 这个会话在别的端开着（旧版用「标签」角标表达，现在落到状态位）。 */
  isOpenTab?: boolean
  updatedAt?: string
  previewText?: string
  listStyle: ConversationListStyleId
  selectionMode?: boolean
  selectable?: boolean
  selected?: boolean
}>()

const emit = defineEmits<{
  (event: "open"): void
  (event: "toggle-select"): void
  /** 长按。菜单由页面弹 —— 只有页面知道连接、网关和刷新链路。 */
  (event: "menu"): void
}>()

/**
 * 长按之后要不要再当一次点击。
 *
 * 部分端（H5 尤其明显）在长按结束、手指抬起时还会补发一次 click。不吞掉它的话，
 * 长按的结果是「菜单弹出来了，会话也顺手被打开了」—— 用户只想看菜单。
 * 这个标记在补发的 click 里被消费掉，下一次正常点击不受影响。
 */
let longPressConsumedClick = false

function handleLongPress() {
  longPressConsumedClick = true
  emit("menu")
}

function handleClick() {
  if (longPressConsumedClick) {
    longPressConsumedClick = false
    return
  }
  emit("open")
}

const layout = computed(() => resolveConversationListRowLayout(props.listStyle))
const title = computed(() => resolveRowTitle(props.title))
const agentLabel = computed(() => formatOverviewAgentLabel(props.agentType))
const statusText = computed(() =>
  resolveRowStatusText(props.displayStatus || "", props.isOpenTab === true)
)
const statusTone = computed(() => resolveRowStatusTone(props.displayStatus || ""))
const timeText = computed(() => resolveRowTimeText(props.updatedAt))
const previewText = computed(() => String(props.previewText || "").trim())

const logoPath = computed(() => overviewAgentLogoPath(props.agentType || ""))
const hasLogoAsset = computed(() => Boolean(logoPath.value))
const logoClass = computed(() =>
  // 复用共享的类型归一化结果，但换成行组件自己的命名空间：共享的 `.agent-logo--*`
  // 是「有 SVG 资源时」的白底描边，行里的兜底是**彩色渐变方块**，两套规则不能同名。
  overviewAgentLogoClass(props.agentType || "").replace("agent-logo--", "conv-row__logo--")
)
const logoText = computed(() => overviewAgentLogoText(props.agentType || ""))
</script>

<style scoped lang="scss">
.conv-row {
  display: flex;
  align-items: flex-start;
  gap: 0;
  /* 设计稿：行上下各 9px（节点 9:1713） */
  padding: 9px 0;
  box-sizing: border-box;
  width: 100%;
  /* 点击反馈用背景，不用 transform —— 列表滚动时 transform 会闪。 */
  transition: background-color 0.16s ease;
}

/* Logo 版：行首 Logo 与文字之间 10px（设计稿 gap:10）。 */
.conv-row--leading-logo {
  gap: 10px;
}

.conv-row:active {
  background: color-mix(in srgb, var(--up-hover-bg-color, #f3f4f6) 60%, transparent 40%);
}

.conv-row--selected {
  background: color-mix(in srgb, var(--up-primary, #2979ff) 7%, transparent 93%);
}

.conv-row__check {
  width: 20px;
  height: 20px;
  margin-top: 1px;
  margin-right: 10px;
  flex-shrink: 0;
  border-radius: 999px;
  border: 1.5px solid var(--up-border-color, #dadbde);
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
}

.conv-row__check--active {
  border-color: var(--up-primary, #2979ff);
  background: var(--up-primary, #2979ff);
}

.conv-row__logo {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  margin-top: 1px;
  border-radius: 7px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--up-hover-bg-color, #f3f4f6);
}

.conv-row__logo--real {
  background: transparent;
}

.conv-row__logo-img {
  width: 18px;
  height: 18px;
}

.conv-row__logo-text {
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  color: #ffffff;
}

.conv-row__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  /* 设计稿：标题与元信息行之间 5px（节点 9:1753 gap:5） */
  gap: 5px;
}

.conv-row__title {
  width: 100%;
  font-size: 15px;
  /* 设计稿 lineHeight 21px 是定值，不是 1.4 —— 两行时行距才稳。 */
  line-height: 21px;
  font-weight: 500;
  color: var(--up-main-color, #3c3c43);
  /* 两行截断：一行放不下长标题，全放开会把列表稀释成正文流。 */
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  word-break: break-word;
}

.conv-row__meta {
  display: flex;
  align-items: center;
  /* 设计稿：元信息行内各段 gap 6（节点 9:1797） */
  gap: 6px;
  min-width: 0;
}

.conv-row__inline-logo {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  border-radius: 4px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--up-hover-bg-color, #f3f4f6);
}

.conv-row__inline-logo--real {
  background: transparent;
}

.conv-row__inline-logo-img {
  width: 14px;
  height: 14px;
}

.conv-row__inline-logo-text {
  font-size: 7px;
  font-weight: 700;
  line-height: 1;
  color: #ffffff;
}

.conv-row__agent {
  font-size: 12px;
  line-height: 16px;
  color: var(--up-tips-color, #8a8a8e);
  flex-shrink: 0;
  max-width: 40%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conv-row__status {
  font-size: 12px;
  line-height: 16px;
  flex-shrink: 0;
}

/* 进行中 = 设计稿的 #34C759；等待 = 橙（要人动手）；异常 = 红。 */
.conv-row__status--running {
  color: #34c759;
}

.conv-row__status--awaiting {
  color: var(--up-warning, #f9ae3d);
}

.conv-row__status--failed {
  color: var(--up-error, #fa3534);
}

.conv-row__status--muted {
  color: var(--up-tips-color, #8a8a8e);
}

.conv-row__time {
  margin-left: auto;
  padding-left: 6px;
  font-size: 12px;
  line-height: 16px;
  color: var(--up-tips-color, #8a8a8e);
  flex-shrink: 0;
}

.conv-row__preview {
  display: flex;
  align-items: center;
  min-width: 0;
  font-size: 12px;
  line-height: 16px;
  color: var(--up-tips-color, #8a8a8e);
}

.conv-row__preview-text {
  flex: 1;
  min-width: 0;
}

/* ── 智能体 Logo 退化配色（没有 svg 资源时用两字母方块） ── */
.conv-row__logo.conv-row__logo--claude_code,
.conv-row__inline-logo.conv-row__logo--claude_code {
  background: linear-gradient(135deg, #d97757, #b8532f);
}

.conv-row__logo.conv-row__logo--codex,
.conv-row__inline-logo.conv-row__logo--codex {
  background: linear-gradient(135deg, #10a37f, #0b7a5e);
}

.conv-row__logo.conv-row__logo--gemini,
.conv-row__inline-logo.conv-row__logo--gemini {
  background: linear-gradient(135deg, #4285f4, #2b6cd4);
}

.conv-row__logo.conv-row__logo--cline,
.conv-row__inline-logo.conv-row__logo--cline {
  background: linear-gradient(135deg, #6366f1, #4338ca);
}

.conv-row__logo.conv-row__logo--open_code,
.conv-row__inline-logo.conv-row__logo--open_code {
  background: linear-gradient(135deg, #0ea5e9, #0369a1);
}

.conv-row__logo.conv-row__logo--open_claw,
.conv-row__inline-logo.conv-row__logo--open_claw {
  background: linear-gradient(135deg, #f59e0b, #b45309);
}

.conv-row__logo.conv-row__logo--other,
.conv-row__inline-logo.conv-row__logo--other {
  background: linear-gradient(135deg, #94a3b8, #64748b);
}
</style>
