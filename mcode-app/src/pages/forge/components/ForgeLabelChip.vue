<script setup lang="ts">
import { computed, getCurrentInstance } from "vue"
import { labelSwatch } from "../forgeLabelColor"
import type { ForgeLabel } from "@/types/forge"

/**
 * 一颗标签胶囊。
 *
 * 颜色算在 JS 里（`labelSwatch`）而不是写在样式里：标签配色要按感知亮度分浅色/
 * 深色两套处理，而 scoped 样式里没有可以 key 的根 class 去挑，`--mcode-*` 前缀
 * 又是禁止的。
 *
 * `isDark` 必须取 uview mixin 的 `upThemeIsDark`（computed，靠 `upThemeVersion`
 * 触发重算），**不能**用 `isDarkThemeMode()` 一次性读值 —— 后者会让用户切到深色
 * 之后每颗标签仍是浅色配方，深蓝标签变成一团黑底黑字。
 */
const props = defineProps<{
  label: ForgeLabel
}>()

const currentInstance = getCurrentInstance()
const isDark = computed(() => Boolean(currentInstance?.proxy?.upThemeIsDark))

const swatch = computed(() => labelSwatch(props.label.color, isDark.value))

const chipStyle = computed(() => ({
  background: swatch.value.background,
  borderColor: swatch.value.border,
  color: swatch.value.color,
}))
</script>

<template>
  <view class="forge-chip forge-label" :style="chipStyle">
    <text class="forge-chip__text forge-label__text" :style="{ color: swatch.color }">
      {{ props.label.name }}
    </text>
  </view>
</template>

<style scoped lang="scss">
@import "../index.scss";
</style>
