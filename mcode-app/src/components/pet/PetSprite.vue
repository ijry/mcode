<template>
  <view
    class="pet-sprite"
    :class="[`pet-sprite--${emotion}`, `pet-sprite--${size}`]"
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
}>(), {
  skinId: 'default',
  size: 'normal',
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
</style>
