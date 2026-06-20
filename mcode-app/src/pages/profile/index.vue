<template>
  <view class="page" :style="[upThemeVars, upThemePageStyle]">
    <!-- 用户信息卡片 -->
    <view class="user-card" :style="upThemeCardStyle" @click="goAuthEntry">
      <view class="user-info">
        <u-avatar size="80" :text="displayName"></u-avatar>
        <view class="user-details">
          <text class="user-name">{{ displayName }}</text>
          <text class="user-email">{{ displayEmail }}</text>
        </view>
      </view>
      <u-icon name="arrow-right" :color="upThemeVar('--up-light-color', '#c0c4cc')" size="20"></u-icon>
    </view>

    <view v-if="showAchievementEntry" class="achievement-entry" @click="goToAchievement">
      <view class="achievement-entry__copy">
        <text class="achievement-entry__eyebrow">ACHIEVEMENT</text>
        <text class="achievement-entry__title">成就中心</text>
        <text class="achievement-entry__subtitle">{{ achievementEntry.highlightText || "看看你击败了多少用户" }}</text>
      </view>

      <view class="achievement-entry__side">
        <text class="achievement-entry__title-chip">{{ achievementEntry.title || "待解锁" }}</text>
        <view class="achievement-entry__percentile">
          <text class="achievement-entry__percentile-value">{{ achievementEntry.percentile || 0 }}%</text>
          <text class="achievement-entry__percentile-label">全国前线</text>
        </view>
        <text class="achievement-entry__progress">已解锁 {{ achievementEntry.unlockedCount }}/{{ achievementEntry.totalCount }}</text>
      </view>

      <view v-if="achievementEntry.hasNew" class="achievement-entry__dot"></view>
    </view>

    <!-- 功能列表 -->
    <view class="section">
      <view class="section-title">外观设置</view>
        <view class="menu-list" :style="upThemeCardStyle">
          <view class="menu-item" @click="showThemeSheet = true">
            <view class="menu-left">
            <image class="theme-icon" src="/static/icons/moon.svg" mode="aspectFit"></image>
              <text class="menu-text">外观模式</text>
            </view>
            <view class="menu-right">
              <text class="menu-value">{{ themeLabel }}</text>
              <u-icon name="arrow-right" :color="upThemeVar('--up-light-color', '#c0c4cc')" size="18"></u-icon>
            </view>
          </view>
        </view>
    </view>

    <view class="section">
      <view class="section-title">连接管理</view>
      <view class="menu-list" :style="upThemeCardStyle">
        <view class="menu-item" @click="goToConnections">
          <view class="menu-left">
            <u-icon name="wifi" size="22" color="#19be6b"></u-icon>
            <text class="menu-text">连接管理</text>
          </view>
          <u-icon name="arrow-right" :color="upThemeVar('--up-light-color', '#c0c4cc')" size="18"></u-icon>
        </view>

        <view class="menu-item" @click="clearCache">
          <view class="menu-left">
            <u-icon name="trash" size="22" color="#fa3534"></u-icon>
            <text class="menu-text">清除缓存</text>
          </view>
          <u-icon name="arrow-right" :color="upThemeVar('--up-light-color', '#c0c4cc')" size="18"></u-icon>
        </view>
      </view>
    </view>

    <view class="section">
      <view class="section-title">宠物陪伴</view>
      <view class="menu-list" :style="upThemeCardStyle">
        <view class="menu-item" @click="openPetManager">
          <view class="menu-left">
            <u-icon name="heart" size="22" color="#ff6b6b"></u-icon>
            <text class="menu-text">宠物管理</text>
          </view>
          <u-icon name="arrow-right" :color="upThemeVar('--up-light-color', '#c0c4cc')" size="18"></u-icon>
        </view>
      </view>
    </view>

    <view class="section">
      <view class="section-title">关于</view>
      <view class="menu-list" :style="upThemeCardStyle">
        <view class="menu-item">
          <view class="menu-left">
            <u-icon name="info-circle" size="22" :color="upThemeVar('--up-tips-color', '#909193')"></u-icon>
            <text class="menu-text">版本号</text>
          </view>
          <text class="menu-value">v{{ version }}</text>
        </view>

        <view class="menu-item" @click="checkUpdate">
          <view class="menu-left">
            <u-icon name="reload" size="22" color="#ff9900"></u-icon>
            <text class="menu-text">检查更新</text>
          </view>
          <u-icon name="arrow-right" :color="upThemeVar('--up-light-color', '#c0c4cc')" size="18"></u-icon>
        </view>

        <view class="menu-item" @click="showAbout">
          <view class="menu-left">
            <u-icon name="question-circle" size="22" color="#2979ff"></u-icon>
            <text class="menu-text">关于 MCode</text>
          </view>
          <u-icon name="arrow-right" :color="upThemeVar('--up-light-color', '#c0c4cc')" size="18"></u-icon>
        </view>
      </view>
    </view>

    <!-- 退出登录按钮 -->
    <view class="logout-container" v-if="isLoggedIn">
      <u-button type="error" size="large" plain @click="logout">退出登录</u-button>
    </view>

    <u-action-sheet
      :show="showThemeSheet"
      :actions="themeActions"
      @select="handleThemeSelect"
      @close="showThemeSheet = false"
    ></u-action-sheet>

    <PetPanel
      v-model:show="showPetPanel"
      :emotion="currentEmotion"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, watch } from "vue"
