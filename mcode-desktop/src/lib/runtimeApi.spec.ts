import { beforeEach, expect, it, vi } from "vitest"

const invokeMock = vi.hoisted(() => vi.fn())

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, payload?: unknown) =>
    payload === undefined ? invokeMock(command) : invokeMock(command, payload),
}))

import {
  connectGatewayUpstream,
  configureGateway,
  generateDesktopPairOffer,
  getDesktopHealth,
  normalizeGatewayBaseUrl,
  saveLocalService,
} from "./runtimeApi"

beforeEach(() => {
  invokeMock.mockReset()
})

it("loads desktop health through the tauri command boundary", async () => {
  invokeMock.mockResolvedValue({ targetAgent: "mcode-desktop", upstreamStatus: "offline" })

  await expect(getDesktopHealth()).resolves.toMatchObject({ targetAgent: "mcode-desktop" })
  expect(invokeMock).toHaveBeenCalledWith("desktop_get_health")
})

it("configures custom gateway through tauri", async () => {
  invokeMock.mockResolvedValue({ upstreamStatus: "connecting" })

  await configureGateway({ provider: "custom", baseUrl: "https://gateway.example.com/" })

  expect(invokeMock).toHaveBeenCalledWith("desktop_configure_gateway", {
    provider: "custom",
    baseUrl: "https://gateway.example.com",
  })
})

it("starts gateway upstream through tauri", async () => {
  invokeMock.mockResolvedValue({ upstreamStatus: "connecting" })

  await expect(connectGatewayUpstream()).resolves.toMatchObject({ upstreamStatus: "connecting" })
  expect(invokeMock).toHaveBeenCalledWith("desktop_connect_gateway")
})

it("generates pair offers through tauri", async () => {
  invokeMock.mockResolvedValue({ code: "ABCD-1234", secret: "secret", qrPayload: "{}" })

  await expect(
    generateDesktopPairOffer({ name: "Workstation", provider: "official" })
  ).resolves.toMatchObject({
    code: "ABCD-1234",
  })
})

it("saves local service config through tauri", async () => {
  invokeMock.mockResolvedValue({
    name: "Code",
    host: "127.0.0.1",
    port: 1080,
    protocol: "http",
    enabled: true,
  })

  await saveLocalService({ name: "Code", host: "127.0.0.1", port: 1080, protocol: "http", enabled: true })

  expect(invokeMock).toHaveBeenCalledWith("desktop_save_local_service", {
    config: { name: "Code", host: "127.0.0.1", port: 1080, protocol: "http", enabled: true },
  })
})

it("normalizes gateway base urls", () => {
  expect(normalizeGatewayBaseUrl(" https://gateway.example.com// ")).toBe("https://gateway.example.com")
})
