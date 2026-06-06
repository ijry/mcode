# MCode AI Pet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global floating AI pet to the mcode mobile app that reflects Agent work status in real-time and provides a growth/collection system with skins and accessories.

**Architecture:** Modular component system under `components/pet/`, driven by a Pinia store (`pet.ts`) and a behavior engine (`petEngine.ts`) that subscribes to the existing `conversationRuntime` store. The pet is globally injected via uview-plus `App.up.vue` root component mechanism, rendering as a fixed-position draggable element with SVG sprite animations.

**Tech Stack:** Vue 3 + TypeScript, Pinia with persistedstate, uview-plus (popup/transition/overlay), SVG sprite sheets (no Lottie dependency in MVP — use CSS animation + SVG frame switching for lighter weight and uni-app compatibility).

---

## File Structure

```
mcode-app/src/
  App.up.vue                          — NEW: uview-plus root wrapper, injects PetFloat globally
  types/
    pet.d.ts                          — NEW: all pet-related type definitions
  services/
    petConfig.ts                      — NEW: static data — species, skins, accessories, exp tables
    petEngine.ts                      — NEW: behavior engine — maps runtime status → emotion state
  stores/
    pet.ts                            — NEW: Pinia store — pet data, exp, levels, unlocks
  components/pet/
    PetFloat.vue                      — NEW: draggable floating layer with gesture handling
    PetSprite.vue                     — NEW: SVG animation renderer with emotion states
    PetBubble.vue                     — NEW: speech bubble overlay
    PetPanel.vue                      — NEW: bottom popup panel (status/skin/achievement tabs)
  static/pets/
    sprites.svg                       — NEW: placeholder SVG sprite sheet (all species × emotions)
  static/pet-accessories/
    (placeholder SVGs)                — NEW: placeholder accessory assets
```

**Existing files modified:**
- `vite.config.cjs` — no changes needed (uview-plus root mechanism handled by uni build plugin)
- `pages/conversation-detail/index.vue` — add exp event hooks (minor)
- `pages/todos/index.vue` — add exp event on todo completion (minor)

---

### Task 1: Type Definitions

**Files:**
- Create: `src/types/pet.d.ts`

- [ ] **Step 1: Create the pet type definitions file**

```ts
// src/types/pet.d.ts

/** The 9 emotion states the pet can display */
export type EmotionState =
  | 'sleeping'
  | 'idle'
  | 'curious'
  | 'busy'
  | 'alert'
  | 'happy'
  | 'sad'
  | 'excited'
  | 'bored'

/** Species identifiers */
export type SpeciesId = 'fox' | 'owl' | 'otter' | 'octopus' | 'cactus' | 'ghost'

/** Accessory slot types */
export type AccessorySlot = 'head' | 'body' | 'effect'

/** How an item is unlocked */
export type UnlockCondition =
  | { type: 'default' }
  | { type: 'level'; level: number }
  | { type: 'achievement'; achievementId: string }
  | { type: 'stat'; stat: string; value: number }

/** Species definition — static config */
export interface SpeciesDef {
  id: SpeciesId
  name: string
  personality: string
  colors: string[]
}

/** Skin definition — static config */
export interface SkinDef {
  id: string
  name: string
  description: string
  unlockCondition: UnlockCondition
  colorPalette: string[]
}

/** Accessory definition — static config */
export interface AccessoryDef {
  id: string
  name: string
  slot: AccessorySlot
  unlockCondition: UnlockCondition
  svgAsset: string
  anchor: { x: number; y: number }
}

/** Achievement milestone */
export interface AchievementDef {
  id: string
  name: string
  description: string
  unlockCondition: UnlockCondition
}

/** Daily experience tracking — resets each day */
export interface DailyExp {
  user: number
  agent: number
  task: number
  date: string  // YYYY-MM-DD
}

/** Sign-in streak tracking */
export interface SignInState {
  lastDate: string  // YYYY-MM-DD
  streak: number
}

/** Position on screen */
export interface PetPosition {
  x: number
  y: number
}

/** Persisted pet state (stored in Pinia) */
export interface PetState {
  /** Whether the user has completed initial setup (chosen species + name) */
  initialized: boolean
  species: SpeciesId
  name: string
  level: number
  exp: number
  totalExp: number
  skinId: string
  accessories: Record<AccessorySlot, string | null>
  unlockedSkins: string[]
  unlockedAccessories: string[]
  unlockedAchievements: string[]
  dailyExp: DailyExp
  signIn: SignInState
  createdAt: string
  /** Floating ball position — persisted so it remembers where user dragged it */
  position: PetPosition
  /** Whether speech bubbles are muted */
  bubbleMuted: boolean
  /** Whether the pet is hidden */
  hidden: boolean
  /** Cumulative stats for unlock tracking */
  stats: {
    totalConversations: number
    totalTurns: number
    totalToolCalls: number
    totalTokens: number
    totalTodosCompleted: number
    agentConversations: Record<string, number>  // agentType → count
  }
}

/** Bubble message shown above the pet */
export interface BubbleMessage {
  text: string
  duration: number  // ms
  flash?: boolean
}

/** Experience source channel */
export type ExpSource = 'user' | 'agent' | 'task'
```

- [ ] **Step 2: Verify the file has no TypeScript errors**

Run: `cd D:/Repos/xyito/lingyun/mcode/mcode-app && npx vue-tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors from `pet.d.ts` (other pre-existing errors are OK)

- [ ] **Step 3: Commit**

```bash
cd D:/Repos/xyito/lingyun/mcode
git add mcode-app/src/types/pet.d.ts
git commit -m "feat(pet): add pet type definitions"
```

---

### Task 2: Static Configuration

**Files:**
- Create: `src/services/petConfig.ts`

- [ ] **Step 1: Create the pet config file with all static data**

```ts
// src/services/petConfig.ts
import type {
  SpeciesDef,
  SkinDef,
  AccessoryDef,
  AchievementDef,
  SpeciesId,
} from '@/types/pet'

// ── Species ──

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  fox: {
    id: 'fox',
    name: '小狐狸',
    personality: '机灵、好奇',
    colors: ['#FF6B35', '#FFE0B2', '#E65100'],
  },
  owl: {
    id: 'owl',
    name: '小猫头鹰',
    personality: '沉稳、智慧',
    colors: ['#795548', '#D7CCC8', '#3E2723'],
  },
  otter: {
    id: 'otter',
    name: '小水獭',
    personality: '活泼、乐观',
    colors: ['#8D6E63', '#BCAAA4', '#4E342E'],
  },
  octopus: {
    id: 'octopus',
    name: '小章鱼',
    personality: '多线程、高效',
    colors: ['#E040FB', '#F3E5F5', '#7B1FA2'],
  },
  cactus: {
    id: 'cactus',
    name: '小仙人掌',
    personality: '佛系、耐心',
    colors: ['#66BB6A', '#C8E6C9', '#2E7D32'],
  },
  ghost: {
    id: 'ghost',
    name: '小幽灵',
    personality: '调皮、神秘',
    colors: ['#B0BEC5', '#ECEFF1', '#546E7A'],
  },
}

export const SPECIES_LIST: SpeciesDef[] = Object.values(SPECIES)

// ── Skins ──

