# iOS standalone H5 站点更新守卫

## 需求背景

iOS Safari 添加到主屏幕后的 standalone 应用通常恢复已有 WebView 文档，不一定重新请求入口 HTML。网站部署了新 bundle 后，用户可能继续运行旧代码。该方案通过轻量版本标记探测，在启动和回到前台时发现新部署后自动刷新。

## 架构与数据流

1. H5 构建时由 Vite 插件在产物根目录生成 `version.json`，写入 `{ "buildTime": "<ISO timestamp>" }`。同一次构建的 `buildTime` 同时注入 `__APP_BUILD_TIME__`，编译进当前 bundle。
2. `App.vue` 的 `onLaunch` 启动更新守卫。守卫监听 `document.visibilitychange`，仅在页面重新变为 `visible` 时再次检查，覆盖 standalone 从后台回到前台的场景。
3. 每次检查请求 `/version.json?_=<当前时间戳>`，默认 `fetch` 额外使用 `cache: "no-store"`，降低浏览器、WebView 或 CDN 返回旧版本标记的概率。
4. 解析远端 `buildTime` 后与当前 bundle 的 `APP_BUILD_TIME` 比较；值不同且不在防循环窗口内时，先写入 `localStorage`，再调用 `location.reload()`。
5. 模块级 in-flight Promise 合并并发检查，避免启动检查和前台检查同时访问版本标记或重复刷新。

## UI 行为

更新检查不展示弹窗，不阻塞正常页面操作。探测到新版本时直接刷新页面，用户在刷新后进入新 bundle；网络失败、HTTP 非成功、JSON 无效、版本字段缺失或浏览器存储不可用时静默保留当前页面。

同一目标版本的刷新记录保存在 `mcode_h5_update_reload_guard`，默认 TTL 为 2 分钟。TTL 内不会再次刷新，避免部署期间 HTML、版本标记和静态资源短暂不同步导致刷新循环；TTL 过期后允许重试。

## 兼容性与部署要求

该逻辑只在存在浏览器 `window`/`document` 且当前 bundle 具有构建时间时生效，原生 App 更新流程不受影响。静态服务器必须把 `version.json` 发布在 H5 根路径，并允许同源访问；建议对该文件设置 `Cache-Control: no-store`，HTML 与带 hash 的 JS/CSS 继续按现有缓存策略部署。版本标记内容应在静态资源完成上传后再切换，减少新标记先于新 bundle 可用的窗口。

## 原生 iOS/Android 复刻指导

原生客户端可在应用进入前台时向同源 `/version.json` 发起带随机查询参数的请求，并使用禁用缓存策略。将启动时加载的 bundle 构建时间与远端 `buildTime` 比较；不同且同一目标版本未在短 TTL 内刷新过时，重新加载 WebView 的入口页面或销毁并重建 WebView。将目标版本和触发时间持久化，网络、解析和存储错误均降级为继续使用当前页面；刷新后仍为旧版本时只在 TTL 过期后重试，不要无限重载。
