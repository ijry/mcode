# ACP 报错落地与多问题分栏

**文件**：`2026-08-20-20-15-acp-error-surface-and-question-tabs.md`

## 现象（用户原话）

> 1、智能体 ACP 断开连接的报错有办法获取到吗，还有别的报错似乎无法获取看下 codeg-plus
> 源码到底是怎么处理报错的，可以多个客户端获取吗
>
> 2、智能体提问多个问题现在垂直堆叠太长了应该用 up-tabs，就像 codeg-plus 桌面

## 一、报错为什么「拿不到」

查完 codeg-plus 的结论：**报错早就发过来了，是 mcode 这一侧丢的**。三个独立成因。

### 成因①：`details` 在归一化时被丢掉

服务端 `AcpEvent::Error`（`codeg-plus/src-tauri/src/acp/types.rs:276-314`）带四个字段：

| 字段 | 内容 | 改动前 |
| --- | --- | --- |
| `message` | 人类可读文案 | ✅ 已用 |
| `code` | 稳定机器码（如 `initialize_timeout`） | ✅ 已收（我一度误判为丢弃） |
| `details` | **agent stderr 尾巴** + 解析失败摘要 | ❌ **丢弃** |
| `terminal` | 是否连接级死亡 | — `#[serde(skip)]`，进程内信号，客户端拿不到 |

`details` 恰恰是最难排查那类错误的唯一线索。服务端注释写明了它的适用范围：

> Out-of-band diagnostic evidence for errors codeg *inferred* rather than received —
> currently the `turn_failed_empty*` family, where the agent reported success and the
> wire carried no error at all.

也就是「agent 说成功了、线上没有任何错误信息，但结果是空的」——用户说的「别的报错似乎
无法获取」大概率就是这一类。它在源头已脱敏并限长（`acp/stderr_tail.rs`），注释明确说它
会被渲染到 UI 并在 server 模式下推过 WebSocket，可以直接显示。

### 成因②：`disconnected` 不是一个被识别的状态

服务端 `ConnectionStatus`（`types.rs:780-786`）有五个值：`Connecting` / `Connected` /
`Prompting` / `Disconnected` / `Error`。

而 mcode 的 `RuntimeSession.status` 联合类型里**没有 `disconnected`**。于是
`status_changed` 事件里它掉进 else 分支：被当成正常状态，还会顺手把
`inputErrorMessage` 清空 —— **agent 死了，界面上什么都不显示**。

### 成因③：快照里的 `last_error` 从来没被读出来

服务端把最近一次报错放在 `SessionState.last_error`（`session_state.rs:353`，结构是
`SessionLastError { message, code, details? }`），并在 `to_snapshot()` 上暴露
（`:1560`）。注释直接说明了用意：

> Exposed on `to_snapshot()` so clients that reconnect after missing the live
> `AcpEvent::Error` can still surface the latest agent failure.

所以用户问的「可以多个客户端获取吗」答案是**能** —— 晚 attach 和重连的客户端都拿得到。

但 mcode 这侧的 `deriveRuntimeError` 读的是 `snapshot.error` / `.message` / `.detail`
**三个在 `LiveSessionSnapshot` 上都不存在的字段**。于是它要么返回 null，要么在
`status === "error"` 时返回兜底文案「会话运行失败」—— **真正的原因一次都没显示过**。

两处修正：

1. **改读真实结构** `snapshot.last_error.{message,code,details}`（含 camelCase 别名）；
2. **不再用 `status === "error"` 当前置条件。** `last_error` 与 status 是**独立**的两件事：
   非终止性错误（单轮失败、`SetMode` 失败、`session/load` 回退、空 prompt 被拒）之后连接
   还活着，status 已经回到 `connected`，但那条错误仍然值得显示。服务端自己的清除时机是
   「新 prompt 开始（`Prompting`）时」（`session_state.rs:666-671`），不是「状态变好时」。

**快照没带错误时不清空已有的。** attach 快照可能比刚收到的实时 `error` 更旧
（`shouldIgnoreOlderSnapshot` 只挡 seq 明确更小的，seq 缺失时挡不住），拿一份不含错误的旧
快照擦掉刚刚报出来的原因，等于故障又变回静默。所以是 `if (snapshotError)` 而不是无条件赋值。

## 报错侧的改动

### `details` 全链路打通

`normalizeRuntimeErrorEvent` 收 `details` → 存进新字段 `session.inputErrorDetails` →
`buildDetailStatusState` 输出 `DetailStatusState.details`。

**与 `text` 分开返回，不拼进去**：stderr 尾巴可能几十行，胶囊里塞不下。UI 拿到的是两个
独立字段，可以默认折叠、按需展开。

`inputErrorDetails` 与 `inputErrorMessage` **同生同灭**：全文件 15 处
`inputErrorMessage = null` 旁边都补了对应的一行。漏一处就会让上一次的 stderr 残留到下一次
报错上 —— 那比没有证据更糟，因为它看起来像是真的。

### `disconnected` 成为一等状态

三处改动：

