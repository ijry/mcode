import { defineConfig } from "vite"
import uniPlugin from "@dcloudio/vite-plugin-uni"
import UnoCss from "unocss/vite"
import UniUpRoot from "uview-plus/libs/root/index.js";

const uni = uniPlugin?.default || uniPlugin

export default defineConfig({
  plugins: [
    UniUpRoot({
	  rootFileName: "App.up",
    }),
    uni(),
    UnoCss(),
  ],
  optimizeDeps: {
    exclude: ["uview-plus"],
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: '@import "uview-plus/theme.scss";',
      },
    },
  },
  server: {
    port: 18888,
    fs: {
      // Allow serving files from one level up to the project root
      allow: [".."],
    },
  },
})
