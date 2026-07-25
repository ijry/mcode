<template>
  <view class="page" :style="[upThemeVars, upThemePageStyle]">
    <view class="section">
      <view class="section-title">会话设置</view>
      <view class="experimental-notice">
        <u-icon
          class="experimental-notice__icon"
          name="info-circle"
          size="20"
          :color="upThemeVar('--up-warning', '#f9ae3d')"
        ></u-icon>
        <view class="experimental-notice__content">
          <text class="experimental-notice__title">实验性功能</text>
          <text class="experimental-notice__text">
            实时信息流和同步 PC 端 TAB 仅供体验，不建议正式使用。
          </text>
        </view>
      </view>
      <view class="menu-list" :style="upThemeCardStyle">
        <view class="menu-item">
          <view class="menu-left menu-left--column">
            <view class="menu-row-title">
              <u-icon name="chat" size="22" :color="upThemeVar('--up-primary', '#2979ff')"></u-icon>
              <text class="menu-text">会话列表实时消息流</text>
            </view>
            <text class="menu-desc">
              开启后会为进行中的会话建立实时订阅，显示一行生成内容；可能增加网络、电量和性能开销。
            </text>
          </view>
          <switch
            class="menu-switch"
            :checked="conversationListLiveStreamEnabled"
            color="#2979ff"
            @change="handleConversationListLiveStreamChange"
          />
        </view>

        <view class="menu-item" @click="showTabModeSheet = true">
          <view class="menu-left menu-left--column">
            <view class="menu-row-title">
              <u-icon name="list-dot" size="22" :color="upThemeVar('--up-primary', '#2979ff')"></u-icon>
              <text class="menu-text">TAB 多任务</text>
            </view>
            <text class="menu-desc">
              控制会话详情页是否显示多会话 tab，以及 tab 状态由手机本地还是 PC 端维护。
            </text>
          </view>
          <view class="menu-right">
            <text class="menu-value">{{ detailTabModeLabel }}</text>
            <u-icon name="arrow-right" :color="upThemeVar('--up-light-color', '#c0c4cc')" size="18"></u-icon>
          </view>
        </view>
      </view>
    </view>

    <view class="section">
      <view class="section-title">连接调试</view>
      <view class="form-card" :style="upThemeCardStyle">
        <input v-model="relayUrl" class="setting-input" placeholder="Relay URL" />
        <input v-model="directBaseUrl" class="setting-input" placeholder="Direct base URL" />
        <input v-model="token" class="setting-input" type="password" placeholder="Direct token" />
        <view class="button-row">
          <button class="btn" @click="saveRelay">Save relay</button>
          <button class="btn" @click="saveDirect">Save direct</button>
        </view>
        <text v-if="status" class="status-text">{{ status }}</text>
      </view>
    </view>

    <u-action-sheet
      :show="showTabModeSheet"
      :actions="tabModeActions"
      @select="handleTabModeSelect"
      @close="showTabModeSheet = false"
    ></u-action-sheet>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, onMounted, ref } from "vue"
import { useAuthStore } from "@/stores/auth"
import {
  readConversationListLiveStreamEnabled,
  writeConversationListLiveStreamEnabled,
} from "@/services/conversation/conversationListLiveStreamPreference"
import {
  readDetailTabMultitaskMode,
  writeDetailTabMultitaskMode,
  type DetailTabMultitaskMode,
} from "@/services/conversation/detailTabMultitaskPreference"

const auth = useAuthStore()
const currentInstance = getCurrentInstance()
const upThemeVars = computed(() => currentInstance?.proxy?.upThemeVars || {})
const upThemePageStyle = computed(() => currentInstance?.proxy?.upThemePageStyle || {})
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

const relayUrl = ref("")
const directBaseUrl = ref("")
const token = ref("")
const status = ref("")
const conversationListLiveStreamEnabled = ref(false)
const detailTabMode = ref<DetailTabMultitaskMode>("off")
const showTabModeSheet = ref(false)

const tabModeActions: Array<{ name: string; value: DetailTabMultitaskMode }> = [
  { name: "关闭", value: "off" },
  { name: "移动端自管", value: "mobile" },
  { name: "同步 PC 端", value: "pc" },
]

