<template>
  <view
    class="detail-body"
    :class="[
      detailTheme !== 'default' && `detail-body--theme-${detailTheme}`,
      detailTheme === 'matrix' && 'detail-body--cyber',
      detailTheme === 'matrix' && cyberActive && 'detail-body--cyber-active',
      detailTheme === 'matrix' && cyberActive && `detail-body--${cyberEffectPhase || 'idle'}`,
      detailTheme === 'sweet' && `detail-body--sweet-${cyberEffectPhase || 'idle'}`,
    ]"
  >
    <scroll-view
      class="message-list"
      :style="messageListPageStyle"
      scroll-y
      :scroll-top="messageScrollTop"
      :scroll-into-view="messageScrollIntoView"
      :scroll-with-animation="messageScrollWithAnimation"
      :upper-threshold="upperThreshold"
      :refresher-enabled="refresherEnabled"
      :refresher-triggered="refresherTriggered"
      :refresher-threshold="refresherThreshold"
      refresher-default-style="none"
      refresher-background="transparent"
      @scroll="emit('message-scroll', $event)"
      @scrolltoupper="emit('message-scroll-upper')"
      @refresherrefresh="emit('refresher-refresh')"
      @refresherpulling="emit('refresher-pulling', $event)"
      @refresherrestore="emit('refresher-restore')"
      @refresherabort="emit('refresher-abort')"
    >
      <view class="message-list__content" :style="messageListContentStyle">
        <slot name="history"></slot>
        <slot name="content"></slot>
      </view>
    </scroll-view>
    <view class="composer-safe-area"></view>
    <view class="composer-stack">
      <view
        v-if="statusAreaRendered"
        :class="[
          'input-status-wrap',
          translucentMessageList && 'input-status-wrap--translucent',
          `input-status-wrap--status-${resolvedRuntimeStatusClass}`,
          `input-status-wrap--runtime-${resolvedRuntimeStatus}`,
        ]"
      >
        <view class="input-status-wrap__content">
          <slot name="status"></slot>
        </view>
      </view>
      <view
        :class="[
          'input-wrap',
          translucentMessageList && 'input-wrap--translucent',
          bareComposer && 'input-wrap--bare',
        ]"
      >
        <slot name="composer"></slot>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type StyleValue } from "vue"
import type { CyberEffectPhase, DetailThemeId } from "./detailCyberMode"

const props = defineProps<{
  messageListPageStyle?: StyleValue
  messageListContentStyle?: StyleValue
  /**
   * 输入区是否**不带卡片外壳**。
   *
   * 设计稿 M09 / M10 的输入区三件套是直接铺在纸面上的：加号是独立的白色圆形、
   * 输入框是浅灰圆角条、发送键是深色方块，三者之间没有共同的容器 —— 也没有
   * 容器底色、描边、圆角和阴影。旧实现把它们包在一张 76% 白卡片里，视觉上多出
   * 一圈「输入区卡片」，左右还叠了 16rpx + 12px 两层内距，整体比设计稿窄且更重。
   *
   * 默认主题取 true；cyber / sweet / summer 三套实验主题保留原来的卡片形制，
   * 所以这里做成开关而不是直接改基础样式。
   */
  bareComposer?: boolean
  /**
   * 输入区上方那块状态区（状态胶囊 / 传输横幅）是否整体渲染。
   *
   * 只关状态胶囊时这里仍可能为 true（还有传输横幅要显示），所以它表示的是
   * 「这块区域还有没有内容」，而不是「胶囊开关」本身 —— 否则关掉胶囊会留下一枚
   * 空的胶囊壳（`min-height` + 内距 + 边框都还在）。
   */
  statusAreaVisible?: boolean
  translucentMessageList?: boolean
  messageScrollTop?: number
  messageScrollIntoView?: string
  messageScrollWithAnimation?: boolean
  upperThreshold?: number
  // 下拉刷新（加载更早历史）。`refresher-default-style="none"` + `#history` 插槽
  // 把 uni 自带的绿色转圈换成我们自己的行内指示器，见
  // detailHistoryIndicatorPresentation.ts。
  refresherEnabled?: boolean
  refresherTriggered?: boolean
  refresherThreshold?: number
  detailTheme?: DetailThemeId
  cyberEffectPhase?: CyberEffectPhase
  cyberActive?: boolean
  runtimeStatusClass?: string
  runtimeStatus?: string
}>()

const resolvedRuntimeStatusClass = computed(() =>
  String(props.runtimeStatusClass || 'idle').replace(/_/g, '-')
)
const resolvedRuntimeStatus = computed(() =>
  String(props.runtimeStatus || 'idle').replace(/_/g, '-')
)
// 缺省 true：只有调用方显式传 false 才收起整块状态区。
// 用另一个名字承载，避免和同名 prop 在模板里互相遮蔽。
const statusAreaRendered = computed(() => props.statusAreaVisible !== false)

