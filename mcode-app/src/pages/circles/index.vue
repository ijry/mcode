<template>
  <view class="page circles-page" :style="[upThemeVars, upThemePageStyle]">
    <view class="circles-shell">
      <up-sticky class="circles-sticky" :offset-top="0" :custom-nav-height="0" :bg-color="upThemeVar('--mcode-page-bg', '#f5f5f7')" z-index="20">
        <view class="circles-header">
          <view class="circles-header__copy">
            <text class="circles-header__eyebrow">COMMUNITY</text>
            <text class="circles-header__title">圈子</text>
          </view>
          <view class="circles-header__action" @click="showReservedToast('发布入口即将接入')">
            <up-icon name="plus" size="16" color="#ffffff"></up-icon>
          </view>
        </view>

        <view class="circles-searchbar">
          <up-search
            v-model="searchKeyword"
            placeholder="搜索话题、动态和案例"
            :show-action="false"
            shape="round"
            :bgColor="upThemeVar('--mcode-field-bg', '#e9eaee')"
            borderColor="transparent"
            :color="upThemeVar('--mcode-text-primary', '#1a1b1f')"
            :placeholderColor="upThemeVar('--mcode-text-tertiary', '#9ca3af')"
            :searchIconColor="upThemeVar('--mcode-text-tertiary', '#8b93a5')"
            :height="44"
          ></up-search>
        </view>
      </up-sticky>

      <view class="circle-hero" :style="upThemeCardStyle">
        <view class="circle-hero__copy">
          <text class="circle-hero__label">今日共创现场</text>
          <text class="circle-hero__title">把移动端的 AI 工作流沉淀成真实案例</text>
          <text class="circle-hero__desc">分享远程控制、会话接续、待办执行和产品反馈。</text>
        </view>
        <view class="circle-hero__stats">
          <view class="circle-hero__stat">
            <text class="circle-hero__stat-value">2.8k</text>
            <text class="circle-hero__stat-label">成员</text>
          </view>
          <view class="circle-hero__stat">
            <text class="circle-hero__stat-value">128</text>
            <text class="circle-hero__stat-label">今日动态</text>
          </view>
        </view>
      </view>

      <scroll-view class="topic-scroll" scroll-x show-scrollbar="false" enhanced>
        <view class="topic-row">
          <view
            v-for="topic in mockTopics"
            :key="topic.id"
            class="topic-card"
            :style="{ '--topic-accent': topic.accent }"
            @click="showReservedToast(`${topic.title} 话题页即将接入`)"
          >
            <text class="topic-card__title">{{ topic.title }}</text>
            <text class="topic-card__subtitle">{{ topic.subtitle }}</text>
            <text class="topic-card__heat">{{ topic.heat }} 热度</text>
          </view>
        </view>
      </scroll-view>

      <view class="ranking-card" :style="upThemeCardStyle">
        <view class="section-head">
          <text class="section-head__title">热榜</text>
          <text class="section-head__action" @click="showReservedToast('热榜详情即将接入')">全部</text>
        </view>
        <view class="ranking-list">
          <view v-for="item in mockRankingItems" :key="item.id" class="ranking-item">
            <text class="ranking-item__index">{{ item.id }}</text>
            <view class="ranking-item__body">
              <text class="ranking-item__title u-line-1">{{ item.title }}</text>
              <text class="ranking-item__meta">{{ item.meta }}</text>
            </view>
            <text :class="['ranking-item__trend', `ranking-item__trend--${item.trend}`]">{{ trendLabel(item.trend) }}</text>
          </view>
        </view>
      </view>

      <view class="feed-section">
        <view class="section-head section-head--feed">
          <text class="section-head__title">动态</text>
          <text class="section-head__hint">{{ filteredPosts.length }} 条</text>
        </view>

        <view v-for="post in filteredPosts" :key="post.id" class="post-card" :style="upThemeCardStyle">
          <view class="post-card__author">
            <view class="post-card__avatar">
              <text class="post-card__avatar-text">{{ post.avatarText }}</text>
            </view>
            <view class="post-card__author-main">
              <view class="post-card__author-line">
                <text class="post-card__author-name">{{ post.author }}</text>
                <text class="post-card__role">{{ post.role }}</text>
              </view>
              <text class="post-card__time">{{ post.time }} · #{{ post.topic }}</text>
            </view>
            <up-icon name="more-dot-fill" size="18" :color="upThemeVar('--mcode-text-tertiary', '#8b93a5')"></up-icon>
          </view>

          <text class="post-card__title">{{ post.title }}</text>
          <text class="post-card__content">{{ post.content }}</text>

          <view v-if="post.images.length" class="post-card__image-wrap">
            <image class="post-card__image" :src="post.images[0]" mode="aspectFit" />
          </view>

          <view class="post-card__tags">
            <text v-for="tag in post.tags" :key="tag" class="post-card__tag">#{{ tag }}</text>
          </view>

          <view class="post-card__actions">
            <view :class="['post-action', post.liked && 'post-action--active']" @click="toggleLike(post.id)">
              <up-icon :name="post.liked ? 'heart-fill' : 'heart'" size="16" :color="post.liked ? '#ff3b30' : upThemeVar('--mcode-text-tertiary', '#8b93a5')"></up-icon>
              <text>{{ post.likeCount }}</text>
            </view>
            <view class="post-action" @click="showReservedToast('评论面板即将接入')">
              <up-icon name="chat" size="16" :color="upThemeVar('--mcode-text-tertiary', '#8b93a5')"></up-icon>
              <text>{{ post.commentCount }}</text>
            </view>
            <view :class="['post-action', post.favorited && 'post-action--active']" @click="toggleFavorite(post.id)">
              <up-icon :name="post.favorited ? 'star-fill' : 'star'" size="16" :color="post.favorited ? '#ff9f0a' : upThemeVar('--mcode-text-tertiary', '#8b93a5')"></up-icon>
              <text>{{ post.favoriteCount }}</text>
            </view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import {
  cloneCirclePosts,
  mockRankingItems,
  mockTopics,
  toggleCirclePostFavorite,
  toggleCirclePostLike,
} from "./circleMock"

