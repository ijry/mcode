import {
  clearForgeInbox,
  drainForgeRowUpdates,
  forgeInboxKey,
  mergeForgeRowUpdate,
  publishForgeRowUpdate,
  putForgeSeed,
  resetForgeInbox,
  takeForgeSeed,
} from "@/services/forge/forgeRowInbox"
import type { ForgeIssueRow } from "@/types/forge"

function rowWith(overrides: Partial<ForgeIssueRow> = {}): ForgeIssueRow {
  return {
    number: 42,
    title: "t",
    body: null,
    state: "open",
    draft: false,
    labels: [],
    author: null,
    author_avatar: null,
    updated_at: null,
    html_url: "",
    is_pr: false,
    comments: 0,
    ...overrides,
  }
}

beforeEach(() => {
  resetForgeInbox()
})

describe("forgeInboxKey", () => {
  /**
   * **键必须带仓库。** `issue:42` 在两个仓库里是两件完全不同的事，而同号在真实项目里
   * 非常常见 —— 少了这一层，「在 A 仓库关掉 #42 → 返回 → 切到 B 仓库」会把 B 的 #42
   * 改成 A 那一行的内容。
   */
  it("separates the same number in different repositories", () => {
    expect(forgeInboxKey("conn", 1)).not.toBe(forgeInboxKey("conn", 2))
    expect(forgeInboxKey("a", 1)).not.toBe(forgeInboxKey("b", 1))
  })
})

describe("seed", () => {
  it("hands the row to the detail page", () => {
    putForgeSeed("conn", 1, rowWith({ number: 7 }))
    expect(takeForgeSeed("conn", 1, "issue", 7)?.number).toBe(7)
  })

  /**
   * **取完即删。** 一个留着的 seed 会在用户从别处（冷启动、通知）直达详情页时被当成
   * 那一条的内容显示出来，而它可能是上周那个 issue。
   */
  it("is consumed on the first read", () => {
    putForgeSeed("conn", 1, rowWith({ number: 7 }))
    expect(takeForgeSeed("conn", 1, "issue", 7)).not.toBeNull()
    expect(takeForgeSeed("conn", 1, "issue", 7)).toBeNull()
  })

  /** 坐标不对说明这个详情页不是从列表点进来的 —— 那就让它自己去拉（正确的慢路径）。 */
  it("refuses a seed for a different item", () => {
    putForgeSeed("conn", 1, rowWith({ number: 7, is_pr: false }))
    expect(takeForgeSeed("conn", 1, "issue", 8)).toBeNull()

    putForgeSeed("conn", 1, rowWith({ number: 7, is_pr: false }))
    // GitLab 的 issue 与 MR 各有一套编号，`issue:7` 与 `pr:7` 是两个工作项。
    expect(takeForgeSeed("conn", 1, "pr", 7)).toBeNull()
  })

  /** 每格只留一个 seed：同一时刻只有一个详情页开着。 */
  it("keeps only the latest seed per repository", () => {
    putForgeSeed("conn", 1, rowWith({ number: 7 }))
    putForgeSeed("conn", 1, rowWith({ number: 8 }))
    expect(takeForgeSeed("conn", 1, "issue", 7)).toBeNull()
  })

  it("does not leak a seed across repositories", () => {
    putForgeSeed("conn", 1, rowWith({ number: 7 }))
    expect(takeForgeSeed("conn", 2, "issue", 7)).toBeNull()
  })
})

