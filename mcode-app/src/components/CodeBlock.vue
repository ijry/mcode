<template>
  <view class="code-block">
    <view class="code-header">
      <text class="language">{{ language }}</text>
      <view class="actions">
        <u-button size="mini" type="primary" plain @click="copyCode">
          <u-icon name="copy" size="14"></u-icon>
          <text class="btn-text">复制</text>
        </u-button>
      </view>
    </view>
    <view class="code-content">
      <pre><code :class="`language-${language}`" v-html="highlightedCode"></code></pre>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue"

const props = defineProps<{
  code: string
  language?: string
}>()

const highlightedCode = computed(() => {
  return escapeHtml(props.code || "")
})

const language = computed(() => {
  return props.language || "plaintext"
})

function copyCode() {
  uni.setClipboardData({
    data: props.code,
    success: () => {
      uni.showToast({ title: "已复制", icon: "success" })
    },
    fail: () => {
      uni.showToast({ title: "复制失败", icon: "none" })
    },
  })
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
</script>

<style scoped lang="scss">
.code-block {
  margin: 20rpx 0;
  border-radius: 12rpx;
  overflow: hidden;
  background-color: var(--mcode-code-bg);
}

.code-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16rpx 24rpx;
  background-color: var(--mcode-code-header-bg);
  border-bottom: 1rpx solid color-mix(in srgb, var(--mcode-code-header-bg) 74%, #000000 26%);
}

.language {
  font-size: 24rpx;
  color: #abb2bf;
  text-transform: uppercase;
}

.actions {
  display: flex;
  gap: 16rpx;
}

.btn-text {
  margin-left: 8rpx;
  font-size: 22rpx;
}

.code-content {
  padding: 24rpx;
  overflow-x: auto;

  pre {
    margin: 0;
    padding: 0;
    background: transparent;

    code {
      font-family: "Courier New", Courier, monospace;
      font-size: 24rpx;
      line-height: 1.5;
      color: #abb2bf;
      white-space: pre;
      word-wrap: normal;
    }
  }
}

// Highlight.js 样式
:deep(.hljs) {
  color: #abb2bf;
  background: transparent;
}

:deep(.hljs-comment),
:deep(.hljs-quote) {
  color: #5c6370;
  font-style: italic;
}

:deep(.hljs-keyword),
:deep(.hljs-selector-tag),
:deep(.hljs-addition) {
  color: #c678dd;
}

:deep(.hljs-number),
:deep(.hljs-string),
:deep(.hljs-meta .hljs-string),
:deep(.hljs-literal),
:deep(.hljs-doctag),
:deep(.hljs-regexp) {
  color: #98c379;
}

:deep(.hljs-title),
:deep(.hljs-section),
:deep(.hljs-name),
:deep(.hljs-selector-id),
:deep(.hljs-selector-class) {
  color: #e06c75;
}

:deep(.hljs-attribute),
:deep(.hljs-attr),
:deep(.hljs-variable),
:deep(.hljs-template-variable),
:deep(.hljs-class .hljs-title),
:deep(.hljs-type) {
  color: #d19a66;
}

:deep(.hljs-symbol),
:deep(.hljs-bullet),
:deep(.hljs-subst),
:deep(.hljs-meta),
:deep(.hljs-meta .hljs-keyword),
:deep(.hljs-selector-attr),
:deep(.hljs-selector-pseudo),
:deep(.hljs-link) {
  color: #61aeee;
}

:deep(.hljs-built_in),
:deep(.hljs-deletion) {
  color: #e06c75;
}

:deep(.hljs-formula) {
  background: #3e4451;
}

:deep(.hljs-emphasis) {
  font-style: italic;
}

:deep(.hljs-strong) {
  font-weight: bold;
}
</style>
