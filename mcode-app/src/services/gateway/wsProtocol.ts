const CODEG_WS_PROTOCOL = "codeg-events"
const CODEG_WS_TOKEN_PROTOCOL_PREFIX = "codeg-token."
const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

export function buildWebSocketProtocols(token: string): string[] {
  const trimmed = String(token || "").trim()
  if (!trimmed) {
    return [CODEG_WS_PROTOCOL]
  }
  return [
    CODEG_WS_PROTOCOL,
    `${CODEG_WS_TOKEN_PROTOCOL_PREFIX}${base64UrlEncodeUtf8(trimmed)}`,
  ]
}

function base64UrlEncodeUtf8(value: string) {
  return base64Encode(toUtf8Bytes(value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

function base64Encode(bytes: number[]) {
  let output = ""
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0
    const second = bytes[index + 1]
    const third = bytes[index + 2]
    const block = (first << 16) | ((second ?? 0) << 8) | (third ?? 0)

    output += BASE64_ALPHABET[(block >> 18) & 0x3f]
    output += BASE64_ALPHABET[(block >> 12) & 0x3f]
    output +=
      typeof second === "number"
        ? BASE64_ALPHABET[(block >> 6) & 0x3f]
        : "="
    output += typeof third === "number" ? BASE64_ALPHABET[block & 0x3f] : "="
  }
  return output
}

function toUtf8Bytes(value: string) {
  const bytes: number[] = []
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.codePointAt(index)
    if (typeof codePoint !== "number") continue
    if (codePoint > 0xffff) {
      index += 1
    }
    if (codePoint <= 0x7f) {
      bytes.push(codePoint)
      continue
    }
    if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6))
      bytes.push(0x80 | (codePoint & 0x3f))
      continue
    }
    if (codePoint <= 0xffff) {
      bytes.push(0xe0 | (codePoint >> 12))
      bytes.push(0x80 | ((codePoint >> 6) & 0x3f))
      bytes.push(0x80 | (codePoint & 0x3f))
      continue
    }
    bytes.push(0xf0 | (codePoint >> 18))
    bytes.push(0x80 | ((codePoint >> 12) & 0x3f))
    bytes.push(0x80 | ((codePoint >> 6) & 0x3f))
    bytes.push(0x80 | (codePoint & 0x3f))
  }
  return bytes
}
