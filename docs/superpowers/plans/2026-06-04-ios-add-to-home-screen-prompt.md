# iOS Add To Home Screen Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `mcode-app` 的 H5 首页连接页增加仅面向 `iPhone/iPad Safari` 的“添加到主屏幕”底部提示，并在添加到桌面后支持全屏打开，同时禁止 H5 页面双指和双击缩放。

**Architecture:** 新增一个自包含的 `IosAddToHomePrompt` 组件，仅接入首页连接页 [mcode-app/src/pages/connections/index.vue](D:/Repos/xyito/lingyun/mcode/mcode-app/src/pages/connections/index.vue)。H5 文档头部通过 `index.html` 增加 Apple Web App meta，触屏图标放在 `src/static/icons/` 下，复用当前 uni H5 构建会自动复制的静态资源路径。

**Tech Stack:** uni-app、Vue 3、uview-plus、Vite H5 构建、Apple Web App meta、浏览器 UA / display-mode 检测

---

## File Structure

- Create: `mcode-app/src/static/icons/apple-touch-icon.png`
  - H5 专用触屏图标，供 `index.html` 的 `apple-touch-icon` 通过 `/static/icons/apple-touch-icon.png` 直接引用。
- Create: `mcode-app/src/components/IosAddToHomePrompt.vue`
  - 自包含的 iOS Safari 检测、7 天冷却、底部弹层 UI 和关闭逻辑。
- Modify: `mcode-app/index.html`
  - 补充禁止缩放的 `viewport`、Apple Web App meta、`apple-touch-icon` 链接，以及 iOS 缩放手势拦截脚本。
- Modify: `mcode-app/src/pages/connections/index.vue`
  - 接入 `IosAddToHomePrompt`。

## Notes Before Execution

- 用户已明确要求“直接放在首页”，因此本计划不把提示扩散到其他页面；如果后续需要全站覆盖，应另起一个小范围调整。
- 当前 `mcode-app` 没有现成的前端单元测试脚本或 `vitest` 依赖。本计划以“最小增量”为原则，不额外引入测试基建，验证手段使用 `pnpm build:h5` + 构建产物检查 + 真机手工验证。

### Task 1: 提供稳定的 H5 Touch Icon 资源

**Files:**
- Create: `mcode-app/src/static/icons/apple-touch-icon.png`
- Source: `mcode-app/unpackage/res/icons/180x180.png`

- [ ] **Step 1: 复制 180x180 图标到 `src/static/icons`**

执行：

```powershell
Copy-Item .\mcode-app\unpackage\res\icons\180x180.png .\mcode-app\src\static\icons\apple-touch-icon.png
```

Expected: `mcode-app/src/static/icons/apple-touch-icon.png` 存在，且尺寸来源与 iPhone 主屏图标一致。

- [ ] **Step 2: 确认图标已落在稳定直链位置**

执行：

```powershell
Get-Item .\mcode-app\src\static\icons\apple-touch-icon.png | Select-Object FullName,Length
```

Expected: 输出 `apple-touch-icon.png` 的完整路径和非零文件大小。

### Task 2: 更新 H5 页面头部配置与缩放限制

**Files:**
- Modify: `mcode-app/index.html`

- [ ] **Step 1: 为 iOS Web App 增加 meta、禁止缩放的 viewport 和 touch icon**

将 `mcode-app/index.html` 更新为：

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="viewport"
      content="width=device-width,initial-scale=1.0,maximum-scale=1.0,minimum-scale=1.0,user-scalable=no,viewport-fit=cover"
    />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="MCode" />
    <link rel="apple-touch-icon" href="/static/icons/apple-touch-icon.png" />
    <title>MCode</title>
    <script>
      ;(() => {
        const ua = navigator.userAgent || ""
        const isIos = /iPhone|iPad|iPod/i.test(ua)
        if (!isIos) return

        let lastTouchEnd = 0

        document.addEventListener(
          "touchstart",
          (event) => {
            if (event.touches.length > 1) {
              event.preventDefault()
            }
          },
          { passive: false }
        )

        document.addEventListener(
          "touchend",
          (event) => {
            const now = Date.now()
            if (now - lastTouchEnd <= 300) {
              event.preventDefault()
            }
            lastTouchEnd = now
          },
          { passive: false }
        )

        document.addEventListener(
          "gesturestart",
          (event) => {
            event.preventDefault()
          },
          { passive: false }
        )
      })()
    </script>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: 快速检查页面头部文本是否完整**

