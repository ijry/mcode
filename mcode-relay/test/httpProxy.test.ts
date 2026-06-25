import { describe, expect, it } from "vitest"
import { buildTunnelProxyPath } from "../src/tunnel/httpProxy.js"

describe("httpProxy", () => {
  it("builds tunnel proxy paths under the desktop target", () => {
    expect(buildTunnelProxyPath("desktop-1", 1080, "/preview")).toBe(
      "/v1/tunnel/desktop-1/1080/preview"
    )
  })

  it("normalizes missing and relative pathnames", () => {
    expect(buildTunnelProxyPath("desktop-1", 1080)).toBe("/v1/tunnel/desktop-1/1080/")
    expect(buildTunnelProxyPath("desktop-1", 1080, "preview")).toBe(
      "/v1/tunnel/desktop-1/1080/preview"
    )
  })
})
