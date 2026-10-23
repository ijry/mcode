#!/usr/bin/env node
/**
 * 生成底栏 5 个 Lottie 图标动画。
 *
 * **形状从哪来**：不是手写的几何，而是 `src/assets/tabbar-src/*.svg` —— 5 个 IconPark
 * （字节开源，Apache-2.0，48×48 网格，multi-color 主题）图标。手写几何只能拼出方块和
 * 圆，「细腻的多色图标」得靠专业图标库的造型。本脚本是那批 SVG 的**转换器**：
 * 把 48 网格的 path 缩放进 24 画布，再套上动效与配色，输出 Lottie JSON。
 *
 * **为什么保留 Lottie 而不是直接用 SVG**：动效（灰线稿 → 弹跳 → 被彩色填满）是底栏
 * 的反馈来源，换成静态 SVG 就只剩换图，切换 tab 会没有落点。
 *
 * **动效是「线条转填充」**：首帧只有灰色描边（未激活），末帧描边亮起、内部被彩色
 * 填满（激活）。播放方向反过来就是取消激活，所以一个文件同时承担两种状态。
 *
 * 产物被 `src/components/tabbar/McTabbarLottieIcon.vue` 以 `import` 方式内联进包，
 * 不走运行时 fetch —— App 端是 file:// 协议，XHR 取本地 JSON 会受限制。
 *
 * **依赖 svgpath**（把 SVG 的 A/Q/T/S/H/V 统一成三次贝塞尔）。它不进项目依赖，
 * 在外部目录装了再跑：
 *   cd <workspace> && npm i svgpath --no-save
 *   cd <本仓库>/mcode-app && NODE_PATH=<workspace>/node_modules node scripts/build-tabbar-lottie.mjs
 */

import { createRequire } from "node:module"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)

