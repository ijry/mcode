# 思考胶囊折叠态高度对齐摘要药丸

承接 `2026-08-29-03-07-conversation-retry-target-and-theme-surfaces.md`。
上一轮只修了展开态形制（满宽 + 12rpx 圆角），折叠态仍然偏高，本篇补齐。

## 问题

`.part-thinking`（基础规则）的 `padding: 16rpx 20rpx` 是给展开态卡片用的。
折叠态 `.part-thinking--collapsed` 只覆盖了 `padding-bottom: 16rpx`，
等于把卡片内距留在了药丸上，所以收缩后的思考胶囊比同一条消息里的
工具组摘要、子智能体摘要、系统注记明显高一截，几枚胶囊高低不齐。

次要因素：思考图标 30rpx、标签 24rpx 且没有约束 `line-height`、箭头 13 号，
这三项都比同类药丸大，进一步顶高了行盒。

## 修复

折叠态改为与其它摘要药丸共用同一套度量：

| 属性 | 摘要药丸基准 | 修复前的思考折叠态 | 修复后 |
| --- | --- | --- | --- |
| `min-height` | `48rpx` | 未设 | `48rpx` |
| `padding` | `10rpx 18rpx` | 继承 `16rpx 20rpx`，仅覆盖 `padding-bottom` | `10rpx 18rpx` |
| `border-radius` | `999rpx` | `999rpx` | `999rpx` |
| 标签字号 | `22rpx` / `line-height: 1.2` | `24rpx`，无 line-height | `22rpx` / `1.2` |
| 折叠箭头 | `size="12"` | `size="13"` | `size="12"` |
| 前置图标 | 约 24rpx | `30rpx` | `24rpx` |

基准来自 `ToolCallGroupBlock.vue` 的 `.tool-group__summary`、
`SubagentCapsuleBlock.vue` 的 `.subagent__summary`、
`MessageBubble.vue` 的 `.system-note__summary`。
折叠态另加 `justify-content: center`，因为 `.part-thinking` 是
`flex-direction: column`，单行内容需要在 48rpx 盒内垂直居中。

展开态 `.part-thinking--expanded` 不变，仍是满宽 + `12rpx` 圆角 + `16rpx 20rpx` 内距。
两态是不同形制，不是同一盒子的高度动画。

## 回归约束

`detailToolCallStatusStyles.spec.ts` 新增
"keeps the collapsed thinking pill on the shared summary pill metrics"：
断言折叠态含 `min-height: 48rpx;` / `padding: 10rpx 18rpx;` / `border-radius: 999rpx;`，
且**不含** `padding-bottom: 16rpx;`；同时断言 `.tool-group__summary` 与
`.subagent__summary` 保持同样的 48rpx / 10rpx-18rpx 基准。
这样任何一侧单独改度量都会红，度量漂移不会静默发生。

主题覆盖（`.bubble-wrap--cyber .part-thinking` 等）只改配色与阴影，不含尺寸属性，
因此不会覆盖折叠态度量。

## 原生 iOS / Android 复刻指引

把「可展开摘要药丸」当成一个共享度量常量，而不是每个组件各写一遍：
最小高度 24pt（48rpx）、水平内距 9pt、垂直内距 5pt、全圆角、标签 11pt、
折叠箭头 6pt、前置图标 12pt。思考、工具组、子智能体、系统注记四类摘要都取它。
展开态是另一套形制（满宽、6pt 圆角、8pt/10pt 内距），切换时替换形制而非拉伸高度。
