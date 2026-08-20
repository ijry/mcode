# 会话列表：一条列表、纯按时间排序

**文件**：`2026-08-20-09-05-conversation-list-time-only-ordering.md`

## 现象（用户原话）

> 会话列表 24H 顺序似乎不对，比如 5 分钟前的排在了 4 天前后边

修复方向也是用户定的：

> 不管打开中的标签，只按时间来吧

## 两个独立成因

「顺序不对」不是一个 bug，是两个。只修一个，列表仍然是乱的。

### 成因 ①：标签组整体钉在前面，且组内排序不看时间

`pages/conversations/index.vue` 渲染的是一个**扁平** `v-for`，数据来自：

```ts
cards: [...snapshot.openTabCards, ...snapshot.recentActiveCards]
```

两组各自有序、拼起来却无序：

| 组 | 排序键 | 是否看时间 |
| --- | --- | --- |
| `openTabCards` | `isActive` → `tabId` | **否** |
| `recentActiveCards` | 活跃时间降序 | 是 |

于是一个 4 天前打开的 PC 标签占据首位，下面才是按时间排好的 24H 会话。用户看到
「5 分钟前」排在「4 天前」后面 —— 而 4 天前那张卡**根本不可能**来自 24H 组
（它过不了 `>= now - 24h` 的过滤），只可能来自标签组。这是定位这个 bug 的关键线索。

模板里两组之间**没有任何分隔或小标题**，所以用户无从知道前排那张卡是「因为它是标签」。

### 成因 ②：排序字段与显示字段的第一优先级是**反的**

同一张卡的时间被解析了两次，各写一份：

| 用途 | 优先级 |
| --- | --- |
| 排序（`getConversationActivityTimestamp`） | `last_message_at` → `lastMessageAt` → `updated_at` |
| 显示（卡片上的 `updatedAt`） | `updated_at` → `last_message_at` → `lastMessageAt` |

一个**只改过标题/状态**的会话（`updated_at` 很新、`last_message_at` 很旧）于是显示成
「刚刚」却排在几天前那批后面。反过来也成立。这一条与成因 ① 叠加，且**修掉 ① 之后依然存在** ——
它是纯粹的字段选择错误，与分组无关。

> 值得记的一点：这两处代码本身都「对」，是**两份实现**这件事错了。所以修法不是改其中一处的
> 优先级，而是让两者物理上不可能分叉。

## 改动

### 1. 顺序收敛到 `services/` 的一个函数

`conversationOverviewSnapshot.ts` 新增 `cards` 字段：`openTabCards + recentActiveCards`
合并后过 `sortOverviewCardsByActivity`，**纯按活跃时间降序**。页面只透传：

```ts
function toConnectionGroup(snapshot: ConnectionConversationSnapshot): ConnectionGroup {
  return { ...snapshot, cards: snapshot.cards }
}
```

`openTabCards` / `recentActiveCards` **保留**，但语义降级为「这张卡是哪来的」，不再表达顺序。
不删是因为既有测试与去重逻辑（`openedConversationIds`）都建立在这两个集合上。

**合并而不是二选一。** 4 天前的标签不在 24H 窗口里，只渲染 `recentActiveCards` 会让它
整张消失 —— 用户要的是「别插队」，不是「别显示」。

### 2. `activityAt`：排序键上卡

排序在纯模块里做，就必须把时间戳带在卡片上（页面侧的 `formatTime` 吃的是字符串）。
`ConversationOverviewCard` 因此新增 `activityAt: number`，与 `updatedAt` 一起由**同一次**
`resolveConversationActivity` 产出。

### 3. `resolveConversationActivity`：一次遍历同时定数值与文案

统一优先级为 `last_message_at → lastMessageAt → updated_at`。选它而不是反过来：会话列表
表达的是「最近聊过什么」，消息时间才是用户心里那个时间；`updated_at` 只作兜底
（会话刚建好还没发言时它是唯一的时间）。

**必须是一次遍历、返回同一个字段的两种形态**：

```ts
for (const value of [last_message_at, lastMessageAt, updated_at]) {
  if (typeof value !== "string" || !value.trim()) continue
  const parsed = new Date(value.trim()).getTime()
  if (!Number.isFinite(parsed)) continue
  return { at: parsed, label: value.trim() }   // ← 同一个 value
}
```

分成两次遍历（`firstString(...)` 定文案 + `parseTimestamp(...)` 定数值）会在
**「字段存在但解析不出时间」**时再次分叉：`firstString` 把那串垃圾当文案显示，
而 `parseTimestamp` 已经跳过它去用下一个字段排序。这正是成因 ② 的同型 bug，
只是触发条件更窄 —— 修法必须堵住类别，不是堵住那一个实例。

顺带处理一个类型谎言：这三个字段类型上是 `string`，但数据来自远端网关，历史上出现过
数值 epoch（`parseTimestamp` 的签名 `Array<string | number | undefined>` 就是证据）。
数值分支归一成 ISO 串再显示，否则那种会话的时间戳会变成空白。

### 4. `isOpenTab`：顺序让位后，身份必须落到角标上

