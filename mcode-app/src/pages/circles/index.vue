<template>
  <view class="page circles-page" :style="[upThemeVars, upThemePageStyle]">
    <view class="circles-shell">
      <up-sticky class="circles-sticky" :offset-top="0" :custom-nav-height="0" :bg-color="upThemeVar('--up-page-bg-color', '#f5f5f7')" z-index="20">
        <view class="circles-header">
          <view class="circles-header__copy">
            <text class="circles-header__eyebrow">COMMUNITY</text>
            <text class="circles-header__title">圈子</text>
          </view>
          <view class="circles-header__action" @click="goPublish">
            <up-icon name="plus" size="16" color="#ffffff"></up-icon>
          </view>
        </view>

        <view class="circles-searchbar">
          <up-search
            v-model="searchKeyword"
            placeholder="搜索话题、动态和案例"
            :show-action="false"
            shape="round"
            :bgColor="upThemeVar('--up-hover-bg-color', '#eef1f6')"
            borderColor="transparent"
            :color="upThemeVar('--up-main-color', '#1a1b1f')"
            :placeholderColor="upThemeVar('--up-tips-color', '#9ca3af')"
            :searchIconColor="upThemeVar('--up-tips-color', '#8b93a5')"
            :height="44"
            @search="reloadFeeds"
            @clear="reloadFeeds"
          ></up-search>
        </view>

        <view class="circles-tabs" :style="upThemeCardStyle">
          <up-tabs
            v-model:current="activeTab"
            :list="tabList"
            keyName="title"
            :scrollable="false"
            :lineColor="upThemeVar('--up-primary', '#2979ff')"
            :activeStyle="{ color: upThemeVar('--up-main-color', '#303133'), fontWeight: '800' }"
            :inactiveStyle="{ color: upThemeVar('--up-content-color', '#606266') }"
            @change="handleTabChange"
          ></up-tabs>
        </view>
      </up-sticky>

      <view v-if="selectedTopic" class="topic-filter" :style="upThemeCardStyle">
        <view class="topic-filter__copy">
          <text class="topic-filter__label">当前话题</text>
          <text class="topic-filter__title">#{{ selectedTopic.title }}</text>
        </view>
        <text class="topic-filter__clear" @click="clearTopicFilter">清除</text>
      </view>

      <view v-if="activeTab !== 2" class="feed-section" :style="upThemeCardStyle">
        <view class="section-head section-head--feed">
          <text class="section-head__title">{{ activeTab === 0 ? "最新动态" : "热门动态" }}</text>
          <text class="section-head__hint">{{ activeTotal }} 条</text>
        </view>

        <view v-if="activeLoading" class="circle-state">
          <up-loading-icon mode="circle" size="24" :color="upThemeVar('--up-primary', '#2979ff')"></up-loading-icon>
          <text class="circle-state__text">加载圈子内容...</text>
        </view>

        <view v-else-if="activeError" class="circle-state circle-state--error">
          <text class="circle-state__title">加载失败</text>
          <text class="circle-state__text">{{ activeError }}</text>
          <up-button type="primary" size="small" shape="circle" @click="reloadFeeds">重试</up-button>
        </view>

        <view v-else-if="activePosts.length === 0" class="circle-state">
          <text class="circle-state__title">暂无动态</text>
          <text class="circle-state__text">换个关键词，或发布第一条圈子动态。</text>
        </view>

        <view v-else class="post-list">
          <view v-for="post in activePosts" :key="post.id" class="post-card" :style="upThemeCardStyle">
            <view class="post-card__author">
              <view class="post-card__avatar">
                <image v-if="post.avatar" class="post-card__avatar-image" :src="post.avatar" mode="aspectFill" />
                <text v-else class="post-card__avatar-text">{{ post.avatarText }}</text>
              </view>
              <view class="post-card__author-main">
                <view class="post-card__author-line">
                  <text class="post-card__author-name">{{ post.author }}</text>
                  <text
                    v-if="post.userTitle"
                    class="post-card__role"
                    :style="{ backgroundColor: post.userTitle.bgColor }"
                  >
                    {{ post.userTitle.title }}
                  </text>
                </view>
                <text class="post-card__time">{{ post.timeText }}</text>
              </view>
              <up-icon name="more-dot-fill" size="18" :color="upThemeVar('--up-tips-color', '#8b93a5')"></up-icon>
            </view>

            <view class="post-card__body" @click="openPostDetail(post)">
              <text v-if="post.title.trim()" class="post-card__title">{{ post.title }}</text>
              <view class="post-card__content">
                <up-markdown :content="post.content"></up-markdown>
              </view>
            </view>

            <view v-if="post.topicTitles.length" class="post-card__topics">
              <text
                v-for="topicTitle in post.topicTitles"
                :key="`${post.id}-${topicTitle}`"
                class="post-card__topic"
              >
                #{{ topicTitle }}
              </text>
            </view>

            <view v-if="post.images.length" :class="['post-card__image-grid', post.images.length === 1 && 'post-card__image-grid--single']">
              <image
                v-for="(imageUrl, imageIndex) in post.images.slice(0, 9)"
                :key="`${post.id}-image-${imageIndex}`"
                class="post-card__image"
                :src="imageUrl"
                mode="aspectFill"
              />
            </view>

            <view class="post-card__actions">
              <view :class="['post-action', post.liked && 'post-action--active']" @click.stop="togglePostLike(post)">
                <up-icon :name="post.liked ? 'heart-fill' : 'heart'" size="16" :color="post.liked ? '#ff3b30' : upThemeVar('--up-tips-color', '#8b93a5')"></up-icon>
                <text>{{ post.likeCount }}</text>
              </view>
              <view class="post-action" @click.stop="openCommentPanel(post)">
                <up-icon name="chat" size="16" :color="upThemeVar('--up-tips-color', '#8b93a5')"></up-icon>
                <text>{{ post.commentCount }}</text>
              </view>
              <view :class="['post-action', post.favorited && 'post-action--active']" @click.stop="togglePostFavorite(post)">
                <up-icon :name="post.favorited ? 'star-fill' : 'star'" size="16" :color="post.favorited ? '#ff9f0a' : upThemeVar('--up-tips-color', '#8b93a5')"></up-icon>
                <text>{{ post.favoriteCount }}</text>
              </view>
            </view>
          </view>

          <view class="feed-more">
            <up-loading-icon v-if="activeLoadingMore" mode="circle" size="18" :color="upThemeVar('--up-primary', '#2979ff')"></up-loading-icon>
            <text>{{ activeLoadMoreText }}</text>
          </view>
        </view>
      </view>

      <view v-else class="topics-section" :style="upThemeCardStyle">
        <view class="section-head">
          <text class="section-head__title">话题</text>
          <text class="section-head__hint">{{ topics.length }} 个</text>
        </view>

        <view v-if="topicsLoading" class="circle-state">
          <up-loading-icon mode="circle" size="24" :color="upThemeVar('--up-primary', '#2979ff')"></up-loading-icon>
          <text class="circle-state__text">加载话题...</text>
        </view>

        <view v-else-if="topicsError" class="circle-state circle-state--error">
          <text class="circle-state__title">话题加载失败</text>
          <text class="circle-state__text">{{ topicsError }}</text>
          <up-button type="primary" size="small" shape="circle" @click="loadTopics">重试</up-button>
        </view>

        <view v-else class="topic-grid">
          <view
            v-for="topic in topics"
            :key="topic.id"
            class="topic-card"
            @click="selectTopic(topic)"
          >
            <view class="topic-card__mark"></view>
            <view class="topic-card__body">
              <text class="topic-card__title">#{{ topic.title }}</text>
              <text class="topic-card__subtitle">{{ topic.description || "暂无简介" }}</text>
              <view class="topic-card__meta">
                <text>{{ formatCompactCount(topic.postCount) }} 动态</text>
                <text>{{ formatCompactCount(topic.memberCount) }} 成员</text>
              </view>
            </view>
            <up-icon name="arrow-right" size="14" :color="upThemeVar('--up-light-color', '#c0c4cc')"></up-icon>
          </view>
        </view>
      </view>
    </view>

    <up-popup v-model:show="showCommentPanel" mode="bottom" :round="28" @close="closeCommentPanel">
      <view class="comment-panel">
        <view class="comment-panel__header">
          <view>
            <text class="comment-panel__eyebrow">COMMENTS</text>
            <text class="comment-panel__title">评论 {{ commentTotal || "" }}</text>
          </view>
          <up-icon name="close" size="18" :color="upThemeVar('--up-tips-color', '#909193')" @click="closeCommentPanel"></up-icon>
        </view>

        <view v-if="commentPost" class="comment-panel__post">
          <text class="comment-panel__post-title">{{ commentPost.title.trim() || commentPost.content.slice(0, 42) }}</text>
        </view>

        <view class="comment-list-shell">
          <scroll-view class="comment-list" scroll-y enhanced show-scrollbar @scrolltolower="loadMoreComments">
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
              <view class="comment-more">
                <up-loading-icon v-if="commentsLoadingMore" mode="circle" size="16" :color="upThemeVar('--up-primary', '#2979ff')"></up-loading-icon>
                <text>{{ commentLoadMoreText }}</text>
              </view>
            </view>
          </scroll-view>
        </view>

        <view class="comment-composer">
          <input
            v-model="commentDraft"
            class="comment-composer__input"
            :placeholder="commentInputPlaceholder"
            placeholder-class="comment-composer__placeholder"
            maxlength="300"
            confirm-type="send"
            @confirm="submitComment"
          />
          <view v-if="commentReplyTarget" class="comment-composer__cancel" @click="clearCommentReplyTarget">
            <text>取消</text>
          </view>
          <view :class="['comment-composer__send', canSubmitComment && 'comment-composer__send--active']" @click="submitComment">
            <text>{{ commentSubmitting ? "发送中" : "发送" }}</text>
          </view>
        </view>
      </view>
    </up-popup>
  </view>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue"
