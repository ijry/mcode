import fs from "node:fs"
import path from "node:path"

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf8")
}

function extractFunctionBlock(source: string, signature: string, nextSignature: string) {
  const start = source.indexOf(signature)
  const end = source.indexOf(nextSignature, start)
  if (start < 0 || end < 0) {
    throw new Error(`Failed to extract block for ${signature}`)
  }
  return source.slice(start, end)
}

describe("conversation detail navigation contract", () => {
  it("ensures a missing remote tab before opening from the overview list", () => {
    const source = read("../../../src/pages/conversations/index.vue")
    const block = extractFunctionBlock(
      source,
      "async function openConversation(conv: Conversation, connKey?: string) {",
      "\nfunction createConversation(projectId?: number) {"
    )

    expect(block).toContain("await ensureConversationTab({")
    expect(block).toContain('activation: "allow"')
    expect(block).toContain('origin: "mcode-mobile-open"')
    expect(block.indexOf("await ensureConversationTab({")).toBeLessThan(block.indexOf("uni.navigateTo({"))
  })

  it("ensures a missing remote tab before opening from the project sessions list", () => {
    const source = read("../../../src/pages/sessions/index.vue")
    const block = extractFunctionBlock(
      source,
      "async function openConversation(item: RemoteConversationRecord) {",
      "\nfunction retryLoadPage() {"
    )

    expect(source).toContain('import { ensureConversationTab } from "@/services/conversation/pcTabSyncService"')
    expect(block).toContain("await ensureConversationTab({")
    expect(block).toContain('activation: "allow"')
    expect(block).toContain('origin: "mcode-mobile-open"')
    expect(block.indexOf("await ensureConversationTab({")).toBeLessThan(block.indexOf("uni.navigateTo({"))
  })
})