export const SKINS: SkinDef[] = [
  {
    id: 'default',
    name: '默认原色',
    description: '物种本身的标准配色',
    unlockCondition: { type: 'default' },
    colorPalette: [],  // uses species default
  },
  {
    id: 'dark-night',
    name: '暗夜模式',
    description: '深色调重绘，呼应 app 深色模式',
    unlockCondition: { type: 'level', level: 15 },
    colorPalette: ['#263238', '#37474F', '#78909C'],
  },
  {
    id: 'code-green',
    name: '代码绿',
    description: '终端绿 + 黑色主题，致敬编程文化',
    unlockCondition: { type: 'stat', stat: 'totalConversations', value: 100 },
    colorPalette: ['#00E676', '#1B5E20', '#76FF03'],
  },
]

// ── Accessories ──

export const ACCESSORIES: AccessoryDef[] = [
  {
    id: 'claude-hat',
    name: 'Claude 紫帽',
    slot: 'head',
    unlockCondition: { type: 'stat', stat: 'agentConversations.claude_code', value: 50 },
    svgAsset: '/static/pet-accessories/claude-hat.svg',
    anchor: { x: 0.5, y: 0 },
  },
  {
    id: 'codex-hat',
    name: 'Codex 绿帽',
    slot: 'head',
    unlockCondition: { type: 'stat', stat: 'agentConversations.codex', value: 50 },
    svgAsset: '/static/pet-accessories/codex-hat.svg',
    anchor: { x: 0.5, y: 0 },
  },
  {
    id: 'sunglasses',
    name: '小墨镜',
    slot: 'head',
    unlockCondition: { type: 'level', level: 10 },
    svgAsset: '/static/pet-accessories/sunglasses.svg',
    anchor: { x: 0.5, y: 0.35 },
  },
  {
    id: 'plaid-shirt',
    name: '程序员格衫',
    slot: 'body',
    unlockCondition: { type: 'level', level: 20 },
    svgAsset: '/static/pet-accessories/plaid-shirt.svg',
    anchor: { x: 0.5, y: 0.6 },
  },
  {
    id: 'lightning-scarf',
    name: '闪电围巾',
    slot: 'body',
    unlockCondition: { type: 'achievement', achievementId: 'streak-30' },
    svgAsset: '/static/pet-accessories/lightning-scarf.svg',
    anchor: { x: 0.5, y: 0.45 },
  },
  {
    id: 'star-trail',
    name: '星光尾迹',
    slot: 'effect',
    unlockCondition: { type: 'level', level: 35 },
    svgAsset: '/static/pet-accessories/star-trail.svg',
    anchor: { x: 0.5, y: 0.5 },
  },
]

// ── Achievements ──

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first-conversation',
    name: '初次对话',
    description: '完成第一次 AI 对话',
    unlockCondition: { type: 'stat', stat: 'totalConversations', value: 1 },
  },
  {
    id: 'hundred-turns',
    name: '百轮老手',
    description: '累计完成 100 个 turn',
    unlockCondition: { type: 'stat', stat: 'totalTurns', value: 100 },
  },
  {
    id: 'streak-7',
    name: '坚持一周',
    description: '连续签到 7 天',
    unlockCondition: { type: 'achievement', achievementId: 'streak-7' },
  },
  {
    id: 'streak-30',
    name: '月度坚持',
    description: '连续签到 30 天',
    unlockCondition: { type: 'achievement', achievementId: 'streak-30' },
  },
  {
    id: 'level-10',
    name: '初窥门径',
    description: '宠物达到 10 级',
    unlockCondition: { type: 'level', level: 10 },
  },
  {
    id: 'level-25',
    name: '渐入佳境',
    description: '宠物达到 25 级',
    unlockCondition: { type: 'level', level: 25 },
  },
  {
    id: 'level-50',
    name: '登峰造极',
    description: '宠物达到 50 级',
    unlockCondition: { type: 'level', level: 50 },
  },
]

// ── Experience tables ──

/** EXP needed to go from `level` to `level + 1` */
export function expForLevel(level: number): number {
  return 100 + level * 20
}

/** Total EXP needed to reach a given level from level 1 */
export function totalExpForLevel(level: number): number {
  // Sum of expForLevel(1) + expForLevel(2) + ... + expForLevel(level - 1)
  // = sum(100 + i*20 for i in 1..level-1)
  // = (level-1)*100 + 20 * (level-1)*level/2
  if (level <= 1) return 0
  const n = level - 1
  return n * 100 + 20 * n * (n + 1) / 2
}

export const MAX_LEVEL = 50

/** Daily exp caps per source */
export const DAILY_EXP_CAPS: Record<string, number> = {
  user: 200,
  agent: 300,
  task: 100,
}

/** Level range titles */
export function getLevelTitle(level: number): string {
  if (level <= 10) return '新生'
  if (level <= 20) return '成长'
  if (level <= 30) return '熟练'
  if (level <= 40) return '精通'
  return '传说'
}

/** Level range star count (for display) */
export function getLevelStars(level: number): number {
  if (level <= 10) return 1
  if (level <= 20) return 2
  if (level <= 30) return 3
  if (level <= 40) return 4
  return 5
}

// ── Bubble messages ──

export interface BubbleTemplate {
  trigger: string
  texts: string[]
  duration: number
  flash?: boolean
}

export const BUBBLE_TEMPLATES: BubbleTemplate[] = [
  { trigger: 'turn_complete', texts: ['搞定啦!', '完成!', '好了~'], duration: 3000 },
  { trigger: 'waiting_permission_long', texts: ['主人快来看看~', '需要你的审批!'], duration: 5000, flash: true },
  { trigger: 'error', texts: ['呜...出错了', '似乎有问题...'], duration: 4000 },
  { trigger: 'morning', texts: ['早上好!', '新的一天~'], duration: 3000 },
  { trigger: 'afternoon', texts: ['下午好!', '继续加油!'], duration: 3000 },
  { trigger: 'evening', texts: ['晚上好!', '辛苦啦~'], duration: 3000 },
  { trigger: 'level_up', texts: ['我变强了!', '升级啦!'], duration: 4000 },
  { trigger: 'pet_interact', texts: ['嘻嘻~', '好舒服~', '再摸摸!'], duration: 2000 },
]

export function pickBubbleText(trigger: string): string | null {
  const template = BUBBLE_TEMPLATES.find(t => t.trigger === trigger)
  if (!template) return null
  return template.texts[Math.floor(Math.random() * template.texts.length)]
}

