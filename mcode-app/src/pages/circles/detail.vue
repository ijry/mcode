<template>
  <view class="page circle-detail-page" :style="[upThemeVars, upThemePageStyle]">
    <up-navbar
      :fixed="false"
      :placeholder="false"
      :border="false"
      left-icon="arrow-left"
      :bgColor="'transparent'"
      :leftIconColor="upThemeVar('--up-main-color', '#303133')"
      @leftClick="handleBack"
    >
      <template #center>
        <text class="detail-navbar__title">动态详情</text>
      </template>
      <template #right>
        <view class="detail-navbar__share" @click="sharePost">
          <up-icon name="share-square" size="17" :color="upThemeVar('--up-main-color', '#303133')"></up-icon>
        </view>
      </template>
    </up-navbar>

    <view class="detail-shell">
      <view v-if="loading" class="detail-state" :style="upThemeCardStyle">
        <up-loading-icon mode="circle" size="24" :color="upThemeVar('--up-primary', '#2979ff')"></up-loading-icon>
        <text class="detail-state__text">加载动态...</text>
      </view>

      <view v-else-if="error" class="detail-state detail-state--error" :style="upThemeCardStyle">
        <text class="detail-state__title">动态加载失败</text>
        <text class="detail-state__text">{{ error }}</text>
        <up-button type="primary" size="small" shape="circle" @click="loadPost">重试</up-button>
      </view>

      <view v-else-if="!post" class="detail-state" :style="upThemeCardStyle">
        <text class="detail-state__title">动态不存在</text>
        <text class="detail-state__text">这条动态可能已被删除或暂时不可见。</text>
      </view>

      <template v-else>
        <view class="detail-card" :style="upThemeCardStyle">
          <view class="detail-author">
            <view class="detail-author__avatar">
              <image v-if="post.avatar" class="detail-author__avatar-image" :src="post.avatar" mode="aspectFill" />
              <text v-else>{{ post.avatarText }}</text>
            </view>
            <view class="detail-author__main">
              <view class="detail-author__line">
                <text class="detail-author__name">{{ post.author }}</text>
                <text
                  v-if="post.userTitle"
                  class="detail-author__role"
                  :style="{ backgroundColor: post.userTitle.bgColor }"
                >
                  {{ post.userTitle.title }}
                </text>
              </view>
              <text class="detail-author__time">{{ post.timeText }} · {{ post.viewCount }} 浏览</text>
            </view>
            <view class="detail-author__menu" @click="openPostActions(post)">
              <up-icon name="more-dot-fill" size="18" :color="upThemeVar('--up-tips-color', '#8b93a5')"></up-icon>
            </view>
          </view>

          <text v-if="post.title.trim()" class="detail-title">{{ post.title }}</text>
          <view class="detail-markdown">
            <GuardedMarkdown :content="post.content"></GuardedMarkdown>
          </view>

          <view v-if="post.topicTitles.length" class="detail-topics">
            <text
              v-for="topicTitle in post.topicTitles"
              :key="`${post.id}-${topicTitle}`"
              class="detail-topic"
            >
              #{{ topicTitle }}
            </text>
          </view>

          <view v-if="post.images.length" :class="['detail-image-grid', post.images.length === 1 && 'detail-image-grid--single']">
            <image
              v-for="(imageUrl, imageIndex) in post.images.slice(0, 9)"
              :key="`${post.id}-image-${imageIndex}`"
              class="detail-image"
              :src="imageUrl"
              mode="aspectFill"
              @click="previewImages(imageIndex)"
            />
          </view>

          <view class="detail-actions">
            <view :class="['detail-action', post.liked && 'detail-action--active']" @click="togglePostLike">
              <up-icon :name="post.liked ? 'heart-fill' : 'heart'" size="17" :color="post.liked ? '#ff3b30' : upThemeVar('--up-tips-color', '#8b93a5')"></up-icon>
              <text>{{ post.likeCount }}</text>
            </view>
            <view class="detail-action" @click="focusCommentInput">
              <up-icon name="chat" size="17" :color="upThemeVar('--up-tips-color', '#8b93a5')"></up-icon>
              <text>{{ post.commentCount }}</text>
            </view>
            <view :class="['detail-action', post.favorited && 'detail-action--active']" @click="togglePostFavorite">
              <up-icon :name="post.favorited ? 'star-fill' : 'star'" size="17" :color="post.favorited ? '#ff9f0a' : upThemeVar('--up-tips-color', '#8b93a5')"></up-icon>
              <text>{{ post.favoriteCount }}</text>
            </view>
          </view>
        </view>

        <view class="comments-card" :style="upThemeCardStyle">
          <view class="comments-head">
            <text class="comments-head__title">评论</text>
            <text class="comments-head__hint">{{ commentTotal }} 条</text>
          </view>

          <view v-if="commentsLoading" class="comment-state">
            <up-loading-icon mode="circle" size="22" :color="upThemeVar('--up-primary', '#2979ff')"></up-loading-icon>
            <text>加载评论...</text>
          </view>
          <view v-else-if="commentsError" class="comment-state comment-state--error">
            <text>{{ commentsError }}</text>
            <text class="comment-state__retry" @click="reloadComments">重试</text>
          </view>
          <view v-else-if="comments.length === 0" class="comment-state">
            <text>暂无评论，来发第一条。</text>
          </view>
          <view v-else class="comment-items">
            <view v-for="comment in comments" :key="comment.id" class="comment-item">
              <view class="comment-item__avatar">
                <image v-if="comment.avatar" class="comment-item__avatar-image" :src="comment.avatar" mode="aspectFill" />
                <text v-else>{{ comment.avatarText }}</text>
              </view>
              <view class="comment-item__body">
                <view class="comment-item__meta">
                  <text class="comment-item__author">{{ comment.author }}</text>
                  <text class="comment-item__time">{{ comment.timeText }}</text>
                </view>
                <text class="comment-item__content">{{ comment.content }}</text>
                <view class="comment-item__actions">
                  <text @click="setCommentReplyTarget(comment)">回复</text>
                </view>
                <view v-if="comment.children.length" class="comment-replies">
                  <view
                    v-for="reply in comment.children"
                    :key="reply.id"
                    class="comment-reply"
                  >
                    <text class="comment-reply__content">{{ reply.author }}：{{ reply.content }}</text>
                    <text class="comment-reply__action" @click="setCommentReplyTarget(reply, comment)">回复</text>
                  </view>
                </view>
              </view>
            </view>
            <view class="comment-more" @click="loadMoreComments">
              <up-loading-icon v-if="commentsLoadingMore" mode="circle" size="16" :color="upThemeVar('--up-primary', '#2979ff')"></up-loading-icon>
              <text>{{ commentLoadMoreText }}</text>
            </view>
          </view>
        </view>
      </template>
    </view>

    <view v-if="post" class="comment-composer">
      <input
        v-model="commentDraft"
        class="comment-composer__input"
        :focus="commentInputFocused"
        :placeholder="commentInputPlaceholder"
        placeholder-class="comment-composer__placeholder"
        maxlength="300"
        confirm-type="send"
        @blur="commentInputFocused = false"
        @confirm="submitComment"
      />
      <view v-if="commentReplyTarget" class="comment-composer__cancel" @click="clearCommentReplyTarget">
        <text>取消</text>
      </view>
      <view :class="['comment-composer__send', canSubmitComment && 'comment-composer__send--active']" @click="submitComment">
        <text>{{ commentSubmitting ? "发送中" : "发送" }}</text>
      </view>
    </view>

    <u-action-sheet
      :show="showPostActionSheet"
      :actions="postActionSheetItems"
      @select="handlePostActionSelect"
      @close="closePostActionSheet"
    ></u-action-sheet>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import { onLoad, onPullDownRefresh, onReachBottom, onShareAppMessage, onShareTimeline } from "@dcloudio/uni-app"
