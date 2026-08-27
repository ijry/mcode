# 会话列表页拆分（一）：抽纯模块与收口重复派生

**文件**：`2026-08-27-17-17-conversation-list-extract-pure-modules.md`

## 背景

`pages/conversations/index.vue` 到 4762 行，是继详情页之后第二个过大的页面组件。用户要求拆分。
按「先摸底 → 再抽纯模块 → 最后拆子组件」的顺序推进，本篇记录**抽纯模块**这一阶段（拆子组件
另开一篇）。

摸底（子代理，覆盖模板 12 区块、script 12 功能簇、13 处重复派生、style 1350 行）产出的核心
结论：**这个文件真正的债不是「行数多」，是「同一份数据/判断有多条并行实现」**。拆子组件之前
必须先把这些收口，否则边界会切在重复代码中间，越拆越乱。

本阶段分三步落地（D3 → D2 → D1），已提交为三个 commit。

## D3：两条卡片派生收口成一个纯函数【最重要】

`filteredConnectionGroups`（computed，喂渲染）与 `getDisplayCandidateCards()`（函数，喂实时
预览订阅、批量可选集、三个 watcher）此前是**两条独立派生**，各自：

- `runtime.sessions.get(...)` 读一遍运行态
- `resolveOverviewCardDisplayStatus(...)` 算一遍 displayStatus
- `shouldHideCompletedOverviewCard(...)` 做一遍隐藏过滤
- 关键词匹配做一遍（一处内联、一处走 `liveCardMatchesSearch`）

代价是两类：

**正确性**：任何判据改动必须同时改两处。漏改渲染那条只是「看不见」；**漏改候选那条会让看不见
的卡仍被订阅实时流、仍能被「全选」勾中** —— 用户于是对着界面上不存在的会话发消息。上一版靠
一条源码扫描测试（数 `shouldHideCompletedOverviewCard` 出现几次、扫两个函数体各有一次）来防它
—— **那条测试的存在本身就是「没收口」的自证**。

**性能**：单个 runtime tick 会把同一批卡遍历约 8 次（两个 watcher 各一遍、预览签名一遍、
订阅对账一遍、`Promise.all` 里 `isLivePreviewCandidateStillSelected` 按候选逐个再一遍）。

收口成一个纯函数 `buildOverviewDisplayModel()`（在 `conversationOverviewPresentation.ts`），
一次遍历同时产出 `{ groups, candidates }` 两份输出。页面里 `filteredConnectionGroups` 变成读
`.groups`、`getDisplayCandidateCards()` 变成读 `.candidates`。

**响应式挡在模块外**：`runtime.sessions` 通过 `resolveRuntimeSession(conversationId)` 回调传入，
纯模块不 import pinia、可在 jest 里裸测。

两份输出**刻意保留的差异**（都写进了模块注释与测试，否则下一个人会「统一」掉）：

| | groups（渲染） | candidates（订阅/选择） |
| --- | --- | --- |
| 结构 | 保持分组 | 展平 + `groupKey`/`instanceKey` |
| 排序 | `sortLiveSessionCardsByRunning` | 不排序 |
| 附加字段 | `livePreviewText` | — |
| 关键词 | 卡级 + **组级兜底** | 仅卡级 |

**组级兜底那条最容易写错**：搜索命中连接名（而非任何卡）时，那个组要留在列表上（否则用户
以为这台机器不存在），但它下面**一张卡都不该进 candidates**（那些卡对用户不可见，不能被订阅/
选中）。单独立了测试锁死。

## D2：展示层纯函数搬进 presentation 模块

搬进 `conversationOverviewPresentation.ts` 并顺手收口对应的重复：

- **`AGENT_LABELS`**：改引 `services/remoteSettings.ts` 的唯一实现。`codex` 的显示名由页面
  本地的「Codex CLI」统一成「Codex」，与其它页面一致（原先同一 agent 在概览和别处显示两个名字）。
- **排序不再绕道 CSS 类名**：`sortLiveSessionCardsByRunning` 原先判 `statusClass(...) === "running"`
  —— 排序隐式依赖样式修饰符的取值。新增 `isRunningOverviewCard` 直接判 `displayStatus`，并加
  「排序与 CSS 解耦」的测试。
- **关键词匹配**：从两份（内联 + `liveCardMatchesSearch`）收成一份。
- **「这张卡能不能选」收口成 `isSelectableOverviewCard`**：此前页面里有**五处**各自的判据
  （`isSelectableLiveCard`、`buildBulkSelectionItem` 里再判、`isConversationSelected` 里再判、
  `openLiveSession` 判 `!card.conversationId`、`conversationLivePreview.ts` 判 `<= 0`）。
  统一为「必须有真实会话号（正数）」—— 负数是标签卡（`tabId` 取 `-conversation.id`）的信号，
  不可选。`buildBulkSelectionItem` 在这里归一化 `agentType`（服务端可能给 `codex_cli` 别名，
  批量发送匹配连接时不归一化会失败）。
- **`formatOverviewRelativeTime`**：卡片时间戳的相对文案。解析不出来返回空串（卡片 `updatedAt`
  是可选字段），而不是 "Invalid Date"。页面保留一行 `formatTime` 薄封装，让模板与
  `formatHistoryConversationMeta` 的回调保持稳定（`historyPresentation.spec` 靠注入 stub 测试，
  不受影响）。仓库里另有几份相对时间实现（`services/circle.ts` 用「X 分钟前」带空格、粒度不同），
  **本次没有强行统一** —— 它们的文案风格是各自页面定的，合并要先对齐设计。

