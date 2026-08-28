# 默认主题状态胶囊的边框旋转跑马灯

## 背景

用户要求：「状态胶囊默认主题也加个边框旋转动画，跟黑客帝国那种旋转动画一样」。
黑客帝国（matrix）主题下状态胶囊边框有一段高光沿着圆角边框循环转动，默认主题此前是静态的。

## 架构

状态胶囊在 `ConversationDetailBody.vue`：

```
.input-status-wrap                       position: relative; overflow: hidden; padding: 2rpx
  ├ ::before   inset: -42rpx             整块 conic-gradient（渐变环）
  ├ ::after    inset: 2rpx               实色面板，盖住中心只露出 2rpx 边缘
  └ .input-status-wrap__content          z-index: 1，装 <slot name="status">
```

旋转 `::before` 时，因为中心被 `::after` 挡住，只有边缘 2rpx 露出渐变，视觉上就是「一段高光沿边框跑」。
**默认主题此前已经具备全部三层图层，唯一缺的是 `animation`**，所以这次改动不需要新增 DOM 或图层。

`@keyframes inputStatusLedSpin { to { transform: rotate(360deg); } }` 原本就定义在 Body.vue 的
非主题限定作用域，直接复用。

## 关键决策：动画挂在状态类而不是 cyber 类

matrix 侧的规则都带 `.detail-body--cyber-active`，而这个类来自
`ConversationDetailInteractivePane.vue` 的 `:cyber-active="Boolean(detailTheme === 'matrix' && active)"` —— 
**非 matrix 主题恒为 false**，默认主题永远拿不到。

因此默认主题的动画挂在 `input-status-wrap--status-${resolvedRuntimeStatusClass}` 上，这个类由
`buildRuntimeStatusClass()`（`detailStatusPresentation.ts`）产出，取值为 `running` / `pending` /
`online` / `idle` / `error`，与主题无关。

新增规则（插在所有 cyber 规则之前，保证 cyber 侧两个类的更高权重能继续覆盖）：

```scss
.input-status-wrap--status-running::before,
.input-status-wrap--status-pending::before {
  background: conic-gradient(...);   /* 高光段拉满，见下 */
  opacity: 0.92;
  animation: inputStatusLedSpin 1.55s linear infinite;
}

.input-status-wrap--status-pending::before { animation-duration: 2.4s; }

.input-status-wrap--status-idle::before,
.input-status-wrap--status-online::before,
.input-status-wrap--status-error::before { animation: none; }
```

旋转态单独重写了 `background`：基础态的 conic-gradient 峰值只到 `--up-primary` 74% 混色配 0.72 不透明度，
在浅色页面上转起来几乎读不出（首版实测边框亮度极差不足 6/255）。旋转态把峰值段提到纯
`--up-primary` 并把不透明度提到 0.92；静止态（idle / online / error）沿用原来的柔和外观，未改动。

## 状态映射

| `runtimeStatusClass` | 来源 | 默认主题边框 |
| --- | --- | --- |
| `running` | `thinking` / `running_tool` / `attach_settling` | 转，1.55s |
| `pending` | `waiting_permission` / `waiting_question` / `replay_miss` | 转，2.4s（更慢，表示在等人） |
| `online` | `connected` | 静止 |
| `idle` | 其余 | 静止 |
| `error` | `error` / `disconnected` / bridge 异常 | 静止 |

## 协议 / 数据流

无新增字段。全部复用既有的 `session.status` → `buildRuntimeStatusClass()` → CSS 类链路。

## UI 行为

- 默认主题思考中 / 执行命令中：边框高光顺时针转，1.55s 一圈。
- 等待授权 / 等待选择：同样在转，但放慢到 2.4s 一圈。
- 空闲、已连接、异常：静止，外观与改动前完全一致。
- matrix 主题：颜色（绿）、streaming/ramp 加速到 0.95s、error 停转等既有行为全部保留。
- `prefers-reduced-motion: reduce` 分组已覆盖 `.input-status-wrap::before` 且带 `!important`，新动画自动被禁用，无需额外处理。