import { useAccountStore } from "@/stores/account"
import { buildCircleShareText, resolveCirclePostMenuItems } from "./postActions"

import {
  fetchCircleComments,
  fetchCirclePost,
  publishCircleComment,
  toggleCircleAction,
  type CircleComment,
  type CirclePost,
} from "@/services/circle"

const postId = ref(0)
const post = ref<CirclePost | null>(null)
const showPostActionSheet = ref(false)
const loading = ref(false)
const error = ref("")
const comments = ref<CircleComment[]>([])
const commentTotal = ref(0)
const commentPage = ref(1)
const commentLimit = 20
const commentsLoading = ref(false)
const commentsLoadingMore = ref(false)
const commentsError = ref("")
const commentDraft = ref("")
const commentSubmitting = ref(false)
const commentInputFocused = ref(false)
const commentReplyTarget = ref<{
  pid: string | number
  tpid: string | number
  topCommentId: string
  author: string
} | null>(null)
const account = useAccountStore()
const currentUserId = computed(() => {
  const raw = (account.userInfo as Record<string, unknown> | null)?.id
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0
})

const canSubmitComment = computed(() => commentDraft.value.trim().length >= 5 && !commentSubmitting.value)
const commentInputPlaceholder = computed(() => commentReplyTarget.value
  ? `回复 ${commentReplyTarget.value.author}，至少 5 个字`
  : "写下你的评论，至少 5 个字")
