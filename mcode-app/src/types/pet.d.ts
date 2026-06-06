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
