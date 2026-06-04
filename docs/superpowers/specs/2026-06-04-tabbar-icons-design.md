# 底部 TabBar 图标设计

**日期**: 2026-06-04
**范围**: `mcode-app`
**目标**: 为现有底部 `连接 / 会话 / 待办 / 我的` 四个 tab 增加图标，不调整 tab 顺序与行为。

## 当前现状

- `mcode-app/src/pages.json` 已定义原生 `tabBar`，当前只有文字，没有图标。
- 现有底部 tab 顺序为：
  - `连接`
  - `会话`
  - `待办`
  - `我的`
- `mcode-app/src/App.vue` 中已有 `uni.setTabBarStyle`，仅处理 tabbar 颜色和暗色模式，不涉及图标资源。

## 需求边界

- 保留现有四个 tab，不新增、不移除、不调序。
- 仅补充图标资源和配置。
- 不改为自定义 tabbar。
- 不改页面路由、不改业务逻辑、不改交互行为。

## 方案对比

### 方案一：原生 tabbar 增加本地图标资源

在 `mcode-app/src/pages.json` 的 `tabBar.list` 中，为每个 tab 补充：

- `iconPath`
- `selectedIconPath`

并新增对应本地图标资源文件。

**优点**

- 改动最小，风险最低。
- 继续使用 uni-app 原生 tabbar，兼容性稳定。
- 不影响当前 tab 切换逻辑和页面结构。

**缺点**

- 图标样式受资源本身限制，动态效果有限。

### 方案二：改造为自定义 tabbar

使用自定义组件完全接管底部导航展示与交互。

**优点**

- 样式自由度更高。

**缺点**

- 明显超出当前需求。
- 需要额外处理选中态、路由同步、安全区与兼容性。
- 风险和维护成本明显更高。

## 选定方案

采用**方案一**。

原因：

- 当前诉求只是“底部 tabbar 加图标”。
- 原生 tabbar 已经存在且工作正常。
- 该方案可以在不影响现有行为的前提下完成需求。

## 图标设计

采用统一的简洁线性风格，保证观感干净、识别性明确。

- `连接`：链路/连接含义图标
- `会话`：聊天气泡图标
- `待办`：勾选清单图标
- `我的`：用户头像图标

图标状态分为两套：

- 默认态：中性灰色，匹配 `tabBar.color`
- 选中态：品牌蓝色，匹配 `tabBar.selectedColor`

## 文件结构

计划新增目录：

- `mcode-app/src/static/tabbar/`

计划在其中新增 8 个资源文件：

- `connections.png`
- `connections-active.png`
- `conversations.png`
- `conversations-active.png`
- `todos.png`
- `todos-active.png`
- `profile.png`
- `profile-active.png`

说明：

- 使用位图资源，避免不同端对矢量图标支持差异带来的不确定性。
- 命名与 tab 语义一一对应，便于维护。

## 接入方式

修改 `mcode-app/src/pages.json`：

- 为 `连接` 增加 `iconPath` 和 `selectedIconPath`
- 为 `会话` 增加 `iconPath` 和 `selectedIconPath`
- 为 `待办` 增加 `iconPath` 和 `selectedIconPath`
- 为 `我的` 增加 `iconPath` 和 `selectedIconPath`

`App.vue` 保持不变，因为图标本身不依赖运行时切换逻辑。

## 数据流与行为

- 点击 tab 的跳转逻辑继续由原生 tabbar 管理。
- 图标只参与视觉展示，不参与状态计算。
- 选中态继续由框架依据当前路由自动切换。

## 错误处理

- 若资源路径错误，tabbar 可能只显示文字或不显示图标。
- 因此实现时必须保证：
  - 资源文件真实存在
  - `pages.json` 路径与资源路径完全一致
  - 命名不含歧义

## 验证方式

手工验证为主：

1. 启动 `mcode-app`
2. 查看底部四个 tab 是否都显示图标
3. 逐个点击 tab，确认选中态颜色切换正常
4. 确认 tab 顺序未变化，仍为 `连接 / 会话 / 待办 / 我的`
5. 确认暗色模式下 tabbar 样式仍正常显示

## 非目标

- 不调整 tab 文案
- 不调整 tab 数量
- 不改造为自定义 tabbar
- 不引入新的图标库依赖
