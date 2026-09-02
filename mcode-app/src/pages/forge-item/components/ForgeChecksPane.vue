<script setup lang="ts">
import { computed, getCurrentInstance } from "vue"
import {
  forgeCheckGlyph,
  forgeChecksState,
  forgeChecksStateText,
  forgeCheckSummary,
  forgeCheckSummaryText,
  forgeChangeSizeText,
  forgeMergeability,
  forgeMergeabilityText,
  forgeMergeabilityTone,
  hasForgeChangeSize,
} from "../forgeChangePresentation"
import type { ForgeChangeDetail } from "@/types/forge"

/**
 * 检查项分区：分支对 + 可合并性 + 变更规模 + CI 列表。
 *
 * 这个分区几乎全部在**如实呈现 null**：
 * - `mergeable === null` 显示「正在计算」而不是「不能合并」；
 * - `checks.available === false` 是「读不到」而不是「没有检查」；
 * - `checks.partial` 把「全部通过」降级成「已读到：…」；
 * - 规模的四个计数各自可能为 null，全 null 时整块不画。
 *
 * 完全受控。分区自己的刷新按钮是必要的：`mergeable` 是 forge 后台异步算的，用户唯一
 * 的办法就是过一会儿再问一次。
 */
const props = defineProps<{
  detail: ForgeChangeDetail | null
  loading?: boolean
  errorText?: string
}>()

const emit = defineEmits<{
  (event: "refresh"): void
  (event: "openCheck", url: string): void
}>()

const currentInstance = getCurrentInstance()
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

/** `themeVar` 为空表示这个色调没有对应的主题变量，直接用字面兜底。 */
function toneColor(tone: { themeVar: string; fallback: string }) {
  return tone.themeVar ? upThemeVar(tone.themeVar, tone.fallback) : tone.fallback
}

const mergeability = computed(() =>
  props.detail ? forgeMergeability(props.detail) : "unknown"
)
const mergeabilityColor = computed(() => toneColor(forgeMergeabilityTone(mergeability.value)))

const checksState = computed(() =>
  props.detail ? forgeChecksState(props.detail.checks) : "empty"
)
const checksStateText = computed(() => forgeChecksStateText(checksState.value))
const summary = computed(() =>
  props.detail ? forgeCheckSummary(props.detail.checks.checks) : null
)
const summaryText = computed(() =>
  summary.value ? forgeCheckSummaryText(summary.value, checksState.value) : ""
)

const showSize = computed(() => Boolean(props.detail && hasForgeChangeSize(props.detail)))
const sizeCells = computed(() => {
  const detail = props.detail
  if (!detail) return []
  return [
    { label: "新增行", text: forgeChangeSizeText(detail.additions, "行") },
    { label: "删除行", text: forgeChangeSizeText(detail.deletions, "行") },
    { label: "文件", text: forgeChangeSizeText(detail.changed_files, "个") },
    { label: "提交", text: forgeChangeSizeText(detail.commits, "个") },
    // 空串 = forge 没给这个数字，整格不画（印一个 0 是在断言变更什么都没碰）。
  ].filter((cell) => Boolean(cell.text))
})
</script>

<template>
  <view class="forge-pane">
    <view class="forge-pane__head">
      <text class="forge-pane__title">变更概况</text>
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

    <view v-else-if="props.loading && !props.detail" class="forge-inline-loading">
      <up-loading-icon
        mode="circle"
        size="24"
        :color="upThemeVar('--up-primary', '#2979ff')"
      ></up-loading-icon>
      <text class="forge-inline-loading__text">正在读取变更信息...</text>
    </view>

    <template v-else-if="props.detail">
      <view class="forge-card forge-checks__overview">
        <!-- 分支对。fork 时额外显示 head 仓库 —— 那是读者绝不该靠推断得知的一件事。 -->
        <view class="forge-branches">
          <text class="forge-branch">{{ props.detail.base_ref || "?" }}</text>
          <up-icon
            name="arrow-left"
            size="13"
            :color="upThemeVar('--up-tips-color', '#909193')"
          ></up-icon>
          <text class="forge-branch">{{ props.detail.head_ref || "?" }}</text>
          <text v-if="props.detail.head_repo" class="forge-branch">
            来自 {{ props.detail.head_repo }}
          </text>
        </view>

        <view class="forge-checks__mergeable">
          <text class="forge-checks__mergeable-text" :style="{ color: mergeabilityColor }">
            {{ forgeMergeabilityText(mergeability) }}
          </text>
          <!-- forge 自己的措辞只作补充，不翻译 —— 两套词汇对不上，错的翻译读起来像诊断。 -->
          <text v-if="props.detail.merge_state" class="forge-muted">
            （{{ props.detail.merge_state }}）
          </text>
        </view>
      </view>

      <view v-if="showSize" class="forge-stats">
        <view v-for="cell in sizeCells" :key="cell.label" class="forge-stat">
          <text class="forge-stat__value">{{ cell.text }}</text>
          <text class="forge-stat__label">{{ cell.label }}</text>
        </view>
      </view>

      <view class="forge-pane__head">
        <text class="forge-pane__title">检查项</text>
      </view>

      <!-- 「读不到」与「没有配置」必须分开说：压平会在一个流水线是红的仓库上印出
           「没有检查」。 -->
      <view
        v-if="checksStateText"
        class="forge-notice"
        :class="checksState === 'unavailable' ? 'forge-notice--info' : 'forge-notice--warning'"
      >
        <text class="forge-notice__text">{{ checksStateText }}</text>
      </view>

      <text v-if="summaryText" class="forge-muted">{{ summaryText }}</text>

      <view v-if="props.detail.checks.checks.length > 0" class="forge-checks__list">
        <view
          v-for="check in props.detail.checks.checks"
          :key="check.id"
          class="forge-card forge-check"
          @click="check.url && emit('openCheck', check.url)"
        >
          <up-icon
            :name="forgeCheckGlyph(check.state).icon"
            size="17"
            :color="toneColor(forgeCheckGlyph(check.state))"
          ></up-icon>
          <view class="forge-check__copy">
            <view class="forge-check__head">
              <text class="forge-check__name">{{ check.name }}</text>
              <!-- GitLab 明确允许某些 job 失败而不阻塞变更，说出来才不会读成红色。 -->
              <text v-if="check.allow_failure" class="forge-check__allow">允许失败</text>
            </view>
            <text v-if="check.summary" class="forge-muted">{{ check.summary }}</text>
          </view>
          <text class="forge-check__state" :style="{ color: toneColor(forgeCheckGlyph(check.state)) }">
            {{ forgeCheckGlyph(check.state).label }}
          </text>
        </view>
      </view>
    </template>
  </view>
</template>

<style scoped lang="scss">
@import "@/pages/forge/index.scss";
@import "../index.scss";

.forge-checks__overview {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.forge-checks__mergeable {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8rpx;
}

.forge-checks__mergeable-text {
  font-size: 26rpx;
  font-weight: 700;
}

.forge-checks__list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.forge-check {
  display: flex;
  align-items: flex-start;
  gap: 14rpx;
  padding: 20rpx;
}

.forge-check__copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.forge-check__head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10rpx;
}

.forge-check__name {
  font-size: 25rpx;
  font-weight: 600;
  color: var(--up-main-color, #303133);
  word-break: break-word;
}

.forge-check__allow {
  padding: 2rpx 10rpx;
  border-radius: 999rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  font-size: 18rpx;
  color: var(--up-tips-color, #909193);
}

.forge-check__state {
  font-size: 21rpx;
  font-weight: 600;
  flex-shrink: 0;
}
</style>
