import path from "node:path"
import { defineConfig } from "vite"
import uniPlugin from "@dcloudio/vite-plugin-uni"
import UnoCss from "unocss/vite"
import UniUpRoot from "uview-plus/libs/root/index.js";

const uni = uniPlugin?.default || uniPlugin
const alias = []

if (process.env.UNI_PLATFORM === "h5" || process.env.UNI_PLATFORM === "app") {
  alias.push({
    find: "uview-plus",
    replacement: path.resolve(
      "D:/Repos/xyito/open/uview-plus/src/uni_modules/uview-plus",
    ),
  })
}

export default defineConfig({
  plugins: [
    UniUpRoot({
	  rootFileName: "App.up",
    }),
    uni(),
    UnoCss(),
  ],
  resolve: {
    alias,
  },
  optimizeDeps: {
    exclude: ["uview-plus"],
  },
  css: {
    preprocessorOptions: {
      scss: {
        // 取消sass废弃API的报警
        silenceDeprecations: ['legacy-js-api', 'color-functions', 'import'],  
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
