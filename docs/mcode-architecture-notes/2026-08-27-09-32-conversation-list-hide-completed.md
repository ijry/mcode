# 会话列表隐藏已完成会话

**文件**：`2026-08-27-09-32-conversation-list-hide-completed.md`

## 现象（用户原话）

> 会话列表应该过滤状态为已完成的会话

## 一、先纠正一个前提：`completed` 几乎筛不到东西

调查后向用户确认过这一点，最终**仍按原话只挡 `completed`**，但必须把成因记下来，否则以后会有人反复来问「怎么过滤没效果」。

mcode 里「跑完的会话」写的状态是 **`pending_review`**（`conversationSyncService.ts` 的
`markSummaryPendingReview` 硬编码），列表上显示「待处理」。

`completed` 只有两个来源：

1. 远端 `status` 字段直接给的；
2. 用户在详情页手动标记（`conversation-detail/index.vue` 的状态选单）。

realtime 那张映射表（`conversationSummaryStatus.ts:31-42`）**永远不产出 `completed`** ——
`idle` / `connected` / `disconnected` 一律落到 `pending_review`。

所以这个过滤实际能挡住的是「远端明确说完成」和「你手动标过」的那些。**这是用户选的范围**，
不是遗漏。想连「跑完躺着」一起清掉的话，要把 `pending_review` 也加进去 —— 但那条边界很危险，
见下。

### 为什么不顺手把 `pending_review` 也挡掉

`pending_review` 是「刚跑完、等你看结果」。藏掉它等于让一个**有新结果待查看**的会话从列表上
消失 —— 用户的第一反应会是「我的会话丢了」。`failed` / `cancelled` 同理：那两种可能还需要重试，
藏起来就找不到入口了。

这条已用测试锁死（`shouldHideCompletedOverviewCard("pending_review", true) === false`），并做过
变异探针：把 `pending_review` 加进过滤 → 立刻变红。

## 二、最大的坑：可见卡片有两处独立派生

`pages/conversations/index.vue` 里算「哪些卡可见」的地方有**两条并行的路**，各自独立算一份
`displayStatus`：

| 派生 | 类型 | 喂给谁 |
| --- | --- | --- |
| `filteredConnectionGroups` | computed | 模板渲染 |
| `getDisplayCandidateCards()` | 函数 | 实时预览订阅签名、批量可选集、三个 watcher |

**只在第一处过滤，界面上看不见的卡仍然会被订阅实时流、仍然能被「全选」勾中** —— 用户于是
对着一个看不见的会话发消息。这类 bug 不报错，手测也很难发现（要开着批量选择 + 有已完成会话
才会撞上）。

所以两处都加了同一道过滤，并写了一条**源码扫描契约测试**
（`tests/pages/conversations/hideCompletedFilterWiring.spec.ts`）把它钉死：把过滤从第二处摘掉
（模拟「只改渲染那条」的漏接）→ 2 条变红。这条测试沿用
`conversationLivePreviewLayout.spec.ts` 的同款手法（那条防的是排序退回拼接写法）。

## 三、判据必须是 `displayStatus`，不是 `card.status`

`resolveOverviewCardDisplayStatus`（`conversationOverviewPresentation.ts:1`）会用 runtime 状态
覆盖 summary 状态：正在跑时提升成 `in_progress`，runtime 报错时降成 `failed`。

所以一个**状态是 `completed` 但此刻正在跑**的会话（用户手动标了完成、随后又发了消息），
`displayStatus` 是 `in_progress` —— 那种会话绝不能藏。用 `card.status` 判就会把它藏掉。

过滤因此必须放在 `.map()` 算完 `displayStatus` **之后**的 `.filter()` 里，而不是放进
`buildConnectionConversationSnapshot`（那一层拿不到 runtime，只有 summary 原值）。

> 这一条修正了我最初的设计判断：原本打算把过滤放进 `conversationOverviewSnapshot.ts` 的纯函数
> 里「一处生效」，但那层结构上不可能看到 `displayStatus`。放对层比放在一处更重要。

