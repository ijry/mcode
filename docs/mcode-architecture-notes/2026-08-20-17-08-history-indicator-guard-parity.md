# 详情页历史分页：先问守卫该不该存在，再让文案与它对齐

**文件**：`2026-08-20-17-08-history-indicator-guard-parity.md`

## 两个现象，同一个类别的 bug

短时间内用户报了两次，症状不同、根因同类：

> 刚打开详情页 显示没有更多历史，过一会又变得可以加载历史了 …… 如果又其他加载中业务
> 应该体现在文案上，不能给用户错误的提示

> 为啥我试了 DEV 模式下，现在加载历史分页出现松手加载更早消息后，完全没反应网络请求里
> 也没记录

**表层类别**：指示行的状态判据与 `loadOlderTurns` 的早退守卫**不是同一套**。指示行说
「能拉」，守卫却静默 return；或指示行说「没有了」，其实只是还不知道。

**但更重要的一课在现象二**：对齐文案之前得先问那条守卫**为什么存在**。现象二里它根本
不该存在，而我的第一版修法是给一个不该有的限制配了个好看的说明。

`loadOlderTurns`（`ConversationDetailInteractivePane.vue`）的守卫是**两条**：

```ts
if (
  !hasOlderConversationHistory(historyWindow) ||
  hasVolatileHistoryRuntimeState(runtimeSession)
) return
```

而指示行原先只看第一条，且看的是它的**返回值**而不是它的两种成因。

## 现象一：窗口未知被渲染成「没有更多历史了」

`hasOlderConversationHistory` 是 `Boolean(window && window.turns_offset > 0)`，它把两件
事压成同一个 `false`：

| 真实状态 | `window` | 返回 |
| --- | --- | --- |
| 窗口还没建立，**不知道**有没有更早历史 | `null` | `false` |
| 窗口已建立，**确实**翻到底了 | `turns_offset === 0` | `false` |

于是 `ensureConversationHistoryWindow` 探测回来之前，界面给出一个**错误的结论**，而且
`exhausted` 会把 `canPull` 关掉 —— 用户连下拉验证都做不到。

`initialLoading` 挡不住它：那个标志绑的是**整页首屏** loading，而窗口探测是首屏**之后**
发出的独立请求，那时它早已是 `false`。已有的
「reports the initial sync before trusting hasMore」只覆盖了首屏那一段。

**修法**：新增 `windowKnown` 输入 + `probing` 状态（「正在确认历史范围...」）。

## 现象二：流式中显示「松手加载更早消息」，松手后毫无反应

窗口已建立、`turns_offset > 0`（`hasMore` 为真、下拉能出「松手加载」），但会话正处于
`hasVolatileHistoryRuntimeState`（流式中，或有 in-flight 用户轮次）—— `loadOlderTurns`
被**第二条**守卫静默吞掉：没有网络请求，没有任何提示。

DEV 模式更容易撞上：列表页的实时预览会预连接会话（`runLivePreviewAttach`），进详情页时
`liveMessage` / `inFlightUserTurnId` 往往还挂着。

### 第一版修法是错的：给限制加了个好看的文案

我最初加了一个 `blocked` 状态（「回复结束后可加载更早消息」）让文案与守卫对齐。用户直接
否掉了：

> 这不行吧，正在流式也应该允许加载更早消息啊

**他是对的。** 回复正在生成时想往上看历史是完全正常的需求。我把一个**实现限制**当成了
**产品契约**，然后花力气把限制描述得更清楚，而不是问它为什么存在。

### 那条守卫为什么存在：一个过度保守的指纹

追到引入它的 commit（`4fa942f feat(app): integrate phone conversation history paging`），
守卫在**两处**出现：入口早退，以及请求返回后的时效校验
`isCurrentOlderHistoryRequest`。后者当时还带一个 `historyRuntimeFingerprint`，它把
**`liveMessage.content` 整个**塞进指纹：

```ts
liveMessage: runtimeSession.liveMessage
  ? [id, isStreaming, timestamp, runtimeSession.liveMessage.content]
  : null
```

流式期间每个 delta 都会改这个指纹，所以**流式中发出的请求返回时必然被判废**。入口那道
守卫于是成了顺理成章的「既然结果注定被丢弃，不如别发」—— 两个限制互相印证，看起来像
设计，实际是一个过度保守的指纹滚成的雪球。

### 前插到底依赖什么

`prependHistoryPageTurns`（`conversationTurnIdentity.ts`）只做两件事：接到最前面、
按身份别名去重。**它完全不关心尾部有没有新增轮次** —— 流式期间尾部长多少条都不影响
前插的正确性。

真正会让前插出错的只有**窗口坐标变化**：前插位置和 `canApplyOlderHistoryPage` 的接缝
断言全都建立在 `historyWindow` 上。而窗口坐标由 `setConversationHistoryWindow` 独家维护，
流式事件一个字都不碰它。

所以时效校验只需要三条：同一会话 / 同一 session / 同一个 tab 仍激活，加上
`isSameHistoryWindow`。会话切换与窗口重锚（`resetConversationHistoryToLatest`）仍会被
前两条拦住 —— 那正是它们该拦的。

## 改动

`ConversationDetailInteractivePane.vue`：

1. 入口守卫从两条收敛成一条 —— `if (!hasOlderConversationHistory(historyWindow)) return`；
2. `isCurrentOlderHistoryRequest` 去掉 `!hasVolatileHistoryRuntimeState(...)` 与
   fingerprint 比对，只留会话身份 + `isSameHistoryWindow`；
3. 删除 `historyRuntimeFingerprint` 与 `hasVolatileHistoryRuntimeState`（随之成为死代码），
   以及 `hasVolatileRuntimeState` 的 import；
