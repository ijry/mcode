# 详情页「加载更早历史」：窗口自锁 + 行内下拉指示器

**文件**：`2026-08-19-14-13-conversation-detail-history-pull-refresh.md`

> 2026-08-30 更新：热运行时 / SQLite 水合入口现在都会立即请求最新尾窗详情并建立
> `historyWindow`，不再把独立窗口探测作为正常入口路径。下面关于
> `shouldForceRemoteTurnReconcile`、首次进入不对账、以及探测“绝不覆盖 localTurns”的描述
> 只保留为历史背景；当前复刻请以
> `2026-08-30-23-21-history-window-entry-refresh.md` 为准。

## 现象（用户原话）

> 无法下拉加载分页的历史消息啊并且顶部的上滑加载更早消息不应该固定应显示在列表上方
> 且更剧下拉、加载中、无历史消息等状态显示

拆成两个互相独立的缺陷：

1. **翻不动**：进详情后「加载更早」永远没反应（窗口自锁 + 上滑判定符号写反）。
2. **指示行位置与状态都不对**：它 `position: fixed` 浮在第一条消息上面，而且
   四个状态分支最后全落到空字符串；根本没有下拉手势。

---

## 缺陷一：`historyWindow` 停在 null 造成的自锁

### 链路

会话列表页为了实时预览会**预连接**流式会话。带着热运行时进详情页时，
`loadConversation` 走分支 ①（`index.vue:3379` 的 `hasHotRuntime`），
它只在 `shouldForceRemoteTurnReconcile` 为真时才去对账 —— 首次进入为假。

结果：`localTurns` 里有轮次（预览攒下的尾部两三条），`historyWindow` 却是 `null`。

而 `hasOlderConversationHistory(null)` 为 false → 「加载更早」不可用 →
翻页是当时**唯一**的另一个写窗口方 → **自锁**，且不会报错，看起来就是「没有更多历史」。

> 注：曾一度以为本地缓存水合会兜住这个洞。实际不会 —— `hasHotRuntime` 在
> `index.vue:3379` 于 SQLite 读之**前**算出，而那次读取被 `if (!input.hasHotRuntime)`
> 挡住。冷启动确实能建窗口，热运行时进入不能。

### 修法一：`resolvePreservedTurnsWindow(null, tail)` 必须返回 `null`

原本返回 `tailWindow`，这是**潜伏的数据损坏**。窗口的语义是
「`localTurns[0]` 在整个会话里的全局下标」，而这条分支恰恰**不碰** `localTurns`。

具体错法：`localTurns` 实际是第 198~200 条，尾窗 `turns_offset` 是 170。采纳它就等于
宣称 `localTurns[0]` 是第 170 条。点一次「加载更早」拉回 140~169 接到 198 前面，
**中间 170~197 被静默跳过**；而 `canApplyOlderHistoryPage` 用的是同一个错坐标，
断言照样通过 —— 没有任何报错，只是历史里凭空缺一段。

返回 `null` 的代价只是这一轮先不显示能否翻页，之后由探测恢复。

### 修法二：主动探测 + 自愈 watcher

`ensureConversationHistoryWindow`（`index.vue:3144`）在窗口为 null 时无条件探测一次
尾窗，**只取窗口三元组**，绝不覆盖 `localTurns`（此刻内存里可能正有流式内容 /
待回答卡片，整体赋值会把它们抹掉）。

四道守卫，缺一个都会出问题：

| 守卫 | 缺了会怎样 |
| --- | --- |
| `if (input.runtimeSession.historyWindow) return` | 每次进详情白发一个尾窗请求 |
| `if (hasVolatileRuntimeState(...)) return` | 流式中记下尾窗坐标 → 就是上面那种静默错位 |
| `historyWindowProbeConversationIds.has(...)` | watcher 与 `loadConversation` 并发发出多个相同请求 |
| `session !== input.runtimeSession \|\| session.historyWindow` | 覆盖掉期间由别的路径建好的窗口 |

自愈 watcher（`index.vue:3198`）补三个「窗口停在 null」的洞：

1. 热运行时分支进来时**正在流式** —— 探测当场因 `hasVolatileRuntimeState` 早退。
2. `reconcileRemoteTurnsAfterLocalHydrate` 因 `inFlightUserTurnId` 早退。这是
   `hasRenderableRuntimeState`（**不看**该字段）与 `hasVolatileRuntimeState`（看）
   两个谓词字段集不一致造成的缝隙，原先没有任何补救路径。
