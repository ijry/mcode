# 详情页丢弃空的「深度思考」胶囊

**文件**：`2026-08-19-12-41-conversation-detail-empty-thinking-parts.md`

## 现象

Claude 会话在 mcode 详情页里出现**很多个「深度思考」折叠块，点开全是空的**。
同一个会话在参考实现 codeg-plus 里看不到这些块。

## 根因：服务端确实会下发空 thinking，两端载荷相同

不是 mcode 造出来的，也不是解析 bug。链路如下：

1. Claude Code 的 transcript 里有 **redacted-thinking 胶囊**：
   `{"type":"thinking","thinking":"","signature":"…"}`。签名在、正文为空。
   对 reasoning-redacting 模型来说这个空状态是**永久**的 —— 正文永远不会补上来。
2. `codeg-plus/src-tauri/src/parsers/claude.rs:2126` 用 `as_str()` 取值。
   对 `""` 返回的是 `Some("")`（不是 `None`），于是**无条件** push 一个
   `Thinking { text: "" }`，没有任何 `is_empty` 守卫。
3. `group_into_turns`（`claude.rs:2549`）把一条 assistant 消息和它后面**所有**
   tool-result-only 消息折成**一个**轮次。工具密集的一轮里 N 个空胶囊
   因此全挤进同一个气泡 —— 这就是「很多个」的来源。

**结论：这是前端过滤问题，不是协议问题。** codeg-plus 收到的是完全一样的载荷，
它不显示纯粹因为前端有两层防御：

| 层 | 位置 | 做法 |
| --- | --- | --- |
| 适配器 | `src/lib/adapters/ai-elements-adapter.ts:1919-1930` | 丢弃空 reasoning，**gate 在 `!isStreaming`**，两条测试锁着（`ai-elements-adapter.test.ts:940` / `:969`） |
| 渲染层 | `src/components/content-parts-renderer.tsx:2854-2859` | `const hasContent = part.content.trim().length > 0; const expandable = hasContent \|\| part.isStreaming` |

mcode 两层都缺，所以本次把两层都补上。

## 关键约束：流式期间**不能**丢

这是本次最容易写错的一点，也是参考实现专门用注释和测试钉死的一点。

流式期间的空 thinking 是**合法的实时状态**：它驱动「正在思考」指示器。
对 reasoning-redacting 模型来说正文永远不会补上来，流式期间一并丢掉
就等于把「思考中」的反馈整个抹掉。

于是过滤只在**历史/回放路径**上做，流式累加器不碰。

## 改动

共享判定放在纯模块 `services/conversation/conversationTurnIdentity.ts`，
四处归一化共用一份，避免再次漂移：

```ts
export function isEmptyThinkingPart(part: ContentPart | null | undefined) {
  if (!part || (part as { type?: unknown }).type !== "thinking") return false
  return !String((part as { thinking?: unknown }).thinking ?? "").trim()
}

export function dropEmptyThinkingParts(parts: ContentPart[]): ContentPart[] {
  return parts.filter((part) => !isEmptyThinkingPart(part))
}
```

> 为什么在 `conversationTurnIdentity`（而不是 `conversationDetailPersistence`）：
> 后者 top-level import `services/db` → `sql.js/dist/sql-wasm.wasm?url`，
> 那个 `?url` 后缀只有 Vite 认，jest 里会直接报错。纯模块才能被测试直接引用。

五个接入点：

| 文件 | 位置 | 作用 |
| --- | --- | --- |
| `pages/conversation-detail/detailDataNormalization.ts:141` | `normalizeContentParts` 出口 | 展示侧归一化 |
| 同上 `:241` | `mapPersistedTurnToMessage` | **读回**时过滤存量缓存 |
| `services/conversation/conversationDetailPersistence.ts:271` | `normalizeContentParts` 出口 | 空块不再进 SQLite |
| `stores/conversationRuntime.ts:1968` | 私有 `mapPersistedTurnToMessage` | `reloadLocalTurns` 实际用的那份 |
| `components/MessageBubble.vue:289` | `displayParts` 内 | 渲染层兜底，gate 在 `!isStreaming.value` |

### 三个「为什么这样放」

**1. 为什么过滤在归一化的出口，而不是 `normalizeBlocks` / `normalizeContentPart` 里逐条跳过**

`selectNormalizedContentParts` 内部有三处 `if (parts.length > 0) return parts`，
用「这一路有没有解析出东西」做**分支选择**。在里面过滤会让「只有空 thinking」的
一轮变成 0 个 part、被判成解析失败，从而回退到另一条解析路径（比如把 `rawContent`
当字符串解析），渲染出一条本不该出现的 text。**那是行为改变。**
所以拆成 `normalizeContentParts`（出口过滤）包 `selectNormalizedContentParts`（原逻辑）。
测试 `emptyThinkingParts.spec.ts` 里
"does not mistake an all-empty-thinking turn for a parse failure" 钉的就是这条。

