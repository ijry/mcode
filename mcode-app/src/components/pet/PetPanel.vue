<template>
  <up-popup
    :show="show"
    mode="bottom"
    :round="28"
    bgColor="transparent"
    @close="emit('update:show', false)"
  >
    <view class="pet-panel">
      <!-- Header: name, level, stars -->
      <view class="pet-panel__header">
        <view class="pet-panel__info">
          <text class="pet-panel__name">{{ petStore.name }}</text>
          <text class="pet-panel__level">Lv.{{ petStore.level }}</text>
          <text class="pet-panel__stars">{{ starText }}</text>
        </view>
        <view class="pet-panel__title-badge">
          <text class="pet-panel__title-text">{{ petStore.levelTitle }}</text>
        </view>
      </view>

      <!-- Large pet display -->
      <view class="pet-panel__display">
        <PetSprite
          :species="petStore.species"
          :emotion="emotion"
          :skin-id="petStore.skinId"
          size="large"
        />
      </view>

      <!-- Exp bar -->
      <view class="pet-panel__exp-bar">
        <view class="pet-panel__exp-track">
          <view
            class="pet-panel__exp-fill"
            :style="{ width: `${petStore.expProgress}%` }"
          />
        </view>
        <text class="pet-panel__exp-label">
          {{ petStore.exp }} / {{ petStore.expToNextLevel }}
        </text>
      </view>

      <!-- Tabs -->
      <view class="pet-panel__tabs">
        <view
          v-for="tab in tabs"
          :key="tab.id"
          class="pet-panel__tab"
          :class="{ 'pet-panel__tab--active': activeTab === tab.id }"
          @click="activeTab = tab.id"
        >
          <text>{{ tab.label }}</text>
        </view>
      </view>

      <!-- Tab content -->
      <scroll-view scroll-y class="pet-panel__content">
        <!-- Status tab -->
        <view v-if="activeTab === 'status'" class="tab-status">
          <view class="tab-status__row">
            <text class="tab-status__label">当前状态</text>
            <text class="tab-status__value">{{ emotionLabel }}</text>
          </view>
          <view class="tab-status__row">
            <text class="tab-status__label">今日经验</text>
            <text class="tab-status__value">+{{ todayTotalExp }}</text>
          </view>
          <view class="tab-status__row">
            <text class="tab-status__label">连续签到</text>
            <text class="tab-status__value">{{ petStore.signIn.streak }} 天</text>
          </view>
          <view class="tab-status__row">
            <text class="tab-status__label">累计对话</text>
            <text class="tab-status__value">{{ petStore.stats.totalConversations }}</text>
          </view>
          <view class="tab-status__row">
            <text class="tab-status__label">累计 Turns</text>
            <text class="tab-status__value">{{ petStore.stats.totalTurns }}</text>
          </view>
          <view class="tab-status__row" @click="petStore.setVoiceEnabled(!petStore.voiceEnabled)">
            <text class="tab-status__label">宠物语音</text>
            <text class="tab-status__value">{{ petStore.voiceEnabled ? '已开启' : '已关闭' }}</text>
          </view>
          <view class="tab-status__row" @click="petStore.toggleMute()">
            <text class="tab-status__label">气泡提醒</text>
            <text class="tab-status__value">{{ petStore.bubbleMuted ? '已关闭' : '已开启' }}</text>
          </view>
        </view>

        <!-- Skins tab -->
        <view v-if="activeTab === 'skins'" class="tab-skins">
          <view class="tab-skins__section-title">
            <text>皮肤</text>
          </view>
          <view class="tab-skins__grid">
            <view
              v-for="skin in allSkins"
              :key="skin.id"
              class="tab-skins__item"
              :class="{
                'tab-skins__item--active': petStore.skinId === skin.id,
                'tab-skins__item--locked': !petStore.unlockedSkins.includes(skin.id),
              }"
              @click="onSkinTap(skin)"
            >
              <view
                class="tab-skins__swatch"
                :style="{ background: skin.colorPalette[0] || '#ccc' }"
              />
              <text class="tab-skins__name">{{ skin.name }}</text>
            </view>
          </view>

          <view class="tab-skins__section-title" style="margin-top: 24rpx">
            <text>配饰</text>
          </view>
          <view class="tab-skins__grid">
            <view
              v-for="acc in allAccessories"
              :key="acc.id"
              class="tab-skins__item"
              :class="{
                'tab-skins__item--active': isAccessoryEquipped(acc.id),
                'tab-skins__item--locked': !petStore.unlockedAccessories.includes(acc.id),
              }"
              @click="onAccessoryTap(acc)"
            >
              <text class="tab-skins__acc-icon">{{ slotIcon(acc.slot) }}</text>
              <text class="tab-skins__name">{{ acc.name }}</text>
            </view>
          </view>
        </view>

        <!-- Achievements tab -->
        <view v-if="activeTab === 'achievements'" class="tab-achievements">
          <view
            v-for="ach in allAchievements"
            :key="ach.id"
            class="tab-achievements__item"
            :class="{ 'tab-achievements__item--unlocked': petStore.unlockedAchievements.includes(ach.id) }"
          >
            <view class="tab-achievements__icon">
              <text>{{ petStore.unlockedAchievements.includes(ach.id) ? '&#127942;' : '&#128274;' }}</text>
            </view>
            <view class="tab-achievements__info">
              <text class="tab-achievements__name">{{ ach.name }}</text>
              <text class="tab-achievements__desc">{{ ach.description }}</text>
            </view>
          </view>
        </view>
      </scroll-view>

      <!-- Close handle -->
      <view class="pet-panel__close-handle" @click="emit('update:show', false)">
        <view class="pet-panel__handle-bar" />
      </view>
    </view>
  </up-popup>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { usePetStore } from '@/stores/pet'
