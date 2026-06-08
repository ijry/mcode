import { defineStore } from "pinia"

import type { XycloudSession, XycloudUserInfo } from "@/services/xycloudAuth"

const TOKEN_STORAGE_KEY = "mcode_user_token"
const USER_INFO_STORAGE_KEY = "mcode_user_info"

function readStoredToken(): string {
  return normalizeStoredString(uni.getStorageSync(TOKEN_STORAGE_KEY))
}

function readStoredUserInfo(): XycloudUserInfo | null {
  return normalizeStoredUserInfo(uni.getStorageSync(USER_INFO_STORAGE_KEY))
}

function normalizeStoredString(value: unknown): string {
  if (typeof value === "string") return value.trim()
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return ""
}

function normalizeStoredUserInfo(value: unknown): XycloudUserInfo | null {
  if (!value) return null
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      return normalizeStoredUserInfo(parsed)
    } catch {
      return null
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as XycloudUserInfo
  }
  return null
}

export const useAccountStore = defineStore("account", {
  state: () => ({
    token: readStoredToken(),
    userInfo: readStoredUserInfo() as XycloudUserInfo | null,
  }),
  getters: {
    isLoggedIn: (state) => Boolean(state.token),
  },
  actions: {
    setSession(session: XycloudSession) {
      const token = normalizeStoredString(session.token)
      this.token = token
      this.userInfo = session.userInfo ? { ...session.userInfo } : null

      if (token) {
        uni.setStorageSync(TOKEN_STORAGE_KEY, token)
      } else {
        uni.removeStorageSync(TOKEN_STORAGE_KEY)
      }

      if (this.userInfo) {
        uni.setStorageSync(USER_INFO_STORAGE_KEY, this.userInfo)
      } else {
        uni.removeStorageSync(USER_INFO_STORAGE_KEY)
      }
    },
    setUserInfo(userInfo: XycloudUserInfo | null) {
      this.userInfo = userInfo ? { ...userInfo } : null
      if (this.userInfo) {
        uni.setStorageSync(USER_INFO_STORAGE_KEY, this.userInfo)
      } else {
        uni.removeStorageSync(USER_INFO_STORAGE_KEY)
      }
    },
    logout() {
      this.token = ""
      this.userInfo = null
      uni.removeStorageSync(TOKEN_STORAGE_KEY)
      uni.removeStorageSync(USER_INFO_STORAGE_KEY)
    },
  },
})
