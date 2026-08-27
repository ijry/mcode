# 运行中发送拦截与「插入当前回合」

**文件**：`2026-08-27-01-22-running-send-interception-and-native-steering.md`

## 现象（用户原话）

> 修复 mcode 会话中 发送消息没做拦截导致提示 tun already in progress，另外针对 claude，
> 运行中的会话，点击发送按钮时弹出 Up-actionsheet，给一个选项插入当前回合，取消。

## 一、拦截为什么会丢

**不是从来没写过，是抽离组件时整块漏了。**

`index.vue` 里那套 `submitPreparedDraft`（`:4723`）本来是有门的：

```ts
async function submitPreparedDraft(draft: QueuedDraft) {
  if (isBusyForSend.value) {
    draftQueue.value = appendQueuedDraft(draftQueue.value, draft)
    queueExpanded.value = true
    uni.showToast({ title: "已加入待发送队列", icon: "none" })
    return
  }
  ...
}
```

输入框后来抽到了 `ConversationDetailInteractivePane.vue`，`isBusyForSend` 的**定义**跟着搬过去
了（`:1687`），但**没有一个调用点**跟过来 —— `grep -c isBusyForSend` 在 pane 里等于 1，就是那行
定义本身。于是 pane 的 `sendMessage` 一路直通 `sendDraft`：

- `canSend`：只判「有没有内容」
- `canSendSharedLive`：只拦 viewer（`role === "owner"` 时 `allowSend` 恒为 true，见
  `conversationRuntime.ts:207` 的 `syncManagedSendPermission`）
- `uploadingCount > 0`：只判附件在上传

三道门里没有一道问「当前回合是不是在跑」。第二条 prompt 于是真的打到 `/acp_prompt`，
由服务端并发闸拒掉（codeg-plus `acp/manager.rs:757` 与 `:924` 各有一道，前者在 send gate、
后者在 admission 前）。

**`index.vue` 那套现在是死代码**：模板里已经没有 textarea / send-btn，只剩
`regenerateLastMessage`（`:5589`）还在调。本次刻意没动它 —— 清理它是独立一次改动，混进来
会让这次的 diff 没法读。

## 二、附带修掉的第二个 bug：草稿会蒸发

`createDraftFromComposer`（pane `:2700`）在发送**之前**就清空了 `inputText` 和
`attachments`。而 pane 没有本地待发送队列，catch 分支也不回填 —— 撞上并发拒绝时，用户
刚打的字直接没了，连重试的机会都没有。

这条用户没提，但它比「弹了个英文报错」更严重，所以一起修了。

## 三、能力判定：不许在前端用 agentType 推导

「插入当前回合」不是「claude 就有」。判据是服务端合成的**单个 bool**
`native_steering_available`（`codeg-plus/src-tauri/src/acp/session_state.rs:1673`，在
`to_snapshot()` 上暴露），它在 initialize 时由三道闸合成
（`connection.rs:9470` 的 `synthesize_native_steering`）：

| 闸 | 内容 | 谁能过 |
| --- | --- | --- |
| ① 声明 | `initialize` 响应的**顶层** `_meta.steering.supported === true` | claude、codex 都声明 |
| ② 策略 | registry 认为该 agent 遵守 `_meta.steering.idleBehavior = "promptRequired"` opt-in（`registry.rs:298`） | **只有 claude** |
| ③ 运行时 | 实际跑着的 `agent_info.version` ≥ 该 agent 的下限 | claude-agent-acp **≥ 0.65.0** |

**codex 卡在第 ② 道。** `codex-acp` 底层实现了 `_session/steering`，但没实现
`promptRequired`，回合末尾竞态时会返回 `startedNewTurn` —— 一个没有 host 请求拥有的
detached turn。服务端因此明确不给它开。

**第 ③ 道不能省。** 0.64.0 引入了 opt-in，但 ACTIVE 路径直到 0.65.0 才修好（#958）：steering
以 `now` 优先级投递会让 CLI abort 当前 cycle，而那个 cycle 的结果又把 owning `session/prompt`
结算成干净的 `end_turn`，续跑的部分就在「没有回合在飞」的状态下流出来。启动时优先用 PATH
上用户自己装的适配器（而不是钉死的 npx 包），所以静态策略担保不了管道另一头那个进程。

