import { defineStore } from "pinia"

export interface CachedConversationViewState {
  conversationId: number
  loadedTurnCount: number
  oldestLoadedSeq?: number
  hasMoreHistory: boolean
  scrollAnchor?: string
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
