function parseJsonText(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed) return ""
  try {
    return JSON.parse(trimmed)
  } catch {
    return text
  }
}

function decodeUtf8(bytes: Uint8Array) {
  if (typeof TextDecoder !== "undefined") {
    try {
      return new TextDecoder().decode(bytes)
    } catch {}
  }

  const encoded: string[] = []
  bytes.forEach((byte) => {
    encoded.push(`%${(`00${byte.toString(16)}`).slice(-2)}`)
  })
  try {
    return decodeURIComponent(encoded.join(""))
  } catch {}

  let text = ""
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize)
    text += String.fromCharCode(...Array.from(chunk))
  }
  return text
}

function isNodeBufferLike(value: unknown): value is { type: "Buffer"; data: number[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return record.type === "Buffer" && Array.isArray(record.data)
}

function shouldUnwrapData(record: Record<string, unknown>) {
  if (!("data" in record)) return false
  return !(
    "type" in record ||
    "channel" in record ||
    "connection_id" in record ||
    "connectionId" in record ||
    "action" in record ||
    "subscription_id" in record ||
    "subscriptionId" in record ||
    "envelope" in record ||
    "snapshot" in record ||
    "events" in record
  )
}

export function decodeSocketPayload(raw: unknown): unknown {
  if (typeof raw === "string") {
    return parseJsonText(raw)
  }
  if (raw instanceof ArrayBuffer) {
    return parseJsonText(decodeUtf8(new Uint8Array(raw)))
  }
  if (ArrayBuffer.isView(raw)) {
    const view = raw as ArrayBufferView
    return parseJsonText(
      decodeUtf8(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
    )
  }
  if (isNodeBufferLike(raw)) {
    return parseJsonText(decodeUtf8(Uint8Array.from(raw.data)))
  }
  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>
    if (shouldUnwrapData(record)) {
      return decodeSocketPayload(record.data)
    }
  }
  return raw
}
