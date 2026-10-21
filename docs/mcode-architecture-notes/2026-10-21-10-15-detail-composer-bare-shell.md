# 会话详情输入区对齐设计稿（M09 / M10）

## 背景

上一轮按 M09 把详情页整体换成中性纸面后，输入区还留着一层**外壳卡片**：
`.input-wrap` 自带 76% 白底、描边、30rpx 圆角、内距与投影，外层又叠了 16rpx 横向内距。
设计稿里根本没有这一层 —— 三件套是直接铺在纸面上的。表现为：

- 屏幕上多出一圈设计稿不存在的「输入区卡片」，与无容器的 AI 正文、裸工具行不协调；
- 外层 16rpx + 内层 `input-main-row` 的 12px 两层内距叠加，输入框比设计稿窄；
- 发送键有两档颜色（未激活 `#c7c7cc` / 激活 `#48484a`），而设计稿六张画板只有一档。

状态胶囊（输入区上方那条）**保持不动**，这是本轮明确的范围约束。

## 设计稿取值

| 元素 | 节点 | 关键值 |
|---|---|---|
| 输入区整行 | `9:13` / `9:71` / `9:153` / `9:310` | 无填充、无描边、无圆角；gap 10、内距 12/12/8/8 |
| 加号按钮 | `9:22`（浅）/ `9:80`（深） | 44×44、圆角 22（正圆）；浅色白底 + 6% 黑描边，深色 `#2c2c2e` + 8% 白描边 |
| 加号图标 | `9:37` / `9:95` | 18×18 框，笔画 10.8；浅色 `#48484a`，深色 `#e5e5ea` |
| 输入框 | `9:23` / `9:81` | 高 44、圆角 14、内距 14；浅色 `#e5e5ea`，深色 `#2c2c2e` |
| 占位文字 | `9:38` / `9:96` | 14px；浅色 `#8a8a8e`，深色 `#98989e` |
| 发送键 | `9:24` / `9:82` | 44×44、圆角 14、`#48484a`（两版同值） |
| 发送图标 | `9:39` / `9:97` | 18×18 框，笔画 8.4×10.5，白色 |
| 状态条 | `9:290` | gap 8、内距 14/14/6/6（**不在本轮改动范围**） |

## 实现

### 1. 外壳做成开关，而不是改基础样式

`ConversationDetailBody` 新增 `bareComposer` 开关，`index.vue` 传
`:bare-composer="detailTheme === 'default'"`。

三套实验主题（matrix / sweet / summer）自带各自的卡片形制与光效，直接改基础样式会把它们
一起改掉；而这些主题的覆盖规则都写在基础规则**之后**且带两个类（`.page--cyber .input-wrap`
之类），开关式新增的 `.input-wrap--bare`（单类）权重更低，不会反向污染它们。

```scss
.input-wrap--bare {
  background: none;
  border: 0;
  border-radius: 0;
  padding: 0;
  box-shadow: none;
  backdrop-filter: none;
}
```

六个属性必须一起归零 —— 只清背景会剩一圈描边，只清描边会剩一张半透明底板，
都还是「卡片」。`padding` 归零是关键的第二个修正：整行的 12/12/8/8 由
`input-main-row` 单独负责，两处都写会让实际留白是设计稿的两倍。

### 2. 移除外层内联卡片样式

原来 `index.vue` 往这层传 `:input-wrap-style="upThemeCardStyle"`，而
`upThemeCardStyle` 是**内联 style**（uview 的 computed，给卡片用的白底/边框/圆角）。
内联样式优先级高于 class，`--bare` 的 `background: none` 会被它压过，形制永远生效不了。
所以整条 `inputWrapStyle` 数据线（页面 → pane → body）一并删掉，换成布尔开关。

### 3. 发送键只留一档颜色

设计稿 M09 / M10 的四个发送键节点（`9:24` / `9:82` / `9:167` / `9:322` / `9:475`）
取色全是 `#48484a`，连输入框里只有占位文字时也一样。所以
`--send-btn-bg` 与 `--send-btn-active-bg` 统一为 `#48484a`，深色版同样。

原实现的两档色（`#c7c7cc` → `#48484a`）在屏幕上是两个不同的键，会让人以为
「没内容时发送是禁用的」——但实际点下去仍会触发（空内容由业务层拦）。

### 4. 图标取色必须走 JS，不能走 `upThemeVar`

`upThemeVar('--tool-toggle-icon')` 是**错的**：它只查 uview 自己的 `theme.vars` 与
`config.color`，读不到挂在 `.page` 上的自定义 CSS 变量，会静默返回 fallback。
深色模式下就会拿到浅色值，图标在黑底上消失。

改为 computed `composerIconColor`，判据用 `upThemeIsDark`（uview mixin 的 computed，
靠 `upThemeVersion` 触发重算）。**不能用 `isDarkThemeMode()` 一次性读值** —— 用户切主题后
图标不会跟着变。

### 5. 发送图标尺寸 22 → 18

设计稿图标框是 18×18（`9:39` / `9:97`），旧实现写的是 22，在 44 的键里显得顶格。

## 未改动

- **状态胶囊**（`.input-status-row` 及 `.input-status-wrap` 的整条链路）：本轮明确要求保留。
- `.composer-stack` 的 `bottom: calc(env(safe-area-inset-bottom) + 10rpx)` 与
  安全的占位高度：与安全区相关，不属于设计稿的视觉参数。
- 三套实验主题的输入区形制。

## 验证

- 新增 `tests/pages/conversation-detail/detailComposerMatchesDesign.spec.ts`（7 条）。
  三个关键断言都做过**变异验证**：
  - 删掉 `--bare` 的 `padding: 0` → 第 1 条失败；
  - 把浅色 `--send-btn-bg` 改回 `#c7c7cc` → 配色断言失败
    （首次写法切块范围过大、把深色块也吞进去，导致变异未捕获，已修正切块边界）；
  - 把 `: composerIconColor` 换回 `upThemeVar('--tool-toggle-icon')` → 取色断言失败。
- 详情页 37 套件 / 340 用例通过。
- `uni build`（H5）`DONE Build complete`，产物核对：
  - `input-wrap--bare[data-v-…]{background:none;border:0;border-radius:0;padding:0;box-shadow:none;backdrop-filter:none}`
  - `.page` 浅色块与深色块内 `--send-btn-bg: #48484a`

## 原生客户端复刻指引

输入区整行**不要有共同容器**（无底色/描边/圆角/阴影）：

1. 容器：横向排列，间距 10pt，左右内距 12pt、上下 8pt。
2. 加号：44×44pt 正圆；浅色白底 + 6% 黑描边，深色 `#2C2C2E` + 8% 白描边；
   图标 18pt，浅色 `#48484A`、深色 `#E5E5EA`。
3. 输入框：高 44pt、圆角 14pt、左右内距 14pt；浅色 `#E5E5EA`、深色 `#2C2C2E`；
   占位 14pt，浅色 `#8A8A8E`、深色 `#98989E`。
4. 发送键：44×44pt、圆角 14pt、**恒为** `#48484A`（不区分有无内容），箭头 18pt 白色。
