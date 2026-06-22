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
          <view class="markdown-toolbar">
            <text class="markdown-toolbar__item" @click="insertMarkdown('**加粗文字**')">加粗</text>
            <text class="markdown-toolbar__item" @click="insertMarkdown('*斜体文字*')">斜体</text>
            <text class="markdown-toolbar__item" @click="insertMarkdown('`代码`')">代码</text>
            <text class="markdown-toolbar__item" @click="insertMarkdown('[链接文字](https://example.com)')">链接</text>
            <text
              :class="['markdown-toolbar__item', markdownImageUploading && 'markdown-toolbar__item--disabled']"
              @click="insertMarkdownImage"
            >
              {{ markdownImageUploading ? "上传中" : "图片" }}
            </text>
          </view>
          <textarea
            v-model="content"
            class="content-textarea"
            maxlength="2000"
            placeholder="分享你的使用场景、问题复盘或产品建议"
            placeholder-class="content-textarea__placeholder"
            auto-height
            @blur="handleContentBlur"
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

        <view class="field">
          <view class="field__label-row">
            <text class="field__label">图片</text>
            <text class="field__hint">{{ images.length }}/9</text>
          </view>
          <view class="image-picker">
            <view
              v-for="(image, index) in images"
              :key="`${image}-${index}`"
              class="image-picker__item"
            >
              <image class="image-picker__preview" :src="image" mode="aspectFill" />
              <view class="image-picker__remove" @click="removeImage(index)">
                <up-icon name="close" size="10" color="#ffffff"></up-icon>
              </view>
            </view>
            <view
              v-if="images.length < 9"
              class="image-picker__add"
              :class="uploadingImages && 'image-picker__add--loading'"
              @click="chooseImages"
            >
              <up-loading-icon v-if="uploadingImages" mode="circle" size="18" :color="upThemeVar('--up-primary', '#2979ff')"></up-loading-icon>
              <up-icon v-else name="plus" size="20" :color="upThemeVar('--up-primary', '#2979ff')"></up-icon>
              <text>{{ uploadingImages ? "上传中" : "添加图片" }}</text>
            </view>
          </view>
        </view>

        <view class="publish-actions">
          <up-button type="primary" shape="circle" :loading="submitting || uploadingImages || markdownImageUploading" @click="submitPost">
            {{ submitting ? "发布中..." : uploadingImages || markdownImageUploading ? "图片上传中..." : "发布" }}
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
  uploadCircleImage,
  type CircleTopic,
} from "@/services/circle"
import {
  createMarkdownImageSnippet,
  insertMarkdownSnippet,
} from "./markdownTools"

const title = ref("")
const content = ref("")
const topics = ref<CircleTopic[]>([])
const selectedTopicIds = ref<number[]>([])
const images = ref<string[]>([])
const topicsLoading = ref(false)
const topicsError = ref("")
const submitting = ref(false)
const uploadingImages = ref(false)
const markdownImageUploading = ref(false)
const contentCursor = ref<number | null>(null)

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

function chooseImages() {
  if (uploadingImages.value) return
  const remaining = Math.max(0, 9 - images.value.length)
  if (remaining === 0) return
  uni.chooseImage({
    count: remaining,
    sizeType: ["compressed"],
    sourceType: ["album", "camera"],
    success: async (res) => {
      const tempPaths = Array.isArray(res.tempFilePaths) ? res.tempFilePaths : []
      if (tempPaths.length === 0) return
      uploadingImages.value = true
      try {
        for (const path of tempPaths) {
          const result = await uploadCircleImage(path)
          images.value = [...images.value, result.url].slice(0, 9)
        }
      } catch (error) {
        uni.showToast({ title: normalizeErrorMessage(error), icon: "none", duration: 2500 })
      } finally {
        uploadingImages.value = false
      }
    },
  })
}

function removeImage(index: number) {
  images.value = images.value.filter((_, currentIndex) => currentIndex !== index)
}

function handleContentBlur(event: { detail?: { cursor?: number } }) {
  const cursor = event?.detail?.cursor
  contentCursor.value = typeof cursor === "number" && Number.isFinite(cursor) ? cursor : null
}

function insertMarkdown(snippet: string) {
  const result = insertMarkdownSnippet({
    value: content.value,
    snippet,
    cursor: contentCursor.value,
  })
  content.value = result.value.slice(0, 2000)
  contentCursor.value = Math.min(result.cursor, content.value.length)
}

function insertMarkdownImage() {
  if (markdownImageUploading.value) return
  uni.chooseImage({
    count: 1,
    sizeType: ["compressed"],
    sourceType: ["album", "camera"],
    success: async (res) => {
      const tempPaths = Array.isArray(res.tempFilePaths) ? res.tempFilePaths : []
      if (tempPaths.length === 0) return
      markdownImageUploading.value = true
      try {
        const result = await uploadCircleImage(tempPaths[0])
        insertMarkdown(createMarkdownImageSnippet(result.url))
      } catch (error) {
        uni.showToast({ title: normalizeErrorMessage(error), icon: "none", duration: 2500 })
      } finally {
        markdownImageUploading.value = false
      }
    },
  })
}

async function submitPost() {
  const normalizedContent = content.value.trim()
  if (!normalizedContent) {
    uni.showToast({ title: "请填写正文", icon: "none" })
    return
  }
  if (uploadingImages.value || markdownImageUploading.value) {
    uni.showToast({ title: "图片上传完成后再发布", icon: "none" })
    return
  }

  submitting.value = true
  try {
    await publishCirclePost({
      title: showTitleInput.value ? title.value.trim() : "",
      content: normalizedContent,
      topicIds: selectedTopicIds.value,
      images: images.value,
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

.markdown-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
}

.markdown-toolbar__item {
  padding: 10rpx 16rpx;
  border-radius: 999rpx;
  background: color-mix(in srgb, var(--circle-primary) 10%, var(--circle-card-bg) 90%);
  color: var(--circle-primary);
  font-size: 22rpx;
  font-weight: 800;
}

.markdown-toolbar__item--disabled {
  opacity: 0.58;
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

.image-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
}

.image-picker__item,
.image-picker__add {
  position: relative;
  width: 156rpx;
  height: 156rpx;
  border-radius: 24rpx;
  overflow: hidden;
  background: var(--circle-soft-bg);
}

.image-picker__preview {
  width: 100%;
  height: 100%;
  display: block;
}

.image-picker__remove {
  position: absolute;
  top: 8rpx;
  right: 8rpx;
  width: 34rpx;
  height: 34rpx;
  border-radius: 999rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.58);
}

.image-picker__add {
  border: 1rpx dashed color-mix(in srgb, var(--circle-primary) 44%, var(--up-border-color, #dadbde) 56%);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  color: var(--circle-primary);
  font-size: 22rpx;
  font-weight: 700;
}

.image-picker__add--loading {
  color: var(--circle-tips);
}

.publish-actions {
  margin-top: 34rpx;
}
</style>
