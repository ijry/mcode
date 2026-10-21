<template>
  <up-navbar
    customClass="conversations-navbar-shell"
    :fixed="true"
    :placeholder="true"
    :border="false"
    :autoBack="false"
    height="46px"
    bgColor="transparent"
    :statusBarBgColor="NAVBAR_GLASS_BG_COLOR"
  >
    <!--
      M08 顶栏三件套：左「视图」· 中「连接」· 右「搜索」。
      三者都是 32px 高的圆角玻璃块（设计稿节点 9:1666 / 9:1667 / 9:1668），
      左侧按钮切列表展示形态，中间胶囊切连接，右侧按钮唤出搜索。
    -->
    <template #left>
      <view class="conv-nav__btn" @click="emit('filter')">
        <up-icon name="list-dot" size="18" :color="iconColor"></up-icon>
      </view>
    </template>

    <template #center>
      <!--
        连接切换胶囊。设计稿宽 104、高 32、圆角 12，文字 14 SemiBold + 12 的箭头。
        不给固定宽度：连接名可能是「MacBook Pro」也可能是「办公室的 Mac mini」，
        固定 104 会把长的截断、短的留一片空白。max-width 兜住极长名字。
      -->
      <view class="conv-nav__conn" @click="emit('connection')">
        <text class="conv-nav__conn-name">{{ connectionName || "未连接" }}</text>
        <up-icon name="arrow-down" size="11" :color="chevronColor"></up-icon>
      </view>
    </template>

    <template #right>
      <view
        :class="['conv-nav__btn', searchActive && 'conv-nav__btn--active']"
        @click="emit('search')"
      >
        <up-icon name="search" size="18" :color="searchActive ? activeIconColor : iconColor"></up-icon>
      </view>
    </template>
  </up-navbar>
</template>

<script setup lang="ts">
/**
 * 会话列表顶栏（M08）。
 *
 * 纯受控、零内部状态：点哪个按钮就抛哪个事件，具体打开什么面板由页面决定 ——
 * 这样「视图切换」「连接切换」两个面板都能复用页面里已有的 action sheet 逻辑，
 * 顶栏不必知道列表有几种展示形态。
 *
 * 三种状态（视图 / 搜索展开）共用同一套尺寸，只有内容不同。
 */
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
 * 状态栏底色。**直接给 CSS `var()` 字符串，不在 script 里求值** —— `upThemeVar` 是
 * uview 按 Options API mixin 注入的方法，只有模板作用域能调；在 `<script setup>`
 * 顶层调用会抛 ReferenceError（computed 里静默失败，prop 变空串，navbar 回退透明）。
 */
const NAVBAR_GLASS_BG_COLOR = "var(--up-navbar-glass-bg-color, rgba(255, 255, 255, 0.82))"

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
/* navbar 容器底色穿透（沿用本页既有的液态玻璃做法，见
   docs/mcode-architecture-notes/2026-06-28-conversations-liquid-glass.md）。 */
.conversations-navbar-shell :deep(.u-navbar--fixed),
.conversations-navbar-shell :deep(.u-status-bar),
.conversations-navbar-shell :deep(.u-navbar__content) {
  background: var(--up-navbar-glass-bg-color, rgba(255, 255, 255, 0.82)) !important;
  backdrop-filter: blur(30rpx);
  -webkit-backdrop-filter: blur(30rpx);
}

/* 降级：不支持 backdrop-filter 时退到实色卡片 + 一条底边，保证文字可读。 */
@supports not (backdrop-filter: blur(1px)) {
  .conversations-navbar-shell :deep(.u-navbar__content) {
    background: var(--up-card-bg-color, #ffffff) !important;
    border-bottom: 1rpx solid var(--up-border-color, #dadbde);
  }

  .conversations-navbar-shell :deep(.u-status-bar) {
    background: var(--up-card-bg-color, #ffffff) !important;
  }
}

.conversations-navbar-shell :deep(.u-navbar__placeholder) {
  background: transparent !important;
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
