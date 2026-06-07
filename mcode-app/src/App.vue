<script setup lang="ts">
import { onLaunch, onShow, onHide } from "@dcloudio/uni-app"
import { initializeThemePreference } from "@/services/theme"

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
  background-color: var(--mcode-page-bg);
  color: var(--mcode-text-primary);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial,
    sans-serif;
}
</style>
