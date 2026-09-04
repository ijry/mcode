<script setup lang="ts">
import { onLaunch, onShow, onHide } from "@dcloudio/uni-app"
import { initializeThemePreference } from "@/services/theme"
import {
  refreshConversationTabBadge,
  startConversationTabBadgeService,
} from "@/services/conversation/conversationTabBadgeService"
import { useAccountStore } from "@/stores/account"
import { startAppUpdateCheck } from "@/services/appUpdate"
import { startH5UpdateGuard } from "@/services/h5UpdateGuard"
import { acpApi } from "@/api/acp"
import { flushH5Database } from "@/services/db/sqlite"
import { flushPersistedStores } from "@/stores/persistStorage"

useAccountStore()

onLaunch(() => {
  console.log("App Launch")
  initializeThemePreference()
  // 角标必须在 App 层启动：冷启动落在 tabBar 第 0 项「连接」页，会话页可能整个会话期间
  // 都没被打开过 —— 而角标恰恰是给「不在会话页时」看的。
  startConversationTabBadgeService()
  // H5/iOS standalone 下站点更新后旧文档不会自动重载，启动即开启“探测新版本→强制刷新一次”守卫。
  startH5UpdateGuard()
  startAppUpdateCheck(true)
})

onShow(() => {
  console.log("App Show")
  initializeThemePreference()
  // 回到前台重算一次：后台期间 WebSocket 通常已断，`pet://sessions` 推送被直接丢弃
  // （服务端无订阅者时不入队），角标会停在切后台前的旧值。
  void refreshConversationTabBadge()
  // 重新拉起实时通道。这同时是兜底轮询唯一的重新武装入口（`onHide` 把它停了）——
  // 订阅是常驻的、`ensureInstanceSubscriptions` 会早退，所以不能指望订阅路径去重连。
  void acpApi.resumeRealtimeAfterForeground()
  startAppUpdateCheck()
})

onHide(() => {
  console.log("App Hide")
  // 桥接失败后的兜底轮询是 1 Hz 的真网络请求，且原本没有任何停止入口 —— 冷启动时
  // 主机不可达一次就会永久打下去。切后台必须停；`onShow` 会重新拉起实时通道，
  // 起不来才重新落回轮询。
  acpApi.stopPolling()
  // H5 侧的落盘已改成尾防抖（每条 SQL 都整库重写太贵），切后台时把压着的那次冲掉。
  void flushH5Database()
  // pinia 持久化里走防抖适配器的那批（pet）同理。
  flushPersistedStores()
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
