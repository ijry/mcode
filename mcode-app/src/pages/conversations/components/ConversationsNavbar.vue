<template>
  <up-navbar
    customClass="conversations-navbar-shell"
    :fixed="true"
    :placeholder="true"
    :border="false"
    :autoBack="false"
    height="44px"
    :leftIcon="historyMode ? 'arrow-left' : ''"
    :leftIconColor="upThemeVar('--up-main-color', '#191c1e')"
    bgColor="transparent"
    :statusBarBgColor="NAVBAR_GLASS_BG_COLOR"
    @leftClick="emit('back')"
  >
    <template #center>
      <text class="conversations-navbar__title u-line-1">
        {{ historyMode ? title : "会话" }}
      </text>
    </template>
    <template #right>
      <view class="conversations-navbar__actions">
        <template v-if="historyMode">
          <view
            v-if="canCreate"
            class="conversations-navbar__select"
            @click="emit('create')"
          >
            <text class="conversations-navbar__select-text">新建</text>
          </view>
        </template>
        <template v-else>
          <view
            v-if="showSelectionEntry"
            class="conversations-navbar__select"
            @click="emit('toggle-selection')"
          >
            <text class="conversations-navbar__select-text">{{ selectionMode ? "取消" : "选择" }}</text>
          </view>
          <view
            v-if="!selectionMode"
            class="conversations-navbar__action"
            @click="emit('create')"
          >
            <up-icon name="plus" size="18" :color="upThemeVar('--up-primary', '#2f7cf6')"></up-icon>
          </view>
        </template>
      </view>
    </template>
  </up-navbar>
</template>

<script setup lang="ts">
import { getCurrentInstance } from "vue"

/**
 * 会话列表顶栏。两种形态：概览（标题「会话」+ 选择/新建）与历史（返回 + 历史标题 + 新建）。
 *
 * 纯受控：所有开关状态（是否历史模式、能否新建、是否显示选择入口、是否正在选择）都由页面
 * 传入，子组件只上抛三个动作事件。back 只在历史模式下可能触发（返回图标仅历史模式渲染）。
 */
defineProps<{
  /** 历史面板模式（决定标题、返回图标、右侧按钮布局）。 */
  historyMode: boolean
  /** 历史模式下的标题；概览模式固定显示「会话」。 */
  title: string
  /** 历史模式下是否显示「新建」。 */
  canCreate: boolean
  /** 概览模式下是否显示「选择」入口。 */
  showSelectionEntry: boolean
  /** 是否处于批量选择中（决定「选择」文案与是否隐藏「新建」）。 */
  selectionMode: boolean
}>()

const emit = defineEmits<{
  (event: "back"): void
  (event: "create"): void
  (event: "toggle-selection"): void
}>()

/**
 * 状态栏底色。**直接给 CSS `var()` 字符串，不在 script 里求值** —— `upThemeVar` 是 uview 用
 * Options API mixin 注入的方法，只有模板作用域能调；在 `<script setup>` 里调会抛
 * ReferenceError（computed 里静默失败，prop 变空串，navbar 回退到 transparent）。交给 CSS
 * 由浏览器求值，主题切换自动跟随。值与下方 `.conversations-navbar-shell` 玻璃规则同源，
 * 两处必须一致。
 */
const NAVBAR_GLASS_BG_COLOR = "var(--up-navbar-glass-bg-color, rgba(255, 255, 255, 0.82))"

const currentInstance = getCurrentInstance()
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")
</script>

<style scoped lang="scss">
/* .u-navbar__content 自带 background-color: $u-bg-color，仅靠 bgColor="transparent"
   只能覆盖 inline style，容器层仍不透明 —— 必须 :deep() 穿透。
   写法沿用 pages/conversation-detail/index.scss:66-76 的既有做法。

   底色用 uview 运行时主题表里现成的 --up-navbar-glass-bg-color（它随浅/深色翻转），
   与 navbarGlassBgColor 传给状态栏的值是同一个 —— 两块必须一致，否则状态栏与 navbar
   会出现一条色差接缝。

   刻意不照搬会话详情页的**不透明** --up-card-bg-color：那条笔记
   (2026-07-02-detail-navbar-status-bar-bg.md) 要的是「别让消息区透到状态图标后面」，
   而本页要的正是背景光斑透上来。 */
.conversations-navbar-shell :deep(.u-navbar--fixed),
.conversations-navbar-shell :deep(.u-status-bar),
.conversations-navbar-shell :deep(.u-navbar__content) {
  background: var(--up-navbar-glass-bg-color, rgba(255, 255, 255, 0.82)) !important;
  backdrop-filter: blur(30rpx);
  -webkit-backdrop-filter: blur(30rpx);
}

/* 降级：不支持 backdrop-filter 时退到半透卡片色 + 1rpx 浅边框，保证文字可读
   （docs/mcode-architecture-notes/2026-06-28-conversations-liquid-glass.md 立的规矩）。 */
@supports not (backdrop-filter: blur(1px)) {
  .conversations-navbar-shell :deep(.u-navbar__content) {
    background: var(--up-card-bg-color, #ffffff) !important;
    border-bottom: 1rpx solid var(--up-border-color, #dadbde);
  }

  .conversations-navbar-shell :deep(.u-status-bar) {
    background: var(--up-card-bg-color, #ffffff) !important;
  }
}

/* __placeholder 是 u-navbar--fixed 之外的独立兄弟节点，组件没给它背景、上面的玻璃规则也
   没选中它。这条显式 transparent 是护栏：一旦它被误染上玻璃色，顶部会出现
   「占位块 + fixed 层」的双层色带。 */
.conversations-navbar-shell :deep(.u-navbar__placeholder) {
  background: transparent !important;
}

/* .u-navbar__content__left / __right 都是 position: absolute，所以长标题不会把右侧按钮
   挤出去，而是滑到它们**底下**。max-width 是为了防这种重叠，不是防挤压。 */
.conversations-navbar__title {
  max-width: 420rpx;
  font-size: 32rpx;
  font-weight: 600;
  color: var(--up-main-color, #191c1e);
}

/* .u-navbar__content__right 自带 padding: 0 13px，故这里不再另加外边距。 */
.conversations-navbar__actions {
  display: flex;
  align-items: center;
  gap: 12rpx;
  flex-shrink: 0;
}

.conversations-navbar__select {
  min-width: 84rpx;
  height: 56rpx;
  padding: 0 18rpx;
  border-radius: 999rpx;
  background: color-mix(in srgb, var(--up-primary, #2f7cf6) 10%, var(--up-card-bg-color, #ffffff) 90%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.conversations-navbar__select-text {
  font-size: 24rpx;
  line-height: 1;
  font-weight: 700;
  color: var(--up-primary, #2f7cf6);
}

.conversations-navbar__action {
  width: 56rpx;
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.5);
  background: color-mix(in srgb, var(--up-card-bg-color, #ffffff) 50%, transparent);
  backdrop-filter: blur(25rpx);
  -webkit-backdrop-filter: blur(25rpx);
  box-shadow: 0 6rpx 18rpx rgba(47, 124, 246, 0.08);
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.conversations-navbar__action:active {
  transform: scale(0.9);
}
</style>
