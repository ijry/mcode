<template>
  <up-navbar
    customClass="conversations-navbar-shell"
    :fixed="true"
    :placeholder="true"
    :border="false"
    :autoBack="false"
    height="44px"
    bgColor="transparent"
    :statusBarBgColor="NAVBAR_GLASS_BG_COLOR"
    @leftClick="emit('back')"
  >
    <!-- 自己渲染 left 槽，所以不再传 leftIcon（有插槽时该 prop 不生效）。
         概览模式下这里是纯图标的下拉菜单触发区，历史模式下退回返回箭头。 -->
    <template #left>
      <up-icon
        v-if="historyMode"
        name="arrow-left"
        size="20"
        :color="upThemeVar('--up-main-color', '#191c1e')"
      ></up-icon>
      <up-select
        v-else
        class="conversations-navbar__menu"
        :options="menuOptions"
        keyName="value"
        labelName="label"
        optionsWidth="320rpx"
        @select="handleMenuSelect"
      >
        <!-- 触发区只有一个图标：文案「会话」已移到 center 槽。图标放 #text 槽，
             #icon 槽必须塞一个真实但隐藏的节点 —— Vue 的 renderSlot 在插槽内容为空
             （空 template / 只有注释）时会回落到默认内容，也就是 up-select 自带的
             arrow-down，写 `<template #icon></template>` 是关不掉它的。 -->
        <template #text>
          <up-icon
            class="conversations-navbar__menu-icon"
            name="more-dot-fill"
            size="20"
            :color="upThemeVar('--up-main-color', '#191c1e')"
          ></up-icon>
        </template>
        <template #icon>
          <text class="conversations-navbar__menu-icon-slot"></text>
        </template>
      </up-select>
    </template>
    <!-- 概览模式居中显示固定文案「会话」，历史模式居中显示分组名。 -->
    <template #center>
      <text class="conversations-navbar__title u-line-1">{{ historyMode ? title : "会话" }}</text>
    </template>
  </up-navbar>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance } from "vue"

/**
 * 会话列表顶栏。两种形态：概览（左侧图标下拉菜单 + 中间「会话」）与历史（返回 + 分组标题）。
 *
 * 「已完成筛选」与「选择」两个动作收进左侧的 `up-select` 下拉，新建会话的 `＋` 移到搜索行
 * （见 ConversationsSearchBar.vue），所以顶栏不再有 right 槽。
 *
 * 纯受控：所有开关状态（是否历史模式、是否隐藏已完成、是否显示选择入口、是否正在选择）都
 * 由页面传入，子组件只上抛三个动作事件。back 只在历史模式下可能触发（返回图标仅历史模式
 * 渲染，但 `.u-navbar__content__left` 这块点击区两种模式都在，故守卫留在页面）。
 */
const props = defineProps<{
  /** 历史面板模式（决定左侧是返回箭头还是下拉菜单、中间是否显示分组标题）。 */
  historyMode: boolean
  /** 历史模式下的标题；概览模式中间固定显示「会话」。 */
  title: string
  /** 是否隐藏已完成会话（决定菜单项文案是「显示」还是「隐藏」）。 */
  hideCompleted: boolean
  /** 概览模式下是否有可选中的卡片（无则不出「选择会话」这一项）。 */
  showSelectionEntry: boolean
  /** 是否处于批量选择中（决定选择项文案）。 */
  selectionMode: boolean
}>()

const emit = defineEmits<{
  (event: "back"): void
  (event: "toggle-hide-completed"): void
  (event: "toggle-selection"): void
}>()

const MENU_HIDE_COMPLETED = "hide-completed"
const MENU_SELECTION = "selection"

/**
 * 下拉菜单项。文案随当前状态翻转（说的是「点下去会发生什么」，而不是当前状态），因为
 * `up-select` 没有勾选态可用 —— 不绑 `current`，菜单每次打开都是无选中项。
 *
 * 「选择会话」只在有可选中卡片时出现（沿用页面的 `showSelectionEntry`）；已经在选择模式里
 * 时无条件保留，否则筛选把卡片全藏掉后用户就没有退出选择的入口了。
 */
const menuOptions = computed(() => {
  const options = [
    {
      value: MENU_HIDE_COMPLETED,
      label: props.hideCompleted ? "显示已完成会话" : "隐藏已完成会话",
    },
  ]
  if (props.showSelectionEntry || props.selectionMode) {
    options.push({
      value: MENU_SELECTION,
      label: props.selectionMode ? "退出选择" : "选择会话",
    })
  }
  return options
})

function handleMenuSelect(item: { value?: string }) {
  if (item?.value === MENU_HIDE_COMPLETED) {
    emit("toggle-hide-completed")
    return
  }
  if (item?.value === MENU_SELECTION) {
    emit("toggle-selection")
  }
}

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

/* 图标化的下拉触发区。撑满 navbar 高度（见下条注释），所以这里只负责让图标居中并给出
   一块比图标本身更宽的点击区。 */
.conversations-navbar__menu-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56rpx;
  height: 100%;
}

/* 占位节点，用来顶掉 up-select 默认 #icon 槽里的 arrow-down（空插槽会回落到默认内容）。 */
.conversations-navbar__menu-icon-slot {
  display: none;
}

/* 触发区撑满 navbar 高度。u-select 的面板定位是 `top: calc(100% + 4px)`，若触发区只有文字
   高度（约 20px，在 44px 里居中），面板会从 navbar 中部往下弹，压住 navbar 下沿。撑满之后
   「100%」就等于 navbar 底边。
   `.u-navbar__content__left` 是 top:0/bottom:0 的绝对定位块 + align-items: center，
   所以这里的 100% 解析得到确定值。 */
.conversations-navbar__menu,
.conversations-navbar__menu :deep(.u-select__content),
.conversations-navbar__menu :deep(.u-select__label) {
  height: 100%;
}

/* 面板自身的底色/边框由 u-select 用 --up-card-bg-color / --up-border-color 画好了（随主题
   翻转），这里只补圆角与投影，让它读起来跟本页的玻璃卡片同族。
   `:deep()` 能命中是因为子组件根元素带着本组件的 scope 属性。 */
.conversations-navbar__menu :deep(.u-select__options) {
  border-radius: 20rpx;
  overflow: hidden;
  box-shadow: 0 18rpx 52rpx rgba(15, 23, 42, 0.16);
}

/* u-select 自带 `margin-bottom: 46px`（为它原本的表单场景留位），在 navbar 里没有意义 ——
   它会把面板下方撑出一段不可见的可点区域。 */
.conversations-navbar__menu :deep(.u-select__options__wrap) {
  margin-bottom: 0;
}
</style>
