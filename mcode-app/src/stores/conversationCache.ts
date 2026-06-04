import { defineStore } from "pinia"

export interface CachedConversationViewState {
  conversationId: number
  loadedTurnCount: number
  oldestLoadedSeq?: number
  hasMoreHistory: boolean
  scrollAnchor?: string
  scrollTop?: number
  nearBottom?: boolean
  anchorMessageId?: string
  composerText?: string
  draftQueue?: any[]
  attachments?: any[]
  queueExpanded?: boolean
}

export const useConversationCacheStore = defineStore("conversationCache", {
  state: () => ({
    byConversationId: {} as Record<number, CachedConversationViewState>,
  }),
  actions: {
    persistViewState(state: CachedConversationViewState) {
      this.byConversationId[state.conversationId] = state
    },
    restore(conversationId: number) {
      return this.byConversationId[conversationId] ?? null
    },
    clear(conversationId: number) {
      delete this.byConversationId[conversationId]
    },
  },
})
