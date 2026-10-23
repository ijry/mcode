/**
 * 底栏 Lottie 动画的接线契约。
 *
 * **这些断言防的都是「构建期看着没事、上线才炸」的那一类问题**：
 *   - lottie 运行时用 .js 而不是 .cjs → 在 `"type": "module"` 的仓库里被当 ESM 解析，
 *     UMD 包导出变空，编译不报错，运行时才 `loadAnimation is not a function`。
 *   - 动画数据用 `@/` 别名做动态 import → Vite 的 dynamic-import-vars 不解析别名，
 *     构建能过，但对应 chunk 根本没打进去，运行时取到空。
 *   - 磨砂少了 `-webkit-` 前缀或 iOS 毛边修复 → 只在 Safari/WKWebView 上可见，
 *     H5 预览用的 Chrome 上看不出来。
 *
 * 这里只做**结构断言**（纯读 JSON 与源码，不渲染）：动画是否真的被 lottie 画出来，
 * 由 `scripts/verify-tabbar-lottie.cjs` 在 jsdom 里验证（那个要 jsdom，CI 不跑）。
 */
import fs from "node:fs"
import path from "node:path"

const APP = path.resolve(__dirname, "../..")

const TAB_NAMES = ["connections", "conversations", "tasks", "circles", "profile"]

/** 每个图标由几个形状拼成（= Lottie 复合 path 里的子路径数）。 */
const SHAPE_COUNTS: Record<string, number> = {
  connections: 4, // 2×2 方块
  conversations: 2, // 气泡 + 尾巴
  tasks: 3, // 三条清单行
  circles: 4, // 两个头 + 两段肩弧
  profile: 2, // 头 + 肩弧
}

/** 未激活的描边色 #8E8E93（归一化到 0-1，Lottie 的颜色格式）。 */
const GRAY = [0.5569, 0.5569, 0.5765, 1]
/**
 * 激活项垫底的实心块：浅色模式 #1C1C1F、深色模式 #3A3A3C。
 * 后者更亮、对比更低，是真正卡下限的那一个，所以两个都要测。
 */
const ACTIVE_PILLS = ["#1C1C1F", "#3A3A3C"]

type AnyRecord = Record<string, any>

/** 把 #RRGGBB 解析成 Lottie 的归一化 RGB 三元组。 */
function parseHex(hex: string): number[] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
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

function read(relativePath: string): string {
  return fs.readFileSync(path.resolve(APP, relativePath), "utf8")
}

function readAnimation(name: string): AnyRecord {
  return JSON.parse(read(`src/assets/tabbar-lottie/${name}.json`))
}