归一化与 `resolveOverviewCardDisplayStatus` 共用同一个 helper —— 状态串来自服务端且**不是封闭
枚举**（`normalizeConversationSummaryStatus` 会原样透传未知值），两边不同源的话 `" Completed "`
这类漂移写法会绕过过滤。探针验证：去掉归一化 → 1 条变红。

## 四、默认开的开关，归一化方向与默认关的相反

新建 `services/conversation/hideCompletedConversationsPreference.ts`，形制照
`localTurnCachePreference.ts`，但**默认值相反**（默认隐藏）。

于是归一化方向也必须反过来：

| | 默认 | 判据 |
| --- | --- | --- |
| `localTurnCachePreference` | 关 | 只有严格 `true` 算开 |
| `hideCompletedConversationsPreference` | **开** | **只有严格 `false` 算关** |

**这是默认开的开关最容易踩的坑**：`uni.getStorageSync` 在键不存在时返回**空串**，用
truthy/falsy 判的话空串会被当成「用户关掉了」，默认值于是静默失效 —— 用户从没动过开关，
列表却不过滤。

探针验证：把 `value !== false` 改成 `Boolean(value)` → 2 条变红。这次探针是三次里最有价值的
一次，因为这个错误在真机上表现为「默认值好像没生效」，极难归因。

两边都会**回写归一化后的布尔量**，让存储里永远是干净的 `true`/`false`，后续读取不再依赖
normalize 的宽容度。

## 五、开关放哪、连带要改的空态文案

开关是搜索行右侧一枚胶囊（`eye-off` / `eye` 图标 + 「已完成」），形制与搜索框同款（半透明 +
毛玻璃 + 全圆角），这样它读起来是搜索行的一部分而不是飘在旁边的按钮。搜索框加
`flex: 1; min-width: 0`，否则 `up-search` 的默认 100% 宽度会把胶囊挤出屏幕。

**两处空态文案必须跟着改**，否则「有会话、只是全被过滤掉」时会显示错误的原因：

| 位置 | 原文案 | 改后 |
| --- | --- | --- |
| 分组内 | 「暂无打开中或 24 小时内活跃的会话」 | 开着过滤时 → 「没有进行中的会话；已完成的已隐藏，可点上方『已完成』查看」 |
| 整页 | 「暂无分组会话」 | 有关键词 → 「没有匹配的会话」；开着过滤 → 「已完成的会话已隐藏…」 |

「24 小时内活跃」那句在过滤造成的空列表上是**错的**，会让用户以为会话丢了。

第三处（「添加文件夹」引导卡）判据是 `cards.length === 0 && projects.length === 0`，而
`projects` 不参与过滤，所以有文件夹的分组永远不会误显示引导卡 —— **本来就是对的，没动**。

第四处（`showSelectionEntry`）走 `filteredConnectionGroups`，自动跟着过滤，也不用动。

## 六、切换时要重新对账实时订阅

`toggleHideCompletedConversations` 里调了 `scheduleLivePreviewReconcile()`。

可见卡集合变了 → 订阅集合就要跟着变。不调这一步，**刚被取消隐藏的会话不会开始订阅实时流**，
它的预览文案会一直空着，看起来像「这个会话没在跑」。契约测试锁了这一条。

偏好在 `onMounted` **和** `onShow` 两处都读：列表页是 tabBar 页面，`onMounted` 只跑一次，
只在那里读的话从别处改了偏好回来不生效。

## 测试

`conversationOverviewPresentation.spec.ts` 新增 `describe("hiding completed cards")` **6 例**：
开着时藏 `completed`；`pending_review` / `in_progress` / `failed` / `cancelled` / `unknown` /
空串全部保留；关着时不藏任何东西；**由 displayStatus 驱动所以正在跑的不被藏**；大小写与空格
归一化。

`hideCompletedConversationsPreference.spec.ts`（新）**6 例**：默认隐藏；两个值都能持久化；
**只有严格 `false` 算关**（空串 / `0` / `"false"` 都退回默认）；回写归一化布尔量；纯模块无
SQLite 依赖。

