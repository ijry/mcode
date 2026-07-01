import {
  buildHistoryStatusStyle,
  buildMessageListContentStyle,
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
      marginTop: "120px",
      height: "780px",
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
      marginTop: "168px",
      height: "732px",
    })
  })

  it("keeps top and bottom chrome space before async measurement finishes", () => {
    expect(buildMessageListPageStyle({
      viewportHeight: 653,
      topChromeHeight: 103,
      bottomComposerHeight: 156,
    })).toEqual({
      marginTop: "103px",
      height: "550px",
    })
  })

  it("builds content padding style from the composer height", () => {
    expect(buildMessageListContentStyle(180)).toEqual({
      paddingBottom: "180px",
    })
    expect(buildMessageListContentStyle(0)).toBeUndefined()
  })

  it("builds top offset and history status styles", () => {
    expect(buildTopOffsetStyle(88)).toEqual({ top: "88px" })
    expect(buildTopOffsetStyle(-10)).toEqual({ top: "0px" })

    expect(buildHistoryStatusStyle({
      navbarHeight: 96,
      tabsBarHeight: 52,
      toolbarHeight: 44,
    })).toEqual({
      top: "192px",
    })
  })
})
