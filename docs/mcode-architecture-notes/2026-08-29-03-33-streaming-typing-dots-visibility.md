# 流式指示器（typing dots）底部留白与可见度

涉及文件：`mcode-app/src/components/MessageBubble.vue`、`mcode-app/tests/pages/conversation-detail/messageBubbleTypingDots.spec.ts`

## 背景

实时消息（`message.status === 'streaming'`）在气泡底部渲染三个闪烁的点。用户反馈两个问题：
点紧贴气泡下沿、颜色太淡看不出来。

## 架构

指示器是 `MessageBubble.vue` 里一段纯静态结构，不经过任何 store 或协议字段，唯一输入是
`message.status`：

```
<view v-if="message.status === 'streaming'" class="typing-dots">
  <view class="dot" /> x3
</view>
```

因此这次改动是**纯样式**改动，没有协议/数据流变化。三个点的动画由 `@keyframes blink`
驱动，`.dot:nth-child(n)` 各错开 0.2s 形成波浪。

## 改动内容

`.typing-dots`

| 声明 | 变化 | 原因 |
| --- | --- | --- |
| `align-items: center` | 新增 | 点尺寸变化时不再随 flex 默认 stretch 抖动 |
| `padding-bottom: 16rpx` | 新增 | `.bubble` 自身只有 `4px 6px` 内距，点原本几乎贴着下沿 |

`.dot`

| 声明 | 变化 | 原因 |
| --- | --- | --- |
| `width` / `height` | 10rpx → 12rpx | 10rpx 在动画谷值再乘 `scale(0.8)` 只有 8rpx 实绘，太小 |
| `background-color` | `var(--up-border-color, #dadbde)` → `var(--up-primary, #2979ff)` | 边框色是分割线级别的浅灰，在气泡背景上几乎不可见 |

`@keyframes blink` 谷值 `opacity: 0.3` → `0.45`：0.3 配浅色点等于「有近一半时间是隐形的」。

主题覆盖色加深（`.bubble-wrap--theme-sweet .dot` / `--theme-summer .dot`）：

| 主题 | 旧色 | 新色 | 旧峰值对比度 | 新峰值对比度 |
| --- | --- | --- | --- | --- |
| sweet | `#f472b6` | `#db2777` | 2.59 | 4.49 |
| summer | `#fb7185` | `#e11d48` | 2.62 | 4.58 |

cyber 主题（`#00ff41` on `rgba(0,24,9,.72)`）峰值 13.7，不需要动。

## 实测（Chromium via playwright，375px 视口，1rpx = 0.5px）

抽取组件真实 CSS 规则渲染，并把动画冻结在谷值帧（`animation-play-state: paused`）测量：

| scope | dots 盒高 | padding-bottom | 布局点径 | 谷值实绘点径 | 谷值对比度 | 峰值对比度 | 点底→气泡底 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| default | 36rpx | 16rpx | 12rpx | 9.6rpx | 1.80 | 3.98 | 25.2rpx |
| cyber | 36rpx | 16rpx | 12rpx | 9.6rpx | 3.62 | 13.70 | 25.2rpx |
| theme-sweet | 36rpx | 16rpx | 12rpx | 9.6rpx | 2.02 | 4.49 | 25.2rpx |
| theme-summer | 36rpx | 16rpx | 12rpx | 9.6rpx | 2.10 | 4.58 | 25.2rpx |

对比度按 WCAG 相对亮度算，半透明气泡背景以「包裹层实色 + 气泡 alpha 合成」近似。谷值对比度
偏低是动画的设计意图（点会亮灭），判断可见度应看峰值。

## 兼容性

- 所有测量都是 Chromium / H5 的结果。uni 原生端（App-Plus）的 `view` 盒模型与 `box-shadow`
  行为**未验证**，若原生端点位偏移需单独复核。
- 主题覆盖规则排在基础 `.dot` 之后且只改 `background-color` / `box-shadow`，基础规则改尺寸
  与动画不会被主题吃掉，反之主题色也不会被 `--up-primary` 覆盖。
- `--up-primary` 是 uview 运行时主题变量，深色模式下会跟随主题表切换，无需额外适配。

## 原生端复刻指引（iOS / Android）

指示器 = 一个水平容器 + 三个圆点，`streaming` 状态时显示：

- 容器：水平排列，居中对齐，点间距 8rpx（≈4pt @375），上内距 8rpx，**下内距 16rpx**
- 圆点：直径 12rpx（≈6pt @375），全圆角
- 颜色：默认取主题强调色（对应 `--up-primary`）；cyber `#00ff41` + 外发光，
  sweet `#db2777`，summer `#e11d48`
- 动画：1.2s 无限循环 ease-in-out。0% / 80% / 100% 为 `opacity 0.45 + scale 0.8`，
  40% 为 `opacity 1 + scale 1.0`。三点分别延迟 0s / 0.2s / 0.4s
- 选色规则：在目标气泡背景上峰值对比度需 ≥ 4.0，否则加深色值而不是提高谷值透明度

## 测试

`mcode-app/tests/pages/conversation-detail/messageBubbleTypingDots.spec.ts`（5 条）锁源码
契约：底部留白存在、点色不是边框色、谷值不低于 0.45、三主题覆盖仍在、sweet/summer 用加深后
的色值。**注意**：源码字符串断言只能锁 CSS 声明存在，锁不住渲染盒高与实际可见度 —— 后者靠
上面的 Chromium 测量兜底，改样式时应重跑测量而不是只看测试绿。

`rule(selector)` 抽取器用 `\n${selector} {` 锚定行首，否则 `.dot {` 会先匹配到
`.bubble-wrap--cyber .dot {`。

全量：143 suites / 1097 tests 通过。
