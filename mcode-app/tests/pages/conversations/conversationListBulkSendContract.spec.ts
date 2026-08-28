import fs from "node:fs"
import path from "node:path"

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf8")
}

function extractBlock(source: string, startToken: string, endToken: string) {
  const start = source.indexOf(startToken)
  const end = source.indexOf(endToken, start)
  if (start < 0 || end < 0) {
    throw new Error(`Failed to extract block from ${startToken}`)
  }
  return source.slice(start, end)
}

describe("P67 conversation list bulk send contract", () => {
  it("renders selection controls only on top-level live cards", () => {
    const source = read("../../../src/pages/conversations/index.vue")

    // 顶栏的「选择」按钮已随 ConversationsNavbar.vue 抽走（形制断言见
    // conversationListNavbarHeader.spec.ts）；这里只验页面把选择模式接到了 navbar 上。
    expect(source).toContain('@toggle-selection="toggleSelectionMode"')
    // 「可选中」判据已收口到 conversationOverviewPresentation.ts 的
    // isSelectableOverviewCard（此前页面内有五处各自的实现）。模板仍在顶层卡上门控
    // 选择控件，只是判据换了名字。
    expect(source).toContain('v-if="selectionMode && isSelectableOverviewCard(card)"')
    expect(source).toContain("bulk-select-check")
    expect(source).toContain('@click="handleLiveCardClick(card, group.key)"')

    // 终点用批量操作条的开标签，而不是某条注释：注释会随重构消失（原来那个终点是
    // 「创建会话底部弹层」的注释，弹层抽成 CreateConversationSheet 后它就没了，
    // `extractBlock` 直接抛异常）。`v-if="selectionMode"` 这个块是历史列表的下一个
    // 兄弟节点，且它自己就是选择模式的产物 —— 不会先于选择功能被删掉。
    const historyBlock = extractBlock(
      source,
      '<view v-else class="history-list">',
      '<view v-if="selectionMode" class="bulk-action-bar"'
    )
    expect(historyBlock).not.toContain("bulk-select-check")
    expect(historyBlock).not.toContain("toggleConversationSelection")
    expect(historyBlock).not.toContain("handleLiveCardClick")
  })

  it("routes top-level card taps to selection toggling before detail navigation", () => {
    const source = read("../../../src/pages/conversations/index.vue")
    const block = extractBlock(
      source,
      "function handleLiveCardClick(card: LiveSessionCard, groupKey: string) {",
      "\nfunction openLiveSession(card: LiveSessionCard, groupKey?: string) {"
    )

    expect(block).toContain("if (selectionMode.value) {")
    expect(block).toContain("toggleConversationSelection(card, groupKey)")
    expect(block).toContain("return")
    expect(block).toContain("openLiveSession(card, groupKey)")
    expect(block.indexOf("toggleConversationSelection(card, groupKey)"))
      .toBeLessThan(block.indexOf("openLiveSession(card, groupKey)"))
  })

  it("renders the bulk-send popup with warning copy and quick continue input", () => {
    const source = read("../../../src/pages/conversations/index.vue")

    expect(source).toContain('v-model:show="showBulkSendDialog"')
    expect(source).toContain("批量发送")
    expect(source).toContain("本次将会一键将内容发送给所有勾选的会话")
    expect(source).toContain('const BULK_SEND_QUICK_TEXT = "继续"')
    expect(source).toContain('@click="applyBulkQuickText(BULK_SEND_QUICK_TEXT)"')
    expect(source).toContain('v-model="bulkSendText"')
    expect(source).toContain(':disabled="bulkSendSubmitDisabled"')
    expect(source).toContain('@click="confirmBulkSend"')
  })

  it("bulk sends selected cards through the existing ACP prompt pipeline", () => {
    const source = read("../../../src/pages/conversations/index.vue")
    const confirmBlock = extractBlock(
      source,
      "async function confirmBulkSend() {",
      "\nasync function sendBulkSelectionItem("
    )
    const sendBlock = extractBlock(
      source,
      "async function sendBulkSelectionItem(",
      "\nasync function ensureBulkSendConnection("
    )
    const ensureBlock = extractBlock(
      source,
      "async function ensureBulkSendConnection(",
      "\nfunction showConversationMenu("
    )

    expect(confirmBlock).toContain("for (const item of items)")
    expect(confirmBlock).toContain("await sendBulkSelectionItem(item, text)")
    expect(confirmBlock).toContain("await loadOverviewData({ force: true })")
    // 角标刷新已从页面自有的 `refreshActiveSessionTabBadge` 改为委托给
    // `conversationTabBadgeService` —— 它由 App.vue 启动，不再依赖本页生命周期
    // （原先 App 冷启动落在「连接」页时本页从未挂载，角标从来不显示）。
    expect(confirmBlock).toContain("await refreshConversationTabBadge()")

    // `findConnectedConnection` 与 `syncAuthToConnection` 现在都走
    // `services/connection/connectionAccess`（拆 CreateConversationSheet 前的收口 ——
    // 子组件也要这几件事，否则要么多接函数型 props、要么再复制一份）。
    expect(sendBlock).toContain("const conn = findConnectedConnection(item.connectionKey)")
    expect(sendBlock).toContain("syncAuthToConnection(conn)")
    expect(sendBlock).toContain("await ensureConversationTab({")
    expect(sendBlock).toContain('activation: "preserve"')
    expect(sendBlock).toContain('origin: "mcode-mobile-bulk-send"')
    expect(sendBlock).toContain("await ensureBulkSendConnection(item, instanceKey)")
    expect(sendBlock).toContain('await gateway.call("acp_prompt", {')
    expect(sendBlock).toContain('blocks: [{ type: "text", text }]')
    expect(sendBlock).toContain("folderId: item.folderId")
    expect(sendBlock).toContain("conversationId: item.conversationId")

    expect(ensureBlock).toContain("runtime.getManagedConversation(item.conversationId)?.connectionId")
    expect(ensureBlock).toContain("await runtime.connect(")
    expect(ensureBlock).toContain("runtime.sessions.get(item.conversationId)?.lastAppliedSeq")
  })
})