let SvgPath
try {
  SvgPath = require("svgpath")
} catch {
  console.error(
    "缺少 svgpath。请在外部目录安装后运行（不要装进本仓库，会污染依赖树）：\n" +
      "  cd <workspace> && npm i svgpath --no-save\n" +
      "  cd <本仓库>/mcode-app && NODE_PATH=<workspace>/node_modules node scripts/build-tabbar-lottie.mjs"
  )
  process.exit(2)
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC_DIR = resolve(__dirname, "../src/assets/tabbar-src")
const OUT_DIR = resolve(__dirname, "../src/assets/tabbar-lottie")

/** 合成参数：60fps × 30 帧 = 500ms，画布 24×24（与图标设计稿同尺寸）。 */
const FR = 60
const OP = 30
const SIZE = 24
/** 变换锚点放在画布中心，scale 才会绕图标中心缩放而不是缩到左上角。 */
const CENTER = 12

/** IconPark 画在 48×48 网格上，缩一半进我们的 24 画布。 */
const SOURCE_SIZE = 48
const SCALE = SIZE / SOURCE_SIZE

/**
 * IconPark multi-color 主题的四个颜色槽。
 *
 * 按槽位换成我们自己的配色，而不是直接沿用：它的外轮廓色是 #333，那是给浅色背景用的
 * —— 底栏激活项垫的是深色实心块，#333 压上去等于轮廓消失，图标会散成一摊色块。
 */
const SLOT_OUT_STROKE = "#333333"
const SLOT_OUT_FILL = "#2F88FF"
const SLOT_INNER_STROKE = "#FFFFFF"
const SLOT_INNER_FILL = "#43CCF8"

/** 未激活的描边色 #8E8E93。深色模式的 #8C8C94 与它相差 ≤2%，共用一套 JSON。 */
const GRAY = [0.5569, 0.5569, 0.5765, 1]

/** 面部件的描边线宽。1.8 在 24 画布上渲染到 22px 位置约 1.65px，是刻意的细线。 */
const FACE_STROKE_WIDTH = 1.8
/** 线部件（原图里 fill="none" 的线条）沿用 IconPark 的 4/48 比例，即 2。 */
const LINE_STROKE_WIDTH = 2

/**
 * 每个 tab 的配色。
 *
 * `main` 接外层面（IconPark 的 outFill）、`sub` 接内层与线条（innerFill），
 * 两个色是**同色系深浅两档**而不是撞色 —— 22px 上撞色会互相打架、显得廉价。
 * 外轮廓色由 `main` 派生（见 `lighten`），不单独写。
 */
const PALETTES = {
  connections: { main: "#4F8DFF", sub: "#6FE3F5" },
  conversations: { main: "#FF6FA5", sub: "#FFA8C5" },
  tasks: { main: "#2FC48D", sub: "#86EFC8" },
  circles: { main: "#A78BFA", sub: "#C9B6FF" },
  profile: { main: "#FF9F45", sub: "#FFC99B" },
}

/** #RGB 简写展开成 #RRGGBB。IconPark 的 #333 与 #FFF 都是简写，不展开比对不上。 */
function expandHex(hex) {
  const body = hex.slice(1)
  return `#${body.length === 3 ? body.replace(/./g, (c) => c + c) : body}`
}

/** 把 #RGB / #RRGGBB 解析成 [r, g, b]（0-255）。 */
function parseHex(hex) {
  const n = Number.parseInt(expandHex(hex).slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** 归一化成 Lottie 的 0–1 颜色（保留 4 位小数，取 2 位会让相邻色落成同一个值）。 */
function rgba(hex) {
  return [...parseHex(hex).map((v) => Math.round((v / 255) * 10000) / 10000), 1]
}

/**
 * 描边色：往白色方向推。
 *
 * 逐色派生而不是再写一套描边色板 —— 手写两套要维护几十个色值，还会出现
 * 「面换了色、描边还是旧色的亮档」这类漏改。
 */
function lighten(hex, amount = 0.42) {
  const rgb = parseHex(hex).map((v) => Math.round(v + (255 - v) * amount))
  return `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`
}

/**
 * 颜色槽 → 本 tab 的实际颜色。
 *
 * 白色内部描边原样保留：它是压在彩色块上的高光，换成别的色反而没了那层通透感。
 */
function mapColor(hex, palette, hasFill) {
  const upper = expandHex(hex).toUpperCase()
  if (upper === SLOT_INNER_STROKE) return expandHex(hex)
  if (upper === SLOT_OUT_FILL) return palette.main
  if (upper === SLOT_INNER_FILL) return palette.sub
  if (upper === SLOT_OUT_STROKE) {
    // 外轮廓：有面的用它自己的亮档（贴在面的边缘）；纯线条没有面可贴，用 sub。
    return hasFill ? lighten(palette.main) : palette.sub
  }
  throw new Error(`未知的 IconPark 颜色槽 ${hex}`)
}

/**
 * 把 SVG 的 `d` 转成 Lottie 形状。
 *
 * Lottie 只认三次贝塞尔，且控制点写的是**相对顶点的偏移量**（这是它与 SVG `d` 最大的
 * 差别，写绝对坐标会整体变形）。所以先把 A/Q/T/S/H/V 全归一成 C，再逐段换算。
 */
function convertPath(d) {
  const path = new SvgPath(d).abs().unshort().unarc().round(2)
  const shapes = []

  let verts = null
  let segs = null
  let prev = null
  let closed = false

  function flush() {
    if (!segs || segs.length === 0) return

    const pointCount = closed ? segs.length : segs.length + 1
    const v = []
    const i = []
    const o = []

    for (let k = 0; k < pointCount; k++) {
      v.push([verts[k][0] * SCALE, verts[k][1] * SCALE])
      i.push([0, 0])
      o.push([0, 0])
    }
    for (let k = 0; k < segs.length; k++) {
      const seg = segs[k]
      o[k] = [seg.c1[0] - seg.from[0], seg.c1[1] - seg.from[1]]
      const target = (k + 1) % pointCount
      i[target] = [seg.c2[0] - seg.to[0], seg.c2[1] - seg.to[1]]
    }

    shapes.push({ ty: "sh", d: 1, ks: { a: 0, k: { i, o, v, c: closed } }, nm: "sh" })

    verts = null
    segs = null
    closed = false
  }

  /**
   * svgpath 的段是 `[命令字母, ...参数]` 的数组（`abs()` 之后参数已是数字）。
   * 迭代前先 abs/unshort/unarc，所以到这里只剩 M、L、C、Q、H、V、Z。
   */
  path.iterate((seg) => {
    const cmd = seg[0]
    const data = seg.slice(1).map(Number)
    if (cmd === "M") {
      flush()
      prev = [data[0], data[1]]
      verts = [prev]
      segs = []
      closed = false
      return
    }
    if (cmd === "Z") {
      closed = true
      flush()
      prev = null
      return
    }

    let end
    let c1
    let c2
    if (cmd === "L") {
      end = [data[0], data[1]]
      c1 = prev
      c2 = end
    } else if (cmd === "H") {
      end = [data[0], prev[1]]
      c1 = prev
      c2 = end
    } else if (cmd === "V") {
      end = [prev[0], data[0]]
      c1 = prev
      c2 = end
    } else if (cmd === "C") {
      c1 = [data[0], data[1]]
      c2 = [data[2], data[3]]
      end = [data[4], data[5]]
    } else if (cmd === "Q") {
      // 二次贝塞尔升三次：控制点各取 2/3 处，两端点与原来严格重合。
      const [qx, qy, ex, ey] = data
      c1 = [prev[0] + ((qx - prev[0]) * 2) / 3, prev[1] + ((qy - prev[1]) * 2) / 3]
      c2 = [ex + ((qx - ex) * 2) / 3, ey + ((qy - ey) * 2) / 3]
      end = [ex, ey]
    } else {
      throw new Error(`不支持的 path 命令 ${cmd}`)
    }

    segs.push({ from: prev, c1, c2, to: end })
    verts.push(end)
    prev = end
  })
  flush()

  return shapes
}

/** 标量属性的缓动：快起慢停（ease-out）。多段串联出来就是弹簧感。 */
const EASE1 = { i: { x: [0.2], y: [1] }, o: { x: [0.4], y: [0] } }
/** scale 是三维属性，Lottie 要求 i/o 的每个分量各给一个值，长度必须对齐。 */
const EASE3 = {
  i: { x: [0.2, 0.2, 0.2], y: [1, 1, 1] },
  o: { x: [0.4, 0.4, 0.4], y: [0, 0, 0] },
}

/**
 * 描边。**描边写在填充之前**：Lottie 的 `it` 数组里靠前的元素渲染在上层，
 * 这样描边压住填充边缘，填充变实后轮廓才不会被吃掉。
 */
function stroke(activeColor, width) {
  return {
    ty: "st",
    c: {
      a: 1,
      k: [
        { ...EASE1, t: 0, s: GRAY },
        { t: 12, s: rgba(activeColor) },
      ],
    },
    o: { a: 0, k: 100 },
    w: { a: 0, k: width },
    lc: 2, // 圆头端点
    lj: 2, // 圆角接合
    ml: 4,
    nm: "stroke",
  }
}

/**
 * 填充。**透明度是「线条转填充」的主体**：从 0 涨到 100，形状内部被彩色填满。
 * 前 3 帧刻意保持 0，让弹跳的「按压」先发生，填充再跟上，否则一点击就糊成一团。
 */
function fill(activeColor, evenOdd) {
  return {
    ty: "fl",
    c: { a: 0, k: rgba(activeColor) },
    o: {
      a: 1,
      k: [
        { ...EASE1, t: 0, s: [0] },
        { ...EASE1, t: 3, s: [0] },
        { t: 15, s: [100] },
      ],
    },
    r: evenOdd ? 2 : 1,
    nm: "fill",
  }
}

/** 组内的变换。这里不做任何变换，只作为 Lottie 要求的收尾元素存在。 */
function transform() {
  return {
    ty: "tr",
    p: { a: 0, k: [0, 0] },
    a: { a: 0, k: [0, 0] },
    s: { a: 0, k: [100, 100] },
    r: { a: 0, k: 0 },
    o: { a: 0, k: 100 },
    sk: { a: 0, k: 0 },
    sa: { a: 0, k: 0 },
    nm: "tr",
  }
}

/**
 * 弹簧弹跳的关键帧。
 *
 * 100 → 86 → 106 → 98 → 101 → 100：先被按下去，弹过头，再收敛。
 * 收敛段（98→101→100）幅度很小，是为了压住「弹簧」里那种收不住的抖 —— 只做
 * 大起大落的话，5 个 tab 来回切会显得廉价。
 */
function bounce() {
  return {
    a: 1,
    k: [
      { ...EASE3, t: 0, s: [100, 100, 100] },
      { ...EASE3, t: 4, s: [86, 86, 100] },
      { ...EASE3, t: 9, s: [106, 106, 100] },
      { ...EASE3, t: 14, s: [98, 98, 100] },
      { ...EASE3, t: 19, s: [101, 101, 100] },
      { t: 24, s: [100, 100, 100] },
    ],
  }
}

/** 取出 `<path .../>` 上的属性。IconPark 产出的属性一律带引号。 */
function attrs(tag) {
  const result = {}
  for (const m of tag.matchAll(/([a-z-]+)="([^"]*)"/g)) result[m[1]] = m[2]
  return result
}

/**
 * 解析一个 IconPark SVG，返回按**视觉层叠顺序**排列的部件（数组靠前 = 画在上层）。
 *
 * SVG 里后出现的元素绘制在上，而 Lottie 的形状数组是 AE 顺序（靠前的在上），
 * 所以这里要**反转** —— 不反转的话，气泡里的高光、身体前的四肢都会盖住该在
 * 下层的部分，图标会变成一坨实心。
 */
function parseSvg(source) {
  const viewBox = source.match(/viewBox="([^"]*)"/)[1].split(/\s+/).map(Number)
  if (viewBox[2] !== SOURCE_SIZE || viewBox[3] !== SOURCE_SIZE) {
    throw new Error(
      `源图标必须是 ${SOURCE_SIZE}×${SOURCE_SIZE} 网格，实际 ${viewBox[2]}×${viewBox[3]}`
    )
  }

  const parts = [...source.matchAll(/<path\b[^>]*>/g)].map((m) => {
    const a = attrs(m[0])
    return {
      shapes: convertPath(a.d),
      fill: a.fill && a.fill !== "none" ? a.fill : null,
      stroke: a.stroke && a.stroke !== "none" ? a.stroke : null,
      evenOdd: a["fill-rule"] === "evenodd",
    }
  })

  parts.reverse()
  return parts
}

function buildAnimation(name, parts, palette) {
  const groups = parts.map((part) => {
    const hasFill = Boolean(part.fill)
    const items = [...part.shapes]

    if (part.stroke) {
      const color = mapColor(part.stroke, palette, hasFill)
      const width = hasFill ? FACE_STROKE_WIDTH : LINE_STROKE_WIDTH
      items.push(stroke(color, width))
    }
    // 填充写在描边之后：数组靠前的渲染在上层，描边要压住填充边缘。
    if (hasFill) items.push(fill(mapColor(part.fill, palette, hasFill), part.evenOdd))
    items.push(transform())

    return { ty: "gr", nm: "part", it: items }
  })

  return {
    v: "5.12.2",
    fr: FR,
    ip: 0,
    op: OP,
    w: SIZE,
    h: SIZE,
    nm: name,
    ddd: 0,
    assets: [],
    layers: [
      {
        ddd: 0,
        ind: 1,
        ty: 4,
        nm: name,
        sr: 1,
        ks: {
          o: { a: 0, k: 100 },
          r: { a: 0, k: 0 },
          // position 与 anchor 都取画布中心：两者相同时，形状顶点的局部坐标
          // 直接等于合成坐标，写形状时可以按绝对坐标思考。
          p: { a: 0, k: [CENTER, CENTER, 0] },
          a: { a: 0, k: [CENTER, CENTER, 0] },
          s: bounce(),
        },
        ao: 0,
        shapes: groups,
        ip: 0,
        op: OP,
        st: 0,
        bm: 0,
      },
    ],
    markers: [],
  }
}

mkdirSync(OUT_DIR, { recursive: true })

for (const name of Object.keys(PALETTES)) {
  const source = readFileSync(resolve(SRC_DIR, `${name}.svg`), "utf8")
  const parts = parseSvg(source)
  const data = buildAnimation(name, parts, PALETTES[name])
  writeFileSync(resolve(OUT_DIR, `${name}.json`), JSON.stringify(data, null, 2) + "\n", "utf8")
  console.log(`generated ${name}.json (${parts.length} parts)`)
}