执行：

```powershell
Get-Content .\mcode-app\index.html
```

Expected: 能看到 `user-scalable=no`、`maximum-scale=1.0`、`minimum-scale=1.0`、`viewport-fit=cover`、3 个 Apple meta、`/static/icons/apple-touch-icon.png`，以及用于阻止 iOS 缩放的内联脚本。

### Task 3: 实现可复用的 iOS Safari 提示组件

**Files:**
- Create: `mcode-app/src/components/IosAddToHomePrompt.vue`

- [ ] **Step 1: 新增自包含提示组件**

创建 `mcode-app/src/components/IosAddToHomePrompt.vue`：

```vue
<template>
  <up-popup v-model:show="show" mode="bottom" :round="24" @close="dismiss">
    <view class="ios-a2hs-sheet">
      <view class="ios-a2hs-sheet__grab"></view>
      <text class="ios-a2hs-sheet__title">添加到桌面，全屏打开</text>
      <text class="ios-a2hs-sheet__desc">在 Safari 中点击底部分享按钮</text>
      <text class="ios-a2hs-sheet__desc">
        选择“添加到主屏幕”，下次可从桌面全屏打开 MCode
      </text>
      <up-button type="primary" text="我知道了" @click="dismiss"></up-button>
    </view>
  </up-popup>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue"

const IOS_A2HS_DISMISSED_AT_KEY = "mcode_ios_a2hs_dismissed_at"
const IOS_A2HS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

const show = ref(false)

onMounted(() => {
  if (shouldShowIosAddToHomePrompt()) {
    show.value = true
  }
})

function dismiss() {
  try {
    uni.setStorageSync(IOS_A2HS_DISMISSED_AT_KEY, Date.now())
  } catch (error) {
    console.warn("persist ios add-to-home prompt cooldown failed", error)
  }
  show.value = false
}

function shouldShowIosAddToHomePrompt() {
  if (!isH5Runtime()) return false
  if (!isIosSafariBrowser()) return false
  if (isStandaloneDisplayMode()) return false
  if (hasDismissCooldown()) return false
  return true
}

function hasDismissCooldown() {
  try {
    const dismissedAt = Number(uni.getStorageSync(IOS_A2HS_DISMISSED_AT_KEY) || 0)
    if (!dismissedAt) return false
    return Date.now() - dismissedAt < IOS_A2HS_COOLDOWN_MS
  } catch (error) {
    console.warn("read ios add-to-home prompt cooldown failed", error)
    return false
  }
}

function isStandaloneDisplayMode() {
  // #ifdef H5
  const standalone = typeof navigator !== "undefined" && Boolean((navigator as any).standalone)
  const displayModeStandalone =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches
  return standalone || displayModeStandalone
  // #endif
  return false
}

function isIosSafariBrowser() {
  // #ifdef H5
  if (typeof navigator === "undefined") return false
  const userAgent = navigator.userAgent || ""
  const platform = navigator.platform || ""
  const maxTouchPoints = Number((navigator as any).maxTouchPoints || 0)
  const isIphoneOrIpad = /iPhone|iPad/i.test(userAgent)
  const isIpadDesktopUa = platform === "MacIntel" && maxTouchPoints > 1
  if (!isIphoneOrIpad && !isIpadDesktopUa) return false

  const isSafari = /Safari/i.test(userAgent)
  const isOtherIosBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/i.test(userAgent)
  return isSafari && !isOtherIosBrowser
  // #endif
  return false
}

function isH5Runtime() {
  // #ifdef H5
  return true
  // #endif
  return false
}
</script>

<style scoped lang="scss">
.ios-a2hs-sheet {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  padding: 24rpx 32rpx calc(env(safe-area-inset-bottom) + 32rpx);
  background: #ffffff;
}

.ios-a2hs-sheet__grab {
  width: 72rpx;
  height: 8rpx;
  margin: 0 auto 8rpx;
  border-radius: 999rpx;
  background: #dcdfe6;
}

.ios-a2hs-sheet__title {
  font-size: 34rpx;
  font-weight: 600;
  color: #303133;
  text-align: center;
}

.ios-a2hs-sheet__desc {
  font-size: 28rpx;
  line-height: 1.6;
  color: #606266;
  text-align: center;
}
</style>
```