const detailTabModeLabel = computed(() => {
  if (detailTabMode.value === "mobile") return "移动端自管"
  if (detailTabMode.value === "pc") return "同步 PC 端"
  return "关闭"
})

onMounted(() => {
  conversationListLiveStreamEnabled.value = readConversationListLiveStreamEnabled()
  detailTabMode.value = readDetailTabMultitaskMode()
})

function handleConversationListLiveStreamChange(event: { detail?: { value?: boolean } }) {
  const enabled = writeConversationListLiveStreamEnabled(Boolean(event?.detail?.value))
  conversationListLiveStreamEnabled.value = enabled
  uni.showToast({
    title: enabled ? "会话列表实时消息流已开启" : "会话列表实时消息流已关闭",
    icon: "none",
  })
}

function handleTabModeSelect(action: { value?: DetailTabMultitaskMode }) {
  detailTabMode.value = writeDetailTabMultitaskMode(action.value || "off")
  showTabModeSheet.value = false
  uni.showToast({
    title: `TAB 多任务：${detailTabModeLabel.value}`,
    icon: "none",
  })
}

function saveRelay() {
  auth.setRelayMode(relayUrl.value, auth.relaySession ?? { accessToken: "" })
  status.value = "Relay settings saved"
}

function saveDirect() {
  auth.setDirectMode(directBaseUrl.value, token.value)
  status.value = "Direct settings saved"
}
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  background-color: var(--up-page-bg-color, var(--up-bg-color, #f3f4f6));
  padding: 16rpx 20rpx 40rpx;
}

.section {
  margin: 20rpx 0;
}

.section-title {
  font-size: 28rpx;
  color: var(--up-content-color, #606266);
  padding: 20rpx 0 16rpx;
  font-weight: 500;
}

.experimental-notice {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
  margin-bottom: 16rpx;
  padding: 22rpx 24rpx;
  border: 1rpx solid color-mix(in srgb, var(--up-warning, #f9ae3d) 32%, var(--up-border-color, #dadbde) 68%);
  border-radius: 22rpx;
  background-color: color-mix(in srgb, var(--up-warning, #f9ae3d) 12%, var(--up-card-bg-color, #ffffff) 88%);
}

.experimental-notice__icon {
  flex-shrink: 0;
  margin-top: 2rpx;
}

.experimental-notice__content {
  min-width: 0;
}

.experimental-notice__title,
.experimental-notice__text {
  display: block;
}

.experimental-notice__title {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--up-main-color, #303133);
}

.experimental-notice__text {
  margin-top: 6rpx;
  font-size: 24rpx;
  line-height: 1.45;
  color: var(--up-content-color, #606266);
}

.menu-list,
.form-card {
  background-color: var(--up-card-bg-color, #ffffff);
  border-radius: 26rpx;
  overflow: hidden;
}

.menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
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

.menu-left--column {
  flex: 1;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
}

.menu-row-title {
  display: flex;
  align-items: center;
  gap: 20rpx;
  min-width: 0;

  .menu-text {
    flex: 0 0 auto;
    white-space: nowrap;
  }
}

.menu-right {
  display: flex;
  align-items: center;
  gap: 12rpx;
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

.menu-desc {
  margin-top: 10rpx;
  padding-left: 64rpx;
  font-size: 24rpx;
  line-height: 1.45;
  color: var(--up-tips-color, #909193);
}

.menu-switch {
  flex-shrink: 0;
}

.form-card {
  padding: 26rpx;
}

.setting-input {
  height: 76rpx;
  padding: 0 22rpx;
  margin-bottom: 18rpx;
  border-radius: 18rpx;
  background: var(--up-page-bg-color, #f5f7fa);
  color: var(--up-main-color, #303133);
  font-size: 28rpx;
}

.button-row {
  display: flex;
  gap: 18rpx;
}

.btn {
  flex: 1;
  margin: 0;
  font-size: 26rpx;
}

.status-text {
  display: block;
  margin-top: 18rpx;
  font-size: 24rpx;
  color: var(--up-tips-color, #909193);
}
</style>