import { SKINS, ACCESSORIES, ACHIEVEMENTS } from '@/services/petConfig'
import type { SkinDef, AccessoryDef, EmotionState } from '@/types/pet'
import PetSprite from './PetSprite.vue'

const props = defineProps<{
  show: boolean
  emotion: EmotionState
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
}>()

const petStore = usePetStore()

const tabs = [
  { id: 'status', label: '状态' },
  { id: 'skins', label: '皮肤' },
  { id: 'achievements', label: '成就' },
]
const activeTab = ref('status')

const allSkins = SKINS
const allAccessories = ACCESSORIES
const allAchievements = ACHIEVEMENTS

const emotionLabels: Record<EmotionState, string> = {
  sleeping: '睡觉中',
  idle: '空闲',
  curious: '好奇',
  busy: '忙碌',
  alert: '需要关注',
  happy: '开心',
  sad: '难过',
  excited: '兴奋',
  bored: '无聊',
}

const emotionLabel = computed(() => emotionLabels[props.emotion] || '空闲')

const starText = computed(() => {
  const count = petStore.levelStars
  let result = ''
  for (let i = 0; i < count; i++) result += '\u2B50'
  return result
})

const todayTotalExp = computed(() => {
  const d = petStore.dailyExp
  return d.user + d.agent + d.task
})

function onSkinTap(skin: SkinDef) {
  if (petStore.unlockedSkins.includes(skin.id)) {
    petStore.equipSkin(skin.id)
  }
}

function isAccessoryEquipped(accId: string): boolean {
  return Object.values(petStore.accessories).includes(accId)
}

function onAccessoryTap(acc: AccessoryDef) {
  if (!petStore.unlockedAccessories.includes(acc.id)) return

  if (petStore.accessories[acc.slot] === acc.id) {
    petStore.equipAccessory(acc.slot, null)
  } else {
    petStore.equipAccessory(acc.slot, acc.id)
  }
}

function slotIcon(slot: string): string {
  switch (slot) {
    case 'head': return '\uD83C\uDFA9'
    case 'body': return '\uD83D\uDC54'
    case 'effect': return '\u2728'
    default: return '\uD83D\uDCE6'
  }
}
</script>

