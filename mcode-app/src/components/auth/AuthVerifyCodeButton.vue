<template>
  <view class="send-verify" @click="handleClick">
    <u-button
      size="small"
      type="primary"
      :plain="true"
      :loading="sending"
      :disabled="disabled"
      :customStyle="buttonStyle"
    >
      {{ label }}
    </u-button>
  </view>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue"

import {
  sendEmailVerifyCode,
  sendMobileVerifyCode,
  type XycloudApiError,
} from "@/services/xycloudAuth"

type VerifyChannel = "email" | "mobile"

interface Props {
  type: VerifyChannel
  account?: string
  title?: string
  token?: string
  verifyUser?: number
  noNeedAccount?: boolean
  text?: string
  countdown?: number
}

const props = withDefaults(defineProps<Props>(), {
  account: "",
  title: "",
  token: "",
  verifyUser: 0,
  noNeedAccount: false,
  text: "获取验证码",
  countdown: 30,
})

const emit = defineEmits<{
  (event: "update:token", value: string): void
  (event: "success", value: { token?: string }): void
}>()

const sending = ref(false)
const secondsLeft = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

const disabled = computed(() => sending.value || secondsLeft.value > 0)
const label = computed(() => {
  if (secondsLeft.value > 0) return `${secondsLeft.value}s`
  return props.text
})

const buttonStyle = {
  boxSizing: "border-box",
}

async function handleClick() {
  if (disabled.value) return
  if (!props.noNeedAccount && !String(props.account || "").trim()) {
    uni.showToast({
      title: `请输入${props.type === "email" ? "邮箱" : "手机号"}`,
      icon: "none",
    })
    return
  }

  sending.value = true
  try {
    const payload = {
      title: props.title || "安全验证",
      verifyUser: props.verifyUser ?? 0,
    }
    const response =
      props.type === "email"
        ? await sendEmailVerifyCode({
            ...payload,
            email: String(props.account || ""),
          })
        : await sendMobileVerifyCode({
            ...payload,
            mobile: String(props.account || ""),
          })

    if (response.token) {
      emit("update:token", response.token)
    }
    emit("success", response)
    startCountdown()
    uni.showToast({
      title: "验证码已发送",
      icon: "success",
    })
  } catch (error) {
    uni.showToast({
      title: getErrorMessage(error),
      icon: "none",
      duration: 2200,
    })
  } finally {
    sending.value = false
  }
}

function startCountdown() {
  stopCountdown()
  secondsLeft.value = Math.max(0, Math.trunc(props.countdown || 0))
  if (secondsLeft.value <= 0) return

  timer = setInterval(() => {
    secondsLeft.value -= 1
    if (secondsLeft.value <= 0) {
      stopCountdown()
    }
  }, 1000)
}

function stopCountdown() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  secondsLeft.value = 0
}

function getErrorMessage(error: unknown) {
  const apiError = error as Partial<XycloudApiError> & { message?: string }
  return String(apiError?.message || "发送失败")
}

onBeforeUnmount(() => {
  stopCountdown()
})
</script>

<style scoped lang="scss">
.send-verify {
  flex-shrink: 0;
}
</style>
