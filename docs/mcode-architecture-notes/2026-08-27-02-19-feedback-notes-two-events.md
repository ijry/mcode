# 本轮补充意见便签：两个事件的接入

**文件**：`2026-08-27-02-19-feedback-notes-two-events.md`

## 现象（用户原话）

> 两个事件应该接的吧

指的是上一篇（[[2026-08-27-01-22-running-send-interception-and-native-steering]]）「待观察」里留下的缺口：
`feedback_submitted` / `feedback_consumed` 一个都没接，所以插入成功后除了 toast 没有任何可见
记录。

## 一、先纠正上一篇的一个错判

上一篇写「插入成功后另一端也看不到」，**后半句在 native 通道下是错的**，而 mcode 走的正是
native。

服务端有两个构造器（`acp/feedback.rs:60` / `:76`）：

| 通道 | 构造器 | 出生状态 | 谁把它翻成 `Delivered` |
| --- | --- | --- | --- |
| native `_session/steering`（**mcode 走这条**） | `new_delivered` | **`Delivered`** | 没有人 —— 出生即已送达 |
| pull `check_user_feedback` | `new_pending` | `Pending` | agent 调工具时的 `FeedbackConsumed` |

`new_delivered` 的注释写明了为什么必须这样：

> Never `Pending`: that would let `read_pending_feedback` hand the same text to a
> `check_user_feedback` call and double-deliver it (the Pending-only read is the mutual
> exclusion between the push and pull channels).

`read_pending_feedback` 只返回 `Pending`（`manager.rs:2585`），**这就是推/拉两条通道之间的
互斥**。若 native 便签是 `Pending`，一次 `check_user_feedback` 就会把同一段文本再喂给 agent
一遍。

**推论：mcode 永远不会收到自己那条便签的 `feedback_consumed`。** 那个事件只由 pull 通道的
工具调用触发（`manager.rs:2615` 的 `commit_feedback_delivered`，唯一调用点在
`delegation/listener.rs:479`）。

所以「等待读取 → 已读取」这个两态在 mcode 自己的便签上**没有第二帧**。`feedback_consumed`
仍然要接，但它的真实用途是**别人的便签** —— 桌面端在同一会话里走 pull 通道发的那些，会广播
到 mcode。

上一篇把桌面端的 pull 语义直接套到 mcode 上，是错的。这一篇按真实通道重写。

## 二、最大的坑：线上载荷是平铺的

服务端 `EventEnvelope` 用 `#[serde(flatten)]`（`acp/types.rs:56`）：

```rust
pub struct EventEnvelope {
    pub seq: u64,
    pub connection_id: String,
    #[serde(flatten)]
    pub payload: AcpEvent,
}
```

注释也写了：「配合 `#[serde(flatten)]` 让 JSON 保持平铺：`{ seq, connection_id, type, ...变体字段 }`」。

也就是说线上是 `{seq, connection_id, type: "feedback_submitted", item: {...}}`，**没有 `data`
包装层**。

而 `normalizeEventEnvelope`（`api/acp.ts:1055`）对未识别的 type 有一条兜底透传，但那条兜底
要求 `"data" in record`：

```ts
const normalized = this.normalizeAcpEventRecord(connectionId, rawType, record)
if (normalized) { normalized.seq = ...; return normalized }
if ("data" in record) {            // ← 兜底，平铺事件永远不满足
  return { connectionId, seq, data: record.data, type: rawType } as EventEnvelope
}
return null                        // ← 平铺事件走到这里，被静默丢弃
```

**所以「只在 store 里加 case、不改 acp.ts」是行不通的** —— 事件根本到不了 store，而且不报错、
不告警。这一条我一开始判断错了（以为可以照 `turn_queue_reordered` 那样靠兜底进来），是
实测打回来的：把两个 case 改名后，`feedbackEventWire.spec.ts` 立刻两条变红，证明没有显式
case 时确实返回 `null`。

`tests/services/feedbackEventWire.spec.ts` 就是钉这一点的 —— 它不是形式主义，它挡的是一类
**静默**故障。

## 三、清空时机：`user_message` + `turn_cancelled`

便签是**轮次级**的。服务端在下一轮的 `UserMessage` 清表（`session_state.rs` 的
`user_message_clears_feedback_for_new_turn` 那条测试锁着），mcode 跟着走。

**不能用 `turn_complete` 清。** 回合刚结束、下一轮还没开始时，你插进去的那句仍然属于刚才那轮
的上下文；提前抹掉会让你以为没插进去。这条有测试锁死（「keeps notes across turn_complete」），
且变异探针验证过：改成跟 `turn_complete` 清 → 立刻变红。

