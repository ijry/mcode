# 流式指示器三个点与正文左对齐

## 背景

用户反馈：实时消息底部的三个点比正文往左偏了一点，要求「三个点左侧加一点点 padding 让其与内容对齐」。

## 根因

`MessageBubble.vue` 里 `.typing-dots` 与 `.part-wrap`（内含 `.part-text`）是 `.bubble` 的同级子节点，
两者共享 `.bubble` 的 `padding: 4px 6px`。但正文那一侧还多了一层内距：

```
.bubble            padding-left: 6px
  └ .part-text
      └ .up-markdown   padding: 1px 2px !important   → 文字左沿 = 8px
  └ .typing-dots   （无额外左内距）                   → 点左沿 = 6px
```

`up-markdown` 是 uview-plus 组件，那 2px 是我们自己为了压缩行距顺手加上的，`.typing-dots`
没有对应层，于是差出 2px。

## 改动

`src/components/MessageBubble.vue` 的 `.typing-dots` 增加 `padding-left: 4rpx;`（375px 宽下 1rpx = 0.5px，即 2px），
补齐 markdown 容器那层内距。其余度量（`padding-top: 8rpx` / `padding-bottom: 16rpx` / `align-items: center`）不变。

## 协议 / 数据流

无变化。三个点仅由 `message.status === 'streaming'` 驱动渲染，不涉及任何协议字段。

## UI 行为

- 流式中：三个点的最左侧圆点左沿与正文首字符墨迹左沿完全重合。
- 非流式：节点不渲染，无影响。
- 三主题（matrix / sweet / summer）只覆盖 `.dot` 的颜色，不覆盖 `.typing-dots` 的内距，因此对齐结果一致。

## 渲染实测（Chromium 375px, DPR 3）

抽取 `.bubble` / `.part-text` / `.up-markdown` / `.typing-dots` 的真实声明搭 harness 渲染，
用 `Range.getBoundingClientRect()` 量正文首字符墨迹左沿：

| 度量 | 值 |
| --- | --- |
| `.typing-dots` 盒左沿 | 16px |
| 首个 `.dot` 左沿 | 18px |
| `.up-markdown` 盒左沿 | 18px |
| 正文首字符墨迹左沿 | 18px |
| 点左沿 − 文字左沿 | **0px** |

改动前该差值为 −2px。

## 兼容性

- 纯 CSS 内距，无 JS、无 DOM 结构变化。
- 测量在 H5/Chromium 下完成；App-Plus（原生 `view`）的盒模型未实测，但 `padding-left` 属于 uni 全平台支持的基础属性，风险很低。

## 原生端复刻指引（iOS / Android）

流式指示器与正文在同一纵向容器内，容器水平内距 6pt/6dp。正文一侧若使用了 Markdown 渲染器
并给渲染容器额外加了 2pt/2dp 水平内距（我们的 web 端如此），则指示器必须补上同样的 2pt/2dp
左内距，否则会比正文左偏 2pt/2dp。更稳妥的原生做法是把这 2pt/2dp 从 Markdown 容器移除、
统一由外层容器承担，这样指示器无需任何额外内距。

## 测试

`tests/pages/conversation-detail/messageBubbleTypingDots.spec.ts` 新增
`aligns the dots with the markdown text left edge`，锁 `.typing-dots` 含 `padding-left: 4rpx;`。
源码断言只能锁声明存在，实际对齐结果由上面的渲染测量兜底。
