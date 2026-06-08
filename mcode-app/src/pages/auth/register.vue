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
        <text class="auth-navbar__title">注册</text>
      </template>
    </up-navbar>

    <view class="auth-hero">
      <view class="auth-badge">用户中心服务由XYCloud提供</view>
      <text class="auth-hero__title">创建新账号</text>
      <text class="auth-hero__desc">邮箱或手机注册后即可进入 MCode</text>
    </view>

    <view class="auth-card" :style="upThemeCardStyle">
      <up-tabs
        v-model:current="activeTab"
        :list="tabList"
        keyName="title"
        :scrollable="false"
      ></up-tabs>

      <view v-if="activeTab === 0" class="tab-panel">
        <view class="field">
          <text class="field__label">邮箱</text>
          <up-input
            v-model="emailForm.email"
            placeholder="请输入邮箱地址"
            border="surround"
            shape="circle"
            clearable
            :customStyle="fieldInputStyle"
          ></up-input>
        </view>

        <view class="field">
          <text class="field__label">邮箱验证码</text>
          <view class="field__row">
            <up-input
              v-model="emailForm.verify"
              placeholder="请输入邮箱验证码"
              border="surround"
              shape="circle"
              clearable
              :customStyle="fieldRowInputStyle"
            ></up-input>
            <AuthVerifyCodeButton
              type="email"
              :account="emailForm.email"
              title="用户注册"
              v-model:token="emailForm.token"
            />
          </view>
        </view>

        <view class="field">
          <text class="field__label">密码</text>
          <up-input
            v-model="emailForm.password"
            type="password"
            placeholder="请输入登录密码"
            border="surround"
            shape="circle"
            clearable
            :customStyle="fieldInputStyle"
          ></up-input>
        </view>

        <view class="field">
          <text class="field__label">邀请码</text>
          <up-input
            v-model="emailForm.inviteCode"
            placeholder="邀请码（选填）"
            border="surround"
            shape="circle"
            clearable
            :customStyle="fieldInputStyle"
          ></up-input>
        </view>

        <view class="auth-agreement">
          <up-checkbox v-model:checked="emailForm.agreement" usedAlone size="medium">
            我已阅读并同意
          </up-checkbox>
          <text class="auth-agreement__link">《用户协议》</text>
          <text class="auth-agreement__separator">和</text>
          <text class="auth-agreement__link">《隐私政策》</text>
        </view>

        <view class="auth-card__actions">
          <up-button type="primary" shape="circle" :loading="loading" @click="submitEmail">
            {{ loading ? "注册中..." : "立即注册" }}
          </up-button>
        </view>
      </view>

      <view v-else class="tab-panel">
        <view class="field">
          <text class="field__label">手机号</text>
          <up-input
            v-model="mobileForm.mobile"
            type="number"
            placeholder="请输入手机号"
            border="surround"
            shape="circle"
            clearable
            :customStyle="fieldInputStyle"
          ></up-input>
        </view>

        <view class="field">
          <text class="field__label">手机验证码</text>
          <view class="field__row">
            <up-input
              v-model="mobileForm.verify"
              placeholder="请输入手机验证码"
              border="surround"
              shape="circle"
              clearable
              :customStyle="fieldRowInputStyle"
            ></up-input>
            <AuthVerifyCodeButton
              type="mobile"
              :account="mobileForm.mobile"
              title="用户注册"
              v-model:token="mobileForm.token"
            />
          </view>
        </view>

        <view class="field">
          <text class="field__label">密码</text>
          <up-input
            v-model="mobileForm.password"
            type="password"
            placeholder="请输入登录密码"
            border="surround"
            shape="circle"
            clearable
            :customStyle="fieldInputStyle"
          ></up-input>
        </view>

        <view class="field">
          <text class="field__label">邀请码</text>
          <up-input
            v-model="mobileForm.inviteCode"
            placeholder="邀请码（选填）"
            border="surround"
            shape="circle"
            clearable
            :customStyle="fieldInputStyle"
          ></up-input>
        </view>

        <view class="auth-agreement">
          <up-checkbox v-model:checked="mobileForm.agreement" usedAlone size="medium">
            我已阅读并同意
          </up-checkbox>
          <text class="auth-agreement__link">《用户协议》</text>
          <text class="auth-agreement__separator">和</text>
          <text class="auth-agreement__link">《隐私政策》</text>
        </view>

        <view class="auth-card__actions">
          <up-button type="primary" shape="circle" :loading="loading" @click="submitMobile">
            {{ loading ? "注册中..." : "立即注册" }}
          </up-button>
        </view>
      </view>

      <view class="auth-card__footer">
        <text class="auth-link" @click="goLogin()">已有账号？去登录</text>
      </view>
    </view>

    <view class="auth-notice">
      <text class="auth-notice__text">用户系统即将退出，敬请期待</text>
    </view>

    <AuthSafetyVerifyPopup
      v-model:show="showVerifyPopup"
      :verifyList="verifyList"
      title="安全验证"
      :email="activeTab === 0 ? emailForm.email : ''"
      :mobile="activeTab === 1 ? mobileForm.mobile : ''"
      :initialForm="verifyInitialForm"
      @confirm="handleVerifyConfirm"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue"
