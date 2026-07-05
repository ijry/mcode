import {
  CONNECTION_HOST_FILTERS,
  CONNECTION_HOST_MODELS,
  DEFAULT_CONNECTION_HOST_MODEL_ID,
  getConnectionHostModel,
  isKnownConnectionHostModelId,
  normalizeConnectionHostModelId,
  searchConnectionHostModels,
} from "@/services/connectionHostCatalog"

describe("connectionHostCatalog", () => {
  it("contains the requested physical and cloud host models in one catalog", () => {
    const ids = CONNECTION_HOST_MODELS.map((item) => item.id)

    expect(ids).toEqual(expect.arrayContaining([
      "apple-macbook-air",
      "apple-mac-mini",
      "apple-imac",
      "dell-xps",
      "dell-alienware",
      "lenovo-thinkpad",
      "lenovo-legion",
      "hp-omen",
      "beelink-mini-pc",
      "mechrevo-laptop",
      "asus-rog",
      "msi-gaming",
      "microsoft-surface",
      "framework-laptop",
      "alibaba-cloud-ecs",
      "aws-ec2",
      "tencent-cloud-cvm",
      "huawei-cloud-ecs",
      "azure-vm",
      "google-compute-engine",
      "oracle-cloud-compute",
      "digitalocean-droplet",
      "other-computer",
    ]))
  })

  it("normalizes known ids and drops unknown ids", () => {
    expect(isKnownConnectionHostModelId("aws-ec2")).toBe(true)
    expect(normalizeConnectionHostModelId(" aws-ec2 ")).toBe("aws-ec2")
    expect(normalizeConnectionHostModelId("unknown-host")).toBeUndefined()
    expect(normalizeConnectionHostModelId(null)).toBeUndefined()
  })

  it("returns Other Computer as the fallback model", () => {
    expect(DEFAULT_CONNECTION_HOST_MODEL_ID).toBe("other-computer")
    expect(getConnectionHostModel("missing")).toMatchObject({
      id: "other-computer",
      displayName: "Other Computer",
      kind: "computer",
    })
  })

  it("searches across brands, models, Chinese aliases, and cloud providers", () => {
    expect(searchConnectionHostModels("拯救者").map((item) => item.id)).toContain("lenovo-legion")
    expect(searchConnectionHostModels("零刻").map((item) => item.id)).toContain("beelink-mini-pc")
    expect(searchConnectionHostModels("AWS").map((item) => item.id)).toContain("aws-ec2")
    expect(searchConnectionHostModels("阿里云").map((item) => item.id)).toContain("alibaba-cloud-ecs")
  })

  it("filters without creating separate first-level categories", () => {
    expect(CONNECTION_HOST_FILTERS.map((item) => item.id)).toEqual([
      "all",
      "apple",
      "lenovo",
      "dell",
      "hp",
      "gaming",
      "mini-pc",
      "cloud",
      "other",
    ])
    expect(searchConnectionHostModels("", "cloud").map((item) => item.id)).toEqual(expect.arrayContaining([
      "alibaba-cloud-ecs",
      "aws-ec2",
      "azure-vm",
    ]))
  })
})
