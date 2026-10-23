/**
 * 在 jsdom 里真正加载 5 个底栏 Lottie 动画，验证它们能被 lottie 解析且动效方向正确。
 *
 * **为什么不在 CI 里跑**：它依赖 jsdom，而本项目当前没有 lockfile —— 往 devDependencies
 * 加 jsdom 会让 `npm install` 重新解析含 vue / pinia / uview-plus 的依赖树，风险高于收益
 * （lottie 运行时本身也是因此走的 vendor 化，见 src/vendor/lottie-light.min.js 的文件头）。
 *
 * **怎么用**：在一个**独立目录**里装 jsdom，再指向本仓库：
 *   mkdir /tmp/lottie-verify && cd /tmp/lottie-verify && npm init -y && npm i jsdom
 *   cd <本仓库>/mcode-app && node scripts/verify-tabbar-lottie.cjs
 * 脚本会自动从仓库里取 lottie 运行时与动画 JSON。
 *
 * CI 里的日常防退化由 `tests/components/tabbarLottieData.spec.ts` 承担（纯 JSON 结构断言，
 * 不需要 jsdom）；本脚本是改动动画后做**深度验证**用的 —— 结构断言只能证明字段对，
 * 证明不了 lottie 真的画出来了。
 *
 * 它检查：解析不抛错、每个形状都渲染成子路径、首帧纯线稿（填充透明 + 灰色描边）、
 * 末帧线转面（填充实色 + 白色描边）。
 */
const fs = require("fs")
const path = require("path")

const REPO_APP = path.resolve(__dirname, "..")
const LOTTIE = path.join(REPO_APP, "src/vendor/lottie-light.min.cjs")
const ANIM_DIR = path.join(REPO_APP, "src/assets/tabbar-lottie")

let JSDOM
try {
  JSDOM = require("jsdom").JSDOM
} catch (e) {
  console.error(
    "缺少 jsdom。请在**独立目录**安装后运行（不要装进本仓库，会污染依赖树）：\n" +
      "  mkdir /tmp/lottie-verify && cd /tmp/lottie-verify && npm init -y && npm i jsdom"
  )
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

/**
 * jsdom 没有 canvas 实现，而 lottie 在模块初始化阶段就会取 2d context（内部用它测量文字
 * 宽度），不桩掉的话 require 阶段直接抛 Cannot read properties of null。
 * 这里只提供 lottie 真正会碰的成员 —— 验证目标是数据结构，不是像素。
 */
dom.window.HTMLCanvasElement.prototype.getContext = function () {
  return {
    fillStyle: "",
    font: "",
    measureText: (text) => ({ width: String(text || "").length * 8 }),
    fillRect() {},
    clearRect() {},
    getImageData: () => ({ data: [] }),
  }
}

const lottie = require(LOTTIE)

/** 每个图标预期渲染出的形状个数（= 复合 path 里的子路径数）。 */
const EXPECTED_SUBPATHS = {
  connections: 4, // 2×2 方块
  conversations: 2, // 气泡 + 尾巴
  tasks: 3, // 三条清单行
  circles: 4, // 两个头 + 两段肩弧
  profile: 2, // 头 + 肩弧
}

const GRAY = "rgb(142,142,147)"
const WHITE = "rgb(255,255,255)"

let failures = 0

for (const [name, expected] of Object.entries(EXPECTED_SUBPATHS)) {
  const animationData = JSON.parse(fs.readFileSync(path.join(ANIM_DIR, `${name}.json`), "utf8"))
  const container = dom.window.document.createElement("div")
  dom.window.document.body.appendChild(container)

  let anim = null
  try {
    anim = lottie.loadAnimation({
      container,
      renderer: "svg",
      loop: false,
      autoplay: false,
      animationData,
    })
  } catch (e) {
    failures++
    console.log(`FAIL ${name}: loadAnimation 抛错 -> ${e.message}`)
    continue
  }

  /**
   * 采样一帧。
   *
   * lottie 的 SVG renderer 会把同一组里的多个形状**合并成一条复合 path**（`d` 里串多个
   * `M...C...Z`），fill 与 stroke 各渲染一条。所以不能笼统地扫所有 path：stroke 那条自身
   * 没有填充，`fill-opacity` 恒为 0，会污染断言。必须按「有 fill 属性的」和
   * 「有 stroke 属性的」分开取。
   */
  function sample(frame) {
    anim.goToAndStop(frame, true)
    const paths = [...container.querySelectorAll("path")]
    const fillPath = paths.find((p) => p.getAttribute("fill") && p.getAttribute("fill") !== "none")
    const strokePath = paths.find((p) => p.getAttribute("stroke"))
    return {
      fillOpacity: fillPath ? fillPath.getAttribute("fill-opacity") : null,
      stroke: strokePath ? strokePath.getAttribute("stroke") : null,
      subpaths: fillPath ? (fillPath.getAttribute("d").match(/M/g) || []).length : 0,
    }
  }

  const first = sample(0)
  const last = sample(29)

  const problems = []
  if (first.subpaths === 0) problems.push("首帧没渲染出 fill path（形状没被解析）")
  if (first.fillOpacity !== "0") problems.push(`首帧 fill-opacity 应为 0，实际 ${first.fillOpacity}`)
  if (last.fillOpacity !== "1") problems.push(`末帧 fill-opacity 应为 1，实际 ${last.fillOpacity}`)
  if (first.stroke !== GRAY) problems.push(`首帧描边应为灰 ${GRAY}，实际 ${first.stroke}`)
  if (last.stroke !== WHITE) problems.push(`末帧描边应为白 ${WHITE}，实际 ${last.stroke}`)
  if (first.subpaths !== expected) {
    problems.push(`形状数应为 ${expected}，实际渲染出 ${first.subpaths} 个子路径`)
  }
  if (first.subpaths !== last.subpaths) {
    problems.push(`首帧 ${first.subpaths} 个、末帧 ${last.subpaths} 个子路径，形状在动画中丢失`)
  }

  if (problems.length) {
    failures++
    console.log(`FAIL ${name}:`)
    problems.forEach((p) => console.log(`       - ${p}`))
  } else {
    console.log(
      `PASS ${name}: ${last.subpaths} shapes | fill-opacity ${first.fillOpacity}→${last.fillOpacity} | stroke ${first.stroke}→${last.stroke}`
    )
  }

  anim.destroy()
}

console.log(failures === 0 ? "\nALL 5 ANIMATIONS OK" : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
