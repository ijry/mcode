import type { EmotionState } from '@/types/pet'

/** All motion identifiers */
export type MotionId =
  // Idle
  | 'idle-look-around'
  | 'idle-tail-swish'
  | 'idle-ear-twitch'
  | 'idle-groom'
  | 'idle-sneeze'
  | 'idle-shake'
  // Bored
  | 'bored-sigh'
  | 'bored-slump'
  // Stretch / yawn
  | 'stretch-yawn'
  // Curious
  | 'curious-peek'
  | 'curious-sniff'
  | 'curious-tilt-deep'
  // Busy / alert
  | 'busy-type'
  | 'alert-freeze'
  // Sleep
  | 'sleep-curl'
  | 'sleep-zzz'
  | 'sleep-dream'
  // Excited
  | 'excited-spin'
  | 'excited-wiggle'
  // Happy
  | 'happy-dance'
  | 'happy-heart'
  // Snack
  | 'snack-nibble'
  | 'snack-happy-chew'
  // Play
  | 'play-hop'
  | 'play-ball'
  | 'play-chase-tail'
  | 'play-pounce'
  // Celebration
  | 'self-proud'
  | 'celebrate-confetti'

/** Motion group categories */
export type MotionGroup =
  | 'idle'
  | 'bored'
  | 'curious'
  | 'busy'
  | 'sleep'
  | 'excited'
  | 'happy'
  | 'play'
  | 'snack'
  | 'celebration'

/** Scene decorations rendered alongside the pet */
export type SceneDecoration =
  | 'zzz'
  | 'snack'
  | 'crumbs'
  | 'ball'
  | 'sparkles'
  | 'sweat'
  | 'heart'
  | 'thought'
  | 'music'
  | 'confetti'

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
