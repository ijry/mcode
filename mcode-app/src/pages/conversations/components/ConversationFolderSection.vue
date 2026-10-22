<template>
  <view class="conv-group">
    <!--
      文件夹头。设计稿（节点 9:1680）：文件夹图标 18 · 名称 13px 次级色 · 弹性占位 ·
      展开收起 14 · 新建会话 18，整行 gap 6。
      名称本身就是折叠开关的一部分（点标题也能收起），因为 18px 的箭头太好点丢了。
    -->
    <view class="conv-group__header">
      <view class="conv-group__folder" @click="toggleCollapsed">
        <up-icon name="folder" size="17" :color="folderIconColor"></up-icon>
      </view>
      <text class="conv-group__name" @click="toggleCollapsed">{{ name }}</text>
      <view class="conv-group__spacer"></view>
      <view class="conv-group__action" @click="toggleCollapsed">
        <up-icon :name="collapsed ? 'arrow-down' : 'arrow-up'" size="12" :color="folderIconColor"></up-icon>
      </view>
      <view class="conv-group__action" @click.stop="emit('create')">
        <up-icon name="plus" size="16" :color="folderIconColor"></up-icon>
      </view>
    </view>

    <view v-if="!collapsed" class="conv-group__card">
      <view v-if="cards.length === 0" class="conv-group__empty">
        <text class="conv-group__empty-text">这个文件夹还没有会话</text>
      </view>

      <template v-for="(card, index) in visibleCards" :key="cardKey(card, index)">
        <!--
          分隔线：设计稿是 5% 前景色的 1px 细线，且「名称前缀 Logo 版」左侧让出 32px
          （与标题左沿对齐，视觉上把 Logo 那一列空出来）。
          首行之前不画 —— 文件夹头自己就是分界。
        -->
        <view v-if="index > 0" class="conv-group__divider">
          <view v-if="layout.indentSeparator" class="conv-group__divider-indent"></view>
          <view class="conv-group__divider-line"></view>
        </view>

        <ConversationListRow
          :title="card.title"
          :agent-type="card.agentType"
          :display-status="card.displayStatus"
          :is-open-tab="card.isOpenTab === true"
          :pinned="card.isPinned === true"
          :updated-at="card.updatedAt"
          :preview-text="card.livePreviewText"
          :list-style="listStyle"
          :selection-mode="selectionMode"
          :selectable="isSelectableOverviewCard(card)"
          :selected="isSelected(card)"
          @open="emit('open', card)"
          @toggle-select="emit('toggle-select', card)"
          @menu="emit('menu', card)"
        />
      </template>

      <view v-if="hiddenCount > 0" class="conv-group__more" @click="loadMore">
        <text class="conv-group__more-text">{{ moreLabel }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
import ConversationListRow from "./ConversationListRow.vue"
import { isSelectableOverviewCard, buildBulkSelectionKey } from "../conversationOverviewPresentation"
import {
  CONVERSATION_GROUP_INITIAL_ROWS,
  CONVERSATION_GROUP_STEP_ROWS,
  buildGroupMoreLabel,
  resolveConversationListRowLayout,
  resolveGroupHiddenCount,
  resolveGroupVisibleCards,
  type ConversationListStyleId,
} from "../conversationListPresentation"

/**
 * 一个文件夹（项目）分组：文件夹头 + 会话行列表 + 查看更多。
 *
 * 设计稿里这块**没有卡片外壳** —— 节点 9:1681（名为「玻璃卡」）实测 fills/strokes/
 * effects 全为空，只有 `padding-left: 12`。所以它是一个左缩进 12px 的纯列表容器，
 * 行与行之间靠 1px 分隔线（5% 前景色）划分，而不是一张张圆角卡。
 */
const props = defineProps<{
  name: string
  folderId: number
  /** 归属连接。选择集的 key 是「连接 + 会话号」，行组件拿不到它就得由这里补上。 */
  connectionKey: string
  cards: any[]
  listStyle: ConversationListStyleId
  selectionMode?: boolean
  /** 已选中的批量选择 key 集合（`buildBulkSelectionKey` 的产物），由页面维护。 */
  selectedKeys?: string[]
  /** 是否默认折叠（页面可按用户偏好传入）。 */
  collapsed?: boolean
}>()

const emit = defineEmits<{
  (event: "open", card: any): void
  (event: "toggle-select", card: any): void
  /** 长按某一行。卡片本身不带连接键（那归分组所有），由页面补齐上下文。 */
  (event: "menu", card: any): void
  (event: "create"): void
  (event: "toggle-collapse", collapsed: boolean): void
}>()

const collapsed = ref(props.collapsed === true)
/**
 * 已经放出来多少行。
 *
 * 用累计数量而不是布尔：一个几百轮的文件夹一次全展开会把页面拉到几万像素，
 * 每次点「查看更多」只多放 3 行，入口上的数字继续显示剩余量。
 */
const visibleCount = ref(CONVERSATION_GROUP_INITIAL_ROWS)

const layout = computed(() => resolveConversationListRowLayout(props.listStyle))
const visibleCards = computed(() => resolveGroupVisibleCards(props.cards || [], visibleCount.value))
const hiddenCount = computed(() => resolveGroupHiddenCount((props.cards || []).length, visibleCount.value))
const moreLabel = computed(() => buildGroupMoreLabel(hiddenCount.value))

const folderIconColor = "var(--up-tips-color, #8a8a8e)"

watch(
  () => props.collapsed,
  (value) => {
    collapsed.value = value === true
  }
)

function toggleCollapsed() {
  collapsed.value = !collapsed.value
  emit("toggle-collapse", collapsed.value)
}

/** 每次只多放 3 行；剩余量由 `hiddenCount` 继续显示在入口上。 */
function loadMore() {
  visibleCount.value += CONVERSATION_GROUP_STEP_ROWS
}

function isSelected(card: any) {
  const keys = props.selectedKeys || []
  const conversationId = Number(card?.conversationId || 0)
  if (!props.connectionKey || conversationId <= 0) return false
  return keys.includes(buildBulkSelectionKey(props.connectionKey, conversationId))
}

function cardKey(card: any, index: number) {
  return `${card?.tabId ?? "row"}-${index}`
}
</script>

<style scoped lang="scss">
.conv-group {
  display: flex;
  flex-direction: column;
  /* 设计稿：文件夹头与列表之间 8px（节点 9:1669 gap:8） */
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
}

.conv-group__header {
  display: flex;
  align-items: center;
  /* 设计稿：头内各元素 gap 6 */
  gap: 6px;
  min-height: 22px;
}

.conv-group__folder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.conv-group__name {
  font-size: 13px;
  line-height: 18px;
  color: var(--up-tips-color, #8a8a8e);
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conv-group__spacer {
  flex: 1;
  min-width: 8px;
}

.conv-group__action {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
}

.conv-group__action:active {
  background: color-mix(in srgb, var(--up-hover-bg-color, #f3f4f6) 70%, transparent 30%);
}

/* 设计稿：列表整体左缩进 12px（节点 9:1681 padding-left） */
.conv-group__card {
  padding-left: 12px;
  width: 100%;
  box-sizing: border-box;
}

.conv-group__divider {
  display: flex;
  align-items: center;
  width: 100%;
  height: 1px;
}

/* 名称前缀 Logo 版：分隔线左侧让出 32px（Logo 14 + gap 6 + 一点余量） */
.conv-group__divider-indent {
  width: 32px;
  flex-shrink: 0;
  height: 1px;
}

.conv-group__divider-line {
  flex: 1;
  height: 1px;
  /* 设计稿是 5% 黑；用前景色混合，深色下自动变成半透明白。 */
  background: color-mix(in srgb, var(--up-main-color, #000000) 8%, transparent);
}

.conv-group__more {
  padding: 10px 0;
}

.conv-group__more:active {
  opacity: 0.6;
}

.conv-group__more-text {
  font-size: 13px;
  line-height: 18px;
  color: var(--up-tips-color, #8a8a8e);
}

.conv-group__empty {
  padding: 10px 0;
}

.conv-group__empty-text {
  font-size: 13px;
  line-height: 18px;
  color: var(--up-tips-color, #8a8a8e);
}
</style>
