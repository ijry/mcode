import {
  buildCircleDetailRoute,
  buildCircleShareText,
  resolveCirclePostMenuItems,
} from "@/pages/circles/postActions"

describe("circle post actions", () => {
  it("builds a detail route from the post id", () => {
    expect(buildCircleDetailRoute(101)).toBe("/pages/circles/detail?id=101")
  })

  it("builds share text from title and detail route", () => {
    expect(buildCircleShareText({
      id: 101,
      title: "详情标题",
      content: "正文内容",
    })).toBe("详情标题\n/pages/circles/detail?id=101")
  })

  it("falls back to content excerpt when title is blank", () => {
    expect(buildCircleShareText({
      id: 101,
      title: " ",
      content: "这里是一段很长的正文内容，用于在没有标题时生成分享摘要。",
    })).toBe("这里是一段很长的正文内容，用于在没有标题时生成分享摘要。\n/pages/circles/detail?id=101")
  })

  it("shows edit only for the author", () => {
    expect(resolveCirclePostMenuItems({
      post: { id: 101, uid: 7 },
      currentUserId: 7,
    })).toEqual(["share", "edit"])
    expect(resolveCirclePostMenuItems({
      post: { id: 101, uid: 7 },
      currentUserId: 8,
    })).toEqual(["share"])
  })
})