export function getBubbleTemplate(trigger: string): BubbleTemplate | null {
  return BUBBLE_TEMPLATES.find(t => t.trigger === trigger) ?? null
}
```

- [ ] **Step 2: Verify no import errors**

Run: `cd D:/Repos/xyito/lingyun/mcode/mcode-app && npx vue-tsc --noEmit --pretty 2>&1 | grep petConfig | head -10`
Expected: No errors from `petConfig.ts`

- [ ] **Step 3: Commit**

```bash
cd D:/Repos/xyito/lingyun/mcode
git add mcode-app/src/services/petConfig.ts
git commit -m "feat(pet): add static pet config — species, skins, accessories, exp tables"
```

---

### Task 3: Pet Store

**Files:**
- Create: `src/stores/pet.ts`

- [ ] **Step 1: Create the pet Pinia store**

```ts
// src/stores/pet.ts
import { defineStore } from 'pinia'
import type {
  PetState,
  SpeciesId,
  AccessorySlot,
  ExpSource,
  EmotionState,
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
    position: { x: -1, y: -1 },  // -1 means "use default"
    bubbleMuted: false,
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
     * Returns { added: number, leveledUp: boolean }
     */
    addExp(source: ExpSource, amount: number): { added: number; leveledUp: boolean } {
      if (this.level >= MAX_LEVEL || amount <= 0) {
        return { added: 0, leveledUp: false }
      }

      this.ensureDailyReset()

      // Apply daily cap
      const cap = DAILY_EXP_CAPS[source] ?? 200
      const currentDaily = this.dailyExp[source]
      const remaining = Math.max(0, cap - currentDaily)
      const actual = Math.min(amount, remaining)
      if (actual <= 0) return { added: 0, leveledUp: false }

      this.dailyExp[source] = currentDaily + actual
      this.exp += actual
      this.totalExp += actual

      // Level up loop
      let leveledUp = false
      while (this.level < MAX_LEVEL && this.exp >= expForLevel(this.level)) {
        this.exp -= expForLevel(this.level)
        this.level++
        leveledUp = true
      }

      // Check unlocks after exp change
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
      if (this.signIn.lastDate === today) return 0  // already signed in

      // Calculate streak
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`

      if (this.signIn.lastDate === yesterdayStr) {
        this.signIn.streak++
      } else {
        this.signIn.streak = 1
      }
      this.signIn.lastDate = today

      // Base sign-in exp
      let totalBonus = 30
      this.addExp('task', 30)

      // Streak bonuses
      if (this.signIn.streak % 7 === 0) {
        this.addExp('task', 100)
        totalBonus += 100
      } else if (this.signIn.streak % 3 === 0) {
        this.addExp('task', 50)
        totalBonus += 50
      }

      // Check streak achievements
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
      // Check skins
      for (const skin of SKINS) {
        if (this.unlockedSkins.includes(skin.id)) continue
        if (this.isConditionMet(skin.unlockCondition)) {
          this.unlockedSkins.push(skin.id)
        }
      }

      // Check accessories
      for (const acc of ACCESSORIES) {
        if (this.unlockedAccessories.includes(acc.id)) continue
        if (this.isConditionMet(acc.unlockCondition)) {
          this.unlockedAccessories.push(acc.id)
        }
      }

      // Check achievements
      for (const ach of ACHIEVEMENTS) {
        if (this.unlockedAchievements.includes(ach.id)) continue
        if (this.isConditionMet(ach.unlockCondition)) {
          this.unlockedAchievements.push(ach.id)
        }
      }
    },

    /** Evaluate a single unlock condition */
    isConditionMet(condition: PetState['unlockedSkins'] extends any[] ? any : never): boolean {
      // TypeScript workaround — accepts UnlockCondition
      const cond = condition as import('@/types/pet').UnlockCondition
      switch (cond.type) {
        case 'default':
          return true
        case 'level':
          return this.level >= cond.level
        case 'stat': {
          const path = cond.stat
          // Handle nested stats like "agentConversations.claude_code"
          const parts = path.split('.')
          let value: any = this.stats
          for (const part of parts) {
            value = value?.[part]
          }
          return typeof value === 'number' && value >= cond.value
        }
        case 'achievement':
          return this.unlockedAchievements.includes(cond.achievementId)
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
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `cd D:/Repos/xyito/lingyun/mcode/mcode-app && npx vue-tsc --noEmit --pretty 2>&1 | grep "stores/pet" | head -10`
Expected: No errors from `stores/pet.ts`

- [ ] **Step 3: Commit**

```bash
cd D:/Repos/xyito/lingyun/mcode
git add mcode-app/src/stores/pet.ts
git commit -m "feat(pet): add pet Pinia store with exp, leveling, and unlock system"
```

---

### Task 4: Behavior Engine

**Files:**
- Create: `src/services/petEngine.ts`

- [ ] **Step 1: Create the behavior engine**

```ts
// src/services/petEngine.ts
import { watch, ref, type Ref } from 'vue'
import type { EmotionState } from '@/types/pet'
import { useConversationRuntimeStore } from '@/stores/conversationRuntime'
import { usePetStore } from '@/stores/pet'
import { pickBubbleText, getBubbleTemplate } from '@/services/petConfig'
import type { BubbleMessage } from '@/types/pet'

/**
 * Pet behavior engine.
 * Watches conversationRuntime store and computes the pet's current emotion state.
 * Also emits bubble messages and tracks exp-worthy events.
 */

/** Current computed emotion state — reactive */
const currentEmotion = ref<EmotionState>('idle')

/** Current bubble message — reactive, null means no bubble */
const currentBubble = ref<BubbleMessage | null>(null)

/** Timers */
let idleTimer: ReturnType<typeof setTimeout> | null = null
let sleepTimer: ReturnType<typeof setTimeout> | null = null
let happyTimer: ReturnType<typeof setTimeout> | null = null
let bubbleTimer: ReturnType<typeof setTimeout> | null = null
let permissionTimer: ReturnType<typeof setTimeout> | null = null

/** Track last status to detect transitions */
let lastStatus = ''
let engineInitialized = false

function clearAllTimers() {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null }
  if (sleepTimer) { clearTimeout(sleepTimer); sleepTimer = null }
  if (happyTimer) { clearTimeout(happyTimer); happyTimer = null }
  if (permissionTimer) { clearTimeout(permissionTimer); permissionTimer = null }
}

function showBubble(trigger: string) {
  const petStore = usePetStore()
  if (petStore.bubbleMuted) return

  const text = pickBubbleText(trigger)
  if (!text) return

  const template = getBubbleTemplate(trigger)
  if (!template) return

  // Clear previous bubble timer
  if (bubbleTimer) clearTimeout(bubbleTimer)

  currentBubble.value = {
    text,
    duration: template.duration,
    flash: template.flash,
  }

  bubbleTimer = setTimeout(() => {
    currentBubble.value = null
    bubbleTimer = null
  }, template.duration)
}

function computeEmotion(): EmotionState {
  const runtimeStore = useConversationRuntimeStore()

  // Find the "most active" session across all conversations
  let highestPriorityStatus = ''
  let hasActiveConnection = false

  for (const [, session] of runtimeStore.sessions) {
    if (session.connectionId) hasActiveConnection = true
    const priority = statusPriority(session.status)
    if (priority > statusPriority(highestPriorityStatus)) {
      highestPriorityStatus = session.status
    }
  }

  // Priority-based emotion mapping
  switch (highestPriorityStatus) {
    case 'waiting_permission':
      return 'alert'
    case 'error':
      return 'sad'
    case 'thinking':
      return 'curious'
    case 'running_tool':
      return 'busy'
    case 'connecting':
      return 'curious'
    default:
      break
  }

  // If no active connection at all → sleeping (after timeout, handled by timer)
  if (!hasActiveConnection) {
    return currentEmotion.value === 'sleeping' ? 'sleeping' : 'idle'
  }

  return 'idle'
}

function statusPriority(status: string): number {
  switch (status) {
    case 'waiting_permission': return 6
    case 'error': return 5
    case 'thinking': return 4
    case 'running_tool': return 3
    case 'connecting': return 2
    case 'connected': return 1
    case 'idle': return 0
    default: return -1
  }
}

function onStatusChange(newStatus: string) {
  const petStore = usePetStore()
  clearAllTimers()

  // Detect turn_complete transition (status went to idle from active)
  if (newStatus === 'idle' && isActiveStatus(lastStatus)) {
    // Briefly show happy
    currentEmotion.value = 'happy'
    showBubble('turn_complete')
    petStore.addExp('agent', 3)
    petStore.recordStat('totalTurns')

    happyTimer = setTimeout(() => {
      happyTimer = null
      currentEmotion.value = computeEmotion()
      startIdleTimers()
    }, 5000)

    lastStatus = newStatus
    return
  }

  if (newStatus === 'running_tool') {
    petStore.addExp('agent', 2)
    petStore.recordStat('totalToolCalls')
  }

  if (newStatus === 'waiting_permission') {
    // After 30s waiting, show alert bubble
    permissionTimer = setTimeout(() => {
      showBubble('waiting_permission_long')
      permissionTimer = null
    }, 30000)
  }

  if (newStatus === 'error') {
    showBubble('error')
  }

  currentEmotion.value = computeEmotion()
  startIdleTimers()

  lastStatus = newStatus
}

function isActiveStatus(status: string): boolean {
  return ['thinking', 'running_tool', 'waiting_permission', 'connecting'].includes(status)
}

function startIdleTimers() {
  // After 10 min idle → bored
  idleTimer = setTimeout(() => {
    if (currentEmotion.value === 'idle') {
      currentEmotion.value = 'bored'
    }
    idleTimer = null
  }, 10 * 60 * 1000)

  // After 30 min no active connection → sleeping
  sleepTimer = setTimeout(() => {
    const runtimeStore = useConversationRuntimeStore()
    let hasActive = false
    for (const [, session] of runtimeStore.sessions) {
      if (session.connectionId) { hasActive = true; break }
    }
    if (!hasActive) {
      currentEmotion.value = 'sleeping'
    }
    sleepTimer = null
  }, 30 * 60 * 1000)
}

/** Show greeting bubble based on time of day */
function showGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) {
    showBubble('morning')
  } else if (hour < 18) {
    showBubble('afternoon')
  } else {
    showBubble('evening')
  }
}