const searchKeyword = ref("")
const posts = ref(cloneCirclePosts())

const filteredPosts = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) return posts.value
  return posts.value.filter((post) =>
    [post.title, post.content, post.topic, ...post.tags]
      .join(" ")
      .toLowerCase()
      .includes(keyword)
  )
})

function trendLabel(trend: "up" | "hot" | "new") {
  if (trend === "up") return "上升"
  if (trend === "new") return "新"
  return "热"
}

function toggleLike(id: number) {
  toggleCirclePostLike(posts.value, id)
}

function toggleFavorite(id: number) {
  toggleCirclePostFavorite(posts.value, id)
}

function showReservedToast(title: string) {
  uni.showToast({ title, icon: "none" })
}
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  padding: 0 !important;
}

.circles-page {
  background: var(--mcode-page-bg);
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
  background: var(--mcode-page-bg);
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
  color: var(--mcode-primary);
}

.circles-header__title {
  font-size: 60rpx;
  font-weight: 800;
  line-height: 1.06;
  letter-spacing: -0.05em;
  color: var(--mcode-text-primary);
}

.circles-header__action {
  width: 58rpx;
  height: 58rpx;
  border-radius: 999rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0a84ff, #2f7cf6);
  box-shadow: 0 18rpx 36rpx rgba(47, 124, 246, 0.24);
  flex-shrink: 0;
}

.circles-searchbar {
  margin-bottom: 24rpx;
}

.circles-searchbar :deep(.u-search__content) {
  border: none !important;
  border-radius: 24rpx !important;
  background-color: var(--mcode-field-bg) !important;
}

.circle-hero,
.ranking-card,
.post-card {
  border-radius: 32rpx;
  background: var(--mcode-card-bg) !important;
  border: var(--mcode-surface-border);
  box-shadow: var(--mcode-soft-shadow) !important;
}

.circle-hero {
  display: flex;
  justify-content: space-between;
  gap: 24rpx;
  padding: 30rpx;
  overflow: hidden;
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--mcode-primary) 14%, var(--mcode-card-bg) 86%),
      var(--mcode-card-bg)
    ) !important;
}

.circle-hero__copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.circle-hero__label {
  font-size: 20rpx;
  font-weight: 800;
  letter-spacing: 0.16em;
  color: var(--mcode-primary);
}

.circle-hero__title {
  font-size: 36rpx;
  line-height: 1.25;
  font-weight: 800;
  color: var(--mcode-text-primary);
}

.circle-hero__desc {
  font-size: 24rpx;
  line-height: 1.5;
  color: var(--mcode-text-secondary);
}

.circle-hero__stats {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  flex-shrink: 0;
}

.circle-hero__stat {
  min-width: 118rpx;
  padding: 16rpx 18rpx;
  border-radius: 24rpx;
  background: rgba(255, 255, 255, 0.58);
}

.circle-hero__stat-value {
  display: block;
  font-size: 30rpx;
  font-weight: 800;
  color: var(--mcode-text-primary);
}

.circle-hero__stat-label {
  display: block;
  margin-top: 4rpx;
  font-size: 20rpx;
  color: var(--mcode-text-tertiary);
}

.topic-scroll {
  width: 100%;
  margin: 24rpx 0;
  white-space: nowrap;
}

.topic-row {
  display: flex;
  gap: 16rpx;
  padding-right: 8rpx;
}

