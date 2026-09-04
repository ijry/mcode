import {
  buildCommitFileOptions,
  buildCommitResultText,
  commitFileStatusText,
  selectedCommitFiles,
  setAllCommitFiles,
  toggleCommitFile,
  validateCommitForm,
} from "@/pages/project-detail/projectGitCommitForm"

describe("提交表单勾选集", () => {
  it("按文件去重 —— 同一个文件可能有索引态与工作区态两条记录", () => {
    const options = buildCommitFileOptions([
      { status: "M", file: "src/a.ts" },
      { status: "MM", file: "src/a.ts" },
      { status: "??", file: "src/b.ts" },
    ])
    expect(options).toHaveLength(2)
    expect(options[0].file).toBe("src/a.ts")
    expect(options[0].statuses).toEqual(["M", "MM"])
    expect(commitFileStatusText(options[0])).toBe("M MM")
  })

  it("默认全选", () => {
    const options = buildCommitFileOptions([{ status: "M", file: "a" }])
    expect(options[0].selected).toBe(true)
    expect(selectedCommitFiles(options)).toEqual(["a"])
  })

  it("丢掉空文件名与空状态记录", () => {
    const options = buildCommitFileOptions([
      { status: "M", file: "  " },
      { status: "", file: "keep" },
    ] as any)
    expect(options.map((option) => option.file)).toEqual(["keep"])
    expect(options[0].statuses).toEqual([])
  })

  it("非数组入参返回空表", () => {
    expect(buildCommitFileOptions(null)).toEqual([])
    expect(buildCommitFileOptions(undefined)).toEqual([])
  })

  it("勾选切换与全选/全不选返回新数组，不改原表", () => {
    const options = buildCommitFileOptions([
      { status: "M", file: "a" },
      { status: "M", file: "b" },
    ])
    const toggled = toggleCommitFile(options, "a")
    expect(toggled).not.toBe(options)
    expect(options[0].selected).toBe(true)
    expect(toggled[0].selected).toBe(false)
    expect(selectedCommitFiles(toggled)).toEqual(["b"])

    const none = setAllCommitFiles(options, false)
    expect(selectedCommitFiles(none)).toEqual([])
    const all = setAllCommitFiles(none, true)
    expect(selectedCommitFiles(all)).toEqual(["a", "b"])
  })
})

describe("提交表单校验", () => {
  it("说明为空时拒绝", () => {
    expect(validateCommitForm({ message: "" })).toEqual({
      valid: false,
      error: "请填写提交说明",
    })
    expect(validateCommitForm({ message: "   " }).valid).toBe(false)
  })

  it("一个文件都不勾**不是**错误：那等于提交已暂存的内容", () => {
    expect(validateCommitForm({ message: "fix: x" })).toEqual({ valid: true, error: "" })
  })
})

describe("提交结果文案", () => {
  it("服务端数出的文件多于勾选数时，说明含此前已暂存的内容", () => {
    expect(buildCommitResultText({ committedFiles: 5, selectedCount: 2 })).toBe(
      "已提交 5 个文件（含此前已暂存的内容）"
    )
  })

  it("相等或更少时只报数量", () => {
    expect(buildCommitResultText({ committedFiles: 2, selectedCount: 2 })).toBe("已提交 2 个文件")
    expect(buildCommitResultText({ committedFiles: 0, selectedCount: 3 })).toBe("已提交 0 个文件")
  })
})
