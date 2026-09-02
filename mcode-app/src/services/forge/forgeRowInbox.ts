import type { ForgeIssueRow } from "@/types/forge"

/**
 * 列表页 ↔ 详情页之间的**写回信箱**与首屏 seed。
 *
 * ## 为什么需要它
 *
 * 桌面端的详情是一个**非模态右侧抽屉**，与列表页共享同一份 React state：在抽屉里
 * 关掉一个 issue，`onRowUpdated` 直接改列表持有的那一行；列表刷新又反过来把新行喂回
 * 抽屉。手机端的详情是 `navigateTo` 出去的**另一个页面**，这条双向线断了。
 *
 * 补法是一个模块级信箱（形状同既有的
 * `services/conversation/openedTabsRealtimeCache.ts`）：
 * - **下行**（列表 → 详情）：seed。首屏内容不能走 URL —— issue body 上限 16000 字符；
 * - **上行**（详情 → 列表）：写回。列表在 `onShow` 时排空并应用。
 *
 * ## 为什么不能直接在列表 onShow 重拉了事
 *
 * GitHub 的列表来自 **search 索引**，它落后一次写入几秒到几分钟。从详情页返回时重拉，
 * 极大概率拿回「刚刚被改掉的那个状态」并把它盖上去 —— 用户看着关闭成功的 issue 又变回
 * open。所以写回必须由详情页**主动交出**权威的那一行（`forge_set_item_state` 的返回值
 * 就是权威的），列表原地替换。
 *
 * ## 键必须带仓库
 *
 * `issue:42` 在两个仓库里是两件完全不同的事，而同号在真实项目里非常常见。所以信箱按
 * `${connectionKey}:${folderId}` 分格 —— 少了这一层，「在 A 仓库关掉 #42 → 返回 →
 * 切到 B 仓库」会把 B 的 #42 改成 A 那一行的内容。
 */

/** 一格信箱的键。 */
export function forgeInboxKey(connectionKey: string, folderId: number): string {
  return `${connectionKey}:${folderId}`
}

/** 一行的身份键（与 `pages/forge/forgeListScope.forgeRowKey` 同一套规则）。 */
function rowKey(row: Pick<ForgeIssueRow, "number" | "is_pr">): string {
  return `${row.is_pr ? "pr" : "issue"}:${row.number}`
}

/* ===== 下行：详情页首屏 seed ===== */

/**
 * 每格只留**一个** seed。
 *
 * 不是 Map<rowKey, row> —— 同一时刻只有一个详情页开着，留着上一次的 seed 只会在下次
 * 冷启动直达时喂给它一份属于别的条目的内容。详情页取用时立刻清掉（`takeForgeSeed`）。
 */
const seeds = new Map<string, ForgeIssueRow>()

/** 列表页在 navigateTo 之前放下这一行。 */
export function putForgeSeed(
  connectionKey: string,
  folderId: number,
  row: ForgeIssueRow
): void {
  seeds.set(forgeInboxKey(connectionKey, folderId), row)
}

/**
 * 详情页取用 seed，**取完即删**。
 *
 * 删是必须的：一个留着的 seed 会在用户从别处（冷启动、通知）直达详情页时被当成那一条
 * 的内容显示出来，而它可能是上周那个 issue。取不到就自己去拉 —— 那是正确的慢路径。
 *
 * `kind` + `number` 要对上：seed 是「刚刚点的那一行」，如果不匹配说明这个详情页不是
 * 从列表点进来的。
 */
export function takeForgeSeed(
  connectionKey: string,
  folderId: number,
  kind: "issue" | "pr",
  number: number
): ForgeIssueRow | null {
  const key = forgeInboxKey(connectionKey, folderId)
  const seed = seeds.get(key)
  if (!seed) return null
  seeds.delete(key)
  if (rowKey(seed) !== `${kind}:${number}`) return null
  return seed
}

