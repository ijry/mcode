import type { CodegGateway } from "@/services/gateway"

export interface ProjectTerminalSpawnParams {
  workingDir: string
  shell?: string | null
  initialCommand?: string | null
  terminalId?: string | null
}

export interface ProjectTerminalInfo {
  id: string
  terminalId: string
  workingDir: string
  shell: string | null
  exited: boolean
}

export interface TerminalChannelFrame {
  channel: string
  payload: unknown
}

export function isDomTerminalRuntime() {
  return typeof window !== "undefined" && typeof document !== "undefined"
}

export function resolveTerminalMountHost(
  host: unknown,
  root?: ParentNode | null,
  fallbackRefKey?: string | null
): HTMLElement | null {
  if (isHtmlElement(host)) return host

  const hostElement = isRecord(host) ? host.$el : null
  if (isHtmlElement(hostElement)) return hostElement

  const refKey = pickString(
    isRecord(host) ? host.ref : "",
    isRecord(host) ? host.id : "",
    isRecord(host) ? host.dataset?.ref : "",
    fallbackRefKey
  )
  if (!refKey || !root || typeof root.querySelector !== "function") return null
  const selector = `[data-terminal-host="${escapeAttributeValue(refKey)}"]`
  const matched = root.querySelector(selector)
  return isHtmlElement(matched) ? matched : null
}

export async function spawnProjectTerminal(
  gateway: CodegGateway,
  params: ProjectTerminalSpawnParams
): Promise<string> {
  return gateway.call<string>("terminal_spawn", {
    workingDir: params.workingDir,
    shell: params.shell ?? null,
    initialCommand: params.initialCommand ?? null,
    terminalId: params.terminalId ?? null,
  })
}

export async function writeProjectTerminal(
  gateway: CodegGateway,
  terminalId: string,
  data: string
) {
  return gateway.call<void>("terminal_write", { terminalId, data })
}

export async function resizeProjectTerminal(
  gateway: CodegGateway,
  terminalId: string,
  cols: number,
  rows: number
) {
  return gateway.call<void>("terminal_resize", { terminalId, cols, rows })
}

export async function killProjectTerminal(gateway: CodegGateway, terminalId: string) {
  return gateway.call<void>("terminal_kill", { terminalId })
}

export async function listProjectTerminals(gateway: CodegGateway): Promise<ProjectTerminalInfo[]> {
  const raw = await gateway.call<unknown>("terminal_list")
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      const record = item && typeof item === "object" ? (item as Record<string, unknown>) : null
      if (!record) return null
      const id = pickString(record.id, record.terminalId, record.terminal_id)
      if (!id) return null
      return {
        id,
        terminalId: id,
        workingDir: pickString(record.workingDir, record.working_dir),
        shell: pickString(record.shell) || null,
        exited: Boolean(record.exited),
      } satisfies ProjectTerminalInfo
    })
    .filter((item): item is ProjectTerminalInfo => Boolean(item))
}

export function normalizeTerminalChannelFrame(raw: unknown): TerminalChannelFrame | null {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null
  if (!record) return null
  const channel = pickString(record.channel)
  if (channel) {
    return { channel, payload: record.payload ?? record.data ?? null }
  }

  const nested =
    record.payload && typeof record.payload === "object"
      ? (record.payload as Record<string, unknown>)
      : null
  const nestedChannel = pickString(nested?.channel)
  if (!nested || !nestedChannel) return null
  return { channel: nestedChannel, payload: nested.payload ?? nested.data ?? null }
}

export function isTerminalOutputChannel(channel: string, terminalId: string) {
  return channel === `terminal://output/${terminalId}`
}

export function isTerminalExitChannel(channel: string, terminalId: string) {
  return channel === `terminal://exit/${terminalId}`
}

export function extractTerminalOutputText(payload: unknown) {
  if (typeof payload === "string") return payload
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null
  const data = record?.data
  if (typeof data === "string") return data
  const text = record?.text
  if (typeof text === "string") return text
  return ""
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

function isHtmlElement(value: unknown): value is HTMLElement {
  return (
    isRecord(value) &&
    typeof value.ownerDocument?.createElement === "function" &&
    typeof value.appendChild === "function"
  )
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object"
}

function escapeAttributeValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}
