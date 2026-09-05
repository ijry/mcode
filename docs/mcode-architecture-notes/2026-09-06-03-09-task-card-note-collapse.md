# 任务卡片副行折叠：结果摘要 / 错误栈默认两行，点击展开

## 概述

任务列表卡片的**副行**（`task-card__note`）原来把文本整段渲染出来，没有任何高度上限。
`result_summary` 与 `last_error` 都可以是几十行的长文本，于是一张 review 态的卡片能把
整屏列表挤满 —— 列表页失去了「一屏扫几条任务」的作用。

改法：副行超过两行时截断，并在下面给一行「展开 / 收起」。判定「会不会超过两行」的是一个
**纯函数按字符宽度做的估算**，不量真实 DOM 节点。

只改列表页。详情页的「结果」卡片保持全文展开 —— 那是一个专门的可滚动页面，长文本在
那里是用户想看的东西。

## 为什么不用 uview-plus 的 `u-read-more`

`u-read-more` 正是干这件事的组件，但在这个位置用不了，四条原因按严重程度排：

1. **只在 `mounted` 里量一次高度。** `init()` 只被 `mounted()` 调用，里面 `await sleep(30)`
   之后走 `$uGetRect` 拿内容高度，之后再不重量。副行的 `latest_progress` 是**边跑边变**的，
   任务从 running 到 review 时副行还会整段换成结果摘要 —— 首次挂载时是一句短进展，
   `isLongContent` 就永久停在 `false`，后面换成长摘要也不会再出现展开按钮。
2. **它的展开行是裸 `@tap`，没有 `.stop`。** `TaskCard` 整卡 `@click="emit('open')"` =
   打开详情，所以点「展开阅读全文」会顺手跳走。想绕开只能自己填 `toggle` 插槽，但插槽
   拿不到组件内部的 `status`，等于把整行重写一遍，还得靠 `@open` / `@close` 事件在外面
   影子记一份状态。
3. **默认值要逐个中和。** `showHeight` 默认 400px（副行两行才 66rpx 上下）、`textIndent`
   默认 `'2em'`（首行缩进，错误栈里很怪）、`toggle` 默认 `false`（展开后「收起」直接消失，
   再也收不回去）、`shadowStyle` 默认那层渐变写死 `#fff`，深色模式下是一道白痕。
4. 每张卡一次 `selectorQuery` + 30ms 延时，列表里成批渲染时是白花的开销。

结论：这个位置要的是「不量节点、跟着文本同步变、点击不外泄」，跟 `u-read-more` 的设计
假设正相反，所以按仓库既有的展开/折叠家法自己写。

## 实现

### 1. 判定：`taskCardNoteOverflows`（`pages/tasks/taskPresentation.ts`）

```ts
export const TASK_CARD_NOTE_CLAMP_LINES = 2
const NOTE_UNITS_PER_LINE = 56

export function taskCardNoteOverflows(text: string): boolean {
  const collapsed = text.replace(/\s+/g, " ").trim()
  if (!collapsed) return false
  return displayWidth(collapsed) > NOTE_UNITS_PER_LINE * TASK_CARD_NOTE_CLAMP_LINES
}
```

- `NOTE_UNITS_PER_LINE = 56` 的来路：750rpx 屏减页面左右各 24rpx 得卡片宽度，再减卡片
  20rpx 与副行 18rpx 的左右内距 → `750 - 48 - 40 - 36 = 626rpx`；22rpx 字号下一个半宽
  字符约 11rpx，`626 / 11 ≈ 56`。
- `displayWidth` 把 CJK / 假名 / 全角标点等算 **2 个单位**，其余算 1。按码点遍历，代理对
  不会被算成两个字符。
- 估算前先把连续空白压成一个空格：折叠态是**空白折叠**的（换行渲染成空格），缩进和空行
  不占折叠后的宽度。
- **误差方向是刻意选的**：调用方只在这个函数为真时才挂截断，所以低估 → 「不截断、不给
  按钮、文本照常显示」（退化成旧行为）；高估 → 「给了一个按钮，展开后没多出内容」。
  前者比「截断了却没法展开」轻得多，所以宁可偏小。

### 2. 卡片接线（`pages/tasks/components/TaskCard.vue`）

```ts
const noteExpanded = ref(false)
const noteCollapsible = computed(
  () => Boolean(note.value) && taskCardNoteOverflows(note.value!.text)
)
const noteClamped = computed(() => noteCollapsible.value && !noteExpanded.value)
```

```vue
<view v-if="note" :class="['task-card__note', `task-card__note--${note.tone}`]">
  <text
    :class="[
      'task-card__note-text',
      noteClamped && 'task-card__note-text--clamped',
      noteCollapsible && noteExpanded && 'task-card__note-text--expanded',
    ]"
  >{{ note.text }}</text>
  <!-- 只有这一行吃掉点击，副行文本本身仍然是「点卡片进详情」的一部分。 -->
  <view v-if="noteCollapsible" class="task-card__note-toggle" @click.stop="toggleNote">
    <text class="task-card__note-toggle-text">{{ noteExpanded ? "收起" : "展开" }}</text>
    <up-icon :name="noteExpanded ? 'arrow-up' : 'arrow-down'" size="12" :color="noteToggleIconColor"></up-icon>
  </view>
</view>
```