import { applyThemePreference, getCurrentThemePreference, type ThemePreference } from "@/services/theme"
import { usePetStore } from "@/stores/pet"
import { usePetEngine } from "@/services/petEngine"
import PetPanel from "@/components/pet/PetPanel.vue"
import { useAccountStore } from "@/stores/account"
import {
  getAchievementEntrySummary,
  type AchievementEntrySummary,
} from "@/services/achievement"
import {
  clearInspectableCache,
  inspectClearableCache,
  type CacheInventoryItem,
} from "@/services/cache/cacheManager"

const petStore = usePetStore()
const account = useAccountStore()
const version = ref("1.0.0")
const themePreference = ref<ThemePreference>("system")
const showThemeSheet = ref(false)
const showPetPanel = ref(false)
const achievementEntry = ref<AchievementEntrySummary>({
  hasNew: false,
  unlockedCount: 0,
  totalCount: 0,
  title: "",
  highlightText: "",
  percentile: 0,
})
const achievementEntryLoaded = ref(false)
const themeActions = [
  { name: "跟随系统", value: "system" },
  { name: "浅色", value: "light" },
  { name: "深色", value: "dark" },
]
const { currentEmotion } = usePetEngine()

const themeLabel = computed(() => {
  if (themePreference.value === "dark") return "深色"
  if (themePreference.value === "light") return "浅色"
  return "跟随系统"
})

const isLoggedIn = computed(() => account.isLoggedIn)
const displayName = computed(() => {
  if (!isLoggedIn.value) return "未登录"
  return firstAccountText(
    account.userInfo?.nickname,
    account.userInfo?.name,
    account.userInfo?.username,
    account.userInfo?.account,
    account.userInfo?.email,
    account.userInfo?.mobile,
    "已登录用户"
  )
})
const displayEmail = computed(() => {
  if (!isLoggedIn.value) return "点击登录 / 注册"
  return firstAccountText(
    account.userInfo?.email,
    account.userInfo?.mobile,
    account.userInfo?.account,
    account.userInfo?.username,
    formatUserId(account.userInfo?.id),
    "已登录"
  )
})
const loggedInUserId = computed(() => normalizeUserId(account.userInfo?.id))
const showAchievementEntry = computed(() => isLoggedIn.value && loggedInUserId.value === 3)

onMounted(async () => {
  loadThemePreference()
})

watch(showAchievementEntry, (enabled) => {
  if (!enabled) {
    achievementEntryLoaded.value = false
    return
  }
  loadAchievementEntryOnce()
}, { immediate: true })

