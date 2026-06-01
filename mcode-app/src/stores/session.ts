import { defineStore } from "pinia"

type SessionItem = Record<string, unknown>

export const useSessionStore = defineStore("session", {
  state: () => ({
    projects: [] as SessionItem[],
    sessions: [] as SessionItem[],
    currentSessionId: "",
    messages: [] as SessionItem[],
    events: [] as SessionItem[],
  }),
  actions: {
    setProjects(projects: SessionItem[]) {
      this.projects = projects
    },
    setSessions(sessions: SessionItem[]) {
      this.sessions = sessions
    },
    setCurrentSession(sessionId: string) {
      this.currentSessionId = sessionId
    },
    setMessages(messages: SessionItem[]) {
      this.messages = messages
    },
    pushEvent(event: SessionItem) {
      this.events.unshift(event)
      this.events = this.events.slice(0, 50)
    },
  },
  persist: {
    storage: {
      getItem: (key: string) => uni.getStorageSync(key),
      setItem: (key: string, value: string) => uni.setStorageSync(key, value),
    },
  },
})
