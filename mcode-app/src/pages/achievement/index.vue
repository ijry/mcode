<template>
  <view class="page achievement-page" :style="[upThemeVars, upThemePageStyle]">
    <view class="achievement-shell">
      <up-sticky class="achievement-sticky" :offset-top="0" :custom-nav-height="0" :bg-color="upThemeVar('--up-page-bg-color', '#f5f5f7')" z-index="20">
        <view class="achievement-header">
          <view class="achievement-header__copy">
            <text class="achievement-header__eyebrow">ACHIEVEMENT</text>
            <text class="achievement-header__title">成就中心</text>
          </view>
          <view class="achievement-header__share" @click="shareAchievement">
            <up-icon name="share-square" size="16" color="#ffffff"></up-icon>
          </view>
        </view>
      </up-sticky>

      <view class="hero-card">
        <view class="hero-card__glow"></view>
        <view class="hero-card__top">
          <view class="hero-card__title-wrap">
            <text class="hero-card__label">当前头衔</text>
            <text class="hero-card__title">{{ summary.title.name }}</text>
            <text class="hero-card__subtitle">{{ summary.heroSubMessage }}</text>
          </view>
          <view class="hero-card__percentile">
            <text class="hero-card__percentile-value">{{ summary.percentile }}%</text>
            <text class="hero-card__percentile-label">击败全国用户</text>
          </view>
        </view>

        <text class="hero-card__message">{{ summary.heroMessage }}</text>

        <view class="hero-card__tags">
          <text v-for="tag in summary.beatTags" :key="tag" class="hero-card__tag">{{ tag }}</text>
        </view>

        <view class="hero-card__metrics">
          <view class="hero-card__metric">
            <text class="hero-card__metric-value">{{ summary.nationalRank }}</text>
            <text class="hero-card__metric-label">全国排名</text>
          </view>
          <view class="hero-card__metric">
            <text class="hero-card__metric-value">{{ summary.cityRank }}</text>
            <text class="hero-card__metric-label">同城排名</text>
          </view>
          <view class="hero-card__metric">
            <text class="hero-card__metric-value">{{ summary.friendRank }}</text>
            <text class="hero-card__metric-label">好友排名</text>
          </view>
        </view>
      </view>

      <view class="section-card">
        <view class="section-head">
          <text class="section-head__title">核心战绩</text>
          <text class="section-head__hint">本周手感在线</text>
        </view>
        <view class="stats-grid">
          <view v-for="item in summary.stats" :key="item.key" class="stat-card">
            <text class="stat-card__label">{{ item.label }}</text>
            <view class="stat-card__value-row">
              <text class="stat-card__value">{{ item.value }}</text>
              <text class="stat-card__unit">{{ item.unit }}</text>
            </view>
            <text class="stat-card__desc">{{ item.compareText }}</text>
          </view>
        </view>
      </view>

      <view class="section-card">
        <view class="section-head">
          <text class="section-head__title">成就墙</text>
          <text class="section-head__hint">已解锁 {{ unlocked.length }} / {{ unlocked.length + locked.length }}</text>
        </view>

        <scroll-view class="badge-scroll" scroll-x show-scrollbar="false" enhanced>
          <view class="badge-row">
            <view v-for="badge in unlocked" :key="badge.id" :class="['badge-card', `badge-card--${badge.rarity}`]" @click="openBadge(badge)">
              <view class="badge-card__icon">
                <up-icon :name="badge.icon" size="24" color="#ffffff"></up-icon>
              </view>
              <text class="badge-card__name">{{ badge.name }}</text>
              <text class="badge-card__desc">{{ badge.desc }}</text>
              <text class="badge-card__status">已解锁</text>
            </view>
          </view>
        </scroll-view>

        <view class="locked-list">
          <view v-for="badge in locked" :key="badge.id" class="locked-card" @click="openBadge(badge)">
            <view class="locked-card__main">
              <view class="locked-card__copy">
                <text class="locked-card__name">{{ badge.name }}</text>
                <text class="locked-card__desc">{{ badge.desc }}</text>
              </view>
              <text class="locked-card__progress">{{ badge.progress }}%</text>
            </view>
            <up-line-progress :percentage="badge.progress" activeColor="#2f7cf6" inactiveColor="rgba(47,124,246,0.12)" :showText="false" height="8"></up-line-progress>
          </view>
        </view>
      </view>

      <view class="section-card">
        <view class="section-head">
          <text class="section-head__title">排行榜</text>
          <text class="section-head__hint">{{ ranking.updatedAt }}</text>
        </view>

        <view class="chip-row">
          <view
            v-for="option in scopeOptions"
            :key="option.value"
            :class="['filter-chip', rankingScope === option.value && 'filter-chip--active']"
            @click="changeScope(option.value)"
          >
            <text class="filter-chip__text">{{ option.label }}</text>
          </view>
        </view>

        <view class="chip-row chip-row--secondary">
          <view
            v-for="option in metricOptions"
            :key="option.value"
            :class="['filter-chip', 'filter-chip--compact', rankingMetric === option.value && 'filter-chip--active']"
            @click="changeMetric(option.value)"
          >
            <text class="filter-chip__text">{{ option.label }}</text>
          </view>
        </view>

        <view class="self-rank-card">
          <view>
            <text class="self-rank-card__eyebrow">我的排名</text>
            <text class="self-rank-card__title">第 {{ ranking.self.rank }} 名 · {{ ranking.self.title }}</text>
          </view>
          <view class="self-rank-card__score">
            <text class="self-rank-card__score-value">{{ ranking.self.score }}</text>
            <text class="self-rank-card__score-unit">{{ rankingMetricUnit }}</text>
          </view>
        </view>

        <view class="ranking-list">
          <view
            v-for="item in ranking.list"
            :key="`${item.rank}-${item.userId}`"
            :class="['ranking-item', item.isSelf && 'ranking-item--self']"
          >
            <view :class="['ranking-item__rank', item.rank <= 3 && `ranking-item__rank--top${item.rank}`]">
              <text class="ranking-item__rank-text">{{ item.rank }}</text>
            </view>
            <view class="ranking-item__body">
              <text class="ranking-item__name">{{ item.nickname }}</text>
              <text class="ranking-item__meta">{{ item.title }}</text>
            </view>
            <view class="ranking-item__side">
              <text class="ranking-item__score">{{ item.score }}{{ rankingMetricUnit }}</text>
              <text v-if="item.percentile" class="ranking-item__percentile">超过 {{ item.percentile }}%</text>
            </view>
          </view>
        </view>
      </view>

      <view class="section-card section-card--feed">
        <view class="section-head">
          <text class="section-head__title">最近战报</text>
          <text class="section-head__hint">可以直接拿去炫耀</text>
        </view>
        <view class="feed-list">
          <view v-for="item in feed" :key="item.id" class="feed-item">
            <view class="feed-item__dot"></view>
            <view class="feed-item__body">
              <text class="feed-item__text">{{ item.text }}</text>
              <text class="feed-item__time">{{ item.time }}</text>
            </view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import { onLoad } from "@dcloudio/uni-app"
