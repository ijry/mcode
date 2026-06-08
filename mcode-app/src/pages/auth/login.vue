<template>
  <view class="page auth-page" :style="[upThemeVars, upThemePageStyle]">
    <view class="auth-orb auth-orb--one"></view>
    <view class="auth-orb auth-orb--two"></view>

    <up-navbar
      :autoBack="false"
      :fixed="false"
      :placeholder="false"
      :border="false"
      left-icon="arrow-left"
      :bgColor="'transparent'"
      :leftIconColor="upThemeVar('--up-main-color', '#303133')"
      @leftClick="handleBack"
    >
      <template #center>
        <text class="auth-navbar__title">登录</text>
      </template>
    </up-navbar>

    <view class="auth-hero">
      <view class="auth-badge">用户中心服务由XYCloud提供</view>
      <text class="auth-hero__title">欢迎回来</text>
      <text class="auth-hero__desc">使用账号密码登录你的 MCode 账号</text>
    </view>

    <view class="auth-card" :style="upThemeCardStyle">
      <view class="field">
        <text class="field__label">账号</text>
        <up-input
          v-model="form.account"
          placeholder="请输入账号"
          border="surround"
          shape="circle"
          clearable
          :customStyle="fieldInputStyle"
        ></up-input>
      </view>

      <view class="field">
        <text class="field__label">密码</text>
        <up-input
          v-model="form.password"
          placeholder="请输入登录密码"
          type="password"
          border="surround"
          shape="circle"
          clearable
          :customStyle="fieldInputStyle"
        ></up-input>
      </view>

      <view class="auth-card__actions">
        <up-button type="primary" shape="circle" :loading="loading" @click="handleLogin">
          {{ loading ? "登录中..." : "登录" }}
        </up-button>
      </view>

      <view class="auth-card__footer">
        <text class="auth-link" @click="goRegister">没有账号？去注册</text>
      </view>
    </view>

    <view class="auth-notice">
      <text class="auth-notice__text">用户系统即将退出，敬请期待</text>
    </view>

    <AuthSafetyVerifyPopup
      v-model:show="showVerifyPopup"
      :verifyList="verifyList"
      title="安全验证"
      :initialForm="verifyInitialForm"
      @confirm="handleVerifyConfirm"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue"
import { onLoad } from "@dcloudio/uni-app"

import AuthSafetyVerifyPopup from "@/components/auth/AuthSafetyVerifyPopup.vue"
import {
  login,
  type XycloudApiError,
  type XycloudLoginPayload,
  type XycloudSafetyVerifyPayload,
} from "@/services/xycloudAuth"
import { useAccountStore } from "@/stores/account"

const account = useAccountStore()
const loading = ref(false)
const showVerifyPopup = ref(false)
const verifyList = ref<string[]>([])
const pendingLoginPayload = ref<XycloudLoginPayload | null>(null)

const form = reactive({
  account: "",
  password: "",
})

const verifyInitialForm = computed(() => ({
  password: form.password,
}))

const fieldInputStyle = {
  width: "100%",
  height: "68rpx",
  background: "var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6))",
}

onLoad((options) => {
  if (typeof options?.account === "string" && options.account.trim()) {
    form.account = options.account.trim()
  }
})

async function handleLogin() {
  await submitLogin({
    account: form.account.trim(),
    password: form.password,
  })
}

async function handleVerifyConfirm(verifyData: XycloudSafetyVerifyPayload) {
  if (!pendingLoginPayload.value) return
  await submitLogin({
    ...pendingLoginPayload.value,
    _verify: normalizeVerifyData(verifyData),
  })
}

async function submitLogin(payload: XycloudLoginPayload) {
  if (!payload.account || !payload.password) {
    uni.showToast({
      title: "请输入账号和密码",
      icon: "none",
    })
    return
  }

  loading.value = true
  try {
    const session = await login(payload)
    account.setSession({
      token: session.token,
      userInfo: session.userInfo || {
        name: payload.account,
        email: payload.account.includes("@") ? payload.account : "",
      },
    })
    showVerifyPopup.value = false
    verifyList.value = []
    pendingLoginPayload.value = null
    uni.showToast({
      title: "登录成功",
      icon: "success",
    })
    uni.switchTab({
      url: "/pages/profile/index",
    })
  } catch (error) {
    const apiError = error as Partial<XycloudApiError> & { verifyList?: string[] }
    if (apiError?.code === 401003) {
      verifyList.value = Array.isArray(apiError.verifyList) ? apiError.verifyList : []
      pendingLoginPayload.value = { ...payload }
      showVerifyPopup.value = true
      return
    }

    uni.showToast({
      title: String(apiError?.message || "登录失败"),
      icon: "none",
      duration: 2500,
    })
  } finally {
    loading.value = false
  }
}

