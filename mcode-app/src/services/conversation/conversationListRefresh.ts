let conversationListDirty = false

export function markConversationListDirty() {
  conversationListDirty = true
}

export function consumeConversationListDirty() {
  const dirty = conversationListDirty
  conversationListDirty = false
  return dirty
}

export function peekConversationListDirty() {
  return conversationListDirty
}
