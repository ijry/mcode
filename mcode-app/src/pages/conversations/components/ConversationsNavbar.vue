<template>
  <!--
    占位根：在常规流里撑出与 fixed 层等高的一段（状态栏占位 + 46px 导航行）。
    fixed 层不占流，搜索条 / 空态 / 列表会从屏幕顶部开始排 —— 没有这个等高块，
    内容就会压在导航行上面（列表第一行被三件套盖住）。
  -->
  <view class="conversations-navbar" :style="{ height: navbarHeight }">
    <!--
      fixed 层：置顶的三件套。**整层透明，不画任何背景** ——

      iOS standalone（meta=black，service 的 "system" 档）下，iOS 26/27 在页面顶部
      画一条自己的 Liquid Glass 滚动边缘带（实测约 75pt，锚在 webview 顶部），
      采样滚到它下面的内容；连接列表「状态栏与内容一整片」靠的就是这条系统带，
      不是代码。WebKit 的 `_shouldHideTopScrollPocket`（WKWebViewIOS.mm →
      LocalFrameView::fixedContainerEdges）只在视口顶端下方 4px、水平中点的命中
      测试撞上的第一个 fixed/sticky 祖先（≥90% 视口宽、≤105% 视口高）**带背景色**
      时，才用它的颜色把带子填掉（fixed colour extension）。本层 transparent =
      取不到颜色 = 带子照画（vcctrl 实证：0px 高、取不到色的固定条「仍然模糊」）。
      于是导航行整个落进系统带里：按钮置顶，背后的毛砂是 iOS 画的。

      曾经在这里手绘玻璃（backdrop-filter + 状态栏段深色渐变）：系统带照画、
      手工玻璃与系统材质对不上，用户三次反馈「状态栏与导航两块割裂」。
      解法不是「别 fixed」—— 三件套是常驻控件，滚走就没了入口 —— 是「别上色」。
    -->
    <view class="conversations-navbar__fixed">
      <!--
        状态栏占位：高度按平台分两档，见 <script> 里 statusBarInset 的注释。
        iOS standalone 下是 0 —— webview 本就紧贴系统状态栏下沿开始（Apple 文档：
        black/default 下「内容显示在状态栏下方」；vcctrl 在 iOS 27 实测
        env(safe-area-inset-top) 为 0）。再填一个系统状态栏高度，导航行就会被推出
        口袋带（75pt）—— 那时 fixed 层背后是生内容，按钮浮在原始列表上。
      -->
      <view class="conversations-navbar__statusbar" :style="{ height: statusBarInset + 'px' }"></view>

      <!--
        导航行：M08 顶栏三件套 —— 左「视图」· 中「连接」· 右「搜索」（设计稿 9:1661/1666/1667/1668）。
        刻意不 fixed 单行、整层固定：三个动作全部上抛，顶栏自己不打开任何面板。
      -->
      <view class="conversations-navbar__row">
        <view class="conv-nav__btn" @click="emit('filter')">
          <up-icon name="list-dot" size="18" :color="iconColor"></up-icon>
        </view>

        <!--
          连接切换胶囊。设计稿宽 104、高 32、圆角 12，文字 14 SemiBold + 12 的箭头。
          不给固定宽度：连接名可能是「MacBook Pro」也可能是「办公室的 Mac mini」，
          固定 104 会把长的截断、短的留一片空白。max-width 兜住极长名字。
        -->
        <view class="conv-nav__conn" @click="emit('connection')">
          <text class="conv-nav__conn-name">{{ connectionName || "未连接" }}</text>
          <up-icon name="arrow-down" size="11" :color="chevronColor"></up-icon>
        </view>

        <view
          :class="['conv-nav__btn', searchActive && 'conv-nav__btn--active']"
          @click="emit('search')"
        >
          <up-icon name="search" size="18" :color="searchActive ? activeIconColor : iconColor"></up-icon>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 会话列表顶栏（M08）。
 *
 * 纯受控、零内部状态：点哪个按钮就抛哪个事件，具体打开什么面板由页面决定 ——
 * 这样「视图切换」「连接切换」两个面板都能复用页面里已有的 action sheet 逻辑，
 * 顶栏不必知道列表有几种展示形态。
 *
 * 形制上是 **fixed + 全透明**：三件套必须置顶（常驻控件），但整层不画背景 ——
 * 状态栏那条带子交给 iOS 系统（详见模板注释与 `services/iosStandaloneStatusBar.ts`）。
 * 与连接列表的差别只在连接列表滚走的是品牌区，而这里滚走的必须是常驻控件。
 */
import { isIosStandaloneDisplayMode } from "@/services/iosStandaloneStatusBar"

defineProps<{
  /** 当前连接名，显示在中间胶囊里。 */
  connectionName?: string
  /** 搜索条是否已展开（决定右侧按钮的高亮态）。 */
  searchActive?: boolean
}>()

const emit = defineEmits<{
  (event: "filter"): void
  (event: "connection"): void
  (event: "search"): void
}>()

