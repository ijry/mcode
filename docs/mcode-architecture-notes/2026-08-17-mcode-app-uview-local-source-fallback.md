# MCode App 的 uview-plus 本地源码回退

## 目标

H5 与 App 构建可以优先使用开发机上的 `uview-plus` 本地源码副本，但该副本只是可选的开发便利，不能成为构建安装依赖。副本不存在时，Vite 必须按照包解析规则使用项目已安装的 `node_modules/uview-plus`。

## 解析规则

- 仅 H5/App 平台会考虑 `D:/Repos/xyito/open/uview-plus/src/uni_modules/uview-plus` 这一本地源码路径。
- 只有该路径在当前主机确实存在时，才注册 `uview-plus` Vite alias。
- 路径缺失时不注册 alias；`@import "uview-plus/theme.scss"` 和其他 `uview-plus` 导入由项目锁定的依赖包解析。

这避免非 Windows 主机把 Windows 驱动器路径解释为项目内的相对路径，并保持 Windows 开发者已有的本地源码调试流程。

## 原生复刻要点

原生端不需要实现此规则。它是 uni-app/Vite 构建时的依赖解析契约；原生项目应继续各自通过其包管理器锁定 UI 依赖，而不能依赖某台开发机的绝对路径。
