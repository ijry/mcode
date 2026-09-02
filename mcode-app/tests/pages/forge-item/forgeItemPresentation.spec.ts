import {
  appendForgeComments,
  appendPostedForgeComment,
  forgeCommentFailureText,
  forgeCommentTimeText,
  forgeDetailTabLabel,
  forgeDetailTabsFor,
  forgeItemStateLabel,
  forgeStateActionFor,
  forgeStateActionLabel,
  forgeStateConfirmText,
  validateForgeCommentBody,
} from "@/pages/forge-item/forgeItemPresentation"
import { FORGE_MAX_COMMENT_CHARS } from "@/types/forge"
import type { ForgeComment } from "@/types/forge"

function commentWith(overrides: Partial<ForgeComment> = {}): ForgeComment {
  return {
    id: "1",
    author: "octocat",
    author_avatar: null,
    body: "hi",
    created_at: "2026-09-01T00:00:00Z",
    updated_at: null,
    html_url: null,
    ...overrides,
  }
}

describe("forgeDetailTabsFor", () => {
  /**
   * issue 只有对话 —— 它没有分支、没有 CI、没有 diff。给它画三个 tab 里两个空的，是把
   * 「这里没有内容」伪装成「你还没看」。
   */
  it("gives an issue only the conversation", () => {
    expect(forgeDetailTabsFor("issue")).toEqual(["conversation"])
  })

  it("gives a pull request all three panes", () => {
    expect(forgeDetailTabsFor("pr")).toEqual(["conversation", "checks", "files"])
  })

  it("labels every tab", () => {
    const labels = forgeDetailTabsFor("pr").map(forgeDetailTabLabel)
    expect(new Set(labels).size).toBe(3)
    labels.forEach((label) => expect(label).toBeTruthy())
  })
})

describe("forgeItemStateLabel", () => {
  it("spells out the three normalized states", () => {
    expect(forgeItemStateLabel({ state: "open", draft: false, is_pr: false })).toBe("进行中")
    expect(forgeItemStateLabel({ state: "closed", draft: false, is_pr: false })).toBe("已关闭")
    expect(forgeItemStateLabel({ state: "merged", draft: false, is_pr: true })).toBe("已合并")
  })

  /** 与列表字形共享判据：草稿 PR 的线上 state 是 open，但它的意思是「还没准备好」。 */
  it("lets draft win on a pull request", () => {
    expect(forgeItemStateLabel({ state: "open", draft: true, is_pr: true })).toBe("草稿")
    expect(forgeItemStateLabel({ state: "open", draft: true, is_pr: false })).toBe("进行中")
  })

  /** 未知状态原样显示 —— 服务端可能新增状态，编一个说法比透传更糟。 */
  it("passes an unknown state through", () => {
    expect(forgeItemStateLabel({ state: "locked", draft: false, is_pr: false })).toBe("locked")
  })
})

describe("forgeStateActionFor", () => {
  it("offers the opposite of the current state", () => {
    expect(forgeStateActionFor({ state: "open" })).toBe("close")
    expect(forgeStateActionFor({ state: "closed" })).toBe("reopen")
  })

  /**
   * 已合并的 PR **没有**按钮：两个 forge 都不允许重开一个已合并的变更，给一颗必然
   * 失败的按钮比不给更糟。
   */
  it("offers nothing on a merged change", () => {
    expect(forgeStateActionFor({ state: "merged" })).toBeNull()
  })

  it("labels both actions", () => {
    expect(forgeStateActionLabel("close")).toBe("关闭")
    expect(forgeStateActionLabel("reopen")).toBe("重新打开")
  })
})

describe("forgeStateConfirmText", () => {
  /**
   * 确认文案必须说清**这会发生在远端仓库上，所有关注者都会看到** —— 手机上误触一颗
   * 按钮的代价在这里不是本地状态，而是一群人的通知。
   */
  it("says the change is remote and visible to others", () => {
    const copy = forgeStateConfirmText("close", "Crash on save", "issue")
    expect(copy.content).toContain("远端仓库")
    expect(copy.content).toContain("关注")
    expect(copy.content).toContain("Crash on save")
  })

  it("uses each kind's own noun", () => {
    expect(forgeStateConfirmText("close", "t", "pr").title).toContain("变更")
    expect(forgeStateConfirmText("close", "t", "issue").title).toContain("Issue")
  })

  /** 关闭要说「之后还能重新打开」—— 那是这个动作可逆性的唯一说明。 */
  it("mentions that closing is reversible", () => {
    expect(forgeStateConfirmText("close", "t", "issue").content).toContain("重新打开")
  })
})

