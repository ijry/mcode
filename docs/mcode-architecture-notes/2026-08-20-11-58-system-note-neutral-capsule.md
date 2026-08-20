# 上下文压缩提示：从橙色告警卡改成中性胶囊

**文件**：`2026-08-20-11-58-system-note-neutral-capsule.md`

## 现象（用户原话）

> 会话已压缩不要样式太难看了，应该跟普通胶囊一样

指的是详情页时间线里那条「上下文已压缩（历史摘要）」。它当时长这样：

| 属性 | 旧值 |
| --- | --- |
| 边框 | `1rpx solid var(--up-warning)` |
| 底色 | `--up-warning` 12% 兑 `--up-card-bg-color` |
| 图标 | `info-circle`，warning 色 |
| 标签 | 24rpx / `font-weight: 600` / warning 色 |
| 箭头 | `size="13"`，warning 色 |

也就是一张**橙色告警卡**。而它表达的只是「这里发生过一次上下文压缩」——纯背景信息，
不是错误、不需要用户处理。在一条全是中性气泡的时间线里，它比正文还抢眼，读起来像出了错。

## 「普通胶囊」是一个已经存在的形制

时间线上另有两个**同类**控件：可展开的中性摘要。它们早已共用一套公式：

- `ToolCallGroupBlock.vue` 的 `tool-group__summary`（`:121-138`）
- `SubagentCapsuleBlock.vue` 的 `subagent__summary`（`:203-230`）

公式逐条如下，system-note 现在**照抄**：

```scss
min-height: 48rpx;
padding: 10rpx 18rpx;
border-radius: 999rpx;
background: color-mix(in srgb, var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6)) 60%, var(--up-card-bg-color, #ffffff) 40%);
display: flex;
align-items: center;
align-self: flex-start;   /* 不撑满整行 —— 胶囊宽度跟着文字 */
max-width: 100%;
gap: 10rpx;
box-sizing: border-box;
```

半透明变体（详情页设了背景图时）：
`color-mix(in srgb, var(--up-card-bg-color, #ffffff) 36%, transparent 64%)`。

标签 22rpx / `line-height: 1.2` / `--up-content-color`、**常规字重**；箭头
`up-icon size="12"` + `--up-light-color`。

**无边框是这套形制的定义性特征**，不是省略。见
[[2026-08-17-tool-call-group-summary-style]]：「基础摘要和半透明变体均不绘制边框，
以保持与无边框 assistant 气泡一致的视觉层级」。所以这次不是「把橙色换成灰色」，
是**把边框一起去掉**——留着边框会让它仍然比两个兄弟控件重一档。

展开后的正文沿用 `subagent__body` 的公式：`padding: 16rpx`、`border-radius: 18rpx`、
`--up-card-bg-color` 82% 兑透明、`1rpx` 的 `--up-border-color` 62% 兑透明边框。
正文**有**边框是对的：它是一块内容容器，不是胶囊。

## 没有正文时退化成一枚纯胶囊

摘要正文可能是空的（只有前缀、或 part 里没有可取的文本），此时旧代码仍然渲染一个箭头，
点下去什么都不发生。新增 `systemNoteHasBody`，箭头、`--tappable`（`:active` 反馈）、
`v-if` 的正文三者共用它：

```ts
const systemNoteHasBody = computed(() => systemNoteText.value.length > 0)

function toggleSystemNote() {
  if (!systemNoteHasBody.value) return
  systemNoteExpanded.value = !systemNoteExpanded.value
}
```

这条规则同样是抄来的 —— `SubagentCapsuleBlock.vue:3-7` 的注释：**挂一个点不开的箭头
比不挂更糟**。守卫写在 `toggleSystemNote` 里而不是只靠模板的 `v-if`，是因为整枚胶囊都是
点击区（`@click` 在 `__summary` 上），箭头消失不等于点击区消失。

## 主题覆盖：不能复用 `.bubble-wrap--cyber :deep(...)`

**这是本次唯一容易写错的地方。**

`MessageBubble.vue` 里 `.system-note`（`:13`）与 `.bubble-wrap`（`:42`）是
**`v-if` / `v-else` 的一对兄弟节点**。三份主题覆盖列表挂在 `.bubble-wrap` 上：

```scss
.bubble-wrap--cyber :deep(.tool-group__summary),
.bubble-wrap--cyber :deep(.tool-block),
...
```

往这些列表里加 `.system-note__summary` 会写出一条**永不命中**的规则 —— system-note
不在 `.bubble-wrap` 的子树里。而它现在的底色来自 `--up-hover-bg-color`，是**亮色**，
在 matrix 主题（面板 `rgba(0, 20, 7, 0.54)`、正文 `rgba(186, 255, 200, 0.88)`）下
会留下一块刺眼的亮斑。

所以主题类挂在 system-note 自己的根上：

```vue
<view
  v-if="isSystemMessage"
  :class="[
    'system-note',
    detailTheme !== 'default' && `system-note--theme-${detailTheme}`,
  ]"
>
```

