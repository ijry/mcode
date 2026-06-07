import type { EmotionState } from '@/types/pet'

/** Phase 1 motion identifiers */
export type MotionId =
  | 'idle-look-around'
  | 'idle-tail-swish'
  | 'stretch-yawn'
  | 'sleep-curl'
  | 'sleep-zzz'
  | 'snack-nibble'
  | 'snack-happy-chew'
  | 'play-hop'
  | 'play-ball'
  | 'self-proud'

/** Motion group categories */
export type MotionGroup = 'idle' | 'sleep' | 'play' | 'snack' | 'celebration'

/** Scene decorations rendered alongside the pet */
export type SceneDecoration = 'zzz' | 'snack' | 'crumbs' | 'ball' | 'sparkles' | 'sweat'

/** Motion priority for preemption rules */
export type MotionPriority = 'high' | 'medium' | 'low'

/** Trigger source for event-based motions */
export type MotionTrigger = 'tap' | 'doubleTap' | 'levelUp'

/**
 * Motion template configuration.
 * Each motion defines its visual behavior, eligibility rules, and cooldown.
 */
export interface MotionTemplate {
  id: MotionId
  group: MotionGroup
  /** Duration of the full motion animation in ms */
  durationMs: number
  /** Minimum time before this motion can play again in ms */
  cooldownMs: number
  /** Relative selection weight (higher = more likely) */
  weight: number
  /** Emotions that allow this motion */
  allowedEmotions: EmotionState[]
  /** Optional hour restriction (0-23). If set, motion only plays during these hours */
  allowedHours?: number[]
  /** Whether this motion can be interrupted by higher-priority motions */
  interruptible: boolean
  /** Scene decorations to show during this motion */
  sceneDecorations: SceneDecoration[]
  /** CSS class applied to the pet body during this motion */
  bodyClass: string
  /** Optional trigger that can directly invoke this motion */
  trigger?: MotionTrigger
  /** Motion priority for preemption */
  priority: MotionPriority
}

/** Runtime state for an active motion */
export interface MotionState {
  id: MotionId
  template: MotionTemplate
  /** Timestamp when this motion started */
  startedAt: number
  /** Decorations active during this motion */
  decorations: SceneDecoration[]
  /** CSS body class for the sprite */
  bodyClass: string
}

/** Lookup from motion id to template */
export type MotionConfigMap = Record<MotionId, MotionTemplate>
