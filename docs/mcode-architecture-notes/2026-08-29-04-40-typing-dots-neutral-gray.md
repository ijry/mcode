# 流式指示器三个点改走灰色系

## 背景

用户要求：「实时消息三个点灰色系不用蓝色系」。

此前（`674a6c8`）为了解决「点太淡看不见」，把点色从 `--up-border-color` 改成了强调色
`--up-primary`（蓝）。可见度是解决了，但三个点是「还在生成」的弱状态提示，用主色会抢注意力，
而且和用户气泡的主色块撞色。

## 候选灰阶实测（Chromium，白色气泡底，动画谷值 opacity 0.45）

只从 uview 运行时主题现有的灰阶变量里挑，不新增 `--mcode-*` 别名：

| 变量 | 色值 | 峰值对比度 | 谷值对比度 |
| --- | --- | --- | --- |
| `--up-border-color` | `#dadbde` | —（改动前就因太淡被否） | — |
| `--up-tips-color` | `#909193` | 3.15 | 1.58 |
| `--up-primary`（改动前） | `#2979ff` | 3.98 | 1.80 |
| **`--up-content-color`（采用）** | **`#606266`** | **6.11** | **1.98** |
| `--up-main-color` | `#303133` | 13.02 | 2.54 |

选 `--up-content-color`：它是灰阶里唯一比原先的蓝**更清楚**的（峰值 6.11 vs 3.98），
同时不像 `--up-main-color` 那样黑得像正文，仍然读作弱提示。
`--up-tips-color` 排除的理由是峰值 3.15 已经低于改动前的蓝，等于回退到「看不清」。

## 改动

`src/components/MessageBubble.vue` 的 `.dot`：
`background-color: var(--up-primary, #2979ff)` → `var(--up-content-color, #606266)`。

尺寸（12rpx）、`@keyframes blink`（谷值 0.45）、`.typing-dots` 的内距全部不变。

## 主题覆盖不受影响

`.dot` 的灰色只是默认值，三个主题各自的覆盖仍然生效，且都仍在可见区间：

| 主题 | 点色 | 峰值 | 谷值 |
| --- | --- | --- | --- |
| default | `#606266` | 6.11 | 1.98 |
| matrix (cyber) | `#00ff41` | 13.70 | 3.62 |
| sweet | `#db2777` | 4.49 | 2.02 |
| summer | `#e11d48` | 4.58 | 2.10 |

主题侧保留彩色是刻意的：那三套主题本身就是强视觉风格，点色是风格的一部分；
「不要蓝色系」针对的是默认主题里那个和主色撞车的蓝。

## 协议 / 数据流

无变化。

## UI 行为

流式中三个点呈中性灰、循环明暗闪动；盒高与位置完全不变（实测 `.typing-dots` 仍为 36rpx，
点距气泡下沿 25.2rpx，与改动前一致）。

## 兼容性

- 只换一个颜色变量，无结构变化。
- `--up-content-color` 是 uview 运行时主题表里的既有变量，暗色模式会自动跟随，无需额外处理。
- 测量为 H5/Chromium；App-Plus 端未实测，但 `background-color` + CSS 变量是全平台基础能力。

## 原生端复刻指引（iOS / Android）

三个点用中性灰 `#606266`（对应设计系统的「次要文字色」，暗色模式取同一 token 的暗色值），
不要用品牌主色。直径 6pt/6dp，间距 4pt/4dp，明暗动画 opacity 在 0.45↔1.0 之间循环、
周期 1.2s、三点依次延迟 0 / 0.2 / 0.4s。若产品有 matrix / sweet / summer 之类的强风格主题，
点色按主题覆盖，但需保证在各自气泡底色上峰值对比度不低于 4.4。

## 测试

`tests/pages/conversation-detail/messageBubbleTypingDots.spec.ts` 的
`uses a neutral gray the dots are actually visible in`（原 `uses an accent color...`）：
断言 `.dot` 不含 `--up-primary` / `--up-tips-color` / `--up-border-color`，且含
`var(--up-content-color, #606266)`。对比度结论由上面的渲染测量兜底。