对应三份覆盖（`.system-note--theme-matrix|sweet|summer`），配色数值直接取自各主题
已有的面板/文字色，**只改配色、不改形制**：圆角、内距、字号、字重继续由基础规则统一。

顺带说明为什么不需要 `!important`：`.bubble-wrap--cyber :deep(...)` 那几条要用
`!important` 是因为它们要压过**子组件内部**的 scoped 规则；这里覆盖的是同一个文件里的
同级 scoped 规则，特异性（两个类 > 一个类）已经够了。

## 改动清单

`mcode-app/src/components/MessageBubble.vue`：

1. 模板 —— 结构改为 `system-note__summary` / `system-note__body`；去掉 `info-circle`
   图标；箭头由 size 13 warning 色改为 size 12 `--up-light-color` 并加 `v-if`；
   根节点加 `system-note--theme-*`。
2. `<script setup>` —— 新增 `systemNoteHasBody` 与带守卫的 `toggleSystemNote()`。
3. 样式 —— `.system-note*` 整块重写（药丸公式 + `--translucent` + `--tappable:active`），
   新增三份主题覆盖。

未改动的既有逻辑：`isSystemMessage`（`role === "system"`）、`systemNoteText`
（把 `text` / `thinking` part 用 `\n\n` 拼接）、`systemNoteLabel`（按
`CONTEXT_CONTINUATION_PREFIX` 判定是否压缩摘要）、默认收起。判定与取文本的口径一个字没动
——这次纯粹是表现层。

## 测试

`tests/pages/conversation-detail/detailToolCallStatusStyles.spec.ts` 新增
「renders the context-compaction system note as the same neutral pill」，与该文件既有的
`tool-group__summary` 断言并列（同一处形制契约放在同一个 spec 里，改一个会看到另一个）：

- `.system-note__summary` 规则里有 999rpx 圆角、`--up-hover-bg-color` 混色、
  `align-self: flex-start`，且**没有** `border:`、没有 `--up-warning`；
- `.system-note__label` 是 22rpx + `--up-content-color`，且**没有** `font-weight`；
- 箭头是 `--up-light-color` 且带 `v-if="systemNoteHasBody"`，源码里不再有
  `name="info-circle"`；
- 主题类挂在自己根上（`system-note--theme-${detailTheme}` 出现、`:deep(.system-note`
  **不**出现），三个主题各有 `__summary` 与 `__label` 覆盖。

**变异探针**：把基础规则的底色换回 warning 混色并加回 `1rpx solid var(--up-warning)`
→ 该条变红，其余 3 条绿。探针后源文件与改动版 `Get-FileHash` 一致。

三道闸：jest **122 suites / 791 tests 全绿**（基线 790）；`tsc --noEmit` 恰好 3 条既有
基线错误（`main.ts` 的 `App.vue`、`detailScrollState.ts` 两处缺失类型），改动文件零错误；
`npx uni build` DONE，仅剩既有的 `conversationSyncService` 动静混合导入告警。

> 全量首次跑时 `tests/pet/petMotionEngine.spec.ts:224` 红过一次。那条测试靠 30 次随机
> 抽样命中 `stretch-yawn`（`:214-221`），本身是概率性的，与本次改动无关：单独重跑 3 次
> 22/22 全绿，全量重跑 791/791 全绿。**它是个 flaky 测试，值得单独修**（给引擎注入
> 可控随机源，而不是靠重试次数）。

## 原生 iOS / Android 复刻要点

1. **压缩提示属于「中性摘要」这一类，不是告警。** 原生端如果按语义选控件，容易挑到
   系统的 warning/banner 组件（iOS 的黄色 notice、Android 的 `Snackbar`/警示卡），
   那会重现这个问题。它该复用「可展开的工具调用摘要」那个组件。
2. **把这套胶囊做成一个可复用组件，而不是三处各写一遍。** 工具组、子智能体、压缩提示
   在原生端也是三处；本次问题的根源正是「形制没有单一来源」。
3. **无边框要作为组件契约写下来。** 原生端默认的 chip/pill 往往自带描边
   （Android `Chip` 的 `chipStrokeWidth`、SwiftUI `Capsule().stroke`），必须显式清零，
   否则视觉层级又会比正文重一档。
4. **没有正文就不要渲染可交互的展开控件**，并且**点击区**也要一起禁用 —— 不只是隐藏箭头。
   原生端的整行点击区比 Web 更容易残留。
5. **主题覆盖要挂在这条提示自己的容器上。** 原生端如果按「气泡」这一类批量套主题，
   压缩提示同样会被漏掉（它不是气泡）。检查方式：每个主题都实际渲染一次带压缩提示的会话，
   而不是只看气泡。
6. **展开后的正文与胶囊要用不同形制**：正文有边框有较小圆角（内容容器），胶囊无边框
   全圆角（标签）。两者用同一套装饰会让展开后看起来像两层卡片套嵌。

## 相关笔记

- [[2026-08-17-tool-call-group-summary-style]] —— 这套胶囊的原始契约，含「不画边框」
  的理由
- [[2026-07-03-p58-thinking-block-ux]] —— 时间线里另一类可折叠块（思考），它**保留**
  warning 配色，因为那是刻意的语义区分
