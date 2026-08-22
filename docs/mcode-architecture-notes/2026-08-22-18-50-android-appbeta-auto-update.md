# Android appbeta 自动更新检测

## 需求

Android 客户端需要自动检测 `appbeta` 新版本，检测到更新后由用户确认并跳转到 `https://app.lingyun.net/appbeta/qH5w` 下载页面。

## 架构与协议数据流

- `mcode-app/src/App.vue` 在 `onLaunch` 调用 `startAppUpdateCheck(true)` 强制检查一次，在 `onShow` 调用默认的 `startAppUpdateCheck()`；服务只在 Android App runtime 生效。同一轮启动中若 `onShow` 紧随 `onLaunch` 触发，会由进行中的请求锁避免重复请求。
- `mcode-app/src/services/appUpdate.ts` 每小时最多发起一次检查，时间戳保存在 `mcode_app_update_checked_at`，请求失败静默忽略，不阻塞应用启动。
- 请求固定发送到 appbeta 特殊域名租户的 `GET https://app.lingyun.net/api/v1/appbeta/app/checkUpdate`，参数为 `key=qH5w`、`version`、`versionCode`。该域名不能替换为默认 `getmcode.lingyun.net/api`，因为 `qH5w` 渠道归属 `app.lingyun.net` 的租户路由。
- 当前版本优先从 `uni.getAppBaseInfo()` 读取 `appVersion` / `appVersionCode`，不可用时回退到 `manifest.json` 的 `0.3.0` / `3`。
- 后端 `data.hasUpdate === true` 时返回 `versionInfo`；客户端显示 `uni.showModal`。用户点“立即更新”后使用 `plus.runtime.openWeb`（无则 `openURL`）打开固定下载页，取消或打开失败均保留当前版本继续使用。

## UI 行为与兼容性

- 只影响 Android；H5、iOS、各小程序平台不发更新检查请求。
- 冷启动每次强制检查一次，不受上一轮本地时间戳影响；回前台检查以本地时间戳做 1 小时去重，应用在一小时内多次回前台不会重复弹窗。
- 更新检查不依赖登录 token，因为 appbeta `checkUpdate` 接口按渠道 key 和当前版本公开判断。
- 不新增主题变量，不改变现有页面导航或业务接口；下载页由系统/内置 WebView 负责后续 APK 下载。

## Native iOS / Android 复刻指导

Android 原生在 Application 启动时强制调用一次更新服务，回到前台时调用带 1 小时节流的入口；同一启动周期用进行中请求锁避免重复。向上述 app.lingyun.net API 传入应用版本名和 `versionCode`。当响应 `hasUpdate=true` 时展示包含版本号、更新说明、“立即更新/稍后再说”的确认对话框，确认后用浏览器或 Custom Tabs 打开下载页。iOS 不执行该检查。
