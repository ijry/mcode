<script setup lang="ts">
import { computed, getCurrentInstance } from "vue"
import MarkdownRenderer from "@/components/MarkdownRenderer.vue"
import { authorInitial, relativeTime } from "@/pages/forge/forgeRowPresentation"
import { forgeCommentTimeText } from "../forgeItemPresentation"
import type { ForgeComment, ForgeIssueRow } from "@/types/forge"

/**
 * 对话分区：条目正文 + 分页评论流。
 *
 * 完全受控 —— 数据与分页状态都在页面里，这里只画，并把「加载更多」「刷新」「打开某条
 * 评论的永久链接」三个意图 emit 回去。
 *
 * 正文与评论都走 `MarkdownRenderer`：forge 上的内容是 Markdown，按纯文本渲染会把
 * 代码块与列表压成一团。
 */
const props = defineProps<{
  row: ForgeIssueRow | null
  comments: ForgeComment[]
  /** 条目自己报的人类评论数 —— 线程可能还没全部加载，这个数字是权威的总量。 */
  commentCount: number
  loading?: boolean
  loadingMore?: boolean
  hasNext?: boolean
  errorText?: string
  /** 共享的渲染时刻，让同一屏所有相对时间口径一致。 */
  now: number
}>()

const emit = defineEmits<{
  (event: "refresh"): void
  (event: "loadMore"): void
  (event: "openComment", url: string): void
}>()

const currentInstance = getCurrentInstance()
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

const bodyText = computed(() => props.row?.body || "")

const countText = computed(() => {
  if (props.commentCount <= 0) return "还没有评论"
  // 已加载的条数与总数都给：一个只写总数的标题会让人以为下面就是全部。
  if (props.comments.length >= props.commentCount) return `${props.commentCount} 条评论`
  return `${props.comments.length} / ${props.commentCount} 条评论`
})

function timeText(comment: ForgeComment) {
  return forgeCommentTimeText(comment, (iso) => relativeTime(iso, props.now))
}
</script>

<template>
  <view class="forge-pane">
    <!-- 条目正文。空正文说出来 —— 一块空白区域读起来像还在加载。 -->
    <view class="forge-card forge-conversation__body">
      <MarkdownRenderer v-if="bodyText" :content="bodyText" />
      <text v-else class="forge-muted">这个条目没有描述。</text>
    </view>

    <view class="forge-pane__head">
      <text class="forge-pane__title">{{ countText }}</text>
      <view class="forge-pane__refresh" @click="emit('refresh')">
        <up-loading-icon
          v-if="props.loading"
          mode="circle"
          size="16"
          :color="upThemeVar('--up-primary', '#2979ff')"
        ></up-loading-icon>
        <up-icon
          v-else
          name="reload"
          size="15"
          :color="upThemeVar('--up-content-color', '#606266')"
        ></up-icon>
      </view>
    </view>

    <view v-if="props.errorText" class="forge-notice forge-notice--error">
      <text class="forge-notice__text">{{ props.errorText }}</text>
      <text class="forge-notice__action" @click="emit('refresh')">重试</text>
    </view>

    <view v-if="props.loading && props.comments.length === 0" class="forge-inline-loading">
      <up-loading-icon
        mode="circle"
        size="24"
        :color="upThemeVar('--up-primary', '#2979ff')"
      ></up-loading-icon>
      <text class="forge-inline-loading__text">正在读取讨论...</text>
    </view>

    <text
      v-else-if="props.comments.length === 0 && !props.errorText"
      class="forge-muted"
    >还没有人发表评论。</text>

    <view v-else class="forge-conversation__list">
      <view
        v-for="comment in props.comments"
        :key="comment.id"
        class="forge-comment"
        :style="upThemeCardStyle"
      >
        <view class="forge-comment__head">
          <image
            v-if="comment.author_avatar"
            class="forge-comment__avatar"
            :src="comment.author_avatar"
            mode="aspectFill"
          ></image>
          <view v-else class="forge-comment__avatar forge-comment__avatar--text">
            <text>{{ authorInitial(comment.author) }}</text>
          </view>
          <view class="forge-comment__meta">
            <text class="forge-comment__author">{{ comment.author || "未知用户" }}</text>
            <text class="forge-comment__time">{{ timeText(comment) }}</text>
          </view>
          <view
            v-if="comment.html_url"
            class="forge-comment__link"
            @click="emit('openComment', comment.html_url)"
          >
            <up-icon
              name="share-square"
              size="14"
              :color="upThemeVar('--up-tips-color', '#c0c4cc')"
            ></up-icon>
          </view>
        </view>
        <MarkdownRenderer v-if="comment.body" :content="comment.body" />
        <text v-else class="forge-muted">（空评论）</text>
      </view>

      <!-- 有没有下一页由 forge 的分页头说，**不是**「这一页满了没」：GitLab 本地丢掉
           系统事件，一页可能一条人写的都不剩而讨论还在下一页。 -->
      <view v-if="props.hasNext" class="forge-more" @click="emit('loadMore')">
        <up-loading-icon
          v-if="props.loadingMore"
          mode="circle"
          size="20"
          :color="upThemeVar('--up-primary', '#2979ff')"
        ></up-loading-icon>
        <text class="forge-more__text">{{ props.loadingMore ? "加载中..." : "加载更多评论" }}</text>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
@import "@/pages/forge/index.scss";
@import "../index.scss";

.forge-conversation__body {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.forge-conversation__list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.forge-comment__meta {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  min-width: 0;
}
</style>