const emit = defineEmits<{
  (event: "message-scroll", payload: unknown): void
  (event: "message-scroll-upper"): void
  (event: "refresher-refresh"): void
  (event: "refresher-pulling", payload: unknown): void
  (event: "refresher-restore"): void
  (event: "refresher-abort"): void
}>()
</script>

<style scoped lang="scss">
.detail-body {
  position: relative;
  height: 100%;
  min-height: 100%;
  overflow: hidden;
}

.message-list {
  box-sizing: border-box;
  padding-left: 0;
  padding-right: 0;
  width: 100%;
  max-width: 920rpx;
  margin: 0 auto;
  overflow: hidden;
}

.message-list__content {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  /*
   * 保持 `content-box`：`min-height: 100%` 的语义是「内容区至少一屏」，
   * 底部给输入区留的那段 `paddingBottom`（行内样式注入）要在内容之外另加，
   * 改成 `border-box` 会让最后一条消息被输入区压住。
   */
  box-sizing: content-box;
  /* 设计稿消息区内距（节点 9:152）：左右 16px、上 12px */
  padding: 12px 16px 0;
}

.composer-stack {
  position: absolute;
  left: 50%;
  /* 设计稿输入区左右各留 12px（`input-main-row` 的 padding），这里不再额外加宽 */
  width: 100%;
  bottom: calc(env(safe-area-inset-bottom) + 10rpx);
  z-index: 30;
  max-width: 920rpx;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10rpx;
}

.composer-safe-area {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: calc(env(safe-area-inset-bottom) + 12rpx);
  z-index: 29;
  pointer-events: none;
  background: transparent;
}

.input-status-wrap {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  width: auto;
  max-width: 100%;
  padding: 2rpx;
  border-radius: 999rpx;
  background: transparent;
  border: 0;
  box-shadow: 0 8rpx 20rpx rgba(15, 23, 42, 0.04);
  backdrop-filter: blur(16rpx);
  box-sizing: border-box;
}

.input-status-wrap::before,
.input-status-wrap::after {
  content: "";
  position: absolute;
  pointer-events: none;
}