/**
 * 状态栏占位高度，按平台两档：
 *
 * - **iOS standalone**（PWA 加到主屏）：`0`。Apple 文档 —— black/default 下 web
 *   内容显示在状态栏**下方**，webview 起点就在系统状态栏下沿（vcctrl 在 iOS 27
 *   实测 env(safe-area-inset-top) 为 0、webview 整高比屏幕少 62pt）。这时填任何
 *   正值都会把导航行推出口袋带（约 75pt，锚在 webview 顶部）—— 按钮会浮在
 *   没有毛砂的生内容上。
 * - **其他端**：`uni.getWindowInfo().statusBarHeight`。Android app-plus 的 manifest
 *   是 immersed（webview 画在状态栏底下）、mp-weixin 用自定义导航，都必须撑出
 *   系统状态栏高度，否则导航行被系统状态栏压住。
 *
 * 两种情况下占位都等于「webview 顶沿到可见内容区上沿」的真实距离，导航行永远
 * 紧贴内容区上沿 —— 矮了会被系统状态栏压，高了是一条空白。
 */
const statusBarInset = (() => {
  if (isIosStandaloneDisplayMode()) return 0
  try {
    const info = uni.getWindowInfo?.() || uni.getSystemInfoSync?.()
    const value = Number(info?.statusBarHeight)
    return Number.isFinite(value) && value > 0 ? value : 0
  } catch {
    return 0
  }
})()

/** 占位根高度 = 状态栏占位 + 46px 导航行（设计稿 9:1661），与 fixed 层严格等高。 */
const navbarHeight = `${statusBarInset + 46}px`

/**
 * 图标与箭头颜色直接用 CSS 变量字符串，交给浏览器求值。
 *
 * `up-icon` 把它写进内联 `color`，CSS 自定义属性在内联样式里是合法值，所以深浅色切换
 * 不需要经过 JS —— 少一次重渲染，也不会出现「切主题后图标还是旧色」的滞后。
 */
const iconColor = "var(--up-content-color, #48484a)"
const chevronColor = "var(--up-tips-color, #8a8a8e)"
const activeIconColor = "var(--up-primary, #2979ff)"
</script>

<style scoped lang="scss">
/*
 * 占位根只负责撑高，没有任何视觉。高度由脚本绑定（状态栏占位 + 46px），
 * 与 fixed 层严格等高，内容才会正好从导航行下沿开始排。
 */
.conversations-navbar {
  flex-shrink: 0;
}

/*
 * fixed 层：置顶 + 全透明。
 *
 * z-index 10：压过列表内容（.conversations-shell 是 z-index 1 的层叠上下文，
 * 本层在它内部），低于胶囊底栏（20）与批量操作条（30）—— 那两个在屏幕另一端，
 * 本来也不重叠。u-popup / u-action-sheet 的层级更高，不受影响。
 *
 * ⚠️ 不许给这一层加背景色或磨砂效果：一带色（半透明底色也算）就会触发 WebKit 的
 * fixed colour extension，把 iOS 的系统玻璃带填掉 —— 那正是三轮「两块割裂」的成因。
 */
.conversations-navbar__fixed {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  background: transparent;
}

/* 状态栏占位：透明是全部要求 —— 不画背景，系统玻璃带才露得出来。 */
.conversations-navbar__statusbar {
  flex-shrink: 0;
  background: transparent;
}

/* 导航行：高 46（设计稿 9:1661）。左右贴 32rpx —— fixed 之后不再吃
   `.conversations-shell` 的 `padding: 0 32rpx`，必须自己补，否则三件套会比
   搜索条和列表卡片宽出 16px。三件套 space-between，中间胶囊居中。 */
.conversations-navbar__row {
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 32rpx;
  box-sizing: border-box;
}

/* 左右按钮：32×32、圆角 16、72% 卡片色 + 6% 前景色描边（设计稿 9:1666）。 */
.conv-nav__btn {
  width: 32px;
  height: 32px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  background: color-mix(in srgb, var(--up-card-bg-color, #ffffff) 72%, transparent);
  border: 1px solid color-mix(in srgb, var(--up-main-color, #000000) 6%, transparent);
  transition: background-color 0.16s ease;
}

.conv-nav__btn:active {
  background: color-mix(in srgb, var(--up-hover-bg-color, #f3f4f6) 80%, transparent);
}

.conv-nav__btn--active {
  background: color-mix(in srgb, var(--up-primary, #2979ff) 12%, transparent);
  border-color: color-mix(in srgb, var(--up-primary, #2979ff) 28%, transparent);
}

/* 中间连接胶囊：高 32、圆角 12、名字 14 SemiBold + 11 的箭头，gap 4。 */
.conv-nav__conn {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 32px;
  padding: 0 10px;
  border-radius: 12px;
  box-sizing: border-box;
  max-width: 60vw;
}

.conv-nav__conn:active {
  background: color-mix(in srgb, var(--up-hover-bg-color, #f3f4f6) 60%, transparent);
}

.conv-nav__conn-name {
  font-size: 14px;
  line-height: 20px;
  font-weight: 600;
  color: var(--up-main-color, #3c3c43);
  max-width: 46vw;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

</style>