import {
  getAchievementCenterData,
  getAchievementRanking,
  type AchievementBadge,
  type AchievementCenterData,
  type AchievementMetric,
  type AchievementRankingResponse,
  type AchievementRankScope,
  type AchievementSummary,
} from "@/services/achievement"

const scopeOptions: Array<{ label: string; value: AchievementRankScope }> = [
  { label: "全国榜", value: "national" },
  { label: "同城榜", value: "city" },
  { label: "好友榜", value: "friends" },
]

const metricOptions: Array<{ label: string; value: AchievementMetric }> = [
  { label: "回应次数", value: "response_count" },
  { label: "回应速度", value: "response_speed" },
  { label: "连续活跃", value: "streak_days" },
]

const summary = ref<AchievementSummary>({
  userId: "",
  nickname: "",
  title: { name: "", level: "bronze", icon: "star" },
  percentile: 0,
  nationalRank: 0,
  cityRank: 0,
  friendRank: 0,
  score: 0,
  streakDays: 0,
  responseCount: 0,
  avgResponseSeconds: 0,
  beatTags: [],
  heroMessage: "",
  heroSubMessage: "",
  shareCardText: "",
  stats: [],
})
const unlocked = ref<AchievementBadge[]>([])
const locked = ref<AchievementBadge[]>([])
const feed = ref<AchievementCenterData["feed"]>([])
const rankingScope = ref<AchievementRankScope>("national")
const rankingMetric = ref<AchievementMetric>("response_count")
const ranking = ref<AchievementRankingResponse>({
  scope: "national",
  metric: "response_count",
  updatedAt: "",
  self: { rank: 0, userId: "", nickname: "", avatar: "", score: 0, title: "" },
  list: [],
})

