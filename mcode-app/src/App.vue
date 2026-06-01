<script setup lang="ts">
import { onLaunch, onShow, onHide } from "@dcloudio/uni-app"

onLaunch(() => {
  console.log("App Launch")
  initDarkMode()
})

onShow(() => {
  console.log("App Show")
})

onHide(() => {
  console.log("App Hide")
})

function initDarkMode() {
  const isDarkMode = uni.getStorageSync("mcode_dark_mode")
  if (isDarkMode) {
    // 设置暗黑模式
    uni.setTabBarStyle({
      backgroundColor: "#1f1f1f",
      borderStyle: "white",
      color: "#8f8f94",
      selectedColor: "#2979ff",
    })
  }
}
</script>

<style lang="scss">
@import 'uview-plus/index.scss';
/* 全局样式 */
page {
  background-color: #f8f8f8;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial,
    sans-serif;
}

/* 暗黑模式 */
@media (prefers-color-scheme: dark) {
  page {
    background-color: #1f1f1f;
    color: #e5e5e5;
  }
}

/* uview-plus 暗黑模式变量覆盖 */
:root {
  --u-primary: #2979ff;
  --u-success: #19be6b;
  --u-warning: #ff9900;
  --u-error: #fa3534;
  --u-info: #909399;
}
</style>
