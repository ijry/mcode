import fs from "node:fs"
import path from "node:path"

const artifacts = path.resolve(__dirname, "../../../src/agents/dsh/protocol-artifacts")

const ERROR_CODES = [
  "bad_frame", "bad_version", "frame_too_large", "source_unavailable",
  "not_found", "forbidden", "unauthorized", "rate_limited", "timeout",
  "cancelled", "circuit_open", "ticket_unavailable", "invalid_input",
  "conflict", "internal",
]
const KINDS = [
  "hello", "catalog", "subscribe", "unsubscribe", "event",
  "request", "response", "cancel", "overflow", "error",
]

function readJson(relative: string) {
  return JSON.parse(fs.readFileSync(path.join(artifacts, relative), "utf8"))
}

function assertBasicFrame(frame: any) {
  expect(frame).toEqual(expect.objectContaining({ v: 2, kind: expect.any(String) }))
  expect(KINDS).toContain(frame.kind)
}

function validateGolden(frame: any): string | null {
  if (frame?.v !== 2) return "bad_version"
  if (!KINDS.includes(frame?.kind)) return "bad_frame"
  const sourceKinds = ["subscribe", "unsubscribe", "event", "request", "response", "cancel", "overflow"]
  if (sourceKinds.includes(frame.kind) && !/^[a-z0-9][a-z0-9._-]{1,127}$/.test(frame.source ?? "")) {
    return "bad_frame"
  }
  if (frame.kind === "hello" && !/^[0-9a-f-]{36}$/.test(frame.serverInstanceId ?? "")) return "bad_frame"
  if (["request", "response", "cancel"].includes(frame.kind)
      && (!(frame.requestId?.length >= 1) || frame.requestId.length > 128)) return "bad_frame"
  if (frame.kind === "event" && frame.name?.startsWith("$") && frame.name !== "$snapshot") return "bad_frame"
  if (frame.kind === "catalog"
      && (!(frame.count >= 1 && frame.count <= 6)
        || !(frame.index >= 0 && frame.index < frame.count)
        || frame.encoding !== "base64url")) return "bad_frame"
  if (frame.kind === "response" && typeof frame.ok !== "boolean") return "bad_frame"
  if (frame.kind === "response" && frame.ok === false && !frame.error) return "bad_frame"
  if (frame.kind === "error" && !ERROR_CODES.includes(frame.error?.code)) return "bad_frame"
  return null
}

describe("DSH bus v2 mirrored protocol artifacts", () => {
  it("pins the envelope schema constants and vocabularies", () => {
    const envelope = readJson("schemas/dsh-bus-envelope-v2.schema.json")
    expect(envelope.properties.v.const).toBe(2)
    expect(envelope.properties.kind.enum).toEqual(KINDS)
    expect(envelope.properties.limits.properties).toEqual({
      controlFrameBytes: { const: 262144 },
      catalogBytes: { const: 524288 },
      clientBacklogBytes: { const: 1048576 },
      requestTimeoutMs: { const: 30000 },
    })
    expect(envelope.properties.error.properties.code.enum).toEqual(ERROR_CODES)
  })

  it("pins declarative UI v1 and closed command metadata", () => {
    const ui = readJson("schemas/dsh-declarative-ui-v1.schema.json")
    expect(ui.properties.uiVersion.const).toBe(1)
    const command = ui.properties.commands.items
    expect(command.required).toEqual(["name", "effect", "confirmation", "input"])
    expect(command.properties.confirmation.enum).toEqual(["none", "confirm", "danger"])
    expect(command.properties.input.properties.additionalProperties.const).toBe(false)
  })

  it("accepts every valid golden control frame", () => {
    const cases = readJson("golden/valid/control-frames.json")
    expect(cases.length).toBeGreaterThanOrEqual(10)
    for (const row of cases) {
      assertBasicFrame(row.frame)
      expect(validateGolden(row.frame)).toBeNull()
      expect(Buffer.byteLength(JSON.stringify(row.frame), "utf8")).toBeLessThanOrEqual(262144)
    }
  })

  it("rejects every invalid golden frame with the pinned code", () => {
    const cases = readJson("golden/invalid/control-frames.json")
    expect(cases.length).toBeGreaterThanOrEqual(12)
    for (const row of cases) expect(validateGolden(row.frame)).toBe(row.code)
  })
})
