/**
 * lottie-web 运行时的类型声明。
 *
 * 运行时本体在 `src/vendor/lottie-light.min.cjs`（vendor 化的 lottie_light 构建，
 * SVG renderer、不含表达式）。它本身没有类型，且是 UMD 包 —— 在 `"type": "module"`
 * 的仓库里必须以 `.cjs` 结尾才能被 Vite 按 CommonJS 处理，否则导出为空。
 *
 * 这里只声明**本仓库实际用到的**那部分 API，不照抄 lottie-web 的完整类型 —— 那会引入
 * 一整个 animation 对象模型，而我们只把它当播放器用。
 */
/**
 * 这两个接口声明在**文件顶层**（本文件没有顶层 import/export，因此是全局脚本），
 * 组件里可以直接按名字引用。
 *
 * 不把它们放进下面的 `declare module` 里：通配符模块声明的作用是匹配路径，
 * 里面的 `export` 无法被 `import type` 拿到，放进去等于声明了却引用不到。
 */
interface LottieAnimationItem {
  /** 动画总帧数（op - ip）。用来把「末帧」表达成 totalFrames - 1。 */
  readonly totalFrames: number
  play(): void
  stop(): void
  pause(): void
  setDirection(direction: 1 | -1): void
  setSpeed(speed: number): void
  setLoop(loop: boolean): void
  /** 跳到某一帧并停住。`isFrame=true` 时 `value` 按帧解释，否则按秒。 */
  goToAndStop(value: number, isFrame?: boolean): void
  goToAndPlay(value: number, isFrame?: boolean): void
  destroy(): void
  addEventListener(name: string, callback: () => void): void
}

interface LottieLoadParams {
  container: unknown
  renderer: "svg" | "canvas" | "html"
  loop?: boolean
  autoplay?: boolean
  /** 内联的动画数据。与 `path` 二选一。 */
  animationData?: unknown
  /** 动画 JSON 的路径（走运行时取文件）。 */
  path?: string
}

declare module "*lottie-light.min.cjs" {
  const lottie: {
    loadAnimation(params: LottieLoadParams): LottieAnimationItem
  }

  export default lottie
}

/**
 * 允许直接 import 动画 JSON。
 *
 * 底栏的 5 个动画都是 **import 进包**而不是运行时按 path 去取：App 端页面跑在
 * file:// 下，XHR 取本地 JSON 会受限制，且多一次 IO 会让首屏图标晚一帧才出现。
 */
declare module "*.json" {
  const json: Record<string, unknown>
  export default json
}
