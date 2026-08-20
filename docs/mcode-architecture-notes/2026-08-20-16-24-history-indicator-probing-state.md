# 详情页：「窗口坐标未知」不能渲染成「没有更多历史了」

**文件**：`2026-08-20-16-24-history-indicator-probing-state.md`

## 现象（用户原话）

> 我发现这次出问题时刚打开详情页 显示没有更多历史，过一会又变得可以加载历史了，
> 什么原因呢，如果又其他加载中业务应该体现在文案上，不能给用户错误的提示

最后一句是这次改动的验收标准：**不确定的时候要说「还在确认」，不能给一个错误的结论。**

## 根因：一个布尔背了两种语义

「能否往上翻页」的唯一依据是 `hasOlderConversationHistory`
（`detailHistoryPaging.ts`）：

```ts
return Boolean(window && window.turns_offset > 0)
```

它把两件完全不同的事情压成同一个 `false`：

| 真实状态 | `window` | 返回 |
| --- | --- | --- |
| 窗口还没建立，**不知道**有没有更早历史 | `null` | `false` |
| 窗口已建立，**确实**翻到底了 | `{ turns_offset: 0, … }` | `false` |

而指示器的兜底分支直接把 `false` 当成后者
（`detailHistoryIndicatorPresentation.ts` 原 `:141-148`）：

```ts
return { code: "exhausted", text: "没有更多历史了", canPull: false }
```

于是刚进详情页、`ensureConversationHistoryWindow` 还没返回的那段时间里，界面给出一个
**错误的结论**。探测回来后 `turns_offset > 0`，文案才变成「下拉或上滑加载更早消息」——
这就是「过一会又变得可以加载」。

### 为什么 `initialLoading` 挡不住

指示器早就有一条 `initial-loading` 分支，注释里甚至写明了「首屏同步时窗口坐标可能还没
建立，`hasMore` 因此是 false 却不代表真的没历史」。但它绑的是 `props.initialLoading`
—— **整页首屏 loading**，而窗口探测是首屏**之后**发出的独立请求
（`ensureConversationHistoryWindow`，由 `loadConversation` 的热运行时分支或自愈 watcher
触发）。那时 `initialLoading` 早已是 `false`。

已有的那条测试（"reports the initial sync before trusting hasMore"）覆盖的是首屏那一段，
盖不住探测那一段。**同一个 bug 的两个触发时机，只堵了一个。**

### 比文案更严重的一层

`exhausted` 还会 `canPull: false`，它绑到 `scroll-view` 的 `refresher-enabled`。
所以用户不仅看到错误的结论，**连下拉验证的手段都被拿走了** —— 只能等，或者退出重进。

## 改动

新增 `windowKnown` 输入与 `probing` 状态，插在 `initial-loading` 之后、手势分支之前：

```ts
// 窗口坐标还没建立：既不能说「可以翻页」，更不能说「没有更多历史了」。
if (!windowKnown) {
  return {
    code: "probing",
    visible: true,
    text: "正在确认历史范围...",
    busy: true,
    retryable: false,
    canPull: false,
  }
}
```

四个刻意的决定：

| 决定 | 原因 |
| --- | --- |
| 新增**显式输入**而不是在模块内推断 | 纯模块拿不到 `session`。把「窗口是否存在」作为参数传进来，语义就落在调用点：`historyWindowKnown = session.value.historyWindow != null` |
| 省略时按 `true` 处理（`input.windowKnown !== false`） | 未知状态必须显式声明才生效。默认 `false` 会让所有既有调用点悄悄变成 `probing` |
| 排在 `loading` / `initial-loading` **之后** | 那两个状态更具体：正在拉某一页、或首屏还在同步，都比「正在确认范围」信息量大 |
| 排在**手势分支之前** | 否则边缘回弹送来的一次 `dy` 会让文案变成「松手加载更早消息」，而那个请求发不出去（`loadOlderTurns` 第一道守卫就是 `hasOlderConversationHistory`） |

