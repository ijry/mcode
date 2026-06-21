import {
  applySlashCommandText,
  filterSlashCommands,
  insertSlashText,
  normalizeSlashCommandsFromSnapshot,
  resolveSlashPreset,
  resolveSlashState,
  slashCommandDescription,
  type SlashCommandItem,
} from "@/pages/conversation-detail/detailSlashCommands"

const commands: SlashCommandItem[] = [
  { key: "/review", name: "review", desc: "", hint: "check code" },
  { key: "/init", name: "init", desc: "init repo" },
  { key: "/custom", name: "custom", desc: "Custom flow", hint: "ship" },
]

describe("detailSlashCommands", () => {
  it("detects slash state at line end", () => {
    expect(resolveSlashState("/re")).toEqual({ visible: true, keyword: "re" })
    expect(resolveSlashState("hello\n/IN")).toEqual({ visible: true, keyword: "in" })
    expect(resolveSlashState("hello /no")).toEqual({ visible: false, keyword: "" })
  })

  it("filters slash commands by key, name, desc, and hint", () => {
    expect(filterSlashCommands(commands, { visible: false, keyword: "" })).toEqual([])
    expect(filterSlashCommands(commands, { visible: true, keyword: "" })).toEqual(commands)
    expect(filterSlashCommands(commands, { visible: true, keyword: "rev" })).toEqual([commands[0]])
    expect(filterSlashCommands(commands, { visible: true, keyword: "ship" })).toEqual([commands[2]])
    expect(filterSlashCommands(commands, { visible: true, keyword: "flow" })).toEqual([commands[2]])
  })

  it("resolves slash command descriptions from defaults then item fields", () => {
    expect(slashCommandDescription(commands[0])).toBe("审查当前改动并找出问题")
    expect(slashCommandDescription(commands[2])).toBe("Custom flow")
    expect(slashCommandDescription({ key: "/x", name: "x", desc: "", hint: "fallback" }))
      .toBe("fallback")
  })

  it("applies and inserts slash commands into composer text", () => {
    expect(applySlashCommandText("/re", commands[0])).toBe("/review ")
    expect(applySlashCommandText("hello\n/re", commands[0])).toBe("hello\n/review ")
    expect(applySlashCommandText("hello", commands[1])).toBe("hello\n/init ")
    expect(applySlashCommandText("", commands[1])).toBe("/init ")
    expect(insertSlashText("hello")).toBe("hello\n/")
    expect(insertSlashText("hello/")).toBe("hello/")
    expect(insertSlashText("")).toBe("/")
  })

  it("normalizes slash commands from snapshot payloads", () => {
    expect(normalizeSlashCommandsFromSnapshot({
      available_commands: [
        { name: "review", description: "review desc", input_hint: "hint" },
        { name: "" },
        null,
      ],
    })).toEqual([
      { key: "/review", name: "review", desc: "review desc", hint: "hint" },
    ])

    expect(normalizeSlashCommandsFromSnapshot({
      availableCommands: [{ name: "init" }],
    })).toEqual([
      { key: "/init", name: "init", desc: "", hint: undefined },
    ])
  })

  it("keeps slash preset passthrough behavior", () => {
    expect(resolveSlashPreset("/review")).toBe("/review")
  })
})
