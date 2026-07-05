<template>
  <u-popup :show="show" mode="bottom" :round="28" @close="closePicker">
    <view class="host-picker">
      <view class="host-picker__handle"></view>

      <view class="host-picker__header">
        <view class="host-picker__heading">
          <text class="host-picker__title">选择电脑/主机型号</text>
          <text class="host-picker__subtitle">电脑和云服务器在同一个列表里选择，筛选项只用于快速定位。</text>
        </view>
        <u-icon name="close" size="22" @click="closePicker"></u-icon>
      </view>

      <u-input
        v-model="searchText"
        placeholder="搜索 Apple、ThinkPad、AWS、阿里云..."
        clearable
      ></u-input>

      <scroll-view scroll-x class="host-picker__filters" :show-scrollbar="false">
        <view class="host-picker__filter-row">
          <view
            v-for="filter in CONNECTION_HOST_FILTERS"
            :key="filter.id"
            class="host-picker__filter"
            :class="{ 'host-picker__filter--active': activeFilter === filter.id }"
            @click="activeFilter = filter.id"
          >
            <text>{{ filter.label }}</text>
          </view>
        </view>
      </scroll-view>

      <scroll-view scroll-y class="host-picker__results">
        <view class="host-picker__grid">
          <view
            v-for="model in filteredModels"
            :key="model.id"
            class="host-picker__card"
            :class="{ 'host-picker__card--selected': selectedModel.id === model.id }"
            @click="selectModel(model.id)"
          >
            <image class="host-picker__image" :src="model.image" mode="aspectFit" />
            <view class="host-picker__card-body">
              <view class="host-picker__brand-row">
                <image v-if="model.logo" class="host-picker__logo" :src="model.logo" mode="aspectFit" />
                <text class="host-picker__brand">{{ model.brand }}</text>
              </view>
              <text class="host-picker__model">{{ model.model }}</text>
              <text class="host-picker__kind">{{ getKindLabel(model.kind) }}</text>
            </view>
            <view v-if="selectedModel.id === model.id" class="host-picker__check">
              <u-icon name="checkmark" size="14" color="#ffffff"></u-icon>
            </view>
          </view>
        </view>
      </scroll-view>
    </view>
  </u-popup>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
import {
  CONNECTION_HOST_FILTERS,
  getConnectionHostModel,
  searchConnectionHostModels,
  type ConnectionHostKind,
} from "@/services/connectionHostCatalog"

const props = defineProps<{
  show: boolean
  modelValue?: string
}>()

const emit = defineEmits<{
  (event: "update:show", value: boolean): void
  (event: "update:modelValue", value: string): void
}>()

const searchText = ref("")
const activeFilter = ref("all")

const selectedModel = computed(() => getConnectionHostModel(props.modelValue))
const filteredModels = computed(() => searchConnectionHostModels(searchText.value, activeFilter.value))

watch(
  () => props.show,
  (show) => {
    if (show) return
    searchText.value = ""
    activeFilter.value = "all"
  }
)

function closePicker() {
  emit("update:show", false)
}

function selectModel(id: string) {
  emit("update:modelValue", id)
  emit("update:show", false)
}

function getKindLabel(kind: ConnectionHostKind) {
  if (kind === "laptop") return "笔记本"
  if (kind === "desktop") return "台式机"
  if (kind === "mini-pc") return "Mini PC"
  if (kind === "cloud-server") return "云服务器"
  return "电脑"
}
</script>

<style scoped lang="scss">
.host-picker {
  max-height: 86vh;
  padding: 18rpx 24rpx 28rpx;
  background: var(--up-card-bg-color, #ffffff);
  border-radius: 32rpx 32rpx 0 0;
}

.host-picker__handle {
  width: 88rpx;
  height: 8rpx;
  margin: 0 auto 18rpx;
  border-radius: 999rpx;
  background: var(--up-border-color, #dadbde);
}

.host-picker__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 18rpx;
}

.host-picker__heading {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  min-width: 0;
}

.host-picker__title {
  font-size: 34rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.host-picker__subtitle {
  font-size: 24rpx;
  line-height: 1.5;
  color: var(--up-content-color, #606266);
}

.host-picker__filters {
  margin: 18rpx 0;
  white-space: nowrap;
}

.host-picker__filter-row {
  display: inline-flex;
  gap: 12rpx;
  min-width: 100%;
}

.host-picker__filter {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  padding: 12rpx 20rpx;
  border-radius: 999rpx;
  border: 1rpx solid var(--up-border-color, #dadbde);
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  color: var(--up-content-color, #606266);
  font-size: 22rpx;
  font-weight: 600;
  white-space: nowrap;
}

.host-picker__filter > text {
  white-space: nowrap;
}

.host-picker__filter--active {
  border-color: var(--up-primary, #2979ff);
  background: color-mix(in srgb, var(--up-primary, #2979ff) 12%, var(--up-card-bg-color, #ffffff) 88%);
  color: var(--up-primary, #2979ff);
}

.host-picker__results {
  max-height: 58vh;
}

.host-picker__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
  padding-bottom: 12rpx;
}

.host-picker__card {
  position: relative;
  min-width: 0;
  overflow: hidden;
  border-radius: 26rpx;
  border: 2rpx solid var(--up-border-color, #dadbde);
  background: var(--up-card-bg-color, #ffffff);
}

.host-picker__card--selected {
  border-color: var(--up-primary, #2979ff);
  box-shadow: 0 16rpx 34rpx color-mix(in srgb, var(--up-primary, #2979ff) 18%, transparent);
}

.host-picker__image {
  width: 100%;
  height: 170rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.host-picker__card-body {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  padding: 16rpx;
}

.host-picker__brand-row {
  display: flex;
  align-items: center;
  gap: 8rpx;
  min-width: 0;
}

.host-picker__logo {
  width: 42rpx;
  height: 24rpx;
  flex-shrink: 0;
}

.host-picker__brand,
.host-picker__kind {
  font-size: 20rpx;
  color: var(--up-tips-color, #909193);
}

.host-picker__model {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 26rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.host-picker__check {
  position: absolute;
  top: 14rpx;
  right: 14rpx;
  width: 34rpx;
  height: 34rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--up-primary, #2979ff);
}
</style>
