# 本地缓存最新页消息：实验性开关，默认关闭

**文件**：`2026-08-19-18-32-conversation-detail-local-turn-cache-toggle.md`

## 现象（用户原话）

> 本地缓存最新页数据开关放设置里实验性功能、默认关闭 开发下

## 开关语义：关 = **完全不用**本地缓存

这是本次最需要写清的一件事，因为「只关写入」是个看起来更保守、实际更危险的选项。

| | 轮次写入 SQLite | 从 SQLite 水合轮次 | 会话摘要 |
| --- | --- | --- | --- |
| 开 | 是（只写最新页） | 是 | 写 |
| **关（默认）** | **不写** | **不读** | **照写** |

### 为什么两侧必须一起关

只关写入的话，**之前开启期间留下的旧行仍会被读回来**。那些行可能已经很旧，而
`mergeTailIntoTurns` 是按接缝合并的 —— 找不到接缝时它会把这批旧轮次**接在当前轮次之后**。
用户看到的是一段错位的历史「复活」，位置还在最新消息下面。

这不会报错，看起来像是消息乱序。比「详情页要等网络」严重得多。

### 为什么摘要不受这个开关管

`conversations` 表（列表页的标题/状态/未读）**不在**这个开关的语义里。一起关掉会让会话
列表在离线时整个空白 —— 那同样是比「详情页要等网络」严重得多的退化，而且用户从
「本地缓存最新页**消息**」这个开关名里读不出「列表也会空」。

`persistConversationDetailSnapshot` 因此只 gate 轮次那一半，摘要照写。

### 接受的代价

冷启动没有可先渲染的本地内容，必须等远端返回。这一条是明确确认过的取舍：这个开关默认
关闭、标为实验性，正是因为本地缓存这条路还有未收敛的问题；等网络是可预期的慢，
错位历史是不可预期的错。

---

## 5 个 gate 点

2 个写入 + 3 个读取。**任何一处漏掉都会破坏「完全不用」的语义**，且都是静默的。

| # | 侧 | 位置 | 行为 |
| --- | --- | --- | --- |
| 1 | 写 | `conversationDetailPersistence.ts:59` | `input.persistTurns !== false && readLocalTurnCacheEnabled()` |
| 2 | 写 | `conversationRuntime.ts:1863`（`persistCompletedTurns`） | 提前 `return false` |
| 3 | 读 | `conversationRuntime.ts:1901`（`reloadLocalTurns`） | 提前 `return session.localTurns` |
| 4 | 读 | `pages/conversation-detail/index.vue:1780` | `localTurns.length === 0 && readLocalTurnCacheEnabled()` |
| 5 | 读 | `pages/conversation-detail/index.vue:3008` | `!input.hasHotRuntime && readLocalTurnCacheEnabled()` |

### `persistCompletedTurns` 必须返回 `false`，不是 `undefined` / `true`

调用方按返回值分支：

- `true` → 走 `reloadLocalTurns`（从 SQLite 重读）
- `false` → 把刚完成的轮次经 `dedupeTurnsByRoleAndId` **直接并进内存** `session.localTurns`

关闭时返回 `true` 会让它去 `reloadLocalTurns` 读一个空表 —— **刚说完的话当场消失**。
返回 `undefined` 同样落到 falsy 分支、行为正确，但语义含糊；写成显式 `false` 并在测试里
锁住这个返回值。

### `reloadLocalTurns` 必须返回 `session.localTurns`，不是 `[]`

同理：返回空数组会把内存时间线清空。关闭时它的正确行为是**原样返回内存里的东西，
一行都不读**。

---

## 关掉时清理已缓存的轮次

`pages/settings/index.vue` 的 `handleLocalTurnCacheChange` 在切到 OFF 时调用
`clearCachedConversationTurns()`。

**不清会怎样**：那些行变成「幽灵行」—— 读写两侧都已关闭，谁都不会再碰它们，但仍占着
存储，**还被「清除缓存」页面算进条数**（`cacheManager` 的 conversation-sqlite 项）。
用户看到一个删不掉、又说不清来源的数字。

**只删轮次**：`clearCachedConversationTurns` 只 `DELETE FROM conversation_parts` +
`conversation_turns`，`conversations` / `folders` 表留着。选 `clearCachedConversationTurns`
而不是 `clearCachedConversationData` 是刻意的 —— 后者会连摘要一起删，让列表页离线空白
（理由同上）。测试里用 `expect(source).not.toContain("clearCachedConversationData")`
把这个选择锁住。

**失败不阻塞**：读取点已经被开关挡住，残留的行是惰性的；下次切换开关或走「清除缓存」
还有机会收拾。所以 `try/catch` 里只降级吐司文案（「已关闭本地缓存（旧数据清理失败）」），
不回滚开关。

---

## 偏好归一化：只认严格 `true`

`services/conversation/localTurnCachePreference.ts`：

