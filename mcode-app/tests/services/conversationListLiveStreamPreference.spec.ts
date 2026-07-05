import {
  CONVERSATION_LIST_LIVE_STREAM_ENABLED_KEY,
  readConversationListLiveStreamEnabled,
  writeConversationListLiveStreamEnabled,
} from "@/services/conversation/conversationListLiveStreamPreference"

describe("conversationListLiveStreamPreference", () => {
  beforeEach(() => {
    uni.removeStorageSync(CONVERSATION_LIST_LIVE_STREAM_ENABLED_KEY)
  })

  it("defaults to disabled when no value exists", () => {
    expect(readConversationListLiveStreamEnabled()).toBe(false)
  })

  it("persists enabled and disabled values", () => {
    expect(writeConversationListLiveStreamEnabled(true)).toBe(true)
    expect(readConversationListLiveStreamEnabled()).toBe(true)
    expect(uni.getStorageSync(CONVERSATION_LIST_LIVE_STREAM_ENABLED_KEY)).toBe(true)

    expect(writeConversationListLiveStreamEnabled(false)).toBe(false)
    expect(readConversationListLiveStreamEnabled()).toBe(false)
    expect(uni.getStorageSync(CONVERSATION_LIST_LIVE_STREAM_ENABLED_KEY)).toBe(false)
  })

  it("normalizes unknown stored values to disabled", () => {
    uni.setStorageSync(CONVERSATION_LIST_LIVE_STREAM_ENABLED_KEY, "yes")
    expect(readConversationListLiveStreamEnabled()).toBe(false)
    expect(uni.getStorageSync(CONVERSATION_LIST_LIVE_STREAM_ENABLED_KEY)).toBe(false)
  })
})
