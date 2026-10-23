/**
 * 底栏 Lottie 动画的接线契约。
 *
 * 图标源自 IconPark（字节开源，Apache-2.0）的 multi-color 主题，源 SVG 固化在
 * `src/assets/tabbar-src/`，由 `scripts/build-tabbar-lottie.mjs` 转成 Lottie。
 *
 * **这些断言防的都是「构建期看着没事、上线才炸」的那一类问题**：
 *   - lottie 运行时用 .js 而不是 .cjs → 在 `"type": "module"` 的仓库里被当 ESM 解析，
 *     UMD 包导出变空，编译不报错，运行时才 `loadAnimation is not a function`。
 *   - 动画数据用 `@/` 别名做动态 import → Vite 的 dynamic-import-vars 不解析别名，
 *     构建能过，但对应 chunk 根本没打进去，运行时取到空。
 *   - 转换器丢部件 / 丢颜色 → 图标缺一块或退化成单色，渲染时才看得见。
 *
 * 这里只做**结构断言**（纯读 JSON 与源码，不渲染）：动画是否真的被 lottie 画出来，
 * 由 `scripts/verify-tabbar-lottie.cjs` 在 jsdom 里验证（那个要 jsdom，CI 不跑）。
 */
import fs from "node:fs"
import path from "node:path"

const APP = path.resolve(__dirname, "../..")

const TAB_NAMES = ["connections", "conversations", "tasks", "circles", "profile"]

/** 每个图标的部件数（= 源 SVG 的 path 数，转换器一个 path 一个组一个形状）。 */
const PART_COUNTS: Record<string, number> = {
  connections: 3, // 圆点 + 箭头 + 折线
  conversations: 2, // 外气泡 + 内气泡
  tasks: 5, // 两个清单条 + 叉 + 勾 + ?
  circles: 4, // 双人：两个填充 + 两条线
  profile: 3, // 外框 + 头 + 肩
}

/** 未激活的描边色 #8E8E93（归一化到 0-1，Lottie 的颜色格式）。 */
const GRAY = [0.5569, 0.5569, 0.5765, 1]
/**
 * 激活项垫底的实心块：浅色模式 #1C1C1F、深色模式 #3A3A3C。
 * 后者更亮、对比更低，是真正卡下限的那一个，所以两个都要测。
 */
const ACTIVE_PILLS = ["#1C1C1F", "#3A3A3C"]

/**
 * 每个 tab 的调色板 —— 与 `scripts/build-tabbar-lottie.mjs` 的 `PALETTES` 互为镜像。
 * 改了一边忘了另一边，下面的「色都在调色板里」断言会红。
 */
const PALETTES: Record<string, { main: string; sub: string }> = {
  connections: { main: "#4F8DFF", sub: "#6FE3F5" },
  conversations: { main: "#FF6FA5", sub: "#FFA8C5" },
  tasks: { main: "#2FC48D", sub: "#86EFC8" },
  circles: { main: "#A78BFA", sub: "#C9B6FF" },
  profile: { main: "#FF9F45", sub: "#FFC99B" },
}

type AnyRecord = Record<string, any>

function read(relativePath: string): string {
  return fs.readFileSync(path.resolve(APP, relativePath), "utf8")
}

function readAnimation(name: string): AnyRecord {
  return JSON.parse(read(`src/assets/tabbar-lottie/${name}.json`))
}

/** 图标的全部组（转换器一个部件一个组）。 */
function groups(data: AnyRecord): AnyRecord[] {
  return data.layers[0].shapes
}

/** 把 #RGB / #RRGGBB 归一化成 Lottie 的 0-1 颜色，与生成脚本同规则（4 位小数）。 */
function rgba(hex: string): number[] {
  const body = hex.slice(1)
  const full = body.length === 3 ? body.replace(/./g, (c) => c + c) : body
  const n = Number.parseInt(full, 16)
  return [
    Math.round(((n >> 16) & 255) / 255 * 10000) / 10000,
    Math.round(((n >> 8) & 255) / 255 * 10000) / 10000,
    Math.round((n & 255) / 255 * 10000) / 10000,
  ]
}

/** 描边色派生：往白推 42%。与生成脚本的 lighten 同规则（先取整回 hex，再归一化）——
 * 脚本先 round 成 0-255 整数再转归一化值，直接用小数算会差出第 3 位小数。 */
function lighten(hex: string): number[] {
  const rgb = rgba(hex).slice(0, 3).map((v) => Math.round(v * 255))
  return rgb
    .map((v) => Math.round(v + (255 - v) * 0.42))
    .map((v) => Math.round((v / 255) * 10000) / 10000)
}

/** 某个图标激活后允许出现的全部颜色（填充与描边末帧）。 */
function allowedColors(name: string): number[][] {
  const { main, sub } = PALETTES[name]
  return [rgba(main), rgba(sub), [1, 1, 1], lighten(main)]
}

function sameColor(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 0.001)
}

/** sRGB 分量转线性光，WCAG 的相对亮度要求在线性空间里算。 */
function toLinear(channel: number): number {
  return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
}

