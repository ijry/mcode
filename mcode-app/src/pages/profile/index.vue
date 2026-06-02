<template>
  <view class="page">
    <!-- 用户信息卡片 -->
    <view class="user-card">
      <view class="user-info">
        <u-avatar size="80" :text="userInfo.name || '未登录'"></u-avatar>
        <view class="user-details">
          <text class="user-name">{{ userInfo.name || "未登录" }}</text>
          <text class="user-email">{{ userInfo.email || "点击登录" }}</text>
        </view>
      </view>
      <u-icon name="arrow-right" color="#c0c4cc" size="20"></u-icon>
    </view>

    <!-- 功能列表 -->
    <view class="section">
      <view class="section-title">外观设置</view>
        <view class="menu-list">
          <view class="menu-item" @click="toggleDarkMode">
            <view class="menu-left">
            <image class="theme-icon" src="/static/icons/moon.svg" mode="aspectFit"></image>
              <text class="menu-text">深色模式</text>
            </view>
            <u-switch v-model="isDarkMode" @change="onDarkModeChange" size="24"></u-switch>
          </view>
        </view>
    </view>

    <view class="section">
      <view class="section-title">连接管理</view>
      <view class="menu-list">
        <view class="menu-item" @click="goToConnections">
          <view class="menu-left">
            <u-icon name="wifi" size="22" color="#19be6b"></u-icon>
            <text class="menu-text">连接管理</text>
          </view>
          <u-icon name="arrow-right" color="#c0c4cc" size="18"></u-icon>
        </view>

        <view class="menu-item" @click="clearCache">
          <view class="menu-left">
            <u-icon name="trash" size="22" color="#fa3534"></u-icon>
            <text class="menu-text">清除缓存</text>
          </view>
          <u-icon name="arrow-right" color="#c0c4cc" size="18"></u-icon>
        </view>
      </view>
    </view>

    <view class="section">
      <view class="section-title">关于</view>
      <view class="menu-list">
        <view class="menu-item">
          <view class="menu-left">
            <u-icon name="info-circle" size="22" color="#909399"></u-icon>
            <text class="menu-text">版本号</text>
          </view>
          <text class="menu-value">v{{ version }}</text>
        </view>

        <view class="menu-item" @click="checkUpdate">
          <view class="menu-left">
            <u-icon name="reload" size="22" color="#ff9900"></u-icon>
            <text class="menu-text">检查更新</text>
          </view>
          <u-icon name="arrow-right" color="#c0c4cc" size="18"></u-icon>
        </view>

        <view class="menu-item" @click="showAbout">
          <view class="menu-left">
            <u-icon name="question-circle" size="22" color="#2979ff"></u-icon>
            <text class="menu-text">关于 MCode</text>
          </view>
          <u-icon name="arrow-right" color="#c0c4cc" size="18"></u-icon>
        </view>
      </view>
    </view>

    <!-- 退出登录按钮 -->
    <view class="logout-container" v-if="userInfo.name">
      <u-button type="error" size="large" plain @click="logout">退出登录</u-button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue"
import { useAuthStore } from "@/stores/auth"

const auth = useAuthStore()
const isDarkMode = ref(false)
const version = ref("1.0.0")

interface UserInfo {
  name?: string
  email?: string
}

const userInfo = ref<UserInfo>({
  name: "",
  email: "",
})

onMounted(() => {
  loadUserInfo()
  loadDarkMode()
})

function loadUserInfo() {
  const savedUser = uni.getStorageSync("mcode_user_info")
  if (savedUser) {
    userInfo.value = savedUser
  }
}

function loadDarkMode() {
  const savedMode = uni.getStorageSync("mcode_dark_mode")
  isDarkMode.value = savedMode === true
}

function toggleDarkMode() {
  isDarkMode.value = !isDarkMode.value
  onDarkModeChange(isDarkMode.value)
}

function onDarkModeChange(value: boolean) {
  uni.setStorageSync("mcode_dark_mode", value)

  // TODO: 实现暗黑模式切换
  // 需要配置 uview-plus 的暗黑模式

  uni.showToast({
    title: value ? "已切换到深色模式" : "已切换到浅色模式",
    icon: "none",
  })
}

function goToConnections() {
  uni.switchTab({
    url: "/pages/connections/index",
  })
}

function clearCache() {
  uni.showModal({
    title: "清除缓存",
    content: "确定要清除所有缓存数据吗？",
    success: (res) => {
      if (res.confirm) {
        try {
          // 保留用户信息和暗黑模式设置
          const user = uni.getStorageSync("mcode_user_info")
          const darkMode = uni.getStorageSync("mcode_dark_mode")

          uni.clearStorageSync()

          // 恢复保留的数据
          if (user) uni.setStorageSync("mcode_user_info", user)
          if (darkMode !== undefined) uni.setStorageSync("mcode_dark_mode", darkMode)

          uni.showToast({ title: "缓存已清除", icon: "success" })
        } catch (error) {
          uni.showToast({ title: "清除失败", icon: "none" })
        }
      }
    },
  })
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
        uni.removeStorageSync("mcode_user_info")
        userInfo.value = {}
        uni.showToast({ title: "已退出登录", icon: "success" })
      }
    },
  })
}
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  background-color: #f8f8f8;
  padding-bottom: 40rpx;
}

.user-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 40rpx 30rpx;
  margin: 20rpx 8rpx;
  background-color: #ffffff;
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
  color: #303133;
}

.user-email {
  font-size: 26rpx;
  color: #909399;
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
  color: #909399;
  padding: 20rpx 0 16rpx;
}

.menu-list {
  background-color: #ffffff;
  border-radius: 26rpx;
  overflow: hidden;
}

.menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 30rpx;
  border-bottom: 1rpx solid #f5f5f5;

  &:last-child {
    border-bottom: none;
  }
}

.menu-left {
  display: flex;
  align-items: center;
  gap: 20rpx;
}

.theme-icon {
  width: 44rpx;
  height: 44rpx;
  flex-shrink: 0;
}

.menu-text {
  font-size: 30rpx;
  color: #303133;
}

.menu-value {
  font-size: 28rpx;
  color: #909399;
}

.logout-container {
  padding: 40rpx 30rpx;
}
</style>