const rankingMetricUnit = computed(() => {
  if (rankingMetric.value === "response_speed") return "秒"
  if (rankingMetric.value === "streak_days") return "天"
  return "次"
})

onLoad(async () => {
  await Promise.all([loadCenterData(), loadRanking()])
})

async function loadCenterData() {
  const data = await getAchievementCenterData()
  summary.value = data.summary
  unlocked.value = data.unlocked
  locked.value = data.locked
  feed.value = data.feed
}

async function loadRanking() {
  ranking.value = await getAchievementRanking(rankingScope.value, rankingMetric.value)
}

async function changeScope(scope: AchievementRankScope) {
  if (rankingScope.value === scope) return
  rankingScope.value = scope
  await loadRanking()
}

async function changeMetric(metric: AchievementMetric) {
  if (rankingMetric.value === metric) return
  rankingMetric.value = metric
  await loadRanking()
}

function openBadge(badge: AchievementBadge) {
  const progressText = badge.unlocked
    ? "已解锁，可直接去朋友圈压一压场子。"
    : `当前进度 ${badge.progress}%${badge.target ? `，目标 ${badge.target}` : ""}。`
  uni.showModal({
    title: badge.name,
    content: `${badge.desc}\n${progressText}`,
    showCancel: false,
    confirmText: "知道了",
  })
}

function shareAchievement() {
  uni.showModal({
    title: "分享成就",
    content: summary.value.shareCardText,
    confirmText: "复制文案",
    cancelText: "关闭",
    success: (res) => {
      if (!res.confirm) return
      uni.setClipboardData({
        data: summary.value.shareCardText,
        showToast: false,
        success: () => {
          uni.showToast({ title: "成就文案已复制", icon: "none" })
        },
      })
    },
  })
}
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  padding: 0 !important;
}

