import {
  __resetRelayClientIdForTest,
  getRelayClientId,
} from "@/services/gateway/relayClientIdentity"

describe("relayClientIdentity", () => {
  beforeEach(() => {
    __resetRelayClientIdForTest()
  })

  it("creates and persists a stable relay client id", () => {
    const first = getRelayClientId()
    const second = getRelayClientId()

    expect(first).toMatch(/^mcode-client-/)
    expect(second).toBe(first)
    expect(uni.setStorageSync).toHaveBeenCalledWith("mcode:relay-client-id", first)
  })

  it("reuses a valid stored relay client id", () => {
    ;(uni.getStorageSync as jest.Mock).mockReturnValue("mcode-client-existing")

    expect(getRelayClientId()).toBe("mcode-client-existing")
  })
})
