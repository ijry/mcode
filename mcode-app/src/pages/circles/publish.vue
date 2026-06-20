<template>
  <view class="page circle-publish-page" :style="[upThemeVars, upThemePageStyle]">
    <up-navbar
      :fixed="false"
      :placeholder="false"
      :border="false"
      left-icon="arrow-left"
      :bgColor="'transparent'"
      :leftIconColor="upThemeVar('--up-main-color', '#303133')"
      @leftClick="handleBack"
    >
      <template #center>
        <text class="publish-navbar__title">发布动态</text>
      </template>
    </up-navbar>

    <view class="publish-shell">
      <view class="publish-hero">
        <text class="publish-hero__eyebrow">CIRCLE POST</text>
        <text class="publish-hero__title">先写正文，长内容再补标题</text>
        <text class="publish-hero__desc">正文超过 200 字后，标题输入框会自动出现；标题仍然是选填。</text>
      </view>

      <view class="publish-card" :style="upThemeCardStyle">
        <view v-if="showTitleInput" class="field">
          <text class="field__label">标题（选填）</text>
          <up-input
            v-model="title"
            placeholder="给长内容补一个标题"
            border="surround"
            shape="circle"
            clearable
            maxlength="80"
            :customStyle="fieldInputStyle"
          ></up-input>
        </view>

        <view class="field">
          <view class="field__label-row">
            <text class="field__label">正文</text>
            <text :class="['field__counter', content.length > 200 && 'field__counter--active']">{{ content.length }}/2000</text>
          </view>
          <textarea
            v-model="content"
            class="content-textarea"
            maxlength="2000"
            placeholder="分享你的使用场景、问题复盘或产品建议"
            placeholder-class="content-textarea__placeholder"
            auto-height
          />
        </view>

        <view class="field">
          <view class="field__label-row">
            <text class="field__label">话题</text>
            <text class="field__hint">可多选</text>
          </view>
          <view v-if="topicsLoading" class="topic-loading">
            <up-loading-icon mode="circle" size="18" :color="upThemeVar('--up-primary', '#2979ff')"></up-loading-icon>
            <text>加载话题...</text>
          </view>
          <view v-else-if="topicsError" class="topic-loading topic-loading--error">
            <text>{{ topicsError }}</text>
            <text class="topic-loading__retry" @click="loadTopics">重试</text>
          </view>
          <view v-else class="topic-picker">
            <text
              v-for="topic in topics"
              :key="topic.id"
              :class="['topic-chip', selectedTopicIds.includes(topic.id) && 'topic-chip--active']"
              @click="toggleTopic(topic.id)"
            >
              #{{ topic.title }}
            </text>
          </view>
        </view>

        <view class="publish-actions">
          <up-button type="primary" shape="circle" :loading="submitting" @click="submitPost">
            {{ submitting ? "发布中..." : "发布" }}
          </up-button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import { onLoad } from "@dcloudio/uni-app"

import {
  fetchCircleTopics,
  publishCirclePost,
  type CircleTopic,
} from "@/services/circle"

const title = ref("")
const content = ref("")
const topics = ref<CircleTopic[]>([])
const selectedTopicIds = ref<number[]>([])
const topicsLoading = ref(false)
const topicsError = ref("")
const submitting = ref(false)

const showTitleInput = computed(() => content.value.length > 200)
const fieldInputStyle = {
  width: "100%",
  height: "68rpx",
  background: "var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6))",
}

onLoad(() => {
  loadTopics()
})

async function loadTopics() {
  topicsLoading.value = true
  topicsError.value = ""
  try {
    const result = await fetchCircleTopics({ limit: 60 })
    topics.value = result.topics
  } catch (error) {
    topicsError.value = normalizeErrorMessage(error)
  } finally {
    topicsLoading.value = false
  }
}

function toggleTopic(topicId: number) {
  if (selectedTopicIds.value.includes(topicId)) {
    selectedTopicIds.value = selectedTopicIds.value.filter((id) => id !== topicId)
    return
  }
  selectedTopicIds.value = [...selectedTopicIds.value, topicId]
}

