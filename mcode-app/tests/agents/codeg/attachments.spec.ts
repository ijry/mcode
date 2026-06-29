import {
  buildCodegPromptBlocks,
  buildCodegUploadedAttachment,
  codegPromptImageLimitText,
  CODEG_PROMPT_IMAGE_MAX_BYTES,
  estimateCodegBase64DecodedBytes,
  isCodegPromptImageTooLarge,
  parseImageDataUrl,
} from "@/agents/codeg/attachments"

describe("codeg attachments", () => {
  it("normalizes uploaded files and images for Codeg prompt send", () => {
    expect(buildCodegUploadedAttachment({
      uploadResult: {
        url: "https://cdn.example/a.txt",
        name: "server.txt",
        size: 20,
        mimeType: "text/markdown",
      },
      file: {
        path: "/tmp/a.txt",
        name: "a.txt",
        size: 10,
        type: "text/plain",
        kind: "file",
      },
      createId: (prefix) => `${prefix}-1`,
    })).toEqual({
      id: "att-1",
      url: "https://cdn.example/a.txt",
      name: "server.txt",
      size: 20,
      type: "text/markdown",
      kind: "file",
    })

    expect(buildCodegUploadedAttachment({
      uploadResult: {
        path: "C:/Users/Admin/.codeg/uploads/session/image.png",
        name: "server-image.png",
        size: 20,
        mime_type: "image/png",
      },
      file: {
        path: "/tmp/image.png",
        name: "image.png",
        size: 10,
        type: "image/jpeg",
        kind: "image",
      },
      createId: (prefix) => `${prefix}-2`,
    })).toEqual({
      id: "att-2",
      url: "/tmp/image.png",
      name: "server-image.png",
      size: 20,
      type: "image/png",
      kind: "image",
      localPath: "/tmp/image.png",
      remoteUrl: "C:/Users/Admin/.codeg/uploads/session/image.png",
    })
  })

  it("builds Codeg ACP prompt blocks from hydrated images and resources", () => {
    expect(buildCodegPromptBlocks({
      text: "请分析图片",
      attachments: [
        {
          id: "image",
          url: "/tmp/image.png",
          localPath: "/tmp/image.png",
          remoteUrl: "C:/Users/Admin/.codeg/uploads/session/image.png",
          name: "image.png",
          size: 10,
          type: "image/png",
          kind: "image",
          data: "QUJD",
        },
        {
          id: "file",
          url: "https://cdn.example/a.txt",
          name: "a.txt",
          size: 10,
          type: "text/plain",
          kind: "file",
        },
      ],
    })).toEqual([
      { type: "text", text: "请分析图片" },
      {
        type: "image",
        data: "QUJD",
        mime_type: "image/png",
        uri: "C:/Users/Admin/.codeg/uploads/session/image.png",
      },
      {
        type: "resource_link",
        uri: "https://cdn.example/a.txt",
        name: "a.txt",
        mime_type: "text/plain",
      },
    ])
  })

  it("parses image data urls and enforces Codeg prompt image limits", () => {
    expect(parseImageDataUrl("data:image/jpeg;base64, QUJD\n")).toEqual({
      data: "QUJD",
      mimeType: "image/jpeg",
    })
    expect(estimateCodegBase64DecodedBytes("QUJD")).toBe(3)
    expect(isCodegPromptImageTooLarge({ size: CODEG_PROMPT_IMAGE_MAX_BYTES + 1 })).toBe(true)
    expect(isCodegPromptImageTooLarge({ data: "QUJD" })).toBe(false)
    expect(codegPromptImageLimitText()).toBe("1.4MB")
  })

  it("rejects images without transient send data", () => {
    expect(() => buildCodegPromptBlocks({
      text: "",
      attachments: [{
        id: "image",
        url: "/tmp/image.png",
        name: "image.png",
        size: 10,
        type: "image/png",
        kind: "image",
      }],
    })).toThrow("图片缺少可发送数据")
  })
})