.input-status-wrap::before {
  inset: -42rpx;
  z-index: 0;
  background:
    conic-gradient(
      from 0deg,
      transparent 0deg,
      color-mix(in srgb, var(--up-primary, #2979ff) 18%, transparent 82%) 48deg,
      color-mix(in srgb, var(--up-primary, #2979ff) 74%, transparent 26%) 86deg,
      transparent 130deg,
      transparent 210deg,
      color-mix(in srgb, var(--up-success, #19be6b) 46%, transparent 54%) 262deg,
      transparent 318deg,
      transparent 360deg
    );
  opacity: 0.72;
}

.input-status-wrap::after {
  inset: 2rpx;
  z-index: 0;
  border-radius: inherit;
  background: color-mix(in srgb, var(--up-page-bg-color, var(--up-bg-color, #f5f6f8)) 90%, transparent 10%);
  border: 1rpx solid color-mix(in srgb, var(--up-border-color, #dadbde) 42%, transparent 58%);
  box-shadow: inset 0 0 10rpx color-mix(in srgb, var(--up-primary, #2979ff) 7%, transparent 93%);
  backdrop-filter: blur(16rpx);
}

.input-status-wrap__content {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  max-width: 100%;
  min-height: 30rpx;
  padding: 8rpx 12rpx;
  border-radius: inherit;
  overflow: hidden;
  box-sizing: border-box;
}

:deep(.input-status-row) {
  position: relative;
  z-index: 1;
}

.input-status-wrap--translucent {
  backdrop-filter: blur(10rpx);
}

.input-status-wrap--translucent::after {
  background: color-mix(in srgb, var(--up-card-bg-color, #ffffff) 38%, transparent 62%);
  border-color: color-mix(in srgb, var(--up-border-color, #dadbde) 34%, transparent 66%);
  backdrop-filter: blur(10rpx);
}

/*
 * 默认主题的边框旋转跑马灯。
 *
 * 图层机制与 cyber 完全一致：`::before` 是一整块 conic-gradient，`::after` 用实色面板
 * 盖住中心只露出 2rpx 边缘，所以旋转 `::before` 看起来就是「一段高光沿边框跑」。
 * 之所以挂在 `--status-*` 而不是 `--cyber-active`：`cyberActive` 在 InteractivePane 里是
 * `detailTheme === 'matrix' && active`，非 matrix 主题恒为 false，默认主题拿不到那个类。
 *
 * 排在 cyber 规则之前：cyber 侧选择器都带 `.detail-body--cyber-active`（两个类），
 * 权重更高，颜色/时长/停转覆盖不受影响。
 */
.input-status-wrap--status-running::before,
.input-status-wrap--status-pending::before {
  /*
   * 基础态的 74% 混色 + 0.72 不透明度在浅色页面上几乎读不出「在转」（实测边框最亮点与
   * 静止段亮度差不到 6/255）。旋转态单独把高光段拉满，静止态外观保持不变。
   */
  background:
    conic-gradient(
      from 0deg,
      transparent 0deg,
      color-mix(in srgb, var(--up-primary, #2979ff) 24%, transparent 76%) 42deg,
      var(--up-primary, #2979ff) 84deg,
      color-mix(in srgb, var(--up-success, #19be6b) 72%, transparent 28%) 120deg,
      transparent 162deg,
      transparent 232deg,
      color-mix(in srgb, var(--up-primary, #2979ff) 54%, transparent 46%) 286deg,
      transparent 332deg,
      transparent 360deg
    );
  opacity: 0.92;
  animation: inputStatusLedSpin 1.55s linear infinite;
}

.input-status-wrap--status-pending::before {
  animation-duration: 2.4s;
}

/* 非活跃态别转，避免空闲时一直有个光点在跑。 */
.input-status-wrap--status-idle::before,
.input-status-wrap--status-online::before,
.input-status-wrap--status-error::before {
  animation: none;
}

.detail-body--cyber .input-status-wrap {
  box-shadow: 0 0 0 1rpx rgba(0, 255, 65, 0.08), 0 0 28rpx rgba(0, 255, 65, 0.1);
}

.detail-body--cyber-active .input-status-wrap::before {
  background:
    conic-gradient(
      from 0deg,
      transparent 0deg,
      rgba(0, 255, 65, 0.12) 34deg,
      rgba(141, 255, 180, 0.98) 72deg,
      transparent 118deg,
      transparent 194deg,
      rgba(0, 255, 65, 0.5) 244deg,
      rgba(186, 255, 200, 0.9) 284deg,
      transparent 330deg,
      transparent 360deg
    );
  opacity: 0.95;
  animation: inputStatusLedSpin 1.55s linear infinite;
}

.detail-body--cyber:not(.detail-body--cyber-active) .input-status-wrap::before {
  transform: rotate(72deg);
}

.detail-body--cyber .input-status-wrap::after {
  background:
    linear-gradient(90deg, rgba(0, 255, 65, 0.035) 1rpx, transparent 1rpx),
    rgba(0, 15, 5, 0.92);
  background-size: 28rpx 28rpx, auto;
  border-color: rgba(0, 255, 65, 0.24);
  box-shadow: inset 0 0 18rpx rgba(0, 255, 65, 0.08);
}

.detail-body--cyber-active.detail-body--ramp .input-status-wrap::before,
.detail-body--cyber-active.detail-body--streaming .input-status-wrap::before {
  animation-duration: 0.95s;
}

.detail-body--cyber-active
  .input-status-wrap--status-idle::before,
.detail-body--cyber-active
  .input-status-wrap--status-online::before {
  opacity: 0.3;
  transform: rotate(72deg);
  animation: none;
}

.detail-body--cyber-active .input-status-wrap--status-pending::before {
  background:
    conic-gradient(
      from 0deg,
      transparent 0deg,
      rgba(255, 214, 102, 0.62) 78deg,
      transparent 132deg,
      transparent 224deg,
      rgba(255, 173, 51, 0.3) 286deg,
      transparent 342deg,
      transparent 360deg
    );
  opacity: 0.74;
  animation-duration: 2.4s;
}

.detail-body--cyber-active
  .input-status-wrap--runtime-thinking
  :deep(.input-status-row__text) {
  animation: cyberStatusTextFlicker 2.6s steps(1, end) infinite;
}

.detail-body--cyber-active
  .input-status-wrap--runtime-running-tool
  :deep(.input-status-row__text) {
  animation: cyberStatusTextFlicker 1.45s steps(1, end) infinite;
}

.detail-body--cyber-active
  .input-status-wrap--runtime-thinking
  :deep(.runtime-dot) {
  background-color: #8dffb4;
  box-shadow:
    0 0 0 3rpx rgba(141, 255, 180, 0.14),
    0 0 14rpx rgba(0, 255, 65, 0.44);
  animation: cyberStatusDotPulse 1.55s ease-in-out infinite;
}

.detail-body--cyber-active
  .input-status-wrap--runtime-running-tool
  :deep(.runtime-dot) {
  background-color: #00ff41;
  box-shadow:
    0 0 0 3rpx rgba(0, 255, 65, 0.16),
    0 0 18rpx rgba(0, 255, 65, 0.62);
  animation: cyberStatusDotPulse 0.86s ease-in-out infinite;
}

.detail-body--cyber-active
  .input-status-wrap--status-pending
  :deep(.runtime-dot) {
  background-color: #ffd166;
  box-shadow:
    0 0 0 3rpx rgba(255, 209, 102, 0.14),
    0 0 12rpx rgba(255, 173, 51, 0.38);
  animation: cyberStatusDotPulse 2.2s ease-in-out infinite;
}

.detail-body--cyber-active .input-status-wrap--status-error::before {
  background:
    conic-gradient(
      from 0deg,
      transparent 0deg,
      rgba(255, 83, 112, 0.7) 72deg,
      transparent 126deg,
      transparent 220deg,
      rgba(255, 83, 112, 0.34) 286deg,
      transparent 340deg,
      transparent 360deg
    );
  opacity: 0.72;
  animation: none;
}

.detail-body--cyber-active
  .input-status-wrap--status-error
  :deep(.runtime-dot) {
  background-color: #ff5370;
  box-shadow: 0 0 0 3rpx rgba(255, 83, 112, 0.16), 0 0 14rpx rgba(255, 83, 112, 0.5);
  animation: none;
}

.detail-body--cyber-active
  .input-status-wrap--status-error
  :deep(.input-status-row__text) {
  color: #ff9aaa !important;
  text-shadow: 0 0 12rpx rgba(255, 83, 112, 0.42);
  animation: none;
}

@keyframes cyberStatusDotPulse {
  0%,
  100% {
    transform: scale(0.82);
    opacity: 0.72;
  }
  46% {
    transform: scale(1.18);
    opacity: 1;
  }
  62% {
    transform: scale(0.98);
    opacity: 0.92;
  }
}

@keyframes cyberStatusTextFlicker {
  0%,
  100% {
    opacity: 1;
    text-shadow: 0 0 12rpx rgba(0, 255, 65, 0.34);
  }
  8% {
    opacity: 0.68;
    text-shadow: 0 0 4rpx rgba(0, 255, 65, 0.16);
  }
  10% {
    opacity: 1;
    text-shadow: 0 0 14rpx rgba(141, 255, 180, 0.52);
  }
  54% {
    opacity: 0.86;
  }
  56% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .input-status-wrap,
  .input-status-wrap::before,
  :deep(.input-status-row__text),
  :deep(.input-status-row .runtime-dot) {
    animation: none !important;
  }
}

@keyframes inputStatusLedSpin {
  to {
    transform: rotate(360deg);
  }
}

.input-wrap {
  width: 100%;
  background: color-mix(in srgb, var(--up-card-bg-color, #ffffff) 76%, transparent 24%);
  border: 1rpx solid color-mix(in srgb, var(--up-border-color, #dadbde) 64%, transparent 36%);
  border-radius: 30rpx;
  padding: 14rpx 16rpx 16rpx;
  box-shadow: 0 -2rpx 18rpx rgba(15, 23, 42, 0.025), 0 14rpx 36rpx rgba(15, 23, 42, 0.07);
  backdrop-filter: blur(20rpx);
  box-sizing: border-box;
}

/*
 * 设计稿（M09 / M10）形制：输入区**没有外壳**。
 *
 * 三件套自己就是完整的形状 —— 白色圆形加号、浅灰圆角输入框、深色圆角发送键，
 * 直接铺在纸面上。外壳（底色 + 描边 + 30rpx 圆角 + 阴影 + 内距）会把它们又包成
 * 一张「输入卡片」，是设计稿里不存在的一层；同时外层 16rpx 内距叠上内层
 * `input-main-row` 的 12px 内距，输入框会被压窄两倍。
 *
 * 内距归零而不是设成别的值：整行的 12/12/8/8 由 `input-main-row` 单独负责，
 * 两处都写会让「设计稿数值 vs 实际留白」对不上。
 */
.input-wrap--bare {
  background: none;
  border: 0;
  border-radius: 0;
  padding: 0;
  box-shadow: none;
  backdrop-filter: none;
}

.input-wrap--translucent {
  background: color-mix(in srgb, var(--up-card-bg-color, #ffffff) 38%, transparent 62%);
  border: 1rpx solid color-mix(in srgb, var(--up-border-color, #dadbde) 34%, transparent 66%);
  backdrop-filter: blur(12rpx);
}

/* 自定义背景图时仍然要半透明层次，但不要那层外壳描边。 */
.input-wrap--translucent.input-wrap--bare {
  background: none;
  border: 0;
  backdrop-filter: none;
}
</style>
