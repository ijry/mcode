import {
  buildHistoryProjectSections,
  formatHistoryConversationMeta,
} from "@/pages/conversations/historyPresentation"

const conversation = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 101,
    title: "重构历史会话页",
    agent_type: "claude_code",
    updated_at: "2026-06-08T08:00:00.000Z",
    ...overrides,
  }) as any

const project = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 7,
    name: "mcode",
    path: "D:/Repos/xyito/lingyun/mcode",
    conversations: [conversation()],
    ...overrides,
  }) as any

describe("historyPresentation", () => {
  it("keeps only projects that still have matching history conversations", () => {
    const sections = buildHistoryProjectSections(
      [
        project({ id: 1, name: "mcode" }),
        project({ id: 2, name: "empty", conversations: [] }),
      ],
      "重构"
    )

    expect(sections).toEqual([
      expect.objectContaining({
        projectId: 1,
        title: "mcode",
        count: 1,
      }),
    ])
  })

  it("filters conversations by keyword across title, agent, project name, and path", () => {
    const sections = buildHistoryProjectSections(
      [
        project({
          id: 3,
          name: "xyview-vue",
          path: "D:/Repos/xyito/xyview-vue",
          conversations: [
            conversation({ title: "Pinia 替换 Vuex", agent_type: "codex" }),
            conversation({ title: "无关会话", agent_type: "claude_code" }),
          ],
        }),
      ],
      "codex"
    )

    expect(sections[0].conversations).toHaveLength(1)
    expect(sections[0].conversations[0].title).toBe("Pinia 替换 Vuex")
  })

  it("formats the history card meta line from agent label and time label", () => {
    const meta = formatHistoryConversationMeta(
      conversation({ agent_type: "codex", updated_at: "2026-06-08T08:00:00.000Z" }),
      (agentType) => (agentType === "codex" ? "Codex" : agentType),
      () => "31分钟前"
    )

    expect(meta).toBe("Codex · 31分钟前")
  })
})
