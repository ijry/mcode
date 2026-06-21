import { firstString } from "./detailDataNormalization"

export interface SlashCommandItem {
  key: string
  name: string
  desc: string
  hint?: string
}

export interface SlashState {
  visible: boolean
  keyword: string
}

const DEFAULT_SLASH_COMMAND_DESCRIPTIONS: Record<string, string> = {
  review: "审查当前改动并找出问题",
  "review-branch": "对比指定分支审查代码改动",
  "review-commit": "审查某次提交引入的改动",
  init: "为 Codex 创建 AGENTS.md 指令文件",
  compact: "压缩当前会话，减少上下文占用",
  undo: "撤销上一轮操作",
  logout: "退出当前 Codex 会话",
}

export function resolveSlashState(text: string): SlashState {
  const match = String(text || "").match(/(?:^|\n)\/([a-zA-Z]*)$/)
  if (!match) return { visible: false, keyword: "" }
  return { visible: true, keyword: (match[1] || "").toLowerCase() }
}

export function filterSlashCommands(
  commands: SlashCommandItem[],
  state: SlashState
): SlashCommandItem[] {
  if (!state.visible) return []
  const keyword = state.keyword
  if (!keyword) return commands
  return commands.filter((item) =>
    item.key.toLowerCase().includes(`/${keyword}`) ||
    item.name.toLowerCase().includes(keyword) ||
    item.desc.toLowerCase().includes(keyword) ||
    String(item.hint || "").toLowerCase().includes(keyword)
  )
}

export function slashCommandDescription(
  item: SlashCommandItem,
  descriptions = DEFAULT_SLASH_COMMAND_DESCRIPTIONS
) {
  const commandName = String(item.name || item.key || "").replace(/^\//, "").trim()
  return descriptions[commandName] || item.desc || item.hint || ""
}

export function applySlashCommandText(sourceText: string, item: Pick<SlashCommandItem, "key">) {
  const source = String(sourceText || "")
  if (/(?:^|\n)\/([a-zA-Z]*)$/.test(source)) {
    return source.replace(/(?:^|\n)\/([a-zA-Z]*)$/, (all) =>
      all.startsWith("\n") ? `\n${item.key} ` : `${item.key} `
    )
  }
  return `${source}${source ? "\n" : ""}${item.key} `
}

export function insertSlashText(sourceText: string) {
  const source = String(sourceText || "")
  if (source.endsWith("/")) return source
  return `${source}${source ? "\n" : ""}/`
}

export function resolveSlashPreset(text: string): string {
  return text
}

export function normalizeSlashCommandsFromSnapshot(snapshot: unknown): SlashCommandItem[] {
  const record = snapshot && typeof snapshot === "object"
    ? snapshot as Record<string, any>
    : {}
  const availableCommands = Array.isArray(record.available_commands)
    ? record.available_commands
    : Array.isArray(record.availableCommands)
      ? record.availableCommands
      : []
  return availableCommands
    .filter((item: any) => item && typeof item === "object" && firstString(item.name))
    .map((item: any) => ({
      key: `/${firstString(item.name) || ""}`,
      name: firstString(item.name) || "",
      desc: firstString(item.description) || "",
      hint: firstString(item.input_hint),
    }))
}