/** Trigger pet interaction (double-tap) */
export function petInteract() {
  const petStore = usePetStore()
  const result = petStore.addExp('user', 2)
  showBubble('pet_interact')

  // Briefly show excited
  const previousEmotion = currentEmotion.value
  currentEmotion.value = 'happy'
  setTimeout(() => {
    currentEmotion.value = previousEmotion === 'happy' ? computeEmotion() : previousEmotion
  }, 2000)

  return result
}

/** Trigger level-up celebration */
export function showLevelUpCelebration() {
  currentEmotion.value = 'excited'
  showBubble('level_up')
  setTimeout(() => {
    currentEmotion.value = computeEmotion()
  }, 4000)
}

/**
 * Initialize the pet engine.
 * Call once from PetFloat.vue on mount.
 * Sets up watchers on conversationRuntime store.
 */
export function initPetEngine() {
  if (engineInitialized) return { currentEmotion, currentBubble }
  engineInitialized = true

  const runtimeStore = useConversationRuntimeStore()

  // Watch all sessions for status changes
  watch(
    () => {
      // Create a derived value: the highest-priority status across all sessions
      let highest = ''
      for (const [, session] of runtimeStore.sessions) {
        if (statusPriority(session.status) > statusPriority(highest)) {
          highest = session.status
        }
      }
      return highest
    },
    (newStatus) => {
      onStatusChange(newStatus)
    },
    { immediate: true }
  )

  // Show greeting on first init
  showGreeting()

  // Auto sign-in on first open each day
  const petStore = usePetStore()
  if (petStore.initialized) {
    petStore.signInToday()
  }

  startIdleTimers()

  return { currentEmotion, currentBubble }
}

/** Get reactive refs without re-initializing */
export function usePetEngine() {
  return { currentEmotion, currentBubble }
}

