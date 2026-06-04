# iOS Add To Home Screen Prompt Design

**Date:** 2026-06-04  
**Scope:** `mcode-app` H5 端首页连接页 iPhone/iPad Safari 访问提示  
**Primary Files:** `mcode-app/src/pages/connections/index.vue`, `mcode-app/index.html`

---

## Problem

当前 `mcode-app` 的 H5 端在 iPhone/iPad 上以 Safari 普通网页打开时，顶部和底部浏览器 UI 会长期占据可视区域，体验明显弱于“添加到主屏幕”后的全屏模式。

现状有两个缺口：

- 没有针对 iOS Safari 的“添加到桌面”引导
- H5 页面头部没有补齐 Apple Web App 相关 meta，导致即使用户添加到主屏幕，全屏体验也不完整或不稳定

因此需要为 iOS Safari 用户补一层轻量但明确的引导，让用户知道可以通过“添加到主屏幕”进入更接近原生应用的全屏模式。

## Goal

为 `mcode-app` 的 H5 端首页连接页增加一套 iOS Safari 专用的“添加到桌面”提示，满足以下目标：

- 仅在 `iPhone/iPad` 的 `Safari` 浏览器中触发
- 已经以桌面全屏模式打开时不再提示
- 仅在首页连接页展示底部弹层引导文案
- 用户关闭后 `7 天` 内不再提示，超过 `7 天` 可再次提示
- 补齐 iOS Web App 所需的页面 meta，确保添加到主屏幕后可以以全屏方式打开

## Non-Goals

- 不为 Android 浏览器增加安装提示
- 不为 iOS Chrome、Edge、Firefox 等非 Safari 浏览器增加提示
- 不实现完整 PWA 安装流或 `beforeinstallprompt`
- 不新增页面级提示入口或设置页开关
- 不改动业务页面路由、数据流或现有会话逻辑

## Options Considered

### 1. 首页连接页底部弹层 + 本地冷却时间戳 + Apple Web App meta（采用）

**做法**

- 在首页连接页加载后做一次 H5 环境检测
- 若满足 iOS Safari、非独立模式、且未命中 7 天冷却，则展示底部弹层
- 用户关闭后记录本地时间戳
- 在 `index.html` 增加 Apple Web App 相关 meta 和触屏图标

**优点**

- 改动最小，只影响用户指定的首页入口
- 与现有 `uview-plus` 组件体系一致，样式可控
- 关闭策略简单清晰，后续易维护
- 同时覆盖“引导”和“全屏基础配置”两个缺口

**缺点**

- 如果用户直接深链进入其他页面，则本次不会看到提示

### 2. 页面内横幅提示

**做法**

- 仅在某个页面顶部或底部插入提示条

**优点**

- 实现更轻

**缺点**

- 入口分散，容易遗漏
- 视觉提醒较弱
- 需要决定挂在哪个页面，不适合全局需求

### 3. 使用系统 `showModal`

**做法**

- 命中条件时直接使用 `uni.showModal`

**优点**

- 实现最快

**缺点**

- 信息承载弱，不适合步骤引导
- 体验生硬，不符合当前项目里已有的底部弹层模式

## Chosen Design

采用 **方案 1**：在首页连接页实现 iOS Safari 检测与底部弹层，同时补充 Apple Web App meta。

核心原则如下：

1. **只在目标环境提示。**
2. **已具备桌面全屏体验时不打扰。**
3. **用户关闭后进入 7 天冷却。**
4. **提示逻辑和页面配置同时到位。**

## Detailed Design

### 1. 触发时机

在 `mcode-app/src/pages/connections/index.vue` 页面挂载后执行检测逻辑。

原因：

- 用户明确要求“直接放在首页”
- `pages/connections/index` 是当前首页入口
- 只在该页面接入可以避免影响其他页面结构

检测只在 `H5` 端运行，其他端直接跳过。

### 2. 目标环境判断

提示必须同时满足以下条件：

1. 当前为 `H5`
2. 当前设备为 `iPhone` 或 `iPad`
3. 当前浏览器为 `Safari`
4. 当前不是独立全屏模式
5. 当前未命中 7 天冷却期

#### iOS 设备判断

采用双路径判断：

- UA 包含 `iPhone` 或 `iPad`
- 或者 `navigator.platform === "MacIntel"` 且 `maxTouchPoints > 1`

第二条是为了兼容部分 iPadOS 会以桌面 UA 伪装成 Mac 的情况。

#### Safari 判断

Safari 判断必须排除以下 iOS 壳浏览器：

- `CriOS`
- `FxiOS`
- `EdgiOS`
- `OPiOS`

即：

- UA 中包含 `Safari`
- 且不包含上述壳浏览器标识

#### 独立全屏模式判断

只要满足任一条件，就视为已经以桌面全屏模式运行：

- `window.matchMedia("(display-mode: standalone)").matches === true`
- `navigator.standalone === true`

命中后不再展示提示。

### 3. 冷却时间策略

本地存储一个关闭时间戳，例如：

```ts
const IOS_A2HS_DISMISSED_AT_KEY = "mcode_ios_a2hs_dismissed_at"
```

冷却时长固定为 `7 天`：

```ts
const IOS_A2HS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000
```

当用户关闭弹层时：

