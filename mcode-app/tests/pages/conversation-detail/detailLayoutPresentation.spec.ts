import {
  buildHistoryStatusStyle,
  buildMessageListPageStyle,
  buildTopOffsetStyle,
} from "@/pages/conversation-detail/detailLayoutPresentation"

describe("detailLayoutPresentation", () => {
  it("builds message list page style from measured layout heights", () => {
    expect(buildMessageListPageStyle({
      viewportHeight: 900,
      topChromeHeight: 120,
      bottomComposerHeight: 180,
    })).toEqual({
      paddingTop: "120px",
      paddingBottom: "180px",
      minHeight: "600px",
    })

    expect(buildMessageListPageStyle({
      viewportHeight: 0,
      topChromeHeight: 0,
      bottomComposerHeight: 0,
    })).toBeUndefined()
  })

  it("accounts for tabs strip height in the top chrome region", () => {
    expect(buildMessageListPageStyle({
      viewportHeight: 900,
      topChromeHeight: 168,
      bottomComposerHeight: 180,
    })).toEqual({
      paddingTop: "168px",
      paddingBottom: "180px",
      minHeight: "552px",
    })
  })

  it("builds top offset and history status styles", () => {
    expect(buildTopOffsetStyle(88)).toEqual({ top: "88px" })
    expect(buildTopOffsetStyle(-10)).toEqual({ top: "0px" })

    expect(buildHistoryStatusStyle({
      navbarHeight: 96,
      toolbarHeight: 44,
    })).toEqual({
      top: "140px",
    })
  })
})