4. 新增 `historyWindowKnown` computed 传给指示器。

`detailHistoryIndicatorPresentation.ts`：

1. 新增 `windowKnown?: boolean` 输入 + `probing` 状态（现象一），默认 `!== false` 以兼容
   既有调用点；
2. `canPull` 收口为 `hasMessages && hasMore && windowKnown` —— 与收敛后的守卫逐条对应；
3. **`blocked` 状态与 `volatile` 输入在第二版中一并删除**（见上）。

### 优先级顺序里的两个刻意决定

| 决定 | 原因 |
| --- | --- |
| `probing` 排在 `loading` / `initial-loading` **之后** | 那两个状态更具体：正在拉某一页、首屏还在同步，信息量都比「正在确认范围」大 |
| `probing` 排在**手势分支之前** | 否则边缘回弹送来的一次 `dy` 会让文案变成「松手加载更早消息」，而那个请求注定发不出去 |

### 写进注释的规则（双向）

**`canPull` 必须与 `loadOlderTurns` 的早退守卫逐条对应 —— 守卫放宽时这里也要一起放宽。**
第一版只注意到「守卫新增要同步输入」这半边，于是把 `volatile` 加了进来；正确的规则是
双向的，而且**先要问守卫本身是否该存在**。

## 测试

`detailHistoryIndicatorPresentation.spec.ts`（17 → 24 例）：

- `describe("window coordinates not established yet")` 5 例：`probing` 的文案/busy/canPull；
  带 `pullDistance` 仍是 `probing`（锁「排在手势前」）；`loading` / `initial-loading` 仍优先；
  省略 `windowKnown` 行为不变；`windowKnown: true` + `hasMore: false` 仍是 `exhausted`。
- 「keeps offering the pull gesture while the conversation is streaming」：**流式中必须
  照常给手势**。用「传了 `volatile` 也没用」把它钉住 —— 指示器不再接受任何流式相关输入。
- 「keeps canPull false on the states that still report a pullable code」：盯**仍然沿用
  共享 `canPull`** 的分支（`loading` / `initial-loading` 原样透出），防 `canPull` 表达式
  漏掉 `windowKnown`。

`conversationDetailBodyContract.spec.ts`：断言入口守卫只剩一条
（`if (!hasOlderConversationHistory(historyWindow)) return;`），且代码里不再出现
`function hasVolatileHistoryRuntimeState` / `function historyRuntimeFingerprint` /
`runtimeFingerprint:`。**注释里的提及要保留**（那段说明有价值），所以断言盯的是三个真实
语法位置而不是裸函数名 —— 第一版写成 `not.toContain("hasVolatileHistoryRuntimeState")`
立刻被注释里的反引号提及误报。

**两次变异探针**：

1. 把 `canPull` 表达式改回 `hasMessages && hasMore` → 第一次**全绿**。原因是
   `probing`（当时还有 `blocked`）分支各自返回 `canPull: false`，把表达式的错误兜住了 ——
   测试测的是分支返回值，不是表达式。补了那条盯共享 `canPull` 的用例后再探针，1 条变红。
   **「探针没命中」本身就是测试无效的证据**，不是实现正确的证据。
2. 把 `hasVolatileHistoryRuntimeState` 守卫加回入口 → 契约 spec 1 条变红。
   两次探针后源文件均与改动版逐字节一致（`cmp -s` 校验）。

三道闸：jest **124 suites / 814 tests 全绿**（本轮起点 810）；`tsc --noEmit` 恰好 3 条既有
基线错误（`main.ts` 的 `App.vue`、`detailScrollState.ts` 两处），改动文件零错误；
`npx uni build` DONE，仅剩既有的 `conversationSyncService` 动静混合导入告警。

## 原生 iOS / Android 复刻要点

1. **「不知道」必须是独立状态。** `Bool hasMore` 单值驱动列表头必然复现现象一。用三态
   （Swift `enum`、Kotlin `sealed interface`）而不是 `Bool?` —— 可空布尔容易被 `?? false` 抹平。
2. **加载控件的 `isEnabled` 与头部文案必须由同一个状态机产出。** 分开算迟早分叉。
3. **每一条「不能加载」的原因都要有对应文案 —— 但先问那条限制该不该存在。** 静默 return
   在移动端更难察觉（没有控制台，用户只知道「点了没反应」），但给一个不该有的限制配文案
   只是把错误说得更清楚。本文的现象二就是这么走弯路的。
4. **流式期间必须允许翻历史。** 原生端如果用「正在生成中」当禁用条件，会复现同一个
   产品缺陷。前插只依赖窗口坐标，与尾部是否在增长无关。
5. **异步探测的延迟窗口是必然存在的，UI 必须为它准备文案**，不要指望「探测很快，用户
   看不见」——现象一正是用户在这个窗口期里看到的。
6. **在途请求的时效校验只校验它真正依赖的东西。** 把「整个实时消息内容」纳入指纹会让
   流式期间的请求永远被判废，而那种失效是静默的 —— 原生端更难发现。
7. **别在渲染层推断业务状态。** `windowKnown` 由持有 session 的那一层算好传入；
   在展示层各自判断会让这段逻辑在每个平台重写一遍，然后各自漂移。

## 相关笔记

- [[2026-08-19-14-13-conversation-detail-history-pull-refresh]] —— 这一行指示器的来历，
  以及 uni refresher 在 `enabled` 变 false 时吞掉 restore 的坑（`canPull` 变化的另一个后果）
- [[2026-08-20-10-42-detail-disjoint-tail-placement]] —— 同一个窗口三元组的另一个故障
- [[2026-08-19-05-14-conversation-detail-tail-window-only]] —— 窗口协议契约本身
