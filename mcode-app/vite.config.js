import { existsSync } from "node:fs"
import path from "node:path"
import { defineConfig } from "vite"
import uniPlugin from "@dcloudio/vite-plugin-uni"
import UnoCss from "unocss/vite"
import UniUpRoot from "uview-plus/libs/root/index.js";

const uni = uniPlugin?.default || uniPlugin
const appBuildTime = new Date().toISOString()

/**
 * H5 产物内附带版本标记 version.json，与 __APP_BUILD_TIME__ 共用同一个
 * appBuildTime，供前端“探测到新版本后强制刷新一次”的更新守卫读取。仅 H5 构建生成。
 */
const h5VersionJsonPlugin = {
  name: "mcode:h5-version-json",
  apply: "build",
  generateBundle() {
    if (process.env.UNI_PLATFORM !== "h5") return
    this.emitFile({
      type: "asset",
      fileName: "version.json",
      source: JSON.stringify({ buildTime: appBuildTime }),
    })
  },
}
const alias = []
const localUviewPlusSource = path.resolve(
  "D:/Repos/xyito/ultra-ui/uview-plus/src/uni_modules/uview-plus",
)

if (
  (process.env.UNI_PLATFORM === "h5" || process.env.UNI_PLATFORM === "app") &&
  existsSync(localUviewPlusSource)
) {
  alias.push({
    find: "uview-plus",
    replacement: localUviewPlusSource,
  })
}

export default defineConfig({
  define: {
    __APP_BUILD_TIME__: JSON.stringify(appBuildTime),
  },
  plugins: [
    h5VersionJsonPlugin,
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