/** 动画里唯一的形状组。生成器只产一个组，所以直接取第一个是稳定的。 */
function shapeItems(data: AnyRecord): AnyRecord[] {
  return data.layers[0].shapes[0].it
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

    it("每个图标都画出了预期数量的形状", () => {
      for (const name of TAB_NAMES) {
        const shapes = shapeItems(readAnimation(name)).filter((item) =>
          ["rc", "el", "sh"].includes(item.ty)
        )
        expect(shapes).toHaveLength(SHAPE_COUNTS[name])
      }
    })

    /**
     * Lottie 的 `it` 数组里**靠前的元素渲染在上层**。描边必须在填充之前，
     * 否则填充变实后会把轮廓吃掉（图标看起来像少了一圈边）。
     */
    it("把描边排在填充之前", () => {
      for (const name of TAB_NAMES) {
        const types = shapeItems(readAnimation(name)).map((item) => item.ty)
        expect(types.indexOf("st")).toBeGreaterThan(-1)
        expect(types.indexOf("fl")).toBeGreaterThan(-1)
        expect(types.indexOf("st")).toBeLessThan(types.indexOf("fl"))
      }
    })

    it("填充从不透明 0 涨到 100（线条转填充）", () => {
      for (const name of TAB_NAMES) {
        const fill = shapeItems(readAnimation(name)).find((item) => item.ty === "fl")
        const keys = fill.o.k
        expect(keys[0].s).toEqual([0])
        expect(keys[keys.length - 1].s).toEqual([100])
      }
    })

    it("描边从激活前的灰色插值到该 tab 的颜色", () => {
      for (const name of TAB_NAMES) {
        const stroke = shapeItems(readAnimation(name)).find((item) => item.ty === "st")
        const keys = stroke.c.k
        expect(keys[0].s).toEqual(GRAY)
        // 末帧不能再是灰（没上色）也不能再是白（退回单色方案）。
        expect(keys[keys.length - 1].s).not.toEqual(GRAY)
        expect(keys[keys.length - 1].s).not.toEqual([1, 1, 1, 1])
        // 线宽 1.8：24 的画布渲染到 22px 位置，实际约 1.65px，是刻意的细线。
        expect(stroke.w.k).toBe(1.8)
      }
    })

    /**
     * 激活态是「主色填充 + 亮一档描边」的双色构成，两者必须真的不同色 ——
     * 同色会让图标退化成一块纯色剪影，线条转填充的过程就没了。
     */
    it("每个图标的填充与描边是同色系的两档，不是同一个色", () => {
      for (const name of TAB_NAMES) {
        const items = shapeItems(readAnimation(name))
        const fill = items.find((item) => item.ty === "fl").c.k
        const stroke = items.find((item) => item.ty === "st").c.k
        const strokeEnd = stroke[stroke.length - 1].s

        expect(fill.slice(0, 3)).not.toEqual(strokeEnd.slice(0, 3))
        // 描边要比填充亮，否则看起来是填充在往外洇，而不是轮廓先被点亮。
        expect(luminance(strokeEnd)).toBeGreaterThan(luminance(fill))
      }
    })

    /**
     * 5 个 tab 各有一套色，不是统一强调色。
     * 这条同时防住「为了省事把 5 份配色合成 1 份」的退化。
     */
    it("5 个 tab 的激活色互不相同", () => {
      const signatures = TAB_NAMES.map((name) => {
        const items = shapeItems(readAnimation(name))
        return [items.find((item) => item.ty === "fl").c.k, items.find((item) => item.ty === "st").c.k[1].s]
          .map((color: number[]) => color.slice(0, 3).join(","))
          .join("|")
      })
      expect(new Set(signatures).size).toBe(TAB_NAMES.length)
    })

    /**
     * 颜色必须在**深浅两套**实心块上都站得住。
     *
     * 这是纯 JSON 层面的检查，肉眼看不到的失败模式是：有人挑了深色系的强调色（比如
     * #0A3F8F），在白底的设计稿里很好看，压到 #1C1C1F 的激活块上就糊成一团。
     * 阈值取 WCAG 对非文本图形的 3:1。
     */
    it("激活色在深浅两套实心块上都有 3:1 以上的对比", () => {
      for (const name of TAB_NAMES) {
        const items = shapeItems(readAnimation(name))
        const fill = items.find((item) => item.ty === "fl").c.k
        const strokeEnd = items.find((item) => item.ty === "st").c.k[1].s
        for (const pillHex of ACTIVE_PILLS) {
          const pill = parseHex(pillHex)
          // 描边在最外侧，它糊掉等于整个图标轮廓消失，要求与填充一样严。
          expect(contrast(fill, pill)).toBeGreaterThan(3)
          expect(contrast(strokeEnd, pill)).toBeGreaterThan(3)
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
     * 描边色只写了一套（灰→白），没有为深色模式导出第二份。
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
      // 磨砂让胶囊通透了，激活标记若也半透明，白色末帧会发灰、边界糊掉。
      expect(source).toContain("&__item--active {\n    background: #1c1c1f;")
      expect(source).toContain(".mc-tabbar__item--active {\n    background: #3a3a3c;")
    })
  })
})
