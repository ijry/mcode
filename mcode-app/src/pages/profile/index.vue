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
import { computed, ref, onMounted } from "vue"
import { applyThemePreference, getCurrentThemePreference, type ThemePreference } from "@/services/theme"
import { usePetStore } from "@/stores/pet"
import { usePetEngine } from "@/services/petEngine"
import PetPanel from "@/components/pet/PetPanel.vue"
import { useAccountStore } from "@/stores/account"
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
const displayName = computed(() => account.userInfo?.name || "未登录")
const displayEmail = computed(() => account.userInfo?.email || "点击登录 / 注册")

onMounted(() => {
  loadThemePreference()
})

function loadThemePreference() {
  themePreference.value = getCurrentThemePreference()
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
  padding-bottom: 40rpx;
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
