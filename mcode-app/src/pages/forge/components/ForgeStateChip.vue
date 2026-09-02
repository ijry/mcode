<script setup lang="ts">
import { computed, getCurrentInstance } from "vue"
import { rowGlyph } from "../forgeRowPresentation"
import type { ForgeIssueRow } from "@/types/forge"

/**
 * 条目状态字形：形状 + 颜色 + 文字三重编码。
 *
 * 三重是刻意的 —— 只靠颜色区分 open/closed/merged 对色盲用户不成立，而这是
 * triage 列表里最需要一眼认出的那一列。文字在窄屏可以关掉（`showLabel`），
 * 但图标与颜色永远都在。
 */
const props = withDefaults(
  defineProps<{
    row: Pick<ForgeIssueRow, "state" | "draft" | "is_pr">
    showLabel?: boolean
    size?: number
  }>(),
  { showLabel: false, size: 17 }
)

const currentInstance = getCurrentInstance()
// upThemeVar 是 uview-plus 用 Options API mixin 注入的方法，只有模板作用域能直接调；
// `<script setup>` 里必须经 proxy 取，否则 ReferenceError（computed 里会静默失败）。
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

const glyph = computed(() => rowGlyph(props.row))

// `themeVar` 为空是「这个状态没有对应的主题变量」（merged 的紫色 —— uview 主题表
// 里没有紫色，而拿蓝色代替会让它和进行中在一列里几乎同色）。此时直接用字面兜底。
const color = computed(() =>
  glyph.value.themeVar
    ? upThemeVar(glyph.value.themeVar, glyph.value.fallback)
    : glyph.value.fallback
)
</script>

<template>
  <view class="forge-state-chip">
    <up-icon :name="glyph.icon" :size="props.size" :color="color"></up-icon>
    <text v-if="props.showLabel" class="forge-state-chip__text" :style="{ color }">
      {{ glyph.label }}
    </text>
  </view>
</template>

<style scoped lang="scss">
.forge-state-chip {
  display: flex;
  align-items: center;
  gap: 8rpx;
  flex-shrink: 0;
}

.forge-state-chip__text {
  font-size: 22rpx;
  font-weight: 600;
  line-height: 1.4;
}
</style>
