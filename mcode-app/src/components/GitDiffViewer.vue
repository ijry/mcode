<template>
  <view class="git-diff-viewer">
    <view v-if="files.length === 0" class="git-diff-viewer__empty">
      <text>没有可展示的 Diff 内容。</text>
    </view>

    <view v-for="file in files" :key="file.id" class="git-diff-file">
      <view class="git-diff-file__header">
        <view class="git-diff-file__copy">
          <text class="git-diff-file__path">{{ normalizePath(file.to || file.from) }}</text>
          <text class="git-diff-file__meta">
            +{{ file.additions }} / -{{ file.deletions }}
          </text>
        </view>
      </view>

      <view v-for="hunk in file.hunks" :key="hunk.id" class="git-diff-hunk">
        <text class="git-diff-hunk__header">{{ hunk.header }}</text>
        <scroll-view scroll-x class="git-diff-hunk__scroll">
          <view class="git-diff-table">
            <view v-for="row in hunk.rows" :key="row.id" class="git-diff-row">
              <view :class="['git-diff-line', `git-diff-line--${row.line.type}`]">
                <text class="git-diff-line__line">{{ row.line.oldLineNumber ?? "" }}</text>
                <text class="git-diff-line__line">{{ row.line.newLineNumber ?? "" }}</text>
                <text class="git-diff-line__content">{{ row.line.content }}</text>
              </view>
            </view>
          </view>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { GitDiffViewFile } from "@/services/projectGit"

defineProps<{
  files: GitDiffViewFile[]
}>()

function normalizePath(value: string) {
  return value.replace(/^b\//, "").replace(/^a\//, "")
}
</script>

<style scoped lang="scss">
.git-diff-viewer {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.git-diff-viewer__empty {
  padding: 18rpx;
  border-radius: 20rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  font-size: 24rpx;
  color: var(--up-content-color, #606266);
}

.git-diff-file {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.git-diff-file__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.git-diff-file__copy {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.git-diff-file__path {
  font-size: 26rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
  word-break: break-all;
}

.git-diff-file__meta,
.git-diff-hunk__header {
  font-size: 22rpx;
  color: var(--up-content-color, #606266);
}

.git-diff-hunk {
  border-radius: 22rpx;
  overflow: hidden;
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.git-diff-hunk__header {
  display: block;
  padding: 16rpx 20rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  font-family: "Courier New", monospace;
}

.git-diff-hunk__scroll {
  background: var(--up-card-bg-color, #ffffff);
}

.git-diff-table {
  min-width: 960rpx;
}

.git-diff-row {
  display: block;
}

.git-diff-line {
  display: grid;
  grid-template-columns: 76rpx 76rpx minmax(0, 1fr);
  align-items: stretch;
  min-height: 56rpx;
  border-top: 1rpx solid var(--up-border-color, #ebeef5);
}

.git-diff-line__line,
.git-diff-line__content {
  padding: 12rpx 14rpx;
  font-size: 22rpx;
  line-height: 1.5;
  font-family: "Courier New", monospace;
}

.git-diff-line__line {
  text-align: right;
  color: var(--up-tips-color, #909193);
  border-right: 1rpx solid var(--up-border-color, #ebeef5);
}

.git-diff-line__content {
  color: var(--up-main-color, #303133);
  white-space: pre;
}

.git-diff-line--context {
  background: var(--up-card-bg-color, #ffffff);
}

.git-diff-line--add {
  background: color-mix(in srgb, var(--up-success, #19be6b) 14%, #ffffff 86%);
}

.git-diff-line--del {
  background: color-mix(in srgb, var(--up-error, #fa3534) 14%, #ffffff 86%);
}
</style>
