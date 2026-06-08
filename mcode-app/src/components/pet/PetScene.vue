<template>
  <view class="pet-scene">
    <view
      v-for="(dec, index) in decorations"
      :key="`${dec}-${index}`"
      class="pet-scene__decoration"
      :class="`pet-scene__decoration--${dec}`"
    >
      <!-- zzz: floating Z characters -->
      <template v-if="dec === 'zzz'">
        <text class="pet-scene__zzz pet-scene__zzz--1">Z</text>
        <text class="pet-scene__zzz pet-scene__zzz--2">Z</text>
        <text class="pet-scene__zzz pet-scene__zzz--3">Z</text>
      </template>

      <!-- snack: small cookie/snack indicator -->
      <view v-else-if="dec === 'snack'" class="pet-scene__snack" />

      <!-- crumbs: tiny scattered particles -->
      <template v-else-if="dec === 'crumbs'">
        <view class="pet-scene__crumb pet-scene__crumb--1" />
        <view class="pet-scene__crumb pet-scene__crumb--2" />
        <view class="pet-scene__crumb pet-scene__crumb--3" />
      </template>

      <!-- ball: bouncing ball -->
      <view v-else-if="dec === 'ball'" class="pet-scene__ball" />

      <!-- sparkles: star-like sparkle shapes -->
      <template v-else-if="dec === 'sparkles'">
        <text class="pet-scene__sparkle pet-scene__sparkle--1">✦</text>
        <text class="pet-scene__sparkle pet-scene__sparkle--2">✦</text>
        <text class="pet-scene__sparkle pet-scene__sparkle--3">✦</text>
      </template>

      <!-- sweat: small sweat drop -->
      <view v-else-if="dec === 'sweat'" class="pet-scene__sweat" />

      <!-- heart: floating hearts for dream / happy -->
      <template v-else-if="dec === 'heart'">
        <text class="pet-scene__heart pet-scene__heart--1">♥</text>
        <text class="pet-scene__heart pet-scene__heart--2">♥</text>
      </template>

      <!-- thought: thought bubble for curious -->
      <view v-else-if="dec === 'thought'" class="pet-scene__thought">
        <view class="pet-scene__thought-dot pet-scene__thought-dot--1" />
        <view class="pet-scene__thought-dot pet-scene__thought-dot--2" />
        <view class="pet-scene__thought-bubble">
          <text class="pet-scene__thought-mark">?</text>
        </view>
      </view>

      <!-- music: musical notes for happy-dance -->
      <template v-else-if="dec === 'music'">
        <text class="pet-scene__note pet-scene__note--1">♪</text>
        <text class="pet-scene__note pet-scene__note--2">♫</text>
      </template>

      <!-- confetti: colourful scattered pieces -->
      <template v-else-if="dec === 'confetti'">
        <view class="pet-scene__confetti pet-scene__confetti--1" />
        <view class="pet-scene__confetti pet-scene__confetti--2" />
        <view class="pet-scene__confetti pet-scene__confetti--3" />
        <view class="pet-scene__confetti pet-scene__confetti--4" />
        <view class="pet-scene__confetti pet-scene__confetti--5" />
      </template>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { SceneDecoration } from '@/types/petMotion'

defineProps<{
  decorations: SceneDecoration[]
}>()
</script>

