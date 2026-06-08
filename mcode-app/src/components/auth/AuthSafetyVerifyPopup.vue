<template>
  <up-popup v-model:show="visible" mode="bottom" :round="24">
    <view class="popup-panel">
      <view class="popup-panel__header">
        <text class="popup-panel__title">{{ title }}</text>
        <up-icon name="close" size="22" @click="close"></up-icon>
      </view>

      <view class="popup-panel__body">
        <view v-if="verifyList.includes('email')" class="field">
          <text class="field__label">邮箱验证码</text>
          <view class="field__row">
            <up-input
              v-model="form.emailVerify"
              placeholder="请输入邮箱验证码"
              border="surround"
              shape="circle"
              clearable
              :customStyle="fieldRowInputStyle"
            ></up-input>
            <AuthVerifyCodeButton
              type="email"
              :account="email"
              :noNeedAccount="true"
              title="安全验证"
              v-model:token="form.emailToken"
            />
          </view>
        </view>

        <view v-if="verifyList.includes('mobile')" class="field">
          <text class="field__label">手机验证码</text>
          <view class="field__row">
            <up-input
              v-model="form.mobileVerify"
              placeholder="请输入手机验证码"
              border="surround"
              shape="circle"
              clearable
              :customStyle="fieldRowInputStyle"
            ></up-input>
            <AuthVerifyCodeButton
              type="mobile"
              :account="mobile"
              :noNeedAccount="true"
              title="安全验证"
              v-model:token="form.mobileToken"
            />
          </view>
        </view>

        <view v-if="verifyList.includes('gauth')" class="field">
          <text class="field__label">谷歌验证码</text>
          <up-input
            v-model="form.gauth"
            placeholder="请输入谷歌验证码"
            border="surround"
            shape="circle"
            clearable
            :customStyle="fieldInputStyle"
          ></up-input>
        </view>

        <view v-if="verifyList.includes('paypwd')" class="field">
          <text class="field__label">支付密码</text>
          <up-input
            v-model="form.paypwd"
            type="password"
            placeholder="请输入支付密码"
            border="surround"
            shape="circle"
            clearable
            :customStyle="fieldInputStyle"
          ></up-input>
        </view>

        <view v-if="verifyList.includes('password')" class="field">
          <text class="field__label">登录密码</text>
          <up-input
            v-model="form.password"
            type="password"
            placeholder="请输入登录密码"
            border="surround"
            shape="circle"
            clearable
            :customStyle="fieldInputStyle"
          ></up-input>
        </view>

        <view class="popup-panel__actions">
          <u-button type="primary" shape="circle" :loading="loading" @click="handleConfirm">
            确认
          </u-button>
        </view>
      </view>
    </view>
  </up-popup>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue"

import AuthVerifyCodeButton from "@/components/auth/AuthVerifyCodeButton.vue"
import type { XycloudSafetyVerifyPayload } from "@/services/xycloudAuth"

interface Props {
  show: boolean
  verifyList: string[]
  title?: string
  email?: string
  mobile?: string
  initialForm?: Partial<XycloudSafetyVerifyPayload>
}

const props = withDefaults(defineProps<Props>(), {
  title: "安全验证",
  email: "",
  mobile: "",
  initialForm: () => ({}),
})

const emit = defineEmits<{
  (event: "update:show", value: boolean): void
  (event: "confirm", value: XycloudSafetyVerifyPayload): void
}>()

const loading = ref(false)
const form = reactive<XycloudSafetyVerifyPayload>({
  emailVerify: "",
  emailToken: "",
  mobileVerify: "",
  mobileToken: "",
  gauth: "",
  paypwd: "",
  password: "",
})

const visible = computed({
  get: () => props.show,
  set: (value: boolean) => emit("update:show", value),
})

watch(
  () => props.show,
  (show) => {
    if (show) {
      resetForm()
    }
  }
)

watch(
  () => props.initialForm,
  () => {
    if (props.show) {
      resetForm()
    }
  },
  { deep: true }
)

function resetForm() {
  form.emailVerify = String(props.initialForm?.emailVerify || "")
  form.emailToken = String(props.initialForm?.emailToken || "")
  form.mobileVerify = String(props.initialForm?.mobileVerify || "")
  form.mobileToken = String(props.initialForm?.mobileToken || "")
  form.gauth = String(props.initialForm?.gauth || "")
  form.paypwd = String(props.initialForm?.paypwd || "")
  form.password = String(props.initialForm?.password || "")
}

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

async function handleConfirm() {
  loading.value = true
  try {
    emit("confirm", { ...form })
  } finally {
    loading.value = false
  }
}

function close() {
  emit("update:show", false)
}
</script>

<style scoped lang="scss">
.popup-panel {
  padding: 36rpx 30rpx calc(28rpx + env(safe-area-inset-bottom));
  background: var(--up-card-bg-color, #ffffff);
}

.popup-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24rpx;
}

.popup-panel__title {
  font-size: 34rpx;
  font-weight: 600;
  color: var(--up-main-color, #303133);
}

.popup-panel__body {
  display: flex;
  flex-direction: column;
  gap: 22rpx;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.field__label {
  font-size: 26rpx;
  color: var(--up-content-color, #606266);
}

.field__row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  min-width: 0;
  overflow: hidden;
}

.popup-panel__actions {
  padding-top: 16rpx;
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
</style>
