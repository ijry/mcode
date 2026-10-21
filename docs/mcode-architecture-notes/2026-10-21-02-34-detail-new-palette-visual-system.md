# 会话详情「新配色」视觉体系落地（M09）

## 背景

设计稿 `738354142530895` 的 M09「会话详情 · 新配色」（浅色 / 深色两块画板）把原来的
蓝色气泡 + 白卡片体系换成了一套更克制的中性纸面：

- 用户消息从**主色蓝气泡**改为**中性灰气泡**，靠右对齐
- AI 消息**取消气泡容器**，正文直接铺在页面上
- 运行状态从**输入区上方的胶囊条**移到**导航栏标题下方**
- 工具调用从**描边卡片 + 状态标签**改为**彩色状态点 + 一行摘要**
- 输入区三件套重绘：加号白底圆形、输入框浅灰 14px 圆角、发送键深色方形

需求是「把 mcode-app 详情页按设计稿 1:1 还原」，因此改动落在现有默认主题上，
不改动 cyber / sweet / summer 三套实验主题的形制（它们各自覆盖 `.bubble` 与面板底色）。

## 视觉规格来源

所有数值直接取自设计稿节点，不是估的：

| 元素 | 设计稿节点 | 关键值 |
|---|---|---|
| 导航栏 | `9:11` / `9:69` | 高 48、内距 12/16 |
| 标题 | `9:51` | 16px SemiBold |
| 状态胶囊 | `9:110` | 圆角 10、内距 3/8、gap 5、点 6×6 圆角 3、字 11px Medium |
| 用户气泡 | `9:34` | 内距 10/14、圆角 18/18/4/18、宽 272（≈69% 视口） |
| AI 正文 | `9:54` | 14px / 行高 20px、无容器 |
| 工具行 | `9:55` | gap 8、点 8×8 圆角 4、字 12px |
| 消息区 | `9:12` | gap 12、内距 16/16/12/12 |
| 输入区 | `9:13` | gap 10、内距 12/12/8/8 |
| 加号 | `9:22` | 44×44、圆角 22（正圆）、白底 + 6% 黑描边 |
| 输入框 | `9:23` | 44 高、圆角 14、内距 14 |
| 发送键 | `9:24` | 44×44、圆角 14、底色 #48484a |
| 底部安全区 | `9:14` | 21 高、Home 指示条 134×5 |

## 数据流与实现

### 状态胶囊迁移

`runtimeStatusLabel` / `runtimeStatusClass` 原本就在页面层（`index.vue`）算好并传给
`ConversationDetailBody` 的 `#status` 插槽。这次把同一对计算值直接消费在导航栏的
`#center` 插槽里，**没有新增数据源**、也没有改 `detailStatusPresentation.ts` 的分类逻辑。

胶囊的四种语义色沿用既有 class 名（`running` / `pending` / `error` / `idle` / `online`），
分别映射到 `--up-success` / `--up-warning` / `--up-error` / `--up-tips-color`，
深浅色跟随 uview 主题变量自动切换 —— 因此没有为深色模式单写一套色值。

`online`（已连接）与 `running` 共用绿色系，但只有 `running` 带呼吸动画：静止的「已连接」
不该一直动，否则用户无法从动效上区分「正在跑」与「连上了但闲着」。

### 气泡体系

`MessageBubble.vue` 里 `.bubble--assistant` 变成 `padding: 0` + `background: transparent`。
这不是「忘了加底色」，而是刻意的：连续多条 AI 回复各套一张白卡会把同一轮对话切成
一格格独立块，读起来像列表。角色区分改由**左右对齐**承担（用户靠右、AI 靠左）。

`.bubble-body` 的限宽从统一 `620rpx` 改为**只对用户消息限到 78%**，AI 正文占满整行 ——
设计稿里 AI 那几段文字确实顶到消息区左右内距。

### 中性色变量

`index.scss` 的 `.page` 上挂了七个局部变量：

```
--input-box-bg / --send-btn-bg / --send-btn-active-bg / --tool-toggle-bg
--tool-toggle-border / --bubble-user-bg / --bubble-user-text
--detail-paper-bg
```

浅色给白/浅灰系，`[data-up-theme='dark'] .page` 里换成 `#2c2c2e` 系
（纸面 `#000000`）。放在 `.page` 而不是 `:root`：这些是中性的「纸面部件」颜色，
其他页面的卡片仍走 `--up-card-bg-color`，不该被这里的调整影响。

**深色判据必须是 `[data-up-theme='dark']`，不能用 `prefers-color-scheme`。**
项目的深色由 uview 按用户偏好（system / light / dark）写进 `<html data-up-theme>`，
与系统设置不是同一来源：用户在 app 内手动选深色时 `prefers-color-scheme` 仍是 light，
页面会原地不动；反过来系统深色、用户选浅色时页面又会莫名变深。`index.scss` 是
scoped 样式，`:root` 会被编译成 `:root[data-v-xxx]` 从而永不命中，所以属性选择器
挂在祖先 `.page` 上。

