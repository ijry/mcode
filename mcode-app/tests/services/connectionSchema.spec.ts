import {
  buildConnectionRecordKey,
  ensureConnectionRecordId,
  normalizeConnectionRecordV2,
  type ConnectionRecordV2,
} from "@/services/connectionSchema"

describe("connectionSchema", () => {
  it("builds different keys for direct and gateway routes of the same target", () => {
    const direct = buildConnectionRecordKey({
      targetAgent: "mcode-desktop",
      routeMode: "direct",
      directBaseUrl: "http://10.0.0.8:3089",
    } as ConnectionRecordV2)

    const gateway = buildConnectionRecordKey({
      targetAgent: "mcode-desktop",
      routeMode: "gateway",
      gatewayBaseUrl: "https://relay.example.com",
    } as ConnectionRecordV2)

    expect(direct).not.toBe(gateway)
  })

  it("builds different keys for gateway routes with different target agents on the same gateway", () => {
    const codegGateway = buildConnectionRecordKey({
      targetAgent: "codeg",
      routeMode: "gateway",
      gatewayProvider: "official",
      gatewayBaseUrl: "https://relay.example.com",
    } as ConnectionRecordV2)

    const opencodeGateway = buildConnectionRecordKey({
      targetAgent: "opencode",
      routeMode: "gateway",
      gatewayProvider: "official",
      gatewayBaseUrl: "https://relay.example.com",
    } as ConnectionRecordV2)

    expect(codegGateway).toBe("codeg::gateway::https://relay.example.com")
    expect(opencodeGateway).toBe("opencode::gateway::https://relay.example.com")
  })

  it("preserves valid local connection ids and generates missing ids", () => {
    const normalized = normalizeConnectionRecordV2({
      version: 2,
      id: "conn_existing_123",
      name: "Local Codeg",
      targetAgent: "codeg",
      routeMode: "direct",
      directBaseUrl: "http://127.0.0.1:3089",
    })

    expect(normalized?.id).toBe("conn_existing_123")

    const withId = ensureConnectionRecordId({
      version: 2,
      name: "Local Codeg",
      targetAgent: "codeg",
      routeMode: "direct",
      directBaseUrl: "http://127.0.0.1:3089",
    })

    expect(withId.id).toMatch(/^conn_/)
  })

  it("preserves valid host model ids and drops unknown host model ids", () => {
    expect(
      normalizeConnectionRecordV2({
        version: 2,
        name: "Office Mac",
        targetAgent: "codeg",
        routeMode: "direct",
        directBaseUrl: "http://127.0.0.1:3089",
        hostModelId: "apple-macbook-air",
      })?.hostModelId
    ).toBe("apple-macbook-air")

    expect(
      normalizeConnectionRecordV2({
        version: 2,
        name: "Unknown Box",
        targetAgent: "codeg",
        routeMode: "direct",
        directBaseUrl: "http://127.0.0.1:3089",
        hostModelId: "not-a-real-host",
      })
    ).not.toHaveProperty("hostModelId")
  })

  it("does not include host type in connection identity keys", () => {
    const mac = buildConnectionRecordKey({
      targetAgent: "codeg",
      routeMode: "direct",
      directBaseUrl: "http://127.0.0.1:3089",
      hostModelId: "apple-macbook-air",
    } as ConnectionRecordV2)

    const ec2 = buildConnectionRecordKey({
      targetAgent: "codeg",
      routeMode: "direct",
      directBaseUrl: "http://127.0.0.1:3089",
      hostModelId: "aws-ec2",
    } as ConnectionRecordV2)

    expect(mac).toBe("codeg::direct::http://127.0.0.1:3089")
    expect(ec2).toBe(mac)
  })
})
