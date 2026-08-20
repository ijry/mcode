# 底部 tab 角标不显示，与桥接重复触发 ready

**文件**：`2026-08-20-16-05-tabbar-badge-autonomous-service.md`

## 现象（用户原话）

> 3修复，另外修复底部tab不显示角标数量

「3」指上一条笔记待观察里记的**同一次连接发两次 `connected`**。两件事一起修。

## 一、底部 tab 角标从来不显示

### 根因：整条链的生命周期绑在会话页上

角标的三件事 —— 拉取计数、订阅 `pet://sessions`、调 `setTabBarBadge` —— 原先**全部**活在
`pages/conversations/index.vue` 里：

| 环节 | 原位置 | 触发时机 |
| --- | --- | --- |
| 拉取 | `refreshActiveSessionTabBadge` | 本页 `onShow` / 下拉刷新 / 新建会话后 |
| 订阅 | `ensureActiveSessionsSubscription` | 由 `loadConnectionGroup` 调用（也只在本页） |
| 清理 | `onUnload` | 把订阅全部拆掉 |

而 **App 冷启动落在 tabBar 第 0 项「连接」页**（`pages.json` 的 `tabBar.list[0]` 是
`pages/connections/index`，会话页是 `list[1]`）。用户不主动切到会话页，这个页面就从未挂载：

- `onShow` 从未触发 → 计数从未拉取 → **`setTabBarBadge` 一次都没调过**；
- 订阅从未建立 → `pet://sessions` 推送没人接 → 角标不会自己出现；
- 一旦离开会话页，`onUnload` 又把订阅拆掉。

**角标恰恰是给「用户不在会话页时」看的东西**，把它的生命周期绑在那个页面上是自相矛盾的。
这也解释了为什么它偶尔「好像能显示」：用户手动进过一次会话页，那一次拉取生效了。

> 值得记的一点：`ensureActiveSessionsSubscription` 的回调里，`applyConversationTabBarBadge`
> **本来就没有** `livePreviewPageVisible` 门禁（门禁只管要不要顺带刷新列表），说明当初
> 已经意识到「角标不该受页面可见性影响」。但订阅本身活在页面生命周期里，等于加了一道
> 更强的**隐式**门禁 —— 显式守卫写对了，隐式的那道没人注意。

### 修法：抽成自治服务，由 `App.vue` 驱动

新建 `services/conversation/conversationTabBadgeService.ts`，模块级持有：

- `countByInstance` —— 每个实例的活跃会话数（权威副本，从页面搬过来）；
- `disposeByInstance` —— `pet://sessions` + bridge health 两个订阅的清理器；
- `lastBridgeStateByInstance` —— 重连判据用的上一个状态。

对外三个 API：`startConversationTabBadgeService()`（`onLaunch` 调一次，幂等）、
`refreshConversationTabBadge()`（重算，并发共享在飞 promise）、
`__resetConversationTabBadgeServiceForTest()`。

`App.vue`：

```ts
onLaunch(() => { initializeThemePreference(); startConversationTabBadgeService() })
onShow(() => { initializeThemePreference(); void refreshConversationTabBadge() })
```

`onShow` 也要重算：**后台期间 WebSocket 通常已断**，`pet://sessions` 与其它事件一样被
直接丢弃（服务端无订阅者时不入队、帧上无 event id），角标会停在切后台前的旧值。

页面侧改为纯委托：`ensureActiveSessionsSubscription` 只剩「顺带刷新列表」那半边，
`activeSessionBadgeCountMap` / `sumActiveSessionBadgeCounts` /
`refreshActiveSessionTabBadge*` / `activeSessionBadgeRefreshPromise` 全部删除，
四个调用点改叫 `refreshConversationTabBadge()`。**不保留两份计数** —— 两个来源各自
`set` 同一个角标，最后谁赢取决于时序。

### 两个刻意的设计

**① 失败的实例保留上一次的值,不清零。**