JS 侧同源：`detailPaperBgColor` 读 `upThemeIsDark`（computed，靠主题版本号触发重算），
**不能**用 `isDarkThemeMode()` 一次性读值，否则切换主题后导航栏不跟着变。

⚠️ 注意 `--bubble-user-*` 定义在 `.page`（页面级），而 `MessageBubble` 是子组件。
CSS 变量沿 DOM 继承，组件内 `var(--bubble-user-bg, #e9e9ee)` 能取到页面上的值；
fallback 保证在独立使用该组件的场景（如 `ConversationDetailReadonlyTimeline`）也有正确外观。

深色下 `--send-btn-bg` 与 `--tool-toggle-bg` 都是 `#2c2c2e`，激活态才是 `#48484a`：
底已经压到近黑，再往暗里走就和背景糊在一起了，「未激活 / 激活」在深色里是反过来发亮的。

### 工具调用

`ToolCallBlock.vue` 新增 `toolSummaryText`：从 `input` 里挑路径/命令，拼成
「编辑 src/auth/login.ts」「运行 pnpm test login.spec.ts」这类**动词 + 目标**的短句。

为什么不用裸工具名：用户关心的是「它对我的项目做了什么」，不是适配器内部的方法名
（`Read` / `Bash` / `apply_patch`）。命令超 60 字符截断，避免一条 `bash -c` 撑满整行。

折叠态**没有容器**（无描边、无底色），展开态才加一层淡底承载代码块。
状态点四色：运行中 `#34c759`（呼吸）、完成态中性灰、待执行橙、失败红。
完成态刻意用灰而不是绿 —— 时间线里一路绿灯会抢走正文注意力。

`ToolCallGroupBlock.vue` 的摘要胶囊同步收成透明裸行（保留可点区域与按下反馈），
否则分组摘要会独自留着药丸形，与单条工具行不一致。

## 兼容性

- 三套实验主题（matrix / sweet / summer）的 `.bubble-wrap--*` 覆盖规则仍在其后生效，
  形制不变；它们覆盖的是 `background` / `border` / `box-shadow`，与本次的 `padding: 0`
  不冲突（主题自带 padding 时会覆盖）。
- 深色模式**只认** uview 的 `data-up-theme` 属性，与系统 `prefers-color-scheme` 无关；
  纸面底色由 `--detail-paper-bg` 统一供给 `.page` 与导航栏，避免顶部留一条更亮的横带。
- 移除了导航栏的 `agentLogoPath`（logo）与 `detailProjectPath || currentAgentLabel`（副标题），
  因为设计稿标题行只有标题 + 胶囊。若后续需要在导航栏恢复 agent 标识，
  应作为「标题右侧」的新元素而不是塞回副标题位。

## 原生客户端复刻指引

1. **导航栏**：标题 16pt SemiBold；下方状态胶囊高约 17pt（3pt 上下内距 + 11pt 字），
   圆角 10pt，状态点 6×6pt 圆角 3pt，点与文字间距 5pt。胶囊底色 = 状态色 12~14% alpha，
   文字 = 状态色本身（pending 时对文字做 22% 向主文字色混合以保证对比度）。
2. **气泡**：用户气泡 `padding: 10pt 14pt`，圆角 `18/18/4/18`，最大宽度 78%；
   AI 消息**不要加背景**，直接铺在 `--page-bg` 上，正文 14pt / 行高 20pt。
3. **工具行**：一行 `8×8pt` 圆角 4 的实心点 + 12pt 文字，无背景无边框；
   点击展开后才出现容器与代码块。
4. **输入区**：三个 44pt 高元素，间距 10pt，整行左右内距 12pt、上下 8pt；
   加号圆形白底、输入框浅灰 14pt 圆角、发送键深色 14pt 圆角方形。
5. **滚动区**：左右内距 16pt、上内距 12pt，消息间距 12pt。

## 附带修复

### 重连时 resume id 永远取不到

`index.vue` 原有的重连逻辑是「先 `runtime.invalidateConnection(...)`，再读
`connectionSessionManager` 里的 `externalId` 当 resume id」。但 `invalidateConnection`
内部会调 `clearConversation` 把那条 managed 记录一起清掉 —— 读的时候记录已经不在了，
resume id 恒为 `undefined`，重连实际一直在拉起**空会话**，历史看着像丢了。
同时那行 `firstString(session.value?.resumeSessionId)` 引用的字段在 `RuntimeSession`
上根本不存在（唯一的既有类型错误）。

修法：把取值提到失效**之前**，并改成从 managed 记录取
（`managed?.externalId, managed?.connection.sessionId`）。

回归测试固定在 `tests/pages/conversation-detail/detailReconnectResumeSignal.spec.ts`，
断言的是**源码里两条语句的先后顺序**。这条契约没法靠行为测试覆盖（要 mock 整个
runtime store），所以用源码顺序守卫；已验证把顺序改回错误写法时该测试会失败。

### `detailScrollState.ts` 缺失返回类型

`ScrollRestoreAction` / `ViewportSyncAction` 两个返回类型在文件里被用作类型标注，
但从未声明过（文件里一直有 `error TS2304`）。按实际返回值补成联合类型。
