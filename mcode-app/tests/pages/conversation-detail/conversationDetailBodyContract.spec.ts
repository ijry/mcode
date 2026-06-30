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
    expect(source).toContain('class="input-wrap"')
  })
})
