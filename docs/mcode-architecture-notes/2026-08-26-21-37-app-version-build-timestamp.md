# App Version Build Timestamp

## Scope

关于页版本号改为运行时读取 uni-app 的真实应用版本，并在版本后追加本次编译时间，展示格式为 `v0.3.0.202608262130`。

## Architecture And Data Flow

`src/services/appVersion.ts` 统一读取 `uni.getAppBaseInfo()` 返回的 `appVersion` 与 `appVersionCode`，在 API 不可用或返回空值时回退到当前 manifest 对应的版本。`vite.config.js` 在每次构建启动时注入 ISO 编译时间 `__APP_BUILD_TIME__`，版本服务将其格式化为 `YYYYMMDDHHmm` 并拼接到版本名后。更新检查服务复用同一版本读取函数，避免关于页和更新请求出现不同版本。

## UI Behavior

- 关于页显示 `v<appVersion>.<YYYYMMDDHHmm>`，例如 `v0.3.0.202608262130`。
- 编译时间在构建时固定生成，重新打开页面不会变化；下一次编译会生成新的时间段。
- 版本读取失败时仍显示可用的 manifest 版本，不阻塞页面加载。

## Compatibility

这是版本展示与更新请求参数的兼容性增强，不改变应用版本配置、更新接口协议或安装包升级流程。`uni.getAppBaseInfo()` 是 uni-app 官方跨 App/H5/小程序接口；缺少该 API 的旧运行环境使用安全回退值。构建时间宏在 Jest 等未经过 Vite 注入的环境中为空，不影响测试和开发代码运行。

## Native iOS/Android Replication Guidance

- 从原生应用包读取 `CFBundleShortVersionString` / Android `versionName`，并将 `versionCode` / `CFBundleVersion` 用于更新检查。
- 在构建脚本生成一次 `YYYYMMDDHHmm` 编译标识，和版本名拼成 `0.3.0.202608262130` 后展示。
- 编译标识应在构建时注入，而不是在应用启动时生成；这样同一安装包在不同设备上显示一致。
- 读取版本失败时回退到包内默认版本，避免关于页出现空白。