const commentHasMore = computed(() => comments.value.length < commentTotal.value)
const commentLoadMoreText = computed(() => {
  if (commentsLoadingMore.value) return "加载更多评论..."
  return commentHasMore.value ? "点击查看更多评论" : "没有更多评论了"
})
const shareTitle = computed(() => post.value?.title.trim() || excerptText(post.value?.content || "圈子动态", 24))
const sharePath = computed(() => `/pages/circles/detail?id=${postId.value}`)
const postActionSheetItems = computed(() => {
  if (!post.value) return []
  return resolveCirclePostMenuItems({
    post: post.value,
    currentUserId: currentUserId.value,
  }).map((key) => ({
    key,
    name: key === "share" ? "分享" : "编辑",
  }))
})

onLoad((options: Record<string, unknown>) => {
  postId.value = normalizeId(options?.id)
  loadPost()
})

onPullDownRefresh(() => {
  loadPost().finally(() => {
    uni.stopPullDownRefresh()
  })
})

onReachBottom(() => {
  loadMoreComments()
})

onShareAppMessage(() => ({
  title: shareTitle.value,
  path: sharePath.value,
}))

onShareTimeline(() => ({
  title: shareTitle.value,
  query: `id=${postId.value}`,
}))

async function loadPost() {
  if (!postId.value) {
    error.value = "动态 ID 无效"
    return
  }
  loading.value = true
  error.value = ""
  try {
    post.value = await fetchCirclePost(postId.value)
    await reloadComments()
  } catch (loadError) {
    error.value = normalizeErrorMessage(loadError)
  } finally {
    loading.value = false
  }
}

async function reloadComments() {
  if (!postId.value) return
  commentsLoading.value = true
  commentsError.value = ""
  try {
    const result = await fetchCircleComments({
      postId: postId.value,
      page: 1,
      limit: commentLimit,
    })
    commentPage.value = result.page || 1
    comments.value = result.comments
    commentTotal.value = result.total
  } catch (commentError) {
    commentsError.value = normalizeErrorMessage(commentError)
  } finally {
    commentsLoading.value = false
  }
}

async function loadMoreComments() {
  if (!postId.value || !commentHasMore.value || commentsLoading.value || commentsLoadingMore.value) return
  commentsLoadingMore.value = true
  try {
    const nextPage = commentPage.value + 1
    const result = await fetchCircleComments({
      postId: postId.value,
      page: nextPage,
      limit: commentLimit,
    })
    commentPage.value = result.page || nextPage
    const seen = new Set(comments.value.map((comment) => comment.id))
    comments.value = [...comments.value, ...result.comments.filter((comment) => !seen.has(comment.id))]
    commentTotal.value = result.total
  } catch (loadError) {
    uni.showToast({ title: normalizeErrorMessage(loadError), icon: "none" })
  } finally {
    commentsLoadingMore.value = false
  }
}

