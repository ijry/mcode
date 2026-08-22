<script setup lang="ts">
import { onLaunch, onShow, onHide } from "@dcloudio/uni-app"
import { initializeThemePreference } from "@/services/theme"
import {
  refreshConversationTabBadge,
  startConversationTabBadgeService,
} from "@/services/conversation/conversationTabBadgeService"
import { useAccountStore } from "@/stores/account"
import { startAppUpdateCheck } from "@/services/appUpdate"

useAccountStore()

onLaunch(() => {
  console.log("App Launch")
  initializeThemePreference()
  // 角标必须在 App 层启动：冷启动落在 tabBar 第 0 项「连接」页，会话页可能整个会话期间
  // 都没被打开过 —— 而角标恰恰是给「不在会话页时」看的。
  startConversationTabBadgeService()
  startAppUpdateCheck(true)
})

onShow(() => {
  console.log("App Show")
  initializeThemePreference()
  // 回到前台重算一次：后台期间 WebSocket 通常已断，`pet://sessions` 推送被直接丢弃
  // （服务端无订阅者时不入队），角标会停在切后台前的旧值。
  void refreshConversationTabBadge()
  startAppUpdateCheck()
})

onHide(() => {
  console.log("App Hide")
})
</script>

<style lang="scss">
@import "uview-plus/index.scss";

page {
  background-color: var(--up-page-bg-color, var(--up-bg-color, #f3f4f6));
  color: var(--up-main-color, #303133);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial,
    sans-serif;
}
</style>