1. `RuntimeSession.status` 联合类型加上 `"disconnected"`；
2. `status_changed` 加一个 `else if (status === "disconnected")` 分支，**保留已有的错误
   文案**（服务端 `run_connection` 先发 `Error` 再发 `Disconnected`，前者才带真正的原因），
   拿不到时才退回「智能体连接已断开」；
3. `preserveTerminalError` 的条件从 `previousStatus === "error"` 扩到
   `|| previousStatus === "disconnected"` —— 否则随后一条 `idle` 会把断连原因擦掉。

`buildDetailStatusState` 新增 `agent_disconnected` 状态码，**排在 `runtime_error`
之前**。断连时 `runtimeErrorText` 往往就是导致断连的那条 Error，两者说的是同一件事，而
「断开了」比「出错了」更可操作 —— 前者能挂重连入口。

### 两层「断开」必须分清

这是最容易接错线的地方：

| 层 | 断了会怎样 | 恢复手段 | 状态码 |
| --- | --- | --- | --- |
| **传输层**（手机 ↔ CodeG 主机的 WebSocket） | 收不到任何事件 | `acpApi.reconnectRealtimeBridge`，自动重连 | `bridge_reconnecting` / `bridge_error` |
| **ACP agent 进程**（CodeG ↔ claude/codex） | 传输层好得很，事件收得到 —— 收到的正是「agent 死了」 | 需要重新 spawn agent | `agent_disconnected` |

`bridge_*` 那几条自带 `actionKey: "reconnect"`，但它们重连的是**传输层**。
`agent_disconnected` **本次刻意不挂 action** —— 重新拉起 agent 进程需要一条 mcode 目前
没有的命令路径（桌面端输入框右下角那个按钮调的东西），要另外查清楚再做，不能拿传输层的
重连去糊。

## 二、多问题分栏

### 现状与桌面端的差距

mcode 原先把所有问题竖排铺开。服务端硬限 `MAX_QUESTIONS = 4`（`acp/question.rs:44`），
四个问题、每题若干选项，是一屏放不下的长卡片 —— 用户得反复上下滚动才能看清漏了哪一题。

codeg-plus 桌面端（`src/components/chat/ask-question-card.tsx`）的形制：

- **只有 `questions.length > 1` 才分栏**（`:250` 的 `isMulti`）。单问题走普通竖排 ——
  mcode 原来的样子在单问题时**本来就是对的**。
- **它不是纯 tabs，是 tabs + 引导流程的混合**：单选点完自动跳下一题（`:158-165`）、
  footer 有「Next」、顶部一条贴边进度条。
- **tab 标签是 `header`**，服务端强制它 ≤12 字符（`question.rs:50` 的
  `MAX_HEADER_CHARS`），就是为短标签准备的。
- 已答的换成对勾并整个 tab 染色，另有头部 `n/m` 计数。

### 改动

新增两个纯函数到既有的 `detailInteractionPresentation.ts`（**不新建模块** —— 作答状态、
提交载荷那套逻辑已经在那里且与桌面端语义对齐，另起一份必然漂移）：

```ts
buildQuestionTabItems(pending, selections): QuestionTabItem[]
resolveNextQuestionTabIndex({ questionCount, currentIndex, multiSelect, isOtherToggle })
```

组件侧三个 computed：`questionUsesTabs`（`> 1`）、`questionTabItems`、
**`visibleQuestions`** —— 分栏时只返回当前那一题，这正是修掉「垂直堆叠太长」的那一步。

`up-tabs` 用本地约定（`v-model:current` + `:list` + `keyName="title"`，同
`pages/circles/index.vue`），`:scrollable="false"` 让 4 个以内的标签等分宽度 ——
与桌面端一致，且有 `MAX_QUESTIONS = 4` 兜底。

### 三个容易写错的点

**① 标签退回序号，绝不退回 `question`。** `header` 缺失时用「问题 N」。用几十字的完整问句
当标签，每个 tab 看起来都一样，等于没有标签。已由测试锁死（断言标签里不出现问题正文）。

**② `up-tabs` 是下标驱动的，但 tab 的身份是 question id。** 组件存下标
（`askQuestionTabIndex`），需要 id 时经 `questionTabItems` 回查。问题集切换时必须把下标
**重置为 0** —— 上一组停在第 3 个 tab、新组只有 2 题时，`visibleQuestions` 取不到那个下标
会渲染出空白。

**③ 自动跳题的三个例外。** 多选不跳（还要继续勾）、切「其他」不跳（还要打字）、末题不跳。
另外**取消选中时也不跳** —— 那是在改主意，跳走等于把他推离刚要重选的那题。这条是我在
`toggleQuestionOption` 里额外加的（`nextSelected.length > 0` 才跳），桌面端没有显式处理。

「下一题」按钮的 `margin-left: auto` 挂在**它**身上而不是 `__submit`：footer 是
`space-between` 的三列，auto 边距要落在中间那列才能把后两个按钮一起推到右边。不分栏时它
不渲染，auto 自然回到 `__submit`。

## 测试

