import { buildGatewayQrPayload } from "./pairing"

it("builds a v2 desktop gateway QR payload", () => {
  expect(
    buildGatewayQrPayload({
      name: "Work Mac Mini",
      gatewayProvider: "official",
      pairCode: "ABCD-1234",
      pairSecret: "pair-secret",
    })
  ).toEqual({
    version: 2,
    name: "Work Mac Mini",
    targetAgent: "mcode-desktop",
    routeMode: "gateway",
    gatewayProvider: "official",
    pairCode: "ABCD-1234",
    pairSecret: "pair-secret",
  })
})

it("includes normalized custom gateway base url in v2 desktop payloads", () => {
  expect(
    buildGatewayQrPayload({
      name: "Workstation",
      gatewayProvider: "custom",
      gatewayBaseUrl: "https://gateway.example.com/",
      pairCode: "WXYZ-6789",
      pairSecret: "secret",
    })
  ).toMatchObject({
    version: 2,
    targetAgent: "mcode-desktop",
    routeMode: "gateway",
    gatewayProvider: "custom",
    gatewayBaseUrl: "https://gateway.example.com",
  })
})
