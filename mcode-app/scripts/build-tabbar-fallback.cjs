#!/usr/bin/env node
/**
 * 生成小程序端的静态兜底图标（`src/static/tabbar/*.png`）。
 *
 * **为什么存在**：小程序端跑不了 Lottie（`McTabbarLottieIcon` 会落到静态图），
 * 兜底图必须与 Lottie 动画的两个关键帧长得一致 —— 这里直接用同一个渲染器把
 * 首帧（灰线稿）与末帧（彩色）光栅化，两端视觉就天然同步，不存在「改了动画
 * 忘了改图」的漂移。
 *
 * **运行方式**：不在构建流程里，动画或配色变了才需要重跑一次。依赖 jsdom 与
 * @resvg/resvg-js（仅此一处用），不进项目依赖：
 *
 *   NODE_PATH=/tmp/lottie-verify/node_modules:<workspace>/node_modules \
 *     node scripts/build-tabbar-fallback.cjs
 *
 * 输出尺寸 81×81（24 画布的 3.375 倍）：22px 的显示位置上足够清晰，也和旧资源
 * 的尺寸保持一致。
 */

const fs = require("fs")
const path = require("path")

const APP = path.resolve(__dirname, "..")
const ANIM_DIR = path.join(APP, "src/assets/tabbar-lottie")
const OUT_DIR = path.join(APP, "src/static/tabbar")

const TABS = [
  ["connections", "connections"],
  ["conversations", "conversations"],
  // static 里那套资源是按「待办」命名的（历史遗留），组件的映射也指向 todos。
  ["tasks", "todos"],
  ["circles", "circles"],
  ["profile", "profile"],
]

let JSDOM
try {
  JSDOM = require("jsdom").JSDOM
} catch {
  console.error("缺少 jsdom，见文件头注释的安装与运行方式")
  process.exit(2)
}
let Resvg
try {
  Resvg = require("@resvg/resvg-js").Resvg
} catch {
  console.error("缺少 @resvg/resvg-js，见文件头注释的安装与运行方式")
  process.exit(2)
}

const dom = new JSDOM("<!DOCTYPE html><body></body>", { pretendToBeVisual: true })
global.window = dom.window
global.document = dom.window.document
global.navigator = dom.window.navigator
global.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window)
global.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window)
global.HTMLElement = dom.window.HTMLElement
global.SVGElement = dom.window.SVGElement
dom.window.HTMLCanvasElement.prototype.getContext = function () {
  return {
    fillStyle: "",
    font: "",
    measureText: (t) => ({ width: String(t || "").length * 8 }),
    fillRect() {},
    clearRect() {},
    getImageData: () => ({ data: [] }),
  }
}

const lottie = require(path.join(APP, "src/vendor/lottie-light.min.cjs"))

const SIZE = 81
const TOTAL_FRAMES = 30

function renderFrame(animationData, frame) {
  const container = dom.window.document.createElement("div")
  dom.window.document.body.appendChild(container)
  const anim = lottie.loadAnimation({
    container,
    renderer: "svg",
    loop: false,
    autoplay: false,
    animationData,
  })
  anim.goToAndStop(frame, true)
  const svg = container.querySelector("svg")
  svg.removeAttribute("width")
  svg.removeAttribute("height")
  const source = svg.outerHTML
  anim.destroy()
  container.remove()

  return new Resvg(source, { fitTo: { mode: "width", value: SIZE } }).render().asPng()
}

fs.mkdirSync(OUT_DIR, { recursive: true })

for (const [tabName, fileName] of TABS) {
  const animationData = JSON.parse(fs.readFileSync(path.join(ANIM_DIR, `${tabName}.json`), "utf8"))

  fs.writeFileSync(path.join(OUT_DIR, `${fileName}.png`), renderFrame(animationData, 0))
  fs.writeFileSync(
    path.join(OUT_DIR, `${fileName}-active.png`),
    renderFrame(animationData, TOTAL_FRAMES - 1)
  )
  console.log(`rendered ${fileName}.png + ${fileName}-active.png`)
}
