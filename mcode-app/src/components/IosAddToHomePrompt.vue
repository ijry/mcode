<template>
  <up-popup v-model:show="show" mode="bottom" :round="24" @close="dismiss">
    <view class="ios-a2hs-sheet" :style="upThemeCardStyle">
      <view class="ios-a2hs-sheet__grab"></view>
      <text class="ios-a2hs-sheet__title">添加到桌面，全屏打开</text>
      <text class="ios-a2hs-sheet__desc">在 Safari 中点击底部分享按钮</text>
      <text class="ios-a2hs-sheet__desc">
        选择“添加到主屏幕”，下次可从桌面全屏打开 MCode
      </text>
      <up-button type="primary" text="我知道了" @click="dismiss"></up-button>
    </view>
  </up-popup>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue"

const IOS_A2HS_DISMISSED_AT_KEY = "mcode_ios_a2hs_dismissed_at"
const IOS_A2HS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

const show = ref(false)

onMounted(() => {
  if (shouldShowIosAddToHomePrompt()) {
    show.value = true
  }
})

function dismiss() {
  try {
    uni.setStorageSync(IOS_A2HS_DISMISSED_AT_KEY, Date.now())
  } catch (error) {
    console.warn("persist ios add-to-home prompt cooldown failed", error)
  }
  show.value = false
}

function shouldShowIosAddToHomePrompt() {
  if (!isH5Runtime()) return false
  if (!isIosSafariBrowser()) return false
  if (isStandaloneDisplayMode()) return false
  if (hasDismissCooldown()) return false
  return true
}

function hasDismissCooldown() {
  try {
    const dismissedAt = Number(uni.getStorageSync(IOS_A2HS_DISMISSED_AT_KEY) || 0)
    if (!dismissedAt) return false
    return Date.now() - dismissedAt < IOS_A2HS_COOLDOWN_MS
  } catch (error) {
    console.warn("read ios add-to-home prompt cooldown failed", error)
    return false
  }
}

function isStandaloneDisplayMode() {
  // #ifdef H5
  const standalone = typeof navigator !== "undefined" && Boolean((navigator as any).standalone)
  const displayModeStandalone =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches
  return standalone || displayModeStandalone
  // #endif
  return false
}

function isIosSafariBrowser() {
  // #ifdef H5
  if (typeof navigator === "undefined") return false
  const userAgent = navigator.userAgent || ""
  const platform = navigator.platform || ""
  const maxTouchPoints = Number((navigator as any).maxTouchPoints || 0)
  const isIphoneOrIpad = /iPhone|iPad/i.test(userAgent)
  const isIpadDesktopUa = platform === "MacIntel" && maxTouchPoints > 1
  if (!isIphoneOrIpad && !isIpadDesktopUa) return false

  const isSafari = /Safari/i.test(userAgent)
  const isOtherIosBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/i.test(userAgent)
  return isSafari && !isOtherIosBrowser
  // #endif
  return false
}

function isH5Runtime() {
  // #ifdef H5
  return true
  // #endif
  return false
}
</script>

<style scoped lang="scss">
.ios-a2hs-sheet {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  padding: 24rpx 32rpx calc(env(safe-area-inset-bottom) + 32rpx);
}

.ios-a2hs-sheet__grab {
  width: 72rpx;
  height: 8rpx;
  margin: 0 auto 8rpx;
  border-radius: 999rpx;
  background: var(--mcode-border-color);
}

.ios-a2hs-sheet__title {
  font-size: 34rpx;
  font-weight: 600;
  color: var(--mcode-text-primary);
  text-align: center;
}

.ios-a2hs-sheet__desc {
  font-size: 28rpx;
  line-height: 1.6;
  color: var(--mcode-text-secondary);
  text-align: center;
}
</style>