**2. 为什么读回时也要过滤**

过滤上线**前**落库的行里已经存了一批空胶囊。只在写入侧过滤治不了存量缓存 ——
本地水合会把它们原样读回来，用户重启 App 依然看到一排空块。两个
`mapPersistedTurnToMessage`（展示侧 + runtime 私有副本）都要包。

**3. 为什么渲染层的过滤在 `displayParts` 里而不是模板的 `v-else-if` 上**

折叠状态 `isThinkingCollapsed(index)` 用的是 `displayParts` 的**下标**。
在模板里跳过会让下标与实际渲染项错位 —— **点一个展开另一个**。

### 故意不改的地方

`conversationRuntime.ts` 的 `mapSnapshotContentBlock`（`:2085`）复原的是
**实时** `liveMessage`（`isStreaming: true`），所以**故意不过滤**。
只补了个 `|| ""` 修掉类型泄漏（漏了会得到 `thinking: undefined`）。
测试里有一条断言这个函数**不含** `dropEmptyThinkingParts`。

## 已知债务：`api/acp.ts` 的空 delta

`api/acp.ts` 把流式 delta 转成 part 时，空字符串 delta 仍会 mint 一个空 part：
`appendLiveContent`（`conversationRuntime.ts:234-264`）里
`buildEmptyContentPart(contentType)` 是在检查 delta **之前**构造的，
所以 `""` delta 在「尾部还不是 thinking」时照样会新建一个空 part。

**本次没修**。理由：它每轮最多多出一两个块，解释不了用户看到的「很多个」；
而真正的量来自上面 `group_into_turns` 那条。修它要动流式累加器的构造顺序，
风险与收益不匹配。**记为待观察项** —— 如果将来流式期间出现空块堆积，从这里查。

（第一版曾在 `api/acp.ts` 加过一行 `delta: firstString(record.text) || ""` 并附注释
声称「这样就不会 mint 空 part」。读 `appendLiveContent` 后发现该说法**是错的**，
已整文件回滚，不留误导性注释。）

## 兼容性

- **协议**：零改动。不新增/不修改任何字段，纯客户端过滤。
- **服务端**：不需要配合。空胶囊继续下发，客户端自己滤。
- **缓存**：写入侧从此不再落空块；存量脏行由读取侧过滤兜住，**不需要清缓存**，
  也不需要迁移脚本。
- **回滚**：删掉 5 个调用点即回到旧行为，无数据残留。

## 原生 iOS / Android 复刻要点

1. **必须自己过滤。** 服务端下发的 `thinking` 块可以是空字符串，且一轮里可能有很多个。
   不要指望协议层干净。
2. **判定**：`type == "thinking"` 且 `thinking`（blocks 分支里字段名是 `text`）
   trim 后为空。**只认 thinking** —— 空 `text` 块是合法的（工具轮次里的占位），
   顺手删会丢内容。
3. **两条分支字段名不同**：typed content 走 `thinking`，CodeG blocks 走 `text`。
   两条都要滤。
4. **只在非流式路径滤。** 流式期间保留空块，它驱动「正在思考」指示器，
   且对 reasoning-redacting 模型是永久状态。
5. **过滤点放在「解析完成后」**，不要放进逐块解析的循环里 —— 如果你的实现也用
   「这一路解析出没出东西」做分支选择（比如 blocks 优先、失败回退 content），
   在循环里过滤会改变分支走向。
6. **读本地缓存时也要滤**，否则治不了升级前存下的脏数据。
7. **内容被滤空的轮次要保留**（角色、时间戳、去重键仍是时间线的一部分）。
   丢了整条轮次会让远端对账认为本地少了一条而反复回填。
8. **折叠 UI 的索引**：如果折叠状态按下标记，过滤必须发生在生成渲染列表**之前**，
   不能在渲染时跳过 —— 否则下标错位，点一个展开另一个。

## 测试

- `tests/services/emptyThinkingParts.spec.ts`（新增，9 例）：判定的边界
  （空串 / 纯空白 / 缺字段 / 非 thinking / null）、typed 与 blocks 两条分支、
  「不误判成解析失败」、「轮次本身保留」、存量 SQLite 行读回时过滤、
  以及两条源码断言（渲染层 gate 在 `!isStreaming`、`mapSnapshotContentBlock` 不过滤）。
- `tests/services/conversationDetailPersistence.spec.ts`（新增 1 例）：
  空胶囊不进 SQLite。

## 相关笔记

- [[2026-08-19-05-26-conversation-detail-system-turn-role]] —— `TurnRole` 的第三种取值
  （同样是「服务端字段被客户端漏判」这一类问题）
- [[2026-08-18-23-51-conversation-detail-live-message-overlap]] —— `live_message`
  是整轮累加器，解释了流式路径为什么和历史路径分开