**但 `turn_cancelled` 必须清。** 被取消的回合不会有下一条 `user_message`（那条清空挂在
**新一轮开始**上），不在这里清的话，上一轮的便签会一直挂在输入框上方，直到用户真的发下一条。
这是服务端语义之外、客户端必须自己补的一处 —— 服务端不需要处理它，因为它的清空是被动的。

另外三处随连接消亡而清：`disconnect`、`invalidateConnection`、会话被别的连接接管。

## 四、快照必须读，且合并方向与能力位相反

`hydrateLiveSnapshot` 读 `snapshot.feedback`（`session_state.rs:1653`，注释写明是为
「mid-turn attach 的客户端渲染那些一次性 `FeedbackSubmitted` 不会重放的便签」准备的）。
冷启动 / 重连进一个进行中的会话时，这是唯一来源。

合并规则与 `native_steering_available` **相反**，因为两者的权威方不同：

| | 权威方 | 规则 |
| --- | --- | --- |
| `nativeSteeringAvailable` | 服务端 | 单调升级、只认 `true`、`false` 与缺失都不回落 |
| 便签状态 | **实时流** | 同 id 保留实时那条，快照只补实时没有的 id |

理由：快照可能停在 `pending`，而 `feedback_consumed` 事件已经到了。

**空快照原样返回本地表。** 服务端在列表为空时不上线这个字段
（`skip_serializing_if = "Vec::is_empty"`），所以「缺失」是常态，当成「服务端说没有便签」
而清掉本地的，会让刚插入的便签闪一下就消失。探针验证：改成整表替换 → 两条变红。

## 五、乱序墓碑

`feedback_consumed` 可能先于 `feedback_submitted` 到达（广播乱序，或快照还没水合）。
`RuntimeSession.consumedFeedbackIds` 存 `id → 读取时刻`，`appendFeedbackNote` 落地时查一次。

不查墓碑的后果：那条便签会以 `pending` 复活在 agent 已经读过之后 —— 界面显示「等待读取」，
而它其实早就送到了。桌面端 `use-session-feedback.ts:96` / `:123` 也是这么做的。

## 六、乐观回显

`submit_session_feedback` 的响应体**就是那条便签**，与随后广播的 `feedback_submitted` 是同一个
`id`。所以 `runtime.recordFeedbackNote(...)` 走同一条幂等 append —— 先记不会变成两条。

不先记的话，在广播回来之前（relay 链路上是几百毫秒）界面上没有任何插入成功的痕迹。

## 七、渲染

插在输入框上方第 5 与第 6 之间（`upload-queue` 之后、`attachments-preview` 之前）——
都是「本轮临时状态清单」。

形制照 `.upload-queue`（`index.scss:2439`）而不是 `.permission-card`：后者带强调色边框和阴影，
那是「需要你操作」的形制；便签是只读回显，用轻底色 + 无边框。唯一的形制差别是**正文允许折行**
（`word-break: break-word` 而非 `u-line-1`）—— 文件名截断没损失，补充意见截断了就看不出插了
什么。

**四份主题覆盖清单都要加新类名**（`index.scss:231` sweet / `:280` summer / `:339` cyber /
`:506` matrix），漏一份那个主题下就是一块亮斑。

显示判据 `showFeedbackNotes` = 非空 **且** 运行中（`isStoppableRuntimeStatus`）。回合结束后
便签仍在 store 里（要等下一轮 `user_message` 才清），但那时它已经没有「正在影响这一轮」的
含义，挂着只挤占空间。桌面端同判据（`use-session-feedback.ts:387` 的 `showList`）。

## 测试

`tests/services/feedbackNotes.spec.ts`（新）**16 例**：双写归一化；无 id / 空正文丢弃；
未知状态退回 pending；`pending` 时不采信 `delivered_at`；按 id 幂等；乱序墓碑命中与不命中；
只翻命名 id；不覆盖已有 `deliveredAt`；为缺时刻的 delivered 补时刻；无变化时引用相等；
快照合并实时优先 / 只补新 id / 空快照原样返回。

`tests/services/feedbackEventWire.spec.ts`（新）**4 例**：平铺 `feedback_submitted` /
`feedback_consumed` 能被识别；无 item / 空 ids 的帧丢弃。

`tests/stores/conversationRuntime.spec.ts` 新增 `describe("turn feedback notes")` **11 例**：
记录便签；重放去重；consume 翻转；乱序 consume；下一轮清空；**turn_complete 不清**；
turn_cancelled 清；快照水合；空快照不擦；实时优先于旧快照；invalidate 清零。

**变异探针（本轮 7 次，全部命中）**：

- 纯函数层 3 次：忽略乱序墓碑 → 1 红；`markFeedbackNotesDelivered` 的 guard 去掉 → 1 红；
  空快照当成「服务端说没有」 → 1 红。
