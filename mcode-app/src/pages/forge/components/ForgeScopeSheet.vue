<script setup lang="ts">
import { computed, getCurrentInstance } from "vue"

/**
 * 作用域弹层：先选连接，再选项目。
 *
 * 全部受控，页面拥有状态。**只列项目名，不预先探测哪个项目是 forge 仓库** ——
 * 探测走 `folder_forge_remote`，服务端要 fork 一个 `git remote get-url` 子进程，
 * N 个项目就是 N 次。探测发生在选中之后，由页面渲染三种前置状态。
 *
 * 切连接时项目必须清掉：folder_id 是**按连接**的，跨连接复用会指向一个不存在的
 * 文件夹（与 `TaskFilterSheet.selectConnection` 同一个理由）。
 */
export interface ForgeScopeConnectionOption {
  key: string
  name: string
}

export interface ForgeScopeProjectOption {
  id: number
  name: string
  path: string
}

const props = defineProps<{
  show: boolean
  connections: ForgeScopeConnectionOption[]
  projects: ForgeScopeProjectOption[]
  connectionKey: string
  folderId: number
  /** 项目列表还在拉 —— 切连接之后会有一段空窗，不说明会读成「这台机器没有项目」。 */
  projectsLoading?: boolean
}>()

const emit = defineEmits<{
  (event: "update:show", value: boolean): void
  (event: "selectConnection", key: string): void
  (event: "selectProject", folderId: number): void
}>()

const currentInstance = getCurrentInstance()
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

function closeSheet() {
  emit("update:show", false)
}

function selectConnection(key: string) {
  if (key === props.connectionKey) return
  emit("selectConnection", key)
}

function selectProject(folderId: number) {
  if (folderId === props.folderId) {
    closeSheet()
    return
  }
  emit("selectProject", folderId)
  // 选完项目就关：项目是这个弹层的终点，留在原地让用户再点一次关闭是多余的一步。
  closeSheet()
}
</script>

<template>
  <up-popup :show="props.show" mode="bottom" :round="28" @close="closeSheet">
    <view class="forge-sheet" :style="upThemeCardStyle">
      <view class="forge-sheet__hd">
        <view class="forge-sheet__title-block">
          <text class="forge-sheet__title">选择仓库</text>
          <text class="forge-sheet__desc">仓库面板一次看一个项目的 Issue 与 PR。</text>
        </view>
        <view class="forge-sheet__close" @click="closeSheet">
          <up-icon name="close" size="20" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
        </view>
      </view>

      <scroll-view scroll-y class="forge-sheet__body">
        <view class="forge-scope">
          <view v-if="props.connections.length > 1" class="forge-sheet__group">
            <text class="forge-sheet__group-title">连接</text>
            <view
              v-for="item in props.connections"
              :key="item.key"
              class="forge-option"
              :class="{ 'forge-option--active': item.key === props.connectionKey }"
              @click="selectConnection(item.key)"
            >
              <view class="forge-option__copy">
                <text class="forge-option__title">{{ item.name }}</text>
              </view>
              <up-icon
                v-if="item.key === props.connectionKey"
                name="checkmark"
                size="18"
                :color="upThemeVar('--up-primary', '#2979ff')"
              ></up-icon>
            </view>
          </view>

          <view class="forge-sheet__group">
            <text class="forge-sheet__group-title">项目</text>

            <view v-if="props.projectsLoading" class="forge-inline-loading">
              <up-loading-icon
                mode="circle"
                size="24"
                :color="upThemeVar('--up-primary', '#2979ff')"
              ></up-loading-icon>
              <text class="forge-inline-loading__text">正在读取项目...</text>
            </view>

            <view v-else-if="props.projects.length === 0" class="forge-notice forge-notice--info">
              <text class="forge-notice__text">
                这条连接下还没有项目。请先在桌面端打开一个 Git 仓库文件夹。
              </text>
            </view>

            <view
              v-for="project in props.projects"
              v-else
              :key="project.id"
              class="forge-option"
              :class="{ 'forge-option--active': project.id === props.folderId }"
              @click="selectProject(project.id)"
            >
              <view class="forge-option__copy">
                <text class="forge-option__title">{{ project.name }}</text>
                <text v-if="project.path" class="forge-option__desc">{{ project.path }}</text>
              </view>
              <up-icon
                v-if="project.id === props.folderId"
                name="checkmark"
                size="18"
                :color="upThemeVar('--up-primary', '#2979ff')"
              ></up-icon>
            </view>
          </view>
        </view>
      </scroll-view>
    </view>
  </up-popup>
</template>

<style scoped lang="scss">
@import "../index.scss";

.forge-scope {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  padding-bottom: 8rpx;
}
</style>
