const { defineConfig } = require("vite")
const uni = require("@dcloudio/vite-plugin-uni").default

module.exports = defineConfig(async () => {
  const UnoCss = await import('unocss/vite').then(i => i.default)
  return {
    plugins: [
      uni(),
      UnoCss(),
    ],
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: '@import "uview-plus/theme.scss";'
        }
      }
    },
    server: {
      port: 18888,
      fs: {
          // Allow serving files from one level up to the project root
          allow: ['..']
      }
    },
  }
})

