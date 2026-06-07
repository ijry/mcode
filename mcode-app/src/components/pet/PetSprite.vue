<template>
  <view
    class="pet-sprite"
    :class="[
      `pet-sprite--${emotion}`,
      `pet-sprite--${size}`,
      interaction === 'none' ? '' : `pet-sprite--interaction-${interaction}`,
      motion ? `pet-sprite--motion-${motion}` : '',
    ]"
    :style="spriteStyle"
  >
    <image
      :src="spriteSrc"
      mode="aspectFit"
      class="pet-sprite__base"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'
import type { EmotionState, SpeciesId } from '@/types/pet'
import petSpriteSheet from '@/static/pets/sprites.svg?raw'

const props = withDefaults(defineProps<{
  species: SpeciesId
  emotion: EmotionState
  skinId?: string
  size?: 'small' | 'normal' | 'large'
  interaction?: 'none' | 'tap' | 'excited'
  motion?: string | null
}>(), {
  skinId: 'default',
  size: 'normal',
  interaction: 'none',
  motion: null,
})

const AVAILABLE_FOX_EMOTIONS: EmotionState[] = [
  'idle', 'sleeping', 'curious', 'busy', 'alert', 'happy', 'sad', 'excited', 'bored'
]

const SYMBOL_PATTERN = /<symbol\s+id="([^"]+)"\s+viewBox="([^"]+)"[^>]*>([\s\S]*?)<\/symbol>/g
const INLINE_SVG_PREFIX = '<svg'

function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

function buildSpriteSources(sheet: string): Record<string, string> {
  const sources: Record<string, string> = {}

  for (const match of sheet.matchAll(SYMBOL_PATTERN)) {
    const [, symbolId, viewBox, content] = match
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${content}</svg>`
    sources[symbolId] = svgToDataUri(svg)
  }

  return sources
}

const initialSpriteSources = petSpriteSheet.trimStart().startsWith(INLINE_SVG_PREFIX)
  ? buildSpriteSources(petSpriteSheet)
  : {}
const spriteSources = shallowRef<Record<string, string>>(initialSpriteSources)
let spriteSourcesPromise: Promise<Record<string, string>> | null = null

async function resolveSpriteSheetText(source: string): Promise<string> {
  if (source.trimStart().startsWith(INLINE_SVG_PREFIX)) {
    return source
  }

  if (typeof fetch === 'function') {
    const response = await fetch(source)
    if (!response.ok) {
      throw new Error(`Failed to load pet sprite sheet: ${response.status}`)
    }
    return await response.text()
  }

  if (typeof uni !== 'undefined' && typeof uni.request === 'function') {
    return await new Promise<string>((resolve, reject) => {
      uni.request({
        url: source,
        success: (result) => {
          if (typeof result.data === 'string') {
            resolve(result.data)
            return
          }
          reject(new Error('Pet sprite sheet did not return text content'))
        },
        fail: reject,
      })
    })
  }

  throw new Error('No available loader for pet sprite sheet')
}

async function ensureSpriteSources(): Promise<Record<string, string>> {
  if (Object.keys(spriteSources.value).length > 0) {
    return spriteSources.value
  }

  if (!spriteSourcesPromise) {
    spriteSourcesPromise = resolveSpriteSheetText(petSpriteSheet)
      .then((sheetText) => {
        const sources = buildSpriteSources(sheetText)
        spriteSources.value = sources
        return sources
      })
      .catch((error) => {
        console.error(error)
        return spriteSources.value
      })
  }

  return await spriteSourcesPromise
}

const spriteId = computed(() => {
  const species = props.species
  const emotion = props.emotion

  if (species === 'fox' && AVAILABLE_FOX_EMOTIONS.includes(emotion)) {
    return `${species}-${emotion}`
  }

  return `${species}-idle`
})

const spriteSrc = computed(() => {
  const id = spriteId.value
  return spriteSources.value[id] ?? spriteSources.value[`${props.species}-idle`] ?? ''
})

onMounted(() => {
  if (Object.keys(spriteSources.value).length === 0) {
    void ensureSpriteSources()
  }
})

const sizeMap = {
  small: '64rpx',
  normal: '96rpx',
  large: '240rpx',
}

const spriteStyle = computed(() => ({
  width: sizeMap[props.size],
  height: sizeMap[props.size],
}))
</script>

<style lang="scss" scoped>
.pet-sprite {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;

  &__base {
    width: 100%;
    height: 100%;
  }

  &--idle {
    animation: pet-sway 3s ease-in-out infinite;
  }

  &--sleeping {
    animation: pet-breathe 4s ease-in-out infinite;
    opacity: 0.85;
  }

  &--curious {
    animation: pet-tilt 2s ease-in-out infinite;
  }

  &--busy {
    animation: pet-bounce-fast 0.6s ease-in-out infinite;
  }

  &--alert {
    animation: pet-jump 0.8s ease-in-out infinite;
  }

  &--happy {
    animation: pet-bounce 1s ease-in-out infinite;
  }

  &--sad {
    animation: pet-droop 3s ease-in-out infinite;
    filter: saturate(0.7);
  }

  &--excited {
    animation: pet-spin 1.5s ease-in-out infinite;
  }

  &--bored {
    animation: pet-sway 4s ease-in-out infinite;
    opacity: 0.8;
  }

  &--interaction-tap {
    animation: pet-tap-pop 0.28s ease-out;
  }

  &--interaction-excited {
    animation: pet-tap-burst 0.42s ease-out;
  }

  // ── Motion animation classes ──
  // These override the emotion animation while a motion is active

  &--motion-look-around {
    animation: motion-look-around 3s ease-in-out;
  }

  &--motion-tail-swish {
    animation: motion-tail-swish 2s ease-in-out;
  }

  &--motion-stretch-yawn {
    animation: motion-stretch-yawn 3.5s ease-in-out;
  }

  &--motion-sleep-curl {
    animation: motion-sleep-curl 6s ease-in-out infinite;
  }

  &--motion-sleep-zzz {
    animation: motion-sleep-zzz 5s ease-in-out;
  }

  &--motion-snack-nibble {
    animation: motion-snack-nibble 3.5s ease-in-out;
  }

  &--motion-snack-happy-chew {
    animation: motion-snack-happy-chew 3s ease-in-out;
  }

  &--motion-play-hop {
    animation: motion-play-hop 2.5s ease-in-out;
  }

  &--motion-play-ball {
    animation: motion-play-ball 4s ease-in-out;
  }

  &--motion-self-proud {
    animation: motion-self-proud 3s ease-in-out;
  }
}

@keyframes pet-sway {
  0%, 100% { transform: translateX(0) rotate(0deg); }
  25% { transform: translateX(-4rpx) rotate(-2deg); }
  75% { transform: translateX(4rpx) rotate(2deg); }
}

@keyframes pet-breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.03); }
}

@keyframes pet-tilt {
  0%, 100% { transform: rotate(0deg); }
  30% { transform: rotate(-10deg); }
  60% { transform: rotate(5deg); }
}

@keyframes pet-bounce-fast {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4rpx); }
}

@keyframes pet-jump {
  0%, 100% { transform: translateY(0); }
  40% { transform: translateY(-12rpx); }
  60% { transform: translateY(-12rpx); }
}

@keyframes pet-bounce {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-8rpx) scale(1.05); }
}

@keyframes pet-droop {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(4rpx) rotate(-3deg); }
}

@keyframes pet-spin {
  0% { transform: rotate(0deg) scale(1); }
  25% { transform: rotate(10deg) scale(1.1); }
  50% { transform: rotate(0deg) scale(1); }
  75% { transform: rotate(-10deg) scale(1.1); }
  100% { transform: rotate(0deg) scale(1); }
}

@keyframes pet-tap-pop {
  0% { transform: scale(1); }
  40% { transform: scale(1.12) translateY(-4rpx); }
  100% { transform: scale(1); }
}

@keyframes pet-tap-burst {
  0% { transform: scale(1) rotate(0deg); }
  35% { transform: scale(1.18) rotate(-8deg) translateY(-8rpx); }
  70% { transform: scale(1.08) rotate(8deg); }
  100% { transform: scale(1) rotate(0deg); }
}

// ── Motion keyframes ──

@keyframes motion-look-around {
  0% { transform: translateX(0) rotate(0deg); }
  15% { transform: translateX(6rpx) rotate(5deg); }
  30% { transform: translateX(12rpx) rotate(10deg); }
  45% { transform: translateX(6rpx) rotate(5deg); }
  55% { transform: translateX(0) rotate(0deg); }
  70% { transform: translateX(-6rpx) rotate(-5deg); }
  85% { transform: translateX(-12rpx) rotate(-10deg); }
  100% { transform: translateX(0) rotate(0deg); }
}

@keyframes motion-tail-swish {
  0% { transform: rotate(0deg) scaleX(1); }
  20% { transform: rotate(8deg) scaleX(0.95); }
  40% { transform: rotate(-8deg) scaleX(0.95); }
  60% { transform: rotate(6deg) scaleX(0.97); }
  80% { transform: rotate(-6deg) scaleX(0.97); }
  100% { transform: rotate(0deg) scaleX(1); }
}

@keyframes motion-stretch-yawn {
  0% { transform: scaleY(1) translateY(0); }
  10% { transform: scaleY(0.95) translateY(2rpx); }
  30% { transform: scaleY(1.08) translateY(-4rpx); }
  50% { transform: scaleY(1.12) translateY(-6rpx); }
  70% { transform: scaleY(1.08) translateY(-4rpx); }
  85% { transform: scaleY(0.96) translateY(2rpx); }
  100% { transform: scaleY(1) translateY(0); }
}

@keyframes motion-sleep-curl {
  0% { transform: scale(1) translateY(0); }
  20% { transform: scale(0.85) translateY(4rpx); }
  40% { transform: scale(0.8) translateY(6rpx); }
  60% { transform: scale(0.8) translateY(6rpx); }
  80% { transform: scale(0.85) translateY(4rpx); }
  100% { transform: scale(1) translateY(0); }
}

@keyframes motion-sleep-zzz {
  0% { transform: scale(1) translateY(0); opacity: 1; }
  20% { transform: scale(0.95) translateY(2rpx); opacity: 0.9; }
  80% { transform: scale(0.95) translateY(2rpx); opacity: 0.9; }
  100% { transform: scale(1) translateY(0); opacity: 1; }
}

@keyframes motion-snack-nibble {
  0% { transform: translateY(0) scale(1); }
  15% { transform: translateY(-2rpx) scale(1.02); }
  30% { transform: translateY(0) scale(0.98); }
  45% { transform: translateY(-2rpx) scale(1.02); }
  60% { transform: translateY(0) scale(0.98); }
  75% { transform: translateY(-2rpx) scale(1.02); }
  100% { transform: translateY(0) scale(1); }
}

@keyframes motion-snack-happy-chew {
  0% { transform: translateY(0) rotate(0deg) scale(1); }
  20% { transform: translateY(-3rpx) rotate(5deg) scale(1.04); }
  40% { transform: translateY(-1rpx) rotate(-3deg) scale(1.02); }
  60% { transform: translateY(-3rpx) rotate(4deg) scale(1.04); }
  80% { transform: translateY(-1rpx) rotate(-2deg) scale(1.02); }
  100% { transform: translateY(0) rotate(0deg) scale(1); }
}

@keyframes motion-play-hop {
  0% { transform: translateY(0) scale(1, 1); }
  10% { transform: translateY(0) scale(1.1, 0.9); }
  25% { transform: translateY(-16rpx) scale(0.95, 1.05); }
  40% { transform: translateY(0) scale(1.1, 0.9); }
  55% { transform: translateY(-12rpx) scale(0.95, 1.05); }
  70% { transform: translateY(0) scale(1.05, 0.95); }
  85% { transform: translateY(-6rpx) scale(0.98, 1.02); }
  100% { transform: translateY(0) scale(1, 1); }
}

@keyframes motion-play-ball {
  0% { transform: translateX(0) scale(1); }
  10% { transform: translateX(0) scale(1.1, 0.9); }
  25% { transform: translateX(20rpx) translateY(-8rpx) scale(0.95, 1.05); }
  40% { transform: translateX(0) translateY(0) scale(1.05, 0.95); }
  55% { transform: translateX(-20rpx) translateY(-6rpx) scale(0.95, 1.05); }
  70% { transform: translateX(0) translateY(0) scale(1.05, 0.95); }
  85% { transform: translateX(10rpx) translateY(-3rpx) scale(0.98, 1.02); }
  100% { transform: translateX(0) scale(1); }
}

@keyframes motion-self-proud {
  0% { transform: scale(1) translateY(0); }
  20% { transform: scale(1.08) translateY(-4rpx); }
  40% { transform: scale(1.12) translateY(-6rpx); }
  60% { transform: scale(1.08) translateY(-4rpx); }
  80% { transform: scale(1.02) translateY(-1rpx); }
  100% { transform: scale(1) translateY(0); }
}
</style>