顺序原先是「这个会话在 PC 上开着」的**唯一**信号 —— 卡片上没有任何标记，`isActive`
在整个页面里除了类型声明之外**零引用**。纯按时间排序之后，这个信息就彻底消失了。

所以新增显式字段 `isOpenTab`，模板里渲染一枚「标签」角标：

```html
<text v-if="card.isOpenTab" class="live-card__tab-flag">标签</text>
```

**不要用 `tabId > 0` 反推。** 最近活跃卡片的 `tabId` 是 `-conversation.id`，靠符号区分是个
没写下来的隐式契约，改一次 id 生成方式就静默失效。

### 5. 空态文案

`"暂无打开中的标签会话"` → `"暂无打开中或 24 小时内活跃的会话"`。原文案只提标签，
而这个空态在「有标签但无 24H 活跃」和「两者都没有」时都会出现。

## `sortLiveSessionCardsByRunning` 为什么不用改

页面侧还有一层排序：运行中的卡片提到最前（`index.vue`）。它的 tiebreak 是**原始下标**，
所以它**保留**传进来的顺序而不是覆盖它 —— 修完之后语义自动变成「运行中优先，其余按时间」。

这也意味着：**它挡不住成因 ① 复发**。把 `toConnectionGroup` 改回拼接，这个函数会老老实实
把错误顺序传下去。所以那条源码断言（`cards: snapshot.cards`）是唯一的防线。

保留「运行中优先」是刻意的：用户说的「只按时间」针对的是标签身份不该插队，而
「正在跑」是**当下**的状态、且卡片上有转圈动效呼应，把它提前与「按时间」的意图不冲突。

## 无时间戳的卡片沉底

标签还没关联会话（`conversation_id` 为空）时拿不到任何时间。让它们参与数值比较会与
「1970 年」混在一起，且相对顺序随输入顺序抖动。`sortOverviewCardsByActivity` 用
`map((card, index) => ...)` + 下标 tiebreak 保证稳定，`activityAt = 0` 自然沉底。

用下标而非 `tabId` 做 tiebreak，是因为这个函数要对**混合**列表成立：两组的 `tabId`
一正一负，直接比会把最近活跃卡片全排到标签前面 —— 又一次用符号表达语义。

## 原生 iOS / Android 复刻要点

1. **排序键与显示文案必须来自同一次解析**，返回一个值对象（Swift `struct` /
   Kotlin `data class`）而不是两个各自取字段的函数。这是本文两个成因里更隐蔽的那个：
   它不分组、不插队，只是让列表在某些会话上「看起来没排序」。
2. **不要靠位置表达身份。** 「打开中的标签」要有可见标记；一旦顺序改成纯时间，
   原先靠位置传递的信息会静默消失。
3. **身份要有显式布尔字段**，不要用 id 的符号/正负反推。
4. **合并两个来源，而不是二选一**：窗口外的标签仍要出现在列表里。
5. **多层排序时确认 tiebreak 是稳定的**（保留输入顺序），否则外层排序会覆盖内层的时间序。
6. 混合列表的 tiebreak 用**数组下标**，不要用来源相关的 id。

## 测试

- `tests/services/conversationOverviewSnapshot.spec.ts`（4 → 8 例），新增
  `describe("cards ordering")`：
  - 成因 ①：4 天前的标签 + 5 分钟前的会话 → `["刚聊过", "老标签"]`；
  - 合并而非二选一：24H 窗口外的标签仍出现在 `cards` 里、且 `isOpenTab === true`；
  - 成因 ②：`updated_at` 新而 `last_message_at` 旧的会话排在后面，**且**显示的字符串
    等于排序用的那个字段（同时断言 `updatedAt` 与 `activityAt`）；
  - 无时间戳的标签沉底且按 `tabId` 稳定定序。
- `tests/pages/conversations/conversationLivePreviewLayout.spec.ts`（+2 例）：
  `cards: snapshot.cards` 出现、`[...snapshot.openTabCards, ...snapshot.recentActiveCards]`
  **不**出现（防成因 ① 复发）；`isOpenTab` 角标接线 + 主题变量而非硬编码色值。

**已确认不是空测**：临时把 `cards` 改回拼接 → 4 条新增里 3 条变红；单独把
`resolveConversationActivity` 的优先级改回 `updated_at` 优先 → 恰好「排序与显示同源」
那一条变红，其余全绿。两次探针后源文件与改动版逐字节相同（`diff` 校验）。

全量：122 suites / 784 tests 通过（基线 778）；`tsc --noEmit` 维持 3 条既有基线错误
（`main.ts` 的 `./App.vue`、`detailScrollState.ts` 两条），改动文件零错误；
`npx uni build` 通过（`conversationSyncService` 的动静混合 import 警告为既有问题）。

## 相关笔记

- [[2026-07-05-p65-conversation-list-live-stream-preview]] —— 同一张卡片上的实时预览行，
  以及「运行中优先」那层排序的来历
- [[2026-07-12-conversation-list-pet-sessions-refresh]] —— 会话列表的刷新与缓存路径
- [[2026-08-19-18-32-conversation-detail-local-turn-cache-toggle]] —— 会话**摘要**不受
  本地缓存开关管辖，正是为了让这个列表离线时不空白
