<script setup lang="ts">
import { onLaunch, onShow, onHide } from "@dcloudio/uni-app"
import { initializeThemePreference } from "@/services/theme"
import { useAccountStore } from "@/stores/account"

useAccountStore()

onLaunch(() => {
  console.log("App Launch")
  initializeThemePreference()
})

onShow(() => {
  console.log("App Show")
  initializeThemePreference()
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
