import {
  buildUploadTarget,
  buildUploadedAttachment,
  normalizePickedImages,
  normalizePickedMessageFiles,
  type PickedLocalFile,
} from "@/pages/conversation-detail/detailAttachmentUpload"
import type { RemoteInstanceDescriptor } from "@/services/realtime/types"

const directDescriptor: RemoteInstanceDescriptor = {
  instanceKey: "direct::https://host::p",
  mode: "direct",
  baseUrl: "https://host/",
  principal: "p",
}

const relayDescriptor: RemoteInstanceDescriptor = {
  instanceKey: "relay::https://relay::p",
  mode: "relay",
  baseUrl: "https://relay/",
  principal: "p",
}

const file: PickedLocalFile = {
  path: "/tmp/a.txt",
  name: "a.txt",
  size: 10,
  type: "text/plain",
  kind: "file",
}

describe("detailAttachmentUpload", () => {
  it("normalizes picked images and message files", () => {
    expect(normalizePickedImages({
      tempFilePaths: ["/tmp/image.png"],
      tempFiles: [{ name: "image.png", size: 5, type: "image/png" }],
    })).toEqual([{
      path: "/tmp/image.png",
      name: "image.png",
      size: 5,
      type: "image/png",
      kind: "image",
    }])

    expect(normalizePickedImages({
      tempFilePaths: ["/tmp/fallback.jpg"],
      tempFiles: [],
    })[0]).toEqual(expect.objectContaining({
      name: "fallback.jpg",
      type: "image/jpeg",
    }))

    expect(normalizePickedMessageFiles([
      { tempFilePath: "/tmp/a.txt", size: 10, type: "text/plain" },
      { name: "missing-path" },
    ])).toEqual([{
      path: "/tmp/a.txt",
      name: "a.txt",
      size: 10,
      type: "text/plain",
      kind: "file",
    }])
  })

  it("builds upload targets for direct and relay descriptors", () => {
    expect(buildUploadTarget({
      descriptor: directDescriptor,
      directToken: "direct-token",
    })).toEqual({
      url: "https://host/api/upload_attachment",
      header: { authorization: "Bearer direct-token" },
    })

    expect(buildUploadTarget({
      descriptor: {
        ...relayDescriptor,
        authToken: "relay-token",
      },
      relayToken: "fallback-token",
    })).toEqual({
      url: "https://relay/v1/proxy/upload_attachment",
      header: { authorization: "Bearer relay-token" },
    })

    expect(() => buildUploadTarget({
      descriptor: { ...directDescriptor, baseUrl: "" },
    })).toThrow("连接地址为空")
  })

  it("builds uploaded attachments from upload responses", () => {
    expect(buildUploadedAttachment({
      uploadResult: {
        url: "https://cdn/a.txt",
        name: "server.txt",
        size: 20,
      },
      file,
      createId: (prefix) => `${prefix}-1`,
    })).toEqual({
      id: "att-1",
      url: "https://cdn/a.txt",
      name: "server.txt",
      size: 20,
      type: "text/plain",
      kind: "file",
    })

    expect(() => buildUploadedAttachment({
      uploadResult: {},
      file,
      createId: (prefix) => `${prefix}-1`,
    })).toThrow("上传结果缺少 URL")
  })
})
