import type { RemoteInstanceDescriptor } from "@/services/realtime/types"
import {
  buildCodegUploadedAttachment,
  codegPromptImageLimitText,
  CODEG_PROMPT_IMAGE_MAX_BYTES,
  estimateCodegBase64DecodedBytes,
  isCodegPromptImageTooLarge,
  parseImageDataUrl as parseCodegImageDataUrl,
} from "@/agents/codeg/attachments"
import { firstString, type UploadedAttachment } from "./detailDataNormalization"

export interface PickedLocalFile {
  path: string
  name: string
  size: number
  type: string
  kind: "image" | "file"
}

export const PROMPT_IMAGE_MAX_BYTES = CODEG_PROMPT_IMAGE_MAX_BYTES

export function estimateBase64DecodedBytes(data: string): number {
  return estimateCodegBase64DecodedBytes(data)
}

export function parseImageDataUrl(value: string): { data: string; mimeType: string } | null {
  return parseCodegImageDataUrl(value)
}

export function isPromptImageTooLarge(input: {
  size?: number | null
  data?: string | null
  limitBytes?: number
}): boolean {
  return isCodegPromptImageTooLarge(input)
}

export function promptImageLimitText(limitBytes = PROMPT_IMAGE_MAX_BYTES): string {
  return codegPromptImageLimitText(limitBytes)
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
  uploadResult: { path?: string; url?: string; name?: string; size?: number; mimeType?: string; mime_type?: string }
  file: PickedLocalFile
  createId: (prefix: string) => string
}): UploadedAttachment {
  return buildCodegUploadedAttachment(input)
}
