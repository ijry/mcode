<template>
  <view class="markdown-content" v-html="renderedHtml"></view>
</template>

<script setup lang="ts">
import { ref, watch, computed } from "vue"
import { marked } from "marked"
import hljs from "highlight.js"

const props = defineProps<{
  content: string
}>()

// 配置 marked
marked.setOptions({
  highlight: function (code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value
      } catch (err) {
        console.error("代码高亮失败:", err)
      }
    }
    return hljs.highlightAuto(code).value
  },
  breaks: true,
  gfm: true,
})

const renderedHtml = computed(() => {
  try {
    return marked.parse(props.content || "")
  } catch (error) {
    console.error("Markdown 渲染失败:", error)
    return props.content
  }
})
</script>

<style scoped lang="scss">
.markdown-content {
  font-size: 28rpx;
  line-height: 1.6;
  color: #303133;
  word-wrap: break-word;

  :deep(h1),
  :deep(h2),
  :deep(h3),
  :deep(h4),
  :deep(h5),
  :deep(h6) {
    margin: 30rpx 0 20rpx;
    font-weight: 600;
    line-height: 1.4;
  }

  :deep(h1) {
    font-size: 40rpx;
  }

  :deep(h2) {
    font-size: 36rpx;
  }

  :deep(h3) {
    font-size: 32rpx;
  }

  :deep(p) {
    margin: 20rpx 0;
  }

  :deep(code) {
    padding: 4rpx 8rpx;
    background-color: #f5f7fa;
    border-radius: 6rpx;
    font-family: "Courier New", Courier, monospace;
    font-size: 26rpx;
    color: #e83e8c;
  }

  :deep(pre) {
    margin: 20rpx 0;
    padding: 24rpx;
    background-color: #282c34;
    border-radius: 12rpx;
    overflow-x: auto;

    code {
      padding: 0;
      background-color: transparent;
      color: #abb2bf;
      font-size: 24rpx;
      line-height: 1.5;
    }
  }

  :deep(blockquote) {
    margin: 20rpx 0;
    padding: 20rpx 24rpx;
    border-left: 8rpx solid #dcdfe6;
    background-color: #f5f7fa;
    color: #606266;
  }

  :deep(ul),
  :deep(ol) {
    margin: 20rpx 0;
    padding-left: 40rpx;
  }

  :deep(li) {
    margin: 10rpx 0;
  }

  :deep(a) {
    color: #2979ff;
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }

  :deep(img) {
    max-width: 100%;
    border-radius: 12rpx;
    margin: 20rpx 0;
  }

  :deep(table) {
    width: 100%;
    margin: 20rpx 0;
    border-collapse: collapse;
    border: 1rpx solid #dcdfe6;
  }

  :deep(th),
  :deep(td) {
    padding: 16rpx 20rpx;
    border: 1rpx solid #dcdfe6;
    text-align: left;
  }

  :deep(th) {
    background-color: #f5f7fa;
    font-weight: 600;
  }

  :deep(hr) {
    margin: 30rpx 0;
    border: none;
    border-top: 1rpx solid #dcdfe6;
  }
}
</style>