.topic-card {
  width: 230rpx;
  flex-shrink: 0;
  padding: 22rpx;
  border-radius: 28rpx;
  background: color-mix(in srgb, var(--topic-accent) 10%, var(--mcode-card-bg) 90%);
  border: 1rpx solid color-mix(in srgb, var(--topic-accent) 22%, var(--mcode-card-bg) 78%);
}

.topic-card__title,
.topic-card__subtitle,
.topic-card__heat {
  display: block;
}

.topic-card__title {
  font-size: 28rpx;
  font-weight: 800;
  color: var(--mcode-text-primary);
}

.topic-card__subtitle {
  margin-top: 10rpx;
  font-size: 22rpx;
  color: var(--mcode-text-secondary);
}

.topic-card__heat {
  margin-top: 18rpx;
  font-size: 20rpx;
  font-weight: 700;
  color: var(--topic-accent);
}

.ranking-card {
  padding: 24rpx;
  margin-bottom: 28rpx;
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
  color: var(--mcode-text-primary);
}

.section-head__action,
.section-head__hint {
  font-size: 22rpx;
  font-weight: 700;
  color: var(--mcode-primary);
}

.ranking-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.ranking-item {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.ranking-item__index {
  width: 42rpx;
  height: 42rpx;
  border-radius: 14rpx;
  background: var(--mcode-primary-soft-bg);
  color: var(--mcode-primary);
  text-align: center;
  line-height: 42rpx;
  font-size: 22rpx;
  font-weight: 800;
}

.ranking-item__body {
  flex: 1;
  min-width: 0;
}

.ranking-item__title {
  display: block;
  font-size: 26rpx;
  font-weight: 700;
  color: var(--mcode-text-primary);
}

.ranking-item__meta {
  display: block;
  margin-top: 6rpx;
  font-size: 20rpx;
  color: var(--mcode-text-tertiary);
}

.ranking-item__trend {
  padding: 7rpx 12rpx;
  border-radius: 999rpx;
  font-size: 18rpx;
  font-weight: 800;
  background: var(--mcode-card-soft-bg);
  color: var(--mcode-text-tertiary);
}

.ranking-item__trend--hot {
  background: rgba(255, 59, 48, 0.12);
  color: #ff3b30;
}

.ranking-item__trend--up {
  background: rgba(52, 199, 89, 0.14);
  color: #22a957;
}

.ranking-item__trend--new {
  background: rgba(47, 124, 246, 0.12);
  color: var(--mcode-primary);
}

.feed-section {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
  padding-bottom: calc(36rpx + env(safe-area-inset-bottom));
}

.post-card {
  padding: 24rpx;
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
  background: linear-gradient(135deg, var(--mcode-primary), #64d2ff);
  flex-shrink: 0;
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
  color: var(--mcode-text-primary);
}

.post-card__role {
  padding: 5rpx 10rpx;
  border-radius: 999rpx;
  font-size: 18rpx;
  font-weight: 700;
  color: var(--mcode-primary);
  background: var(--mcode-primary-soft-bg);
}

.post-card__time {
  display: block;
  margin-top: 6rpx;
  font-size: 21rpx;
  color: var(--mcode-text-tertiary);
}

.post-card__title {
  display: block;
  margin-bottom: 12rpx;
  font-size: 32rpx;
  line-height: 1.35;
  font-weight: 800;
  color: var(--mcode-text-primary);
}

.post-card__content {
  display: block;
  font-size: 26rpx;
  line-height: 1.62;
  color: var(--mcode-text-secondary);
}

.post-card__image-wrap {
  margin-top: 20rpx;
  border-radius: 26rpx;
  overflow: hidden;
  background: var(--mcode-card-soft-bg);
}

.post-card__image {
  width: 100%;
  height: 260rpx;
  display: block;
}

.post-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  margin-top: 20rpx;
}

.post-card__tag {
  padding: 8rpx 14rpx;
  border-radius: 999rpx;
  font-size: 20rpx;
  font-weight: 700;
  background: var(--mcode-card-soft-bg);
  color: var(--mcode-text-secondary);
}

.post-card__actions {
  display: flex;
  align-items: center;
  justify-content: space-around;
  gap: 10rpx;
  margin-top: 22rpx;
  padding-top: 18rpx;
  border-top: var(--mcode-surface-border);
}

.post-action {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  min-height: 48rpx;
  border-radius: 999rpx;
  color: var(--mcode-text-tertiary);
  font-size: 22rpx;
  font-weight: 700;
}

.post-action--active {
  background: var(--mcode-card-soft-bg);
  color: var(--mcode-text-primary);
}

@media (max-width: 750rpx) {
  .circles-shell {
    padding-left: 16rpx;
    padding-right: 16rpx;
  }

  .circle-hero {
    padding: 24rpx;
  }

  .circle-hero__stats {
    display: none;
  }
}
</style>
