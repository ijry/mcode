import {
  isAskQuestionToolCall,
  matchSelections,
  parseAskQuestionInput,
  parseAskQuestionOutcome,
  splitRecommended,
} from "@/services/conversation/askQuestionResult"

describe("askQuestionResult", () => {
  it("parses ask_user_question input from object payloads", () => {
    const questions = parseAskQuestionInput({
      questions: [
        {
          question: "是否接受复合游标方案?",
          header: "提问",
          multiSelect: false,
          options: [
            { label: "复合游标 (Recommended)", description: "稳定修复分页" },
          ],
        },
      ],
    })

    expect(questions).toEqual([
      {
        question: "是否接受复合游标方案?",
        header: "提问",
        multiSelect: false,
        options: [
          { label: "复合游标 (Recommended)", description: "稳定修复分页" },
        ],
      },
    ])
  })

  it("parses structured outcomes and preserves selected labels", () => {
    const outcome = parseAskQuestionOutcome(JSON.stringify({
      answers: [
        {
          header: "提问",
          question: "是否接受复合游标方案?",
          selected: ["复合游标 (Recommended)"],
        },
      ],
      declined: false,
    }))

    expect(outcome).toEqual({
      declined: false,
      answers: [
        {
          header: "提问",
          question: "是否接受复合游标方案?",
          selected: ["复合游标 (Recommended)"],
        },
      ],
    })
  })

  it("parses fallback text outcomes", () => {
    const outcome = parseAskQuestionOutcome([
      "The user answered your question(s):",
      "1. [提问] 是否接受复合游标方案?",
      "   → 复合游标 (Recommended)",
    ].join("\n"))

    expect(outcome?.declined).toBe(false)
    expect(outcome?.answers[0]?.selected).toEqual(["复合游标 (Recommended)"])
  })

  it("matches offered selections separately from other answers", () => {
    expect(matchSelections(["A", "custom"], ["A", "B"])).toEqual({
      selected: ["A"],
      other: ["custom"],
    })
  })

  it("detects recommended suffix for display only", () => {
    expect(splitRecommended("复合游标 (Recommended)")).toEqual({
      text: "复合游标",
      recommended: true,
    })
  })

  it("detects question tool calls by name or payload shape", () => {
    expect(isAskQuestionToolCall({
      name: "mcp__codeg-mcp__ask_user_question",
      input: {},
    })).toBe(true)

    expect(isAskQuestionToolCall({
      name: "tool",
      input: { questions: [{ question: "Q", options: [] }] },
    })).toBe(true)
  })
})