function normalizeVerifyData(verifyData: XycloudSafetyVerifyPayload): XycloudSafetyVerifyPayload {
  return {
    emailVerify: String(verifyData.emailVerify || ""),
    emailToken: String(verifyData.emailToken || ""),
    mobileVerify: String(verifyData.mobileVerify || ""),
    mobileToken: String(verifyData.mobileToken || ""),
    gauth: String(verifyData.gauth || ""),
    paypwd: String(verifyData.paypwd || ""),
    password: String(verifyData.password || ""),
  }
}

function goRegister() {
  uni.navigateTo({
    url: "/pages/auth/register",
  })
}

function handleBack() {
  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack()
    return
  }
  uni.switchTab({
    url: "/pages/profile/index",
  })
}
</script>

<style scoped lang="scss">
.auth-page {
  min-height: 100vh;
  position: relative;
  overflow: hidden;
  padding-bottom: 36rpx;
  background:
    radial-gradient(circle at top left, rgba(41, 121, 255, 0.22), transparent 38%),
    radial-gradient(circle at top right, rgba(25, 190, 107, 0.14), transparent 32%),
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--up-primary, #2979ff) 8%, var(--up-page-bg-color, var(--up-bg-color, #f3f4f6)) 92%) 0%,
      var(--up-page-bg-color, var(--up-bg-color, #f3f4f6)) 42%,
      var(--up-card-bg-color, #ffffff) 100%
    );
}

.auth-orb {
  position: absolute;
  border-radius: 9999px;
  filter: blur(12px);
  pointer-events: none;
}

.auth-orb--one {
  width: 300rpx;
  height: 300rpx;
  top: -80rpx;
  right: -100rpx;
  background: rgba(41, 121, 255, 0.16);
}

.auth-orb--two {
  width: 260rpx;
  height: 260rpx;
  top: 220rpx;
  left: -120rpx;
  background: rgba(25, 190, 107, 0.1);
}

.auth-navbar__title {
  font-size: 32rpx;
  font-weight: 600;
  color: var(--up-main-color, #303133);
}

.auth-hero {
  position: relative;
  z-index: 1;
  padding: 28rpx 32rpx 20rpx;
}

.auth-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8rpx 12rpx;
  border-radius: 9999px;
  background: rgba(41, 121, 255, 0.12);
  color: var(--up-primary, #2979ff);
  font-size: 20rpx;
  font-weight: 600;
  line-height: 1.3;
  margin-bottom: 12rpx;
}

.auth-hero__title {
  display: block;
  font-size: 48rpx;
  font-weight: 700;
  line-height: 1.2;
  color: var(--up-main-color, #303133);
}

.auth-hero__desc {
  display: block;
  margin-top: 12rpx;
  font-size: 26rpx;
  line-height: 1.6;
  color: var(--up-content-color, #606266);
}

.auth-card {
  position: relative;
  z-index: 1;
  margin: 0 28rpx;
  padding: 36rpx 28rpx 30rpx;
  border-radius: 32rpx;
  box-shadow: 0 10rpx 26rpx rgba(15, 23, 42, 0.08);
  background: color-mix(in srgb, var(--up-card-bg-color, #ffffff) 92%, transparent);
  border: 1rpx solid var(--up-border-color, #dadbde);
  backdrop-filter: blur(10px);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  margin-bottom: 24rpx;
}

.field__label {
  font-size: 26rpx;
  color: var(--up-content-color, #606266);
  font-weight: 500;
}

.field__input {
  width: 100%;
  height: 84rpx;
  padding: 0 24rpx;
  border-radius: 20rpx;
  box-sizing: border-box;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  color: var(--up-main-color, #303133);
  font-size: 28rpx;
}

:deep(.u-input__content__field-wrapper__field) {
  background-color: transparent !important;
  height: 100%;
  line-height: 1.2;
}

.auth-card__actions {
  margin-top: 20rpx;
}

.auth-card__footer {
  margin-top: 22rpx;
  display: flex;
  justify-content: center;
}

.auth-link {
  font-size: 26rpx;
  color: var(--up-primary, #2979ff);
}

.auth-notice {
  position: relative;
  z-index: 1;
  margin: 28rpx 28rpx 0;
  padding: 18rpx 24rpx;
  border-radius: 24rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  text-align: center;
}

.auth-notice__text {
  font-size: 22rpx;
  line-height: 1.6;
  color: var(--up-tips-color, #909193);
}
</style>
