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
      size="small"
    />
  </view>

  <!-- Pet panel (bottom popup) -->
  <PetPanel
    v-model:show="showPanel"
    :emotion="currentEmotion"
  />

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
import { initPetEngine, petInteract, showLevelUpCelebration } from '@/services/petEngine'
import { SPECIES_LIST } from '@/services/petConfig'
import type { SpeciesId } from '@/types/pet'
import PetSprite from './PetSprite.vue'
import PetBubble from './PetBubble.vue'
import PetPanel from './PetPanel.vue'

const petStore = usePetStore()
const speciesList = SPECIES_LIST

// ── Engine ──
const { currentEmotion, currentBubble } = initPetEngine()

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

function onTouchStart(e: TouchEvent) {
  const touch = e.touches[0]
  touchStartX = touch.clientX - posX.value
  touchStartY = touch.clientY - posY.value
  touchStartTime = Date.now()
  hasMoved = false

  longPressTimer = setTimeout(() => {
    if (!hasMoved) {
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

  const elapsed = Date.now() - touchStartTime

  if (elapsed < 300 && lastTapTime > 0 && (touchStartTime - lastTapTime) < 300) {
    const result = petInteract()
    if (result.leveledUp) {
      showLevelUpCelebration()
    }
    lastTapTime = 0
    return
  }

  lastTapTime = touchStartTime

  setTimeout(() => {
    if (lastTapTime === touchStartTime) {
      showPanel.value = true
      lastTapTime = 0
    }
  }, 300)
}

let lastTapTime = 0

// ── Panel ──
const showPanel = ref(false)

// ── Action sheet (long press) ──
const showActionSheet = ref(false)

const actionSheetActions = computed(() => [
  { name: petStore.hidden ? '显示宠物' : '隐藏宠物' },
  { name: petStore.bubbleMuted ? '开启气泡' : '静音气泡' },
])

function onActionSelect(action: { name: string }) {
  showActionSheet.value = false
  if (action.name === '隐藏宠物' || action.name === '显示宠物') {
    petStore.toggleHidden()
  } else if (action.name === '静音气泡' || action.name === '开启气泡') {
    petStore.toggleMute()
  }
}

onUnmounted(() => {
  if (longPressTimer) clearTimeout(longPressTimer)
})
</script>

<style lang="scss" scoped>
.pet-float {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: color-mix(in srgb, var(--mcode-card-bg) 90%, transparent);
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
  background: var(--mcode-card-bg);
  box-shadow: 0 16rpx 48rpx rgba(15, 23, 42, 0.12);

  &__title {
    font-size: 36rpx;
    font-weight: 600;
    color: var(--mcode-text-primary);
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
      background: color-mix(in srgb, var(--mcode-primary) 10%, var(--mcode-card-bg) 90%);
    }
  }

  &__species-name {
    font-size: 26rpx;
    font-weight: 500;
    color: var(--mcode-text-primary);
    margin-top: 8rpx;
  }

  &__species-desc {
    font-size: 20rpx;
    color: var(--mcode-text-tertiary);
    margin-top: 4rpx;
  }

  &__name-row {
    margin-bottom: 24rpx;
  }
}

</style>