## D1：删死代码与内联透传

- 删三个死函数：`parseTimestamp` / `formatTimestamp`（零调用）、`syncAuthToConnectionKey`
  （结构性 no-op：`openConversation` 只在 `findConnectedConnectionByKey` 已返回 undefined 的
  else 分支里调它，而它内部用同一个 key 再查一次同一个 store，必然还是 undefined）。删它时把
  `openConversation` 的 if/else 简化成单 if。
- 内联 `toConnectionGroup`（纯透传 `{...snapshot, cards: snapshot.cards}`）进
  `buildConnectionGroupSnapshot`，注释一并挪过去。`cards: snapshot.cards` 这个字面量被
  `conversationLivePreviewLayout.spec` 钉死（防退回手动拼接），内联后仍然保留。

**没做的**：`normalizeList` / `firstString` / `connectionKey` 三个本地副本虽然与既有 export
重复，但分别有 6 / 7 / 16 处调用，且 `firstString` 的本地版返回 `string` 而 export 版返回
`string | undefined` —— 替换要逐个核对类型，风险/收益比差，留到拆子组件时顺带处理。

## 测试改写

两份源码扫描测试改成行为测试（收口之后它们的扫描前提消失了）：

- **`hideCompletedFilterWiring.spec`**：删掉「数 `shouldHideCompletedOverviewCard` 出现几次」
  「扫两个函数体各有一次」的计数断言 —— 两条派生合成一个后这些前提不成立。过滤本身的行为
  断言迁到 `buildOverviewDisplayModel` 一组（含「组级兜底不进 candidates」）。本文件只留**防
  退化**的结构断言：页面不得再自己算派生、`resolveRuntimeSession` 回调必须把响应式挡在模块外。
- **`conversationLivePreviewLayout.spec`**：排序断言不再钉 `statusClass(...) === "running"`
  字面量，改成验行为 + 一条「排序与 CSS 修饰符解耦」。

`conversationListBulkSendContract.spec` 的 `isSelectableLiveCard(card)` 字面量跟着改名成
`isSelectableOverviewCard`。

## 三道闸与探针

三个 commit 各自跑闸，最终：jest **135 suites / 998 tests 全绿**；`tsc --noEmit` 恰好 5 条
既有基线错误，改动文件零错误；`uni build` DONE。

变异探针（累计 8 次，全部命中）：D3 收口 5 次（漏组级兜底、漏排序、漏 livePreviewText、
候选未过滤、runtime 未回调）；D2 三次（可选中判据丢 `>0`、选择项不归一化 agentType、
时间解析失败退回「现在」）。

行数：`index.vue` 4762 → 4555；`conversationOverviewPresentation.ts` 51 → 约 400。

## 一次自伤（记录以备后来人）

D2 接线时用 Edit 删本地 `BulkSelectionItem` 接口，`old_string` 里连着写了 `const projects` 和
`const connectionGroups` 两行，`new_string` 漏了后者 —— 把 `connectionGroups` 的声明删掉了。
tsc 会立刻报错，但**教训是**：删一个符号时，`old_string` 的上下文里不要顺带包含**相邻但无关**
的声明行，否则一旦 `new_string` 手抄漏字就会误删。删除类编辑应让 `old_string` 精确等于要删的
那段，相邻行只作为唯一性锚点、必须原样出现在 `new_string` 里。

## 原生 iOS / Android 复刻要点

1. **一份数据有多个消费者时，用一个纯函数产出所有派生，不要每个消费者各算一遍。** 尤其当其中
   一个消费者是「不可见但仍生效」的（订阅、批量选择）—— 那种漏改不会在界面上暴露，只会让用户
   对着看不见的东西操作。
2. **响应式/平台状态通过回调传入纯模块**，模块本身不依赖框架，才能裸测、才能在多端复用。
3. **排序键不要绕道展示层（CSS 类名 / 标签文案）**。排序该直接读它真正依据的那个字段
   （这里是 `displayStatus`），否则改一个样式修饰符的取值会静默改掉排序。
4. **同一个判断（「这条能不能选」）散落多处必然漂移。** 收成一个判据，其余都读它。
5. **拆分前先收口重复，再切边界。** 边界切在重复代码中间会让每个子组件各带一份副本。

## 相关笔记

- [[2026-08-27-09-32-conversation-list-hide-completed]] —— 那次加隐藏过滤时被迫「同一道过滤写
  两处」，正是本次 D3 要收口的债；那篇的 `hideCompletedFilterWiring.spec` 在本次被改写
- [[2026-08-20-09-05-conversation-list-time-only-ordering]] —— `cards: snapshot.cards` 那条
  字面量断言的来历
- 详情页的同类清理：`refactor(app): 清掉详情页抽离 composer 后遗留的死代码`（commit ea4f11a）

## 待续

拆子组件（E 阶段）另开一篇。摸底给出的 7 个候选按风险排序：ConversationsSearchBar / Navbar
（最低）→ CreateConversationSheet（收益最大、最独立）→ GroupSection/LiveSessionCard →
HistoryPanel（状态所有权风险最高）→ Bulk 两件。其中 3 份源码扫描测试
（bulkSend / navbarHeader / detailNavigation）用 `extractBlock` 在找不到标记时会**抛异常而非
软失败**，拆分必须与测试改写同批提交。
