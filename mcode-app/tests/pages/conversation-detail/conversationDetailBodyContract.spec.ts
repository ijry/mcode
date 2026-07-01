import fs from "node:fs"
import path from "node:path"

describe("ConversationDetailBody", () => {
  it("keeps a stable root class for the detail swiper layout", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/ConversationDetailBody.vue"),
      "utf8"
    )

    expect(source).toContain('class="detail-body"')
    expect(source).toContain('class="message-list"')
    expect(source).toContain("<scroll-view")
    expect(source).toContain('class="message-list__content" :style="messageListContentStyle"')
    expect(source).toContain('class="composer-stack"')
    expect(source).toContain('class="input-status-wrap"')
    expect(source).toContain('class="input-wrap"')
  })

  it("owns layout styles that cannot cross the parent scoped boundary", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/ConversationDetailBody.vue"),
      "utf8"
    )

    expect(source).toContain(".message-list")
    expect(source).toContain(".message-list__content")
    expect(source).toContain("messageListContentStyle?: StyleValue")
    expect(source).toContain(".composer-stack")
    expect(source).toContain(".input-status-wrap")
    expect(source).toContain(".input-wrap")
    expect(source).toContain(".detail-body")
    expect(source).toContain("position: relative")
    expect(source).toContain("position: absolute")
  })

  it("measures the detail body with the setup component instance", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/index.vue"),
      "utf8"
    )

    expect(source).toContain("const currentInstance = getCurrentInstance()")
    expect(source).toContain("const instance = currentInstance?.proxy")
    expect(source).not.toContain("const instance = getCurrentInstance()?.proxy")
  })

  it("renders compact runtime controls from the bottom composer", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/index.vue"),
      "utf8"
    )

    expect(source).not.toContain('class="detail-toolbar"')
    expect(source).toContain("<template #status>")
    expect(source).toContain('class="input-status-row"')
    expect(source).toContain('class="input-status-row__text">{{ inputStatusText }}</text>')
    expect(source).toContain('class="tool-toggle-btn"')
    expect(source).toContain('v-if="showInputToolRow" class="input-tool-row"')
    expect(source).toContain('class="input-tool-btn input-tool-btn--danger"')
    expect(source).toContain("const DEFAULT_DETAIL_TOOLBAR_HEIGHT = 0")
  })

  it("renders each mounted swiper item with an interactive per-conversation pane", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/index.vue"),
      "utf8"
    )

    expect(source).toContain("<ConversationDetailInteractivePane")
    expect(source).toContain(':conversation-id="tab.conversationId"')
    expect(source).toContain(':folder-id="tab.folderId"')
    expect(source).toContain(':active="isActiveDetailTabPage(index)"')
    expect(source).toContain("function mountAllDetailTabs()")
    expect(source).not.toContain("<ConversationDetailReadonlyTimeline")
  })

  it("keeps active tab focus local instead of syncing it back to opened tabs", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/index.vue"),
      "utf8"
    )

    expect(source).toContain('activation: "preserve"')
    expect(source).not.toContain('activation: "allow"')
    expect(source).not.toContain("const remoteActiveIndex = detailShellTabs.value.findIndex((tab) => tab.active)")
  })

  it("measures composer chrome from the active swiper page only", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/index.vue"),
      "utf8"
    )

    expect(source).toContain("detail-shell__page--active")
    expect(source).toContain('.select(".detail-shell__page--active .input-status-row")')
    expect(source).toContain('.select(".detail-shell__page--active .composer-stack")')
    expect(source).toContain('.select(".detail-shell__page--active .input-main-row")')
    expect(source).toContain('.select(".detail-shell__page--active .input-tool-row")')
    expect(source).toContain('.select(".detail-shell__page--active .message-list__content")')
  })

  it("subtracts the navbar placeholder from the swiper shell height", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/index.vue"),
      "utf8"
    )

    expect(source).toContain("resolveDetailShellViewportHeight")
    expect(source).toContain("hasNavbarPlaceholder: true")
    expect(source).not.toContain("const height = Math.max(0, viewportHeight.value || getDetailViewportHeight())")
  })

  it("does not add safe-area padding to the bottom scroll anchor", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/index.scss"),
      "utf8"
    )

    expect(source).toMatch(/\.list-bottom\s*\{\s*height:\s*34rpx;\s*\}/)
  })

  it("locks the outer detail page so only the message scroll-view scrolls", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/index.scss"),
      "utf8"
    )

    expect(source).toMatch(/\.page\s*\{[\s\S]*height:\s*100%;[\s\S]*overflow:\s*hidden;[\s\S]*overscroll-behavior:\s*none;/)
    expect(source).toMatch(/\.detail-container\s*\{[\s\S]*position:\s*fixed;[\s\S]*inset:\s*0;[\s\S]*overflow:\s*hidden;[\s\S]*overscroll-behavior:\s*none;/)
  })

  it("keeps per-tab scrolling inside the detail body scroll-view", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/index.vue"),
      "utf8"
    )

    expect(source).not.toContain("onPageScroll")
    expect(source).not.toContain("uni.pageScrollTo")
    expect(source).not.toContain("visualViewport")
    expect(source).toContain("messageScrollTop.value = Number.MAX_SAFE_INTEGER")
    expect(source).toContain("messageScrollIntoView.value = getBottomAnchorId()")
  })

  it("keeps the interactive pane capable of sending attachments", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/ConversationDetailInteractivePane.vue"),
      "utf8"
    )

    expect(source).toContain('class="attachments-preview"')
    expect(source).toContain("handleChooseImages")
    expect(source).toContain("handleChooseFiles")
    expect(source).toContain("uploadPickedFiles")
    expect(source).toContain("prepareDraftForSend")
  })

  it("resyncs layout when interactive composer chrome changes height", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/ConversationDetailInteractivePane.vue"),
      "utf8"
    )

    expect(source).toMatch(/function toggleInputToolRow\(\)[\s\S]*scheduleViewportSync\(\)/)
    expect(source).toMatch(/function toggleComposerPanel\([\s\S]*scheduleViewportSync\(\)/)
  })
})