async function submitComment() {
  if (!post.value || !canSubmitComment.value) return
  const content = commentDraft.value.trim()
  const replyTarget = commentReplyTarget.value
  commentSubmitting.value = true
  try {
    const comment = await publishCircleComment({
      postId: post.value.id,
      content,
      pid: replyTarget?.pid || 0,
      tpid: replyTarget?.tpid || 0,
    })
    commentDraft.value = ""
    if (replyTarget) {
      appendReplyToCommentThread(replyTarget.topCommentId, comment)
      clearCommentReplyTarget()
    } else {
      comments.value = [comment, ...comments.value]
    }
    commentTotal.value += 1
    post.value.commentCount += 1
    uni.showToast({ title: replyTarget ? "回复已发布" : "评论已发布", icon: "success" })
  } catch (submitError) {
    handleActionError(submitError, "请先登录后再评论")
  } finally {
    commentSubmitting.value = false
  }
}

function setCommentReplyTarget(comment: CircleComment, topComment?: CircleComment) {
  commentReplyTarget.value = {
    pid: comment.id,
    tpid: topComment ? topComment.id : 0,
    topCommentId: topComment?.id || comment.id,
    author: comment.author,
  }
  focusCommentInput()
}

function clearCommentReplyTarget() {
  commentReplyTarget.value = null
}

function appendReplyToCommentThread(topCommentId: string, reply: CircleComment) {
  const target = comments.value.find((comment) => comment.id === topCommentId)
  if (!target) {
    comments.value = [reply, ...comments.value]
    return
  }
  target.children = [...target.children, reply]
  target.replyCount += 1
}

async function togglePostLike() {
  await togglePostAction(1)
}

async function togglePostFavorite() {
  await togglePostAction(2)
}

async function togglePostAction(actionType: 1 | 2) {
  if (!post.value) return
  const wasActive = actionType === 1 ? post.value.liked : post.value.favorited
  applyPostAction(actionType, !wasActive)
  try {
    const currentValue = await toggleCircleAction(post.value.id, actionType)
    applyPostAction(actionType, currentValue)
  } catch (actionError) {
    applyPostAction(actionType, wasActive)
    handleActionError(actionError, "请先登录后再操作")
  }
}

function applyPostAction(actionType: 1 | 2, active: boolean) {
  if (!post.value) return
  if (actionType === 1) {
    const delta = active === post.value.liked ? 0 : active ? 1 : -1
    post.value.liked = active
    post.value.likeCount = Math.max(0, post.value.likeCount + delta)
    return
  }
  const delta = active === post.value.favorited ? 0 : active ? 1 : -1
  post.value.favorited = active
  post.value.favoriteCount = Math.max(0, post.value.favoriteCount + delta)
}

function previewImages(index: number) {
  if (!post.value?.images.length) return
  uni.previewImage({
    urls: post.value.images,
    current: post.value.images[index],
  })
}

function focusCommentInput() {
  commentInputFocused.value = true
}

function sharePost() {
  if (!post.value) return
  uni.setClipboardData({
    data: buildCircleShareText(post.value),
    success: () => uni.showToast({ title: "分享文案已复制", icon: "none" }),
    fail: () => uni.showToast({ title: "复制失败", icon: "none" }),
  })
}

function openPostActions(currentPost: CirclePost) {
  if (!currentPost) return
  showPostActionSheet.value = true
}

function closePostActionSheet() {
  showPostActionSheet.value = false
}

function handlePostActionSelect(item: { key?: string; name?: string }) {
  closePostActionSheet()
  if (!post.value) return
  if (item.key === "edit") {
    uni.navigateTo({ url: `/pages/circles/publish?id=${post.value.id}` })
    return
  }
  sharePost()
}

function handleBack() {
  if (getCurrentPages().length > 1) {
    uni.navigateBack()
    return
  }
  uni.switchTab({ url: "/pages/circles/index" })
}

function handleActionError(actionError: unknown, loginMessage: string) {
  const message = normalizeErrorMessage(actionError)
  if (message.includes("未登录")) {
    uni.showToast({ title: loginMessage, icon: "none" })
    uni.navigateTo({ url: "/pages/auth/login" })
    return
  }
  uni.showToast({ title: message, icon: "none" })
}

function normalizeId(value: unknown) {
  const parsed = Number(Array.isArray(value) ? value[0] : value)
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0
}

function normalizeErrorMessage(detailError: unknown) {
  if (detailError && typeof detailError === "object" && "message" in detailError) {
    return String((detailError as { message?: unknown }).message || "圈子接口请求失败")
  }
  return "圈子接口请求失败"
}

