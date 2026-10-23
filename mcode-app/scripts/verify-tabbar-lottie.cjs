/**
 * 在 jsdom 里真正加载 5 个底栏 Lottie 动画，验证它们能被 lottie 解析且动效方向正确。
 *
 * **为什么不在 CI 里跑**：它依赖 jsdom，而本项目当前没有 lockfile —— 往 devDependencies
 * 加 jsdom 会让 `npm install` 重新解析含 vue / pinia / uview-plus 的依赖树，风险高于收益
 * （lottie 运行时本身也是因此走的 vendor 化）。
 *
 * **怎么用**：在一个**独立目录**里装 jsdom，再指向本仓库：
 *   mkdir /tmp/lottie-verify && cd /tmp/lottie-verify && npm init -y && npm i jsdom
 *   cd <本仓库>/mcode-app && NODE_PATH=/tmp/lottie-verify/node_modules node scripts/verify-tabbar-lottie.cjs
 * 脚本会自动从仓库里取 lottie 运行时与动画 JSON。
 *
 * CI 里的日常防退化由 `tests/components/tabbarLottieContract.spec.ts` 承担（纯 JSON 结构断言，
 * 不需要 jsdom）；本脚本是改动动画后做**深度验证**用的 —— 结构断言只能证明字段对，
 * 证明不了 lottie 真的画出来了。它检查：
 *   解析不抛错、部件一个不丢（每个部件渲染出独立的 fill/stroke path）、
 *   首帧纯线稿（填充透明 + 灰色描边）、末帧线转面（填充实色 + 彩色描边）、
 *   渲染出来的颜色与动画 JSON 里写的颜色一致（±1 舍入容差）。
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

/** 每个图标预期渲染出的部件数（= 转换器产出的组数 = 源 SVG 的 path 数）。 */
const EXPECTED_PARTS = {
  connections: 3, // 圆点 + 箭头 + 折线
  conversations: 2, // 外气泡 + 内气泡
  tasks: 5, // 两个清单条 + 叉 + 勾 + ?
  circles: 4, // 双人：两个填充 + 两条线
  profile: 3, // 外框 + 头 + 肩
}

const GRAY = "rgb(142,142,147)"

/**
 * 颜色允许 ±1 容差。
 *
 * 生成脚本把色值归一化到 4 位小数（0.6627），lottie 渲染时乘回 255 会落在
 * 168.99 这类非整数上再取整 —— 与 `Math.round(169/255*10000)/10000*255` 差 1
 * 是舍入路径不同，不是颜色错了。放宽到 ±1，真正的换色（差几十）照样报。
 */
function closeRgb(actual, expected) {
  if (!actual) return false
  const m = actual.match(/^rgb\((\d+),(\d+),(\d+)\)$/)
  if (!m) return false
  return m.slice(1).every((v, i) => Math.abs(Number(v) - expected[i]) <= 1)
}

/** 从动画 JSON 里收集所有可能出现过的末帧色（描边末帧 + 填充色），0-255 形式。 */
function collectColors(data) {
  const fills = new Set()
  const strokes = new Set()
  for (const group of data.layers[0].shapes) {
    for (const item of group.it) {
      if (item.ty === "fl") fills.add(item.c.k.slice(0, 3).map((v) => Math.round(v * 255)))
      if (item.ty === "st") strokes.add(item.c.k[1].s.slice(0, 3).map((v) => Math.round(v * 255)))
    }
  }
  return { fills: [...fills], strokes: [...strokes] }
}

let failures = 0

for (const [name, expectedParts] of Object.entries(EXPECTED_PARTS)) {
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

  const allowed = collectColors(animationData)

  /**
   * 采样一帧。返回值是**属性快照**而不是 DOM 引用 —— lottie 在 goToAndStop 后会原地
   * 改写同一批 path 节点的属性，先存 0 帧的引用、再采 29 帧，0 帧读到的就全是末帧值了
   * （旧版每次采完立刻读字符串快照就是为了躲这个坑）。
   *
   * 每个部件一个组、一个形状，所以渲染出的 fill path / stroke path 数应与部件数对齐：
   * 面部件出 1 条 fill path + 1 条 stroke path，线部件只出 stroke path。
   */
  function sample(frame) {
    anim.goToAndStop(frame, true)
    const paths = [...container.querySelectorAll("path")]
    return {
      fills: paths
        .filter((p) => p.getAttribute("fill") && p.getAttribute("fill") !== "none")
        .map((p) => ({
          color: p.getAttribute("fill"),
          opacity: p.getAttribute("fill-opacity"),
          subpaths: (p.getAttribute("d").match(/M/g) || []).length,
        })),
      strokes: paths
        .filter((p) => p.getAttribute("stroke"))
        .map((p) => ({ color: p.getAttribute("stroke") })),
    }
  }

  const first = sample(0)
  const last = sample(29)

  const problems = []
  if (last.fills.length === 0) problems.push("末帧没渲染出 fill path（形状没被解析）")
  if (first.strokes.length !== expectedParts || last.strokes.length !== expectedParts) {
    problems.push(
      `部件数应为 ${expectedParts}，实际渲染出 stroke path：首帧 ${first.strokes.length}、末帧 ${last.strokes.length}`
    )
  }
  if (last.fills.length + last.strokes.length < expectedParts) {
    problems.push("渲染出的 path 总数少于部件数，有部件丢失")
  }

  for (const f of first.fills) {
    if (f.opacity !== "0") problems.push(`首帧有 fill-opacity 不为 0 的部件（${f.color}）`)
  }
  for (const f of last.fills) {
    if (f.opacity !== "1") problems.push(`末帧有 fill-opacity 不为 1 的部件（${f.color}）`)
    if (!allowed.fills.some((c) => closeRgb(f.color, c))) {
      problems.push(`末帧填充色 ${f.color} 不在动画 JSON 的填充色集合里`)
    }
    // 转换器一个部件一个形状：fill path 的 d 里不该出现多个子路径。
    if (f.subpaths !== 1) problems.push(`填充 path 含 ${f.subpaths} 个子路径，应为 1（部件被合并了？）`)
  }
  for (const s of first.strokes) {
    if (s.color !== GRAY) problems.push(`首帧有描边不是灰的部件（${s.color}）`)
  }
  for (const s of last.strokes) {
    if (!allowed.strokes.some((c) => closeRgb(s.color, c))) {
      problems.push(`末帧描边色 ${s.color} 不在动画 JSON 的描边色集合里`)
    }
  }

  if (problems.length) {
    failures++
    console.log(`FAIL ${name}:`)
    problems.forEach((p) => console.log(`       - ${p}`))
  } else {
    console.log(
      `PASS ${name}: ${expectedParts} parts | ${last.fills.length} fills + ${last.strokes.length} strokes | stroke ${first.strokes[0].color}→${last.strokes[0].color}`
    )
  }

  anim.destroy()
}

console.log(failures === 0 ? "\nALL 5 ANIMATIONS OK" : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