- 记录当前时间戳到本地存储

当用户进入首页连接页时：

- 读取该时间戳
- 若当前时间减去时间戳小于 `IOS_A2HS_COOLDOWN_MS`，则本次不展示
- 超过冷却期后，下次再次满足环境条件时可以重新展示

如果读写本地存储失败，则默认降级为“不记忆关闭时间”，不阻断页面正常使用。

### 4. 交互形式

使用 `uview-plus` 的 `up-popup` 做底部弹层，挂载在 `mcode-app/src/pages/connections/index.vue` 中。

交互元素保持精简：

- 标题：强调“添加到桌面，全屏打开”
- 正文：说明在 Safari 中点击分享按钮，再点“添加到主屏幕”
- 主按钮：`我知道了`

本次不提供“去设置”或“以后不再提示”的额外分支，避免无效复杂度。

### 5. 文案方向

建议文案直接说明收益和步骤，例如：

- 标题：`添加到桌面，全屏打开`
- 正文第一行：`在 Safari 中点击底部分享按钮`
- 正文第二行：`选择“添加到主屏幕”，下次可从桌面全屏打开 MCode`
- 按钮：`我知道了`

文案目标是：

- 告诉用户为什么要做
- 告诉用户怎么做
- 避免过长说明

### 6. 页面头部配置

在 `mcode-app/index.html` 中补充以下 iOS 相关 meta：

- `apple-mobile-web-app-capable=yes`
- `apple-mobile-web-app-status-bar-style=default` 或与当前视觉更匹配的值
- `apple-mobile-web-app-title=MCode`

同时增加 `apple-touch-icon` 指向项目现有图标资源。

本次优先复用现有 `180x180` 图标内容，但应放到 H5 可稳定直链的位置，例如：

- `mcode-app/public/apple-touch-icon.png`

然后让 `index.html` 指向该稳定路径。

### 7. 状态与生命周期

首页连接页维护一个布尔状态，例如：

```ts
const showIosAddToHomePrompt = ref(false)
```

生命周期流程如下：

1. 首页连接页挂载后执行检测
2. 命中条件则设置 `showIosAddToHomePrompt = true`
3. 用户点击关闭按钮或遮罩关闭
4. 统一写入关闭时间戳
5. 设置 `showIosAddToHomePrompt = false`

为避免用户误触遮罩导致未记录冷却，遮罩关闭与按钮关闭都应走同一个关闭处理函数。

这里的“页面首次进入”指首页连接页组件创建并挂载后的首次判断，而不是应用全局生命周期。

### 8. 错误与降级

若以下任一能力缺失：

- `window`
- `navigator`
- `matchMedia`
- `localStorage` / `uni` 存储能力

则不抛错，直接降级为“不显示提示”或“不记忆冷却”，保证业务页面可正常打开。

## Data Flow

1. H5 打开并进入首页连接页
2. 执行 iOS Safari 环境检测
3. 检查当前是否为独立全屏模式
4. 读取本地关闭时间戳
5. 若满足显示条件，则打开底部弹层
6. 用户关闭弹层
7. 写入当前时间戳
8. 未来 7 天内再次访问首页时跳过提示
9. 超过 7 天后再次进入首页，可重新提示

## Files

- Modify: `mcode-app/src/pages/connections/index.vue`
- Modify: `mcode-app/index.html`
- Add: `mcode-app/public/apple-touch-icon.png`

## Proposed API Shape

推荐在首页连接页内部使用小型私有函数组织逻辑：

```ts
function shouldShowIosAddToHomePrompt(): boolean
function isIosSafariBrowser(): boolean
function isStandaloneDisplayMode(): boolean
function hasDismissCooldown(): boolean
function dismissIosAddToHomePrompt(): void
```

这样判断逻辑与 UI 状态分离，便于后续继续扩展。

## Error Handling

- 环境判断失败时，不展示提示，不影响业务
- 存储读取失败时，按“未关闭过”处理
- 存储写入失败时，仍允许关闭弹层，只是后续可能再次出现
- 图标路径错误不应阻断页面运行，但会影响添加到桌面的图标显示，需要在实现后手工验证

## Testing Strategy

手工验证以下场景：

1. **iPhone Safari 打开首页连接页**
   - 预期：出现底部弹层

2. **iPhone Safari 关闭提示后再次进入首页**
   - 预期：7 天内不再提示

3. **iPhone Safari 添加到主屏幕后从桌面打开首页**
   - 预期：不出现提示
   - 预期：以全屏模式打开

4. **iPad Safari 打开首页连接页**
   - 预期：出现底部弹层

5. **iOS Chrome / Edge / Firefox 打开**
   - 预期：不出现提示

6. **非 iOS 设备打开**
   - 预期：不出现提示

7. **冷却时间超过 7 天后重新进入首页**
   - 预期：再次满足环境条件时可重新出现提示

## Acceptance Criteria

- 仅 `iPhone/iPad Safari` 命中提示
- 已以桌面独立模式打开时不提示
- 提示仅在首页连接页以底部弹层呈现
- 用户关闭后 `7 天` 内不再提示
- 超过 `7 天` 后允许再次提示
- H5 页面头包含 iOS Web App 相关 meta
- 添加到主屏幕后可从桌面以全屏方式打开 `MCode`
