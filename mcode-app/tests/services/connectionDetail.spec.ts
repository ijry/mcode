import {
  buildConnectionDetailRoute,
  getConnectionEndpointLabel,
  maskSecretPresence,
  normalizeConnectionDetailTab,
} from "@/services/connectionDetail"

describe("connectionDetail service", () => {
  it("normalizes tabs with folders as fallback", () => {
    expect(normalizeConnectionDetailTab("settings")).toBe("settings")
    expect(normalizeConnectionDetailTab("info")).toBe("info")
    expect(normalizeConnectionDetailTab("config")).toBe("config")
    expect(normalizeConnectionDetailTab("bad")).toBe("folders")
  })

  it("builds connection detail routes with encoded ids and tabs", () => {
    expect(buildConnectionDetailRoute({ connectionId: "conn 1", tab: "config" })).toBe(
      "/pages/connection-detail/index?connectionId=conn%201&tab=config"
    )
  })

  it("formats endpoints without exposing secrets", () => {
    expect(
      getConnectionEndpointLabel({
        version: 2,
        id: "conn_a",
        name: "Local",
        targetAgent: "codeg",
        routeMode: "direct",
        directBaseUrl: "http://127.0.0.1:3089",
        directToken: "secret",
      })
    ).toBe("http://127.0.0.1:3089")
    expect(maskSecretPresence("secret")).toBe("已保存")
    expect(maskSecretPresence("")).toBe("未保存")
  })
})
