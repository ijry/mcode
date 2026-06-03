import { createSSRApp } from "vue"
import uviewPlus from "uview-plus"
import pinia from "./stores"
import App from "./App.vue"
import "./uni.scss"
import "uno.css"

export function createApp() {
  const app = createSSRApp(App)
  app.use(pinia)
  app.use(uviewPlus)
  return { app, pinia }
}