```ts
function normalizeEnabled(value: unknown) {
  return value === true      // 不是 Boolean(value)
}
```

历史上存过字符串 `"true"` / `"yes"` 的键会被当成**关闭**。宁可退回默认值，也不要把一个
来历不明的真值解释成开启 —— 这个开关控制的是**往本机落盘**，误开的代价是写了一堆用户
没同意写的数据。

`readLocalTurnCacheEnabled` 会把归一化后的布尔量**回写**存储，让存储里永远是布尔，
后续读取不再依赖 normalize 的宽容度。

模块保持**纯粹**：只 import `uni` 全局，**不 import `services/db`**（那会拉进
`sql.js` 的 `?url` 导入，jest 里直接炸）。这是仓库既有的分层约束。

---

## 与「缓存只存最新一页」策略的关系

这个开关叠在既有策略之上，不改变它：

- 缓存**只保留最新一页**（30 条），往上翻页得到的更早历史**不落库**、永远走远端；
- 所以 `reloadLocalTurns` 固定按一页读取，再用 `mergeTailIntoTurns` 把内存里更早的前缀
  **接回去**，而不是整体替换 —— 否则用户翻到 200 条后发一条消息就会被砍回 30 条
  （详见 [[2026-08-19-05-14-conversation-detail-tail-window-only]]）。

开关关闭时这套合并逻辑整条不执行，风险面反而更小。这也是选它作默认值的一个附带理由。

### 落盘裁剪：让「只存最新一页」成为事实而非巧合

两条写入路径里只有一条天然收敛：

| 路径 | 写法 | 是否收敛 |
| --- | --- | --- |
| `replaceCompletedTurns`（远端 detail 落库） | 先 `DELETE` 整个会话再插 | 是 |
| `insertCompletedTurn`（`turn_complete` 逐条追加） | 只 `upsert`，**从不删** | **否** |

追加路径原先没有任何裁剪，所以会话开着一直聊，缓存就单调增长 —— 聊到 300 轮，
库里就躺着 300 轮。**这是个完全静默的存储泄漏**：读取侧的 `getNewestTurns(..., 30)`
带 LIMIT，多出来的行永远读不到，功能上看不出任何异常；它们只是长期占着手机存储，
并被「清除缓存」页面算进条数。「只存最新一页」于是只是读取侧的巧合，不是落盘事实。

新增 `pruneConversationTurnsToNewest(conversationId, keep)`
（`conversationRepository.ts`），两条路径都收敛到它：

- `persistCompletedTurns` 在插入**之后**调用。顺序不能反 —— 反了的话刚完成的这一轮
  会被算进「更早的」而当场删掉，用户看到刚说完的话消失；
- `replaceCompletedTurns` 在**同一个事务内**调用内部版。远端一页实际可能返回
  30~230 条（服务端把窗口起点向前对齐到 user 轮次边界，`ROUND_ALIGN_CAP = 200` 兜底），
  所以全量替换那条路也需要裁。

三个必须照抄的实现细节：

1. **排序键与 `getNewestTurns` 逐字一致**（`COALESCE(seq, created_at) DESC, id DESC`）。
   不一致的话「读取侧认为的最新 30 条」与「裁剪侧保留的 30 条」是两个不同集合，
   刚写进去的轮次可能当场被裁掉。
2. **先删 `conversation_parts`，再删 `conversation_turns`。** schema 里 parts 是普通表、
   **没有外键 CASCADE**（`schema.ts`），反序会留下一批查不到宿主轮次的孤儿 part 行 ——
   那比不裁剪更糟：占着存储，且再没有任何路径会清理它们。
3. **`sqliteDriver.transaction` 不支持嵌套**（无条件发 `BEGIN IMMEDIATE`、没有 SAVEPOINT）。
   所以裁剪拆成「导出版（自己开事务）」+「内部版（不开）」，`replaceCompletedTurns`
   复用内部版。直接调导出版会报 "cannot start a transaction within a transaction"。

选取语句是 `LIMIT -1 OFFSET ?`（跳过最新 N 条、剩下的全要）—— SQLite 要求带 `LIMIT`
才能用 `OFFSET`，`-1` 表示无上限。已在真实 sql.js 上验证四种形态：参数化、
App-Plus 的字符串插值字面量、OFFSET 大于总数（返回空集）、`seq` 为 NULL 时回落
`created_at` 且与读取侧同序。

非正/非有限的 `keep` 统一退回默认一页，而**不是**钳到 1：两者都是编程错误，但
「只保留 1 条」几乎等于静默清空这个会话的缓存。（这一条是测试逼出来的 —— 初版写成
`Math.max(1, Math.floor(keep) || KEEP)`，`keep=0` 走 falsy 兜底得到 30、`keep=-5`
钳到 1，同样荒谬的入参给出两个不同答案。）

关闭开关时裁剪整条不执行 —— 没写入就没有要裁的东西，且开关关闭时不应有任何 SQLite
写操作。切到 OFF 的存量清理由设置页的 `clearCachedConversationTurns` 负责（见上文）。