/** Cleanup — call on app hide/destroy if needed */
export function destroyPetEngine() {
  clearAllTimers()
  if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null }
  engineInitialized = false
}
```

- [ ] **Step 2: Verify no import errors**

Run: `cd D:/Repos/xyito/lingyun/mcode/mcode-app && npx vue-tsc --noEmit --pretty 2>&1 | grep "petEngine" | head -10`
Expected: No errors from `petEngine.ts`

- [ ] **Step 3: Commit**

```bash
cd D:/Repos/xyito/lingyun/mcode
git add mcode-app/src/services/petEngine.ts
git commit -m "feat(pet): add behavior engine — maps agent status to emotion states"
```

---

### Task 5: Placeholder SVG Assets

**Files:**
- Create: `src/static/pets/sprites.svg`
- Create: `src/static/pet-accessories/claude-hat.svg`
- Create: `src/static/pet-accessories/codex-hat.svg`
- Create: `src/static/pet-accessories/sunglasses.svg`
- Create: `src/static/pet-accessories/plaid-shirt.svg`
- Create: `src/static/pet-accessories/lightning-scarf.svg`
- Create: `src/static/pet-accessories/star-trail.svg`

- [ ] **Step 1: Create the main pet sprites SVG**

This is a placeholder SVG sprite sheet. Each species has a simple iconic shape, and each emotion state is a variation (different eyes/mouth). The SVG uses `<symbol>` elements addressable by `<use href="#fox-idle">` etc.

```svg
<!-- src/static/pets/sprites.svg -->
<svg xmlns="http://www.w3.org/2000/svg" style="display:none">
  <!-- FOX -->
  <symbol id="fox-idle" viewBox="0 0 48 48">
    <circle cx="24" cy="28" r="16" fill="#FF6B35"/>
    <polygon points="12,16 8,4 18,14" fill="#FF6B35"/>
    <polygon points="36,16 40,4 30,14" fill="#FF6B35"/>
    <circle cx="18" cy="26" r="2.5" fill="#fff"/>
    <circle cx="30" cy="26" r="2.5" fill="#fff"/>
    <circle cx="18" cy="26" r="1.5" fill="#333"/>
    <circle cx="30" cy="26" r="1.5" fill="#333"/>
    <ellipse cx="24" cy="33" rx="3" ry="2" fill="#E65100"/>
  </symbol>
  <symbol id="fox-sleeping" viewBox="0 0 48 48">
    <circle cx="24" cy="28" r="16" fill="#FF6B35"/>
    <polygon points="12,16 8,4 18,14" fill="#FF6B35"/>
    <polygon points="36,16 40,4 30,14" fill="#FF6B35"/>
    <line x1="15" y1="26" x2="21" y2="26" stroke="#333" stroke-width="2" stroke-linecap="round"/>
    <line x1="27" y1="26" x2="33" y2="26" stroke="#333" stroke-width="2" stroke-linecap="round"/>
    <ellipse cx="24" cy="33" rx="2" ry="1.5" fill="#E65100"/>
    <text x="38" y="18" font-size="8" fill="#666">z</text>
    <text x="42" y="12" font-size="6" fill="#999">z</text>
  </symbol>
  <symbol id="fox-curious" viewBox="0 0 48 48">
    <circle cx="24" cy="28" r="16" fill="#FF6B35"/>
    <polygon points="12,16 8,4 18,14" fill="#FF6B35"/>
    <polygon points="36,16 40,4 30,14" fill="#FF6B35"/>
    <circle cx="18" cy="25" r="3" fill="#fff"/>
    <circle cx="30" cy="25" r="3" fill="#fff"/>
    <circle cx="19" cy="25" r="1.5" fill="#333"/>
    <circle cx="31" cy="25" r="1.5" fill="#333"/>
    <ellipse cx="24" cy="34" rx="2" ry="1" fill="#E65100"/>
    <text x="20" y="14" font-size="10" fill="#FFB300">?</text>
  </symbol>
  <symbol id="fox-busy" viewBox="0 0 48 48">
    <circle cx="24" cy="28" r="16" fill="#FF6B35"/>
    <polygon points="12,16 8,4 18,14" fill="#FF6B35"/>
    <polygon points="36,16 40,4 30,14" fill="#FF6B35"/>
    <circle cx="18" cy="26" r="2" fill="#fff"/>
    <circle cx="30" cy="26" r="2" fill="#fff"/>
    <circle cx="18" cy="26" r="1" fill="#333"/>
    <circle cx="30" cy="26" r="1" fill="#333"/>
    <line x1="20" y1="33" x2="28" y2="33" stroke="#E65100" stroke-width="2" stroke-linecap="round"/>
  </symbol>
  <symbol id="fox-alert" viewBox="0 0 48 48">
    <circle cx="24" cy="28" r="16" fill="#FF6B35"/>
    <polygon points="12,16 8,2 18,14" fill="#FF6B35"/>
    <polygon points="36,16 40,2 30,14" fill="#FF6B35"/>
    <circle cx="18" cy="25" r="3.5" fill="#fff"/>
    <circle cx="30" cy="25" r="3.5" fill="#fff"/>
    <circle cx="18" cy="25" r="2" fill="#333"/>
    <circle cx="30" cy="25" r="2" fill="#333"/>
    <ellipse cx="24" cy="34" rx="3" ry="2" fill="#E65100"/>
    <text x="20" y="12" font-size="12" fill="#F44336" font-weight="bold">!</text>
  </symbol>
  <symbol id="fox-happy" viewBox="0 0 48 48">
    <circle cx="24" cy="28" r="16" fill="#FF6B35"/>
    <polygon points="12,16 8,4 18,14" fill="#FF6B35"/>
    <polygon points="36,16 40,4 30,14" fill="#FF6B35"/>
    <path d="M15,25 Q18,22 21,25" stroke="#333" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M27,25 Q30,22 33,25" stroke="#333" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M18,32 Q24,38 30,32" stroke="#E65100" stroke-width="2" fill="none" stroke-linecap="round"/>
    <text x="6" y="16" font-size="8" fill="#FFD600">★</text>
    <text x="38" y="20" font-size="6" fill="#FFD600">★</text>
  </symbol>
  <symbol id="fox-sad" viewBox="0 0 48 48">
    <circle cx="24" cy="28" r="16" fill="#FF6B35"/>
    <polygon points="12,16 8,4 18,14" fill="#FF6B35"/>
    <polygon points="36,16 40,4 30,14" fill="#FF6B35"/>
    <circle cx="18" cy="26" r="2.5" fill="#fff"/>
    <circle cx="30" cy="26" r="2.5" fill="#fff"/>
    <circle cx="18" cy="27" r="1.5" fill="#333"/>
    <circle cx="30" cy="27" r="1.5" fill="#333"/>
    <path d="M19,34 Q24,30 29,34" stroke="#E65100" stroke-width="2" fill="none" stroke-linecap="round"/>
    <text x="10" y="16" font-size="10" fill="#90A4AE">☁</text>
  </symbol>
  <symbol id="fox-excited" viewBox="0 0 48 48">
    <circle cx="24" cy="28" r="16" fill="#FF6B35"/>
    <polygon points="12,16 8,4 18,14" fill="#FF6B35"/>
    <polygon points="36,16 40,4 30,14" fill="#FF6B35"/>
    <path d="M15,24 Q18,21 21,24" stroke="#333" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M27,24 Q30,21 33,24" stroke="#333" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M18,32 Q24,39 30,32" stroke="#E65100" stroke-width="2" fill="#FFE0B2" stroke-linecap="round"/>
    <text x="4" y="12" font-size="8" fill="#E040FB">✦</text>
    <text x="40" y="14" font-size="6" fill="#FFD600">✦</text>
    <text x="36" y="8" font-size="7" fill="#00E676">✦</text>
  </symbol>
  <symbol id="fox-bored" viewBox="0 0 48 48">
    <circle cx="24" cy="28" r="16" fill="#FF6B35"/>
    <polygon points="12,16 8,4 18,14" fill="#FF6B35"/>
    <polygon points="36,16 40,4 30,14" fill="#FF6B35"/>
    <circle cx="18" cy="26" r="2" fill="#fff"/>
    <circle cx="30" cy="26" r="2" fill="#fff"/>
    <circle cx="18" cy="26" r="1" fill="#333"/>
    <circle cx="30" cy="26" r="1" fill="#333"/>
    <ellipse cx="24" cy="34" rx="3" ry="2.5" fill="#E65100"/>
  </symbol>

  <!-- For MVP: other species reuse the fox shape with different colors. -->
  <!-- A real designer will replace these. Only fox has all 9 states. -->
  <!-- Other species get a single idle symbol as placeholder. -->

  <symbol id="owl-idle" viewBox="0 0 48 48">
    <circle cx="24" cy="28" r="16" fill="#795548"/>
    <circle cx="18" cy="24" r="6" fill="#D7CCC8"/>
    <circle cx="30" cy="24" r="6" fill="#D7CCC8"/>
    <circle cx="18" cy="24" r="3" fill="#3E2723"/>
    <circle cx="30" cy="24" r="3" fill="#3E2723"/>
    <polygon points="24,30 22,34 26,34" fill="#FF8F00"/>
  </symbol>

  <symbol id="otter-idle" viewBox="0 0 48 48">
    <ellipse cx="24" cy="28" rx="16" ry="14" fill="#8D6E63"/>
    <ellipse cx="24" cy="32" rx="10" ry="8" fill="#BCAAA4"/>
    <circle cx="18" cy="24" r="2.5" fill="#fff"/>
    <circle cx="30" cy="24" r="2.5" fill="#fff"/>
    <circle cx="18" cy="24" r="1.5" fill="#4E342E"/>
    <circle cx="30" cy="24" r="1.5" fill="#4E342E"/>
    <ellipse cx="24" cy="30" rx="2" ry="1.5" fill="#4E342E"/>
  </symbol>

  <symbol id="octopus-idle" viewBox="0 0 48 48">
    <ellipse cx="24" cy="22" rx="14" ry="12" fill="#E040FB"/>
    <circle cx="19" cy="20" r="3" fill="#fff"/>
    <circle cx="29" cy="20" r="3" fill="#fff"/>
    <circle cx="19" cy="20" r="1.5" fill="#7B1FA2"/>
    <circle cx="29" cy="20" r="1.5" fill="#7B1FA2"/>
    <path d="M10,32 Q12,40 16,34" stroke="#E040FB" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M16,34 Q20,42 24,34" stroke="#E040FB" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M24,34 Q28,42 32,34" stroke="#E040FB" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M32,34 Q36,40 38,32" stroke="#E040FB" stroke-width="3" fill="none" stroke-linecap="round"/>
  </symbol>

  <symbol id="cactus-idle" viewBox="0 0 48 48">
    <rect x="18" y="12" width="12" height="28" rx="6" fill="#66BB6A"/>
    <rect x="6" y="20" width="10" height="6" rx="3" fill="#66BB6A"/>
    <rect x="32" y="16" width="10" height="6" rx="3" fill="#66BB6A"/>
    <line x1="6" y1="23" x2="18" y2="23" stroke="#66BB6A" stroke-width="4"/>
    <line x1="30" y1="19" x2="42" y2="19" stroke="#66BB6A" stroke-width="4"/>
    <circle cx="21" cy="22" r="1.5" fill="#2E7D32"/>
    <circle cx="27" cy="22" r="1.5" fill="#2E7D32"/>
    <path d="M22,27 Q24,29 26,27" stroke="#2E7D32" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  </symbol>

  <symbol id="ghost-idle" viewBox="0 0 48 48">
    <path d="M12,38 L12,22 Q12,8 24,8 Q36,8 36,22 L36,38 L32,34 L28,38 L24,34 L20,38 L16,34 Z" fill="#B0BEC5"/>
    <circle cx="19" cy="22" r="3" fill="#fff"/>
    <circle cx="29" cy="22" r="3" fill="#fff"/>
    <circle cx="19" cy="22" r="1.5" fill="#546E7A"/>
    <circle cx="29" cy="22" r="1.5" fill="#546E7A"/>
    <ellipse cx="24" cy="28" rx="2" ry="1.5" fill="#546E7A"/>
  </symbol>