- store 层 3 次：改成跟 `turn_complete` 清 → 1 红；取消回合不清 → 1 红；快照整表替换 → 2 红。
- 协议层 1 次：删掉两个显式 case → 2 红（证明平铺事件确实会被静默丢弃）。

每次探针后源文件均 `diff -q` 字节一致。

> **一次探针存活暴露了真实缺陷**：`markFeedbackNotesDelivered` 里原本写
> `deliveredAt: item.deliveredAt ?? deliveredAt`，但上一行的 early-return 已经拦掉了所有
> `deliveredAt != null` 的情况 —— 那个 `??` 永远走不到，是**读起来像在防御、实际是死代码**的
> 写法。删掉它，并补了一条真正覆盖那个 guard 的测试（`delivered` 但缺 `deliveredAt` 的形状，
> 线上因为 `skip_serializing_if` 确实可达）。重跑探针后变红。

三道闸：jest **132 suites / 933 tests 全绿**（本轮基线 902，新增 31）；`tsc --noEmit` 恰好 5 条
既有基线错误，改动文件零错误；`./node_modules/.bin/uni build` DONE，仅剩既有的
`conversationSyncService` 动静混合导入告警。

## 原生 iOS / Android 复刻要点

1. **先确认线上载荷是平铺还是包了一层。** 服务端 `#[serde(flatten)]` 让所有 ACP 事件都是
   `{seq, connection_id, type, ...变体字段}`。如果你的归一化层有「未识别 type 就透传 `data`」
   这类兜底，平铺事件**不会**命中它 —— 会被静默丢弃。给每个要接的事件写显式分支，并用一条
   测试钉住线上形状。
2. **两态的含义取决于通道，不能照抄桌面端。** native `_session/steering` 的便签**出生即
   delivered**，永远不会收到自己的 `consumed`；pull `check_user_feedback` 的才有两帧。
   把 pull 的语义套到 native 上，会做出一个永远停在「等待读取」的假状态。
3. **`FeedbackConsumed` 仍然要接** —— 它承载的是**其他客户端**走 pull 通道发的便签。
4. **清空跟 `user_message`（新一轮开始），不跟 `turn_complete`。** 回合刚结束时便签仍然属于
   刚才那轮的上下文。
5. **但 `turn_cancelled` 要自己补一处清空** —— 取消的回合不会有下一条 `user_message`，
   服务端不需要处理这件事，客户端不补就会让便签一直挂着。
6. **快照必须读**（mid-turn attach 的唯一来源），且**空快照不等于「没有便签」** ——
   服务端空列表时不上线该字段。
7. **快照与实时的合并方向：便签状态实时优先，能力位服务端优先。** 同一份代码里两个字段两个
   方向，看起来像不一致，其实是权威方不同。写清楚理由，否则后来人一定会「统一」它们。
8. **乱序墓碑**：`consumed` 可能先到，不记的话便签会以 `pending` 复活在已读之后。
9. **乐观回显**：提交接口的响应体就是那条便签，与广播同 id，走同一条幂等 append。
10. **只在运行中显示列表**，且用只读轻形制（无强调边框）——它不是需要用户操作的卡片。

## 相关笔记

- [[2026-08-27-01-22-running-send-interception-and-native-steering]] —— 上一篇，发送侧；
  本文修正了它对 native 通道两态语义的错判
- [[2026-08-20-20-15-acp-error-surface-and-question-tabs]] —— 同一类「服务端早就发过来了、
  是客户端这侧丢的」，那次丢的是 `details` / `last_error`
- [[2026-08-19-05-26-conversation-detail-system-turn-role]] —— 「漏判一个取值就掉进 else 分支
  被当成正常」的同型陷阱，本文第二节的静默丢弃是它的协议层版本

## 待观察

- **`.queue-item` / `.shared-queue-*` 那整套 CSS 是孤儿**（`index.scss:2551` 起）：
  `RuntimeSession.sharedPromptQueue` 有字段，四份主题清单里也都列了这些类名，但 pane 模板里
  零引用。它是「输入框上方只读队列」的前作，形制与本次的便签列表几乎相同 —— 要么接上，
  要么删掉，留着会让人以为服务端队列已经渲染了。
- **中性胶囊仍然没有抽成组件。** `MessageBubble.vue` / `ToolCallGroupBlock.vue` /
  `SubagentCapsuleBlock.vue` 三处各写一遍 `__summary`，
  [[2026-08-20-11-58-system-note-neutral-capsule]] 的复刻要点 #2 就提了这件事，至今没做。
  本次的便签列表刻意没有用胶囊形制（它是清单不是胶囊），所以没有加剧问题，但也没有改善。
- **`index.vue` 里那套发送/队列死代码还在**（上一篇也记了这条）。
