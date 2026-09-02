<script setup lang="ts">
import { computed, getCurrentInstance } from "vue"

/**
 * 列表筛选弹层：连接 → 项目 → 可见性开关。
 *
 * 三个维度合在一个弹层里，因为它们是同一个问题的三层（哪台机器 / 哪个仓库 / 看多全）。
 * 全部受控，页面拥有状态。
 *
 * 「显示已取消」默认**开**、「显示已归档」默认**关**，与 PC 端一致：已取消的任务
 * 还可能被重新排队，是活的；已归档的是用户主动收起来的。
 */
export interface FilterConnectionOption {
  key: string
  name: string
}

export interface FilterProjectOption {
  id: number
  name: string
}

const props = defineProps<{
  show: boolean
  connections: FilterConnectionOption[]
  projects: FilterProjectOption[]
  connectionKey: string
  folderId: number
  showCanceled: boolean
  showArchived: boolean
}>()

const emit = defineEmits<{
  (event: "update:show", value: boolean): void
  (event: "update:connectionKey", value: string): void
  (event: "update:folderId", value: number): void
  (event: "update:showCanceled", value: boolean): void
  (event: "update:showArchived", value: boolean): void
  (event: "reset"): void
}>()

const currentInstance = getCurrentInstance()
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

function closeSheet() {
  emit("update:show", false)
}

/** 切连接时项目筛选必须清掉 —— folder_id 是**按连接**的，跨连接复用会筛出空列表。 */
function selectConnection(key: string) {
  if (key === props.connectionKey) return
  emit("update:connectionKey", key)
  emit("update:folderId", 0)
}
</script>

<template>
  <up-popup :show="props.show" mode="bottom" :round="28" @close="closeSheet">
    <view class="task-sheet" :style="upThemeCardStyle">
      <view class="task-sheet__hd">
        <view class="task-filter__title-block">
          <text class="task-sheet__title">筛选</text>
          <text class="task-sheet__desc">选择要查看哪台连接、哪个项目的任务。</text>
        </view>
        <view class="task-sheet__close" @click="closeSheet">
          <up-icon name="close" size="20" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
        </view>
      </view>

      <scroll-view class="task-sheet__scroll" scroll-y enhanced>
        <view class="task-form-group">
          <text class="task-form-label">连接</text>
          <view class="task-chip-row">
            <view
              :class="['task-chip', !props.connectionKey && 'task-chip--active']"
              @click="selectConnection('')"
            >
              <text class="task-chip__text">全部连接</text>
            </view>
            <view
              v-for="item in props.connections"
              :key="item.key"
              :class="['task-chip', props.connectionKey === item.key && 'task-chip--active']"
              @click="selectConnection(item.key)"
            >
              <text class="task-chip__text">{{ item.name }}</text>
            </view>
          </view>
        </view>

        <view v-if="props.projects.length > 0" class="task-form-group">
          <text class="task-form-label">项目</text>
          <view class="task-chip-row">
            <view
              :class="['task-chip', props.folderId === 0 && 'task-chip--active']"
              @click="emit('update:folderId', 0)"
            >
              <text class="task-chip__text">全部项目</text>
            </view>
            <view
              v-for="project in props.projects"
              :key="project.id"
              :class="['task-chip', props.folderId === project.id && 'task-chip--active']"
              @click="emit('update:folderId', project.id)"
            >
              <text class="task-chip__text">{{ project.name }}</text>
            </view>
          </view>
        </view>

        <view class="task-form-switch">
          <view class="task-form-switch__copy">
            <text class="task-form-switch__title">显示已取消</text>
            <text class="task-form-switch__desc">已取消的任务仍可重新排队。</text>
          </view>
          <up-switch
            :modelValue="props.showCanceled"
            size="22"
            @update:modelValue="emit('update:showCanceled', $event)"
          ></up-switch>
        </view>

        <view class="task-form-switch">
          <view class="task-form-switch__copy">
            <text class="task-form-switch__title">显示已归档</text>
            <text class="task-form-switch__desc">归档是把已结束的任务收起来。</text>
          </view>
          <up-switch
            :modelValue="props.showArchived"
            size="22"
            @update:modelValue="emit('update:showArchived', $event)"
          ></up-switch>
        </view>
      </scroll-view>

      <view class="task-sheet__actions">
        <up-button shape="circle" @click="emit('reset')">重置</up-button>
        <up-button type="primary" shape="circle" @click="closeSheet">完成</up-button>
      </view>

      <view class="task-safe-bottom"></view>
    </view>
  </up-popup>
</template>

<style scoped lang="scss">
@import "../index.scss";

.task-filter__title-block {
  flex: 1;
  min-width: 0;
}
</style>