3. 上一次探测网络失败。

watcher 只管当前激活的会话 —— 窗口只在用户看得见的 tab 里才有意义。

### 修法三：上滑判定的符号写反了

uni 的 `scroll-view` 里 `deltaY = lastScrollTop - scrollTop`，**向上滑是正值**
（uni 自己的 `scrolltoupper` 判定用的就是 `lastScrollTop - scrollTop > 0`，
见 `uni-h5.es.js:14376`）。

原代码写 `deltaY < 0`，语义恰好反了：只在「已经贴顶还继续往下滑」时才触发。
于是连续上滑加载**从未生效**，只剩 `@scrolltoupper` 在干活 —— 而它是**边沿触发**，
在阈值内静止后不会复发，用户感觉列表卡住了。两条都要保留：贴顶那一下靠边沿触发，
惯性滚动靠 `deltaY` 分支。

---

## 缺陷二：指示行重做

### 为什么必须用 `scroll-view` 自己的 refresher

页面级下拉在详情页是**不可能**的，三层锁着：

- `pages.json:26-30` `enablePullDownRefresh: false`
- `.page { overflow: hidden; overscroll-behavior: none }`
- `.detail-container { position: fixed; inset: 0 }`

后两条被 `conversationDetailBodyContract.spec.ts:499-514` 钉住（「只有 scroll-view
能滚」是详情页布局的既有契约）。所以手势只能来自 `scroll-view` 的 `refresher-*`。
改造前全仓库**零** `refresher-*` 使用。

### uni refresher 契约（逐条读 `node_modules/@dcloudio/uni-h5` 确认；App-Plus 渲染器 API 面相同）

| 事实 | 出处 | 为什么重要 |
| --- | --- | --- |
| `refresher-threshold` 单位是 **px**，不是 rpx | `:14079` 直接写进 `style.height`；`:14612` 直接和 `pageY` 差值比较 | 按 rpx 填会让阈值差一倍 |
| `refresher-default-style="none"` 才渲染 `refresher` 插槽 | `:14290` | 任何其它值都是 uni 自带的绿色 SVG 转圈 |
| `refresher-triggered` 是**受控** prop | `:14650` watcher：`true`→refreshing，`false`→restore | uni 自己**永不**收回 refreshing 态 |
| `_setRefreshState` 开头 `if (!props.refresherEnabled) return` | `:14481` | **本次最大的坑**，见下 |
| `refresherrefresh` 只在松手且 `refresherHeight >= threshold` 时发 | `:14612` | 所以 `pulling` 回调里**不该**触发请求 |
| `refresherpulling` 不会补发 `dy = 0` | `:14586` 要求 `refresherHeight > 0` | 手势结束必须自己归零，否则文案永远停在「松手加载」 |

### 那个坑：enabled 与 triggered 的翻转顺序

`refresher-enabled` 绑的是 `historyIndicator.canPull`，它随 `hasMoreHistory` 变化 ——
**这次加载恰好翻到底时就会变 false**。而 `loadOlderTurns` 内部有 `await nextTick()`，
等它返回时该 prop 早已刷成 false。此时再置 `triggered = false`，restore 会被
`_setRefreshState` 第一行直接吞掉：

- `refreshState` 永远停在 `"refreshing"`；
- 闭包里的 `beforeRefreshing` 永远为 true（`:14320`，`useScrollViewLoader` 作用域）。

后果不是「转圈不停」这么轻。之后一旦重新有历史可翻（切会话、
`resetConversationHistoryToLatest`），`Refresher` 会带着 refreshing 态挂回来：
顶部凭空多出一条阈值高度的空白；`__handleTouchMove` 走 `beforeRefreshing` 分支
不再发 `refresherpulling`，`__handleTouchEnd` 也不再发 `refresherrefresh` ——
**下拉彻底失效且不可恢复**。

修法：加一个 `historyRefresherActive` 在整个下拉生命周期内强行按住 enabled：

```ts
:refresher-enabled="
  Boolean(active && (historyIndicator.canPull || historyRefresherActive))
"
```

