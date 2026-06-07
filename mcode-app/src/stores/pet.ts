import { defineStore } from 'pinia'
import type {
  PetState,
  SpeciesId,
  AccessorySlot,
  ExpSource,
  UnlockCondition,
} from '@/types/pet'
import {
  expForLevel,
  MAX_LEVEL,
  DAILY_EXP_CAPS,
  SKINS,
  ACCESSORIES,
  ACHIEVEMENTS,
  getLevelTitle,
  getLevelStars,
} from '@/services/petConfig'

function todayStr(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

function defaultState(): PetState {
  return {
    initialized: false,
    species: 'fox',
    name: '',
    level: 1,
    exp: 0,
    totalExp: 0,
    skinId: 'default',
    accessories: { head: null, body: null, effect: null },
    unlockedSkins: ['default'],
    unlockedAccessories: [],
    unlockedAchievements: [],
    dailyExp: { user: 0, agent: 0, task: 0, date: todayStr() },
    signIn: { lastDate: '', streak: 0 },
    createdAt: '',
    position: { x: -1, y: -1 },
    bubbleMuted: false,
    voiceEnabled: true,
    hidden: false,
    stats: {
      totalConversations: 0,
      totalTurns: 0,
      totalToolCalls: 0,
      totalTokens: 0,
      totalTodosCompleted: 0,
      agentConversations: {},
    },
  }
}

export const usePetStore = defineStore('pet', {
  state: (): PetState => defaultState(),

  getters: {
    /** EXP needed to reach next level */
    expToNextLevel(): number {
      if (this.level >= MAX_LEVEL) return 0
      return expForLevel(this.level)
    },

    /** Progress percentage toward next level (0-100) */
    expProgress(): number {
      if (this.level >= MAX_LEVEL) return 100
      const needed = expForLevel(this.level)
      if (needed <= 0) return 100
      return Math.min(100, Math.round((this.exp / needed) * 100))
    },

    /** Display title for current level range */
    levelTitle(): string {
      return getLevelTitle(this.level)
    },

    /** Star count for current level */
    levelStars(): number {
      return getLevelStars(this.level)
    },

    /** Whether accessory effect slot is unlocked (level 31+) */
    effectSlotUnlocked(): boolean {
      return this.level >= 31
    },

    /** List of skins the user can see (unlocked ones) */
    availableSkins(): typeof SKINS {
      return SKINS.filter(s => this.unlockedSkins.includes(s.id))
    },

    /** List of accessories the user can see (unlocked ones) */
    availableAccessories(): typeof ACCESSORIES {
      return ACCESSORIES.filter(a => this.unlockedAccessories.includes(a.id))
    },
  },

  actions: {
    /** Initialize pet with chosen species and name */
    initPet(species: SpeciesId, name: string) {
      this.species = species
      this.name = name
      this.initialized = true
      this.createdAt = new Date().toISOString()
    },

    /** Reset daily caps if date has changed */
    ensureDailyReset() {
      const today = todayStr()
      if (this.dailyExp.date !== today) {
        this.dailyExp = { user: 0, agent: 0, task: 0, date: today }
      }
    },

    /**
     * Add experience points. Returns actual amount added (capped).
     */
    addExp(source: ExpSource, amount: number): { added: number; leveledUp: boolean } {
      if (this.level >= MAX_LEVEL || amount <= 0) {
        return { added: 0, leveledUp: false }
      }

      this.ensureDailyReset()

      const cap = DAILY_EXP_CAPS[source] ?? 200
      const currentDaily = this.dailyExp[source]
      const remaining = Math.max(0, cap - currentDaily)
      const actual = Math.min(amount, remaining)
      if (actual <= 0) return { added: 0, leveledUp: false }

      this.dailyExp[source] = currentDaily + actual
      this.exp += actual
      this.totalExp += actual

      let leveledUp = false
      while (this.level < MAX_LEVEL && this.exp >= expForLevel(this.level)) {
        this.exp -= expForLevel(this.level)
        this.level++
        leveledUp = true
      }

      if (leveledUp) {
        this.checkUnlocks()
      }

      return { added: actual, leveledUp }
    },

    /** Record a stat increment and check unlocks */
    recordStat(stat: keyof PetState['stats'], increment: number = 1) {
      const current = this.stats[stat]
      if (typeof current === 'number') {
        ;(this.stats[stat] as number) = current + increment
      }
      this.checkUnlocks()
    },

    /** Record agent-specific conversation count */
    recordAgentConversation(agentType: string) {
      const key = agentType.toLowerCase().replace(/[\s-]/g, '_')
      this.stats.agentConversations[key] = (this.stats.agentConversations[key] || 0) + 1
      this.stats.totalConversations++
      this.checkUnlocks()
    },

    /** Perform daily sign-in. Returns bonus EXP earned. */
    signInToday(): number {
      this.ensureDailyReset()
      const today = todayStr()
      if (this.signIn.lastDate === today) return 0

      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`

      if (this.signIn.lastDate === yesterdayStr) {
        this.signIn.streak++
      } else {
        this.signIn.streak = 1
      }
      this.signIn.lastDate = today

      let totalBonus = 30
      this.addExp('task', 30)

      if (this.signIn.streak % 7 === 0) {
        this.addExp('task', 100)
        totalBonus += 100
      } else if (this.signIn.streak % 3 === 0) {
        this.addExp('task', 50)
        totalBonus += 50
      }

      if (this.signIn.streak >= 7 && !this.unlockedAchievements.includes('streak-7')) {
        this.unlockedAchievements.push('streak-7')
      }
      if (this.signIn.streak >= 30 && !this.unlockedAchievements.includes('streak-30')) {
        this.unlockedAchievements.push('streak-30')
      }

      this.checkUnlocks()
      return totalBonus
    },

    /** Equip a skin (must be unlocked) */
    equipSkin(skinId: string) {
      if (this.unlockedSkins.includes(skinId)) {
        this.skinId = skinId
      }
    },

    /** Equip an accessory to its slot (must be unlocked) */
    equipAccessory(slot: AccessorySlot, accessoryId: string | null) {
      if (accessoryId === null) {
        this.accessories[slot] = null
        return
      }
      if (this.unlockedAccessories.includes(accessoryId)) {
        const def = ACCESSORIES.find(a => a.id === accessoryId)
        if (def && def.slot === slot) {
          this.accessories[slot] = accessoryId
        }
      }
    },

    /** Check all unlock conditions and unlock anything newly earned */
    checkUnlocks() {
      for (const skin of SKINS) {
        if (this.unlockedSkins.includes(skin.id)) continue
        if (this.isConditionMet(skin.unlockCondition)) {
          this.unlockedSkins.push(skin.id)
        }
      }

      for (const acc of ACCESSORIES) {
        if (this.unlockedAccessories.includes(acc.id)) continue
        if (this.isConditionMet(acc.unlockCondition)) {
          this.unlockedAccessories.push(acc.id)
        }
      }

      for (const ach of ACHIEVEMENTS) {
        if (this.unlockedAchievements.includes(ach.id)) continue
        if (this.isConditionMet(ach.unlockCondition)) {
          this.unlockedAchievements.push(ach.id)
        }
      }
    },

    /** Evaluate a single unlock condition */
    isConditionMet(condition: UnlockCondition): boolean {
      switch (condition.type) {
        case 'default':
          return true
        case 'level':
          return this.level >= condition.level
        case 'stat': {
          const path = condition.stat
          const parts = path.split('.')
          let value: any = this.stats
          for (const part of parts) {
            value = value?.[part]
          }
          return typeof value === 'number' && value >= condition.value
        }
        case 'achievement':
          return this.unlockedAchievements.includes(condition.achievementId)
        default:
          return false
      }
    },

    /** Update floating position */
    setPosition(x: number, y: number) {
      this.position = { x, y }
    },

    /** Toggle bubble mute */
    toggleMute() {
      this.bubbleMuted = !this.bubbleMuted
    },

    /** Set pet voice explicitly */
    setVoiceEnabled(enabled: boolean) {
      this.voiceEnabled = enabled
    },

    /** Toggle pet visibility */
    toggleHidden() {
      this.hidden = !this.hidden
    },
  },

  persist: {
    storage: {
      getItem: (key: string) => uni.getStorageSync(key),
      setItem: (key: string, value: string) => uni.setStorageSync(key, value),
    },
  },
})