describe("write-back", () => {
  it("carries the authoritative row back to the list", () => {
    publishForgeRowUpdate("conn", 1, rowWith({ number: 7, state: "closed" }))
    const drained = drainForgeRowUpdates("conn", 1)
    expect(drained).toHaveLength(1)
    expect(drained[0].state).toBe("closed")
  })

  /**
   * **必须清空。** 留着会在下一次 onShow 再应用一遍，把用户之后做的改动覆盖回去。
   */
  it("empties the bucket when drained", () => {
    publishForgeRowUpdate("conn", 1, rowWith())
    expect(drainForgeRowUpdates("conn", 1)).toHaveLength(1)
    expect(drainForgeRowUpdates("conn", 1)).toHaveLength(0)
  })

  /** 同一行被改多次只留最后一次 —— 那才是当前状态。 */
  it("keeps only the latest update per row", () => {
    publishForgeRowUpdate("conn", 1, rowWith({ number: 7, state: "closed" }))
    publishForgeRowUpdate("conn", 1, rowWith({ number: 7, state: "open" }))
    const drained = drainForgeRowUpdates("conn", 1)
    expect(drained).toHaveLength(1)
    expect(drained[0].state).toBe("open")
  })

  it("keeps an issue and a pull request of the same number apart", () => {
    publishForgeRowUpdate("conn", 1, rowWith({ number: 7, is_pr: false }))
    publishForgeRowUpdate("conn", 1, rowWith({ number: 7, is_pr: true }))
    expect(drainForgeRowUpdates("conn", 1)).toHaveLength(2)
  })

  it("does not deliver a write-back to another repository", () => {
    publishForgeRowUpdate("conn", 1, rowWith())
    expect(drainForgeRowUpdates("conn", 2)).toHaveLength(0)
    expect(drainForgeRowUpdates("other", 1)).toHaveLength(0)
  })

  /**
   * 切仓库要丢掉整格。不丢的后果不是「多应用几行」而是**错误地应用**：切回来时那些
   * 写回已经过时了（中间可能有别人改过），而它们会盖掉一次刚成功的列表刷新。
   */
  it("drops the whole bucket when the repository changes", () => {
    publishForgeRowUpdate("conn", 1, rowWith())
    putForgeSeed("conn", 1, rowWith())
    clearForgeInbox("conn", 1)
    expect(drainForgeRowUpdates("conn", 1)).toHaveLength(0)
    expect(takeForgeSeed("conn", 1, "issue", 42)).toBeNull()
  })
})

describe("mergeForgeRowUpdate", () => {
  it("lets the forge's row win on everything it knows", () => {
    const previous = rowWith({ state: "open", title: "old" })
    const updated = rowWith({ state: "closed", title: "new" })
    const merged = mergeForgeRowUpdate(previous, updated)
    expect(merged.state).toBe("closed")
    expect(merged.title).toBe("new")
  })

  /**
   * **但单条目响应与列表行不完全一样。** GitLab 的 `with_labels_details` 是列表端点的
   * 参数，单条目只回标签**名字** —— 用户一按关闭，面板上每颗彩色胶囊都会掉成灰的。
   */
  it("restores a colour the single-item response could not carry", () => {
    const previous = rowWith({ labels: [{ name: "bug", color: "#d73a4a" }] })
    const updated = rowWith({ labels: [{ name: "bug", color: null }] })
    expect(mergeForgeRowUpdate(previous, updated).labels[0].color).toBe("#d73a4a")
  })

  /** 只补「新行没颜色而旧行有同名标签的颜色」的那些，不动 forge 真的给了颜色的。 */
  it("does not override a colour the forge actually sent", () => {
    const previous = rowWith({ labels: [{ name: "bug", color: "#d73a4a" }] })
    const updated = rowWith({ labels: [{ name: "bug", color: "#0e8a16" }] })
    expect(mergeForgeRowUpdate(previous, updated).labels[0].color).toBe("#0e8a16")
  })

  /** 新加的标签在旧行里没有对应名字，保持 null（走中性胶囊）。 */
  it("leaves an unknown label colourless", () => {
    const previous = rowWith({ labels: [{ name: "bug", color: "#d73a4a" }] })
    const updated = rowWith({ labels: [{ name: "p1", color: null }] })
    expect(mergeForgeRowUpdate(previous, updated).labels[0].color).toBeNull()
  })

  /** GitHub 总是回完整的标签对象，这是常见情况 —— 不该为它付一次查表。 */
  it("returns the incoming labels untouched when none are missing colour", () => {
    const updated = rowWith({ labels: [{ name: "bug", color: "#d73a4a" }] })
    const merged = mergeForgeRowUpdate(rowWith(), updated)
    expect(merged.labels).toBe(updated.labels)
  })

  it("passes the update through when there is nothing to merge against", () => {
    const updated = rowWith({ labels: [{ name: "bug", color: null }] })
    expect(mergeForgeRowUpdate(null, updated)).toBe(updated)
  })
})
