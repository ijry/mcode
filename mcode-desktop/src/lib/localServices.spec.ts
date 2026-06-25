import { buildLocalServiceConfig, describeServiceBind } from "./localServices"

it("builds the default loopback code service", () => {
  expect(buildLocalServiceConfig({ name: "Code", host: "127.0.0.1", port: 1080 })).toEqual({
    name: "Code",
    host: "127.0.0.1",
    port: 1080,
    protocol: "http",
    enabled: true,
  })
})

it("rejects non-loopback hosts in P3", () => {
  expect(() => buildLocalServiceConfig({ name: "Unsafe", host: "0.0.0.0", port: 1080 })).toThrow(
    "P3 only allows 127.0.0.1"
  )
})

it("describes a saved service bind", () => {
  expect(
    describeServiceBind({
      name: "Code",
      host: "127.0.0.1",
      port: 1080,
      protocol: "http",
      enabled: true,
    })
  ).toBe("127.0.0.1:1080")
})