import { onLoad } from "@dcloudio/uni-app"

import AuthSafetyVerifyPopup from "@/components/auth/AuthSafetyVerifyPopup.vue"
import AuthVerifyCodeButton from "@/components/auth/AuthVerifyCodeButton.vue"
import {
  registerEmail,
  registerMobile,
  type XycloudApiError,
  type XycloudRegisterEmailPayload,
  type XycloudRegisterMobilePayload,
  type XycloudSafetyVerifyPayload,
} from "@/services/xycloudAuth"

const loading = ref(false)
const activeTab = ref(0)
const showVerifyPopup = ref(false)
const verifyList = ref<string[]>([])
const pendingSubmit = ref<"email" | "mobile" | null>(null)

const tabList = [
  { value: "email", title: "邮箱注册" },
  { value: "mobile", title: "手机号注册" },
]

const emailForm = reactive({
  email: "",
  verify: "",
  token: "",
  password: "",
  inviteCode: "",
  agreement: true,
})

const mobileForm = reactive({
  mobile: "",
  verify: "",
  token: "",
  password: "",
  inviteCode: "",
  agreement: true,
})

const verifyInitialForm = computed(() => ({
  password: activeTab.value === 0 ? emailForm.password : mobileForm.password,
}))

const fieldInputStyle = {
  width: "100%",
  height: "68rpx",
  background: "var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6))",
}

const fieldRowInputStyle = {
  flex: 1,
  width: "0",
  minWidth: "0",
  height: "56rpx",
  padding: "0 16rpx",
  boxSizing: "border-box",
  background: "var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6))",
}

onLoad((options) => {
  const inviteCode = normalizeQueryValue(options?.inviteCode)
  if (inviteCode) {
    emailForm.inviteCode = inviteCode
    mobileForm.inviteCode = inviteCode
  }
})

async function submitEmail() {
  await submitRegister("email", {
    email: emailForm.email.trim(),
    verify: emailForm.verify.trim(),
    token: emailForm.token.trim(),
    password: emailForm.password,
    inviteCode: emailForm.inviteCode.trim(),
    agreement: emailForm.agreement,
  })
}

async function submitMobile() {
  await submitRegister("mobile", {
    mobile: mobileForm.mobile.trim(),
    verify: mobileForm.verify.trim(),
    token: mobileForm.token.trim(),
    password: mobileForm.password,
    inviteCode: mobileForm.inviteCode.trim(),
    agreement: mobileForm.agreement,
  })
}