async function submitPost() {
  const normalizedContent = content.value.trim()
  if (!normalizedContent) {
    uni.showToast({ title: "请填写正文", icon: "none" })
    return
  }

  submitting.value = true
  try {
    await publishCirclePost({
      title: showTitleInput.value ? title.value.trim() : "",
      content: normalizedContent,
      topicIds: selectedTopicIds.value,
    })
    uni.setStorageSync("mcode_circle_should_refresh", "1")
    uni.showToast({ title: "发布成功", icon: "success" })
    setTimeout(() => {
      handleBack()
    }, 350)
  } catch (error) {
    const message = normalizeErrorMessage(error)
    if (message.includes("未登录")) {
      uni.showToast({ title: "请先登录后再发布", icon: "none" })
      uni.navigateTo({ url: "/pages/auth/login" })
      return
    }
    uni.showToast({ title: message, icon: "none", duration: 2500 })
  } finally {
    submitting.value = false
  }
}

function handleBack() {
  if (getCurrentPages().length > 1) {
    uni.navigateBack()
    return
  }
  uni.switchTab({ url: "/pages/circles/index" })
}

function normalizeErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message || "圈子接口请求失败")
  }
  return "圈子接口请求失败"
}
</script>

<style scoped lang="scss">
.circle-publish-page {
  --circle-page-bg: var(--up-page-bg-color, #f5f5f7);
  --circle-card-bg: var(--up-card-bg-color, #ffffff);
  --circle-soft-bg: var(--up-hover-bg-color, #eef1f6);
  --circle-main: var(--up-main-color, #303133);
  --circle-content: var(--up-content-color, #606266);
  --circle-tips: var(--up-tips-color, #909193);
  --circle-primary: var(--up-primary, #2979ff);
  --circle-border: 1rpx solid color-mix(in srgb, var(--up-border-color, #d8dde8) 72%, transparent);
  min-height: 100vh;
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--circle-primary) 16%, transparent) 0, transparent 34%),
    var(--circle-page-bg);
}

.publish-navbar__title {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--circle-main);
}

.publish-shell {
  padding: 24rpx 28rpx 48rpx;
}

.publish-hero {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  margin-bottom: 26rpx;
}

.publish-hero__eyebrow {
  font-size: 20rpx;
  font-weight: 800;
  letter-spacing: 0.16em;
  color: var(--circle-primary);
}

.publish-hero__title {
  font-size: 44rpx;
  line-height: 1.18;
  font-weight: 800;
  color: var(--circle-main);
}

.publish-hero__desc {
  font-size: 25rpx;
  line-height: 1.55;
  color: var(--circle-content);
}

.publish-card {
  padding: 30rpx 26rpx;
  border-radius: 32rpx;
  background: var(--circle-card-bg);
  border: var(--circle-border);
  box-shadow: 0 18rpx 44rpx rgba(15, 23, 42, 0.08);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  margin-bottom: 28rpx;
}

.field__label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.field__label {
  font-size: 26rpx;
  color: var(--circle-main);
  font-weight: 700;
}

.field__counter,
.field__hint {
  font-size: 22rpx;
  color: var(--circle-tips);
}

.field__counter--active {
  color: var(--circle-primary);
  font-weight: 700;
}

.content-textarea {
  width: 100%;
  min-height: 300rpx;
  padding: 24rpx;
  box-sizing: border-box;
  border-radius: 28rpx;
  background: var(--circle-soft-bg);
  color: var(--circle-main);
  font-size: 28rpx;
  line-height: 1.6;
}

.content-textarea__placeholder {
  color: var(--circle-tips);
}

.topic-loading {
  min-height: 92rpx;
  border-radius: 24rpx;
  background: var(--circle-soft-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  color: var(--circle-content);
  font-size: 24rpx;
}

.topic-loading--error {
  color: var(--up-error, #fa3534);
}

.topic-loading__retry {
  color: var(--circle-primary);
  font-weight: 700;
}

.topic-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.topic-chip {
  padding: 12rpx 18rpx;
  border-radius: 999rpx;
  border: 1rpx solid var(--up-border-color, #dadbde);
  background: var(--circle-card-bg);
  color: var(--circle-content);
  font-size: 24rpx;
  font-weight: 700;
}

.topic-chip--active {
  border-color: color-mix(in srgb, var(--circle-primary) 42%, transparent);
  background: color-mix(in srgb, var(--circle-primary) 12%, var(--circle-card-bg) 88%);
  color: var(--circle-primary);
}

.publish-actions {
  margin-top: 34rpx;
}
</style>
