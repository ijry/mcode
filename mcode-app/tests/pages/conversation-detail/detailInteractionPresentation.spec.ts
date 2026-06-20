import {
  buildQuestionAnswer,
  createQuestionSelectionState,
  isQuestionRecommended,
  isQuestionSelectionAnswered,
  questionLabelText,
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
})