服务端注释直接写了为什么不暴露原始声明位：

> The raw advertisement is deliberately NOT stored: exposing it would tempt the frontend to
> re-derive eligibility and show the instant channel for adapters (codex) that advertise
> steering but would detach a turn on the idle race.

所以 mcode 这侧只读那一个合成位，**不看 agentType**。

### 单调升级：只升不降

`RuntimeSession.nativeSteeringAvailable` 的写入规则是「快照报 `true` 才置位，`false` 与字段
缺失都不回落」。

理由和 codeg-plus 前端对 `feedback_tool_available` 的处理相同：`connectionId` 在连接刚创建
（还在 connecting）那一刻就有了，而服务端要到 initialize 才写这个字段 —— **第一次读回来必然
是 false**。无条件赋值会让入口在一次早到的快照之后永久消失。

`false` 与「字段不存在」（旧后端）在这里是同一件事：都不构成「这条会话不支持」的证据。

清零只发生在三处，都是「这条连接没了」：`disconnect`、`invalidateConnection`、以及会话被
别的连接接管（`connectFreshConversation` 里那个 adopt 分支）。能力位描述的是**这条连接的
适配器支持什么**，下一条连接可能是另一个 agent、另一个版本 —— 留着它会让重连到 codex 后
仍然显示插入入口。

`'true'`（字符串）不算：那是协议漂移的信号，宁可不显示入口，也不给一个后端会拒的按钮。

## 四、三条路的分流

`resolveRunningSendAction({ isBusy, nativeSteeringAvailable, hasAttachments })` 是纯函数，
返回三个值：

| 返回 | 条件 | 行为 |
| --- | --- | --- |
| `send` | 没有回合在跑 | 正常发送 |
| `steer_sheet` | 在跑 + native + 无附件 | 弹面板 |
| `blocked` | 在跑 + 其余情形 | toast 提示，**草稿原样留在输入框** |

**不支持时不弹面板。** 弹一个只有一个选项、而那个选项还点不动的面板，是纯噪音。

**有附件时退回 blocked。** 服务端 steering 的 params 只有一个 text block
（`connection.rs:2577`），是 text-only 的。给一个会静默丢掉附件的按钮，比不给更糟。

**拦截必须在 `createDraftFromComposer` 之前。** 那个函数会清空输入框；放在它之后拦截，
等于把用户刚打的字吞掉再提示他等一会儿。这是本次唯一一个「顺序错了就白改」的点。

`sendQuickReply` 走同一道门 —— 它也调 `sendDraft`，此前同样没拦。

## 五、面板用原生 `uni.showActionSheet`

不是 `up-action-sheet`。详情页现有三处底部菜单（背景图 `:2567`、主题 `:2581`、会话状态
`:2642`）都用原生的，跟着来不引入第二套写法；而且它**自带取消项**，用户要的「取消」不用
手写一栏。

选中后 `steerIntoCurrentTurn(text)` 调 `acpApi.acpSubmitSessionFeedback(connectionId, text)`
→ 服务端 `submit_session_feedback`（`web/handlers/feedback.rs:56`）。

三条结局语义不同，不能合成一个 catch：

- **成功**：清空输入框。**只在成功后清** —— 与 `sendMessage` 相反的顺序，因为这条是异步确认。
- **`no active turn`**：点按钮那几百毫秒里回合结束了。文本**没有被消费**，所以保留草稿并提示
  「可直接发送」。**不替用户自动发出去** —— 那是越权，他可能已经改主意了。
- **其它失败**：保留草稿 + 报错原文。

`steeringIntoTurn` 单独上锁：这条链路是「等后端确认才清输入框」，不锁的话连点两次会把同一段
文本注入两遍。

## 六、兜底：本地判空闲、服务端在跑

前端 `runtimeStatus` 靠推送事件驱动，断线期间会滞后 —— 所以「本地以为空闲、服务端正在跑」的
窗口**一直存在**，前置拦截不可能消灭它。