.achievement-page {
  background: var(--up-page-bg-color, #f5f5f7);
}

.achievement-shell {
  min-height: 100vh;
  padding: 0 24rpx calc(40rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

.achievement-sticky :deep(.u-sticky__content) {
  padding-top: 28rpx;
  background: var(--up-page-bg-color, #f5f5f7);
}

.achievement-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 20rpx;
}

.achievement-header__copy {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.achievement-header__eyebrow {
  font-size: 20rpx;
  font-weight: 800;
  letter-spacing: 0.18em;
  color: var(--up-primary, #2979ff);
}

.achievement-header__title {
  font-size: 60rpx;
  font-weight: 800;
  line-height: 1.06;
  letter-spacing: -0.05em;
  color: var(--up-main-color, #303133);
}

.achievement-header__share {
  width: 62rpx;
  height: 62rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx;
  background: linear-gradient(135deg, #0a84ff 0%, #2f7cf6 100%);
  box-shadow: 0 18rpx 36rpx rgba(47, 124, 246, 0.22);
  flex-shrink: 0;
}

.hero-card,
.section-card {
  position: relative;
  border-radius: 32rpx;
  border: 1rpx solid var(--up-border-color, #dadbde);
  background: var(--up-card-bg-color, #ffffff);
  box-shadow: 0 20rpx 52rpx rgba(15, 23, 42, 0.08);
}

.hero-card {
  overflow: hidden;
  padding: 30rpx;
  background:
    radial-gradient(circle at top right, rgba(255, 218, 106, 0.38), transparent 34%),
    linear-gradient(135deg, #1b2747 0%, #2e4f8c 42%, #7d6123 100%);
  border-color: rgba(255, 255, 255, 0.12);
}

.hero-card__glow {
  position: absolute;
  top: -56rpx;
  right: -40rpx;
  width: 220rpx;
  height: 220rpx;
  border-radius: 50%;
  background: rgba(255, 219, 123, 0.24);
  filter: blur(6rpx);
}

.hero-card__top {
  position: relative;
  display: flex;
  justify-content: space-between;
  gap: 20rpx;
}

.hero-card__title-wrap {
  flex: 1;
  min-width: 0;
}

.hero-card__label,
.hero-card__percentile-label,
.hero-card__metric-label {
  font-size: 20rpx;
  color: rgba(255, 255, 255, 0.68);
}

.hero-card__title {
  display: block;
  margin-top: 12rpx;
  font-size: 48rpx;
  font-weight: 800;
  line-height: 1.08;
  color: #ffffff;
}

.hero-card__subtitle {
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.76);
}

.hero-card__percentile {
  min-width: 178rpx;
  padding: 18rpx 20rpx;
  border-radius: 26rpx;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10rpx);
}

.hero-card__percentile-value {
  display: block;
  font-size: 56rpx;
  font-weight: 800;
  line-height: 1;
  color: #ffd867;
}

.hero-card__message {
  position: relative;
  display: block;
  margin-top: 28rpx;
  font-size: 28rpx;
  line-height: 1.5;
  font-weight: 700;
  color: #ffffff;
}

.hero-card__tags {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 20rpx;
}

.hero-card__tag {
  padding: 10rpx 16rpx;
  border-radius: 999rpx;
  font-size: 20rpx;
  font-weight: 700;
  color: #ffffff;
  background: rgba(255, 255, 255, 0.12);
}

.hero-card__metrics {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14rpx;
  margin-top: 26rpx;
}

.hero-card__metric {
  padding: 20rpx 18rpx;
  border-radius: 24rpx;
  background: rgba(255, 255, 255, 0.08);
}

.hero-card__metric-value {
  display: block;
  font-size: 34rpx;
  font-weight: 800;
  color: #ffffff;
}

.section-card {
  margin-top: 24rpx;
  padding: 24rpx;
}

.section-card--feed {
  margin-bottom: 24rpx;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 18rpx;
}

.section-head__title {
  font-size: 32rpx;
  font-weight: 800;
  color: var(--up-main-color, #303133);
}

.section-head__hint {
  font-size: 22rpx;
  font-weight: 700;
  color: var(--up-primary, #2979ff);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
}

.stat-card {
  padding: 22rpx;
  border-radius: 26rpx;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 6%, var(--up-card-bg-color, #ffffff) 94%);
  border: 1rpx solid color-mix(in srgb, var(--up-primary, #2979ff) 10%, var(--up-border-color, #dadbde) 90%);
}

.stat-card__label {
  display: block;
  font-size: 22rpx;
  color: var(--up-content-color, #606266);
}

.stat-card__value-row {
  display: flex;
  align-items: baseline;
  gap: 8rpx;
  margin-top: 10rpx;
}

.stat-card__value {
  font-size: 44rpx;
  font-weight: 800;
  color: var(--up-main-color, #303133);
}

.stat-card__unit {
  font-size: 24rpx;
  color: var(--up-content-color, #606266);
}

.stat-card__desc {
  display: block;
  margin-top: 10rpx;
  font-size: 22rpx;
  line-height: 1.45;
  color: var(--up-tips-color, #909193);
}

.badge-scroll {
  width: 100%;
  white-space: nowrap;
}

.badge-row {
  display: flex;
  gap: 16rpx;
  padding-right: 8rpx;
}

.badge-card {
  width: 250rpx;
  flex-shrink: 0;
  padding: 22rpx;
  border-radius: 28rpx;
  color: #ffffff;
}

.badge-card--legend {
  background: linear-gradient(145deg, #8b6b18 0%, #d4a63f 54%, #5b4211 100%);
}

.badge-card--epic {
  background: linear-gradient(145deg, #1f4679 0%, #2f7cf6 56%, #1f2e58 100%);
}

.badge-card--rare {
  background: linear-gradient(145deg, #284b2e 0%, #34c759 56%, #203125 100%);
}

.badge-card__icon {
  width: 58rpx;
  height: 58rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 18rpx;
  background: rgba(255, 255, 255, 0.16);
}

.badge-card__name {
  display: block;
  margin-top: 18rpx;
  font-size: 30rpx;
  font-weight: 800;
}

.badge-card__desc {
  display: block;
  margin-top: 10rpx;
  font-size: 22rpx;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.78);
}

.badge-card__status {
  display: inline-flex;
  margin-top: 18rpx;
  padding: 8rpx 12rpx;
  border-radius: 999rpx;
  font-size: 18rpx;
  font-weight: 700;
  color: #1f2430;
  background: rgba(255, 255, 255, 0.9);
}

.locked-list {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  margin-top: 22rpx;
}

.locked-card {
  padding: 20rpx;
  border-radius: 24rpx;
  background: var(--up-hover-bg-color, #f5f5f7);
}

.locked-card__main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12rpx;
  margin-bottom: 14rpx;
}

.locked-card__copy {
  flex: 1;
  min-width: 0;
}

.locked-card__name {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.locked-card__desc {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  line-height: 1.45;
  color: var(--up-content-color, #606266);
}

.locked-card__progress {
  font-size: 26rpx;
  font-weight: 800;
  color: var(--up-primary, #2979ff);
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-bottom: 14rpx;
}

.chip-row--secondary {
  margin-bottom: 20rpx;
}

.filter-chip {
  padding: 12rpx 18rpx;
  border-radius: 999rpx;
  background: var(--up-hover-bg-color, #f5f5f7);
  border: 1rpx solid transparent;
}

.filter-chip--compact {
  padding: 10rpx 16rpx;
}

.filter-chip--active {
  background: color-mix(in srgb, var(--up-primary, #2979ff) 12%, var(--up-card-bg-color, #ffffff) 88%);
  border-color: color-mix(in srgb, var(--up-primary, #2979ff) 24%, transparent);
}

.filter-chip__text {
  font-size: 22rpx;
  font-weight: 700;
  color: var(--up-content-color, #606266);
}

.filter-chip--active .filter-chip__text {
  color: var(--up-primary, #2979ff);
}

.self-rank-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 22rpx 24rpx;
  border-radius: 28rpx;
  background: linear-gradient(135deg, rgba(47, 124, 246, 0.12), rgba(47, 124, 246, 0.04));
  margin-bottom: 16rpx;
}

.self-rank-card__eyebrow {
  display: block;
  font-size: 20rpx;
  color: var(--up-tips-color, #909193);
}

.self-rank-card__title {
  display: block;
  margin-top: 8rpx;
  font-size: 28rpx;
  font-weight: 800;
  color: var(--up-main-color, #303133);
}

.self-rank-card__score {
  display: flex;
  align-items: baseline;
  gap: 6rpx;
  flex-shrink: 0;
}

.self-rank-card__score-value {
  font-size: 46rpx;
  font-weight: 800;
  color: var(--up-primary, #2979ff);
}

.self-rank-card__score-unit {
  font-size: 22rpx;
  color: var(--up-content-color, #606266);
}

.ranking-list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.ranking-item {
  display: flex;
  align-items: center;
  gap: 14rpx;
  padding: 18rpx 16rpx;
  border-radius: 22rpx;
  background: var(--up-card-bg-color, #ffffff);
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.ranking-item--self {
  background: color-mix(in srgb, var(--up-primary, #2979ff) 7%, var(--up-card-bg-color, #ffffff) 93%);
}

.ranking-item__rank {
  width: 54rpx;
  height: 54rpx;
  border-radius: 18rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--up-hover-bg-color, #f5f5f7);
  flex-shrink: 0;
}

.ranking-item__rank--top1 {
  background: rgba(255, 184, 0, 0.16);
}

.ranking-item__rank--top2 {
  background: rgba(151, 159, 175, 0.16);
}

.ranking-item__rank--top3 {
  background: rgba(205, 127, 50, 0.16);
}

.ranking-item__rank-text {
  font-size: 24rpx;
  font-weight: 800;
  color: var(--up-main-color, #303133);
}

.ranking-item__body {
  flex: 1;
  min-width: 0;
}

.ranking-item__name {
  display: block;
  font-size: 26rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.ranking-item__meta {
  display: block;
  margin-top: 6rpx;
  font-size: 21rpx;
  color: var(--up-tips-color, #909193);
}

.ranking-item__side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6rpx;
  flex-shrink: 0;
}

.ranking-item__score {
  font-size: 24rpx;
  font-weight: 800;
  color: var(--up-main-color, #303133);
}

.ranking-item__percentile {
  font-size: 20rpx;
  color: var(--up-primary, #2979ff);
}

.feed-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.feed-item {
  display: flex;
  align-items: flex-start;
  gap: 14rpx;
}

.feed-item__dot {
  width: 16rpx;
  height: 16rpx;
  margin-top: 10rpx;
  border-radius: 50%;
  background: var(--up-primary, #2979ff);
  box-shadow: 0 0 0 8rpx rgba(47, 124, 246, 0.1);
  flex-shrink: 0;
}

.feed-item__body {
  flex: 1;
  min-width: 0;
}

.feed-item__text {
  display: block;
  font-size: 24rpx;
  line-height: 1.55;
  color: var(--up-main-color, #303133);
}

.feed-item__time {
  display: block;
  margin-top: 6rpx;
  font-size: 21rpx;
  color: var(--up-tips-color, #909193);
}

@media (max-width: 750rpx) {
  .achievement-shell {
    padding-left: 16rpx;
    padding-right: 16rpx;
  }

  .hero-card__top {
    flex-direction: column;
  }

  .hero-card__percentile {
    min-width: 0;
  }
}
</style>
