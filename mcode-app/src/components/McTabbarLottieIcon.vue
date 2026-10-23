<template>
  <view class="mc-tabbar-lottie">
    <!--
      有动画数据才挂载播放器。不支持 lottie 的端（目前是小程序）`animationData` 恒为 null，
      于是落到下面那张静态图 —— 静态图沿用 `static/tabbar/` 里的现成资源，不额外引入。
    -->
    <LottieView
      v-if="animationData"
      ref="viewRef"
      :animation-data="animationData"
      :autoplay="false"
      :loop="false"
      @loaded="handleLoaded"
    />
    <image v-else class="mc-tabbar-lottie__fallback" :src="fallbackSrc" mode="aspectFit" />
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import { onShow } from "@dcloudio/uni-app"
import LottieView from "@/components/LottieView.vue"

type TabName = "connections" | "conversations" | "tasks" | "circles" | "profile"

const props = defineProps<{
  name: TabName
  active: boolean
}>()

const viewRef = ref<InstanceType<typeof LottieView> | null>(null)
const animationData = ref<Record<string, unknown> | null>(null)

/**
 * 静态图兜底用的文件名。
 *
 * `tasks` 对应 `todos-*.png`：static 目录里那套资源是按「待办」命名的（历史遗留），
 * 名字与我们现在的 tab 名对不上，所以这里要显式映射，不能拼出来。
 */
const FALLBACK_FILE: Record<TabName, string> = {
  connections: "connections",
  conversations: "conversations",
  tasks: "todos",
  circles: "circles",
  profile: "profile",
}

const fallbackSrc = computed(
  () => `/static/tabbar/${FALLBACK_FILE[props.name]}${props.active ? "-active" : ""}.png`
)

// #ifdef H5 || APP-PLUS
/**
 * 内联载入动画数据（理由见 lottie.d.ts 里关于 App 端 file:// 的说明）。
 *
 * 这里**必须用相对路径**：Vite 的 `dynamic-import-vars` 插件不解析 `@/` 别名，
 * 用别名写模板字符串会报 Cannot find module 并且不打包对应文件 —— 构建还能过，
 * 但运行时拿到的 chunk 是空的，属于「编译期看着没事、上线才炸」的那类问题。
 */
async function loadAnimationData() {
  const mod = await import(`../assets/tabbar-lottie/${props.name}.json`)
  animationData.value =
    (mod as { default?: Record<string, unknown> }).default ??
    (mod as unknown as Record<string, unknown>)
}
// #endif

onMounted(() => {
  // #ifdef H5 || APP-PLUS
  void loadAnimationData()
  // #endif
})

/**
 * 把图标摆到它该在的位置。
 *
 * `animate=true` 时从首帧正向播到末帧（点亮），否则直接停在对应帧：
 * 激活的停末帧、未激活的停首帧 —— 5 个图标同时挂在底栏上，但只有被点亮的那个在跑。
 */
function settle(animate: boolean) {
  const view = viewRef.value
  if (!view) return

  const totalFrames = view.getTotalFrames()
  if (props.active) {
    if (animate) {
      view.setDirection(1)
      view.goToAndPlay(0, true)
    } else if (totalFrames > 0) {
      view.goToAndStop(totalFrames - 1, true)
    }
  } else {
    view.goToAndStop(0, true)
  }
}

/**
 * `onShow` 早于动画就绪时先记账，等 `loaded` 再补播。
 * 少了这个标志，首次进入页面会因为数据还没 load 完而丢掉这次入场动画。
 */
let pendingEntry = false

function handleLoaded() {
  settle(pendingEntry)
  pendingEntry = false
}

/**
 * **为什么是 onShow 播放，而不是点击时播放**。
 *
 * 本项目底栏按 uni-app 的套路在每个 tab 页各挂一份（页面是各自独立的 webview，
 * 没法在根组件挂一次）。点击某个 tab 后 `switchTab` 立刻切页，旧页面连同它上面的
 * 底栏一起被隐藏 —— 在旧页面上播的动画用户根本看不到。
 *
 * 新页面的底栏是全新实例，它会走 mounted → 本 onShow，动画正好在用户眼前播完。
 * 所以「点击 → 新页面出现 → 当前图标点亮」在观感上是连贯的一次反馈。
 */
onShow(() => {
  if (!props.active) return
  if (viewRef.value && viewRef.value.getTotalFrames() > 0) settle(true)
  else pendingEntry = true
})

/**
 * 同一份组件内发生激活态切换时才走这里。
 *
 * 正常切 tab 是页面级的（新页面组件自己会播），所以这条路径平时不触发；
 * 留着是为了应对将来底栏改成单实例常驻的情形。
 *
 * 这里不做反向播放（保留 `setDirection(-1)` 的写法是错的）：非激活的图标在切页后
 * 已经不在用户视野里，让它倒着播一遍纯属白费，直接停首帧即可。
 */
watch(
  () => props.active,
  (active, previous) => {
    if (active === previous) return
    settle(active)
  }
)
</script>

<style scoped lang="scss">
/* 尺寸与原来的 u-icon（21/22px）对齐，避免改动底栏的几何。 */
.mc-tabbar-lottie {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mc-tabbar-lottie__fallback {
  width: 22px;
  height: 22px;
}
</style>
