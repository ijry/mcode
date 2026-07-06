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

    expect(source).toContain('class="conversations-header__select"')
    expect(source).toContain('{{ selectionMode ? "取消" : "选择" }}')
    expect(source).toContain('v-if="selectionMode && isSelectableLiveCard(card)"')
    expect(source).toContain("bulk-select-check")
    expect(source).toContain('@click="handleLiveCardClick(card, group.key)"')

    const historyBlock = extractBlock(
      source,
      '<view v-else class="history-list">',
      '<!-- 创建会话底部弹层 -->'
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
    expect(confirmBlock).toContain("await refreshActiveSessionTabBadge()")

    expect(sendBlock).toContain("const conn = findConnectedConnectionByKey(item.connectionKey)")
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
