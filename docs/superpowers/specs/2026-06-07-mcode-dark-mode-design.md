# MCode Dark Mode Design

## 1. Goal

为 `mcode-app` 实现完整的三态外观模式：

- `system`
- `light`
- `dark`

方案需要参考 `uview-plus` 官方 dark mode 机制与本地 `D:\Repos\xyito\open\uview-plus` 实现，统一接入运行时主题系统，而不是继续维持业务侧的布尔开关逻辑。

目标结果：

1. 主题偏好可持久化，并在冷启动后正确恢复。
2. `uview-plus` 组件、页面背景、导航栏、tabBar 使用同一套主题状态。
3. `mcode-app` 当前主要页面和共享组件在暗黑模式下不再保留大面积浅色硬编码。

## 2. Current State

当前仓库内已经存在一部分未完成的暗黑模式尝试，但实现是分裂的：

1. [`mcode-app/src/pages/profile/index.vue`](D:/Repos/xyito/lingyun/mcode/mcode-app/src/pages/profile/index.vue) 使用 `mcode_dark_mode:boolean` 控制一个开关，但只能表达两态，无法表达“跟随系统”。
2. [`mcode-app/src/App.vue`](D:/Repos/xyito/lingyun/mcode/mcode-app/src/App.vue) 里有手写的 `initDarkMode()`，只在启动时粗略设置 tabBar，未接入 `uview-plus` 运行时主题，也不会统一更新页面和组件。
3. [`mcode-app/src/uni.scss`](D:/Repos/xyito/lingyun/mcode/mcode-app/src/uni.scss) 仍以浅色硬编码为主，没有形成应用级语义 token。
4. 页面和组件内存在大量直接写死的浅色背景、文字、边框值，导致即使底层变量切换，界面仍会残留浅色块。

与此同时，当前依赖的 `uview-plus` 版本已经提供了完整的运行时主题能力：

1. `uni.$u.setThemePreference('system' | 'light' | 'dark')`
2. `uni.$u.getThemePreference()`
3. `uni.$u.theme.mode / vars / version`
4. `config.nativeThemeSync = true` 时同步原生导航栏、页面背景和 tabBar
5. H5 侧自动维护 `data-up-theme="light|dark"`

因此本次实现不需要再自造一套主题引擎，应该直接以 `uview-plus` 主题系统为中心。

## 3. Non-Goals

本次不做以下事项：

1. 不改造 `codeg-main`、`mcode-relay` 或其他子项目的主题系统。
2. 不设计新的品牌色体系，只沿用现有主色和 `uview-plus` 默认 dark token。
3. 不在本次实现中补两套 tabBar 图标资源；tabBar 图标仍先使用现有静态 png。
4. 不追求一次性覆盖仓库内所有历史页面，仅覆盖 `mcode-app` 当前实际主路径与高频共享组件。

## 4. Approach Options

### Option A: uview-plus Runtime Theme As The Single Source Of Truth

以 `uview-plus` 运行时主题系统为唯一主题入口：

1. 业务存储只保留主题偏好字符串。
2. 启动时调用 `uni.$u.setThemePreference(...)`。
3. 页面和组件统一消费 `--up-*` / `--u-*` CSS 变量。
4. 导航栏、tabBar、页面背景交由 `nativeThemeSync` 和官方 runtime 逻辑同步。

优点：

1. 与官方 darkMode 设计一致。
2. 原生 UI 和组件主题链路统一。
3. 后续新增 `uview-plus` 组件时自动继承主题能力。

缺点：

1. 需要回收现有页面中的浅色硬编码。

### Option B: Business Store Drives Everything

业务自己维护 Pinia 主题状态，再分别同步到页面 class、tabBar 和 `uview-plus`。

优点：

1. 业务自由度高。

缺点：

1. 与 `uview-plus` 自带主题系统重复。
2. 容易产生双状态和同步遗漏。

### Option C: CSS Media Query First

主要依赖 `prefers-color-scheme`，手动模式再额外打 class。

优点：

1. 看起来上手快。

缺点：

1. 三态模式表达复杂。
2. 原生导航栏/tabBar 同步不稳定。
3. 与 `uview-plus` 的运行时主题事件链脱节。

### Recommendation

采用 Option A。`uview-plus` 已经提供完整主题能力，继续在业务侧拼接第二套机制只会放大维护成本。

## 5. Architecture

### 5.1 Theme Preference Model

新增统一主题偏好模型：

```ts
type ThemePreference = 'system' | 'light' | 'dark'
```

主题存储 key 统一为：

```ts
const THEME_PREFERENCE_KEY = 'mcode_theme_preference'
```

旧 key：

```ts
const LEGACY_DARK_MODE_KEY = 'mcode_dark_mode'
```

### 5.2 Theme Service

新增轻量主题服务模块，职责仅限：

1. 解析和校验存储值。
2. 从旧布尔值迁移到三态值。
3. 调用 `uni.$u.setThemePreference(...)` 应用主题。
4. 暴露当前偏好、是否暗色等只读辅助函数给页面使用。

该模块不承担复杂状态管理，不引入新的 Pinia store，避免把简单全局能力做重。

### 5.3 App Bootstrap

应用启动时：

1. 安装 `uview-plus` 时开启 `nativeThemeSync`
2. `App.vue` 的 `onLaunch` 中调用主题服务，完成：
   - 旧值迁移
   - 偏好读取
   - 应用主题
3. 去掉当前手写的 `initDarkMode()` tabBar 分支逻辑，防止与 `uview-plus` runtime 主题冲突

### 5.4 Styling Contract

全局样式层建立应用语义 token，统一映射到 `uview-plus` 变量：

