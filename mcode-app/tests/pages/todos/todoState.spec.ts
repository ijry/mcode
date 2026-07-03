import {
  applyTodoEdit,
  createTodoItem,
  createProjectTodoItem,
  getProjectTodoSections,
  getVisibleTodoSections,
  hideCompletedTodos,
  isTodoBoundToProject,
  normalizeStoredTodos,
  toggleTodoCompletion,
} from "@/pages/todos/todoState"

describe("todoState", () => {
  it("normalizes legacy rows and drops invalid items", () => {
    const now = 1710000000000
    const normalized = normalizeStoredTodos(
      [
        { id: 1, text: "  写日报  ", completed: false, createdAt: now - 10 },
        { id: "2", text: "已完成任务", completed: true, createdAt: now - 5 },
        { id: "3", text: "   ", completed: false, createdAt: now },
      ],
      now
    )

    expect(normalized).toEqual([
      {
        id: "1",
        text: "写日报",
        completed: false,
        createdAt: now - 10,
        completedAt: null,
        hidden: false,
        hiddenAt: null,
      },
      {
        id: "2",
        text: "已完成任务",
        completed: true,
        createdAt: now - 5,
        completedAt: null,
        hidden: false,
        hiddenAt: null,
      },
    ])
  })

  it("creates visible sections and excludes hidden completed items", () => {
    const sections = getVisibleTodoSections(
      [
        createTodoItem("整理需求", 10),
        {
          ...createTodoItem("预约健身房", 20),
          completed: true,
          completedAt: 30,
        },
        {
          ...createTodoItem("隐藏旧任务", 40),
          completed: true,
          completedAt: 50,
          hidden: true,
          hiddenAt: 60,
        },
      ],
      "健身"
    )

    expect(sections.inProgress).toEqual([])
    expect(sections.completed.map((item) => item.text)).toEqual(["预约健身房"])
  })

  it("toggles a todo into completed and then restores it back to local active state", () => {
    const seed = [createTodoItem("补测试", 100)]
    const completed = toggleTodoCompletion(seed, seed[0].id, 200)

    expect(completed[0]).toMatchObject({
      completed: true,
      completedAt: 200,
      hidden: false,
      hiddenAt: null,
    })

    const reopened = toggleTodoCompletion(
      [{ ...completed[0], hidden: true, hiddenAt: 300 }],
      seed[0].id,
      400
    )

    expect(reopened[0]).toMatchObject({
      completed: false,
      completedAt: null,
      hidden: false,
      hiddenAt: null,
    })
  })

  it("hides only the completed ids passed in from the visible section", () => {
    const items = [
      { ...createTodoItem("进行中任务", 1), completed: false },
      { ...createTodoItem("已完成 A", 2), completed: true, completedAt: 20 },
      { ...createTodoItem("已完成 B", 3), completed: true, completedAt: 21 },
      {
        ...createTodoItem("已隐藏 C", 4),
        completed: true,
        completedAt: 30,
        hidden: true,
        hiddenAt: 31,
      },
    ]

    const hidden = hideCompletedTodos(items, ["2"], 500)

    expect(hidden[0]).toMatchObject({ hidden: false })
    expect(hidden[1]).toMatchObject({ hidden: true, hiddenAt: 500 })
    expect(hidden[2]).toMatchObject({ hidden: false, hiddenAt: null })
    expect(hidden[3]).toMatchObject({ hidden: true, hiddenAt: 31 })
  })

  it("updates todo text and removes a row when the edited text becomes empty", () => {
    const items = [createTodoItem("原始文案", 1)]

    expect(applyTodoEdit(items, items[0].id, "新文案")).toEqual([
      expect.objectContaining({ text: "新文案" }),
    ])
    expect(applyTodoEdit(items, items[0].id, "   ")).toEqual([])
  })

  it("normalizes old rows without adding project metadata", () => {
    const normalized = normalizeStoredTodos(
      [{ id: "1", text: "旧待办", completed: false }],
      100
    )

    expect(normalized[0]).toEqual({
      id: "1",
      text: "旧待办",
      completed: false,
      createdAt: 100,
      completedAt: null,
      hidden: false,
      hiddenAt: null,
    })
  })

  it("creates project-bound todos with connection and project metadata", () => {
    expect(
      createProjectTodoItem(
        "修复登录",
        { connectionId: "conn123", projectId: 42, projectName: "demo" },
        200
      )
    ).toMatchObject({
      id: "200",
      text: "修复登录",
      connectionId: "conn123",
      projectId: 42,
      projectName: "demo",
      completed: false,
    })
  })

  it("filters visible todos by connection and project id", () => {
    const binding = { connectionId: "conn123", projectId: 42, projectName: "demo" }
    const items = [
      createProjectTodoItem("当前项目任务", binding, 1),
      createProjectTodoItem("其他项目任务", { connectionId: "conn123", projectId: 43 }, 2),
      createTodoItem("未绑定任务", 3),
      { ...createProjectTodoItem("已完成", binding, 4), completed: true, completedAt: 5 },
    ]

    expect(isTodoBoundToProject(items[0], binding)).toBe(true)
    const sections = getProjectTodoSections(items, binding, "")
    expect(sections.inProgress.map((item) => item.text)).toEqual(["当前项目任务"])
    expect(sections.completed.map((item) => item.text)).toEqual(["已完成"])
  })
})