<style lang="scss" scoped>
.pet-scene {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;

  &__decoration {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }

  // ── ZZZ ──
  &__zzz {
    position: absolute;
    right: -8rpx;
    font-size: 20rpx;
    font-weight: bold;
    color: var(--up-tips-color, #909193);
    opacity: 0;
    animation: zzz-float 2.2s ease-out infinite;

    &--1 { top: -16rpx; animation-delay: 0s; }
    &--2 { top: -30rpx; animation-delay: 0.55s; font-size: 16rpx; }
    &--3 { top: -42rpx; animation-delay: 1.1s; font-size: 12rpx; }
  }

  // ── Snack ──
  &__snack {
    position: absolute;
    bottom: 4rpx;
    right: -4rpx;
    width: 14rpx;
    height: 14rpx;
    border-radius: 50%;
    background: #f59e0b;
    animation: snack-bob 1s ease-in-out infinite;
  }

  // ── Crumbs ──
  &__crumb {
    position: absolute;
    bottom: 0;
    width: 6rpx;
    height: 6rpx;
    border-radius: 50%;
    background: #d97706;
    opacity: 0;
    animation: crumb-fall 1s ease-out forwards;

    &--1 { left: 20rpx; animation-delay: 0.1s; }
    &--2 { left: 30rpx; animation-delay: 0.3s; }
    &--3 { left: 10rpx; animation-delay: 0.5s; }
  }

  // ── Ball ──
  &__ball {
    position: absolute;
    top: -12rpx;
    left: 50%;
    width: 18rpx;
    height: 18rpx;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, #60a5fa, #3b82f6);
    animation: ball-bounce 0.8s ease-in-out infinite alternate;
  }

  // ── Sparkles ──
  &__sparkle {
    position: absolute;
    font-size: 16rpx;
    color: #fbbf24;
    opacity: 0;
    animation: sparkle-pop 0.8s ease-out forwards;

    &--1 { top: -20rpx; left: 10rpx; animation-delay: 0s; }
    &--2 { top: -28rpx; left: 28rpx; animation-delay: 0.15s; font-size: 20rpx; }
    &--3 { top: -16rpx; left: 44rpx; animation-delay: 0.3s; font-size: 14rpx; }
  }

  // ── Sweat ──
  &__sweat {
    position: absolute;
    top: -6rpx;
    right: -8rpx;
    width: 10rpx;
    height: 14rpx;
    border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
    background: radial-gradient(circle at 30% 30%, #93c5fd, #60a5fa);
    opacity: 0.8;
    animation: sweat-drop 1.5s ease-in-out infinite;
  }

  // ── Heart ──
  &__heart {
    position: absolute;
    font-size: 18rpx;
    color: #f43f5e;
    opacity: 0;
    animation: heart-float 2s ease-out infinite;

    &--1 { top: -18rpx; left: 6rpx; animation-delay: 0s; }
    &--2 { top: -28rpx; left: 22rpx; animation-delay: 0.7s; font-size: 14rpx; color: #fb7185; }
  }

  // ── Thought bubble ──
  &__thought {
    position: absolute;
    top: -44rpx;
    right: -6rpx;

    &-dot {
      position: absolute;
      border-radius: 50%;
      background: var(--up-tips-color, #909193);

      &--1 {
        width: 5rpx; height: 5rpx;
        bottom: 0; right: 12rpx;
        animation: thought-appear 0.3s ease-out 0.1s both;
      }
      &--2 {
        width: 7rpx; height: 7rpx;
        bottom: 6rpx; right: 6rpx;
        animation: thought-appear 0.3s ease-out 0.2s both;
      }
    }

    &-bubble {
      position: absolute;
      bottom: 14rpx;
      right: 0;
      width: 30rpx;
      height: 26rpx;
      border-radius: 50%;
      background: var(--up-card-bg-color, #ffffff);
      border: 2rpx solid var(--up-border-color, #dadbde);
      display: flex;
      align-items: center;
      justify-content: center;
      animation: thought-appear 0.4s ease-out 0.35s both;
    }

    &-mark {
      font-size: 16rpx;
      font-weight: bold;
      color: var(--up-content-color, #606266);
      line-height: 1;
    }
  }

  // ── Music notes ──
  &__note {
    position: absolute;
    font-size: 18rpx;
    color: #a855f7;
    opacity: 0;
    animation: note-float 1.8s ease-out infinite;

    &--1 { top: -22rpx; left: 4rpx; animation-delay: 0s; }
    &--2 { top: -30rpx; left: 20rpx; animation-delay: 0.6s; font-size: 14rpx; }
  }

  // ── Confetti ──
  &__confetti {
    position: absolute;
    width: 8rpx;
    height: 8rpx;
    border-radius: 2rpx;
    opacity: 0;
    animation: confetti-burst 1.2s ease-out forwards;

    &--1 { background: #f43f5e; top: 10rpx; left: 10rpx; animation-delay: 0s; }
    &--2 { background: #3b82f6; top: 8rpx; left: 26rpx; animation-delay: 0.1s; border-radius: 50%; }
    &--3 { background: #22c55e; top: 12rpx; left: 40rpx; animation-delay: 0.2s; }
    &--4 { background: #fbbf24; top: 6rpx; left: 18rpx; animation-delay: 0.15s; border-radius: 50%; }
    &--5 { background: #a855f7; top: 14rpx; left: 32rpx; animation-delay: 0.05s; }
  }
}

// ── Keyframes ──

@keyframes zzz-float {
  0% { transform: translateY(0) scale(0.6); opacity: 0; }
  20% { opacity: 0.8; }
  80% { opacity: 0.6; }
  100% { transform: translateY(-40rpx) translateX(10rpx) scale(1); opacity: 0; }
}

@keyframes snack-bob {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-4rpx) scale(1.08); }
}

@keyframes crumb-fall {
  0% { transform: translateY(0) scale(1); opacity: 0.9; }
  100% { transform: translateY(20rpx) scale(0.4); opacity: 0; }
}

@keyframes ball-bounce {
  0% { transform: translateX(-50%) translateY(0) scale(1); }
  100% { transform: translateX(-50%) translateY(-16rpx) scale(1.1); }
}

@keyframes sparkle-pop {
  0% { transform: scale(0) rotate(0deg); opacity: 0; }
  40% { transform: scale(1.3) rotate(180deg); opacity: 1; }
  100% { transform: scale(0.8) rotate(360deg); opacity: 0; }
}

@keyframes sweat-drop {
  0%, 100% { transform: translateY(0); opacity: 0.8; }
  50% { transform: translateY(4rpx); opacity: 0.4; }
}

@keyframes heart-float {
  0% { transform: translateY(0) scale(0.5); opacity: 0; }
  25% { opacity: 1; transform: translateY(-8rpx) scale(1.1); }
  80% { opacity: 0.7; }
  100% { transform: translateY(-36rpx) scale(0.8); opacity: 0; }
}

@keyframes thought-appear {
  0% { transform: scale(0); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

@keyframes note-float {
  0% { transform: translateY(0) rotate(-10deg) scale(0.7); opacity: 0; }
  20% { opacity: 0.9; }
  80% { opacity: 0.7; }
  100% { transform: translateY(-32rpx) rotate(10deg) scale(1); opacity: 0; }
}

@keyframes confetti-burst {
  0% { transform: translate(0, 0) rotate(0deg) scale(1); opacity: 1; }
  60% { opacity: 1; }
  100% { transform: translate(var(--tx, 20rpx), 40rpx) rotate(360deg) scale(0.3); opacity: 0; }
}
</style>