---

## 设置页位置

放在「实验性功能」分组里，与「会话列表实时消息流」「同步 PC 端 TAB」并列，
分组说明文案随之更新为：

> 实时信息流、本地缓存消息和同步 PC 端 TAB 仅供体验，不建议正式使用

---

## 原生 iOS / Android 复刻要点

1. **开关必须同时 gate 读和写**，只 gate 写会让旧行以错位的位置复活。
2. **只 gate 轮次，不要 gate 会话摘要** —— 否则列表页离线空白。
3. **「不落库」的返回值要能让调用方走内存合并分支**，不要让它去读空表。
4. **偏好归一化只认严格 `true`**（写往本机落盘的开关，宁可默认关）。
5. **切到 OFF 时清理已缓存轮次**，且只清轮次表；清理失败不回滚开关。
6. 默认值 = 关。原生端如果沿用同一个存储键，注意历史值可能是字符串。
7. **逐条追加的那条写入路径必须自己裁剪回一页**，且裁剪要满足三个条件：排序键与读取
   查询逐字一致、先删 part 再删轮次（表间无 CASCADE）、复用调用方已开的事务而不是
   自己再开一个。不裁剪不会报错也看不出问题，只是长期占用手机存储 —— 是个静默泄漏。

---

## 测试

- `tests/services/localTurnCachePreference.spec.ts`（新增，4 例）：默认关闭；开/关持久化；
  未知值（`"yes"` / `"true"` / `1`）全部归一成 `false`；模块无 SQLite 依赖。
- `tests/services/conversationDetailPersistence.spec.ts`：`beforeEach` 里显式
  `writeLocalTurnCacheEnabled(true)`（既有两条断言讲的是「开着时写什么」）；新增一条
  「关闭时写摘要但不写任何轮次」—— 同时断言 `replaceCompletedTurns` **未被调用**、
  `persistedTurnCount === 0`、`upsertConversationSummary` **被调用一次**。
  > `tests/setup/petTestSetup.cjs` 走 `setupFilesAfterEnv`，它的全局 `beforeEach`
  > （`storage.clear()`）在**套件自己的** `beforeEach` 之前跑，所以在套件 `beforeEach`
  > 里写偏好是安全的、能活到每个 test。
- `tests/stores/conversationRuntime.spec.ts`：新增两条 OFF 行为 ——
  ①`insertCompletedTurn` 与 `getNewestTurns` **都没被调用**；
  ②缓存里躺着陈旧行时，刚完成的轮次留在内存、陈旧行**一条都没被读回来**
  （这条同时锁住 `persistCompletedTurns` 返回 `false` 的语义）。
- `tests/pages/profile/settingsPageContract.spec.ts`：开关标题/文案/`readLocalTurnCacheEnabled`
  出现；「清轮次但留摘要」的选择（含 `not.toContain("clearCachedConversationData")`）。
- `tests/services/conversationRepository.spec.ts`：新增 `pruneConversationTurnsToNewest`
  6 例 —— ①先删 part 再删轮次（断言 `turn_id IN (?, ?)` 与 id 数组）；②排序键与
  `getNewestTurns` 逐字一致、且用 `LIMIT -1 OFFSET ?`；③空集提前返回（同时防住拼出
  语法错误的 `IN ()`）；④`[0, -5, NaN, Infinity]` 全部退回默认一页；⑤全量替换路径
  **只开一次事务**（锁住不嵌套的约束）；⑥`CONVERSATION_TURN_CACHE_KEEP` 与
  `DEFAULT_CONVERSATION_HISTORY_PAGE_SIZE` 同值。
- `tests/stores/conversationRuntime.spec.ts`：另新增两条裁剪行为 ——
  ①`toHaveBeenCalledWith(1, 30)`，且用 `mock.invocationCallOrder` 断言
  **插入先于裁剪**（反了会把刚完成的轮次当「更早的」删掉）；②开关关闭时裁剪
  **未被调用**。
- 全量：122 suites / 778 tests 通过；`tsc --noEmit` 维持 3 条既有基线错误；
  `npx uni build` 通过。

## 相关笔记

- [[2026-08-19-18-32-conversation-detail-subagent-capsule]] —— 同批改动的另一半
- [[2026-08-19-05-14-conversation-detail-tail-window-only]] —— 「缓存只存最新一页」
  策略与窗口协议契约
- [[2026-08-18-19-56-conversation-detail-turn-identity-dedupe]] —— `mergeTailIntoTurns`
  的接缝与身份别名，解释了「找不到接缝就接在后面」为什么是错位历史的成因
- [[2026-08-19-14-13-conversation-detail-history-pull-refresh]] —— 窗口三元组与翻页自锁
- [[2026-06-11-profile-cache-clear]] —— 「清除缓存」页面的分项统计，幽灵行会被它算进条数
