<template>
  <!--
    全局悬浮胶囊底栏（设计稿 MCode 首页·连接 的「底部导航」）。

    **为什么不做成「根组件挂一次」**：uni-app 的 `App.vue` 没有 `template`，本项目的根节点
    由 `App.up.vue` 提供（见 `vite.config.js` 的 `UniUpRoot`），但它只包 `UpRootView` 与 pet
    浮层 —— 页面是各自独立的 webview，不会被根组件包裹。所以只能每个 tab 页各挂一份。

    **为什么原生 `tabBar` 配置要留着**：`uni.switchTab` 与 `uni.setTabBarBadge`
    （`conversationTabBadgeService` 依赖）都以 `pages.json` 的 `tabBar.list` 为准。删掉它
    就同时失去页面缓存与角标能力。因此这里的做法是「保留配置 + 本组件内 `onShow` 调
    `uni.hideTabBar()` 隐藏原生栏 + 页面内渲染本组件」。
  -->
  <view class="mc-tabbar" :class="{ 'mc-tabbar--hidden': hidden }">
    <view class="mc-tabbar__bar">
      <view
        v-for="item in tabs"
        :key="item.name"
        class="mc-tabbar__item"
        :class="{ 'mc-tabbar__item--active': item.name === current }"
        @click="handleSwitch(item)"
      >
        <view class="mc-tabbar__icon">
          <!--
            图标配色现在由 Lottie 自己管（首帧灰描边 → 末帧白描边 + 白填充），
            不再由这里传 color：动画文件里已经写死了这条插值。
          -->
          <McTabbarLottieIcon :name="item.name" :active="item.name === current" />
          <view v-if="item.name === 'conversations' && badgeText" class="mc-tabbar__badge">
            <text class="mc-tabbar__badge-text">{{ badgeText }}</text>
          </view>
        </view>
        <text class="mc-tabbar__text">{{ item.text }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue"
import { onShow } from "@dcloudio/uni-app"
import { subscribeConversationTabBadge } from "@/services/conversation/conversationTabBadgeService"
import { isDarkThemeMode } from "@/services/theme"
import McTabbarLottieIcon from "@/components/McTabbarLottieIcon.vue"

type TabName = "connections" | "conversations" | "tasks" | "circles" | "profile"

/**
 * 没有 `icon` 字段：图标改由 `McTabbarLottieIcon` 按 `name` 载入对应的 Lottie 动画，
 * 原来那些 u-icon 名字（`grid-fill` 之类）已经没有消费者，留着只会误导后人。
 */
interface TabItem {
  name: TabName
  text: string
  path: string
}

const props = withDefaults(
  defineProps<{
    current: TabName
    /** 未激活项的文字与图标色。设计稿浅色 #8E8E93 / 深色 #8C8C94。 */
    inactiveColor?: string
    hidden?: boolean
  }>(),
  {
    inactiveColor: "#8E8E93",
    hidden: false,
  }
)

/**
 * 顺序与 `pages.json` 的 `tabBar.list` **必须**一致 —— 角标接口按索引定位，
 * 一旦这里的顺序和配置错位，未读数就会长到别的 tab 上。
 */
const tabs: TabItem[] = [
  { name: "connections", text: "连接", path: "/pages/connections/index" },
  { name: "conversations", text: "会话", path: "/pages/conversations/index" },
  { name: "tasks", text: "任务", path: "/pages/tasks/index" },
  { name: "circles", text: "圈子", path: "/pages/circles/index" },
  { name: "profile", text: "我的", path: "/pages/profile/index" },
]

/**
 * 角标由组件**自己**订阅，不从页面 props 传。
 *
 * 计数器的权威副本活在 `conversationTabBadgeService` 里（它由 `App.vue` 的
 * `onLaunch` 驱动、与任何页面无关）。如果改成页面传 props，5 个页面就都要各自 import
 * 并转发一次，等于把同一份订阅抄 5 遍，还多一处可能忘记加的地方。
 */
const badgeCount = ref(0)
let disposeBadge: (() => void) | null = null

/**
 * 压掉原生 tabBar。
 *
 * 为什么放在组件里而不是各页 `onShow`：uni-app 的 `onShow` 在**组件内**同样生效（走的是
 * 页面实例的事件总线），所以挂一次就等于 5 个 tab 页各自都有 —— 比在 5 个页面各抄一遍
 * `uni.hideTabBar()` 更不容易漏。`switchTab` 会把原生栏重新显示出来，因此每次都得压。
 *
 * `animation: false` 是关键：默认的滑落动画会在切 tab 时露出一条白边闪一下。
 */
function hideNativeTabBar() {
  uni.hideTabBar?.({ animation: false, fail: () => {} })
}

/** 未激活项配色：设计稿浅色 #8E8E93 / 深色 #8C8C94。 */
const resolvedInactiveColor = ref(props.inactiveColor)

function refreshThemeColor() {
  resolvedInactiveColor.value = isDarkThemeMode() ? "#8C8C94" : props.inactiveColor
}

onMounted(() => {
  disposeBadge = subscribeConversationTabBadge((count: number) => {
    badgeCount.value = count
  })
  hideNativeTabBar()
  refreshThemeColor()
})

onShow(() => {
  hideNativeTabBar()
  refreshThemeColor()
})

onUnmounted(() => {
  disposeBadge?.()
  disposeBadge = null
})

const badgeText = computed(() => {
  const count = Math.floor(Number(badgeCount.value) || 0)
  if (count <= 0) return ""
  return count > 99 ? "99+" : String(count)
})

function handleSwitch(item: TabItem) {
  if (item.name === props.current) return
  uni.switchTab({ url: item.path })
}
</script>

<style scoped lang="scss">
/*
 * 几何全部来自设计稿「底部导航」节点（393 宽基准）：
 *   外层 padding 0 21 / 12 / 14（下内距 14 是设计稿 21 收窄后的值，贴底一些），
 *   导航条 radius 36 + 1px rgba(0,0,0,.06) 描边 + padding 4，
 *   单 item 高 54（= 62 - 4*2），激活项 radius 30。
 * 单位用 px 而不是 rpx：底栏在所有机型上都应保持同样的物理尺寸密度，rpx 会在窄屏上把
 * 10px 的文字压到不可读。
 *
 * **下内距与页面留白是一对**：胶囊占据的高度 = 12 + 62 + 下内距，改动这里必须同步改
 * 5 个 tab 页的「页面底部留白」（见 `mcodeTabbarWiring.spec.ts` 的留白断言），否则
 * 胶囊会盖住最后一行内容。
 */
.mc-tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  padding: 12px 21px calc(14px + env(safe-area-inset-bottom));
  pointer-events: none;

  &--hidden {
    display: none;
  }

  &__bar {
    display: flex;
    align-items: stretch;
    height: 62px;
    padding: 4px;
    border-radius: 36px;
    /*
     * 磨砂玻璃：底色只给到 72%，剩下的交给 backdrop-filter 把身后滚过的列表糊进来。
     * 留 1px 描边是因为半透明底在浅色内容上会「化掉」，没有边就分不清胶囊的轮廓。
     *
     * `overflow` 与 `isolation` 这两条是 iOS 的必修项：模糊与圆角同用时，背景会从
     * 圆角外侧溢出一条毛边，靠它们裁掉。缺了在 Safari/WKWebView 上肉眼可见，
     * Chrome 上则看不出来 —— 所以只靠 H5 预览会漏掉这个缺陷。
     *
     * 注释里刻意不写这两条属性的**完整声明**：契约测试要对它们做 toContain 断言，
     * 注释里出现同名完整值会让断言在属性被删掉时照样通过（上一轮就在
     * `animation: false` 上栽过一次）。
     */
    background: rgba(255, 255, 255, 0.72);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(0, 0, 0, 0.06);
    box-sizing: border-box;
    pointer-events: auto;
    overflow: hidden;
    isolation: isolate;
  }

  &__item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    border-radius: 30px;
    transition: background-color 0.18s ease;
  }

  &__item--active {
    background: #1c1c1f;
  }

  &__icon {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
  }

  &__badge {
    position: absolute;
    top: -5px;
    right: -9px;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    border-radius: 7px;
    background: #ff3b30;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
  }

  &__badge-text {
    font-size: 9px;
    line-height: 1;
    font-weight: 500;
    color: #ffffff;
  }

  &__text {
    font-size: 10px;
    line-height: 1;
    font-weight: 400;
    color: v-bind(resolvedInactiveColor);
  }

  &__item--active &__text {
    font-weight: 500;
    color: #ffffff;
  }
}