import { onLoad, onPullDownRefresh, onReachBottom, onShow } from "@dcloudio/uni-app"

import {
  fetchCircleComments,
  fetchCirclePosts,
  fetchCircleTopics,
  publishCircleComment,
  toggleCircleAction,
  type CircleComment,
  type CirclePost,
  type CircleTopic,
} from "@/services/circle"

const tabList = [
  { value: "latest", title: "最新" },
  { value: "hot", title: "热门" },
  { value: "topics", title: "话题" },
]

const activeTab = ref(0)
const searchKeyword = ref("")
const latestPosts = ref<CirclePost[]>([])
const hotPosts = ref<CirclePost[]>([])
const topics = ref<CircleTopic[]>([])
const latestTotal = ref(0)
const hotTotal = ref(0)
const latestPage = ref(1)
const hotPage = ref(1)
const feedLimit = 20
const latestLoading = ref(false)
const hotLoading = ref(false)
const latestLoadingMore = ref(false)
const hotLoadingMore = ref(false)
const topicsLoading = ref(false)
const latestError = ref("")
const hotError = ref("")
const topicsError = ref("")
const selectedTopicId = ref(0)
const showCommentPanel = ref(false)
const commentPost = ref<CirclePost | null>(null)
const comments = ref<CircleComment[]>([])
const commentTotal = ref(0)
const commentPage = ref(1)
const commentLimit = 20
const commentsLoading = ref(false)
const commentsLoadingMore = ref(false)
const commentsError = ref("")
const commentDraft = ref("")
const commentSubmitting = ref(false)
const commentReplyTarget = ref<{
  pid: string | number
  tpid: string | number
  topCommentId: string
  author: string
} | null>(null)
let searchTimer: ReturnType<typeof setTimeout> | null = null
let commentRequestId = 0

