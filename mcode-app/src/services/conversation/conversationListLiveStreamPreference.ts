export const CONVERSATION_LIST_LIVE_STREAM_ENABLED_KEY =
  "mcode_conversation_list_live_stream_enabled"

function normalizeEnabled(value: unknown) {
  return value === true
}

export function readConversationListLiveStreamEnabled() {
  const enabled = normalizeEnabled(
    uni.getStorageSync(CONVERSATION_LIST_LIVE_STREAM_ENABLED_KEY)
  )
  uni.setStorageSync(CONVERSATION_LIST_LIVE_STREAM_ENABLED_KEY, enabled)
  return enabled
}

export function writeConversationListLiveStreamEnabled(enabled: boolean) {
  const normalized = enabled === true
  uni.setStorageSync(CONVERSATION_LIST_LIVE_STREAM_ENABLED_KEY, normalized)
  return normalized
}
