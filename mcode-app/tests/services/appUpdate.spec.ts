import {
  appUpdateConfig,
  isAndroidApp,
  shouldCheckAppUpdate,
  startAppUpdateCheck,
} from "@/services/appUpdate"

describe("app update service", () => {
  beforeEach(() => {
    ;(global as any).plus = undefined
    ;(uni as any).getSystemInfoSync = jest.fn()
    ;(uni as any).getAppBaseInfo = jest.fn()
    ;(uni as any).showModal = jest.fn()
  })

  it("checks at most once per hour", () => {
    expect(shouldCheckAppUpdate(3_600_000, 0)).toBe(true)
    expect(shouldCheckAppUpdate(3_599_999, 1)).toBe(false)
    expect(shouldCheckAppUpdate(10, 10)).toBe(false)
    expect(appUpdateConfig.intervalMs).toBe(3_600_000)
  })

  it("only enables the checker on Android App runtime", () => {
    expect(isAndroidApp()).toBe(false)

    ;(global as any).plus = { runtime: {} }
    ;(uni.getSystemInfoSync as jest.Mock).mockReturnValue({ platform: "android" })
    expect(isAndroidApp()).toBe(true)

    ;(uni.getSystemInfoSync as jest.Mock).mockReturnValue({ platform: "ios" })
    expect(isAndroidApp()).toBe(false)
  })

  it("requests the appbeta channel and opens the download page after confirmation", async () => {
    ;(global as any).plus = {
      runtime: { openWeb: jest.fn() },
    }
    ;(uni.getSystemInfoSync as jest.Mock).mockReturnValue({ platform: "android" })
    ;(uni.getAppBaseInfo as jest.Mock).mockReturnValue({
      appVersion: "0.3.0",
      appVersionCode: "3",
    })
    ;(uni.request as jest.Mock).mockResolvedValue({
      statusCode: 200,
      data: {
        code: 200,
        data: {
          hasUpdate: true,
          versionInfo: {
            version: "0.3.0",
            versionCode: "3",
            updateIntro: "修复问题",
          },
        },
      },
    })
    ;(uni.showModal as jest.Mock).mockImplementation(({ success }: any) => success({ confirm: true }))

    startAppUpdateCheck()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(uni.request).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://app.lingyun.net/api/v1/appbeta/app/checkUpdate?key=qH5w&version=0.3.0&versionCode=3",
      method: "GET",
    }))
    expect(uni.showModal).toHaveBeenCalledWith(expect.objectContaining({
      title: "发现新版本 0.3.0（构建号 3）",
      confirmText: "立即更新",
    }))
    expect((global as any).plus.runtime.openWeb).toHaveBeenCalledWith(
      "https://app.lingyun.net/appbeta/qH5w",
    )
  })

  it("forces one check on cold launch even within the hourly cooldown", async () => {
    ;(global as any).plus = { runtime: {} }
    ;(uni.getSystemInfoSync as jest.Mock).mockReturnValue({ platform: "android" })
    ;(uni.getAppBaseInfo as jest.Mock).mockReturnValue({
      appVersion: "0.3.0",
      appVersionCode: "3",
    })
    ;(uni.setStorageSync as jest.Mock).mockImplementation(() => undefined)
    ;(uni.getStorageSync as jest.Mock).mockReturnValue(String(Date.now()))
    ;(uni.request as jest.Mock).mockResolvedValue({
      statusCode: 200,
      data: { code: 0, data: { hasUpdate: false } },
    })

    startAppUpdateCheck(true)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(uni.request).toHaveBeenCalledTimes(1)
  })
})
