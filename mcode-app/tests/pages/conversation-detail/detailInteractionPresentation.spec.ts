import {
  buildQuestionAnswer,
  buildQuestionTabItems,
  createQuestionSelectionState,
  isQuestionRecommended,
  isQuestionSelectionAnswered,
  questionLabelText,
  resolveNextQuestionTabIndex,
  splitPermissionDescription,
  type QuestionSelectionState,
} from "@/pages/conversation-detail/detailInteractionPresentation"
import type { PendingQuestionState } from "@/types/acp"

const pending: PendingQuestionState = {
  question_id: "question-request",
  created_at: "2026-06-20T00:00:00.000Z",
  questions: [
    {
      id: "q1",
      question: "Pick one",
      header: "Choice",
      multi_select: false,
      options: [{ label: "A (Recommended)", description: "" }],
    },
    {
      id: "q2",
      question: "Pick many",
      header: "Multi",
      multi_select: true,
      options: [{ label: "B", description: "" }],
    },
  ],
}

describe("detailInteractionPresentation", () => {
  it("splits permission command text from user-facing description", () => {
    const result = splitPermissionDescription([
      "智能体请求继续当前操作",
      "Command: pnpm exec vue-tsc --noEmit --pretty false",
      "--project mcode-app/tsconfig.json",
    ].join("\n"))

    expect(result).toEqual({
      textParts: ["智能体请求继续当前操作"],
      commandBlock: "pnpm exec vue-tsc --noEmit --pretty false\n--project mcode-app/tsconfig.json",
    })
  })

  it("returns default permission text for empty descriptions", () => {
    expect(splitPermissionDescription("")).toEqual({
      textParts: ["智能体请求继续当前操作"],
      commandBlock: "",
    })
  })

  it("normalizes recommended question labels", () => {
    expect(questionLabelText("A (Recommended)")).toBe("A")
    expect(isQuestionRecommended("A (Recommended)")).toBe(true)
    expect(isQuestionRecommended("A")).toBe(false)
  })

  it("creates empty selection state and detects answered selections", () => {
    const selections = createQuestionSelectionState(pending)
    expect(selections).toEqual({
      q1: { selected: [], otherActive: false, otherText: "" },
      q2: { selected: [], otherActive: false, otherText: "" },
    })
    expect(isQuestionSelectionAnswered(selections.q1)).toBe(false)
    expect(isQuestionSelectionAnswered({ selected: [], otherActive: true, otherText: "custom" })).toBe(true)
  })

  it("builds submitted and declined ask-question answers", () => {
    const selections: Record<string, QuestionSelectionState> = {
      q1: { selected: ["A (Recommended)"], otherActive: false, otherText: "" },
      q2: { selected: ["B"], otherActive: true, otherText: "custom" },
    }

    expect(buildQuestionAnswer(pending, selections, false)).toEqual({
      declined: false,
      answers: [
        { questionId: "q1", labels: ["A (Recommended)"] },
        { questionId: "q2", labels: ["B", "custom"] },
      ],
    })
    expect(buildQuestionAnswer(pending, selections, true)).toEqual({
      declined: true,
      answers: [],
    })
  })

  describe("multi-question tabs", () => {
    // 用户报「智能体提问多个问题现在垂直堆叠太长了」。分栏后一次只显示一题，
    // 这一组锁住 tab 标签与自动跳题两件事。
    it("labels tabs with the short header and marks answered ones", () => {
      const selections: Record<string, QuestionSelectionState> = {
        q1: { selected: ["A (Recommended)"], otherActive: false, otherText: "" },
        q2: { selected: [], otherActive: false, otherText: "" },
      }

      expect(buildQuestionTabItems(pending, selections)).toEqual([
        { title: "✓ Choice", questionId: "q1", answered: true },
        { title: "Multi", questionId: "q2", answered: false },
      ])
    })

    it("falls back to an index label, never to the full question text", () => {
      // header 缺失时退回「问题 N」。绝不能退回 `question` —— 几十字的问句当标签，
      // 每个 tab 看起来都一样，等于没有标签。
      const headerless = {
        ...pending,
        questions: [
          { ...pending.questions[0], header: "" },
          { ...pending.questions[1], header: "   " },
        ],
      }

      const items = buildQuestionTabItems(headerless, {})
      expect(items.map((item) => item.title)).toEqual(["问题 1", "问题 2"])
      expect(items.map((item) => item.title).join("")).not.toContain("Pick one")
    })

    it("treats an opened-but-empty Other as unanswered", () => {
      // 点开「其他」却没打字不算答完，否则提交按钮会亮起而提交上去那项是空的。
      const items = buildQuestionTabItems(pending, {
        q1: { selected: [], otherActive: true, otherText: "   " },
        q2: { selected: [], otherActive: true, otherText: "typed" },
      })

      expect(items[0]).toMatchObject({ answered: false, title: "Choice" })
      expect(items[1]).toMatchObject({ answered: true, title: "✓ Multi" })
    })

    it("advances only for a single-select pick that is not the last question", () => {
      const advance = (patch: Parameters<typeof resolveNextQuestionTabIndex>[0]) =>
        resolveNextQuestionTabIndex(patch)

      // 单选、非末题 → 跳。这条是让多个 tab 读起来像向导的关键。
      expect(
        advance({ questionCount: 3, currentIndex: 0, multiSelect: false, isOtherToggle: false })
      ).toBe(1)
      // 多选不跳：用户可能还要继续勾。
      expect(
        advance({ questionCount: 3, currentIndex: 0, multiSelect: true, isOtherToggle: false })
      ).toBeNull()
      // 切「其他」不跳：他还要打字，跳走就打不成了。
      expect(
        advance({ questionCount: 3, currentIndex: 0, multiSelect: false, isOtherToggle: true })
      ).toBeNull()
      // 末题不跳。
      expect(
        advance({ questionCount: 3, currentIndex: 2, multiSelect: false, isOtherToggle: false })
      ).toBeNull()
      // 单问题（不分栏）时也没有可跳的目标。
      expect(
        advance({ questionCount: 1, currentIndex: 0, multiSelect: false, isOtherToggle: false })
      ).toBeNull()
    })
  })
})