function loadThemePreference() {
  themePreference.value = getCurrentThemePreference()
}

function normalizeUserId(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return Math.trunc(parsed)
  }
  return 0
}

function firstAccountText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
    if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value))
  }
  return ""
}

function formatUserId(value: unknown) {
  const id = normalizeUserId(value)
  return id > 0 ? `用户ID：${id}` : ""
}

async function loadAchievementEntry() {
  try {
    achievementEntry.value = await getAchievementEntrySummary()
  } catch (error) {
    console.warn("load achievement entry failed", error)
  }
}

async function loadAchievementEntryOnce() {
  if (achievementEntryLoaded.value) return
  achievementEntryLoaded.value = true
  await loadAchievementEntry()
}

function handleThemeSelect(action: { value?: string }) {
  const nextPreference = (action?.value || "system") as ThemePreference
  themePreference.value = applyThemePreference(nextPreference)
  showThemeSheet.value = false
  uni.showToast({
    title: `已切换为${themeLabel.value}`,
    icon: "none",
  })
}

function goToConnections() {
  uni.switchTab({
    url: "/pages/connections/index",
  })
}

function goToAchievement() {
  uni.navigateTo({
    url: "/pages/achievement/index",
  })
}

function goLogin() {
  uni.navigateTo({
    url: "/pages/auth/login",
  })
}

function goAuthEntry() {
  if (!isLoggedIn.value) {
    goLogin()
  }
}

function openPetManager() {
  if (!petStore.initialized) {
    uni.showToast({
      title: "请先选择宠物伙伴",
      icon: "none",
    })
    return
  }

  showPetPanel.value = true
}

async function clearCache() {
  uni.showLoading({ title: "检查缓存..." })
  let inventory
  try {
    inventory = await inspectClearableCache()
  } catch (error) {
    console.warn("inspect cache failed", error)
    uni.hideLoading()
    uni.showToast({ title: "缓存检查失败", icon: "none" })
    return
  }
  uni.hideLoading()

  if (inventory.blockedReason) {
    uni.showModal({
      title: "暂不能清除缓存",
      content: inventory.blockedReason,
      showCancel: false,
      confirmText: "知道了",
    })
    return
  }

  uni.showModal({
    title: "清除缓存",
    content: buildClearCacheConfirmContent(inventory.items),
    confirmText: "确认清除",
    cancelText: "取消",
    success: async (res) => {
      if (res.confirm) {
        try {
          uni.showLoading({ title: "清除中..." })
          await clearInspectableCache()
          uni.hideLoading()
          uni.showToast({ title: "缓存已清除", icon: "success" })
        } catch (error) {
          console.warn("clear cache failed", error)
          uni.hideLoading()
          uni.showToast({ title: "清除失败", icon: "none" })
        }
      }
    },
  })
}

function buildClearCacheConfirmContent(items: CacheInventoryItem[]) {
  const lines = items.map((item) => `- ${item.title}：${formatCacheCount(item.count)}`)
  return [
    "当前可清除缓存：",
    ...lines,
    "",
    "风险：无服务端数据风险。对话数据清除后，下次进入会从已连接实例重新拉取。",
    "不会清除登录状态、主题设置、连接配置和宠物数据。",
  ].join("\n")
}

function formatCacheCount(count: number) {
  if (!Number.isFinite(count) || count <= 0) return "无缓存"
  return `${Math.floor(count)} 项`
}

function checkUpdate() {
  uni.showLoading({ title: "检查中..." })

  setTimeout(() => {
    uni.hideLoading()
    uni.showToast({ title: "已是最新版本", icon: "none" })
  }, 1000)
}

function showAbout() {
  uni.showModal({
    title: "关于 MCode",
    content: "MCode 是一个多智能体编码助手移动端应用，支持连接到 Codeg 服务器进行会话管理。",
    showCancel: false,
  })
}