```ts
historyRefresherActive.value = true;
historyRefresherTriggered.value = true;
try {
  await loadOlderTurns();
} finally {
  historyPullDistance.value = 0;
  historyRefresherTriggered.value = false;  // 此刻 enabled 仍为 true，restore 进得去
  await nextTick();                          // 等 restore 落地
  historyRefresherActive.value = false;      // 再放开
}
```

切会话时 `historyRefresherActive` 也要清 —— `loadOlderTurns` 会认出自己不再是当前
请求而提前 return，留下 active 常真，新会话即便没有更早历史也一直能下拉。

### 位置：从 `position: fixed` 改成流内第一个子元素

指示行原先是 `<scroll-view>` 的**兄弟**节点 + `position: fixed`（连 `top` 都没有，
靠 `buildHistoryStatusStyle` 算的内联 top 定位），于是浮在第一条消息上面挡住内容。
现在是 `.message-list__content` 的第一个子元素，排在 `#content` 之前，跟着列表滚。

`buildHistoryStatusStyle` 一并**删掉**（连同它的测试），并在原处留注释说明为什么不该
接回去 —— 留着签名就会有人照着用，指示行又会浮起来。`detailLayoutPresentation.spec.ts`
里换成一条 `expect(mod.buildHistoryStatusStyle).toBeUndefined()` 防回归。

### 行高必须钉死

```scss
.history-status {
  min-height: 64rpx;   /* 抄 circles 页 .feed-more 的既有值 */
}
```

前插更早历史后要按锚点还原滚动位置，还原量依赖「插入了多高的内容」。指示行的文案在
pulling / loading / error 之间切换，若行高跟着变，这个差值就带上一份不该有的抖动，
**锚点会漂**。所以行高固定，只换里面的字。

### 状态机

抽成纯模块 `detailHistoryIndicatorPresentation.ts`。这一行同时被四个来源驱动
（下拉手势、上滑到顶、初始同步、上一次失败），组合起来 8 个状态；写在 `.vue` 的
computed 里既测不到也读不懂。**优先级顺序本身是需求**：

| # | 条件 | code | 文案 | 为什么排这个位置 |
| --- | --- | --- | --- | --- |
| 1 | `!hasMessages` | `hidden` | — | 空会话显示「没有更多历史了」读起来像出错 |
| 2 | `loadingOlder` | `loading` | 正在加载更早消息... | 手指还按着但请求已发出的那一瞬，说「松手加载」是错的 |
| 3 | `initialLoading` | `initial-loading` | 初始历史加载中... | 此时窗口可能还没建立，`hasMore` 不可信；排在 6 后面会先闪一下「没有更多历史了」 |
| 4 | `pullDistance > 0 && canPull` | `release` / `pulling` | 松手加载更早消息（有错误时「松手重试」）/ 继续下拉加载更早消息 | 排在 5 前面：失败后再次下拉要给即时反馈，而不是停在旧错误上 |
| 5 | `errorMessage` | `error` | `{msg}，点击重试` | 常驻重试入口 |
| 6 | `hasMore` | `ready` | 下拉或上滑加载更早消息 | |
| 7 | else | `exhausted` | 没有更多历史了 | |

两个刻意的设计：

- **`canPull` 与文案分开算。** 失败时窗口坐标没变、`hasMore` 仍为真，所以下拉重试可行
  （`error` 态 `canPull: true`）；而 `exhausted` 必须关掉 `refresher-enabled`，
  否则下拉能拽出一片空白却什么都不发生。
- **只有 `error` 可点。** 其余状态点击必须无副作用 —— 否则「没有更多历史了」被点一下
  就发一个注定失败的请求。阈值判定用 `>=`，与 uni 内部
  `refresherHeight >= refresherThreshold` 同边界，否则会出现「文案说继续下拉、
  松手却真的发了请求」。

### 失败不再是死胡同

原实现只 `uni.showToast` 一次 —— 吐司消失后界面上**再没有任何重试入口**，用户只能猜。
现在 `historyLoadErrorMessage` 留在指示行里（吐司保留做即时反馈），可点重试，
且重试时先清空，否则请求还在飞、指示行却仍写着「点击重试」。

三个 ref 都是**按会话**的状态，切 tab 必须重置：不然 A 会话的「加载失败，点击重试」
会原样显示在 B 会话头上，点一下还会去拉 B 的历史。

### 主题覆盖

