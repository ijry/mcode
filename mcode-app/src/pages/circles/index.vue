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

            <text v-if="post.title.trim()" class="post-card__title">{{ post.title }}</text>
            <text class="post-card__content">{{ post.content }}</text>

            <view v-if="post.topicTitles.length" class="post-card__topics">
              <text
                v-for="topicTitle in post.topicTitles"
                :key="`${post.id}-${topicTitle}`"
                class="post-card__topic"
              >
                #{{ topicTitle }}
              </text>
            </view>

            <view v-if="post.images.length" class="post-card__image-wrap">
              <image class="post-card__image" :src="post.images[0]" mode="aspectFill" />
            </view>

            <view class="post-card__actions">
              <view :class="['post-action', post.liked && 'post-action--active']" @click="togglePostLike(post)">
                <up-icon :name="post.liked ? 'heart-fill' : 'heart'" size="16" :color="post.liked ? '#ff3b30' : upThemeVar('--up-tips-color', '#8b93a5')"></up-icon>
                <text>{{ post.likeCount }}</text>
              </view>
              <view class="post-action" @click="showReservedToast('评论面板即将接入')">
                <up-icon name="chat" size="16" :color="upThemeVar('--up-tips-color', '#8b93a5')"></up-icon>
                <text>{{ post.commentCount }}</text>
              </view>
              <view :class="['post-action', post.favorited && 'post-action--active']" @click="togglePostFavorite(post)">
                <up-icon :name="post.favorited ? 'star-fill' : 'star'" size="16" :color="post.favorited ? '#ff9f0a' : upThemeVar('--up-tips-color', '#8b93a5')"></up-icon>
                <text>{{ post.favoriteCount }}</text>
              </view>
            </view>
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
  </view>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue"
import { onLoad, onShow } from "@dcloudio/uni-app"

import {
  fetchCirclePosts,
  fetchCircleTopics,
  toggleCircleAction,
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
const latestLoading = ref(false)
const hotLoading = ref(false)
const topicsLoading = ref(false)
const latestError = ref("")
const hotError = ref("")
const topicsError = ref("")
const selectedTopicId = ref(0)
let searchTimer: ReturnType<typeof setTimeout> | null = null

const activePosts = computed(() => activeTab.value === 0 ? latestPosts.value : hotPosts.value)
const activeLoading = computed(() => activeTab.value === 0 ? latestLoading.value : hotLoading.value)
const activeError = computed(() => activeTab.value === 0 ? latestError.value : hotError.value)
const activeTotal = computed(() => activeTab.value === 0 ? latestTotal.value : hotTotal.value)
const selectedTopic = computed(() => topics.value.find((topic) => topic.id === selectedTopicId.value) || null)

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
      limit: 20,
    })
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
      limit: 20,
    })
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
    loadLatestPosts()
    loadHotPosts()
  }, 220)
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

function showReservedToast(title: string) {
  uni.showToast({ title, icon: "none" })
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
  display: block;
  font-size: 26rpx;
  line-height: 1.62;
  color: var(--circle-content);
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

.post-card__image-wrap {
  margin-top: 20rpx;
  border-radius: 26rpx;
  overflow: hidden;
  background: var(--circle-soft-bg);
}

.post-card__image {
  width: 100%;
  height: 260rpx;
  display: block;
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