/** WCAG 相对亮度。 */
function luminance(rgb: number[]): number {
  const [r, g, b] = rgb.map(toLinear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 对比度（1–21）。 */
function contrast(a: number[], b: number[]): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

describe("tabbar lottie contract", () => {
  describe("动画产物", () => {
    it("每个 tab 都有对应的动画文件", () => {
      for (const name of TAB_NAMES) {
        expect(() => read(`src/assets/tabbar-lottie/${name}.json`)).not.toThrow()
      }
    })

    it("是 60fps / 30 帧 / 24×24 的单图层合成", () => {
      for (const name of TAB_NAMES) {
        const data = readAnimation(name)
        expect(data.fr).toBe(60)
        expect(data.op).toBe(30)
        expect(data.w).toBe(24)
        expect(data.h).toBe(24)
        expect(data.layers).toHaveLength(1)
      }
    })

    it("源 SVG 的每个 path 都转换成了部件，一个不丢", () => {
      for (const name of TAB_NAMES) {
        expect(groups(readAnimation(name))).toHaveLength(PART_COUNTS[name])
        // 源 SVG 也要在仓库里：转换器以它为输入，丢了就无法重新生成。
        expect(() => read(`src/assets/tabbar-src/${name}.svg`)).not.toThrow()
      }
    })

    /**
     * 组结构只有两种：面部件 `[形状, 描边, 填充, 变换]`、线部件 `[形状, 描边, 变换]`。
     * Lottie 的 `it` 数组里靠前的元素渲染在上层，描边必须在填充之前，
     * 否则填充变实后会把轮廓吃掉（图标看起来像少了一圈边）。
     */
    it("面部件描边在填充之前，线部件只有描边", () => {
      for (const name of TAB_NAMES) {
        for (const group of groups(readAnimation(name))) {
          const types = group.it.map((item: AnyRecord) => item.ty)
          expect(types[0]).toBe("sh")
          expect(types[types.length - 1]).toBe("tr")
          if (types.includes("fl")) {
            expect(types.indexOf("st")).toBeGreaterThan(-1)
            expect(types.indexOf("st")).toBeLessThan(types.indexOf("fl"))
          } else {
            expect(types).toEqual(["sh", "st", "tr"])
          }
        }
      }
    })

    it("填充从不透明 0 涨到 100（线条转填充）", () => {
      for (const name of TAB_NAMES) {
        for (const group of groups(readAnimation(name))) {
          const fill = group.it.find((item: AnyRecord) => item.ty === "fl")
          if (!fill) continue
          const keys = fill.o.k
          expect(keys[0].s).toEqual([0])
          expect(keys[keys.length - 1].s).toEqual([100])
        }
      }
    })

    it("描边从激活前的灰色插值到彩色", () => {
      for (const name of TAB_NAMES) {
        for (const group of groups(readAnimation(name))) {
          const stroke = group.it.find((item: AnyRecord) => item.ty === "st")
          const keys = stroke.c.k
          expect(keys[0].s).toEqual(GRAY)
          // 末帧不能还是灰。允许纯白：IconPark 的内部高光描边（#FFF）按原样保留，
          // 它压在彩色填充上正是「细腻」的来源之一。
          expect(keys[keys.length - 1].s).not.toEqual(GRAY)
        }
      }
    })

    /**
     * 「图标内多色」是这次改版的核心诉求：每个图标至少要用到 2 种不同的彩色
     * （主色 + 辅色/白高光）。只有一种色就是退化回了单色方案。
     * 同时所有色都必须来自该 tab 的调色板，防止转换器漏映射把 IconPark 原色
     * （#333 / #2F88FF）带进产物。
     */
    it("每个图标至少两种彩色，且全部来自调色板", () => {
      for (const name of TAB_NAMES) {
        const seen = new Set<number[]>()
        for (const group of groups(readAnimation(name))) {
          const stroke = group.it.find((item: AnyRecord) => item.ty === "st")
          seen.add(stroke.c.k[stroke.c.k.length - 1].s.slice(0, 3))
          const fill = group.it.find((item: AnyRecord) => item.ty === "fl")
          if (fill) seen.add(fill.c.k.slice(0, 3))
        }
        const allowed = allowedColors(name)
        for (const color of seen) {
          expect(allowed.some((a) => sameColor(a, color))).toBe(true)
        }
        expect(seen.size).toBeGreaterThanOrEqual(2)
      }
    })

    /**
     * 颜色必须在**深浅两套**实心块上都站得住。
     *
     * 肉眼看不到的失败模式是：配色挑了深色系（比如 IconPark 原生的 #333 外轮廓），
     * 在白底的设计稿里很好看，压到深色激活块上就糊成一团。
     * 阈值取 WCAG 对非文本图形的 3:1。
     */
    it("激活色在深浅两套实心块上都有 3:1 以上的对比", () => {
      for (const name of TAB_NAMES) {
        for (const pillHex of ACTIVE_PILLS) {
          const pill = rgba(pillHex)
          for (const color of allowedColors(name)) {
            expect(contrast(color, pill)).toBeGreaterThan(3)
          }
        }
      }
    })

    it("弹跳先被压下去、过冲、再收住", () => {
      for (const name of TAB_NAMES) {
        const keys = readAnimation(name).layers[0].ks.s.k
        const scales: number[] = keys.map((key: AnyRecord) => key.s[0])
        expect(scales[0]).toBe(100)
        expect(scales[scales.length - 1]).toBe(100)
        // 真的有被按压（<100）和过冲（>100），不是一条平线冒充的动画。
        expect(Math.min(...scales)).toBeLessThan(100)
        expect(Math.max(...scales)).toBeGreaterThan(100)
      }
    })

    /**
     * 描边色只写了一套（灰→彩），没有为深色模式导出第二份。
     * 深色的 #8C8C94 与浅色的 #8E8E93 相差 ≤2%，肉眼看不出，不值得翻倍包体。
     */
    it("不为深色模式重复导出动画", () => {
      const files = fs.readdirSync(path.resolve(APP, "src/assets/tabbar-lottie"))
      expect(files).toHaveLength(TAB_NAMES.length)
    })
  })

  describe("运行时", () => {
    it("lottie 运行时是 .cjs 而不是 .js", () => {
      const vendor = path.resolve(APP, "src/vendor")
      expect(fs.existsSync(path.join(vendor, "lottie-light.min.cjs"))).toBe(true)
      // .js 在 "type": "module" 下会被当 ESM 解析，UMD 包会走 globalThis 分支、导出为空。
      expect(fs.existsSync(path.join(vendor, "lottie-light.min.js"))).toBe(false)
    })

    it("带着 MIT 许可证一起存放", () => {
      expect(fs.existsSync(path.resolve(APP, "src/vendor/lottie-light.LICENSE.md"))).toBe(true)
    })

    it("IconPark 源图标带着 Apache-2.0 许可证一起存放", () => {
      expect(fs.existsSync(path.resolve(APP, "src/assets/tabbar-src/LICENSE"))).toBe(true)
    })
  })

  describe("接线", () => {
    it("底栏渲染动画图标而不是 u-icon", () => {
      const source = read("src/components/McodeTabBar.vue")
      expect(source).toContain(
        '<McTabbarLottieIcon :name="item.name" :active="item.name === current" />'
      )
      // u-icon 是字体图标，动画只能做整体变换，做不到线条转填充。
      expect(source).not.toContain("<u-icon")
    })

    it("lottie 只在 H5 / App 加载，不进小程序端", () => {
      const source = read("src/components/LottieView.vue")
      const importAt = source.indexOf('import("@/vendor/lottie-light.min.cjs")')
      expect(importAt).toBeGreaterThan(-1)

      // import 必须被条件编译包住：小程序端没有 DOM，顶层引用会直接崩。
      expect(source.lastIndexOf("// #ifdef H5 || APP-PLUS", importAt)).toBeGreaterThan(-1)
      expect(source.indexOf("// #endif", importAt)).toBeGreaterThan(importAt)
    })

    it("动画数据用相对路径动态载入，不用 @/ 别名", () => {
      const source = read("src/components/McTabbarLottieIcon.vue")
      expect(source).toContain("import(`../assets/tabbar-lottie/${props.name}.json`)")
      // Vite 的 dynamic-import-vars 不解析别名，用别名会构建通过但 chunk 缺失。
      expect(source).not.toContain("import(`@/assets/tabbar-lottie/")
    })

    it("静态图兜底把 tasks 映射到既有的 todos 资源", () => {
      const source = read("src/components/McTabbarLottieIcon.vue")
      // static 里那套资源是按「待办」命名的，直接拼 tab 名会取到不存在的 todos.png。
      expect(source).toContain('tasks: "todos"')

      for (const file of ["connections", "conversations", "todos", "circles", "profile"]) {
        expect(fs.existsSync(path.resolve(APP, `src/static/tabbar/${file}.png`))).toBe(true)
      }
    })
  })

  describe("磨砂玻璃", () => {
    it("胶囊带上了 iOS 上才必要的两条属性", () => {
      const source = read("src/components/McodeTabBar.vue")
      const barStart = source.indexOf("&__bar {")
      const barEnd = source.indexOf("&__item {")
      const bar = source.slice(barStart, barEnd)

      expect(bar).toContain("backdrop-filter: blur(16px)")
      // iOS 的 WKWebView 只认带前缀的写法，缺了它在真机上完全不生效。
      expect(bar).toContain("-webkit-backdrop-filter: blur(16px)")
      // 这两条修的是模糊背景从圆角外侧溢出的毛边，Chrome 上看不出来。
      expect(bar).toContain("overflow: hidden")
      expect(bar).toContain("isolation: isolate")
    })

    it("激活项仍是实心块，好让彩色填充有足够对比", () => {
      const source = read("src/components/McodeTabBar.vue")
      // 磨砂让胶囊通透了，激活标记若也半透明，彩色末帧会发灰、边界糊掉。
      expect(source).toContain("&__item--active {\n    background: #1c1c1f;")
      expect(source).toContain(".mc-tabbar__item--active {\n    background: #3a3a3c;")
    })
  })
})