function excerptText(value: string, maxLength: number) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength)}...`
}
</script>

<style scoped lang="scss">
.circle-detail-page {
  --circle-page-bg: var(--up-page-bg-color, #f5f5f7);
  --circle-card-bg: var(--up-card-bg-color, #ffffff);
  --circle-soft-bg: var(--up-hover-bg-color, #eef1f6);
  --circle-main: var(--up-main-color, #303133);
  --circle-content: var(--up-content-color, #606266);
  --circle-tips: var(--up-tips-color, #909193);
  --circle-primary: var(--up-primary, #2979ff);
  --circle-border: 1rpx solid color-mix(in srgb, var(--up-border-color, #d8dde8) 72%, transparent);
  min-height: 100vh;
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--circle-primary) 14%, transparent) 0, transparent 34%),
    var(--circle-page-bg);
}

.detail-navbar__title {
  font-size: 32rpx;
  font-weight: 800;
  color: var(--circle-main);
}

.detail-navbar__share {
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.detail-shell {
  padding: 24rpx 28rpx 150rpx;
}

.detail-state,
.detail-card,
.comments-card {
  border-radius: 32rpx;
  background: var(--circle-card-bg);
  border: var(--circle-border);
  box-shadow: 0 18rpx 44rpx rgba(15, 23, 42, 0.08);
}

.detail-state {
  min-height: 360rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
  padding: 30rpx;
  text-align: center;
}

.detail-state__title {
  font-size: 30rpx;
  font-weight: 800;
  color: var(--circle-main);
}

.detail-state__text {
  max-width: 560rpx;
  font-size: 24rpx;
  line-height: 1.55;
  color: var(--circle-content);
}

.detail-state--error .detail-state__title {
  color: var(--up-error, #fa3534);
}

.detail-card,
.comments-card {
  padding: 28rpx;
}

.comments-card {
  margin-top: 20rpx;
}

.detail-author {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 24rpx;
}

.detail-author__avatar {
  width: 76rpx;
  height: 76rpx;
  border-radius: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
  background: linear-gradient(135deg, var(--circle-primary), #64d2ff);
  color: #ffffff;
  font-size: 28rpx;
  font-weight: 800;
}

.detail-author__avatar-image {
  width: 100%;
  height: 100%;
  display: block;
}

.detail-author__main {
  flex: 1;
  min-width: 0;
}

.detail-author__line {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.detail-author__name {
  font-size: 29rpx;
  font-weight: 800;
  color: var(--circle-main);
}

.detail-author__role {
  padding: 5rpx 10rpx;
  border-radius: 999rpx;
  font-size: 18rpx;
  font-weight: 700;
  color: #ffffff;
}

.detail-author__time {
  display: block;
  margin-top: 7rpx;
  font-size: 21rpx;
  color: var(--circle-tips);
}

.detail-title {
  display: block;
  margin-bottom: 18rpx;
  font-size: 38rpx;
  line-height: 1.35;
  font-weight: 800;
  color: var(--circle-main);
}

.detail-markdown {
  --guarded-markdown-link-color: var(--up-primary, #2979ff);
  color: var(--circle-content);
}

.detail-markdown :deep(.guarded-markdown),
.detail-markdown :deep(.guarded-markdown p),
.detail-markdown :deep(.guarded-markdown text),
.detail-markdown :deep(.guarded-markdown ._root),
.detail-markdown :deep(.guarded-markdown rich-text) {
  color: var(--circle-content);
  font-size: 28rpx;
  line-height: 1.72;
}

.detail-topics {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  margin-top: 22rpx;
}

.detail-topic {
  padding: 8rpx 14rpx;
  border-radius: 999rpx;
  background: color-mix(in srgb, var(--circle-primary) 10%, var(--circle-card-bg) 90%);
  color: var(--circle-primary);
  font-size: 21rpx;
  font-weight: 700;
}

.detail-image-grid {
  margin-top: 22rpx;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10rpx;
}

.detail-image-grid--single {
  display: block;
}

.detail-image {
  width: 100%;
  height: 188rpx;
  border-radius: 22rpx;
  display: block;
  background: var(--circle-soft-bg);
  overflow: hidden;
}

.detail-image-grid--single .detail-image {
  height: 430rpx;
  border-radius: 28rpx;
}

.detail-actions {
  display: flex;
  align-items: center;
  justify-content: space-around;
  gap: 10rpx;
  margin-top: 26rpx;
  padding-top: 20rpx;
  border-top: var(--circle-border);
}

.detail-action {
  flex: 1;
  min-height: 54rpx;
  border-radius: 999rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  color: var(--circle-tips);
  font-size: 23rpx;
  font-weight: 800;
}

.detail-action--active {
  background: var(--circle-soft-bg);
  color: var(--circle-main);
}

.comments-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 20rpx;
}

.comments-head__title {
  font-size: 32rpx;
  font-weight: 800;
  color: var(--circle-main);
}

.comments-head__hint {
  font-size: 22rpx;
  font-weight: 700;
  color: var(--circle-primary);
}

.comment-state {
  min-height: 220rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14rpx;
  color: var(--circle-tips);
  font-size: 24rpx;
  text-align: center;
}

.comment-state--error {
  color: var(--up-error, #fa3534);
}

.comment-state__retry {
  color: var(--circle-primary);
  font-weight: 800;
}

.comment-items {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.comment-item {
  display: flex;
  gap: 16rpx;
}

.comment-item__avatar {
  width: 58rpx;
  height: 58rpx;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
  background: linear-gradient(135deg, var(--circle-primary), #64d2ff);
  color: #ffffff;
  font-size: 22rpx;
  font-weight: 800;
}

.comment-item__avatar-image {
  width: 100%;
  height: 100%;
  display: block;
}

.comment-item__body {
  flex: 1;
  min-width: 0;
  padding-bottom: 18rpx;
  border-bottom: var(--circle-border);
}

.comment-item__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14rpx;
  margin-bottom: 8rpx;
}

.comment-item__author {
  font-size: 24rpx;
  font-weight: 800;
  color: var(--circle-main);
}

.comment-item__time {
  font-size: 20rpx;
  color: var(--circle-tips);
}

.comment-item__content {
  display: block;
  font-size: 25rpx;
  line-height: 1.55;
  color: var(--circle-content);
}

.comment-item__actions {
  margin-top: 10rpx;
  color: var(--circle-primary);
  font-size: 22rpx;
  font-weight: 800;
}

.comment-replies {
  margin-top: 14rpx;
  padding: 14rpx 16rpx;
  border-radius: 18rpx;
  background: var(--circle-soft-bg);
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.comment-reply {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14rpx;
}

.comment-reply__content {
  flex: 1;
  min-width: 0;
  font-size: 22rpx;
  line-height: 1.45;
  color: var(--circle-content);
}

.comment-reply__action {
  flex-shrink: 0;
  color: var(--circle-primary);
  font-size: 21rpx;
  font-weight: 800;
}

.comment-more {
  min-height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  color: var(--circle-tips);
  font-size: 22rpx;
}

.comment-composer {
  position: fixed;
  left: 20rpx;
  right: 20rpx;
  bottom: calc(18rpx + env(safe-area-inset-bottom));
  z-index: 30;
  padding: 12rpx;
  border-radius: 999rpx;
  background: var(--circle-card-bg);
  border: var(--circle-border);
  box-shadow: 0 18rpx 44rpx rgba(15, 23, 42, 0.12);
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.comment-composer__input {
  flex: 1;
  min-width: 0;
  height: 64rpx;
  padding: 0 18rpx;
  border-radius: 999rpx;
  box-sizing: border-box;
  background: var(--circle-soft-bg);
  color: var(--circle-main);
  font-size: 25rpx;
}

.comment-composer__placeholder {
  color: var(--circle-tips);
}

.comment-composer__cancel {
  height: 64rpx;
  padding: 0 12rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--circle-tips);
  font-size: 22rpx;
  font-weight: 800;
}

.comment-composer__send {
  min-width: 108rpx;
  height: 64rpx;
  border-radius: 999rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--circle-primary) 12%, var(--circle-card-bg) 88%);
  color: var(--circle-tips);
  font-size: 24rpx;
  font-weight: 800;
}

.comment-composer__send--active {
  background: var(--circle-primary);
  color: #ffffff;
}
</style>