<style lang="scss" scoped>
.pet-panel {
  margin: 0 32rpx;
  padding: 24rpx 32rpx 48rpx;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  border-radius: 28rpx;
  overflow: hidden;
  background: var(--mcode-card-bg);
  box-shadow: 0 18rpx 56rpx rgba(15, 23, 42, 0.12);

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16rpx;
  }

  &__info {
    display: flex;
    align-items: baseline;
    gap: 12rpx;
  }

  &__name {
    font-size: 36rpx;
    font-weight: 600;
    color: var(--mcode-text-primary);
  }

  &__level {
    font-size: 28rpx;
    color: var(--mcode-primary);
    font-weight: 500;
  }

  &__stars {
    font-size: 24rpx;
  }

  &__title-badge {
    background: linear-gradient(135deg, #2979ff, #651fff);
    border-radius: 20rpx;
    padding: 4rpx 16rpx;
  }

  &__title-text {
    font-size: 22rpx;
    color: #fff;
  }

  &__display {
    display: flex;
    justify-content: center;
    padding: 24rpx 0;
  }

  &__exp-bar {
    margin-bottom: 24rpx;
  }

  &__exp-track {
    height: 12rpx;
    background: var(--mcode-card-soft-bg);
    border-radius: 6rpx;
    overflow: hidden;
  }

  &__exp-fill {
    height: 100%;
    background: linear-gradient(90deg, #2979ff, #651fff);
    border-radius: 6rpx;
    transition: width 0.5s ease;
  }

  &__exp-label {
    font-size: 22rpx;
    color: var(--mcode-text-tertiary);
    text-align: right;
    display: block;
    margin-top: 4rpx;
  }

  &__tabs {
    display: flex;
    gap: 0;
    margin-bottom: 16rpx;
    border-bottom: 2rpx solid var(--mcode-border-color);
  }

  &__tab {
    flex: 1;
    text-align: center;
    padding: 16rpx 0;
    font-size: 28rpx;
    color: var(--mcode-text-tertiary);
    border-bottom: 4rpx solid transparent;
    transition: all 0.2s;

    &--active {
      color: var(--mcode-primary);
      border-bottom-color: var(--mcode-primary);
      font-weight: 500;
    }
  }

  &__content {
    flex: 1;
    min-height: 300rpx;
    max-height: 400rpx;
  }

  &__close-handle {
    display: flex;
    justify-content: center;
    padding: 16rpx 0 0;
  }

  &__handle-bar {
    width: 80rpx;
    height: 8rpx;
    background: var(--mcode-border-color);
    border-radius: 4rpx;
  }
}

.tab-status {
  &__row {
    display: flex;
    justify-content: space-between;
    padding: 16rpx 0;
    border-bottom: 1rpx solid var(--mcode-border-color);
  }

  &__label {
    font-size: 28rpx;
    color: var(--mcode-text-secondary);
  }

  &__value {
    font-size: 28rpx;
    color: var(--mcode-text-primary);
    font-weight: 500;
  }
}

.tab-skins {
  &__section-title {
    font-size: 26rpx;
    color: var(--mcode-text-tertiary);
    margin-bottom: 12rpx;
    font-weight: 500;
  }

  &__grid {
    display: flex;
    flex-wrap: wrap;
    gap: 16rpx;
  }

  &__item {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 16rpx;
    border-radius: 12rpx;
    border: 2rpx solid var(--mcode-border-color);
    min-width: 140rpx;
    position: relative;

    &--active {
      border-color: var(--mcode-primary);
      background: color-mix(in srgb, var(--mcode-primary) 10%, var(--mcode-card-bg) 90%);
    }

    &--locked {
      opacity: 0.5;
    }
  }

  &__swatch {
    width: 48rpx;
    height: 48rpx;
    border-radius: 50%;
    margin-bottom: 8rpx;
  }

  &__acc-icon {
    font-size: 36rpx;
    margin-bottom: 8rpx;
  }

  &__name {
    font-size: 22rpx;
    color: var(--mcode-text-primary);
  }
}

.tab-achievements {
  &__item {
    display: flex;
    align-items: center;
    gap: 16rpx;
    padding: 16rpx 0;
    border-bottom: 1rpx solid var(--mcode-border-color);
    opacity: 0.5;

    &--unlocked {
      opacity: 1;
    }
  }

  &__icon {
    font-size: 36rpx;
    width: 48rpx;
    text-align: center;
  }

  &__info {
    flex: 1;
  }

  &__name {
    font-size: 28rpx;
    color: var(--mcode-text-primary);
    font-weight: 500;
    display: block;
  }

  &__desc {
    font-size: 22rpx;
    color: var(--mcode-text-tertiary);
    display: block;
    margin-top: 4rpx;
  }
}

</style>
