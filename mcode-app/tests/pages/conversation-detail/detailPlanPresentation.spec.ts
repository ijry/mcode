import {
  buildPlanFilterItems,
  buildPlanTasks,
  normalizeTaskStatus,
  taskStatusLabel,
} from "@/pages/conversation-detail/detailPlanPresentation"
import type { MessageTurn } from "@/types/acp"

const message = (overrides: Partial<MessageTurn>): MessageTurn => ({
  id: "m1",
  role: "assistant",
  content: [],
  timestamp: 1000,
  ...overrides,
})

describe("detailPlanPresentation", () => {
  it("extracts tasks from plan parts and tool calls in stable order", () => {
    const tasks = buildPlanTasks({
      messages: [
        message({
          id: "m1",
          content: [
            {
              type: "plan",
              plan: {
                steps: [
                  { description: "Write tests", completed: true },
                  { description: "Implement helpers", completed: false },
                ],
              },
            },
            {
              type: "tool_call",
              tool_call: {
                id: "tool-1",
                name: "TodoWrite",
                input: {
                  todos: [
                    { id: "todo-1", content: "Wire page", status: "in_progress" },
                    { id: "todo-2", content: "Verify", status: "pending" },
                  ],
                },
              },
            },
          ],
        }),
      ],
    })

    expect(tasks.map((task) => [task.id, task.subject, task.status])).toEqual([
      ["plan-write tests", "Write tests", "completed"],
      ["plan-implement helpers", "Implement helpers", "pending"],
      ["todo-1", "Wire page", "in_progress"],
      ["todo-2", "Verify", "pending"],
    ])
  })

  it("uses live plan content when completed messages do not contain tasks", () => {
    const tasks = buildPlanTasks({
      messages: [],
      liveContent: [
        {
          type: "plan",
          plan: {
            steps: [{ description: "Live step", completed: false }],
          },
        },
      ],
    })

    expect(tasks).toEqual([
      expect.objectContaining({
        id: "plan-live step",
        subject: "Live step",
        status: "pending",
      }),
    ])
  })

  it("normalizes status aliases and labels", () => {
    expect(normalizeTaskStatus("running")).toBe("in_progress")
    expect(normalizeTaskStatus("done")).toBe("completed")
    expect(normalizeTaskStatus("cancelled")).toBe("failed")
    expect(normalizeTaskStatus("unknown")).toBe("pending")
    expect(taskStatusLabel("in_progress")).toBe("进行中")
    expect(taskStatusLabel("completed")).toBe("已完成")
    expect(taskStatusLabel("failed")).toBe("失败")
    expect(taskStatusLabel("pending")).toBe("待处理")
  })

  it("builds filter counts", () => {
    const items = buildPlanFilterItems([
      { id: "1", subject: "a", status: "completed", order: 1 },
      { id: "2", subject: "b", status: "failed", order: 2 },
    ])

    expect(items).toEqual([
      { key: "all", label: "全部", count: 2 },
      { key: "in_progress", label: "进行中", count: 0 },
      { key: "pending", label: "待处理", count: 0 },
      { key: "completed", label: "已完成", count: 1 },
      { key: "failed", label: "失败", count: 1 },
    ])
  })
})
