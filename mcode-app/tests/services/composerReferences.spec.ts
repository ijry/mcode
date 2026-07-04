import {
  applyMentionReference,
  buildFileUri,
  buildMentionReferenceGroups,
  referenceToMarkdown,
  resolveMentionTrigger,
  type MentionReferenceItem,
} from "@/services/composerReferences"

describe("composerReferences", () => {
  const fileRef: MentionReferenceItem = {
    kind: "file",
    id: "src/App.vue",
    label: "App.vue",
    detail: "src/App.vue",
    uri: "file:///D%3A/Repos/demo/src/App.vue",
    keywords: "src/App.vue",
  }

  it("builds file URIs with encoded path segments", () => {
    expect(buildFileUri("D:/Repos/demo/src/App Vue.vue")).toBe(
      "file:///D%3A/Repos/demo/src/App%20Vue.vue"
    )
    expect(buildFileUri("/Users/me/demo/a#b.md")).toBe(
      "file:///Users/me/demo/a%23b.md"
    )
    expect(buildFileUri("//server/share/a b.txt")).toBe(
      "file://server/share/a%20b.txt"
    )
  })

  it("serializes references like codeg-main markdown tokens", () => {
    expect(referenceToMarkdown(fileRef)).toBe("[App.vue](file:///D%3A/Repos/demo/src/App.vue)")
    expect(referenceToMarkdown({
      kind: "agent",
      id: "codex",
      label: "Codex",
      detail: "code agent",
      uri: "codeg://agent/codex",
      keywords: "codex",
    })).toBe("[@Codex](codeg://agent/codex)")
    expect(referenceToMarkdown({
      kind: "session",
      id: "123",
      label: "修复 [bug]",
      detail: "main",
      uri: "codeg://session/123",
      keywords: "修复 bug",
    })).toBe("[修复 \\[bug\\]](codeg://session/123)")
  })

  it("detects a trailing @ trigger and ignores email-like text", () => {
    expect(resolveMentionTrigger("请看 @src/A", 9)).toEqual({
      query: "src/A",
      from: 3,
      to: 9,
    })
    expect(resolveMentionTrigger("email a@b", 9)).toBeNull()
    expect(resolveMentionTrigger("hello @a b", 10)).toBeNull()
  })

  it("replaces the active trigger with a markdown reference", () => {
    const result = applyMentionReference("请看 @src", {
      query: "src",
      from: 3,
      to: 7,
    }, fileRef)
    const expectedText = "请看 [App.vue](file:///D%3A/Repos/demo/src/App.vue) "

    expect(result).toEqual({
      text: expectedText,
      cursor: expectedText.length,
    })
  })

  it("builds grouped mention references from raw sources", () => {
    const groups = buildMentionReferenceGroups({
      query: "cod",
      projectPath: "D:/Repos/demo",
      files: [
        { name: "App.vue", path: "src/App.vue", kind: "file" },
      ],
      agents: [
        { agent_type: "codex", name: "Codex", description: "Code agent", enabled: true, available: true },
        { agent_type: "gemini", name: "Gemini", enabled: false },
      ],
      sessions: [
        { id: 42, title: "Codex 调试", agentType: "codex", status: "completed", folderId: 1 },
      ],
      commits: [
        { hash: "abc1234", full_hash: "abc123456789", message: "codex fix", author: "Ada" },
      ],
      maxPerGroup: 10,
    })

    expect(groups.map((group) => [group.kind, group.items.map((item) => item.id)])).toEqual([
      ["agent", ["codex"]],
      ["file", []],
      ["session", ["42"]],
      ["commit", ["abc123456789"]],
    ])
    expect(groups[2].items[0].uri).toBe("codeg://session/42")
    expect(groups[3].items[0].uri).toBe(
      `codeg://commit/${encodeURIComponent("D:/Repos/demo")}@abc123456789`
    )
  })
})
