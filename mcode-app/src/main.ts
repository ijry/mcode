import { createSSRApp } from "vue"
import uviewPlus from "uview-plus"
import pinia from "./stores"
import App from "./App.vue"
import { setXycloudBaseUrl } from "@/services/xycloudAuth"
import "./uni.scss"
import "uno.css"

installLegacyCompat()
setXycloudBaseUrl(String(import.meta.env.VITE_XYCLOUD_BASE_URL || ""))

declare global {
  interface Array<T> {
    at(index: number): T | undefined
  }

  interface String {
    at(index: number): string | undefined
  }
}

export function createApp() {
  const app = createSSRApp(App)
  app.use(pinia)
  app.use(uviewPlus, () => ({
    options: {
      config: {
        nativeThemeSync: true,
      },
    },
  }))
  return { app, pinia }
}

function installLegacyCompat() {
  if (typeof Array.prototype.at !== "function") {
    Object.defineProperty(Array.prototype, "at", {
      value: function(index: number) {
        const length = Number(this?.length || 0)
        let actualIndex = normalizeAtIndex(index)
        if (actualIndex < 0) actualIndex += length
        if (actualIndex < 0 || actualIndex >= length) return undefined
        return this[actualIndex]
      },
      writable: true,
      configurable: true,
    })
  }

  if (typeof String.prototype.at !== "function") {
    Object.defineProperty(String.prototype, "at", {
      value: function(index: number) {
        const source = String(this)
        let actualIndex = normalizeAtIndex(index)
        if (actualIndex < 0) actualIndex += source.length
        if (actualIndex < 0 || actualIndex >= source.length) return undefined
        return source.charAt(actualIndex)
      },
      writable: true,
      configurable: true,
    })
  }
}

function normalizeAtIndex(value: number) {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric)) return 0
  return numeric < 0 ? Math.ceil(numeric) : Math.floor(numeric)
}
