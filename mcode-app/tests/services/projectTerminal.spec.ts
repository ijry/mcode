import {
  extractTerminalOutputText,
  isTerminalExitChannel,
  isTerminalOutputChannel,
  killProjectTerminal,
  normalizeTerminalChannelFrame,
  resolveTerminalMountHost,
  resizeProjectTerminal,
  spawnProjectTerminal,
  writeProjectTerminal,
} from "@/services/projectTerminal"

describe("projectTerminal", () => {
  it("spawns a terminal in the project working directory", async () => {
    const gateway = { call: jest.fn().mockResolvedValue("term-1") }

    await spawnProjectTerminal(gateway as any, {
      workingDir: "D:/Repos/demo",
      terminalId: "term-1",
    })

    expect(gateway.call).toHaveBeenCalledWith("terminal_spawn", {
      workingDir: "D:/Repos/demo",
      shell: null,
      initialCommand: null,
      terminalId: "term-1",
    })
  })

  it("writes, resizes, and kills by terminal id", async () => {
    const gateway = { call: jest.fn().mockResolvedValue(null) }

    await writeProjectTerminal(gateway as any, "term-1", "ls\r")
    await resizeProjectTerminal(gateway as any, "term-1", 80, 24)
    await killProjectTerminal(gateway as any, "term-1")

    expect(gateway.call).toHaveBeenNthCalledWith(1, "terminal_write", {
      terminalId: "term-1",
      data: "ls\r",
    })
    expect(gateway.call).toHaveBeenNthCalledWith(2, "terminal_resize", {
      terminalId: "term-1",
      cols: 80,
      rows: 24,
    })
    expect(gateway.call).toHaveBeenNthCalledWith(3, "terminal_kill", {
      terminalId: "term-1",
    })
  })

  it("normalizes terminal event frames from the global channel", () => {
    expect(
      normalizeTerminalChannelFrame({
        channel: "terminal://output/term-1",
        payload: { data: "hello" },
      })
    ).toEqual({
      channel: "terminal://output/term-1",
      payload: { data: "hello" },
    })
    expect(isTerminalOutputChannel("terminal://output/term-1", "term-1")).toBe(true)
    expect(isTerminalExitChannel("terminal://exit/term-1", "term-1")).toBe(true)
  })

  it("preserves terminal output whitespace and control characters", () => {
    expect(extractTerminalOutputText({ data: "  hello\r\n\u001b[31mred\u001b[0m  " })).toBe(
      "  hello\r\n\u001b[31mred\u001b[0m  "
    )
  })

  it("resolves a real DOM mount host from uni-style refs", () => {
    const ownerDocument = { createElement: jest.fn() }
    const hostElement = {
      ownerDocument,
      querySelector: jest.fn(),
      appendChild: jest.fn(),
    }
    const rootElement = {
      ownerDocument,
      querySelector: jest.fn().mockReturnValue(hostElement),
      appendChild: jest.fn(),
    }

    expect(resolveTerminalMountHost(hostElement)).toBe(hostElement)
    expect(resolveTerminalMountHost({ $el: hostElement })).toBe(hostElement)
    expect(resolveTerminalMountHost(null, rootElement, "terminal-host")).toBe(hostElement)
    expect(resolveTerminalMountHost({ ref: "terminal-host" }, rootElement)).toBe(hostElement)
    expect(resolveTerminalMountHost({ ref: "terminal-host" })).toBeNull()
  })
})