- [ ] **Step 2: 检查组件命名和 easycom 兼容**

执行：

```powershell
Get-Content .\mcode-app\src\components\IosAddToHomePrompt.vue
```

Expected: 文件名是 `IosAddToHomePrompt.vue`，模板使用 `<up-popup>`，无需手动 import 即可被 easycom 扫描。

### Task 4: 仅在首页连接页接入提示组件

**Files:**
- Modify: `mcode-app/src/pages/connections/index.vue`

- [ ] **Step 1: 在连接页模板根节点末尾插入组件**

将 `mcode-app/src/pages/connections/index.vue` 的根节点末尾改成：

```vue
    <IosAddToHomePrompt />
  </view>
</template>
```

- [ ] **Step 2: 复查只有首页接入该组件**

执行：

```powershell
rg -n "IosAddToHomePrompt" .\mcode-app\src\pages
```

Expected: 仅 `mcode-app/src/pages/connections/index.vue` 命中 `<IosAddToHomePrompt />`，且无需新增 `import` 语句。

### Task 5: 构建并验证 H5 产物

**Files:**
- Modify: `mcode-app/index.html`
- Create: `mcode-app/src/static/icons/apple-touch-icon.png`
- Create: `mcode-app/src/components/IosAddToHomePrompt.vue`
- Modify: `mcode-app/src/pages/connections/index.vue`

- [ ] **Step 1: 运行 H5 构建**

执行：

```bash
pnpm --dir mcode-app build:h5
```

Expected: 构建成功，无 `index.html` 解析错误，无 Vue 模板编译错误，无组件解析错误。

- [ ] **Step 2: 检查构建产物中已包含 Apple meta**

执行：

```powershell
Get-Content .\mcode-app\dist\build\h5\index.html | Select-String "apple-mobile-web-app-capable|apple-mobile-web-app-title|apple-touch-icon|viewport-fit=cover"
```

Expected: 输出包含 `viewport-fit=cover`、Apple meta 和 `apple-touch-icon` 的行。

- [ ] **Step 3: 检查构建产物中图标已被复制**

执行：

```powershell
Get-Item .\mcode-app\dist\build\h5\static\icons\apple-touch-icon.png | Select-Object FullName,Length
```

Expected: 构建产物的 `static/icons` 目录存在 `apple-touch-icon.png` 且文件大小非零。

- [ ] **Step 4: 手工验证浏览器行为**

按以下清单验证：

```text
1. iPhone Safari 打开首页连接页：出现底部弹层
2. 点“我知道了”后刷新或重新进入首页：7 天内不再提示
3. iPhone Safari 从桌面图标打开首页：不再提示，且页面以全屏形式显示
4. iPad Safari 打开首页连接页：出现底部弹层
5. iPhone Chrome / Edge / Firefox：不出现提示
6. 非 iOS 设备：不出现提示
7. 手动清除 storage key `mcode_ios_a2hs_dismissed_at` 后：重新进入首页时 Safari 可再次出现提示
8. iPhone Safari 双指缩放：无效
9. iPhone Safari 快速双击页面：不会触发页面放大
```

- [ ] **Step 5: 提交实现改动**

```bash
git add mcode-app/index.html mcode-app/src/static/icons/apple-touch-icon.png mcode-app/src/components/IosAddToHomePrompt.vue mcode-app/src/pages/connections/index.vue docs/superpowers/specs/2026-06-04-ios-add-to-home-screen-design.md docs/superpowers/plans/2026-06-04-ios-add-to-home-screen-prompt.md
git commit -m "feat(app): add ios add-to-home-screen prompt"
```

Expected: 生成单一功能提交，包含 spec、plan 和实现代码。
