<template>
  <view class="page project-page" :style="[upThemeVars, upThemePageStyle]">
    <view class="project-shell">
      <ProjectFolderList
        ref="folderListRef"
        :connection="connection"
        @resolved="handleResolvedConnection"
      />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, ref } from "vue"
import { onLoad, onPullDownRefresh } from "@dcloudio/uni-app"
import ProjectFolderList from "@/components/projects/ProjectFolderList.vue"
import {
  decodeConnectionContext,
  findStoredConnectionById,
  type ConnectionContext,
} from "@/services/connectionContext"
import { buildProjectDetailRoute } from "@/services/projectDetail"

const currentInstance = getCurrentInstance()
const upThemeVars = computed(() => currentInstance?.proxy?.upThemeVars || {})
const upThemePageStyle = computed(() => currentInstance?.proxy?.upThemePageStyle || {})

const connection = ref<ConnectionContext | null>(null)
const folderListRef = ref<InstanceType<typeof ProjectFolderList> | null>(null)

onLoad((options) => {
  connection.value =
    findStoredConnectionById(String(options?.connectionId || "")) ||
    decodeConnectionContext(options?.connection as string)
})

onPullDownRefresh(async () => {
  await folderListRef.value?.refresh()
  uni.stopPullDownRefresh()
})

function handleResolvedConnection(next: ConnectionContext) {
  connection.value = next
}
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
}

.project-page {
  background: var(--up-page-bg-color, var(--up-bg-color, #f3f4f6));
}

.project-shell {
  padding: 24rpx;
}
</style>