sweet / summer / cyber 三套主题都用 `!important` 改写 `.history-status__text` 的颜色
（`index.scss:83` / `:182` / `:484`）。`--retryable` 因此也必须带 `!important`，
且靠**源码顺序**取胜（选择器权重同为两个类）—— 这条规则必须留在那三处**之后**，
别往上搬，否则赛博主题下「加载失败」是一行正常的绿字。

---

## 兼容性

- **协议**：零改动。窗口探测复用既有的 `tailTurns` 尾窗请求。
- **服务端**：不需要配合。
- **缓存**：不涉及。探测路径只取窗口三元组，不写 SQLite。
- **回滚**：删掉探测函数 + watcher，把 `resolvePreservedTurnsWindow` 的 null 分支
  改回返回尾窗即回到旧行为（但会带回静默错位的风险，不建议）。
  指示行部分回滚 = 恢复 `position: fixed` + 删 `refresher-*` 绑定。

## 原生 iOS / Android 复刻要点

1. **窗口三元组必须与轮次同源。** 只要没有把 `turns` 换成新一页，就**不能**采用那一页
   的 `turns_offset`。宁可让「能否翻页」暂时未知，也不要记一个与内存轮次不配套的坐标 ——
   那会造成**静默**的历史空洞（校验用的是同一个错坐标，不会报错）。
2. **必须有主动探测。** 带着实时预览进详情是常态；不能等用户的翻页手势来建立窗口，
   那是自锁。
3. **探测要有并发去重**（一个会话同时只允许一个在飞），且**流式期间不探测**。
4. **要有自愈时机**：流式结束 / in-flight 轮次落地后补一次。注意检查你的
   「有内容」谓词和「易变」谓词字段集是否一致 —— 不一致的地方就是漏洞所在。
5. **指示行放进列表内容流**，不要用绝对定位悬浮，且**行高固定**（前插还原滚动位置
   依赖插入高度差）。
6. **下拉刷新的状态复位必须在「手势仍启用」时完成。** 若平台控件也有
   「disabled 时忽略状态变更」的行为（uni 就是），翻到底那一次会把刷新态永久卡死。
   顺序：收回 refreshing → 等一帧 → 再允许禁用。
7. **手势距离要自己归零**，别指望控件补发一个 0。
8. **失败要留常驻重试入口**，不要只弹一次吐司。
9. **上滑判定注意符号**：确认你的平台里「向上滑」对应的增量是正还是负。
   连续滚动触发与边沿触发（到达顶部事件）**两条都要**：边沿触发在阈值内静止后不复发。

## 测试

- `tests/pages/conversation-detail/detailHistoryIndicatorPresentation.spec.ts`（新增，
  12 例）：8 个 code、优先级顺序（in-flight 压过手势、initial 压过 exhausted）、
  阈值 `>=` 边界、`canPull` 与文案分离、空白错误串、缺省阈值。
- `tests/pages/conversation-detail/detailHistoryPaging.spec.ts`：
  「没有旧窗口时拒绝凭空造一个」改为断言 `null`（注释里记了错位的具体算式）。
- `tests/pages/conversation-detail/conversationDetailBodyContract.spec.ts`：
  新增两组源码契约 —— 上滑符号 + 边沿触发保留；窗口探测的四道守卫与自愈 watcher。
  重写「指示行经由 scroll-view refresher 且在文档流内」一组：插槽位置、
  `refresher-default-style="none"`、`historyRefresherActive` 的按压顺序、
  `min-height: 64rpx`、不含 `position: fixed`。
- `tests/pages/conversation-detail/detailLayoutPresentation.spec.ts`：
  `buildHistoryStatusStyle` 导出已消失。
- 全量：118 suites / 690 tests 通过；`tsc --noEmit` 维持 3 条既有基线错误
  （`main.ts` 的 `./App.vue`、`detailScrollState.ts` 两条）；`npx uni build` 通过。

## 相关笔记

- [[2026-08-19-05-14-conversation-detail-tail-window-only]] —— 窗口协议契约本体
  （30→230 对齐溢出、`1..=500` clamp、缓存只存最新一页）
- [[2026-08-17-android-phone-conversation-history-pagination]] —— 分页协议的引入
- [[2026-08-18-23-51-conversation-detail-live-message-overlap]] —— `live_message`
  是整轮累加器，解释了为什么流式期间不能动窗口
- [[2026-08-18-19-56-conversation-detail-turn-identity-dedupe]] —— `dedupeKey`
  跨来源去重，前插接缝依赖它