</svg>
```

- [ ] **Step 2: Create placeholder accessory SVGs**

Create 6 minimal SVG files. Each is a simple 24x24 icon placeholder.

`src/static/pet-accessories/claude-hat.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <rect x="4" y="12" width="16" height="4" rx="1" fill="#7C3AED"/>
  <rect x="6" y="4" width="12" height="10" rx="2" fill="#8B5CF6"/>
</svg>
```

`src/static/pet-accessories/codex-hat.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <rect x="4" y="12" width="16" height="4" rx="1" fill="#059669"/>
  <rect x="6" y="4" width="12" height="10" rx="2" fill="#10B981"/>
</svg>
```

`src/static/pet-accessories/sunglasses.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <rect x="2" y="8" width="8" height="6" rx="2" fill="#1F2937"/>
  <rect x="14" y="8" width="8" height="6" rx="2" fill="#1F2937"/>
  <line x1="10" y1="11" x2="14" y2="11" stroke="#1F2937" stroke-width="2"/>
</svg>
```

`src/static/pet-accessories/plaid-shirt.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <rect x="4" y="4" width="16" height="16" rx="2" fill="#EF4444"/>
  <line x1="8" y1="4" x2="8" y2="20" stroke="#1F2937" stroke-width="1" opacity="0.3"/>
  <line x1="12" y1="4" x2="12" y2="20" stroke="#1F2937" stroke-width="1" opacity="0.3"/>
  <line x1="16" y1="4" x2="16" y2="20" stroke="#1F2937" stroke-width="1" opacity="0.3"/>
  <line x1="4" y1="8" x2="20" y2="8" stroke="#1F2937" stroke-width="1" opacity="0.3"/>
  <line x1="4" y1="12" x2="20" y2="12" stroke="#1F2937" stroke-width="1" opacity="0.3"/>
  <line x1="4" y1="16" x2="20" y2="16" stroke="#1F2937" stroke-width="1" opacity="0.3"/>
</svg>
```

`src/static/pet-accessories/lightning-scarf.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path d="M4,8 L20,8 L18,16 L14,16 L16,12 L8,12 L10,16 L6,16 Z" fill="#FBBF24"/>
</svg>
```

`src/static/pet-accessories/star-trail.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <circle cx="6" cy="12" r="2" fill="#FFD600" opacity="0.3"/>
  <circle cx="10" cy="10" r="1.5" fill="#FFD600" opacity="0.5"/>
  <circle cx="14" cy="8" r="2" fill="#FFD600" opacity="0.7"/>
  <circle cx="18" cy="12" r="2.5" fill="#FFD600" opacity="1"/>
</svg>
```

- [ ] **Step 3: Commit**

```bash
cd D:/Repos/xyito/lingyun/mcode
git add mcode-app/src/static/pets/ mcode-app/src/static/pet-accessories/
git commit -m "feat(pet): add placeholder SVG sprites and accessory assets"
```

---

### Task 6: PetSprite Component

**Files:**
- Create: `src/components/pet/PetSprite.vue`

- [ ] **Step 1: Create the sprite renderer component**

```vue
<!-- src/components/pet/PetSprite.vue -->
<template>
  <view
    class="pet-sprite"
    :class="[`pet-sprite--${emotion}`, `pet-sprite--${size}`]"
    :style="spriteStyle"
  >
    <!-- Base pet SVG inline (using the sprite ID) -->
    <image
      :src="spriteSrc"
      mode="aspectFit"
      class="pet-sprite__base"
    />
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { EmotionState, SpeciesId } from '@/types/pet'

const props = withDefaults(defineProps<{
  species: SpeciesId
  emotion: EmotionState
  skinId?: string
  size?: 'small' | 'normal' | 'large'
}>(), {
  skinId: 'default',
  size: 'normal',
})

/**
 * Build the sprite source path.
 * For MVP, we use individual PNG/SVG exports from the sprite sheet.
 * uni-app <image> doesn't support SVG <use> references directly,
 * so we resolve to a file path per species-emotion combination.
 *
 * Fallback: if a specific emotion sprite doesn't exist for a species,
 * fall back to the idle sprite for that species.
 */
const AVAILABLE_FOX_EMOTIONS: EmotionState[] = [
  'idle', 'sleeping', 'curious', 'busy', 'alert', 'happy', 'sad', 'excited', 'bored'
]