describe("forgeCommentTimeText", () => {
  const format = (iso: string) => `[${iso}]`

  it("shows the creation time", () => {
    expect(forgeCommentTimeText(commentWith(), format)).toBe("[2026-09-01T00:00:00Z]")
  })

  /**
   * `updated_at` 只在 forge 说它与 created_at 不同时才存在（后端已过滤）—— 它出现就
   * 意味着真的被编辑过，不要自己再比一次（那会把后端的判断复制成两份）。
   */
  it("marks an edited comment", () => {
    const text = forgeCommentTimeText(
      commentWith({ updated_at: "2026-09-02T00:00:00Z" }),
      format
    )
    expect(text).toContain("已编辑")
  })

  it("survives a comment with no timestamps", () => {
    expect(forgeCommentTimeText({ created_at: null, updated_at: null }, format)).toBe("")
    expect(forgeCommentTimeText({ created_at: null, updated_at: "x" }, format)).toBe("已编辑")
  })
})

describe("appendForgeComments", () => {
  /** 与列表行同理：两次请求之间有人发了新评论会把上一页的末条挤到下一页。 */
  it("drops a comment that already landed on an earlier page", () => {
    const existing = [commentWith({ id: "1" }), commentWith({ id: "2" })]
    const incoming = [commentWith({ id: "2" }), commentWith({ id: "3" })]
    expect(appendForgeComments(existing, incoming).map((c) => c.id)).toEqual(["1", "2", "3"])
  })

  /** 重复的保留旧的那份 —— 用户可能正在读它。 */
  it("keeps the copy already on screen", () => {
    const existing = [commentWith({ id: "1", body: "old" })]
    const incoming = [commentWith({ id: "1", body: "new" })]
    expect(appendForgeComments(existing, incoming)[0].body).toBe("old")
  })
})

describe("appendPostedForgeComment", () => {
  it("puts the posted comment at the end of the thread", () => {
    const next = appendPostedForgeComment([commentWith({ id: "1" })], commentWith({ id: "2" }))
    expect(next.map((c) => c.id)).toEqual(["1", "2"])
  })

  /** 已经在线程里（一次刷新恰好带回了它）就不重复追加。 */
  it("does not duplicate a comment already in the thread", () => {
    const existing = [commentWith({ id: "1" })]
    expect(appendPostedForgeComment(existing, commentWith({ id: "1" }))).toBe(existing)
  })
})

describe("validateForgeCommentBody", () => {
  /** 两个 forge 都接受纯空白的评论并把它渲染成一张谁也删不掉的空卡片。 */
  it("refuses a whitespace-only comment", () => {
    expect(validateForgeCommentBody("")).toBeTruthy()
    expect(validateForgeCommentBody("   \n  ")).toBeTruthy()
  })

  it("accepts real content", () => {
    expect(validateForgeCommentBody("  looks good  ")).toBeNull()
  })

  /** 超长**拦住**而不是截断：悄悄发出去半条评论比告诉他太长更糟。 */
  it("refuses an over-long comment instead of truncating it", () => {
    const error = validateForgeCommentBody("x".repeat(FORGE_MAX_COMMENT_CHARS + 1))
    expect(error).toContain(String(FORGE_MAX_COMMENT_CHARS))
  })

  it("accepts exactly the maximum", () => {
    expect(validateForgeCommentBody("x".repeat(FORGE_MAX_COMMENT_CHARS))).toBeNull()
  })
})

describe("forgeCommentFailureText", () => {
  /**
   * **不能说「请重试」。** 一次 POST 可能已经到达 forge 而只是响应丢了，重试就是发两遍
   * 到一个别人在读的线程里。措辞必须是「先确认」。
   */
  it("does not invite a blind retry", () => {
    const text = forgeCommentFailureText("网络异常")
    expect(text).toContain("网络异常")
    expect(text).toContain("可能已经发出")
    expect(text).toContain("确认")
    expect(text).not.toContain("请重试")
  })
})
