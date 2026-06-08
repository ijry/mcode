<template>
  <!-- First-time setup: species + name picker -->
  <up-popup
    v-model:show="showSetup"
    mode="center"
    :round="20"
    bgColor="transparent"
    :close-on-click-overlay="false"
  >
    <view class="pet-setup">
      <text class="pet-setup__title">选择你的宠物伙伴</text>

      <scroll-view scroll-x class="pet-setup__species-scroll">
        <view class="pet-setup__species-list">
          <view
            v-for="sp in speciesList"
            :key="sp.id"
            class="pet-setup__species-item"
            :class="{ 'pet-setup__species-item--active': setupSpecies === sp.id }"
            @click="setupSpecies = sp.id"
          >
            <PetSprite :species="sp.id" emotion="idle" size="normal" />
            <text class="pet-setup__species-name">{{ sp.name }}</text>
            <text class="pet-setup__species-desc">{{ sp.personality }}</text>
          </view>
        </view>
      </scroll-view>

      <view class="pet-setup__name-row">
        <up-input
          v-model="setupName"
          placeholder="给它取个名字"
          border="surround"
          :maxlength="10"
          shape="round"
        />
      </view>

      <up-button
        type="primary"
        shape="round"
        :disabled="!setupName.trim()"
        @click="confirmSetup"
      >
        确认
      </up-button>
    </view>
  </up-popup>

  <!-- Floating pet ball -->
  <view
    v-if="petStore.initialized && !petStore.hidden"
    class="pet-float"
    :style="floatStyle"
    @touchstart.stop="onTouchStart"
    @touchmove.stop.prevent="onTouchMove"
    @touchend.stop="onTouchEnd"
  >
    <PetBubble :message="currentBubble" />
    <PetSprite
      :species="petStore.species"
      :emotion="currentEmotion"
      :skin-id="petStore.skinId"
      :interaction="interactionState"
      :motion="currentMotion?.bodyClass ?? null"
      size="small"
    />
    <PetScene :decorations="currentDecorations" />
  </view>

  <!-- Long-press action sheet -->
  <up-action-sheet
    :show="showActionSheet"
    :actions="actionSheetActions"
    cancel-text="取消"
    @close="showActionSheet = false"
    @select="onActionSelect"
  />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { usePetStore } from '@/stores/pet'
import { playPetTapSound } from '@/services/petAudio'
import { SPECIES_LIST } from '@/services/petConfig'
import {
  initPetEngine,
  petInteract,
  petInteractExcited,
  showLevelUpCelebration,
} from '@/services/petEngine'
import {
  PET_DOUBLE_TAP_WINDOW_MS,
  PET_SINGLE_TAP_DELAY_MS,
  PET_TAP_INTERACTION_DURATION_MS,
  PET_EXCITED_INTERACTION_DURATION_MS,
  shouldTreatAsDoubleTap,
} from '@/services/petTapGesture'
import { stopPetSpeech } from '@/services/petVoice'
import type { SpeciesId } from '@/types/pet'
import PetSprite from './PetSprite.vue'
import PetBubble from './PetBubble.vue'
import PetScene from './PetScene.vue'

const petStore = usePetStore()
const speciesList = SPECIES_LIST

// ── Engine ──
const { currentEmotion, currentBubble, currentMotion, currentDecorations } = initPetEngine()

// ── Setup flow ──
const showSetup = ref(false)
const setupSpecies = ref<SpeciesId>('fox')
const setupName = ref('')

onMounted(() => {
  if (!petStore.initialized) {
    showSetup.value = true
  }
})

function confirmSetup() {
  if (!setupName.value.trim()) return
  petStore.initPet(setupSpecies.value, setupName.value.trim())
  showSetup.value = false
}

// ── Floating position ──
const windowInfo = uni.getWindowInfo()
const screenWidth = windowInfo.windowWidth
const screenHeight = windowInfo.windowHeight
const BALL_SIZE = 48
const TABBAR_HEIGHT = 50

const posX = ref(petStore.position.x >= 0 ? petStore.position.x : screenWidth - BALL_SIZE - 12)
const posY = ref(petStore.position.y >= 0 ? petStore.position.y : screenHeight - TABBAR_HEIGHT - BALL_SIZE - 20)

const floatStyle = computed(() => ({
  position: 'fixed' as const,
  left: `${posX.value}px`,
  top: `${posY.value}px`,
  width: `${BALL_SIZE}px`,
  height: `${BALL_SIZE}px`,
  zIndex: 9999,
}))

// ── Touch handling ──
let touchStartX = 0
let touchStartY = 0
let touchStartTime = 0
let hasMoved = false
let longPressTimer: ReturnType<typeof setTimeout> | null = null
let singleTapTimer: ReturnType<typeof setTimeout> | null = null
let interactionTimer: ReturnType<typeof setTimeout> | null = null
let lastTapTime = 0
let longPressTriggered = false
const interactionState = ref<'none' | 'tap' | 'excited'>('none')

function applyInteractionState(nextState: 'tap' | 'excited', duration: number) {
  if (interactionTimer) {
    clearTimeout(interactionTimer)
    interactionTimer = null
  }

  interactionState.value = nextState
  interactionTimer = setTimeout(() => {
    if (interactionState.value === nextState) {
      interactionState.value = 'none'
    }
    interactionTimer = null
  }, duration)
}

