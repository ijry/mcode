<template>
  <view class="page sessions-page" :style="[upThemeVars, upThemePageStyle]">
    <view class="sessions-shell">
      <view class="sessions-header" :style="upThemeCardStyle">
        <view class="sessions-header__copy">
          <text class="sessions-header__eyebrow">SESSIONS</text>
          <text class="sessions-header__title">{{ projectName || "项目会话" }}</text>
          <text class="sessions-header__desc">
            {{ connectionName || "当前连接" }} 下该项目的全部会话列表。
          </text>
        </view>
        <view class="sessions-header__badge">
          <text class="sessions-header__badge-text">{{ sessionCount }} 条会话</text>
        </view>
      </view>

      <ProjectSessionsPanel
        ref="sessionsPanelRef"
        :connection="connection"
        :folderId="folderId"
        :projectName="projectName"
        @count-change="sessionCount = $event"
      />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, ref } from "vue"
import { onLoad, onPullDownRefresh } from "@dcloudio/uni-app"
import ProjectSessionsPanel from "@/pages/project-detail/components/ProjectSessionsPanel.vue"
import {
  decodeConnectionContext,
  findStoredConnectionById,
  type ConnectionContext,
} from "@/services/connectionContext"

type ProjectSessionsPanelExpose = {
  reload: () => Promise<void> | void
}

const currentInstance = getCurrentInstance()
const upThemeVars = computed(() => currentInstance?.proxy?.upThemeVars || {})
const upThemePageStyle = computed(() => currentInstance?.proxy?.upThemePageStyle || {})
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})

const connection = ref<ConnectionContext | null>(null)
const connectionName = computed(() => connection.value?.name || "")
const projectName = ref("")
const folderId = ref(0)
const sessionCount = ref(0)
const sessionsPanelRef = ref<ProjectSessionsPanelExpose | null>(null)

onLoad((options) => {
  connection.value =
    findStoredConnectionById(String(options?.connectionId || "")) ||
    decodeConnectionContext(options?.connection as string)
  folderId.value = Number(options?.folderId || 0)
  projectName.value = decodeURIComponent(String(options?.projectName || "").trim())
})

onPullDownRefresh(async () => {
  await Promise.resolve(sessionsPanelRef.value?.reload())
  uni.stopPullDownRefresh()
})
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
}

.sessions-page {
  background: var(--up-page-bg-color, var(--up-bg-color, #f3f4f6));
}

.sessions-shell {
  padding: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.sessions-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20rpx;
  padding: 30rpx;
  border-radius: 30rpx;
  background: var(--up-card-bg-color, #ffffff);
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.sessions-header__copy {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  min-width: 0;
}

.sessions-header__eyebrow {
  font-size: 20rpx;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--up-primary, #2979ff);
}

.sessions-header__title {
  font-size: 36rpx;
  line-height: 1.2;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.sessions-header__desc {
  font-size: 24rpx;
  line-height: 1.55;
  color: var(--up-content-color, #606266);
}

.sessions-header__badge {
  flex-shrink: 0;
  padding: 14rpx 18rpx;
  border-radius: 999rpx;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 12%, var(--up-card-bg-color, #ffffff) 88%);
}

.sessions-header__badge-text {
  font-size: 22rpx;
  font-weight: 600;
  color: var(--up-primary, #2979ff);
}
</style>