/*
 * 深色取设计稿深色板：导航条 #1C1C1E、激活项 #3A3A3C、未激活 #8C8C94。
 * 判据是 `[data-up-theme='dark']`，不是 `prefers-color-scheme` —— 项目的深色由 uview 按
 * 用户在 app 里的偏好写到 `<html data-up-theme>`，与系统设置不是同一来源。
 */
[data-up-theme='dark'] {
  /* 深色下不透明度给到 75%：深色底本身更沉，再稀就压不住身后亮内容的穿透。 */
  .mc-tabbar__bar {
    background: rgba(28, 28, 30, 0.75);
    border-color: rgba(255, 255, 255, 0.08);
  }

  /*
   * 激活项在这两种模式下都保持**实心**块（浅色 #1C1C1F / 深色 #3A3A3C）。
   * 磨砂让胶囊整体变通透了，激活标记若也跟着半透明，白色填充图标压在浅色磨砂上
   * 会发灰、边界糊掉。实心块同时保证了动画的白色末帧始终有足够对比。
   */
  .mc-tabbar__item--active {
    background: #3a3a3c;
  }

  .mc-tabbar__text {
    color: #8c8c94;
  }

  .mc-tabbar__item--active .mc-tabbar__text {
    color: #ffffff;
  }
}
</style>
