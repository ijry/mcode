<script setup lang="ts">
import { computed, getCurrentInstance } from "vue"
import ForgeLabelChip from "./ForgeLabelChip.vue"
import {
  FORGE_SORT_OPTIONS,
  FORGE_STATE_OPTIONS,
  normalizeForgeLabelFilter,
} from "../forgeFilterState"
import { FORGE_PAGE_SIZES } from "@/services/forge/forgeScopePreference"
import { FORGE_MAX_LABEL_FILTERS, type ForgeLabel, type ForgeSort, type ForgeStateFilter } from "@/types/forge"

/**
 * 筛选弹层：状态 / 只看指派给我 / 标签 / 排序 / 每次加载。
 *
 * 全部受控，页面拥有状态。**标签列表由页面提供**（切仓库时拉一次并缓存）——
 * 弹层自己不发请求，否则每次打开都要花一次配额。
 *
 * 标签最多选 10 个（`FORGE_MAX_LABEL_FILTERS`）：两个 forge 都 AND，超过一把结果集
 * 本就是空的，而且每个都在拉长 GitHub 的 `q`（那个字符串有 256 字符上限）。
 * 撞到上限时把还没选的标签**置灰**而不是静默忽略点击 —— 后者是一个点了没反应的
 * 界面。
 */
const props = defineProps<{
  show: boolean
  state: ForgeStateFilter
  assignedMe: boolean
  labels: string[]
  sort: ForgeSort
  perPage: number
  /** 仓库的标签词汇表。空数组 = 还没拉到或这个仓库没有标签。 */
  labelOptions: ForgeLabel[]
  /** 仓库的标签超过一页（100 个）—— 说出来，一个静默停在 100 的列表读起来像「这就是全部」。 */
  labelsTruncated: boolean
  labelsLoading?: boolean
}>()

const emit = defineEmits<{
  (event: "update:show", value: boolean): void
  (event: "update:state", value: ForgeStateFilter): void
  (event: "update:assignedMe", value: boolean): void
  (event: "update:labels", value: string[]): void
  (event: "update:sort", value: ForgeSort): void
  (event: "update:perPage", value: number): void
  (event: "reset"): void
}>()

const currentInstance = getCurrentInstance()
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

const selected = computed(() => new Set(props.labels))
const atLabelLimit = computed(() => props.labels.length >= FORGE_MAX_LABEL_FILTERS)

const stateOptions = FORGE_STATE_OPTIONS
const sortOptions = FORGE_SORT_OPTIONS
const pageSizes = FORGE_PAGE_SIZES

function closeSheet() {
  emit("update:show", false)
}

function toggleLabel(name: string) {
  const next = new Set(props.labels)
  if (next.has(name)) {
    next.delete(name)
  } else {
    if (atLabelLimit.value) {
      uni.showToast({
        title: `最多同时筛选 ${FORGE_MAX_LABEL_FILTERS} 个标签`,
        icon: "none",
      })
      return
    }
    next.add(name)
  }
  emit("update:labels", normalizeForgeLabelFilter(Array.from(next)))
}

function isDisabled(name: string) {
  return atLabelLimit.value && !selected.value.has(name)
}
</script>

