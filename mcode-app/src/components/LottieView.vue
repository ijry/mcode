<template>
  <!--
    容器用 <view> 而不是 <div>：uni-app 的模板要能编译到小程序端，<div> 在那里不存在。
    lottie 只会被真正挂在 H5 / App 两端（那两端是 webview，才有 DOM 给它操作）；
    其余端这里保留空容器，外部调用全部退化成安全空操作。
  -->
  <view ref="containerRef" class="lottie-view"></view>
</template>

<script setup lang="ts">
/**
 * uni-app（vue3）可用的 Lottie 播放器。
 *
 * **来历**：改自 uni_modules 里的 `ux-lottie`。原插件是 **uni-app x** 组件 —— 组件源码是
 * `.uvue`，底层是 utssdk 的原生实现，而本项目是 uni-app（vue3，页面为 `.vue`），
 * 原样拿过来编译不过。它按平台分派的思路是对的（web 端 `lottie-web` + SVG renderer），
 * 这里把那部分搬到 uni-app 的写法里，并补上原插件**没有**的帧控制接口。
 *
 * **补了什么**：
 *   - `goToAndStop` / `goToAndPlay`：原插件只有 play/stop/pause/resume，无法让图标停在
 *     某一帧。而 tabbar 需要「未激活停首帧、激活停末帧」，没有它就必须让 5 个动画
 *     全程跑着。
 *   - `setDirection`：让一个动画文件同时承担激活（正向播到末帧）与取消激活（反向退回首帧），
 *     不必导出两份 JSON。
 *   - `animationData` 入参：原插件只有 `src`（运行时按路径取 JSON）。App 端页面跑在
 *     file:// 下，XHR 取本地 JSON 受限制，内联数据更可靠，也省一次 IO。
 *
 * **没补的**：小程序端依旧不做实现（原插件的 `utssdk/mp-weixin/index.uts` 本身就是
 * 一堆空方法，连 lottie-miniprogram 都没引）。真要支持小程序，要改用
 * lottie-miniprogram + Canvas 2D，且底栏 5 个图标意味着 5 个常驻 canvas，代价不小。
 * 组件里对此留了条件编译的位置，但没有实现。
 */
import { onMounted, onUnmounted, ref, shallowRef } from "vue"

type LottiePlayer = { loadAnimation(params: LottieLoadParams): LottieAnimationItem }

const props = withDefaults(
  defineProps<{
    /** 内联的动画数据。优先于 `src`，见上面 file:// 的说明。 */
    animationData?: Record<string, unknown>
    /** 动画 JSON 路径，与 ux-lottie 的 `src` 同义。 */
    src?: string
    loop?: boolean
    autoplay?: boolean
  }>(),
  { loop: false, autoplay: false }
)

const emit = defineEmits<{ (e: "loaded"): void }>()

const containerRef = ref<unknown>(null)
const anim = shallowRef<LottieAnimationItem | null>(null)

/**
 * lottie 要的是真实 DOM 节点。
 *
 * uni-app 的 `<view>` 是内置组件，`ref` 拿到的是**组件实例**，DOM 节点在 `.$el` 上。
 * 直接把组件实例传给 lottie，它会往一个非节点对象上挂 SVG，结果就是什么都不显示
 * 且不报错 —— 这类静默失败很难查。
 */
function resolveContainer(): unknown {
  const raw = containerRef.value as { $el?: unknown } | null
  return raw && raw.$el ? raw.$el : raw
}

// #ifdef H5 || APP-PLUS
async function mountAnimation() {
  if (!props.animationData && !props.src) return

  const mod = await import("@/vendor/lottie-light.min.cjs")
  const player = ((mod as { default?: LottiePlayer }).default ?? mod) as LottiePlayer
  const container = resolveContainer()
  if (!container) return

  // path 与 animationData 互斥，且 lottie 在拿到 undefined 的 path 时会尝试去取它，
  // 所以这里按有无分别赋值，而不是把 undefined 也塞进去。
  const params: LottieLoadParams = {
    container,
    renderer: "svg",
    loop: props.loop,
    autoplay: props.autoplay,
  }
  if (props.animationData) params.animationData = props.animationData
  else if (props.src) params.path = props.src

  anim.value = player.loadAnimation(params)
  emit("loaded")
}
// #endif

onMounted(() => {
  // #ifdef H5 || APP-PLUS
  void mountAnimation()
  // #endif
})

onUnmounted(() => {
  anim.value?.destroy()
  anim.value = null
})

/**
 * 以下方法在动画尚未就绪（或当前端根本不支持 lottie）时全部是空操作 ——
 * 调用方不需要先判空，这是让同一份底栏代码能在三端跑通的前提。
 */
function play() {
  anim.value?.play()
}

function stop() {
  anim.value?.stop()
}

function pause() {
  anim.value?.pause()
}

/** lottie 没有独立的 resume，继续播放就是 play。 */
function resume() {
  anim.value?.play()
}

function destroy() {
  anim.value?.destroy()
  anim.value = null
}

/** direction=1 正向播放（激活），-1 反向（取消激活）。 */
function setDirection(direction: 1 | -1) {
  anim.value?.setDirection(direction)
}

function setSpeed(speed: number) {
  anim.value?.setSpeed(speed)
}

function goToAndStop(value: number, isFrame = true) {
  anim.value?.goToAndStop(value, isFrame)
}

function goToAndPlay(value: number, isFrame = true) {
  anim.value?.goToAndPlay(value, isFrame)
}

/** 动画总帧数。外部据此定位末帧，不必把 29 这种魔数写死在业务里。 */
function getTotalFrames(): number {
  return anim.value?.totalFrames ?? 0
}

defineExpose({
  play,
  stop,
  pause,
  resume,
  destroy,
  setDirection,
  setSpeed,
  goToAndStop,
  goToAndPlay,
  getTotalFrames,
})
</script>

<style scoped lang="scss">
/* lottie 注入的 <svg> 会撑满容器，所以尺寸由外层决定，这里只负责占满。 */
.lottie-view {
  width: 100%;
  height: 100%;
}
</style>
