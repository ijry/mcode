import { createPinia, setActivePinia } from "pinia"
import { useAccountStore } from "@/stores/account"

describe("account store", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    uni.clearStorageSync()
  })

  it("hydrates a saved session from storage", () => {
    uni.setStorageSync("mcode_user_token", "token-1")
    uni.setStorageSync("mcode_user_info", { name: "Ada", email: "ada@example.com" })

    const account = useAccountStore()

    expect(account.token).toBe("token-1")
    expect(account.userInfo?.name).toBe("Ada")
    expect(account.userInfo?.email).toBe("ada@example.com")
  })

  it("persists and clears the session", () => {
    const account = useAccountStore()

    account.setSession({
      token: "token-1",
      userInfo: { name: "Ada", email: "ada@example.com" },
    })

    expect(account.token).toBe("token-1")
    expect(account.userInfo?.name).toBe("Ada")
    expect(uni.getStorageSync("mcode_user_token")).toBe("token-1")
    expect(uni.getStorageSync("mcode_user_info")).toEqual({
      name: "Ada",
      email: "ada@example.com",
    })

    account.logout()

    expect(account.token).toBe("")
    expect(account.userInfo).toBeNull()
    expect(uni.getStorageSync("mcode_user_token")).toBe("")
    expect(uni.getStorageSync("mcode_user_info")).toBe("")
  })
})