const activePosts = computed(() => activeTab.value === 0 ? latestPosts.value : hotPosts.value)
const activeLoading = computed(() => activeTab.value === 0 ? latestLoading.value : hotLoading.value)
const activeLoadingMore = computed(() => activeTab.value === 0 ? latestLoadingMore.value : hotLoadingMore.value)
const activeError = computed(() => activeTab.value === 0 ? latestError.value : hotError.value)
const activeTotal = computed(() => activeTab.value === 0 ? latestTotal.value : hotTotal.value)
const selectedTopic = computed(() => topics.value.find((topic) => topic.id === selectedTopicId.value) || null)
const activeHasMore = computed(() => activePosts.value.length < activeTotal.value)
const activeLoadMoreText = computed(() => {
  if (activeLoadingMore.value) return "加载更多..."
  return activeHasMore.value ? "上拉加载更多" : "没有更多了"
})
const canSubmitComment = computed(() => commentDraft.value.trim().length >= 5 && !commentSubmitting.value)
const commentInputPlaceholder = computed(() => commentReplyTarget.value
  ? `回复 ${commentReplyTarget.value.author}，至少 5 个字`
  : "写下你的评论，至少 5 个字")
const commentHasMore = computed(() => comments.value.length < commentTotal.value)
const commentLoadMoreText = computed(() => {
  if (commentsLoadingMore.value) return "加载更多评论..."
  return commentHasMore.value ? "上拉查看更多评论" : "没有更多评论了"
})

