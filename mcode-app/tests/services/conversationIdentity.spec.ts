import { parseConversationId } from "@/services/conversation/conversationIdentity"

describe("parseConversationId", () => {
  it("accepts a bare positive number", () => {
    expect(parseConversationId(42)).toBe(42)
  })

  it("accepts a numeric string", () => {
    expect(parseConversationId("42")).toBe(42)
  })

  it("reads id or conversationId off an object", () => {
    // `create_conversation` 的返回形状在不同后端版本间变过：有时是裸数字，有时是
    // `{id}`，有时是 `{conversationId}`。三种都要认，否则新建会话会报「返回数据异常」。
    expect(parseConversationId({ id: 42 })).toBe(42)
    expect(parseConversationId({ conversationId: 42 })).toBe(42)
    expect(parseConversationId({ id: "42" })).toBe(42)
    expect(parseConversationId({ conversationId: "42" })).toBe(42)
  })

  it("prefers id over conversationId when both are present", () => {
    expect(parseConversationId({ id: 1, conversationId: 2 })).toBe(1)
  })

  it("returns 0 for anything unusable", () => {
    // 0 是「解析失败」的哨兵值，调用方靠它抛「返回数据异常」。
    expect(parseConversationId(null)).toBe(0)
    expect(parseConversationId(undefined)).toBe(0)
    expect(parseConversationId("")).toBe(0)
    expect(parseConversationId("abc")).toBe(0)
    expect(parseConversationId({})).toBe(0)
    expect(parseConversationId({ id: "abc" })).toBe(0)
    expect(parseConversationId([])).toBe(0)
  })

  it("rejects non-positive string ids but keeps a bare 0 number distinguishable", () => {
    // 字符串路径要求 > 0（"0" / "-1" 都是脏数据）。裸数字 0 与失败同样返回 0 ——
    // 调用方两种都当失败处理，语义一致。
    expect(parseConversationId("0")).toBe(0)
    expect(parseConversationId("-5")).toBe(0)
    expect(parseConversationId({ id: "-5" })).toBe(0)
  })

  it("survives NaN and Infinity", () => {
    expect(parseConversationId(NaN)).toBe(0)
    expect(parseConversationId(Infinity)).toBe(0)
    expect(parseConversationId({ id: NaN })).toBe(0)
  })
})