function logout() {
  uni.showModal({
    title: "退出登录",
    content: "确定要退出登录吗？",
    success: (res) => {
      if (res.confirm) {
        account.logout()
        uni.showToast({ title: "已退出登录", icon: "success" })
      }
    },
  })
}
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  background-color: var(--up-page-bg-color, var(--up-bg-color, #f3f4f6));
  padding: 0 12px 15px 12px;
}

.user-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 40rpx 30rpx;
  margin: 20rpx 8rpx;
  background-color: var(--up-card-bg-color, #ffffff);
  border-radius: 30rpx;
  box-shadow: none;
}

.achievement-entry {
  position: relative;
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 20rpx;
  padding: 30rpx;
  margin: 12rpx 8rpx 24rpx;
  border-radius: 32rpx;
  overflow: hidden;
  background:
    radial-gradient(circle at top right, rgba(255, 214, 97, 0.34), transparent 30%),
    linear-gradient(135deg, #1d2745 0%, #2d4b83 48%, #7a6225 100%);
  box-shadow: 0 20rpx 50rpx rgba(15, 23, 42, 0.16);
}

.achievement-entry__copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.achievement-entry__eyebrow {
  font-size: 20rpx;
  font-weight: 800;
  letter-spacing: 0.18em;
  color: rgba(255, 255, 255, 0.74);
}

.achievement-entry__title {
  font-size: 42rpx;
  line-height: 1.08;
  font-weight: 800;
  color: #ffffff;
}

.achievement-entry__subtitle {
  font-size: 24rpx;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.8);
}

.achievement-entry__side {
  min-width: 178rpx;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12rpx;
  flex-shrink: 0;
}

.achievement-entry__title-chip {
  padding: 8rpx 14rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.14);
  font-size: 20rpx;
  font-weight: 700;
  color: #ffffff;
}

.achievement-entry__percentile {
  padding: 16rpx 18rpx;
  border-radius: 24rpx;
  background: rgba(255, 255, 255, 0.1);
  text-align: right;
}

.achievement-entry__percentile-value {
  display: block;
  font-size: 42rpx;
  line-height: 1;
  font-weight: 800;
  color: #ffd867;
}

.achievement-entry__percentile-label {
  display: block;
  margin-top: 6rpx;
  font-size: 20rpx;
  color: rgba(255, 255, 255, 0.66);
}

.achievement-entry__progress {
  font-size: 20rpx;
  color: rgba(255, 255, 255, 0.72);
}

.achievement-entry__dot {
  position: absolute;
  top: 22rpx;
  right: 22rpx;
  width: 18rpx;
  height: 18rpx;
  border-radius: 50%;
  background: #ff5f56;
  box-shadow: 0 0 0 8rpx rgba(255, 95, 86, 0.18);
}

.user-info {
  display: flex;
  align-items: center;
  gap: 24rpx;
}

.user-details {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.user-name {
  font-size: 32rpx;
  font-weight: 600;
  color: var(--up-main-color, #303133);
}

.user-email {
  font-size: 26rpx;
  color: var(--up-content-color, #606266);
}

.section {
  margin: 20rpx 8rpx;
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 0;
}

.section-title {
  font-size: 28rpx;
  color: var(--up-content-color, #606266);
  padding: 20rpx 0 16rpx;
  font-weight: 500;
}

.menu-list {
  background-color: var(--up-card-bg-color, #ffffff);
  border-radius: 26rpx;
  overflow: hidden;
}

.menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 30rpx;
  border-bottom: 1rpx solid var(--up-border-color, #dadbde);

  &:last-child {
    border-bottom: none;
  }
}

.menu-left {
  display: flex;
  align-items: center;
  gap: 20rpx;
}

.menu-right {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.theme-icon {
  width: 44rpx;
  height: 44rpx;
  flex-shrink: 0;
}

.menu-text {
  font-size: 30rpx;
  color: var(--up-main-color, #303133);
}

.menu-value {
  font-size: 28rpx;
  color: var(--up-content-color, #606266);
}

.logout-container {
  padding: 40rpx 30rpx;
}
</style>