function triggerSingleInteraction() {
  applyInteractionState('tap', PET_TAP_INTERACTION_DURATION_MS)
  playPetTapSound()
  const result = petInteract()
  if (result.leveledUp) {
    showLevelUpCelebration()
  }
}

function triggerDoubleInteraction() {
  applyInteractionState('excited', PET_EXCITED_INTERACTION_DURATION_MS)
  playPetTapSound()
  const result = petInteractExcited()
  if (result.leveledUp) {
    showLevelUpCelebration()
  }
}

function onTouchStart(e: TouchEvent) {
  const touch = e.touches[0]
  touchStartX = touch.clientX - posX.value
  touchStartY = touch.clientY - posY.value
  touchStartTime = Date.now()
  hasMoved = false
  longPressTriggered = false

  longPressTimer = setTimeout(() => {
    if (!hasMoved) {
      longPressTriggered = true
      showActionSheet.value = true
    }
    longPressTimer = null
  }, 500)
}

function onTouchMove(e: TouchEvent) {
  const touch = e.touches[0]
  const newX = touch.clientX - touchStartX
  const newY = touch.clientY - touchStartY

  if (Math.abs(newX - posX.value) > 5 || Math.abs(newY - posY.value) > 5) {
    hasMoved = true
    if (longPressTimer) {
      clearTimeout(longPressTimer)
      longPressTimer = null
    }
  }

  posX.value = Math.max(0, Math.min(screenWidth - BALL_SIZE, newX))
  posY.value = Math.max(0, Math.min(screenHeight - BALL_SIZE, newY))
}

function onTouchEnd() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }

  if (hasMoved) {
    const midX = screenWidth / 2
    posX.value = posX.value < midX ? 8 : screenWidth - BALL_SIZE - 8
    petStore.setPosition(posX.value, posY.value)
    return
  }

  if (longPressTriggered) {
    return
  }

  const now = Date.now()

  if (singleTapTimer && shouldTreatAsDoubleTap(lastTapTime, now, PET_DOUBLE_TAP_WINDOW_MS)) {
    clearTimeout(singleTapTimer)
    singleTapTimer = null
    lastTapTime = 0
    triggerDoubleInteraction()
    return
  }

  lastTapTime = now
  singleTapTimer = setTimeout(() => {
    triggerSingleInteraction()
    singleTapTimer = null
    lastTapTime = 0
  }, PET_SINGLE_TAP_DELAY_MS)
}

// ── Action sheet (long press) ──
const showActionSheet = ref(false)

const actionSheetActions = computed(() => [
  { name: petStore.hidden ? '显示宠物' : '隐藏宠物' },
  { name: petStore.bubbleMuted ? '开启气泡' : '静音气泡' },
  { name: petStore.voiceEnabled ? '关闭语音' : '开启语音' },
])

function onActionSelect(action: { name: string }) {
  showActionSheet.value = false
  if (action.name === '隐藏宠物' || action.name === '显示宠物') {
    petStore.toggleHidden()
  } else if (action.name === '静音气泡' || action.name === '开启气泡') {
    petStore.toggleMute()
  } else if (action.name === '关闭语音' || action.name === '开启语音') {
    const nextEnabled = !petStore.voiceEnabled
    petStore.setVoiceEnabled(nextEnabled)
    if (!nextEnabled) {
      stopPetSpeech()
    }
  }
}

onUnmounted(() => {
  if (longPressTimer) clearTimeout(longPressTimer)
  if (singleTapTimer) clearTimeout(singleTapTimer)
  if (interactionTimer) clearTimeout(interactionTimer)
})
</script>

<style lang="scss" scoped>
.pet-float {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: color-mix(in srgb, var(--up-card-bg-color, #ffffff) 90%, transparent);
  box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.15);
  transition: box-shadow 0.2s ease;

  &:active {
    box-shadow: 0 2rpx 10rpx rgba(0, 0, 0, 0.2);
  }
}

.pet-setup {
  width: calc(100vw - 64rpx);
  max-width: 686rpx;
  box-sizing: border-box;
  padding: 40rpx 32rpx;
  border-radius: 20rpx;
  background: var(--up-card-bg-color, #ffffff);
  box-shadow: 0 16rpx 48rpx rgba(15, 23, 42, 0.12);

  &__title {
    font-size: 36rpx;
    font-weight: 600;
    color: var(--up-main-color, #303133);
    text-align: center;
    display: block;
    margin-bottom: 32rpx;
  }

  &__species-scroll {
    width: 100%;
    white-space: nowrap;
    margin-bottom: 32rpx;
  }

  &__species-list {
    display: flex;
    gap: 24rpx;
    padding: 8rpx 4rpx;
  }

  &__species-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 16rpx;
    border-radius: 16rpx;
    border: 2rpx solid transparent;
    min-width: 140rpx;
    flex-shrink: 0;

    &--active {
      border-color: #2979ff;
      background: color-mix(in srgb, var(--up-primary, #2979ff) 10%, var(--up-card-bg-color, #ffffff) 90%);
    }
  }

  &__species-name {
    font-size: 26rpx;
    font-weight: 500;
    color: var(--up-main-color, #303133);
    margin-top: 8rpx;
  }

  &__species-desc {
    font-size: 20rpx;
    color: var(--up-tips-color, #909193);
    margin-top: 4rpx;
  }

  &__name-row {
    margin-bottom: 24rpx;
  }
}

</style>
