/**
 * `dsh` 作为一个 targetAgent 在连接体系里能不能活。
 *
 * 这些断言看着琐碎，但它们各自对应一种真实故障：schema 不认它 → 保存后记录消失；
 * driver 表不认它 → 静默落到 codeg 直连；选项表不认它 → 编辑存量记录时下标算成 0，
 * 一保存就把连接类型悄悄改掉（那条注释在选项表里写着，是踩过的坑）。
 */
import {
  buildConnectionRecordKey,
  normalizeConnectionRecordV2,
  type ConnectionRecordV2,
} from "@/services/connectionSchema"
import { resolveConnectionDriver, dshDirectDriver } from "@/services/gateway/connectionDriverRegistry"
import {
  TARGET_AGENT_OPTIONS,
  getTargetAgentIndex,
  getVisibleTargetAgentOptions,
  resolveTargetAgentByIndex,
} from "@/pages/connections/connectionTargetAgentOptions"
import { getConnectionTargetLabel, getConnectionCapabilityChips } from "@/pages/connections/connectionPresentation"
import { assertPairTargetAgentMatchesSelection } from "@/services/connectionPairValidation"
import { DSH_CAPABILITY } from "@/agents/dsh/protocol"

const record = (overrides: Partial<ConnectionRecordV2> = {}): ConnectionRecordV2 => ({
  version: 2,
  name: "书房台式机 的 dsh",
  targetAgent: "dsh",
  routeMode: "direct",
  directBaseUrl: "http://192.168.1.20:8790/dsh-mobile-bridge",
  pairCode: "ABCD-2345",
  pairSecret: "secret",
  ...overrides,
})

describe("dsh connection records", () => {
  it("survives normalization instead of being dropped", () => {
    const normalized = normalizeConnectionRecordV2(record())
    expect(normalized).not.toBeNull()
    expect(normalized?.targetAgent).toBe("dsh")
    expect(normalized?.routeMode).toBe("direct")
  })

  it("gets its own identity namespace", () => {
    const dsh = buildConnectionRecordKey(normalizeConnectionRecordV2(record())!)
    const codeg = buildConnectionRecordKey(
      normalizeConnectionRecordV2(record({ targetAgent: "codeg", directToken: "t" }))!
    )
    expect(dsh).toContain("dsh")
    expect(dsh).not.toBe(codeg)
  })
})

describe("dsh driver resolution", () => {
  it("routes a dsh connection to the dsh driver, in both route modes", () => {
    expect(resolveConnectionDriver(record()).id).toBe("dsh-direct")
    // 网关形态还没做（桥需要反向拨号），但落到 codeg 直连会更糟：那会拿 dsh 的
    // 地址去说 codeg 的协议，报出来的错完全没有指向性。
    expect(resolveConnectionDriver(record({ routeMode: "gateway" })).id).toBe("dsh-direct")
    expect(dshDirectDriver.id).toBe("dsh-direct")
  })

  it("still routes the other agents where they were going", () => {
    expect(resolveConnectionDriver(record({ targetAgent: "codeg" })).id).toBe("codeg-direct")
    expect(resolveConnectionDriver(record({ targetAgent: "codeg", routeMode: "gateway" })).id).toBe(
      "codeg-gateway"
    )
    expect(resolveConnectionDriver(record({ targetAgent: "mcode-desktop" })).id).toBe("desktop-direct")
    expect(resolveConnectionDriver(record({ targetAgent: "opencode" })).id).toBe("opencode-direct")
  })
})

describe("dsh in the connection form", () => {
  it("is present but hidden, like the other non-codeg targets", () => {
    const option = TARGET_AGENT_OPTIONS.find((row) => row.value === "dsh")
    expect(option).toEqual({ label: "DeepSeek Harness", value: "dsh", hidden: true })
    expect(getVisibleTargetAgentOptions().some((row) => row.value === "dsh")).toBe(false)
  })

  it("becomes visible while it is the selected value, so editing cannot rewrite it", () => {
    const visible = getVisibleTargetAgentOptions("dsh")
    expect(visible.some((row) => row.value === "dsh")).toBe(true)
    const index = getTargetAgentIndex("dsh")
    expect(resolveTargetAgentByIndex(index, "dsh")).toBe("dsh")
  })
})

describe("dsh presentation", () => {
  it("has a label and capability chips of its own", () => {
    expect(getConnectionTargetLabel({ targetAgent: "dsh" })).toBe("DeepSeek Harness")
    expect(
      getConnectionCapabilityChips({
        targetAgent: "dsh",
        targetProfile: {
          targetAgent: "dsh",
          capabilities: [DSH_CAPABILITY.sessions, DSH_CAPABILITY.images, "dsh.bridge.something-new"],
        },
      })
    ).toEqual(["会话", "发图片"])
  })

  it("names dsh in a pair mismatch instead of printing a raw id", () => {
    expect(() => assertPairTargetAgentMatchesSelection({ targetAgent: "dsh" }, "codeg")).toThrow(
      /配对码属于 DeepSeek Harness，不是 Codeg/
    )
    expect(() => assertPairTargetAgentMatchesSelection({ targetAgent: "dsh" }, "dsh")).not.toThrow()
  })
})