const spriteSrc = computed(() => {
  const species = props.species
  const emotion = props.emotion

  // Fox has all 9 emotion sprites; other species only have idle for MVP
  if (species === 'fox' && AVAILABLE_FOX_EMOTIONS.includes(emotion)) {
    return `/static/pets/sprites.svg#${species}-${emotion}`
  }

  // Fallback to idle for this species, or fox-idle as ultimate fallback
  return `/static/pets/sprites.svg#${species}-idle`
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

  // Emotion-specific CSS animations
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
```

- [ ] **Step 2: Commit**

```bash
cd D:/Repos/xyito/lingyun/mcode
git add mcode-app/src/components/pet/PetSprite.vue
git commit -m "feat(pet): add PetSprite component with emotion-driven CSS animations"
```

---

### Task 7: PetBubble Component

**Files:**
- Create: `src/components/pet/PetBubble.vue`

- [ ] **Step 1: Create the speech bubble component**

```vue
<!-- src/components/pet/PetBubble.vue -->
<template>
  <up-transition
    mode="fade-up"
    :show="!!message"
    :duration="300"
  >
    <view
      v-if="message"
      class="pet-bubble"
      :class="{ 'pet-bubble--flash': message.flash }"
    >
      <text class="pet-bubble__text">{{ message.text }}</text>
      <view class="pet-bubble__arrow" />
    </view>
  </up-transition>
</template>

<script setup lang="ts">
import type { BubbleMessage } from '@/types/pet'

defineProps<{
  message: BubbleMessage | null
}>()
</script>

<style lang="scss" scoped>
.pet-bubble {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-bottom: 12rpx;
  background: #fff;
  border-radius: 16rpx;
  padding: 10rpx 20rpx;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.12);
  white-space: nowrap;
  max-width: 300rpx;
  z-index: 1;

  &__text {
    font-size: 24rpx;
    color: #333;
    line-height: 1.4;
  }

  &__arrow {
    position: absolute;
    bottom: -10rpx;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 10rpx solid transparent;
    border-right: 10rpx solid transparent;
    border-top: 10rpx solid #fff;
  }

  &--flash {
    animation: bubble-flash 1s ease-in-out infinite;
  }
}

@keyframes bubble-flash {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@media (prefers-color-scheme: dark) {
  .pet-bubble {
    background: #333;
    box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.3);

    &__text {
      color: #e5e5e5;
    }

    &__arrow {
      border-top-color: #333;
    }
  }
}
</style>
```

- [ ] **Step 2: Commit**

```bash
cd D:/Repos/xyito/lingyun/mcode
git add mcode-app/src/components/pet/PetBubble.vue
git commit -m "feat(pet): add PetBubble speech bubble component"
```

---

### Task 8: PetFloat Component (Draggable Floating Layer)

**Files:**
- Create: `src/components/pet/PetFloat.vue`

- [ ] **Step 1: Create the floating draggable pet container**

```vue
<!-- src/components/pet/PetFloat.vue -->
<template>
  <!-- First-time setup: species + name picker -->
  <up-popup
    v-model:show="showSetup"
    mode="center"
    :round="20"
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
const BALL_SIZE = 48  // dp
const TABBAR_HEIGHT = 50  // dp

const posX = ref(petStore.position.x >= 0 ? petStore.position.x : screenWidth - BALL_SIZE - 12)
const posY = ref(petStore.position.y >= 0 ? petStore.position.y : screenHeight - TABBAR_HEIGHT - BALL_SIZE - 20)

const floatStyle = computed(() => ({
  position: 'fixed',
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

  // Long press detection (500ms)
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

  // Detect if user actually moved (> 5px threshold)
  if (Math.abs(newX - posX.value) > 5 || Math.abs(newY - posY.value) > 5) {
    hasMoved = true
    if (longPressTimer) {
      clearTimeout(longPressTimer)
      longPressTimer = null
    }
  }

  // Clamp to screen bounds
  posX.value = Math.max(0, Math.min(screenWidth - BALL_SIZE, newX))
  posY.value = Math.max(0, Math.min(screenHeight - BALL_SIZE, newY))
}

function onTouchEnd() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }

  if (hasMoved) {
    // Snap to nearest edge
    const midX = screenWidth / 2
    posX.value = posX.value < midX ? 8 : screenWidth - BALL_SIZE - 8
    // Save position
    petStore.setPosition(posX.value, posY.value)
    return
  }

  const elapsed = Date.now() - touchStartTime

  // Detect double tap (< 300ms since last tap)
  if (elapsed < 300 && lastTapTime > 0 && (touchStartTime - lastTapTime) < 300) {
    // Double tap → interact
    const result = petInteract()
    if (result.leveledUp) {
      showLevelUpCelebration()
    }
    lastTapTime = 0
    return
  }

  lastTapTime = touchStartTime

  // Wait a bit to see if it's a double tap; if not, it's a single tap
  setTimeout(() => {
    if (lastTapTime === touchStartTime) {
      // Single tap → open panel
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
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.15);
  transition: box-shadow 0.2s ease;

  &:active {
    box-shadow: 0 2rpx 10rpx rgba(0, 0, 0, 0.2);
  }
}

.pet-setup {
  padding: 40rpx 32rpx;
  min-width: 580rpx;

  &__title {
    font-size: 36rpx;
    font-weight: 600;
    color: #333;
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
      background: rgba(41, 121, 255, 0.06);
    }
  }

  &__species-name {
    font-size: 26rpx;
    font-weight: 500;
    color: #333;
    margin-top: 8rpx;
  }

  &__species-desc {
    font-size: 20rpx;
    color: #909399;
    margin-top: 4rpx;
  }

  &__name-row {
    margin-bottom: 24rpx;
  }
}

@media (prefers-color-scheme: dark) {
  .pet-float {
    background: rgba(50, 50, 50, 0.9);
    box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.4);
  }

  .pet-setup {
    background: #1f1f1f;

    &__title {
      color: #e5e5e5;
    }

    &__species-item--active {
      border-color: #2979ff;
      background: rgba(41, 121, 255, 0.15);
    }

    &__species-name {
      color: #e5e5e5;
    }
  }
}
</style>
```

- [ ] **Step 2: Commit**

```bash
cd D:/Repos/xyito/lingyun/mcode
git add mcode-app/src/components/pet/PetFloat.vue
git commit -m "feat(pet): add PetFloat draggable floating component with setup flow"
```

---

### Task 9: PetPanel Component (Bottom Popup)

**Files:**
- Create: `src/components/pet/PetPanel.vue`

- [ ] **Step 1: Create the pet panel component**

```vue
<!-- src/components/pet/PetPanel.vue -->
<template>
  <up-popup
    :show="show"
    mode="bottom"
    :round="28"
    @close="emit('update:show', false)"
  >
    <view class="pet-panel">
      <!-- Header: name, level, stars -->
      <view class="pet-panel__header">
        <view class="pet-panel__info">
          <text class="pet-panel__name">{{ petStore.name }}</text>
          <text class="pet-panel__level">Lv.{{ petStore.level }}</text>
          <text class="pet-panel__stars">{{ '⭐'.repeat(petStore.levelStars) }}</text>
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
              <text
                v-if="!petStore.unlockedSkins.includes(skin.id)"
                class="tab-skins__lock"
              >🔒</text>
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
              <text
                v-if="!petStore.unlockedAccessories.includes(acc.id)"
                class="tab-skins__lock"
              >🔒</text>
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
              <text>{{ petStore.unlockedAchievements.includes(ach.id) ? '🏆' : '🔒' }}</text>
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
  sleeping: '💤 睡觉中',
  idle: '😊 空闲',
  curious: '🤔 好奇',
  busy: '⚡ 忙碌',
  alert: '❗ 需要关注',
  happy: '😄 开心',
  sad: '😢 难过',
  excited: '🎉 兴奋',
  bored: '😴 无聊',
}

const emotionLabel = computed(() => emotionLabels[props.emotion] || '😊 空闲')

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

  // Toggle: if already equipped, remove; else equip
  if (petStore.accessories[acc.slot] === acc.id) {
    petStore.equipAccessory(acc.slot, null)
  } else {
    petStore.equipAccessory(acc.slot, acc.id)
  }
}

function slotIcon(slot: string): string {
  switch (slot) {
    case 'head': return '🎩'
    case 'body': return '👔'
    case 'effect': return '✨'
    default: return '📦'
  }
}
</script>

