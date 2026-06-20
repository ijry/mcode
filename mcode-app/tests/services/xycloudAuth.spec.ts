import {
  login,
  registerEmail,
  registerMobile,
  resolveXycloudBaseUrl,
  sendEmailVerifyCode,
  sendMobileVerifyCode,
  XYCLOUD_DEFAULT_BASE_URL,
} from "@/services/xycloudAuth"

describe("xycloud auth service", () => {
  beforeEach(() => {
    ;(globalThis as any).__XYCLOUD_BASE_URL__ = "https://xycloud.example.com/"
    uni.request.mockResolvedValue({
      statusCode: 200,
      data: { code: 200, msg: "ok", data: { token: "t-1", userInfo: { name: "Ada" } } },
    })
  })

  afterEach(() => {
    delete (globalThis as any).__XYCLOUD_BASE_URL__
  })

  it("normalizes the runtime base url", () => {
    expect(resolveXycloudBaseUrl()).toBe("https://xycloud.example.com")
  })

  it("falls back to the production account api base url", () => {
    delete (globalThis as any).__XYCLOUD_BASE_URL__

    expect(resolveXycloudBaseUrl()).toBe(XYCLOUD_DEFAULT_BASE_URL)
  })

  it("uses the default base url for login when no override is configured", async () => {
    delete (globalThis as any).__XYCLOUD_BASE_URL__

    await login({ account: "alice", password: "secret" })

    expect(uni.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://getmcode.lingyun.net/api/v1/core/user/login",
        method: "POST",
        data: { account: "alice", password: "secret" },
      })
    )
  })

  it("posts login payload to the xycloud login endpoint", async () => {
    await login({ account: "alice", password: "secret" })

    expect(uni.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://xycloud.example.com/v1/core/user/login",
        method: "POST",
        data: { account: "alice", password: "secret" },
      })
    )
  })

  it("posts email register payload to the xycloud endpoint", async () => {
    await registerEmail({
      email: "alice@example.com",
      verify: "123456",
      token: "verify-token",
      password: "secret123",
      inviteCode: "INVITE",
      channelName: "mcode",
      agreement: true,
    })

    expect(uni.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://xycloud.example.com/v1/reg_email/user/register",
        data: expect.objectContaining({
          email: "alice@example.com",
          verify: "123456",
          token: "verify-token",
          password: "secret123",
          inviteCode: "INVITE",
          channelName: "mcode",
          agreement: true,
        }),
      })
    )
  })

  it("posts mobile register payload to the xycloud endpoint", async () => {
    await registerMobile({
      mobile: "13800000000",
      verify: "654321",
      token: "verify-token",
      password: "secret123",
      inviteCode: "INVITE",
      channelName: "mcode",
      agreement: true,
    })

    expect(uni.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://xycloud.example.com/v1/reg_mobile/user/register",
        data: expect.objectContaining({
          mobile: "13800000000",
          verify: "654321",
        }),
      })
    )
  })

  it("posts email verification payload to the send endpoint", async () => {
    await sendEmailVerifyCode({
      email: "alice@example.com",
      title: "用户注册",
      verifyUser: 0,
    })

    expect(uni.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://xycloud.example.com/v1/email/verify/send",
        data: { email: "alice@example.com", title: "用户注册", verifyUser: 0 },
      })
    )
  })

  it("posts mobile verification payload to the send endpoint", async () => {
    await sendMobileVerifyCode({
      mobile: "13800000000",
      title: "用户注册",
      verifyUser: 0,
    })

    expect(uni.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://xycloud.example.com/v1/sms/verify/send",
        data: { mobile: "13800000000", title: "用户注册", verifyUser: 0 },
      })
    )
  })
})
