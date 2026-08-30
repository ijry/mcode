import {
  buildAppVersionLabel,
  formatBuildTimestamp,
  readAppVersionInfo,
} from "@/services/appVersion"

describe("app version presentation", () => {
  beforeEach(() => {
    ;(uni as any).getAppBaseInfo = jest.fn()
  })

  it("reads the packaged version from the uni-app runtime", () => {
    ;(uni.getAppBaseInfo as jest.Mock).mockReturnValue({
      appVersion: "2.4.7",
      appVersionCode: "247",
    })

    expect(readAppVersionInfo()).toEqual({
      version: "2.4.7",
      versionCode: "247",
    })
  })

  it("formats the compile timestamp as YYYYMMDDHHmm", () => {
    expect(formatBuildTimestamp(new Date(2026, 7, 26, 21, 30, 45))).toBe("202608262130")
  })

  it("appends the compile timestamp to the runtime version", () => {
    expect(
      buildAppVersionLabel(
        { version: "0.3.1", versionCode: "3" },
        new Date(2026, 7, 26, 21, 30, 45),
      ),
    ).toBe("0.3.1.202608262130")
  })
})
