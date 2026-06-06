<template>
  <view class="markdown-content" v-html="renderedHtml"></view>
</template>

<script setup lang="ts">
import { computed } from "vue"

const props = defineProps<{
  content: string
}>()

const renderedHtml = computed(() => {
  try {
    return renderMarkdown(props.content || "")
  } catch (error) {
    console.error("Markdown 渲染失败:", error)
    return escapeHtml(props.content || "")
  }
})

function renderMarkdown(input: string) {
  const escaped = escapeHtml(input).replace(/\r\n/g, "\n")
  const blocks = escaped.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean)

  return blocks.map((block) => {
    if (/^#{1,6}\s/.test(block)) {
      const match = block.match(/^(#{1,6})\s+(.*)$/)
      const level = Math.min(match?.[1]?.length || 1, 6)
      return `<h${level}>${renderInline(match?.[2] || "")}</h${level}>`
    }
    if (/^>\s?/.test(block)) {
      const content = block
        .split("\n")
        .map((line) => line.replace(/^>\s?/, ""))
        .join("<br>")
      return `<blockquote>${renderInline(content)}</blockquote>`
    }
    if (/^(-|\*|\+)\s+/m.test(block)) {
      const items = block
        .split("\n")
        .filter((line) => /^(-|\*|\+)\s+/.test(line))
        .map((line) => `<li>${renderInline(line.replace(/^(-|\*|\+)\s+/, ""))}</li>`)
        .join("")
      return `<ul>${items}</ul>`
    }
    if (/^\d+\.\s+/m.test(block)) {
      const items = block
        .split("\n")
        .filter((line) => /^\d+\.\s+/.test(line))
        .map((line) => `<li>${renderInline(line.replace(/^\d+\.\s+/, ""))}</li>`)
        .join("")
      return `<ol>${items}</ol>`
    }
    if (/^```/.test(block) && /```$/.test(block)) {
      const lines = block.split("\n")
      const firstLine = lines.shift() || ""
      const language = firstLine.replace(/^```/, "").trim() || "plaintext"
      const code = lines.slice(0, -1).join("\n")
      return `<pre><code class="language-${language}">${code}</code></pre>`
    }
    return `<p>${renderInline(block).replace(/\n/g, "<br>")}</p>`
  }).join("")
}

function renderInline(input: string) {
  return input
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
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
