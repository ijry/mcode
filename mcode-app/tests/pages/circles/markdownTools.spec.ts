import {
  createMarkdownImageSnippet,
  insertMarkdownSnippet,
} from "@/pages/circles/markdownTools"

describe("circle markdown tools", () => {
  it("inserts snippets at the cursor", () => {
    const result = insertMarkdownSnippet({
      value: "前后",
      snippet: "[链接文字](https://example.com)",
      cursor: 1,
    })

    expect(result).toEqual({
      value: "前[链接文字](https://example.com)后",
      cursor: 28,
    })
  })

  it("replaces the selected range with a snippet", () => {
    const result = insertMarkdownSnippet({
      value: "选择旧内容结束",
      snippet: "**新内容**",
      selectionStart: 2,
      selectionEnd: 5,
    })

    expect(result).toEqual({
      value: "选择**新内容**结束",
      cursor: 9,
    })
  })

  it("appends snippets when no cursor information is available", () => {
    const result = insertMarkdownSnippet({
      value: "正文",
      snippet: "`代码`",
    })

    expect(result).toEqual({
      value: "正文`代码`",
      cursor: 6,
    })
  })

  it("creates sanitized markdown image snippets", () => {
    expect(createMarkdownImageSnippet(" https://cdn.example.com/a.png ", " 截图 ")).toBe("![截图](https://cdn.example.com/a.png)")
    expect(createMarkdownImageSnippet("https://cdn.example.com/b.png")).toBe("![图片](https://cdn.example.com/b.png)")
  })
})