`detailInteractionPresentation.spec.ts` 新增 `describe("multi-question tabs")` 4 例：
标签用 header + 已答对勾；header 缺失退回序号且**不含问题正文**；点开「其他」但没打字
不算答完；自动跳题的 5 个分支（单选跳 / 多选不跳 / 其他不跳 / 末题不跳 / 单问题不跳）。

`detailStatusPresentation.spec.ts` 新增 `describe("agent disconnect and error details")`
5 例：`disconnected` 优先于 `runtime_error`；无错误文案时退回通用文案；`details` 与
`text` 分离且证据不出现在胶囊文案里；无 details 时字段为 `undefined`；标签是「已断开」
而非「运行异常」。

`conversationRuntime.spec.ts` 新增 `describe("snapshot last_error")` 4 例：从快照取出
message/code/details；**连接已恢复健康时仍显示 last_error**（锁住「与 status 独立」这条）；
不含错误的快照**不擦掉**更新的实时错误；旧后端无 `last_error` 时退回通用文案。

**变异探针（四次，全部命中）**：
- 把 `runtimeStatus === "disconnected"` 改成 `false` → 该组 2 条变红；
- 把 tab 标签退回改成 `question.question` → 该组 3 条变红；
- 把 `last_error` 读回不存在的字段（改动前的行为）→ 2 条变红；
- 把条件赋值改成无条件覆盖 → 1 条变红（正是「旧快照擦掉实时错误」那条）。

四次探针后源文件均 `diff -q` 字节一致。

三道闸：jest **124 suites / 827 tests 全绿**（基线 814，新增 13）；`tsc --noEmit` 恰好
3 条既有基线错误（`main.ts` 的 `App.vue`、`detailScrollState.ts` 两处），改动文件零错误；
`uni build` DONE，仅剩既有的 `conversationSyncService` 动静混合导入告警。

## 原生 iOS / Android 复刻要点

1. **`AcpEvent::Error` 的四个字段要收全。** 只取 `message` 会丢掉唯一能定位
   `turn_failed_empty*` 那类故障的证据。`details` 已在服务端脱敏限长，可直接显示，但
   **必须默认折叠** —— 它是 stderr 尾巴。
2. **`ConnectionStatus` 的五个值都要在客户端的状态枚举里有对应项。** 缺一个（这次是
   `Disconnected`）就会掉进 default 分支被当成正常状态，故障静默。
3. **区分「传输层断开」与「agent 进程死亡」。** 两者的恢复手段完全不同，用同一个重连按钮
   会让用户在 agent 死掉时反复重连一个本来好着的 WebSocket。
4. **诊断证据与状态文案分开传。** 拼成一个字符串会让胶囊/状态栏被几十行 stderr 撑爆。
5. **错误状态要能从快照恢复。** 服务端 `to_snapshot()` 带 `last_error`，所以晚 attach
   的客户端也该显示最近一次失败 —— 只监听实时事件会漏掉。两个易错点：读的是
   `last_error.{message,code,details}` 这个嵌套结构（不是快照顶层的字段）；判据**不能**是
   `status === "error"`，`last_error` 与 status 独立，非终止性错误后连接仍然健康。
6. **快照不带错误时不要清空已有的。** attach 快照可能比刚收到的实时错误更旧，无条件覆盖
   会让故障重新变回静默。
7. **多问题分栏：单问题不分栏。** 一个问题套一层 tab 只是多一次点击，且 tab 栏里只有一个
   标签看起来像出了错。
8. **tab 标签用短 header（服务端保证 ≤12 字符），缺失时退回序号而不是问题正文。**
9. **单选作答后自动前进**是让多 tab 读起来像向导的关键；多选、自由文本、末题、取消选中
   四种情形都不能跳。
10. **问题集切换时重置当前 tab 下标**，否则新集合更短时会渲染空白。判据用集合级
    `question_id`，不要比对问题数组本身 —— 同一集合的重复推送（快照 + 实时）会给出内容
    相同的新数组，按数组比对会把用户已选的答案清掉。

## 相关笔记

- [[2026-08-20-14-20-realtime-reconnect-authoritative-refetch]] —— 传输层重连后的权威重取，
  与本文的「agent 进程断开」是两层
- [[2026-08-19-18-32-conversation-detail-subagent-capsule]] —— 「一个组件两种模式」
  （可交互 / 只读回看）的同型套路，桌面端问题卡片也用它
- [[2026-08-17-android-phone-realtime-user-message-authority]] —— attach 快照携带
  in-flight 状态的机制，`last_error` 走的是同一条路

## 待观察

- **`agent_disconnected` 目前没有重连入口。** 桌面端输入框右下角有一个「重新连接」按钮，
  要查清它调的命令（是否 kill 并重新 spawn、是否复用 session id 续接对话）才能在 mcode
  上做对。这是本次刻意留下的缺口，不是遗漏。
- **`last_error` 只在 attach 快照路径读。** 冷启动进入一个已失败的会话现在能看到原因了，
  但如果某条路径只拉 `get_folder_conversation` 而不 attach（例如只读时间线），仍然拿不到 ——
  会话详情响应里没有 `last_error` 这个字段，它只存在于 live session 快照上。
