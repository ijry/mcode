import {
  cloneDraftQueue,
  firstString,
  getTurnContentParts,
  normalizeAgentType,
  normalizeAttachments,
  normalizeContentParts,
  normalizeDraftQueue,
  normalizeList,
  normalizeTurns,
  safeParseArray,
  toObject,
} from "@/pages/conversation-detail/detailDataNormalization"

const createId = (prefix: string) => `${prefix}-stable`

describe("detailDataNormalization", () => {
  beforeEach(() => {
    jest.spyOn(Date, "now").mockReturnValue(1700000000000)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("extracts first non-empty string and parses objects defensively", () => {
    expect(firstString("", "  ok  ", "later")).toBe("ok")
    expect(firstString(null, 1, {})).toBeUndefined()
    expect(toObject('{"a":1}')).toEqual({ a: 1 })
    expect(toObject("not-json")).toBeNull()
    expect(safeParseArray("[1,2]")).toEqual([1, 2])
    expect(safeParseArray('{"no":true}')).toEqual([])
    expect(normalizeList("x")).toEqual([])
  })

  it("normalizes backend turns and content parts", () => {
    const turns = normalizeTurns([
      {
        id: "u1",
        role: "user",
        content: "hello",
        timestamp: "2026-06-20T00:00:00.000Z",
      },
      {
        role: "assistant",
        blocks: [
          { type: "text", text: "answer" },
          { type: "tool_use", tool_use_id: "tool-1", tool_name: "TaskList", input_preview: '{"x":1}' },
          { type: "tool_result", tool_use_id: "tool-1", output_preview: "done" },
        ],
      },
    ])

    expect(turns[0]).toEqual(expect.objectContaining({
      id: "u1",
      role: "user",
      content: [{ type: "text", text: "hello" }],
    }))
    expect(turns[1].id).toBe("turn-1-1700000000000")
    expect(turns[1].content).toEqual([
      { type: "text", text: "answer" },
      {
        type: "tool_call",
        tool_call: {
          id: "tool-1",
          name: "TaskList",
          input: { x: 1 },
          output: "done",
          status: "completed",
          error: undefined,
        },
      },
    ])
  })

  it("normalizes typed content parts and turn content fallback", () => {
    expect(normalizeContentParts([
      { type: "thinking", thinking: "think" },
      { type: "image", image: { url: "https://img", alt: "alt" } },
      { type: "plan", plan: { steps: [{ title: "ship" }, { description: "" }] } },
      "plain",
    ])).toEqual([
      { type: "thinking", thinking: "think" },
      { type: "image", image: { url: "https://img", alt: "alt" } },
      { type: "plan", plan: { steps: [{ description: "ship", completed: false }], status: undefined } },
      { type: "text", text: "plain" },
    ])

    expect(getTurnContentParts({ blocks: [{ type: "image", uri: "file://a.png" }] })).toEqual([
      { type: "image", image: { url: "file://a.png", alt: "image" } },
    ])
  })

  it("normalizes agent aliases", () => {
    expect(normalizeAgentType("claudecode")).toBe("claude_code")
    expect(normalizeAgentType("codex_cli")).toBe("codex")
    expect(normalizeAgentType("gemini_cli")).toBe("gemini")
    expect(normalizeAgentType("opencode")).toBe("open_code")
    expect(normalizeAgentType("openclaw")).toBe("open_claw")
    expect(normalizeAgentType("")).toBe("claude_code")
  })

  it("normalizes attachments and drafts with an explicit restored id factory", () => {
    const attachments = normalizeAttachments([
      { kind: "image", url: "https://image", name: "image.png", size: 5, type: "image/png" },
      { kind: "file", url: "https://file", id: "file-1" },
      { kind: "file" },
    ], createId)

    expect(attachments).toEqual([
      {
        id: "att-restored-0-stable",
        url: "https://image",
        name: "image.png",
        size: 5,
        type: "image/png",
        kind: "image",
      },
      {
        id: "file-1",
        url: "https://file",
        name: "",
        size: 0,
        type: "application/octet-stream",
        kind: "file",
      },
    ])

    const drafts = normalizeDraftQueue([
      { text: "queued", status: "sending", attachments, createdAt: 123 },
      { text: "failed", status: "failed", error: "bad", attachments: [] },
    ], createId)

    expect(drafts[0]).toEqual(expect.objectContaining({
      id: "draft-restored-0-stable",
      text: "queued",
      status: "pending",
      attachments,
      createdAt: 123,
    }))
    expect(drafts[1]).toEqual(expect.objectContaining({
      status: "failed",
      error: "bad",
    }))

    const cloned = cloneDraftQueue(drafts)
    cloned[0].attachments[0].name = "changed"
    expect(drafts[0].attachments[0].name).toBe("image.png")
  })
})
