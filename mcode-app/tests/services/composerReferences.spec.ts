import {
  applyMentionReference,
  buildFileUri,
  buildMentionReferenceGroups,
  buildMentionTabItems,
  referenceToMarkdown,
  resolveActiveMentionKind,
  resolveMentionTrigger,
  type MentionReferenceGroup,
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

describe("mention group tabs", () => {
  const group = (
    kind: MentionReferenceGroup["kind"],
    label: string,
    count: number,
    truncated = false
  ): MentionReferenceGroup => ({
    kind,
    label,
    truncated,
    items: Array.from({ length: count }, (_, i) => ({
      kind,
      id: `${kind}-${i}`,
      label: `${label} ${i}`,
      detail: "",
      uri: `codeg://${kind}/${i}`,
      keywords: "",
    })),
  })

  const fourGroups = (counts: [number, number, number, number]) => [
    group("agent", "智能体", counts[0]),
    group("file", "文件", counts[1]),
    group("session", "会话", counts[2]),
    group("commit", "提交", counts[3]),
  ]

  it("keeps all four tabs regardless of emptiness", () => {
    // 四组固定：tab 条位置不随输入漂移，用户不必在每次敲键后重新找自己那一组。
    const items = buildMentionTabItems(fourGroups([2, 0, 0, 0]))
    expect(items.map((item) => item.kind)).toEqual(["agent", "file", "session", "commit"])
  })

  it("puts the count in the tab title", () => {
    // 分栏后看不到其他组里有没有东西，计数是唯一线索。
    const items = buildMentionTabItems(fourGroups([2, 13, 0, 1]))
    expect(items.map((item) => item.title)).toEqual([
      "智能体 2",
      "文件 13",
      "会话",
      "提交 1",
    ])
  })

  it("marks empty groups disabled so they cannot be opened", () => {
    const items = buildMentionTabItems(fourGroups([2, 0, 0, 1]))
    expect(items.map((item) => item.disabled)).toEqual([false, true, true, false])
  })

  it("shows a plus sign when a group is truncated", () => {
    // truncated 表示「还有更多，继续输入缩小范围」。不标出来的话 20 看起来就是全部。
    const groups = [
      group("agent", "智能体", 20, true),
      group("file", "文件", 3),
      group("session", "会话", 0),
      group("commit", "提交", 0),
    ]
    expect(buildMentionTabItems(groups)[0].title).toBe("智能体 20+")
  })

  it("falls back to the first non-empty group when the current kind has none", () => {
    // 冷启动 / 刚打开面板：当前 kind 还是默认值，而那一组可能没有结果。
    expect(resolveActiveMentionKind(fourGroups([0, 5, 0, 0]), "agent")).toBe("file")
  })

  it("stays on a user-picked group even after it becomes empty", () => {
    // 这是本次最重要的一条：用户正在看「文件」组、继续敲字让它变空时，**不能**把他
    // 弹到别的组 —— 那会让人以为自己点错了。留在原地并显示空态，他自己决定是改
    // 关键词还是切组。`pinned` 就是「这一组是用户亲手选的」这个事实。
    expect(
      resolveActiveMentionKind(fourGroups([3, 0, 2, 0]), "file", { pinned: true })
    ).toBe("file")
  })

  it("needs pinned to tell the two empty-current cases apart", () => {
    // 同一份输入（当前组为空），未 pin 时该跳、已 pin 时该留 —— 从分组状态本身
    // 分辨不出这两种处境，所以必须由调用方显式告知。这条锁住那个参数不被「简化」掉。
    const groups = fourGroups([3, 0, 2, 0])
    expect(resolveActiveMentionKind(groups, "file")).toBe("agent")
    expect(resolveActiveMentionKind(groups, "file", { pinned: true })).toBe("file")
  })

  it("keeps the current group when it still has results", () => {
    expect(resolveActiveMentionKind(fourGroups([3, 2, 0, 0]), "file")).toBe("file")
  })

  it("falls back to the first group when everything is empty", () => {
    // 全空时没有「更好」的选择，回到第一组，让 tab 条与内容区状态自洽。
    expect(resolveActiveMentionKind(fourGroups([0, 0, 0, 0]), "session")).toBe("agent")
  })

  it("keeps a pinned group when everything is empty", () => {
    // 全空 + 用户选过：仍然留在他选的那组。整个面板都空的时候把 tab 跳回第一组
    // 是双重打击 —— 结果没了，位置也变了。
    expect(
      resolveActiveMentionKind(fourGroups([0, 0, 0, 0]), "session", { pinned: true })
    ).toBe("session")
  })

  it("recovers from an unknown kind", () => {
    // kind 是从组件状态来的，可能被旧版本写坏或被 tab 下标错位污染。
    expect(resolveActiveMentionKind(fourGroups([0, 4, 0, 0]), "nope" as any)).toBe("file")
  })
})