onLoad(async () => {
  await loadInitialData()
})

onShow(() => {
  if (uni.getStorageSync("mcode_circle_should_refresh")) {
    uni.removeStorageSync("mcode_circle_should_refresh")
    reloadFeeds()
  }
})

onUnmounted(() => {
  if (searchTimer) clearTimeout(searchTimer)
})

onPullDownRefresh(() => {
  reloadFeedsNow().finally(() => {
    uni.stopPullDownRefresh()
  })
})

onReachBottom(() => {
  if (activeTab.value !== 2) {
    loadMoreActivePosts()
  }
})

async function loadInitialData() {
  await Promise.all([
    loadTopics(),
    loadLatestPosts(),
    loadHotPosts(),
  ])
}

async function loadLatestPosts() {
  latestLoading.value = true
  latestError.value = ""
  try {
    const result = await fetchCirclePosts({
      order: "latest",
      keyword: searchKeyword.value,
      topicId: selectedTopicId.value,
      page: 1,
      limit: feedLimit,
    })
    latestPage.value = result.page || 1
    latestPosts.value = result.posts
    latestTotal.value = result.total
    mergeHotTopics(result.topics)
  } catch (error) {
    latestError.value = normalizeErrorMessage(error)
  } finally {
    latestLoading.value = false
  }
}

async function loadHotPosts() {
  hotLoading.value = true
  hotError.value = ""
  try {
    const result = await fetchCirclePosts({
      order: "hot",
      keyword: searchKeyword.value,
      topicId: selectedTopicId.value,
      page: 1,
      limit: feedLimit,
    })
    hotPage.value = result.page || 1
    hotPosts.value = result.posts
    hotTotal.value = result.total
    mergeHotTopics(result.topics)
  } catch (error) {
    hotError.value = normalizeErrorMessage(error)
  } finally {
    hotLoading.value = false
  }
}

async function loadTopics() {
  topicsLoading.value = true
  topicsError.value = ""
  try {
    const result = await fetchCircleTopics({ limit: 60 })
    topics.value = result.topics
  } catch (error) {
    topicsError.value = normalizeErrorMessage(error)
  } finally {
    topicsLoading.value = false
  }
}

function reloadFeeds() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    reloadFeedsNow()
  }, 220)
}

async function reloadFeedsNow() {
  await Promise.all([
    loadLatestPosts(),
    loadHotPosts(),
  ])
}

async function loadMoreActivePosts() {
  if (!activeHasMore.value || activeLoading.value || activeLoadingMore.value) return
  if (activeTab.value === 0) {
    await loadMoreLatestPosts()
    return
  }
  await loadMoreHotPosts()
}