`sendDraft` 的 catch 里认这个拒绝，命中时把草稿还回输入框。两个后端的名字不同：

| 后端 | 错误码 | Display 串 | 出处 |
| --- | --- | --- | --- |
| codeg-plus | `turn_in_progress`（HTTP 409） | `turn already in progress for this connection` | `acp/error.rs:20`、`app_error.rs:92` |
| mcode-desktop | `turn_busy` | `another device is running a turn` | `runtime/mod.rs:1760` |

三种载荷形状都要认：裸字符串（Tauri）、带 `message` 的对象/Error、带 `code` 的结构化 body。
desktop 的码藏在 message 里的一段 JSON 串（`anyhow!("{}", json!({...}))`），所以字符串路径也要
匹配 `"code":"turn_busy"` —— 逐码匹配整个 `"code":"<x>"` 片段，而不是裸搜码名，后者会把
「另一个字段的值恰好等于 turn_busy」也算进来。

回填时**只在输入框仍为空时覆盖**：拒绝到达前用户可能已经开始打下一条，那份新内容比这份失败的
草稿更该留着。附件同理。

## 七、没有做的事

- **没有搬本地待发送队列到 pane。** 用户选了「保留草稿 + toast」，队列是另一个量级的改动
  （队列 UI、持久化、回合结束自动续发）。
- **没有跟随全局 live feedback 开关。** codeg-plus 桌面端把入口挂在那个默认**关**的开关下，
  但服务端 `submit_feedback` 只校验 `native || tool_available`，**不校验全局开关**
  （`manager.rs:2435`）—— 所以 native 通道下不跟随是安全的，且用户不必先去连接设置里翻开
  「反馈工具」才能用。
- **relay 一行没改。** `/v1/proxy/:command` 是透传的（`mcode-relay/src/server.ts:867`），新命令
  自动通。
- **mcode-desktop 白名单没加。** 它的 `native_steering_available` 恒为 false，走不到这条路。

## 测试

`detailPromptSend.spec.ts` 新增 `describe("running send interception")` 5 例：空闲一律直发
（native 与附件在这条路上都不该起作用）；忙+native→出面板；忙+非 native→拦截；忙+native+有
附件→拦截；两个后端 × 三种载荷形状的忙拒绝都能识别；`target_offline` / `connection not found`
/ null 不误判。

`conversationRuntime.spec.ts` 新增 `describe("snapshot native steering capability")` 6 例：
快照 true 置位；camelCase 别名；**后续 false 不回落**；**字段缺失不回落**；字符串 `'true'`
不认；`invalidateConnection` 清零。

**变异探针（五次，全部命中）**：

- 删掉附件那道闸 → 1 条变红；
- `TURN_BUSY_CODES` 去掉 `turn_busy` → 1 条变红；
- hydrate 改成无条件赋值（改动前的天真写法）→ 2 条变红（正是「不回落」那两条）；
- 删掉 `invalidateConnection` 里的清零 → 1 条变红。

五次探针后源文件均 `diff -q` 字节一致。

> 探针踩到的坑：这台机器上 `python3` 是 Windows Store 的占位 stub（exit 49），用它跑的第一次
> 探针**静默没改到文件**，测试照绿，看起来像「测试没锁住」。真实解释器是 `python`。以后写探针
> 脚本要断言替换次数（`assert s.count(old) == 1`）并回显，不能只看测试结果。

三道闸：jest **130 suites / 902 tests 全绿**（基线 891，新增 11）；`tsc --noEmit` 恰好 5 条既有
基线错误（`main.ts` 的 `App.vue`、`detailScrollState.ts` 两处、`appVersion.ts` 两处），已用
`git stash` 在干净树上比对确认逐条一致，改动文件零错误；`uni build` DONE，仅剩既有的
`conversationSyncService` 动静混合导入告警。

> 另一个坑：`npx uni build` 会从 npx 缓存里解析到**另一个**同名 `uni` 包并崩在
> `http-signature`。要用项目自己的 `./node_modules/.bin/uni build`。