```ts
// 只覆盖成功拿到的实例，失败的保留上一次的值 —— 一次网络抖动不该让角标归零。
results.forEach((result) => { if (result.status === "fulfilled") { ... } })
```

页面里那份原本是 `activeSessionBadgeCountMap.clear()` **再**填充，于是任何一次
`pet_list_active_sessions` 失败都会把该实例的计数抹成 0。角标归零的语义是「任务都跑完了」——
用错了会让用户以为可以合上电脑。

**② 重连后重新拉真实计数。** 与会话列表那条同源（见
[[2026-08-20-14-20-realtime-reconnect-authoritative-refetch]]）：断线期间推送被丢弃，
所以 `connected` 时必须重取，且要挡掉首连（合成 `idle` → `connected`）。

判据这里是**内联**的而不是复用 `shouldRefetchAfterBridgeRecovered`：那个函数在
`conversationListRefresh.ts`（列表刷新语义），角标服务 import 它会形成一条名不副实的依赖。
两处各 4 行、语义相同但归属不同，此时重复优于错误的抽象。**若将来出现第三处，就该抽到
一个中立模块**（比如 `services/realtime/bridgeRecovery.ts`）。

## 二、同一次连接发两次 `connected`（上一条笔记的待观察项）

`api/acp.ts` 的 `createRealtimeBridge` 里有两条到达 ready 的路径：

```ts
bridge.detachReady = eventConnection.onReady(() => { /* 发 health + 跑 readyCallbacks */ })
// ...
if (eventConnection.isOpen()) { /* 同样的代码再来一遍 */ }
```

`onReady` 在 socket 已开时会**同步**回调（directGateway / relayGateway 都是这个语义），
而 `isOpen()` 分支是为了兜住「socket 在 `await connectEvents` 期间就已打开、onReady 注册晚了」。
两者同时命中时：

- health 发两遍 —— 订阅方难以自己判重；
- `readyCallbacks` 跑两遍 —— 那里面是 attach 协议的 `reattachAll()`，意味着**重复 attach**。
  服务端收到同 `subscription_id` 的第二次 attach 会中止前一个 forwarder 并**重发一整份快照**，
  纯浪费。

修法：抽出 `handleReady()` 加一次性守卫 `readyHandled`，两条路径都走它。逻辑一个字没改，
只是保证「同一次连接只认一次 ready」。

## 三、`projectSessions.ts:79` 的客户端排序 —— 复核后**不删**

我上一轮说它「冗余」，**说错了**。服务端 `list_all` 确实默认
`order_by_desc(UpdatedAt)`（`codeg-plus/src-tauri/src/db/service/conversation_service.rs:591-594`），
字段也对得上，但客户端那行有两个独立价值：

1. `parseTimestamp` 统一了「远端历史上出现过数值 epoch 与 ISO 串混用」的口径
   （这个类型谎言在 [[2026-08-20-09-05-conversation-list-time-only-ordering]] 里记过）；
2. 它让本函数的返回顺序成为**自身契约**，不随服务端默认排序的改动而漂移。

删掉是拿掉一层保险换零收益。改为加注释说明它为什么看起来冗余但不是。

> 顺带核实到一个容易搞混的地方：同一个 service 里 `list_by_folder` 排的是
> **`CreatedAt`**（`:508-511`），而 `list_all` 排 `UpdatedAt`（`:591-594`）。
> 两个函数名字相近、排序键不同，读代码时别张冠李戴。

## 测试

**`tests/services/conversationTabBadgeService.spec.ts`**（新文件，6 例）：

1. **不挂载任何页面就能设角标** —— 这是整个改动的要点；
2. 订阅 `pet://sessions` 且推送能直接改角标（不经过任何页面可见性门禁）；
3. 无连接时清空角标；
4. **一个实例失败时保留上次计数**（锁死上面的设计 ①）；
5. 重连重取、首连不重取；
6. 并发调用共享同一次在飞请求。