/* ===== 上行：写回 ===== */

/** 一格里按行身份归档的写回。同一行被改多次只留最后一次 —— 那才是当前状态。 */
const writes = new Map<string, Map<string, ForgeIssueRow>>()

/**
 * 详情页交出权威的那一行。
 *
 * 「权威」的意思是它来自一次写操作的响应（`forge_set_item_state` /
 * `forge_merge_change` / `forge_create_issue`），而不是本地推断出来的状态。
 */
export function publishForgeRowUpdate(
  connectionKey: string,
  folderId: number,
  row: ForgeIssueRow
): void {
  const key = forgeInboxKey(connectionKey, folderId)
  const bucket = writes.get(key) || new Map<string, ForgeIssueRow>()
  bucket.set(rowKey(row), row)
  writes.set(key, bucket)
}

/**
 * 列表页排空这一格。
 *
 * 返回的顺序无关紧要（每一行各自替换），但**必须清空** —— 留着会在下一次 onShow 再
 * 应用一遍，把用户之后做的改动覆盖回去。
 */
export function drainForgeRowUpdates(
  connectionKey: string,
  folderId: number
): ForgeIssueRow[] {
  const key = forgeInboxKey(connectionKey, folderId)
  const bucket = writes.get(key)
  if (!bucket || bucket.size === 0) return []
  writes.delete(key)
  return Array.from(bucket.values())
}

/**
 * 丢掉一格（切仓库时用）。
 *
 * 不丢的后果不是「多应用几行」而是**错误地应用**：切回这个仓库时那些写回已经过时了
 * （中间可能有别人改过），而它们会盖掉一次刚刚成功的列表刷新。
 */
export function clearForgeInbox(connectionKey: string, folderId: number): void {
  const key = forgeInboxKey(connectionKey, folderId)
  writes.delete(key)
  seeds.delete(key)
}

/** 测试与「清除缓存」用。 */
export function resetForgeInbox(): void {
  writes.clear()
  seeds.clear()
}

/**
 * 把 forge 返回的行合并到已有的那一行上，**补回它没带的标签颜色**。
 *
 * 一次关闭 / 重开会把条目按 forge 现在的样子交回来，那份是权威的 —— 它是一个刚在
 * 浏览器里被合并的 PR 以 `merged` 而不是本地翻转出的 `closed` 回来的原因。
 *
 * 但**单条目的响应与列表行不完全一样**：GitLab 的 `with_labels_details` 是列表端点的
 * 参数，单条目只回标签**名字**，于是用户一按关闭，面板上每颗彩色胶囊都会掉成灰的。
 *
 * 所以：forge 的行在它真正知道的每件事上都赢，只有「新行没有颜色而旧行有同名标签的
 * 颜色」时才补回来。一个在 forge 上真的改了颜色的标签会保留旧色到下次列表刷新 ——
 * 那是个远比重绘整行便宜的错。
 *
 * 与桌面端 `src/lib/forge-row-update.ts` 的 `mergeForgeRowUpdate` 同一套规则。
 */
export function mergeForgeRowUpdate(
  previous: ForgeIssueRow | null,
  updated: ForgeIssueRow
): ForgeIssueRow {
  if (!previous) return updated
  return { ...updated, labels: withKnownColors(previous.labels, updated.labels) }
}

function withKnownColors(
  previous: ForgeIssueRow["labels"],
  incoming: ForgeIssueRow["labels"]
): ForgeIssueRow["labels"] {
  // 没什么要补的 —— GitHub 总是回完整的标签对象，这是常见情况，不该为它付一次查表。
  if (!incoming.some((label) => label.color == null)) return incoming
  const known = new Map(
    previous.filter((label) => label.color != null).map((label) => [label.name, label.color])
  )
  return incoming.map((label) =>
    label.color == null && known.has(label.name)
      ? { ...label, color: known.get(label.name) ?? null }
      : label
  )
}
