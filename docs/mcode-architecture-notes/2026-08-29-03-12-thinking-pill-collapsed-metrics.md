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

## 修复（含实测修正）

第一版只对齐了 `min-height` / `padding` / 字号 / 图标 / 箭头，实测后发现折叠态仍然偏高。
用 Chromium 在 375px 视口（`1rpx = 0.5px`）抽取组件真实规则测量，三次迭代如下：

| 折叠态实现 | 实测高度 | 同类摘要药丸 |
| --- | --- | --- |
| 仅对齐 min-height / padding | `72rpx` | `48rpx` |
| 补 `box-sizing: border-box` | `50rpx` | `48rpx` |
| 再补 `border: none` | `48rpx` | `48rpx` |

两个此前遗漏的关键属性：

1. `.part-thinking` 缺 `box-sizing: border-box`。默认 `content-box` 下
   `min-height: 48rpx` 只约束内容盒，上下 `10rpx` 内距与 `1rpx` 边框会额外累加，
   实际盒高变成 `48 + 20 + 2 = 70rpx`（实测 72rpx，含子元素行盒进位）。
   `min-height` 写了但等于没生效，这是第一版没量高度就提交的直接后果。
2. 折叠态需要 `border: none`。`tool-group__summary` / `subagent__summary` /
   `system-note__summary` 都是无边框药丸，思考胶囊留着 `1rpx` 边框会高出 `2rpx`。
   同时 `.part-thinking--translucent` 排在 `--collapsed` 之后且同为单类选择器，
   会把边框重新加回来，所以额外加了
   `.part-thinking--collapsed.part-thinking--translucent { border: none; }`。

展开态不受影响：`box-sizing: border-box` 本来就是它需要的，实测 `58.38rpx`
（双行推理内容）、`6px` 圆角、保留 `1rpx` 边框，形制正确。

### 度量表

折叠态改为与其它摘要药丸共用同一套度量：

| 属性 | 摘要药丸基准 | 修复前的思考折叠态 | 修复后 |
| --- | --- | --- | --- |
| `min-height` | `48rpx` | 未设 | `48rpx` |
| `padding` | `10rpx 18rpx` | 继承 `16rpx 20rpx`，仅覆盖 `padding-bottom` | `10rpx 18rpx` |
| `box-sizing` | `border-box` | 未设（默认 content-box） | `border-box` |
| 边框 | 无 | `1rpx` | `none` |
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
断言折叠态含 `min-height: 48rpx;` / `padding: 10rpx 18rpx;` / `border-radius: 999rpx;` /
`border: none;`，基础规则含 `box-sizing: border-box;`，存在
`.part-thinking--collapsed.part-thinking--translucent` 复位规则，
且折叠态**不含** `padding-bottom: 16rpx;`；同时断言 `.tool-group__summary` 与
`.subagent__summary` 保持同样的 48rpx / 10rpx-18rpx 基准。
这样任何一侧单独改度量都会红，度量漂移不会静默发生。

需要说明的局限：这些断言只能锁住 CSS 声明存在，锁不住最终盒高。
`box-sizing` 这个坑正是「声明齐全但渲染仍然错」的类型，源码断言无法发现，
只有实际渲染测量才能暴露。改动这一带样式时应当同时量一次高度。

主题覆盖（`.bubble-wrap--cyber .part-thinking` 等）只改配色与阴影，不含尺寸属性，
因此不会覆盖折叠态度量。

## 原生 iOS / Android 复刻指引

把「可展开摘要药丸」当成一个共享度量常量，而不是每个组件各写一遍：
最小高度 24pt（48rpx）、水平内距 9pt、垂直内距 5pt、全圆角、标签 11pt、
折叠箭头 6pt、前置图标 12pt。思考、工具组、子智能体、系统注记四类摘要都取它。
展开态是另一套形制（满宽、6pt 圆角、8pt/10pt 内距），切换时替换形制而非拉伸高度。

原生端注意：iOS 与 Android 的布局约束天然是「边框盒」语义，
不会出现 web 上 `content-box` 让最小高度失效的问题。但等价的坑是
给容器同时设置固有高度约束和内距时优先级冲突 —— 折叠态请直接约束容器总高 24pt，
让内距在其内部分配，而不是「内容高度 + 内距」相加。
