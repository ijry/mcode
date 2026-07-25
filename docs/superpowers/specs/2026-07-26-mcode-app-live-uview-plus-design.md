# mcode-app 实时使用本地 uview-plus 设计

## 目标

让 `mcode-app` 的 H5 与 App 构建直接解析本地 `uview-plus` 源码：
`D:/Repos/xyito/open/uview-plus/src/uni_modules/uview-plus`。这样该目录中的修改无需发布 npm 包或更新锁文件即可被应用使用。小程序平台继续使用当前 `pnpm-lock.yaml` 固定的 npm 版本。

## 范围与非目标

- 范围：仅修改 `mcode-app/vite.config.js` 的模块解析规则，并在实施阶段补充 mcode 架构说明。
- 非目标：不修改 `uview-plus` 源码、不升级 `uview-plus` 的 npm 版本、不改变主题变量、组件 API 或页面代码。
- 非目标：不将本地源码 alias 应用于小程序平台；其构建路径不在参考项目的已验证范围内。

## 方案比较

### 方案 A：按平台配置 Vite alias（采用）

在 Vite 配置中导入 Node `path`，建立现有 alias 列表；当 `process.env.UNI_PLATFORM` 为 `h5` 或 `app` 时，追加 `uview-plus` 的精确 alias，并指向本地源码根目录。配置交给 `resolve.alias`。

优点：复用参考项目已使用的模式；H5 与 App 开发、构建都实时读取源码；小程序依赖链不变；不需要重新安装依赖。

代价：本机开发依赖固定绝对路径，因此本地源码缺失时应让解析失败，而不是静默落回旧 npm 包。

### 方案 B：所有平台都配置 alias

所有 uni 平台统一读取本地源码。

未采用：可能改变小程序平台的模块解析和构建语义，缺少参考验证，且超出本次目标。

### 方案 C：以 `file:` 依赖替换 npm 依赖

将 `uview-plus` 的依赖写成指向本地路径的 `file:` 协议。

未采用：会产生依赖安装与 lockfile 变动，所有平台受影响，不如 Vite alias 精确。

## 架构与构建数据流

1. uni CLI 启动 H5 或 App 构建时设置 `UNI_PLATFORM`。
2. Vite 加载 `mcode-app/vite.config.js`，根据平台生成 alias。
3. 对 H5/App，`import "uview-plus"`、自动组件导入和 Sass 的 `@import "uview-plus/theme.scss"` 均经 alias 解析到本地源码。
4. 对小程序，不添加该 alias，解析继续使用 `mcode-app/node_modules` 中由 `pnpm-lock.yaml` 固定的版本。
5. `UniUpRoot` 和 `optimizeDeps.exclude` 继续使用模块名 `uview-plus`，无需重写；它们会服从 Vite 的最终解析结果。

## UI、协议与兼容性

- UI 行为由实时源码版本决定；应用页面不引入新的交互或主题行为。
- 不涉及网络协议、存储格式、服务端接口或账户数据流。
- H5/App 需要开发环境存在本地 `uview-plus` 工作区；路径缺失是显式配置错误，应使构建失败。
- 小程序继续保持当前 npm 依赖版本，因此可能与 H5/App 的实时源码存在组件行为差异；升级到兼容版本前应在目标平台单独回归。

## 原生 iOS/Android 复刻说明

该变更只影响 uni/Vite 的构建期 JavaScript/Sass 模块来源，不引入需要 Swift、Kotlin 或原生桥接层复刻的运行时协议和 UI 逻辑。原生客户端若需要获得相同组件行为，应同步集成与该本地源码等价的 `uview-plus` 功能实现，而非复制 alias 配置。

## 错误处理与验证

- 不增加运行时回退逻辑：缺失本地目录时由 Vite 模块解析报错，避免无提示地改用旧依赖。
- 执行 `pnpm build:h5`（在 `mcode-app` 目录）验证 H5 构建通过并检查构建日志/解析结果包含本地源码路径。
- 按现有可用命令执行一个小程序目标构建或至少确认其 alias 条件不成立；该平台仍依赖锁定的 `uview-plus` 包。
- 此配置更改不需要新增单元测试；构建验证覆盖平台选择与模块解析。