async function loadMoreLatestPosts() {
  latestLoadingMore.value = true
  try {
    const nextPage = latestPage.value + 1
    const result = await fetchCirclePosts({
      order: "latest",
      keyword: searchKeyword.value,
      topicId: selectedTopicId.value,
      page: nextPage,
      limit: feedLimit,
    })
    latestPage.value = result.page || nextPage
    latestPosts.value = appendUniquePosts(latestPosts.value, result.posts)
    latestTotal.value = result.total
    mergeHotTopics(result.topics)
  } catch (error) {
    uni.showToast({ title: normalizeErrorMessage(error), icon: "none" })
  } finally {
    latestLoadingMore.value = false
  }
}

async function loadMoreHotPosts() {
  hotLoadingMore.value = true
  try {
    const nextPage = hotPage.value + 1
    const result = await fetchCirclePosts({
      order: "hot",
      keyword: searchKeyword.value,
      topicId: selectedTopicId.value,
      page: nextPage,
      limit: feedLimit,
    })
    hotPage.value = result.page || nextPage
    hotPosts.value = appendUniquePosts(hotPosts.value, result.posts)
    hotTotal.value = result.total
    mergeHotTopics(result.topics)
  } catch (error) {
    uni.showToast({ title: normalizeErrorMessage(error), icon: "none" })
  } finally {
    hotLoadingMore.value = false
  }
}

function appendUniquePosts(current: CirclePost[], next: CirclePost[]) {
  const seen = new Set(current.map((post) => post.id))
  return [...current, ...next.filter((post) => !seen.has(post.id))]
}

function handleTabChange() {
  if (activeTab.value === 2 && topics.value.length === 0 && !topicsLoading.value) {
    loadTopics()
  }
}

function selectTopic(topic: CircleTopic) {
  selectedTopicId.value = topic.id
  activeTab.value = 0
  reloadFeeds()
}

function clearTopicFilter() {
  selectedTopicId.value = 0
  reloadFeeds()
}

async function openCommentPanel(post: CirclePost) {
  commentPost.value = post
  showCommentPanel.value = true
  comments.value = []
  commentTotal.value = 0
  commentPage.value = 1
  commentsError.value = ""
  commentDraft.value = ""
  commentReplyTarget.value = null
  await reloadComments()
}

function closeCommentPanel() {
  showCommentPanel.value = false
}

async function reloadComments() {
  if (!commentPost.value) return
  const requestPostId = commentPost.value.id
  const requestId = ++commentRequestId
  commentsLoading.value = true
  commentsError.value = ""
  try {
    const result = await fetchCircleComments({
      postId: requestPostId,
      page: 1,
      limit: commentLimit,
    })
    if (requestId !== commentRequestId || commentPost.value?.id !== requestPostId) return
    commentPage.value = result.page || 1
    comments.value = result.comments
    commentTotal.value = result.total
  } catch (error) {
    if (requestId !== commentRequestId || commentPost.value?.id !== requestPostId) return
    commentsError.value = normalizeErrorMessage(error)
  } finally {
    if (requestId === commentRequestId && commentPost.value?.id === requestPostId) {
      commentsLoading.value = false
    }
  }
}

async function loadMoreComments() {
  if (!commentPost.value || !commentHasMore.value || commentsLoading.value || commentsLoadingMore.value) return
  commentsLoadingMore.value = true
  try {
    const nextPage = commentPage.value + 1
    const result = await fetchCircleComments({
      postId: commentPost.value.id,
      page: nextPage,
      limit: commentLimit,
    })
    commentPage.value = result.page || nextPage
    const seen = new Set(comments.value.map((comment) => comment.id))
    comments.value = [...comments.value, ...result.comments.filter((comment) => !seen.has(comment.id))]
    commentTotal.value = result.total
  } catch (error) {
    uni.showToast({ title: normalizeErrorMessage(error), icon: "none" })
  } finally {
    commentsLoadingMore.value = false
  }
}

