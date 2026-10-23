#!/usr/bin/env node
/**
 * 给小程序端的静态兜底图标（`src/static/tabbar/*-active.png`）上激活色。
 *
 * **为什么存在**：小程序端跑不了 Lottie（`McTabbarLottieIcon` 会落到静态图），
 * 激活态的颜色就得由静态图自己表达。这批 PNG 原本是一整套统一的蓝
 * （#2979FF 单色 + alpha 抗锯齿），与 H5/App 端「每个 tab 一套色」的 Lottie 方案
 * 对不上 —— 本脚本把每张激活图的纯色替换成对应 tab 的主色，alpha 原样保留，
 * 所以抗锯齿边缘不会出现毛边。
 *
 * **运行方式**：不在构建流程里，改配色后才需要重跑一次。依赖 pngjs（仅此一处用），
 * 不进项目 devDependencies，用外部 workspace 的副本：
 *
 *   NODE_PATH=<workspace>/node_modules node scripts/tint-tabbar-fallback.cjs
 *
 * 配色必须与 `scripts/build-tabbar-lottie.mjs` 的 `ICONS[*].colors.fill` 一致
 * （契约测试会比对两侧，改了一边忘了另一边会红）。
 */

const { PNG } = require("pngjs")
const fs = require("fs")
const path = require("path")

const OUT_DIR = path.resolve(__dirname, "../src/static/tabbar")

/** 与 build-tabbar-lottie.mjs 的 fill 色一一对应（tasks 落在 todos-*.png，见组件映射）。 */
const TARGETS = {
  "connections-active": "#4C8DFF",
  "conversations-active": "#32D74B",
  "todos-active": "#FF9F0A",
  "circles-active": "#BF5AF2",
  "profile-active": "#FF6482",
}

for (const [file, hex] of Object.entries(TARGETS)) {
  const n = Number.parseInt(hex.slice(1), 16)
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255]

  const filePath = path.join(OUT_DIR, `${file}.png`)
  const png = PNG.sync.read(fs.readFileSync(filePath))

  // 只在「确实是单色源图」时才动手：万一哪天有人手工画了多色图标，
  // 无脑覆盖会把人家的配色冲掉 —— 报出来让人自己决定。
  const colors = new Set()
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] === 0) continue
    colors.add(`${png.data[i]},${png.data[i + 1]},${png.data[i + 2]}`)
  }
  if (colors.size !== 1) {
    console.error(`skip ${file}.png: 源图不是单色（${colors.size} 种颜色），请人工确认`)
    continue
  }

  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] === 0) continue
    png.data[i] = rgb[0]
    png.data[i + 1] = rgb[1]
    png.data[i + 2] = rgb[2]
  }

  fs.writeFileSync(filePath, PNG.sync.write(png))
  console.log(`tinted ${file}.png -> ${hex}`)
}
