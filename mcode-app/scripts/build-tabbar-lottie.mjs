#!/usr/bin/env node
/**
 * 生成底栏 5 个 Lottie 图标动画。
 *
 * **为什么要有这个脚本**：Lottie 的 JSON 是 AE 用 bodymovin 导出的产物，嵌套极深
 * （`layers[].shapes[].it[]` 里混着形状、描边、填充、变换），直接手写 5 份等于用汇编写
 * 动画 —— 写着痛苦、改一个圆角要动 5 个文件、出错还毫无提示。这里改成参数化：
 * 形状用几个构造器表达，动效参数集中在一处，改图标只需改下面 `ICONS` 那几十行。
 *
 * **动效是「线条转填充」**：首帧只有灰色描边（未激活），末帧描边变白且内部被填满
 * （激活）。播放方向反过来就是取消激活，所以一个文件同时承担两种状态，不用导出两份。
 *
 * 产物被 `src/components/tabbar/McTabbarLottieIcon.vue` 以 `import` 方式内联进包，
 * 不走运行时 fetch —— App 端是 file:// 协议，XHR 取本地 JSON 会受限制。
 */

import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, "../src/assets/tabbar-lottie")

/** 合成参数：60fps × 30 帧 = 500ms，画布 24×24（与图标设计稿同尺寸）。 */
const FR = 60
const OP = 30
const SIZE = 24
/** 变换锚点放在画布中心，scale 才会绕图标中心缩放而不是缩到左上角。 */
const CENTER = 12

/**
 * 未激活的描边色 #8E8E93。
 *
 * 深色模式的 #8C8C94 与之相差 ≤2%，肉眼不可辨，因此浅深共用一套 JSON —— 否则每个图标
 * 得导出两份文件，包体与维护成本翻倍，换来的是没人看得出的差别。
 */
const GRAY = [0.5569, 0.5569, 0.5765, 1]
/** 激活态一律白色：激活项有深色实心块垫底，浅色 #1C1C1F / 深色 #3A3A3C 都衬得住白。 */
const WHITE = [1, 1, 1, 1]

/** 标量属性的缓动：快起慢停（ease-out）。多段串联出来就是弹簧感。 */
const EASE1 = { i: { x: [0.2], y: [1] }, o: { x: [0.4], y: [0] } }
/** scale 是三维属性，Lottie 要求 i/o 的每个分量各给一个值，长度必须对齐。 */
const EASE3 = {
  i: { x: [0.2, 0.2, 0.2], y: [1, 1, 1] },
  o: { x: [0.4, 0.4, 0.4], y: [0, 0, 0] },
}

/** 圆角矩形。`s`=[宽,高]，`p`=中心点，`r`=圆角半径。 */
function rc(p, s, r) {
  return { ty: "rc", d: 1, s: { a: 0, k: s }, p: { a: 0, k: p }, r: { a: 0, k: r }, nm: "rc" }
}

/** 椭圆。正圆时 `s` 的两个分量相等，`p`=中心点。 */
function el(p, s) {
  return { ty: "el", d: 1, s: { a: 0, k: s }, p: { a: 0, k: p }, nm: "el" }
}

/**
 * 自定义路径。
 *
 * `v` 是顶点；`i`/`o` 是各顶点的入/出控制点，**写相对该顶点的偏移量而不是绝对坐标** ——
 * 这是 Lottie 与 SVG `d` 属性最大的差别，写错会整体变形。
 * `c`=是否闭合（闭合的开放路径在填充时会补一条直线，正好用来把肩弧填成身体）。
 */
function sh(v, i, o, c) {
  return { ty: "sh", d: 1, ks: { a: 0, k: { i, o, v, c } }, nm: "sh" }
}

/**
 * 描边。**描边写在填充之前**：Lottie 的 `it` 数组里靠前的元素渲染在上层，
 * 这样描边压住填充边缘，填充变实后轮廓才不会被吃掉。
 */