## 原生 iOS / Android 复刻要点

1. **发送前必须有「当前回合在跑吗」这道门，且必须在取走输入框内容之前。** 顺序错了就等于
   把草稿吞掉再提示用户等待。这次的 bug 根因不是没想到要拦，是抽离组件时把调用点漏了 ——
   如果你的架构里判据和调用点分属两层，加一条「判据零引用」的静态检查比写注释有用。
2. **「能不能插入当前回合」只读服务端合成的 `native_steering_available`，绝不用 agent 类型
   推导。** codex 也声明 steering，但会把当前回合变成 detached turn。客户端拿不到、也不该
   复刻那三道闸的判断逻辑。
3. **这个能力位要单调升级。** 连接刚建立时服务端还没写它，第一次读必然是 false；无条件覆盖
   会让入口永久消失。`false` 与「字段缺失」等价——都只是「还没有证据」。
4. **清零的时机是「连接换了」，不是「状态变了」。** 它描述适配器能力，不是运行态。
5. **不支持时不要弹只有一个死选项的面板。** 直接给拦截提示。
6. **steering 是 text-only。** 带附件时退回普通拦截，不要静默丢掉附件。
7. **前置拦截消灭不了服务端拒绝。** 客户端状态靠推送驱动，断线期间必然滞后，所以必须同时
   有「撞上了就把草稿还回来」的兜底。两个后端的拒绝码不同（`turn_in_progress` /
   `turn_busy`），且 desktop 的码藏在 message 的 JSON 串里 —— 三种载荷形状都要认。
8. **`no active turn` 不是失败，是「回合刚结束」。** 文本没被消费，保留草稿并提示可直接发送；
   **不要自动替用户发出去**。
9. **插入成功才清输入框。** 这条链路是异步确认，与即时发送相反。另需单独的 in-flight 锁，
   否则连点会注入两遍。

## 相关笔记

- [[2026-08-20-20-15-acp-error-surface-and-question-tabs]] —— 同一类「服务端早就发过来了、
  是客户端这侧丢的」；那次丢的是 `details` 与 `last_error`，这次丢的是 `native_steering_available`
- [[2026-08-20-14-20-realtime-reconnect-authoritative-refetch]] —— 为什么客户端状态必然滞后于
  服务端，本文第六节的兜底就建立在这条之上
- [[2026-08-19-18-32-conversation-detail-local-turn-cache-toggle]] —— 同样的「纯函数判据 +
  组件只做编排」拆分套路
- [[2026-08-27-02-19-feedback-notes-two-events]] —— 后续：接上两个事件、渲染本轮便签列表；
  并纠正本文对 native 通道两态语义的错判

## 待观察

- **`index.vue` 里那套发送/队列死代码还在。** `submitPreparedDraft` / `draftQueue` /
  `processDraftQueue` 只剩 `regenerateLastMessage` 一个调用点。它是本次拦截丢失的直接成因
  （两份实现漂移），该清，但要单独一次改动。
- **本地待发送队列仍然没有。** 现在是「保留草稿」而不是「排队等回合结束自动发」。如果以后要
  做，注意 codeg-plus 桌面端那套队列也**只在内存里**，不与 mcode 同步 —— 真要跨端同步必须
  下沉到服务端。
- **插入的内容目前不在时间线上留痕。** 服务端会广播 `feedback_submitted` / `feedback_consumed`
  两个事件（`types.rs:445`、`:452`），mcode 一个都没接，所以插入成功后除了 toast 没有任何可见
  记录，另一端也看不到。要做「等待中 / 已读取」那两态的话，从这两个事件入手。

  > **已在 [[2026-08-27-02-19-feedback-notes-two-events]] 接上，且那一篇纠正了本条的一个错判：**
  > 「另一端也看不到」是错的（事件本来就广播给所有客户端），而「等待中 → 已读取」两态在
  > **native 通道下没有第二帧** —— native 便签出生即 `delivered`，mcode 永远收不到自己那条的
  > `feedback_consumed`。本条描述的是 pull 通道的语义，不适用于 mcode 走的 native 通道。
