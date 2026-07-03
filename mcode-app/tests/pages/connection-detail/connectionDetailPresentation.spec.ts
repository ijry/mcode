import {
  buildConnectionInfoRows,
  buildSettingsRows,
  getAppearanceAccentOptions,
} from "@/pages/connection-detail/connectionDetailPresentation"

describe("connection detail presentation", () => {
  it("builds read-only rows without exposing secrets", () => {
    const rows = buildConnectionInfoRows({
      version: 2,
      id: "conn_demo",
      name: "Demo",
      targetAgent: "codeg",
      routeMode: "direct",
      directBaseUrl: "http://127.0.0.1:3089",
      directToken: "secret-token",
      targetProfile: {
        targetAgent: "codeg",
        displayName: "Desktop",
        capabilities: ["folders", "settings"],
        protocolVersion: "1",
      },
    })

    expect(rows).toContainEqual({ label: "连接 ID", value: "conn_demo" })
    expect(rows).toContainEqual({ label: "直连 Token", value: "已保存" })
    expect(rows.map((row) => row.value).join(" ")).not.toContain("secret-token")
  })

  it("keeps desktop accent options visible for protocol-limited appearance", () => {
    expect(getAppearanceAccentOptions().map((item) => item.value)).toEqual([
      "neutral",
      "zinc",
      "slate",
      "stone",
      "gray",
      "red",
      "rose",
      "orange",
      "green",
      "blue",
      "yellow",
      "violet",
    ])
  })

  it("builds P57 settings groups in the approved order", () => {
    expect(buildSettingsRows()).toEqual([
      {
        title: "个性化",
        rows: [
          expect.objectContaining({ key: "appearance", label: "外观" }),
          expect.objectContaining({ key: "language", label: "语言" }),
          expect.objectContaining({ key: "general", label: "通用" }),
          expect.objectContaining({ key: "quickMessages", label: "快捷消息" }),
        ],
      },
    ])
  })
})