## 渲染实测（Chromium 375px）

读 `getComputedStyle(el, "::before")`，并间隔 400ms 取两帧 `transform` 判断是否真的在转：

| scope / status | animationName | duration | opacity | 两帧 transform 变化 |
| --- | --- | --- | --- | --- |
| default / running | inputStatusLedSpin | 1.55s | 0.92 | 是 |
| default / pending | inputStatusLedSpin | 2.4s | 0.92 | 是 |
| default / online | none | 0s | 0.72 | 否 |
| default / idle | none | 0s | 0.72 | 否 |
| default / error | none | 0s | 0.72 | 否 |
| cyber / running | inputStatusLedSpin | 0.95s | 0.95 | 是 |
| cyber / pending | inputStatusLedSpin | 0.95s | 0.74 | 是 |
| cyber / online·idle | none | — | 0.3 | 否 |
| cyber / error | none | — | 0.72 | 否 |

可见度像素测量（默认主题 running，DPR 1，页面底 `rgb(245,246,248)`）：

- 边框行亮度极差：上边框 122，下边框 104（改前不足 6）——高光肉眼可辨。
- 胶囊外 6px 带与页面底色的最大通道差：**0**，`overflow: hidden` 生效，`inset: -42rpx` 的渐变环没有溢出到胶囊外。

## 兼容性

- 纯 CSS，无 JS、无 DOM 结构变化，无新增主题变量（继续只用 `--up-primary` / `--up-success`）。
- `conic-gradient` + `color-mix` 在 H5/Chromium 已实测；App-Plus 端未验证。若目标 webview 不支持
  `color-mix`，回退是渐变段变透明，边框看起来更淡但不会破版。
- `prefers-reduced-motion` 覆盖靠既有分组，无新增媒体查询。

## 原生端复刻指引（iOS / Android）

核心是「转渐变、不转控件」：

1. 胶囊本体是圆角矩形（半径 = 高度/2），描边宽度 1pt/1dp。
2. 在胶囊下方放一个**方形**渐变层，边长取胶囊对角线以上（web 端用 `inset: -42rpx` 达到同样效果），
   填充角向渐变（iOS 无原生 conic gradient，用 `CAGradientLayer` 拼接或自绘 shader；Android 用
   `SweepGradient`）。渐变角度分布：0° 透明 → 84° 主色峰值 → 120° 成功色 → 162° 透明 → 286° 主色 54% → 360° 透明。
3. 用胶囊形状的 mask 只保留边缘 1pt/1dp 的环形区域（iOS：`CAShapeLayer` 描边作 mask；Android：
   `Canvas.clipPath` 差集或直接用 `Paint.Style.STROKE` 画 SweepGradient）。
4. 对渐变层做绕中心的匀速旋转：running 1.55s/圈，pending 2.4s/圈，matrix 主题 0.95s/圈；
   online / idle / error 不旋转（可停在固定 72° 以保持外观一致）。
5. 系统「减弱动态效果」开启时（iOS `UIAccessibility.isReduceMotionEnabled`，Android
   `Settings.Global.ANIMATOR_DURATION_SCALE == 0`）跳过旋转，只画静止渐变。

驱动条件用会话状态映射表（见上文「状态映射」），不要依赖任何主题标志位。

## 测试

新增 `tests/pages/conversation-detail/statusCapsuleDefaultTheme.spec.ts`（4 条）：

- 旋转规则挂在 `--status-running` / `--status-pending` 上且**不含** `detail-body--cyber` 前缀；
- idle / online / error 显式 `animation: none`；
- cyber 侧的独立渐变与 0.95s 加速仍在；
- `prefers-reduced-motion` 分组仍覆盖 `.input-status-wrap::before`。

源码断言挡不住层叠顺序回归，实际动画状态由上面的渲染实测兜底。