<template>
  <up-popup :show="props.show" mode="bottom" :round="28" @close="closeSheet">
    <view class="forge-sheet" :style="upThemeCardStyle">
      <view class="forge-sheet__hd">
        <view class="forge-sheet__title-block">
          <text class="forge-sheet__title">筛选</text>
          <text class="forge-sheet__desc">收窄这个仓库里要看的条目。</text>
        </view>
        <view class="forge-sheet__close" @click="closeSheet">
          <up-icon name="close" size="20" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
        </view>
      </view>

      <scroll-view scroll-y class="forge-sheet__body">
        <view class="forge-filter">
          <view class="forge-sheet__group">
            <text class="forge-sheet__group-title">状态</text>
            <view class="forge-filter__row">
              <view
                v-for="option in stateOptions"
                :key="option.value"
                class="forge-filter__pill"
                :class="{ 'forge-filter__pill--active': option.value === props.state }"
                @click="emit('update:state', option.value)"
              >
                <text>{{ option.label }}</text>
              </view>
            </view>
          </view>

          <view class="forge-sheet__group">
            <view class="forge-filter__switch">
              <view class="forge-option__copy">
                <text class="forge-option__title">只看指派给我的</text>
                <text class="forge-option__desc">按当前账号的身份过滤。</text>
              </view>
              <up-switch
                :modelValue="props.assignedMe"
                size="20"
                :activeColor="upThemeVar('--up-primary', '#2979ff')"
                @update:modelValue="emit('update:assignedMe', $event)"
              ></up-switch>
            </view>
          </view>

          <view class="forge-sheet__group">
            <text class="forge-sheet__group-title">排序</text>
            <view
              v-for="option in sortOptions"
              :key="option.value"
              class="forge-option"
              :class="{ 'forge-option--active': option.value === props.sort }"
              @click="emit('update:sort', option.value)"
            >
              <view class="forge-option__copy">
                <text class="forge-option__title">{{ option.label }}</text>
              </view>
              <up-icon
                v-if="option.value === props.sort"
                name="checkmark"
                size="18"
                :color="upThemeVar('--up-primary', '#2979ff')"
              ></up-icon>
            </view>
          </view>

          <view class="forge-sheet__group">
            <text class="forge-sheet__group-title">
              标签{{ props.labels.length > 0 ? `（已选 ${props.labels.length}）` : "" }}
            </text>

            <view v-if="props.labelsLoading" class="forge-inline-loading">
              <up-loading-icon
                mode="circle"
                size="22"
                :color="upThemeVar('--up-primary', '#2979ff')"
              ></up-loading-icon>
              <text class="forge-inline-loading__text">正在读取标签...</text>
            </view>

            <text v-else-if="props.labelOptions.length === 0" class="forge-muted">
              这个仓库还没有标签。
            </text>

            <template v-else>
              <view class="forge-filter__labels">
                <!-- 多个标签是 AND 语义（与两个 forge 一致），所以选中越多结果越少。 -->
                <view
                  v-for="label in props.labelOptions"
                  :key="label.name"
                  class="forge-filter__label"
                  :class="{
                    'forge-filter__label--active': selected.has(label.name),
                    'forge-filter__label--disabled': isDisabled(label.name),
                  }"
                  @click="toggleLabel(label.name)"
                >
                  <ForgeLabelChip :label="label" />
                  <up-icon
                    v-if="selected.has(label.name)"
                    name="checkmark"
                    size="14"
                    :color="upThemeVar('--up-primary', '#2979ff')"
                  ></up-icon>
                </view>
              </view>
              <text v-if="props.labelsTruncated" class="forge-muted">
                只列出了前 {{ props.labelOptions.length }} 个标签，仓库里还有更多。
              </text>
            </template>
          </view>

          <view class="forge-sheet__group">
            <text class="forge-sheet__group-title">每次加载</text>
            <view class="forge-filter__row">
              <view
                v-for="size in pageSizes"
                :key="size"
                class="forge-filter__pill"
                :class="{ 'forge-filter__pill--active': size === props.perPage }"
                @click="emit('update:perPage', size)"
              >
                <text>{{ size }} 条</text>
              </view>
            </view>
          </view>
        </view>
      </scroll-view>

      <view class="forge-sheet__ft">
        <view class="forge-sheet__btn forge-sheet__btn--ghost" @click="emit('reset')">
          <text>重置</text>
        </view>
        <view class="forge-sheet__btn forge-sheet__btn--primary" @click="closeSheet">
          <text>完成</text>
        </view>
      </view>
    </view>
  </up-popup>
</template>

<style scoped lang="scss">
@import "../index.scss";

.forge-filter {
  display: flex;
  flex-direction: column;
  gap: 26rpx;
  padding-bottom: 8rpx;
}

.forge-filter__row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12rpx;
}

.forge-filter__pill {
  padding: 12rpx 26rpx;
  border-radius: 999rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  border: 1rpx solid transparent;
  font-size: 24rpx;
  color: var(--up-content-color, #606266);
}

.forge-filter__pill--active {
  border-color: var(--up-primary, #2979ff);
  background: color-mix(in srgb, var(--up-primary, #2979ff) 10%, var(--up-card-bg-color, #ffffff) 90%);
  color: var(--up-primary, #2979ff);
  font-weight: 700;
}

.forge-filter__switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 20rpx;
  border-radius: 20rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.forge-filter__labels {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12rpx;
}

.forge-filter__label {
  display: flex;
  align-items: center;
  gap: 6rpx;
  padding: 6rpx 10rpx;
  border-radius: 999rpx;
  border: 1rpx solid transparent;
}

.forge-filter__label--active {
  border-color: var(--up-primary, #2979ff);
}

/* 撞到 10 个上限时把还没选的置灰 —— 静默忽略点击是一个点了没反应的界面。 */
.forge-filter__label--disabled {
  opacity: 0.4;
}
</style>