<style lang="scss" scoped>
.pet-panel {
  padding: 24rpx 32rpx 48rpx;
  max-height: 70vh;
  display: flex;
  flex-direction: column;

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
    color: #333;
  }

  &__level {
    font-size: 28rpx;
    color: #2979ff;
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
    background: #f0f0f0;
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
    color: #909399;
    text-align: right;
    display: block;
    margin-top: 4rpx;
  }

  &__tabs {
    display: flex;
    gap: 0;
    margin-bottom: 16rpx;
    border-bottom: 2rpx solid #f0f0f0;
  }

  &__tab {
    flex: 1;
    text-align: center;
    padding: 16rpx 0;
    font-size: 28rpx;
    color: #909399;
    border-bottom: 4rpx solid transparent;
    transition: all 0.2s;

    &--active {
      color: #2979ff;
      border-bottom-color: #2979ff;
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
    background: #ddd;
    border-radius: 4rpx;
  }
}

// ── Tab: Status ──
.tab-status {
  &__row {
    display: flex;
    justify-content: space-between;
    padding: 16rpx 0;
    border-bottom: 1rpx solid #f5f5f5;
  }

  &__label {
    font-size: 28rpx;
    color: #666;
  }

  &__value {
    font-size: 28rpx;
    color: #333;
    font-weight: 500;
  }
}

// ── Tab: Skins ──
.tab-skins {
  &__section-title {
    font-size: 26rpx;
    color: #909399;
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
    border: 2rpx solid #f0f0f0;
    min-width: 140rpx;
    position: relative;

    &--active {
      border-color: #2979ff;
      background: rgba(41, 121, 255, 0.06);
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
    color: #333;
  }

  &__lock {
    position: absolute;
    top: 4rpx;
    right: 4rpx;
    font-size: 16rpx;
  }
}

// ── Tab: Achievements ──
.tab-achievements {
  &__item {
    display: flex;
    align-items: center;
    gap: 16rpx;
    padding: 16rpx 0;
    border-bottom: 1rpx solid #f5f5f5;
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
    color: #333;
    font-weight: 500;
    display: block;
  }

  &__desc {
    font-size: 22rpx;
    color: #909399;
    display: block;
    margin-top: 4rpx;
  }
}

@media (prefers-color-scheme: dark) {
  .pet-panel {
    background: #1f1f1f;

    &__name { color: #e5e5e5; }
    &__exp-track { background: #333; }
    &__tabs { border-bottom-color: #333; }
    &__handle-bar { background: #555; }
  }

  .tab-status {
    &__row { border-bottom-color: #333; }
    &__label { color: #aaa; }
    &__value { color: #e5e5e5; }
  }

  .tab-skins {
    &__item { border-color: #333; }
    &__name { color: #e5e5e5; }
  }

  .tab-achievements {
    &__item { border-bottom-color: #333; }
    &__name { color: #e5e5e5; }
  }
}
</style>
```

- [ ] **Step 2: Commit**

```bash
cd D:/Repos/xyito/lingyun/mcode
git add mcode-app/src/components/pet/PetPanel.vue
git commit -m "feat(pet): add PetPanel bottom popup with status, skins, and achievements tabs"
```

---

### Task 10: App.up.vue Global Injection

**Files:**
- Create: `src/App.up.vue`

- [ ] **Step 1: Create the uview-plus root wrapper component**

```vue
<!-- src/App.up.vue -->
<template>
  <up-root-view />
  <PetFloat />
</template>

<script setup lang="ts">
import PetFloat from './components/pet/PetFloat.vue'
</script>
```

This file is picked up by uview-plus's build plugin (`libs/root/root.js`). The `registerUpApp` function in that file:
1. Imports `App.up.vue` as `GlobalUpRoot`
2. Registers it as a global component `<global-up-root>`
3. At build time, `<up-root-view />` is replaced with `<slot />`, making `PetFloat` a sibling of every page's content

- [ ] **Step 2: Verify the app still builds**

Run: `cd D:/Repos/xyito/lingyun/mcode/mcode-app && npm run build:h5 2>&1 | tail -5`
Expected: Build completes successfully (or check `npm run dev:h5` in a separate terminal)

- [ ] **Step 3: Commit**

```bash
cd D:/Repos/xyito/lingyun/mcode
git add mcode-app/src/App.up.vue
git commit -m "feat(pet): add App.up.vue to inject pet globally via uview-plus root"
```

---

### Task 11: Integration — Exp Hooks in Existing Pages

**Files:**
- Modify: `src/pages/conversation-detail/index.vue`
- Modify: `src/pages/todos/index.vue`

- [ ] **Step 1: Read the conversation-detail page to find the right integration points**

Read the conversation-detail page source and identify:
- Where `acpPrompt` is called (for "发起对话" exp)
- Where permission approval happens (for "审批权限" exp)

- [ ] **Step 2: Add pet exp hooks to conversation-detail**

At the top of the `<script setup>` section, add the pet store import:

```ts
import { usePetStore } from '@/stores/pet'
```

In the `setup()` or `onMounted()` area, get the store:

```ts
const petStore = usePetStore()
```

After the `acpPrompt` call succeeds (where the user sends a message), add:

```ts
petStore.addExp('user', 5)
```

After permission approval succeeds, add:

```ts
petStore.addExp('user', 8)
```

The exact line numbers depend on the current file content — the engineer should search for `acpPrompt` and `permission` in the file to find the right insertion points.

- [ ] **Step 3: Add pet exp hook to todos page**

In `src/pages/todos/index.vue`, find the `toggleTodo` function (around line 34). After the line that marks a todo as completed, add:

```ts
import { usePetStore } from '@/stores/pet'
```

And inside `toggleTodo`, after setting `item.completed = true`:

```ts
if (!item.completed) {
  // was uncompleted, now completing
  const petStore = usePetStore()
  petStore.addExp('user', 15)
  petStore.recordStat('totalTodosCompleted')
}
```

- [ ] **Step 4: Commit**

```bash
cd D:/Repos/xyito/lingyun/mcode
git add mcode-app/src/pages/conversation-detail/index.vue mcode-app/src/pages/todos/index.vue
git commit -m "feat(pet): add exp integration hooks to conversation detail and todos pages"
```

---

### Task 12: Smoke Test and Verify

- [ ] **Step 1: Run type check**

```bash
cd D:/Repos/xyito/lingyun/mcode/mcode-app && npx vue-tsc --noEmit --pretty 2>&1 | tail -20
```

Expected: No new errors from pet-related files.

- [ ] **Step 2: Run dev server and test**

```bash
cd D:/Repos/xyito/lingyun/mcode/mcode-app && npm run dev:h5
```

Open the URL in a browser. Verify:
1. First visit: species selection popup appears
2. After selecting species + name: floating pet ball appears at bottom-right
3. Pet shows idle animation (gentle sway)
4. Single-tap on pet: bottom panel slides up with status/skins/achievements tabs
5. Double-tap on pet: happy animation plays briefly
6. Drag pet to left side: it snaps to left edge
7. Long-press: action sheet appears with hide/mute options
8. Close panel, verify pet returns to idle

- [ ] **Step 3: Fix any issues found during testing**

Address any CSS layout issues, import errors, or interaction bugs found in step 2.

- [ ] **Step 4: Final commit**

```bash
cd D:/Repos/xyito/lingyun/mcode
git add -A
git commit -m "fix(pet): address smoke test issues"
```
