<script setup lang="ts">
import { computed, getCurrentInstance, ref } from "vue"
import GitDiffViewer from "@/components/GitDiffViewer.vue"
import {
  canExpandForgeFile,
  forgeFileDiffUnavailableText,
  forgeFileDirectory,
  forgeFileName,
  forgeFileStatsText,
  forgeFileStatusLabel,
  forgeFileStatusTone,
} from "../forgeChangePresentation"
import { buildGitDiffView, type GitDiffViewFile } from "@/services/projectGit"
import type { ForgeChangedFile } from "@/types/forge"

/**
 * 文件更改分区：路径 + 状态 + 行数 + 可内联展开的 diff。
 *
 * `patch` 随文件列表白送（两个 forge 本来就一起发），所以展开**不花请求** —— 这也是
 * 为什么展开状态放在组件里而不是页面里：它纯粹是本地的。
 *
 * 不能展开的两种情形（二进制 / forge 因过大扣留）要分别说明，而不是给一个展开后是
 * 空白的按钮。
 *
 * diff 复用 `GitDiffViewer` + `buildGitDiffView`（parse-diff 解析统一 diff）——
 * 与项目 Git 页面、任务详情页是同一个渲染器。
 */
const props = defineProps<{
  files: ForgeChangedFile[]
  loading?: boolean
  loadingMore?: boolean
  hasNext?: boolean
  errorText?: string
}>()

const emit = defineEmits<{
  (event: "refresh"): void
  (event: "loadMore"): void
}>()

const currentInstance = getCurrentInstance()
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

/** 展开的文件路径。纯本地状态 —— patch 已经在手上，展开不花请求。 */
const expanded = ref(new Set<string>())
/** 解析后的 diff 缓存：parse-diff 不便宜，同一个文件反复折叠展开不该重复解析。 */
const parsed = new Map<string, GitDiffViewFile[]>()

function toneColor(tone: { themeVar: string; fallback: string }) {
  return tone.themeVar ? upThemeVar(tone.themeVar, tone.fallback) : tone.fallback
}

function toggle(file: ForgeChangedFile) {
  if (!canExpandForgeFile(file)) return
  const next = new Set(expanded.value)
  if (next.has(file.path)) next.delete(file.path)
  else next.add(file.path)
  expanded.value = next
}

function diffFor(file: ForgeChangedFile): GitDiffViewFile[] {
  if (!file.patch) return []
  const cached = parsed.get(file.path)
  if (cached) return cached
  const built = buildGitDiffView(file.patch)
  parsed.set(file.path, built)
  return built
}

const countText = computed(() =>
  props.files.length > 0 ? `${props.files.length} 个文件` : "文件更改"
)
</script>

<template>
  <view class="forge-pane">
    <view class="forge-pane__head">
      <text class="forge-pane__title">{{ countText }}</text>
      <view class="forge-pane__refresh" @click="emit('refresh')">
        <up-loading-icon
          v-if="props.loading"
          mode="circle"
          size="16"
          :color="upThemeVar('--up-primary', '#2979ff')"
        ></up-loading-icon>
        <up-icon
          v-else
          name="reload"
          size="15"
          :color="upThemeVar('--up-content-color', '#606266')"
        ></up-icon>
      </view>
    </view>

    <view v-if="props.errorText" class="forge-notice forge-notice--error">
      <text class="forge-notice__text">{{ props.errorText }}</text>
      <text class="forge-notice__action" @click="emit('refresh')">重试</text>
    </view>

    <view v-else-if="props.loading && props.files.length === 0" class="forge-inline-loading">
      <up-loading-icon
        mode="circle"
        size="24"
        :color="upThemeVar('--up-primary', '#2979ff')"
      ></up-loading-icon>
      <text class="forge-inline-loading__text">正在读取文件列表...</text>
    </view>

    <text v-else-if="props.files.length === 0" class="forge-muted">
      这个变更没有改动任何文件。
    </text>

    <template v-else>
      <view class="forge-files">
        <view v-for="file in props.files" :key="file.path" class="forge-card forge-file">
          <view class="forge-file__head" @click="toggle(file)">
            <view
              class="forge-file__status"
              :style="{ color: toneColor(forgeFileStatusTone(file.status)) }"
            >
              <text>{{ forgeFileStatusLabel(file.status) }}</text>
            </view>
            <view class="forge-file__copy">
              <text class="forge-file__name">{{ forgeFileName(file.path) }}</text>
              <text v-if="forgeFileDirectory(file.path)" class="forge-muted">
                {{ forgeFileDirectory(file.path) }}
              </text>
              <!-- 重命名的来源：读者不该靠猜。 -->
              <text v-if="file.previous_path" class="forge-muted">
                原路径 {{ file.previous_path }}
              </text>
            </view>
            <view class="forge-file__right">
              <text v-if="forgeFileStatsText(file)" class="forge-file__stats">
                {{ forgeFileStatsText(file) }}
              </text>
              <up-icon
                v-if="canExpandForgeFile(file)"
                :name="expanded.has(file.path) ? 'arrow-up' : 'arrow-down'"
                size="14"
                :color="upThemeVar('--up-tips-color', '#c0c4cc')"
              ></up-icon>
            </view>
          </view>

          <!-- 不能展开时说明原因（二进制 / 太大），而不是给一个展开后空白的按钮。 -->
          <text v-if="!canExpandForgeFile(file)" class="forge-muted">
            {{ forgeFileDiffUnavailableText(file) }}
          </text>

          <view v-else-if="expanded.has(file.path)" class="forge-file__diff">
            <GitDiffViewer :files="diffFor(file)" />
          </view>
        </view>
      </view>

      <view v-if="props.hasNext" class="forge-more" @click="emit('loadMore')">
        <up-loading-icon
          v-if="props.loadingMore"
          mode="circle"
          size="20"
          :color="upThemeVar('--up-primary', '#2979ff')"
        ></up-loading-icon>
        <text class="forge-more__text">{{ props.loadingMore ? "加载中..." : "加载更多文件" }}</text>
      </view>
    </template>
  </view>
</template>

<style scoped lang="scss">
@import "@/pages/forge/index.scss";
@import "../index.scss";

.forge-files {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.forge-file {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  padding: 20rpx;
}

.forge-file__head {
  display: flex;
  align-items: flex-start;
  gap: 14rpx;
}

.forge-file__status {
  padding: 4rpx 12rpx;
  border-radius: 999rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  font-size: 19rpx;
  font-weight: 600;
  flex-shrink: 0;
}

.forge-file__copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.forge-file__name {
  font-size: 25rpx;
  font-weight: 600;
  color: var(--up-main-color, #303133);
  word-break: break-all;
}

.forge-file__right {
  display: flex;
  align-items: center;
  gap: 10rpx;
  flex-shrink: 0;
}

.forge-file__stats {
  font-size: 20rpx;
  font-family: "Courier New", monospace;
  color: var(--up-content-color, #606266);
}

.forge-file__diff {
  padding-top: 4rpx;
}
</style>
