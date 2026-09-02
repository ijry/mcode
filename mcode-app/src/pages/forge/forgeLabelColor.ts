/**
 * 一个 forge 标签的颜色，算成一副在两种主题下都读得清的胶囊配色。
 *
 * 标签只带**一个**颜色，是当初建它的人对着白色页面挑的。原样画在深色底上，
 * 一半会读不出来，亮的那些会刺眼。GitHub 的解法是按颜色的**感知亮度**分两套
 * 处理（Primer 的 `.IssueLabel`），这里就是那个算法。
 *
 * **与桌面端的唯一区别：桌面端输出六个 CSS 自定义属性**（`--fl-bg` /
 * `--fl-fg` / `--fl-border` 各带一个 `-dark` 变体）**让样式表按根节点上的
 * `.dark` class 去挑**；手机端没有这个机制 —— `<style scoped>` 里没有可以 key
 * 的根 class，而 `--mcode-*` 前缀是仓库明令禁止的。所以这里在**计算时**就把
 * `isDark` 吃掉，直接出一套具体色值。
 *
 * 调用方必须把 `isDark` 接成**响应式**的（`getCurrentInstance()?.proxy?.upThemeIsDark`
 * ，uview mixin 的 computed，靠 `upThemeVersion` 触发重算），不能用
 * `isDarkThemeMode()` 一次性读值 —— 后者会让用户切到深色之后每颗标签仍是浅色
 * 配方，深蓝标签变成一团黑底黑字。这是个静默失败，只在深色模式下才看得见。
 */

/** 超过这个感知亮度的标签用黑字，低于用白字。 */
const LIGHT_TEXT_THRESHOLD = 0.453
/** 低于这个亮度时，深色主题下把标签自己的颜色提亮当文字色。 */
const DARK_TEXT_THRESHOLD = 0.6
/** 高于这个亮度的浅色主题标签淡到会溶进页面里，需要一圈自己的边。 */
const LIGHT_BORDER_THRESHOLD = 0.96
const DARK_BACKGROUND_ALPHA = 0.18
const DARK_BORDER_ALPHA = 0.3

export interface ForgeLabelSwatch {
  background: string
  color: string
  border: string
}

/**
 * 颜色读不出来时的中性胶囊。
 *
 * `color === null` 走这里 —— **不要编一个默认色**：forge 给的不是 hex 时
 * （GitLab 写入时接受 `red` / `rebeccapurple` 这类 CSS 颜色名，后端因此拒绝
 * 透传）我们并不知道那个标签该是什么颜色，猜一个和承认不知道相比只是把
 * 「没有颜色」伪装成「有颜色」。
 */
export function neutralLabelSwatch(isDark: boolean): ForgeLabelSwatch {
  return isDark
    ? {
        background: "rgba(255, 255, 255, 0.08)",
        color: "#c9cdd4",
        border: "rgba(255, 255, 255, 0.16)",
      }
    : {
        background: "#f2f3f5",
        color: "#606266",
        border: "#dcdfe6",
      }
}

/**
 * `#rrggbb` → 一副胶囊配色。
 *
 * - 浅色：颜色本身作填充，黑字或白字压在上面，只有那些接近白色、否则会溶进
 *   页面的标签才额外给一圈更深的边；
 * - 深色：颜色的 18% 作填充，而**颜色本身被提亮**当文字色，这样一个深海军蓝
 *   的标签仍然读得出来，而不是变成一团黑底黑字。
 */
export function labelSwatch(
  color: string | null | undefined,
  isDark: boolean
): ForgeLabelSwatch {
  const rgb = channels(color || "")
  if (!rgb) return neutralLabelSwatch(isDark)
  const [r, g, b] = rgb
  const lightness = perceivedLightness(r, g, b)

  if (!isDark) {
    return {
      background: `rgb(${r}, ${g}, ${b})`,
      color: lightness > LIGHT_TEXT_THRESHOLD ? "#000000" : "#ffffff",
      border:
        lightness > LIGHT_BORDER_THRESHOLD
          ? // 近白标签：把同色压暗一档当边，而不是插一根灰线 —— 灰线会让
            // 一排彩色胶囊里唯独这一颗看起来是禁用的。
            hslString(...darken(r, g, b, 12))
          : "transparent",
    }
  }

  const [h, s, l] = toHsl(r, g, b)
  // 深色底上，暗色标签的文字色要提亮；已经够亮的保持原样，再提就开始刺眼。
  const textLightness = lightness < DARK_TEXT_THRESHOLD ? Math.max(l, 55) : l
  return {
    background: `rgba(${r}, ${g}, ${b}, ${DARK_BACKGROUND_ALPHA})`,
    color: hslString(h, s, textLightness),
    border: `rgba(${r}, ${g}, ${b}, ${DARK_BORDER_ALPHA})`,
  }
}

/** ITU-R BT.709 权重 —— 与 Primer 用的同一套。 */
function perceivedLightness(r: number, g: number, b: number): number {
  return (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255
}

/**
 * `#rrggbb` → 三个通道。
 *
 * 后端已经归一化过（`normalize_hex_color` 接受裸 `d73a4a`、带 `#` 的、以及
 * 三位简写，其余一律给 null），所以这里是**最后一道**而不是第一道。仍然接受
 * 三位简写：手改过的存储或未来版本可能送来。
 */
function channels(hex: string): [number, number, number] | null {
  const trimmed = hex.trim().replace(/^#/, "")
  const expanded =
    trimmed.length === 3
      ? trimmed
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : trimmed
  if (!/^[0-9a-f]{6}$/i.test(expanded)) return null
  const n = Number.parseInt(expanded, 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

/** 色相（度）、饱和度与亮度（百分比）。 */
function toHsl(r: number, g: number, b: number): [number, number, number] {
  const rf = r / 255
  const gf = g / 255
  const bf = b / 255
  const max = Math.max(rf, gf, bf)
  const min = Math.min(rf, gf, bf)
  const l = (max + min) / 2
  const span = max - min
  if (span === 0) return [0, 0, l * 100]
  const s = span / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === rf) h = ((gf - bf) / span) % 6
  else if (max === gf) h = (bf - rf) / span + 2
  else h = (rf - gf) / span + 4
  return [(((h * 60) % 360) + 360) % 360, s * 100, l * 100]
}

function darken(
  r: number,
  g: number,
  b: number,
  amount: number
): [number, number, number] {
  const [h, s, l] = toHsl(r, g, b)
  return [h, s, Math.max(0, l - amount)]
}

/** 抹掉 `toHsl` 留下的浮点噪声 —— 这些值要进 style 属性，`hsl(0.20000000000000018deg …)` 帮不了任何人读它。 */
function hslString(h: number, s: number, l: number): string {
  return `hsl(${round(h)}, ${round(s)}%, ${round(l)}%)`
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}