async function submitComment() {
  if (!commentPost.value || !canSubmitComment.value) return
  const post = commentPost.value
  const content = commentDraft.value.trim()
  const replyTarget = commentReplyTarget.value
  commentSubmitting.value = true
  try {
    const comment = await publishCircleComment({
      postId: post.id,
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
    post.commentCount += 1
    syncPostCommentCount(post.id, post.commentCount)
    uni.showToast({ title: replyTarget ? "回复已发布" : "评论已发布", icon: "success" })
  } catch (error) {
    const message = normalizeErrorMessage(error)
    if (message.includes("未登录")) {
      uni.showToast({ title: "请先登录后再评论", icon: "none" })
      uni.navigateTo({ url: "/pages/auth/login" })
      return
    }
    uni.showToast({ title: message, icon: "none" })
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

function syncPostCommentCount(postId: number, nextCount: number) {
  for (const list of [latestPosts.value, hotPosts.value]) {
    const post = list.find((item) => item.id === postId)
    if (post) post.commentCount = nextCount
  }
}

async function togglePostLike(post: CirclePost) {
  await togglePostAction(post, 1)
}

async function togglePostFavorite(post: CirclePost) {
  await togglePostAction(post, 2)
}

async function togglePostAction(post: CirclePost, actionType: 1 | 2) {
  const wasActive = actionType === 1 ? post.liked : post.favorited
  applyPostAction(post, actionType, !wasActive)
  try {
    const currentValue = await toggleCircleAction(post.id, actionType)
    applyPostAction(post, actionType, currentValue)
  } catch (error) {
    applyPostAction(post, actionType, wasActive)
    handleActionError(error)
  }
}

function applyPostAction(post: CirclePost, actionType: 1 | 2, active: boolean) {
  if (actionType === 1) {
    const delta = active === post.liked ? 0 : active ? 1 : -1
    post.liked = active
    post.likeCount = Math.max(0, post.likeCount + delta)
    return
  }
  const delta = active === post.favorited ? 0 : active ? 1 : -1
  post.favorited = active
  post.favoriteCount = Math.max(0, post.favoriteCount + delta)
}

function mergeHotTopics(nextTopics: CircleTopic[]) {
  if (!nextTopics.length || topics.value.length) return
  topics.value = nextTopics
}

function goPublish() {
  uni.navigateTo({
    url: "/pages/circles/publish",
  })
}

function openPostDetail(post: CirclePost) {
  uni.navigateTo({
    url: `/pages/circles/detail?id=${post.id}`,
  })
}

function handleActionError(error: unknown) {
  const message = normalizeErrorMessage(error)
  if (message.includes("未登录")) {
    uni.showToast({ title: "请先登录后再操作", icon: "none" })
    uni.navigateTo({ url: "/pages/auth/login" })
    return
  }
  uni.showToast({ title: message, icon: "none" })
}

function normalizeErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message || "圈子接口请求失败")
  }
  return "圈子接口请求失败"
}

function formatCompactCount(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(1).replace(/\.0$/, "")}万`
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`
  return String(Math.max(0, value))
}
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  padding: 0 !important;
}