async function handleVerifyConfirm(verifyData: XycloudSafetyVerifyPayload) {
  if (pendingSubmit.value === "email") {
    await submitRegister("email", {
      email: emailForm.email.trim(),
      verify: emailForm.verify.trim(),
      token: emailForm.token.trim(),
      password: emailForm.password,
      inviteCode: emailForm.inviteCode.trim(),
      agreement: emailForm.agreement,
      _verify: normalizeVerifyData(verifyData),
    })
    return
  }

  if (pendingSubmit.value === "mobile") {
    await submitRegister("mobile", {
      mobile: mobileForm.mobile.trim(),
      verify: mobileForm.verify.trim(),
      token: mobileForm.token.trim(),
      password: mobileForm.password,
      inviteCode: mobileForm.inviteCode.trim(),
      agreement: mobileForm.agreement,
      _verify: normalizeVerifyData(verifyData),
    })
  }
}

async function submitRegister(
  type: "email",
  payload: XycloudRegisterEmailPayload
): Promise<void>
async function submitRegister(
  type: "mobile",
  payload: XycloudRegisterMobilePayload
): Promise<void>
async function submitRegister(
  type: "email" | "mobile",
  payload: XycloudRegisterEmailPayload | XycloudRegisterMobilePayload
) {
  if (!payload.agreement) {
    uni.showToast({
      title: "请先勾选用户协议与隐私政策",
      icon: "none",
    })
    return
  }

  if (!isPayloadValid(type, payload)) {
    uni.showToast({
      title: "请填写完整注册信息",
      icon: "none",
    })
    return
  }

  loading.value = true
  try {
    if (type === "email") {
      await registerEmail(payload as XycloudRegisterEmailPayload)
    } else {
      await registerMobile(payload as XycloudRegisterMobilePayload)
    }

    showVerifyPopup.value = false
    verifyList.value = []
    pendingSubmit.value = null
    uni.showToast({
      title: "注册成功",
      icon: "success",
    })
    redirectToLogin()
  } catch (error) {
    const apiError = error as Partial<XycloudApiError> & { verifyList?: string[] }
    if (apiError?.code === 401003) {
      verifyList.value = Array.isArray(apiError.verifyList) ? apiError.verifyList : []
      pendingSubmit.value = type
      showVerifyPopup.value = true
      return
    }

    uni.showToast({
      title: String(apiError?.message || "注册失败"),
      icon: "none",
      duration: 2500,
    })
  } finally {
    loading.value = false
  }
}

function isPayloadValid(
  type: "email" | "mobile",
  payload: XycloudRegisterEmailPayload | XycloudRegisterMobilePayload
) {
  if (type === "email") {
    const emailPayload = payload as XycloudRegisterEmailPayload
    return Boolean(emailPayload.email && emailPayload.verify && emailPayload.token && emailPayload.password)
  }
  const mobilePayload = payload as XycloudRegisterMobilePayload
  return Boolean(
    mobilePayload.mobile && mobilePayload.verify && mobilePayload.token && mobilePayload.password
  )
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

function normalizeQueryValue(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function goLogin() {
  uni.navigateTo({
    url: "/pages/auth/login",
  })
}

function redirectToLogin() {
  uni.redirectTo({
    url: "/pages/auth/login",
  })
}

function handleBack() {
  if (getCurrentPages().length > 1) {
    uni.navigateBack()
    return
  }
  goLogin()
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

.tab-panel {
  margin-top: 28rpx;
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

.field__row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  min-width: 0;
  overflow: hidden;
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

:deep(.field__row .u-input) {
  flex: 1 1 0 !important;
  width: 0 !important;
  min-width: 0 !important;
  overflow: hidden;
}

:deep(.field__row .u-input__content) {
  min-width: 0;
  overflow: hidden;
}

:deep(.field__row .u-input__content__field-wrapper) {
  min-width: 0;
  overflow: hidden;
}

:deep(.field__row .u-input__content__field-wrapper__field) {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.auth-agreement {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8rpx;
  margin-top: 10rpx;
  color: var(--up-content-color, #606266);
  font-size: 24rpx;
}

.auth-agreement__link {
  color: var(--up-primary, #2979ff);
}

.auth-agreement__separator {
  color: var(--up-content-color, #606266);
}

.auth-card__actions {
  margin-top: 22rpx;
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