副行只有**三个状态**，两个 class 都由 `noteCollapsible` 把着门：

| 状态 | 条件 | 渲染 |
| --- | --- | --- |
| 短文本 | `!noteCollapsible` | 无截断、无按钮、空白折叠（= 改动前的行为） |
| 折叠 | `noteCollapsible && !noteExpanded` | 两行截断 + 「展开」 |
| 展开 | `noteCollapsible && noteExpanded` | 全文 + `pre-wrap` + 「收起」 |

`--expanded` 也要过 `noteCollapsible` 这道门：文本在展开后变短（实时进展换成一句短摘要）
时按钮会消失，这时状态必须退回「短文本」那一行，而不是留下一个没有按钮的 `pre-wrap`。

三个决定：

- **`@click.stop` 只加在展开行上。** 副行文本仍然属于「点卡片进详情」的区域 —— 卡片的
  主交互不该因为多了个折叠而缩小。这和底部动作条的做法一致（只有按钮 `.stop`）。
- **展开状态是组件本地 `ref`，不上提成 prop。** 它纯粹是这张卡的观看姿态；上提要让页面
  为每张卡记一份，还得多过一次小程序的 `setData`。列表 `v-for` 的 key 是
  `` `${connectionKey}-${task.id}` ``，实例与任务一一对应，展开状态不会滚动串卡。
- **展开按钮跟着副行语气取色**（error → `--up-error`，progress → `--up-primary`，
  否则 `--up-light-color` / `--up-tips-color`），免得在红底上出现一行看着像禁用的灰字。

### 3. 样式

```scss
.task-card__note {          // 原来是块级，现在要竖排放两个子块
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.task-card__note-text--clamped {
  display: -webkit-box;
  -webkit-line-clamp: 2;    // 必须 == TASK_CARD_NOTE_CLAMP_LINES
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.task-card__note-text--expanded {
  white-space: pre-wrap;
}

.task-card__note-toggle {
  align-self: flex-start;   // 不要 align-items，否则文本这个 flex item 不铺满
  min-height: 36rpx;
}
```

- 行截断用 `-webkit-line-clamp`，与 `ForgeIssueRow` 的两行标题同法（仓库里没有 `.nvue`
  文件，H5 / App webview / 小程序 webview 都是 Blink/WebKit 内核，这个属性可用）。
- **`white-space: pre-wrap` 只在展开态挂。** 折叠态把空白压平换信息密度（两行里塞进
  尽可能多的字，也让判定函数只需按一段连续文本估算）；展开后错误栈与分段摘要靠换行
  才读得懂。两种状态用两种 `white-space` 是有意的。
- 副行容器从块级改成 column flex，展开行 `align-self: flex-start` 让它只占内容宽度；
  **不要**在容器上写 `align-items: flex-start`，那会让副行文本这个 flex item 变成
  shrink-to-fit。

## 契约测试

- `tests/pages/tasks/taskPresentation.spec.ts` → `describe("note collapsing")`：短文本
  不折叠、60 个全宽字要折叠、同样 60 字符的 ASCII 不折叠（钉住全宽算 2 倍）、缩进与
  空行不触发折叠、`TASK_CARD_NOTE_CLAMP_LINES === 2`。
- `tests/pages/tasks/tasksPageContract.spec.ts` → `describe("card note")`：截断与展开
  按钮同源、展开行必须 `.stop`、**CSS 里的 `-webkit-line-clamp` 数字与 TS 常量逐字相等**
  （正则各抓一个数字比对）、展开状态不出现在 `defineProps` 块里。

## 原生端（iOS / Android）复刻要点

1. 副行文案的取法不变（错误 → 实时进展 → 结果摘要，见 `taskCardNote`）。
2. 原生有真正的文本测量 API（iOS `boundingRect(with:options:)`、Android
   `StaticLayout.getLineCount()`），**应该直接量**，不必抄这里的字符宽度估算 ——
   那是为了避开 uni-app 里「量节点要异步 + 文本会变」才做的折中。量出来 `lineCount > 2`
   就截断并显示展开行。
3. 折叠态：`numberOfLines = 2` / `maxLines = 2` + 尾部省略，并且把换行当空格处理
   （iOS 可在设置文本前 `replacingOccurrences` 把 `\s+` 压成空格；Android 同理）。
   展开态：不限行数，保留原始换行。
4. 展开状态存在 cell / ViewHolder **之外**（按 taskId 存一份 `Set<Int>`），否则复用会串。
   这是原生与 uni-app 的一处真实差异：Vue 的 `v-for` + key 让实例与任务绑定，原生的
   cell 是复用的。
5. 展开行的点击必须不冒泡到整卡的打开详情手势（iOS 里给展开行单独的 `UITapGestureRecognizer`
   或按钮并让 cell 的 tap 让位；Android 里 `setOnClickListener` 会自己吃掉事件）。
6. 取色同样跟副行语气走，深色模式下不要出现写死的白色/浅灰渐变。
