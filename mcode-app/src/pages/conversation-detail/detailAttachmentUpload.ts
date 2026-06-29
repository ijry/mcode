import type { RemoteInstanceDescriptor } from "@/services/realtime/types"
import { firstString, type UploadedAttachment } from "./detailDataNormalization"

export interface PickedLocalFile {
  path: string
  name: string
  size: number
  type: string
  kind: "image" | "file"
}

export const PROMPT_IMAGE_MAX_BYTES = 1400 * 1024

export function estimateBase64DecodedBytes(data: string): number {
  const normalized = String(data || "").replace(/\s/g, "")
  if (!normalized) return 0
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding)
}

export function parseImageDataUrl(value: string): { data: string; mimeType: string } | null {
  const match = String(value || "").match(/^data:([^;,]+)?;base64,([\s\S]+)$/i)
  if (!match) return null
  const data = String(match[2] || "").replace(/\s/g, "")
  if (!data) return null
  return {
    data,
    mimeType: match[1] || "image/png",
  }
}

export function isPromptImageTooLarge(input: {
  size?: number | null
  data?: string | null
  limitBytes?: number
}): boolean {
  const limit = input.limitBytes ?? PROMPT_IMAGE_MAX_BYTES
  const size = Number(input.size || 0)
  if (Number.isFinite(size) && size > limit) return true
  const data = typeof input.data === "string" ? input.data : ""
  return data ? estimateBase64DecodedBytes(data) > limit : false
}

export function promptImageLimitText(limitBytes = PROMPT_IMAGE_MAX_BYTES): string {
  const mb = limitBytes / (1024 * 1024)
  return `${mb.toFixed(mb >= 10 ? 0 : 1)}MB`
}

export function normalizePickedImages(input: {
  tempFilePaths?: unknown
  tempFiles?: unknown
}): PickedLocalFile[] {
  const tempFiles = Array.isArray(input.tempFiles) ? input.tempFiles : []
  const tempPaths = Array.isArray(input.tempFilePaths) ? input.tempFilePaths : []
  return tempPaths.map((path: string, index: number) => {
    const file = tempFiles[index] as { path?: string; size?: number; type?: string; name?: string } | undefined
    return {
      path,
      name: file?.name || path.split("/").pop() || `image-${index + 1}.jpg`,
      size: Number(file?.size || 0),
      type: file?.type || "image/jpeg",
      kind: "image",
    }
  })
}

export function normalizePickedMessageFiles(tempFiles: unknown): PickedLocalFile[] {
  const source = Array.isArray(tempFiles) ? tempFiles : []
  return source
    .map((file: any, index: number) => {
      const path = firstString(file?.path, file?.tempFilePath)
      if (!path) return null
      const name = firstString(file?.name) || path.split("/").pop() || `file-${index + 1}`
      return {
        path,
        name,
        size: Number(file?.size || 0),
        type: firstString(file?.type) || "application/octet-stream",
        kind: "file",
      }
    })
    .filter(Boolean) as PickedLocalFile[]
}

export function buildUploadTarget(input: {
  descriptor: RemoteInstanceDescriptor
  directToken?: string
  relayToken?: string
}): { url: string; header: Record<string, string> } {
  const base = String(input.descriptor.baseUrl || "").replace(/\/$/, "")
  if (!base) {
    throw new Error("连接地址为空")
  }

  const header: Record<string, string> = {}
  if (input.descriptor.mode === "direct") {
    const token = firstString(input.descriptor.authToken, input.directToken)
    if (token) header.authorization = `Bearer ${token}`
    return { url: `${base}/api/upload_attachment`, header }
  }

  const relayToken = firstString(input.descriptor.authToken, input.relayToken)
  if (relayToken) {
    header.authorization = `Bearer ${relayToken}`
  }
  return { url: `${base}/v1/proxy/upload_attachment`, header }
}

export function buildUploadedAttachment(input: {
  uploadResult: { path?: string; url?: string; name?: string; size?: number }
  file: PickedLocalFile
  createId: (prefix: string) => string
}): UploadedAttachment {
  const remoteUrl = firstString(input.uploadResult.url, input.uploadResult.path)
  const previewUrl = input.file.kind === "image"
    ? firstString(input.file.path, remoteUrl)
    : remoteUrl
  if (!previewUrl) {
    throw new Error("上传结果缺少 URL")
  }

  return {
    id: input.createId("att"),
    url: previewUrl,
    name: firstString(input.uploadResult.name) || input.file.name,
    size: Number(input.uploadResult.size || input.file.size || 0),
    type: input.file.type,
    kind: input.file.kind,
    ...(input.file.kind === "image" && input.file.path ? { localPath: input.file.path } : {}),
    ...(remoteUrl && remoteUrl !== previewUrl ? { remoteUrl } : {}),
  }
}