`canPull: false` 是对的，不是保守：窗口未知时下拉必定被守卫早退，给了手感也只是空拽。
这与 `exhausted` 的 `canPull: false` 出发点不同 —— 一个是「拉了没用」，另一个是
「没有更多了」，但对 `refresher-enabled` 的结论一致。

**探测链本身没有改。** 自愈 watcher（`index.vue:3203-3227`）已经覆盖了三个「窗口停留在
null」的洞（流式中早退、`inFlightUserTurnId` 早退、上次网络失败），它是完整的；问题从来
不是「探测不发」，而是**探测必然有延迟**，而那段延迟被渲染成了错误的结论。

## 测试

`tests/pages/conversation-detail/detailHistoryIndicatorPresentation.spec.ts` 新增
`describe("window coordinates not established yet")`，5 条：

1. `windowKnown: false` → `probing` + 「正在确认历史范围...」+ `busy` + `canPull: false`；
2. 带 `pullDistance: 200` 仍是 `probing`（锁死「排在手势之前」）；
3. `loadingOlder` / `initialLoading` 仍然优先（锁死「排在那两个之后」）；
4. 省略 `windowKnown` 时行为不变（`exhausted` / `ready`）；
5. `windowKnown: true` + `hasMore: false` → 仍是 `exhausted`（真正翻到底那条路没被误伤）。

`conversationDetailBodyContract.spec.ts` 增加两条源码断言：`windowKnown:
historyWindowKnown.value` 已接线、`historyWindowKnown` 的定义是
`session.value.historyWindow != null`。

**变异探针**：删掉 `probing` 整个分支 → 新增 5 条里恰好 2 条变红（`probing` 判定与
手势优先级），其余 3 条本就该绿。探针后源文件 `Get-FileHash` 与改动版一致。

三道闸：jest **124 suites / 815 tests 全绿**（基线 810）；`tsc --noEmit` 恰好 3 条既有
基线错误（`main.ts` 的 `App.vue`、`detailScrollState.ts` 两处），改动文件零错误；
`npx uni build` DONE，仅剩既有的 `conversationSyncService` 动静混合导入告警。

## 原生 iOS / Android 复刻要点

1. **「不知道」必须是一个独立状态，不能用「没有」代替。** 原生端如果用
   `Bool hasMore` 单值驱动列表头，必然复现这个 bug。用三态
   （Swift `enum HistoryRange { case probing, available, exhausted }` /
   Kotlin `sealed interface`）而不是 `Bool?` —— 可空布尔仍然容易被 `?? false` 抹平。
2. **异步探测的延迟窗口是必然存在的，UI 必须为它准备一个文案。** 不要指望「探测很快，
   用户看不见」——本次现象正是用户在这个窗口期里看到的。
3. **加载态的优先级顺序是需求，不是实现细节。** 更具体的加载态（正在拉第 N 页）压过
   更笼统的（正在确认范围），笼统的压过手势反馈；手势反馈绝不能出现在「拉了也发不出
   请求」的状态上。
4. **文案与手势可用性必须同源。** 原生端下拉控件的 `isEnabled` 与头部文案要由同一个
   状态机产出，分开算迟早分叉（本次 `canPull` 与 `text` 都来自同一个返回值）。
5. **别在渲染层推断业务状态。** `windowKnown` 由持有 `session` 的那一层算出来传进去；
   在展示层去 `historyWindow != null` 会让这段逻辑散落到每个平台各写一遍。

## 相关笔记

- [[2026-08-19-14-13-conversation-detail-history-pull-refresh]] —— 这一行指示器的来历，
  以及 uni refresher 在 `enabled` 变 false 时吞掉 restore 的坑
- [[2026-08-20-10-42-detail-disjoint-tail-placement]] —— 同一个窗口三元组的另一个故障：
  接缝认不出时的拼接方向
- [[2026-08-19-05-14-conversation-detail-tail-window-only]] —— 窗口协议契约本身
  （30→230 对齐溢出、`1..=500` clamp）
