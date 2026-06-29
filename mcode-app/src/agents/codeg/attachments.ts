import type { PromptInputBlock } from "@/types/acp"
import type {
  QueuedDraft,
  UploadedAttachment,
} from "@/pages/conversation-detail/detailDataNormalization"

export const CODEG_PROMPT_IMAGE_MAX_BYTES = 1400 * 1024

export interface CodegPickedFile {
  path: string
  name: string
  size: number
  type: string
  kind: "image" | "file"
}

export function buildCodegUploadedAttachment(input: {
  uploadResult: {
    path?: string
    url?: string
    name?: string
    size?: number
    mimeType?: string
    mime_type?: string
  }
  file: CodegPickedFile
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
    type: firstString(input.uploadResult.mimeType, input.uploadResult.mime_type, input.file.type)
      || "application/octet-stream",
    kind: input.file.kind,
    ...(input.file.kind === "image" && input.file.path ? { localPath: input.file.path } : {}),
    ...(remoteUrl && remoteUrl !== previewUrl ? { remoteUrl } : {}),
  }
}

export function buildCodegPromptBlocks(draft: Pick<QueuedDraft, "text" | "attachments">): PromptInputBlock[] {
  const blocks: PromptInputBlock[] = []
  if (draft.text) {
    blocks.push({ type: "text", text: draft.text })
  }

  draft.attachments.forEach((att) => {
    if (att.kind === "image") {
      const parsedDataUrl = parseImageDataUrl(att.data || att.url)
      const data = att.data || parsedDataUrl?.data || ""
      if (!data) {
        throw new Error("图片缺少可发送数据，请重新选择图片")
      }
      blocks.push({
        type: "image",
        data,
        mime_type: parsedDataUrl?.mimeType || att.type || "image/png",
        uri: att.remoteUrl || att.localPath || att.url || null,
      })
      return
    }

    blocks.push({
      type: "resource_link",
      uri: att.remoteUrl || att.url,
      name: att.name,
      mime_type: att.type || "application/octet-stream",
    })
  })

  return blocks
}

export function estimateCodegBase64DecodedBytes(data: string): number {
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

export function isCodegPromptImageTooLarge(input: {
  size?: number | null
  data?: string | null
  limitBytes?: number
}): boolean {
  const limit = input.limitBytes ?? CODEG_PROMPT_IMAGE_MAX_BYTES
  const size = Number(input.size || 0)
  if (Number.isFinite(size) && size > limit) return true
  const data = typeof input.data === "string" ? input.data : ""
  return data ? estimateCodegBase64DecodedBytes(data) > limit : false
}

export function codegPromptImageLimitText(limitBytes = CODEG_PROMPT_IMAGE_MAX_BYTES): string {
  const mb = limitBytes / (1024 * 1024)
  return `${mb.toFixed(mb >= 10 ? 0 : 1)}MB`
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}