function stroke() {
  return {
    ty: "st",
    c: {
      a: 1,
      k: [
        { ...EASE1, t: 0, s: GRAY },
        { t: 12, s: WHITE },
      ],
    },
    o: { a: 0, k: 100 },
    w: { a: 0, k: 1.8 },
    lc: 2, // 圆头端点
    lj: 2, // 圆角接合
    ml: 4,
    nm: "stroke",
  }
}

/**
 * 填充。**透明度是「线条转填充」的主体**：从 0 涨到 100，形状内部被白色填满。
 * 前 3 帧刻意保持 0，让弹跳的「按压」先发生，填充再跟上，否则一点击就糊成一团。
 */
function fill() {
  return {
    ty: "fl",
    c: { a: 0, k: WHITE },
    o: {
      a: 1,
      k: [
        { ...EASE1, t: 0, s: [0] },
        { ...EASE1, t: 3, s: [0] },
        { t: 15, s: [100] },
      ],
    },
    r: 1,
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

/** 把若干形状收进一个组，共享同一套描边与填充（透明度只动画一次，不用每个形状各写）。 */
function group(shapes) {
  return { ty: "gr", nm: "icon", it: [...shapes, stroke(), fill(), transform()] }
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

/**
 * 5 个图标的形状定义。
 *
 * 全部按 24×24 画布的绝对坐标书写，内容区控制在 3–21 之间（四周留 3 的呼吸）。
 * 形状必须是**封闭或可填充**的：开放线条（比如一条横线）没有内部，填充动效会毫无表现。
 */
const ICONS = {
  /** 连接：2×2 圆角方块。沿用原 `grid-fill` 的网格语义。 */
  connections: [
    rc([7, 7], [6.5, 6.5], 2),
    rc([17, 7], [6.5, 6.5], 2),
    rc([7, 17], [6.5, 6.5], 2),
    rc([17, 17], [6.5, 6.5], 2),
  ],
  /** 会话：气泡主体 + 左下尖角尾巴。 */
  conversations: [
    rc([12, 9.5], [17, 12.5], 4),
    // 尾巴用直角三角：直线段在填充后与气泡连成一体，不需要额外的圆角处理。
    sh(
      [[8, 15.2], [8, 20], [13.2, 15.2]],
      [[0, 0], [0, 0], [0, 0]],
      [[0, 0], [0, 0], [0, 0]],
      true
    ),
  ],
  /** 任务：三条清单行，末行缩短表示列表收尾。沿用原 `list-dot` 的列表语义。 */
  tasks: [
    rc([12, 6.5], [14, 3], 1.5),
    rc([12, 12], [14, 3], 1.5),
    rc([9.5, 17.5], [9, 3], 1.5),
  ],
  /**
   * 圈子：并肩双人。
   *
   * 原来是 `account`（单人），和「我的」的 `account-fill` 放在一起几乎分不清 —— 两个
   * tab 挨着、都是一个人头。改成双人后既是「多人/社区」的语义，也在形状上拉开了差距。
   * 两段肩弧之间留 1 的缝（11.5→12.5），否则填充后两个身体会粘成一整块。
   */
  circles: [
    el([7, 9], [6, 6]),
    sh([[3, 18], [11.5, 18]], [[0, 0], [-2.8, -4]], [[2.8, -4], [0, 0]], false),
    el([17, 9], [6, 6]),
    sh([[12.5, 18], [21, 18]], [[0, 0], [-2.8, -4]], [[2.8, -4], [0, 0]], false),
  ],
  /** 我的：单人（头 + 肩弧，填充后弧口自动补成身体）。 */
  profile: [
    el([12, 8], [8, 8]),
    sh([[4, 19], [20, 19]], [[0, 0], [-1.3, -6]], [[1.3, -6], [0, 0]], false),
  ],
}

function buildAnimation(name, shapes) {
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
        shapes: [group(shapes)],
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

for (const [name, shapes] of Object.entries(ICONS)) {
  const file = resolve(OUT_DIR, `${name}.json`)
  writeFileSync(file, JSON.stringify(buildAnimation(name, shapes), null, 2) + "\n", "utf8")
  console.log(`generated ${name}.json`)
}
