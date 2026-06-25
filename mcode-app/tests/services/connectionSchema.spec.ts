import {
  buildConnectionRecordKey,
  migrateConnectionRecord,
  type ConnectionRecordV2,
} from "@/services/connectionSchema"

describe("connectionSchema", () => {
  it("migrates legacy direct records into v2 codeg/direct records", () => {
    const expected: ConnectionRecordV2 = {
      version: 2,
      name: "Legacy Direct",
      targetAgent: "codeg",
      routeMode: "direct",
      directBaseUrl: "http://127.0.0.1:3089",
      directToken: "token-1",
    }

    expect(
      migrateConnectionRecord({
        name: "Legacy Direct",
        mode: "direct",
        url: "http://127.0.0.1:3089/",
        directToken: "token-1",
      })
    ).toEqual(expected)
  })

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
})