1. `--mcode-page-bg`
2. `--mcode-card-bg`
3. `--mcode-card-muted-bg`
4. `--mcode-text-primary`
5. `--mcode-text-secondary`
6. `--mcode-text-tertiary`
7. `--mcode-border-color`
8. `--mcode-overlay-bg`

这些变量最终由 `--up-page-bg-color`、`--up-card-bg-color`、`--up-main-color`、`--up-content-color`、`--up-tips-color`、`--up-border-color` 等上游变量派生，避免业务组件直接绑定裸 `--up-*` 名称导致语义不清。

### 5.5 Page and Component Adaptation

改造范围：

1. `pages/connections/index.vue`
2. `pages/conversations/index.vue`
3. `pages/conversation-detail/index.vue`
4. `pages/todos/index.vue`
5. `pages/profile/index.vue`
6. 常驻共享组件，例如：
   - `components/MessageBubble.vue`
   - `components/ToolCallBlock.vue`
   - `components/CodeBlock.vue`
   - `components/pet/*` 中视觉上长期驻留的面板/弹层

适配原则：

1. 新代码不再引入新的浅/深硬编码色值，优先使用语义变量。
2. 已有局部深色 `@media` 特判能删除则删除，统一收口到主题变量。
3. 必须保留的特殊配色，例如错误块、代码块、状态色，允许保留，但需保证暗黑下可读性。

## 6. UX Changes

### 6.1 Profile Appearance Entry

当前“深色模式”开关改为三态外观设置入口，不再使用布尔 `u-switch`。

建议交互：

1. 菜单项标题改为“外观模式”
2. 右侧显示当前值：`跟随系统` / `浅色` / `深色`
3. 点击后通过 `u-action-sheet`、`u-picker` 或同等轻量交互选择三态

原因：

1. 三态模式无法用布尔开关准确表达。
2. “跟随系统”需要可见且可回选。

### 6.2 Effective Theme Feedback

界面仅展示用户偏好，不额外在所有页面显示“当前实际主题”。如需调试，可在代码中通过 `uni.$u.theme.mode` 读取。

这次实现保持 UI 简洁，不增加额外的说明文本。

## 7. Data Migration

启动时执行以下迁移逻辑：

1. 读取 `mcode_theme_preference`
2. 若值为 `system | light | dark`，直接使用
3. 若新 key 不存在，再读 `mcode_dark_mode`
4. 旧值映射规则：
   - `true -> dark`
   - `false -> light`
5. 写回新 key
6. 后续业务只读写新 key

异常值或损坏值一律回退到 `system`。

## 8. Error Handling

### 8.1 Runtime Timing

若某些平台上 `uni.$u` 初始化稍晚，主题应用入口必须是幂等的，允许：

1. 插件安装后执行一次
2. `App.onLaunch` 再执行一次

重复调用不会产生错误，只会重放同一主题偏好。

### 8.2 Invalid Storage

若存储值不是 `system | light | dark` 或旧布尔值不可识别，统一回退到 `system`，并覆盖旧值。

### 8.3 Partial UI Adaptation

如果个别低频页面漏改，不应阻塞主题系统生效。验收重点是主 tab 页面、会话详情页和常驻共享组件。

## 9. Testing Strategy

### 9.1 Automated

为纯函数或轻逻辑增加小范围测试，优先覆盖：

1. 主题偏好解析
2. 旧值迁移
3. 非法值回退
4. 三态值到实际调用参数的映射

不为本次引入高成本的 UI 快照测试。

### 9.2 Manual

至少验证以下场景：

1. 新安装或无存储时默认进入 `system`
2. 从“我的”页切到 `light`
3. 从“我的”页切到 `dark`
4. 从“我的”页切回 `system`
5. 冷启动后偏好仍然生效
6. 旧 `mcode_dark_mode` 用户升级后被正确迁移
7. `connections / conversations / conversation-detail / todos / profile` 在暗黑下没有明显纯白大块和低对比文字
8. tabBar、导航栏、内容背景在三态切换时一致

## 10. Files Likely To Change

核心文件：

1. `mcode-app/src/main.ts`
2. `mcode-app/src/App.vue`
3. `mcode-app/src/App.up.vue`
4. `mcode-app/src/uni.scss`
5. `mcode-app/src/pages/profile/index.vue`

新增文件：

1. `mcode-app/src/services/theme/*` 或同等轻量路径下的主题服务模块

重点适配文件：

1. `mcode-app/src/pages/connections/index.vue`
2. `mcode-app/src/pages/conversations/index.vue`
3. `mcode-app/src/pages/conversation-detail/index.vue`
4. `mcode-app/src/pages/todos/index.vue`
5. `mcode-app/src/components/MessageBubble.vue`
6. `mcode-app/src/components/ToolCallBlock.vue`
7. `mcode-app/src/components/CodeBlock.vue`
8. `mcode-app/src/components/pet/*.vue`

## 11. Risks

1. 页面和组件里的硬编码色值分布较散，第一次改造时容易漏点。
2. 某些组件已经有局部 dark `@media` 样式，若与新的变量方案叠加，可能出现重复覆盖。
3. `nativeThemeSync` 开启后，现有 `pages.json` 的静态默认颜色会被运行时主题覆盖；这是预期行为，但需要验证在目标平台上没有闪烁或跳变。

## 12. Success Criteria

以下条件同时满足即视为完成：

1. 用户可在 app 内选择 `system / light / dark`
2. 偏好在重启后保持
3. `uview-plus` 组件和原生 UI 同步切换
4. 主路径页面在暗黑模式下可读、无明显浅色残留
5. 旧布尔存储能无损迁移
