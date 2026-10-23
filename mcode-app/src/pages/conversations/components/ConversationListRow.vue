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
    <!--
      批量选择：勾选位在**选择模式下一律占位**，即使这张卡不可选。

      只给可选卡渲染会让同一列表里的标题左沿参差不齐（可选的行右移 30px、不可选的
      原地不动），选中几条之后整块看起来就是「错位」。所以不可选时留一个等宽的空位，
      把「能不能勾」和「在哪一列勾」两件事分开。
    -->
    <view v-if="selectionMode" class="conv-row__check-slot">
      <view
        v-if="selectable"
        :class="['conv-row__check', selected && 'conv-row__check--active']"
        @click.stop="emit('toggle-select')"
      >
        <up-icon v-if="selected" name="checkmark" size="13" color="#ffffff"></up-icon>
      </view>
    </view>

    <!--
      行首 Logo（仅「Logo 版」）。
      22×22 与设计稿节点 9:1549 一致；圆角给 7 让它在两行文字左侧不至于像一枚生硬的方块。
    -->
    <view v-if="layout.showLeadingLogo" :class="['conv-row__logo', logoClass]">
      <image v-if="hasLogoAsset" class="conv-row__logo-img" :src="logoPath" mode="aspectFit" />
      <text v-else class="conv-row__logo-text">{{ logoText }}</text>
    </view>

    <view class="conv-row__info">
      <text class="conv-row__title">{{ title }}</text>

      <view class="conv-row__meta">
        <!--
          置顶标记。
          置顶的效果只在排位上体现的话，用户看不出哪条是自己置顶的 —— 取消置顶时
          也不知道该长按哪一条。所以行上必须有一枚图钉，且只在真置顶时出现。
        -->
        <up-icon
          v-if="pinned"
          class="conv-row__pin"
          name="pushpin-fill"
          size="11"
          :color="pinIconColor"
        ></up-icon>

        <!-- 名称前缀 Logo（仅「名称前缀 Logo 版」）：14×14，与智能体名同基线。 -->
        <view
          v-if="layout.showInlineLogo"
          :class="['conv-row__inline-logo', logoClass]"
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
 * 标题 15px/21（单行截断）+ 元信息行 12px（智能体 · 状态 + 右对齐时间）。
 * 形态差异由 `resolveConversationListRowLayout` 统一裁决，这里不判断样式 id。
 */
const props = defineProps<{
  title?: string
  agentType?: string
  displayStatus?: string
  /** 这个会话在别的端开着（旧版用「标签」角标表达，现在落到状态位）。 */
  isOpenTab?: boolean
  /** 置顶。除了把行提到分组最前，还要在元信息行打一枚图钉。 */
  pinned?: boolean
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
  // 是「有 SVG 资源时」的白底描边（概览卡/新建弹层用），行里则是无底色，
  // 两套规则不能同名 —— 同名会让行内 logo 被那一层白底重新盖回来。
  overviewAgentLogoClass(props.agentType || "").replace("agent-logo--", "conv-row__logo--")
)
const logoText = computed(() => overviewAgentLogoText(props.agentType || ""))

/**
 * 图钉用主色。
 *
 * 置顶是用户主动做的动作，用元信息的灰色会和「智能体名 / 时间」这些说明性文字混在
 * 一起，等于没有标记。主色在 11px 的小图标上并不吵 —— 同一行的状态色（进行中的绿、
 * 等待的橙）本来也是硬编码的实色。
 */
const pinIconColor = "var(--up-primary, #2979ff)"
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

/* 勾选位：固定占宽，确保可选 / 不可选的行标题左沿对齐。 */
.conv-row__check-slot {
  width: 30px;
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
}

.conv-row__check {
  width: 20px;
  height: 20px;
  margin-top: 1px;
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

/*
 * Logo 不要背景色：SVG（或兜底字母）直接压在卡片上。
 *
 * 之前这里挂着两层底色：基类一层灰，`.conv-row__logo--<type>` 一层品牌渐变。后者是
 * **两个 class** 的选择器，权重盖过只写一个 class 的 `--real { background: transparent }`
 * 覆盖 —— 于是连有 SVG 资源的 agent 也照样顶着一块彩色方块，那句透明覆盖一直是空转的。
 * 所以去底色必须连那组渐变一起删，只改基类没用。
 *
 * 去掉方块后，兜底字母（没有 SVG 资源时）不能再是白色：白字压白卡等于没有。
 * 改用内容色，与同一行的标题/时间一个色系，也不抢主文字。
 */
.conv-row__logo {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  margin-top: 1px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.conv-row__logo-img {
  width: 18px;
  height: 18px;
}

.conv-row__logo-text {
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  color: var(--up-content-color, #48484a);
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
  /* 设计稿 lineHeight 21px 是定值，单行不折行。 */
  line-height: 21px;
  font-weight: 500;
  color: var(--up-main-color, #3c3c43);
  /* 名称只显示一行：超出用省略号收掉，不允许折行。 */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conv-row__meta {
  display: flex;
  align-items: center;
  /* 设计稿：元信息行内各段 gap 6（节点 9:1797） */
  gap: 6px;
  min-width: 0;
}

/* 行内小号 logo（14px）同样不要底色，理由同上。 */
.conv-row__inline-logo {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.conv-row__inline-logo-img {
  width: 14px;
  height: 14px;
}

.conv-row__inline-logo-text {
  font-size: 7px;
  font-weight: 700;
  line-height: 1;
  color: var(--up-content-color, #48484a);
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

/* 图钉：与元信息同基线，不参与挤压（时间靠 margin-left:auto 顶到最右）。 */
.conv-row__pin {
  flex-shrink: 0;
  display: flex;
  align-items: center;
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

</style>
