import {
  CONVERSATION_ARCHIVED_STATUS,
  CONVERSATION_PIN_COMMAND,
  CONVERSATION_UNARCHIVED_STATUS,
  buildConversationRowActions,
  canDeleteConversation,
  isConversationArchived,
  resolveArchiveSuccessToast,
  resolveRowActionSheetTitle,
  resolveSelectedRowAction,
} from "@/pages/conversations/conversationRowActions"

const ids = (status?: string, isPinned?: boolean) =>
  buildConversationRowActions({ status, isPinned }).map((item) => item.id)

describe("conversationRowActions", () => {
  // 菜单是「按状态现算」，不是一张固定表 —— 这组用例钉的就是状态到条目的映射。
  it("offers the plain set for a normal conversation", () => {
    expect(ids("pending_review", false)).toEqual(["rename", "pin", "archive", "delete"])
  })

  it("swaps pin for unpin when the conversation is already pinned", () => {
    const actions = ids("pending_review", true)
    expect(actions).toContain("unpin")
    expect(actions).not.toContain("pin")
  })

  // 归档态由服务端的「完成」表达。
  it("swaps archive for unarchive when the conversation is completed", () => {
    const actions = ids("completed", false)
    expect(actions).toContain("unarchive")
    expect(actions).not.toContain("archive")
    expect(actions).not.toContain("unpin")
  })

  // 正在跑的会话不给删除入口：留一个点了必然被拦的项，不如一开始就不给。
  it("drops the delete entry while the conversation is running", () => {
    const actions = ids("in_progress", false)
    expect(actions).toEqual(["rename", "pin", "archive"])
  })

  // 实时态优先：库里还写着 completed、但实时已经在跑的会话，也不能删。
  it("treats live in_progress as undeletable even if stored status is completed", () => {
    expect(ids("in_progress", false)).not.toContain("delete")
  })

  it("keeps delete available for every non-running status", () => {
    ;["pending_review", "completed", "failed", "cancelled", "unknown"].forEach((status) => {
      expect(ids(status, false)).toContain("delete")
    })
  })

  it("pins the destructive entry last and marks it with the danger color", () => {
    const actions = buildConversationRowActions({ status: "pending_review" })
    expect(actions[actions.length - 1]).toEqual({
      id: "delete",
      name: "删除",
      color: "#fa3534",
    })
  })

  describe("canDeleteConversation", () => {
    it("refuses running conversations only", () => {
      expect(canDeleteConversation("in_progress")).toBe(false)
      expect(canDeleteConversation("pending_review")).toBe(true)
      expect(canDeleteConversation("completed")).toBe(true)
      expect(canDeleteConversation("failed")).toBe(true)
      expect(canDeleteConversation(undefined)).toBe(true)
    })
  })

  describe("isConversationArchived", () => {
    it("reads the server-side completed status as archived", () => {
      expect(isConversationArchived("completed")).toBe(true)
      expect(isConversationArchived("pending_review")).toBe(false)
      expect(isConversationArchived("in_progress")).toBe(false)
    })
  })

  // 三个常量是「客户端↔服务端」的约定面，服务端改名时只动它们 —— 值必须钉死，
  // 免得有人顺手改了字面量而忘了这是跨端契约。
  it("keeps the cross-end constants stable", () => {
    expect(CONVERSATION_PIN_COMMAND).toBe("update_conversation_pinned")
    expect(CONVERSATION_ARCHIVED_STATUS).toBe("completed")
    // 取消归档不能退回 in_progress：那等于凭空宣布会话在跑，会把它推回「不可删」那一侧。
    expect(CONVERSATION_UNARCHIVED_STATUS).toBe("pending_review")
  })

  // 归档写的是 completed。只有「进行中」模式（排除 completed）会让归档后的会话从列表消失，
  // 此时提示必须顺带指路；其余模式下会话仍在原地，多说一句反而是噪音。
  describe("resolveArchiveSuccessToast", () => {
    it("points at the archived view when the running mode would hide it", () => {
      const text = resolveArchiveSuccessToast("running")
      expect(text).toContain("已归档")
      expect(text).toContain("「已归档」视图")
    })

    // 全部 / 已置顶 / 已归档 模式下会话仍在列表里，文案保持最简。
    it("stays terse when the conversation remains visible", () => {
      expect(resolveArchiveSuccessToast("all")).toBe("已归档")
      expect(resolveArchiveSuccessToast("pinned")).toBe("已归档")
      expect(resolveArchiveSuccessToast("archived")).toBe("已归档")
    })
  })

  describe("resolveSelectedRowAction", () => {
    const actions = buildConversationRowActions({ status: "pending_review" })

    it("resolves by index", () => {
      expect(resolveSelectedRowAction(actions, { index: 1 })?.id).toBe("pin")
    })

    // 部分端只把 name 带回来。
    it("falls back to name when index is missing", () => {
      expect(resolveSelectedRowAction(actions, { name: "归档" })?.id).toBe("archive")
    })

    it("returns null for an unusable event", () => {
      expect(resolveSelectedRowAction(actions, null)).toBeNull()
      expect(resolveSelectedRowAction(actions, {})).toBeNull()
      expect(resolveSelectedRowAction(actions, { name: "不存在的项" })).toBeNull()
    })
  })

  describe("resolveRowActionSheetTitle", () => {
    it("falls back to a generic title for nameless conversations", () => {
      expect(resolveRowActionSheetTitle("")).toBe("会话操作")
      expect(resolveRowActionSheetTitle(undefined)).toBe("会话操作")
    })

    // 会话名是用户自己起的，没有长度上限；不截断会把面板撑歪。
    it("truncates long titles", () => {
      const title = resolveRowActionSheetTitle("一二三四五六七八九十一二三四五六七八九十壹")
      expect(title.endsWith("…")).toBe(true)
      expect(title.length).toBe(21)
    })

    it("keeps short titles intact", () => {
      expect(resolveRowActionSheetTitle("修一下登录")).toBe("修一下登录")
    })
  })
})