.circles-page {
  --circle-page-bg: var(--up-page-bg-color, #f5f5f7);
  --circle-card-bg: var(--up-card-bg-color, #ffffff);
  --circle-soft-bg: var(--up-hover-bg-color, #eef1f6);
  --circle-main: var(--up-main-color, #303133);
  --circle-content: var(--up-content-color, #606266);
  --circle-tips: var(--up-tips-color, #909193);
  --circle-primary: var(--up-primary, #2979ff);
  --circle-border: 1rpx solid color-mix(in srgb, var(--up-border-color, #d8dde8) 72%, transparent);
  --circle-shadow: 0 20rpx 52rpx rgba(15, 23, 42, 0.08);
  --circle-soft-shadow: 0 10rpx 28rpx rgba(15, 23, 42, 0.06);
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--circle-primary) 14%, transparent) 0, transparent 34%),
    var(--circle-page-bg);
}

.circles-shell {
  min-height: 100vh;
  padding: 0 24rpx 40rpx;
  box-sizing: border-box;
}

.circles-sticky {
  position: relative;
  z-index: 20;
}

.circles-sticky :deep(.u-sticky__content) {
  padding-top: 28rpx;
  background: var(--circle-page-bg);
}

.circles-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  margin-bottom: 18rpx;
}

.circles-header__copy {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.circles-header__eyebrow {
  font-size: 20rpx;
  font-weight: 800;
  letter-spacing: 0.18em;
  color: var(--circle-primary);
}

.circles-header__title {
  font-size: 60rpx;
  font-weight: 800;
  line-height: 1.06;
  letter-spacing: -0.05em;
  color: var(--circle-main);
}

.circles-header__action {
  width: 58rpx;
  height: 58rpx;
  border-radius: 999rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--circle-primary), #2f7cf6);
  box-shadow: 0 18rpx 36rpx color-mix(in srgb, var(--circle-primary) 28%, transparent);
  flex-shrink: 0;
}

.circles-searchbar {
  margin-bottom: 18rpx;
}

.circles-searchbar :deep(.u-search__content) {
  border: none !important;
  border-radius: 24rpx !important;
  background-color: var(--circle-soft-bg) !important;
}

.circles-tabs,
.topic-filter,
.feed-section,
.topics-section,
.post-card {
  border-radius: 32rpx;
  background: var(--circle-card-bg) !important;
  border: var(--circle-border);
  box-shadow: var(--circle-shadow) !important;
}

.circles-tabs {
  padding: 4rpx 12rpx;
  margin-bottom: 12rpx;
}

.topic-filter {
  margin-top: 12rpx;
  padding: 22rpx 24rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
}

.topic-filter__copy {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.topic-filter__label {
  font-size: 20rpx;
  color: var(--circle-tips);
}

.topic-filter__title {
  font-size: 28rpx;
  font-weight: 800;
  color: var(--circle-main);
}

.topic-filter__clear {
  font-size: 24rpx;
  font-weight: 700;
  color: var(--circle-primary);
}

.feed-section,
.topics-section {
  margin-top: 12rpx;
  padding: 24rpx 20rpx calc(24rpx + env(safe-area-inset-bottom));
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18rpx;
}

.section-head--feed {
  padding: 0 8rpx;
}

.section-head__title {
  font-size: 32rpx;
  font-weight: 800;
  color: var(--circle-main);
}

.section-head__hint {
  font-size: 22rpx;
  font-weight: 700;
  color: var(--circle-primary);
}

.circle-state {
  min-height: 260rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
  text-align: center;
  color: var(--circle-tips);
}

.circle-state__title {
  font-size: 30rpx;
  font-weight: 800;
  color: var(--circle-main);
}

.circle-state__text {
  max-width: 520rpx;
  font-size: 24rpx;
  line-height: 1.55;
  color: var(--circle-content);
}

.circle-state--error .circle-state__title {
  color: var(--up-error, #fa3534);
}

.post-list {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.post-card {
  padding: 24rpx;
  box-shadow: var(--circle-soft-shadow) !important;
}

.post-card__author {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 20rpx;
}

.post-card__avatar {
  width: 72rpx;
  height: 72rpx;
  border-radius: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: linear-gradient(135deg, var(--circle-primary), #64d2ff);
  flex-shrink: 0;
}

.post-card__avatar-image {
  width: 100%;
  height: 100%;
  display: block;
}

.post-card__avatar-text {
  font-size: 28rpx;
  font-weight: 800;
  color: #fff;
}

.post-card__author-main {
  flex: 1;
  min-width: 0;
}

.post-card__author-line {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.post-card__author-name {
  font-size: 28rpx;
  font-weight: 800;
  color: var(--circle-main);
}

.post-card__role {
  padding: 5rpx 10rpx;
  border-radius: 999rpx;
  font-size: 18rpx;
  font-weight: 700;
  color: #ffffff;
}

.post-card__time {
  display: block;
  margin-top: 6rpx;
  font-size: 21rpx;
  color: var(--circle-tips);
}

.post-card__title {
  display: block;
  margin-bottom: 12rpx;
  font-size: 32rpx;
  line-height: 1.35;
  font-weight: 800;
  color: var(--circle-main);
}

.post-card__content {
  font-size: 26rpx;
  line-height: 1.62;
  color: var(--circle-content);
}

.post-card__content :deep(.up-markdown),
.post-card__content :deep(.up-markdown p),
.post-card__content :deep(.up-markdown text),
.post-card__content :deep(.up-markdown ._root),
.post-card__content :deep(.up-markdown rich-text) {
  color: var(--circle-content);
  font-size: 26rpx;
  line-height: 1.62;
}

.post-card__content :deep(.up-markdown ._a) {
  color: var(--circle-primary);
}

.post-card__topics {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  margin-top: 18rpx;
}

.post-card__topic {
  padding: 8rpx 14rpx;
  border-radius: 999rpx;
  background: color-mix(in srgb, var(--circle-primary) 10%, var(--circle-card-bg) 90%);
  color: var(--circle-primary);
  font-size: 20rpx;
  font-weight: 700;
}

.post-card__image-grid {
  margin-top: 20rpx;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10rpx;
}

.post-card__image-grid--single {
  display: block;
}

.post-card__image {
  width: 100%;
  height: 188rpx;
  border-radius: 22rpx;
  display: block;
  background: var(--circle-soft-bg);
  overflow: hidden;
}

.post-card__image-grid--single .post-card__image {
  height: 360rpx;
  border-radius: 26rpx;
}

.post-card__actions {
  display: flex;
  align-items: center;
  justify-content: space-around;
  gap: 10rpx;
  margin-top: 22rpx;
  padding-top: 18rpx;
  border-top: var(--circle-border);
}

.post-action {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  min-height: 48rpx;
  border-radius: 999rpx;
  color: var(--circle-tips);
  font-size: 22rpx;
  font-weight: 700;
}

.post-action--active {
  background: var(--circle-soft-bg);
  color: var(--circle-main);
}

.feed-more,
.comment-more {
  min-height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  color: var(--circle-tips);
  font-size: 22rpx;
}

.comment-panel {
  height: 82vh;
  padding: 26rpx 26rpx calc(24rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--circle-card-bg);
  color: var(--circle-main);
}

.comment-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20rpx;
  margin-bottom: 18rpx;
}

.comment-panel__eyebrow,
.comment-panel__title,
.comment-panel__post-title {
  display: block;
}

.comment-panel__eyebrow {
  font-size: 18rpx;
  font-weight: 800;
  letter-spacing: 0.16em;
  color: var(--circle-primary);
}

.comment-panel__title {
  margin-top: 4rpx;
  font-size: 36rpx;
  font-weight: 800;
  color: var(--circle-main);
}

.comment-panel__post {
  padding: 18rpx 20rpx;
  border-radius: 22rpx;
  background: var(--circle-soft-bg);
  margin-bottom: 18rpx;
}

.comment-panel__post-title {
  font-size: 24rpx;
  line-height: 1.45;
  color: var(--circle-content);
}

.comment-list-shell {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.comment-list {
  height: 100%;
  width: 100%;
}

.comment-state {
  min-height: 300rpx;
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
  padding-bottom: 16rpx;
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

.comment-composer {
  margin-top: 16rpx;
  padding: 12rpx;
  border-radius: 999rpx;
  background: var(--circle-soft-bg);
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.comment-composer__input {
  flex: 1;
  min-width: 0;
  height: 64rpx;
  padding: 0 18rpx;
  box-sizing: border-box;
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

.topic-grid {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.topic-card {
  display: flex;
  align-items: center;
  gap: 18rpx;
  padding: 22rpx;
  border-radius: 28rpx;
  background: var(--circle-soft-bg);
}

.topic-card__mark {
  width: 12rpx;
  height: 78rpx;
  border-radius: 999rpx;
  background: linear-gradient(180deg, var(--circle-primary), #64d2ff);
  flex-shrink: 0;
}

.topic-card__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.topic-card__title {
  font-size: 30rpx;
  font-weight: 800;
  color: var(--circle-main);
}

.topic-card__subtitle {
  font-size: 23rpx;
  line-height: 1.45;
  color: var(--circle-content);
}

.topic-card__meta {
  display: flex;
  gap: 16rpx;
  font-size: 20rpx;
  color: var(--circle-tips);
}

@media (max-width: 750rpx) {
  .circles-shell {
    padding-left: 16rpx;
    padding-right: 16rpx;
  }

}
</style>
