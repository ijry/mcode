# mcode-app 实时使用本地 uview-plus

## 架构与数据流

- uni CLI 在构建开始前提供 `UNI_PLATFORM`；Vite 据此决定模块来源。
- H5 与 App 为 `uview-plus` 配置 alias，目标为 `D:/Repos/xyito/open/uview-plus/src/uni_modules/uview-plus`。
- 所有 `uview-plus` 的 JavaScript、自动组件与 Sass 主题导入经过同一个 Vite 解析规则，因此本地源码修改会在下一次开发重载或构建时生效。
- 小程序不配置 alias，继续使用 `mcode-app/node_modules` 和 `pnpm-lock.yaml` 中的固定版本。

## UI 与兼容性

- 本次不新增页面、交互、主题 token 或网络协议；H5/App 的组件表现取决于本地 uview-plus 源码版本。
- H5/App 工作区必须存在该本地源码目录。目录缺失时保留 Vite 的解析错误，不能悄悄回退到 npm 版本。
- 小程序与 H5/App 在本地源码更新后可能暂时存在组件行为差异；发布前应按目标平台分别回归。

## 原生 iOS/Android 复刻

该配置是 uni/Vite 构建期行为，不需要 Swift、Kotlin 或桥接层实现。若原生客户端需要同等组件行为，应同步等价的 uview-plus 功能，而不是复制 alias 配置。