**改了一条既有断言**：`conversationListBulkSendContract.spec.ts:87` 原本断言
`await refreshActiveSessionTabBadge()`。它测的是「批量发送后要刷新角标」这个**行为**，
函数改名后跟着改成 `refreshConversationTabBadge()` 并注明原因 —— 行为契约未变。

**两次变异探针，都命中且已恢复（hash 一致）：**

- 把 `previousState !== "idle"` 改成 `true` → 「首连不重取」变红；
- 在合并结果前加回 `countByInstance.clear()` → 「保留上次计数」变红。

写测试时踩到一个坑值得记：第一版重连测试用 `await refreshConversationTabBadge()` 来
排空事件循环,那是**假绿** —— 并发调用共享在飞 promise,守卫失效时回调触发的那次会被
合并进我显式那次,fetch 计数仍是 1。改用 `setTimeout(resolve, 0)` 真实排空才能测出来。
另外全局 `uni` 由 `tests/setup/petTestSetup.cjs` 提供且它的 `beforeEach` 会 `mockClear`
自己那几个 mock,整体替换 `globalThis.uni` 会让它们变 undefined 从而炸在 setup 里 ——
只能**追加**属性。

三道闸：jest **124 suites / 810 tests 全绿**（基线 804）；`tsc --noEmit` 恰好 3 条既有
基线错误；`npx uni build` DONE，仅剩既有的动静混合导入告警。

## 端到端手测（未做）

- **冷启动就有角标**：PC 上起一个长任务 → 手机杀掉 App 重开 → **停在「连接」页不要动** →
  确认「会话」tab 上出现角标数字。这是修复前**必然失败**的场景。
- **切后台再回来**：角标存在时切后台 30s（WebSocket 会断）→ 回前台 → 确认数字与 PC 实际
  状态一致，而不是停在旧值。
- **任务跑完归零**：PC 上任务全部结束 → 确认角标消失（而不是留个 0 或旧数字）。
- **网络抖动不清零**：拔网线 5s 再插 → 确认角标数字**没有**变成消失。

## 原生 iOS / Android 复刻要点

1. **角标的生命周期必须在 Application 层，不能在任何页面/Activity/ViewController 上。**
   这是本次的核心教训：角标的用途正是「用户不在那个页面时」，把它绑在那个页面上是
   自相矛盾的。iOS 放 `AppDelegate` / `@main` App，Android 放 `Application`。
2. **注意隐式门禁。** 显式的可见性判断写对了不代表没有门禁 —— 订阅活在页面生命周期里
   就是一道更强的隐式门禁。检查方式：**冷启动后不打开那个页面**，看角标出不出来。
3. **计数只能有一份权威副本。** 两处各自 set 同一个角标时，最后谁赢取决于时序。
4. **拉取失败保留旧值，不要清零。** 角标归零的语义是「都跑完了」，网络抖动不该说这句话。
5. **回前台要重算。** 后台期间连接通常已断，推送被丢弃，角标会停在旧值。iOS 的
   `applicationWillEnterForeground` / Android 的 `ON_START` 是对应时机。
6. **同一次连接只认一次 ready。** 原生端若同时注册「连接成功回调」与「已连接则立即执行」
   两条路径（很常见的防竞态写法），必须加一次性守卫，否则重复 attach + 重复通知。

## 待观察

- 角标服务的订阅**从不主动 dispose**（模块级常驻，与 App 同生命周期）。这是刻意的，
  但意味着连接被删除后它的订阅仍在。目前无害（`countByInstance` 会在下次 refresh 时
  按当前连接列表重建，已删连接不再被 `set`），但**旧实例的 key 会残留在 map 里**——
  如果将来出现「连接删除后角标数字偏大」，第一个要查的就是这里。
- 判据在角标服务与列表刷新里各写了一份（4 行，语义相同）。**第三处出现时就该抽到
  `services/realtime/` 下的中立模块**，不要让其中一方 import 另一方。