`hideCompletedFilterWiring.spec.ts`（新，源码扫描）**5 例**：两处派生都有过滤（分段查，
防「3 次调用全挤在一处」）；只用 `displayStatus` 不用 `card.status`；偏好在 mount 与 show
都读；切换时重新对账订阅；空态文案不再硬编码 24h 那句。

**变异探针（4 次，全部命中）**：

- 把 `pending_review` 也加进过滤 → 1 红；
- 去掉状态归一化 → 1 红；
- 默认开的开关改成 truthy 判断 → 2 红；
- **从第二处派生摘掉过滤（模拟只改渲染那条）→ 2 红**。

每次探针后源文件均 `diff -q` 字节一致。

三道闸：jest **134 suites / 948 tests 全绿**（基线 933，新增 15）；`tsc --noEmit` 恰好 5 条既有
基线错误，改动文件零错误；`./node_modules/.bin/uni build` DONE。

> 过程中一次自伤：用 Edit 分步改 `showSelectionEntry` 时先删了 `if (showHistoryPanel.value)
> return false` 那行准备重写，中途换了插入点，差点把这个守卫弄丢。之后用 `git diff` 确认它
> 没出现在 diff 里才继续。**分步编辑同一个函数时，中途改主意就要回头核对整个函数体**，
> 不能只看新加的部分。

## 原生 iOS / Android 复刻要点

1. **先确认目标状态在你的系统里真的存在。** 「过滤已完成」听起来直白，但 mcode 跑完的会话是
   `pending_review` 而不是 `completed`。照字面实现会做出一个几乎没有效果的开关。
2. **`pending_review`（待处理）不要一起藏。** 它是「有新结果等你看」，藏掉等于让用户以为会话
   丢了。`failed` / `cancelled` 同理 —— 它们可能还需要重试入口。
3. **过滤判据用「叠加了运行态之后的显示状态」，不是数据库里的原值。** 否则「标过完成但此刻
   正在跑」的会话会被藏掉。这决定了过滤只能放在运行态合并之后那一层。
4. **可见集合如果有多处派生，过滤必须全部覆盖。** 本次是渲染 + 订阅/批量选择两处；漏一处的
   症状是「看不见的会话仍被订阅、仍能被全选」，不报错、手测难发现。加一条源码级契约测试比
   写注释有效。
5. **默认开的开关，归一化只认严格 `false` 为关。** 存储读不到时返回空串，truthy 判会让默认值
   静默失效。这与默认关的开关（只认严格 `true`）是镜像关系，不能照抄。
6. **过滤造成的空列表要换文案。** 沿用「暂无 24 小时内活跃会话」这类原因描述，会把「被过滤了」
   误报成「没有数据」。
7. **切换过滤后要重新对账实时订阅**，否则新出现的卡不会开始接收实时更新。
8. **偏好要在页面每次可见时重读**，不能只在首次挂载时读（tabBar 页面只挂载一次）。

## 相关笔记

- [[2026-08-20-09-05-conversation-list-time-only-ordering]] —— 同一个列表页；那次的
  「两处派生分叉」是排序（`cards: snapshot.cards` vs 手动拼接），本次是过滤，同型问题
- [[2026-08-27-01-22-running-send-interception-and-native-steering]] —— 同样用变异探针发现
  「读起来像在防御、实际是死代码」的写法

## 待观察

- **历史面板不做状态过滤**（`historyPresentation.ts`），这是有意的 —— 它正是「回看已结束会话」
  的入口，本次开关的兜底就靠它。但它目前**没有任何提示**告诉用户「被隐藏的会话在这里」，
  空态文案里那句「可点上方『已完成』查看」指的是取消隐藏，不是去历史面板。两条路都能到，
  文案只提了一条。
- **`pending_review` 的语义偏差是更值得修的问题。** 用户直觉里「跑完了」就是「完成」，而系统
  用两个状态表达它。真正的修法可能是把状态标签改清楚（「待查看」而不是「待处理」），或者
  在过滤开关上提供第二档（「隐藏已完成和已查看的」）。本次没做。
