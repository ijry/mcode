import {
  classifyExternalUrl,
  confirmExternalOpen,
  normalizeHttpUrl,
  openGuardedExternalUrl,
} from "@/services/externalLinkGuard"

describe("external link guard", () => {
  beforeEach(() => {
    ;(uni as any).showModal = jest.fn()
  })

  it("normalizes http links and rejects unsupported schemes", () => {
    expect(normalizeHttpUrl(" https://getmcode.lingyun.net/docs ")).toBe("https://getmcode.lingyun.net/docs")
    expect(normalizeHttpUrl("mailto:hi@example.com")).toBe("")
    expect(normalizeHttpUrl("/pages/circles/detail?id=1")).toBe("")
  })

  it("treats the current site host as trusted", () => {
    expect(classifyExternalUrl("https://getmcode.lingyun.net/help", {
      siteBaseUrl: "https://getmcode.lingyun.net/api",
    })).toEqual({
      decision: "trusted-site",
      href: "https://getmcode.lingyun.net/help",
      hostname: "getmcode.lingyun.net",
    })
  })

  it("requires confirmation for non-site domains", () => {
    expect(classifyExternalUrl("https://pan.quark.cn/s/0008015b1d33", {
      siteBaseUrl: "https://getmcode.lingyun.net/api",
    })).toEqual({
      decision: "confirm-external",
      href: "https://pan.quark.cn/s/0008015b1d33",
      hostname: "pan.quark.cn",
    })
  })

  it("does not auto-trust sibling subdomains", () => {
    expect(classifyExternalUrl("https://docs.lingyun.net/guide", {
      siteBaseUrl: "https://getmcode.lingyun.net/api",
    })?.decision).toBe("confirm-external")
  })

  it("opens trusted links without confirmation", async () => {
    const confirmExternalOpen = jest.fn().mockResolvedValue(true)
    const openUrl = jest.fn().mockReturnValue(true)

    await expect(openGuardedExternalUrl("https://getmcode.lingyun.net/help", {
      siteBaseUrl: "https://getmcode.lingyun.net/api",
      confirmExternalOpen,
      openUrl,
    })).resolves.toBe("opened")

    expect(confirmExternalOpen).not.toHaveBeenCalled()
    expect(openUrl).toHaveBeenCalledWith("https://getmcode.lingyun.net/help")
  })

  it("prompts before opening foreign domains and respects cancellation", async () => {
    const confirmExternalOpen = jest.fn().mockResolvedValue(false)
    const openUrl = jest.fn().mockReturnValue(true)

    await expect(openGuardedExternalUrl("https://pan.quark.cn/s/0008015b1d33", {
      siteBaseUrl: "https://getmcode.lingyun.net/api",
      confirmExternalOpen,
      openUrl,
    })).resolves.toBe("cancelled")

    expect(confirmExternalOpen).toHaveBeenCalledWith({
      decision: "confirm-external",
      href: "https://pan.quark.cn/s/0008015b1d33",
      hostname: "pan.quark.cn",
    })
    expect(openUrl).not.toHaveBeenCalled()
  })

  it("renders a confirmation dialog with the destination host", async () => {
    ;(uni.showModal as jest.Mock).mockImplementation(({ success }) => {
      success({ confirm: true, cancel: false })
    })

    await expect(confirmExternalOpen({
      decision: "confirm-external",
      href: "https://pan.quark.cn/s/0008015b1d33",
      hostname: "pan.quark.cn",
    })).resolves.toBe(true)

    expect(uni.showModal).toHaveBeenCalledWith(expect.objectContaining({
      title: "即将离开本站",
      content: "将打开外部链接 pan.quark.cn，请确认继续。",
      confirmText: "继续打开",
      cancelText: "取消",
    }))
  })
})
